import { applicable, DIMENSIONS, type Dimension, type DimensionScore, type Finding, type ScoreDecision } from "@leaplearn/shared";

/**
 * R2: for every applicable dimension, the row's score must equal the lowest score among that dimension's findings, or 2
 * when it has none. Returns one problem per dimension that breaks this, naming the dimension; [] when every dimension
 * agrees. Findings on a dimension that does not apply are reported by the import's own check, not here.
 */
export function activityScoreProblems(scores: Record<Dimension, DimensionScore>, findings: Finding[], type: string, hasUnit: boolean): string[] {
  const problems: string[] = [];
  for (const d of DIMENSIONS) {
    if (!applicable(d, type, hasUnit)) continue;
    const score = scores[d];
    if (score === "na") continue; // reported as "na on an applicable dimension" by the import
    const own = findings.filter((f) => f.dimension === d).map((f) => f.score);
    if (own.length === 0) {
      if (score !== 2) problems.push(`${d} is ${score} but has no finding; every 0 or 1 needs a finding naming the item and the reason`);
      continue;
    }
    const lowest = Math.min(...own);
    if (lowest < score) problems.push(`${d} is ${score} but a finding scores it ${lowest}; the activity's score is the lowest of its findings`);
    else if (lowest > score) problems.push(`${d} is ${score} but its lowest finding is ${lowest}; the activity's score is the lowest of its findings`);
  }
  return problems;
}

/**
 * The derived decision (design §5), exhaustive and total: any applicable dimension at 0 → rejected; otherwise any at 1
 * → needs-revision; otherwise accepted. Dimensions that do not apply are ignored whatever they hold.
 */
export function deriveDecision(scores: Record<Dimension, DimensionScore>, type: string, hasUnit: boolean): ScoreDecision {
  const applied = DIMENSIONS.filter((d) => applicable(d, type, hasUnit)).map((d) => scores[d]);
  if (applied.includes(0)) return "rejected";
  if (applied.includes(1)) return "needs-revision";
  return "accepted";
}
