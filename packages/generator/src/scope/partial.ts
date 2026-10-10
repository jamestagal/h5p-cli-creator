import type { SourceAnalysis } from "../ingest/analysis.js";
import type { SourceDocument } from "../ingest/source-document.js";

/**
 * A structure the scope holds some, but not all, of (design §2.7). Partial structures are allowed and always reported.
 * `units` names what is counted (rows, items, sentences, lines); `selected` lists the 1-based positions held.
 */
export interface PartialStructure { kind: "table" | "list" | "listItem" | "note" | "paragraph"; message: string; selected: number[]; total: number; units: string }

const pathText = (p: string[]): string => (p.length === 0 ? "(no heading)" : p.join(" › "));
/** 1-based positions as compact ranges: "rows 1–2, 4" or "row 3". */
function positions(unit: string, list: number[]): string {
  const runs: Array<[number, number]> = [];
  for (const n of list) { const last = runs.at(-1); if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]); }
  return `${list.length === 1 ? unit : `${unit}s`} ${runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ")}`;
}

/**
 * Every partial structure of the selection, in document order: each table (rows), list (items) and list item (its
 * sentences), each note (lines), then each stored line outside list items holding more than one sentence (a paragraph:
 * its sentences). A unit is held when any of its sentences is selected.
 */
export function partialStructures(document: SourceDocument, analysis: SourceAnalysis, selected: ReadonlySet<string>): PartialStructure[] {
  const out: PartialStructure[] = [];
  const sentences = document.sentences; // in document order, so a range's sentences are found by binary search
  const within = (start: number, end: number) => {
    let lo = 0; let hi = sentences.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sentences[mid]!.charStart < start) lo = mid + 1; else hi = mid; }
    const found = [];
    for (let i = lo; i < sentences.length && sentences[i]!.charEnd <= end; i++) found.push(sentences[i]!);
    return found;
  };
  const held = (start: number, end: number) => within(start, end).some((s) => selected.has(s.sentenceId));
  const report = (kind: PartialStructure["kind"], label: string, unit: string, flags: boolean[]): void => {
    const chosen = flags.flatMap((f, i) => (f ? [i + 1] : []));
    if (chosen.length === 0 || chosen.length === flags.length) return;
    const plural = `${unit}s`;
    out.push({ kind, message: `${label}: ${chosen.length} of ${flags.length} ${plural} (${positions(unit, chosen)})`, selected: chosen, total: flags.length, units: plural });
  };
  const itemLines = new Set<number>();
  for (const s of analysis.structures) {
    if (s.kind === "table") report("table", `${s.name.startsWith("Note ") ? s.name : `Table ${s.name}`} under ${pathText(s.headingPath)}`, "row", s.rows.map((r) => held(r.charStart, r.charEnd)));
    else if (s.kind === "note") report("note", `Note ${s.n}`, "line", s.lines.map((l) => held(l.charStart, l.charEnd)));
    else {
      report("list", `List ${s.index} under ${pathText(s.headingPath)}`, "item", s.items.map((item) => item.lines.some((l) => held(l.charStart, l.charEnd))));
      s.items.forEach((item, i) => {
        for (const l of item.lines) itemLines.add(l.charStart);
        const inItem = item.lines.flatMap((l) => within(l.charStart, l.charEnd));
        const chosen = inItem.filter((x) => selected.has(x.sentenceId)).length;
        if (chosen > 0 && chosen < inItem.length) out.push({ kind: "listItem", message: `List ${s.index}, item ${i + 1}: ${chosen} of ${inItem.length} sentences`, selected: inItem.flatMap((x, k) => (selected.has(x.sentenceId) ? [k + 1] : [])), total: inItem.length, units: "sentences" });
      });
    }
  }
  let start = 0;
  for (const line of document.text.split("\n")) {
    const end = start + line.length;
    if (!itemLines.has(start)) {
      const inLine = within(start, end);
      const chosen = inLine.filter((x) => selected.has(x.sentenceId));
      if (inLine.length > 1 && chosen.length > 0 && chosen.length < inLine.length) {
        out.push({ kind: "paragraph", message: `Paragraph at ${inLine[0]!.sentenceId}–${inLine.at(-1)!.sentenceId}: ${chosen.length} of ${inLine.length} sentences`, selected: inLine.flatMap((x, k) => (selected.has(x.sentenceId) ? [k + 1] : [])), total: inLine.length, units: "sentences" });
      }
    }
    start = end + 1;
  }
  return out;
}
