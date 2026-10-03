import { describe, it, expect } from "vitest";
import { RUBRIC_VERSION, type ActivitySpec, type ScoreDecision } from "@leaplearn/shared";
import { MemoryStore } from "../src/store/memory-store.js";
import { allocateShared, AFTER_REVISION_CATEGORIES, costPerAccepted, FIRST_PASS_CATEGORIES, formatGateReport, gateImport, GATE_TYPES, partitionSum, snapshotImport, type ImportSnapshot } from "../src/report/gate.js";
import type { ActivityPlan, PlannedType } from "../src/plan/planner.js";
import type { ActivityRecord, OperationRecord, RevisionRecord, ScoreRecord } from "../src/store/types.js";
import type { OperationOrigin } from "../src/store/types.js";

const UNIT_HASH = "u".repeat(64);
const spec = (id: string, type: PlannedType, items = 0): ActivitySpec => (type === "multiChoice"
  ? { id, title: "T", type, language: "en", schemaVersion: 1, question: "<p>q</p>", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC1.1"] } }
  : type === "blanks"
    ? { id, title: "T", type, language: "en", schemaVersion: 1, blanks: Array.from({ length: items }, (_, i) => ({ id: `b${i + 1}` })) }
    : { id, title: "T", type, language: "en", schemaVersion: 1, cards: Array.from({ length: items }, (_, i) => ({ id: `c${i + 1}` })) }) as unknown as ActivitySpec;

/** A fixture-built store: one import with a unit, a plan, and whatever each test adds. */
class Fixture {
  readonly store = new MemoryStore();
  private seq = 0; private attemptCount = 0;
  readonly plan: ActivityPlan[] = [];
  async init(): Promise<this> {
    await this.store.putImport({ storeVersion: 2, importId: "imp", orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: UNIT_HASH, selectedTypes: ["multiChoice", "blanks", "flashcards"], fingerprint: "f".repeat(64), budget: { usdMicro: 5_000_000, requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" });
    await this.store.putArtifact("imp", "unit", { code: "SYNELE001", title: "Isolate", release: "Release 1", assessmentConditions: null, textHash: UNIT_HASH, knowledgeEvidence: [{ id: "KE1", text: "lockout", children: [] }], performanceEvidence: [], elements: [{ id: "E1", number: "1", text: "Isolate", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Apply locks" }, { id: "PC1.2", number: "1.2", text: "Test dead" }] }] });
    await this.store.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: "0".repeat(64), concepts: [], alignment: { criteria: [], unsupportedCriteriaIds: ["PC1.2"] } });
    return this;
  }
  async planned(activityId: string, type: PlannedType, patch: Partial<ActivityRecord> = {}): Promise<void> {
    this.plan.push({ activityId, slot: this.plan.length + 1, type, conceptIds: ["c1"], criteriaIds: ["PC1.1"], focus: "f" });
    await this.store.putArtifact("imp", "plan", this.plan);
    await this.store.putActivity({ activityId, importId: "imp", type, order: this.plan.length, status: "planned", currentRevision: null, conceptIds: ["c1"], criteriaIds: ["PC1.1"], error: null, dropped: false, unitTextHash: UNIT_HASH, ...patch });
  }
  async op(activityId: string | null, status: OperationRecord["status"], origin: OperationOrigin = "generate", revision = 1, purpose: OperationRecord["purpose"] = "produce"): Promise<string> {
    const operationId = activityId ? `imp:${purpose}:${activityId}:r${revision}:${origin}` : `imp:${purpose}`;
    await this.store.putOperation({ operationId, importId: "imp", activityId, purpose, status, origin, requestId: null, idempotencyKey: operationId, contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: "t", completedAt: status === "running" ? null : "t" });
    return operationId;
  }
  /** One attempt on an operation; `cost` null is an outcome without a cost, `undefined` a start without an outcome. */
  async attempt(operationId: string, origin: OperationOrigin, cost: number | null | undefined, purpose: "produce" | "extract" = "produce"): Promise<void> {
    const attemptId = `a${++this.attemptCount}`;
    const rec = this.store.recorderFor("imp");
    await rec.recordStart({ event: "start", attemptId, operationId, origin, requestId: null, callKey: attemptId, retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose, provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 7, startedAt: "t" });
    if (cost !== undefined) await rec.recordOutcome({ event: "outcome", attemptId, operationId, providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: cost, costStatus: cost === null ? "unavailable" : "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: false, underestimateUsdMicro: null, completedAt: "t" });
  }
  async revision(activityId: string, revision: number, state: RevisionRecord["state"], origin: "generate" | "regenerate" = "generate", items = 3, buildId: string | null = state === "candidate" || state === "rejected" ? null : `${activityId}-r${revision}`): Promise<void> {
    const type = this.plan.find((p) => p.activityId === activityId)!.type;
    await this.store.putRevision({ activityId, revision, state, spec: spec(activityId, type, items), schemaVersion: 1, promptVersion: "p1", origin, requestId: origin === "regenerate" ? `${activityId}:regen:1` : null, modelConfig: { provider: "fake", models: { produce: "m" }, profiles: {} }, note: null, currentBuildId: buildId, attemptIds: [], createdAt: "t" });
    if (buildId) await this.store.putBuildRecord({ importId: "imp", activityId, revision, buildId, buildKey: `builds/${buildId}.h5p`, sha256: "0".repeat(64), byteLength: 1, engineFingerprint: "e".repeat(64), engineDisplay: "engine 1", engineInputs: { engineDist: [], workspaceDist: [], librariesLockSha256: "1".repeat(64), zlib: "1" }, nodeVersion: "20", builtAt: "t" });
    if (state === "promoted") { const a = (await this.store.listActivities("imp")).find((x) => x.activityId === activityId)!; await this.store.putActivity({ ...a, status: "promoted", currentRevision: revision }); }
  }
  async score(activityId: string, revision: number, decision: ScoreDecision, buildId = `${activityId}-r${revision}`, extra: Partial<ScoreRecord> = {}): Promise<void> {
    const n = decision === "accepted" ? 2 : decision === "needs-revision" ? 1 : 0;
    const seq = ++this.seq;
    await this.store.putScore({ rowKey: `k${seq}`, batchId: `b${seq}`, sequence: seq, rowIndex: 0, sheetId: "s", importId: "imp", activityId, revision, buildId, unitTextHash: UNIT_HASH, rubricVersion: RUBRIC_VERSION, reviewer: "B", scores: { correctness: n, support: 2, distractors: "na", mapping: 2, usefulness: 2 }, findings: n < 2 ? [{ dimension: "correctness", itemId: "b1", score: n as 0 | 1, reason: "wrong" }] : [], minutes: 4, decision, decidedAt: "t", ...extra });
  }
  gate = async () => gateImport(await snapshotImport(this.store, "imp"), "/dir");
}

describe("gate report: the first-pass and after-revision partitions (design §8, plan Task 14)", () => {
  it("puts every planned activity in exactly one category, and the categories sum to planned for both partitions", async () => {
    const f = await new Fixture().init();
    await f.planned("skip", "multiChoice", { status: "failed", error: "skipped: budget: spend" }); // never started
    await f.planned("run", "multiChoice"); await f.op("run", "running");
    await f.planned("content", "blanks", { status: "failed", error: "content: rejected" });
    const contentOp = await f.op("content", "failed");
    for (let i = 0; i < 3; i++) await f.attempt(contentOp, "generate", 100); // three content attempts, no revision
    await f.planned("pending", "multiChoice", { status: "generated" }); await f.op("pending", "succeeded"); await f.revision("pending", 1, "candidate");
    await f.planned("buildfail", "multiChoice", { status: "failed", error: "system: compile failed" }); await f.op("buildfail", "succeeded"); await f.revision("buildfail", 1, "candidate");
    await f.planned("rejectedbuild", "flashcards"); await f.op("rejectedbuild", "succeeded"); await f.revision("rejectedbuild", 1, "rejected");
    await f.planned("unrev", "multiChoice"); await f.op("unrev", "succeeded"); await f.revision("unrev", 1, "promoted");
    for (const [id, d] of [["acc", "accepted"], ["nr", "needs-revision"], ["rej", "rejected"]] as const) { await f.planned(id, "blanks"); await f.op(id, "succeeded"); await f.revision(id, 1, "promoted"); await f.score(id, 1, d); }
    await f.planned("drop", "flashcards", { dropped: true, status: "dropped" });

    const g = await f.gate();
    const fp = (id: string) => g.activities.find((a) => a.activityId === id)!;
    expect(Object.fromEntries(g.activities.map((a) => [a.activityId, [a.firstPass, a.afterRevision]]))).toEqual({
      skip: ["notAttempted", "notAttempted"], run: ["inProgress", "inProgress"], content: ["generationFailed", "generationFailed"], pending: ["buildPending", "buildPending"],
      buildfail: ["generationFailed", "generationFailed"], rejectedbuild: ["generationFailed", "generationFailed"], unrev: ["unreviewed", "awaitingReview"],
      acc: ["accepted", "accepted"], nr: ["needsRevision", "needsRevision"], rej: ["rejected", "rejected"], drop: ["dropped", "dropped"]
    });
    expect(fp("acc").firstPassHistorical).toBe(false);
    for (const t of GATE_TYPES) {
      expect(partitionSum(g.types[t].firstPass)).toBe(g.types[t].planned);
      expect(partitionSum(g.types[t].afterRevision)).toBe(g.types[t].planned);
    }
    expect(g.types.multiChoice.firstPass).toMatchObject({ notAttempted: 1, inProgress: 1, buildPending: 1, generationFailed: 1, unreviewed: 1 });
    expect(g.types.blanks.firstPass).toMatchObject({ generationFailed: 1, accepted: 1, needsRevision: 1, rejected: 1 });
    expect(g.types.flashcards.firstPass).toMatchObject({ generationFailed: 1, dropped: 1 });
    // the content failure without a revision: its three attempts are first-pass direct cost of its type
    expect(g.types.blanks.cost.firstPassDirect).toMatchObject({ usdMicro: 300, attempts: 3 });
    expect(g.status).toBe("incomplete");
    expect(g.incomplete).toEqual([
      { activityId: "run", reason: "first pass: inProgress" }, { activityId: "run", reason: "after revision: inProgress" },
      { activityId: "pending", reason: "first pass: buildPending" }, { activityId: "pending", reason: "after revision: buildPending" },
      { activityId: "unrev", reason: "first pass: unreviewed" }, { activityId: "unrev", reason: "after revision: awaitingReview" }
    ]);
    expect(g.alignment).toEqual({ unsupported: ["PC1.2"], neverTargeted: ["KE1"] });
    expect(formatGateReport([g], [])).toContain("an incomplete import can never pass");
  });

  it("property: over random store states, both partitions always sum to planned per type", () => {
    let seed = 12345;
    const rand = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const pick = <T,>(xs: readonly T[]): T => xs[rand(xs.length)]!;
    for (let run = 0; run < 300; run++) {
      const s: ImportSnapshot = { importRecord: { storeVersion: 2, importId: "imp" } as ImportSnapshot["importRecord"], unit: null, plan: [], conceptMap: null, extractionVersion: null, activities: [], operations: [], attempts: [], revisions: [], builds: [], scores: [], regenerations: [] };
      const n = rand(12);
      for (let i = 0; i < n; i++) {
        const id = `a${i}`; const type = pick(GATE_TYPES);
        s.plan.push({ activityId: id, slot: i, type, conceptIds: [], criteriaIds: [], focus: "" });
        if (rand(5) > 0) s.activities.push({ activityId: id, importId: "imp", type, order: i, status: pick(["planned", "generating", "generated", "built", "promoted", "failed", "dropped"] as const), currentRevision: null, conceptIds: [], criteriaIds: [], error: pick([null, "skipped: x", "content: x", "system: x"]), dropped: rand(10) === 0, unitTextHash: null });
        for (let o = rand(3); o > 0; o--) s.operations.push({ operationId: `${id}-${o}`, importId: "imp", activityId: id, purpose: pick(["produce", "produce", "build"] as const), status: pick(["running", "succeeded", "failed"] as const), origin: pick(["generate", "regenerate"] as const), requestId: null, idempotencyKey: id, contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null });
        for (let r = 1, k = rand(4); r <= k; r++) {
          const state = pick(["candidate", "promoted", "superseded", "rejected"] as const); const buildId = rand(3) > 0 ? `${id}-${r}` : null;
          s.revisions.push({ activityId: id, revision: r, state, spec: spec(id, type, 2), schemaVersion: 1, promptVersion: "p", origin: r === 1 ? "generate" : pick(["generate", "regenerate"] as const), requestId: null, modelConfig: { provider: "f", models: {}, profiles: {} }, note: null, currentBuildId: buildId, attemptIds: [], createdAt: "t" });
          for (let k2 = rand(3); k2 > 0; k2--) s.scores.push({ rowKey: `${id}-${r}-${k2}`, batchId: "b", sequence: rand(9), rowIndex: rand(3), sheetId: "s", importId: "imp", activityId: id, revision: r, buildId: rand(3) > 0 && buildId ? buildId : "other", unitTextHash: null, rubricVersion: "r1", reviewer: "B", scores: { correctness: pick([0, 1, 2] as const), support: 2, distractors: "na", mapping: "na", usefulness: 2 }, findings: [], minutes: rand(9), decision: pick(["accepted", "needs-revision", "rejected"] as const), decidedAt: "t" });
        }
        if (rand(4) === 0) s.regenerations.push({ requestId: `${id}:regen:1`, importId: "imp", activityId: id, index: 1, baseRevision: 1, targetRevision: 2, note: "n", budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, status: pick(["running", "succeeded", "failed"] as const), outcome: null, createdAt: "t", completedAt: null });
      }
      const g = gateImport(s);
      for (const t of GATE_TYPES) {
        expect(partitionSum(g.types[t].firstPass)).toBe(g.types[t].planned);
        expect(partitionSum(g.types[t].afterRevision)).toBe(g.types[t].planned);
      }
      expect(GATE_TYPES.reduce((a, t) => a + g.types[t].planned, 0)).toBe(n);
      expect(g.activities.every((a) => (FIRST_PASS_CATEGORIES as readonly string[]).includes(a.firstPass) && (AFTER_REVISION_CATEGORIES as readonly string[]).includes(a.afterRevision))).toBe(true);
    }
  });

  it("is incomplete while one review is missing, and complete once it is imported", async () => {
    const f = await new Fixture().init();
    for (const id of ["x", "y"]) { await f.planned(id, "multiChoice"); await f.op(id, "succeeded"); await f.revision(id, 1, "promoted"); }
    await f.score("x", 1, "accepted");
    expect(await f.gate()).toMatchObject({ status: "incomplete", incomplete: [{ activityId: "y", reason: "first pass: unreviewed" }, { activityId: "y", reason: "after revision: awaitingReview" }] });
    await f.score("y", 1, "rejected");
    const g = await f.gate();
    expect(g).toMatchObject({ status: "complete", incomplete: [] });
    expect(formatGateReport([g], [])).toContain("Gate status: **complete**; not evaluated, thresholds not frozen");
  });

  it("first pass vs after revision: needs-revision r1 then accepted r2; regeneration cost and minutes count only after revision", async () => {
    const f = await new Fixture().init();
    await f.planned("x", "blanks");
    const gen = await f.op("x", "succeeded"); await f.attempt(gen, "generate", 200);
    await f.revision("x", 1, "superseded"); await f.score("x", 1, "needs-revision", "x-r1", { minutes: 5 });
    const regen = await f.op("x", "succeeded", "regenerate", 2); await f.attempt(regen, "regenerate", 300);
    await f.revision("x", 2, "promoted", "regenerate", 4); await f.score("x", 2, "accepted", "x-r2", { minutes: 2 });
    await f.store.putRegeneration({ requestId: "x:regen:1", importId: "imp", activityId: "x", index: 1, baseRevision: 1, targetRevision: 2, note: "n", budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, status: "succeeded", outcome: "ok", createdAt: "t", completedAt: "t" });
    const shared = await f.op(null, "succeeded", "shared", 1, "extract"); await f.attempt(shared, "shared", 1000, "extract");
    const t = (await f.gate()).types.blanks;
    expect(t.firstPass).toMatchObject({ needsRevision: 1, accepted: 0 });
    expect(t.afterRevision).toMatchObject({ accepted: 1, needsRevision: 0 });
    expect(t.regenerations).toEqual({ used: 1, failed: 0 });
    expect(t.cost.firstPassDirect.usdMicro).toBe(200);
    expect(t.cost.regenerationDirect.usdMicro).toBe(300);
    expect(t.cost.allocatedSharedUsdMicro).toBe(1000); // the only type with first-pass direct cost
    expect(costPerAccepted(t, "firstPass")).toMatchObject({ usdMicro: null, spendUsdMicro: 1200 });
    expect(costPerAccepted(t, "afterRevision")).toMatchObject({ usdMicro: 1500, accepted: 1 });
    expect(t.minutes.firstPass).toEqual({ values: [5], items: 3 });
    expect(t.minutes.revisions).toEqual({ values: [2], items: 4 });
    expect(t.items.inspected).toBe(7); // every item of both reviewed revisions
    expect(t.items.failing.correctness).toBe(1);
  });

  it("a stale first-pass review counts in first pass as historical, and not in after-revision acceptance", async () => {
    const f = await new Fixture().init();
    await f.planned("x", "multiChoice"); await f.op("x", "succeeded");
    await f.revision("x", 1, "promoted", "generate", 0, "build-b"); // rebuilt: build B is now current
    await f.score("x", 1, "accepted", "build-a");
    const g = await f.gate();
    expect(g.activities[0]).toMatchObject({ firstPass: "accepted", firstPassHistorical: true, afterRevision: "awaitingReview" });
    expect(g.types.multiChoice.historical).toBe(1);
    expect(g.staleReviews).toEqual([{ activityId: "x", revision: 1, buildId: "build-a", why: "build build-a is no longer the revision's current build" }]);
    expect(g.status).toBe("incomplete");
  });
});

describe("gate report: cost (C1, R10)", () => {
  it("allocates shared cost by first-pass direct share, falls back to planned count, and sums exactly", () => {
    expect(allocateShared(1000, { multiChoice: 300, blanks: 100, flashcards: 0 }, { multiChoice: 5, blanks: 3, flashcards: 1 })).toEqual({ multiChoice: 750, blanks: 250, flashcards: 0 });
    expect(allocateShared(1000, { multiChoice: 0, blanks: 0, flashcards: 0 }, { multiChoice: 2, blanks: 1, flashcards: 1 })).toEqual({ multiChoice: 500, blanks: 250, flashcards: 250 });
    expect(allocateShared(100, { multiChoice: 1, blanks: 1, flashcards: 1 }, { multiChoice: 1, blanks: 1, flashcards: 1 })).toEqual({ multiChoice: 34, blanks: 33, flashcards: 33 });
    expect(allocateShared(100, { multiChoice: 0, blanks: 0, flashcards: 0 }, { multiChoice: 0, blanks: 0, flashcards: 0 })).toEqual({ multiChoice: 0, blanks: 0, flashcards: 0 });
  });

  it("never prices an unavailable attempt at zero: lower-bound labels, billing-uncertain starts, and n/a (0 accepted)", async () => {
    const f = await new Fixture().init();
    await f.planned("x", "multiChoice"); const op = await f.op("x", "succeeded");
    await f.attempt(op, "generate", 400); await f.attempt(op, "generate", null); await f.attempt(op, "generate", undefined);
    await f.revision("x", 1, "promoted"); await f.score("x", 1, "rejected");
    const g = await f.gate();
    expect(g.types.multiChoice.cost.firstPassDirect).toEqual({ usdMicro: 400, attempts: 3, unavailable: 1, uncertain: { attempts: 1, reservedUsdMicro: 7 } });
    expect(costPerAccepted(g.types.multiChoice, "firstPass")).toEqual({ usdMicro: null, spendUsdMicro: 400, accepted: 0, lowerBound: 2 });
    const md = formatGateReport([g], []);
    expect(md).toContain("n/a (0 accepted); spend $0.0004 lower bound (2 attempts without cost)");
    expect(md).toContain("1 at $0.0000 reserved");
  });
});

describe("gate report: the negative check", () => {
  it("counts findings tagged rto-claim in counted reviews", async () => {
    const f = await new Fixture().init();
    await f.planned("x", "multiChoice"); await f.op("x", "succeeded"); await f.revision("x", 1, "promoted");
    await f.score("x", 1, "rejected", "x-r1", { findings: [{ dimension: "correctness", itemId: "x", score: 0, reason: "rto-claim: says the unit cannot be simulated" }] });
    expect((await f.gate()).negativeCheck).toEqual({ findings: 1, activities: 1, reviews: 1 });
  });
});
