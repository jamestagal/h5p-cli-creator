import { NormalisationInvariantError } from "../admit.js";
import { normaliseBlockText, type Block, type Cell } from "./blocks.js";

/**
 * A range of the linearized text. Offsets are UTF-16 code units into `text`, half-open. An atomic range is one sentence
 * and is never split. `listDepth` is the depth of a list item (0 = top level), null for anything else: the indentation in
 * the text does not survive sentence trimming, so the depth travels as metadata.
 */
export interface Segment {
  charStart: number; charEnd: number; atomic: boolean; headingPath: string[]; listDepth: number | null;
  /** For a list item: UTF-16 units from charStart to the end of its label (indent included), so the splitter never ends a sentence inside it ("1."). */
  labelEnd?: number;
}
/**
 * A table written as atomic row lines, for inspection (`leap extract`'s tables.md). `name` is how its lines cite it:
 * "3" for `[Table 3, row r]`, "Note 2, table 1" for a table in a note. `labels` are the column labels from the marked
 * header rows, or null when the format marked none (the lines then use `Column n`). `firstRows` are its first two
 * lines, exactly as in the text. Tables nested in cells are written inline in their row and are not listed.
 */
export interface TableSummary { name: string; headingPath: string[]; markedHeaderRows: number; labels: string[] | null; rowCount: number; firstRows: string[] }
export interface Linearized { text: string; segments: Segment[]; tables: TableSummary[] }

interface Line { text: string; atomic: boolean; headingPath: string[]; listDepth: number | null; labelEnd?: number }

const EMPTY = "—";

function assertNormalised(text: string, where: string): string {
  if (normaliseBlockText(text) !== text) throw new NormalisationInvariantError(`${where} text was not normalised before linearizing: ${JSON.stringify(text.slice(0, 80))}`);
  return text;
}

/** The grid of cell texts with every span repeated into each position it covers. */
function expandGrid(rows: Cell[][], render: (cell: Cell) => string): string[][] {
  const grid: string[][] = [];
  rows.forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of row) {
      while (grid[r]![c] !== undefined) c++;
      const value = render(cell);
      for (let dr = 0; dr < Math.max(1, cell.rowSpan); dr++) {
        const target = (grid[r + dr] ??= []);
        for (let dc = 0; dc < Math.max(1, cell.colSpan); dc++) target[c + dc] = value;
      }
      c += Math.max(1, cell.colSpan);
    }
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.slice(0, rows.length).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}

/** Column labels: the header rows' values per column, consecutive repeats (from spans) dropped, joined with " / "; `Column n` when there are none. */
function labelsFor(header: string[][], width: number): string[] {
  return Array.from({ length: width }, (_, c) => {
    const parts: string[] = [];
    for (const row of header) { const v = row[c] ?? ""; if (v !== "" && parts.at(-1) !== v) parts.push(v); }
    return parts.length > 0 ? parts.join(" / ") : `Column ${c + 1}`;
  });
}

/**
 * Structured content on one line, for a table cell or a note inside one: `text`, then paragraphs, list runs (inlineList),
 * nested tables (inlineTable, named by `nestedName`) and notes (`[Note n] …`) in order.
 */
function inlineContent(text: string, blocks: Block[], where: string, nestedName: () => string): string {
  const parts = [assertNormalised(text, where)];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.kind === "listItem") {
      const run: Array<Extract<Block, { kind: "listItem" }>> = [];
      while (blocks[i]?.kind === "listItem") run.push(blocks[i++] as Extract<Block, { kind: "listItem" }>);
      i--;
      parts.push(inlineList(run, where));
    } else if (b.kind === "table") parts.push(inlineTable(b, nestedName()));
    else if (b.kind === "note") parts.push(`[Note ${b.n}] ${inlineContent(b.text, b.blocks ?? [], `${where} note`, nestedName)}`.trimEnd());
    else parts.push(assertNormalised(b.text, `${where} ${b.kind}`));
  }
  return parts.filter((p) => p !== "").join(" ");
}

/** A table as data rows of `label: value` pairs, one entry per data row. `name` is its number: "4", or "4.1" when nested. */
function tableRows(table: Extract<Block, { kind: "table" }>, name: string): Array<{ n: number; pairs: string[] }> & { labels: string[]; headerCount: number } {
  let nested = 0;
  const render = (cell: Cell): string => inlineContent(cell.text, cell.blocks ?? [], `Table ${name} cell`, () => `${name}.${++nested}`);
  const grid = expandGrid(table.rows, render);
  const headerCount = Math.min(Math.max(0, table.headerRows), grid.length);
  const width = grid[0]?.length ?? 0;
  const labels = labelsFor(grid.slice(0, headerCount), width);
  const rows = grid.slice(headerCount).map((cells, i) => ({ n: i + 1, pairs: cells.map((v, c) => `${labels[c]}: ${v === "" ? EMPTY : v}`) }));
  return Object.assign(rows, { labels, headerCount });
}

/** Writes a table's row lines through `push` and returns its summary. */
function writeTable(rows: ReturnType<typeof tableRows>, name: string, lineOf: (r: { n: number; pairs: string[] }) => string, headingPath: string[], push: (text: string) => void): TableSummary {
  const lines = rows.map(lineOf);
  for (const l of lines) push(l);
  return { name, headingPath, markedHeaderRows: rows.headerCount, labels: rows.headerCount > 0 ? rows.labels : null, rowCount: rows.length, firstRows: lines.slice(0, 2) };
}

/**
 * Consecutive list items inside a cell, on one line. Nesting is explicit: the children of an item follow it inside
 * `[sub-list: …]`, so a nested child can never read as a sibling: `• Lock [sub-list: • Padlock • Hasp] • Tag`.
 */
function inlineList(items: Array<Extract<Block, { kind: "listItem" }>>, where: string): string {
  const base = Math.min(...items.map((b) => Math.max(0, b.depth)));
  let out = "";
  let level = base;
  for (const b of items) {
    const depth = Math.max(0, b.depth);
    while (level < depth) { out += " [sub-list:"; level++; }
    while (level > depth) { out += "]"; level--; }
    const body = [assertNormalised(b.label, `${where} list label`), assertNormalised(b.text, `${where} list item`)].filter(Boolean).join(" ");
    if (body !== "") out += ` ${body}`;
  }
  while (level > base) { out += "]"; level--; }
  return out.trim();
}

/** A table inside a cell, written on one line: `[Table 4.1 row 1: A: x, B: y; row 2: …]`. */
function inlineTable(table: Extract<Block, { kind: "table" }>, name: string): string {
  const rows = tableRows(table, name);
  return `[Table ${name}${rows.length === 0 ? "" : ` ${rows.map((r) => `row ${r.n}: ${r.pairs.join(", ")}`).join("; ")}`}]`;
}

/**
 * A note's lines. Every line starts `[Note n]`, so its content never reads as body text: the note's text and paragraphs,
 * its list items indented by depth with their labels (depth kept as metadata, as in the body), and each data row of a
 * table in it as an atomic line `[Note n, table k, row r] …`. Anything else in it is written inline.
 */
function noteLines(note: Extract<Block, { kind: "note" }>, push: (text: string, atomic?: boolean, listDepth?: number | null, labelEnd?: number) => void, headingPath: string[], tablesOut: TableSummary[]): void {
  const prefix = `[Note ${note.n}]`;
  let count = 0;
  let tables = 0;
  const line = (text: string, atomic = false, listDepth: number | null = null, labelEnd?: number): void => { if (text === "") return; push(`${prefix} ${text}`, atomic, listDepth, labelEnd === undefined ? undefined : prefix.length + 1 + labelEnd); count++; };
  line(assertNormalised(note.text, "note"));
  for (const b of note.blocks ?? []) {
    if (b.kind === "listItem") {
      const label = assertNormalised(b.label, "note list label");
      const body = [label, assertNormalised(b.text, "note list item")].filter(Boolean).join(" ");
      const indent = "  ".repeat(Math.max(0, b.depth));
      line(body === "" ? "" : `${indent}${body}`, false, Math.max(0, b.depth), label === "" ? undefined : indent.length + label.length);
    } else if (b.kind === "table") {
      const k = ++tables;
      tablesOut.push(writeTable(tableRows(b, `note ${note.n}.${k}`), `Note ${note.n}, table ${k}`, (r) => `[Note ${note.n}, table ${k}, row ${r.n}] ${r.pairs.join("; ")}`, headingPath, (l) => { push(l, true); count++; }));
    } else if (b.kind === "note") line(inlineContent("", [b], `Note ${note.n}`, () => `${note.n}.${++tables}`));
    else line(assertNormalised(b.text, `note ${b.kind}`));
  }
  if (count === 0) push(prefix);
}

/**
 * Blocks → source text and segments. Headings are lines of their own and set the heading path; list items are
 * indented by depth with their label, and an item's continuation paragraphs keep its depth, without a label, indented
 * under its text; each table data row is one atomic line `[Table n, row r] label: value; …`;
 * notes are lines starting `[Note n]` (noteLines). Empty blocks produce no line, lines are joined with "\n", and every piece of text must
 * already be normalised, so the result is a fixed point of normaliseSourceText.
 */
export function linearize(blocks: Block[]): Linearized {
  const lines: Line[] = [];
  const headings: Array<{ level: number; text: string }> = [];
  const path = (): string[] => headings.map((h) => h.text);
  const labelWidth: number[] = []; // label length of the latest item at each depth, for continuation paragraphs
  const tables: TableSummary[] = [];
  const push = (text: string, atomic = false, listDepth: number | null = null, labelEnd?: number): void => { if (text !== "") lines.push({ text, atomic, headingPath: path(), listDepth, ...(labelEnd ? { labelEnd } : {}) }); };

  for (const b of blocks) {
    switch (b.kind) {
      case "heading": {
        const text = assertNormalised(b.text, "heading");
        if (text === "") break;
        while (headings.length > 0 && headings.at(-1)!.level >= b.level) headings.pop();
        headings.push({ level: b.level, text });
        push(text);
        break;
      }
      case "paragraph": push(assertNormalised(b.text, "paragraph")); break;
      case "listItem": {
        const depth = Math.max(0, b.depth);
        if (b.continuation) {
          // A further paragraph of the item above: same depth, no label, indented under the item's text (a hanging indent).
          const text = assertNormalised(b.text, "list item continuation");
          const hang = labelWidth[depth] ?? 0;
          if (text !== "") push(`${lines.length === 0 ? "" : `${"  ".repeat(depth)}${" ".repeat(hang === 0 ? 0 : hang + 1)}`}${text}`, false, depth);
          break;
        }
        const label = assertNormalised(b.label, "list label");
        labelWidth[depth] = label.length;
        labelWidth.length = depth + 1;
        const body = [label, assertNormalised(b.text, "list item")].filter(Boolean).join(" ");
        const indent = lines.length === 0 ? "" : "  ".repeat(depth);
        if (body !== "") push(`${indent}${body}`, false, depth, label === "" ? undefined : indent.length + label.length); // a leading indent on the first line would not survive trimming; the depth is kept as metadata either way
        break;
      }
      case "note": noteLines(b, push, path(), tables); break;
      case "table": {
        const name = String(b.index);
        tables.push(writeTable(tableRows(b, name), name, (r) => `[Table ${name}, row ${r.n}] ${r.pairs.join("; ")}`, path(), (l) => push(l, true)));
        break;
      }
    }
  }

  let text = "";
  const segments: Segment[] = [];
  for (const line of lines) {
    if (text !== "") text += "\n";
    const charStart = text.length;
    text += line.text;
    segments.push({ charStart, charEnd: text.length, atomic: line.atomic, headingPath: line.headingPath, listDepth: line.listDepth, ...(line.labelEnd ? { labelEnd: line.labelEnd } : {}) });
  }
  return { text, segments, tables };
}
