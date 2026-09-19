import { createHash } from "node:crypto";

export interface Sentence { sentenceId: string; charStart: number; charEnd: number; text: string; }
export type SourceKind = "text" | "markdown" | "pdf";
export interface SourceDocument {
  sourceId: string;
  kind: SourceKind;
  text: string;
  textHash: string;
  sentences: Sentence[];
  metadata: { fileName?: string; pages?: number; characters: number };
}
export interface IngestOptions { sourceId: string; fileName?: string; }

export const MAX_SOURCE_CHARACTERS = 300_000;

export class EmptySourceError extends Error { constructor() { super("source is empty after extraction"); this.name = "EmptySourceError"; } }
export class SourceTooLargeError extends Error {
  constructor(characters: number) { super(`source has ${characters.toLocaleString("en-US")} characters, above the limit of ${MAX_SOURCE_CHARACTERS.toLocaleString("en-US")}; split it rather than truncating`); this.name = "SourceTooLargeError"; }
}

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

export function buildDocument(kind: SourceKind, text: string, opts: IngestOptions, extra: { pages?: number } = {}): SourceDocument {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (normalised.length === 0) throw new EmptySourceError();
  if (normalised.length > MAX_SOURCE_CHARACTERS) throw new SourceTooLargeError(normalised.length);
  const metadata: SourceDocument["metadata"] = { characters: normalised.length };
  if (opts.fileName !== undefined) metadata.fileName = opts.fileName;
  if (extra.pages !== undefined) metadata.pages = extra.pages;
  return { sourceId: opts.sourceId, kind, text: normalised, textHash: textHash(normalised), sentences: segmentSentences(normalised), metadata };
}
