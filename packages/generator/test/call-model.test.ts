import { describe, it, expect } from "vitest";
import { z } from "zod";
import { callModel, type CallContext } from "../src/llm/call-model.js";
import { createAnthropicProvider } from "../src/llm/anthropic-provider.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget, DEFAULT_BUDGET_LIMITS, reserve } from "../src/llm/budget.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import { computeCost } from "../src/llm/cost.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart, ModelRequest } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder {
  events: AttemptEvent[] = [];
  startedBeforeDispatch = false;
  constructor(private readonly provider?: FakeProvider) {}
  async recordStart(s: AttemptStart) { this.startedBeforeDispatch = (this.provider?.requests.length ?? 0) === 0; this.events.push(s); }
  async recordOutcome(o: AttemptOutcome) { this.events.push(o); }
}

const CLOCK = new Date("2026-09-19T00:00:00Z");
const req = (): ModelRequest => ({ purpose: "produce", model: modelForRole("produce"), system: "sys", user: "make one", maxOutputTokens: 500, outputSchema: toProviderSchema(z.object({ ok: z.boolean() })) });
/** Budget and clock share one time base, so the elapsed deadline is not already past when the test starts. */
const ctx = (provider: FakeProvider, recorder = new MemoryRecorder(), limitUsdMicro = 10_000_000): CallContext => ({ provider, recorder, budget: createBudget({ usdMicro: limitUsdMicro }, CLOCK.getTime()), operationId: "op-1", callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, clock: () => CLOCK, ids: () => "att-1" });
const outcomes = (r: MemoryRecorder) => r.events.filter((e): e is AttemptOutcome => e.event === "outcome");

describe("callModel", () => {
  it("records start before dispatch and outcome after, with the call key, retry index and cost from the pricing table", async () => {
    const usage = { inputTokens: 120, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify({ ok: true }), usage, providerRequestId: "req_1" })]);
    const recorder = new MemoryRecorder(provider);
    const result = await callModel(req(), ctx(provider, recorder));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.json).toEqual({ ok: true });
    expect(recorder.events.map((e) => e.event)).toEqual(["start", "outcome"]);
    const start = recorder.events[0] as AttemptStart;
    expect(start).toMatchObject({ callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, reservedOutputTokens: 500, deadlineMs: CLOCK.getTime() + DEFAULT_BUDGET_LIMITS.elapsedMs });
    expect(start.reservedUsdMicro).toBeGreaterThan(0);
    const outcome = outcomes(recorder)[0]!;
    expect(outcome).toMatchObject({ status: "ok", providerRequestId: "req_1", inputTokens: 120, outputTokens: 30, costStatus: "known", pricingVersion: expect.any(String), reservationExceeded: false, underestimateUsdMicro: 0 });
    expect(outcome.costUsdMicro).toBe(computeCost(usage, modelForRole("produce")).costUsdMicro);
    expect(recorder.startedBeforeDispatch).toBe(true);
    expect(provider.options[0]).toEqual({ deadlineMs: CLOCK.getTime() + DEFAULT_BUDGET_LIMITS.elapsedMs }); // the provider is told the deadline
  });
  it("flags an attempt whose actual usage exceeds the reservation and records the underestimate", async () => {
    const usage = { inputTokens: 5_000_000, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}", usage })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder, 1e12);
    await callModel(req(), c);
    const start = recorder.events[0] as AttemptStart;
    const outcome = outcomes(recorder)[0]!;
    expect(outcome.reservationExceeded).toBe(true);
    expect(outcome.underestimateUsdMicro).toBe(computeCost(usage, modelForRole("produce")).costUsdMicro! - start.reservedUsdMicro);
    expect(c.budget.spentUsdMicro).toBe(outcome.costUsdMicro); // the actual cost is what the ledger carries; the underestimate is recorded, never hidden
  });
  it("refuses a dispatch once the per-import deadline has passed", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" })]);
    const recorder = new MemoryRecorder();
    const late = { ...ctx(provider, recorder), budget: createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, CLOCK.getTime() - 1000) };
    expect(await callModel(req(), late)).toMatchObject({ kind: "budget_refused", limit: "elapsed" });
    expect(recorder.events).toEqual([]);
  });
  it("classifies max_tokens, refusal and context overflow as content errors and still records the outcome", async () => {
    const provider = new FakeProvider([fakeResponse({ stopReason: "max_tokens", outputText: "{\"ok\":" }), fakeResponse({ stopReason: "refusal", outputText: undefined }), fakeResponse({ stopReason: "model_context_window_exceeded", outputText: undefined })]);
    const recorder = new MemoryRecorder();
    const a = await callModel(req(), ctx(provider, recorder));
    expect(a).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/truncated/) });
    const b = await callModel(req(), ctx(provider, recorder));
    expect(b).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/refus/) });
    const c = await callModel(req(), ctx(provider, recorder));
    expect(c).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/context window/) });
    expect(outcomes(recorder).map((o) => o.status)).toEqual(["content_error", "content_error", "content_error"]);
  });
  it("records a missing usage as unavailable, never zero, and keeps the reservation as spent", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}", usage: null, rawUsage: null })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder);
    await callModel(req(), c);
    expect(outcomes(recorder)[0]).toMatchObject({ costUsdMicro: null, costStatus: "unavailable", inputTokens: null, reservationExceeded: false, underestimateUsdMicro: null });
    expect(c.budget.reservedUsdMicro).toBe(0);
    expect(c.budget.spentUsdMicro).toBe((recorder.events[0] as AttemptStart).reservedUsdMicro);
  });
  it("turns a transient provider error into transient_error carrying the provider's request id and retry-after, with an outcome record", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529, { requestId: "req_err", retryAfterMs: 2500 })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder);
    const r = await callModel(req(), c);
    expect(r).toMatchObject({ kind: "transient_error", providerRequestId: "req_err", retryAfterMs: 2500 });
    expect(outcomes(recorder)[0]).toMatchObject({ status: "transient_error", providerRequestId: "req_err", costStatus: "unavailable" });
    expect(c.budget.reservedUsdMicro).toBe(0);
  });
  it("refuses to dispatch when the reservation would exceed the budget, recording nothing and naming the limit", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" })]);
    const recorder = new MemoryRecorder();
    const r = await callModel(req(), ctx(provider, recorder, 10));
    expect(r).toMatchObject({ kind: "budget_refused", limit: "spend" });
    expect(recorder.events).toEqual([]);
    expect(provider.requests).toEqual([]);
  });
  it("records an attempt the adapter aborted at the deadline as a settled transient failure, timed by the injected clock", async () => {
    const base = Date.now();
    const deadlineMs = 150;
    // the SDK's per-request timeout stops covering the call once the headers arrive, so this body would outlive the deadline
    const create = (_params: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }) => new Promise<unknown>((resolve, reject) => {
      const body = setTimeout(() => resolve({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }] }), 2000);
      requestOptions?.signal?.addEventListener("abort", () => { clearTimeout(body); reject(new Error("The operation was aborted.")); }, { once: true });
    });
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    const recorder = new MemoryRecorder();
    const budget = createBudget({ usdMicro: 1e9, elapsedMs: deadlineMs }, base);
    const frozen = new Date(base);
    const result = await callModel(req(), { provider, recorder, budget, operationId: "op-1", callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, clock: () => frozen, ids: () => "att-late" });
    expect(result).toMatchObject({ kind: "transient_error", attemptId: "att-late" });
    const outcome = outcomes(recorder)[0]!;
    expect(outcome).toMatchObject({ status: "transient_error", costStatus: "unavailable", costUsdMicro: null, stopReason: null, completedAt: frozen.toISOString() });
    expect(outcome.error).toMatch(/aborted after \d+ ms, at the import's elapsed deadline at /);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(deadlineMs - 20); // the record is of a real attempt that ran to the deadline
    expect(outcome.latencyMs).toBeLessThan(1000);
    expect(budget.reservedUsdMicro).toBe(0); // settled: nothing stays reserved for an attempt that ended
    expect(budget.spentUsdMicro).toBe((recorder.events[0] as AttemptStart).reservedUsdMicro); // a possibly billed attempt is spent at its reservation
    expect(budget.requests).toBe(1);
  });
  it("accounts reservations across concurrent in-flight attempts", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" }), fakeResponse({ outputText: "{\"ok\":true}" })]);
    const perCall = reserve(createBudget({ usdMicro: 1e12 }, 0), req(), 0);
    if (!perCall.ok) throw new Error("unexpected");
    const c = ctx(provider, new MemoryRecorder(), Math.floor(perCall.reservedUsdMicro * 1.5));
    const [a, b] = await Promise.all([callModel(req(), { ...c, ids: () => "att-a" }), callModel(req(), { ...c, ids: () => "att-b" })]);
    expect([a.kind, b.kind].sort()).toEqual(["budget_refused", "ok"]);
  });
});
