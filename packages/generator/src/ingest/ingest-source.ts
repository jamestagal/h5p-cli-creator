import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { sourceAnalysis, type SourceAnalysis } from "./analysis.js";
import { ingestDocx, type IngestWarnings } from "./docx.js";
import { ingestOdt } from "./odt.js";
import { ingestPdf } from "./pdf.js";
import type { IngestOptions, SourceDocument } from "./source-document.js";
import type { TableSummary } from "./structure/linearize.js";
import { ingestMarkdown, ingestText } from "./text.js";

/** The source formats `leap generate`, `leap extract` and `leap outline` accept, by extension. */
export const SOURCE_EXTENSIONS = [".txt", ".md", ".pdf", ".docx", ".odt"] as const;
export type SourceExtension = (typeof SOURCE_EXTENSIONS)[number];

export class UnsupportedSourceError extends Error {
  constructor(path: string) {
    super(`${basename(path)}: unsupported source type "${extname(path) || "(no extension)"}"; use one of ${SOURCE_EXTENSIONS.join(", ")}`);
    this.name = "UnsupportedSourceError";
  }
}

export interface IngestedSource {
  document: SourceDocument;
  /** Headings, structures and character origin, bound to `document` (empty for text, markdown and PDF sources). */
  analysis: SourceAnalysis;
  /** Structured sources (DOCX, ODT) report numbering and label-reference warnings and their tables; other sources have none. */
  warnings: IngestWarnings;
  tables: TableSummary[];
  /** The sha256 of the bytes as given, for every format (DOCX and ODT documents also carry it in their metadata). */
  originalSha256: string;
  /** The adapter that read the file: "docx", "odt", "pdf", "markdown" or "text". */
  extractor: string;
  ext: SourceExtension;
}

const NO_WARNINGS = (): IngestWarnings => ({ listNumberingSimplified: [], numberingUnsupported: [], labelLikeReferences: [] });

/**
 * The one ingest entry point by format: the extension of `fileName` (case-insensitive) picks the adapter, and an
 * unknown extension throws UnsupportedSourceError before the bytes are read. Admission errors propagate. The document
 * is exactly what that adapter produces; the source analysis is computed beside it.
 */
export async function ingestSource(bytes: Buffer, fileName: string, opts: { sourceId?: string } = {}): Promise<IngestedSource> {
  const ext = extname(fileName).toLowerCase() as SourceExtension;
  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(ext)) throw new UnsupportedSourceError(fileName);
  const name = basename(fileName);
  return ingestAs(bytes, ext, { sourceId: opts.sourceId ?? `src-${name}`, fileName: name });
}

/**
 * Ingests bytes with the adapter for `ext`, with exactly the given IngestOptions (a fileName may be absent). runImport
 * re-reads a scoped run's bytes with this, using the caller's own sourceId and fileName, so the document it builds is
 * comparable field for field with the one it was given.
 */
export async function ingestAs(bytes: Buffer, ext: SourceExtension, ingestOpts: IngestOptions): Promise<IngestedSource> {
  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(ext)) throw new UnsupportedSourceError(`source${ext}`);
  const originalSha256 = createHash("sha256").update(bytes).digest("hex");
  if (ext === ".docx" || ext === ".odt") {
    const r = ext === ".docx" ? await ingestDocx(bytes, ingestOpts) : await ingestOdt(bytes, ingestOpts);
    return { document: r.document, analysis: r.analysis, warnings: r.warnings, tables: r.tables, originalSha256, extractor: ext.slice(1), ext };
  }
  const document = ext === ".pdf" ? await ingestPdf(bytes, ingestOpts) : ext === ".md" ? await ingestMarkdown(bytes.toString("utf8"), ingestOpts) : await ingestText(bytes.toString("utf8"), ingestOpts);
  return { document, analysis: sourceAnalysis(document, null), warnings: NO_WARNINGS(), tables: [], originalSha256, extractor: document.kind, ext };
}
