import { CONCEPT_NAME_MAX, CONCEPT_SUMMARY_MAX, type Evidence } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt, DEFAULT_PROMPT_CONFIG, type PromptConfig } from "../prompts/system.js";
import { ConceptsOut, ConceptsOutSchema } from "../schemas/model-output.js";
import type { Chunk } from "./chunk.js";
import { evidenceForSentence, EvidenceMismatchError, verifyEvidence } from "./verify.js";

export interface ChunkConcept { tempId: string; name: string; summary: string; evidence: Evidence[]; }
export interface ExtractOptions { promptConfig?: PromptConfig; maxConceptsPerChunk?: number; }

const TASK = (max: number) => `Read the numbered EVIDENCE sentences. Identify the distinct concepts a learner must understand (at most ${max}). For each concept give a short name, a one-sentence summary in your own words, and the ids of the sentences that state or explain it. Choose only ids from the list. A sentence may support more than one concept.`;

export function numberedSentences(chunk: Chunk): string {
  return chunk.sentences.map((s) => `[${s.sentenceId}] ${s.text}`).join("\n");
}

export async function extractChunkConcepts(doc: SourceDocument, chunk: Chunk, runner: StageRunner, options: ExtractOptions = {}): Promise<ChunkConcept[]> {
  const max = options.maxConceptsPerChunk ?? 8;
  const allowed = new Set(chunk.sentences.map((s) => s.sentenceId));
  const { value } = await runner.run({
    key: `extract:chunk-${chunk.chunkIndex}`,
    request: { purpose: "extract", model: modelForRole("extract"), system: buildSystemPrompt(options.promptConfig ?? DEFAULT_PROMPT_CONFIG), user: `${TASK(max)}\n\nEVIDENCE:\n${numberedSentences(chunk)}`, maxOutputTokens: 3000, outputSchema: ConceptsOutSchema },
    schema: ConceptsOut,
    verify: (out) => {
      const issues: string[] = [];
      if (out.concepts.length === 0) issues.push("no concepts were returned; return at least one concept supported by the evidence");
      if (out.concepts.length > max) issues.push(`${out.concepts.length} concepts returned; at most ${max}`);
      out.concepts.forEach((c, i) => {
        const label = c.name.trim() || `concept ${i + 1}`;
        if (!c.name.trim()) issues.push(`concept ${i + 1} has an empty name`);
        else if (c.name.trim().length > CONCEPT_NAME_MAX) issues.push(`concept "${label}" name is longer than ${CONCEPT_NAME_MAX} characters`);
        if (!c.summary.trim()) issues.push(`concept "${label}" has an empty summary`);
        else if (c.summary.trim().length > CONCEPT_SUMMARY_MAX) issues.push(`concept "${label}" summary is longer than ${CONCEPT_SUMMARY_MAX} characters`);
        if (c.sentenceIds.length === 0) issues.push(`concept "${label}" cites no sentences`);
        for (const id of c.sentenceIds) if (!allowed.has(id)) issues.push(`concept "${label}" cites ${id}, which is not in the evidence list`);
      });
      return issues;
    }
  });
  return value.concepts.map((c, i) => {
    const evidence = [...new Set(c.sentenceIds)].map((id) => evidenceForSentence(doc, id));
    for (const e of evidence) { const bad = verifyEvidence(doc.text, e); if (bad) throw new EvidenceMismatchError(bad); }
    return { tempId: `k${chunk.chunkIndex}-${i}`, name: c.name.trim(), summary: c.summary.trim(), evidence };
  });
}
