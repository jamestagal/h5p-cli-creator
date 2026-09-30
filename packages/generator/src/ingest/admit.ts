/**
 * Admission of a submitted learning source (design §4.1, C7). Limits count Unicode code points of the NFC-normalised
 * extracted text; offsets elsewhere stay UTF-16 code units. Only the ingest entry points call admitSource, once, on
 * the final normalised text; normalisation, segmentation, chunking and extraction enforce nothing.
 */

export const MIN_SOURCE_CODE_POINTS = 500;
export const MAX_SOURCE_CODE_POINTS = 400_000;
export const MAX_PDF_PAGES = 100;

const n = (x: number): string => x.toLocaleString("en-US");

export class EmptySourceError extends Error { constructor() { super("source is empty after extraction"); this.name = "EmptySourceError"; } }
export class SourceTooSmallError extends Error {
  constructor(readonly codePoints: number) { super(`source has ${n(codePoints)} code points of text after extraction, below the minimum of ${n(MIN_SOURCE_CODE_POINTS)}; submit a longer source`); this.name = "SourceTooSmallError"; }
}
export class SourceTooLargeError extends Error {
  constructor(readonly codePoints: number) { super(`source has ${n(codePoints)} code points of text after extraction, above the maximum of ${n(MAX_SOURCE_CODE_POINTS)}; split it rather than truncating`); this.name = "SourceTooLargeError"; }
}
/** A text handed on as final was not a fixed point of normaliseSourceText (R11): offsets would not survive normalisation. */
export class NormalisationInvariantError extends Error {
  constructor(message: string) { super(message); this.name = "NormalisationInvariantError"; }
}
export class PdfTooManyPagesError extends Error {
  constructor(readonly pages: number) { super(`PDF has ${n(pages)} pages, above the limit of ${n(MAX_PDF_PAGES)}; split it rather than truncating`); this.name = "PdfTooManyPagesError"; }
}

/** CRLF and lone CR → LF, spaces and tabs before a newline removed, trimmed, then NFC. Pure, enforces no limit, idempotent. */
export function normaliseSourceText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().normalize("NFC");
}

/** Unicode code points (an astral character counts once, not as its two UTF-16 code units). */
export function countCodePoints(text: string): number {
  return [...text].length;
}

/** Throws unless `text` (already normalised) has 500 to 400,000 code points inclusive; returns the count. */
export function admitSource(text: string): number {
  const codePoints = countCodePoints(text);
  if (codePoints === 0) throw new EmptySourceError();
  if (codePoints < MIN_SOURCE_CODE_POINTS) throw new SourceTooSmallError(codePoints);
  if (codePoints > MAX_SOURCE_CODE_POINTS) throw new SourceTooLargeError(codePoints);
  return codePoints;
}
