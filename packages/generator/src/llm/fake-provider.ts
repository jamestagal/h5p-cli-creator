import type { CallOptions, ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse } from "./types.js";

/** Builds a response shaped like the Messages API mapping; the content is synthetic test data. */
export function fakeResponse(partial: Partial<ModelResponse> = {}): ModelResponse {
  const usage = partial.usage === undefined ? { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } : partial.usage;
  return {
    providerRequestId: partial.providerRequestId === undefined ? "req_fake" : partial.providerRequestId,
    model: partial.model ?? "fake-model",
    stopReason: partial.stopReason ?? "end_turn",
    outputText: partial.outputText,
    rawUsage: partial.rawUsage === undefined ? (usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : null) : partial.rawUsage,
    usage,
    latencyMs: partial.latencyMs ?? 5
  };
}

export class FakeProvider implements ModelProvider {
  readonly name = "fake" as const;
  readonly requests: ModelRequest[] = [];
  readonly options: CallOptions[] = [];

  constructor(private readonly script: Array<ModelResponse | Error>) {}

  async complete(request: ModelRequest, options: CallOptions = {}): Promise<ModelResponse> {
    this.requests.push(request);
    this.options.push(options);
    const next = this.script.shift();
    if (next === undefined) throw new Error(`FakeProvider script exhausted for purpose ${request.purpose}`);
    if (next instanceof Error) throw next;
    return { ...next, model: request.model };
  }
}
