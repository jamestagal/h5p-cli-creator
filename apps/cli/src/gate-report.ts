import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  for (const [i, given] of args.dirs.entries()) {
    const dir = resolve(given);
    let version: number | null;
    try { version = await FileStore.storeVersionAt(dir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
    if (version === null) { io.err(`leap: ${dir} holds no import\n`); return 1; }
    if (version === 1) {
      if (i === 0) { io.err(`leap: ${dir} is a phase-2 store, which is never written; list a version-2 import directory first, where gate-report.md is written\n`); return 1; }
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
  const path = resolve(args.dirs[0]!, "gate-report.md");
  await writeFile(path, formatGateReport(imports, legacy));
  io.out(`wrote ${path}\n`);
  if (args.summary) { const summary = resolve(args.summary); await writeFile(summary, JSON.stringify(gateSummary(imports, legacy), null, 2) + "\n"); io.out(`wrote ${summary} (numbers only)\n`); }
  for (const g of imports) io.out(`${g.importId}: ${g.status}${g.status === "incomplete" ? ` (${g.incomplete.length} open item(s); an incomplete import can never pass)` : "; thresholds not frozen, not evaluated"}\n`);
  for (const l of legacy) io.out(`${l.importId}: not eligible (phase-2 store; no rubric scores)\n`);
  return 0;
}
