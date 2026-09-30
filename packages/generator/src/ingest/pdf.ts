import { PDFParse } from "pdf-parse";
import { admitSource, MAX_PDF_PAGES, normaliseSourceText, PdfTooManyPagesError } from "./admit.js";
import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

/**
 * Text layer only (spec: no OCR). Scanned PDFs come back empty and are rejected as empty sources. The page count is
 * read from the document (getInfo, no page text) and a PDF over 100 pages is refused before any text is extracted.
 */
export async function ingestPdf(bytes: Buffer, opts: IngestOptions): Promise<SourceDocument> {
  const parser = new PDFParse({ data: bytes });
  try {
    const { total: pages } = await parser.getInfo();
    if (pages > MAX_PDF_PAGES) throw new PdfTooManyPagesError(pages);

    const result = await parser.getText();
    const text = normaliseSourceText(result.text);
    admitSource(text);
    return buildDocument("pdf", text, opts, { pages });
  } finally {
    await parser.destroy();
  }
}
