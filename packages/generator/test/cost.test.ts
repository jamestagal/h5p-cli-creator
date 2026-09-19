import { describe, it, expect } from "vitest";
import { computeCost, estimateInputTokens, reservationCost, reserveInputTokens, RESERVATION_TOKENS_PER_CHAR, STRUCTURED_OUTPUT_OVERHEAD_TOKENS } from "../src/llm/cost.js";
import { PRICING } from "../src/llm/pricing.js";
import { MODEL_ROLES, modelForRole, requestProfile } from "../src/llm/models.js";

describe("cost", () => {
  it("prices every token class from the versioned table, in USD micro-units", () => {
    const model = modelForRole("produce");
    const rates = PRICING.models[model]!;
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    const cost = computeCost(usage, model);
    const expected = Math.round((rates.inputPerMTok + rates.outputPerMTok + rates.cacheReadPerMTok + rates.cacheWrite5mPerMTok) * 1_000_000);
    expect(cost).toEqual({ costUsdMicro: expected, costStatus: "known", pricingVersion: PRICING.version });
  });
  it("rounds to the nearest micro-dollar for small usage", () => {
    const model = modelForRole("extract");
    const cost = computeCost({ inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model);
    expect(cost.costUsdMicro).toBe(Math.round(PRICING.models[model]!.inputPerMTok));
  });
  it("prices reserved token counts at the dearest input class, so a correct count can never under-reserve", () => {
    const model = modelForRole("produce");
    const reserved = reservationCost(model, 10_000, 100);
    const splits = [
      { inputTokens: 10_000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { inputTokens: 0, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 10_000 },
      { inputTokens: 0, outputTokens: 100, cacheReadTokens: 10_000, cacheWriteTokens: 0 },
      { inputTokens: 4_000, outputTokens: 100, cacheReadTokens: 3_000, cacheWriteTokens: 3_000 }
    ];
    for (const usage of splits) expect(computeCost(usage, model).costUsdMicro!).toBeLessThanOrEqual(reserved);
    expect(reserved).toBe(computeCost(splits[1]!, model).costUsdMicro); // the cache-write split is the ceiling, exactly
  });
  it("reserves input tokens for the whole request, schema included, above the sizing estimate", () => {
    const request = { system: "s".repeat(1000), cachedContext: "c".repeat(1000), user: "u".repeat(1000), outputSchema: { type: "object", properties: { a: { type: "string" } } } };
    const schemaChars = JSON.stringify(request.outputSchema).length;
    expect(reserveInputTokens(request)).toBe(Math.ceil((3000 + schemaChars) * RESERVATION_TOKENS_PER_CHAR) + STRUCTURED_OUTPUT_OVERHEAD_TOKENS);
    expect(reserveInputTokens(request)).toBeGreaterThan(estimateInputTokens(request.system + request.cachedContext + request.user));
  });
  it("has a request profile for every model a role names", () => {
    for (const model of new Set(Object.values(MODEL_ROLES))) expect(requestProfile(model)).toBeDefined();
    expect(requestProfile("claude-sonnet-5")).toEqual({ temperature: null, thinking: { type: "disabled" } });
    expect(requestProfile("claude-haiku-4-5-20251001")).toEqual({ temperature: 0, thinking: null });
    expect(() => requestProfile("claude-unknown")).toThrow(/no request profile/);
  });
  it("never records zero for missing usage", () => {
    expect(computeCost(null, modelForRole("produce"))).toEqual({ costUsdMicro: null, costStatus: "unavailable", pricingVersion: PRICING.version });
  });
  it("refuses an unpriced model", () => {
    expect(() => computeCost({ inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, "claude-unknown")).toThrow(/no pricing/);
  });
  it("pricing table carries provenance", () => {
    expect(PRICING.source).toMatch(/^https:\/\/platform\.claude\.com\//);
    expect(PRICING.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const role of ["parseUnit", "extract", "merge", "align", "plan", "produce"] as const) expect(PRICING.models[modelForRole(role)]).toBeDefined();
  });
});
