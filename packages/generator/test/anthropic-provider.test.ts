import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildMessageParams, classifyProviderError, createAnthropicProvider, mapMessage } from "../src/llm/anthropic-provider.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { MODEL_ROLES, modelForRole } from "../src/llm/models.js";
import type { ModelRequest } from "../src/llm/types.js";

const schema = toProviderSchema(z.object({ ok: z.boolean() }));
const haikuRequest: ModelRequest = { purpose: "extract", model: modelForRole("extract"), system: "SYSTEM", cachedContext: "CONTEXT", user: "USER", maxOutputTokens: 321, outputSchema: schema };
const sonnetRequest: ModelRequest = { purpose: "produce", model: modelForRole("produce"), system: "SYSTEM", cachedContext: "CONTEXT", user: "USER", maxOutputTokens: 321, outputSchema: schema };

describe("anthropic adapter contract", () => {
  it("builds a Sonnet 5 request with no sampling parameter and thinking disabled", () => {
    expect(MODEL_ROLES.produce).toBe("claude-sonnet-5");
    const params = buildMessageParams(sonnetRequest);
    expect(params).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 321,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [
        { type: "text", text: "CONTEXT", cache_control: { type: "ephemeral" } },
        { type: "text", text: "USER" }
      ] }],
      output_config: { format: { type: "json_schema", schema } }
    });
    for (const key of ["temperature", "top_p", "top_k"]) expect(params).not.toHaveProperty(key);
  });

  it("builds a Haiku 4.5 request with temperature 0 and no thinking field", () => {
    expect(MODEL_ROLES.extract).toBe("claude-haiku-4-5-20251001");
    const params = buildMessageParams(haikuRequest);
    expect(params["temperature"]).toBe(0);
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("top_p");
    const noContext = buildMessageParams({ ...haikuRequest, cachedContext: undefined });
    expect((noContext["messages"] as Array<{ content: unknown[] }>)[0]!.content).toHaveLength(1);
  });

  it("refuses a model with no request profile instead of guessing settings", () => {
    expect(() => buildMessageParams({ ...haikuRequest, model: "claude-unknown" as ModelRequest["model"] })).toThrow(/no request profile/);
  });

  it("maps usage, request id, stop reason and the JSON text block, selecting the text block by type", () => {
    const message = {
      id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "{\"ok\":true}" }],
      usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
      _request_id: "req_abc"
    };
    expect(mapMessage(message, 87)).toEqual({
      providerRequestId: "req_abc", model: "claude-sonnet-5", stopReason: "end_turn", outputText: "{\"ok\":true}",
      rawUsage: message.usage, usage: { inputTokens: 1200, outputTokens: 40, cacheReadTokens: 1000, cacheWriteTokens: 0 }, latencyMs: 87
    });
  });

  it("treats absent cache fields as zero and absent usage as null, and a refusal as no output", () => {
    const minimal = { model: "m", stop_reason: "refusal", content: [], usage: { input_tokens: 5, output_tokens: 0 }, _request_id: null, stop_details: { category: "cyber", explanation: "x" } };
    const mapped = mapMessage(minimal, 1);
    expect(mapped.usage).toEqual({ inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(mapped.outputText).toBeUndefined();
    expect(mapped.providerRequestId).toBeNull();
    expect(mapMessage({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }, 1).usage).toBeNull();
  });

  it("calls the client with maxRetries 0 and the configured timeout, shortened to the caller's deadline when one is closer", async () => {
    const create = vi.fn().mockResolvedValue({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }], usage: { input_tokens: 1, output_tokens: 1 }, _request_id: "req_1" });
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    const response = await provider.complete(sonnetRequest);
    expect(create).toHaveBeenCalledWith(buildMessageParams(sonnetRequest), { maxRetries: 0, timeout: 120_000, signal: expect.any(AbortSignal) });
    expect(response.providerRequestId).toBe("req_1");
    expect(provider.name).toBe("anthropic");
    await provider.complete(sonnetRequest, { deadlineMs: Date.now() + 5000 });
    const bounded = (create.mock.calls[1] as [unknown, { maxRetries: number; timeout: number; signal: AbortSignal }])[1];
    expect(bounded.maxRetries).toBe(0);
    expect(bounded.timeout).toBeGreaterThan(0);
    expect(bounded.timeout).toBeLessThanOrEqual(5000);
    expect(bounded.signal.aborted).toBe(false); // armed at the deadline, and cleared once the call returned
  });

  it("refuses a dispatch whose deadline has already passed, before the client is called, as a permanent error", async () => {
    const create = vi.fn();
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    await expect(provider.complete(sonnetRequest, { deadlineMs: Date.now() - 1 })).rejects.toMatchObject({
      name: "ProviderError", kind: "permanent", message: expect.stringMatching(/already passed at dispatch; no request was sent/)
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("aborts a call whose body outlives the deadline and reports it as transient, naming the deadline", async () => {
    const seen: { aborted: boolean } = { aborted: false };
    // fast headers, delayed body: the SDK's own timeout timer is cleared once the headers arrive, so only the signal can end this
    const create = vi.fn((_params: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
      const body = setTimeout(() => resolve({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }), 200);
      requestOptions?.signal?.addEventListener("abort", () => { seen.aborted = requestOptions.signal!.aborted; clearTimeout(body); reject(new Error("The operation was aborted.")); }, { once: true });
    }));
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    const deadlineMs = Date.now() + 20;
    const started = Date.now();
    const error = await provider.complete(sonnetRequest, { deadlineMs }).then(() => null, (err: unknown) => err);
    expect(error).toMatchObject({ name: "ProviderError", kind: "transient" });
    expect((error as Error).message).toMatch(/aborted after \d+ ms, at the import's elapsed deadline at /);
    expect((error as Error).message).toContain(new Date(deadlineMs).toISOString());
    expect(Date.now() - started).toBeLessThan(180); // it ended at the deadline, not when the body finally arrived
    expect(seen.aborted).toBe(true);
  });

  it("classifies SDK errors by status and carries the request id and retry-after", () => {
    const apiError = (status: number, headers = new Headers()) => new Anthropic.APIError(status, { error: { type: "x", message: "m" } }, "m", headers);
    expect(classifyProviderError(apiError(429)).kind).toBe("transient");
    expect(classifyProviderError(apiError(529)).kind).toBe("transient");
    expect(classifyProviderError(apiError(408)).kind).toBe("transient");
    expect(classifyProviderError(apiError(400)).kind).toBe("permanent");
    expect(classifyProviderError(apiError(401)).kind).toBe("permanent");
    const limited = classifyProviderError(apiError(429, new Headers({ "retry-after": "7", "request-id": "req_429" })));
    expect(limited.retryAfterMs).toBe(7000);
    expect(limited.requestId).toBe("req_429");
    expect(classifyProviderError(new Anthropic.APIConnectionError({ message: "socket hang up" }))).toMatchObject({ kind: "transient", requestId: null, retryAfterMs: null });
    expect(classifyProviderError(new Error("weird")).kind).toBe("permanent");
  });

  it("wraps client failures as ProviderError so callModel can classify them", async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIError(500, { error: { type: "api_error", message: "boom" } }, "boom", new Headers({ "request-id": "req_500" })));
    const provider = createAnthropicProvider({ client: { messages: { create } } });
    await expect(provider.complete(sonnetRequest)).rejects.toMatchObject({ name: "ProviderError", kind: "transient", status: 500, requestId: "req_500" });
  });

  it("requires an api key when no client is injected", () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try { expect(() => createAnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/); } finally { if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved; }
  });
});
