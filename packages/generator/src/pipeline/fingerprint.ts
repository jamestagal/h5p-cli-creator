import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "@leaplearn/shared";
import { textHash } from "../ingest/source-document.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { PlanRules } from "../plan/planner.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";

export const DEFAULT_CHUNK_TOKENS = 6000;

export interface FingerprintInput {
  sourceTextHash: string;
  /** The source document's metadata.extractionVersion: how its text was extracted and normalised. */
  extractionVersion: string;
  unitText: string | null; selectedTypes: readonly string[]; language: string;
  promptConfig: PromptConfig; customisation: string | null; chunkTokens: number; rules: PlanRules;
  /** A scoped run's scope (design §2.9): its hash, and the request configuration its preview was made with. Absent for a whole-document run. */
  generationScope?: { scopeHash: string; chunkTokens: number; scopedLayoutVersion: number };
}

/**
 * Everything that changes what the pipeline would produce for the same import id. Budget limits are excluded on purpose:
 * a resume may raise them. A generation scope adds a `generationScope` key; without one the material is exactly what it
 * was before scopes existed, so unscoped fingerprints never change.
 */
export function runFingerprint(input: FingerprintInput): string {
  const material = {
    v: 1,
    sourceTextHash: input.sourceTextHash,
    extractionVersion: input.extractionVersion,
    unitTextHash: input.unitText === null ? null : textHash(input.unitText.trim()),
    selectedTypes: [...input.selectedTypes].sort(),
    language: input.language,
    promptConfig: { readingLevel: input.promptConfig.readingLevel, tone: input.promptConfig.tone, language: input.promptConfig.language, instructionalLanguage: input.promptConfig.instructionalLanguage ?? null, customisation: input.promptConfig.customisation ?? null },
    customisation: input.customisation,
    chunkTokens: input.chunkTokens,
    rules: input.rules,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    models: MODEL_ROLES,
    profiles: REQUEST_PROFILES,
    ...(input.generationScope ? { generationScope: { scopeHash: input.generationScope.scopeHash, chunkTokens: input.generationScope.chunkTokens, scopedLayoutVersion: input.generationScope.scopedLayoutVersion } } : {})
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export class IncompatibleResumeError extends Error {
  constructor(importId: string, stored: string, current: string) {
    super(`import ${importId} was created with different inputs or configuration (fingerprint ${stored.slice(0, 12)}, now ${current.slice(0, 12)}); use a new output directory, or rerun with the original source, unit, types, language, prompt settings, chunking, plan rules and generation scope (or its absence)`);
    this.name = "IncompatibleResumeError";
  }
}
