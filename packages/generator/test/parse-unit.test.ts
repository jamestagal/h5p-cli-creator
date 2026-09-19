import { describe, it, expect } from "vitest";
import { parseUnit } from "../src/competency/parse-unit.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { criteriaOf } from "@leaplearn/shared";
import { MemoryRecorder, syntheticUnitText, unitOut } from "./helpers/synthetic.js";

describe("parseUnit", () => {
  it("assigns element and criterion ids in code and hashes the unit text", async () => {
    const text = await syntheticUnitText();
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
