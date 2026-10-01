import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/**
 * USD → µUSD for a cap or budget, or null when the value cannot be one: it must be a finite number above zero whose
 * conversion is a positive safe integer (so NaN, Infinity, 0, negatives, amounts below one µUSD and amounts too large to
 * count exactly are all refused). Every comparison against a cap uses this conversion; NaN would make them all false.
 */
export function toUsdMicro(usd: unknown): number | null {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
  const micro = Math.round(usd * 1_000_000);
  return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
}
const amount = (label: string) => z.number().refine((v) => toUsdMicro(v) !== null, { message: `${label} must be a positive amount in USD of at least $0.000001 that converts to a safe integer of µUSD` });

/**
 * The pilot ledger (R6, R7): the paid runs the owner has authorised, each with an estimated spend cap, and the total
 * estimated cap they share. Caps are estimates — reservations and costs are estimated before a call — so a run is held
 * to its cap by estimate, and the actual bill can differ.
 */
export const LedgerRun = z.object({
  runId: z.string().trim().min(1),
  outDir: z.string().refine((p) => isAbsolute(p), { message: "outDir must be an absolute path" }),
  capUsd: amount("capUsd"),
  authorisedBy: z.string().trim().min(1),
  authorisedOn: z.string().trim().min(1)
});
export const Ledger = z.object({ totalCapUsd: amount("totalCapUsd"), runs: z.array(LedgerRun) }).superRefine((ledger, ctx) => {
  const seen = (key: (r: z.infer<typeof LedgerRun>) => string, label: string) => {
    const keys = new Set<string>();
    ledger.runs.forEach((r, i) => {
      const k = key(r);
      if (keys.has(k)) ctx.addIssue({ code: "custom", path: ["runs", i], message: `${label} ${JSON.stringify(k)} appears more than once` });
      keys.add(k);
    });
  };
  seen((r) => r.runId, "runId");
  seen((r) => resolve(r.outDir), "outDir");
});
export type Ledger = z.infer<typeof Ledger>;
export type LedgerRun = z.infer<typeof LedgerRun>;

export class LedgerError extends Error {
  constructor(message: string) { super(message); this.name = "LedgerError"; }
}

/** Reads and validates the ledger file (JSON). Every problem is a LedgerError naming the file. */
export async function readLedger(path: string): Promise<Ledger> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, "utf8")); } catch (err) { throw new LedgerError(`ledger ${path} could not be read as JSON: ${err instanceof Error ? err.message : String(err)}`); }
  const parsed = Ledger.safeParse(raw);
  if (!parsed.success) throw new LedgerError(`ledger ${path} is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export type AuthorisationRule = "invalid-budget" | "over-allocated" | "not-listed" | "out-dir-mismatch" | "budget-above-cap";
export type Authorisation = { ok: true; run: LedgerRun; capUsdMicro: number } | { ok: false; rule: AuthorisationRule; message: string };

/** A ledger amount in µUSD; readLedger has already checked it converts. */
const micro = (usd: number): number => {
  const m = toUsdMicro(usd);
  if (m === null) throw new LedgerError(`ledger amount ${String(usd)} is not a valid cap; read ledgers with readLedger`);
  return m;
};
const usd = (m: number): string => `$${(m / 1_000_000).toFixed(2)}`;

/**
 * Whether the ledger authorises this run, by its static allocation: the listed caps must fit the total (otherwise
 * every run is refused until the ledger is corrected), the run must be listed, write to the listed directory, and ask
 * for no more than its cap (a run that names no budget gets its cap). Pure: nothing is read or written.
 */
export function authoriseRun(ledger: Ledger, request: { runId: string; outDir: string; budgetUsd?: number | undefined }): Authorisation {
  const requested = request.budgetUsd === undefined ? undefined : toUsdMicro(request.budgetUsd);
  if (requested === null) return { ok: false, rule: "invalid-budget", message: `--budget-usd ${String(request.budgetUsd)} is not a valid estimated budget: give a positive amount in USD of at least $0.000001` };
  const allocated = ledger.runs.reduce((sum, r) => sum + micro(r.capUsd), 0);
  if (!Number.isSafeInteger(allocated) || allocated > micro(ledger.totalCapUsd)) return { ok: false, rule: "over-allocated", message: `the ledger's run caps add up to an estimated ${usd(allocated)}, above its estimated total cap of ${usd(micro(ledger.totalCapUsd))}; every run is refused until the ledger is corrected` };
  const run = ledger.runs.find((r) => r.runId === request.runId);
  if (!run) return { ok: false, rule: "not-listed", message: `run ${JSON.stringify(request.runId)} is not in the ledger; a paid run needs a ledger entry authorising it` };
  if (resolve(run.outDir) !== resolve(request.outDir)) return { ok: false, rule: "out-dir-mismatch", message: `run ${JSON.stringify(run.runId)} is authorised to write to ${run.outDir}, not ${resolve(request.outDir)}` };
  if (requested !== undefined && requested > micro(run.capUsd)) return { ok: false, rule: "budget-above-cap", message: `--budget-usd ${usd(requested)} is above run ${JSON.stringify(run.runId)}'s estimated cap of ${usd(micro(run.capUsd))}` };
  return { ok: true, run, capUsdMicro: micro(run.capUsd) };
}
