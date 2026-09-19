import type { ModelRequest, ModelResponse } from "./types.js";

/** Per-call limits the caller imposes; the adapter turns the deadline into its request timeout. */
export interface CallOptions { deadlineMs?: number; }

export interface ModelProvider {
  readonly name: "anthropic" | "fake" | "replay";
  complete(request: ModelRequest, options?: CallOptions): Promise<ModelResponse>;
}

export class ProviderError extends Error {
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;
  constructor(message: string, public readonly kind: "transient" | "permanent", public readonly status?: number, details: { requestId?: string | null; retryAfterMs?: number | null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.requestId = details.requestId ?? null;
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}
