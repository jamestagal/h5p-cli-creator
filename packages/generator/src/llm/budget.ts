import { reservationCost, reserveInputTokens } from "./cost.js";
import type { ModelRequest } from "./types.js";

/** Spec §4 imports.budget: requests, tokens, seconds, spend. Spend is USD micro; time is milliseconds. */
export interface BudgetLimits { usdMicro: number; requests: number; tokens: number; elapsedMs: number; }
export const DEFAULT_BUDGET_LIMITS: Omit<BudgetLimits, "usdMicro"> = { requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 };
export type BudgetLimitName = "spend" | "requests" | "tokens" | "elapsed";

export interface Budget {
  limits: BudgetLimits;
  /** Epoch ms this run started. */
  startedAtMs: number;
  /** Elapsed time earlier runs of the same import already used (from the import record). */
  elapsedBeforeMs: number;
  /** Absolute epoch ms after which nothing may be dispatched or waited for: startedAtMs + (limit − elapsedBeforeMs). */
  deadlineMs: number;
  reservedUsdMicro: number;
  spentUsdMicro: number;
  reservedTokens: number;
  spentTokens: number;
  /** Attempts reserved so far, never decremented: a refused attempt is not counted, a failed one is. */
  requests: number;
}

export function createBudget(limits: { usdMicro: number } & Partial<BudgetLimits>, startedAtMs = Date.now(), elapsedBeforeMs = 0): Budget {
  const full = { ...DEFAULT_BUDGET_LIMITS, ...limits };
  return { limits: full, startedAtMs, elapsedBeforeMs, deadlineMs: startedAtMs + Math.max(0, full.elapsedMs - elapsedBeforeMs), reservedUsdMicro: 0, spentUsdMicro: 0, reservedTokens: 0, spentTokens: 0, requests: 0 };
}

export function remainingMs(budget: Budget, nowMs = Date.now()): number {
  return Math.max(0, budget.deadlineMs - nowMs);
}

export type Reservation =
  | { ok: true; reservedUsdMicro: number; reservedInputTokens: number; reservedOutputTokens: number }
  | { ok: false; limit: BudgetLimitName; reason: string };

/** Reserves the attempt's estimated spend and tokens against the caps and checks the hard request and deadline limits, in one synchronous step (no await between check and update). */
export function reserve(budget: Budget, request: ModelRequest, nowMs = Date.now()): Reservation {
  const reservedInputTokens = reserveInputTokens(request);
  const reservedOutputTokens = request.maxOutputTokens;
  const reservedUsdMicro = reservationCost(request.model, reservedInputTokens, reservedOutputTokens);
  const tokens = reservedInputTokens + reservedOutputTokens;
  if (nowMs >= budget.deadlineMs) return { ok: false, limit: "elapsed", reason: `budget: the elapsed-time limit of ${budget.limits.elapsedMs} ms for this import has passed (${budget.elapsedBeforeMs} ms used by earlier runs)` };
  if (budget.requests + 1 > budget.limits.requests) return { ok: false, limit: "requests", reason: `budget: request ${budget.requests + 1} would exceed the limit of ${budget.limits.requests} requests` };
  const projectedTokens = budget.spentTokens + budget.reservedTokens + tokens;
  if (projectedTokens > budget.limits.tokens) return { ok: false, limit: "tokens", reason: `budget: reserving ${tokens} tokens would bring the import to ${projectedTokens} tokens, above the limit of ${budget.limits.tokens}` };
  const projectedUsd = budget.spentUsdMicro + budget.reservedUsdMicro + reservedUsdMicro;
  if (projectedUsd > budget.limits.usdMicro) return { ok: false, limit: "spend", reason: `budget: reserving ${reservedUsdMicro} µUSD would bring the import to ${projectedUsd} µUSD of spend, above the limit of ${budget.limits.usdMicro} µUSD` };
  budget.requests += 1;
  budget.reservedUsdMicro += reservedUsdMicro;
  budget.reservedTokens += tokens;
  return { ok: true, reservedUsdMicro, reservedInputTokens, reservedOutputTokens };
}

/** Replaces a reservation with the actual cost and tokens; an unknown value keeps the reservation as spent so an unbilled-looking attempt never frees budget. */
export function settle(budget: Budget, reservation: { reservedUsdMicro: number; reservedInputTokens: number; reservedOutputTokens: number }, actual: { costUsdMicro: number | null; tokens: number | null }): void {
  const reservedTokens = reservation.reservedInputTokens + reservation.reservedOutputTokens;
  budget.reservedUsdMicro -= reservation.reservedUsdMicro;
  budget.spentUsdMicro += actual.costUsdMicro ?? reservation.reservedUsdMicro;
  budget.reservedTokens -= reservedTokens;
  budget.spentTokens += actual.tokens ?? reservedTokens;
}

export function budgetSnapshot(budget: Budget, nowMs = Date.now()): { spentUsdMicro: number; reservedUsdMicro: number; spentTokens: number; requests: number; elapsedMs: number } {
  return { spentUsdMicro: budget.spentUsdMicro, reservedUsdMicro: budget.reservedUsdMicro, spentTokens: budget.spentTokens, requests: budget.requests, elapsedMs: budget.elapsedBeforeMs + Math.max(0, nowMs - budget.startedAtMs) };
}
