import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestMarkdown, ingestPdf, ingestText, segmentSentences, textHash, MAX_SOURCE_CHARACTERS } from "../src/ingest/index.js";

const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");

describe("sentence segmentation", () => {
  it("assigns ids and half-open offsets that slice back to the sentence", () => {
    const text = "Lock it out. Then test for dead!  Finally, restore supply?\nNew paragraph here.";
    const s = segmentSentences(text);
    expect(s.map((x) => x.text)).toEqual(["Lock it out.", "Then test for dead!", "Finally, restore supply?", "New paragraph here."]);
    expect(s.map((x) => x.sentenceId)).toEqual(["s1", "s2", "s3", "s4"]);
    for (const x of s) expect(text.slice(x.charStart, x.charEnd)).toBe(x.text);
  });
  it("does not split on decimals or common abbreviations", () => {
    const s = segmentSentences("Clause 1.2 applies e.g. to gloves. Next sentence.");
    expect(s).toHaveLength(2);
  });
});

describe("ingest", () => {
  it("text: hashes the stored text and counts characters", async () => {
    const doc = await ingestText("Alpha. Beta.", { sourceId: "src-1" });
    expect(doc.textHash).toBe(textHash("Alpha. Beta."));
    expect(doc.sentences).toHaveLength(2);
    expect(doc.metadata.characters).toBe(12);
  });
  it("markdown: strips heading and list markers but keeps the words and offsets consistent", async () => {
    const md = await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8");
    const doc = await ingestMarkdown(md, { sourceId: "src-md" });
    expect(doc.text).not.toMatch(/^#/m);
    expect(doc.text).toContain("Lockout and tagout is the method used to keep isolated equipment isolated.");
    expect(doc.sentences.length).toBeGreaterThan(35);
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
  it("pdf: extracts the text layer and the same key sentences", async () => {
    const bytes = await readFile(resolve(fixtures, "source-electrical-safety.pdf"));
    const doc = await ingestPdf(bytes, { sourceId: "src-pdf", fileName: "source-electrical-safety.pdf" });
    expect(doc.kind).toBe("pdf");
    expect(doc.metadata.pages).toBeGreaterThanOrEqual(2);
    const flat = doc.text.replace(/\s+/g, " ");
    expect(flat).toContain("Only the worker who applied a lock may remove it.");
    expect(flat).toContain("A reading of zero on an unproved tester proves nothing.");
    expect(doc.sentences.some((s) => s.text.includes("test for dead"))).toBe(true);
  });
  it("rejects empty and oversized input with a message, never truncating", async () => {
    await expect(ingestText("   ", { sourceId: "x" })).rejects.toThrow(/empty/);
    await expect(ingestText("a".repeat(MAX_SOURCE_CHARACTERS + 1), { sourceId: "x" })).rejects.toThrow(/300,000/);
  });
});
