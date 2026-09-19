import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { ingestPdf } from "../src/ingest/index.js";
import { computeCost } from "../src/llm/cost.js";
import { ReplayProvider } from "../src/llm/replay-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptOutcome } from "../src/llm/types.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
const replayDir = resolve(fixtures, "replay/synthetic");
const MISSING_FIXTURES = "record the fixtures with `leap generate --provider record` first (Task 17 step 1)";

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

describe("end to end over recorded responses", () => {
  it("replays the demo import from the synthetic PDF and unit without network access", async () => {
    expect(existsSync(replayDir), MISSING_FIXTURES).toBe(true);
    const source = await ingestPdf(await readFile(resolve(fixtures, "synthetic/source-electrical-safety.pdf")), { sourceId: "src-source-electrical-safety.pdf", fileName: "source-electrical-safety.pdf" });
    const unitText = await readFile(resolve(fixtures, "synthetic/unit-synele001.txt"), "utf8");
    const store = new MemoryStore();
    const record = await runImport(
      { importId: "leap-demo", name: "source-electrical-safety.pdf", source, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 2_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null },
      { store, provider: new ReplayProvider(replayDir), registry, engineFingerprint: "replay" }
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
