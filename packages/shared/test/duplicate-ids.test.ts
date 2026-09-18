import { describe, it, expect } from "vitest";
import { FlashcardsSpec, BlanksSpec, QuestionSetSpec, InteractiveBookSpec } from "../src/index.js";

const base = { id: "x", title: "Title" };

describe("duplicate item ids", () => {
  it("FlashcardsSpec rejects two cards sharing an id, naming the second occurrence", () => {
    const r = FlashcardsSpec.safeParse({
      ...base, type: "flashcards",
      cards: [
        { id: "c1", front: "front1", back: "back1", imageAssetId: "img-1" },
        { id: "c1", front: "front2", back: "back2", imageAssetId: "img-2" }
      ]
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    const issue = r.error.issues.find((i) => /duplicate id "c1"/.test(i.message));
    expect(issue).toBeDefined();
    expect(issue?.path).toEqual(["cards", 1, "id"]);
  });

  it("FlashcardsSpec accepts cards with distinct ids", () => {
    const s = FlashcardsSpec.parse({
      ...base, type: "flashcards",
      cards: [
        { id: "c1", front: "front1", back: "back1" },
        { id: "c2", front: "front2", back: "back2" }
      ]
    });
    expect(s.cards).toHaveLength(2);
  });

  it("BlanksSpec rejects two blanks sharing an id, in addition to whatever token issues arise", () => {
    const r = BlanksSpec.safeParse({
      ...base, type: "blanks", passage: "{{b1}} and {{b2}}",
      blanks: [
        { id: "b1", answers: ["one"] },
        { id: "b1", answers: ["two"] }
      ]
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    const issue = r.error.issues.find((i) => /duplicate id "b1"/.test(i.message));
    expect(issue).toBeDefined();
    expect(issue?.path).toEqual(["blanks", 1, "id"]);
  });

  it("BlanksSpec accepts blanks with distinct ids", () => {
    const s = BlanksSpec.parse({
      ...base, type: "blanks", passage: "{{b1}} and {{b2}}",
      blanks: [
        { id: "b1", answers: ["one"] },
        { id: "b2", answers: ["two"] }
      ]
    });
    expect(s.blanks).toHaveLength(2);
  });

  it("QuestionSetSpec rejects two children sharing an id", () => {
    const mc = (id: string) => ({ id, title: "T", type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }] });
    const r = QuestionSetSpec.safeParse({ ...base, type: "questionSet", children: [mc("q"), mc("q")] });
    expect(r.success).toBe(false);
    if (r.success) return;

    expect(r.error.issues.some((i) => /duplicate id "q"/.test(i.message))).toBe(true);
  });

  it("QuestionSetSpec accepts children with distinct ids", () => {
    const mc = (id: string) => ({ id, title: "T", type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }] });
    const s = QuestionSetSpec.parse({ ...base, type: "questionSet", children: [mc("q1"), mc("q2")] });
    expect(s.children).toHaveLength(2);
  });

  it("InteractiveBookSpec rejects the same activity id reused across two chapters", () => {
    const tf = { id: "act1", title: "T", type: "trueFalse", statement: "s", correct: true };
    const r = InteractiveBookSpec.safeParse({
      ...base, type: "interactiveBook",
      chapters: [
        { title: "C1", items: [tf] },
        { title: "C2", items: [tf] }
      ]
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    expect(r.error.issues.some((i) => /duplicate id "act1"/.test(i.message))).toBe(true);
  });

  it("InteractiveBookSpec accepts activities with distinct ids across chapters, and untouched page items", () => {
    const s = InteractiveBookSpec.parse({
      ...base, type: "interactiveBook",
      chapters: [
        { title: "C1", items: [{ type: "text", title: "Intro", html: "<p>x</p>" }, { id: "act1", title: "T", type: "trueFalse", statement: "s", correct: true }] },
        { title: "C2", items: [{ id: "act2", title: "T", type: "trueFalse", statement: "s", correct: true }] }
      ]
    });
    expect(s.chapters).toHaveLength(2);
  });
});
