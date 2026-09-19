import { describe, it, expect } from "vitest";
import { checkBlanks, checkFlashcards, checkMultiChoice, checkPlainText, checkReferences, checkAgainstExisting, isNearDuplicate, normaliseText } from "../src/quality/checks.js";

describe("quality checks", () => {
  it("normalises and detects near duplicates", () => {
    expect(normaliseText("  Lock-out, TAGOUT!  ")).toBe("lock out tagout");
    expect(isNearDuplicate("Who may remove a lock?", "who may remove a lock")).toBe(true);
    expect(isNearDuplicate("Who may remove a lock from the hasp?", "Who may remove a lock from the hasp today?")).toBe(true);
    expect(isNearDuplicate("Who may remove a lock?", "What does a tag record?")).toBe(false);
    expect(checkAgainstExisting("question", "Who may remove a lock?", ["who may remove a lock"])).toEqual(["question is a near-duplicate of an existing question in this import"]);
  });
  it("rejects unknown references and markup", () => {
    const allowed = { evidence: new Set(["ev-s1"]), concepts: new Set(["c1"]), criteria: new Set(["PC1.1"]) };
    expect(checkReferences({ evidenceIds: ["ev-s1", "ev-s9"], conceptIds: ["c2"], criteriaIds: [] }, allowed, "activity")).toEqual(["activity cites unknown evidence ev-s9", "activity cites unknown concept c2"]);
    expect(checkReferences({ evidenceIds: [], conceptIds: ["c1"], criteriaIds: [] }, allowed, "activity")).toEqual(["activity cites no evidence"]);
    expect(checkReferences({ evidenceIds: ["ev-s1"], conceptIds: [], criteriaIds: ["PC9.9"] }, { ...allowed, criteria: null }, "activity")).toEqual([]);
    expect(checkPlainText("<p>hi</p>", "question")).toEqual(["question contains HTML tags"]);
    expect(checkPlainText("**bold**", "question")).toEqual(["question contains markdown markers"]);
    expect(checkPlainText("", "question")).toEqual(["question is empty"]);
  });
  it("multiChoice: exactly one correct, distinct answers, 2-8 options", () => {
    const ok = { title: "T", question: "Who may remove a lock?", answers: [{ text: "The worker who applied it", correct: true, feedback: "" }, { text: "Any supervisor", correct: false, feedback: "" }], evidenceIds: ["ev-s1"] };
    expect(checkMultiChoice(ok)).toEqual([]);
    expect(checkMultiChoice({ ...ok, answers: [{ ...ok.answers[0]!, correct: true }, { ...ok.answers[1]!, correct: true }] })).toContain("exactly one answer must be correct");
    expect(checkMultiChoice({ ...ok, answers: [ok.answers[0]!, { text: "the worker who applied it", correct: false, feedback: "" }] })).toContain("answer 2 duplicates another answer");
    expect(checkMultiChoice({ ...ok, answers: [ok.answers[0]!] })).toContain("between 2 and 8 answers are required");
  });
  it("blanks: tokens, delimiters, and answers grounded in the evidence each blank cites", () => {
    const texts: Record<string, string> = { "ev-s1": "Only the worker who applied a lock may remove it.", "ev-s2": "A tag names the worker, the date and the reason." };
    const evidenceTextFor = (ids: string[]) => ids.map((id) => texts[id] ?? "").join(" ");
    const ok = { title: "T", taskDescription: "Fill the gaps.", passage: "Only the {{b1}} who applied a lock may remove it, and the tag names the {{b2}}.", blanks: [{ answers: ["worker"], tip: null, evidenceIds: ["ev-s1"] }, { answers: ["date", "reason"], tip: "on the tag", evidenceIds: ["ev-s2"] }] };
    expect(checkBlanks(ok, evidenceTextFor)).toEqual([]);
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} and {{b1}}." }, evidenceTextFor)).toContain("token {{b1}} must appear exactly once");
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} 5* rated {{b2}}." }, evidenceTextFor)).toContain("passage must not contain *");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["1/2"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain("blank 1 answer contains a forbidden character (* / :)");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["electrician"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain('blank 1 answer "electrician" does not occur in the evidence it cites');
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["date"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain('blank 1 answer "date" does not occur in the evidence it cites'); // present in ev-s2, but the blank cites ev-s1
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["worker"], tip: null, evidenceIds: [] }, ok.blanks[1]!] }, evidenceTextFor)).toContain("blank 1 cites no evidence");
    expect(checkBlanks({ ...ok, passage: "{{b1}} {{b2}}" }, evidenceTextFor)).toContain("passage needs at least 8 words around the blanks");
  });
  it("flashcards: bounds, distinct fronts, back differs from front", () => {
    const card = (front: string, back: string) => ({ front, back, tip: null, evidenceIds: ["ev-s1"] });
    const ok = { title: "T", description: "d", cards: [card("Spanner", "Tightens hex nuts"), card("Saw", "Cuts timber"), card("Tag", "Names the worker"), card("Lock", "Prevents closing an isolator")] };
    expect(checkFlashcards(ok, 4, 12)).toEqual([]);
    expect(checkFlashcards({ ...ok, cards: ok.cards.slice(0, 3) }, 4, 12)).toContain("between 4 and 12 cards are required");
    expect(checkFlashcards({ ...ok, cards: [...ok.cards.slice(0, 3), card("spanner", "x")] }, 4, 12)).toContain("card 4 duplicates another card's front");
    expect(checkFlashcards({ ...ok, cards: [...ok.cards.slice(0, 3), card("Same", "same")] }, 4, 12)).toContain("card 4 back must differ from its front");
  });
});
