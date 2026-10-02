/** The rubric every score is recorded against (design §5). A change to a dimension or its applicability is a new version. */
export const RUBRIC_VERSION = "r1";

/** The rubric's dimensions, in the order the sheet and scores.csv list them. */
export const DIMENSIONS = ["correctness", "support", "distractors", "mapping", "usefulness"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The decision derived from a review's scores. Only `accepted` counts as accepted, anywhere. */
export const SCORE_DECISIONS = ["accepted", "needs-revision", "rejected"] as const;
export type ScoreDecision = (typeof SCORE_DECISIONS)[number];

/** A score on one dimension: 0, 1 or 2 where the dimension applies, `na` where it does not. */
export type DimensionScore = 0 | 1 | 2 | "na";

/** One failing item on one dimension (R2): every 0 or 1 names the items it applies to and why. */
export interface Finding { dimension: Dimension; itemId: string; score: 0 | 1; reason: string }

/**
 * Whether a dimension is scored for an activity (design §5): distractors only on multiChoice, mapping only when the
 * import has a unit. Every other dimension always applies.
 */
export function applicable(dimension: Dimension, type: string, hasUnit: boolean): boolean {
  if (dimension === "distractors") return type === "multiChoice";
  if (dimension === "mapping") return hasUnit;
  return true;
}
