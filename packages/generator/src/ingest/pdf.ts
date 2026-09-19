import { PDFParse } from "pdf-parse";
import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

/** Text layer only (spec: no OCR). Scanned PDFs come back empty and are rejected as empty sources. */
export async function ingestPdf(bytes: Buffer, opts: IngestOptions): Promise<SourceDocument> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return buildDocument("pdf", result.text, opts, { pages: result.total });
  } finally {
    await parser.destroy();
  }
}
