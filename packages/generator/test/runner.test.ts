import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createRunner, ContentFailure, BudgetRefused, InfrastructureFailure, RunStopped, FEEDBACK_HEADER } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget } from "../src/llm/budget.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptStart) { this.events.push(e); } async recordOutcome(e: AttemptOutcome) { this.events.push(e); } }
const starts = (r: { events: AttemptEvent[] }) => r.events.filter((e): e is AttemptStart => e.event === "start");
const outcomes = (r: { events: AttemptEvent[] }) => r.events.filter((e): e is AttemptOutcome => e.event === "outcome");
const Out = z.object({ n: z.number() });
const call = (verify?: (v: { n: number }) => string[]) => ({ key: "produce:act-1", request: { purpose: "produce" as const, model: modelForRole("produce"), system: "s", user: "u", maxOutputTokens: 100, outputSchema: toProviderSchema(Out) }, schema: Out, ...(verify ? { verify } : {}) });
type RunnerOptions = Parameters<typeof createRunner>[0];
/** Budgets start now (the real clock the runner uses), so the elapsed deadline is ahead of every test. */
const mk = (provider: FakeProvider, recorder: AttemptRecorder = new MemoryRecorder(), extra: Partial<RunnerOptions> = {}) => createRunner({ provider, recorder, budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op", sleep: async () => undefined, ...extra });

describe("stage runner", () => {
  it("feeds schema and verify failures back and succeeds within three content attempts, numbering the retries", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":\"x\"}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":3}" })]);
    const recorder = new MemoryRecorder();
    const result = await mk(provider, recorder).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])));
    expect(result).toMatchObject({ value: { n: 3 }, attempts: 3 });
    expect(provider.requests[1]?.user).toContain(FEEDBACK_HEADER);
    expect(provider.requests[2]?.user).toContain("n must be positive");
    expect(provider.requests[2]?.user).not.toContain("Invalid input"); // only the latest reasons are fed back
    expect(outcomes(recorder)).toHaveLength(3);
    expect(starts(recorder).map((s) => [s.callKey, s.retryIndex, s.retryReason, s.attempt])).toEqual([["produce:act-1", 0, null, 1], ["produce:act-1", 1, "content", 2], ["produce:act-1", 2, "content", 3]]);
  });
  it("fails as ContentFailure after the third rejected attempt, carrying every reason", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":9}" })]);
    const rejection = mk(provider).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])));
    await expect(rejection).rejects.toBeInstanceOf(ContentFailure);
    await expect(rejection).rejects.toMatchObject({ name: "ContentFailure", attempts: 3 });
    expect(provider.requests).toHaveLength(3);
  });
  it("retries a transient failure as a new metered attempt: two starts, two outcomes, two reservations, one content attempt", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const recorder = new MemoryRecorder();
    const budget = createBudget({ usdMicro: 10_000_000 });
    const result = await mk(provider, recorder, { budget }).run(call());
    expect(result.attempts).toBe(1);
    expect(starts(recorder)).toHaveLength(2);
    expect(outcomes(recorder).map((o) => o.status)).toEqual(["transient_error", "ok"]);
    expect(starts(recorder).map((s) => [s.retryIndex, s.retryReason, s.attempt])).toEqual([[0, null, 1], [1, "transient", 1]]);
    for (const s of starts(recorder)) expect(s.reservedUsdMicro).toBeGreaterThan(0);
    expect(budget.requests).toBe(2);
    expect(budget.reservedUsdMicro).toBe(0);
    expect(budget.spentUsdMicro).toBeGreaterThanOrEqual(starts(recorder)[0]!.reservedUsdMicro); // the failed attempt keeps its reservation as spent
  });
  it("waits with backoff, honouring the provider's retry-after when it is longer, and gives up after three transient failures in a row", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const provider = new FakeProvider([new ProviderError("busy", "transient", 429, { retryAfterMs: 2500 }), new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    await mk(provider, new MemoryRecorder(), { sleep }).run(call());
    expect(waits).toEqual([2500, 2000]);
    const dead = new FakeProvider(Array.from({ length: 4 }, () => new ProviderError("down", "transient", 503)));
    await expect(mk(dead).run(call())).rejects.toBeInstanceOf(InfrastructureFailure);
    expect(dead.requests).toHaveLength(4);
  });
  it("does not dispatch a retry once the import has been stopped, and does not sleep past the deadline", async () => {
    let stopped: string | null = null;
    const provider = new FakeProvider([new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const sleep = async () => { stopped = "budget: another lane hit the request limit"; };
    await expect(mk(provider, new MemoryRecorder(), { sleep, stop: () => stopped }).run(call())).rejects.toMatchObject({ name: "RunStopped", message: expect.stringMatching(/another lane/) });
    expect(provider.requests).toHaveLength(1); // the retry after the wait was not dispatched
    await expect(mk(new FakeProvider([]), new MemoryRecorder(), { stop: () => "system: storage failed" }).run(call())).rejects.toBeInstanceOf(RunStopped);
    const nearDeadline = createBudget({ usdMicro: 10_000_000, elapsedMs: 500 });
    const slow = new FakeProvider([new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const deadlineRejection = mk(slow, new MemoryRecorder(), { budget: nearDeadline }).run(call());
    await expect(deadlineRejection).rejects.toBeInstanceOf(BudgetRefused);
    await expect(deadlineRejection).rejects.toMatchObject({ name: "BudgetRefused", limit: "elapsed" }); // a 1 s backoff would pass the 500 ms deadline
    expect(slow.requests).toHaveLength(1);
  });
  it("numbers a resumed call's first attempt after the attempts already in the ledger", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]);
    const recorder = new MemoryRecorder();
    await mk(provider, recorder, { priorAttempts: (key) => (key === "produce:act-1" ? 2 : 0) }).run(call());
    expect(starts(recorder)[0]).toMatchObject({ retryIndex: 2, retryReason: "resume", attempt: 1 });
  });
  it("stops on a permanent provider failure and on a budget refusal without regeneration", async () => {
    await expect(mk(new FakeProvider([new ProviderError("bad key", "permanent", 401, { requestId: "req_401" })])).run(call())).rejects.toMatchObject({ name: "InfrastructureFailure", message: expect.stringMatching(/req_401/) });
    const runner = createRunner({ provider: new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]), recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 1 }), operationId: "op", sleep: async () => undefined });
    await expect(runner.run(call())).rejects.toMatchObject({ name: "BudgetRefused", limit: "spend" });
  });
  it("treats a recorder throw as an infrastructure failure without retrying: a recordOutcome failure ends the run after exactly one dispatch", async () => {
    let outcomeCalls = 0;
    class ThrowingOutcomeRecorder implements AttemptRecorder {
      events: AttemptEvent[] = [];
      async recordStart(e: AttemptStart) { this.events.push(e); }
      async recordOutcome(e: AttemptOutcome) {
        outcomeCalls += 1;
        if (outcomeCalls === 1) throw new Error("ledger append failed");
        this.events.push(e);
      }
    }
    const recorder = new ThrowingOutcomeRecorder();
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]);
    await expect(mk(provider, recorder).run(call())).rejects.toBeInstanceOf(InfrastructureFailure);
    expect(starts(recorder)).toHaveLength(1);
    expect(provider.requests).toHaveLength(1);
  });
});
