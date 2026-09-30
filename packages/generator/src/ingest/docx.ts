import { createHash } from "node:crypto";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import { isTag, isText, type ChildNode, type Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import JSZip from "jszip";
import mammoth from "mammoth";
import { finaliseDocument, type IngestOptions, type SourceDocument } from "./source-document.js";
import { normaliseBlocks, normaliseBlockText, type Block, type Cell } from "./structure/blocks.js";
import { linearize } from "./structure/linearize.js";

/** A list whose numbering was rendered as decimal or bullet although the document uses another format (R13). */
export interface SimplifiedNumbering { listIndex: number; headingPath: string[]; originalFormats: string[] }
/** A sentence that looks like it refers to a list item by its label ("item b)", "(ii)"), which simplified numbering may have changed. */
export interface LabelLikeReference { sentenceId: string; headingPath: string[]; text: string }
export interface IngestWarnings { listNumberingSimplified: SimplifiedNumbering[]; labelLikeReferences: LabelLikeReference[] }
export interface StructuredIngestResult { document: SourceDocument; warnings: IngestWarnings }

const LABEL_LIKE = [/\bitem [a-z]\)/i, /\([a-z]\)/, /\([ivx]+\)/i, /\b[a-z]\) (?:above|below)\b/i];

/** Sentences that look like references to list labels, for the Checkpoint B review (R13). */
export function labelLikeReferences(doc: SourceDocument): LabelLikeReference[] {
  return doc.sentences.filter((s) => LABEL_LIKE.some((re) => re.test(s.text))).map((s) => ({ sentenceId: s.sentenceId, headingPath: [...s.headingPath], text: s.text }));
}

// ---- mammoth HTML → blocks -------------------------------------------------------------------------------------------

interface WalkState {
  /** Footnote and endnote texts by mammoth's element id ("footnote-1", "endnote-2"). */
  noteTexts: Map<string, string>;
  /** Our sequential note number for each note id, in order of first reference. */
  noteNumbers: Map<string, number>;
  tables: number;
}

const HEADING = /^h([1-6])$/;
const isNoteList = (el: Element): boolean => el.name === "ol" && el.children.some((c) => isTag(c) && c.name === "li" && /^(foot|end)note-\d+$/.test(c.attribs["id"] ?? ""));

/** The text of an inline run of nodes. A note reference becomes `[n]` and its number is added to `cited`. Images are ignored. */
function inlineText(nodes: ChildNode[], state: WalkState, cited: number[]): string {
  let out = "";
  for (const node of nodes) {
    if (isText(node)) { out += node.data; continue; }
    if (!isTag(node)) continue;
    if (node.name === "br") { out += "\n"; continue; }
    if (node.name === "img" || node.name === "ol" || node.name === "ul" || node.name === "table") continue;
    const ref = /^((?:foot|end)note)-ref-(\d+)$/.exec(node.attribs["id"] ?? "");
    if (node.name === "a" && ref) {
      const noteId = `${ref[1]}-${ref[2]}`;
      let n = state.noteNumbers.get(noteId);
      if (n === undefined) { n = state.noteNumbers.size + 1; state.noteNumbers.set(noteId, n); }
      cited.push(n);
      out += `[${n}]`;
      continue;
    }
    out += inlineText(node.children, state, cited);
  }
  return out;
}

function notesFor(cited: number[], state: WalkState): Block[] {
  const byNumber = new Map([...state.noteNumbers].map(([id, n]) => [n, id]));
  return [...new Set(cited)].map((n) => ({ kind: "note", n, text: state.noteTexts.get(byNumber.get(n)!) ?? "" }));
}

function listItems(list: Element, depth: number, state: WalkState): Block[] {
  const out: Block[] = [];
  const start = Number(list.attribs["start"] ?? "1");
  let position = Number.isFinite(start) ? start : 1;
  for (const li of list.children) {
    if (!isTag(li) || li.name !== "li") continue;
    const cited: number[] = [];
    const own = li.children.filter((c) => !(isTag(c) && (c.name === "ol" || c.name === "ul")));
    out.push({ kind: "listItem", depth, label: list.name === "ol" ? `${position}.` : "•", text: inlineText(own, state, cited) });
    out.push(...notesFor(cited, state));
    for (const c of li.children) if (isTag(c) && (c.name === "ol" || c.name === "ul")) out.push(...listItems(c, depth + 1, state));
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

/** Container children → blocks in document order. Inside a cell, headings read as paragraphs and tables are nested (their numbers come from the linearizer). */
function walk(nodes: ChildNode[], state: WalkState, inCell = false): Block[] {
  const out: Block[] = [];
  let loose: ChildNode[] = [];
  const flushLoose = (): void => {
    if (loose.length === 0) return;
    const cited: number[] = [];
    out.push({ kind: "paragraph", text: inlineText(loose, state, cited) }, ...notesFor(cited, state));
    loose = [];
  };
  for (const node of nodes) {
    if (!isTag(node)) { loose.push(node); continue; }
    const heading = HEADING.exec(node.name);
    if (node.name === "p" || heading) {
      flushLoose();
      const cited: number[] = [];
      const text = inlineText(node.children, state, cited);
      out.push(heading && !inCell ? { kind: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4 | 5 | 6, text } : { kind: "paragraph", text }, ...notesFor(cited, state));
    } else if (node.name === "ol" || node.name === "ul") {
      flushLoose();
      if (!isNoteList(node)) out.push(...listItems(node, 0, state));
    } else if (node.name === "table") {
      flushLoose();
      out.push(tableBlock(node, state, inCell ? 0 : ++state.tables));
    } else if (node.name === "img") {
      continue;
    } else if (["sup", "sub", "a", "strong", "em", "b", "i", "u", "s", "span", "br"].includes(node.name)) {
      loose.push(node);
    } else {
      flushLoose();
      out.push(...walk(node.children, state, inCell));
    }
  }
  flushLoose();
  return out;
}

/** Footnote and endnote texts from mammoth's trailing note lists, without the "↑" back-links. */
function noteTexts(nodes: ChildNode[]): Map<string, string> {
  const texts = new Map<string, string>();
  const scratch: WalkState = { noteTexts: new Map(), noteNumbers: new Map(), tables: 0 };
  for (const node of nodes) {
    if (!isTag(node) || !isNoteList(node)) continue;
    for (const li of node.children) {
      if (!isTag(li) || li.name !== "li") continue;
      const strip = (ns: ChildNode[]): ChildNode[] => ns.filter((n) => !(isTag(n) && n.name === "a" && /^#(foot|end)note-ref-/.test(n.attribs["href"] ?? "")));
      const parts = li.children.map((c) => (isTag(c) && c.name === "p" ? inlineText(strip(c.children), scratch, []) : inlineText(strip([c]), scratch, [])));
      texts.set(li.attribs["id"]!, parts.join(" "));
    }
  }
  return texts;
}

// ---- numbering formats from word/numbering.xml and word/document.xml -------------------------------------------------

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const attr = (el: XmlElement, name: string): string | null => el.getAttributeNS(WNS, name) ?? el.getAttribute(`w:${name}`);
const children = (el: XmlElement, local: string): XmlElement[] => Array.from(el.getElementsByTagNameNS(WNS, local));
const firstChild = (el: XmlElement, local: string): XmlElement | undefined => children(el, local)[0];

/** Every list (a numId) whose levels in use have a format other than decimal or bullet, with the heading path at its first item. */
async function simplifiedNumbering(zip: JSZip): Promise<SimplifiedNumbering[]> {
  const read = async (name: string) => { const f = zip.file(name); return f ? new DOMParser().parseFromString(await f.async("string"), "text/xml") : null; };
  const [documentXml, numberingXml, stylesXml] = await Promise.all([read("word/document.xml"), read("word/numbering.xml"), read("word/styles.xml")]);
  if (!documentXml || !numberingXml) return [];

  const formats = new Map<string, Map<string, string>>(); // abstractNumId → ilvl → numFmt
  for (const an of children(numberingXml.documentElement!, "abstractNum")) {
    const levels = new Map<string, string>();
    for (const lvl of children(an, "lvl")) { const fmt = firstChild(lvl, "numFmt"); levels.set(attr(lvl, "ilvl") ?? "0", fmt ? attr(fmt, "val") ?? "decimal" : "decimal"); }
    formats.set(attr(an, "abstractNumId") ?? "", levels);
  }
  const abstractOf = new Map<string, string>();
  for (const num of children(numberingXml.documentElement!, "num")) { const a = firstChild(num, "abstractNumId"); if (a) abstractOf.set(attr(num, "numId") ?? "", attr(a, "val") ?? ""); }

  const headingLevel = new Map<string, number>(); // styleId → level
  for (const style of stylesXml ? children(stylesXml.documentElement!, "style") : []) {
    const name = firstChild(style, "name");
    const m = /^heading ([1-6])$/i.exec(name ? attr(name, "val") ?? "" : "");
    if (m) headingLevel.set(attr(style, "styleId") ?? "", Number(m[1]));
  }

  const headings: Array<{ level: number; text: string }> = [];
  const lists = new Map<string, { headingPath: string[]; formats: string[] }>();
  for (const p of children(documentXml.documentElement!, "p")) {
    const pPr = firstChild(p, "pPr");
    const styleEl = pPr ? firstChild(pPr, "pStyle") : undefined;
    const style = styleEl ? attr(styleEl, "val") ?? "" : "";
    const level = headingLevel.get(style) ?? (/^Heading([1-6])$/.exec(style) ? Number(style.slice(7)) : null);
    if (level !== null) {
      const text = normaliseBlockText(children(p, "t").map((t) => t.textContent ?? "").join(""));
      if (text !== "") { while (headings.length > 0 && headings.at(-1)!.level >= level) headings.pop(); headings.push({ level, text }); }
      continue;
    }
    const numPr = pPr ? firstChild(pPr, "numPr") : undefined;
    const numIdEl = numPr ? firstChild(numPr, "numId") : undefined;
    const numId = numIdEl ? attr(numIdEl, "val") ?? "0" : "0";
    if (numId === "0") continue;
    const ilvlEl = numPr ? firstChild(numPr, "ilvl") : undefined;
    const fmt = formats.get(abstractOf.get(numId) ?? "")?.get(ilvlEl ? attr(ilvlEl, "val") ?? "0" : "0") ?? "decimal";
    const list = lists.get(numId) ?? { headingPath: headings.map((h) => h.text), formats: [] };
    if (!list.formats.includes(fmt)) list.formats.push(fmt);
    lists.set(numId, list);
  }
  return [...lists.values()].map((l, i) => ({ listIndex: i + 1, headingPath: l.headingPath, originalFormats: l.formats.filter((f) => f !== "decimal" && f !== "bullet") })).filter((l) => l.originalFormats.length > 0);
}

/**
 * DOCX → SourceDocument (design §4.2). mammoth's HTML (default style map, images ignored) gives the blocks: headings,
 * paragraphs, nested lists (numbered lists labelled 1., 2. by position, bullets •), tables with `thead` rows from
 * w:tblHeader counted as header rows and colspan/rowspan from gridSpan/vMerge, and notes placed after the citing block.
 * Tracked deletions are dropped and insertions kept (mammoth). List formats other than decimal and bullet are read from
 * numbering.xml and reported, as are sentences that look like label references (R13). Text is normalised before
 * linearizing (R11) and admitted once, by finaliseDocument.
 */
export async function ingestDocx(bytes: Buffer, opts: IngestOptions): Promise<StructuredIngestResult> {
  const zip = await JSZip.loadAsync(bytes);
  const { value: html } = await mammoth.convertToHtml({ buffer: bytes });
  const root = parseDocument(html);
  const state: WalkState = { noteTexts: noteTexts(root.children), noteNumbers: new Map(), tables: 0 };
  const blocks = normaliseBlocks(walk(root.children, state));
  const { text, segments } = linearize(blocks);
  const document = finaliseDocument("docx", text, segments, opts, { originalSha256: createHash("sha256").update(bytes).digest("hex"), extractor: "docx" });
  return { document, warnings: { listNumberingSimplified: await simplifiedNumbering(zip), labelLikeReferences: labelLikeReferences(document) } };
}
