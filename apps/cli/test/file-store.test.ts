import { describe, it, expect, vi } from "vitest";
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FileStore, readJsonl, StoreCorruptError } from "../src/file-store.js";

/** Failure injection for the one filesystem call the tail repair makes: each queued error fails the next append, everything else is the real fs. */
const appendFailures = vi.hoisted(() => [] as Error[]);
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const appendFile: typeof actual.appendFile = (...args) => {
    const failure = appendFailures.shift();
    return failure ? Promise.reject(failure) : actual.appendFile(...args);
  };
  return { ...actual, appendFile };
});

const importRecord = { importId: "imp", orgId: "local", name: "n", sourceType: "markdown" as const, status: "queued" as const, customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice" as const], fingerprint: "f".repeat(64), budget: { usdMicro: 10, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" };
const start = { event: "start" as const, attemptId: "a1", operationId: "imp:plan", origin: "shared" as const, requestId: null, callKey: "plan", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "plan" as const, provider: "fake" as const, model: "m", credentialOwner: "server" as const, reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" };
const operationRecord = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, origin: "shared" as const, requestId: null, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
const activityRecord = { activityId: "act-1", importId: "imp", type: "multiChoice" as const, order: 0, status: "planned" as const, currentRevision: null, conceptIds: [], criteriaIds: [], error: null, dropped: false };
const revisionRecord = { activityId: "act-1", revision: 1, state: "candidate" as const, spec: { id: "act-1", title: "T", type: "multiChoice" as const, language: "en", schemaVersion: 1 as const, question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true }, schemaVersion: 1, promptVersion: "p", origin: "generate" as const, requestId: null, modelConfig: { provider: "fake", models: {}, profiles: {} }, note: null, currentBuildId: null, attemptIds: [], createdAt: "t" };

const buildRecord = { importId: "imp", activityId: "act-1", revision: 1, buildId: "0123456789abcdef", buildKey: "builds/act-1-r1-0123456789ab.h5p", sha256: createHash("sha256").update("PK..").digest("hex"), byteLength: 4, engineFingerprint: "0123456789ab".padEnd(64, "0"), engineDisplay: "engine@0.1.0+0123456789ab", engineInputs: { engineDist: [["index.js", "e".repeat(64)]] as [string, string][], workspaceDist: [] as [string, string][], librariesLockSha256: "1".repeat(64), zlib: "1.3.1" }, nodeVersion: "20.20.2", builtAt: "t" };

describe("FileStore", () => {
  it("round-trips records, appends ledgers, keeps the latest review per key, and leaves no temp files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-store-"));
    const store = new FileStore(dir);
    await store.putImport(importRecord);
    expect(await store.getImport("imp")).toEqual(importRecord);
    await store.putArtifact("imp", "chunk-3", [{ tempId: "k3-0" }]);
    expect(await store.getArtifact("imp", "chunk-3")).toEqual([{ tempId: "k3-0" }]);
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, origin: "shared" as const, requestId: null, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await store.putOperation(op);
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    expect((await store.listOperations("imp")).map((o) => o.status)).toEqual(["succeeded"]);
    await store.recorderFor("imp").recordStart(start);
    expect((await store.listAttempts("imp")).map((e) => e.event)).toEqual(["start"]);
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "rejected", reviewer: "r", notes: null, decidedAt: "t1" });
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "r", notes: "fine", decidedAt: "t2" });
    expect((await store.listAcceptances("imp")).map((a) => a.decision)).toEqual(["accepted"]);
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC1.1", decision: "confirmed", reviewer: "r", decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: "b1", unitTextHash: null, criterionId: "PC1.1", decision: "rejected", reviewer: "r", decidedAt: "t" });
    expect((await store.listAlignmentReviews("imp")).map((r) => [r.itemId, r.decision])).toEqual([[null, "confirmed"], ["b1", "rejected"]]);
    await store.putBuild("builds/act-1-r1-0123456789ab.h5p", Buffer.from("PK.."));
    expect((await store.getBuild("builds/act-1-r1-0123456789ab.h5p"))?.toString()).toBe("PK..");
    await store.putBuildRecord(buildRecord);
    expect(await store.getBuildRecord(buildRecord.buildId)).toEqual(buildRecord);
    expect(await store.listBuilds("act-1")).toEqual([buildRecord]);
    const files = await readdir(dir, { recursive: true });
    expect(files.some((f) => /\.tmp-/.test(f))).toBe(false);
    expect((await readFile(join(dir, "operations.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
  });
  it("tolerates a crash-truncated final line and rejects any other malformed line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-jsonl-"));
    const path = join(dir, "attempts.jsonl");
    await writeFile(path, `${JSON.stringify(start)}\n${JSON.stringify({ ...start, attemptId: "a2" })}\n{"event":"outcome","attemptId":"a2","opera`);
    const read = await readJsonl<{ attemptId: string }>(path);
    expect(read.records.map((r) => r.attemptId)).toEqual(["a1", "a2"]);
    expect(read.truncatedTail).toBe(true);
    expect((await new FileStore(dir).listAttempts("imp")).map((e) => e.attemptId)).toEqual(["a1", "a2"]);
    await writeFile(path, `${JSON.stringify(start)}\nnot json\n${JSON.stringify({ ...start, attemptId: "a3" })}\n`);
    await expect(readJsonl(path)).rejects.toMatchObject({ name: "StoreCorruptError", line: 2 });
    await expect(new FileStore(dir).listAttempts("imp")).rejects.toBeInstanceOf(StoreCorruptError);
    const clean = join(dir, "clean.jsonl");
    await appendFile(clean, `${JSON.stringify(start)}\n`);
    expect((await readJsonl(clean)).truncatedTail).toBe(false);
  });
  it("repairs a damaged tail before appending, so the next record never merges into a broken line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-repair-"));
    const path = join(dir, "attempts.jsonl");
    await writeFile(path, `${JSON.stringify(start)}\n{"event":"outcome","attemptId":"a1","opera`); // crash-truncated record
    const store = new FileStore(dir);
    await store.recorderFor("imp").recordStart({ ...start, attemptId: "a2" });
    const afterTruncated = await readJsonl<{ attemptId: string }>(path);
    expect(afterTruncated.records.map((r) => r.attemptId)).toEqual(["a1", "a2"]);
    expect(afterTruncated.truncatedTail).toBe(false);
    expect((await new FileStore(dir).listAttempts("imp")).map((e) => e.attemptId)).toEqual(["a1", "a2"]); // a fresh reopen sees a clean ledger
    const path2 = join(dir, "operations.jsonl");
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, origin: "shared" as const, requestId: null, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await writeFile(path2, JSON.stringify(op)); // a complete final record that lost only its newline
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    const ops = await readJsonl<{ status: string }>(path2);
    expect(ops.records.map((o) => o.status)).toEqual(["running", "succeeded"]);
    expect((await readFile(path2, "utf8")).endsWith("\n")).toBe(true);
    await writeFile(path2, `${JSON.stringify(op)}\nnot json\n`);
    await expect(store.putOperation(op)).rejects.toBeInstanceOf(StoreCorruptError); // corruption elsewhere is still refused
  });
  it("keeps a complete final record when the newline repair itself fails, and appends cleanly on the retry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-repair-fail-"));
    const path = join(dir, "operations.jsonl");
    const onDisk = JSON.stringify(operationRecord); // a complete, billed record that lost only its newline
    await writeFile(path, onDisk);
    const store = new FileStore(dir);
    appendFailures.push(Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }));
    await expect(store.putOperation({ ...operationRecord, status: "succeeded", outcome: "ok" })).rejects.toMatchObject({ code: "ENOSPC" });
    expect(appendFailures).toHaveLength(0); // the failure hit the repair's newline append, not some later call
    expect(await readFile(path, "utf8")).toBe(onDisk); // the write error never costs the record
    await store.putOperation({ ...operationRecord, status: "succeeded", outcome: "ok" });
    expect((await readJsonl<{ status: string }>(path)).records.map((o) => o.status)).toEqual(["running", "succeeded"]);
  });
  it("serialises concurrent first appends to a damaged ledger: both new records survive a reopen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-queue-"));
    const path = join(dir, "attempts.jsonl");
    await writeFile(path, `${JSON.stringify(start)}\n{"event":"outcome","attemptId":"a1","opera`);
    const store = new FileStore(dir);
    const rec = store.recorderFor("imp");
    await Promise.all([rec.recordStart({ ...start, attemptId: "a2" }), rec.recordStart({ ...start, attemptId: "a3" })]); // two lanes hit the ledger at once
    expect((await new FileStore(dir).listAttempts("imp")).map((e) => e.attemptId)).toEqual(["a1", "a2", "a3"]);
    expect((await readJsonl(path)).truncatedTail).toBe(false);
  });
  it("stops writing when its lock has been removed from under it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-lost-store-"));
    const store = new FileStore(dir);
    const lock = await store.lock("imp");
    await rm(join(dir, "lock"), { recursive: true });
    await expect(store.recorderFor("imp").recordStart(start)).rejects.toMatchObject({ name: "LockLostError" });
    await lock.release();
  });
  it("refuses every write once a second process holds the lock, and leaves nothing behind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-guard-"));
    const store = new FileStore(dir);
    const lock = await store.lock("imp");
    await rm(join(dir, "lock"), { recursive: true }); // an operator removed it by hand
    await mkdir(join(dir, "lock"));
    await writeFile(join(dir, "lock", "owner.json"), JSON.stringify({ importId: "imp", token: "second-process", pid: process.pid, hostname: hostname(), startedAt: "t" })); // and another process took a fresh one
    await expect(store.putImport(importRecord)).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putArtifact("imp", "conceptMap", { concepts: [] })).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putActivity(activityRecord)).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putRevision(revisionRecord)).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putBuild("builds/act-1-r1-0123456789ab.h5p", Buffer.from("PK.."))).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putBuildRecord(buildRecord)).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putOperation(operationRecord)).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "r", notes: null, decidedAt: "t" })).rejects.toMatchObject({ name: "LockLostError" });
    await expect(store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC1.1", decision: "confirmed", reviewer: "r", decidedAt: "t" })).rejects.toMatchObject({ name: "LockLostError" });
    const left = (await readdir(dir, { recursive: true })).filter((f) => !f.startsWith("lock"));
    expect(left).toEqual([]); // no record, no artifact, no build, no ledger, no half-written .tmp-
    await lock.release(); // not ours: the second process's lock survives
    expect(JSON.parse(await readFile(join(dir, "lock", "owner.json"), "utf8"))).toMatchObject({ token: "second-process" });
  });
  it("never overwrites a build or a build record: identical content is a no-op that leaves the file untouched, different content throws BuildIntegrityError", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-builds-"));
    const store = new FileStore(dir);
    const key = "builds/act-1-r1-0123456789ab.h5p";
    await store.putBuild(key, Buffer.from("PK.."));
    const before = await stat(join(dir, key));
    await new Promise((r) => setTimeout(r, 20));
    await store.putBuild(key, Buffer.from("PK.."));
    expect((await stat(join(dir, key))).mtimeMs).toBe(before.mtimeMs);
    const refused = await store.putBuild(key, Buffer.from("PK!!")).catch((e: unknown) => e);
    expect(refused).toMatchObject({ name: "BuildIntegrityError" });
    expect((refused as Error).message).toContain(key);
    expect((refused as Error).message).toContain(createHash("sha256").update("PK..").digest("hex"));
    expect((refused as Error).message).toContain(createHash("sha256").update("PK!!").digest("hex"));
    expect((await readFile(join(dir, key))).toString()).toBe("PK..");

    await store.putBuildRecord(buildRecord);
    const recordPath = join(dir, "builds", "records", `${buildRecord.buildId}.json`);
    const recordBefore = await stat(recordPath);
    await new Promise((r) => setTimeout(r, 20));
    await store.putBuildRecord({ ...buildRecord });
    expect((await stat(recordPath)).mtimeMs).toBe(recordBefore.mtimeMs);
    await expect(store.putBuildRecord({ ...buildRecord, builtAt: "later" })).rejects.toMatchObject({ name: "BuildIntegrityError" });
    expect(await store.getBuildRecord(buildRecord.buildId)).toEqual(buildRecord);
    expect((await readdir(dir, { recursive: true })).some((f) => /\.tmp-/.test(f))).toBe(false);
  });

  it("refuses a build key outside builds/", async () => {
    const store = new FileStore(await mkdtemp(join(tmpdir(), "leap-builds-key-")));
    await expect(store.putBuild("../escape.h5p", Buffer.from("PK.."))).rejects.toThrow(/build key/);
    await expect(store.putBuild("builds/../../escape.h5p", Buffer.from("PK.."))).rejects.toThrow(/build key/);
  });

  it("reads a missing build or build record as absent", async () => {
    const store = new FileStore(await mkdtemp(join(tmpdir(), "leap-builds-none-")));
    expect(await store.getBuild("builds/act-1-r1-0123456789ab.h5p")).toBeNull();
    expect(await store.getBuildRecord("0123456789abcdef")).toBeNull();
    expect(await store.listBuilds("act-1")).toEqual([]);
  });
});
