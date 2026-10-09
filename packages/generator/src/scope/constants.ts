import { DEFAULT_CHUNK_TOKENS } from "../pipeline/fingerprint.js";
import type { IngestedSource } from "../ingest/ingest-source.js";

/** The generation-scope file format (design §2.5). An unknown value is refused. */
export const SCOPE_FORMAT = 1;
/** The scoped request layout (gap markers, scope lines, gap-aware heading context; design §2.6). An unknown value is refused. */
export const SCOPED_LAYOUT_VERSION = 1;

/** The generation-scope.json template `leap outline` writes: bound to the source, nothing selected, the default preview configuration. */
export function scopeTemplate(source: Pick<IngestedSource, "document" | "originalSha256">, fileName: string): Record<string, unknown> {
  return {
    kind: "leap.generationScope", scopeFormat: SCOPE_FORMAT,
    source: { fileName, originalSha256: source.originalSha256, textHash: source.document.textHash, extractionVersion: source.document.metadata.extractionVersion },
    include: [], exclude: [],
    previewConfig: { chunkTokens: DEFAULT_CHUNK_TOKENS, scopedLayoutVersion: SCOPED_LAYOUT_VERSION }
  };
}
