import { NormalisationInvariantError } from "../admit.js";
import { normaliseBlockText, type Block, type Cell } from "./blocks.js";

/** A range of the linearized text. Offsets are UTF-16 code units into `text`, half-open. An atomic range is one sentence and is never split. */
export interface Segment { charStart: number; charEnd: number; atomic: boolean; headingPath: string[] }
export interface Linearized { text: string; segments: Segment[] }

interface Line { text: string; atomic: boolean; headingPath: string[] }

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

/** A table as data rows of `label: value` pairs, one entry per data row. `name` is its number: "4", or "4.1" when nested. */
function tableRows(table: Extract<Block, { kind: "table" }>, name: string): Array<{ n: number; pairs: string[] }> {
  let nested = 0;
  const render = (cell: Cell): string => {
    const parts = [assertNormalised(cell.text, `Table ${name} cell`)];
    for (const b of cell.blocks ?? []) {
      if (b.kind === "table") parts.push(inlineTable(b, `${name}.${++nested}`));
      else if (b.kind === "listItem") parts.push([assertNormalised(b.label, `Table ${name} list label`), assertNormalised(b.text, `Table ${name} list item`)].filter(Boolean).join(" "));
      else if (b.kind === "note") parts.push(`[Note ${b.n}] ${assertNormalised(b.text, `Table ${name} note`)}`);
      else parts.push(assertNormalised(b.text, `Table ${name} cell ${b.kind}`));
    }
    return parts.filter((p) => p !== "").join(" ");
  };
  const grid = expandGrid(table.rows, render);
  const headerCount = Math.min(Math.max(0, table.headerRows), grid.length);
  const width = grid[0]?.length ?? 0;
  const labels = labelsFor(grid.slice(0, headerCount), width);
  return grid.slice(headerCount).map((cells, i) => ({ n: i + 1, pairs: cells.map((v, c) => `${labels[c]}: ${v === "" ? EMPTY : v}`) }));
}

/** A table inside a cell, written on one line: `[Table 4.1 row 1: A: x, B: y; row 2: …]`. */
function inlineTable(table: Extract<Block, { kind: "table" }>, name: string): string {
  const rows = tableRows(table, name);
  return `[Table ${name}${rows.length === 0 ? "" : ` ${rows.map((r) => `row ${r.n}: ${r.pairs.join(", ")}`).join("; ")}`}]`;
}

/**
 * Blocks → source text and segments. Headings are lines of their own and set the heading path; list items are
 * indented by depth with their label; each table data row is one atomic line `[Table n, row r] label: value; …`;
 * notes are `[Note n] text`. Empty blocks produce no line, lines are joined with "\n", and every piece of text must
 * already be normalised, so the result is a fixed point of normaliseSourceText.
 */
export function linearize(blocks: Block[]): Linearized {
  const lines: Line[] = [];
  const headings: Array<{ level: number; text: string }> = [];
  const path = (): string[] => headings.map((h) => h.text);
  const push = (text: string, atomic = false): void => { if (text !== "") lines.push({ text, atomic, headingPath: path() }); };

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
        const body = [assertNormalised(b.label, "list label"), assertNormalised(b.text, "list item")].filter(Boolean).join(" ");
        if (body !== "") push(lines.length === 0 ? body : `${"  ".repeat(Math.max(0, b.depth))}${body}`); // a leading indent on the first line would not survive trimming
        break;
      }
      case "note": push(`[Note ${b.n}] ${assertNormalised(b.text, "note")}`.trimEnd()); break;
      case "table": {
        const name = String(b.index);
        for (const r of tableRows(b, name)) push(`[Table ${name}, row ${r.n}] ${r.pairs.join("; ")}`, true);
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
    segments.push({ charStart, charEnd: text.length, atomic: line.atomic, headingPath: line.headingPath });
  }
  return { text, segments };
}
