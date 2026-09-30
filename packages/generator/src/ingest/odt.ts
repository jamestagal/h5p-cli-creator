import { createHash } from "node:crypto";
import { DOMParser, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import JSZip from "jszip";
import { labelLikeReferences, type IngestWarnings, type StructuredIngestResult } from "./docx.js";
import { finaliseDocument, type IngestOptions } from "./source-document.js";
import { normaliseBlockText, normaliseBlocks, type Block, type Cell } from "./structure/blocks.js";
import { linearize } from "./structure/linearize.js";

const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const DRAW = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
const XML = "http://www.w3.org/XML/1998/namespace";

/** Thrown when the file is not an ODF text document this adapter can read. */
export class OdtFormatError extends Error { override name = "OdtFormatError"; }

const isElement = (n: XmlNode): n is XmlElement => n.nodeType === 1;
const is = (n: XmlElement, ns: string, local: string): boolean => n.namespaceURI === ns && n.localName === local;
const elements = (el: XmlElement): XmlElement[] => Array.from(el.childNodes).filter(isElement);
const child = (el: XmlElement, ns: string, local: string): XmlElement | undefined => elements(el).find((c) => is(c, ns, local));
const attr = (el: XmlElement, ns: string, name: string): string | undefined => el.getAttributeNS(ns, name) ?? undefined;
const positive = (value: string | undefined): number => { const n = Number(value ?? "1"); return Number.isInteger(n) && n >= 1 ? n : 1; };

// ---- styles ------------------------------------------------------------------------------------------------------------

/** One level of a list style. `format` is style:num-format ("1", "a", "A", "i", "I", "" or another); bullets and images are "bullet". */
interface LevelStyle { format: string; prefix: string; suffix: string; start: number; displayLevels: number; letterSync: boolean }
interface Styles {
  lists: Map<string, Map<number, LevelStyle>>;
  /** Paragraph style → its style:list-style-name and parent, to find the list style of a list that names none. */
  paragraphs: Map<string, { listStyle?: string | undefined; parent?: string | undefined }>;
  /** Outline levels (heading levels) whose headings Writer numbers. */
  numberedOutlineLevels: Set<number>;
}

function readLevels(listStyle: XmlElement): Map<number, LevelStyle> {
  const levels = new Map<number, LevelStyle>();
  for (const lvl of elements(listStyle)) {
    const level = positive(attr(lvl, TEXT, "level"));
    if (is(lvl, TEXT, "list-level-style-number")) {
      levels.set(level, {
        format: attr(lvl, STYLE, "num-format") ?? "", prefix: attr(lvl, STYLE, "num-prefix") ?? "", suffix: attr(lvl, STYLE, "num-suffix") ?? "",
        start: positive(attr(lvl, TEXT, "start-value")), displayLevels: positive(attr(lvl, TEXT, "display-levels")), letterSync: attr(lvl, STYLE, "num-letter-sync") === "true"
      });
    } else if (is(lvl, TEXT, "list-level-style-bullet") || is(lvl, TEXT, "list-level-style-image")) {
      levels.set(level, { format: "bullet", prefix: "", suffix: "", start: 1, displayLevels: 1, letterSync: false });
    }
  }
  return levels;
}

/** List, paragraph and outline styles from content.xml's automatic styles and styles.xml (content.xml wins on a name clash). */
function readStyles(content: XmlDocument, styles: XmlDocument | null): Styles {
  const out: Styles = { lists: new Map(), paragraphs: new Map(), numberedOutlineLevels: new Set() };
  const containers = [
    ...(styles ? elements(styles.documentElement!).filter((e) => is(e, OFFICE, "styles") || is(e, OFFICE, "automatic-styles")) : []),
    ...elements(content.documentElement!).filter((e) => is(e, OFFICE, "automatic-styles"))
  ];
  for (const container of containers) {
    for (const s of elements(container)) {
      const name = attr(s, STYLE, "name") ?? "";
      if (is(s, TEXT, "list-style")) out.lists.set(name, readLevels(s));
      else if (is(s, STYLE, "style") && attr(s, STYLE, "family") === "paragraph") out.paragraphs.set(name, { listStyle: attr(s, STYLE, "list-style-name"), parent: attr(s, STYLE, "parent-style-name") });
      else if (is(s, TEXT, "outline-style")) {
        for (const lvl of elements(s)) if (is(lvl, TEXT, "outline-level-style") && (attr(lvl, STYLE, "num-format") ?? "") !== "") out.numberedOutlineLevels.add(positive(attr(lvl, TEXT, "level")));
      }
    }
  }
  return out;
}

// ---- number formats ----------------------------------------------------------------------------------------------------

const ROMAN: Array<[number, string]> = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
function roman(n: number): string { let out = ""; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; }
/** a…z, then aa, ab… (spreadsheet style), or aa, bb… with style:num-letter-sync. */
function letters(n: number, sync: boolean): string {
  if (sync) return String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
  let out = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) out = String.fromCharCode(97 + ((k - 1) % 26)) + out;
  return out;
}
/** The number in the given format, or null when the adapter does not render that format. */
function formatNumber(n: number, level: LevelStyle): string | null {
  switch (level.format) {
    case "1": return String(n);
    case "a": return letters(n, level.letterSync);
    case "A": return letters(n, level.letterSync).toUpperCase();
    case "i": return n < 4000 ? roman(n) : String(n);
    case "I": return n < 4000 ? roman(n).toUpperCase() : String(n);
    case "": return "";
    default: return null;
  }
}

// ---- walking content.xml ---------------------------------------------------------------------------------------------

/** One numbering sequence: a top-level text:list and every list that continues it. */
interface Chain { index: number; style: string | undefined; counters: number[]; headingPath: string[]; simplified: string[] }

interface WalkState {
  styles: Styles;
  notes: number;
  tables: number;
  headings: Array<{ level: number; text: string }>;
  chains: Chain[];
  lastChainByStyle: Map<string, Chain>;
  chainById: Map<string, Chain>;
  warnings: IngestWarnings;
}

const SKIPPED_INLINE = new Set(["annotation", "annotation-end", "change", "change-start", "change-end", "soft-page-break", "number", "hidden-text", "bookmark", "bookmark-start", "bookmark-end", "reference-mark", "reference-mark-start", "reference-mark-end", "toc-mark", "toc-mark-start", "toc-mark-end", "alphabetical-index-mark", "alphabetical-index-mark-start", "alphabetical-index-mark-end", "user-index-mark", "user-index-mark-start", "user-index-mark-end"]);
const SKIPPED_BLOCK = new Set(["tracked-changes", "sequence-decls", "variable-decls", "user-field-decls", "dde-connection-decls", "soft-page-break", "annotation", "annotation-end", "forms"]);
const headingPath = (state: WalkState): string[] => state.headings.map((x) => x.text);

interface Inline { text: string; after: Block[] }

/**
 * A paragraph's text. text:s, text:tab and text:line-break become spaces, a tab and a newline; a note becomes `[n]` and
 * its content a note block after the paragraph; annotations, tracked-change marks and a rendered text:number are left
 * out (deleted text lives only in text:tracked-changes, which is never read); the content of text boxes in frames
 * follows the paragraph as blocks. Other elements (spans, links, fields) contribute their text.
 */
function inline(el: XmlElement, state: WalkState): Inline {
  const after: Block[] = [];
  const nested: Block[] = [];
  const read = (node: XmlElement): string => {
    let out = "";
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3 || n.nodeType === 4) { out += n.nodeValue ?? ""; continue; }
      if (!isElement(n)) continue;
      if (n.namespaceURI === TEXT && n.localName === "s") out += " ".repeat(positive(attr(n, TEXT, "c")));
      else if (is(n, TEXT, "tab")) out += "\t";
      else if (is(n, TEXT, "line-break")) out += "\n";
      else if (is(n, TEXT, "note")) {
        const k = ++state.notes;
        const body = child(n, TEXT, "note-body");
        after.push({ kind: "note", n: k, text: "", blocks: body ? walk(elements(body), state, true) : [] });
        out += `[${k}]`;
      } else if ((n.namespaceURI === TEXT || n.namespaceURI === OFFICE) && SKIPPED_INLINE.has(n.localName ?? "")) continue;
      else if (is(n, TEXT, "ruby")) { const base = child(n, TEXT, "ruby-base"); if (base) out += read(base); }
      else if (n.namespaceURI === DRAW) { for (const box of textBoxes(n)) nested.push(...walk(elements(box), state, true)); }
      else if (is(n, TEXT, "list") || is(n, TABLE, "table") || is(n, TEXT, "p") || is(n, TEXT, "h")) nested.push(...walk([n], state, true));
      else out += read(n);
    }
    return out;
  };
  const text = read(el);
  return { text, after: [...after, ...nested] };
}

/** draw:text-box elements inside a drawing element, not counting boxes nested in other boxes. */
function textBoxes(el: XmlElement): XmlElement[] {
  if (is(el, DRAW, "text-box")) return [el];
  return elements(el).flatMap(textBoxes);
}

function listBlocks(list: XmlElement, depth: number, chain: Chain, style: string | undefined, state: WalkState, inCell: boolean): Block[] {
  const out: Block[] = [];
  const own = attr(list, TEXT, "style-name") ?? style;
  for (const item of elements(list)) {
    const header = is(item, TEXT, "list-header");
    if (!header && !is(item, TEXT, "list-item")) continue;
    const parts = elements(item);
    const first = parts.findIndex((c) => is(c, TEXT, "p") || is(c, TEXT, "h"));
    if (first >= 0) {
      const { text, after } = inline(parts[first]!, state);
      const label = header ? "" : labelFor(chain, own, depth + 1, attr(item, TEXT, "start-value"), text, state);
      out.push({ kind: "listItem", depth, label, text }, ...after);
    }
    parts.forEach((c, i) => {
      if (i === first) return;
      if (is(c, TEXT, "list")) out.push(...listBlocks(c, depth + 1, chain, own, state, inCell));
      else if (first >= 0 && (is(c, TEXT, "p") || is(c, TEXT, "h"))) {
        // A further paragraph of this item: it belongs to the item, at its depth, and is not numbered again.
        const { text, after } = inline(c, state);
        out.push({ kind: "listItem", depth, label: "", text, continuation: true }, ...after);
      } else out.push(...walk([c], state, inCell));
    });
  }
  return out;
}

/** The label of the next item at `level` (1-based) in `chain`, advancing its counters. Unrendered formats are recorded. */
function labelFor(chain: Chain, style: string | undefined, level: number, startValue: string | undefined, text: string, state: WalkState): string {
  const levels = style === undefined ? undefined : state.styles.lists.get(style);
  const lvl = levels?.get(level);
  if (!lvl) {
    state.warnings.numberingUnsupported.push({ reason: "missing-definition", headingPath: headingPath(state), text: normaliseBlockText(text), numId: style ?? "", ilvl: String(level - 1) });
    return "•";
  }
  if (lvl.format === "bullet") return "•"; // bullet glyphs are font-specific (often private-use code points), so every bullet reads as •
  const current = chain.counters[level];
  chain.counters[level] = startValue !== undefined ? positive(startValue) : current === undefined ? lvl.start : current + 1;
  chain.counters.length = level + 1;
  const parts: string[] = [];
  for (let l = Math.max(1, level - lvl.displayLevels + 1); l <= level; l++) {
    const at = l === level ? lvl : levels!.get(l) ?? lvl;
    const n = chain.counters[l] ?? at.start;
    const formatted = formatNumber(n, at);
    if (formatted === null) { if (!chain.simplified.includes(at.format)) chain.simplified.push(at.format); parts.push(String(n)); } else parts.push(formatted);
  }
  return `${lvl.prefix}${parts.filter((x) => x !== "").join(".")}${lvl.suffix}`;
}

/** The list style of a top-level list that names none: the list style of its first paragraph's style, through parents. */
function inheritedListStyle(list: XmlElement, state: WalkState): string | undefined {
  const firstItem = elements(list).find((c) => is(c, TEXT, "list-item") || is(c, TEXT, "list-header"));
  const paragraph = firstItem ? elements(firstItem).find((c) => is(c, TEXT, "p") || is(c, TEXT, "h")) : undefined;
  const seen = new Set<string>();
  for (let s = paragraph ? attr(paragraph, TEXT, "style-name") : undefined; s !== undefined && !seen.has(s); s = state.styles.paragraphs.get(s)?.parent) {
    seen.add(s);
    const listStyle = state.styles.paragraphs.get(s)?.listStyle;
    if (listStyle) return listStyle;
  }
  return undefined;
}

/** A top-level list's numbering chain: a new one, or the one it continues (text:continue-list, or text:continue-numbering with the same style). */
function chainFor(list: XmlElement, state: WalkState): { chain: Chain; style: string | undefined } {
  const style = attr(list, TEXT, "style-name") ?? inheritedListStyle(list, state);
  const continues = attr(list, TEXT, "continue-list");
  let chain = continues !== undefined ? state.chainById.get(continues) : attr(list, TEXT, "continue-numbering") === "true" && style !== undefined ? state.lastChainByStyle.get(style) : undefined;
  if (!chain) { chain = { index: state.chains.length + 1, style, counters: [], headingPath: headingPath(state), simplified: [] }; state.chains.push(chain); }
  const id = attr(list, XML, "id");
  if (id !== undefined) state.chainById.set(id, chain);
  if (style !== undefined) state.lastChainByStyle.set(style, chain);
  return { chain, style };
}

function tableBlock(el: XmlElement, state: WalkState, index: number): Block {
  const rows: Cell[][] = [];
  let headerRows = 0;
  const collect = (container: XmlElement, header: boolean): void => {
    for (const c of elements(container)) {
      if (is(c, TABLE, "table-header-rows")) collect(c, true);
      else if (is(c, TABLE, "table-rows") || is(c, TABLE, "table-row-group")) collect(c, header);
      else if (is(c, TABLE, "table-row")) {
        const cells: Cell[] = [];
        for (const td of elements(c)) {
          if (!is(td, TABLE, "table-cell")) continue; // a covered cell is filled by the span that covers it
          const content: Cell = { text: "", colSpan: positive(attr(td, TABLE, "number-columns-spanned")), rowSpan: positive(attr(td, TABLE, "number-rows-spanned")), blocks: walk(elements(td), state, true) };
          for (let k = positive(attr(td, TABLE, "number-columns-repeated")); k > 0; k--) cells.push(content);
        }
        for (let k = positive(attr(c, TABLE, "number-rows-repeated")); k > 0; k--) { rows.push(cells); if (header) headerRows++; }
      }
    }
  };
  collect(el, false);
  return { kind: "table", index, headerRows, rows };
}

/** Block-level elements → blocks in document order. Inside a cell or a note, headings read as paragraphs and tables are nested. */
function walk(nodes: XmlElement[], state: WalkState, inCell: boolean): Block[] {
  const out: Block[] = [];
  for (const el of nodes) {
    if ((el.namespaceURI === TEXT || el.namespaceURI === OFFICE) && SKIPPED_BLOCK.has(el.localName ?? "")) continue;
    if (is(el, TEXT, "h")) {
      const level = Math.min(6, positive(attr(el, TEXT, "outline-level")));
      const { text, after } = inline(el, state);
      const clean = normaliseBlockText(text);
      if (!inCell && clean !== "") { while (state.headings.length > 0 && state.headings.at(-1)!.level >= level) state.headings.pop(); }
      if (state.styles.numberedOutlineLevels.has(positive(attr(el, TEXT, "outline-level"))) && attr(el, TEXT, "is-list-header") !== "true") {
        state.warnings.numberingUnsupported.push({ reason: "numbered-heading", headingPath: headingPath(state), text: clean, numId: "outline", ilvl: String(positive(attr(el, TEXT, "outline-level")) - 1) });
      }
      if (!inCell && clean !== "") state.headings.push({ level, text: clean });
      out.push(inCell ? { kind: "paragraph", text } : { kind: "heading", level: level as 1 | 2 | 3 | 4 | 5 | 6, text }, ...after);
    } else if (is(el, TEXT, "p")) {
      const { text, after } = inline(el, state);
      out.push({ kind: "paragraph", text }, ...after);
    } else if (is(el, TEXT, "list")) {
      const { chain, style } = chainFor(el, state);
      out.push(...listBlocks(el, 0, chain, style, state, inCell));
    } else if (is(el, TEXT, "numbered-paragraph")) {
      const paragraph = elements(el).find((c) => is(c, TEXT, "p") || is(c, TEXT, "h"));
      const number = elements(el).find((c) => is(c, TEXT, "number")) ?? (paragraph ? child(paragraph, TEXT, "number") : undefined);
      const { text, after } = paragraph ? inline(paragraph, state) : { text: "", after: [] };
      if (!number) state.warnings.numberingUnsupported.push({ reason: "missing-definition", headingPath: headingPath(state), text: normaliseBlockText(text), numId: attr(el, TEXT, "list-id") ?? "", ilvl: String(positive(attr(el, TEXT, "level")) - 1) });
      out.push({ kind: "listItem", depth: positive(attr(el, TEXT, "level")) - 1, label: number?.textContent ?? "", text }, ...after);
    } else if (is(el, TABLE, "table")) {
      out.push(tableBlock(el, state, inCell ? 0 : ++state.tables));
    } else if (el.namespaceURI === DRAW) {
      for (const box of textBoxes(el)) out.push(...walk(elements(box), state, inCell));
    } else if (el.namespaceURI === TEXT && /-source$/.test(el.localName ?? "")) {
      continue; // an index's source settings (text:table-of-content-source, …); its entries are in text:index-body
    } else {
      // Containers (text:section, text:index-body, indexes, …): their blocks, and any text directly inside them.
      const direct = Array.from(el.childNodes).filter((n) => (n.nodeType === 3 || n.nodeType === 4) && (n.nodeValue ?? "").trim() !== "");
      if (direct.length > 0) out.push({ kind: "paragraph", text: direct.map((n) => n.nodeValue).join(" ") });
      out.push(...walk(elements(el), state, inCell));
    }
  }
  return out;
}

/**
 * ODT → SourceDocument (design §4.2), with the same structural contract as ingestDocx: content.xml is walked in document
 * order into blocks — text:h headings (outline level, 1–6), paragraphs, nested lists labelled from their list style
 * (number format, prefix, suffix, display levels, start values and continued numbering; bullets as •), tables with
 * table:table-header-rows counted as header rows and spans kept (covered cells skipped, repeated cells and rows
 * expanded), and notes with their paragraphs, lists and tables placed after the citing paragraph. Annotations are
 * skipped and tracked deletions dropped. List formats the adapter does not render (they fall back to decimal), lists
 * whose style is missing and numbered headings are reported (R13), as are label-like references. Text is normalised
 * before linearizing (R11) and admitted once, by finaliseDocument.
 */
export async function ingestOdt(bytes: Buffer, opts: IngestOptions): Promise<StructuredIngestResult> {
  const zip = await JSZip.loadAsync(bytes).catch((e: unknown) => { throw new OdtFormatError(`not a readable ODT package: ${e instanceof Error ? e.message : String(e)}`); });
  const read = async (name: string): Promise<XmlDocument | null> => { const f = zip.file(name); return f ? new DOMParser().parseFromString(await f.async("string"), "text/xml") : null; };
  const content = await read("content.xml");
  const body = content ? child(content.documentElement!, OFFICE, "body") : undefined;
  const officeText = body ? child(body, OFFICE, "text") : undefined;
  if (!content || !officeText) throw new OdtFormatError("not an ODF text document: content.xml has no office:body/office:text");
  const state: WalkState = {
    styles: readStyles(content, await read("styles.xml")), notes: 0, tables: 0, headings: [], chains: [], lastChainByStyle: new Map(), chainById: new Map(),
    warnings: { listNumberingSimplified: [], numberingUnsupported: [], labelLikeReferences: [] }
  };
  const { text, segments, tables } = linearize(normaliseBlocks(walk(elements(officeText), state, false)));
  const document = finaliseDocument("odt", text, segments, opts, { originalSha256: createHash("sha256").update(bytes).digest("hex"), extractor: "odt" });
  const listNumberingSimplified = state.chains.filter((c) => c.simplified.length > 0).map((c) => ({ listIndex: c.index, headingPath: c.headingPath, originalFormats: c.simplified }));
  return { document, tables, warnings: { listNumberingSimplified, numberingUnsupported: state.warnings.numberingUnsupported, labelLikeReferences: labelLikeReferences(document) } };
}
