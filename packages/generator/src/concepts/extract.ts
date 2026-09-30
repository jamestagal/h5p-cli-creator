import { CONCEPT_NAME_MAX, CONCEPT_SUMMARY_MAX, type Evidence } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import { reserveInputTokens } from "../llm/cost.js";
import { MAX_INPUT_TOKENS, modelForRole } from "../llm/models.js";
import type { ModelRequest } from "../llm/types.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt, DEFAULT_PROMPT_CONFIG, type PromptConfig } from "../prompts/system.js";
import { ConceptsOut, ConceptsOutSchema } from "../schemas/model-output.js";
import type { Chunk } from "./chunk.js";
import { evidenceForSentence, EvidenceMismatchError, verifyEvidence } from "./verify.js";

export interface ChunkConcept { tempId: string; name: string; summary: string; evidence: Evidence[]; }
export interface ExtractOptions { promptConfig?: PromptConfig; maxConceptsPerChunk?: number; }

const TASK = (max: number) => `Read the numbered EVIDENCE sentences. Identify the distinct concepts a learner must understand (at most ${max}). For each concept give a short name, a one-sentence summary in your own words, and the ids of the sentences that state or explain it. Choose only ids from the list. A sentence may support more than one concept.`;

/**
 * `[s3] text` per sentence. A sentence in a list gets `(list level n) ` before its text (n = depth + 1), because the
 * indentation that shows nesting in the stored text is trimmed from sentences. Plain sources have no list depth (and
 * documents stored before the field existed have none at all), so their lines are unchanged from phase 2.
 */
export function numberedSentences(chunk: Chunk): string {
  return chunk.sentences.map((s) => `[${s.sentenceId}] ${typeof s.listDepth === "number" ? `(list level ${s.listDepth + 1}) ` : ""}${s.text}`).join("\n");
}

const EXTRACT_MAX_OUTPUT_TOKENS = 3000;

/**
 * The section each run of sentences sits in, or "" when no sentence in the chunk has a heading path. PDF, text and
 * markdown sources have none, so their requests stay byte-identical to phase 2 (R12). Documents stored before heading
 * paths existed have no field at all and are treated the same way.
 */
function headingContext(chunk: Chunk): string {
  const runs: Array<{ path: string; ids: string[] }> = [];
  for (const s of chunk.sentences) {
    const path = (s.headingPath ?? []).join(" › ");
    if (runs.at(-1)?.path === path) runs.at(-1)!.ids.push(s.sentenceId); else runs.push({ path, ids: [s.sentenceId] });
  }
  if (runs.every((r) => r.path === "")) return "";
  return `\n\nHEADING CONTEXT (the section each sentence is in):\n${runs.map((r) => `- ${r.path === "" ? "(no heading)" : r.path}: ${r.ids.length === 1 ? r.ids[0] : `${r.ids[0]} to ${r.ids.at(-1)}`}`).join("\n")}`;
}

/** The complete extraction request for a chunk, exactly as dispatched: shared by the call and by the size check. */
export function extractionRequest(chunk: Chunk, options: ExtractOptions): ModelRequest {
  const max = options.maxConceptsPerChunk ?? 8;
  return { purpose: "extract", model: modelForRole("extract"), system: buildSystemPrompt(options.promptConfig ?? DEFAULT_PROMPT_CONFIG), user: `${TASK(max)}${headingContext(chunk)}\n\nEVIDENCE:\n${numberedSentences(chunk)}`, maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS, outputSchema: ConceptsOutSchema };
}

/** An extraction request (estimated as the budget reservation estimates it, plus its output allowance) larger than the model's input limit. */
export class RequestTooLargeError extends Error {
  constructor(readonly sentenceId: string, readonly estimatedInputTokens: number, readonly maxOutputTokens: number, readonly limit: number) {
    super(`the extraction request for the chunk holding ${sentenceId} is about ${estimatedInputTokens} input tokens plus ${maxOutputTokens} output tokens, above the model's limit of ${limit}; shorten that sentence in the source`);
    this.name = "RequestTooLargeError";
  }
}

/** Refuses, before any dispatch, a chunk whose complete extraction request would not fit the extract model's input limit (R14). */
export function assertExtractionRequestsFit(chunks: Chunk[], options: ExtractOptions = {}): void {
  for (const chunk of chunks) {
    const request = extractionRequest(chunk, options);
    const estimatedInputTokens = reserveInputTokens(request);
    const limit = MAX_INPUT_TOKENS[request.model];
    if (estimatedInputTokens + request.maxOutputTokens > limit) {
      const largest = chunk.sentences.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      throw new RequestTooLargeError(largest.sentenceId, estimatedInputTokens, request.maxOutputTokens, limit);
    }
  }
}

export async function extractChunkConcepts(doc: SourceDocument, chunk: Chunk, runner: StageRunner, options: ExtractOptions = {}): Promise<ChunkConcept[]> {
  const max = options.maxConceptsPerChunk ?? 8;
  const allowed = new Set(chunk.sentences.map((s) => s.sentenceId));
  const { value } = await runner.run({
    key: `extract:chunk-${chunk.chunkIndex}`,
    request: extractionRequest(chunk, options),
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
