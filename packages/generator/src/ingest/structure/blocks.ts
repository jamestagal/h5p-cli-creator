import { normaliseBlockText, normaliseWithOrigin, type OriginFallbackCounts, type OriginOptions, type Span } from "./origin.js";

export { normaliseBlockText } from "./origin.js";

/**
 * Origin of a block's or cell's `text` (generation scope design §2.1). Adapters set `generated` on raw text where they
 * insert markers (note references); normaliseBlocks maps it into the normalised text. `originFallback` marks text whose
 * origin could not be mapped through normalisation: it is then wholly generated, and linearize reports it.
 */
export interface TextOrigin { generated?: Span[]; originFallback?: OriginFallbackCounts }

/**
 * The intermediate structure every structured adapter (DOCX, ODT) reads a document into (design §4.2). One linearizer
 * turns it into source text. Adapters normalise every block and cell text with normaliseBlocks before linearizing
 * (R11), so offsets are only ever computed on final text.
 */
export interface Cell extends TextOrigin {
  text: string;
  colSpan: number;
  rowSpan: number;
  /** Structured cell content, written after `text` in order: paragraphs, list items, and nested tables (inline). */
  blocks?: Block[];
}

export type Block =
  | ({ kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string } & TextOrigin)
  | ({ kind: "paragraph"; text: string } & TextOrigin)
  /** A list item's first paragraph carries its label (always generated: rendered from numbering); each further paragraph of the same item is a `continuation` at the same depth, with no label. */
  | ({ kind: "listItem"; depth: number; label: string; text: string; continuation?: boolean } & TextOrigin)
  /** `rows` lists, per row, the cells that start in it (as in HTML): a span covers later positions. `headerRows` counts rows the format marks as headers. */
  | { kind: "table"; index: number; headerRows: number; rows: Cell[][] }
  /** A footnote or endnote. `blocks` holds its structured content (paragraphs, list items, tables), written after `text` in order. */
  | ({ kind: "note"; n: number; text: string; blocks?: Block[] } & TextOrigin);

/** `text` normalised, with its origin mapped through normalisation; the text is exactly normaliseBlockText(text). */
function normaliseText<T extends { text: string } & TextOrigin>(item: T, options: OriginOptions): T {
  const rest: Omit<T, "generated" | "originFallback"> & Partial<TextOrigin> = { ...item };
  delete rest.generated; delete rest.originFallback; // recomputed below from the raw text's origin
  const generated = item.generated;
  if (!generated || generated.length === 0) return { ...rest, text: normaliseBlockText(item.text) } as T;
  const r = normaliseWithOrigin(item.text, generated, options);
  return { ...rest, text: r.text, ...(r.generated.length > 0 ? { generated: r.generated } : {}), ...(r.fallback ? { originFallback: r.fallback } : {}) } as T;
}

/** Applies normaliseBlockText to every block and cell text, recursively, carrying origin. Adapters call this before linearize. */
export function normaliseBlocks(blocks: Block[], options: OriginOptions = {}): Block[] {
  return blocks.map((b): Block => {
    if (b.kind === "table") return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...normaliseText(c, options), ...(c.blocks ? { blocks: normaliseBlocks(c.blocks, options) } : {}) }))) };
    if (b.kind === "listItem") return { ...normaliseText(b, options), label: normaliseBlockText(b.label) };
    if (b.kind === "note") return { ...normaliseText(b, options), ...(b.blocks ? { blocks: normaliseBlocks(b.blocks, options) } : {}) };
    return normaliseText(b, options);
  });
}
