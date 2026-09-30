import { describe, it, expect } from "vitest";
import { linearize } from "../src/ingest/structure/linearize.js";
import { normaliseBlocks, normaliseBlockText, type Block, type Cell } from "../src/ingest/structure/blocks.js";
import { finaliseDocument, NormalisationInvariantError, normaliseSourceText, segmentSentences, SourceTooSmallError } from "../src/ingest/index.js";
import { chunkSentences, OversizeAtomicSegmentError } from "../src/concepts/chunk.js";
import { extractionRequest } from "../src/concepts/extract.js";

const cell = (text: string, span: Partial<Pick<Cell, "colSpan" | "rowSpan">> = {}, blocks?: Block[]): Cell => ({ text, colSpan: span.colSpan ?? 1, rowSpan: span.rowSpan ?? 1, ...(blocks ? { blocks } : {}) });
const row = (...texts: string[]): Cell[] => texts.map((t) => cell(t));
const lines = (blocks: Block[]) => linearize(blocks).text.split("\n");
const opts = { sourceId: "src" };
const FILLER: Block = { kind: "paragraph", text: "This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim() };

describe("linearize: tables", () => {
  it("keeps the first row of a table with no marked header row as data, labelled Column 1..n", () => {
    const table: Block = { kind: "table", index: 1, headerRows: 0, rows: [row("Audit scope", "All branches"), row("Period", "FY2026")] };
    expect(lines([table])).toEqual(["[Table 1, row 1] Column 1: Audit scope; Column 2: All branches", "[Table 1, row 2] Column 1: Period; Column 2: FY2026"]);
  });

  it("uses a marked header row for labels and does not emit it as data", () => {
    const table: Block = { kind: "table", index: 2, headerRows: 1, rows: [row("Risk", "Likelihood"), row("Missing records", "Medium")] };
    expect(lines([table])).toEqual(["[Table 2, row 1] Risk: Missing records; Likelihood: Medium"]);
  });

  it("repeats horizontal and vertical spans into every covered position, joins header rows with ' / ' and writes empty cells as —", () => {
    const table: Block = { kind: "table", index: 3, headerRows: 2, rows: [
      [cell("Risk", { rowSpan: 2 }), cell("Rating", { colSpan: 2 })],
      [cell("Likelihood"), cell("Impact")],
      [cell("Missing records", { rowSpan: 2 }), cell("Medium"), cell("High")],
      [cell("Low"), cell("")]
    ] };
    expect(lines([table])).toEqual([
      "[Table 3, row 1] Risk: Missing records; Rating / Likelihood: Medium; Rating / Impact: High",
      "[Table 3, row 2] Risk: Missing records; Rating / Likelihood: Low; Rating / Impact: —"
    ]);
  });

  it("keeps a list inside a cell in the cell text, in order, and writes a nested table inline", () => {
    const nested: Block = { kind: "table", index: 99, headerRows: 1, rows: [row("A", "B"), row("x", "y"), row("z", "")] };
    const table: Block = { kind: "table", index: 4, headerRows: 1, rows: [
      row("Task", "Detail"),
      [cell("Isolate"), cell("", {}, [{ kind: "paragraph", text: "Steps:" }, { kind: "listItem", depth: 0, label: "•", text: "Lock" }, { kind: "listItem", depth: 0, label: "•", text: "Tag" }])],
      [cell("Record"), cell("", {}, [{ kind: "paragraph", text: "See:" }, nested])]
    ] };
    expect(lines([table])).toEqual([
      "[Table 4, row 1] Task: Isolate; Detail: Steps: • Lock • Tag",
      "[Table 4, row 2] Task: Record; Detail: See: [Table 4.1 row 1: A: x, B: y; row 2: A: z, B: —]"
    ]);
  });

  it("keeps a row containing '. ' as one atomic sentence that includes its [Table …] prefix", () => {
    const doc = finaliseDocument("text", ...linearizeArgs([FILLER, { kind: "table", index: 5, headerRows: 1, rows: [row("Step", "Action"), row("1", "Isolate. Then test for dead. Then work.")] }]), opts);
    const rowSentence = doc.sentences.find((s) => s.text.startsWith("[Table 5"))!;
    expect(rowSentence.text).toBe("[Table 5, row 1] Step: 1; Action: Isolate. Then test for dead. Then work.");
    expect(rowSentence.atomic).toBe(true);
    expect(doc.sentences.filter((s) => s.text.includes("Then work"))).toHaveLength(1);
  });
});

/** linearize's output as finaliseDocument's (text, segments) arguments. */
function linearizeArgs(blocks: Block[]): [string, ReturnType<typeof linearize>["segments"]] {
  const { text, segments } = linearize(blocks);
  return [text, segments];
}

describe("list nesting survives, in cells and into extraction requests", () => {
  const item = (depth: number, text: string): Block => ({ kind: "listItem", depth, label: "•", text });
  const inCell = (items: Block[]): Block => ({ kind: "table", index: 9, headerRows: 1, rows: [row("Task", "Steps"), [cell("Isolate"), cell("", {}, items)]] });

  it("a nested child in a cell is written as a sub-list of its parent, not as a sibling", () => {
    const nested = lines([inCell([item(0, "Lock"), item(1, "Padlock"), item(1, "Hasp"), item(0, "Tag")])]);
    const flat = lines([inCell([item(0, "Lock"), item(0, "Padlock"), item(0, "Hasp"), item(0, "Tag")])]);
    expect(nested).toEqual(["[Table 9, row 1] Task: Isolate; Steps: • Lock [sub-list: • Padlock • Hasp] • Tag"]);
    expect(flat).toEqual(["[Table 9, row 1] Task: Isolate; Steps: • Lock • Padlock • Hasp • Tag"]);
    expect(lines([inCell([item(0, "A"), item(1, "B"), item(2, "C"), item(0, "D")])])).toEqual(["[Table 9, row 1] Task: Isolate; Steps: • A [sub-list: • B [sub-list: • C]] • D"]);
  });

  it("outside tables, each list sentence records its depth, which the extraction request shows", () => {
    const listOf = (depths: number[]): Block[] => [FILLER, ...depths.map((d, i) => item(d, `Step ${i + 1} of the isolation.`))];
    const nestedDoc = finaliseDocument("text", ...linearizeArgs(listOf([0, 1, 1, 0])), opts);
    const flatDoc = finaliseDocument("text", ...linearizeArgs(listOf([0, 0, 0, 0])), opts);
    expect(nestedDoc.text).not.toBe(flatDoc.text);
    const steps = (d: typeof nestedDoc) => d.sentences.filter((x) => x.text.startsWith("• Step")).map((x) => [x.text, x.listDepth]);
    expect(steps(nestedDoc)).toEqual([["• Step 1 of the isolation.", 0], ["• Step 2 of the isolation.", 1], ["• Step 3 of the isolation.", 1], ["• Step 4 of the isolation.", 0]]);
    expect(steps(flatDoc).map(([, d]) => d)).toEqual([0, 0, 0, 0]);
    for (const x of nestedDoc.sentences) expect(nestedDoc.text.slice(x.charStart, x.charEnd)).toBe(x.text);
    const request = (d: typeof nestedDoc) => extractionRequest(chunkSentences(d.sentences, 6000)[0]!, {}).user;
    expect(request(nestedDoc)).not.toBe(request(flatDoc));
    expect(request(nestedDoc)).toContain("(list level 2) • Step 2 of the isolation.");
    expect(request(flatDoc)).toContain("(list level 1) • Step 2 of the isolation.");
    expect(nestedDoc.sentences.find((x) => x.text.startsWith("This paragraph"))!.listDepth).toBeNull();
  });

  it("plain sources carry no list depth, so their requests are unchanged", () => {
    const plain = segmentSentences("• Not a list item here. Another sentence.");
    expect(plain.map((x) => x.listDepth)).toEqual([null, null]);
    expect(extractionRequest(chunkSentences(plain, 6000)[0]!, {}).user).not.toContain("list level");
  });
});

describe("linearize: lists, notes and headings", () => {
  it("keeps list depth and labels", () => {
    expect(lines([
      { kind: "listItem", depth: 0, label: "1.", text: "Prepare" }, { kind: "listItem", depth: 1, label: "a)", text: "Check the permit" },
      { kind: "listItem", depth: 1, label: "b)", text: "Brief the team" }, { kind: "listItem", depth: 0, label: "2.", text: "Isolate" }
    ])).toEqual(["1. Prepare", "  a) Check the permit", "  b) Brief the team", "2. Isolate"]);
  });

  it("writes notes as [Note n] text where they are placed", () => {
    expect(lines([{ kind: "paragraph", text: "Records are kept for seven years.1" }, { kind: "note", n: 1, text: "Under the retention policy." }])).toEqual(["Records are kept for seven years.1", "[Note 1] Under the retention policy."]);
  });

  it("gives each sentence its heading path; a new H2 replaces the old one", () => {
    const blocks: Block[] = [
      { kind: "heading", level: 1, text: "Topic 1" }, { kind: "paragraph", text: "Intro sentence." },
      { kind: "heading", level: 2, text: "Audit evidence" }, { kind: "paragraph", text: "Sampling matters." },
      { kind: "heading", level: 2, text: "Reporting" }, { kind: "paragraph", text: "Write it up." }, FILLER
    ];
    const doc = finaliseDocument("text", ...linearizeArgs(blocks), opts);
    const pathOf = (t: string) => doc.sentences.find((s) => s.text === t)!.headingPath;
    expect(pathOf("Intro sentence.")).toEqual(["Topic 1"]);
    expect(pathOf("Sampling matters.")).toEqual(["Topic 1", "Audit evidence"]);
    expect(pathOf("Write it up.")).toEqual(["Topic 1", "Reporting"]);
    expect(pathOf("Audit evidence")).toEqual(["Topic 1", "Audit evidence"]);
  });
});

describe("normalise before offsets (R11)", () => {
  const vietnamese = "Người thợ điện phải cắt điện trước khi làm việc.";
  const raw: Block[] = [
    { kind: "paragraph", text: "   " }, { kind: "paragraph", text: "\n" },
    { kind: "paragraph", text: `  ${vietnamese.normalize("NFD")}  ` },
    { kind: "table", index: 1, headerRows: 1, rows: [
      [cell(" Việc ".normalize("NFD")), cell("Ghi chú\n")],
      [cell("  Kiểm tra\n  điện  ".normalize("NFD")), cell("line one\nline\t\ttwo")]
    ] },
    FILLER,
    { kind: "paragraph", text: "" }, { kind: "paragraph", text: " \t " }
  ];

  it("normaliseBlockText applies NFC, turns newlines into spaces, collapses spaces and tabs, and trims", () => {
    expect(normaliseBlockText("  a\nb\t\t c  ".normalize("NFD"))).toBe("a b c");
    expect(normaliseBlockText("Việt".normalize("NFD"))).toBe("Việt");
  });

  it("produces a fixed point of normaliseSourceText whose segments and sentences slice back exactly, in NFC only", () => {
    const { text, segments } = linearize(normaliseBlocks(raw));
    expect(normaliseSourceText(text)).toBe(text);
    expect(text).toBe(text.normalize("NFC"));
    expect(text).toContain(vietnamese);
    expect(text).toContain("[Table 1, row 1] Việc: Kiểm tra điện; Ghi chú: line one line two");
    for (const s of segments) expect(s.charEnd).toBeGreaterThan(s.charStart);
    const doc = finaliseDocument("text", text, segments, opts);
    expect(doc.text).toBe(text);
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    for (const seg of segments.filter((x) => x.atomic)) expect(doc.sentences.some((s) => s.charStart === seg.charStart && s.charEnd === seg.charEnd && s.atomic)).toBe(true);
  });

  it("refuses to linearize block text that was not normalised first", () => {
    expect(() => linearize(raw)).toThrow(NormalisationInvariantError);
  });

  it("finaliseDocument refuses a text that is not a fixed point of normaliseSourceText, and never transforms it", () => {
    expect(() => finaliseDocument("text", `  ${FILLER.kind === "paragraph" ? FILLER.text : ""}\r\n`, [], opts)).toThrow(NormalisationInvariantError);
    expect(() => finaliseDocument("text", `${vietnamese.normalize("NFD")} ${"x".repeat(600)}`, [], opts)).toThrow(NormalisationInvariantError);
  });

  it("finaliseDocument admits the source (the only structured-path admission)", () => {
    expect(() => finaliseDocument("text", "Too short.", [{ charStart: 0, charEnd: 10, atomic: false, headingPath: [], listDepth: null }], opts)).toThrow(SourceTooSmallError);
  });
});

describe("segmentSentences with segments", () => {
  it("behaves as in phase 2 without segments, with empty heading paths and nothing atomic", () => {
    const s = segmentSentences("Lock it out. Then test for dead!\nNew line.");
    expect(s.map((x) => [x.text, x.headingPath, x.atomic])).toEqual([["Lock it out.", [], false], ["Then test for dead!", [], false], ["New line.", [], false]]);
  });

  it("never splits an atomic range and splits the others by the phase-2 rules", () => {
    const text = "First one. Second one.\n[Table 1, row 1] A: x. y; B: z";
    const s = segmentSentences(text, [{ charStart: 0, charEnd: 22, atomic: false, headingPath: ["H"], listDepth: null }, { charStart: 23, charEnd: text.length, atomic: true, headingPath: ["H"], listDepth: null }]);
    expect(s.map((x) => [x.sentenceId, x.text, x.atomic, x.headingPath])).toEqual([["s1", "First one.", false, ["H"]], ["s2", "Second one.", false, ["H"]], ["s3", "[Table 1, row 1] A: x. y; B: z", true, ["H"]]]);
  });
});

describe("chunkSentences and atomic rows (R4)", () => {
  it("throws OversizeAtomicSegmentError naming the table row, its size and the budget", () => {
    const doc = finaliseDocument("text", ...linearizeArgs([{ kind: "heading", level: 1, text: "Audit" }, FILLER, { kind: "table", index: 7, headerRows: 1, rows: [row("Risk", "Control"), row("Missing records", "Monthly reconciliation of every ledger account against the bank statement, signed off by the finance manager")] }]), opts);
    const refused = (() => { try { chunkSentences(doc.sentences, 30); return null; } catch (e) { return e; } })();
    expect(refused).toBeInstanceOf(OversizeAtomicSegmentError);
    const err = refused as OversizeAtomicSegmentError;
    expect(err).toMatchObject({ label: "[Table 7, row 1]", headingPath: ["Audit"], budgetTokens: 30 });
    expect(err.estimatedTokens).toBeGreaterThan(30);
    expect(err.message).toMatch(/\[Table 7, row 1\].*Audit.*tokens.*budget of 30.*--chunk-tokens.*split the table/);
  });

  it("still gives an oversize ordinary sentence a chunk of its own", () => {
    const long = `${"word ".repeat(200).trim()}.`;
    const chunks = chunkSentences(segmentSentences(`Short one. ${long} Short two.`), 30);
    expect(chunks.map((c) => c.sentences.map((s) => s.text.length))).toEqual([[10], [long.length], [10]]);
  });

  it("never places a chunk boundary inside a row: rows are whole sentences", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`Item ${i + 1}`, `Value ${i + 1}`));
    const doc = finaliseDocument("text", ...linearizeArgs([FILLER, { kind: "table", index: 8, headerRows: 0, rows }]), opts);
    for (const chunk of chunkSentences(doc.sentences, 40)) for (const s of chunk.sentences) if (s.atomic) expect(s.text).toMatch(/^\[Table 8, row \d+\] Column 1: Item \d+; Column 2: Value \d+$/);
  });
});
