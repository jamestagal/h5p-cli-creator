import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EXTRACTION_VERSION, ingestDocx, normaliseSourceText } from "../src/ingest/index.js";

const dir = resolve(import.meta.dirname, "fixtures/structure");
const opts = { sourceId: "src-docx", fileName: "structure.docx" };
const load = async () => { const bytes = await readFile(resolve(dir, "structure.docx")); return { bytes, result: await ingestDocx(bytes, opts) }; };

describe("ingestDocx on the synthetic structure fixture", () => {
  it("matches the golden linearized text exactly", async () => {
    const { result } = await load();
    expect(result.document.text).toBe(await readFile(resolve(dir, "structure.docx.golden.txt"), "utf8"));
  });

  it("drops the tracked deletion and keeps the insertion", async () => {
    const { result } = await load();
    expect(result.document.text).toContain("The sample size is forty items for each branch.");
    expect(result.document.text).not.toContain("twenty");
  });

  it("records the extractor, the extraction version and the sha256 of the original bytes", async () => {
    const { bytes, result } = await load();
    expect(result.document.kind).toBe("docx");
    expect(result.document.metadata).toMatchObject({ extractor: "docx", extractionVersion: EXTRACTION_VERSION, originalSha256: createHash("sha256").update(bytes).digest("hex"), fileName: "structure.docx" });
  });

  it("citations slice back: the text is normalised, every sentence slices exactly, and the Vietnamese is NFC", async () => {
    const { result } = await load();
    const doc = result.document;
    expect(normaliseSourceText(doc.text)).toBe(doc.text);
    expect(doc.text).toBe(doc.text.normalize("NFC"));
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    expect(doc.sentences.some((s) => s.text === "Kiểm toán viên phải ghi chép đầy đủ bằng chứng kiểm toán.")).toBe(true);
    expect(doc.sentences.find((s) => s.text.startsWith("[Table 2, row 3]"))).toMatchObject({ atomic: true, headingPath: ["Audit fundamentals", "Recording results"] });
  });

  it("keeps structure as metadata: heading paths, list depths and atomic rows", async () => {
    const { result } = await load();
    const s = (prefix: string) => result.document.sentences.find((x) => x.text.startsWith(prefix))!;
    expect(s("1. Agree the scope")).toMatchObject({ listDepth: 0, headingPath: ["Audit fundamentals", "Planning the audit"] });
    expect(s("1. Confirm the branches")).toMatchObject({ listDepth: 1 });
    expect(result.document.sentences.filter((x) => x.atomic)).toHaveLength(5);
  });

  it("warns about simplified numbering and label-like references", async () => {
    const { result } = await load();
    expect(result.warnings.listNumberingSimplified).toEqual([{ listIndex: 2, headingPath: ["Audit fundamentals", "Planning the audit"], originalFormats: ["lowerLetter"] }]);
    const ref = result.document.sentences.find((x) => x.text.startsWith("The reperformance described in item b) above"))!;
    expect(result.warnings.labelLikeReferences).toEqual([{ sentenceId: ref.sentenceId, headingPath: ["Audit fundamentals", "Planning the audit"], text: ref.text }]);
  });

  it("the fixture is reproducible from its checked-in script", async () => {
    const { bytes } = await load();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("d452303ccd63fbe3a241561aa1fdf25f7aa7ac53c7e0a786cc7bb318730d1e0e");
  });
});
