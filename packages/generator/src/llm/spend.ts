import type { AttemptEvent, AttemptOutcome } from "./types.js";

/**
 * Estimated spend recorded in an import's attempt ledger, in µUSD: for every attempt start, its outcome's cost, or its
 * reservation when there is no outcome (an interrupted attempt) or the outcome's cost is unknown. This is phase 2's
 * accounting (settle keeps the reservation when the actual cost is unknown; resume reconciliation treats an orphan
 * start the same way), read from the attempt records alone, never from cost.json.
 */
export function spendFromAttempts(attempts: AttemptEvent[]): number {
  const outcomes = new Map(attempts.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  let spent = 0;
  for (const e of attempts) if (e.event === "start") spent += outcomes.get(e.attemptId)?.costUsdMicro ?? e.reservedUsdMicro;
  return spent;
}
