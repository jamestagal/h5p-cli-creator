import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";

// The model input limits are overridden for one test through the module boundary, not through a production option.
const limits = vi.hoisted(() => ({ override: null as Record<string, number> | null }));
vi.mock("../src/llm/models.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/models.js")>();
  return { ...actual, get MAX_INPUT_TOKENS() { return limits.override ?? actual.MAX_INPUT_TOKENS; } };
});

const { MAX_INPUT_TOKENS } = await import("../src/llm/models.js");
const { runImport } = await import("../src/pipeline/run-import.js");
const { MemoryStore } = await import("../src/store/memory-store.js");
const { FakeProvider } = await import("../src/llm/fake-provider.js");
const { finaliseDocument, ingestMarkdown, ingestText } = await import("../src/ingest/index.js");
const { linearize } = await import("../src/ingest/structure/linearize.js");
const { OversizeAtomicSegmentError, chunkSentences, inspectChunks, oversizeExtractionRequests, RequestTooLargeError, extractionRequest } = await import("../src/concepts/index.js");
const { DEFAULT_PROMPT_CONFIG } = await import("../src/prompts/system.js");
const { testIdentity } = await import("./helpers/identity.js");

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

type Source = Awaited<ReturnType<typeof ingestText>>;
const input = (importId: string, source: Source) => ({ importId, name: "n", source, unitText: null, selectedTypes: ["multiChoice" as const], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null });
const FILLER = "This paragraph pads the synthetic document so that it passes source admission. ".repeat(8).trim();

describe("size checks run before any dispatch", () => {
  it("MAX_INPUT_TOKENS holds the confirmed limits per model", () => {
    expect(MAX_INPUT_TOKENS).toEqual({ "claude-haiku-4-5-20251001": 200_000, "claude-sonnet-5": 1_000_000 });
  });

  it("an oversize atomic row fails the import with OversizeAtomicSegmentError and zero model calls", async () => {
    const { text, segments } = linearize([{ kind: "paragraph", text: FILLER }, { kind: "table", index: 1, headerRows: 1, rows: [
      [{ text: "Risk", colSpan: 1, rowSpan: 1 }, { text: "Control", colSpan: 1, rowSpan: 1 }],
      [{ text: "Missing records", colSpan: 1, rowSpan: 1 }, { text: "Monthly reconciliation of every ledger account against the bank statement, signed off by the finance manager and filed with the audit working papers", colSpan: 1, rowSpan: 1 }]
    ] }]);
    const source = finaliseDocument("text", text, segments, { sourceId: "src" });
    const provider = new FakeProvider([]);
    await expect(runImport(input("imp-row", source), { store: new MemoryStore(), provider, registry, engineIdentity: testIdentity("x"), chunkTokens: 50 })).rejects.toBeInstanceOf(OversizeAtomicSegmentError);
    expect(provider.requests).toHaveLength(0);
  });

  it("an extraction request over the model's input limit fails with RequestTooLargeError and zero calls; at the real limit the same sentence is accepted", async () => {
    const long = `${"The isolation procedure has many steps that the worker follows in order ".repeat(40).trim()}.`;
    const source = await ingestText(`${FILLER} ${long}`, { sourceId: "src" });
    const longId = source.sentences.find((s) => s.text === long)!.sentenceId;
    limits.override = { "claude-haiku-4-5-20251001": 1000, "claude-sonnet-5": 1000 };
    try {
      const provider = new FakeProvider([]);
      const refused = await runImport(input("imp-big", source), { store: new MemoryStore(), provider, registry, engineIdentity: testIdentity("x") }).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(RequestTooLargeError);
      expect(refused).toMatchObject({ sentenceId: longId, maxOutputTokens: 3000, limit: 1000 });
      expect((refused as InstanceType<typeof RequestTooLargeError>).estimatedInputTokens).toBeGreaterThan(0);
      expect(provider.requests).toHaveLength(0);
    } finally { limits.override = null; }
    const provider = new FakeProvider([]);
    const later = await runImport(input("imp-ok", source), { store: new MemoryStore(), provider, registry, engineIdentity: testIdentity("x") }).catch((e: unknown) => e);
    expect(later).not.toBeInstanceOf(RequestTooLargeError);
    expect(provider.requests.length).toBeGreaterThan(0); // it got as far as dispatching
  });
});

describe("inspection without a run (leap extract)", () => {
  it("inspectChunks lists every oversize atomic row that chunkSentences refuses on, and gives each its own chunk", () => {
    const row = (r: number) => [{ text: `Row ${r}`, colSpan: 1, rowSpan: 1 }, { text: "Monthly reconciliation of every ledger account against the bank statement, signed off by the finance manager", colSpan: 1, rowSpan: 1 }];
    const { text, segments } = linearize([{ kind: "paragraph", text: FILLER }, { kind: "table", index: 1, headerRows: 0, rows: [row(1), row(2)] }]);
    const source = finaliseDocument("text", text, segments, { sourceId: "src" });
    expect(() => chunkSentences(source.sentences, 20)).toThrow(OversizeAtomicSegmentError);
    const { chunks, oversizeAtomicSegments } = inspectChunks(source.sentences, 20);
    expect(oversizeAtomicSegments.map((x) => x.label)).toEqual(["[Table 1, row 1]", "[Table 1, row 2]"]);
    expect(oversizeAtomicSegments.every((x) => x.estimatedTokens > 20 && x.budgetTokens === 20)).toBe(true);
    expect(chunks.filter((c) => c.sentences.some((x) => x.atomic)).every((c) => c.sentences.length === 1)).toBe(true);
    expect(inspectChunks(source.sentences, 6000).chunks.map((c) => c.sentences)).toEqual(chunkSentences(source.sentences, 6000).map((c) => c.sentences));
  });

  it("oversizeExtractionRequests lists what assertExtractionRequestsFit refuses on", async () => {
    const long = `${"The isolation procedure has many steps that the worker follows in order ".repeat(40).trim()}.`;
    const source = await ingestText(`${FILLER} ${long}`, { sourceId: "src" });
    limits.override = { "claude-haiku-4-5-20251001": 1000, "claude-sonnet-5": 1000 };
    try {
      const listed = oversizeExtractionRequests(chunkSentences(source.sentences, 6000), {});
      expect(listed).toEqual([expect.objectContaining({ chunkIndex: 0, sentenceId: source.sentences.find((s) => s.text === long)!.sentenceId, limit: 1000, maxOutputTokens: 3000, model: "claude-haiku-4-5-20251001" })]);
    } finally { limits.override = null; }
    expect(oversizeExtractionRequests(chunkSentences(source.sentences, 6000), {})).toEqual([]);
  });
});

describe("heading context and wire compatibility (R12)", () => {
  it("adds a heading-context block only when a sentence in the chunk has a heading path", async () => {
    const { text, segments } = linearize([{ kind: "heading", level: 1, text: "Topic 2" }, { kind: "heading", level: 2, text: "Audit evidence" }, { kind: "paragraph", text: FILLER }]);
    const structured = finaliseDocument("text", text, segments, { sourceId: "src" });
    const [chunk] = chunkSentences(structured.sentences, 6000);
    const user = extractionRequest(chunk!, {}).user;
    expect(user).toContain("HEADING CONTEXT");
    expect(user).toContain("Topic 2 › Audit evidence");
    const plain = await ingestMarkdown(await readFile(resolve(import.meta.dirname, "fixtures/synthetic/source-electrical-safety.md"), "utf8"), { sourceId: "src" });
    for (const c of chunkSentences(plain.sentences, 330)) expect(extractionRequest(c, {}).user).not.toContain("HEADING CONTEXT");
  });
});
