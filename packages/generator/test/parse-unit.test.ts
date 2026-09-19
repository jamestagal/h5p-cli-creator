import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseUnit } from "../src/competency/parse-unit.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { criteriaOf } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");

/** Synthetic model output for unit-synele001.txt, authored by hand. */
const unitOut = {
  code: "SYNELE001", title: "Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)",
  elements: [
    { number: "1", text: "Prepare to isolate equipment", performanceCriteria: [{ number: "1.1", text: "Identify electrical hazards in the work area and record them on the isolation permit" }, { number: "1.2", text: "Confirm every supply to the equipment, including secondary supplies" }] },
    { number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ number: "2.1", text: "Apply lockout devices and tags in accordance with site procedure" }, { number: "2.2", text: "Test for dead using a proved voltage tester" }] },
    { number: "3", text: "Restore supply", performanceCriteria: [{ number: "3.1", text: "Remove locks and tags in the correct sequence after work is complete" }, { number: "3.2", text: "Complete an incident report for any breach of isolation" }, { number: "3.3", text: "Confirm guards and covers are refitted before supply is restored" }] }
  ],
  knowledgeEvidence: ["types of electrical hazards including stored energy and multiple supplies", "purpose of lockout devices and tags"],
  performanceEvidence: ["isolate and test at least one item of equipment fed from two supplies"]
};

describe("parseUnit", () => {
  it("assigns element and criterion ids in code and hashes the unit text", async () => {
    const text = await readFile(resolve(fixtures, "unit-synele001.txt"), "utf8");
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(unitOut) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-unit", sleep: async () => undefined });
    const unit = await parseUnit(text, runner);
    expect(unit.code).toBe("SYNELE001");
    expect(unit.elements.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
    expect(criteriaOf(unit).map((c) => c.id)).toEqual(["PC1.1", "PC1.2", "PC2.1", "PC2.2", "PC3.1", "PC3.2", "PC3.3"]);
    expect(unit.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(provider.requests[0]?.purpose).toBe("parseUnit");
    expect(provider.requests[0]?.user).toContain("SYNELE001");
  });
  it("rejects an element without criteria as a content failure", async () => {
    const provider = new FakeProvider(Array.from({ length: 3 }, () => fakeResponse({ outputText: JSON.stringify({ ...unitOut, elements: [{ number: "1", text: "x", performanceCriteria: [] }] }) })));
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-unit", sleep: async () => undefined });
    await expect(parseUnit("SYNELE001 …", runner)).rejects.toMatchObject({ name: "ContentFailure" });
  });
});
