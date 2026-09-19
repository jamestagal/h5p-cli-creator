import { describe, it, expect } from "vitest";
import { MemoryStore } from "@leaplearn/generator";
import { recordReview, ReviewError } from "../src/review.js";
import { costReport, mappingRows } from "../src/report.js";

async function seeded(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.putImport({ importId: "imp", orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: "u".repeat(64), selectedTypes: ["blanks"], fingerprint: "f".repeat(64), budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" });
  await store.putArtifact("imp", "unit", { code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "u".repeat(64), knowledgeEvidence: [], performanceEvidence: [], elements: [{ id: "E2", number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout devices and tags" }, { id: "PC2.2", number: "2.2", text: "Test for dead" }] }] });
  await store.putActivity({ activityId: "act-4", importId: "imp", type: "blanks", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false });
  await store.putActivity({ activityId: "act-5", importId: "imp", type: "blanks", order: 1, status: "failed", currentRevision: null, conceptIds: ["c1"], criteriaIds: [], error: "content: x", dropped: false });
  await store.putRevision({ activityId: "act-4", revision: 1, state: "promoted", spec: { id: "act-4", title: "T", type: "blanks", language: "en", schemaVersion: 1, taskDescription: "d", passage: "Only the {{b1}} may remove it and it takes {{b2}} people.", blanks: [{ id: "b1", answers: ["worker"], provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } }, { id: "b2", answers: ["two"], provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s2"], criteriaIds: [] } }], caseSensitive: false, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: [], createdAt: "t" });
  const rec = store.recorderFor("imp");
  await rec.recordStart({ event: "start", attemptId: "a1", operationId: "imp:produce:act-4:r1", callKey: "produce:act-4", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
  await rec.recordOutcome({ event: "outcome", attemptId: "a1", operationId: "imp:produce:act-4:r1", providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: 900, costStatus: "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: false, underestimateUsdMicro: 899, completedAt: "t" });
  return store;
}

describe("leap review", () => {
  it("records an acceptance bound to the promoted revision and changes cost per accepted activity", async () => {
    const store = await seeded();
    const record = await recordReview(store, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "owner", decision: "accepted", notes: "plumbing check" }, () => new Date("2026-09-19T00:00:00Z"));
    expect(record).toEqual({ importId: "imp", activityId: "act-4", revision: 1, decision: "accepted", reviewer: "owner", notes: "plumbing check", decidedAt: "2026-09-19T00:00:00.000Z" });
    const report = await costReport(store, "imp");
    expect(report.accepted).toBe(1);
    expect(report.costPerAcceptedActivityUsdMicro).toBe(900);
    await recordReview(store, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "owner", decision: "rejected", notes: null });
    expect((await costReport(store, "imp")).accepted).toBe(0);
  });
  it("records alignment decisions per item and criterion, and the mapping status follows them", async () => {
    const store = await seeded();
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.1", decision: "confirmed", itemId: "b1" });
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.1", decision: "rejected", itemId: null });
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.2", decision: "added", itemId: "b2" });
    const rows = (await mappingRows(store, "imp")).map((r) => [r.itemId, r.criterionId, r.status]);
    expect(rows).toEqual([["", "PC2.1", "rejected"], ["b1", "PC2.1", "confirmed"], ["b2", "", "suggested"], ["b2", "PC2.2", "added"]]);
    expect((await store.listAlignmentReviews("imp"))[0]?.unitTextHash).toBe("u".repeat(64));
  });
  it("manages a criterion a reviewer attached: add → reject → confirm, and no second add", async () => {
    const store = await seeded();
    const on = (decision: "added" | "rejected" | "confirmed") => recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.2", decision, itemId: "b2" });
    await on("added");
    await expect(on("added")).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.2.*already/) });
    await on("rejected");
    expect((await mappingRows(store, "imp")).find((r) => r.itemId === "b2" && r.criterionId === "PC2.2")?.status).toBe("rejected");
    await on("confirmed");
    expect((await mappingRows(store, "imp")).find((r) => r.itemId === "b2" && r.criterionId === "PC2.2")?.status).toBe("confirmed");
  });
  it("refuses decisions that do not bind to a real promoted revision, item, unit criterion or mapping state", async () => {
    const store = await seeded();
    await expect(recordReview(store, "imp", { kind: "acceptance", activityId: "act-5", reviewer: "o", decision: "accepted", notes: null })).rejects.toMatchObject({ name: "ReviewError", message: expect.stringMatching(/act-5.*promoted/) });
    await expect(recordReview(store, "imp", { kind: "acceptance", activityId: "act-9", reviewer: "o", decision: "accepted", notes: null })).rejects.toBeInstanceOf(ReviewError);
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "confirmed", itemId: "b9" })).rejects.toMatchObject({ message: expect.stringMatching(/b9/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC9.9", decision: "added", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC9\.9.*not in unit SYNELE001/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.2", decision: "confirmed", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.2.*not in/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "added", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.1.*already/) });
    const noUnit = await seeded();
    await noUnit.putArtifact("imp", "unit", null);
    await expect(recordReview(noUnit, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "confirmed", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/no unit/) });
    await expect(recordReview(noUnit, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "o", decision: "accepted", notes: null })).resolves.toMatchObject({ decision: "accepted" }); // acceptance needs no unit
  });
});
