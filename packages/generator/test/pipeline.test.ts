import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { MemoryStore } from "../src/store/memory-store.js";
import { StoreLockedError } from "../src/store/types.js";
import { DEFAULT_MAX_ATTEMPT_MS, runImport, SKIPPED_PREFIX, type RunImportDeps, type RunImportInput } from "../src/pipeline/run-import.js";
import { IncompatibleResumeError, runFingerprint } from "../src/pipeline/fingerprint.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_BUDGET_LIMITS } from "../src/llm/budget.js";
import { chunkSentences } from "../src/concepts/chunk.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptStart, ModelResponse } from "../src/llm/types.js";
import type { PlanRules } from "../src/plan/planner.js";
import { ProviderError } from "../src/llm/provider.js";
import { ANTHROPIC_TIMEOUT_MS } from "../src/llm/anthropic-provider.js";
import { conceptResponses, syntheticDoc, syntheticUnitText, unitOut, planOutFor, SYNTHETIC_CHUNK_TOKENS, sid } from "./helpers/synthetic.js";
import { crashBefore, CrashError, failOnce, failOutcomeOnce } from "./helpers/crashing-store.js";
import { RoutedProvider } from "./helpers/routed-provider.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
type Doc = Awaited<ReturnType<typeof syntheticDoc>>;

/** Produce fixtures cite only evidence that belongs to the concept each plan slot targets (planOutFor: multiChoice → c1, a second multiChoice → c2, blanks → c2, flashcards → c1 + c2). */
function produceResponses(doc: Doc) {
  const remove = `ev-${sid(doc, "Only the worker who applied a lock may remove it")}`;   // concept c1 (lockout and tagout)
  const tag = `ev-${sid(doc, "A tag is a warning label")}`;                               // concept c1
  const tfdA = `ev-${sid(doc, "After the isolator is opened and locked")}`;              // concept c2 (testing for dead)
  const tfdB = `ev-${sid(doc, "Testing for dead confirms")}`;                            // concept c2
  const mc = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The site electrician", correct: false, feedback: "" }], evidenceIds: [remove] };
  const mc2 = { title: "Testing for dead", question: "What does testing for dead confirm before work starts?", answers: [{ text: "That the conductors carry no voltage", correct: true, feedback: "Testing for dead confirms that the conductors to be worked on carry no voltage." }, { text: "That the permit is closed", correct: false, feedback: "" }, { text: "That the tag has been removed", correct: false, feedback: "" }], evidenceIds: [tfdB] };
  const bl = { title: "Testing for dead", taskDescription: "Complete the sentences about testing for dead.", passage: "After the isolator is opened and locked, the worker must test for {{b1}} at the point of work using a voltage tester rated for the circuit. Testing for dead confirms that the conductors to be worked on carry no {{b2}}.", blanks: [{ answers: ["dead"], tip: null, evidenceIds: [tfdA] }, { answers: ["voltage"], tip: null, evidenceIds: [tfdB] }] };
  const fc = { title: "Key terms", description: "Isolation vocabulary.", cards: [{ front: "Who may remove a lock", back: "Only the worker who applied it", tip: null, evidenceIds: [remove] }, { front: "Tag", back: "A warning label attached to the lockout device naming the worker, the date and the reason", tip: null, evidenceIds: [tag] }, { front: "When to test for dead", back: "After the isolator is opened and locked, at the point of work, with a tester rated for the circuit", tip: null, evidenceIds: [tfdA] }, { front: "What testing for dead confirms", back: "That the conductors to be worked on carry no voltage", tip: null, evidenceIds: [tfdB] }] };
  return { mc, mc2, bl, fc };
}

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
/** Typed as the provider script union so tests can splice a ProviderError into it. */
async function fullScript(doc: Doc): Promise<Array<ModelResponse | Error>> {
  const { script } = conceptResponses(doc);
  const { mc, bl, fc } = produceResponses(doc);
  return [r(unitOut), ...script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
}
const callsThroughPlan = (doc: Doc) => 1 + chunkSentences(doc.sentences, SYNTHETIC_CHUNK_TOKENS).length + 2 + 1; // parseUnit, extract per chunk, merge, align, plan

const input = async (importId: string, overrides: Partial<RunImportInput> = {}): Promise<RunImportInput> => ({ importId, name: "Synthetic import", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"] as const, budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, ...overrides });
const deps = (store: RunImportDeps["store"], provider: RunImportDeps["provider"], overrides: Partial<RunImportDeps> = {}): RunImportDeps => ({ store, provider, registry, engineFingerprint: "engine@0.1.0+lock:test", concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined, ...overrides });
const purposes = (p: { requests: Array<{ purpose: string }> }) => p.requests.map((x) => x.purpose);

describe("pipeline defaults", () => {
  it("charges a killed run's unobservable tail at the adapter's request timeout, not at its own constant", () => {
    expect(DEFAULT_MAX_ATTEMPT_MS).toBe(ANTHROPIC_TIMEOUT_MS);
  });
});

describe("runImport", () => {
  it("runs source → unit → concepts → plan → three activities → built packages, recording every attempt, its call key and cost", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-1"), deps(store, provider));
    expect(record.status).toBe("ready");
    expect(record.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(record.budget).toEqual({ usdMicro: 5_000_000, ...DEFAULT_BUDGET_LIMITS });
    const activities = await store.listActivities("imp-1");
    expect(activities.map((a) => [a.type, a.status])).toEqual([["multiChoice", "promoted"], ["blanks", "promoted"], ["flashcards", "promoted"]]);
    for (const a of activities) {
      const rev = await store.getRevision(a.activityId, 1);
      expect(rev?.state).toBe("promoted");
      expect(rev?.promptVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(rev?.engineFingerprint).toBe("engine@0.1.0+lock:test");
      expect(rev?.modelConfig.profiles["claude-sonnet-5"]).toEqual({ temperature: null, thinking: { type: "disabled" } });
      const build = await store.getBuild(rev!.buildKey!);
      expect(build?.subarray(0, 2).toString("latin1")).toBe("PK");
    }
    const attempts = await store.listAttempts("imp-1");
    const starts = attempts.filter((e): e is AttemptStart => e.event === "start"); const outcomes = attempts.filter((e) => e.event === "outcome");
    expect(starts).toHaveLength(provider.requests.length);
    expect(outcomes).toHaveLength(starts.length);
    expect(starts.every((s) => s.retryIndex === 0 && s.retryReason === null)).toBe(true);
    expect(new Set(starts.map((s) => s.callKey)).size).toBe(starts.length); // every call key distinct: no retries happened
    expect(starts.map((s) => s.callKey)).toEqual(expect.arrayContaining(["parseUnit", "extract:chunk-0", "merge", "align", "plan", "produce:act-1", "produce:act-2", "produce:act-3"]));
    expect(record.budgetUsed).toMatchObject({ reservedUsdMicro: 0, requests: provider.requests.length });
    expect(record.budgetUsed.spentUsdMicro).toBeGreaterThan(0);
    expect(record.budgetUsed.spentTokens).toBeGreaterThan(0);
    expect(record.budgetUsed.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(provider.options.every((o) => o.deadlineMs !== undefined)).toBe(true); // every dispatch carried the deadline
    const ops = await store.listOperations("imp-1");
    expect(ops.filter((o) => o.purpose === "produce" && o.status === "succeeded")).toHaveLength(3);
    expect(await store.getArtifact("imp-1", "conceptMap")).not.toBeNull();
  });

  it("is idempotent: a second run over the same store makes no model calls, and a finished import returns at once", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    await runImport(await input("imp-2"), deps(store, new FakeProvider(await fullScript(doc))));
    const finished = (await store.getImport("imp-2"))!;
    await store.putImport({ ...finished, status: "generating" }); // simulate a crash after every step persisted its artefact
    const empty = new FakeProvider([]);
    const again = await runImport(await input("imp-2"), deps(store, empty));
    expect(empty.requests).toHaveLength(0);
    expect(again.status).toBe("ready");
    expect((await store.listOperations("imp-2")).filter((o) => o.purpose === "produce")).toHaveLength(3); // no new operations were created
    const third = await runImport(await input("imp-2"), deps(store, empty));
    expect(third.status).toBe("ready");
  });

  it("refuses to resume with different inputs or configuration, before any write", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    await runImport(await input("imp-fp"), deps(store, new FakeProvider(await fullScript(doc))));
    const before = await store.getImport("imp-fp");
    const empty = new FakeProvider([]);
    await expect(runImport(await input("imp-fp", { language: "vi" }), deps(store, empty))).rejects.toBeInstanceOf(IncompatibleResumeError);
    await expect(runImport(await input("imp-fp", { unitText: null }), deps(store, empty))).rejects.toBeInstanceOf(IncompatibleResumeError);
    await expect(runImport(await input("imp-fp"), deps(store, empty, { chunkTokens: SYNTHETIC_CHUNK_TOKENS + 10 }))).rejects.toBeInstanceOf(IncompatibleResumeError);
    expect(await store.getImport("imp-fp")).toEqual(before);
    expect(empty.requests).toHaveLength(0);
    const raised = await runImport(await input("imp-fp", { budget: { usdMicro: 9_000_000 } }), deps(store, empty)); // budget limits are not part of the identity
    expect(raised.budget.usdMicro).toBe(9_000_000);
  });

  it("refuses a second writer while the import is locked", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const held = await store.lock("imp-lock");
    await expect(runImport(await input("imp-lock"), deps(store, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(StoreLockedError);
    await held.release();
    expect((await runImport(await input("imp-lock"), deps(store, new FakeProvider(await fullScript(doc))))).status).toBe("ready");
  });

  it("recovers when the process dies after extraction finished but before the concept map was stored: chunks are reused, only merge and align run again", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putArtifact", 1, (args) => args[1] === "conceptMap");
    await expect(runImport(await input("imp-c1"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([...script.slice(-2), r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c1"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["merge", "align", "plan", "produce", "produce", "produce"]);
    const conceptOps = (await store.listOperations("imp-c1")).filter((o) => o.idempotencyKey === "imp-c1:concepts");
    expect(conceptOps.map((o) => [o.operationId, o.status, o.billingUncertain])).toEqual([["imp-c1:concepts", "failed", true], ["imp-c1:concepts#2", "succeeded", false]]);
    const resumedMerge = (await store.listAttempts("imp-c1")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "merge");
    expect(resumedMerge.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "resume"]]);
  });

  it("recovers when the process dies after the plan was stored but before its operation record: no planning call is repeated and activities come from the stored plan", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putOperation", 1, (args) => args[0].idempotencyKey === "imp-c2:plan" && args[0].status === "succeeded");
    await expect(runImport(await input("imp-c2"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect(await store.getArtifact("imp-c2", "plan")).not.toBeNull();
    expect(await store.listActivities("imp-c2")).toHaveLength(0);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c2"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce", "produce"]);
    expect((await store.listOperations("imp-c2")).find((o) => o.idempotencyKey === "imp-c2:plan")).toMatchObject({ status: "succeeded", outcome: expect.stringMatching(/reused on resume/) });
  });

  it("recovers when the process dies half-way through writing the activity records", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putActivity", 2);
    await expect(runImport(await input("imp-c3"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect(await store.listActivities("imp-c3")).toHaveLength(1);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c3"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce", "produce"]);
    expect((await store.listActivities("imp-c3")).map((a) => a.activityId)).toEqual(["act-1", "act-2", "act-3"]);
  });

  it("resumes a saved candidate at compilation instead of regenerating it", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putBuild", 1);
    await expect(runImport(await input("imp-c4"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    const candidate = await store.getRevision("act-1", 1);
    expect(candidate?.state).toBe("candidate");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c4"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    const promoted = await store.getRevision("act-1", 1);
    expect(promoted).toMatchObject({ state: "promoted", attemptIds: candidate!.attemptIds });
    expect((await store.listOperations("imp-c4")).filter((o) => o.idempotencyKey === "imp-c4:produce:act-1:r1")).toEqual([expect.objectContaining({ status: "succeeded", billingUncertain: false, outcome: "ok" })]);
  });

  it("reuses a candidate that was persisted before its operation record was completed, correcting the record and keeping billing-uncertain", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putOperation", 1, (args) => args[0].idempotencyKey === "imp-c6:produce:act-1:r1" && args[0].status === "succeeded");
    await expect(runImport(await input("imp-c6"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect((await store.getRevision("act-1", 1))?.state).toBe("candidate");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c6"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    expect((await store.listOperations("imp-c6")).filter((o) => o.idempotencyKey === "imp-c6:produce:act-1:r1")).toEqual([expect.objectContaining({ status: "succeeded", billingUncertain: true, outcome: expect.stringMatching(/reused on resume/) })]);
    expect((await store.getRevision("act-1", 1))?.state).toBe("promoted");
  });

  it("repairs an activity whose revision was promoted before the activity record was updated", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putActivity", 1, (args) => args[0].status === "promoted");
    await expect(runImport(await input("imp-c5"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect((await store.getRevision("act-1", 1))?.state).toBe("promoted");
    expect((await store.listActivities("imp-c5")).find((a) => a.activityId === "act-1")?.status).not.toBe("promoted");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c5"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    expect((await store.listActivities("imp-c5")).find((a) => a.activityId === "act-1")).toMatchObject({ status: "promoted", currentRevision: 1, error: null });
  });

  it("stops dispatch on a budget refusal, settles in-flight work, gives every undispatched activity an explicit outcome, and re-dispatches them when the budget is raised", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const limit = callsThroughPlan(doc) + 1; // enough for the multiChoice produce, not for the blanks produce
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-b", { budget: { usdMicro: 5_000_000, requests: limit } }), deps(store, provider));
    expect(record.status).toBe("ready_with_failures");
    expect(provider.requests).toHaveLength(limit);
    const byId = new Map((await store.listActivities("imp-b")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")).toMatchObject({ status: "promoted" });
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^budget: .*requests/) });
    expect(byId.get("act-3")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}budget:`)) });
    const attempts = await store.listAttempts("imp-b");
    expect(attempts.filter((e) => e.event === "start")).toHaveLength(limit);
    expect(attempts.filter((e) => e.event === "outcome")).toHaveLength(limit);
    expect(record.budgetUsed.reservedUsdMicro).toBe(0);
    const { bl, fc } = produceResponses(doc);
    const resumed = await runImport(await input("imp-b", { budget: { usdMicro: 5_000_000, requests: limit + 2 } }), deps(store, new FakeProvider([r(bl), r(fc)])));
    expect(resumed.status).toBe("ready");
    expect((await store.listActivities("imp-b")).map((a) => a.status)).toEqual(["promoted", "promoted", "promoted"]);
  });

  it("marks the import failed and rethrows on an infrastructure failure after in-flight lanes settle; the failed activity is re-dispatched on resume", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const script = await fullScript(doc);
    const { mc, bl, fc } = produceResponses(doc);
    script.splice(script.length - 3, 3, r(mc), new ProviderError("bad key", "permanent", 401), r(fc));
    await expect(runImport(await input("imp-i"), deps(store, new FakeProvider(script)))).rejects.toMatchObject({ name: "InfrastructureFailure" });
    const record = (await store.getImport("imp-i"))!;
    expect(record).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    const byId = new Map((await store.listActivities("imp-i")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")?.status).toBe("promoted");
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    expect(byId.get("act-3")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    const resumed = await runImport(await input("imp-i"), deps(store, new FakeProvider([r(bl), r(fc)])));
    expect(resumed.status).toBe("ready");
  });

  it("marks an activity failed after three content failures and finishes ready_with_failures; content failures are not re-dispatched", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const script = await fullScript(doc);
    const bad = r({ title: "x", question: "y", answers: [], evidenceIds: [] });
    script.splice(script.length - 3, 1, bad, bad, bad); // replace the multiChoice response with three rejected attempts
    const record = await runImport(await input("imp-3"), deps(store, new FakeProvider(script)));
    expect(record.status).toBe("ready_with_failures");
    const mc = (await store.listActivities("imp-3")).find((a) => a.type === "multiChoice")!;
    expect(mc).toMatchObject({ status: "failed", error: expect.stringMatching(/^content:/) });
    const op = (await store.listOperations("imp-3")).find((o) => o.activityId === mc.activityId)!;
    expect(op).toMatchObject({ status: "failed", contentAttempts: 3 });
    const starts = (await store.listAttempts("imp-3")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "produce:act-1");
    expect(starts.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "content"], [2, "content"]]);
    const empty = new FakeProvider([]);
    expect((await runImport(await input("imp-3"), deps(store, empty))).status).toBe("ready_with_failures");
    expect(empty.requests).toHaveLength(0);
  });

  it("serialises same-type activities so the near-duplicate check sees the earlier promotion while other types run concurrently", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, mc2, bl, fc } = produceResponses(doc);
    const twoMc: PlanRules = { ...rules, multiChoice: { perImport: 2 } };
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 1"), script: [r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 2"), script: [r({ ...mc2, question: mc.question, evidenceIds: mc2.evidenceIds }), r(mc2)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [r(bl)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const record = await runImport(await input("imp-d"), deps(store, provider, { concurrency: 3, rules: twoMc }));
    expect(record.status).toBe("ready");
    const secondMc = provider.requests.filter((q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 2"));
    expect(secondMc).toHaveLength(2);
    expect(secondMc[1]?.user).toContain("near-duplicate of an existing question");
    expect((await store.listActivities("imp-d")).map((a) => a.status)).toEqual(["promoted", "promoted", "promoted", "promoted"]);
  });

  it("reconciles a start without an outcome as billing-uncertain on restart", async () => {
    const store = new MemoryStore();
    const base = await input("imp-5", { unitText: null, selectedTypes: ["multiChoice"] });
    const fingerprint = runFingerprint({ sourceTextHash: base.source.textHash, unitText: null, selectedTypes: base.selectedTypes, language: base.language, promptConfig: base.promptConfig, customisation: null, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules });
    await store.putImport({ importId: "imp-5", orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { usdMicro: 5_000_000, ...DEFAULT_BUDGET_LIMITS }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp-5", createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z" });
    await store.putOperation({ operationId: "imp-5:produce:act-1:r1", importId: "imp-5", activityId: "act-1", purpose: "produce", status: "running", idempotencyKey: "imp-5:produce:act-1:r1", contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: "2026-09-19T00:00:00Z", completedAt: null });
    await store.recorderFor("imp-5").recordStart({ event: "start", attemptId: "att-1", operationId: "imp-5:produce:act-1:r1", callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 10, reservedOutputTokens: 10, reservedUsdMicro: 777, startedAt: "2026-09-19T00:00:00Z" });
    await runImport(base, deps(store, new FakeProvider([]))).catch(() => undefined);
    const op = (await store.listOperations("imp-5")).find((o) => o.operationId === "imp-5:produce:act-1:r1")!;
    expect(op.billingUncertain).toBe(true);
    expect(op.status).toBe("failed");
    const after = (await store.getImport("imp-5"))!;
    expect(after.budgetUsed.spentUsdMicro).toBeGreaterThanOrEqual(777); // the interrupted reservation counts as spent
    expect(after.budgetUsed.requests).toBeGreaterThanOrEqual(1);
  });

  it("treats the elapsed limit as per-import: a resume with the limit already used up refuses the first dispatch", async () => {
    const store = new MemoryStore();
    const base = await input("imp-e", { unitText: null, selectedTypes: ["multiChoice"], budget: { usdMicro: 5_000_000, elapsedMs: 60_000 } });
    const fingerprint = runFingerprint({ sourceTextHash: base.source.textHash, unitText: null, selectedTypes: base.selectedTypes, language: base.language, promptConfig: base.promptConfig, customisation: null, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules });
    await store.putImport({ importId: "imp-e", orgId: "local", name: "n", sourceType: "markdown", status: "extracting", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { ...DEFAULT_BUDGET_LIMITS, usdMicro: 5_000_000, elapsedMs: 60_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 60_000 }, currentRun: null, error: null, idempotencyKey: "imp-e", createdAt: "t", updatedAt: "t" });
    const provider = new FakeProvider([]);
    const record = await runImport(base, deps(store, provider));
    expect(record).toMatchObject({ status: "failed", error: expect.stringMatching(/^budget: .*elapsed/) });
    expect(provider.requests).toHaveLength(0);
    expect(await store.listAttempts("imp-e")).toEqual([]);
  });

  it("charges an interrupted run's time from its durable anchor, bounded by the attempt's deadline and the maximum attempt length", async () => {
    const store = new MemoryStore();
    const T0 = Date.parse("2026-09-19T10:00:00Z");
    const base = await input("imp-a", { unitText: null, selectedTypes: ["multiChoice"], budget: { usdMicro: 5_000_000, elapsedMs: 60_000 } });
    const fingerprint = runFingerprint({ sourceTextHash: base.source.textHash, unitText: null, selectedTypes: base.selectedTypes, language: base.language, promptConfig: base.promptConfig, customisation: null, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules });
    await store.putImport({ importId: "imp-a", orgId: "local", name: "n", sourceType: "markdown", status: "extracting", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { ...DEFAULT_BUDGET_LIMITS, usdMicro: 5_000_000, elapsedMs: 60_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: { startedAt: new Date(T0).toISOString(), elapsedBeforeMs: 0 }, error: null, idempotencyKey: "imp-a", createdAt: "t", updatedAt: "t" });
    await store.putOperation({ operationId: "imp-a:concepts", importId: "imp-a", activityId: null, purpose: "extract", status: "running", idempotencyKey: "imp-a:concepts", contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: new Date(T0 + 500).toISOString(), completedAt: null });
    await store.recorderFor("imp-a").recordStart({ event: "start", attemptId: "att-1", operationId: "imp-a:concepts", callKey: "extract:chunk-0", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: T0 + 60_000, purpose: "extract", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 10, reservedOutputTokens: 10, reservedUsdMicro: 1, startedAt: new Date(T0 + 1000).toISOString() }); // killed during this call
    const later = () => new Date(T0 + 100_000); // the resume happens long after the kill
    await runImport(base, deps(store, new FakeProvider([]), { clock: later, maxAttemptMs: 5000 })).catch(() => undefined);
    const after = (await store.getImport("imp-a"))!;
    expect(after.currentRun).toBeNull(); // the resumed run folded its anchor on the way out
    expect(after.budgetUsed.elapsedMs).toBe(6000); // start at +1000 with no outcome: charged to min(deadline, +1000 + 5000); the fixed clock adds nothing, and reconcile()'s own completedAt stamps were written only after the snapshot was taken
    const snapshotStore = new MemoryStore(); // a run that died during compilation, after a budget snapshot later than every attempt
    await snapshotStore.putImport({ importId: "imp-a", orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { ...DEFAULT_BUDGET_LIMITS, usdMicro: 5_000_000, elapsedMs: 60_000 }, budgetUsed: { spentUsdMicro: 10, reservedUsdMicro: 0, spentTokens: 10, requests: 1, elapsedMs: 5000 }, currentRun: { startedAt: new Date(T0).toISOString(), elapsedBeforeMs: 0 }, error: null, idempotencyKey: "imp-a", createdAt: "t", updatedAt: new Date(T0 + 5000).toISOString() });
    await snapshotStore.recorderFor("imp-a").recordStart({ event: "start", attemptId: "att-1", operationId: "imp-a:concepts", callKey: "extract:chunk-0", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: T0 + 60_000, purpose: "extract", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 10, reservedOutputTokens: 10, reservedUsdMicro: 1, startedAt: new Date(T0 + 500).toISOString() });
    await snapshotStore.recorderFor("imp-a").recordOutcome({ event: "outcome", attemptId: "att-1", operationId: "imp-a:concepts", providerRequestId: null, rawUsage: null, inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 500, pricingVersion: "v", costUsdMicro: 10, costStatus: "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: false, underestimateUsdMicro: 0, completedAt: new Date(T0 + 1000).toISOString() });
    await runImport(base, deps(snapshotStore, new FakeProvider([]), { clock: later, maxAttemptMs: 100 })).catch(() => undefined);
    const kept = (await snapshotStore.getImport("imp-a"))!;
    expect(kept.budgetUsed.elapsedMs).toBeGreaterThanOrEqual(5100); // the saved 5000 is never reduced to the attempts' 1000, and the tail after the last durable write (the snapshot at +5000) is charged one maximum attempt length
    const tight = await input("imp-a", { unitText: null, selectedTypes: ["multiChoice"], budget: { usdMicro: 5_000_000, elapsedMs: 6000 } });
    const empty = new FakeProvider([]);
    const refused = await runImport(tight, deps(store, empty, { clock: () => new Date(T0 + 200_000), maxAttemptMs: 5000 }));
    expect(refused).toMatchObject({ status: "failed", error: expect.stringMatching(/elapsed/) });
    expect(empty.requests).toHaveLength(0);
  });

  it("canonicalises duplicate selected types: one lane and one set of plan slots per type", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-t", { selectedTypes: ["multiChoice", "multiChoice", "blanks", "flashcards", "blanks"] }), deps(store, provider));
    expect(record.status).toBe("ready");
    expect(record.selectedTypes).toEqual(["multiChoice", "blanks", "flashcards"]);
    expect((await store.listActivities("imp-t")).map((a) => a.type)).toEqual(["multiChoice", "blanks", "flashcards"]);
    expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(3);
    const same = await runImport(await input("imp-t", { selectedTypes: ["blanks", "multiChoice", "flashcards"] }), deps(store, new FakeProvider([]))); // order does not change the identity
    expect(same.status).toBe("ready");
  });

  it("a stop raised by one lane prevents another lane's pending retry from dispatching, and in-flight lanes settle first", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice"), script: [new ProviderError("overloaded", "transient", 529), r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [new ProviderError("bad key", "permanent", 401)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 30)); // the multiChoice lane is mid-backoff when the blanks lane fails
    await expect(runImport(await input("imp-s"), deps(store, provider, { concurrency: 3, sleep }))).rejects.toMatchObject({ name: "InfrastructureFailure" });
    expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(3); // multiChoice's retry was never dispatched
    const byId = new Map((await store.listActivities("imp-s")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    expect(byId.get("act-3")?.status).toBe("promoted"); // already in flight; it settled
    expect((await store.getImport("imp-s"))?.status).toBe("failed");
    const held = await store.lock("imp-s"); await held.release(); // the lock was released only after every lane settled
    const resumed = await runImport(await input("imp-s"), deps(store, new FakeProvider([r(mc), r(bl)])));
    expect(resumed.status).toBe("ready");
  });

  it("a storage failure while recording an outcome stops the import, lets the other lanes settle, releases the lock, and is recoverable", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice"), script: [r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [r(bl)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const flaky = failOnce(store, "putImport", (args) => args[0].status === "generating" && args[0].budgetUsed.spentUsdMicro > 0); // the first budget persistence after a lane finishes
    await expect(runImport(await input("imp-f"), deps(flaky, provider, { concurrency: 3 }))).rejects.toMatchObject({ name: "StorageError" });
    expect((await store.getImport("imp-f"))).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: .*storage failure/) });
    for (const a of await store.listActivities("imp-f")) expect(["promoted", "failed"]).toContain(a.status); // every lane reached an explicit end state
    const held = await store.lock("imp-f"); await held.release();
    const resume = new FakeProvider([]);
    const resumed = await runImport(await input("imp-f"), deps(store, resume));
    expect(resumed.status).toBe("ready");
    expect(resume.requests).toHaveLength(0); // every activity had persisted its candidate or promotion before the failure
  });

  it("a storage failure while recording an attempt outcome stops dispatch, lets every lane settle, releases the lock, and is recoverable", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const flaky = failOutcomeOnce(store, (o) => o.operationId.includes(":produce:")); // the ledger write of the first produce attempt's outcome
    await expect(runImport(await input("imp-f2"), deps(flaky, provider))).rejects.toMatchObject({ name: "InfrastructureFailure" });
    expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(1); // nothing was dispatched after the failing outcome
    expect(provider.requests).toHaveLength(callsThroughPlan(doc) + 1);
    const byId = new Map((await store.listActivities("imp-f2")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: .*recording attempt outcome failed: .*storage failure/) });
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    expect(byId.get("act-3")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    expect(await store.getImport("imp-f2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: .*storage failure/) });
    const held = await store.lock("imp-f2"); await held.release(); // the lock was released only after every lane settled
    const { mc, bl, fc } = produceResponses(doc);
    const resumed = await runImport(await input("imp-f2"), deps(store, new FakeProvider([r(mc), r(bl), r(fc)])));
    expect(resumed.status).toBe("ready");
    expect((await store.listActivities("imp-f2")).map((a) => a.status)).toEqual(["promoted", "promoted", "promoted"]);
  });
});
