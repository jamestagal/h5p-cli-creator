import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestMarkdown, ingestText } from "../src/ingest/index.js";
import { alignConcepts, chunkSentences, extractConceptMap, MAX_ALIGN_QUOTES, verifyEvidence, evidenceForSentence } from "../src/concepts/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { criteriaOf, type Concept, type UnitOfCompetency } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";
import type { SourceDocument } from "../src/ingest/index.js";
import { SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");
const sid = (doc: SourceDocument, startsWith: string): string => { const s = doc.sentences.find((x) => x.text.startsWith(startsWith)); if (!s) throw new Error(`no sentence starting "${startsWith}"`); return s.sentenceId; };
const unit: UnitOfCompetency = {
  code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "0".repeat(64), knowledgeEvidence: [], performanceEvidence: [],
  elements: [
    { id: "E1", number: "1", text: "Prepare", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Identify hazards" }, { id: "PC1.2", number: "1.2", text: "Confirm every supply" }] },
    { id: "E2", number: "2", text: "Isolate", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout" }, { id: "PC2.2", number: "2.2", text: "Test for dead" }] },
    { id: "E3", number: "3", text: "Restore", performanceCriteria: [{ id: "PC3.1", number: "3.1", text: "Remove locks in sequence" }, { id: "PC3.2", number: "3.2", text: "Complete an incident report" }, { id: "PC3.3", number: "3.3", text: "Confirm guards refitted" }] }
  ]
};

describe("chunking and evidence", () => {
  it("chunks on sentence boundaries within the token budget and puts the boundary between 'test for dead' sentences", async () => {
    const doc = await ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src" });
    const chunks = chunkSentences(doc.sentences, SYNTHETIC_CHUNK_TOKENS);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.estimatedTokens).toBeLessThanOrEqual(SYNTHETIC_CHUNK_TOKENS + 200);
    const a = sid(doc, "After the isolator is opened and locked");
    const b = sid(doc, "Testing for dead confirms");
    const chunkOf = (id: string) => chunks.findIndex((c) => c.sentences.some((s) => s.sentenceId === id));
    expect(chunkOf(a)).not.toBe(chunkOf(b));
    expect(chunkOf(b)).toBe(chunkOf(a) + 1);
  });
  it("builds evidence from a sentence and verifies quotes against offsets", async () => {
    const doc = await ingestMarkdown("Lock it out. Test for dead.", { sourceId: "src" });
    const ev = evidenceForSentence(doc, "s2");
    expect(ev).toEqual({ evidenceId: "ev-s2", sentenceId: "s2", charStart: 13, charEnd: 27, quote: "Test for dead." });
    expect(verifyEvidence(doc.text, ev)).toBeNull();
    expect(verifyEvidence(doc.text, { ...ev, quote: "Test for dead!" })).toMatch(/quote does not match/);
  });
});

describe("extractConceptMap", () => {
  it("extracts per chunk, merges the repeated concept, keeps cross-chunk evidence, and aligns with unsupported criteria", async () => {
    const doc = await ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src" });
    const chunks = chunkSentences(doc.sentences, SYNTHETIC_CHUNK_TOKENS);
    const lotoEarly = sid(doc, "Lockout and tagout is the method");
    const lotoTag = sid(doc, "A tag is a warning label");
    const lotoRemove = sid(doc, "Only the worker who applied a lock may remove it");
    const lotoLate = sid(doc, "Lockout and tagout ends when the permit is closed");
    const tfdA = sid(doc, "After the isolator is opened and locked");
    const tfdB = sid(doc, "Testing for dead confirms");
    const hazards = sid(doc, "Typical hazards are damaged insulation");
    const inChunk = (i: number, ids: string[]) => ids.filter((id) => chunks[i]!.sentences.some((s) => s.sentenceId === id));
    // one ConceptsOut per chunk, built from the real sentence ids so the fixture never drifts
    const perChunk = chunks.map((_, i) => {
      const concepts: Array<{ name: string; summary: string; sentenceIds: string[] }> = [];
      const loto = inChunk(i, [lotoEarly, lotoTag, lotoRemove, lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", sentenceIds: loto });
      const tfd = inChunk(i, [tfdA, tfdB]); if (tfd.length) concepts.push({ name: "Testing for dead", summary: "Prove the tester, test every pair, record the result.", sentenceIds: tfd });
      const hz = inChunk(i, [hazards]); if (hz.length) concepts.push({ name: "Hazard identification", summary: "Inspect for damaged insulation, moisture, stored energy, multiple supplies.", sentenceIds: hz });
      if (concepts.length === 0) concepts.push({ name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", sentenceIds: [chunks[i]!.sentences[0]!.sentenceId] });
      return concepts;
    });
    const tempIds = perChunk.flatMap((cs, i) => cs.map((_, j) => `k${i}-${j}`));
    const byName = (name: string) => perChunk.flatMap((cs, i) => cs.map((c, j) => ({ c, id: `k${i}-${j}` }))).filter((x) => x.c.name === name).map((x) => x.id);
    const mergeOut = { concepts: [
      { name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated until the permit closes.", memberIds: byName("Lockout and tagout") },
      { name: "Testing for dead", summary: "Prove the tester before and after; test every pair; record it.", memberIds: byName("Testing for dead") },
      { name: "Hazard identification", summary: "Inspect and record hazards on the permit.", memberIds: byName("Hazard identification") },
      { name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", memberIds: byName("Personal protective equipment") }
    ].filter((c) => c.memberIds.length > 0) };
    expect(new Set(mergeOut.concepts.flatMap((c) => c.memberIds)).size).toBe(tempIds.length);
    const alignOut = { criteria: [
      { criterionId: "PC1.1", conceptIds: ["c3"] }, { criterionId: "PC1.2", conceptIds: ["c3"] }, { criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] },
      { criterionId: "PC3.1", conceptIds: ["c1"] }, { criterionId: "PC3.2", conceptIds: [] }, { criterionId: "PC3.3", conceptIds: ["c1"] }
    ] };
    const script = [...perChunk.map((c) => fakeResponse({ outputText: JSON.stringify({ concepts: c }) })), fakeResponse({ outputText: JSON.stringify(mergeOut) }), fakeResponse({ outputText: JSON.stringify(alignOut) })];
    const provider = new FakeProvider(script);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-concepts", sleep: async () => undefined });

    const map = await extractConceptMap(doc, unit, runner, { chunkTokens: SYNTHETIC_CHUNK_TOKENS });
    expect(map.textHash).toBe(doc.textHash);
    expect(map.concepts.map((c) => c.conceptId)).toEqual(["c1", "c2", "c3", "c4"].slice(0, map.concepts.length));
    const loto = map.concepts.find((c) => c.name === "Lockout and tagout")!;
    expect(loto.evidence.map((e) => e.sentenceId).sort()).toEqual([lotoEarly, lotoTag, lotoRemove, lotoLate].sort());
    const tfd = map.concepts.find((c) => c.name === "Testing for dead")!;
    expect(tfd.evidence.map((e) => e.sentenceId).sort()).toEqual([tfdA, tfdB].sort());
    for (const c of map.concepts) for (const e of c.evidence) expect(doc.text.slice(e.charStart, e.charEnd)).toBe(e.quote);
    expect(map.alignment?.unsupportedCriteriaIds).toEqual(["PC3.2"]);
    expect(map.alignment?.criteria.map((c) => c.criterionId)).toEqual(criteriaOf(unit).map((c) => c.id));
    expect(provider.requests.map((r) => r.purpose)).toEqual([...chunks.map(() => "extract"), "merge", "align"]);
    expect(provider.requests[0]?.user).toMatch(/\[s\d+\] /);
    const alignRequest = provider.requests.at(-1)!;
    expect(alignRequest.user).toContain(doc.sentences.find((s) => s.sentenceId === lotoEarly)!.text); // the alignment judges support from the evidence itself
    expect(alignRequest.user).toContain(`[ev-${tfdB}]`);
  });
  it("rejects sentence ids outside the chunk as a content failure with feedback", async () => {
    const doc = await ingestMarkdown("One sentence here. Second sentence here.", { sourceId: "src" });
    const bad = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "x", summary: "y", sentenceIds: ["s99"] }] }) });
    const provider = new FakeProvider([bad, bad, bad]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op", sleep: async () => undefined });
    await expect(extractConceptMap(doc, null, runner, { chunkTokens: 6000 })).rejects.toMatchObject({ name: "ContentFailure" });
    expect(provider.requests[1]?.user).toContain("s99");
  });
  it("skips the merge call for a single chunk and numbers concepts c1... in encounter order", async () => {
    const doc = await ingestText("Sentence one here. Sentence two here.", { sourceId: "src" });
    const s1 = sid(doc, "Sentence one");
    const s2 = sid(doc, "Sentence two");
    const out = { concepts: [
      { name: "First idea", summary: "About sentence one.", sentenceIds: [s1] },
      { name: "Second idea", summary: "About sentence two.", sentenceIds: [s2] }
    ] };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(out) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-single", sleep: async () => undefined });
    const map = await extractConceptMap(doc, null, runner, { chunkTokens: 6000 });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.purpose).toBe("extract");
    expect(map.concepts.map((c) => c.conceptId)).toEqual(["c1", "c2"]);
  });
  it("omits the alignment key entirely when no unit is supplied", async () => {
    const doc = await ingestText("Only sentence here.", { sourceId: "src" });
    const s1 = sid(doc, "Only sentence");
    const out = { concepts: [{ name: "Idea", summary: "About the sentence.", sentenceIds: [s1] }] };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(out) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-no-unit", sleep: async () => undefined });
    const map = await extractConceptMap(doc, null, runner, { chunkTokens: 6000 });
    expect("alignment" in map).toBe(false);
  });
  it("rejects a merge reply that adds an extra members-less concept as a content failure", async () => {
    const doc = await ingestText("Sentence one here. Sentence two here.", { sourceId: "src" });
    const s1 = sid(doc, "Sentence one");
    const s2 = sid(doc, "Sentence two");
    const extract1 = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "First idea", summary: "About sentence one.", sentenceIds: [s1] }] }) });
    const extract2 = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "Second idea", summary: "About sentence two.", sentenceIds: [s2] }] }) });
    const badMerge = fakeResponse({ outputText: JSON.stringify({ concepts: [
      { name: "First idea", summary: "About sentence one.", memberIds: ["k0-0"] },
      { name: "Second idea", summary: "About sentence two.", memberIds: ["k1-0"] },
      { name: "Extra empty concept", summary: "Should not exist.", memberIds: [] }
    ] }) });
    const provider = new FakeProvider([extract1, extract2, badMerge, badMerge, badMerge]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-merge-bad", sleep: async () => undefined });
    await expect(extractConceptMap(doc, null, runner, { chunkTokens: 10 })).rejects.toMatchObject({ name: "ContentFailure", reasons: expect.arrayContaining([expect.stringContaining("Extra empty concept")]) });
  });
  it("rejects an extract reply with an empty summary as a content failure", async () => {
    const doc = await ingestText("Only sentence here.", { sourceId: "src" });
    const s1 = sid(doc, "Only sentence");
    const bad = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "Idea", summary: "", sentenceIds: [s1] }] }) });
    const provider = new FakeProvider([bad, bad, bad]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-extract-bad", sleep: async () => undefined });
    await expect(extractConceptMap(doc, null, runner, { chunkTokens: 6000 })).rejects.toMatchObject({ name: "ContentFailure", reasons: expect.arrayContaining([expect.stringContaining("summary")]) });
  });
});

describe("alignConcepts evidence quotes", () => {
  it("shows at most MAX_ALIGN_QUOTES evidence quotes per concept and counts the remainder", async () => {
    const doc = await ingestText(Array.from({ length: 10 }, (_, i) => `Sentence number ${i + 1} here.`).join(" "), { sourceId: "src" });
    expect(doc.sentences).toHaveLength(10);
    const evidence = doc.sentences.map((s) => evidenceForSentence(doc, s.sentenceId));
    const concept: Concept = { conceptId: "c1", name: "Many sentences", summary: "Ten sentences of evidence.", evidence };
    const soloUnit: UnitOfCompetency = {
      code: "TESTU", title: "Test unit", textHash: "1".repeat(64), knowledgeEvidence: [], performanceEvidence: [],
      elements: [{ id: "E1", number: "1", text: "Element", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Some criterion" }] }]
    };
    const alignOut = { criteria: [{ criterionId: "PC1.1", conceptIds: ["c1"] }] };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(alignOut) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-align-quotes", sleep: async () => undefined });
    await alignConcepts([concept], soloUnit, runner);
    const request = provider.requests[0]!;
    const quoteLines = request.user.match(/\[ev-/g) ?? [];
    expect(quoteLines).toHaveLength(MAX_ALIGN_QUOTES);
    expect(request.user).toContain(`(${evidence.length - MAX_ALIGN_QUOTES} more sentences not shown)`);
  });
});
