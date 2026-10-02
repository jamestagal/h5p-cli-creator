import type { EngineIdentity, LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import { budgetSnapshot, type BudgetLimits } from "../llm/budget.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure } from "../llm/runner.js";
import type { ActivityPlan } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import { PROMPT_VERSION } from "../prompts/system.js";
import { countedScore } from "../review/scores.js";
import { assertCurrentLayout } from "../store/layout.js";
import { assertWritableStoreVersion, type ImportRecord, type ImportStore, type RegenerationRequest, type RevisionRecord } from "../store/types.js";
import { buildRevision } from "./build.js";
import { attemptsByKey, budgetFromLedger, reconcile, runOperation, type OperationContext } from "./operations.js";
import { existingTexts, type ImportSettings } from "./run-import.js";

/** At most this many logical regeneration requests per activity in the pilot (design §6, C2), whatever their outcome. */
export const MAX_REGENERATIONS = 2;

/** Refused before any request is appended or any dispatch: nothing was written. */
export class RegenerateRefused extends Error { constructor(message: string) { super(message); this.name = "RegenerateRefused"; } }

export interface RegenerateInput { importId: string; activityId: string; note?: string; budget?: Partial<BudgetLimits> }
export interface RegenerateDeps { store: ImportStore; provider: ModelProvider; registry: LibraryRegistry; engineIdentity: EngineIdentity; clock?: () => Date; sleep?: (ms: number) => Promise<void> }
export interface RegenerateResult { request: RegenerationRequest; resumed: boolean }

/**
 * `leap regenerate` (design §6, plan Task 13). Under the import's lock: refuses a phase-2 store; finishes the
 * activity's running request if there is one (R9: no eligibility check, no allowance consumed, the note may be omitted
 * and must match if given); otherwise checks eligibility and the allowance, appends a `running` request before any
 * dispatch, and produces, builds and promotes the new revision. Returns the request as finally recorded (`succeeded` or
 * `failed`). Paid-provider ledger checks happen before this is called.
 */
export async function regenerateActivity(input: RegenerateInput, deps: RegenerateDeps): Promise<RegenerateResult> {
  const { store } = deps;
  const clock = deps.clock ?? (() => new Date());
  const lock = await store.lock(input.importId);
  try {
    const record = await store.getImport(input.importId);
    if (!record) throw new RegenerateRefused(`import ${input.importId} is not in this directory`);
    assertWritableStoreVersion(record, `import ${input.importId}`);
    await assertCurrentLayout(store, input.importId, `import ${input.importId}`);

    const requests = (await store.listRegenerations(input.importId)).filter((r) => r.activityId === input.activityId);
    const latest = requests.at(-1);
    if (latest?.status === "running") {
      if (input.note !== undefined && input.note !== latest.note) throw new RegenerateRefused(`request ${latest.requestId} is still running with the note ${JSON.stringify(latest.note)}; rerun with that note, or with no --note, to finish it`);
      return { request: await finish(latest, record, input, deps, clock), resumed: true };
    }

    // Only when creating a new request: eligibility, the note, the allowance.
    const activity = (await store.listActivities(input.importId)).find((a) => a.activityId === input.activityId);
    if (!activity) throw new RegenerateRefused(`activity ${input.activityId} is not in import ${input.importId}`);
    if (activity.status !== "promoted" || activity.currentRevision === null) throw new RegenerateRefused(`activity ${input.activityId} has no promoted revision (status ${activity.status}); only a reviewed, promoted activity can be regenerated`);
    const current = await store.getRevision(input.activityId, activity.currentRevision);
    const counted = current?.currentBuildId ? countedScore(await store.listScores(input.importId), input.activityId, current.revision, current.currentBuildId) : null;
    if (!counted) throw new RegenerateRefused(`activity ${input.activityId} revision ${activity.currentRevision} has no scored review of its current build; review it with leap review-sheet and leap review-import first`);
    if (counted.decision === "accepted") throw new RegenerateRefused(`activity ${input.activityId} revision ${activity.currentRevision} is accepted; only a needs-revision or rejected activity is regenerated`);
    if (requests.length >= MAX_REGENERATIONS) throw new RegenerateRefused(`activity ${input.activityId} has used its ${MAX_REGENERATIONS} regenerations in this pilot`);
    if (!input.note?.trim()) throw new RegenerateRefused(`a new regeneration needs --note: what the reviewer wants changed in ${input.activityId}`);

    const index = requests.length + 1;
    const targetRevision = Math.max(0, ...(await store.listRevisions(input.activityId)).map((r) => r.revision)) + 1;
    const request: RegenerationRequest = {
      requestId: `${input.activityId}:regen:${index}`, importId: input.importId, activityId: input.activityId, index, baseRevision: activity.currentRevision, targetRevision,
      note: input.note.trim(), status: "running", outcome: null, createdAt: clock().toISOString(), completedAt: null
    };
    await store.putRegeneration(request); // from here the request counts, before any dispatch
    return { request: await finish(request, record, input, deps, clock), resumed: false };
  } finally {
    await lock.release();
  }
}

/**
 * Produces (or reuses), builds (or reuses) and promotes the request's target revision, then appends `succeeded`. One
 * path serves a new request and a resumed one (R9): the produce operation's stable key reuses a persisted candidate
 * with no model call; buildRevision reuses an existing build under this engine; a promoted target is not rebuilt.
 * A content, budget or other failure is appended as `failed` with its outcome.
 */
async function finish(request: RegenerationRequest, record: ImportRecord, input: RegenerateInput, deps: RegenerateDeps, clock: () => Date): Promise<RegenerationRequest> {
  const { store } = deps;
  const importId = request.importId; const activityId = request.activityId; const target = request.targetRevision;
  const close = async (status: "succeeded" | "failed", outcome: string): Promise<RegenerationRequest> => {
    const done = { ...request, status, outcome, completedAt: clock().toISOString() };
    await store.putRegeneration(done);
    return done;
  };

  await reconcile(store, importId, clock); // an operation left running by a crash is marked failed and billing-uncertain first
  const events = await store.listAttempts(importId);
  const limits: BudgetLimits = { ...record.budget, ...input.budget };
  const budget = budgetFromLedger(limits, events, clock().getTime(), record.budgetUsed.elapsedMs);
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId, clock, attemptsByKey: attemptsByKey(events) };
  if (deps.sleep) ctx.sleep = deps.sleep;
  const saveBudget = async (): Promise<void> => { const latest = (await store.getImport(importId)) ?? record; await store.putImport({ ...latest, budgetUsed: budgetSnapshot(budget, clock().getTime()), updatedAt: clock().toISOString() }); };

  try {
    let revision = await store.getRevision(activityId, target);
    if (!(revision?.state === "promoted" && revision.currentBuildId)) {
      const settings = await store.getArtifact<ImportSettings>(importId, "settings");
      const plan = (await store.getArtifact<ActivityPlan[]>(importId, "plan"))?.find((p) => p.activityId === activityId);
      const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
      const produced = await runOperation<RevisionRecord>(ctx, {
        purpose: "produce", activityId, origin: "regenerate", requestId: request.requestId, key: `${importId}:produce:${activityId}:r${target}`,
        load: () => store.getRevision(activityId, target),
        work: async (runner) => {
          if (!settings) throw new Error(`import ${importId} has no stored production settings; rerun leap generate with its original arguments once to record them`);
          if (!plan || !map) throw new Error(`import ${importId} has no stored plan entry or concept map for ${activityId}`);
          const producer = createProducers().get(plan.type);
          if (!producer) throw new Error(`no producer for ${plan.type}`);
          const others = [];
          for (const a of await store.listActivities(importId)) {
            if (a.activityId === activityId || a.type !== plan.type || a.currentRevision === null) continue;
            const r = await store.getRevision(a.activityId, a.currentRevision);
            if (r?.state === "promoted") others.push(r);
          }
          const unit = await store.getArtifact<UnitOfCompetency>(importId, "unit");
          const result = await producer.produce({ plan, map, unit, promptConfig: settings.promptConfig, language: settings.language, existing: existingTexts(others), rules: settings.rules, note: request.note }, runner, { registry: deps.registry });
          assertGeneratedProvenance(result.spec);
          return {
            activityId, revision: target, state: "candidate", spec: result.spec, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, origin: "regenerate", requestId: request.requestId,
            modelConfig: { provider: deps.provider.name, models: { ...MODEL_ROLES }, profiles: { ...REQUEST_PROFILES } }, note: request.note, currentBuildId: null, attemptIds: result.attemptIds, createdAt: clock().toISOString()
          };
        },
        persist: (rev) => store.putRevision(rev)
      });
      revision = produced.result;
      const build = await buildRevision({ store, registry: deps.registry, engineIdentity: deps.engineIdentity, clock }, importId, revision);
      for (const prev of await store.listRevisions(activityId)) if (prev.state === "promoted" && prev.revision !== target) await store.putRevision({ ...prev, state: "superseded" });
      revision = { ...revision, state: "promoted", currentBuildId: build.buildId };
      await store.putRevision(revision);
    }
    const activity = (await store.listActivities(importId)).find((a) => a.activityId === activityId)!;
    if (activity.currentRevision !== target || activity.status !== "promoted") await store.putActivity({ ...activity, status: "promoted", currentRevision: target, error: null });
    await saveBudget();
    return await close("succeeded", "ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = err instanceof ContentFailure ? `content: ${message}` : err instanceof BudgetRefused ? `budget: ${message}` : `system: ${message}`;
    await saveBudget();
    const failed = await close("failed", outcome);
    if (err instanceof ContentFailure || err instanceof BudgetRefused) return failed; // a recorded outcome, not an error of this command
    throw err;
  }
}
