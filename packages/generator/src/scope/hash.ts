import { createHash } from "node:crypto";

export const SCOPE_HASH_VERSION = 1;

/** What a scope is bound to: the original's bytes, the text extracted from them, and how it was extracted. */
export interface ScopeBinding { originalSha256: string; textHash: string; extractionVersion: string }
/** A maximal run of document-adjacent selected sentences. */
export interface ScopePassage { sentenceIds: string[] }
/** A run of a passage's sentences under one heading path: the heading context models are given, independent of chunking. */
export interface ScopeContextRun { passage: number; from: string; to: string; headingPath: string[] }
/** The canonical payload `scopeHash` is the sha256 of (design §2.5): what models are given, never how it was spelt. */
export interface ScopePayload { scopeHashVersion: number; scopeFormat: number; binding: ScopeBinding; passages: ScopePassage[]; context: ScopeContextRun[] }

/** The payload, built field by field so its JSON key order is fixed. */
export function scopePayload(binding: ScopeBinding, passages: ScopePassage[], context: ScopeContextRun[], scopeFormat = 1): ScopePayload {
  return {
    scopeHashVersion: SCOPE_HASH_VERSION,
    scopeFormat,
    binding: { originalSha256: binding.originalSha256, textHash: binding.textHash, extractionVersion: binding.extractionVersion },
    passages: passages.map((p) => ({ sentenceIds: [...p.sentenceIds] })),
    context: context.map((c) => ({ passage: c.passage, from: c.from, to: c.to, headingPath: [...c.headingPath] }))
  };
}

/** sha256 (hex) of the payload's JSON (no whitespace), as UTF-8. */
export function scopeHashOf(payload: ScopePayload): string {
  const canonical = scopePayload(payload.binding, payload.passages, payload.context, payload.scopeFormat);
  return createHash("sha256").update(JSON.stringify({ ...canonical, scopeHashVersion: payload.scopeHashVersion }), "utf8").digest("hex");
}
