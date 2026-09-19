import type { ModelId } from "./models.js";

export interface ModelRates {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
}

/**
 * USD per million tokens. Update `version` and `effectiveDate` together whenever a rate changes;
 * every cost row records the version it was computed with.
 */
export const PRICING = {
  version: "2026-09-19",
  effectiveDate: "2026-09-19",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  models: {
    "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10, cacheWrite5mPerMTok: 2.5, cacheWrite1hPerMTok: 4, cacheReadPerMTok: 0.2 },
    "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5, cacheWrite5mPerMTok: 1.25, cacheWrite1hPerMTok: 2, cacheReadPerMTok: 0.1 }
  } as Record<ModelId, ModelRates>
} as const;
