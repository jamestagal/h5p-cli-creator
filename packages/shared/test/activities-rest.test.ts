import { describe, it, expect } from "vitest";
import { ActivitySpec, QuestionSetSpec, InteractiveBookSpec, ACTIVITY_TYPES, assertGeneratedProvenance } from "../src/index.js";

const base = { id: "x", title: "T" };
const mc = { ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }] };
const cards = { ...base, type: "flashcards", cards: [{ id: "c1", front: "f", back: "b" }] };

describe("containers", () => {
  it("questionSet accepts multiChoice children and rejects flashcards", () => {
    expect(QuestionSetSpec.parse({ ...base, type: "questionSet", children: [mc] }).children).toHaveLength(1);
    expect(() => QuestionSetSpec.parse({ ...base, type: "questionSet", children: [cards] })).toThrow();
  });
  it("interactiveBook accepts pages and activities but not another book", () => {
    const book = InteractiveBookSpec.parse({
      ...base, type: "interactiveBook",
      chapters: [{ title: "C1", items: [{ type: "text", title: "Intro", html: "<p>x</p>" }, mc, cards] }]
    });
    expect(book.chapters[0]?.items).toHaveLength(3);
    expect(() => InteractiveBookSpec.parse({ ...base, type: "interactiveBook", chapters: [{ title: "C", items: [book] }] })).toThrow();
  });
  it("ActivitySpec discriminates on type", () => {
    expect(ActivitySpec.parse(mc).type).toBe("multiChoice");
    expect(ACTIVITY_TYPES).toHaveLength(13);
  });
  it("singleChoiceSet requires one correct and at least one distractor per question", () => {
    expect(() => ActivitySpec.parse({ ...base, type: "singleChoiceSet", questions: [{ id: "q1", question: "q", correct: "a", distractors: [] }] })).toThrow();
  });
  it("summary requires one correct and distractors per group, and items keep provenance", () => {
    const s = ActivitySpec.parse({ ...base, type: "summary", groups: [{ id: "g1", correct: "c", distractors: ["d"], provenance: { evidenceIds: ["e1"] } }] });
    expect(s.type).toBe("summary");
    if (s.type === "summary") expect(s.groups[0]?.provenance?.evidenceIds).toEqual(["e1"]);
  });
  it("assertGeneratedProvenance names the first unsupported activity or item", () => {
    expect(() => assertGeneratedProvenance(ActivitySpec.parse(mc))).toThrow(/activity x/);
    const withRoot = ActivitySpec.parse({ ...cards, provenance: { evidenceIds: ["e1"] } });
    expect(() => assertGeneratedProvenance(withRoot)).toThrow(/item c1/);
    const full = ActivitySpec.parse({ ...cards, provenance: { evidenceIds: ["e1"] }, cards: [{ id: "c1", front: "f", back: "b", provenance: { evidenceIds: ["e2"] } }] });
    expect(() => assertGeneratedProvenance(full)).not.toThrow();
  });
});
