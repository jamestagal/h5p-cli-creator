import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, type ConceptMap } from "@leaplearn/shared";
import { createProducers } from "../src/produce/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [
  { evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 50, quote: "Only the worker who applied a lock may remove it." },
  { evidenceId: "ev-s2", sentenceId: "s2", charStart: 51, charEnd: 101, quote: "A tag names the worker, the date and the reason." }
] }] };
const input = { plan: { activityId: "act-7", slot: 1, type: "flashcards" as const, conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "isolation vocabulary" }, map, unit: null, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", existing: { questions: [], passages: [], fronts: [] }, rules: DEFAULT_PLAN_RULES };
const mk = (script: ReturnType<typeof fakeResponse>[]) => { const provider = new FakeProvider(script); return { provider, runner: createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-act-7", sleep: async () => undefined }) }; };

const card = (front: string, back: string, ev: string) => ({ front, back, tip: null, evidenceIds: [ev] });
const good = { title: "Key terms", description: "Isolation vocabulary.", cards: [card("Lockout device", "A padlock or hasp that physically prevents an isolator from being closed", "ev-s1"), card("Tag", "A warning label naming the worker, the date and the reason", "ev-s2"), card("Who may remove a lock", "Only the worker who applied it", "ev-s1"), card("Tag without a lock", "A warning, not a control", "ev-s2")] };
describe("flashcards producer", () => {
  it("converts to a FlashcardsSpec with positional card ids, per-card derived provenance and the evidence union on the set", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, plan: { ...input.plan, activityId: "act-7", type: "flashcards" } }, runner, { registry });
    if (produced.spec.type !== "flashcards") throw new Error("type");
    expect(produced.spec.cards.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(produced.spec.cards[1]).toEqual({ id: "c2", front: "Tag", back: "A warning label naming the worker, the date and the reason", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s2"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.description).toBe("Isolation vocabulary.");
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    expect(provider.requests[0]).not.toHaveProperty("temperature");
  });
  it("a card citing only concept B's evidence is mapped only to concept B's criteria, never to concept A's", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 145, quote: "Test for dead at the point of work every time." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const mixed = { ...good, cards: [...good.cards.slice(0, 3), card("When to test for dead", "At the point of work, every time", "ev-s3")] };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(mixed) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, map: aligned, plan: { ...input.plan, activityId: "act-7", type: "flashcards", conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    if (produced.spec.type !== "flashcards") throw new Error("type");
    expect(produced.spec.cards[0]!.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.cards[3]!.provenance).toEqual({ conceptIds: ["c2"], evidenceIds: ["ev-s3"], criteriaIds: ["PC2.2"] });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1", "c2"], evidenceIds: ["ev-s1", "ev-s2", "ev-s3"], criteriaIds: ["PC2.1", "PC2.2"] });
  });
  it("enforces the card bounds from the plan rules and distinct fronts", async () => {
    const few = { ...good, cards: good.cards.slice(0, 2) };
    const dup = { ...good, cards: [...good.cards.slice(0, 3), card("tag", "x", "ev-s2")] };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(few) }), fakeResponse({ outputText: JSON.stringify(dup) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, plan: { ...input.plan, activityId: "act-7", type: "flashcards" } }, runner, { registry });
    expect(produced.attempts).toBe(3);
    expect(provider.requests[1]?.user).toContain("between 4 and 12 cards are required");
    expect(provider.requests[2]?.user).toContain("duplicates another card's front");
  });
});
