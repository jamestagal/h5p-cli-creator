import { chunkScopedSentences, type Chunk } from "../concepts/chunk.js";
import { renderEvidence } from "../concepts/extract.js";
import type { ResolvedScope } from "./resolve.js";

/** The scope's extraction chunks, packed with its previewConfig.chunkTokens (design §2.6). Preview and generation both use these. */
export function chunkScope(scope: Pick<ResolvedScope, "sentences" | "gapsBefore" | "previewConfig">): Chunk[] {
  return chunkScopedSentences(scope.sentences, scope.gapsBefore, scope.previewConfig.chunkTokens);
}

/** Each chunk's evidence text exactly as its extraction request carries it (renderEvidence): what `leap scope` previews. */
export function renderScopedEvidence(scope: Pick<ResolvedScope, "sentences" | "gapsBefore" | "previewConfig">): string[] {
  return chunkScope(scope).map(renderEvidence);
}
