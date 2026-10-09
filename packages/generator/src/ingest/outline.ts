import type { SourceAnalysis } from "./analysis.js";
import type { SourceDocument } from "./source-document.js";
import { sourceCodePointCounter } from "./structure/origin.js";

/**
 * A section's text, counted (generation scope design §2.2). `sourceCodePoints` counts Unicode code points of source text
 * only (never generated labels, prefixes, separators or copies). `listItemSentences` counts the sentences inside list
 * items, so a two-sentence item is 1 item and 2 sentences. First and last are sentence ids in document order.
 */
export interface SectionCounts {
  sentences: number; sourceCodePoints: number;
  tables: number; tableRows: number;
  lists: number; listItems: number; listItemSentences: number;
  notes: number; noteLines: number;
  firstSentenceId: string | null; lastSentenceId: string | null;
}
/**
 * A section: a heading and everything up to the next heading at its level or above. `id` is `sec-` plus the id of its
 * first sentence, so it is unique when titles repeat and stable for a given source text and extraction version. `own`
 * counts the section's text outside its subsections; `subtree` counts it with them.
 */
export interface OutlineSection {
  id: string; title: string;
  /** The heading level, or 0 for the text before the first heading or a document without headings. */
  level: number;
  headingPath: string[];
  own: SectionCounts; subtree: SectionCounts;
  children: OutlineSection[];
}
export interface Outline {
  /** False when the document has no heading lines (text, markdown and PDF sources, or a document styled without headings): select sentence ranges instead. */
  usableHeadings: boolean;
  sections: OutlineSection[];
  totals: SectionCounts;
  /** Every sentence id, in document order, to the id of the section whose own text holds it. */
  sectionOf: Record<string, string>;
}

export const BEFORE_FIRST_HEADING = "(before the first heading)";
export const WHOLE_DOCUMENT = "(whole document)";

const zero = (): SectionCounts => ({ sentences: 0, sourceCodePoints: 0, tables: 0, tableRows: 0, lists: 0, listItems: 0, listItemSentences: 0, notes: 0, noteLines: 0, firstSentenceId: null, lastSentenceId: null });

interface Node { section: OutlineSection; level: number; charStart: number }

/**
 * The document's sections, from the heading lines in its analysis. A heading at level L opens a section that runs to
 * the next heading at level L or above; a skipped level nests under the nearest shallower heading; a sentence belongs to
 * the innermost section that contains its start. Text before the first heading is its own section, `sec-s1`. A
 * document without headings is one section, `sec-s1`, the whole document.
 */
export function buildOutline(document: SourceDocument, analysis: SourceAnalysis): Outline {
  if (analysis.textHash !== document.textHash || analysis.extractionVersion !== document.metadata.extractionVersion) throw new Error("outline: the source analysis was computed for another document");
  const sentences = document.sentences;
  const headings = [...analysis.headings].sort((a, b) => a.charStart - b.charStart);
  const usableHeadings = headings.length > 0;
  const firstId = sentences[0]?.sentenceId ?? "s1";
  const make = (id: string, title: string, level: number, headingPath: string[]): OutlineSection => ({ id, title, level, headingPath, own: zero(), subtree: zero(), children: [] });

  const roots: OutlineSection[] = [];
  const nodes: Node[] = []; // in document order, for locating the section at an offset
  const firstHeadingStart = headings[0]?.charStart ?? Infinity;
  if (!usableHeadings || (sentences[0] !== undefined && sentences[0].charStart < firstHeadingStart)) {
    const front = make(`sec-${firstId}`, usableHeadings ? BEFORE_FIRST_HEADING : WHOLE_DOCUMENT, 0, []);
    roots.push(front);
    nodes.push({ section: front, level: 0, charStart: -1 });
  }
  const stack: Node[] = [];
  for (const h of headings) {
    while (stack.length > 0 && stack.at(-1)!.level >= h.level) stack.pop();
    const first = sentences.find((s) => s.charStart >= h.charStart);
    if (!first) continue;
    const parent = stack.at(-1);
    const section = make(`sec-${first.sentenceId}`, h.text, h.level, [...(parent?.section.headingPath ?? []), h.text]);
    (parent ? parent.section.children : roots).push(section);
    const node = { section, level: h.level, charStart: h.charStart };
    stack.push(node);
    nodes.push(node);
  }
  /** The section whose own text holds `offset`: the last section started at or before it. */
  const sectionAt = (offset: number): OutlineSection => {
    let found = nodes[0]!;
    for (const n of nodes) { if (n.charStart <= offset) found = n; else break; }
    return found.section;
  };

  const count = sourceCodePointCounter(document.text, analysis.generated);
  const inItem = new Uint8Array(document.text.length);
  for (const s of analysis.structures) {
    const own = sectionAt((s.kind === "table" ? s.rows[0] : s.kind === "list" ? s.items[0]?.lines[0] : s.lines[0])?.charStart ?? 0).own;
    if (s.kind === "table") { own.tables++; own.tableRows += s.rows.length; }
    else if (s.kind === "note") { own.notes++; own.noteLines += s.lines.length; }
    else {
      own.lists++; own.listItems += s.items.length;
      for (const item of s.items) for (const line of item.lines) inItem.fill(1, line.charStart, line.charEnd);
    }
  }
  const sectionOf: Record<string, string> = {};
  for (const s of sentences) {
    const section = sectionAt(s.charStart);
    const own = section.own;
    own.sentences++;
    own.sourceCodePoints += count(s.charStart, s.charEnd);
    if (inItem[s.charStart] === 1) own.listItemSentences++;
    own.firstSentenceId ??= s.sentenceId;
    own.lastSentenceId = s.sentenceId;
    sectionOf[s.sentenceId] = section.id;
  }
  const position = new Map(sentences.map((s, i) => [s.sentenceId, i]));
  const add = (a: SectionCounts, b: SectionCounts): SectionCounts => {
    const ids = [a.firstSentenceId, b.firstSentenceId, a.lastSentenceId, b.lastSentenceId].filter((x): x is string => x !== null).sort((x, y) => position.get(x)! - position.get(y)!);
    return {
      sentences: a.sentences + b.sentences, sourceCodePoints: a.sourceCodePoints + b.sourceCodePoints, tables: a.tables + b.tables, tableRows: a.tableRows + b.tableRows,
      lists: a.lists + b.lists, listItems: a.listItems + b.listItems, listItemSentences: a.listItemSentences + b.listItemSentences, notes: a.notes + b.notes, noteLines: a.noteLines + b.noteLines,
      firstSentenceId: ids[0] ?? null, lastSentenceId: ids.at(-1) ?? null
    };
  };
  const roll = (section: OutlineSection): SectionCounts => {
    section.subtree = section.children.reduce((sum, c) => add(sum, roll(c)), { ...section.own });
    return section.subtree;
  };
  const totals = roots.reduce((sum, r) => add(sum, roll(r)), zero());
  return { usableHeadings, sections: roots, totals, sectionOf };
}
