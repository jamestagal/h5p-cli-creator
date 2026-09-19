import { compileToBuffer, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type ImportStatus, type UnitOfCompetency } from "@leaplearn/shared";
import { parseUnit } from "../competency/parse-unit.js";
import { extractConceptMap, type ChunkConcept } from "../concepts/index.js";
import type { SourceDocument } from "../ingest/source-document.js";
import { ANTHROPIC_TIMEOUT_MS } from "../llm/anthropic-provider.js";
import { budgetSnapshot, DEFAULT_BUDGET_LIMITS, type BudgetLimits } from "../llm/budget.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure, RunStopped } from "../llm/runner.js";
import { planActivities, DEFAULT_PLAN_RULES, type ActivityPlan, type PlannedType, type PlanRules } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";
import type { ActivityRecord, ImportRecord, ImportStore, RevisionRecord } from "../store/types.js";
import { DEFAULT_CHUNK_TOKENS, IncompatibleResumeError, runFingerprint } from "./fingerprint.js";
import { attemptsByKey, budgetFromLedger, reconcile, reconcileElapsed, runLanes, runOperation, type OperationContext } from "./operations.js";

export interface RunImportInput {
  importId: string; name: string; source: SourceDocument; unitText: string | null; selectedTypes: readonly PlannedType[];
  budget: { usdMicro: number } & Partial<BudgetLimits>; promptConfig: PromptConfig; language: string; customisation: string | null; orgId?: string;
}
export type ProgressEvent = { kind: "status"; status: ImportStatus } | { kind: "activity"; activityId: string; status: ActivityRecord["status"]; error?: string } | { kind: "attempt"; purpose: string; status: string; costUsdMicro: number | null };
export interface RunImportDeps {
  store: ImportStore; provider: ModelProvider; registry: LibraryRegistry; engineFingerprint: string;
  concurrency?: number; chunkTokens?: number; rules?: PlanRules; clock?: () => Date; sleep?: (ms: number) => Promise<void>; onProgress?: (event: ProgressEvent) => void;
  /** The longest one provider call can take (the adapter's request timeout); bounds what an interrupted attempt is charged. */
  maxAttemptMs?: number;
}
/** The adapter's request timeout is the bound on one call, so it is also the tail a killed run is charged; taken from the adapter so the two cannot drift. */
export const DEFAULT_MAX_ATTEMPT_MS = ANTHROPIC_TIMEOUT_MS;

export const SKIPPED_PREFIX = "skipped: ";
const RETRIABLE_PREFIXES = [SKIPPED_PREFIX, "budget: ", "system: "];

/** Activities never attempted (skipped by a stop) or stopped by budget or infrastructure are re-dispatched on resume; content failures stay failed until a person asks for regeneration (spec §5). */
export function isPending(activity: ActivityRecord): boolean {
  if (activity.status === "promoted") return false;
  if (activity.status === "failed") return RETRIABLE_PREFIXES.some((p) => activity.error?.startsWith(p));
  return true;
}

function existingTexts(revisions: RevisionRecord[]): { questions: string[]; passages: string[]; fronts: string[] } {
  const out = { questions: [] as string[], passages: [] as string[], fronts: [] as string[] };
  for (const r of revisions) {
    const s = r.spec;
    if (s.type === "multiChoice") out.questions.push(s.question.replace(/<[^>]+>/g, ""));
    if (s.type === "blanks") out.passages.push(s.passage);
    if (s.type === "flashcards") out.fronts.push(...s.cards.map((c) => c.front));
  }
  return out;
}

/** Duplicates removed, first occurrence kept: the plan, the lanes and the fingerprint all see one entry per type. */
export function canonicalTypes(types: readonly PlannedType[]): PlannedType[] {
  return [...new Set(types)];
}

export async function runImport(rawInput: RunImportInput, deps: RunImportDeps): Promise<ImportRecord> {
  const input: RunImportInput = { ...rawInput, selectedTypes: canonicalTypes(rawInput.selectedTypes) };
  const chunkTokens = deps.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const rules = deps.rules ?? DEFAULT_PLAN_RULES;
  const fingerprint = runFingerprint({ sourceTextHash: input.source.textHash, unitText: input.unitText, selectedTypes: input.selectedTypes, language: input.language, promptConfig: input.promptConfig, customisation: input.customisation, chunkTokens, rules });
  const lock = await deps.store.lock(input.importId);
  try {
    const existing = await deps.store.getImport(input.importId); // read under the lock: a pre-lock read could be stale
    if (existing && existing.fingerprint !== fingerprint) throw new IncompatibleResumeError(input.importId, existing.fingerprint, fingerprint);

    return await runLocked(input, deps, existing, fingerprint, chunkTokens, rules);
  } finally {
    await lock.release();
  }
}

async function runLocked(input: RunImportInput, deps: RunImportDeps, existing: ImportRecord | null, fingerprint: string, chunkTokens: number, rules: PlanRules): Promise<ImportRecord> {
  const clock = deps.clock ?? (() => new Date());
  const store = deps.store;
  const now = () => clock().toISOString();
  const emit = deps.onProgress ?? (() => undefined);
  const limits: BudgetLimits = { ...DEFAULT_BUDGET_LIMITS, ...input.budget };

  let record: ImportRecord = existing
    ? { ...existing, budget: limits, updatedAt: now() }
    : { importId: input.importId, orgId: input.orgId ?? "local", name: input.name, sourceType: input.source.kind, status: "queued", customisation: input.customisation, language: input.language, unitTextHash: null, selectedTypes: [...input.selectedTypes], fingerprint, budget: limits, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: input.importId, createdAt: now(), updatedAt: now() };
  await store.putImport(record);
  if (record.status === "ready") return record;

  if (record.status === "ready_with_failures" && !(await store.listActivities(input.importId)).some(isPending)) return record;

  const setStatus = async (status: ImportStatus, error: string | null = record.error): Promise<void> => { record = { ...record, status, error, updatedAt: now() }; await store.putImport(record); emit({ kind: "status", status }); };

  // Snapshot what the interrupted run left behind BEFORE any recovery write: reconcile() stamps its own completedAt on
  // interrupted operations, and that timestamp is recovery's, not evidence of the interrupted run.
  const events = await store.listAttempts(input.importId);
  const operationsLeftBehind = await store.listOperations(input.importId);
  const runStartedMs = clock().getTime();
  const maxAttemptMs = deps.maxAttemptMs ?? DEFAULT_MAX_ATTEMPT_MS;
  // A run that did not end cleanly left its anchor: charge its time conservatively (never below the saved snapshot) before this run gets any allowance.
  const elapsedBeforeMs = record.currentRun
    ? reconcileElapsed({ run: record.currentRun, savedElapsedMs: record.budgetUsed.elapsedMs, events, operations: operationsLeftBehind, updatedAt: existing?.updatedAt ?? record.updatedAt, nowMs: runStartedMs, maxAttemptMs, limitMs: limits.elapsedMs })
    : record.budgetUsed.elapsedMs;
  await reconcile(store, input.importId, clock);
  record = { ...record, budgetUsed: { ...record.budgetUsed, elapsedMs: elapsedBeforeMs }, currentRun: { startedAt: new Date(runStartedMs).toISOString(), elapsedBeforeMs }, updatedAt: now() };
  await store.putImport(record); // the anchor is durable before any dispatch
  const budget = budgetFromLedger(limits, events, runStartedMs, elapsedBeforeMs);
  const halt: { stop: { kind: "budget" | "system"; reason: string } | null; error: unknown } = { stop: null, error: undefined };
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId: input.importId, clock, attemptsByKey: attemptsByKey(events), onAttempt: (a) => emit({ kind: "attempt", ...a }), stop: () => halt.stop?.reason ?? null };
  if (deps.sleep) ctx.sleep = deps.sleep;
  const persistBudget = async (): Promise<void> => { record = { ...record, budgetUsed: budgetSnapshot(budget, clock().getTime()), updatedAt: now() }; await store.putImport(record); };
  /** The run is over: fold its time into the import and clear the anchor. Every exit path calls this before returning or rethrowing. */
  const foldRun = async (): Promise<void> => { record = { ...record, budgetUsed: budgetSnapshot(budget, clock().getTime()), currentRun: null, updatedAt: now() }; await store.putImport(record); };

  try {
    await setStatus("ingesting");
    if (!(await store.getArtifact(input.importId, "source"))) await store.putArtifact(input.importId, "source", input.source);

    let unit: UnitOfCompetency | null = null;
    if (input.unitText !== null) {
      const unitText = input.unitText;
      const parsed = await runOperation<UnitOfCompetency>(ctx, {
        purpose: "parseUnit", activityId: null, key: `${input.importId}:parseUnit`,
        load: () => store.getArtifact<UnitOfCompetency>(input.importId, "unit"),
        work: (runner) => parseUnit(unitText, runner),
        persist: (u) => store.putArtifact(input.importId, "unit", u)
      });
      unit = parsed.result;
      if (record.unitTextHash !== unit.textHash) { record = { ...record, unitTextHash: unit.textHash, updatedAt: now() }; await store.putImport(record); }
    }

    await setStatus("extracting");
    const chunkCache = { get: (i: number) => store.getArtifact<ChunkConcept[]>(input.importId, `chunk-${i}`), put: (i: number, c: ChunkConcept[]) => store.putArtifact(input.importId, `chunk-${i}`, c) };
    const concepts = await runOperation<ConceptMap>(ctx, {
      purpose: "extract", activityId: null, key: `${input.importId}:concepts`,
      load: () => store.getArtifact<ConceptMap>(input.importId, "conceptMap"),
      work: (runner) => extractConceptMap(input.source, unit, runner, { chunkTokens, promptConfig: input.promptConfig, chunkCache }),
      persist: (m) => store.putArtifact(input.importId, "conceptMap", m)
    });
    const map = concepts.result;

    await setStatus("planning");
    const planned = await runOperation<ActivityPlan[]>(ctx, {
      purpose: "plan", activityId: null, key: `${input.importId}:plan`,
      load: () => store.getArtifact<ActivityPlan[]>(input.importId, "plan"),
      work: (runner) => planActivities(map, [...input.selectedTypes], runner, rules),
      persist: (p) => store.putArtifact(input.importId, "plan", p)
    });
    const plan = planned.result;
    const known = new Set((await store.listActivities(input.importId)).map((a) => a.activityId));
    for (const [i, p] of plan.entries()) {
      if (known.has(p.activityId)) continue;

      await store.putActivity({ activityId: p.activityId, importId: input.importId, type: p.type, order: i, status: "planned", currentRevision: null, conceptIds: p.conceptIds, criteriaIds: p.criteriaIds, error: null, dropped: false });
    }

    await setStatus("generating");
    const producers = createProducers();
    const pending = (await store.listActivities(input.importId)).filter(isPending);
    const lanes = input.selectedTypes.map((type) => pending.filter((a) => a.type === type)).filter((lane) => lane.length > 0);

    const promotedOfType = async (type: PlannedType): Promise<RevisionRecord[]> => {
      const same = (await store.listActivities(input.importId)).filter((a) => a.type === type && a.currentRevision !== null);
      const revisions = await Promise.all(same.map((a) => store.getRevision(a.activityId, a.currentRevision!)));
      return revisions.filter((r): r is RevisionRecord => r !== null && r.state === "promoted");
    };

    const generateActivity = async (initial: ActivityRecord): Promise<void> => {
      let activity = initial;
      const setActivity = async (patch: Partial<ActivityRecord>): Promise<void> => { activity = { ...activity, ...patch }; await store.putActivity(activity); emit({ kind: "activity", activityId: activity.activityId, status: activity.status, ...(activity.error ? { error: activity.error } : {}) }); };
      const entry = plan.find((p) => p.activityId === activity.activityId);
      if (!entry) throw new Error(`activity ${activity.activityId} is not in the stored plan`);

      const revisions = await store.listRevisions(activity.activityId);
      const promotedRevision = revisions.find((r) => r.state === "promoted");
      if (promotedRevision) {
        await setActivity({ status: "promoted", currentRevision: promotedRevision.revision, error: null }); // promotion finished before the activity record was written
        return;
      }

      const saved = revisions.find((r) => r.state === "candidate");
      const revision = saved ? saved.revision : revisions.length + 1;
      if (!saved) await setActivity({ status: "generating", error: null });
      const produced = await runOperation<RevisionRecord>(ctx, {
        purpose: "produce", activityId: activity.activityId, key: `${input.importId}:produce:${activity.activityId}:r${revision}`,
        load: () => store.getRevision(activity.activityId, revision),
        work: async (runner) => {
          const producer = producers.get(entry.type);
          if (!producer) throw new Error(`no producer for ${entry.type}`);

          const priorTexts = existingTexts(await promotedOfType(activity.type));
          const result = await producer.produce({ plan: entry, map, unit, promptConfig: input.promptConfig, language: input.language, existing: priorTexts, rules }, runner, { registry: deps.registry });
          assertGeneratedProvenance(result.spec);
          return { activityId: activity.activityId, revision, state: "candidate", spec: result.spec, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, modelConfig: { provider: deps.provider.name, models: { ...MODEL_ROLES }, profiles: { ...REQUEST_PROFILES } }, engineFingerprint: deps.engineFingerprint, note: null, buildKey: null, attemptIds: result.attemptIds, createdAt: now() };
        },
        persist: (rev) => store.putRevision(rev)
      });
      const candidate = produced.result;
      if (!produced.reused) await setActivity({ status: "generated" });
      const bytes = await compileToBuffer(candidate.spec, new Map(), { registry: deps.registry, revision: candidate.revision });
      const buildKey = await store.putBuild(input.importId, activity.activityId, candidate.revision, bytes);
      await setActivity({ status: "built" });
      for (const prev of await store.listRevisions(activity.activityId)) if (prev.state === "promoted" && prev.revision !== candidate.revision) await store.putRevision({ ...prev, state: "superseded" });
      await store.putRevision({ ...candidate, state: "promoted", buildKey });
      await setActivity({ status: "promoted", currentRevision: candidate.revision, error: null });
    };

    // A lane worker never throws: every outcome, including a storage failure while recording one, is folded into `halt`,
    // so runLanes waits for every lane to settle before the import is finalised and the lock released.
    await runLanes(lanes, deps.concurrency ?? 3, async (activity) => {
      const mark = async (error: string): Promise<void> => { await store.putActivity({ ...activity, status: "failed", error }); emit({ kind: "activity", activityId: activity.activityId, status: "failed", error }); };
      try {
        if (halt.stop) { await mark(`${SKIPPED_PREFIX}${halt.stop.reason}`); return; }

        try {
          await generateActivity(activity);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof ContentFailure) await mark(`content: ${message}`);
          else if (err instanceof BudgetRefused) { halt.stop = { kind: "budget", reason: message }; await mark(message); }
          else if (err instanceof RunStopped) await mark(`${SKIPPED_PREFIX}${message}`);
          else { halt.stop = { kind: "system", reason: `system: ${message}` }; halt.error = err; await mark(`system: ${message}`); }
        }
        await persistBudget();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        halt.stop ??= { kind: "system", reason: `system: ${message}` };
        halt.error ??= err;
      }
    });

    const finalActivities = await store.listActivities(input.importId);
    const promotedCount = finalActivities.filter((a) => a.status === "promoted").length;
    const failedCount = finalActivities.filter((a) => a.status === "failed").length;
    await foldRun();
    if (halt.error !== undefined) { await setStatus("failed", halt.stop?.reason ?? `system: ${halt.error instanceof Error ? halt.error.message : String(halt.error)}`); throw halt.error; }

    if (promotedCount === 0) await setStatus("failed", halt.stop ? halt.stop.reason : "no activity was promoted");
    else if (failedCount > 0) await setStatus("ready_with_failures", null);
    else await setStatus("ready", null);
    return record;
  } catch (err) {
    if (record.status === "failed" && stopMarked(record)) throw err;

    const message = err instanceof Error ? err.message : String(err);
    await foldRun();
    if (err instanceof BudgetRefused) { await setStatus("failed", message); return record; }

    if (err instanceof ContentFailure) { await setStatus("failed", `content: ${message}`); return record; }

    await setStatus("failed", `system: ${message}`);
    throw err;
  }
}

function stopMarked(record: ImportRecord): boolean {
  return record.error !== null && record.error.startsWith("system: ");
}
