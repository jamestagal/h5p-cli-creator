import { describe, it, expect } from "vitest";
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, readJsonl, StoreCorruptError } from "../src/file-store.js";

const importRecord = { importId: "imp", orgId: "local", name: "n", sourceType: "markdown" as const, status: "queued" as const, customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice" as const], fingerprint: "f".repeat(64), budget: { usdMicro: 10, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" };
const start = { event: "start" as const, attemptId: "a1", operationId: "imp:plan", callKey: "plan", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "plan" as const, provider: "fake" as const, model: "m", credentialOwner: "server" as const, reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" };

describe("FileStore", () => {
  it("round-trips records, appends ledgers, keeps the latest review per key, and leaves no temp files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-store-"));
    const store = new FileStore(dir);
    await store.putImport(importRecord);
    expect(await store.getImport("imp")).toEqual(importRecord);
    await store.putArtifact("imp", "chunk-3", [{ tempId: "k3-0" }]);
    expect(await store.getArtifact("imp", "chunk-3")).toEqual([{ tempId: "k3-0" }]);
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
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
    const key = await store.putBuild("imp", "act-1", 1, Buffer.from("PK.."));
    expect((await store.getBuild(key))?.toString()).toBe("PK..");
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
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await writeFile(path2, JSON.stringify(op)); // a complete final record that lost only its newline
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    const ops = await readJsonl<{ status: string }>(path2);
    expect(ops.records.map((o) => o.status)).toEqual(["running", "succeeded"]);
    expect((await readFile(path2, "utf8")).endsWith("\n")).toBe(true);
    await writeFile(path2, `${JSON.stringify(op)}\nnot json\n`);
    await expect(store.putOperation(op)).rejects.toBeInstanceOf(StoreCorruptError); // corruption elsewhere is still refused
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
});
