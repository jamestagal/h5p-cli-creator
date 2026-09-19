import { describe, it, expect } from "vitest";
import { z } from "zod";
import { budgetSnapshot, createBudget, DEFAULT_BUDGET_LIMITS, remainingMs, reserve, settle } from "../src/llm/budget.js";
import { reservationCost, reserveInputTokens } from "../src/llm/cost.js";
import { modelForRole } from "../src/llm/models.js";
import { toProviderSchema } from "../src/llm/schema.js";
import type { ModelRequest } from "../src/llm/types.js";

const req = (): ModelRequest => ({ purpose: "produce", model: modelForRole("produce"), system: "s".repeat(2000), user: "u".repeat(2000), maxOutputTokens: 1000, outputSchema: toProviderSchema(z.object({ ok: z.boolean() })) });

describe("budget", () => {
  it("reserves the estimate for the whole request and settles to the actual cost and tokens", () => {
    const b = createBudget({ usdMicro: 100_000_000 }, 0);
    const r = reserve(b, req(), 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.reservedInputTokens).toBe(reserveInputTokens(req()));
    expect(r.reservedOutputTokens).toBe(1000);
    expect(r.reservedUsdMicro).toBe(reservationCost(modelForRole("produce"), r.reservedInputTokens, 1000));
    expect(b).toMatchObject({ requests: 1, reservedUsdMicro: r.reservedUsdMicro, reservedTokens: r.reservedInputTokens + 1000, spentUsdMicro: 0 });
    settle(b, r, { costUsdMicro: 123, tokens: 456 });
    expect(budgetSnapshot(b, 500)).toEqual({ spentUsdMicro: 123, reservedUsdMicro: 0, spentTokens: 456, requests: 1, elapsedMs: 500 });
    expect(b.limits).toEqual({ usdMicro: 100_000_000, ...DEFAULT_BUDGET_LIMITS });
    expect(b.deadlineMs).toBe(DEFAULT_BUDGET_LIMITS.elapsedMs);
  });
  it("treats elapsed time as a per-import deadline that carries over from earlier runs", () => {
    const resumed = createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 5000, 800); // 800 ms already used by earlier runs
    expect(resumed.deadlineMs).toBe(5200);
    expect(remainingMs(resumed, 5150)).toBe(50);
    expect(reserve(resumed, req(), 5150).ok).toBe(true);
    expect(reserve(resumed, req(), 5200)).toMatchObject({ ok: false, limit: "elapsed" });
    expect(budgetSnapshot(resumed, 5100).elapsedMs).toBe(900);
    expect(remainingMs(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0, 1000), 0)).toBe(0);
  });
  it("refuses each of the four limits by name, changing nothing", () => {
    const spend = createBudget({ usdMicro: 1 }, 0);
    expect(reserve(spend, req(), 0)).toMatchObject({ ok: false, limit: "spend", reason: expect.stringMatching(/spend/) });
    expect(spend).toMatchObject({ requests: 0, reservedUsdMicro: 0, reservedTokens: 0 });
    expect(reserve(createBudget({ usdMicro: 1e9, requests: 0 }, 0), req(), 0)).toMatchObject({ ok: false, limit: "requests" });
    expect(reserve(createBudget({ usdMicro: 1e9, tokens: 10 }, 0), req(), 0)).toMatchObject({ ok: false, limit: "tokens" });
    expect(reserve(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0), req(), 5000)).toMatchObject({ ok: false, limit: "elapsed" });
    expect(reserve(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0), req(), 999).ok).toBe(true);
  });
  it("counts an unknown cost or token count at the reservation and never frees it", () => {
    const b = createBudget({ usdMicro: 1e9 }, 0);
    const r = reserve(b, req(), 0);
    if (!r.ok) throw new Error(r.reason);
    settle(b, r, { costUsdMicro: null, tokens: null });
    expect(b).toMatchObject({ reservedUsdMicro: 0, spentUsdMicro: r.reservedUsdMicro, reservedTokens: 0, spentTokens: r.reservedInputTokens + r.reservedOutputTokens });
  });
  it("refuses a second in-flight reservation that would cross the cap, so concurrent callers cannot both squeeze in", () => {
    const probe = reserve(createBudget({ usdMicro: 1e12 }, 0), req(), 0);
    if (!probe.ok) throw new Error(probe.reason);
    const b = createBudget({ usdMicro: Math.floor(probe.reservedUsdMicro * 1.5) }, 0);
    expect(reserve(b, req(), 0).ok).toBe(true);
    expect(reserve(b, req(), 0)).toMatchObject({ ok: false, limit: "spend" });
    expect(b.requests).toBe(1);
  });
});
