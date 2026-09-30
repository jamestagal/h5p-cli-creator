import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { ingestDocx, ingestMarkdown, ingestOdt, ingestPdf, ingestText, type IngestWarnings, type SourceDocument, type TableSummary } from "@leaplearn/generator";

/** The source formats `leap generate` and `leap extract` accept, by extension. */
export const SOURCE_EXTENSIONS = [".txt", ".md", ".pdf", ".docx", ".odt"] as const;

export class UnsupportedSourceError extends Error {
  constructor(path: string) {
    super(`${basename(path)}: unsupported source type "${extname(path) || "(no extension)"}"; use one of ${SOURCE_EXTENSIONS.join(", ")}`);
    this.name = "UnsupportedSourceError";
  }
}

export interface LoadedSource {
  document: SourceDocument;
  /** Structured sources (DOCX, ODT) report numbering and label-reference warnings and their tables; other sources have none. */
  warnings: IngestWarnings;
  tables: TableSummary[];
  /** The sha256 of the file's bytes, for every source type. */
  originalSha256: string;
  /** The adapter that read the file: "docx", "odt", "pdf", "markdown" or "text". */
  extractor: string;
}

const NO_WARNINGS = (): IngestWarnings => ({ listNumberingSimplified: [], numberingUnsupported: [], labelLikeReferences: [] });

/** Reads and ingests a source file by its extension (case-insensitive). Admission errors propagate; an unknown extension throws UnsupportedSourceError before the file is read. */
export async function loadSource(path: string): Promise<LoadedSource> {
  const sourcePath = resolve(path);
  const ext = extname(sourcePath).toLowerCase();
  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(ext)) throw new UnsupportedSourceError(sourcePath);
  const bytes = await readFile(sourcePath);
  const opts = { sourceId: `src-${basename(sourcePath)}`, fileName: basename(sourcePath) };
  const originalSha256 = createHash("sha256").update(bytes).digest("hex");
  if (ext === ".docx" || ext === ".odt") {
    const { document, warnings, tables } = ext === ".docx" ? await ingestDocx(bytes, opts) : await ingestOdt(bytes, opts);
    return { document, warnings, tables, originalSha256, extractor: ext.slice(1) };
  }
  const document = ext === ".pdf" ? await ingestPdf(bytes, opts) : ext === ".md" ? await ingestMarkdown(bytes.toString("utf8"), opts) : await ingestText(bytes.toString("utf8"), opts);
  return { document, warnings: NO_WARNINGS(), tables: [], originalSha256, extractor: document.kind };
}

/** One line summarising a structured source's warnings, or null when there are none. */
export function warningSummary(w: IngestWarnings): string | null {
  const parts = [
    w.listNumberingSimplified.length > 0 ? `${w.listNumberingSimplified.length} list(s) with simplified numbering` : "",
    w.numberingUnsupported.length > 0 ? `${w.numberingUnsupported.length} paragraph(s) with numbering that is not rendered` : "",
    w.labelLikeReferences.length > 0 ? `${w.labelLikeReferences.length} sentence(s) that look like list-label references` : ""
  ].filter(Boolean);
  return parts.length === 0 ? null : `source warnings: ${parts.join("; ")}; run leap extract to review them`;
}
