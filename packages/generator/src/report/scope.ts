import type { GenerationScopeRecord } from "../scope/authoritative.js";
import type { ImportRecord, ImportStore } from "../store/types.js";

/**
 * How reports state an import's generation scope (generation scope design §2.9): its hash and counts, never a heading,
 * a sentence or a partial structure's description, so the same figures serve sanitised outputs. Null for a
 * whole-document import. A scoped import whose stored record is missing, or is not the one its import record names,
 * keeps its identity with `counts: null` (and `scopeHash: null` when only the entries history is left).
 */
export interface ScopeFigures {
  scopeHash: string | null;
  counts: { sentences: number; documentSentences: number; passages: number; sourceCodePoints: number; partialStructures: number } | null;
}

/** Why a unit target with no supporting concept is not necessarily missing from the source, for a scoped import. */
export const SCOPE_UNSUPPORTED_NOTE = "this import was generated from selected source sections only, so these targets may fall outside the selected source scope rather than be absent from the source";

/**
 * The figures for an import from its record, its stored generationScope record and whether its entries history exists:
 * the same three independent marks that make an import scoped (scopedImport).
 */
export function scopeFigures(record: ImportRecord | null, stored: GenerationScopeRecord | null, entries: boolean): ScopeFigures | null {
  const marker = record?.generationScope?.scopeHash ?? null;
  if (stored && (marker === null || marker === stored.scopeHash)) {
    const c = stored.counts;
    return { scopeHash: stored.scopeHash, counts: { sentences: c.sentences, documentSentences: c.documentSentences, passages: c.passages, sourceCodePoints: c.sourceCodePoints, partialStructures: stored.partial.length } };
  }
  if (marker !== null || stored || entries) return { scopeHash: marker ?? stored?.scopeHash ?? null, counts: null };
  return null;
}

/** scopeFigures read from a store. */
export async function storedScopeFigures(store: ImportStore, importId: string): Promise<ScopeFigures | null> {
  return scopeFigures(await store.getImport(importId), await store.getArtifact<GenerationScopeRecord>(importId, "generationScope"), (await store.getArtifact(importId, "generationScopeEntries")) !== null);
}

/** The one line every report uses: "Generation scope: whole document", or the hash (first 12 characters) and counts. */
export function scopeLine(f: ScopeFigures | null): string {
  if (!f) return "Generation scope: whole document";
  const hash = f.scopeHash ? f.scopeHash.slice(0, 12) : "(hash unknown)";
  if (!f.counts) return `Generation scope ${hash}: the stored scope record is missing or altered; counts unavailable`;
  const c = f.counts;
  return `Generation scope ${hash}: ${c.sentences} of ${c.documentSentences} sentences in ${c.passages} passage(s), ${c.sourceCodePoints} code points of source text, ${c.partialStructures} partial structure(s)`;
}
