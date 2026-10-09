import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutline, finaliseDocument, ingestDocx, ingestMarkdown, sourceAnalysis, type OutlineSection, type SourceDocument } from "../src/ingest/index.js";
import { normaliseBlocks, type Block, type Cell } from "../src/ingest/structure/blocks.js";
import { linearize } from "../src/ingest/structure/linearize.js";
import * as D from "./fixtures/structure/docx-builder.mjs";
import { fixtures } from "./helpers/synthetic.js";

const FILLER: Block = { kind: "paragraph", text: "This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim() };
const row = (...texts: string[]): Cell[] => texts.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
const opts = { sourceId: "src-outline", fileName: "outline.docx" };

function analyse(blocks: Block[]) {
  const lin = linearize(normaliseBlocks(blocks));
  const document = finaliseDocument("docx", lin.text, lin.segments, opts, { extractor: "docx" });
  return { document, analysis: sourceAnalysis(document, lin) };
}
const idOf = (doc: SourceDocument, text: string): string => { const s = doc.sentences.find((x) => x.text === text); if (!s) throw new Error(`no sentence ${text}`); return s.sentenceId; };
const flat = (sections: OutlineSection[]): OutlineSection[] => sections.flatMap((s) => [s, ...flat(s.children)]);
const shape = (sections: OutlineSection[]): unknown[] => sections.map((s) => [s.id, s.title, s.level, s.headingPath, shape(s.children)]);

describe("buildOutline: sections and stable identifiers", () => {
  const blocks: Block[] = [
    FILLER,
    { kind: "heading", level: 1, text: "Safety" }, { kind: "paragraph", text: "Intro to safety." },
    { kind: "heading", level: 2, text: "Isolation" }, { kind: "paragraph", text: "Lock it out. Tag it." },
    { kind: "listItem", depth: 0, label: "1.", text: "Apply the lock. Test it." }, { kind: "listItem", depth: 0, label: "2.", text: "Remove the lock." },
    { kind: "heading", level: 2, text: "Isolation" },
    { kind: "table", index: 1, headerRows: 1, rows: [row("K", "V"), row("a", "b"), row("c", "d")] },
    { kind: "note", n: 1, text: "A note." },
    { kind: "heading", level: 1, text: "Testing. Overview" },
    { kind: "heading", level: 3, text: "Deep" }, { kind: "paragraph", text: "Deep text." }
  ];
  const { document, analysis } = analyse(blocks);
  const outline = buildOutline(document, analysis);
  const id = (text: string) => idOf(document, text);

  it("gives each section the id of its first sentence: distinct for duplicate titles, nested by level, with text before the first heading first", () => {
    expect(outline.usableHeadings).toBe(true);
    expect(shape(outline.sections)).toEqual([
      ["sec-s1", "(before the first heading)", 0, [], []],
      [`sec-${id("Safety")}`, "Safety", 1, ["Safety"], [
        [`sec-${document.sentences.filter((s) => s.text === "Isolation")[0]!.sentenceId}`, "Isolation", 2, ["Safety", "Isolation"], []],
        [`sec-${document.sentences.filter((s) => s.text === "Isolation")[1]!.sentenceId}`, "Isolation", 2, ["Safety", "Isolation"], []]
      ]],
      // a heading split into two sentences starts its section at the first; a skipped level nests under the nearest shallower heading
      [`sec-${id("Testing.")}`, "Testing. Overview", 1, ["Testing. Overview"], [[`sec-${id("Deep")}`, "Deep", 3, ["Testing. Overview", "Deep"], []]]]
    ]);
    const ids = flat(outline.sections).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts own and subtree text: sentences, source code points, tables and rows, lists, items and sentences within items, notes and lines", () => {
    const [front, safety, testing] = outline.sections as [OutlineSection, OutlineSection, OutlineSection];
    const [isolation, isolation2] = safety.children as [OutlineSection, OutlineSection];
    expect(front.own).toMatchObject({ sentences: 8, firstSentenceId: "s1", lastSentenceId: "s8", tables: 0, lists: 0, notes: 0 });
    // "Isolation" 9 + "Lock it out." 12 + "Tag it." 7 + "Apply the lock." 15 + "Test it." 8 + "Remove the lock." 16; the labels "1. " and "2. " are generated
    expect(isolation.own).toEqual({ sentences: 6, sourceCodePoints: 67, tables: 0, tableRows: 0, lists: 1, listItems: 2, listItemSentences: 3, notes: 0, noteLines: 0, firstSentenceId: document.sentences.filter((s) => s.text === "Isolation")[0]!.sentenceId, lastSentenceId: id("2. Remove the lock.") });
    // "Isolation" 9 + row 1 "K" "a" "V" "b" 4 + row 2 "c" "d" 2 (its repeated labels are generated) + "A note." 7
    expect(isolation2.own).toMatchObject({ sentences: 4, sourceCodePoints: 22, tables: 1, tableRows: 2, lists: 0, notes: 1, noteLines: 1 });
    expect(safety.own).toMatchObject({ sentences: 2, sourceCodePoints: "Safety".length + "Intro to safety.".length, lists: 0, tables: 0 });
    expect(safety.subtree).toMatchObject({ sentences: 12, sourceCodePoints: 6 + 16 + 67 + 22, tables: 1, tableRows: 2, lists: 1, listItems: 2, listItemSentences: 3, notes: 1, noteLines: 1, firstSentenceId: id("Safety"), lastSentenceId: id("[Note 1] A note.") });
    expect(testing.own).toMatchObject({ sentences: 2 });
    expect(testing.subtree).toMatchObject({ sentences: 4 });
  });

  it("places every sentence in exactly one section's own text", () => {
    const owned = flat(outline.sections).reduce((n, s) => n + s.own.sentences, 0);
    expect(owned).toBe(document.sentences.length);
    expect(outline.totals.sentences).toBe(document.sentences.length);
    expect(new Set(Object.values(outline.sectionOf)).size).toBe(flat(outline.sections).length);
    expect(Object.keys(outline.sectionOf)).toEqual(document.sentences.map((s) => s.sentenceId));
  });
});

describe("buildOutline: documents without usable headings", () => {
  it("a markdown, text or PDF source is one whole-document section, marked as having no usable headings", async () => {
    const doc = await ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src-md" });
    const outline = buildOutline(doc, sourceAnalysis(doc, null));
    expect(outline.usableHeadings).toBe(false);
    expect(shape(outline.sections)).toEqual([["sec-s1", "(whole document)", 0, [], []]]);
    expect(outline.sections[0]!.own.sentences).toBe(doc.sentences.length);
    expect(outline.sections[0]!.own.sourceCodePoints).toBe(doc.sentences.reduce((n, s) => n + [...s.text].length, 0));
  });

  it("a DOCX whose headings are only bold paragraphs has no usable headings either", async () => {
    const bold = (text: string) => D.p(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`);
    const result = await ingestDocx(await D.zipDocx(D.structureParts({ body: [bold("Looks like a heading"), D.para("This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim())] })), opts);
    const outline = buildOutline(result.document, result.analysis);
    expect(outline.usableHeadings).toBe(false);
    expect(outline.sections.map((s) => s.title)).toEqual(["(whole document)"]);
  });

  it("the structure fixture's outline follows its heading styles; a heading inside a table cell is not a section", async () => {
    const result = await ingestDocx(await D.zipDocx(D.structureParts({ body: [...D.BODY, D.tbl([D.tr([D.tc(D.heading(2, "Cell heading")), D.tc(D.para("x"))])], 2)] })), opts);
    const outline = buildOutline(result.document, result.analysis);
    expect(flat(outline.sections).map((s) => s.title)).toEqual(["Audit fundamentals", "Planning the audit", "Recording results"]);
  });
});
