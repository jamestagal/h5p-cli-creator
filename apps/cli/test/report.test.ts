import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, StoreLockedError, type AttemptStart } from "@leaplearn/generator";
import { FileStore } from "../src/file-store.js";
import { recordReview } from "../src/review.js";
import { costReport, formatCostReport, mappingRows, writeReports, writeReportsLocked } from "../src/report.js";

describe("reports", () => {
  it("splits shared and direct cost, counts retries by retryIndex, computes cost per accepted activity, and lists mapping rows with review-aware status", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    const start = (id: string, op: string, purpose: AttemptStart["purpose"], callKey: string, retryIndex: number) => rec.recordStart({ event: "start", attemptId: id, operationId: op, callKey, retryIndex, retryReason: retryIndex > 0 ? "content" : null, attempt: retryIndex + 1, deadlineMs: 0, purpose, provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    const outcome = (id: string, op: string, cost: number | null, exceeded = false) => rec.recordOutcome({ event: "outcome", attemptId: id, operationId: op, providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: cost, costStatus: cost === null ? "unavailable" : "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: exceeded, underestimateUsdMicro: exceeded ? 40 : cost === null ? null : 0, completedAt: "t" });
    const op = (operationId: string, activityId: string | null, purpose: AttemptStart["purpose"]) => store.putOperation({ operationId, importId: "imp", activityId, purpose, status: "succeeded", idempotencyKey: operationId, contentAttempts: 1, outcome: "ok", billingUncertain: false, startedAt: "t", completedAt: "t" });
    await op("imp:concepts", null, "extract"); await op("imp:produce:act-1:r1", "act-1", "produce");
    // two chunks, a merge and an alignment share one operation; all are first attempts of their own call keys, so none is a retry
    await start("a1", "imp:concepts", "extract", "extract:chunk-0", 0); await outcome("a1", "imp:concepts", 100);
    await start("a2", "imp:concepts", "extract", "extract:chunk-1", 0); await outcome("a2", "imp:concepts", 100);
    await start("a3", "imp:concepts", "merge", "merge", 0); await outcome("a3", "imp:concepts", 50);
    await start("a4", "imp:concepts", "align", "align", 0); await outcome("a4", "imp:concepts", 50);
    await start("a5", "imp:produce:act-1:r1", "produce", "produce:act-1", 0); await outcome("a5", "imp:produce:act-1:r1", 500, true);
    await start("a6", "imp:produce:act-1:r1", "produce", "produce:act-1", 1); await outcome("a6", "imp:produce:act-1:r1", null);
    await store.putActivity({ activityId: "act-1", importId: "imp", type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC1.1", "PC1.2"], error: null, dropped: false });
    await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "T", type: "multiChoice", language: "en", schemaVersion: 1, question: "<p>q</p>", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC1.1", "PC1.2"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: ["a5", "a6"], createdAt: "t" });
    await store.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "n", summary: "s", evidence: [{ evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 3, quote: "Hi." }] }] });

    const before = await costReport(store, "imp");
    expect(before.totals).toEqual({ attempts: 6, costUsdMicro: 800, costStatusCounts: { known: 5, estimated: 0, unavailable: 1 }, reservationExceeded: 1, underestimateUsdMicro: 40, spendOverCapUsdMicro: 0 }); // no import record in this store: nothing is over any cap
    expect(before.shared).toBe(300); expect(before.direct).toBe(500);
    expect(before.retryShare).toBeCloseTo(1 / 6);
    expect(before.perActivity).toEqual([{ activityId: "act-1", type: "multiChoice", status: "promoted", attempts: 2, costUsdMicro: 500 }]);
    expect(before.accepted).toBe(0); expect(before.costPerAcceptedActivityUsdMicro).toBeNull();
    expect(formatCostReport(before)).toContain("| produce |");
    expect((await mappingRows(store, "imp")).map((r) => [r.activityId, r.criterionId, r.status, r.firstQuote])).toEqual([["act-1", "PC1.1", "suggested", "Hi."], ["act-1", "PC1.2", "suggested", "Hi."]]);

    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "owner", notes: null, decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC1.2", decision: "rejected", reviewer: "owner", decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC2.1", decision: "added", reviewer: "owner", decidedAt: "t" });
    const after = await costReport(store, "imp");
    expect(after.accepted).toBe(1); expect(after.costPerAcceptedActivityUsdMicro).toBe(800);
    expect((await mappingRows(store, "imp")).map((r) => [r.criterionId, r.status])).toEqual([["PC1.1", "suggested"], ["PC1.2", "rejected"], ["PC2.1", "added"]]);
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 2, decision: "accepted", reviewer: "owner", notes: null, decidedAt: "t" }); // a decision on another revision does not count
    expect((await costReport(store, "imp")).accepted).toBe(1);
  });
  it("takes spend over the cap from the ledger, so an attempt with no reported cost cannot hide an overspend", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    const start = (id: string, reservedUsdMicro: number) => rec.recordStart({ event: "start", attemptId: id, operationId: "imp:produce:act-1:r1", callKey: `produce:${id}`, retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro, startedAt: "t" });
    const outcome = (id: string, cost: number | null) => rec.recordOutcome({ event: "outcome", attemptId: id, operationId: "imp:produce:act-1:r1", providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: cost, costStatus: cost === null ? "unavailable" : "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: false, underestimateUsdMicro: cost === null ? null : 0, completedAt: "t" });
    await start("a1", 1_000_000); await outcome("a1", 1_900_000); // the only cost the provider reported
    await start("a2", 500_000); await outcome("a2", null); // dispatched and possibly billed, but no cost came back: the ledger spent it at its reservation
    await store.putImport({ importId: "imp", orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 2_000_000, requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 }, budgetUsed: { spentUsdMicro: 2_400_000, reservedUsdMicro: 0, spentTokens: 4, requests: 2, elapsedMs: 10 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" });

    const report = await costReport(store, "imp");
    expect(report.totals.costUsdMicro).toBe(1_900_000); // the sum of known costs alone stays under the cap
    expect(report.totals.spendOverCapUsdMicro).toBe(400_000); // the ledger's spent figure does not, and that is what is reported
    expect(formatCostReport(report)).toContain("from the ledger's spent figure");
  });
  it("reports a zero retry share when every call is a first attempt", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    for (const [id, key] of [["a1", "extract:chunk-0"], ["a2", "extract:chunk-1"], ["a3", "merge"], ["a4", "align"]] as const) {
      await rec.recordStart({ event: "start", attemptId: id, operationId: "imp:concepts", callKey: key, retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "extract", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    }
    expect((await costReport(store, "imp")).retryShare).toBe(0);
  });
});

/** A store seeded with one promoted activity whose provenance suggests PC2.1, ready for a review decision. */
async function seededDir(): Promise<{ dir: string; store: FileStore }> {
  const dir = await mkdtemp(join(tmpdir(), "leap-report-lock-"));
  const store = new FileStore(dir);
  await store.putImport({ importId: "imp", orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: "u".repeat(64), selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" });
  await store.putArtifact("imp", "unit", { code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "u".repeat(64), knowledgeEvidence: [], performanceEvidence: [], elements: [{ id: "E2", number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout devices and tags" }] }] });
  await store.putActivity({ activityId: "act-1", importId: "imp", type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false });
  await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "T", type: "multiChoice", language: "en", schemaVersion: 1, question: "<p>q</p>", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: [], createdAt: "t" });
  return { dir, store };
}

describe("reports are written under the import's directory lock", () => {
  it("refuses to rewrite the reports while another process holds the lock, and leaves the ones on disk alone", async () => {
    const { dir, store } = await seededDir();
    const heldByReview = "activityId,type,title,revision,itemId,criterionId,status,conceptIds,evidenceIds,firstQuote\nact-1,multiChoice,T,1,,PC2.1,confirmed,c1,ev-s1,\n";
    await writeFile(join(dir, "mapping.csv"), heldByReview);
    await mkdir(join(dir, "lock"));
    await writeFile(join(dir, "lock", "owner.json"), JSON.stringify({ importId: "imp", token: "review", pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() })); // a live local pid: never reclaimed
    await expect(writeReportsLocked(store, "imp", dir)).rejects.toBeInstanceOf(StoreLockedError);
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toBe(heldByReview);
  });

  it("closes the generate/review overlap: a review's confirmed mapping survives a generate report write that arrives during it", async () => {
    const { dir } = await seededDir();
    const generateStore = new FileStore(dir); // the generate process, which has released the import's lock
    await writeReportsLocked(generateStore, "imp", dir);
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toContain("PC2.1,suggested");

    const reviewStore = new FileStore(dir);
    const reviewLock = await reviewStore.lock("imp"); // leap review takes the lock and records a decision
    await recordReview(reviewStore, "imp", { kind: "alignment", activityId: "act-1", reviewer: "owner", criterionId: "PC2.1", decision: "confirmed", itemId: null });
    const reviewWrite = writeReports(reviewStore, "imp", dir);
    await expect(writeReportsLocked(generateStore, "imp", dir)).rejects.toBeInstanceOf(StoreLockedError); // generate's report step, arriving mid-review
    await reviewWrite;
    await reviewLock.release();
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toContain("PC2.1,confirmed");

    await writeReportsLocked(generateStore, "imp", dir); // and once the lock is free the snapshot is taken inside it, so it carries the decision too
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toContain("PC2.1,confirmed");
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).not.toContain("PC2.1,suggested");
  });
});
