import { createHash } from "node:crypto";
import { ingestAs, type SourceExtension } from "../ingest/ingest-source.js";
import type { SourceDocument, SourceKind } from "../ingest/source-document.js";
import type { ImportRecord, ImportStore } from "../store/types.js";
import { resolveScope, type ResolvedScope } from "./resolve.js";
import { ScopeRefusedError } from "./schema.js";

/** A scoped run's scope: the author's file (parsed JSON, validated here) and the source's own bytes. Nothing resolved is accepted. */
export interface ScopeInput { file: unknown; bytes: Buffer; ext: SourceExtension }

/**
 * The stored generationScope record (design §2.5): the payload, its hash, the configuration and every derived field
 * reports use that follows from the selection itself (counts, partial structures). Spelling-dependent notes (redundant
 * entries) are not part of it: equivalent spellings must resume, so they live with the entries history.
 */
export interface GenerationScopeRecord {
  payload: ResolvedScope["payload"]; scopeHash: string; previewConfig: ResolvedScope["previewConfig"];
  counts: ResolvedScope["counts"]; partial: ResolvedScope["partial"];
}
/** The append-only history of the author's spellings: each once, with its redundant-entry notes and when it was first used. Never compared for integrity. */
export interface GenerationScopeEntries { history: Array<{ include: unknown[]; exclude: unknown[]; redundant: string[]; firstUsedAt: string }> }

/** A stored scope record or stored source no longer matches what the bytes and scope file give: it was altered. */
export class ScopeIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "ScopeIntegrityError"; }
}

const KIND_OF: Record<SourceExtension, SourceKind> = { ".txt": "text", ".md": "markdown", ".pdf": "pdf", ".docx": "docx", ".odt": "odt" };
const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** The first path at which two JSON values differ ("sentences[5].charStart"), or null when they are equal. Key order is ignored. */
export function firstDifference(a: unknown, b: unknown, path = ""): string | null {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = i < a.length && i < b.length ? firstDifference(a[i], b[i], `${path}[${i}]`) : `${path}[${i}]`; if (d) return d; }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) { const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k); if (d) return d; }
    return null;
  }
  return path || "(the whole value)";
}

export function scopeRecord(scope: ResolvedScope): GenerationScopeRecord {
  return { payload: scope.payload, scopeHash: scope.scopeHash, previewConfig: scope.previewConfig, counts: scope.counts, partial: scope.partial };
}

/**
 * Validates a scoped run before anything is locked, written or dispatched (design §2.9), trusting nothing supplied:
 * the bytes must be the original (for DOCX and ODT, the same bytes as `original`) and of the source's kind; they are
 * re-read with the caller's sourceId and fileName, and the document given must agree with the re-read one in every
 * field; the scope is resolved against the re-read document; an explicit chunk size must equal previewConfig's.
 * Returns the authoritative document (the re-read one) and the resolved scope. Throws ScopeRefusedError otherwise.
 */
export async function authoritativeScope(source: SourceDocument, original: { bytes: Buffer } | undefined, input: ScopeInput, explicitChunkTokens: number | undefined): Promise<{ document: SourceDocument; scope: ResolvedScope }> {
  if (KIND_OF[input.ext] !== source.kind) throw new ScopeRefusedError([`the scope's bytes are given as ${input.ext}, but the source is ${source.kind}`]);
  const digest = sha256(input.bytes);
  if ((source.kind === "docx" || source.kind === "odt") && (!original || sha256(original.bytes) !== digest)) {
    throw new ScopeRefusedError([`the scope's bytes (sha256 ${digest}) are not the original (sha256 ${original ? sha256(original.bytes) : "none given"})`]);
  }
  const reread = await ingestAs(input.bytes, input.ext, { sourceId: source.sourceId, ...(source.metadata.fileName !== undefined ? { fileName: source.metadata.fileName } : {}) });
  const difference = firstDifference(JSON.parse(JSON.stringify(source)), JSON.parse(JSON.stringify(reread.document)));
  if (difference) throw new ScopeRefusedError([`the source document given differs from the one re-read from its bytes at ${difference}; give the document ingested from these bytes`]);
  const scope = resolveScope(input.file, reread);
  if (explicitChunkTokens !== undefined && explicitChunkTokens !== scope.previewConfig.chunkTokens) {
    throw new ScopeRefusedError([`the run's chunk size ${explicitChunkTokens} disagrees with the scope's previewConfig.chunkTokens ${scope.previewConfig.chunkTokens}; previews and requests must use the same configuration`]);
  }
  return { document: reread.document, scope };
}

type Cited = Array<{ evidence: Array<{ sentenceId: string; charStart: number; charEnd: number; quote: string }> }>;

/**
 * Every citation must name a sentence in `allowed`, and carry exactly that sentence's offsets and text from `document`:
 * a citation outside the scope, or one whose quote is not its sentence, is an error. Checked on every chunk's concepts
 * (extracted or cached) before merge and alignment, on the concept map before planning and production, and before a
 * regeneration produces (design §2.9).
 */
export function assertEvidenceWithin(concepts: Cited, allowed: ReadonlySet<string>, document: Pick<SourceDocument, "sentences">): void {
  const byId = new Map(document.sentences.map((s) => [s.sentenceId, s]));
  for (const c of concepts) {
    for (const e of c.evidence) {
      if (!allowed.has(e.sentenceId)) throw new Error(`evidence ${e.sentenceId} is outside the generation scope; nothing citing it is sent or stored`);
      const s = byId.get(e.sentenceId);
      if (!s || s.text !== e.quote || s.charStart !== e.charStart || s.charEnd !== e.charEnd) throw new Error(`evidence ${e.sentenceId} does not match the source sentence it names; nothing citing it is sent or stored`);
    }
  }
}

/** assertEvidenceWithin for a resolved scope. */
export function assertEvidenceInScope(concepts: Cited, scope: Pick<ResolvedScope, "sentences">, document: Pick<SourceDocument, "sentences">): void {
  assertEvidenceWithin(concepts, new Set(scope.sentences.map((s) => s.sentenceId)), document);
}

/**
 * Whether an import is scoped, from any of its independent marks: the scope hash on its import record, its stored
 * generationScope record, or its entries history. Removing one (or two) of them leaves the import scoped, so a missing
 * scope record is an altered import, never an unscoped one. An unscoped import has none of them.
 */
export async function scopedImport(store: ImportStore, importId: string, record: ImportRecord | null): Promise<boolean> {
  if (record?.generationScope) return true;
  return (await store.getArtifact(importId, "generationScope")) !== null || (await store.getArtifact(importId, "generationScopeEntries")) !== null;
}
