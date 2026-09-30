import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import {
  admitSource, buildDocument, countCodePoints, EmptySourceError, EXTRACTION_VERSION, ingestMarkdown, ingestPdf, ingestText, MAX_SOURCE_CODE_POINTS, MIN_SOURCE_CODE_POINTS,
  normaliseSourceText, PdfTooManyPagesError, segmentSentences, SourceTooLargeError, SourceTooSmallError, textHash, MAX_PDF_PAGES
} from "../src/ingest/index.js";
import * as ingest from "../src/ingest/index.js";
import { chunkSentences } from "../src/concepts/chunk.js";
import { parseUnit } from "../src/competency/parse-unit.js";
import { runFingerprint, type FingerprintInput } from "../src/pipeline/fingerprint.js";
import { createRunner } from "../src/llm/runner.js";
import { createBudget } from "../src/llm/budget.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { MemoryRecorder, unitOut } from "./helpers/synthetic.js";

const opts = { sourceId: "src" };
const GRIN = "\u{1F600}"; // one code point, two UTF-16 code units

describe("admitSource: 500 to 400,000 code points of the normalised text", () => {
  it("rejects 0 as empty, 1-499 as too small, above 400,000 as too large; admits 500 and 400,000", () => {
    expect(MIN_SOURCE_CODE_POINTS).toBe(500);
    expect(MAX_SOURCE_CODE_POINTS).toBe(400_000);
    expect("MAX_SOURCE_CHARACTERS" in ingest).toBe(false);
    expect(() => admitSource("")).toThrow(EmptySourceError);
    expect(() => admitSource("a".repeat(499))).toThrow(SourceTooSmallError);
    expect(() => admitSource("a".repeat(499))).toThrow(/499 code points.*minimum of 500/);
    expect(() => admitSource("a".repeat(500))).not.toThrow();
    expect(() => admitSource("a".repeat(400_000))).not.toThrow();
    expect(() => admitSource("a".repeat(400_001))).toThrow(SourceTooLargeError);
    expect(() => admitSource("a".repeat(400_001))).toThrow(/400,001 code points.*maximum of 400,000/);
  });

  it("counts code points, not UTF-16 units: 250 astral characters are 500 units but 250 code points, and are rejected", () => {
    const astral = GRIN.repeat(250);
    expect(astral.length).toBe(500);
    expect(countCodePoints(astral)).toBe(250);
    expect(() => admitSource(astral)).toThrow(/250 code points/);
    expect(() => admitSource(GRIN.repeat(500))).not.toThrow();
  });

  it("is applied by every ingest entry point, to the normalised text", async () => {
    await expect(ingestText("   \r\n  ", opts)).rejects.toThrow(EmptySourceError);
    await expect(ingestText(`${"a".repeat(499)}\r\n   `, opts)).rejects.toThrow(SourceTooSmallError); // trailing whitespace does not count
    await expect(ingestMarkdown(`# ${"a".repeat(498)}`, opts)).rejects.toThrow(SourceTooSmallError); // the heading marker does not count
    await expect(ingestText("a".repeat(500), opts)).resolves.toMatchObject({ metadata: { codePoints: 500 } });
  });
});

describe("normaliseSourceText and NFC", () => {
  it("turns decomposed (NFD) Vietnamese into NFC, hashing and counting the NFC text", async () => {
    const nfc = "Tiếng Việt có dấu: người thợ điện phải cắt điện trước khi làm việc.";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(normaliseSourceText(nfd)).toBe(nfc);
    const body = `${nfd} `.repeat(10);
    const doc = await ingestText(body, opts);
    const expected = `${nfc} `.repeat(10).trim();
    expect(doc.text).toBe(expected);
    expect(doc.textHash).toBe(textHash(expected));
    expect(doc.metadata.codePoints).toBe(countCodePoints(expected));
    expect(countCodePoints(expected)).toBeLessThan(countCodePoints(body.trim()));
  });

  it("is idempotent on edge cases: NFD, CRLF, lone CR, trailing spaces, blank lines at either end, astral characters", () => {
    const corpus = [
      "Tiếng Việt".normalize("NFD"), "a\r\nb\r\n", "a\rb", "line one   \nline two\t\t\n", "\n\n\n  text  \n\n\n", `${GRIN} lead\n${GRIN}`,
      " ́a", "é\r\né  \n", "", "   ", "\t\r\n\t", "Å ring 𝄞 clef"
    ];
    for (const raw of corpus) {
      const once = normaliseSourceText(raw);
      expect(normaliseSourceText(once), JSON.stringify(raw)).toBe(once);
      expect(once, JSON.stringify(raw)).toBe(once.normalize("NFC"));
      expect(once).not.toMatch(/\r|[ \t]\n|^\s|\s$/);
    }
    expect(normaliseSourceText("a  \r\nb\r\n\r\n")).toBe("a\nb");
  });
});

describe("offsets are UTF-16 code units into the stored normalised text", () => {
  it("slices back to each sentence when an astral character precedes it", async () => {
    const text = `${GRIN} Emoji first. Lock it out before work starts. ${"Test for dead at the point of work. ".repeat(15)}`;
    const doc = await ingestText(text, opts);
    const lock = doc.sentences.find((s) => s.text === "Lock it out before work starts.")!;
    expect(lock.charStart).toBe(doc.text.indexOf("Lock it out"));
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

describe("the PDF page limit, read before any text is extracted", () => {
  afterEach(() => vi.restoreAllMocks());

  async function pdfWithPages(pages: number): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= pages; i++) pdf.addPage([300, 200]).drawText(`Page ${i}. Lock it out before work starts.`, { x: 20, y: 100, size: 10, font });
    return Buffer.from(await pdf.save());
  }

  it("rejects a 101-page PDF on its page count without extracting text", async () => {
    expect(MAX_PDF_PAGES).toBe(100);
    const getText = vi.spyOn(PDFParse.prototype, "getText");
    const refused = await ingestPdf(await pdfWithPages(101), opts).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PdfTooManyPagesError);
    expect((refused as Error).message).toMatch(/101 pages.*limit of 100/);
    expect(getText).not.toHaveBeenCalled();
  }, 60_000);

  it("reads the same page count from getInfo as getText reports, on the synthetic PDF", async () => {
    const bytes = await readFile(resolve(import.meta.dirname, "fixtures/synthetic/source-electrical-safety.pdf"));
    const parser = new PDFParse({ data: bytes });
    try {
      const info = await parser.getInfo();
      const text = await parser.getText();
      expect(info.total).toBe(text.total);
      expect(info.total).toBeGreaterThanOrEqual(2);
    } finally { await parser.destroy(); }
    expect((await ingestPdf(bytes, opts)).metadata.pages).toBeGreaterThanOrEqual(2);
  });

  it("admits a 100-page PDF on its page count and records the pages", async () => {
    const getText = vi.spyOn(PDFParse.prototype, "getText");
    const doc = await ingestPdf(await pdfWithPages(100), opts);
    expect(doc.metadata.pages).toBe(100);
    expect(getText).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe("the limit applies only to the submitted source", () => {
  it("segmentSentences, buildDocument and chunkSentences accept short text", () => {
    const short = "Lock it out. Test for dead.";
    expect(segmentSentences(short)).toHaveLength(2);
    const doc = buildDocument("text", short, opts);
    expect(doc.text).toBe(short);
    expect(chunkSentences(doc.sentences, 1000)).toHaveLength(1);
  });

  it("parseUnit accepts a unit of competency far under 500 code points", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(unitOut) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-unit", origin: "shared", requestId: null, sleep: async () => undefined });
    const text = "SYNELE001 Isolate and test electrical equipment";
    expect(countCodePoints(text)).toBeLessThan(500);
    await expect(parseUnit(text, runner)).resolves.toBeDefined();
  });
});

describe("the extraction version", () => {
  it("is recorded on every ingested document and is part of the run fingerprint", async () => {
    expect(EXTRACTION_VERSION).toBe("2026-09-28.1");
    const doc = await ingestText("a".repeat(500), opts);
    expect(doc.metadata.extractionVersion).toBe(EXTRACTION_VERSION);
    const base: FingerprintInput = { sourceTextHash: doc.textHash, extractionVersion: EXTRACTION_VERSION, unitText: null, selectedTypes: ["multiChoice"], language: "en", promptConfig: DEFAULT_PROMPT_CONFIG, customisation: null, chunkTokens: 6000, rules: DEFAULT_PLAN_RULES };
    expect(runFingerprint({ ...base, extractionVersion: "2026-09-28.2" })).not.toBe(runFingerprint(base));
    expect(runFingerprint({ ...base })).toBe(runFingerprint(base));
  });
});
