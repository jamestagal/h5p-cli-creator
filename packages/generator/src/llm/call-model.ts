import { randomUUID } from "node:crypto";
import { computeCost } from "./cost.js";
import { reserve, settle, type Budget, type BudgetLimitName } from "./budget.js";
import { ProviderError, type ModelProvider } from "./provider.js";
import type { AttemptOutcome, AttemptRecorder, AttemptStatus, ModelRequest, ModelResponse, RetryReason } from "./types.js";

export interface CallContext {
  provider: ModelProvider;
  recorder: AttemptRecorder;
  budget: Budget;
  operationId: string;
  callKey: string;
  retryIndex: number;
  retryReason: RetryReason | null;
  attempt: number;
  clock?: () => Date;
  ids?: () => string;
}

export type CallResult =
  | { kind: "ok"; json: unknown; response: ModelResponse; attemptId: string }
  | { kind: "content_error"; reason: string; response: ModelResponse; attemptId: string }
  | { kind: "transient_error" | "provider_error"; error: string; attemptId: string; providerRequestId: string | null; retryAfterMs: number | null }
  | { kind: "budget_refused"; limit: BudgetLimitName; reason: string };

function interpret(response: ModelResponse): { status: AttemptStatus; json?: unknown; reason?: string } {
  if (response.stopReason === "refusal") return { status: "content_error", reason: "the model refused the request" };
  if (response.stopReason === "max_tokens") return { status: "content_error", reason: "output truncated at the max_tokens limit; the request needs a smaller task or a larger limit" };
  if (response.stopReason === "model_context_window_exceeded") return { status: "content_error", reason: "the request exceeded the model's context window; the input must be smaller" };
  if (response.outputText === undefined) return { status: "content_error", reason: "the response carried no structured output" };
  try {
    return { status: "ok", json: JSON.parse(response.outputText) };
  } catch (err) {
    return { status: "content_error", reason: `structured output is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The only path to a model: reserve budget, record the start, dispatch once, record the outcome (always), settle the budget. Never retries. */
export async function callModel(request: ModelRequest, ctx: CallContext): Promise<CallResult> {
  const now = ctx.clock ?? (() => new Date());
  const reservation = reserve(ctx.budget, request, now().getTime());
  if (!reservation.ok) return { kind: "budget_refused", limit: reservation.limit, reason: reservation.reason };

  const attemptId = (ctx.ids ?? randomUUID)();
  await ctx.recorder.recordStart({
    event: "start", attemptId, operationId: ctx.operationId, callKey: ctx.callKey, retryIndex: ctx.retryIndex, retryReason: ctx.retryReason, attempt: ctx.attempt, deadlineMs: ctx.budget.deadlineMs,
    purpose: request.purpose, provider: ctx.provider.name, model: request.model, credentialOwner: "server",
    reservedInputTokens: reservation.reservedInputTokens, reservedOutputTokens: reservation.reservedOutputTokens, reservedUsdMicro: reservation.reservedUsdMicro, startedAt: now().toISOString()
  });
  const started = Date.now();
  let response: ModelResponse | undefined;
  let failure: { status: AttemptStatus; error: string; providerRequestId: string | null; retryAfterMs: number | null } | undefined;
  try {
    response = await ctx.provider.complete(request, { deadlineMs: ctx.budget.deadlineMs });
  } catch (err) {
    const provider = err instanceof ProviderError ? err : undefined;
    failure = { status: provider?.kind === "transient" ? "transient_error" : "provider_error", error: err instanceof Error ? err.message : String(err), providerRequestId: provider?.requestId ?? null, retryAfterMs: provider?.retryAfterMs ?? null };
  }

  const usage = response?.usage ?? null;
  const cost = computeCost(usage, request.model);
  const actualInputTokens = usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : null;
  const interpreted = response ? interpret(response) : undefined;
  const status: AttemptStatus = failure ? failure.status : interpreted!.status;
  const outcome: AttemptOutcome = {
    event: "outcome", attemptId, operationId: ctx.operationId,
    providerRequestId: response?.providerRequestId ?? failure?.providerRequestId ?? null,
    rawUsage: response?.rawUsage ?? null,
    inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, cacheReadTokens: usage?.cacheReadTokens ?? null, cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    latencyMs: response?.latencyMs ?? Date.now() - started,
    pricingVersion: cost.pricingVersion, costUsdMicro: cost.costUsdMicro, costStatus: cost.costStatus,
    stopReason: response?.stopReason ?? null,
    status, error: failure?.error ?? interpreted?.reason ?? null,
    reservationExceeded: actualInputTokens !== null && actualInputTokens > reservation.reservedInputTokens,
    underestimateUsdMicro: cost.costUsdMicro === null ? null : Math.max(0, cost.costUsdMicro - reservation.reservedUsdMicro),
    completedAt: now().toISOString()
  };
  await ctx.recorder.recordOutcome(outcome);
  settle(ctx.budget, reservation, { costUsdMicro: cost.costUsdMicro, tokens: usage && actualInputTokens !== null ? actualInputTokens + usage.outputTokens : null });

  if (failure) return { kind: failure.status === "transient_error" ? "transient_error" : "provider_error", error: failure.error, attemptId, providerRequestId: failure.providerRequestId, retryAfterMs: failure.retryAfterMs };
  if (interpreted!.status === "ok") return { kind: "ok", json: interpreted!.json, response: response!, attemptId };
  return { kind: "content_error", reason: interpreted!.reason ?? "content error", response: response!, attemptId };
}
