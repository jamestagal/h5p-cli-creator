import type { Sentence } from "../ingest/source-document.js";
import { estimateInputTokens } from "../llm/cost.js";

/**
 * `gapsBefore` is present only on a scoped chunk (generation scope design §2.6): for each sentence in it that follows an
 * omission, the omitted range, which its extraction request marks. A chunk without it is a whole-document chunk, whose
 * request is unchanged.
 */
export interface Chunk { chunkIndex: number; sentences: Sentence[]; estimatedTokens: number; gapsBefore?: Record<string, { from: string; to: string }> }

/** An atomic sentence (a table row) larger than the chunk budget: it cannot be split, so the run is refused before any model call (R4). */
export class OversizeAtomicSegmentError extends Error {
  readonly label: string;
  constructor(readonly sentenceId: string, readonly headingPath: string[], text: string, readonly estimatedTokens: number, readonly budgetTokens: number) {
    const label = /^\[Table [^\]]+\]/.exec(text)?.[0] ?? sentenceId;
    super(`${label}${headingPath.length > 0 ? ` under ${headingPath.join(" › ")}` : ""} (${sentenceId}) is about ${estimatedTokens} tokens, above the chunk budget of ${budgetTokens} tokens; a table row is never split, so raise the budget with --chunk-tokens or split the table in the source`);
    this.name = "OversizeAtomicSegmentError";
    this.label = label;
  }
}

/** An atomic sentence larger than the chunk budget, as `leap extract` reports it (the same measure chunkSentences refuses on). */
export interface OversizeAtomicSegment { sentenceId: string; label: string; headingPath: string[]; estimatedTokens: number; budgetTokens: number }

const sentenceTokens = (s: Sentence): number => estimateInputTokens(s.text) + 4;

function pack(sentences: Sentence[], budgetTokens: number, onOversizeAtomic: (s: Sentence, tokens: number) => void, extraTokens: (s: Sentence) => number = () => 0): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Sentence[] = []; let tokens = 0;
  const flush = (): void => { if (current.length) { chunks.push({ chunkIndex: chunks.length, sentences: current, estimatedTokens: tokens }); current = []; tokens = 0; } };
  for (const s of sentences) {
    const own = sentenceTokens(s);
    const t = own + extraTokens(s);
    if (s.atomic && own > budgetTokens) onOversizeAtomic(s, own);
    if (current.length > 0 && tokens + t > budgetTokens) flush();
    current.push(s); tokens += t;
  }
  flush();
  return chunks;
}

/** Greedy packing on sentence boundaries; an ordinary sentence longer than the budget becomes its own chunk (R14); an atomic one throws OversizeAtomicSegmentError. */
export function chunkSentences(sentences: Sentence[], budgetTokens: number): Chunk[] {
  return pack(sentences, budgetTokens, (s, t) => { throw new OversizeAtomicSegmentError(s.sentenceId, s.headingPath, s.text, t, budgetTokens); });
}

/**
 * For inspection without a run: the same packing, but every oversize atomic sentence is listed instead of refused, and
 * becomes a chunk of its own, so the extraction requests can still be sized.
 */
export function inspectChunks(sentences: Sentence[], budgetTokens: number): { chunks: Chunk[]; oversizeAtomicSegments: OversizeAtomicSegment[] } {
  const oversizeAtomicSegments: OversizeAtomicSegment[] = [];
  const chunks = pack(sentences, budgetTokens, (s, t) => oversizeAtomicSegments.push({ sentenceId: s.sentenceId, label: new OversizeAtomicSegmentError(s.sentenceId, s.headingPath, s.text, t, budgetTokens).label, headingPath: [...s.headingPath], estimatedTokens: t, budgetTokens }));
  return { chunks, oversizeAtomicSegments };
}

/** The line marking an omission before a scoped sentence (design §2.6): no [sN] id, so it can never be cited. */
export function gapMarker(gap: { from: string; to: string }): string {
  return gap.from === gap.to ? `[gap: sentence ${gap.from} is not in the generation scope]` : `[gap: sentences ${gap.from}–${gap.to} are not in the generation scope]`;
}

/**
 * Packs a scope's sentences (in document order) exactly as chunkSentences packs a document's, charging each gap
 * marker's tokens to the sentence it precedes; every chunk carries the gaps before its sentences. An oversize atomic
 * sentence is refused as in chunkSentences.
 */
export function chunkScopedSentences(sentences: Sentence[], gapsBefore: Record<string, { from: string; to: string }>, budgetTokens: number): Chunk[] {
  const markerTokens = (s: Sentence): number => { const gap = gapsBefore[s.sentenceId]; return gap ? estimateInputTokens(gapMarker(gap)) + 1 : 0; };
  return pack(sentences, budgetTokens, (s, t) => { throw new OversizeAtomicSegmentError(s.sentenceId, s.headingPath, s.text, t, budgetTokens); }, markerTokens)
    .map((c) => ({ ...c, gapsBefore: Object.fromEntries(c.sentences.flatMap((s) => (gapsBefore[s.sentenceId] ? [[s.sentenceId, gapsBefore[s.sentenceId]!]] : []))) }));
}
