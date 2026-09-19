import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceDocument } from "../../src/ingest/index.js";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { chunkSentences } from "../../src/concepts/chunk.js";
import { fakeResponse } from "../../src/llm/fake-provider.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart } from "../../src/llm/types.js";

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

/** Synthetic model output for unit-synele001.txt, authored by hand (Task 7). */
export const unitOut = {
  code: "SYNELE001", title: "Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)",
  elements: [
    { number: "1", text: "Prepare to isolate equipment", performanceCriteria: [{ number: "1.1", text: "Identify electrical hazards in the work area and record them on the isolation permit" }, { number: "1.2", text: "Confirm every supply to the equipment, including secondary supplies" }] },
    { number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ number: "2.1", text: "Apply lockout devices and tags in accordance with site procedure" }, { number: "2.2", text: "Test for dead using a proved voltage tester" }] },
    { number: "3", text: "Restore supply", performanceCriteria: [{ number: "3.1", text: "Remove locks and tags in the correct sequence after work is complete" }, { number: "3.2", text: "Complete an incident report for any breach of isolation" }, { number: "3.3", text: "Confirm guards and covers are refitted before supply is restored" }] }
  ],
  knowledgeEvidence: ["types of electrical hazards including stored energy and multiple supplies", "purpose of lockout devices and tags"],
  performanceEvidence: ["isolate and test at least one item of equipment fed from two supplies"]
};

/** One extract response per chunk plus merge and align responses, built from the real sentence ids so the fixture never drifts (Task 8). */
export function conceptResponses(doc: SourceDocument): { perChunk: Array<Array<{ name: string; summary: string; sentenceIds: string[] }>>; mergeOut: { concepts: Array<{ name: string; summary: string; memberIds: string[] }> }; alignOut: { criteria: Array<{ criterionId: string; conceptIds: string[] }> }; script: ReturnType<typeof fakeResponse>[] } {
  const chunks = chunkSentences(doc.sentences, SYNTHETIC_CHUNK_TOKENS);
  const lotoEarly = sid(doc, "Lockout and tagout is the method");
  const lotoTag = sid(doc, "A tag is a warning label");
  const lotoRemove = sid(doc, "Only the worker who applied a lock may remove it");
  const lotoLate = sid(doc, "Lockout and tagout ends when the permit is closed");
  const tfdA = sid(doc, "After the isolator is opened and locked");
  const tfdB = sid(doc, "Testing for dead confirms");
  const hazards = sid(doc, "Typical hazards are damaged insulation");
  const inChunk = (i: number, ids: string[]) => ids.filter((id) => chunks[i]!.sentences.some((s) => s.sentenceId === id));
  const perChunk = chunks.map((_, i) => {
    const concepts: Array<{ name: string; summary: string; sentenceIds: string[] }> = [];
    const loto = inChunk(i, [lotoEarly, lotoTag, lotoRemove, lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", sentenceIds: loto });
    const tfd = inChunk(i, [tfdA, tfdB]); if (tfd.length) concepts.push({ name: "Testing for dead", summary: "Prove the tester, test every pair, record the result.", sentenceIds: tfd });
    const hz = inChunk(i, [hazards]); if (hz.length) concepts.push({ name: "Hazard identification", summary: "Inspect for damaged insulation, moisture, stored energy, multiple supplies.", sentenceIds: hz });
    if (concepts.length === 0) concepts.push({ name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", sentenceIds: [chunks[i]!.sentences[0]!.sentenceId] });
    return concepts;
  });
  const byName = (name: string) => perChunk.flatMap((cs, i) => cs.map((c, j) => ({ c, id: `k${i}-${j}` }))).filter((x) => x.c.name === name).map((x) => x.id);
  const mergeOut = { concepts: [
    { name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated until the permit closes.", memberIds: byName("Lockout and tagout") },
    { name: "Testing for dead", summary: "Prove the tester before and after; test every pair; record it.", memberIds: byName("Testing for dead") },
    { name: "Hazard identification", summary: "Inspect and record hazards on the permit.", memberIds: byName("Hazard identification") },
    { name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", memberIds: byName("Personal protective equipment") }
  ].filter((c) => c.memberIds.length > 0) };
  const alignOut = { criteria: [
    { criterionId: "PC1.1", conceptIds: ["c3"] }, { criterionId: "PC1.2", conceptIds: ["c3"] }, { criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] },
    { criterionId: "PC3.1", conceptIds: ["c1"] }, { criterionId: "PC3.2", conceptIds: [] }, { criterionId: "PC3.3", conceptIds: ["c1"] }
  ] };
  const script = [...perChunk.map((c) => fakeResponse({ outputText: JSON.stringify({ concepts: c }) })), fakeResponse({ outputText: JSON.stringify(mergeOut) }), fakeResponse({ outputText: JSON.stringify(alignOut) })];
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
