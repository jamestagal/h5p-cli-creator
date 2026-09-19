import { describe, it, expect } from "vitest";
import { UnitOfCompetency, ConceptMap, Evidence, IMPORT_STATUSES } from "../src/index.js";

describe("generation contract", () => {
  it("parses a unit with ids assigned in code", () => {
    const u = UnitOfCompetency.parse({
      code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "a".repeat(64),
      elements: [{ id: "E1", number: "1", text: "Prepare to isolate", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Identify hazards" }] }],
      knowledgeEvidence: ["types of hazards"], performanceEvidence: []
    });
    expect(u.elements[0]?.performanceCriteria[0]?.id).toBe("PC1.1");
  });
  it("evidence requires a half-open span and a quote", () => {
    expect(() => Evidence.parse({ evidenceId: "e1", sentenceId: "s1", charStart: 5, charEnd: 5, quote: "" })).toThrow();
    expect(Evidence.parse({ evidenceId: "e1", sentenceId: "s1", charStart: 0, charEnd: 4, quote: "Lock" }).charEnd).toBe(4);
  });
  it("concept map alignment lists unsupported criteria", () => {
    const m = ConceptMap.parse({ sourceId: "src-1", textHash: "b".repeat(64), concepts: [], alignment: { criteria: [{ criterionId: "PC1.1", conceptIds: [] }], unsupportedCriteriaIds: ["PC1.1"] } });
    expect(m.alignment?.unsupportedCriteriaIds).toEqual(["PC1.1"]);
  });
  it("status enums are closed", () => {
    expect(IMPORT_STATUSES).toEqual(["queued", "ingesting", "extracting", "planning", "generating", "ready", "ready_with_failures", "failed"]);
  });
});
