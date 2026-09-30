import { existsSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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

const isAdmissionOrFormatError = (err: unknown): err is Error =>
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
    section("Lists with simplified numbering", w.listNumberingSimplified.map((l) => `- List ${l.listIndex} under ${pathText(l.headingPath)}: the document uses ${l.originalFormats.join(", ")}; the text shows decimal or bullet labels instead.`)), "",
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
 * Request sizes use the default prompt configuration. Exits 1 when the source is refused (admission, format or type).
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
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "extracted.txt"), loaded.document.text);
  await writeFile(join(outDir, "tables.md"), tablesMarkdown(fileName, loaded.extractor, loaded.tables));
  await writeFile(join(outDir, "extract.json"), `${JSON.stringify(json, null, 2)}\n`);
  await writeFile(join(outDir, "warnings.md"), warningsMarkdown(fileName, loaded.warnings));
  const w = loaded.warnings;
  io.out(`${fileName}: ${loaded.extractor}, ${loaded.document.metadata.codePoints} code points, ${loaded.document.sentences.length} sentences, ${loaded.tables.length} tables, ${(json["oversizeAtomicSegments"] as unknown[]).length} oversize rows, ${(json["oversizeRequests"] as unknown[]).length} oversize requests, ${w.listNumberingSimplified.length + w.numberingUnsupported.length + w.labelLikeReferences.length} warnings\n`);
  io.out(`wrote extracted.txt, tables.md, extract.json and warnings.md to ${outDir}\n`);
  return 0;
}

export { DEFAULT_CHUNK_TOKENS };
