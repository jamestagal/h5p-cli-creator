import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EXTRACTION_VERSION, htmlToBlocks, ingestDocx, normaliseSourceText } from "../src/ingest/index.js";
import { linearize } from "../src/ingest/structure/linearize.js";
import { normaliseBlocks } from "../src/ingest/structure/blocks.js";
import { ABSTRACT_NUMS, BODY, NUMS, STYLES, heading, item, p, para, run, structureParts, tbl, tc, tr, zipDocx } from "./fixtures/structure/docx-builder.mjs";

const dir = resolve(import.meta.dirname, "fixtures/structure");
const opts = { sourceId: "src-docx", fileName: "structure.docx" };
const load = async () => { const bytes = await readFile(resolve(dir, "structure.docx")); return { bytes, result: await ingestDocx(bytes, opts) }; };
const FILLER = para("This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim());
/** A variant of the fixture: `body` replaces the document body (filler added for admission); the other parts default to the fixture's. */
const variant = async (body: string[], parts: Parameters<typeof structureParts>[0] = {}) => ingestDocx(await zipDocx(structureParts({ ...parts, body: [...body, FILLER] })), opts);
const linesOf = (text: string) => text.split("\n");
/** The id of the sentence with exactly this text (the locator's expected firstSentenceId). */
const idOf = (doc: { sentences: Array<{ sentenceId: string; text: string }> }, text: string) => doc.sentences.find((s) => s.text === text)!.sentenceId;

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
    expect(result.document.sentences.filter((x) => x.atomic)).toHaveLength(6);
  });

  it("warns about simplified numbering and label-like references, and reports no unsupported numbering", async () => {
    const { result } = await load();
    expect(result.warnings.listNumberingSimplified).toEqual([{ listIndex: 2, headingPath: ["Audit fundamentals", "Planning the audit"], originalFormats: ["lowerLetter"], itemCount: 2, firstItemText: "Inspect the records", firstSentenceId: idOf(result.document, "1. Inspect the records") }]);
    expect(result.warnings.numberingUnsupported).toEqual([]);
    const ref = result.document.sentences.find((x) => x.text.startsWith("The reperformance described in item b) above"))!;
    expect(result.warnings.labelLikeReferences).toEqual([{ sentenceId: ref.sentenceId, headingPath: ["Audit fundamentals", "Planning the audit"], text: ref.text }]);
  });

  it("the committed fixture is byte-identical to one regenerated from docx-builder.mjs", async () => {
    const { bytes } = await load();
    const regenerated = await zipDocx(structureParts());
    expect(regenerated.equals(bytes)).toBe(true);
  });
});

describe("notes keep their structured content (footnotes and endnotes)", () => {
  it("a footnote's paragraphs and nested list follow the citing paragraph, in order, each line marked with the note", async () => {
    const { result } = await load();
    const lines = linesOf(result.document.text);
    const at = lines.indexOf("Evidence must be sufficient and appropriate for the opinion given.[1] It is gathered throughout the engagement.");
    expect(lines.slice(at + 1, at + 6)).toEqual([
      "[Note 1] As defined in the synthetic auditing standard used for these tests, which requires:",
      "[Note 1] • a written plan",
      "[Note 1]   • approved by the engagement partner",
      "[Note 1] • a record of the evidence",
      "[Note 1] Other standards may differ."
    ]);
    const s = (text: string) => result.document.sentences.find((x) => x.text === text)!;
    expect(s("[Note 1] • a written plan")).toMatchObject({ listDepth: 0, headingPath: ["Audit fundamentals", "Planning the audit"] });
    expect(s("[Note 1]   • approved by the engagement partner")).toMatchObject({ listDepth: 1 });
    expect(result.document.text).not.toContain("↑");
  });

  it("an endnote's numbered list and table are kept, the table rows atomic", async () => {
    const { result } = await load();
    const lines = linesOf(result.document.text);
    expect(lines.slice(-4)).toEqual(["[Note 3] The committee's timetable is set out below.", "[Note 3] 1. Draft report", "[Note 3] 2. Final report", "[Note 3, table 1, row 1] Stage: Draft; Days: 5"]);
    expect(result.document.sentences.find((x) => x.text === "[Note 3] 2. Final report")).toMatchObject({ listDepth: 0 });
    expect(result.document.sentences.find((x) => x.text.startsWith("[Note 3, table 1, row 1]"))).toMatchObject({ atomic: true });
  });

  it("a note cited in a table cell keeps its list, inline in the atomic row", async () => {
    const { result } = await load();
    expect(result.document.sentences.find((x) => x.text.startsWith("[Table 1, row 2]"))).toMatchObject({
      atomic: true, text: "[Table 1, row 2] Column 1: Period; Column 2: FY2026 [2] [Note 2] The period runs from 1 July to 30 June. • Interim work in March"
    });
  });
});

describe("block content inside list items is never dropped", () => {
  it("a table or paragraph inside a list item follows the item as blocks", () => {
    const blocks = normaliseBlocks(htmlToBlocks("<ol><li>Lock the isolator<table><tr><td><p>Key</p></td><td><p>Supervisor</p></td></tr></table><p>Then tag it.</p><ul><li>Padlock</li></ul></li><li>Test</li></ol>"));
    expect(linearize(blocks).text.split("\n")).toEqual(["1. Lock the isolator", "[Table 1, row 1] Column 1: Key; Column 2: Supervisor", "Then tag it.", "  • Padlock", "2. Test"]);
  });

  it("inside a table cell the same content stays in the row", () => {
    const blocks = normaliseBlocks(htmlToBlocks("<table><tr><td><p>Steps</p></td><td><ul><li>Lock<table><tr><td><p>Key</p></td></tr></table></li></ul></td></tr></table>"));
    expect(linearize(blocks).text).toBe("[Table 1, row 1] Column 1: Steps; Column 2: • Lock [Table 1.1 row 1: Column 1: Key]");
  });
});

describe("effective numbering (level overrides, paragraph styles, numbering styles)", () => {
  const letterOverride = `<w:num w:numId="6"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1)"/></w:lvl></w:lvlOverride></w:num>`;
  const bulletOverride = `<w:num w:numId="7"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:lvlOverride></w:num>`;
  const listStyle = (id: string, numId: string, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:pPr>${extra}<w:numPr><w:numId w:val="${numId}"/></w:numPr></w:pPr></w:style>`;
  const styled = (style: string, text: string, props = "") => p(run(text), `<w:pStyle w:val="${style}"/>${props}`);

  it("a lowerLetter format supplied by w:lvlOverride is reported as simplified", async () => {
    const r = await variant([heading(1, "Overrides"), item(6, 0, "Inspect"), item(6, 0, "Reperform")], { nums: [...NUMS, letterOverride] });
    expect(linesOf(r.document.text).slice(1, 3)).toEqual(["1. Inspect", "2. Reperform"]);
    expect(r.warnings.listNumberingSimplified).toEqual([{ listIndex: 1, headingPath: ["Overrides"], originalFormats: ["lowerLetter"], itemCount: 2, firstItemText: "Inspect", firstSentenceId: idOf(r.document, "1. Inspect") }]);
  });

  it("a level override is what mammoth renders: a bullet override on a decimal list gives bullets", async () => {
    const r = await variant([item(7, 0, "Padlock"), item(7, 0, "Hasp")], { nums: [...NUMS, bulletOverride] });
    expect(linesOf(r.document.text).slice(0, 2)).toEqual(["• Padlock", "• Hasp"]);
    expect(r.warnings.listNumberingSimplified).toEqual([]);
  });

  it("numbering inherited from a paragraph style, directly or through basedOn, is rendered with labels and its format reported", async () => {
    const styles = [...STYLES, listStyle("LetterList", "2"), `<w:style w:type="paragraph" w:styleId="LetterListChild"><w:name w:val="LetterListChild"/><w:basedOn w:val="LetterList"/></w:style>`];
    const r = await variant([heading(1, "Styled"), styled("LetterList", "Inspect the records"), styled("LetterListChild", "Reperform the key controls"), para("After the list.")], { styles });
    expect(linesOf(r.document.text).slice(0, 4)).toEqual(["Styled", "1. Inspect the records", "2. Reperform the key controls", "After the list."]);
    expect(r.document.sentences.find((s) => s.text === "2. Reperform the key controls")).toMatchObject({ listDepth: 0 });
    expect(r.warnings.listNumberingSimplified).toEqual([{ listIndex: 1, headingPath: ["Styled"], originalFormats: ["lowerLetter"], itemCount: 2, firstItemText: "Inspect the records", firstSentenceId: idOf(r.document, "1. Inspect the records") }]);
    expect(r.warnings.numberingUnsupported).toEqual([]);
  });

  it("the paragraph's own w:ilvl applies to style numbering, and numId 0 switches the style's numbering off", async () => {
    const styles = [...STYLES, listStyle("Steps", "1")];
    const r = await variant([styled("Steps", "Prepare"), styled("Steps", "Check the permit", `<w:numPr><w:ilvl w:val="1"/></w:numPr>`), styled("Steps", "Not a step", `<w:numPr><w:numId w:val="0"/></w:numPr>`)], { styles });
    expect(linesOf(r.document.text).slice(0, 3)).toEqual(["1. Prepare", "  1. Check the permit", "Not a step"]);
  });

  it("an overridden level 0 leaves the definition's level 1 in place for direct and style-inherited children", async () => {
    const override = `<w:num w:numId="6"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1)"/></w:lvl></w:lvlOverride></w:num>`;
    const styles = [...STYLES, `<w:style w:type="paragraph" w:styleId="SubStep"><w:name w:val="SubStep"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="6"/></w:numPr></w:pPr></w:style>`];
    const r = await variant([heading(1, "Mixed"), item(6, 0, "Prepare"), styled("SubStep", "Check the permit"), item(6, 1, "Brief the team"), item(6, 0, "Isolate")], { nums: [...NUMS, override], styles });
    expect(linesOf(r.document.text).slice(0, 5)).toEqual(["Mixed", "1. Prepare", "  1. Check the permit", "  2. Brief the team", "2. Isolate"]);
    expect(r.document.sentences.find((s) => s.text === "1. Check the permit")).toMatchObject({ listDepth: 1, headingPath: ["Mixed"] });
    expect(r.document.sentences.find((s) => s.text === "2. Brief the team")).toMatchObject({ listDepth: 1 });
    expect(r.warnings.numberingUnsupported).toEqual([]);
    expect(r.warnings.listNumberingSimplified).toEqual([{ listIndex: 1, headingPath: ["Mixed"], originalFormats: ["lowerLetter"], itemCount: 4, firstItemText: "Prepare", firstSentenceId: idOf(r.document, "1. Prepare") }]);
  });

  it("locates a simplified list inside a table cell by its atomic row, and a list whose first item is under other headings by its own path", async () => {
    const r = await variant([heading(1, "Cells"), tbl([tr([tc(para("Steps")), tc(`${item(2, 0, "Inspect the file")}${item(2, 0, "Sign it")}`)])], 2), heading(1, "Body"), item(6, 0, "Inspect the file")], { nums: [...NUMS, `<w:num w:numId="6"><w:abstractNumId w:val="1"/></w:num>`] });
    const row = r.document.sentences.find((s) => s.text.startsWith("[Table 1, row 1]"))!;
    expect(r.warnings.listNumberingSimplified).toEqual([
      { listIndex: 1, headingPath: ["Cells"], originalFormats: ["lowerLetter"], itemCount: 2, firstItemText: "Inspect the file", firstSentenceId: row.sentenceId },
      { listIndex: 2, headingPath: ["Body"], originalFormats: ["lowerLetter"], itemCount: 1, firstItemText: "Inspect the file", firstSentenceId: idOf(r.document, "1. Inspect the file") }
    ]);
  });

  it("numbering through a numbering style (w:numStyleLink) is followed", async () => {
    const abstractNums = [...ABSTRACT_NUMS, `<w:abstractNum w:abstractNumId="3"><w:numStyleLink w:val="RomanList"/></w:abstractNum>`, `<w:abstractNum w:abstractNumId="4"><w:lvl w:ilvl="0"><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="(%1)"/></w:lvl></w:abstractNum>`];
    const nums = [...NUMS, `<w:num w:numId="8"><w:abstractNumId w:val="3"/></w:num>`, `<w:num w:numId="9"><w:abstractNumId w:val="4"/></w:num>`];
    const styles = [...STYLES, `<w:style w:type="numbering" w:styleId="RomanList"><w:name w:val="Roman list"/><w:pPr><w:numPr><w:numId w:val="9"/></w:numPr></w:pPr></w:style>`];
    const r = await variant([item(8, 0, "First"), item(8, 0, "Second")], { abstractNums, nums, styles });
    expect(linesOf(r.document.text).slice(0, 2)).toEqual(["1. First", "2. Second"]);
    expect(r.warnings.listNumberingSimplified).toEqual([{ listIndex: 1, headingPath: [], originalFormats: ["lowerRoman"], itemCount: 2, firstItemText: "First", firstSentenceId: idOf(r.document, "1. First") }]);
  });

  it("reports numbering it cannot render instead of passing it off as ordinary paragraphs: numbered headings and missing definitions", async () => {
    const styles = [...STYLES, `<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>`];
    const r = await variant([
      heading(1, "Scope"), p(run("Numbered directly"), `<w:pStyle w:val="Heading2"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`),
      p(run("Numbered by style"), `<w:pStyle w:val="Heading3"/>`), item(42, 0, "Points at no list")
    ], { styles });
    expect(r.warnings.numberingUnsupported).toEqual([
      { reason: "numbered-heading", headingPath: ["Scope"], text: "Numbered directly", numId: "1", ilvl: "0" },
      { reason: "numbered-heading", headingPath: ["Scope", "Numbered directly"], text: "Numbered by style", numId: "1", ilvl: "0" },
      { reason: "missing-definition", headingPath: ["Scope", "Numbered directly", "Numbered by style"], text: "Points at no list", numId: "42", ilvl: "0" }
    ]);
    expect(linesOf(r.document.text).slice(0, 4)).toEqual(["Scope", "Numbered directly", "Numbered by style", "Points at no list"]);
  });

  it("leaves the original bytes' hash alone when numbering is rewritten for mammoth", async () => {
    const bytes = await zipDocx(structureParts({ body: [...BODY], nums: [...NUMS, letterOverride] }));
    const r = await ingestDocx(bytes, opts);
    expect(r.document.metadata.originalSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

describe("w:tblHeader: only a row the document marks on is a header row (Checkpoint B)", () => {
  /** A row with w:tblHeader set to `flag` (the attribute value), bare (`""`), or absent (undefined). */
  const row = (cells: string[], flag?: string) => `<w:tr>${flag === undefined ? "" : `<w:trPr><w:tblHeader${flag === "" ? "" : ` w:val="${flag}"`}/></w:trPr>`}${cells.map((c) => tc(para(c))).join("")}</w:tr>`;
  const table = (rows: string[]) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${rows.join("")}</w:tbl>`;
  const rowLines = (text: string, n: number) => linesOf(text).filter((l) => l.startsWith(`[Table ${n}, `));
  const checkCitations = (doc: Awaited<ReturnType<typeof variant>>["document"]) => {
    for (const x of doc.sentences) expect(doc.text.slice(x.charStart, x.charEnd)).toBe(x.text);
    for (const x of doc.sentences.filter((y) => y.text.startsWith("[Table "))) expect(x.atomic).toBe(true);
  };

  it("a table whose rows all say w:val=\"false\" (or \"0\", \"off\") has no header row: every row is data, labelled Column n", async () => {
    const r = await variant([heading(1, "Flags"), table([row(["Scope", "All sites"], "false"), row(["Period", "FY2026"], "0"), row(["Owner", "Finance"], "off"), row(["Review", "Annual"], "FALSE")])]);
    expect(rowLines(r.document.text, 1)).toEqual([
      "[Table 1, row 1] Column 1: Scope; Column 2: All sites", "[Table 1, row 2] Column 1: Period; Column 2: FY2026",
      "[Table 1, row 3] Column 1: Owner; Column 2: Finance", "[Table 1, row 4] Column 1: Review; Column 2: Annual"
    ]);
    expect(r.tables).toEqual([expect.objectContaining({ name: "1", markedHeaderRows: 0, labels: null, rowCount: 4 })]);
    checkCitations(r.document);
  });

  it("true, bare and absent flags: a leading row marked true or bare is a header; rows marked false or unmarked are data", async () => {
    const r = await variant([
      table([row(["Risk", "Control"], "true"), row(["Missing records", "Monthly check"], "false"), row(["Fraud", "Dual sign-off"])]),
      table([row(["Stage", "Days"], ""), row(["Draft", "5"])]),
      table([row(["Item", "Check"], "1"), row(["Gloves", "Pinholes"], "on"), row(["Glasses", "Cracks"], "false")]),
      table([row(["Plain", "Row"]), row(["Second", "Row"])])
    ]);
    expect(rowLines(r.document.text, 1)).toEqual(["[Table 1, row 1] Risk: Missing records; Control: Monthly check", "[Table 1, row 2] Risk: Fraud; Control: Dual sign-off"]);
    expect(rowLines(r.document.text, 2)).toEqual(["[Table 2, row 1] Stage: Draft; Days: 5"]);
    expect(rowLines(r.document.text, 3)).toEqual(["[Table 3, row 1] Item / Gloves: Glasses; Check / Pinholes: Cracks"]);
    expect(rowLines(r.document.text, 4)).toEqual(["[Table 4, row 1] Column 1: Plain; Column 2: Row", "[Table 4, row 2] Column 1: Second; Column 2: Row"]);
    expect(r.tables.map((t) => [t.markedHeaderRows, t.rowCount])).toEqual([[1, 2], [1, 1], [2, 1], [0, 2]]);
    checkCitations(r.document);
  });

  it("a row marked true below a data row is data, as Word repeats only leading header rows", async () => {
    const r = await variant([table([row(["Risk", "Control"], "true"), row(["Fraud", "Dual sign-off"], "false"), row(["Late", "Reminder"], "true")])]);
    expect(rowLines(r.document.text, 1)).toEqual(["[Table 1, row 1] Risk: Fraud; Control: Dual sign-off", "[Table 1, row 2] Risk: Late; Control: Reminder"]);
  });

  it("applies in notes too: a footnote table whose rows say false keeps its data rows", async () => {
    const footnotes = [`<w:footnote w:id="1">${para("Timetable:")}${table([row(["Draft", "5"], "false"), row(["Final", "10"], "false")])}</w:footnote>`];
    const r = await variant([p(`${run("Results are reported on time.")}<w:r><w:footnoteReference w:id="1"/></w:r>`)], { footnotes });
    expect(linesOf(r.document.text).filter((l) => l.startsWith("[Note 1, table 1"))).toEqual(["[Note 1, table 1, row 1] Column 1: Draft; Column 2: 5", "[Note 1, table 1, row 2] Column 1: Final; Column 2: 10"]);
    checkCitations(r.document);
  });

  it("the fixture's bare w:tblHeader rows still count as headers, and the original's hash is of the bytes as supplied", async () => {
    const bytes = await zipDocx(structureParts({ body: [table([row(["Risk", "Control"], ""), row(["Fraud", "Dual sign-off"], "false")]), FILLER] }));
    const r = await ingestDocx(bytes, opts);
    expect(rowLines(r.document.text, 1)).toEqual(["[Table 1, row 1] Risk: Fraud; Control: Dual sign-off"]);
    expect(r.document.metadata.originalSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
