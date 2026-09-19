import { describe, it, expect } from "vitest";
import { planSlots, planActivities, DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import type { ConceptMap } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const ev = (id: string) => ({ evidenceId: `ev-${id}`, sentenceId: id, charStart: 0, charEnd: 5, quote: "Hello" });
const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [
  { conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [ev("s1")] }, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [ev("s2")] }, { conceptId: "c3", name: "Hazards", summary: "s", evidence: [ev("s3")] }
], alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }, { criterionId: "PC3.2", conceptIds: [] }], unsupportedCriteriaIds: ["PC3.2"] } };

describe("planner", () => {
  it("derives slots from rules and concept count", () => {
    expect(planSlots(["multiChoice", "blanks", "flashcards"], 3, DEFAULT_PLAN_RULES).map((s) => s.type)).toEqual(["multiChoice", "multiChoice", "multiChoice", "blanks", "blanks", "blanks", "flashcards"]);
    expect(planSlots(["multiChoice"], 10, DEFAULT_PLAN_RULES)).toHaveLength(5);
  });
  it("allocates concepts and criteria per slot through one model call and assigns activity ids", async () => {
    const out = { activities: [
      { slot: 1, type: "multiChoice", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who may remove a lock" },
      { slot: 2, type: "multiChoice", conceptIds: ["c2"], criteriaIds: ["PC2.2"], focus: "proving the tester" },
      { slot: 3, type: "multiChoice", conceptIds: ["c3"], criteriaIds: [], focus: "hazards" },
      { slot: 4, type: "blanks", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "lock and tag" },
      { slot: 5, type: "blanks", conceptIds: ["c2"], criteriaIds: ["PC2.2"], focus: "test sequence" },
      { slot: 6, type: "blanks", conceptIds: ["c3"], criteriaIds: [], focus: "hazards" },
      { slot: 7, type: "flashcards", conceptIds: ["c1", "c2", "c3"], criteriaIds: ["PC2.1", "PC2.2"], focus: "key terms" }
    ] };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(out) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-plan", sleep: async () => undefined });
    const plan = await planActivities(map, ["multiChoice", "blanks", "flashcards"], runner);
    expect(plan.map((p) => p.activityId)).toEqual(["act-1", "act-2", "act-3", "act-4", "act-5", "act-6", "act-7"]);
    expect(plan[6]).toMatchObject({ type: "flashcards", conceptIds: ["c1", "c2", "c3"] });
    expect(provider.requests[0]?.user).toContain("PC3.2 (unsupported by the source)");
  });
  it("rejects a plan whose slots or ids do not match", async () => {
    const bad = { activities: [{ slot: 1, type: "multiChoice", conceptIds: ["c9"], criteriaIds: ["PC2.1"], focus: "x" }] };
    const provider = new FakeProvider(Array.from({ length: 3 }, () => fakeResponse({ outputText: JSON.stringify(bad) })));
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-plan", sleep: async () => undefined });
    await expect(planActivities(map, ["multiChoice"], runner)).rejects.toMatchObject({ name: "ContentFailure" });
    expect(provider.requests[1]?.user).toMatch(/unknown concept c9|slot/);
  });
});
