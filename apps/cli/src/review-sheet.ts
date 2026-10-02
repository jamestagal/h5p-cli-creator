import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertCurrentLayout, exportReviewSheet, isStoreVersionError, StoreLockedError } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";

/**
 * `leap review-sheet --out <dir>` (design §7.1, R1): writes the sheet manifest once under reviews/sheets/, then
 * review-sheet.md, scores.csv and findings.csv in the import directory, for every promoted activity whose current build
 * has no scored review. Refuses a phase-2 (store version 1) directory before reading anything else.
 */
export async function reviewSheet(args: { out: string }, io: { out: (s: string) => void; err: (s: string) => void }, clock: () => Date = () => new Date()): Promise<number> {
  const outDir = resolve(args.out);
  try { await FileStore.assertWritableAt(outDir); } catch (err) { if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  if (!(await store.getImport(importId))) { io.err(`leap: ${outDir} holds no import; run leap generate there first\n`); return 1; }
  let lock;
  try { lock = await store.lock(importId); } catch (err) { if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  try {
    await assertCurrentLayout(store, importId, `import ${importId}`);
    const sheet = await exportReviewSheet(store, importId, clock, { packagePath: (buildKey) => resolve(outDir, buildKey) });
    if (!sheet) { io.out("nothing to review: every promoted activity's current build already has a scored review\n"); return 0; }
    const files = { "review-sheet.md": sheet.markdown, "scores.csv": sheet.scoresCsv, "findings.csv": sheet.findingsCsv };
    for (const [name, text] of Object.entries(files)) await writeFile(resolve(outDir, name), text);
    const n = sheet.manifest.entries.length;
    io.out(`sheet ${sheet.manifest.sheetId} (${sheet.created ? "new" : `unchanged since ${sheet.manifest.createdAt}`}): ${n} ${n === 1 ? "activity" : "activities"} to review\n`);
    for (const name of Object.keys(files)) io.out(`  ${resolve(outDir, name)}\n`);
    io.out(`  manifest: ${resolve(outDir, "reviews", "sheets", `${sheet.manifest.sheetId}.json`)}\n`);
    return 0;
  } catch (err) {
    if (isStoreVersionError(err)) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  } finally {
    await lock.release();
  }
}
