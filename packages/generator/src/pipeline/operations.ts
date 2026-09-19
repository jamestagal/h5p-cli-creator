import { createBudget, type Budget, type BudgetLimits } from "../llm/budget.js";
import type { ModelProvider } from "../llm/provider.js";
import { createRunner, type RunnerOptions, type StageRunner } from "../llm/runner.js";
import type { AttemptEvent, AttemptOutcome, AttemptStart, Purpose } from "../llm/types.js";
import type { ImportStore, OperationRecord } from "../store/types.js";

export interface OperationContext {
  store: ImportStore; provider: ModelProvider; budget: Budget; importId: string; clock: () => Date; sleep?: (ms: number) => Promise<void>;
  /** Attempts recorded per call key so far (ledger plus this run), for retryIndex numbering across resumptions. */
  attemptsByKey: Map<string, number>;
  onAttempt?: (event: { purpose: Purpose; status: AttemptOutcome["status"]; costUsdMicro: number | null }) => void;
  /** The import's shared stop signal, consulted by every runner before every dispatch. */
  stop?: () => string | null;
}

export interface ElapsedEvidence {
  run: { startedAt: string; elapsedBeforeMs: number };
  /** budgetUsed.elapsedMs as last saved by the interrupted run; the result never goes below it. */
  savedElapsedMs: number;
  events: AttemptEvent[];
  operations: OperationRecord[];
  /** The import record's own last write. */
  updatedAt: string;
  nowMs: number;
  maxAttemptMs: number;
  limitMs: number;
}

/**
 * The elapsed time an interrupted run is charged. Everything durable the run wrote after its anchor counts: attempt
 * starts and outcomes, operation starts and completions, the import record's last write. The time between the last
 * of those and the death cannot be observed, so it is charged as one maximum attempt length (the same bound as a
 * call that never finished), capped at the run's own deadline and at the time that has really passed. The result
 * never falls below what the run's last budget snapshot already recorded.
 */
export function reconcileElapsed(evidence: ElapsedEvidence): number {
  const startedMs = Date.parse(evidence.run.startedAt);
  const deadlineMs = startedMs + Math.max(0, evidence.limitMs - evidence.run.elapsedBeforeMs);
  const stamps: number[] = [Date.parse(evidence.updatedAt)];
  for (const e of evidence.events) stamps.push(Date.parse(e.event === "start" ? e.startedAt : e.completedAt));
  for (const o of evidence.operations) { stamps.push(Date.parse(o.startedAt)); if (o.completedAt) stamps.push(Date.parse(o.completedAt)); }
  const latestDurable = stamps.filter((s) => !Number.isNaN(s) && s >= startedMs).reduce((a, b) => Math.max(a, b), startedMs);
  const chargedUntil = Math.min(evidence.nowMs, deadlineMs, latestDurable + evidence.maxAttemptMs);
  const reconstructed = evidence.run.elapsedBeforeMs + Math.max(0, chargedUntil - startedMs);
  return Math.max(evidence.savedElapsedMs, reconstructed);
}

/** Rebuilds the import's budget from the attempt ledger: known costs and tokens are spent; a start with no outcome is spent at its reservation (it may have been billed); every start is a request; the deadline is what remains of the per-import elapsed limit. */
export function budgetFromLedger(limits: BudgetLimits, events: AttemptEvent[], startedAtMs: number, elapsedBeforeMs: number): Budget {
  const budget = createBudget(limits, startedAtMs, elapsedBeforeMs);
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  for (const e of events) {
    if (e.event !== "start") continue;
    const o = outcomes.get(e.attemptId);
    const reservedTokens = e.reservedInputTokens + e.reservedOutputTokens;
    const actualTokens = o && o.inputTokens !== null ? o.inputTokens + (o.cacheReadTokens ?? 0) + (o.cacheWriteTokens ?? 0) + (o.outputTokens ?? 0) : null;
    budget.requests += 1;
    budget.spentUsdMicro += o?.costUsdMicro ?? e.reservedUsdMicro;
    budget.spentTokens += actualTokens ?? reservedTokens;
  }
  return budget;
}

export function attemptsByKey(events: AttemptEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) if (e.event === "start") counts.set(e.callKey, (counts.get(e.callKey) ?? 0) + 1);
  return counts;
}

/** Marks every operation still "running" as failed and billing-uncertain (spec §5). */
export async function reconcile(store: ImportStore, importId: string, clock: () => Date): Promise<void> {
  for (const op of await store.listOperations(importId)) {
    if (op.status !== "running") continue;
    await store.putOperation({ ...op, status: "failed", billingUncertain: true, outcome: "interrupted before an outcome was recorded; the provider may have billed the attempt", completedAt: clock().toISOString() });
  }
}

export interface RunOperation<T> {
  purpose: Purpose;
  activityId: string | null;
  key: string;
  /** A result persisted by an earlier run, or null. Checked first: a persisted result is the source of truth even when the operation record was interrupted. */
  load: () => Promise<T | null>;
  work: (runner: StageRunner, op: OperationRecord) => Promise<T>;
  /** Persists the result. Runs before the operation is marked succeeded, so a crash between the two leaves a reusable result rather than a succeeded operation with nothing stored. */
  persist: (result: T) => Promise<void>;
}
export interface OperationOutcome<T> { result: T; operation: OperationRecord; reused: boolean; }

export async function runOperation<T>(ctx: OperationContext, spec: RunOperation<T>): Promise<OperationOutcome<T>> {
  const existing = (await ctx.store.listOperations(ctx.importId)).filter((o) => o.idempotencyKey === spec.key).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.operationId.localeCompare(b.operationId));
  const latest = existing.at(-1);
  const stored = await spec.load();
  if (stored !== null) {
    if (latest && latest.status === "succeeded") return { result: stored, operation: latest, reused: true };
    const corrected: OperationRecord = latest
      ? { ...latest, status: "succeeded", outcome: `${latest.outcome ?? "interrupted"}; the result had been persisted and was reused on resume`, completedAt: ctx.clock().toISOString() }
      : { operationId: spec.key, importId: ctx.importId, activityId: spec.activityId, purpose: spec.purpose, status: "succeeded", idempotencyKey: spec.key, contentAttempts: 0, outcome: "result found in the store without an operation record; reused on resume", billingUncertain: false, startedAt: ctx.clock().toISOString(), completedAt: ctx.clock().toISOString() };
    await ctx.store.putOperation(corrected);
    return { result: stored, operation: corrected, reused: true };
  }
  const operationId = existing.length === 0 ? spec.key : `${spec.key}#${existing.length + 1}`;
  const note = latest?.status === "succeeded" ? "re-run: the earlier operation succeeded but its result is missing from the store" : null;
  const op: OperationRecord = { operationId, importId: ctx.importId, activityId: spec.activityId, purpose: spec.purpose, status: "running", idempotencyKey: spec.key, contentAttempts: 0, outcome: note, billingUncertain: false, startedAt: ctx.clock().toISOString(), completedAt: null };
  await ctx.store.putOperation(op);
  const recorder = ctx.store.recorderFor(ctx.importId);
  const counting = {
    recordStart: async (s: AttemptStart) => { op.contentAttempts = Math.max(op.contentAttempts, s.attempt); ctx.attemptsByKey.set(s.callKey, (ctx.attemptsByKey.get(s.callKey) ?? 0) + 1); await recorder.recordStart(s); },
    recordOutcome: async (o: AttemptOutcome) => { await recorder.recordOutcome(o); ctx.onAttempt?.({ purpose: spec.purpose, status: o.status, costUsdMicro: o.costUsdMicro }); }
  };
  const runnerOptions: RunnerOptions = { provider: ctx.provider, recorder: counting, budget: ctx.budget, operationId, clock: ctx.clock, priorAttempts: (key) => ctx.attemptsByKey.get(key) ?? 0 };
  if (ctx.sleep) runnerOptions.sleep = ctx.sleep;
  if (ctx.stop) runnerOptions.stop = ctx.stop;
  const runner = createRunner(runnerOptions);
  try {
    const result = await spec.work(runner, op);
    await spec.persist(result);
    await ctx.store.putOperation({ ...op, status: "succeeded", outcome: "ok", completedAt: ctx.clock().toISOString() });
    return { result, operation: op, reused: false };
  } catch (err) {
    await ctx.store.putOperation({ ...op, status: "failed", outcome: err instanceof Error ? `${err.name}: ${err.message}` : String(err), completedAt: ctx.clock().toISOString() });
    throw err;
  }
}

/** Runs each lane's items strictly in order; up to `concurrency` lanes run at once. Workers must not throw (the caller records outcomes and stop flags). */
export async function runLanes<T>(lanes: T[][], concurrency: number, worker: (item: T, laneIndex: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runLane = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= lanes.length) return;
      for (const item of lanes[i]!) await worker(item, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, lanes.length)) }, runLane));
}
