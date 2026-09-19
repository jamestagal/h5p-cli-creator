import { describe, it, expect } from "vitest";
import { assertProviderCompatible, UNSUPPORTED_SCHEMA_KEYWORDS } from "../src/llm/schema.js";
import * as out from "../src/schemas/model-output.js";

const SCHEMAS: Record<string, Record<string, unknown>> = {
  UnitOutSchema: out.UnitOutSchema, ConceptsOutSchema: out.ConceptsOutSchema, MergeOutSchema: out.MergeOutSchema, AlignmentOutSchema: out.AlignmentOutSchema,
  PlanOutSchema: out.PlanOutSchema, MultiChoiceOutSchema: out.MultiChoiceOutSchema, BlanksOutSchema: out.BlanksOutSchema, FlashcardsOutSchema: out.FlashcardsOutSchema
};

describe("model-output schemas on the wire", () => {
  it("every real schema is provider-compatible: closed objects, every property required, no unsupported keyword anywhere, no $schema", () => {
    expect(Object.keys(SCHEMAS)).toHaveLength(8);
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      expect(() => assertProviderCompatible(schema), name).not.toThrow();
      const text = JSON.stringify(schema);
      for (const keyword of UNSUPPORTED_SCHEMA_KEYWORDS) expect(text, `${name} carries ${keyword}`).not.toContain(`"${keyword}":`);
    }
  });
  it("PlanOut's integer slot reaches the wire as a plain integer while the Zod schema still rejects non-integers", () => {
    const activities = (out.PlanOutSchema["properties"] as Record<string, Record<string, unknown>>)["activities"]!;
    const slot = ((activities["items"] as Record<string, unknown>)["properties"] as Record<string, Record<string, unknown>>)["slot"]!;
    expect(slot["type"]).toBe("integer");
    expect(slot).not.toHaveProperty("minimum");
    expect(slot).not.toHaveProperty("maximum");
    expect(out.PlanOut.safeParse({ activities: [{ slot: 1.5, type: "blanks", conceptIds: ["c1"], criteriaIds: [], focus: "f" }] }).success).toBe(false);
  });
  it("item schemas carry evidence per item only", () => {
    expect(Object.keys(out.BlanksOutSchema["properties"] as object)).not.toContain("evidenceIds");
    expect(Object.keys(out.FlashcardsOutSchema["properties"] as object)).not.toContain("evidenceIds");
    expect(Object.keys(out.MultiChoiceOutSchema["properties"] as object)).toContain("evidenceIds");
  });
});
