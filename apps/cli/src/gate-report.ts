import { randomBytes } from "node:crypto";
import { lstat, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { formatGateReport, gateImport, gateSummary, isStoreVersionError, latestAcceptances, snapshotImport, StoreLockedError, type ImportGate, type LegacyGate } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";
import { readLegacyImport } from "./legacy-store.js";

export interface GateReportArgs { dirs: string[]; summary?: string }

/**
 * `leap gate-report <dir>... [--summary <file>]` (design §8, plan Task 14). Each version-2 directory is read under its
 * lock, for a consistent snapshot (and so a committed batch a crash left unapplied is completed first). A phase-2
 * directory is read without a lock or a write and listed as not eligible. Writes `gate-report.md` in the first
 * directory, which must therefore be version 2; `--summary` writes the numbers-only copy. Exits 0 when the report is
 * written, whatever the gate status; 1 when a directory cannot be read.
 */
export async function gateReport(args: GateReportArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const imports: ImportGate[] = []; const legacy: LegacyGate[] = [];
  // Both destinations are checked before any directory is read or anything is written.
  const first = resolve(args.dirs[0]!);
  let firstVersion: number | null;
  try { firstVersion = await FileStore.storeVersionAt(first); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  if (firstVersion === 1) { io.err(`leap: ${first} is a phase-2 store, which is never written; list a version-2 import directory first, where gate-report.md is written\n`); return 1; }
  if (firstVersion === null) { io.err(`leap: ${first} holds no import\n`); return 1; }
  const reportPath = join(first, "gate-report.md");
  const summaryPath = args.summary === undefined ? null : resolve(args.summary);
  const problem = (await destinationProblem(reportPath, "the report", await realpath(first))) ?? (summaryPath ? await destinationProblem(summaryPath, "--summary", null) : null)
    ?? (summaryPath && (await realDestination(summaryPath)) === (await realDestination(reportPath)) ? `--summary ${summaryPath} is the report itself` : null);
  if (problem) { io.err(`leap: ${problem}; nothing was written\n`); return 1; }

  for (const given of args.dirs) {
    const dir = resolve(given);
    let version: number | null;
    try { version = await FileStore.storeVersionAt(dir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
    if (version === null) { io.err(`leap: ${dir} holds no import\n`); return 1; }
    if (version === 1) {
      const view = await readLegacyImport(dir);
      const latest = latestAcceptances(view.acceptances).filter((a) => view.activities.some((x) => x.activityId === a.activityId && x.currentRevision === a.revision));
      legacy.push({ directory: dir, importId: view.importRecord.importId, acceptances: { accepted: latest.filter((a) => a.decision === "accepted").length, needsRevision: latest.filter((a) => a.decision === "needs-revision").length, rejected: latest.filter((a) => a.decision === "rejected").length } });
      continue;
    }
    try { await FileStore.assertWritableAt(dir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
    const store = new FileStore(dir);
    const importId = importIdFor(dir);
    let lock;
    try { lock = await store.lock(importId); } catch (err) { if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
    try { imports.push(gateImport(await snapshotImport(store, importId), dir)); } finally { await lock.release(); }
  }
  // Each file is written beside its destination and renamed into place, so an existing link is replaced, never followed.
  const outputs: Array<[string, string]> = [[reportPath, formatGateReport(imports, legacy)], ...(summaryPath ? [[summaryPath, JSON.stringify(gateSummary(imports, legacy), null, 2) + "\n"] as [string, string]] : [])];
  const staged: Array<[string, string]> = [];
  try {
    for (const [path, text] of outputs) { const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`); await writeFile(tmp, text, { flag: "wx" }); staged.push([tmp, path]); }
  } catch (err) { for (const [tmp] of staged) await rm(tmp, { force: true }); throw err; }
  for (const [tmp, path] of staged) await rename(tmp, path);
  io.out(`wrote ${reportPath}\n`);
  if (summaryPath) io.out(`wrote ${summaryPath} (numbers only)\n`);
  for (const g of imports) io.out(`${g.importId}: ${g.status}${g.status === "incomplete" ? ` (${g.incomplete.length} open item(s); an incomplete import can never pass)` : "; thresholds not frozen, not evaluated"}\n`);
  for (const l of legacy) io.out(`${l.importId}: not eligible (phase-2 store; no rubric scores)\n`);
  return 0;
}

/** The real path a destination resolves to: its directory's real path plus its name. */
async function realDestination(path: string): Promise<string> { return join(await realpath(dirname(path)), basename(path)); }

/**
 * Why `path` must not be written, or null. An existing destination must be a regular file with no other links (never
 * a symbolic link, a directory or a hard-linked alias of another file). Its real directory must not be inside any
 * import directory (one holding an import.json, of any store version), except that the report may sit directly in
 * `allowedImportDir`, the first import directory, under its own name.
 */
async function destinationProblem(path: string, label: string, allowedImportDir: string | null): Promise<string | null> {
  const existing = await lstat(path).catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return null; throw e; });
  if (existing && !existing.isFile()) return `${label} ${path} exists and is not a regular file (a symbolic link or a directory)`;
  if (existing && existing.nlink > 1) return `${label} ${path} has other hard links, so it may be another file`;
  let dir: string;
  try { dir = await realpath(dirname(path)); } catch { return `${label}'s directory ${dirname(path)} does not exist`; }
  for (let d = dir; ; d = dirname(d)) {
    const holdsImport = await stat(join(d, "import.json")).then(() => true, () => false);
    if (holdsImport && !(allowedImportDir !== null && d === allowedImportDir && dir === allowedImportDir)) return `${label} ${path} is inside the import directory ${d}; write it outside every import directory`;
    if (dirname(d) === d) return null;
  }
}
