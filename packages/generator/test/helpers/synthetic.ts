import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceDocument } from "../../src/ingest/index.js";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { chunkSentences } from "../../src/concepts/chunk.js";
import { fakeResponse } from "../../src/llm/fake-provider.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart, ModelResponse } from "../../src/llm/types.js";

export const fixtures = resolve(import.meta.dirname, "../fixtures/synthetic");

/** Test chunk budget for the synthetic electrical-safety fixture (see fixtures/synthetic/README.md). Single-sourced so the value never drifts between test files. */
export const SYNTHETIC_CHUNK_TOKENS = 330;

export class MemoryRecorder implements AttemptRecorder {
  events: AttemptEvent[] = [];
  async recordStart(e: AttemptStart) { this.events.push(e); }
  async recordOutcome(e: AttemptOutcome) { this.events.push(e); }
}

export async function syntheticDoc(): Promise<SourceDocument> {
  return ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src-synthetic" });
}
export async function syntheticUnitText(): Promise<string> { return readFile(resolve(fixtures, "unit-synele001.txt"), "utf8"); }

export function sid(doc: SourceDocument, startsWith: string): string {
  const s = doc.sentences.find((x) => x.text.startsWith(startsWith));
  if (!s) throw new Error(`no sentence starting "${startsWith}"`);
  return s.sentenceId;
}

/**
 * The ids of the one run of contiguous sentences whose texts, joined with single spaces, are exactly `passage`. In PDF
 * text a line wrap ends a segment mid-sentence, so a complete supporting passage can span several ids. Throws when no
 * run matches (missing continuation text) or more than one does (ambiguous).
 */
export function passageIds(doc: SourceDocument, passage: string): string[] {
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  const target = flat(passage);
  const runs: string[][] = [];
  for (let i = 0; i < doc.sentences.length; i++) {
    let joined = "";
    for (let j = i; j < doc.sentences.length; j++) {
      joined = joined === "" ? flat(doc.sentences[j]!.text) : `${joined} ${flat(doc.sentences[j]!.text)}`;
      if (joined === target) { runs.push(doc.sentences.slice(i, j + 1).map((x) => x.sentenceId)); break; }
      if (!target.startsWith(joined)) break;
    }
  }
  if (runs.length !== 1) throw new Error(`${runs.length === 0 ? "no" : `${runs.length}`} contiguous sentence run${runs.length === 1 ? "" : "s"} with the text "${passage}"`);
  return runs[0]!;
}

/** The evidence the fake concept and produce responses cite, as sentence ids per supporting passage. */
export interface FixtureEvidence { lotoEarly: string[]; lotoTag: string[]; lotoRemove: string[]; lotoLate: string[]; tfdA: string[]; tfdB: string[]; hazards: string[]; rto: string[] }

/** The complete supporting passages, as they appear in the synthetic source. */
export const EVIDENCE_PASSAGES: Record<keyof FixtureEvidence, string> = {
  lotoEarly: "Lockout and tagout is the method used to keep isolated equipment isolated.",
  lotoTag: "A tag is a warning label attached to the lockout device that names the worker, the date and the reason for the isolation.",
  lotoRemove: "Only the worker who applied a lock may remove it.",
  lotoLate: "Lockout and tagout ends when the permit is closed, never before.",
  tfdA: "After the isolator is opened and locked, the worker must test for dead at the point of work using a voltage tester rated for the circuit.",
  tfdB: "Testing for dead confirms that the conductors to be worked on carry no voltage.",
  hazards: "Typical hazards are damaged insulation, exposed conductors, moisture near live parts, stored energy in capacitors, and equipment fed from more than one supply.",
  rto: "Assessment for this unit is conducted in your workplace only; there is no simulated option."
};

/** Markdown: each passage is one sentence, found by its opening words (the ids every existing fixture has always used). */
export function markdownEvidence(doc: SourceDocument): FixtureEvidence {
  return {
    lotoEarly: [sid(doc, "Lockout and tagout is the method")], lotoTag: [sid(doc, "A tag is a warning label")], lotoRemove: [sid(doc, "Only the worker who applied a lock may remove it")],
    lotoLate: [sid(doc, "Lockout and tagout ends when the permit is closed")], tfdA: [sid(doc, "After the isolator is opened and locked")], tfdB: [sid(doc, "Testing for dead confirms")],
    hazards: [sid(doc, "Typical hazards are damaged insulation")], rto: [sid(doc, "Assessment for this unit is conducted in your workplace only")]
  };
}

/** PDF: each passage is the unique contiguous run of sentence ids that spells it out in full. */
export function passageEvidence(doc: SourceDocument): FixtureEvidence {
  return Object.fromEntries(Object.entries(EVIDENCE_PASSAGES).map(([key, passage]) => [key, passageIds(doc, passage)])) as unknown as FixtureEvidence;
}

/** Synthetic model output for unit-synele001.txt, authored by hand (Task 7). */
export const unitOut = {
  code: "SYNELE001", title: "Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)",
  elements: [
    { number: "1", text: "Prepare to isolate equipment", performanceCriteria: [{ number: "1.1", text: "Identify electrical hazards in the work area and record them on the isolation permit" }, { number: "1.2", text: "Confirm every supply to the equipment, including secondary supplies" }] },
    { number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ number: "2.1", text: "Apply lockout devices and tags in accordance with site procedure" }, { number: "2.2", text: "Test for dead using a proved voltage tester" }] },
    { number: "3", text: "Restore supply", performanceCriteria: [{ number: "3.1", text: "Remove locks and tags in the correct sequence after work is complete" }, { number: "3.2", text: "Complete an incident report for any breach of isolation" }, { number: "3.3", text: "Confirm guards and covers are refitted before supply is restored" }] }
  ],
  knowledgeEvidence: [
    { index: 0, parentIndex: null, text: "types of electrical hazards including stored energy and multiple supplies" },
    { index: 1, parentIndex: null, text: "purpose of lockout devices and tags, including:" },
    { index: 2, parentIndex: 1, text: "personal padlocks that only the applying worker may remove" },
    { index: 3, parentIndex: 1, text: "multi-lock hasps used when several workers share an isolation point" }
  ],
  performanceEvidence: ["isolate and test at least one item of equipment fed from two supplies"],
  assessmentConditions: "Skills must be demonstrated in the workplace or in a simulated environment that reflects workplace conditions. Assessment must include access to a voltage tester and lockout devices.",
  release: "Release 1"
};

type FakeConcept = { name: string; summary: string; kind: "content" | "rto-instruction"; sentenceIds: string[] };

/**
 * One extract response per chunk plus merge (when there is more than one chunk) and align responses, built from the
 * real sentence ids so the fixture never drifts (Task 8). Since Task 10 every concept has a kind: the RTO-instructions
 * passage becomes an `rto-instruction` concept, merged last, never aligned or planned; the alignment covers every
 * performance criterion and every Knowledge Evidence node, with KE2.2 unsupported.
 */
export function conceptResponses(doc: SourceDocument, evidence: FixtureEvidence = markdownEvidence(doc), chunkTokens = SYNTHETIC_CHUNK_TOKENS): { perChunk: FakeConcept[][]; mergeOut: { concepts: Array<{ name: string; summary: string; memberIds: string[] }> }; alignOut: { criteria: Array<{ criterionId: string; conceptIds: string[] }> }; script: ReturnType<typeof fakeResponse>[] } {
  const chunks = chunkSentences(doc.sentences, chunkTokens);
  const { lotoEarly, lotoTag, lotoRemove, lotoLate, tfdA, tfdB, hazards, rto } = evidence;
  const inChunk = (i: number, ids: string[]) => ids.filter((id) => chunks[i]!.sentences.some((s) => s.sentenceId === id));
  const perChunk = chunks.map((_, i) => {
    const concepts: FakeConcept[] = [];
    const loto = inChunk(i, [...lotoEarly, ...lotoTag, ...lotoRemove, ...lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", kind: "content", sentenceIds: loto });
    const tfd = inChunk(i, [...tfdA, ...tfdB]); if (tfd.length) concepts.push({ name: "Testing for dead", summary: "Prove the tester, test every pair, record the result.", kind: "content", sentenceIds: tfd });
    const hz = inChunk(i, hazards); if (hz.length) concepts.push({ name: "Hazard identification", summary: "Inspect for damaged insulation, moisture, stored energy, multiple supplies.", kind: "content", sentenceIds: hz });
    const rt = inChunk(i, rto); if (rt.length) concepts.push({ name: "RTO assessment arrangements", summary: "This provider assesses the unit in the workplace only.", kind: "rto-instruction", sentenceIds: rt });
    if (concepts.length === 0) concepts.push({ name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", kind: "content", sentenceIds: [chunks[i]!.sentences[0]!.sentenceId] });
    return concepts;
  });
  const byName = (name: string) => perChunk.flatMap((cs, i) => cs.map((c, j) => ({ c, id: `k${i}-${j}` }))).filter((x) => x.c.name === name).map((x) => x.id);
  const mergeOut = { concepts: [
    { name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated until the permit closes.", memberIds: byName("Lockout and tagout") },
    { name: "Testing for dead", summary: "Prove the tester before and after; test every pair; record it.", memberIds: byName("Testing for dead") },
    { name: "Hazard identification", summary: "Inspect and record hazards on the permit.", memberIds: byName("Hazard identification") },
    { name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", memberIds: byName("Personal protective equipment") },
    { name: "RTO assessment arrangements", summary: "This provider assesses the unit in the workplace only.", memberIds: byName("RTO assessment arrangements") }
  ].filter((c) => c.memberIds.length > 0) };
  const alignOut = { criteria: [
    { criterionId: "PC1.1", conceptIds: ["c3"] }, { criterionId: "PC1.2", conceptIds: ["c3"] }, { criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] },
    { criterionId: "PC3.1", conceptIds: ["c1"] }, { criterionId: "PC3.2", conceptIds: [] }, { criterionId: "PC3.3", conceptIds: ["c1"] },
    { criterionId: "KE1", conceptIds: ["c3"] }, { criterionId: "KE2", conceptIds: ["c1"] }, { criterionId: "KE2.1", conceptIds: ["c1"] }, { criterionId: "KE2.2", conceptIds: [] }
  ] };
  const merge = chunks.length > 1 ? [fakeResponse({ outputText: JSON.stringify(mergeOut) })] : [];
  const script = [...perChunk.map((c) => fakeResponse({ outputText: JSON.stringify({ concepts: c }) })), ...merge, fakeResponse({ outputText: JSON.stringify(alignOut) })];
  return { perChunk, mergeOut, alignOut, script };
}

type FixtureType = "multiChoice" | "blanks" | "flashcards";

/**
 * One plan entry per requested slot, allocating the concepts each produce fixture actually cites:
 * the first multiChoice slot targets c1 (the `mc` fixture cites lockout evidence), a second
 * multiChoice slot targets c2 (`mc2` cites testing-for-dead evidence), blanks targets c2 (`bl` is
 * grounded in the testing-for-dead sentences) and flashcards takes both. Focus strings stay
 * positional so routed providers can tell activities apart.
 */
export const planOutFor = (types: FixtureType[]) => {
  const conceptsFor = (type: FixtureType, multiChoiceIndex: number): string[] => {
    if (type === "flashcards") return ["c1", "c2"];
    if (type === "blanks") return ["c2"];
    return multiChoiceIndex === 0 ? ["c1"] : ["c2"];
  };
  const criteriaFor = (conceptIds: string[]): string[] => conceptIds.map((id) => (id === "c1" ? "PC2.1" : "PC2.2"));
  let multiChoiceSeen = 0;
  return { activities: types.map((type, i) => {
    const conceptIds = conceptsFor(type, type === "multiChoice" ? multiChoiceSeen++ : 0);
    return { slot: i + 1, type, conceptIds, criteriaIds: criteriaFor(conceptIds), focus: `${type} focus ${i + 1}` };
  }) };
};

/** Produce fixtures cite only evidence that belongs to the concept each plan slot targets (planOutFor: multiChoice → c1, a second multiChoice → c2, blanks → c2, flashcards → c1 + c2). */
export function produceResponses(doc: SourceDocument, evidence: FixtureEvidence = markdownEvidence(doc)) {
  const ev = (ids: string[]) => ids.map((id) => `ev-${id}`);
  const remove = ev(evidence.lotoRemove);   // concept c1 (lockout and tagout)
  const tag = ev(evidence.lotoTag);         // concept c1
  const tfdA = ev(evidence.tfdA);           // concept c2 (testing for dead)
  const tfdB = ev(evidence.tfdB);           // concept c2
  const mc = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The site electrician", correct: false, feedback: "" }], evidenceIds: remove };
  const mc2 = { title: "Testing for dead", question: "What does testing for dead confirm before work starts?", answers: [{ text: "That the conductors carry no voltage", correct: true, feedback: "Testing for dead confirms that the conductors to be worked on carry no voltage." }, { text: "That the permit is closed", correct: false, feedback: "" }, { text: "That the tag has been removed", correct: false, feedback: "" }], evidenceIds: tfdB };
  const bl = { title: "Testing for dead", taskDescription: "Complete the sentences about testing for dead.", passage: "After the isolator is opened and locked, the worker must test for {{b1}} at the point of work using a voltage tester rated for the circuit. Testing for dead confirms that the conductors to be worked on carry no {{b2}}.", blanks: [{ answers: ["dead"], tip: null, evidenceIds: tfdA }, { answers: ["voltage"], tip: null, evidenceIds: tfdB }] };
  const fc = { title: "Key terms", description: "Isolation vocabulary.", cards: [{ front: "Who may remove a lock", back: "Only the worker who applied it", tip: null, evidenceIds: remove }, { front: "Tag", back: "A warning label attached to the lockout device naming the worker, the date and the reason", tip: null, evidenceIds: tag }, { front: "When to test for dead", back: "After the isolator is opened and locked, at the point of work, with a tester rated for the circuit", tip: null, evidenceIds: tfdA }, { front: "What testing for dead confirms", back: "That the conductors to be worked on carry no voltage", tip: null, evidenceIds: tfdB }] };
  return { mc, mc2, bl, fc };
}

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
/** Typed as the provider script union so tests can splice a ProviderError into it. */
export async function fullScript(doc: SourceDocument, evidence: FixtureEvidence = markdownEvidence(doc)): Promise<Array<ModelResponse | Error>> {
  const { script } = conceptResponses(doc, evidence);
  const { mc, bl, fc } = produceResponses(doc, evidence);
  return [r(unitOut), ...script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
}
