import { PDFParse } from "pdf-parse";
import { admitSource, MAX_PDF_PAGES, normaliseSourceText, PdfTooManyPagesError } from "./admit.js";
import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

/**
 * Text layer only (spec: no OCR). Scanned PDFs come back empty and are rejected as empty sources. The page count is
 * read from the document (getInfo, no page text) and a PDF over 100 pages is refused before any text is extracted.
 * The stored text is the pages' own text, joined with a blank line; the parser's page labels are never part of it.
 */
export async function ingestPdf(bytes: Buffer, opts: IngestOptions): Promise<SourceDocument> {
  const parser = new PDFParse({ data: bytes });
  try {
    const { total: pages } = await parser.getInfo();
    if (pages > MAX_PDF_PAGES) throw new PdfTooManyPagesError(pages);

    // Only the pages' own text: result.text also carries the page labels pdf-parse inserts between pages
    // ("-- 1 of 2 --"), which are not source content and must not count towards admission or become sentences.
    const result = await parser.getText();
    const text = normaliseSourceText(result.pages.map((page) => page.text).join("\n\n"));
    admitSource(text);
    return buildDocument("pdf", text, opts, { pages });
  } finally {
    await parser.destroy();
  }
}
