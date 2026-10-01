import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { targetsOf, type ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import { ReplayProvider } from "../src/llm/replay-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportDeps } from "../src/pipeline/run-import.js";
import { testIdentity } from "./helpers/identity.js";
import { S1_DEPS, S1_SETTINGS, s1Input, settingsOf } from "./helpers/s1-settings.js";
import { importCompletenessProblems } from "./helpers/import-complete.js";

const root = resolve(import.meta.dirname, "../../..");
/** Where S1 records. The phase-2 recordings were archived, unchanged, in fixtures/historical/ (see historical-archive.test.ts). */
const replayDir = resolve(import.meta.dirname, "fixtures/replay/synthetic");

let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

/**
 * S1 (plan Task 10, R12): current PDF ingestion replayed from the synthetic recordings made on 2 Oct 2026, under
 * S1_SETTINGS. The historical phase-2 recordings remain in their separate, immutable archive.
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
    // A complete run only: status ready, every selected type planned, every planned activity promoted with a valid
    // build and matching package bytes. An incomplete recording fails here (plan Task 10 step 5).
    expect(await importCompletenessProblems(store, record, input.selectedTypes, deps.engineIdentity)).toEqual([]);
    const activities = await store.listActivities(input.importId);
    expect(activities.filter((a) => a.type === "multiChoice")).toHaveLength(5);
    expect(activities.filter((a) => a.type === "blanks")).toHaveLength(3);
    expect(activities.filter((a) => a.type === "flashcards")).toHaveLength(1);

    const unit = (await store.getArtifact<UnitOfCompetency>(input.importId, "unit"))!;
    const map = (await store.getArtifact<ConceptMap>(input.importId, "conceptMap"))!;
    const targets = targetsOf(unit);
    expect(targets.filter((t) => t.kind === "ke").map((t) => t.id)).toEqual(["KE1", "KE2", "KE2.1", "KE2.2"]);
    expect(map.alignment!.criteria.map((c) => c.criterionId)).toEqual(targets.map((t) => t.id));
    expect(map.alignment!.unitTextHash).toBe(unit.textHash);
    expect(map.alignment!.unsupportedCriteriaIds).toEqual(["PC3.2"]);
    expect(unit.assessmentConditions).toContain("simulated environment");
    const instructionIds = new Set(map.concepts.filter((c) => c.kind === "rto-instruction").map((c) => c.conceptId));
    expect(instructionIds.size).toBe(1);
    for (const a of activities) {
      expect(a.unitTextHash).toBe(unit.textHash);
      expect(a.conceptIds.some((id) => instructionIds.has(id))).toBe(false);
    }
    for (const criterion of map.alignment!.criteria) expect(criterion.conceptIds.some((id) => instructionIds.has(id))).toBe(false);

    const attempts = await store.listAttempts(input.importId);
    const starts = attempts.filter((e) => e.event === "start");
    const outcomes = attempts.filter((e) => e.event === "outcome");
    expect(starts).toHaveLength(13);
    expect(outcomes).toHaveLength(13);
    expect(starts.every((s) => s.retryIndex === 0)).toBe(true);
    expect(outcomes.every((o) => o.costStatus === "known")).toBe(true);
  });
});
