import { createHash } from "node:crypto";
import { admitSource, countCodePoints, NormalisationInvariantError, normaliseSourceText } from "./admit.js";
import type { Segment } from "./structure/linearize.js";

/**
 * Offsets are UTF-16 code units into the stored normalised text, half-open [charStart, charEnd), so
 * `text.slice(charStart, charEnd)` is the sentence. Source limits count code points instead (admit.ts); the two are never mixed.
 */
export interface Sentence {
  sentenceId: string; charStart: number; charEnd: number; text: string;
  /** Headings the sentence sits under, outermost first; empty for plain text, markdown and PDF sources. */
  headingPath: string[];
  /** A table row (or other atomic range): one sentence, never split, and never divided by a chunk boundary. */
  atomic: boolean;
  /** The list depth of the item the sentence belongs to (0 = top level), or null when it is not in a list. Always null for plain sources. */
  listDepth: number | null;
}
export type SourceKind = "text" | "markdown" | "pdf" | "docx";
export interface SourceDocument {
  sourceId: string;
  kind: SourceKind;
  text: string;
  textHash: string;
  sentences: Sentence[];
  /** `characters` is UTF-16 code units of `text`; `codePoints` is what the source limits count. */
  metadata: {
    fileName?: string; pages?: number; characters: number; codePoints: number; extractionVersion: string;
    /** Structured sources: the sha256 of the original file's bytes, which are stored unchanged, and the adapter that read it. */
    originalSha256?: string; extractor?: "docx";
  };
}
export interface IngestOptions { sourceId: string; fileName?: string; }

/**
 * Identifies how source text is extracted and normalised. Part of the run fingerprint: changing extraction changes what
 * a resume must match. History: 2026-09-28.1 NFC normalisation and code-point admission; 2026-09-30.1 PDF text is the
 * pages' own text, without pdf-parse's page labels.
 */
export const EXTRACTION_VERSION = "2026-09-30.1";

export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf", "no", "fig", "mr", "mrs", "ms", "dr"]);
const TERMINATOR = /[.!?]+["')\]]?/g;

/** The phase-2 splitter: [start, end) ranges of `text` split on sentence terminators followed by whitespace (or end), skipping decimals and common abbreviations; also split on newlines. */
function splitRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) ranges.push([start + leading, start + leading + trimmed.length]);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") { push(i); start = i + 1; continue; }
    if (ch === "." || ch === "!" || ch === "?") {
      TERMINATOR.lastIndex = i;
      const m = TERMINATOR.exec(text);
      if (!m || m.index !== i) continue;
      const end = i + m[0].length;
      const next = text[end];
      const atEnd = end >= text.length;
      if (!atEnd && next !== undefined && !/\s/.test(next)) continue;
      const before = text.slice(Math.max(start, i - 6), i);
      const word = before.split(/\s+/).pop()?.toLowerCase() ?? "";
      if (ch === "." && /\d$/.test(before) && next !== undefined && /\d/.test(text[end + 1] ?? "")) continue;
      if (ch === "." && ABBREVIATIONS.has(word)) continue;
      push(end);
      i = end - 1;
    }
  }
  push(text.length);
  return ranges;
}

/**
 * Without segments, the phase-2 rules over the whole text (heading paths empty, nothing atomic). With segments, each
 * atomic range is exactly one sentence and each other range is split by the phase-2 rules; every sentence carries its
 * range's heading path and list depth. Offsets index `text` (UTF-16 code units).
 */
export function segmentSentences(text: string, segments?: Segment[]): Sentence[] {
  const sentences: Sentence[] = [];
  const add = (charStart: number, charEnd: number, headingPath: string[], atomic: boolean, listDepth: number | null): void => {
    sentences.push({ sentenceId: `s${sentences.length + 1}`, charStart, charEnd, text: text.slice(charStart, charEnd), headingPath: [...headingPath], atomic, listDepth });
  };
  if (segments === undefined) {
    for (const [a, b] of splitRanges(text)) add(a, b, [], false, null);
    return sentences;
  }
  for (const seg of segments) {
    if (seg.atomic) { add(seg.charStart, seg.charEnd, seg.headingPath, true, seg.listDepth); continue; }
    // A list label ("1.") is never a sentence of its own: split after it, then give the first sentence its label back.
    const labelEnd = seg.labelEnd ?? 0;
    const ranges = splitRanges(text.slice(seg.charStart + labelEnd, seg.charEnd)).map(([a, b]): [number, number] => [a + labelEnd, b + labelEnd]);
    if (labelEnd > 0) {
      const lead = text.slice(seg.charStart, seg.charEnd).length - text.slice(seg.charStart, seg.charEnd).trimStart().length;
      if (ranges.length > 0) ranges[0]![0] = lead; else ranges.push([lead, labelEnd]);
    }
    for (const [a, b] of ranges) add(seg.charStart + a, seg.charStart + b, seg.headingPath, false, seg.listDepth);
  }
  return sentences;
}

export interface DocumentExtra { pages?: number; originalSha256?: string; extractor?: "docx" }

function assemble(kind: SourceKind, text: string, segments: Segment[] | undefined, opts: IngestOptions, extra: DocumentExtra): SourceDocument {
  const metadata: SourceDocument["metadata"] = { characters: text.length, codePoints: countCodePoints(text), extractionVersion: EXTRACTION_VERSION };
  if (opts.fileName !== undefined) metadata.fileName = opts.fileName;
  if (extra.pages !== undefined) metadata.pages = extra.pages;
  if (extra.originalSha256 !== undefined) metadata.originalSha256 = extra.originalSha256;
  if (extra.extractor !== undefined) metadata.extractor = extra.extractor;
  return { sourceId: opts.sourceId, kind, text, textHash: textHash(text), sentences: segmentSentences(text, segments), metadata };
}

/**
 * The only way final text becomes a SourceDocument at an ingest entry point: refuses a text that is not a fixed point of
 * normaliseSourceText (it never transforms it, so offsets built on it stay valid), segments it (honouring atomic
 * ranges), admits it (500-400,000 code points), and builds the document. An empty `segments` means a plain source.
 */
export function finaliseDocument(kind: SourceKind, text: string, segments: Segment[], opts: IngestOptions, extra: DocumentExtra = {}): SourceDocument {
  if (normaliseSourceText(text) !== text) throw new NormalisationInvariantError("source text is not normalised (normaliseSourceText would change it), so its offsets would not survive; normalise before building offsets");
  admitSource(text);
  return assemble(kind, text, segments.length > 0 ? segments : undefined, opts, extra);
}

/** Normalises and segments a plain text, enforcing no limit: for tests and callers below the ingest entry points. */
export function buildDocument(kind: SourceKind, text: string, opts: IngestOptions, extra: { pages?: number } = {}): SourceDocument {
  return assemble(kind, normaliseSourceText(text), undefined, opts, extra);
}
