import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertCurrentLayout, importScores, isStoreVersionError, StoreLockedError } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";
import { writeReports } from "./report.js";

export interface ReviewImportArgs { out: string; scores: string; findings?: string; reviewer: string }

/**
 * `leap review-import --out <dir> --scores <scores.csv> [--findings <findings.csv>] --reviewer <name>` (design §7.2-7.3):
 * checks the whole filled-in sheet before writing anything and reports every problem; then commits the new rows as one
 * batch and appends their score and acceptance records. Findings default to findings.csv beside the scores file.
 */
export async function reviewImport(args: ReviewImportArgs, io: { out: (s: string) => void; err: (s: string) => void }, clock: () => Date = () => new Date()): Promise<number> {
  const outDir = resolve(args.out);
  if (!args.reviewer.trim()) { io.err("leap: --reviewer must name the person who scored the sheet\n"); return 1; }
  try { await FileStore.assertWritableAt(outDir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  const scoresPath = resolve(args.scores);
  const findingsPath = resolve(args.findings ?? join(dirname(scoresPath), "findings.csv"));
  let scoresCsv: string; let findingsCsv: string;
  try { scoresCsv = await readFile(scoresPath, "utf8"); findingsCsv = await readFile(findingsPath, "utf8"); }
  catch (err) { io.err(`leap: cannot read ${(err as { path?: string }).path ?? scoresPath}: ${(err as Error).message}\n`); return 1; }
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  if (!(await store.getImport(importId))) { io.err(`leap: ${outDir} holds no import; run leap generate there first\n`); return 1; }
  let lock;
  try { lock = await store.lock(importId); } catch (err) { if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  try {
    await assertCurrentLayout(store, importId, `import ${importId}`);
    const result = await importScores(store, importId, { scoresCsv, findingsCsv, reviewer: args.reviewer.trim() }, clock);
    if (result.status === "refused") {
      const all = [...result.problems, ...result.stale];
      io.err(`leap: nothing was imported; ${all.length} ${all.length === 1 ? "problem" : "problems"} to fix:\n${all.map((p) => `  ${p}\n`).join("")}`);
      return 1;
    }
    if (result.status === "nothing-new") {
      io.out(`nothing new to import (${result.committed} rows already committed, ${result.notScored} not scored)\n`);
      return 0;
    }
    const counts = new Map<string, number>();
    for (const r of result.batch.rows) counts.set(r.decision, (counts.get(r.decision) ?? 0) + 1);
    io.out(`imported batch ${result.batch.sequence} (${result.batch.batchId.slice(0, 12)}): ${result.batch.rows.length} new ${result.batch.rows.length === 1 ? "row" : "rows"} (${[...counts].map(([d, n]) => `${n} ${d}`).join(", ")}); ${result.committed} already committed, ${result.notScored} not scored\n`);
    const { rows } = await writeReports(store, importId, outDir);
    io.out(`mapping: ${rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
    return 0;
  } catch (err) {
    if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  } finally {
    await lock.release();
  }
}
