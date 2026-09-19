import type { Sentence } from "../ingest/source-document.js";
import { estimateInputTokens } from "../llm/cost.js";

export interface Chunk { chunkIndex: number; sentences: Sentence[]; estimatedTokens: number; }

/** Greedy packing on sentence boundaries; a sentence longer than the budget becomes its own chunk. */
export function chunkSentences(sentences: Sentence[], budgetTokens: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Sentence[] = []; let tokens = 0;
  const flush = (): void => { if (current.length) { chunks.push({ chunkIndex: chunks.length, sentences: current, estimatedTokens: tokens }); current = []; tokens = 0; } };
  for (const s of sentences) {
    const t = estimateInputTokens(s.text) + 4;
    if (current.length > 0 && tokens + t > budgetTokens) flush();
    current.push(s); tokens += t;
  }
  flush();
  return chunks;
}
