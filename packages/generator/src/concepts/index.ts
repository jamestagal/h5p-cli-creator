import { ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import type { StageRunner } from "../llm/runner.js";
import type { PromptConfig } from "../prompts/system.js";
import { alignConcepts } from "./align.js";
import { chunkSentences } from "./chunk.js";
import { extractChunkConcepts } from "./extract.js";
import { mergeConcepts } from "./merge.js";

export * from "./chunk.js"; export * from "./verify.js"; export * from "./extract.js"; export * from "./merge.js"; export * from "./align.js";

export interface ConceptMapOptions { chunkTokens?: number; promptConfig?: PromptConfig; }

/** Chunks → per-chunk extraction (sequential; the pipeline persists progress per chunk) → merge → align. */
export async function extractConceptMap(doc: SourceDocument, unit: UnitOfCompetency | null, runner: StageRunner, options: ConceptMapOptions = {}): Promise<ConceptMap> {
  const chunks = chunkSentences(doc.sentences, options.chunkTokens ?? 6000);
  const perChunk = [];
  for (const chunk of chunks) perChunk.push(await extractChunkConcepts(doc, chunk, runner, options.promptConfig ? { promptConfig: options.promptConfig } : {}));
  const concepts = await mergeConcepts(perChunk, runner);
  const map: ConceptMap = { sourceId: doc.sourceId, textHash: doc.textHash, concepts };
  if (unit) map.alignment = await alignConcepts(concepts, unit, runner);
  return ConceptMap.parse(map);
}
