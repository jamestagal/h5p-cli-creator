import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutline, scopeTemplate, type Outline, type OutlineSection, type SectionCounts } from "@leaplearn/generator";
import { assertNamesFree, findRepoRoot, isAdmissionOrFormatError, outDirRefusal, publishFiles, ReportPublicationError } from "./extract.js";
import { loadSource, type LoadedSource } from "./source.js";

export interface OutlineArgs {
  source: string; out: string;
  /** The repository that real material must stay out of; defaults to the one this CLI runs from (none when installed elsewhere). */
  repoRoot?: string | null;
}

/** The four files, by name. Like `leap extract`'s reports, they are published only into names that do not exist yet. */
export const OUTLINE_NAMES = ["outline.md", "outline.json", "sentences.md", "generation-scope.json"] as const;
type OutlineName = (typeof OUTLINE_NAMES)[number];

const NO_HEADINGS = "no usable headings: select sentence ranges";
const pathText = (p: string[]): string => (p.length === 0 ? "(no heading)" : p.join(" › "));
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const flat = (sections: OutlineSection[]): OutlineSection[] => sections.flatMap((s) => [s, ...flat(s.children)]);

function countsText(c: SectionCounts): string {
  const parts = [plural(c.sentences, "sentence"), plural(c.sourceCodePoints, "source code point")];
  if (c.tables > 0) parts.push(`${plural(c.tables, "table")} (${plural(c.tableRows, "row")})`);
  if (c.lists > 0) parts.push(`${plural(c.lists, "list")} (${plural(c.listItems, "item")}, ${plural(c.listItemSentences, "sentence")} in items)`);
  if (c.notes > 0) parts.push(`${plural(c.notes, "note")} (${plural(c.noteLines, "line")})`);
  if (c.firstSentenceId !== null) parts.push(c.firstSentenceId === c.lastSentenceId ? c.firstSentenceId : `${c.firstSentenceId}–${c.lastSentenceId}`);
  return parts.join(", ");
}

/** A code fence longer than any run of backticks in `body`, so sentence text can never close it. */
function fenced(lines: string[]): string {
  const longest = Math.max(0, ...lines.join("\n").match(/`+/g)?.map((m) => m.length) ?? [0]);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${lines.join("\n")}\n${fence}`;
}

export function outlineMarkdown(fileName: string, loaded: LoadedSource, outline: Outline): string {
  const doc = loaded.document;
  const sectionLines = (sections: OutlineSection[], depth: number): string[] => sections.flatMap((s) => {
    const indent = "  ".repeat(depth);
    return [
      `${indent}- ${s.title} — \`${s.id}\`${s.level > 0 ? ` (level ${s.level})` : ""}`,
      `${indent}  - path: ${pathText(s.headingPath)}`,
      `${indent}  - own: ${countsText(s.own)}`,
      ...(s.children.length > 0 ? [`${indent}  - with subsections: ${countsText(s.subtree)}`, ...sectionLines(s.children, depth + 1)] : [])
    ];
  });
  const fallbacks = loaded.analysis.originFallbacks;
  return [
    `# Outline of ${fileName}`, "",
    `- Extractor: ${loaded.extractor}; extraction version ${doc.metadata.extractionVersion}`,
    `- Original sha256: ${loaded.originalSha256}`,
    `- Text hash: ${doc.textHash}`,
    `- ${outline.usableHeadings ? `${plural(flat(outline.sections).length, "section")} from the document's headings` : `${NO_HEADINGS} (one whole-document section; sentence ids are listed in sentences.md)`}`,
    `- Whole document: ${countsText(outline.totals)}`, "",
    "Source code points count only text written in the document, once: generated labels, prefixes, separators, list numbering and repeated copies are excluded.",
    "Section ids are stable for this file and extraction version. In generation-scope.json, selecting a section selects its subsections; exclude a subsection to leave it out. Sentence ranges (`{ \"sentences\": { \"from\": \"s12\", \"to\": \"s40\" } }`) use the ids in sentences.md.", "",
    "## Sections", "",
    ...sectionLines(outline.sections, 0), "",
    `## Origin warnings (${fallbacks.length})`, "",
    fallbacks.length === 0 ? "None." : fallbacks.map((f) => `- characters ${f.charStart}–${f.charEnd}: origin could not be mapped through normalisation, so none of it counts as source (${f.sourceCodePoints} source and ${f.generatedCodePoints} generated code points before normalisation)`).join("\n"), ""
  ].join("\n");
}

export function sentencesMarkdown(fileName: string, loaded: LoadedSource, outline: Outline): string {
  const bySection = new Map<string, string[]>();
  for (const s of loaded.document.sentences) {
    const id = outline.sectionOf[s.sentenceId]!;
    const lines = bySection.get(id) ?? [];
    lines.push(`[${s.sentenceId}] ${typeof s.listDepth === "number" ? `(list level ${s.listDepth + 1}) ` : ""}${s.text}`);
    bySection.set(id, lines);
  }
  return [
    `# Sentences in ${fileName}`, "",
    "Every sentence, by section, with its id, as extraction numbers it. A sentence range in generation-scope.json names the first and last ids: `{ \"sentences\": { \"from\": \"s12\", \"to\": \"s40\" } }`.", "",
    ...flat(outline.sections).flatMap((s) => bySection.has(s.id) ? [`## ${s.id} — ${s.headingPath.length > 0 ? pathText(s.headingPath) : s.title}`, "", fenced(bySection.get(s.id)!), ""] : [])
  ].join("\n");
}

export function outlineJson(fileName: string, loaded: LoadedSource, outline: Outline): Record<string, unknown> {
  const doc = loaded.document;
  return {
    kind: "leap.outline", outlineFormat: 1,
    source: { fileName, extractor: loaded.extractor, originalSha256: loaded.originalSha256, textHash: doc.textHash, extractionVersion: doc.metadata.extractionVersion },
    usableHeadings: outline.usableHeadings, totals: outline.totals, sections: outline.sections, originFallbacks: loaded.analysis.originFallbacks
  };
}

/**
 * `leap outline`: ingests a source exactly as `leap generate` would and writes its outline (sections with stable ids,
 * heading paths and counts), its sentences by section, and a generation-scope.json template bound to the source, for
 * the author to select from. No model call, API key or ledger is involved. Output follows `leap extract`'s rules: --out
 * outside the repository or under docs/uoc/, no output name may exist already (a file, the source or a symbolic link),
 * and the files are published all or nothing. Exits 1, writing nothing, when the source or --out is refused.
 */
export async function outline(args: OutlineArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const repoRoot = args.repoRoot === undefined ? findRepoRoot(dirname(fileURLToPath(import.meta.url))) : args.repoRoot;
  const refusal = outDirRefusal(args.out, repoRoot);
  if (refusal) { io.err(`leap: ${refusal}\n`); return 1; }

  let loaded: LoadedSource;
  try { loaded = await loadSource(args.source); } catch (err) { if (isAdmissionOrFormatError(err)) { io.err(`leap: ${basename(args.source)}: ${err.message}\n`); return 1; } throw err; }
  const fileName = basename(args.source);
  const outDir = resolve(args.out);
  const result = buildOutline(loaded.document, loaded.analysis);
  const files: Record<OutlineName, string> = {
    "outline.md": outlineMarkdown(fileName, loaded, result),
    "outline.json": `${JSON.stringify(outlineJson(fileName, loaded, result), null, 2)}\n`,
    "sentences.md": sentencesMarkdown(fileName, loaded, result),
    "generation-scope.json": `${JSON.stringify(scopeTemplate(loaded, fileName), null, 2)}\n`
  };
  try {
    await assertNamesFree(outDir, OUTLINE_NAMES, [args.source], "leap outline never overwrites a file");
    await mkdir(outDir, { recursive: true });
    await publishFiles(outDir, OUTLINE_NAMES, files, ".outline-staging-");
  } catch (err) {
    if (err instanceof ReportPublicationError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  }
  const sections = flat(result.sections).length;
  io.out(`${fileName}: ${plural(sections, "section")} (${result.usableHeadings ? "usable headings" : NO_HEADINGS}), ${plural(result.totals.sentences, "sentence")}, ${plural(result.totals.sourceCodePoints, "source code point")}${loaded.analysis.originFallbacks.length > 0 ? `, ${plural(loaded.analysis.originFallbacks.length, "origin warning")}` : ""}\n`);
  io.out(`wrote ${OUTLINE_NAMES.join(", ")} to ${outDir}\n`);
  return 0;
}
