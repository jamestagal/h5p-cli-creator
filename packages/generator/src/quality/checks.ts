import type { BlanksOut, FlashcardsOut, MultiChoiceOut } from "../schemas/model-output.js";

export function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
export function wordSet(s: string): Set<string> { return new Set(normaliseText(s).split(" ").filter(Boolean)); }
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export function isNearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  const na = normaliseText(a); const nb = normaliseText(b);
  return na === nb || jaccard(wordSet(na), wordSet(nb)) >= threshold;
}
export function checkAgainstExisting(kind: "question" | "passage" | "front", candidate: string, existing: string[]): string[] {
  return existing.some((e) => isNearDuplicate(candidate, e)) ? [`${kind} is a near-duplicate of an existing ${kind} in this import`] : [];
}

/** `criteria` is null when the import has no unit (no alignment), in which case criterion ids are not checked. */
export interface AllowedRefs { evidence: Set<string>; concepts: Set<string>; criteria: Set<string> | null; }
export function checkReferences(ids: { evidenceIds: string[]; conceptIds: string[]; criteriaIds: string[] }, allowed: AllowedRefs, where: string): string[] {
  const issues: string[] = [];
  if (ids.evidenceIds.length === 0) issues.push(`${where} cites no evidence`);
  for (const id of ids.evidenceIds) if (!allowed.evidence.has(id)) issues.push(`${where} cites unknown evidence ${id}`);
  for (const id of ids.conceptIds) if (!allowed.concepts.has(id)) issues.push(`${where} cites unknown concept ${id}`);
  if (allowed.criteria) for (const id of ids.criteriaIds) if (!allowed.criteria.has(id)) issues.push(`${where} cites unknown criterion ${id}`);
  return issues;
}

/**
 * `**bold**`/`__bold__`, headings and bullets are always markers. A single `*`/`_` pair is a marker
 * only when it wraps a non-space run (e.g. `*worker*`, `_worker_`, `*two words*`) — a lone delimiter
 * such as the `*` in `2 * 3` never pairs into one. Underscore additionally requires the pair to sit at
 * a word boundary (CommonMark's intraword-underscore rule), so `snake_case_word` is not flagged.
 */
const MARKDOWN_MARKERS =
  /(\*\*|__|^#{1,6}\s|^\s*[-*]\s|\*[^\s*](?:[^*]*[^\s*])?\*|(?<![\p{L}\p{N}])_[^\s_](?:[^_]*[^\s_])?_(?![\p{L}\p{N}]))/mu;

export function checkPlainText(value: string, where: string): string[] {
  if (value.trim().length === 0) return [`${where} is empty`];
  const issues: string[] = [];
  if (/<[a-z/][^>]*>/i.test(value)) issues.push(`${where} contains HTML tags`);
  if (MARKDOWN_MARKERS.test(value)) issues.push(`${where} contains markdown markers`);
  return issues;
}

export function checkMultiChoice(out: MultiChoiceOut): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.question, "question")];
  if (out.answers.length < 2 || out.answers.length > 8) issues.push("between 2 and 8 answers are required");
  if (out.answers.filter((a) => a.correct).length !== 1) issues.push("exactly one answer must be correct");
  const seen = new Set<string>();
  out.answers.forEach((a, i) => {
    issues.push(...checkPlainText(a.text, `answer ${i + 1}`));
    issues.push(...checkPlainText(a.feedback, `answers[${i + 1}].feedback`));
    const n = normaliseText(a.text);
    if (seen.has(n)) issues.push(`answer ${i + 1} duplicates another answer`);
    seen.add(n);
  });
  return issues;
}

const TOKEN = /\{\{([^}]*)\}\}/g;
const VALID_TOKEN_ID = /^b[1-9]\d*$/;
const FORBIDDEN = ["*", "/", ":"];

/**
 * Each blank's answers must occur in the evidence that blank cites; the whole context's evidence is not
 * enough. `evidenceTextFor` returns one quote per cited evidence id, and grounding is checked against
 * each quote on its own — quotes are never joined — so an answer cannot be satisfied by text that spans
 * the boundary between two cited quotes. Matching is whole-word: the normalised answer is looked up as a
 * space-delimited phrase inside the space-padded, normalised quote, so "lock" cannot match inside "lockout".
 */
export function checkBlanks(out: BlanksOut, evidenceTextFor: (evidenceIds: string[]) => string[]): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.taskDescription, "taskDescription")];
  if (out.blanks.length < 1 || out.blanks.length > 5) issues.push("between 1 and 5 blanks are required");
  if (out.passage.includes("*")) issues.push("passage must not contain *");
  const counts = new Map<string, number>();
  for (const m of out.passage.matchAll(TOKEN)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  out.blanks.forEach((_, i) => { const id = `b${i + 1}`; const n = counts.get(id) ?? 0; if (n !== 1) issues.push(`token {{${id}}} must appear exactly once`); });
  for (const id of counts.keys()) {
    const index = VALID_TOKEN_ID.test(id) ? Number(id.slice(1)) : null;
    if (index === null || index > out.blanks.length) issues.push(`unexpected token {{${id}}}`);
  }
  const words = out.passage.replace(TOKEN, " ").split(/\s+/).filter(Boolean);
  if (words.length < 8) issues.push("passage needs at least 8 words around the blanks");
  out.blanks.forEach((b, i) => {
    if (b.answers.length === 0) issues.push(`blank ${i + 1} has no answers`);
    if (b.evidenceIds.length === 0) { issues.push(`blank ${i + 1} cites no evidence`); return; }
    const quotes = evidenceTextFor(b.evidenceIds).map((quote) => ` ${normaliseText(quote)} `);
    for (const a of b.answers) {
      if (FORBIDDEN.some((ch) => a.includes(ch))) issues.push(`blank ${i + 1} answer contains a forbidden character (* / :)`);
      else if (!quotes.some((quote) => quote.includes(` ${normaliseText(a)} `))) issues.push(`blank ${i + 1} answer "${a}" does not occur in the evidence it cites`);
    }
    if (b.tip !== null && FORBIDDEN.some((ch) => b.tip!.includes(ch))) issues.push(`blank ${i + 1} tip contains a forbidden character (* / :)`);
  });
  return issues;
}

export function checkFlashcards(out: FlashcardsOut, min: number, max: number): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.description, "description")];
  if (out.cards.length < min || out.cards.length > max) issues.push(`between ${min} and ${max} cards are required`);
  const fronts = new Set<string>();
  out.cards.forEach((c, i) => {
    issues.push(...checkPlainText(c.front, `card ${i + 1} front`), ...checkPlainText(c.back, `card ${i + 1} back`));
    const f = normaliseText(c.front);
    if (fronts.has(f)) issues.push(`card ${i + 1} duplicates another card's front`);
    fronts.add(f);
    if (f === normaliseText(c.back)) issues.push(`card ${i + 1} back must differ from its front`);
  });
  return issues;
}
