/**
 * Character origin (generation scope design §2.1): every character of the stored text is either source (authored in
 * the document) or generated (written by an adapter or the linearizer: note references, row and note prefixes, labels,
 * separators, list labels, indentation, copies of a spanned cell). Generated characters are listed as spans of UTF-16
 * offsets; everything else is source. The text never depends on origin: it is always exactly what normaliseBlockText
 * makes of the joined raw text, so tracking origin cannot change a stored document.
 */

/** A piece of raw text an adapter builds, and whether the adapter generated it. */
export interface OriginRun { text: string; generated?: boolean }
/** Half-open [start, end) UTF-16 offsets of generated text. */
export type Span = [number, number];
/** The raw origin counts of a block whose origin could not be mapped through normalisation (it is then wholly generated). */
export interface OriginFallbackCounts { sourceCodePoints: number; generatedCodePoints: number }
export interface OriginResult { text: string; generated: Span[]; fallback: OriginFallbackCounts | null }
export interface OriginOptions {
  /**
   * Normalises one grapheme cluster. A test seam: the default is NFC. A normaliser that disagrees with whole-text NFC
   * exercises the fallback, which guards against NFC acting across a cluster boundary (Unicode does not promise it never does).
   */
  clusterNormalise?: (cluster: string) => string;
}

/** NFC; internal newlines become spaces; runs of spaces and tabs collapse to one space; trimmed. */
export function normaliseBlockText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?|\n/g, " ").replace(/[ \t]+/g, " ").trim();
}

interface Point { cp: string; gen: boolean }
const SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

/** Sorted, merged spans: no overlaps and no touching neighbours. */
export function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of spans.filter(([x, y]) => y > x).sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/** Per UTF-16 unit: 1 where generated. */
function maskOf(length: number, generated: Span[]): Uint8Array {
  const mask = new Uint8Array(length);
  for (const [a, b] of generated) mask.fill(1, Math.max(0, a), Math.min(length, b));
  return mask;
}

/** The code points of text[from, to) with their origin; a code point takes the origin of its first UTF-16 unit. */
function pointsOf(text: string, mask: Uint8Array, from = 0, to = text.length): Point[] {
  const out: Point[] = [];
  for (let i = from; i < to;) {
    const cp = String.fromCodePoint(text.codePointAt(i)!);
    out.push({ cp, gen: mask[i] === 1 });
    i += cp.length;
  }
  return out;
}

function counts(points: Point[]): OriginFallbackCounts {
  return { sourceCodePoints: points.filter((p) => !p.gen).length, generatedCodePoints: points.filter((p) => p.gen).length };
}

/** Step 1: NFC with origin, by grapheme cluster of the raw text. Null when the clusters' NFC forms do not join to NFC of the whole. */
function nfcWithOrigin(raw: string, mask: Uint8Array, normalise: (s: string) => string): Point[] | null {
  const out: Point[] = [];
  let joined = "";
  for (const { segment, index } of SEGMENTER.segment(raw)) {
    const normalised = normalise(segment);
    joined += normalised;
    const origin = pointsOf(raw, mask, index, index + segment.length);
    const allGenerated = origin.every((p) => p.gen);
    if (allGenerated || origin.every((p) => !p.gen)) { for (const cp of normalised) out.push({ cp, gen: allGenerated }); continue; }
    if (normalised === segment) { out.push(...origin); continue; }
    for (const cp of normalised) out.push({ cp, gen: true }); // a mixed cluster that NFC changes: wholly generated
  }
  return joined === raw.normalize("NFC") ? out : null;
}

/** Steps 2 and 3: line breaks to spaces, runs of spaces and tabs to one space (source if any of them was), then trim. */
function collapseAndTrim(points: Point[]): Point[] {
  const spaced: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.cp === "\r" && points[i + 1]?.cp === "\n") { spaced.push({ cp: " ", gen: p.gen && points[i + 1]!.gen }); i++; }
    else spaced.push(p.cp === "\r" || p.cp === "\n" ? { cp: " ", gen: p.gen } : p);
  }
  const collapsed: Point[] = [];
  let inRun = false;
  for (const p of spaced) {
    const blank = p.cp === " " || p.cp === "\t";
    if (blank && inRun) { collapsed.at(-1)!.gen &&= p.gen; continue; }
    collapsed.push(blank ? { cp: " ", gen: p.gen } : p);
    inRun = blank;
  }
  let start = 0; let end = collapsed.length;
  while (start < end && /\s/u.test(collapsed[start]!.cp)) start++;
  while (end > start && /\s/u.test(collapsed[end - 1]!.cp)) end--;
  return collapsed.slice(start, end);
}

/**
 * normaliseBlockText applied to the joined raw text, with origin carried through the same steps in the same order:
 * 1. NFC, by grapheme cluster: a cluster of one origin keeps it; a mixed cluster keeps per-code-point origin where NFC
 *    leaves it unchanged and is wholly generated where NFC changes it (this can only lower the source count). If the
 *    clusters' NFC forms do not join to NFC of the whole, the whole text is generated and `fallback` gives the raw counts.
 * 2. Whitespace collapse: a collapsed space is source if any character it replaced was source.
 * 3. Trim: trimmed characters go with their origin.
 * Text of a single origin needs no mapping: its origin is uniform whatever normalisation does. The returned text is
 * always normaliseBlockText(raw); origin is held per code point, so an astral character is never split.
 */
export function normaliseWithOrigin(raw: string, generated: Span[], options: OriginOptions = {}): OriginResult {
  const text = normaliseBlockText(raw);
  const mask = maskOf(raw.length, generated);
  const rawPoints = pointsOf(raw, mask);
  if (rawPoints.every((p) => !p.gen)) return { text, generated: [], fallback: null };
  if (rawPoints.every((p) => p.gen)) return { text, generated: text === "" ? [] : [[0, text.length]], fallback: null };
  const nfc = nfcWithOrigin(raw, mask, options.clusterNormalise ?? ((s) => s.normalize("NFC")));
  const points = nfc === null ? null : collapseAndTrim(nfc);
  const mapped = points?.map((p) => p.cp).join("");
  if (points === null || mapped !== text) {
    // The cluster mapping disagreed with the authoritative text: keep the text and count none of it.
    return { text, generated: text === "" ? [] : [[0, text.length]], fallback: counts(rawPoints) };
  }
  const spans: Span[] = [];
  let offset = 0;
  for (const p of points) { if (p.gen) spans.push([offset, offset + p.cp.length]); offset += p.cp.length; }
  return { text, generated: mergeSpans(spans), fallback: null };
}

/** Unicode code points of text.slice(start, end) outside every generated span: the unit of the generation-scope minimum. */
export function countSourceCodePoints(text: string, generated: Span[], start = 0, end = text.length): number {
  return sourceCodePointCounter(text, generated)(start, end);
}

/** countSourceCodePoints for many ranges of one text: the generated mask is built once. */
export function sourceCodePointCounter(text: string, generated: Span[]): (start: number, end: number) => number {
  const mask = maskOf(text.length, generated);
  return (start, end) => {
    let n = 0;
    for (let i = start; i < end;) {
      const cp = text.codePointAt(i)!;
      if (mask[i] !== 1) n++;
      i += cp > 0xffff ? 2 : 1;
    }
    return n;
  };
}
