import type { Sentence } from "../ingest/source-document.js";
import { estimateInputTokens } from "../llm/cost.js";

export interface Chunk { chunkIndex: number; sentences: Sentence[]; estimatedTokens: number; }

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

/** Greedy packing on sentence boundaries; an ordinary sentence longer than the budget becomes its own chunk (R14); an atomic one throws OversizeAtomicSegmentError. */
export function chunkSentences(sentences: Sentence[], budgetTokens: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Sentence[] = []; let tokens = 0;
  const flush = (): void => { if (current.length) { chunks.push({ chunkIndex: chunks.length, sentences: current, estimatedTokens: tokens }); current = []; tokens = 0; } };
  for (const s of sentences) {
    const t = estimateInputTokens(s.text) + 4;
    if (s.atomic && t > budgetTokens) throw new OversizeAtomicSegmentError(s.sentenceId, s.headingPath, s.text, t, budgetTokens);
    if (current.length > 0 && tokens + t > budgetTokens) flush();
    current.push(s); tokens += t;
  }
  flush();
  return chunks;
}
