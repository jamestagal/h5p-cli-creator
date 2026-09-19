import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, type ConceptMap } from "@leaplearn/shared";
import { createProducers, evidenceBlock, toBlanksSpec, tryConvert } from "../src/produce/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { BlanksOut } from "../src/schemas/model-output.js";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [
  { evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 50, quote: "Only the worker who applied a lock may remove it." },
  { evidenceId: "ev-s2", sentenceId: "s2", charStart: 51, charEnd: 101, quote: "A tag names the worker, the date and the reason." }
] }] };
const input = { plan: { activityId: "act-4", slot: 1, type: "blanks" as const, conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who removes a lock" }, map, unit: null, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", existing: { questions: [], passages: [], fronts: [] }, rules: DEFAULT_PLAN_RULES };
const mk = (script: ReturnType<typeof fakeResponse>[]) => { const provider = new FakeProvider(script); return { provider, runner: createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-act-4", sleep: async () => undefined }) }; };

const good = {
  title: "Locks and tags", taskDescription: "Complete the sentences about lockout and tagout.",
  passage: "Only the {{b1}} who applied a lock may remove it. A tag names the worker, the {{b2}} and the reason for the isolation.",
  blanks: [{ answers: ["worker"], tip: "the person, not the role", evidenceIds: ["ev-s1"] }, { answers: ["date"], tip: null, evidenceIds: ["ev-s2"] }]
};

describe("blanks producer", () => {
  it("converts to a BlanksSpec with positional blank ids, derived item provenance, the evidence union on the activity, and an escaped task description", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry });
    expect(produced.spec.type).toBe("blanks");
    if (produced.spec.type !== "blanks") return;
    expect(produced.spec.taskDescription).toBe("Complete the sentences about lockout and tagout."); // the engine's blanks handler wraps it in <p>
    expect(produced.spec.blanks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(produced.spec.blanks[0]).toEqual({ id: "b1", answers: ["worker"], tip: "the person, not the role", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.blanks[1]).not.toHaveProperty("tip");
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] });
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    expect(provider.requests[0]).not.toHaveProperty("temperature");
  });

  it("rejects an answer that is not in the evidence its own blank cites, and a passage with *", async () => {
    const ungrounded = { ...good, blanks: [{ ...good.blanks[0]!, answers: ["electrician"] }, good.blanks[1]!] };
    const wrongSentence = { ...good, blanks: [{ ...good.blanks[0]!, answers: ["date"] }, good.blanks[1]!] }; // "date" is in ev-s2, but blank 1 cites ev-s1
    const star = { ...good, passage: good.passage.replace("A tag", "A 5* tag") };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(ungrounded) }), fakeResponse({ outputText: JSON.stringify(wrongSentence) }), fakeResponse({ outputText: JSON.stringify(star) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    await expect(createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry })).rejects.toMatchObject({ name: "ContentFailure", attempts: 3 });
    expect(provider.requests[1]?.user).toContain('blank 1 answer "electrician" does not occur in the evidence it cites');
    expect(provider.requests[2]?.user).toContain('blank 1 answer "date" does not occur in the evidence it cites');
    expect(provider.requests).toHaveLength(3);
  });

  it("rejects an answer that only forms by joining two cited sentences, never within either sentence alone", async () => {
    // "remove it a tag" only exists once ev-s1 and ev-s2 are joined into one string; per-quote grounding
    // (evidenceQuotesFor, not evidenceTextFor) must check each cited quote on its own and reject it.
    const spanning = { ...good, blanks: [{ answers: ["remove it a tag"], tip: null, evidenceIds: ["ev-s1", "ev-s2"] }, good.blanks[1]!] };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(spanning) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry });
    expect(provider.requests[1]?.user).toContain('blank 1 answer "remove it a tag" does not occur in the evidence it cites');
    if (produced.spec.type === "blanks") expect(produced.spec.blanks[0]!.answers).toEqual(["worker"]);
  });

  it("derives each blank's criteria from the concept its evidence belongs to", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 145, quote: "Test for dead at the point of work every time." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const twoConcepts = { ...good, passage: "Only the {{b1}} who applied a lock may remove it. Test for dead at the {{b2}} of work every time.", blanks: [good.blanks[0]!, { answers: ["point"], tip: null, evidenceIds: ["ev-s3"] }] };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(twoConcepts) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, map: aligned, plan: { ...input.plan, activityId: "act-4", type: "blanks", conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    if (produced.spec.type !== "blanks") throw new Error("type");
    expect(produced.spec.blanks[0]!.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.blanks[1]!.provenance).toEqual({ conceptIds: ["c2"], evidenceIds: ["ev-s3"], criteriaIds: ["PC2.2"] });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1", "c2"], evidenceIds: ["ev-s1", "ev-s3"], criteriaIds: ["PC2.1", "PC2.2"] });
  });

  it("converts an assertGeneratedProvenance failure raised during conversion into a `provenance: ...` reason instead of throwing", () => {
    // checkBlanks already rejects a blank with no cited evidence before conversion is ever attempted
    // in the live produce() flow, so this exercises tryConvert directly with a converter that raises
    // the same plain Error assertGeneratedProvenance throws (see @leaplearn/shared's activities/index.ts).
    const block = evidenceBlock(map, ["c1"]);
    const noEvidence: BlanksOut = { ...good, blanks: [{ ...good.blanks[0]!, evidenceIds: [] }, good.blanks[1]!] };
    const converted = tryConvert(() => toBlanksSpec(noEvidence, input, block));
    expect(converted).toHaveProperty("issues");
    if (!("issues" in converted)) throw new Error("expected issues");
    expect(converted.issues).toHaveLength(1);
    expect(converted.issues[0]).toMatch(/^provenance: item b1 in activity act-4 has no evidence provenance$/);
  });
});
