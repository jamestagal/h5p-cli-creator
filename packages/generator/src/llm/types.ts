import type { CostStatus, GenerationUsage } from "@leaplearn/shared";
import type { ModelId, ModelRole } from "./models.js";

export type Purpose = ModelRole;

export interface ModelRequest {
  purpose: Purpose;
  model: ModelId;
  system: string;
  /** Stable context that should be cached (concept map, unit); cached with a 5-minute breakpoint when present. */
  cachedContext?: string;
  user: string;
  maxOutputTokens: number;
  /** Provider-compatible JSON Schema (from toProviderSchema) the response must satisfy; the provider enforces it natively. */
  outputSchema: Record<string, unknown>;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal" | "model_context_window_exceeded";

export interface ModelResponse {
  providerRequestId: string | null;
  model: string;
  stopReason: StopReason;
  /** Raw JSON text of the structured output (undefined when the model refused or was cut off). */
  outputText: string | undefined;
  rawUsage: Record<string, unknown> | null;
  usage: GenerationUsage | null;
  latencyMs: number;
}

export type AttemptStatus = "ok" | "content_error" | "transient_error" | "provider_error";
/** Why this attempt exists beyond the first for its call key: a content rejection, a transient provider failure, or a resumed operation. */
export type RetryReason = "content" | "transient" | "resume";

export interface AttemptStart {
  event: "start";
  attemptId: string;
  operationId: string;
  /** Stable identity of the logical call within the import (e.g. `extract:chunk-2`, `merge`, `produce:act-3`); retries share it. */
  callKey: string;
  /** 0 for the first attempt of a call key in the import; counts every earlier attempt with the same key, across operations and resumptions. */
  retryIndex: number;
  retryReason: RetryReason | null;
  /** 1-based content attempt within the operation (transient retries do not advance it). */
  attempt: number;
  /** The budget deadline this attempt was dispatched under: an interrupted attempt is charged as if it ran until this deadline or the maximum attempt length, whichever is sooner (Task 14). */
  deadlineMs: number;
  purpose: Purpose;
  provider: "anthropic" | "fake" | "replay";
  model: string;
  credentialOwner: "org" | "server";
  reservedInputTokens: number;
  reservedOutputTokens: number;
  reservedUsdMicro: number;
  startedAt: string;
}

export interface AttemptOutcome {
  event: "outcome";
  attemptId: string;
  operationId: string;
  providerRequestId: string | null;
  rawUsage: Record<string, unknown> | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  latencyMs: number;
  pricingVersion: string;
  costUsdMicro: number | null;
  costStatus: CostStatus;
  stopReason: StopReason | null;
  status: AttemptStatus;
  error: string | null;
  /** True when input + cache-read + cache-write tokens exceeded reservedInputTokens: the estimate under-counted this attempt. */
  reservationExceeded: boolean;
  /** max(0, costUsdMicro − reservedUsdMicro): by how much the reservation under-estimated this attempt; null when the cost is unknown. This measures the estimate, not the import's cap (the report computes spend over the cap separately). */
  underestimateUsdMicro: number | null;
  completedAt: string;
}

export type AttemptEvent = AttemptStart | AttemptOutcome;

export interface AttemptRecorder {
  recordStart(start: AttemptStart): Promise<void>;
  recordOutcome(outcome: AttemptOutcome): Promise<void>;
}
