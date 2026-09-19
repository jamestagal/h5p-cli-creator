import type { CostStatus, GenerationUsage } from "@leaplearn/shared";
import { PRICING, type ModelRates } from "./pricing.js";

export interface CostResult { costUsdMicro: number | null; costStatus: CostStatus; pricingVersion: string; }

/** Cache writes are priced at the 5-minute rate: the adapter only ever requests 5-minute caching. */
export function computeCost(usage: GenerationUsage | null, model: string): CostResult {
  const rates = (PRICING.models as Record<string, ModelRates | undefined>)[model];
  if (!rates) throw new Error(`no pricing for model ${model} (pricing version ${PRICING.version})`);
  if (!usage) return { costUsdMicro: null, costStatus: "unavailable", pricingVersion: PRICING.version };

  const usd = (usage.inputTokens * rates.inputPerMTok + usage.outputTokens * rates.outputPerMTok + usage.cacheReadTokens * rates.cacheReadPerMTok + usage.cacheWriteTokens * rates.cacheWrite5mPerMTok) / 1_000_000;
  return { costUsdMicro: Math.round(usd * 1_000_000), costStatus: "known", pricingVersion: PRICING.version };
}

/** Sizing estimate for chunking prompts to a working size; never used for a reservation. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Reservation estimate for the spend and token caps. 0.5 tokens per character and the overhead
 * allowance are calibration constants, not a proven bound: no local tokenizer exists for Sonnet 5,
 * and uploaded text, other languages or code may tokenise more densely. Every outcome records
 * whether and by how much the actual usage exceeded the reservation (Task 4) and the report and
 * demo total the underestimate (Tasks 15, 17); the count_tokens endpoint is the exact alternative
 * when that underestimate matters (one extra request per attempt).
 */
export const RESERVATION_TOKENS_PER_CHAR = 0.5;
export const STRUCTURED_OUTPUT_OVERHEAD_TOKENS = 500;

export interface ReservableRequest { system: string; cachedContext?: string; user: string; outputSchema: Record<string, unknown>; }

export function reserveInputTokens(request: ReservableRequest): number {
  const characters = request.system.length + (request.cachedContext?.length ?? 0) + request.user.length + JSON.stringify(request.outputSchema).length;
  return Math.ceil(characters * RESERVATION_TOKENS_PER_CHAR) + STRUCTURED_OUTPUT_OVERHEAD_TOKENS;
}

/** The most the attempt can cost for the reserved token counts: every input token at the 5-minute cache-write rate (the dearest input category the adapter can incur), every output token at the output rate. USD/MTok × tokens is exactly µUSD. The counts themselves are estimates (see above). */
export function reservationCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = (PRICING.models as Record<string, ModelRates | undefined>)[model];
  if (!rates) throw new Error(`no pricing for model ${model} (pricing version ${PRICING.version})`);
  return Math.ceil(inputTokens * rates.cacheWrite5mPerMTok + outputTokens * rates.outputPerMTok);
}
