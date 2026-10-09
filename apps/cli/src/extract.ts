import { existsSync, realpathSync } from "node:fs";
import { link as fsLink, lstat, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CHUNK_TOKENS, DEFAULT_PROMPT_CONFIG, EmptySourceError, inspectChunks, OdtFormatError, oversizeExtractionRequests, PdfTooManyPagesError, SourceTooLargeError, SourceTooSmallError,
  type IngestWarnings, type TableSummary
} from "@leaplearn/generator";
import { loadSource, UnsupportedSourceError, type LoadedSource } from "./source.js";

export interface ExtractArgs {
  source: string; out: string; chunkTokens: number;
  /** The repository that real material must stay out of; defaults to the one this CLI runs from (none when installed elsewhere). */
  repoRoot?: string | null;
}

/** The nearest directory at or above `start` that holds a `.git` entry, or null. */
export function findRepoRoot(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** `path` with its longest existing prefix resolved through symlinks, so a link cannot smuggle output into the repository. */
function realish(path: string): string {
  const rest: string[] = [];
  let dir = resolve(path);
  while (!existsSync(dir) && dirname(dir) !== dir) { rest.unshift(basename(dir)); dir = dirname(dir); }
  return join(realpathSync(dir), ...rest);
}

/**
 * Null when `out` may hold extracted real material: outside the repository, or under its gitignored `docs/uoc/`.
 * Otherwise the refusal message.
 */
export function outDirRefusal(out: string, repoRoot: string | null): string | null {
  if (repoRoot === null) return null;
  const root = realpathSync(repoRoot);
  const rel = relative(root, realish(out));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  const parts = rel === "" ? [] : rel.split(sep);
  if (parts.length >= 3 && parts[0] === "docs" && parts[1] === "uoc") return null;
  return `--out ${out} is inside the repository (${root}) but not under docs/uoc/; extracted text is real material and must stay out of git. Use a directory outside the repository or under docs/uoc/`;
}

/** The four reports, by name. They are published only into names that do not exist yet: nothing is ever overwritten. */
export const REPORT_NAMES = ["extracted.txt", "tables.md", "extract.json", "warnings.md"] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

/** A report cannot be published safely; nothing was written. */
export class ReportPublicationError extends Error {
  constructor(message: string) { super(message); this.name = "ReportPublicationError"; }
}

const exists = async (path: string) => { try { return await lstat(path); } catch (err) { if ((err as { code?: string }).code === "ENOENT") return null; throw err; } };

/**
 * Checks, before anything is written, that every report name in `outDir` is free: an existing file (the source among
 * them) or a symbolic link, even a dangling one, is refused, so no write can follow a link or replace a file.
 */
export async function assertReportNamesFree(outDir: string, sourcePath: string): Promise<void> {
  await assertNamesFree(outDir, REPORT_NAMES, [sourcePath], "leap extract never overwrites a report");
}

/**
 * The same check for any command's output names (`leap extract`, `leap outline`). `inputs` are files the command reads:
 * an output name that is one of them is refused as that file itself. `rule` completes "already exists; …".
 */
export async function assertNamesFree(outDir: string, names: readonly string[], inputs: string[], rule: string): Promise<void> {
  const read = (await Promise.all(inputs.map((p) => exists(resolve(p))))).filter((x) => x !== null);
  for (const name of names) {
    const target = join(outDir, name);
    const st = await exists(target);
    if (!st) continue;
    if (st.isSymbolicLink()) throw new ReportPublicationError(`${target} is a symbolic link; refusing to write a report through it. Nothing was written`);
    if (read.some((source) => st.dev === source.dev && st.ino === source.ino)) throw new ReportPublicationError(`${target} is the source file itself; refusing to overwrite it. Nothing was written`);
    throw new ReportPublicationError(`${target} already exists; ${rule}. Use a new --out directory. Nothing was written`);
  }
}

/**
 * Publishes the reports all or nothing. They are written into a fresh staging directory inside `outDir`, then each is
 * hard-linked to its final name, which fails rather than replace anything that appeared since the check. On any
 * failure the reports already linked are removed; the staging directory is always removed.
 */
export async function publishReports(outDir: string, files: Record<ReportName, string>, ops: { link: (from: string, to: string) => Promise<void> } = { link: fsLink }): Promise<void> {
  await publishFiles(outDir, REPORT_NAMES, files, ".extract-staging-", ops);
}

/** publishReports for any command's output names, in order, staged in a directory named with `stagingPrefix`. */
export async function publishFiles<N extends string>(outDir: string, names: readonly N[], files: Record<N, string>, stagingPrefix: string, ops: { link: (from: string, to: string) => Promise<void> } = { link: fsLink }): Promise<void> {
  const stage = await mkdtemp(join(outDir, stagingPrefix));
  const published: string[] = [];
  try {
    for (const name of names) await writeFile(join(stage, name), files[name], { flag: "wx" });
    for (const name of names) {
      try { await ops.link(join(stage, name), join(outDir, name)); } catch (err) {
        if ((err as { code?: string }).code === "EEXIST") throw new ReportPublicationError(`${join(outDir, name)} appeared while the reports were being written; nothing was kept`);
        throw err;
      }
      published.push(join(outDir, name));
    }
  } catch (err) {
    for (const p of published) await unlink(p).catch(() => undefined);
    throw err;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export const isAdmissionOrFormatError = (err: unknown): err is Error =>
  err instanceof EmptySourceError || err instanceof SourceTooSmallError || err instanceof SourceTooLargeError || err instanceof PdfTooManyPagesError || err instanceof OdtFormatError || err instanceof UnsupportedSourceError;

const pathText = (p: string[]): string => (p.length === 0 ? "(no heading)" : p.join(" › "));
const fence = (lines: string[]): string => `\`\`\`text\n${lines.join("\n")}\n\`\`\``;

export function tablesMarkdown(fileName: string, extractor: string, tables: TableSummary[]): string {
  const head = `# Tables in ${fileName}\n\n`;
  if (extractor !== "docx" && extractor !== "odt") return `${head}No tables: ${extractor} sources carry no table structure, so their text is not read as tables.\n`;
  if (tables.length === 0) return `${head}No tables found.\n`;
  const body = tables.map((t) => [
    `## ${t.name.startsWith("Note ") ? t.name : `Table ${t.name}`}`, "",
    `- Heading path: ${pathText(t.headingPath)}`,
    `- Data rows: ${t.rowCount}`,
    t.labels === null ? "- Header: no marked header row (Column n labels)" : `- Header (${t.markedHeaderRows} marked row${t.markedHeaderRows === 1 ? "" : "s"}): ${t.labels.join(" | ")}`,
    `- First ${t.firstRows.length === 1 ? "row" : `${t.firstRows.length} rows`}, as in extracted.txt:`, "",
    t.firstRows.length > 0 ? fence(t.firstRows) : "(no data rows)"
  ].join("\n")).join("\n\n");
  return `${head}${tables.length} table${tables.length === 1 ? "" : "s"}. Tables nested inside a cell are written inline in their row and are not listed separately.\n\n${body}\n`;
}

export function warningsMarkdown(fileName: string, w: IngestWarnings): string {
  const section = (title: string, items: string[]) => `## ${title} (${items.length})\n\n${items.length === 0 ? "None." : items.join("\n")}`;
  return [
    `# Warnings for ${fileName}`, "",
    "Check every entry against the original (Checkpoint B). A label-like reference must still point unambiguously at the right item after list numbering is rendered as decimal or bullet labels.", "",
    section("Lists with simplified numbering", w.listNumberingSimplified.map((l) => `- List ${l.listIndex} under ${pathText(l.headingPath)}: the document uses ${l.originalFormats.join(", ")}; the text shows decimal or bullet labels instead. ${l.itemCount} item${l.itemCount === 1 ? "" : "s"}; first item ${JSON.stringify(l.firstItemText)}, ${l.firstSentenceId === null ? "not matched to a sentence" : `sentence ${l.firstSentenceId}`}.`)), "",
    section("Numbering that is not rendered", w.numberingUnsupported.map((u) => `- ${u.reason === "numbered-heading" ? "Numbered heading" : "Numbering with no definition"} under ${pathText(u.headingPath)} (list ${u.numId || "(none)"}, level ${Number(u.ilvl) + 1}): ${JSON.stringify(u.text)}`)), "",
    section("Sentences that look like list-label references", w.labelLikeReferences.map((r) => `- ${r.sentenceId} under ${pathText(r.headingPath)}: ${JSON.stringify(r.text)}`)), ""
  ].join("\n");
}

export function extractJson(loaded: LoadedSource, chunkTokens: number): Record<string, unknown> {
  const doc = loaded.document;
  const { chunks, oversizeAtomicSegments } = inspectChunks(doc.sentences, chunkTokens);
  return {
    originalSha256: loaded.originalSha256, extractor: loaded.extractor, extractionVersion: doc.metadata.extractionVersion, textHash: doc.textHash, codePoints: doc.metadata.codePoints,
    ...(doc.metadata.pages !== undefined ? { pages: doc.metadata.pages } : {}),
    sentenceCount: doc.sentences.length, atomicSegmentCount: doc.sentences.filter((s) => s.atomic).length,
    chunkTokens, chunkCount: chunks.length,
    oversizeAtomicSegments,
    oversizeRequests: oversizeExtractionRequests(chunks, { promptConfig: DEFAULT_PROMPT_CONFIG }),
    warnings: loaded.warnings
  };
}

/**
 * `leap extract`: ingests a source exactly as `leap generate` would and writes what a reviewer needs to check it before
 * any paid run — extracted.txt, tables.md, extract.json and warnings.md. No model call, API key or ledger is involved.
 * Request sizes use the default prompt configuration. Exits 1, writing nothing, when the source is refused (admission,
 * format or type) or a report name in --out is already taken (a file, the source, or a symbolic link): reports are
 * never overwritten and are published all or nothing (publishReports).
 */
export async function extract(args: ExtractArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  if (!Number.isInteger(args.chunkTokens) || args.chunkTokens <= 0) { io.err(`leap: --chunk-tokens must be a positive integer, not ${args.chunkTokens}\n`); return 1; }
  const repoRoot = args.repoRoot === undefined ? findRepoRoot(dirname(fileURLToPath(import.meta.url))) : args.repoRoot;
  const refusal = outDirRefusal(args.out, repoRoot);
  if (refusal) { io.err(`leap: ${refusal}\n`); return 1; }

  let loaded: LoadedSource;
  try { loaded = await loadSource(args.source); } catch (err) { if (isAdmissionOrFormatError(err)) { io.err(`leap: ${basename(args.source)}: ${err.message}\n`); return 1; } throw err; }
  const fileName = basename(args.source);
  const outDir = resolve(args.out);
  const json = extractJson(loaded, args.chunkTokens);
  const files: Record<ReportName, string> = {
    "extracted.txt": loaded.document.text,
    "tables.md": tablesMarkdown(fileName, loaded.extractor, loaded.tables),
    "extract.json": `${JSON.stringify(json, null, 2)}\n`,
    "warnings.md": warningsMarkdown(fileName, loaded.warnings)
  };
  try {
    await assertReportNamesFree(outDir, args.source);
    await mkdir(outDir, { recursive: true });
    await publishReports(outDir, files);
  } catch (err) {
    if (err instanceof ReportPublicationError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  }
  const w = loaded.warnings;
  io.out(`${fileName}: ${loaded.extractor}, ${loaded.document.metadata.codePoints} code points, ${loaded.document.sentences.length} sentences, ${loaded.tables.length} tables, ${(json["oversizeAtomicSegments"] as unknown[]).length} oversize rows, ${(json["oversizeRequests"] as unknown[]).length} oversize requests, ${w.listNumberingSimplified.length + w.numberingUnsupported.length + w.labelLikeReferences.length} warnings\n`);
  io.out(`wrote extracted.txt, tables.md, extract.json and warnings.md to ${outDir}\n`);
  return 0;
}

export { DEFAULT_CHUNK_TOKENS };
