import { resolve } from "node:path";
import { createRegistry, engineIdentity } from "@leaplearn/engine";
import { isStoreVersionError, regenerateActivity, RegenerateRefused, StoreLockedError, toUsdMicro, type ModelProvider } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { authorisePaidRun, importIdFor, providerFor } from "./generate.js";
import { writeReportsLocked } from "./report.js";

export interface RegenerateArgs {
  out: string; activity: string; note?: string; libraries: string;
  provider: "anthropic" | "replay" | "record"; fixtures?: string;
  /** The pilot ledger and the run in it; required when the provider can make paid calls (anthropic, record). */
  ledger?: string; run?: string;
  /** An estimated spend cap for this command. It can only lower the cap in force: the effective cap is the lowest of the import's, the ledger run's and this. */
  budgetUsd?: number;
}

/** Test seam, as for generate: a provider in place of the one --provider names, only on a ledger-checked path. */
export interface RegenerateDeps { provider?: ModelProvider }

/**
 * `leap regenerate --out <dir> --activity <id> [--note "<text>"] [--ledger --run]` (design §6, plan Task 13). Paid
 * providers pass the ledger checks before anything is appended. Exits 0 when the request succeeded, 1 when it was
 * refused or failed (the failure is recorded and counts towards the activity's two requests), or did not finish (it
 * stays running and a rerun finishes it).
 */
export async function regenerate(args: RegenerateArgs, io: { out: (s: string) => void; err: (s: string) => void }, deps: RegenerateDeps = {}): Promise<number> {
  const outDir = resolve(args.out);
  try { await FileStore.assertWritableAt(outDir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  if (args.budgetUsd !== undefined && toUsdMicro(args.budgetUsd) === null) { io.err(`leap: --budget-usd ${String(args.budgetUsd)} is not a valid estimated budget: give a positive amount in USD of at least $0.000001\n`); return 1; }
  const ledgerChecked = args.provider === "anthropic" || args.provider === "record";
  if (deps.provider && !ledgerChecked) throw new Error(`a provider can be injected only with --provider anthropic or record, where the ledger applies; not with --provider ${args.provider}`);
  let usdMicro = args.budgetUsd === undefined ? undefined : toUsdMicro(args.budgetUsd)!;
  if (ledgerChecked) {
    const paid = await authorisePaidRun(args, outDir); // before any request is appended
    if (!paid.ok) { io.err(`leap: ${paid.message}\n`); return 1; }
    usdMicro = paid.budgetUsdMicro;
  }
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const registry = await createRegistry({ lockPath: resolve(args.libraries, "libraries.lock.json"), cacheDir: resolve(args.libraries, "cache") });
  const identity = await engineIdentity(resolve(args.libraries));
  let outcome;
  try {
    outcome = await regenerateActivity(
      { importId, activityId: args.activity, ...(args.note !== undefined ? { note: args.note } : {}), ...(usdMicro !== undefined ? { budget: { usdMicro } } : {}) },
      { store, provider: deps.provider ?? providerFor(args), registry, engineIdentity: identity }
    );
  } catch (err) {
    if (err instanceof RegenerateRefused || err instanceof StoreLockedError || isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; }
    // Any other error leaves a started request running: say so, and how it is finished, rather than only a stack trace.
    const running = (await store.listRegenerations(importId).catch(() => [])).find((r) => r.activityId === args.activity && r.status === "running");
    if (!running) throw err;
    io.err(`leap: request ${running.requestId} did not finish (${err instanceof Error ? err.message : String(err)}); it stays running and already counts towards the activity's two, so finishing it does not use another. Rerun leap regenerate --activity ${args.activity} with no --note to finish it; any model calls it still needs are charged to the import's budgets. Until it finishes, the activity may point at revision ${running.baseRevision} or, if publication completed before the error, at revision ${running.targetRevision}\n`);
    return 1;
  }
  const { request, resumed } = outcome;
  const verb = resumed ? "finished interrupted request" : "request";
  if (request.status === "succeeded") io.out(`${verb} ${request.requestId}: revision ${request.targetRevision} of ${request.activityId} is promoted and needs its own review\n`);
  else io.err(`leap: ${verb} ${request.requestId} failed (${request.outcome}); revision ${request.baseRevision} stays current, and the request counts towards the activity's two\n`);
  try { await writeReportsLocked(store, importId, outDir); } catch (err) { if (!(err instanceof StoreLockedError)) throw err; }
  return request.status === "succeeded" ? 0 : 1;
}
