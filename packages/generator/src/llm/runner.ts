import type { z } from "zod";
import { callModel, type CallContext, type CallResult } from "./call-model.js";
import { remainingMs, type Budget, type BudgetLimitName } from "./budget.js";
import type { ModelProvider } from "./provider.js";
import type { AttemptRecorder, ModelRequest, RetryReason } from "./types.js";

export interface StageCall<T> { key: string; request: ModelRequest; schema: z.ZodType<T>; verify?: (value: T) => string[] | Promise<string[]>; }
export interface StageResult<T> { value: T; attempts: number; attemptIds: string[]; }
export interface StageRunner { run<T>(call: StageCall<T>): Promise<StageResult<T>>; }

export class ContentFailure extends Error {
  constructor(public readonly reasons: string[], public readonly attempts: number) { super(`content rejected after ${attempts} attempt(s): ${reasons.join("; ")}`); this.name = "ContentFailure"; }
}
export class BudgetRefused extends Error { constructor(reason: string, public readonly limit: BudgetLimitName) { super(reason); this.name = "BudgetRefused"; } }
export class InfrastructureFailure extends Error { constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "InfrastructureFailure"; } }
/** Thrown instead of dispatching when another lane has stopped the import; the activity is recorded as skipped and re-dispatched on resume. */
export class RunStopped extends Error { constructor(public readonly reason: string) { super(reason); this.name = "RunStopped"; } }

export const FEEDBACK_HEADER = "YOUR PREVIOUS ATTEMPT WAS REJECTED FOR THESE REASONS:";
const TRANSIENT_WAITS_MS = [1000, 2000, 4000];

export interface RunnerOptions {
  provider: ModelProvider;
  recorder: AttemptRecorder;
  budget: Budget;
  operationId: string;
  maxContentAttempts?: number;
  maxTransientRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  ids?: () => string;
  clock?: () => Date;
  /** Attempts already recorded for a call key earlier in the import (the pipeline reads them from the ledger); a resumed call's first attempt starts its retryIndex there. */
  priorAttempts?: (key: string) => number;
  /** The import's shared stop signal: a reason once any lane has stopped it, null otherwise. Consulted before every dispatch. */
  stop?: () => string | null;
}

function withFeedback(request: ModelRequest, reasons: string[]): ModelRequest {
  const base = request.user.split(`\n\n${FEEDBACK_HEADER}`)[0]!;
  return { ...request, user: `${base}\n\n${FEEDBACK_HEADER}\n${reasons.map((r) => `- ${r}`).join("\n")}\nReturn a corrected, complete response.` };
}

function zodReasons(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/**
 * Wraps the caller's recorder so a throw from recordStart or recordOutcome carries which phase
 * failed; callModel does not catch these throws (Task 4 review finding: a recorder failure is the
 * stop signal, not a CallResult), so the runner is the first place that can name the phase.
 */
function withPhaseTagging(recorder: AttemptRecorder): AttemptRecorder {
  return {
    async recordStart(event) {
      try {
        await recorder.recordStart(event);
      } catch (err) {
        throw new Error(`recording attempt start failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
    },
    async recordOutcome(event) {
      try {
        await recorder.recordOutcome(event);
      } catch (err) {
        throw new Error(`recording attempt outcome failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
    }
  };
}

/** The only retry loop (spec §5 step 5): content failures feed back, transient failures retry as new metered attempts, everything else stops. */
export function createRunner(options: RunnerOptions): StageRunner {
  const maxContent = options.maxContentAttempts ?? 3;
  const maxTransient = options.maxTransientRetries ?? 3;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const priorAttempts = options.priorAttempts ?? (() => 0);
  const stop = options.stop ?? (() => null);
  const now = options.clock ?? (() => new Date());
  const recorder = withPhaseTagging(options.recorder);
  return {
    async run<T>(call: StageCall<T>): Promise<StageResult<T>> {
      let request = call.request;
      let attempt = 0;
      let transientInARow = 0;
      let retryIndex = priorAttempts(call.key);
      let retryReason: RetryReason | null = retryIndex > 0 ? "resume" : null;
      const attemptIds: string[] = [];
      let lastReasons: string[] = [];
      while (attempt < maxContent) {
        const stopReason = stop();
        if (stopReason !== null) throw new RunStopped(stopReason);
        const ctx: CallContext = { provider: options.provider, recorder, budget: options.budget, operationId: options.operationId, callKey: call.key, retryIndex, retryReason, attempt: attempt + 1 };
        if (options.ids) ctx.ids = options.ids;
        if (options.clock) ctx.clock = options.clock;
        let result: CallResult;
        try {
          result = await callModel(request, ctx);
        } catch (err) {
          throw new InfrastructureFailure(err instanceof Error ? err.message : String(err), { cause: err });
        }
        if (result.kind === "budget_refused") throw new BudgetRefused(result.reason, result.limit);
        if (result.kind === "provider_error") throw new InfrastructureFailure(`${result.error}${result.providerRequestId ? ` (request ${result.providerRequestId})` : ""}`);
        if (result.kind === "transient_error") {
          attemptIds.push(result.attemptId);
          retryIndex += 1;
          retryReason = "transient";
          if (++transientInARow > maxTransient) throw new InfrastructureFailure(`provider unavailable after ${maxTransient} transient failures: ${result.error}${result.providerRequestId ? ` (request ${result.providerRequestId})` : ""}`);
          const wait = Math.max(TRANSIENT_WAITS_MS[Math.min(transientInARow - 1, TRANSIENT_WAITS_MS.length - 1)]!, result.retryAfterMs ?? 0);
          if (remainingMs(options.budget, now().getTime()) <= wait) throw new BudgetRefused(`budget: a ${wait} ms backoff would pass the import's elapsed-time limit`, "elapsed");
          await sleep(wait);
          continue;
        }
        transientInARow = 0;
        attempt += 1;
        attemptIds.push(result.attemptId);
        const reject = (reasons: string[]): void => { lastReasons = reasons; request = withFeedback(request, reasons); retryIndex += 1; retryReason = "content"; };
        if (result.kind === "content_error") { reject([result.reason]); continue; }
        /** Every other CallResult kind returns or continues above; TS cannot fold "transient_error" | "provider_error" out of the remaining union from two separate literal checks, so the last case is asserted narrow here. */
        const parsed = call.schema.safeParse((result as Extract<CallResult, { kind: "ok" }>).json);
        if (!parsed.success) { reject(zodReasons(parsed.error)); continue; }
        const issues = call.verify ? await call.verify(parsed.data) : [];
        if (issues.length > 0) { reject(issues); continue; }
        return { value: parsed.data, attempts: attempt, attemptIds };
      }
      throw new ContentFailure(lastReasons, attempt);
    }
  };
}
