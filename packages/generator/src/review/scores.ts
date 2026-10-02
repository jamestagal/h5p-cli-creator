import type { ScoreRecord } from "../store/types.js";

/**
 * The scored review that counts for one build of one revision: the latest record for exactly that
 * `(activityId, revision, buildId)`, by `(sequence, rowIndex)` (R8), or null when it has none. A review of another build
 * of the same revision does not count for this one (C3). Append order is never used.
 */
export function countedScore(scores: ScoreRecord[], activityId: string, revision: number, buildId: string): ScoreRecord | null {
  let latest: ScoreRecord | null = null;
  for (const s of scores) {
    if (s.activityId !== activityId || s.revision !== revision || s.buildId !== buildId) continue;
    if (!latest || s.sequence > latest.sequence || (s.sequence === latest.sequence && s.rowIndex > latest.rowIndex)) latest = s;
  }
  return latest;
}
