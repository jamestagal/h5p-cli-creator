import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTRACTION_VERSION, ingestDocx, ingestMarkdown, ingestOdt, ingestPdf, ingestSource, ingestText, SOURCE_EXTENSIONS, UnsupportedSourceError } from "../src/ingest/index.js";
import { fixtures } from "./helpers/synthetic.js";

const structure = resolve(import.meta.dirname, "fixtures/structure");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("ingestSource: one entry point for every format, with the original's hash and the source analysis", () => {
  it("dispatches by extension (case-insensitive) to the same adapter output, hashing the bytes for every format", async () => {
    const md = await readFile(resolve(fixtures, "source-electrical-safety.md"));
    const pdf = await readFile(resolve(fixtures, "source-electrical-safety.pdf"));
    const docx = await readFile(resolve(structure, "structure.docx"));
    const odt = await readFile(resolve(structure, "structure.odt"));
    const opts = (fileName: string) => ({ sourceId: `src-${fileName}`, fileName });
    const cases = [
      { fileName: "a.TXT", bytes: md, kind: "text", extractor: "text", expected: await ingestText(md.toString("utf8"), opts("a.TXT")) },
      { fileName: "a.md", bytes: md, kind: "markdown", extractor: "markdown", expected: await ingestMarkdown(md.toString("utf8"), opts("a.md")) },
      { fileName: "a.pdf", bytes: pdf, kind: "pdf", extractor: "pdf", expected: await ingestPdf(pdf, opts("a.pdf")) },
      { fileName: "a.docx", bytes: docx, kind: "docx", extractor: "docx", expected: (await ingestDocx(docx, opts("a.docx"))).document },
      { fileName: "a.odt", bytes: odt, kind: "odt", extractor: "odt", expected: (await ingestOdt(odt, opts("a.odt"))).document }
    ] as const;
    for (const c of cases) {
      const r = await ingestSource(c.bytes, c.fileName);
      expect(r.document, c.fileName).toEqual(c.expected);
      expect(r.document.kind).toBe(c.kind);
      expect(r.extractor).toBe(c.extractor);
      expect(r.originalSha256).toBe(sha(c.bytes));
      expect(r.analysis.textHash).toBe(r.document.textHash);
      expect(r.analysis.extractionVersion).toBe(EXTRACTION_VERSION);
      if (c.kind === "docx" || c.kind === "odt") {
        expect(r.document.metadata.originalSha256).toBe(r.originalSha256);
        expect(r.analysis.headings.length).toBeGreaterThan(0);
      } else {
        expect(r.analysis).toMatchObject({ headings: [], structures: [], generated: [], originFallbacks: [] });
        expect(r.tables).toEqual([]);
      }
    }
  });

  it("uses the given sourceId, or src-<file name> by default", async () => {
    const md = await readFile(resolve(fixtures, "source-electrical-safety.md"));
    expect((await ingestSource(md, "unit.md")).document.sourceId).toBe("src-unit.md");
    expect((await ingestSource(md, "unit.md", { sourceId: "custom" })).document.sourceId).toBe("custom");
  });

  it("refuses an unknown extension before reading anything, listing the accepted ones", async () => {
    await expect(ingestSource(Buffer.from("x"), "notes.rtf")).rejects.toBeInstanceOf(UnsupportedSourceError);
    await expect(ingestSource(Buffer.from("x"), "notes")).rejects.toThrow(`use one of ${SOURCE_EXTENSIONS.join(", ")}`);
  });
});
