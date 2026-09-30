import { createHash } from "node:crypto";
import { countCodePoints, normaliseSourceText } from "./admit.js";

/**
 * Offsets are UTF-16 code units into the stored normalised text, half-open [charStart, charEnd), so
 * `text.slice(charStart, charEnd)` is the sentence. Source limits count code points instead (admit.ts); the two are never mixed.
 */
export interface Sentence { sentenceId: string; charStart: number; charEnd: number; text: string; }
export type SourceKind = "text" | "markdown" | "pdf";
export interface SourceDocument {
  sourceId: string;
  kind: SourceKind;
  text: string;
  textHash: string;
  sentences: Sentence[];
  /** `characters` is UTF-16 code units of `text`; `codePoints` is what the source limits count. */
  metadata: { fileName?: string; pages?: number; characters: number; codePoints: number; extractionVersion: string };
}
export interface IngestOptions { sourceId: string; fileName?: string; }

/** Identifies how source text is extracted and normalised. Part of the run fingerprint: changing extraction changes what a resume must match. */
export const EXTRACTION_VERSION = "2026-09-28.1";

export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf", "no", "fig", "mr", "mrs", "ms", "dr"]);
const TERMINATOR = /[.!?]+["')\]]?/g;

/** Splits on sentence terminators followed by whitespace (or end), skipping decimals and common abbreviations; also splits on newlines. Offsets index the original text. */
export function segmentSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) sentences.push({ sentenceId: `s${sentences.length + 1}`, charStart: start + leading, charEnd: start + leading + trimmed.length, text: trimmed });
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
  return sentences;
}

/** Normalises (idempotently) and segments; enforces no limit. The ingest entry points admit the text before calling it. */
export function buildDocument(kind: SourceKind, text: string, opts: IngestOptions, extra: { pages?: number } = {}): SourceDocument {
  const normalised = normaliseSourceText(text);
  const metadata: SourceDocument["metadata"] = { characters: normalised.length, codePoints: countCodePoints(normalised), extractionVersion: EXTRACTION_VERSION };
  if (opts.fileName !== undefined) metadata.fileName = opts.fileName;
  if (extra.pages !== undefined) metadata.pages = extra.pages;
  return { sourceId: opts.sourceId, kind, text: normalised, textHash: textHash(normalised), sentences: segmentSentences(normalised), metadata };
}
