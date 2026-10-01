import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { assertWritableStoreVersion, isStoreVersionError, LegacyStoreError, MalformedStoreVersionError, STORE_VERSION, storeVersionOf, UnsupportedStoreVersionError, type OperationRecord, type RevisionRecord } from "../src/store/types.js";
import { assertCurrentLayout, ObsoleteStoreLayoutError } from "../src/store/layout.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { FakeProvider } from "../src/llm/fake-provider.js";
import { ingestText } from "../src/ingest/index.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import { testIdentity } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");

/** Records as JSON.parse returns them: the TypeScript type of `storeVersion` is not enforced on disk. */
const parsed = (json: string): object => JSON.parse(json) as object;

describe("store version of a parsed import record", () => {
  it("treats an absent version as a phase-2 (version 1) import", () => {
    expect(storeVersionOf(parsed(`{"importId":"i"}`), "import i")).toBe(1);
    expect(() => assertWritableStoreVersion(parsed(`{"importId":"i"}`), "import i")).toThrow(LegacyStoreError);
  });

  it("permits writes only for the numeric current version", () => {
    expect(STORE_VERSION).toBe(2);
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":2}`), "import i")).not.toThrow();
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":1}`), "import i")).toThrow(LegacyStoreError);
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":3}`), "import i")).toThrow(UnsupportedStoreVersionError);
  });

  it.each([
    [`"bogus"`], [`"2"`], [`{}`], [`[]`], [`null`], [`true`], [`2.5`], [`0`], [`-2`], [`1e400`]
  ])("refuses a malformed version %s instead of reading it as some number", (raw) => {
    const record = parsed(`{"importId":"i","storeVersion":${raw}}`);
    expect(() => storeVersionOf(record, "import i")).toThrow(MalformedStoreVersionError);
    expect(() => assertWritableStoreVersion(record, "import i")).toThrow(MalformedStoreVersionError);
    expect(() => assertWritableStoreVersion(record, "import i")).toThrow(/import i has a malformed storeVersion/);
  });
});

describe("store-version-2 imports from before build records", () => {
  const T = "2026-09-29T01:00:00.000Z";
  async function devStore(): Promise<MemoryStore> {
    const store = new MemoryStore();
    await store.putImport({ storeVersion: 2, importId: "dev", orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 1_000_000, requests: 10, tokens: 10_000, elapsedMs: 60_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: { startedAt: T, elapsedBeforeMs: 0 }, error: null, idempotencyKey: "dev", createdAt: T, updatedAt: T });
    await store.putActivity({ activityId: "act-1", importId: "dev", type: "multiChoice", order: 0, status: "generated", currentRevision: null, conceptIds: [], criteriaIds: [], error: null, dropped: false, unitTextHash: null });
    const obsoleteRevision = { activityId: "act-1", revision: 1, state: "candidate", spec: { id: "act-1", title: "T", type: "multiChoice", language: "en", schemaVersion: 1, question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true }, schemaVersion: 1, promptVersion: "p", origin: "generate", requestId: null, modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "engine@0.1.0+lock:3f2a9c1b7d4e", note: null, buildKey: null, attemptIds: [], createdAt: T };
    await store.putRevision(obsoleteRevision as unknown as RevisionRecord);
    const obsoleteOperation = { operationId: "dev:produce:act-1:r1", importId: "dev", activityId: "act-1", purpose: "produce", status: "running", idempotencyKey: "dev:produce:act-1:r1", contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: T, completedAt: null };
    await store.putOperation(obsoleteOperation as unknown as OperationRecord);
    return store;
  }
  const snapshot = async (store: MemoryStore) => JSON.stringify([await store.getImport("dev"), await store.listActivities("dev"), await store.listRevisions("act-1"), await store.listOperations("dev"), await store.listAttempts("dev"), await store.listBuilds("act-1")]);

  it("names what is missing, refuses, and changes nothing", async () => {
    const store = await devStore();
    const before = await snapshot(store);
    const refused = await assertCurrentLayout(store, "dev", "import dev").catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ObsoleteStoreLayoutError);
    expect(isStoreVersionError(refused)).toBe(true);
    expect((refused as Error).message).toMatch(/^import dev was written by an earlier phase-3 development build.*revision act-1 r1 has no currentBuildId; operation dev:produce:act-1:r1 has no origin.*Use a new output directory\.$/);
    expect(await snapshot(store)).toBe(before);
  });

  it("is refused by runImport under the lock, before any write or model call", async () => {
    const store = await devStore();
    const before = await snapshot(store);
    const empty = new FakeProvider([]);
    const registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
    const source = await ingestText("Lock it out before work starts. ".repeat(20), { sourceId: "src-dev" }); // 640 characters: sources below 500 code points are refused
    const input = { importId: "dev", name: "n", source, unitText: null, selectedTypes: ["multiChoice" as const], budget: { usdMicro: 1_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null };
    await expect(runImport(input, { store, provider: empty, registry, engineIdentity: testIdentity("dev") })).rejects.toBeInstanceOf(ObsoleteStoreLayoutError);
    expect(empty.requests).toHaveLength(0);
    expect(await snapshot(store)).toBe(before);
    await expect(store.lock("dev")).resolves.toBeDefined(); // the lock was released
  });

  it("accepts a current-layout store", async () => {
    const store = new MemoryStore();
    await expect(assertCurrentLayout(store, "none", "import none")).resolves.toBeUndefined();
  });
});
