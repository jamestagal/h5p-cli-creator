import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestDocx, ingestOdt } from "../src/ingest/index.js";
import { normaliseBlocks, type Block, type Cell } from "../src/ingest/structure/blocks.js";
import { linearize, type Linearized } from "../src/ingest/structure/linearize.js";
import { countSourceCodePoints, selectionSourceCounter } from "../src/ingest/structure/origin.js";
import * as D from "./fixtures/structure/docx-builder.mjs";
import * as O from "./fixtures/structure/odt-builder.mjs";
import { electricalDocx, electricalOdt } from "./helpers/structured-sources.js";

const structure = resolve(import.meta.dirname, "fixtures/structure");
const cell = (text: string, span: Partial<Pick<Cell, "colSpan" | "rowSpan">> = {}, blocks?: Block[]): Cell => ({ text, colSpan: span.colSpan ?? 1, rowSpan: span.rowSpan ?? 1, ...(blocks ? { blocks } : {}) });
const row = (...texts: string[]): Cell[] => texts.map((t) => cell(t));
const PAD = "This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim();
const opts = (fileName: string) => ({ sourceId: `src-${fileName}`, fileName });

/** The maximal runs of source characters on each line, in order: what a source-only count measures. */
function sourceRuns(lin: Pick<Linearized, "text" | "generated">): string[][] {
  const mask = new Uint8Array(lin.text.length);
  for (const [a, b] of lin.generated) mask.fill(1, a, b);
  const out: string[][] = [];
  let line: string[] = []; let run = "";
  for (let i = 0; i < lin.text.length; i++) {
    if (lin.text[i] === "\n") { if (run) line.push(run); out.push(line); line = []; run = ""; continue; }
    if (mask[i]) { if (run) line.push(run); run = ""; } else run += lin.text[i];
  }
  if (run) line.push(run);
  out.push(line);
  return out;
}
/** The source count of the given lines (by index), each repeated authored unit once: the selection rule of design §2.4. */
const countLines = (lin: Linearized, indices?: number[]): number => {
  const ranges: Array<[number, number]> = []; let start = 0;
  lin.text.split("\n").forEach((l, i) => { if (!indices || indices.includes(i)) ranges.push([start, start + l.length]); start += l.length + 1; });
  return selectionSourceCounter(lin.text, lin.generated, lin.repeats)(ranges);
};
const generatedParts = (lin: Pick<Linearized, "text" | "generated">): string[] => lin.generated.map(([a, b]) => lin.text.slice(a, b));
function assertSpanInvariants(lin: Pick<Linearized, "text" | "generated">): void {
  let previousEnd = -1;
  for (const [a, b] of lin.generated) {
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(lin.text.length);
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(previousEnd); // sorted and merged: no overlap and no touching spans
    previousEnd = b;
  }
  for (let i = 0; i < lin.text.length; i++) if (lin.text[i] === "\n") expect(lin.generated.some(([a, b]) => a <= i && i < b)).toBe(true);
}

describe("character origin: every generated form is generated, and only those", () => {
  it("a table with no marked header: prefix, Column n labels, ': ' and '; ' are generated; cell text is source", () => {
    const lin = linearize([{ kind: "table", index: 1, headerRows: 0, rows: [row("Audit scope", "All branches"), row("Period", "FY2026")] }]);
    expect(sourceRuns(lin)).toEqual([["Audit scope", "All branches"], ["Period", "FY2026"]]);
    expect(generatedParts(lin)).toEqual(["[Table 1, row 1] Column 1: ", "; Column 2: ", "\n[Table 1, row 2] Column 1: ", "; Column 2: "]);
    assertSpanInvariants(lin);
  });

  it("marked header rows: labels from the document are source; ' / ' joining header rows, ': ', '; ' and the empty-cell — are generated; a span's copy keeps its authored identity", () => {
    const lin = linearize([{ kind: "table", index: 3, headerRows: 2, rows: [
      [cell("Risk", { rowSpan: 2 }), cell("Rating", { colSpan: 2 })],
      [cell("Likelihood"), cell("Impact")],
      [cell("Missing records"), cell("Medium"), cell("")]
    ] }]);
    expect(lin.text).toBe("[Table 3, row 1] Risk: Missing records; Rating / Likelihood: Medium; Rating / Impact: —");
    expect(sourceRuns(lin)).toEqual([["Risk", "Missing records", "Rating", "Likelihood", "Medium", "Rating", "Impact"]]);
    expect(generatedParts(lin)).toEqual(["[Table 3, row 1] ", ": ", "; ", " / ", ": ", "; ", " / ", ": —"]);
    // "Rating" spans two columns: both occurrences are the one authored cell, so it counts once
    const rating = lin.repeats.filter((o) => lin.text.slice(o.charStart, o.charEnd) === "Rating");
    expect(rating).toHaveLength(2);
    expect(new Set(rating.map((o) => o.unit)).size).toBe(1);
    expect(countLines(lin)).toBe("Risk".length + "Missing records".length + "Rating".length + "Likelihood".length + "Medium".length + "Impact".length);
  });

  it("every Column n fallback is generated, including one for an empty column in a marked header row", () => {
    const lin = linearize([{ kind: "table", index: 2, headerRows: 1, rows: [row("Risk", ""), row("Missing", "")] }]);
    expect(lin.text).toBe("[Table 2, row 1] Risk: Missing; Column 2: —");
    expect(sourceRuns(lin)).toEqual([["Risk", "Missing"]]);
  });

  it("lookalike text the author wrote is source: a genuine —, a header reading 'Column 1', a typed [1] and a typed 1.", () => {
    const lin = linearize([
      { kind: "table", index: 1, headerRows: 1, rows: [row("Column 1", "Value"), row("x", "—"), row("y", "")] },
      { kind: "paragraph", text: "See [1] and step 1. here." }
    ]);
    expect(lin.text.split("\n")).toEqual(["[Table 1, row 1] Column 1: x; Value: —", "[Table 1, row 2] Column 1: y; Value: —", "See [1] and step 1. here."]);
    expect(sourceRuns(lin)).toEqual([["Column 1", "x", "Value", "—"], ["Column 1", "y", "Value"], ["See [1] and step 1. here."]]);
    // the header labels are written on both rows but authored once: "Column 1" 8 + "Value" 5, then x, the genuine —, y
    expect(countLines(lin, [0, 1])).toBe(8 + 5 + 1 + 1 + 1);
  });

  it("nested content in a cell: joining spaces, list labels, sub-list brackets and nested-table syntax are generated", () => {
    const nested: Block = { kind: "table", index: 99, headerRows: 1, rows: [row("A", "B"), row("x", "y"), row("z", "")] };
    const lin = linearize([{ kind: "table", index: 4, headerRows: 1, rows: [
      row("Task", "Detail"),
      [cell("Isolate"), cell("", {}, [{ kind: "paragraph", text: "Steps:" }, { kind: "listItem", depth: 0, label: "•", text: "Lock" }, { kind: "listItem", depth: 1, label: "1.", text: "Padlock" }, { kind: "listItem", depth: 0, label: "•", text: "Tag" }])],
      [cell("Record"), cell("", {}, [{ kind: "paragraph", text: "See:" }, nested])]
    ] }]);
    expect(lin.text.split("\n")).toEqual([
      "[Table 4, row 1] Task: Isolate; Detail: Steps: • Lock [sub-list: 1. Padlock] • Tag",
      "[Table 4, row 2] Task: Record; Detail: See: [Table 4.1 row 1: A: x, B: y; row 2: A: z, B: —]"
    ]);
    expect(sourceRuns(lin)).toEqual([
      ["Task", "Isolate", "Detail", "Steps:", "Lock", "Padlock", "Tag"],
      ["Task", "Record", "Detail", "See:", "A", "x", "B", "y", "A", "z", "B"]
    ]);
    // outer labels Task and Detail once, nested labels A and B once (repeated units inside the nested table count once too)
    expect(countLines(lin)).toBe(4 + 6 + "Isolate".length + "Steps:".length + 4 + 7 + 3 + "Record".length + "See:".length + 1 + 1 + 3);
  });

  it("lists: labels, indentation, the space after a label and continuation hanging indents are generated", () => {
    const lin = linearize([
      { kind: "paragraph", text: "Steps:" },
      { kind: "listItem", depth: 0, label: "1.", text: "Isolate" }, { kind: "listItem", depth: 0, label: "", text: "Use your own lock.", continuation: true },
      { kind: "listItem", depth: 1, label: "a)", text: "Test" }, { kind: "listItem", depth: 1, label: "", text: "Twice.", continuation: true }
    ]);
    expect(lin.text.split("\n")).toEqual(["Steps:", "1. Isolate", "   Use your own lock.", "  a) Test", "     Twice."]);
    expect(sourceRuns(lin)).toEqual([["Steps:"], ["Isolate"], ["Use your own lock."], ["Test"], ["Twice."]]);
  });

  it("notes: [Note n] and [Note n, table k, row r] prefixes, note list labels and indentation are generated", () => {
    const lin = linearize([{ kind: "note", n: 2, text: "", blocks: [
      { kind: "paragraph", text: "The permit requires:" },
      { kind: "listItem", depth: 0, label: "1.", text: "Isolation" }, { kind: "listItem", depth: 1, label: "•", text: "Lock" },
      { kind: "table", index: 0, headerRows: 1, rows: [row("Step", "Owner"), row("Test", "Electrician")] }
    ] }]);
    expect(lin.text.split("\n")).toEqual(["[Note 2] The permit requires:", "[Note 2] 1. Isolation", "[Note 2]   • Lock", "[Note 2, table 1, row 1] Step: Test; Owner: Electrician"]);
    expect(sourceRuns(lin)).toEqual([["The permit requires:"], ["Isolation"], ["Lock"], ["Step", "Test", "Owner", "Electrician"]]);
  });

  it("an adapter's generated ranges inside block text (a note reference) stay generated through linearize", () => {
    const [p] = normaliseBlocks([{ kind: "paragraph", text: "Evidence is kept.[1]  It is filed.", generated: [[17, 20]] }]);
    const lin = linearize([p!, { kind: "note", n: 1, text: "As defined." }]);
    expect(lin.text.split("\n")).toEqual(["Evidence is kept.[1] It is filed.", "[Note 1] As defined."]);
    expect(sourceRuns(lin)).toEqual([["Evidence is kept.", " It is filed."], ["As defined."]]);
  });

  it("DOCX and ODT note references inserted by the adapters are generated; the notes' own text is source", async () => {
    for (const [name, result] of [["docx", await ingestDocx(await readFile(resolve(structure, "structure.docx")), opts("s.docx"))], ["odt", await ingestOdt(await readFile(resolve(structure, "structure.odt")), opts("s.odt"))]] as const) {
      const a = result.analysis;
      const text = result.document.text;
      const at = text.indexOf("opinion given.[1]") + "opinion given.".length;
      expect(a.generated.some(([s, e]) => s <= at && at + 3 <= e), `${name}: [1] is generated`).toBe(true);
      const rowLine = text.split("\n").find((l) => l.startsWith("[Table 1, row 2]"))!;
      const rowStart = text.indexOf(rowLine);
      const runs = sourceRuns({ text: rowLine, generated: a.generated.filter(([s, e]) => s < rowStart + rowLine.length && e > rowStart).map(([s, e]) => [Math.max(0, s - rowStart), Math.min(rowLine.length, e - rowStart)]) })[0];
      expect(runs, name).toEqual(["Period", "FY2026 ", "The period runs from 1 July to 30 June.", "Interim work in March"]);
      assertSpanInvariants(a.generated.length > 0 ? { text, generated: a.generated } : { text, generated: [] });
      // the adapter's raw "  FY2026  [2]": the space kept before [2] collapsed from authored spaces, so it is source
    }
  });

  it("text that is all generated or all source needs no runs; the stored text is byte-identical to the plain path", () => {
    const blocks: Block[] = [{ kind: "heading", level: 1, text: "Scope" }, { kind: "paragraph", text: "Plain text." }];
    expect(linearize(normaliseBlocks(blocks)).text).toBe("Scope\nPlain text.");
  });
});

describe("the conservative origin fallback reaches the analysis as a warning", () => {
  it("a block whose cluster-wise NFC disagrees keeps its text, counts 0 and is reported once with its position and raw counts", () => {
    const blocks = normaliseBlocks([{ kind: "paragraph", text: "Before." }, { kind: "paragraph", text: "Café [1] ok", generated: [[5, 8]] }], { clusterNormalise: (s) => s.normalize("NFD") });
    const lin = linearize(blocks);
    expect(lin.text).toBe("Before.\nCafé [1] ok");
    const start = lin.text.indexOf("Café");
    expect(lin.originFallbacks).toEqual([{ charStart: start, charEnd: lin.text.length, sourceCodePoints: 8, generatedCodePoints: 3 }]);
    expect(countSourceCodePoints(lin.text, lin.generated, start, lin.text.length)).toBe(0);
    expect(countSourceCodePoints(lin.text, lin.generated, 0, 7)).toBe(7);
  });
});

describe("headings and structures", () => {
  it("records each heading line with its level and offsets, never a heading inside a cell", async () => {
    const docx = await ingestDocx(await D.zipDocx(D.structureParts({ body: [
      D.heading(1, "Scope"), D.para(PAD), D.tbl([D.tr([D.tc(D.heading(2, "Cell heading")), D.tc(D.para("x"))])], 2), D.heading(3, "Deep")
    ] })), opts("h.docx"));
    const { text } = docx.document;
    expect(docx.analysis.headings.map((h) => [h.level, h.text, text.slice(h.charStart, h.charEnd)])).toEqual([[1, "Scope", "Scope"], [3, "Deep", "Deep"]]);
    const odt = await ingestOdt(await O.zipOdt(O.structureOdtParts({ body: [O.h(1, "Scope"), O.para(PAD), O.table("T", 2, [O.row([O.cell(O.h(2, "Cell heading")), O.cell(O.para("x"))])]), O.h(3, "Deep")] })), opts("h.odt"));
    expect(odt.analysis.headings.map((h) => [h.level, h.text])).toEqual([[1, "Scope"], [3, "Deep"]]);
  });

  it("records tables with their rows, lists with their items (continuations included) and notes with their lines", () => {
    const lin = linearize([
      { kind: "heading", level: 1, text: "A" },
      { kind: "listItem", depth: 0, label: "1.", text: "One. Two." }, { kind: "note", n: 1, text: "Inside the list." },
      { kind: "listItem", depth: 1, label: "a)", text: "Child" }, { kind: "listItem", depth: 0, label: "", text: "More of one.", continuation: true },
      { kind: "listItem", depth: 0, label: "2.", text: "Second" },
      { kind: "paragraph", text: "Between." },
      { kind: "table", index: 1, headerRows: 1, rows: [row("K", "V"), row("a", "b"), row("c", "d")] },
      { kind: "listItem", depth: 0, label: "•", text: "Another list" },
      { kind: "note", n: 2, text: "", blocks: [{ kind: "paragraph", text: "Note text." }, { kind: "table", index: 0, headerRows: 0, rows: [row("p", "q")] }] }
    ]);
    const lineOf = (r: { charStart: number; charEnd: number }) => lin.text.slice(r.charStart, r.charEnd);
    const shaped = lin.structures.map((s) => s.kind === "table" ? { table: s.name, path: s.headingPath, rows: s.rows.map(lineOf) }
      : s.kind === "list" ? { list: s.index, items: s.items.map((i) => ({ depth: i.depth, lines: i.lines.map(lineOf) })) }
      : { note: s.n, lines: s.lines.map(lineOf) });
    expect(shaped).toEqual([
      { list: 1, items: [{ depth: 0, lines: ["1. One. Two.", "   More of one."] }, { depth: 1, lines: ["  a) Child"] }, { depth: 0, lines: ["2. Second"] }] },
      { note: 1, lines: ["[Note 1] Inside the list."] },
      { table: "1", path: ["A"], rows: ["[Table 1, row 1] K: a; V: b", "[Table 1, row 2] K: c; V: d"] },
      { list: 2, items: [{ depth: 0, lines: ["• Another list"] }] },
      { note: 2, lines: ["[Note 2] Note text.", "[Note 2, table 1, row 1] Column 1: p; Column 2: q"] },
      { table: "Note 2, table 1", path: ["A"], rows: ["[Note 2, table 1, row 1] Column 1: p; Column 2: q"] }
    ]);
  });

  it("records lists inside body notes, with nested items and continuations, without changing the note's lines", () => {
    const lin = linearize([{ kind: "note", n: 4, text: "", blocks: [
      { kind: "paragraph", text: "Steps:" },
      { kind: "listItem", depth: 0, label: "1.", text: "Isolate. Then lock." }, { kind: "listItem", depth: 1, label: "•", text: "Padlock" },
      { kind: "listItem", depth: 0, label: "", text: "Then tag.", continuation: true }, { kind: "listItem", depth: 0, label: "2.", text: "Test" },
      { kind: "paragraph", text: "After." }, { kind: "listItem", depth: 0, label: "•", text: "Second list" }
    ] }]);
    expect(lin.text.split("\n")).toEqual(["[Note 4] Steps:", "[Note 4] 1. Isolate. Then lock.", "[Note 4]   • Padlock", "[Note 4] Then tag.", "[Note 4] 2. Test", "[Note 4] After.", "[Note 4] • Second list"]);
    const lineOf = (r: { charStart: number; charEnd: number }) => lin.text.slice(r.charStart, r.charEnd);
    expect(lin.structures.map((s) => s.kind === "list" ? { list: s.index, items: s.items.map((i) => [i.depth, ...i.lines.map(lineOf)]) } : s.kind === "note" ? { note: s.n, lines: s.lines.length } : s.kind)).toEqual([
      { note: 4, lines: 7 },
      { list: 1, items: [[0, "[Note 4] 1. Isolate. Then lock.", "[Note 4] Then tag."], [1, "[Note 4]   • Padlock"], [0, "[Note 4] 2. Test"]] },
      { list: 2, items: [[0, "[Note 4] • Second list"]] }
    ]);
  });

  it("every list sentence of the structure fixtures belongs to exactly one list item, including the five in notes", async () => {
    for (const [name, r] of [["docx", await ingestDocx(await readFile(resolve(structure, "structure.docx")), opts("s.docx"))], ["odt", await ingestOdt(await readFile(resolve(structure, "structure.odt")), opts("s.odt"))]] as const) {
      const lines = r.analysis.structures.flatMap((s) => s.kind === "list" ? s.items.flatMap((item) => item.lines) : []);
      for (const sentence of r.document.sentences.filter((x) => x.listDepth !== null)) {
        expect(lines.filter((l) => l.charStart <= sentence.charStart && sentence.charEnd <= l.charEnd), `${name} ${sentence.text}`).toHaveLength(1);
      }
      const inNotes = r.analysis.structures.filter((s) => s.kind === "list").map((s) => s.kind === "list" ? s.items.map((i) => [i.depth, r.document.text.slice(i.lines[0]!.charStart, i.lines[0]!.charEnd)]) : []).filter((items) => String(items[0]![1]).startsWith("[Note"));
      expect(inNotes, name).toEqual([
        [[0, "[Note 1] • a written plan"], [1, "[Note 1]   • approved by the engagement partner"], [0, "[Note 1] • a record of the evidence"]],
        [[0, "[Note 3] 1. Draft report"], [0, "[Note 3] 2. Final report"]]
      ]);
    }
  });

  it("span invariants hold for every structured fixture, and the analysis is bound to its document", async () => {
    const results = [
      await ingestDocx(await readFile(resolve(structure, "structure.docx")), opts("s.docx")), await ingestOdt(await readFile(resolve(structure, "structure.odt")), opts("s.odt")),
      await ingestDocx(await electricalDocx(), opts("e.docx")), await ingestOdt(await electricalOdt(), opts("e.odt"))
    ];
    for (const r of results) {
      assertSpanInvariants({ text: r.document.text, generated: r.analysis.generated });
      expect(r.analysis.textHash).toBe(r.document.textHash);
      expect(r.analysis.extractionVersion).toBe(r.document.metadata.extractionVersion);
      expect(r.analysis.originFallbacks).toEqual([]);
    }
  });
});

describe("generated padding cannot pass for source text", () => {
  it("a wide table of empty cells with no marked header is mostly generated: stored text over 500 code points, source text 2", () => {
    const empty = Array.from({ length: 12 }, () => "");
    const rows = [["a", ...empty.slice(1)], ...Array.from({ length: 5 }, () => [...empty]), ["b", ...empty.slice(1)]];
    const lin = linearize([{ kind: "table", index: 1, headerRows: 0, rows: rows.map((r) => row(...r)) }]);
    expect([...lin.text].length).toBeGreaterThan(500);
    expect(countLines(lin)).toBe(2);
  });

  it("each authored cell counts once within a selection, wherever its occurrences are: span copies keep their identity", () => {
    const lin = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [
      row("Risk", "Rating", "Owner"),
      [cell("Missing records", { rowSpan: 2 }), cell("High", { colSpan: 2 })],
      [cell("Low"), cell("Finance")]
    ] }]);
    expect(lin.text.split("\n")).toEqual(["[Table 1, row 1] Risk: Missing records; Rating: High; Owner: High", "[Table 1, row 2] Risk: Missing records; Rating: Low; Owner: Finance"]);
    expect(sourceRuns(lin)).toEqual([["Risk", "Missing records", "Rating", "High", "Owner", "High"], ["Risk", "Missing records", "Rating", "Low", "Owner", "Finance"]]);
    const labels = 4 + 6 + 5;
    expect(countLines(lin)).toBe(labels + 15 + 4 + 3 + 7); // several copies together: labels, "Missing records" and "High" once each
    expect(countLines(lin, [1])).toBe(labels + 15 + 3 + 7); // a span-copy-only selection: row 2 holds only a copy of "Missing records"
    expect(countLines(lin, [0])).toBe(labels + 15 + 4); // "High" twice in row 1, from one column-spanning cell
  });

  it("a long header label repeated over many empty rows counts once, so it cannot reach the minimum", () => {
    const label = "Description of the control measure applied";
    const lin = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [row(label), ...Array.from({ length: 20 }, () => row(""))] }]);
    expect([...lin.text].length).toBeGreaterThan(500);
    expect(countLines(lin)).toBe(label.length);
  });

  it("a marked header row with empty columns is padded by generated Column n fallbacks, which never count", () => {
    const header = ["Item", ...Array.from({ length: 11 }, () => "")];
    const rows = [header, ...Array.from({ length: 7 }, (_, i) => [i === 0 ? "x" : "", ...Array.from({ length: 11 }, () => "")])];
    const lin = linearize([{ kind: "table", index: 1, headerRows: 1, rows: rows.map((r) => row(...r)) }]);
    expect(lin.text.split("\n")[0]).toContain("; Column 2: —; Column 3: —");
    expect([...lin.text].length).toBeGreaterThan(500);
    expect(countLines(lin)).toBe("Item".length + 1);
  });
});

describe("counting within a selection: each authored unit once, separately authored text distinct", () => {
  it("a later row alone counts its header labels: a 16-code-point header and 484 authored code points make 500", () => {
    const header = "Sixteen-char hdr";
    expect([...header].length).toBe(16);
    const lin = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [row(header), row("first"), row("second"), row("x".repeat(484))] }]);
    expect(countLines(lin, [2])).toBe(500);
    expect(countLines(lin, [1, 2])).toBe(16 + "second".length + 484);
  });

  it("separately authored equal text stays distinct: equal cells in a row, equal header cells, and equal headers in two tables", () => {
    const sameCells = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [row("A", "B"), row("High", "High")] }]);
    expect(countLines(sameCells)).toBe(1 + 1 + 4 + 4);
    const sameHeaders = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [row("Risk", "Risk"), row("a", "b")] }]);
    expect(sameHeaders.text).toBe("[Table 1, row 1] Risk: a; Risk: b");
    expect(countLines(sameHeaders)).toBe(4 + 1 + 4 + 1);
    const twoTables = linearize([
      { kind: "table", index: 1, headerRows: 1, rows: [row("Risk"), row("a"), row("b")] },
      { kind: "table", index: 2, headerRows: 1, rows: [row("Risk"), row("c")] }
    ]);
    expect(countLines(twoTables)).toBe(4 + 1 + 1 + 4 + 1);
    expect(new Set(twoTables.repeats.map((o) => o.unit)).size).toBe(2);
  });

  it("a header cell spanning two columns is one unit; a separately authored equal header is another", () => {
    const spanned = linearize([{ kind: "table", index: 1, headerRows: 1, rows: [[cell("Rating", { colSpan: 2 })], row("a", "b")] }]);
    expect(spanned.text).toBe("[Table 1, row 1] Rating: a; Rating: b");
    expect(countLines(spanned)).toBe(6 + 1 + 1);
  });
});
