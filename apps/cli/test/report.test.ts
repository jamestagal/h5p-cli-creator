import { describe, it, expect } from "vitest";
import { MemoryStore, type AttemptStart } from "@leaplearn/generator";
import { costReport, formatCostReport, mappingRows } from "../src/report.js";

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
  it("reports a zero retry share when every call is a first attempt", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    for (const [id, key] of [["a1", "extract:chunk-0"], ["a2", "extract:chunk-1"], ["a3", "merge"], ["a4", "align"]] as const) {
      await rec.recordStart({ event: "start", attemptId: id, operationId: "imp:concepts", callKey: key, retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "extract", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    }
    expect((await costReport(store, "imp")).retryShare).toBe(0);
  });
});
