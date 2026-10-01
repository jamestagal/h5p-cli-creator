import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/**
 * The pilot ledger (R6, R7): the paid runs the owner has authorised, each with an estimated spend cap, and the total
 * estimated cap they share. Caps are estimates — reservations and costs are estimated before a call — so a run is held
 * to its cap by estimate, and the actual bill can differ.
 */
export const LedgerRun = z.object({
  runId: z.string().trim().min(1),
  outDir: z.string().refine((p) => isAbsolute(p), { message: "outDir must be an absolute path" }),
  capUsd: z.number().positive(),
  authorisedBy: z.string().trim().min(1),
  authorisedOn: z.string().trim().min(1)
});
export const Ledger = z.object({ totalCapUsd: z.number().positive(), runs: z.array(LedgerRun) }).superRefine((ledger, ctx) => {
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

export type AuthorisationRule = "over-allocated" | "not-listed" | "out-dir-mismatch" | "budget-above-cap";
export type Authorisation = { ok: true; run: LedgerRun; capUsdMicro: number } | { ok: false; rule: AuthorisationRule; message: string };

const micro = (usd: number): number => Math.round(usd * 1_000_000);
const usd = (m: number): string => `$${(m / 1_000_000).toFixed(2)}`;

/**
 * Whether the ledger authorises this run, by its static allocation: the listed caps must fit the total (otherwise
 * every run is refused until the ledger is corrected), the run must be listed, write to the listed directory, and ask
 * for no more than its cap (a run that names no budget gets its cap). Pure: nothing is read or written.
 */
export function authoriseRun(ledger: Ledger, request: { runId: string; outDir: string; budgetUsd?: number | undefined }): Authorisation {
  const allocated = ledger.runs.reduce((sum, r) => sum + micro(r.capUsd), 0);
  if (allocated > micro(ledger.totalCapUsd)) return { ok: false, rule: "over-allocated", message: `the ledger's run caps add up to an estimated ${usd(allocated)}, above its estimated total cap of ${usd(micro(ledger.totalCapUsd))}; every run is refused until the ledger is corrected` };
  const run = ledger.runs.find((r) => r.runId === request.runId);
  if (!run) return { ok: false, rule: "not-listed", message: `run ${JSON.stringify(request.runId)} is not in the ledger; a paid run needs a ledger entry authorising it` };
  if (resolve(run.outDir) !== resolve(request.outDir)) return { ok: false, rule: "out-dir-mismatch", message: `run ${JSON.stringify(run.runId)} is authorised to write to ${run.outDir}, not ${resolve(request.outDir)}` };
  if (request.budgetUsd !== undefined && micro(request.budgetUsd) > micro(run.capUsd)) return { ok: false, rule: "budget-above-cap", message: `--budget-usd ${usd(micro(request.budgetUsd))} is above run ${JSON.stringify(run.runId)}'s estimated cap of ${usd(micro(run.capUsd))}` };
  return { ok: true, run, capUsdMicro: micro(run.capUsd) };
}
