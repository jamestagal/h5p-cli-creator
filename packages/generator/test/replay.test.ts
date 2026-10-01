import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { ingestPdf, textHash, type SourceDocument } from "../src/ingest/index.js";
import { computeCost } from "../src/llm/cost.js";
import { ReplayProvider } from "../src/llm/replay-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportDeps } from "../src/pipeline/run-import.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptOutcome } from "../src/llm/types.js";
import { testIdentity } from "./helpers/identity.js";
import { S1_DEPS, S1_SETTINGS, s1Input, settingsOf } from "./helpers/s1-settings.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
const replayDir = resolve(fixtures, "replay/synthetic");
const MISSING_FIXTURES = "record the fixtures with `leap generate --provider record` first (Task 17 step 1)";
/** The source document the recordings were made from, reconstructed from 841bfd7 (see fixtures/historical/README.md). */
const historicalSource = resolve(fixtures, "historical/source-electrical-safety.pdf.841bfd7.source.json");

/** The shape `RecordingProvider` writes: the recorded response plus enough of the request to attribute it. */
interface RecordedFixture {
  request: { purpose: string; model: string; maxOutputTokens: number; userPreview: string };
  response: {
    providerRequestId: string | null;
    model: string;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
  };
}

async function readRecordedFixtures(dir: string): Promise<RecordedFixture[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8")) as RecordedFixture));
}

let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

/**
 * Historical pipeline compatibility (plan R12, amended 30 Sep 2026): the recorded requests and responses are kept
 * unchanged and replayed from the frozen source document they were made from. This is NOT coverage of current PDF
 * ingestion, which no longer stores the parser's page labels; that path is tested offline in pipeline.test.ts, and
 * current-PDF replay coverage returns when S1 records it.
 */
describe("historical pipeline compatibility: recorded responses over the frozen pre-fix source document", () => {
  it("the frozen document is the pre-fix extraction (page labels included), not what current ingestion produces", async () => {
    const frozen = JSON.parse(await readFile(historicalSource, "utf8")) as SourceDocument;
    expect(frozen.textHash).toBe(textHash(frozen.text));
    expect(frozen.metadata.extractionVersion).toBe("2026-09-28.1");
    expect(frozen.text).toMatch(/^-- 1 of 2 --$/m);
    for (const s of frozen.sentences) expect(frozen.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    const current = await ingestPdf(await readFile(resolve(fixtures, "synthetic/source-electrical-safety.pdf")), { sourceId: "src-source-electrical-safety.pdf", fileName: "source-electrical-safety.pdf" });
    expect(current.textHash).not.toBe(frozen.textHash);
    expect(current.metadata.extractionVersion).not.toBe(frozen.metadata.extractionVersion);
  });

  it("replays the demo import from the frozen source document and the unit without network access", async () => {
    expect(existsSync(replayDir), MISSING_FIXTURES).toBe(true);
    const source = JSON.parse(await readFile(historicalSource, "utf8")) as SourceDocument;
    const unitText = await readFile(resolve(fixtures, "synthetic/unit-synele001.txt"), "utf8");
    const store = new MemoryStore();
    const record = await runImport(
      { importId: "leap-demo", name: "source-electrical-safety.pdf", source, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 2_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null },
      { store, provider: new ReplayProvider(replayDir), registry, engineIdentity: testIdentity("replay") }
    );
    expect(["ready", "ready_with_failures"]).toContain(record.status);
    const activities = await store.listActivities("leap-demo");
    expect(activities.filter((a) => a.status === "promoted").length).toBeGreaterThanOrEqual(3);
    const map = await store.getArtifact<{ alignment?: { unsupportedCriteriaIds: string[] } }>("leap-demo", "conceptMap");
    expect(map?.alignment?.unsupportedCriteriaIds).toContain("PC3.2");
    const outcomes = (await store.listAttempts("leap-demo")).filter((e): e is AttemptOutcome => e.event === "outcome");
    expect(outcomes.every((o) => o.costStatus === "known")).toBe(true);
    expect(outcomes.every((o) => typeof o.reservationExceeded === "boolean" && o.underestimateUsdMicro !== null)).toBe(true); // recorded on every attempt; the demo doc reports the totals

    // Spec §10 asks the recorded-provider tests to assert exact figures including cache accounting.
    // The figures come from the fixture files, so a re-recording updates them in one place.
    const recorded = await readRecordedFixtures(replayDir);
    const byRequestId = new Map(recorded.filter((f) => f.request.purpose === "produce" && f.response.providerRequestId !== null).map((f) => [f.response.providerRequestId, f]));
    const replayedProduce = outcomes.filter((o) => o.providerRequestId !== null && byRequestId.has(o.providerRequestId));
    expect(replayedProduce.length).toBeGreaterThan(0);
    for (const outcome of replayedProduce) {
      const fixture = byRequestId.get(outcome.providerRequestId)!;
      const usage = fixture.response.usage;
      expect(usage, `fixture ${fixture.response.providerRequestId} recorded no usage`).not.toBeNull();
      expect(outcome.inputTokens).toBe(usage!.inputTokens);
      expect(outcome.outputTokens).toBe(usage!.outputTokens);
      expect(outcome.cacheReadTokens).toBe(usage!.cacheReadTokens);
      expect(outcome.cacheWriteTokens).toBe(usage!.cacheWriteTokens);
      expect(outcome.costUsdMicro).toBe(computeCost(usage, fixture.request.model).costUsdMicro);
    }

    // cost.json's totals.costUsdMicro is this sum, and spendOverCapUsdMicro is the ledger's spend beyond the cap.
    const summed = outcomes.reduce((total, o) => total + (o.costUsdMicro ?? 0), 0);
    expect(summed).toBe(record.budgetUsed.spentUsdMicro);
    expect(Math.max(0, record.budgetUsed.spentUsdMicro - record.budget.usdMicro)).toBe(0);
  });
});

/**
 * S1 (plan Task 10, R12): current PDF ingestion replayed from the recordings S1 makes, under S1_SETTINGS. Until S1 is
 * recorded the replay misses at the first changed request (parseUnit); scripts/expect-replay-miss.mjs checks that this
 * is the only reason this file fails.
 */
describe("S1: current PDF ingestion replayed under S1_SETTINGS", () => {
  /** This consumer's runImport arguments: everything that decides request content and order comes from S1_SETTINGS. */
  async function s1Run(store: MemoryStore) {
    const input = await s1Input(1_000_000);
    const deps: RunImportDeps = { store, provider: new ReplayProvider(replayDir), registry, engineIdentity: testIdentity("replay-s1"), ...S1_DEPS };
    return { input, deps };
  }

  it("this consumer's inputs deep-equal S1_SETTINGS", async () => {
    const { input, deps } = await s1Run(new MemoryStore());
    expect(await settingsOf(input, deps)).toEqual(S1_SETTINGS);
    // the comparison can fail: a different lane count, unit text or chunk budget each shows
    expect(await settingsOf(input, { ...deps, concurrency: 3 })).not.toEqual(S1_SETTINGS);
    expect(await settingsOf({ ...input, unitText: `${input.unitText}\n` }, deps)).not.toEqual(S1_SETTINGS);
    const withoutChunkTokens: RunImportDeps = { ...deps }; delete withoutChunkTokens.chunkTokens;
    expect(await settingsOf(input, withoutChunkTokens)).toEqual(S1_SETTINGS); // runImport's default is S1's
    expect(await settingsOf(input, { ...deps, chunkTokens: 4000 })).not.toEqual(S1_SETTINGS);
  });

  it("replays S1 from the recorded responses without network access", async () => {
    const store = new MemoryStore();
    const { input, deps } = await s1Run(store);
    const record = await runImport(input, deps);
    expect(["ready", "ready_with_failures"]).toContain(record.status);
  });
});
