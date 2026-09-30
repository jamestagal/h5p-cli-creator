/**
 * The intermediate structure every structured adapter (DOCX, ODT) reads a document into (design §4.2). One linearizer
 * turns it into source text. Adapters normalise every block and cell text with normaliseBlockText before linearizing
 * (R11), so offsets are only ever computed on final text.
 */
export interface Cell {
  text: string;
  colSpan: number;
  rowSpan: number;
  /** Structured cell content, written after `text` in order: paragraphs, list items, and nested tables (inline). */
  blocks?: Block[];
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  /** A list item's first paragraph carries its label; each further paragraph of the same item is a `continuation` at the same depth, with no label. */
  | { kind: "listItem"; depth: number; label: string; text: string; continuation?: boolean }
  /** `rows` lists, per row, the cells that start in it (as in HTML): a span covers later positions. `headerRows` counts rows the format marks as headers. */
  | { kind: "table"; index: number; headerRows: number; rows: Cell[][] }
  /** A footnote or endnote. `blocks` holds its structured content (paragraphs, list items, tables), written after `text` in order. */
  | { kind: "note"; n: number; text: string; blocks?: Block[] };

/** NFC; internal newlines become spaces; runs of spaces and tabs collapse to one space; trimmed. */
export function normaliseBlockText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?|\n/g, " ").replace(/[ \t]+/g, " ").trim();
}

/** Applies normaliseBlockText to every block and cell text, recursively. Adapters call this before linearize. */
export function normaliseBlocks(blocks: Block[]): Block[] {
  return blocks.map((b): Block => {
    if (b.kind === "table") return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, text: normaliseBlockText(c.text), ...(c.blocks ? { blocks: normaliseBlocks(c.blocks) } : {}) }))) };
    if (b.kind === "listItem") return { ...b, label: normaliseBlockText(b.label), text: normaliseBlockText(b.text) };
    if (b.kind === "note") return { ...b, text: normaliseBlockText(b.text), ...(b.blocks ? { blocks: normaliseBlocks(b.blocks) } : {}) };
    return { ...b, text: normaliseBlockText(b.text) };
  });
}
