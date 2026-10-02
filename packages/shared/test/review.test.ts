import { describe, it, expect } from "vitest";
import { applicable, DIMENSIONS, MAPPING_STATUSES, RUBRIC_VERSION, SCORE_DECISIONS } from "../src/index.js";

describe("rubric r1 (design §5)", () => {
  it("has version r1, five dimensions in sheet order, and three derived decisions", () => {
    expect(RUBRIC_VERSION).toBe("r1");
    expect(DIMENSIONS).toEqual(["correctness", "support", "distractors", "mapping", "usefulness"]);
    expect(SCORE_DECISIONS).toEqual(["accepted", "needs-revision", "rejected"]);
  });

  it("distractors apply only to multiChoice, and mapping only when there is a unit; the rest always apply", () => {
    for (const type of ["multiChoice", "blanks", "flashcards"] as const) {
      for (const hasUnit of [true, false]) {
        expect(applicable("correctness", type, hasUnit)).toBe(true);
        expect(applicable("support", type, hasUnit)).toBe(true);
        expect(applicable("usefulness", type, hasUnit)).toBe(true);
        expect(applicable("distractors", type, hasUnit), `${type} ${hasUnit}`).toBe(type === "multiChoice");
        expect(applicable("mapping", type, hasUnit), `${type} ${hasUnit}`).toBe(hasUnit);
      }
    }
  });

  it("mapping.csv gains the reviewed status", () => {
    expect(MAPPING_STATUSES).toEqual(["suggested", "reviewed", "confirmed", "rejected", "added"]);
  });
});
