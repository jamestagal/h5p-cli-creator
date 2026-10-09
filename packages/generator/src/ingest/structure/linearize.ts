import { NormalisationInvariantError } from "../admit.js";
import { normaliseBlockText, type Block, type Cell, type TextOrigin } from "./blocks.js";
import { mergeSpans, type OriginFallbackCounts, type Span } from "./origin.js";

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
/** Half-open UTF-16 offsets of one line of the linearized text. */
export interface LineRange { charStart: number; charEnd: number }
/** A heading line, as written: its level, its (normalised) text and its offsets. */
export interface HeadingMark { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; charStart: number; charEnd: number }
/**
 * A structure of the document, by its lines (generation scope design §2.1). A table lists its data-row lines (one
 * atomic sentence each); a list (a run of consecutive list items, which notes cited by an item do not interrupt) lists
 * its items, each with its labelled line and continuation lines; a note lists its `[Note n]` lines. A table inside a
 * note is listed as a table too. Content nested in a cell is part of its row and is never a structure.
 */
export type Structure =
  | { kind: "table"; name: string; headingPath: string[]; rows: LineRange[] }
  | { kind: "list"; index: number; headingPath: string[]; items: Array<{ depth: number; lines: LineRange[] }> }
  | { kind: "note"; n: number; headingPath: string[]; lines: LineRange[] };
/** Text whose origin could not be mapped through normalisation, so it is wholly generated: where it is, and its raw counts. */
export interface OriginFallbackMark extends OriginFallbackCounts { charStart: number; charEnd: number }
export interface Linearized {
  text: string; segments: Segment[]; tables: TableSummary[];
  headings: HeadingMark[]; structures: Structure[];
  /** Generated spans, sorted and merged; every other character is source (origin.ts). */
  generated: Span[];
  originFallbacks: OriginFallbackMark[];
}

/**
 * Text with its origin: generated spans and fallback marks, as offsets into `text`. Every piece the linearizer writes
 * is built from these, so the text is exactly the string it always was and its origin travels with it.
 */
interface Rich { text: string; gen: Span[]; fallbacks: OriginFallbackMark[] }
const EMPTY_RICH: Rich = { text: "", gen: [], fallbacks: [] };
/** Generated text: written by the linearizer, not the author. */
const lit = (text: string): Rich => ({ text, gen: text === "" ? [] : [[0, text.length]], fallbacks: [] });
/** A normalised block or cell text with the origin the adapter and normaliseBlocks gave it. */
const sourced = (text: string, origin: TextOrigin = {}): Rich => origin.originFallback
  ? { text, gen: text === "" ? [] : [[0, text.length]], fallbacks: text === "" ? [] : [{ charStart: 0, charEnd: text.length, ...origin.originFallback }] }
  : { text, gen: origin.generated ?? [], fallbacks: [] };
/** All of `r` generated: a copy of text the author wrote once (a repeated label, a spanned cell's further positions). */
const asCopy = (r: Rich): Rich => ({ ...r, gen: r.text === "" ? [] : [[0, r.text.length]] });
function cat(...parts: Rich[]): Rich {
  let text = ""; const gen: Span[] = []; const fallbacks: OriginFallbackMark[] = [];
  for (const p of parts) {
    for (const [a, b] of p.gen) gen.push([a + text.length, b + text.length]);
    for (const f of p.fallbacks) fallbacks.push({ ...f, charStart: f.charStart + text.length, charEnd: f.charEnd + text.length });
    text += p.text;
  }
  return { text, gen, fallbacks };
}
/** `parts` joined by a generated separator. */
function joinRich(parts: Rich[], separator: string): Rich {
  return cat(...parts.flatMap((p, i) => (i === 0 ? [p] : [lit(separator), p])));
}

interface Line { rich: Rich; atomic: boolean; headingPath: string[]; listDepth: number | null; labelEnd?: number }

const EMPTY = "—";

function assertNormalised(text: string, where: string): string {
  if (normaliseBlockText(text) !== text) throw new NormalisationInvariantError(`${where} text was not normalised before linearizing: ${JSON.stringify(text.slice(0, 80))}`);
  return text;
}

/** A grid position's value, and whether it is where the cell was written (its first position) or a span's copy. */
interface GridValue { value: Rich; written: boolean }

/** The grid of cell values with every span repeated into each position it covers; only a cell's first position is `written`. */
function expandGrid(rows: Cell[][], render: (cell: Cell) => Rich): GridValue[][] {
  const grid: Array<Array<GridValue | undefined>> = [];
  rows.forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of row) {
      while (grid[r]![c] !== undefined) c++;
      const value = render(cell);
      for (let dr = 0; dr < Math.max(1, cell.rowSpan); dr++) {
        const target = (grid[r + dr] ??= []);
        for (let dc = 0; dc < Math.max(1, cell.colSpan); dc++) target[c + dc] = { value, written: dr === 0 && dc === 0 };
      }
      c += Math.max(1, cell.colSpan);
    }
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.slice(0, rows.length).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? { value: EMPTY_RICH, written: true }));
}

/**
 * Column labels: the header rows' values per column, consecutive repeats (from spans) dropped, joined with " / ";
 * `Column n` when there are none. A label part is source only where its header cell was written; " / " and every
 * `Column n` fallback are generated.
 */
function labelsFor(header: GridValue[][], width: number): Rich[] {
  return Array.from({ length: width }, (_, c) => {
    const parts: GridValue[] = [];
    for (const row of header) { const v = row[c]; if (v && v.value.text !== "" && parts.at(-1)?.value.text !== v.value.text) parts.push(v); }
    return parts.length > 0 ? joinRich(parts.map((p) => (p.written ? p.value : asCopy(p.value))), " / ") : lit(`Column ${c + 1}`);
  });
}

/**
 * Structured content on one line, for a table cell or a note inside one: `text`, then paragraphs, list runs (inlineList),
 * nested tables (inlineTable, named by `nestedName`) and notes (`[Note n] …`) in order.
 */
function inlineContent(text: Rich, blocks: Block[], where: string, nestedName: () => string): Rich {
  assertNormalised(text.text, where);
  const parts: Rich[] = [text];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.kind === "listItem") {
      const run: Array<Extract<Block, { kind: "listItem" }>> = [];
      while (blocks[i]?.kind === "listItem") run.push(blocks[i++] as Extract<Block, { kind: "listItem" }>);
      i--;
      parts.push(inlineList(run, where));
    } else if (b.kind === "table") parts.push(inlineTable(b, nestedName()));
    else if (b.kind === "note") parts.push(trimEndRich(cat(lit(`[Note ${b.n}] `), inlineContent(sourced(b.text, b), b.blocks ?? [], `${where} note`, nestedName))));
    else { assertNormalised(b.text, `${where} ${b.kind}`); parts.push(sourced(b.text, b)); }
  }
  return joinRich(parts.filter((p) => p.text !== ""), " ");
}

/** `r` without trailing whitespace (the only use: a note in a cell whose content is empty leaves "[Note n] "). */
function trimEndRich(r: Rich): Rich {
  const text = r.text.trimEnd();
  return { text, gen: mergeSpans(r.gen.map(([a, b]): Span => [a, Math.min(b, text.length)])).filter(([a, b]) => b > a), fallbacks: r.fallbacks.filter((f) => f.charStart < text.length).map((f) => ({ ...f, charEnd: Math.min(f.charEnd, text.length) })) };
}

/**
 * A table as data rows of `label: value` pairs, one entry per data row. `name` is its number: "4", or "4.1" when nested.
 * Each authored character is source once: a header label on the first data row only (later rows repeat it), and a
 * value only at the position where its cell was written (a span's further positions repeat it).
 */
function tableRows(table: Extract<Block, { kind: "table" }>, name: string): Array<{ n: number; pairs: Rich[] }> & { labels: string[]; headerCount: number } {
  let nested = 0;
  const render = (cell: Cell): Rich => inlineContent(sourced(cell.text, cell), cell.blocks ?? [], `Table ${name} cell`, () => `${name}.${++nested}`);
  const grid = expandGrid(table.rows, render);
  const headerCount = Math.min(Math.max(0, table.headerRows), grid.length);
  const width = grid[0]?.length ?? 0;
  const labels = labelsFor(grid.slice(0, headerCount), width);
  const rows = grid.slice(headerCount).map((cells, i) => ({
    n: i + 1,
    pairs: cells.map((v, c) => cat(i === 0 ? labels[c]! : asCopy(labels[c]!), lit(": "), v.value.text === "" ? lit(EMPTY) : v.written ? v.value : asCopy(v.value)))
  }));
  return Object.assign(rows, { labels: labels.map((l) => l.text), headerCount });
}

/** Writes a table's row lines through `push` and returns its summary and the indices of the lines it pushed. */
function writeTable(rows: ReturnType<typeof tableRows>, name: string, lineOf: (r: { n: number; pairs: Rich[] }) => Rich, headingPath: string[], push: (text: Rich) => number | null): { summary: TableSummary; lines: number[] } {
  const written = rows.map(lineOf);
  const lines: number[] = [];
  for (const l of written) { const index = push(l); if (index !== null) lines.push(index); }
  return { summary: { name, headingPath, markedHeaderRows: rows.headerCount, labels: rows.headerCount > 0 ? rows.labels : null, rowCount: rows.length, firstRows: written.slice(0, 2).map((l) => l.text) }, lines };
}

/**
 * Consecutive list items inside a cell, on one line. Nesting is explicit: the children of an item follow it inside
 * `[sub-list: …]`, so a nested child can never read as a sibling: `• Lock [sub-list: • Padlock • Hasp] • Tag`.
 */
function inlineList(items: Array<Extract<Block, { kind: "listItem" }>>, where: string): Rich {
  const base = Math.min(...items.map((b) => Math.max(0, b.depth)));
  const out: Rich[] = [];
  let level = base;
  for (const b of items) {
    const depth = Math.max(0, b.depth);
    while (level < depth) { out.push(lit(" [sub-list:")); level++; }
    while (level > depth) { out.push(lit("]")); level--; }
    const body = itemBody(assertNormalised(b.label, `${where} list label`), sourced(assertNormalised(b.text, `${where} list item`), b));
    if (body.text !== "") out.push(lit(" "), body);
  }
  while (level > base) { out.push(lit("]")); level--; }
  const joined = cat(...out);
  return trimRich(joined);
}

/** A list item's label (always generated) and its text, joined by a generated space; either may be empty. */
function itemBody(label: string, text: Rich): Rich {
  return joinRich([lit(label), text].filter((p) => p.text !== ""), " ");
}

/** `r` trimmed of leading and trailing whitespace, as String.prototype.trim. */
function trimRich(r: Rich): Rich {
  const lead = r.text.length - r.text.trimStart().length;
  const text = r.text.trim();
  const shift = (a: number) => Math.min(Math.max(0, a - lead), text.length);
  return { text, gen: mergeSpans(r.gen.map(([a, b]): Span => [shift(a), shift(b)])), fallbacks: r.fallbacks.map((f) => ({ ...f, charStart: shift(f.charStart), charEnd: shift(f.charEnd) })).filter((f) => f.charEnd > f.charStart) };
}

/** A table inside a cell, written on one line: `[Table 4.1 row 1: A: x, B: y; row 2: …]`. */
function inlineTable(table: Extract<Block, { kind: "table" }>, name: string): Rich {
  const rows = tableRows(table, name);
  if (rows.length === 0) return lit(`[Table ${name}]`);
  return cat(lit(`[Table ${name} `), joinRich(rows.map((r) => cat(lit(`row ${r.n}: `), joinRich(r.pairs, ", "))), "; "), lit("]"));
}

type Push = (text: Rich, atomic?: boolean, listDepth?: number | null, labelEnd?: number) => number | null;

/**
 * A note's lines. Every line starts `[Note n]`, so its content never reads as body text: the note's text and paragraphs,
 * its list items indented by depth with their labels (depth kept as metadata, as in the body), and each data row of a
 * table in it as an atomic line `[Note n, table k, row r] …`. Anything else in it is written inline.
 */
function noteLines(note: Extract<Block, { kind: "note" }>, push: Push, headingPath: string[], tablesOut: TableSummary[], structures: PendingStructure[]): void {
  const prefix = `[Note ${note.n}]`;
  const lines: number[] = [];
  let tables = 0;
  const record = (index: number | null): void => { if (index !== null) lines.push(index); };
  const line = (text: Rich, atomic = false, listDepth: number | null = null, labelEnd?: number): void => { if (text.text === "") return; record(push(cat(lit(`${prefix} `), text), atomic, listDepth, labelEnd === undefined ? undefined : prefix.length + 1 + labelEnd)); };
  const noteStructure: PendingStructure = { kind: "note", n: note.n, headingPath, lines };
  structures.push(noteStructure);
  assertNormalised(note.text, "note");
  line(sourced(note.text, note));
  for (const b of note.blocks ?? []) {
    if (b.kind === "listItem") {
      const label = assertNormalised(b.label, "note list label");
      const body = itemBody(label, sourced(assertNormalised(b.text, "note list item"), b));
      const indent = "  ".repeat(Math.max(0, b.depth));
      line(body.text === "" ? EMPTY_RICH : cat(lit(indent), body), false, Math.max(0, b.depth), label === "" ? undefined : indent.length + label.length);
    } else if (b.kind === "table") {
      const k = ++tables;
      const name = `Note ${note.n}, table ${k}`;
      const { summary, lines: rows } = writeTable(tableRows(b, `note ${note.n}.${k}`), name, (r) => cat(lit(`[Note ${note.n}, table ${k}, row ${r.n}] `), joinRich(r.pairs, "; ")), headingPath, (l) => { const index = push(l, true); record(index); return index; });
      tablesOut.push(summary);
      structures.push({ kind: "table", name, headingPath, rows });
    } else if (b.kind === "note") line(inlineContent(EMPTY_RICH, [b], `Note ${note.n}`, () => `${note.n}.${++tables}`));
    else { assertNormalised(b.text, `note ${b.kind}`); line(sourced(b.text, b)); }
  }
  if (lines.length === 0) record(push(lit(prefix)));
}

/** A structure by line indices, before the text is joined. */
type PendingStructure =
  | { kind: "table"; name: string; headingPath: string[]; rows: number[] }
  | { kind: "list"; index: number; headingPath: string[]; items: Array<{ depth: number; lines: number[] }> }
  | { kind: "note"; n: number; headingPath: string[]; lines: number[] };

/**
 * Blocks → source text and segments. Headings are lines of their own and set the heading path; list items are
 * indented by depth with their label, and an item's continuation paragraphs keep its depth, without a label, indented
 * under its text; each table data row is one atomic line `[Table n, row r] label: value; …`;
 * notes are lines starting `[Note n]` (noteLines). Empty blocks produce no line, lines are joined with "\n", and every piece of text must
 * already be normalised, so the result is a fixed point of normaliseSourceText. Alongside the text: the heading lines,
 * the structures, and the origin of every character (generated spans; the rest is source).
 */
export function linearize(blocks: Block[]): Linearized {
  const lines: Line[] = [];
  const headings: Array<{ level: 1 | 2 | 3 | 4 | 5 | 6; text: string }> = [];
  const headingLines: Array<{ level: 1 | 2 | 3 | 4 | 5 | 6; text: string; line: number }> = [];
  const path = (): string[] => headings.map((h) => h.text);
  const labelWidth: number[] = []; // label length of the latest item at each depth, for continuation paragraphs
  const tables: TableSummary[] = [];
  const structures: PendingStructure[] = [];
  let list: Extract<PendingStructure, { kind: "list" }> | null = null;
  let lists = 0;
  const push: Push = (text, atomic = false, listDepth = null, labelEnd) => {
    if (text.text === "") return null;
    lines.push({ rich: text, atomic, headingPath: path(), listDepth, ...(labelEnd ? { labelEnd } : {}) });
    return lines.length - 1;
  };

  for (const b of blocks) {
    if (b.kind !== "listItem" && b.kind !== "note") list = null; // a note cited by an item does not end its list
    switch (b.kind) {
      case "heading": {
        const text = assertNormalised(b.text, "heading");
        if (text === "") break;
        while (headings.length > 0 && headings.at(-1)!.level >= b.level) headings.pop();
        headings.push({ level: b.level, text });
        const index = push(sourced(text, b));
        if (index !== null) headingLines.push({ level: b.level, text, line: index });
        break;
      }
      case "paragraph": push(sourced(assertNormalised(b.text, "paragraph"), b)); break;
      case "listItem": {
        const depth = Math.max(0, b.depth);
        if (b.continuation) {
          // A further paragraph of the item above: same depth, no label, indented under the item's text (a hanging indent).
          const text = assertNormalised(b.text, "list item continuation");
          const hang = labelWidth[depth] ?? 0;
          if (text !== "") {
            const index = push(cat(lit(lines.length === 0 ? "" : `${"  ".repeat(depth)}${" ".repeat(hang === 0 ? 0 : hang + 1)}`), sourced(text, b)), false, depth);
            if (index !== null) {
              list ??= openList(structures, ++lists, path());
              const owner = [...list.items].reverse().find((item) => item.depth === depth) ?? list.items.at(-1);
              if (owner) owner.lines.push(index); else list.items.push({ depth, lines: [index] });
            }
          }
          break;
        }
        const label = assertNormalised(b.label, "list label");
        labelWidth[depth] = label.length;
        labelWidth.length = depth + 1;
        const body = itemBody(label, sourced(assertNormalised(b.text, "list item"), b));
        const indent = lines.length === 0 ? "" : "  ".repeat(depth);
        if (body.text !== "") {
          // a leading indent on the first line would not survive trimming; the depth is kept as metadata either way
          const index = push(cat(lit(indent), body), false, depth, label === "" ? undefined : indent.length + label.length);
          if (index !== null) { list ??= openList(structures, ++lists, path()); list.items.push({ depth, lines: [index] }); }
        }
        break;
      }
      case "note": noteLines(b, push, path(), tables, structures); break;
      case "table": {
        const name = String(b.index);
        const { summary, lines: rows } = writeTable(tableRows(b, name), name, (r) => cat(lit(`[Table ${name}, row ${r.n}] `), joinRich(r.pairs, "; ")), path(), (l) => push(l, true));
        tables.push(summary);
        structures.push({ kind: "table", name, headingPath: path(), rows });
        break;
      }
    }
  }

  let text = "";
  const segments: Segment[] = [];
  const ranges: LineRange[] = [];
  const generated: Span[] = [];
  const originFallbacks: OriginFallbackMark[] = [];
  for (const line of lines) {
    if (text !== "") { generated.push([text.length, text.length + 1]); text += "\n"; }
    const charStart = text.length;
    for (const [a, b] of line.rich.gen) generated.push([charStart + a, charStart + b]);
    for (const f of line.rich.fallbacks) originFallbacks.push({ ...f, charStart: charStart + f.charStart, charEnd: charStart + f.charEnd });
    text += line.rich.text;
    ranges.push({ charStart, charEnd: text.length });
    segments.push({ charStart, charEnd: text.length, atomic: line.atomic, headingPath: line.headingPath, listDepth: line.listDepth, ...(line.labelEnd ? { labelEnd: line.labelEnd } : {}) });
  }
  const at = (i: number): LineRange => ranges[i]!;
  return {
    text, segments, tables,
    headings: headingLines.map((h) => ({ level: h.level, text: h.text, ...at(h.line) })),
    structures: structures.map((s): Structure => s.kind === "table" ? { ...s, rows: s.rows.map(at) } : s.kind === "list" ? { ...s, items: s.items.map((i) => ({ depth: i.depth, lines: i.lines.map(at) })) } : { ...s, lines: s.lines.map(at) })
      .filter((s) => s.kind === "table" ? s.rows.length > 0 : s.kind === "list" ? s.items.length > 0 : s.lines.length > 0),
    generated: mergeSpans(generated),
    originFallbacks
  };
}

function openList(structures: PendingStructure[], index: number, headingPath: string[]): Extract<PendingStructure, { kind: "list" }> {
  const list: Extract<PendingStructure, { kind: "list" }> = { kind: "list", index, headingPath, items: [] };
  structures.push(list);
  return list;
}
