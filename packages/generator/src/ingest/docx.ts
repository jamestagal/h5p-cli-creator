import { createHash } from "node:crypto";
import { isTag, isText, type ChildNode, type Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import JSZip from "jszip";
import mammoth from "mammoth";
import { resolveNumbering, type SimplifiedNumbering, type UnsupportedNumbering } from "./docx-numbering.js";
import { finaliseDocument, type IngestOptions, type SourceDocument } from "./source-document.js";
import { normaliseBlocks, normaliseBlockText, type Block, type Cell } from "./structure/blocks.js";
import { linearize, type TableSummary } from "./structure/linearize.js";

export type { SimplifiedNumbering, UnsupportedNumbering } from "./docx-numbering.js";
/** A sentence that looks like it refers to a list item by its label ("item b)", "(ii)"), which simplified numbering may have changed. */
export interface LabelLikeReference { sentenceId: string; headingPath: string[]; text: string }
export interface IngestWarnings { listNumberingSimplified: SimplifiedNumbering[]; numberingUnsupported: UnsupportedNumbering[]; labelLikeReferences: LabelLikeReference[] }
export interface StructuredIngestResult { document: SourceDocument; warnings: IngestWarnings; tables: TableSummary[] }

const LABEL_LIKE = [/\bitem [a-z]\)/i, /\([a-z]\)/, /\([ivx]+\)/i, /\b[a-z]\) (?:above|below)\b/i];

/**
 * The sentence a list's first item became: a list sentence under the same headings whose text, after its label, is the
 * start of the item's text (or begins with it), else an atomic row that contains it (a list in a table cell). Null when
 * none matches.
 */
export function locateListItem(doc: SourceDocument, headingPath: string[], itemText: string): string | null {
  const item = normaliseBlockText(itemText);
  if (item === "") return null;
  const samePath = (p: string[]) => p.length === headingPath.length && p.every((x, i) => x === headingPath[i]);
  const unlabelled = (t: string) => t.replace(/^\S+\s+/, "");
  const listed = doc.sentences.find((s) => s.listDepth !== null && samePath(s.headingPath) && (item.startsWith(unlabelled(s.text)) || unlabelled(s.text).startsWith(item)));
  return (listed ?? doc.sentences.find((s) => s.atomic && samePath(s.headingPath) && s.text.includes(item)))?.sentenceId ?? null;
}

/** Fills each simplified list's firstSentenceId from the finished document. */
export function locateSimplifiedLists(doc: SourceDocument, lists: SimplifiedNumbering[]): SimplifiedNumbering[] {
  return lists.map((l) => ({ ...l, firstSentenceId: locateListItem(doc, l.headingPath, l.firstItemText) }));
}

/** Sentences that look like references to list labels, for the Checkpoint B review (R13). */
export function labelLikeReferences(doc: SourceDocument): LabelLikeReference[] {
  return doc.sentences.filter((s) => LABEL_LIKE.some((re) => re.test(s.text))).map((s) => ({ sentenceId: s.sentenceId, headingPath: [...s.headingPath], text: s.text }));
}

// ---- mammoth HTML → blocks -------------------------------------------------------------------------------------------

interface WalkState {
  /** Footnote and endnote content by mammoth's element id ("footnote-1", "endnote-2"), as blocks in reading order. */
  noteBlocks: Map<string, Block[]>;
  /** Our sequential note number for each note id, in order of first reference. */
  noteNumbers: Map<string, number>;
  tables: number;
}

const HEADING = /^h([1-6])$/;
const INLINE = new Set(["sup", "sub", "a", "strong", "em", "b", "i", "u", "s", "span", "br", "img"]);
const isNoteList = (el: Element): boolean => el.name === "ol" && el.children.some((c) => isTag(c) && c.name === "li" && /^(foot|end)note-\d+$/.test(c.attribs["id"] ?? ""));
const isBackLink = (el: Element): boolean => el.name === "a" && /^#(foot|end)note-ref-/.test(el.attribs["href"] ?? "");

/**
 * The text of an inline run of nodes. A note reference becomes `[n]` and its number is added to `cited`; a note's "↑"
 * back-link and images are left out. Block-level elements met inside the run (a table or list inside a list item) are
 * not text: they are added to `nested`, for the caller to read as blocks after this one, so no content is dropped.
 */
function inlineText(nodes: ChildNode[], state: WalkState, cited: number[], nested: ChildNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (isText(node)) { out += node.data; continue; }
    if (!isTag(node)) continue;
    if (node.name === "br") { out += "\n"; continue; }
    if (node.name === "img" || isBackLink(node)) continue;
    if (!INLINE.has(node.name)) { nested.push(node); continue; }
    const ref = /^((?:foot|end)note)-ref-(\d+)$/.exec(node.attribs["id"] ?? "");
    if (node.name === "a" && ref) {
      const noteId = `${ref[1]}-${ref[2]}`;
      let n = state.noteNumbers.get(noteId);
      if (n === undefined) { n = state.noteNumbers.size + 1; state.noteNumbers.set(noteId, n); }
      cited.push(n);
      out += `[${n}]`;
      continue;
    }
    out += inlineText(node.children, state, cited, nested);
  }
  return out;
}

function notesFor(cited: number[], state: WalkState): Block[] {
  const byNumber = new Map([...state.noteNumbers].map(([id, n]) => [n, id]));
  return [...new Set(cited)].map((n) => ({ kind: "note", n, text: "", blocks: state.noteBlocks.get(byNumber.get(n)!) ?? [] }));
}

function listItems(list: Element, depth: number, state: WalkState, inCell: boolean): Block[] {
  const out: Block[] = [];
  const start = Number(list.attribs["start"] ?? "1");
  let position = Number.isFinite(start) ? start : 1;
  for (const li of list.children) {
    if (!isTag(li) || li.name !== "li") continue;
    const cited: number[] = [];
    const nested: ChildNode[] = [];
    out.push({ kind: "listItem", depth, label: list.name === "ol" ? `${position}.` : "•", text: inlineText(li.children, state, cited, nested) });
    out.push(...notesFor(cited, state));
    for (const c of nested) out.push(...(isTag(c) && (c.name === "ol" || c.name === "ul") ? listItems(c, depth + 1, state, inCell) : walk([c], state, inCell)));
    position++;
  }
  return out;
}

function tableBlock(table: Element, state: WalkState, index: number): Block {
  const rows: Cell[][] = [];
  let headerRows = 0;
  const addRow = (tr: Element, header: boolean): void => {
    const cells: Cell[] = [];
    for (const td of tr.children) {
      if (!isTag(td) || (td.name !== "td" && td.name !== "th")) continue;
      const span = (name: string) => Math.max(1, Number(td.attribs[name] ?? "1") || 1);
      cells.push({ text: "", colSpan: span("colspan"), rowSpan: span("rowspan"), blocks: walk(td.children, state, true) });
    }
    rows.push(cells);
    if (header) headerRows++;
  };
  for (const part of table.children) {
    if (!isTag(part)) continue;
    if (part.name === "tr") addRow(part, false);
    else if (part.name === "thead" || part.name === "tbody" || part.name === "tfoot") for (const tr of part.children) if (isTag(tr) && tr.name === "tr") addRow(tr, part.name === "thead");
  }
  return { kind: "table", index, headerRows, rows };
}

/**
 * Container children → blocks in document order. Inside a cell or a note, headings read as paragraphs and tables are
 * nested (their numbers come from the linearizer).
 */
function walk(nodes: ChildNode[], state: WalkState, inCell = false): Block[] {
  const out: Block[] = [];
  let loose: ChildNode[] = [];
  const inline = (content: ChildNode[], make: (text: string) => Block): void => {
    const cited: number[] = [];
    const nested: ChildNode[] = [];
    out.push(make(inlineText(content, state, cited, nested)), ...notesFor(cited, state), ...walk(nested, state, inCell));
  };
  const flushLoose = (): void => {
    if (loose.length > 0) inline(loose, (text) => ({ kind: "paragraph", text }));
    loose = [];
  };
  for (const node of nodes) {
    if (!isTag(node)) { loose.push(node); continue; }
    const heading = HEADING.exec(node.name);
    if (node.name === "p" || heading) {
      flushLoose();
      inline(node.children, (text) => (heading && !inCell ? { kind: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4 | 5 | 6, text } : { kind: "paragraph", text }));
    } else if (node.name === "ol" || node.name === "ul") {
      flushLoose();
      if (!isNoteList(node)) out.push(...listItems(node, 0, state, inCell));
    } else if (node.name === "table") {
      flushLoose();
      out.push(tableBlock(node, state, inCell ? 0 : ++state.tables));
    } else if (INLINE.has(node.name)) {
      loose.push(node);
    } else {
      flushLoose();
      out.push(...walk(node.children, state, inCell));
    }
  }
  flushLoose();
  return out;
}

/** Footnote and endnote content from mammoth's trailing note lists, as blocks: paragraphs, nested lists and tables. */
function noteBlocks(nodes: ChildNode[]): Map<string, Block[]> {
  const notes = new Map<string, Block[]>();
  const scratch: WalkState = { noteBlocks: new Map(), noteNumbers: new Map(), tables: 0 };
  for (const node of nodes) {
    if (!isTag(node) || !isNoteList(node)) continue;
    for (const li of node.children) if (isTag(li) && li.name === "li") notes.set(li.attribs["id"]!, walk(li.children, scratch, true));
  }
  return notes;
}

/** mammoth's HTML → blocks. Exported for tests of HTML shapes that a synthetic DOCX cannot produce. */
export function htmlToBlocks(html: string): Block[] {
  const root = parseDocument(html);
  return walk(root.children, { noteBlocks: noteBlocks(root.children), noteNumbers: new Map(), tables: 0 });
}

/**
 * DOCX → SourceDocument (design §4.2). Numbering is resolved first (resolveNumbering: style-inherited numbering and
 * level overrides made explicit for mammoth). mammoth's HTML (default style map, images ignored) then gives the blocks:
 * headings, paragraphs, nested lists (numbered lists labelled 1., 2. by position, bullets •), tables with `thead` rows
 * from w:tblHeader counted as header rows and colspan/rowspan from gridSpan/vMerge, and notes, with their paragraphs,
 * lists and tables, placed after the citing block. Tracked deletions are dropped and insertions kept (mammoth). List
 * formats other than decimal and bullet, numbering that cannot be rendered, and sentences that look like label
 * references are reported (R13). Text is normalised before linearizing (R11) and admitted once, by finaliseDocument.
 */
export async function ingestDocx(bytes: Buffer, opts: IngestOptions): Promise<StructuredIngestResult> {
  const zip = await JSZip.loadAsync(bytes);
  const numbering = await resolveNumbering(zip);
  for (const [name, xml] of numbering.rewrittenParts) zip.file(name, xml);
  const converted = numbering.rewrittenParts.size === 0 ? bytes : await zip.generateAsync({ type: "nodebuffer" });
  const { value: html } = await mammoth.convertToHtml({ buffer: converted });
  const { text, segments, tables } = linearize(normaliseBlocks(htmlToBlocks(html)));
  const document = finaliseDocument("docx", text, segments, opts, { originalSha256: createHash("sha256").update(bytes).digest("hex"), extractor: "docx" });
  return { document, tables, warnings: { listNumberingSimplified: locateSimplifiedLists(document, numbering.simplified), numberingUnsupported: numbering.unsupported, labelLikeReferences: labelLikeReferences(document) } };
}
