import type { IngestedSource } from "../ingest/ingest-source.js";
import { MIN_SOURCE_CODE_POINTS } from "../ingest/admit.js";
import { buildOutline, type OutlineSection } from "../ingest/outline.js";
import type { Sentence } from "../ingest/source-document.js";
import { selectionSourceCounter } from "../ingest/structure/origin.js";
import { SCOPE_FORMAT, SCOPED_LAYOUT_VERSION } from "./constants.js";
import { scopeHashOf, scopePayload, type ScopeContextRun, type ScopePassage, type ScopePayload } from "./hash.js";
import { partialStructures, type PartialStructure } from "./partial.js";
import { parseScopeFile, ScopeRefusedError, type GenerationScopeFile, type PreviewConfig, type ScopeEntry } from "./schema.js";

/**
 * A generation scope resolved against its source (design §2.3–§2.7). `payload` and `scopeHash` are what the scope means;
 * `previewConfig` is how its requests are laid out; the rest is derived for reports. `sentences` are the document's own
 * Sentence objects for the selection, in document order, never renumbered. `gapsBefore` names, for each selected
 * sentence that follows an omission, the omitted range.
 */
export interface ResolvedScope {
  payload: ScopePayload;
  scopeHash: string;
  previewConfig: PreviewConfig;
  entries: { include: ScopeEntry[]; exclude: ScopeEntry[] };
  sentences: Sentence[];
  gapsBefore: Record<string, { from: string; to: string }>;
  counts: { sentences: number; documentSentences: number; passages: number; sourceCodePoints: number };
  partial: PartialStructure[];
  redundant: string[];
}

type Source = Pick<IngestedSource, "document" | "analysis" | "originalSha256">;
const flat = (sections: OutlineSection[]): OutlineSection[] => sections.flatMap((s) => [s, ...flat(s.children)]);
const describe = (e: ScopeEntry, outline: Map<string, OutlineSection>): string => ("section" in e ? `${e.section}${outline.has(e.section) ? ` (${outline.get(e.section)!.title})` : ""}` : `${e.sentences.from}–${e.sentences.to}`);

/**
 * Validates `file` (the parsed JSON of generation-scope.json) against `source` and resolves it. Refuses, listing every
 * problem, when: the file is malformed; its scopeFormat or scopedLayoutVersion is unsupported; it is bound to other
 * bytes, text or extraction (then nothing else is checked); an entry names an unknown section or sentence, a section's
 * title does not match, or a range is reversed; an exclude removes nothing that is included; the result is empty; or
 * the selection has fewer than 500 code points of source text (counted once, design §2.4).
 */
export function resolveScope(file: unknown, source: Source): ResolvedScope {
  const scope: GenerationScopeFile = parseScopeFile(file);
  const { document, analysis } = source;
  const versionProblems = [
    ...(scope.scopeFormat !== SCOPE_FORMAT ? [`scopeFormat ${scope.scopeFormat} is not supported (this version reads ${SCOPE_FORMAT})`] : []),
    ...(scope.previewConfig.scopedLayoutVersion !== SCOPED_LAYOUT_VERSION ? [`previewConfig.scopedLayoutVersion ${scope.previewConfig.scopedLayoutVersion} is not supported (this version renders ${SCOPED_LAYOUT_VERSION})`] : [])
  ];
  if (versionProblems.length > 0) throw new ScopeRefusedError(versionProblems);
  const binding = { originalSha256: source.originalSha256, textHash: document.textHash, extractionVersion: document.metadata.extractionVersion };
  const bindingProblems = (["originalSha256", "textHash", "extractionVersion"] as const)
    .filter((k) => scope.source[k] !== binding[k])
    .map((k) => `source.${k} is ${scope.source[k]}, but the file given has ${binding[k]}; the scope was made for another file or extraction: re-run leap outline`);
  if (bindingProblems.length > 0) throw new ScopeRefusedError(bindingProblems);

  const outline = buildOutline(document, analysis);
  const sections = new Map(flat(outline.sections).map((s) => [s.id, s]));
  const index = new Map(document.sentences.map((s, i) => [s.sentenceId, i]));
  const problems: string[] = [];
  /** The sentence positions an entry names, or null after recording why it cannot be used. */
  const positionsOf = (e: ScopeEntry, side: "include" | "exclude"): number[] | null => {
    if ("section" in e) {
      const section = sections.get(e.section);
      if (!section) { problems.push(`${side} ${e.section}: no such section in the outline`); return null; }
      if (section.title !== e.title) { problems.push(`${side} ${e.section}: its title is ${JSON.stringify(section.title)}, not ${JSON.stringify(e.title)}`); return null; }
      const ids = new Set(flat([section]).map((s) => s.id));
      return document.sentences.flatMap((s, i) => (ids.has(outline.sectionOf[s.sentenceId]!) ? [i] : []));
    }
    const { from, to } = e.sentences;
    const missing = [from, to].filter((id) => !index.has(id));
    if (missing.length > 0) { problems.push(`${side} ${from}–${to}: no sentence ${missing.join(" or ")}`); return null; }
    if (index.get(from)! > index.get(to)!) { problems.push(`${side} ${from}–${to}: the range starts after it ends`); return null; }
    return Array.from({ length: index.get(to)! - index.get(from)! + 1 }, (_, k) => index.get(from)! + k);
  };
  const includes = scope.include.map((e) => ({ e, at: positionsOf(e, "include") }));
  const excludes = scope.exclude.map((e) => ({ e, at: positionsOf(e, "exclude") }));
  const included = new Set(includes.flatMap((x) => x.at ?? []));
  for (const x of excludes) if (x.at && !x.at.some((i) => included.has(i))) problems.push(`exclude ${describe(x.e, sections)} removes nothing that is included`);
  if (problems.length > 0) throw new ScopeRefusedError(problems);

  const removed = new Set(excludes.flatMap((x) => x.at ?? []));
  const chosen = [...included].filter((i) => !removed.has(i)).sort((a, b) => a - b);
  if (chosen.length === 0) throw new ScopeRefusedError(["the scope selects no sentences"]);
  const sentences = chosen.map((i) => document.sentences[i]!);
  const sourceCodePoints = selectionSourceCounter(document.text, analysis.generated, analysis.repeats)(sentences.map((s): [number, number] => [s.charStart, s.charEnd]));
  if (sourceCodePoints < MIN_SOURCE_CODE_POINTS) throw new ScopeRefusedError([`the selection has ${sourceCodePoints} code points of source text, below the minimum of ${MIN_SOURCE_CODE_POINTS}`]);

  const passages: ScopePassage[] = [];
  const gapsBefore: ResolvedScope["gapsBefore"] = {};
  chosen.forEach((i, k) => {
    const previous = chosen[k - 1];
    if (previous !== undefined && i === previous + 1) passages.at(-1)!.sentenceIds.push(document.sentences[i]!.sentenceId);
    else {
      passages.push({ sentenceIds: [document.sentences[i]!.sentenceId] });
      if (previous !== undefined) gapsBefore[document.sentences[i]!.sentenceId] = { from: document.sentences[previous + 1]!.sentenceId, to: document.sentences[i - 1]!.sentenceId };
    }
  });
  const byId = new Map(sentences.map((s) => [s.sentenceId, s]));
  const context: ScopeContextRun[] = [];
  passages.forEach((p, n) => {
    for (const id of p.sentenceIds) {
      const path = byId.get(id)!.headingPath;
      const last = context.at(-1);
      if (last && last.passage === n && last.headingPath.join("\u0000") === path.join("\u0000")) last.to = id;
      else context.push({ passage: n, from: id, to: id, headingPath: [...path] });
    }
  });
  const payload = scopePayload(binding, passages, context, scope.scopeFormat);
  const redundant = includes.flatMap(({ e, at }, k) => {
    if (!at) return [];
    const others = new Set(includes.flatMap((x, j) => (j === k ? [] : x.at ?? [])));
    return at.every((i) => others.has(i)) ? [`include ${describe(e, sections)} is already selected by other entries`] : [];
  });
  return {
    payload, scopeHash: scopeHashOf(payload), previewConfig: { ...scope.previewConfig },
    entries: { include: scope.include, exclude: scope.exclude },
    sentences, gapsBefore,
    counts: { sentences: sentences.length, documentSentences: document.sentences.length, passages: passages.length, sourceCodePoints },
    partial: partialStructures(document, analysis, new Set(sentences.map((s) => s.sentenceId))),
    redundant
  };
}
