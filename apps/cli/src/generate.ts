import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createRegistry, engineIdentity } from "@leaplearn/engine";
import { ANTHROPIC_TIMEOUT_MS, authoriseRun, toUsdMicro, createAnthropicProvider, IncompatibleResumeError, isStoreVersionError, LedgerError, OriginalSourceError, readLedger, ReplayProvider, RecordingProvider, runImport, spendFromAttempts, READING_LEVEL_IDS, StoreLockedError, TONE_IDS, type ImportRecord, type ModelProvider, type PlannedType, type ReadingLevel, type Tone } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { formatCostReport, writeReportsLocked } from "./report.js";
import { loadSource, UnsupportedSourceError, warningSummary } from "./source.js";

export interface GenerateArgs {
  source: string; out: string; unit?: string; types: string; maxRequests: number; maxTokens: number; maxSeconds: number;
  /** The per-import estimated spend cap. Defaults to the run's ledger cap for a paid run, and to DEFAULT_BUDGET_USD otherwise. */
  budgetUsd?: number;
  language: string; readingLevel: string; tone: string; customisation?: string; name?: string; libraries: string;
  provider: "anthropic" | "replay" | "record"; fixtures?: string; concurrency: number;
  /** The pilot ledger and the run in it; required when the provider can make paid calls (anthropic, record). */
  ledger?: string; run?: string;
}

/** The per-import estimated spend cap of a run with no ledger (replay), in USD. */
export const DEFAULT_BUDGET_USD = 2;

/**
 * Test seam: a provider used in place of the one --provider names. Allowed only on a ledger-checked path (anthropic or
 * record), so an injected provider can never run under the ledger-exempt replay selection.
 */
export interface GenerateDeps { provider?: ModelProvider }

/** The numeric limits, checked before anything is written: NaN or a non-positive value would make every limit comparison false and disable the limit. */
function invalidLimits(args: GenerateArgs): string | null {
  if (args.budgetUsd !== undefined && toUsdMicro(args.budgetUsd) === null) return `--budget-usd ${String(args.budgetUsd)} is not a valid estimated budget: give a positive amount in USD of at least $0.000001`;
  for (const [flag, value] of [["--max-requests", args.maxRequests], ["--max-tokens", args.maxTokens], ["--max-seconds", args.maxSeconds]] as const) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value))) return `${flag} ${String(value)} is not a valid limit: give a positive number`;
  }
  return null;
}

export function importIdFor(outDir: string): string {
  return basename(resolve(outDir)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
}

/** The provider --provider names (and --fixtures for replay and record). */
export function providerFor(args: Pick<GenerateArgs, "provider" | "fixtures">): ModelProvider {
  if (args.provider === "replay") { if (!args.fixtures) throw new Error("--fixtures is required with --provider replay"); return new ReplayProvider(resolve(args.fixtures)); }

  const live = createAnthropicProvider();
  if (args.provider === "record") { if (!args.fixtures) throw new Error("--fixtures is required with --provider record"); return new RecordingProvider(live, resolve(args.fixtures)); }

  return live;
}

/**
 * The ledger check for a paid run (R6, R7), before anything is created or resumed: the run must be authorised by the
 * ledger, and an existing directory's spend so far, read from its attempt records, must be below the run's cap. Returns
 * the per-import estimated budget in µUSD, or an error message. Caps are estimates; so is the spend.
 */
export async function authorisePaidRun(args: Pick<GenerateArgs, "provider" | "ledger" | "run" | "budgetUsd">, outDir: string): Promise<{ ok: true; budgetUsdMicro: number } | { ok: false; message: string }> {
  if (!args.ledger || !args.run) return { ok: false, message: `--provider ${args.provider} can make paid calls, so it needs --ledger <file> and --run <id>: the ledger entry authorising this run` };
  let ledger: Awaited<ReturnType<typeof readLedger>>;
  try { ledger = await readLedger(resolve(args.ledger)); } catch (err) { if (err instanceof LedgerError) return { ok: false, message: err.message }; throw err; }
  const auth = authoriseRun(ledger, { runId: args.run, outDir, budgetUsd: args.budgetUsd });
  if (!auth.ok) return { ok: false, message: auth.message };
  const spent = spendFromAttempts(await new FileStore(outDir).listAttempts(importIdFor(outDir)));
  if (spent >= auth.capUsdMicro) return { ok: false, message: `run ${JSON.stringify(args.run)} has already spent an estimated $${(spent / 1_000_000).toFixed(4)} (from its attempt records), which meets its estimated cap of $${(auth.capUsdMicro / 1_000_000).toFixed(2)}; nothing more is dispatched under this ledger entry` };
  return { ok: true, budgetUsdMicro: Math.min(toUsdMicro(args.budgetUsd) ?? auth.capUsdMicro, auth.capUsdMicro) };
}

export async function generate(args: GenerateArgs, io: { out: (s: string) => void; err: (s: string) => void }, deps: GenerateDeps = {}): Promise<number> {
  const types = args.types.split(",").map((t) => t.trim()).filter(Boolean) as PlannedType[];
  for (const t of types) if (!["multiChoice", "blanks", "flashcards"].includes(t)) throw new Error(`unsupported type ${t}; phase 2 supports multiChoice, blanks, flashcards`);
  if (new Set(types).size !== types.length) throw new Error(`--types lists a type more than once (${args.types}); name each type once`);

  if (!(READING_LEVEL_IDS as readonly string[]).includes(args.readingLevel)) throw new Error(`unknown reading level ${args.readingLevel}`);

  if (!(TONE_IDS as readonly string[]).includes(args.tone)) throw new Error(`unknown tone ${args.tone}`);

  const invalid = invalidLimits(args);
  if (invalid) { io.err(`leap: ${invalid}\n`); return 1; } // before any write or dispatch, on every provider path
  const ledgerChecked = args.provider === "anthropic" || args.provider === "record";
  if (deps.provider && !ledgerChecked) throw new Error(`a provider can be injected only with --provider anthropic or record, where the ledger applies; not with --provider ${args.provider}`);
  const outDir = resolve(args.out);
  let budgetUsdMicro = toUsdMicro(args.budgetUsd ?? DEFAULT_BUDGET_USD)!;
  if (ledgerChecked) {
    const paid = await authorisePaidRun(args, outDir); // before anything is created or resumed
    if (!paid.ok) { io.err(`leap: ${paid.message}\n`); return 1; }
    budgetUsdMicro = paid.budgetUsdMicro;
  }
  // Refuse a phase-2 directory before any work, and before the lock: a version-1 import never becomes writable, so this read cannot go stale. runImport checks again under the lock.
  try { await FileStore.assertWritableAt(outDir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  const sourcePath = resolve(args.source);
  let loaded: Awaited<ReturnType<typeof loadSource>>;
  try { loaded = await loadSource(sourcePath); } catch (err) { if (err instanceof UnsupportedSourceError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  const source = loaded.document;
  const warnings = warningSummary(loaded.warnings);
  if (warnings) io.err(`${warnings}\n`);
  const unitText = args.unit ? await readFile(resolve(args.unit), "utf8") : null;
  const registry = await createRegistry({ lockPath: resolve(args.libraries, "libraries.lock.json"), cacheDir: resolve(args.libraries, "cache") });
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const promptConfig = { readingLevel: args.readingLevel as ReadingLevel, tone: args.tone as Tone, language: args.language, ...(args.customisation ? { customisation: args.customisation } : {}) };
  const budget = { usdMicro: budgetUsdMicro, requests: args.maxRequests, tokens: args.maxTokens, elapsedMs: Math.round(args.maxSeconds * 1000) };
  const identity = await engineIdentity(resolve(args.libraries));
  let record: ImportRecord;
  try {
    record = await runImport(
      { importId, name: args.name ?? basename(sourcePath), source, unitText, selectedTypes: types, budget, promptConfig, language: args.language, customisation: args.customisation ?? null, ...(source.kind === "docx" || source.kind === "odt" ? { original: { ext: `.${source.kind}` as const, bytes: loaded.bytes } } : {}) },
      { store, provider: deps.provider ?? providerFor(args), registry, engineIdentity: identity, concurrency: args.concurrency, maxAttemptMs: ANTHROPIC_TIMEOUT_MS, onProgress: (e) => io.err(`${e.kind === "status" ? `status: ${e.status}` : e.kind === "activity" ? `${e.activityId}: ${e.status}${e.error ? ` (${e.error})` : ""}` : `${e.purpose}: ${e.status}${e.costUsdMicro === null ? "" : ` ($${(e.costUsdMicro / 1_000_000).toFixed(4)})`}`}\n`) }
    );
  } catch (err) {
    if (err instanceof IncompatibleResumeError || err instanceof StoreLockedError || err instanceof OriginalSourceError || isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; }

    throw err;
  }
  const activities = await store.listActivities(importId);
  io.out(`import ${importId}: ${record.status}${record.error ? ` — ${record.error}` : ""}\n`);
  for (const a of activities) {
    // the package actually stored for the current revision: revision → currentBuildId → BuildRecord.buildKey; none without a record
    const rev = a.currentRevision === null ? null : await store.getRevision(a.activityId, a.currentRevision);
    const buildKey = rev?.currentBuildId ? (await store.getBuildRecord(rev.currentBuildId))?.buildKey ?? null : null;
    io.out(`  ${a.activityId}  ${a.type.padEnd(12)}  ${a.status}${buildKey ? `  ${buildKey}` : ""}${a.error ? `  ${a.error}` : ""}\n`);
  }
  let reports: Awaited<ReturnType<typeof writeReportsLocked>>;
  try {
    reports = await writeReportsLocked(store, importId, outDir);
  } catch (err) {
    if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } // the import is persisted; a process holding the lock owns the reports

    throw err;
  }
  io.out(`mapping: ${reports.rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
  io.out(formatCostReport(reports.report) + "\n");
  return record.status === "ready" ? 0 : record.status === "ready_with_failures" ? 2 : 1;
}
