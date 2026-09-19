import Anthropic from "@anthropic-ai/sdk";
import type { GenerationUsage } from "@leaplearn/shared";
import { requestProfile } from "./models.js";
import { ProviderError, type CallOptions, type ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse, StopReason } from "./types.js";

export interface MessagesClient {
  messages: { create(params: Record<string, unknown>, requestOptions?: { maxRetries?: number; timeout?: number }): Promise<unknown> };
}

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
/** Exported so the pipeline's maxAttemptMs (what an interrupted attempt is charged) cannot drift from the request timeout. */
export const ANTHROPIC_TIMEOUT_MS = 10 * 60 * 1000;

export function buildMessageParams(request: ModelRequest): Record<string, unknown> {
  const profile = requestProfile(request.model);
  const content: Array<Record<string, unknown>> = [];
  if (request.cachedContext !== undefined) content.push({ type: "text", text: request.cachedContext, cache_control: { type: "ephemeral" } });
  content.push({ type: "text", text: request.user });
  const params: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: request.outputSchema } }
  };
  if (profile.temperature !== null) params["temperature"] = profile.temperature;
  if (profile.thinking !== null) params["thinking"] = profile.thinking;
  return params;
}

interface RawUsage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; [k: string]: unknown; }
interface RawMessage { model?: string; stop_reason?: string | null; content?: Array<{ type: string; text?: string }>; usage?: RawUsage; _request_id?: string | null; }

function toUsage(raw: RawUsage | undefined): GenerationUsage | null {
  if (!raw || typeof raw.input_tokens !== "number" || typeof raw.output_tokens !== "number") return null;
  return { inputTokens: raw.input_tokens, outputTokens: raw.output_tokens, cacheReadTokens: raw.cache_read_input_tokens ?? 0, cacheWriteTokens: raw.cache_creation_input_tokens ?? 0 };
}

/** Content blocks are selected by type: with thinking on, thinking blocks precede the text block. */
export function mapMessage(message: unknown, latencyMs: number): ModelResponse {
  const m = message as RawMessage;
  const text = m.content?.find((c) => c.type === "text" && typeof c.text === "string")?.text;
  return {
    providerRequestId: m._request_id ?? null,
    model: m.model ?? "",
    stopReason: (m.stop_reason ?? "end_turn") as StopReason,
    outputText: text,
    rawUsage: m.usage ? { ...m.usage } : null,
    usage: toUsage(m.usage),
    latencyMs
  };
}

function headerValue(headers: unknown, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (headers && typeof headers === "object") { const v = (headers as Record<string, unknown>)[name]; return typeof v === "string" ? v : null; }
  return null;
}

function retryAfterMs(headers: unknown): number | null {
  const raw = headerValue(headers, "retry-after");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

export function classifyProviderError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(err.message, "transient");
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    const transient = status !== undefined && (TRANSIENT_STATUSES.has(status) || status >= 500);
    const requestId = typeof err.requestID === "string" ? err.requestID : headerValue(err.headers, "request-id");
    return new ProviderError(err.message, transient ? "transient" : "permanent", status, { requestId, retryAfterMs: retryAfterMs(err.headers) });
  }
  return new ProviderError(err instanceof Error ? err.message : String(err), "permanent");
}

/** The only place the Anthropic SDK is called. SDK retries are off (maxRetries 0): the stage runner retries, and every retry is its own recorded attempt. */
export function createAnthropicProvider(options: { apiKey?: string; client?: MessagesClient; timeoutMs?: number } = {}): ModelProvider {
  let client = options.client;
  if (!client) {
    const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not set and no api key was injected", "permanent");
    client = new Anthropic({ apiKey, maxRetries: 0 }) as unknown as MessagesClient;
  }
  const configuredTimeout = options.timeoutMs ?? ANTHROPIC_TIMEOUT_MS;
  return {
    name: "anthropic",
    async complete(request, callOptions: CallOptions = {}) {
      const started = Date.now();
      const timeout = callOptions.deadlineMs === undefined ? configuredTimeout : Math.max(1, Math.min(configuredTimeout, callOptions.deadlineMs - started));
      let message: unknown;
      try {
        message = await client!.messages.create(buildMessageParams(request), { maxRetries: 0, timeout });
      } catch (err) {
        throw classifyProviderError(err);
      }
      return mapMessage(message, Date.now() - started);
    }
  };
}
