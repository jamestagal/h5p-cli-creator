import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EXTRACTION_VERSION, ingestDocx, ingestOdt, normaliseSourceText, OdtFormatError } from "../src/ingest/index.js";
import { AUTOMATIC_STYLES, STYLES, cell, covered, h, list, note, p, para, row, structureOdtParts, t, table, zipOdt } from "./fixtures/structure/odt-builder.mjs";

const dir = resolve(import.meta.dirname, "fixtures/structure");
const opts = { sourceId: "src-odt", fileName: "structure.odt" };
const load = async () => { const bytes = await readFile(resolve(dir, "structure.odt")); return { bytes, result: await ingestOdt(bytes, opts) }; };
const FILLER = para("This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim());
/** A variant of the fixture: `body` replaces the document body (filler added for admission); the styles default to the fixture's. */
const variant = async (body: string[], parts: Parameters<typeof structureOdtParts>[0] = {}) => ingestOdt(await zipOdt(structureOdtParts({ ...parts, body: [...body, FILLER] })), opts);
const linesOf = (text: string) => text.split("\n");
const numberStyle = (name: string, levels: string) => `<text:list-style style:name="${name}">${levels}</text:list-style>`;
const level = (n: number, format: string, extra = "") => `<text:list-level-style-number text:level="${n}" style:num-format="${format}"${extra}/>`;

describe("ingestOdt on the synthetic structure fixture", () => {
  it("matches the golden linearized text exactly", async () => {
    const { result } = await load();
    expect(result.document.text).toBe(await readFile(resolve(dir, "structure.odt.golden.txt"), "utf8"));
  });

  it("gives the same lines as the DOCX fixture, except that the a)/b) list keeps its real labels", async () => {
    const { result } = await load();
    const docx = await ingestDocx(await readFile(resolve(dir, "structure.docx")), { sourceId: "src-docx" });
    const expected = docx.document.text.replace("1. Inspect the records", "a) Inspect the records").replace("2. Reperform the key controls", "b) Reperform the key controls");
    expect(result.document.text).toBe(expected);
    const shape = (d: typeof docx.document) => d.sentences.map((s) => [s.atomic, s.listDepth, s.headingPath.join(" › ")]);
    expect(shape(result.document)).toEqual(shape(docx.document));
  });

  it("text:s text:c=\"3\" inside a sentence reads as one space, and the annotation's text is absent", async () => {
    const { result } = await load();
    expect(result.document.text).toContain("The auditor plans the engagement before fieldwork begins");
    expect(result.document.text).not.toContain("engagement partner.");
    expect(result.document.text).not.toContain("Check this sentence");
  });

  it("drops the tracked deletion and keeps the insertion", async () => {
    const { result } = await load();
    expect(result.document.text).toContain("The sample size is forty items for each branch.");
    expect(result.document.text).not.toContain("twenty");
  });

  it("records the extractor, the extraction version and the sha256 of the original bytes", async () => {
    const { bytes, result } = await load();
    expect(result.document.kind).toBe("odt");
    expect(result.document.metadata).toMatchObject({ extractor: "odt", extractionVersion: EXTRACTION_VERSION, originalSha256: createHash("sha256").update(bytes).digest("hex"), fileName: "structure.odt" });
  });

  it("citations slice back: the text is normalised, every sentence slices exactly, and the Vietnamese is NFC", async () => {
    const { result } = await load();
    const doc = result.document;
    expect(normaliseSourceText(doc.text)).toBe(doc.text);
    expect(doc.text).toBe(doc.text.normalize("NFC"));
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    expect(doc.sentences.some((s) => s.text === "Kiểm toán viên phải ghi chép đầy đủ bằng chứng kiểm toán.")).toBe(true);
    expect(doc.sentences.find((s) => s.text.startsWith("[Table 2, row 3] Risk: Rủi ro gian lận"))).toMatchObject({ atomic: true, headingPath: ["Audit fundamentals", "Recording results"] });
  });

  it("reports no simplified numbering (the a) labels are real) and still reports the label-like reference", async () => {
    const { result } = await load();
    expect(result.warnings.listNumberingSimplified).toEqual([]);
    expect(result.warnings.numberingUnsupported).toEqual([]);
    const ref = result.document.sentences.find((x) => x.text.startsWith("The reperformance described in item b) above"))!;
    expect(result.warnings.labelLikeReferences).toEqual([{ sentenceId: ref.sentenceId, headingPath: ["Audit fundamentals", "Planning the audit"], text: ref.text }]);
  });

  it("the committed fixture is byte-identical to one regenerated from odt-builder.mjs", async () => {
    const { bytes } = await load();
    expect((await zipOdt(structureOdtParts())).equals(bytes)).toBe(true);
  });
});

describe("list labels from the list style", () => {
  it("renders roman, letter, prefix and suffix formats, start values and display levels", async () => {
    const styles = [...AUTOMATIC_STYLES, numberStyle("Legal", `${level(1, "I", ' style:num-suffix="."')}${level(2, "1", ' style:num-suffix="." text:display-levels="2"')}${level(3, "a", ' style:num-prefix="(" style:num-suffix=")" text:start-value="3"')}`)];
    const r = await variant([list("Legal", [["Scope", list(null, [["Sites", list(null, ["Plant", "Office"])], "Staff"])], "Method"])], { automaticStyles: styles });
    expect(linesOf(r.document.text).slice(0, 6)).toEqual(["I. Scope", "  I.1. Sites", "    (c) Plant", "    (d) Office", "  I.2. Staff", "II. Method"]);
    expect(r.warnings.listNumberingSimplified).toEqual([]);
  });

  it("follows item start values, continue-numbering with the same style, continue-list by id, and text:list-header", async () => {
    const r = await variant([
      list("Numbered", ["One", "Two"], ' xml:id="first"'), para("Interruption."),
      list("Numbered", ["Three"], ' text:continue-numbering="true"'), list("Numbered", ["Fresh"]),
      list("Numbered", ["Four"], ' text:continue-list="first"'),
      `<text:list text:style-name="Numbered"><text:list-item text:start-value="7"><text:p>Seven</text:p></text:list-item><text:list-header><text:p>Unnumbered note</text:p></text:list-header><text:list-item><text:p>Eight</text:p></text:list-item></text:list>`
    ]);
    expect(linesOf(r.document.text).slice(0, 9)).toEqual(["1. One", "2. Two", "Interruption.", "3. Three", "1. Fresh", "4. Four", "7. Seven", "Unnumbered note", "8. Eight"]);
  });

  it("uses letters beyond z as aa, ab (or aa, bb with num-letter-sync), and a paragraph style's list style when the list names none", async () => {
    const styles = [...AUTOMATIC_STYLES, numberStyle("Alpha", level(1, "a", ' style:num-suffix="." text:start-value="26"')), numberStyle("Sync", level(1, "A", ' style:num-suffix="." text:start-value="27" style:num-letter-sync="true"')),
      `<style:style style:name="Step" style:family="paragraph" style:parent-style-name="StepBase"/>`, `<style:style style:name="StepBase" style:family="paragraph" style:list-style-name="Alpha"/>`];
    const r = await variant([list("Alpha", ["Zed", "Next"]), list("Sync", ["Double"]), `<text:list><text:list-item><text:p text:style-name="Step">From the style</text:p></text:list-item></text:list>`], { automaticStyles: styles });
    expect(linesOf(r.document.text).slice(0, 4)).toEqual(["z. Zed", "aa. Next", "AA. Double", "z. From the style"]);
  });

  it("renders a format it does not support as decimal and reports it; a missing list style is reported, not read as plain text", async () => {
    const styles = [...AUTOMATIC_STYLES, numberStyle("Greek", level(1, "α, β, γ, ...", ' style:num-suffix="."'))];
    const r = await variant([h(1, "Formats"), list("Greek", ["Alpha", "Beta"]), list("NoSuchStyle", ["Orphan"])], { automaticStyles: styles });
    expect(linesOf(r.document.text).slice(1, 4)).toEqual(["1. Alpha", "2. Beta", "• Orphan"]);
    expect(r.warnings.listNumberingSimplified).toEqual([{ listIndex: 1, headingPath: ["Formats"], originalFormats: ["α, β, γ, ..."] }]);
    expect(r.warnings.numberingUnsupported).toEqual([{ reason: "missing-definition", headingPath: ["Formats"], text: "Orphan", numId: "NoSuchStyle", ilvl: "0" }]);
  });

  it("reports headings that the outline style numbers, since their numbers are not rendered", async () => {
    const styles = [`<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-format="1" style:num-suffix="."/></text:outline-style>`, ...STYLES.filter((s) => !s.includes("outline-style"))];
    const r = await variant([h(1, "Scope"), para("Body text."), `<text:h text:outline-level="1" text:is-list-header="true">Unnumbered</text:h>`], { styles });
    expect(r.warnings.numberingUnsupported).toEqual([{ reason: "numbered-heading", headingPath: [], text: "Scope", numId: "outline", ilvl: "0" }]);
  });
});

describe("tables, inline markup and containers", () => {
  it("expands repeated cells and rows, reads row groups, and labels columns when there are no header rows", async () => {
    const r = await variant([`<table:table table:name="T"><table:table-column table:number-columns-repeated="3"/><table:table-row-group><table:table-row table:number-rows-repeated="2">${cell(para("x"), ' table:number-columns-repeated="2"')}${cell(para("y"))}</table:table-row></table:table-row-group><table:table-rows>${row([cell(para("a"), ' table:number-columns-spanned="3"'), covered, covered])}</table:table-rows></table:table>`]);
    expect(linesOf(r.document.text).slice(0, 3)).toEqual(["[Table 1, row 1] Column 1: x; Column 2: x; Column 3: y", "[Table 1, row 2] Column 1: x; Column 2: x; Column 3: y", "[Table 1, row 3] Column 1: a; Column 2: a; Column 3: a"]);
  });

  it("reads tabs, line breaks, spans, links and fields as text, and skips bookmarks, change marks and a rendered text:number", async () => {
    const r = await variant([p(`Lock<text:tab/>it<text:line-break/>out <text:span>before</text:span> <text:a xlink:href="https://example.invalid">work</text:a><text:bookmark text:name="b"/> starts on <text:date>1 July</text:date>.`), `<text:list text:style-name="Numbered"><text:list-item><text:p><text:number>1.</text:number>Numbered once</text:p></text:list-item></text:list>`]);
    expect(linesOf(r.document.text).slice(0, 2)).toEqual(["Lock it out before work starts on 1 July.", "1. Numbered once"]);
  });

  it("keeps text-box content, section content and index entries; a heading in a cell reads as a paragraph", async () => {
    const r = await variant([
      p(`Before the box.<draw:frame draw:name="F"><draw:text-box>${para("Inside the box.")}${list("Bullets", ["Boxed item"])}</draw:text-box></draw:frame>`),
      `<text:section text:name="S">${para("In a section.")}</text:section>`,
      `<text:table-of-content text:name="TOC"><text:table-of-content-source text:outline-level="2"><text:index-title-template>Contents</text:index-title-template></text:table-of-content-source><text:index-body>${para("Scope 1")}</text:index-body></text:table-of-content>`,
      table("T", 1, [row([cell(h(1, "Cell heading"))])])
    ]);
    expect(linesOf(r.document.text).slice(0, 6)).toEqual(["Before the box.", "Inside the box.", "• Boxed item", "In a section.", "Scope 1", "[Table 1, row 1] Column 1: Cell heading"]);
    expect(r.document.sentences[0]!.headingPath).toEqual([]);
  });

  it("numbers footnotes and endnotes together in order of reference, with their content", async () => {
    const r = await variant([h(1, "Notes"), p(`First.${note("e1", "endnote", "i", para("Endnote text."))} Second.${note("f1", "footnote", "1", `${para("Footnote text.")}${list("Numbered", ["Step"])}`)}`)]);
    expect(linesOf(r.document.text).slice(1, 5)).toEqual(["First.[1] Second.[2]", "[Note 1] Endnote text.", "[Note 2] Footnote text.", "[Note 2] 1. Step"]);
  });

  it("refuses a file that is not an ODF text document", async () => {
    await expect(ingestOdt(Buffer.from("not a zip"), opts)).rejects.toBeInstanceOf(OdtFormatError);
    const spreadsheet = structureOdtParts();
    spreadsheet["content.xml"] = spreadsheet["content.xml"]!.replace(/<office:text>[\s\S]*<\/office:text>/, `<office:spreadsheet>${t("x")}</office:spreadsheet>`);
    await expect(ingestOdt(await zipOdt(spreadsheet), opts)).rejects.toThrow(/office:body\/office:text/);
  });
});
