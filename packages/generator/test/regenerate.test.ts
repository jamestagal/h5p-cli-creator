import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { RUBRIC_VERSION, type ScoreDecision } from "@leaplearn/shared";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportInput } from "../src/pipeline/run-import.js";
import { regenerateActivity, RegenerateRefused, type RegenerateInput } from "../src/pipeline/regenerate.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { PlanRules } from "../src/plan/planner.js";
import type { AttemptStart } from "../src/llm/types.js";
import type { ImportStore } from "../src/store/types.js";
import { fullScript, produceResponses, syntheticDoc, syntheticUnitText, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { crashBefore, CrashError } from "./helpers/crashing-store.js";
import { IDENTITY_A } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
const NOTE = "Make the distractors less obviously wrong.";

/** A complete import: act-1 multiChoice, act-2 blanks, act-3 flashcards, all promoted at revision 1. */
async function completeImport(importId: string): Promise<MemoryStore> {
  const store = new MemoryStore();
  const input: RunImportInput = { importId, name: "n", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null };
  await runImport(input, { store, provider: new FakeProvider(await fullScript(await syntheticDoc())), registry, engineIdentity: IDENTITY_A, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined });
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

const deps = (store: ImportStore, provider: FakeProvider) => ({ store, provider, registry, engineIdentity: IDENTITY_A, sleep: async () => undefined });
/** Regenerates act-1 with NOTE; `note: null` leaves the note out, as a resume may. */
const regen = (store: ImportStore, provider: FakeProvider, overrides: { note?: string | null; budget?: RegenerateInput["budget"] } = {}) => {
  const note = overrides.note === null ? {} : { note: overrides.note ?? NOTE };
  return regenerateActivity({ importId: "imp", activityId: "act-1", ...note, ...(overrides.budget ? { budget: overrides.budget } : {}) }, deps(store, provider));
};
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

