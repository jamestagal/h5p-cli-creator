import type { EngineIdentity, LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import { budgetSnapshot, type BudgetLimits } from "../llm/budget.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure } from "../llm/runner.js";
import type { ActivityPlan } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import type { Producer } from "../produce/producer.js";
import { PROMPT_VERSION } from "../prompts/system.js";
import { countedScore } from "../review/scores.js";
import { assertCurrentLayout } from "../store/layout.js";
import { assertWritableStoreVersion, type ImportRecord, type ImportStore, type RegenerationRequest, type RevisionRecord } from "../store/types.js";
import { buildRevision, verifyCurrentBuild } from "./build.js";
import { attemptsByKey, budgetFromLedger, reconcile, reconcileElapsed, runOperation, type OperationContext } from "./operations.js";
import { DEFAULT_MAX_ATTEMPT_MS, existingTexts, type ImportSettings } from "./run-import.js";
import { assertEvidenceWithin, scopedImport, type GenerationScopeRecord } from "../scope/authoritative.js";
import { scopeHashOf } from "../scope/hash.js";
import type { SourceDocument } from "../ingest/source-document.js";

/** At most this many logical regeneration requests per activity in the pilot (design §6, C2), whatever their outcome. */
export const MAX_REGENERATIONS = 2;

/** Refused before any request is appended or any dispatch: nothing was written. */
export class RegenerateRefused extends Error { constructor(message: string) { super(message); this.name = "RegenerateRefused"; } }

export interface RegenerateInput { importId: string; activityId: string; note?: string; budget?: Partial<BudgetLimits> }
export interface RegenerateDeps { store: ImportStore; provider: ModelProvider; registry: LibraryRegistry; engineIdentity: EngineIdentity; clock?: () => Date; sleep?: (ms: number) => Promise<void>; maxAttemptMs?: number }
export interface RegenerateResult { request: RegenerationRequest; resumed: boolean }

/**
 * The limits a regeneration runs under: each limit is the lowest of the import's own and every one given (the request's
 * stored limits, the command's). A supplied limit can lower a cap and never raise one, so a ledger cap above the
 * import's leaves the import's in force.
 */
export function effectiveLimits(importLimits: BudgetLimits, ...lower: Array<Partial<BudgetLimits> | undefined>): BudgetLimits {
  const out = { ...importLimits };
  for (const l of lower) for (const k of ["usdMicro", "requests", "tokens", "elapsedMs"] as const) { const v = l?.[k]; if (v !== undefined) out[k] = Math.min(out[k], v); }
  return out;
}

/** What producing the activity again needs, read from the store. Checked before a new request is appended, so an import that cannot be regenerated uses none of its allowance. */
interface ProductionInputs { settings: ImportSettings; plan: ActivityPlan; map: ConceptMap; producer: Producer }
async function productionInputs(store: ImportStore, importId: string, activityId: string): Promise<ProductionInputs> {
  const settings = await store.getArtifact<ImportSettings>(importId, "settings");
  if (!settings) throw new RegenerateRefused(`import ${importId} has no stored production settings; rerun leap generate with its original arguments once to record them, then regenerate`);
  const plan = (await store.getArtifact<ActivityPlan[]>(importId, "plan"))?.find((p) => p.activityId === activityId);
  if (!plan) throw new RegenerateRefused(`import ${importId} has no stored plan entry for ${activityId}`);
  const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
  if (!map) throw new RegenerateRefused(`import ${importId} has no stored concept map`);
  await assertStoredScope(store, importId, map);
  const producer = createProducers().get(plan.type);
  if (!producer) throw new RegenerateRefused(`no producer for ${plan.type}`);
  return { settings, plan, map, producer };
}

/**
 * A scoped import's concept map is checked against its stored scope before anything is produced from it: the stored
 * record must be present and be the one the import record names, be self-consistent (its hash is its payload's, bound
 * to the stored source's text), and every citation must name a sentence in the scope with exactly that sentence's text
 * (generation scope design §2.9). Whether the import is scoped is read from its independent marks (scopedImport), so a
 * removed scope record refuses rather than lifting the restriction. Regeneration has no scope file or bytes to
 * recompute from, so it checks the stored records against each other. `map` defaults to the stored concept map. An
 * unscoped import is unchanged.
 */
async function assertStoredScope(store: ImportStore, importId: string, map?: ConceptMap | null): Promise<void> {
  const record = await store.getImport(importId);
  if (!(await scopedImport(store, importId, record))) return;
  const scope = await store.getArtifact<GenerationScopeRecord>(importId, "generationScope");
  if (!scope) throw new RegenerateRefused(`import ${importId} is a scoped import, but its stored generation scope is missing; it has been removed, and nothing is regenerated without it. Use a new output directory`);
  if (record?.generationScope && record.generationScope.scopeHash !== scope.scopeHash) throw new RegenerateRefused(`import ${importId}'s stored generation scope (${scope.scopeHash.slice(0, 12)}) is not the one its import record names (${record.generationScope.scopeHash.slice(0, 12)}); it has been altered`);
  const source = await store.getArtifact<SourceDocument>(importId, "source");
  if (!source) throw new RegenerateRefused(`import ${importId} is scoped but its stored source is missing; regenerating would not be checked against the scope`);
  if (scopeHashOf(scope.payload) !== scope.scopeHash || scope.payload.binding.textHash !== source.textHash) throw new RegenerateRefused(`import ${importId}'s stored generation scope is not consistent with itself and its stored source; it has been altered`);
  const checked = map === undefined ? await store.getArtifact<ConceptMap>(importId, "conceptMap") : map;
  if (!checked) return; // no map: productionInputs refuses
  try {
    assertEvidenceWithin(checked.concepts, new Set(scope.payload.passages.flatMap((p) => p.sentenceIds)), source);
  } catch (err) {
    throw new RegenerateRefused(`import ${importId}'s concept map: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * `leap regenerate` (design §6, plan Task 13). Under the import's lock: refuses a phase-2 store; finishes the
 * activity's running request if there is one (R9: no eligibility check, no allowance consumed, the note may be omitted
 * and must match if given); otherwise checks eligibility, the production inputs and the allowance, appends a `running`
 * request carrying its limits before any dispatch, and produces, builds and promotes the new revision. Returns the
 * request as finally recorded (`succeeded` or `failed`); any other error leaves it `running`, to be finished by a rerun.
 * Paid-provider ledger checks happen before this is called.
 */
export async function regenerateActivity(input: RegenerateInput, deps: RegenerateDeps): Promise<RegenerateResult> {
  const { store } = deps;
  const clock = deps.clock ?? (() => new Date());
  // Taking the lock may write (recovery). A scoped import whose stored scope would refuse this regeneration is refused
  // from a read before the lock, so it leaves the directory exactly as it was; the check runs again under the lock.
  await assertStoredScope(store, input.importId);
  const lock = await store.lock(input.importId);
  try {
    const record = await store.getImport(input.importId);
    if (!record) throw new RegenerateRefused(`import ${input.importId} is not in this directory`);
    assertWritableStoreVersion(record, `import ${input.importId}`);
    await assertCurrentLayout(store, input.importId, `import ${input.importId}`);
    await assertStoredScope(store, input.importId); // a new request and a resumed one alike, before any write or dispatch

    const requests = (await store.listRegenerations(input.importId)).filter((r) => r.activityId === input.activityId);
    const latest = requests.at(-1);
    if (latest?.status === "running") {
      if (input.note !== undefined && input.note !== latest.note) throw new RegenerateRefused(`request ${latest.requestId} is still running with the note ${JSON.stringify(latest.note)}; rerun with that note, or with no --note, to finish it`);
      return { request: await finish(latest, record, input, deps, clock), resumed: true };
    }

    // Only when creating a new request: eligibility, the note, the production inputs, the allowance.
    const activity = (await store.listActivities(input.importId)).find((a) => a.activityId === input.activityId);
    if (!activity) throw new RegenerateRefused(`activity ${input.activityId} is not in import ${input.importId}`);
    if (activity.status !== "promoted" || activity.currentRevision === null) throw new RegenerateRefused(`activity ${input.activityId} has no promoted revision (status ${activity.status}); only a reviewed, promoted activity can be regenerated`);
    const current = await store.getRevision(input.activityId, activity.currentRevision);
    const counted = current?.currentBuildId ? countedScore(await store.listScores(input.importId), input.activityId, current.revision, current.currentBuildId) : null;
    if (!counted) throw new RegenerateRefused(`activity ${input.activityId} revision ${activity.currentRevision} has no scored review of its current build; review it with leap review-sheet and leap review-import first`);
    if (counted.decision === "accepted") throw new RegenerateRefused(`activity ${input.activityId} revision ${activity.currentRevision} is accepted; only a needs-revision or rejected activity is regenerated`);
    if (requests.length >= MAX_REGENERATIONS) throw new RegenerateRefused(`activity ${input.activityId} has used its ${MAX_REGENERATIONS} regenerations in this pilot`);
    if (!input.note?.trim()) throw new RegenerateRefused(`a new regeneration needs --note: what the reviewer wants changed in ${input.activityId}`);
    await productionInputs(store, input.importId, input.activityId);

    const index = requests.length + 1;
    const targetRevision = Math.max(0, ...(await store.listRevisions(input.activityId)).map((r) => r.revision)) + 1;
    const request: RegenerationRequest = {
      requestId: `${input.activityId}:regen:${index}`, importId: input.importId, activityId: input.activityId, index, baseRevision: activity.currentRevision, targetRevision,
      note: input.note.trim(), budget: effectiveLimits(record.budget, input.budget), status: "running", outcome: null, createdAt: clock().toISOString(), completedAt: null
    };
    await store.putRegeneration(request); // from here the request counts, before any dispatch
    return { request: await finish(request, record, input, deps, clock), resumed: false };
  } finally {
    await lock.release();
  }
}

/**
 * Produces (or reuses), builds (or verifies) and publishes the request's target revision, then appends `succeeded`. One
 * path serves a new request and a resumed one (R9): the produce operation's stable key reuses a persisted candidate
 * with no model call; buildRevision reuses an existing build under this engine; a target already promoted is not
 * rebuilt, but its build record and package are verified before success is reported. Publication is idempotent, so
 * a rerun completes whichever of its writes did not happen. A content or budget failure is appended as `failed` with
 * its outcome; any other error leaves the request `running` and is rethrown.
 *
 * Elapsed time uses the import's shared run anchor, as `leap generate` does: an anchor left by an interrupted run of
 * either command is charged (reconcileElapsed, on evidence read before any recovery write), this run's anchor is
 * durable before the first dispatch, and every exit folds its time into the import and clears the anchor.
 */
async function finish(started: RegenerationRequest, record: ImportRecord, input: RegenerateInput, deps: RegenerateDeps, clock: () => Date): Promise<RegenerationRequest> {
  const { store } = deps;
  let request = started;
  const importId = request.importId; const activityId = request.activityId; const target = request.targetRevision;
  const close = async (status: "succeeded" | "failed", outcome: string): Promise<RegenerationRequest> => {
    const done = { ...request, status, outcome, completedAt: clock().toISOString() };
    await store.putRegeneration(done);
    return done;
  };

  // Evidence of an interrupted run, read BEFORE any recovery write (reconcile() stamps its own completedAt).
  const events = await store.listAttempts(importId);
  const operationsLeftBehind = await store.listOperations(importId);
  const limits = effectiveLimits(record.budget, request.budget, input.budget);
  // A limit lowered now (by the command or the import) is kept with the request before any dispatch, so a later resume
  // without it, or with a higher one, never runs above it. A request written before limits were stored has none.
  if (!request.budget || (Object.keys(limits) as Array<keyof BudgetLimits>).some((k) => limits[k] !== request.budget[k])) {
    request = { ...request, budget: limits };
    await store.putRegeneration(request);
  }
  const runStartedMs = clock().getTime();
  const elapsedBeforeMs = record.currentRun
    ? reconcileElapsed({ run: record.currentRun, savedElapsedMs: record.budgetUsed.elapsedMs, events, operations: operationsLeftBehind, updatedAt: record.updatedAt, nowMs: runStartedMs, maxAttemptMs: deps.maxAttemptMs ?? DEFAULT_MAX_ATTEMPT_MS, limitMs: limits.elapsedMs })
    : record.budgetUsed.elapsedMs;
  await reconcile(store, importId, clock); // an operation left running by a crash is marked failed and billing-uncertain
  let current: ImportRecord = { ...record, budgetUsed: { ...record.budgetUsed, elapsedMs: elapsedBeforeMs }, currentRun: { startedAt: new Date(runStartedMs).toISOString(), elapsedBeforeMs }, updatedAt: clock().toISOString() };
  await store.putImport(current); // the anchor is durable before any dispatch
  const budget = budgetFromLedger(limits, events, runStartedMs, elapsedBeforeMs);
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId, clock, attemptsByKey: attemptsByKey(events) };
  if (deps.sleep) ctx.sleep = deps.sleep;
  /** The run is over: fold its time into the import and clear the anchor. */
  const foldRun = async (): Promise<void> => { current = { ...((await store.getImport(importId)) ?? current), budgetUsed: budgetSnapshot(budget, clock().getTime()), currentRun: null, updatedAt: clock().toISOString() }; await store.putImport(current); };

  try {
    let revision = await store.getRevision(activityId, target);
    let buildId: string;
    if (revision?.state === "promoted" && revision.currentBuildId) {
      buildId = (await verifyCurrentBuild(store, importId, revision)).buildId; // no rebuild, no overwrite
    } else {
      const produced = await runOperation<RevisionRecord>(ctx, {
        purpose: "produce", activityId, origin: "regenerate", requestId: request.requestId, key: `${importId}:produce:${activityId}:r${target}`,
        load: () => store.getRevision(activityId, target),
        work: async (runner) => {
          const { settings, plan, map, producer } = await productionInputs(store, importId, activityId);
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
      buildId = (await buildRevision({ store, registry: deps.registry, engineIdentity: deps.engineIdentity, clock }, importId, revision)).buildId;
    }
    // Publication, each write skipped when already done: earlier promoted revisions superseded, the target promoted, the activity pointed at it.
    for (const prev of await store.listRevisions(activityId)) if (prev.state === "promoted" && prev.revision !== target) await store.putRevision({ ...prev, state: "superseded" });
    if (revision.state !== "promoted" || revision.currentBuildId !== buildId) await store.putRevision({ ...revision, state: "promoted", currentBuildId: buildId });
    const activity = (await store.listActivities(importId)).find((a) => a.activityId === activityId)!;
    if (activity.currentRevision !== target || activity.status !== "promoted" || activity.error !== null) await store.putActivity({ ...activity, status: "promoted", currentRevision: target, error: null });
    await foldRun();
    return await close("succeeded", "ok");
  } catch (err) {
    if (err instanceof ContentFailure || err instanceof BudgetRefused) {
      await foldRun();
      return await close("failed", `${err instanceof ContentFailure ? "content" : "budget"}: ${err.message}`); // a recorded outcome, not an error of this command
    }
    // Anything else (a storage write, a damaged build, an outage) leaves the request running. It already counts towards
    // the activity's two; a rerun finishes it without using another, reuses whatever was already produced or built,
    // and dispatches only what is still missing, charged to the import's budgets like any attempt. If even the fold
    // fails, the anchor stays and the next run charges this one's time from it.
    await foldRun().catch(() => undefined);
    throw err;
  }
}
