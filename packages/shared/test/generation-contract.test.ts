import { describe, it, expect } from "vitest";
import { UnitOfCompetency, Concept, ConceptMap, Evidence, IMPORT_STATUSES, targetsOf } from "../src/index.js";

describe("generation contract", () => {
  it("parses a unit with ids assigned in code", () => {
    const u = UnitOfCompetency.parse({
      code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "a".repeat(64),
      elements: [{ id: "E1", number: "1", text: "Prepare to isolate", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Identify hazards" }] }],
      release: "Release 1", assessmentConditions: null,
      knowledgeEvidence: [{ id: "KE1", text: "lockout devices, including:", children: [{ id: "KE1.1", text: "personal padlocks", children: [] }] }], performanceEvidence: []
    });
    expect(u.elements[0]?.performanceCriteria[0]?.id).toBe("PC1.1");
    expect(targetsOf(u).map((t) => [t.id, t.kind, t.path])).toEqual([["PC1.1", "pc", ["Prepare to isolate"]], ["KE1", "ke", []], ["KE1.1", "ke", ["lockout devices, including:"]]]);
  });
  it("a KE id must have the KE<n>(.<m>) form, at any depth", () => {
    const unit = (id: string) => ({ code: "C", title: "T", textHash: "a".repeat(64), release: null, assessmentConditions: null, elements: [{ id: "E1", number: "1", text: "e", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "p" }] }], performanceEvidence: [], knowledgeEvidence: [{ id: "KE1", text: "k", children: [{ id, text: "c", children: [] }] }] });
    expect(() => UnitOfCompetency.parse(unit("KE1.1"))).not.toThrow();
    for (const bad of ["KE", "1.1", "KE1.", "PC1.1"]) expect(() => UnitOfCompetency.parse(unit(bad)), bad).toThrow();
  });
  it("targetsOf skips Knowledge Evidence stored as plain strings before KE IDs existed", () => {
    const legacy = { code: "C", title: "T", textHash: "a".repeat(64), elements: [{ id: "E1", number: "1", text: "e", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "p" }] }], knowledgeEvidence: ["types of hazards"], performanceEvidence: [] } as unknown as UnitOfCompetency;
    expect(targetsOf(legacy).map((t) => t.id)).toEqual(["PC1.1"]);
  });
  it("a concept stored before kinds existed reads as content", () => {
    const evidence = [{ evidenceId: "e1", sentenceId: "s1", charStart: 0, charEnd: 4, quote: "Lock" }];
    expect(Concept.parse({ conceptId: "c1", name: "n", summary: "s", evidence }).kind).toBe("content");
    expect(Concept.parse({ conceptId: "c1", kind: "rto-instruction", name: "n", summary: "s", evidence }).kind).toBe("rto-instruction");
    expect(() => Concept.parse({ conceptId: "c1", kind: "other", name: "n", summary: "s", evidence })).toThrow();
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
