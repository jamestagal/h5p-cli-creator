import { ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import type { StageRunner } from "../llm/runner.js";
import type { PromptConfig } from "../prompts/system.js";
import { alignConcepts } from "./align.js";
import { chunkSentences } from "./chunk.js";
import { extractChunkConcepts, type ChunkConcept } from "./extract.js";
import { mergeConcepts } from "./merge.js";

export * from "./chunk.js"; export * from "./verify.js"; export * from "./extract.js"; export * from "./merge.js"; export * from "./align.js";

/** Per-chunk persistence so a rerun reuses extraction that already finished (the pipeline backs it with the import store). */
export interface ChunkCache { get(index: number): Promise<ChunkConcept[] | null>; put(index: number, concepts: ChunkConcept[]): Promise<void>; }
export interface ConceptMapOptions { chunkTokens?: number; promptConfig?: PromptConfig; chunkCache?: ChunkCache; }

/** Chunks → per-chunk extraction (sequential; the pipeline persists progress per chunk) → merge → align. */
export async function extractConceptMap(doc: SourceDocument, unit: UnitOfCompetency | null, runner: StageRunner, options: ConceptMapOptions = {}): Promise<ConceptMap> {
  const chunks = chunkSentences(doc.sentences, options.chunkTokens ?? 6000);
  const perChunk: ChunkConcept[][] = [];
  for (const chunk of chunks) {
    const cached = options.chunkCache ? await options.chunkCache.get(chunk.chunkIndex) : null;
    if (cached) { perChunk.push(cached); continue; }

    const concepts = await extractChunkConcepts(doc, chunk, runner, options.promptConfig ? { promptConfig: options.promptConfig } : {});
    if (options.chunkCache) await options.chunkCache.put(chunk.chunkIndex, concepts);
    perChunk.push(concepts);
  }
  const concepts = await mergeConcepts(perChunk, runner);
  const map: ConceptMap = { sourceId: doc.sourceId, textHash: doc.textHash, concepts };
  if (unit) map.alignment = await alignConcepts(concepts, unit, runner);
  return ConceptMap.parse(map);
}
