import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";
import { validateParams } from "../src/validator/semantics.js";
import { checkClosure } from "../src/validator/closure.js";

const root = resolve(import.meta.dirname, "../../..");
let reg: LibraryRegistry;
beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const goodMc = () => ({
  library: "H5P.MultiChoice 1.16",
  params: {
    question: "<p>q</p>",
    answers: [{ text: "a", correct: true }, { text: "b", correct: false }],
    behaviour: { enableRetry: true, type: "auto", singlePoint: false, randomAnswers: true, passPercentage: 100 }
  },
  metadata: { contentType: "Multiple Choice", license: "U" as const, title: "t" }
});

const noMedia = () => new Map<string, string>();

describe("semantics validator", () => {
  it("accepts well-formed MultiChoice params", async () => {
    expect(await validateParams(goodMc(), reg, noMedia())).toEqual([]);
  });
  it("reports a wrong type at a nested path", async () => {
    const bad = goodMc(); (bad.params.answers as Array<Record<string, unknown>>)[0]!["correct"] = "yes";
    const issues = await validateParams(bad, reg, noMedia());
    expect(issues.map((i) => i.path)).toContain("answers[0].correct");
  });
  it("rejects a select value outside its options", async () => {
    const bad = goodMc(); (bad.params.behaviour as Record<string, unknown>)["type"] = "banana";
    expect((await validateParams(bad, reg, noMedia())).some((i) => i.path === "behaviour.type")).toBe(true);
  });
  it("applies the missing-value rule: required list and scalar are errors, group and defaulted text are not", async () => {
    const noAnswers = goodMc(); delete (noAnswers.params as Record<string, unknown>)["answers"];
    expect((await validateParams(noAnswers, reg, noMedia())).map((i) => i.path)).toContain("answers");
    const noQuestion = goodMc(); delete (noQuestion.params as Record<string, unknown>)["question"];
    expect((await validateParams(noQuestion, reg, noMedia())).map((i) => i.path)).toContain("question");
    expect(await validateParams(goodMc(), reg, noMedia())).toEqual([]); // `media` group and `overallFeedback` absent: fine
    const blanksNoText = { library: "H5P.Blanks 1.14", params: { questions: ["<p>*a*</p>"] }, metadata: { contentType: "Fill in the Blanks", license: "U" as const, title: "t" } };
    expect((await validateParams(blanksNoText, reg, noMedia())).map((i) => i.path)).not.toContain("text"); // has a default
  });
  it("enforces list bounds and object shape", async () => {
    const empty = goodMc(); (empty.params as Record<string, unknown>)["answers"] = [];
    expect((await validateParams(empty, reg, noMedia())).some((i) => i.path === "answers" && /min 1/.test(i.message))).toBe(true);
    const arrGroup = goodMc(); (arrGroup.params as Record<string, unknown>)["behaviour"] = [];
    expect((await validateParams(arrGroup, reg, noMedia())).some((i) => i.path === "behaviour" && /object/.test(i.message))).toBe(true);
    const tooMany = { library: "H5P.Blanks 1.14", params: { text: "x", questions: Array.from({ length: 32 }, () => "<p>*a*</p>") }, metadata: { contentType: "Fill in the Blanks", license: "U" as const, title: "t" } };
    expect((await validateParams(tooMany, reg, noMedia())).some((i) => i.path === "questions" && /max 31/.test(i.message))).toBe(true);
  });
  it("validates nested library params recursively and enforces the options list", async () => {
    const qs = {
      library: "H5P.QuestionSet 1.20",
      params: { questions: [{ library: "H5P.Flashcards 1.5", params: { cards: [] }, metadata: { contentType: "x", license: "U", title: "t" }, subContentId: "00000000-0000-4000-8000-000000000000" }] },
      metadata: { contentType: "Question Set", license: "U" as const, title: "t" }
    };
    const issues = await validateParams(qs, reg, noMedia());
    expect(issues.some((i) => i.path === "questions[0].library" && /not allowed/.test(i.message))).toBe(true);

    const nested = {
      library: "H5P.QuestionSet 1.20",
      params: { questions: [{ ...goodMc(), params: { ...goodMc().params, answers: "nope" }, subContentId: "00000000-0000-4000-8000-000000000000" }] },
      metadata: { contentType: "Question Set", license: "U" as const, title: "t" }
    };
    expect((await validateParams(nested, reg, noMedia())).map((i) => i.path)).toContain("questions[0].params.answers");
  });
  it("reports a media path that is not in the package", async () => {
    // H5P.Image-1.1's `alt` field has no `optional`/`default` in the locked semantics.json, so it must be supplied
    // for this fixture to isolate the media-path rule instead of also tripping the missing-value rule.
    const withMedia = goodMc(); (withMedia.params as Record<string, unknown>)["media"] = { type: { library: "H5P.Image 1.1", params: { file: { path: "images/1.png", mime: "image/png", width: 10, height: 10 }, alt: "an image" }, metadata: { contentType: "Image", license: "U", title: "i" }, subContentId: "00000000-0000-4000-8000-000000000001" } };
    const issues = await validateParams(withMedia, reg, noMedia());
    expect(issues.some((i) => /media path images\/1\.png/.test(i.message))).toBe(true);
    expect(await validateParams(withMedia, reg, new Map([["images/1.png", "asset-1"]]))).toEqual([]);
  });
  it("flattens a single-field group to the sub-field's value at the same path", async () => {
    const withFeedback = goodMc(); (withFeedback.params as Record<string, unknown>)["overallFeedback"] = [{ from: 0, to: 100 }];
    expect(await validateParams(withFeedback, reg, noMedia())).toEqual([]);

    const badFeedback = goodMc(); (badFeedback.params as Record<string, unknown>)["overallFeedback"] = "x";
    const issues = await validateParams(badFeedback, reg, noMedia());
    expect(issues.some((i) => i.path === "overallFeedback" && /expected array/.test(i.message))).toBe(true);
  });
  it("closure check flags a referenced library missing from the closure", async () => {
    const issues = await checkClosure(goodMc(), reg, ["H5P.Flashcards-1.5"]);
    expect(issues.some((i) => /H5P.MultiChoice-1.16/.test(i.message))).toBe(true);
    expect(await checkClosure(goodMc(), reg, ["H5P.MultiChoice-1.16"])).toEqual([]);
  });
});
