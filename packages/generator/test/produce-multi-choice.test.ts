import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, type ConceptMap } from "@leaplearn/shared";
import { createProducers, evidenceBlock, evidenceQuotesFor } from "../src/produce/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { DEFAULT_PROMPT_CONFIG, PROMPT_VERSION } from "../src/prompts/system.js";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [
  { evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 50, quote: "Only the worker who applied a lock may remove it." },
  { evidenceId: "ev-s2", sentenceId: "s2", charStart: 51, charEnd: 101, quote: "A tag names the worker, the date and the reason." }
] }] };
const input = { plan: { activityId: "act-1", slot: 1, type: "multiChoice" as const, conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who removes a lock" }, map, unit: null, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", existing: { questions: [], passages: [], fronts: [] }, rules: DEFAULT_PLAN_RULES };
const good = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The last person to leave", correct: false, feedback: "" }], evidenceIds: ["ev-s1"] };
const mk = (script: ReturnType<typeof fakeResponse>[]) => { const provider = new FakeProvider(script); return { provider, runner: createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-act-1", sleep: async () => undefined }) }; };

describe("multiChoice producer", () => {
  it("prompts with the cited evidence, converts to a spec with ids and provenance, and passes engine validation", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("multiChoice")!.produce(input, runner, { registry });
    expect(produced.spec).toMatchObject({ id: "act-1", type: "multiChoice", title: "Removing a lock", question: "<p>Who may remove a lockout device from an isolator?</p>", randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    if (produced.spec.type === "multiChoice") { expect(produced.spec.answers[0]).toEqual({ text: "The worker who applied it", correct: true, feedbackChosen: "Only the worker who applied a lock may remove it." }); expect(produced.spec.answers[1]).toEqual({ text: "Any supervisor", correct: false }); }
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    const req = provider.requests[0]!;
    expect(req.purpose).toBe("produce");
    expect(req).not.toHaveProperty("temperature");
    expect(req.cachedContext).toContain("[ev-s1] Only the worker who applied a lock may remove it.");
    expect(req.user).toContain("who removes a lock");
    expect(req.system).toContain("GROUNDING RULES");
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
  it("feeds quality and reference failures back and escapes the question", async () => {
    const twoCorrect = { ...good, answers: good.answers.map((a) => ({ ...a, correct: true })) };
    const unknownEvidence = { ...good, evidenceIds: ["ev-s9"] };
    const withAmp = { ...good, question: "Which rule applies to locks & tags?" };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(twoCorrect) }), fakeResponse({ outputText: JSON.stringify(unknownEvidence) }), fakeResponse({ outputText: JSON.stringify(withAmp) })]);
    const produced = await createProducers().get("multiChoice")!.produce(input, runner, { registry });
    expect(produced.attempts).toBe(3);
    expect(provider.requests[1]?.user).toContain("exactly one answer must be correct");
    expect(provider.requests[2]?.user).toContain("unknown evidence ev-s9");
    if (produced.spec.type === "multiChoice") expect(produced.spec.question).toBe("<p>Which rule applies to locks &amp; tags?</p>");
  });
  it("derives criteria from the alignment: a question citing only one concept's evidence keeps only that concept's criteria", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 120, quote: "Test for dead now." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("multiChoice")!.produce({ ...input, map: aligned, plan: { ...input.plan, conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
  });
  it("rejects a near-duplicate of an existing question in the import", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) }), fakeResponse({ outputText: JSON.stringify({ ...good, question: "What does a tag record?" }) })]);
    const produced = await createProducers().get("multiChoice")!.produce({ ...input, existing: { questions: ["who may remove a lockout device from an isolator"], passages: [], fronts: [] } }, runner, { registry });
    expect(provider.requests[1]?.user).toContain("near-duplicate");
    if (produced.spec.type === "multiChoice") expect(produced.spec.question).toContain("What does a tag record?");
  });
  it("evidenceQuotesFor returns one quote per cited id in cited order, skipping unknown ids", () => {
    const block = evidenceBlock(map, ["c1"]);
    expect(evidenceQuotesFor(block, ["ev-s2", "ev-unknown", "ev-s1"])).toEqual(["A tag names the worker, the date and the reason.", "Only the worker who applied a lock may remove it."]);
  });
});
