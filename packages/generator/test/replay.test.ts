import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { ReplayProvider } from "../src/llm/replay-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportDeps } from "../src/pipeline/run-import.js";
import { testIdentity } from "./helpers/identity.js";
import { S1_DEPS, S1_SETTINGS, s1Input, settingsOf } from "./helpers/s1-settings.js";

const root = resolve(import.meta.dirname, "../../..");
/** Where S1 records. The phase-2 recordings were archived, unchanged, in fixtures/historical/ (see historical-archive.test.ts). */
const replayDir = resolve(import.meta.dirname, "fixtures/replay/synthetic");

let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

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
