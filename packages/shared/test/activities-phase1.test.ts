import { describe, it, expect } from "vitest";
import { MultiChoiceSpec, BlanksSpec, FlashcardsSpec } from "../src/index.js";

const base = { id: "x", title: "Title" };

describe("MultiChoiceSpec", () => {
  it("accepts one question with at least one correct answer", () => {
    const s = MultiChoiceSpec.parse({
      ...base, type: "multiChoice", question: "<p>2+2?</p>",
      answers: [{ text: "4", correct: true }, { text: "5", correct: false }]
    });
    expect(s.answers).toHaveLength(2);
  });
  it("rejects when no answer is correct", () => {
    expect(() => MultiChoiceSpec.parse({
      ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: false }, { text: "b", correct: false }]
    })).toThrow(/at least one correct/);
  });
  it("rejects fewer than two answers", () => {
    expect(() => MultiChoiceSpec.parse({ ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }] })).toThrow();
  });
});

describe("BlanksSpec", () => {
  it("accepts a passage whose tokens match the blanks exactly once each", () => {
    const s = BlanksSpec.parse({
      ...base, type: "blanks", passage: "The sky is {{b1}} and grass is {{b2}}.",
      blanks: [{ id: "b1", answers: ["blue"] }, { id: "b2", answers: ["green"], tip: "colour of leaves" }]
    });
    expect(s.blanks[1]?.tip).toBe("colour of leaves");
  });
  it("rejects answers or tips containing the H5P.Blanks delimiter characters, naming the blank", () => {
    const r1 = BlanksSpec.safeParse({ ...base, type: "blanks", passage: "Half is {{b1}}", blanks: [{ id: "b1", answers: ["1/2"] }] });
    expect(r1.success).toBe(false);
    expect(!r1.success && r1.error.issues.some((i) => /b1.*"\/"/.test(i.message))).toBe(true);

    const r2 = BlanksSpec.safeParse({ ...base, type: "blanks", passage: "Start at {{b1}}", blanks: [{ id: "b1", answers: ["10:30"] }] });
    expect(r2.success).toBe(false);
    expect(!r2.success && r2.error.issues.some((i) => /b1.*":"/.test(i.message))).toBe(true);

    const r3 = BlanksSpec.safeParse({ ...base, type: "blanks", passage: "x {{b1}}", blanks: [{ id: "b1", answers: ["a"], tip: "one*two" }] });
    expect(r3.success).toBe(false);
    expect(!r3.success && r3.error.issues.some((i) => /b1.*"\*"/.test(i.message))).toBe(true);
  });
  it("rejects a passage containing the H5P.Blanks marker character", () => {
    const r = BlanksSpec.safeParse({ ...base, type: "blanks", passage: "Pick a* {{b1}}", blanks: [{ id: "b1", answers: ["a"] }] });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.some((i) => /passage contains "\*"/.test(i.message))).toBe(true);
  });
  it("rejects a token without a blank", () => {
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "x {{b9}}", blanks: [{ id: "b1", answers: ["a"] }] })).toThrow(/b9/);
  });
  it("rejects a blank used twice", () => {
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "{{b1}} {{b1}}", blanks: [{ id: "b1", answers: ["a"] }] })).toThrow(/exactly once/);
  });
});

describe("FlashcardsSpec", () => {
  it("requires at least one card with front and back", () => {
    expect(() => FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [] })).toThrow();
    const s = FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [{ id: "c1", front: "Bonjour", back: "Hello", provenance: { evidenceIds: ["e7"] } }] });
    expect(s.cards[0]?.back).toBe("Hello");
    expect(s.cards[0]?.provenance?.evidenceIds).toEqual(["e7"]);
    expect(() => FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [{ front: "no id", back: "x" }] })).toThrow();
  });
});
