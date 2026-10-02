import { randomBytes } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertCurrentLayout, exportReviewSheet, isStoreVersionError, SheetIntegrityError, SheetStateError, StoreLockedError } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";

/** A path the sheet would be written through is a symbolic link, or not the kind of entry expected there. */
export class SheetPathError extends Error { constructor(message: string) { super(message); this.name = "SheetPathError"; } }

const BUNDLE_FILES = ["review-sheet.md", "scores.csv", "findings.csv"] as const;
type BundleFile = (typeof BUNDLE_FILES)[number];

/** The entry at `path`, without following a link: "missing", "dir", "file", or a refusal for anything else. */
async function entryAt(path: string, expected: "dir" | "file"): Promise<"missing" | "dir" | "file"> {
  let st;
  try { st = await lstat(path); } catch (err) { if ((err as { code?: string }).code === "ENOENT") return "missing"; throw err; }
  if (st.isSymbolicLink()) throw new SheetPathError(`${path} is a symbolic link; review files are never written through a link`);
  const kind = st.isDirectory() ? "dir" : st.isFile() ? "file" : null;
  if (kind !== expected) throw new SheetPathError(`${path} exists but is not a ${expected === "dir" ? "directory" : "regular file"}`);
  return kind;
}

/**
 * Writes a sheet's editable bundle (review-sheet.md, scores.csv, findings.csv) to reviews/sheets/<sheetId>/, beside its
 * manifest. A new bundle is assembled in a temporary directory and renamed into place, so it appears whole or not at
 * all. An existing bundle is the reviewer's work in progress: its files are never rewritten; a missing one is created
 * with an exclusive create. Returns which files were created and which were kept.
 */
async function writeBundle(dir: string, files: Record<BundleFile, string>): Promise<{ created: BundleFile[]; kept: BundleFile[] }> {
  if ((await entryAt(dir, "dir")) === "missing") {
    const tmp = join(dir, "..", `.${randomBytes(6).toString("hex")}.tmp`);
    await mkdir(tmp);
    try {
      for (const name of BUNDLE_FILES) await writeFile(join(tmp, name), files[name], { flag: "wx" });
      await rename(tmp, dir);
      return { created: [...BUNDLE_FILES], kept: [] };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw err;
      // another export of the same sheet won the rename: fall through and treat its bundle as existing
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    await entryAt(dir, "dir");
  }
  const created: BundleFile[] = []; const kept: BundleFile[] = [];
  for (const name of BUNDLE_FILES) {
    const path = join(dir, name);
    if ((await entryAt(path, "file")) === "file") { kept.push(name); continue; }
    try { await writeFile(path, files[name], { flag: "wx" }); created.push(name); } catch (err) { if ((err as { code?: string }).code !== "EEXIST") throw err; kept.push(name); }
  }
  return { created, kept };
}

/**
 * `leap review-sheet --out <dir>` (design §7.1, R1): writes the sheet manifest once to reviews/sheets/<sheetId>.json and
 * its editable bundle to reviews/sheets/<sheetId>/, for every promoted activity whose current build has no scored
 * review. Exporting the same sheet again keeps the reviewer's files; a changed sheet gets a new bundle and the old one
 * stays as it was. Refuses a phase-2 (store version 1) directory before reading anything else, a damaged promoted
 * activity before writing anything, and any symbolic link on the way to the bundle.
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
    // the manifest is written under reviews/sheets/ too, so a link there is refused before anything is written
    await entryAt(join(outDir, "reviews"), "dir");
    await entryAt(join(outDir, "reviews", "sheets"), "dir");
    const sheet = await exportReviewSheet(store, importId, clock, { packagePath: (buildKey) => resolve(outDir, buildKey) });
    if (!sheet) { io.out("nothing to review: every promoted activity's current build already has a scored review\n"); return 0; }
    const bundle = join(outDir, "reviews", "sheets", sheet.manifest.sheetId);
    const { kept } = await writeBundle(bundle, { "review-sheet.md": sheet.markdown, "scores.csv": sheet.scoresCsv, "findings.csv": sheet.findingsCsv });
    const n = sheet.manifest.entries.length;
    io.out(`sheet ${sheet.manifest.sheetId} (${sheet.created ? "new" : `unchanged since ${sheet.manifest.createdAt}`}): ${n} ${n === 1 ? "activity" : "activities"} to review\n`);
    for (const name of BUNDLE_FILES) io.out(`  ${join(bundle, name)}${kept.includes(name) ? " (kept: already there, not rewritten)" : ""}\n`);
    io.out(`  manifest: ${join(outDir, "reviews", "sheets", `${sheet.manifest.sheetId}.json`)}\n`);
    return 0;
  } catch (err) {
    if (isStoreVersionError(err) || err instanceof SheetStateError || err instanceof SheetPathError || err instanceof SheetIntegrityError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  } finally {
    await lock.release();
  }
}
