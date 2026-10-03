import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { RUBRIC_VERSION, type ScoreDecision } from "@leaplearn/shared";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportInput } from "../src/pipeline/run-import.js";
import { regenerateActivity, RegenerateRefused, type RegenerateInput } from "../src/pipeline/regenerate.js";
import type { ModelProvider } from "../src/llm/provider.js";
import { BuildArtifactError } from "../src/store/types.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { PlanRules } from "../src/plan/planner.js";
import type { AttemptStart } from "../src/llm/types.js";
import type { ArtifactName, ImportStore } from "../src/store/types.js";
import { fullScript, produceResponses, syntheticDoc, syntheticUnitText, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { crashBefore, CrashError, failOnce, StorageError, withBuildBytes } from "./helpers/crashing-store.js";
import { IDENTITY_A } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
const NOTE = "Make the distractors less obviously wrong.";

/** A complete import: act-1 multiChoice, act-2 blanks, act-3 flashcards, all promoted at revision 1. */
const importInput = async (importId: string): Promise<RunImportInput> => ({ importId, name: "n", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null });
async function completeImport(importId: string): Promise<MemoryStore> {
  const store = new MemoryStore();
  await runImport(await importInput(importId), { store, provider: new FakeProvider(await fullScript(await syntheticDoc())), registry, engineIdentity: IDENTITY_A, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined });
  return store;
}

/** A counted scored review of the activity's current build, with the given decision. */
let sequence = 0;
async function score(store: MemoryStore, importId: string, activityId: string, decision: ScoreDecision): Promise<void> {
  const a = (await store.listActivities(importId)).find((x) => x.activityId === activityId)!;
  const rev = (await store.getRevision(activityId, a.currentRevision!))!;
  const value = decision === "accepted" ? 2 : decision === "needs-revision" ? 1 : 0;
  sequence += 1;
  await store.putScore({ rowKey: `k${sequence}`, batchId: `b${sequence}`, sequence, rowIndex: 0, sheetId: "s", importId, activityId, revision: rev.revision, buildId: rev.currentBuildId!, unitTextHash: null, rubricVersion: RUBRIC_VERSION, reviewer: "B", scores: { correctness: value, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 3, decision, decidedAt: "t" });
}

const deps = (store: ImportStore, provider: ModelProvider) => ({ store, provider, registry, engineIdentity: IDENTITY_A, sleep: async () => undefined });
/** Regenerates act-1 with NOTE; `note: null` leaves the note out, as a resume may. */
const regen = (store: ImportStore, provider: ModelProvider, overrides: { note?: string | null; budget?: RegenerateInput["budget"]; clock?: () => Date; maxAttemptMs?: number } = {}) => {
  const note = overrides.note === null ? {} : { note: overrides.note ?? NOTE };
  return regenerateActivity({ importId: "imp", activityId: "act-1", ...note, ...(overrides.budget ? { budget: overrides.budget } : {}) }, { ...deps(store, provider), ...(overrides.clock ? { clock: overrides.clock } : {}), ...(overrides.maxAttemptMs ? { maxAttemptMs: overrides.maxAttemptMs } : {}) });
};
/** A store in which the named artifact was never written: an import from before it existed. */
const without = (inner: ImportStore, name: ArtifactName): ImportStore => new Proxy(inner, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver) as unknown;
    if (typeof value !== "function") return value;
    const fn = value as (...args: unknown[]) => unknown;
    return (...args: unknown[]) => (prop === "getArtifact" && args[1] === name ? Promise.resolve(null) : fn.apply(target, args));
  }
});
const act1 = async (store: ImportStore) => (await store.listActivities("imp")).find((a) => a.activityId === "act-1")!;
const mcReply = async () => r(produceResponses(await syntheticDoc()).mc);

describe("leap regenerate: eligibility and the result (design §6)", () => {
  it("a needs-revision activity regenerates: revision 2 is promoted with origin regenerate, and revision 1 and its review are unchanged", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const rev1Before = (await store.getRevision("act-1", 1))!;
    const scoresBefore = await store.listScores("imp");
    const provider = new FakeProvider([await mcReply()]);
    const { request, resumed } = await regen(store, provider);
    expect(resumed).toBe(false);
    expect(request).toMatchObject({ requestId: "act-1:regen:1", index: 1, baseRevision: 1, targetRevision: 2, note: NOTE, status: "succeeded", outcome: "ok" });
    const rev2 = (await store.getRevision("act-1", 2))!;
    expect(rev2).toMatchObject({ state: "promoted", origin: "regenerate", requestId: "act-1:regen:1", note: NOTE });
    expect(rev2.currentBuildId).not.toBeNull();
    expect((await store.listActivities("imp")).find((a) => a.activityId === "act-1")).toMatchObject({ status: "promoted", currentRevision: 2 });
    const rev1 = (await store.getRevision("act-1", 1))!;
    expect({ ...rev1, state: rev1Before.state }).toEqual(rev1Before); // only its state changes, to superseded
    expect(rev1.state).toBe("superseded");
    expect(await store.listBuilds("act-1")).toHaveLength(2); // revision 1 keeps its build
    expect(await store.listScores("imp")).toEqual(scoresBefore);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.user).toContain(`REVIEWER NOTE ON THE PREVIOUS VERSION (write a new version that addresses it):\n${NOTE}`);
    expect((await store.listRegenerations("imp")).map((x) => x.status)).toEqual(["succeeded"]);
  });

  it("refuses an accepted activity, one with no scored review, and a new request without a note, writing nothing", async () => {
    const store = await completeImport("imp");
    const provider = new FakeProvider([]);
    await expect(regen(store, provider)).rejects.toThrow(/act-1 revision 1 has no scored review of its current build/);
    await score(store, "imp", "act-1", "accepted");
    await expect(regen(store, provider)).rejects.toThrow(/act-1 revision 1 is accepted; only a needs-revision or rejected activity is regenerated/);
    await score(store, "imp", "act-1", "rejected");
    await expect(regen(store, provider, { note: null })).rejects.toBeInstanceOf(RegenerateRefused);
    expect(await store.listRegenerations("imp")).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });
});

describe("interruptions are finished, not restarted (R9)", () => {
  // each point: [name, the crash wrapper, provider calls the resume makes]
  // [name, the crash wrapper, revision 2's state and build count when the process died]
  const points: Array<[string, (s: MemoryStore) => ImportStore, string | null, number]> = [
    ["after the request is appended, before dispatch", (s) => crashBefore(s, "putOperation", 1), null, 0],
    ["after the candidate revision is persisted", (s) => crashBefore(s, "putBuild", 1), "candidate", 0],
    ["after the build bytes and record, before promotion", (s) => crashBefore(s, "putRevision", 1, ([rev]) => rev.state === "superseded"), "candidate", 1],
    ["after promotion, before the succeeded event", (s) => crashBefore(s, "putRegeneration", 1, ([req]) => req.status === "succeeded"), "promoted", 1]
  ];
  for (const [name, crashing, stateAtCrash, buildsAtCrash] of points) {
    it(`${name}: a rerun with no note finishes the same request and target, appends one succeeded, consumes no allowance, and produces once in total`, async () => {
      const store = await completeImport("imp");
      await score(store, "imp", "act-1", "needs-revision");
      const provider = new FakeProvider([await mcReply(), await mcReply()]);
      await expect(regen(crashing(store), provider)).rejects.toBeInstanceOf(CrashError);
      expect((await store.listRegenerations("imp")).map((x) => [x.requestId, x.status, x.targetRevision])).toEqual([["act-1:regen:1", "running", 2]]);
      expect((await store.getRevision("act-1", 2))?.state ?? null).toBe(stateAtCrash); // the crash happened where named
      expect((await store.listBuilds("act-1")).filter((b) => b.revision === 2)).toHaveLength(buildsAtCrash);
      const producedBeforeResume = provider.requests.length;
      const { request, resumed } = await regen(store, provider, { note: null });
      expect(resumed).toBe(true);
      expect(request).toMatchObject({ requestId: "act-1:regen:1", targetRevision: 2, status: "succeeded" });
      expect((await store.listRegenerations("imp")).map((x) => [x.requestId, x.status])).toEqual([["act-1:regen:1", "succeeded"]]);
      expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(1);
      expect(provider.requests.length - producedBeforeResume).toBe(stateAtCrash === null ? 1 : 0); // the resume produces only if nothing was produced
      expect((await store.listBuilds("act-1")).filter((b) => b.revision === 2)).toHaveLength(1); // never a second build record
      expect((await store.getRevision("act-1", 2))!.state).toBe("promoted");
      // the allowance: one request used, so one more may be made once revision 2 is reviewed
      await score(store, "imp", "act-1", "needs-revision");
      expect((await regen(store, new FakeProvider([await mcReply()]))).request.index).toBe(2);
    });
  }

  it("a rerun with a different note during a running request is refused and shows the stored note", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    await expect(regen(crashBefore(store, "putOperation", 1), new FakeProvider([]))).rejects.toBeInstanceOf(CrashError);
    await expect(regen(store, new FakeProvider([]), { note: "Something else entirely." })).rejects.toThrow(`request act-1:regen:1 is still running with the note ${JSON.stringify(NOTE)}; rerun with that note, or with no --note, to finish it`);
    expect((await store.listRegenerations("imp"))[0]!.status).toBe("running");
  });
});

describe("the allowance counts every request (C2)", () => {
  it("request 1 fails on content, request 2 succeeds, and a third is refused", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const bad = r({ title: "Bad" });
    const first = await regen(store, new FakeProvider([bad, bad, bad]));
    expect(first.request).toMatchObject({ index: 1, status: "failed", outcome: expect.stringMatching(/^content: /) });
    expect(await store.getRevision("act-1", 2)).toBeNull(); // no revision for a failed request
    expect((await store.listActivities("imp")).find((a) => a.activityId === "act-1")!.currentRevision).toBe(1);
    const second = await regen(store, new FakeProvider([await mcReply()]));
    expect(second.request).toMatchObject({ index: 2, targetRevision: 2, status: "succeeded" });
    await score(store, "imp", "act-1", "needs-revision");
    await expect(regen(store, new FakeProvider([await mcReply()]))).rejects.toThrow("activity act-1 has used its 2 regenerations in this pilot");
  });

  it("a budget-refused request is recorded failed and counts", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const provider = new FakeProvider([await mcReply()]);
    const refused = await regen(store, provider, { budget: { usdMicro: 1 } });
    expect(refused.request).toMatchObject({ index: 1, status: "failed", outcome: expect.stringMatching(/^budget: /) });
    expect(provider.requests).toHaveLength(0);
    expect((await regen(store, new FakeProvider([await mcReply()]))).request.index).toBe(2);
  });

  it("a request whose produce operation exhausts its content attempts leaves no revision; its operation and attempt starts carry origin regenerate and the requestId (R10)", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const bad = r({ title: "Bad" });
    await regen(store, new FakeProvider([bad, bad, bad]));
    expect(await store.getRevision("act-1", 2)).toBeNull();
    const op = (await store.listOperations("imp")).find((o) => o.idempotencyKey === "imp:produce:act-1:r2")!;
    expect(op).toMatchObject({ status: "failed", origin: "regenerate", requestId: "act-1:regen:1" });
    const starts = (await store.listAttempts("imp")).filter((e): e is AttemptStart => e.event === "start" && e.operationId === op.operationId);
    expect(starts).toHaveLength(3);
    expect(starts.every((s) => s.origin === "regenerate" && s.requestId === "act-1:regen:1")).toBe(true);
  });
});

describe("elapsed time uses the import's shared run anchor (3 Oct)", () => {
  it("a clean regeneration adds its own time and clears the anchor", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const before = (await store.getImport("imp"))!.budgetUsed.elapsedMs;
    let now = Date.now() + 86_400_000;
    const inner = new FakeProvider([await mcReply()]);
    const slow: ModelProvider = { name: "fake", complete: async (req, o) => { now += 7000; return inner.complete(req, o); } }; // the call takes 7 s
    expect((await regen(store, slow, { clock: () => new Date(now) })).request.status).toBe("succeeded");
    const after = (await store.getImport("imp"))!;
    expect(after.currentRun).toBeNull();
    expect(after.budgetUsed.elapsedMs).toBe(before + 7000);
  });

  it("an interrupted regeneration's time is charged on resume: the anchor is durable before dispatch, and the resume folds and clears it", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const before = (await store.getImport("imp"))!.budgetUsed.elapsedMs;
    const T0 = Date.now() + 86_400_000;
    const provider = new FakeProvider([await mcReply()]);
    await expect(regen(crashBefore(store, "putBuild", 1), provider, { clock: () => new Date(T0) })).rejects.toBeInstanceOf(CrashError);
    expect((await store.getImport("imp"))!.currentRun).toEqual({ startedAt: new Date(T0).toISOString(), elapsedBeforeMs: before });
    // resumed 100 s after the kill; the last durable write was at T0, so 60 s (one maximum attempt) is charged
    const { request } = await regen(store, provider, { note: null, clock: () => new Date(T0 + 100_000), maxAttemptMs: 60_000 });
    expect(request.status).toBe("succeeded");
    const after = (await store.getImport("imp"))!;
    expect(after.currentRun).toBeNull();
    expect(after.budgetUsed.elapsedMs).toBe(before + 60_000);
  });

  it("a content failure also folds and clears the anchor", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const bad = r({ title: "Bad" });
    expect((await regen(store, new FakeProvider([bad, bad, bad]))).request.status).toBe("failed");
    expect((await store.getImport("imp"))!.currentRun).toBeNull();
  });
});

describe("generate and regenerate share the anchor (3 Oct)", () => {
  it("generate on the finished import charges an interrupted regeneration's anchor before its first write, and the resumed regeneration charges nothing more", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const before = (await store.getImport("imp"))!.budgetUsed.elapsedMs;
    const T0 = Date.now() + 86_400_000;
    await expect(regen(crashBefore(store, "putBuild", 1), new FakeProvider([await mcReply()]), { clock: () => new Date(T0) })).rejects.toBeInstanceOf(CrashError);
    // generate reruns 100 s after the kill; the last durable write was at T0, so 60 s (one maximum attempt) is charged
    const generated = await runImport(await importInput("imp"), { store, provider: new FakeProvider([]), registry, engineIdentity: IDENTITY_A, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined, clock: () => new Date(T0 + 100_000), maxAttemptMs: 60_000 });
    expect(generated).toMatchObject({ status: "ready", currentRun: null, budgetUsed: { elapsedMs: before + 60_000 } });
    expect(await store.getImport("imp")).toMatchObject({ currentRun: null, budgetUsed: { elapsedMs: before + 60_000 } });
    const { request } = await regen(store, new FakeProvider([]), { note: null, clock: () => new Date(T0 + 110_000), maxAttemptMs: 60_000 });
    expect(request.status).toBe("succeeded");
    expect((await store.getImport("imp"))!.budgetUsed.elapsedMs).toBe(before + 60_000); // not 110 s from generate's own write
  });
});

describe("caps only go down (3 Oct)", () => {
  const thirds: Array<[string, RegenerateInput["budget"]]> = [["omitted", undefined], ["higher", { usdMicro: 50_000_000 }]];
  for (const [label, third] of thirds) {
    it(`a cap lowered during an interrupted resume is kept with the request: a third invocation with the cap ${label} is refused before dispatch`, async () => {
      const store = await completeImport("imp");
      await score(store, "imp", "act-1", "needs-revision");
      await expect(regen(crashBefore(store, "putOperation", 1), new FakeProvider([]))).rejects.toBeInstanceOf(CrashError);
      expect((await store.listRegenerations("imp"))[0]!.budget.usdMicro).toBe(5_000_000); // created under the import's $5
      await expect(regen(crashBefore(store, "putOperation", 1), new FakeProvider([]), { note: null, budget: { usdMicro: 1 } })).rejects.toBeInstanceOf(CrashError);
      expect((await store.listRegenerations("imp"))[0]).toMatchObject({ status: "running", budget: { usdMicro: 1 } });
      const provider = new FakeProvider([await mcReply()]);
      const { request } = await regen(store, provider, { note: null, ...(third ? { budget: third } : {}) });
      expect(request).toMatchObject({ status: "failed", outcome: expect.stringMatching(/^budget: /), budget: { usdMicro: 1 } });
      expect(provider.requests).toHaveLength(0);
    });
  }

  it("a supplied cap above the import's never raises it", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const rec = (await store.getImport("imp"))!;
    await store.putImport({ ...rec, budget: { ...rec.budget, usdMicro: 1 } });
    const provider = new FakeProvider([await mcReply()]);
    const { request } = await regen(store, provider, { budget: { usdMicro: 50_000_000 } }); // as a ledger cap above the import's would be
    expect(request).toMatchObject({ status: "failed", outcome: expect.stringMatching(/^budget: /), budget: { usdMicro: 1 } });
    expect(provider.requests).toHaveLength(0);
  });

  it("a request's lower cap is stored with it and kept on resume, with or without a supplied cap", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    await expect(regen(crashBefore(store, "putOperation", 1), new FakeProvider([]), { budget: { usdMicro: 1 } })).rejects.toBeInstanceOf(CrashError);
    expect((await store.listRegenerations("imp"))[0]).toMatchObject({ status: "running", budget: { usdMicro: 1 } });
    const provider = new FakeProvider([await mcReply()]);
    const { request } = await regen(store, provider, { note: null, budget: { usdMicro: 50_000_000 } });
    expect(request).toMatchObject({ status: "failed", outcome: expect.stringMatching(/^budget: /) });
    expect(provider.requests).toHaveLength(0);
  });
});

describe("prerequisites are checked before a request is appended (3 Oct)", () => {
  it("an import without stored production settings is refused with no request, no allowance used and no model call", async () => {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    const provider = new FakeProvider([await mcReply()]);
    await expect(regen(without(store, "settings"), provider)).rejects.toThrow(/import imp has no stored production settings/);
    await expect(regen(without(store, "plan"), provider)).rejects.toThrow(/no stored plan entry for act-1/);
    expect(await store.listRegenerations("imp")).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });
});

describe("publication is recoverable across each write (3 Oct)", () => {
  const writes: Array<[string, (s: ImportStore) => ImportStore]> = [
    ["the build bytes", (s) => failOnce(s, "putBuild")],
    ["the build record", (s) => failOnce(s, "putBuildRecord")],
    ["superseding revision 1", (s) => failOnce(s, "putRevision", ([rev]) => rev.state === "superseded")],
    ["promoting revision 2", (s) => failOnce(s, "putRevision", ([rev]) => rev.state === "promoted" && rev.revision === 2)],
    ["pointing the activity at revision 2", (s) => failOnce(s, "putActivity")],
    ["the succeeded event", (s) => failOnce(s, "putRegeneration", ([req]) => req.status === "succeeded")]
  ];
  for (const [name, failing] of writes) {
    it(`a failed write of ${name} leaves the request running; a rerun finishes it with no model call and no allowance`, async () => {
      const store = await completeImport("imp");
      await score(store, "imp", "act-1", "needs-revision");
      const provider = new FakeProvider([await mcReply(), await mcReply()]);
      await expect(regen(failing(store), provider)).rejects.toBeInstanceOf(StorageError);
      expect((await store.listRegenerations("imp")).map((x) => [x.requestId, x.status])).toEqual([["act-1:regen:1", "running"]]);
      expect((await store.getImport("imp"))!.currentRun).toBeNull(); // the process stayed alive, so it folded its time
      const { request, resumed } = await regen(store, provider, { note: null });
      expect([resumed, request.status]).toEqual([true, "succeeded"]);
      expect(provider.requests).toHaveLength(1);
      expect((await store.listBuilds("act-1")).filter((b) => b.revision === 2)).toHaveLength(1);
      expect((await store.getRevision("act-1", 1))!.state).toBe("superseded");
      expect((await store.getRevision("act-1", 2))!.state).toBe("promoted");
      expect(await act1(store)).toMatchObject({ status: "promoted", currentRevision: 2 });
      await score(store, "imp", "act-1", "needs-revision");
      expect((await regen(store, new FakeProvider([await mcReply()]))).request.index).toBe(2);
    });
  }
});

describe("a resume verifies the promoted target's build before success (3 Oct)", () => {
  /** Revision 2 promoted, the process killed before `succeeded`. */
  async function promotedThenKilled() {
    const store = await completeImport("imp");
    await score(store, "imp", "act-1", "needs-revision");
    await expect(regen(crashBefore(store, "putRegeneration", 1, ([req]) => req.status === "succeeded"), new FakeProvider([await mcReply()]))).rejects.toBeInstanceOf(CrashError);
    return store;
  }
  const damages: Array<[string, (s: ImportStore) => Promise<ImportStore>, RegExp]> = [
    ["a missing package", async (s) => withBuildBytes(s, (key, b) => (key.includes("act-1-r2-") ? null : b)), /its package file is missing/],
    ["an altered package", async (s) => withBuildBytes(s, (key, b) => (key.includes("act-1-r2-") && b ? Buffer.concat([b, Buffer.from("x")]) : b)), /its package file is \d+ bytes, but the record says/],
    ["a build of another revision", async (s) => {
      const rev1 = (await s.getRevision("act-1", 1))!; const rev2 = (await s.getRevision("act-1", 2))!;
      await s.putRevision({ ...rev2, currentBuildId: rev1.currentBuildId });
      return s;
    }, /it belongs to revision 1, not to act-1 revision 2 of import imp/]
  ];
  for (const [name, damage, message] of damages) {
    it(`${name}: no success is reported, nothing is rebuilt or overwritten, and the request stays running`, async () => {
      const store = await promotedThenKilled();
      const buildsBefore = await store.listBuilds("act-1");
      const provider = new FakeProvider([]);
      const err = await regen(await damage(store), provider, { note: null }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BuildArtifactError);
      expect((err as Error).message).toMatch(message);
      expect(provider.requests).toHaveLength(0);
      expect(await store.listBuilds("act-1")).toEqual(buildsBefore);
      expect((await store.listRegenerations("imp")).map((x) => x.status)).toEqual(["running"]);
    });
  }

  it("an intact promoted target is verified and the request finishes", async () => {
    const store = await promotedThenKilled();
    const buildsBefore = await store.listBuilds("act-1");
    expect((await regen(store, new FakeProvider([]), { note: null })).request.status).toBe("succeeded");
    expect(await store.listBuilds("act-1")).toEqual(buildsBefore);
  });
});
