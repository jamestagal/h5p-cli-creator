import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { ingestSource, SOURCE_EXTENSIONS, UnsupportedSourceError, type IngestedSource } from "@leaplearn/generator";

export { SOURCE_EXTENSIONS, UnsupportedSourceError } from "@leaplearn/generator";

/** An ingested source (ingestSource) and the file's bytes as read: the original a DOCX or ODT import stores. */
export interface LoadedSource extends IngestedSource { bytes: Buffer }

/** Reads and ingests a source file by its extension (case-insensitive). Admission errors propagate; an unknown extension throws UnsupportedSourceError before the file is read. */
export async function loadSource(path: string): Promise<LoadedSource> {
  const sourcePath = resolve(path);
  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(extname(sourcePath).toLowerCase())) throw new UnsupportedSourceError(sourcePath);
  const bytes = await readFile(sourcePath);
  return { ...(await ingestSource(bytes, basename(sourcePath))), bytes };
}

/** One line summarising a structured source's warnings, or null when there are none. */
export function warningSummary(w: IngestedSource["warnings"]): string | null {
  const parts = [
    w.listNumberingSimplified.length > 0 ? `${w.listNumberingSimplified.length} list(s) with simplified numbering` : "",
    w.numberingUnsupported.length > 0 ? `${w.numberingUnsupported.length} paragraph(s) with numbering that is not rendered` : "",
    w.labelLikeReferences.length > 0 ? `${w.labelLikeReferences.length} sentence(s) that look like list-label references` : ""
  ].filter(Boolean);
  return parts.length === 0 ? null : `source warnings: ${parts.join("; ")}; run leap extract to review them`;
}
