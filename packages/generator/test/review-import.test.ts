import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { applicable, DIMENSIONS, type Dimension, type DimensionScore } from "@leaplearn/shared";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportInput } from "../src/pipeline/run-import.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { PlanRules } from "../src/plan/planner.js";
import type { ImportStore } from "../src/store/types.js";
import { exportReviewSheet, type ReviewSheet } from "../src/review/sheet.js";
import { importScores, parseCsv, validateImport, type ImportResult } from "../src/review/import.js";
import { activityScoreProblems, deriveDecision } from "../src/review/rubric.js";
import { appendMissingRecords } from "../src/review/batches.js";
import { countedScore } from "../src/review/scores.js";
import { conceptResponses, planOutFor, produceResponses, syntheticDoc, syntheticUnitText, unitOut, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { crashBefore, CrashError } from "./helpers/crashing-store.js";
import { IDENTITY_A } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const rules: PlanRules = { multiChoice: { perImport: 2 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
const at = (iso: string) => () => new Date(iso);

/** A complete import with four promoted activities: act-1 and act-2 multiChoice, act-3 blanks (b1, b2), act-4 flashcards (c1-c4). */
async function fourActivities(importId: string): Promise<MemoryStore> {
  const store = new MemoryStore(); const doc = await syntheticDoc();
  const { script } = conceptResponses(doc);
  const { mc, mc2, bl, fc } = produceResponses(doc);
  const input: RunImportInput = { importId, name: "n", source: doc, unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null };
  const record = await runImport(input, { store, provider: new FakeProvider([r(unitOut), ...script, r(planOutFor(["multiChoice", "multiChoice", "blanks", "flashcards"])), r(mc), r(mc2), r(bl), r(fc)]), registry, engineIdentity: IDENTITY_A, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined });
  expect(record.status).toBe("ready");
  return store;
}

/** Promotes a new revision of an activity at fixture level, as a regeneration would: same spec, a new build. */
async function regenerate(store: MemoryStore, importId: string, activityId: string): Promise<void> {
  const a = (await store.listActivities(importId)).find((x) => x.activityId === activityId)!;
  const rev = (await store.getRevision(activityId, a.currentRevision!))!;
  const build = (await store.getBuildRecord(rev.currentBuildId!))!;
  const next = rev.revision + 1; const buildId = `${build.buildId.slice(0, 15)}${next}`;
  await store.putRevision({ ...rev, state: "superseded" });
  await store.putBuildRecord({ ...build, revision: next, buildId, buildKey: build.buildKey.replace(`-r${rev.revision}-`, `-r${next}-`) });
  await store.putRevision({ ...rev, revision: next, origin: "regenerate", currentBuildId: buildId });
  await store.putActivity({ ...a, currentRevision: next });
}

type Fill = { scores: Partial<Record<Dimension, DimensionScore>>; minutes?: string; decision?: string };
const ALL2: Fill = { scores: { correctness: 2, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, minutes: "3" };

/** scores.csv as the sheet exported it, with the given rows filled in; every other row left as exported. */
function filled(sheet: ReviewSheet, fills: Record<string, Fill>): string {
  const rows = parseCsv(sheet.scoresCsv);
  const header = rows[0]!;
  const out = rows.slice(1).map((row) => {
    const fill = fills[row[1]!];
    if (!fill) return row;
    const entry = sheet.manifest.entries.find((e) => e.activityId === row[1])!;
    return header.map((h, i) => {
      if ((DIMENSIONS as readonly string[]).includes(h)) {
        const d = h as Dimension;
        if (!applicable(d, entry.type, sheet.manifest.unitTextHash !== null)) return row[i]!;
        return fill.scores[d] === undefined ? "" : String(fill.scores[d]);
      }
      if (h === "minutes") return fill.minutes ?? "3";
      if (h === "decision") return fill.decision ?? "";
      return row[i]!;
    });
  });
  return [header, ...out].map((r) => r.join(",")).join("\n") + "\n";
}
const findings = (sheet: ReviewSheet, lines: string[][]): string => ["sheetId,activityId,dimension,itemId,score,reason", ...lines.map((l) => [sheet.manifest.sheetId, ...l].join(","))].join("\n") + "\n";
const noFindings = (sheet: ReviewSheet) => findings(sheet, []);

async function importLocked(store: ImportStore, importId: string, scoresCsv: string, findingsCsv: string, clock = at("2026-10-02T02:00:00Z")): Promise<ImportResult> {
  const lock = await store.lock(importId);
  try { return await importScores(store, importId, { scoresCsv, findingsCsv, reviewer: "Benjamin" }, clock); } finally { await lock.release(); }
}

describe("rubric (design §5, R2)", () => {
  it("deriveDecision is total and exhaustive over all 3^5 score combinations, for every applicability mask", () => {
    const values = [0, 1, 2] as const;
    let checked = 0;
    for (const type of ["multiChoice", "blanks", "flashcards"]) for (const hasUnit of [true, false]) {
      for (let n = 0; n < 3 ** 5; n++) {
        const scores = {} as Record<Dimension, DimensionScore>;
        DIMENSIONS.forEach((d, i) => { scores[d] = applicable(d, type, hasUnit) ? values[Math.floor(n / 3 ** i) % 3]! : "na"; });
        const applied = DIMENSIONS.filter((d) => applicable(d, type, hasUnit)).map((d) => scores[d]);
        const expected = applied.includes(0) ? "rejected" : applied.includes(1) ? "needs-revision" : "accepted";
        expect(deriveDecision(scores, type, hasUnit)).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBe(6 * 243);
    // a non-applicable dimension never moves the decision, whatever it holds
    expect(deriveDecision({ correctness: 2, support: 2, distractors: 0, mapping: 0, usefulness: 2 }, "flashcards", false)).toBe("accepted");
  });

  it("an activity's score on a dimension must equal its lowest finding there, or 2 with none", () => {
    const s = (support: 0 | 1 | 2): Record<Dimension, DimensionScore> => ({ correctness: 2, support, distractors: "na", mapping: 2, usefulness: 2 });
    const f = (score: 0 | 1, itemId = "b1") => ({ dimension: "support" as const, itemId, score, reason: "r" });
    expect(activityScoreProblems(s(2), [], "blanks", true)).toEqual([]);
    expect(activityScoreProblems(s(1), [f(1)], "blanks", true)).toEqual([]);
    expect(activityScoreProblems(s(0), [f(1), f(0, "b2")], "blanks", true)).toEqual([]);
    expect(activityScoreProblems(s(1), [], "blanks", true)).toEqual(["support is 1 but has no finding; every 0 or 1 needs a finding naming the item and the reason"]);
    expect(activityScoreProblems(s(1), [f(0)], "blanks", true)).toEqual(["support is 1 but a finding scores it 0; the activity's score is the lowest of its findings"]);
    expect(activityScoreProblems(s(0), [f(1)], "blanks", true)).toEqual(["support is 0 but its lowest finding is 1; the activity's score is the lowest of its findings"]);
    expect(activityScoreProblems(s(2), [f(1)], "blanks", true)).toEqual(["support is 2 but a finding scores it 1; the activity's score is the lowest of its findings"]);
  });
});

describe("score import: row identity (R1)", () => {
  it("R1 sequence: score two, import; complete the other two in the same files, import; import again: four records of each kind, two batches", async () => {
    const store = await fourActivities("imp-r1");
    const sheet = (await exportReviewSheet(store, "imp-r1"))!;
    expect(sheet.manifest.entries.map((e) => e.activityId)).toEqual(["act-1", "act-2", "act-3", "act-4"]);
    const half = { "act-1": ALL2, "act-2": ALL2 };
    const first = await importLocked(store, "imp-r1", filled(sheet, half), noFindings(sheet));
    expect(first).toMatchObject({ status: "imported", committed: 0, notScored: 2, batch: { sequence: 1 } });
    if (first.status === "imported") expect(first.batch.rows.map((x) => [x.activityId, x.rowIndex, x.decision])).toEqual([["act-1", 0, "accepted"], ["act-2", 1, "accepted"]]);

    // Unaffected rows: the reviewed set changed, yet the remaining rows validate against the same sheet.
    const all = { ...half, "act-3": ALL2, "act-4": ALL2 };
    const check = await validateImport(store, "imp-r1", { scoresCsv: filled(sheet, all), findingsCsv: noFindings(sheet), reviewer: "Benjamin" });
    expect([check.problems, check.stale, check.committed, check.fresh.map((c) => c.activityId)]).toEqual([[], [], 2, ["act-3", "act-4"]]);

    const second = await importLocked(store, "imp-r1", filled(sheet, all), noFindings(sheet));
    expect(second).toMatchObject({ status: "imported", committed: 2, notScored: 0, batch: { sequence: 2 } });
    const third = await importLocked(store, "imp-r1", filled(sheet, all), noFindings(sheet));
    expect(third).toEqual({ status: "nothing-new", committed: 4, notScored: 0 });
    expect(await store.listScores("imp-r1")).toHaveLength(4);
    expect(await store.listAcceptanceRecords("imp-r1")).toHaveLength(4);
    expect((await store.listBatches("imp-r1")).map((b) => b.sequence)).toEqual([1, 2]);
    expect((await exportReviewSheet(store, "imp-r1"))).toBeNull(); // every current build now has a counted review
  });

  it("stale rows make the whole import refused, naming what changed, and nothing is written; blanking the stale row lets the rest commit", async () => {
    const store = await fourActivities("imp-stale");
    const sheet = (await exportReviewSheet(store, "imp-stale"))!;
    await regenerate(store, "imp-stale", "act-2");
    const before = [await store.listScores("imp-stale"), await store.listAcceptanceRecords("imp-stale"), await store.listBatches("imp-stale")];
    const refused = await importLocked(store, "imp-stale", filled(sheet, { "act-1": ALL2, "act-2": ALL2, "act-3": ALL2 }), noFindings(sheet));
    expect(refused.status).toBe("refused");
    if (refused.status === "refused") {
      expect(refused.problems).toEqual([]);
      expect(refused.stale).toEqual(["row 2 (act-2): stale: revision changed (the sheet has revision 1; the activity is now at revision 2)"]);
    }
    expect([await store.listScores("imp-stale"), await store.listAcceptanceRecords("imp-stale"), await store.listBatches("imp-stale")]).toEqual(before);

    const retried = await importLocked(store, "imp-stale", filled(sheet, { "act-1": ALL2, "act-3": ALL2 }), noFindings(sheet));
    expect(retried).toMatchObject({ status: "imported", notScored: 2 });
    expect((await store.listScores("imp-stale")).map((s) => s.activityId)).toEqual(["act-1", "act-3"]);
  });

  it("a committed row is recognised as committed before the stale check, even after its activity is regenerated", async () => {
    const store = await fourActivities("imp-committed");
    const sheet = (await exportReviewSheet(store, "imp-committed"))!;
    const file = filled(sheet, { "act-1": ALL2 });
    expect((await importLocked(store, "imp-committed", file, noFindings(sheet))).status).toBe("imported");
    await regenerate(store, "imp-committed", "act-1");
    expect(await importLocked(store, "imp-committed", file, noFindings(sheet))).toEqual({ status: "nothing-new", committed: 1, notScored: 3 });
  });

  it("a correction gets a new rowKey: still current, it commits in a later batch and readers return it; stale, the whole import is refused", async () => {
    const store = await fourActivities("imp-fix");
    const sheet = (await exportReviewSheet(store, "imp-fix"))!;
    await importLocked(store, "imp-fix", filled(sheet, { "act-1": ALL2 }), noFindings(sheet));
    const corrected = filled(sheet, { "act-1": { scores: { ...ALL2.scores, usefulness: 1 } } });
    const withFinding = findings(sheet, [["act-1", "usefulness", "act-1", "1", "trivial for this unit"]]);
    const second = await importLocked(store, "imp-fix", corrected, withFinding);
    expect(second).toMatchObject({ status: "imported", batch: { sequence: 2 } });
    const rev = (await store.getRevision("act-1", 1))!;
    expect(countedScore(await store.listScores("imp-fix"), "act-1", 1, rev.currentBuildId!)).toMatchObject({ sequence: 2, decision: "needs-revision" });
    expect((await store.listAcceptances("imp-fix")).find((a) => a.activityId === "act-1")).toMatchObject({ sequence: 2, decision: "needs-revision" });

    await regenerate(store, "imp-fix", "act-1");
    const stale = await importLocked(store, "imp-fix", filled(sheet, { "act-1": { scores: { ...ALL2.scores, usefulness: 0 } } }), findings(sheet, [["act-1", "usefulness", "act-1", "0", "off-topic"]]));
    expect(stale).toMatchObject({ status: "refused", stale: [expect.stringMatching(/^row 1 \(act-1\): stale: revision changed/)] });
    expect(await store.listBatches("imp-fix")).toHaveLength(2);
  });
});

describe("score import: every problem at once (design §7.2)", () => {
  it("names each problem: duplicate rows, an unknown sheet, a partly scored row, na where it applies, an unknown item, a finding on a dimension that does not apply, and a 1 with no finding", async () => {
    const store = await fourActivities("imp-errors");
    const sheet = (await exportReviewSheet(store, "imp-errors"))!;
    const id = sheet.manifest.sheetId;
    const rows = parseCsv(filled(sheet, { "act-1": { scores: { ...ALL2.scores, support: 1 } }, "act-2": { scores: { correctness: 2, support: 2 } }, "act-3": { scores: { ...ALL2.scores, correctness: "na" } }, "act-4": ALL2 }));
    const csv = [...rows, rows[1]!.slice(), ["f".repeat(64), "act-9", "1", "x", "2", "2", "2", "2", "2", "3", ""]].map((r) => r.join(",")).join("\n") + "\n";
    const finds = findings(sheet, [["act-4", "support", "c9", "1", "no such card"], ["act-4", "distractors", "c1", "1", "flashcards have no distractors"]]);
    const v = await validateImport(store, "imp-errors", { scoresCsv: csv, findingsCsv: finds, reviewer: "B" });
    expect(v.problems).toEqual([
      "row 2 (act-2): partly scored: distractors, mapping, usefulness are blank; score every applicable dimension or none",
      "row 3 (act-3): correctness applies to blanks; na is not allowed, score it 0, 1 or 2",
      "row 5 (act-1): act-1 appears more than once in scores.csv",
      `row 6 (act-9): sheet ${"f".repeat(64)} is not a sheet of import imp-errors`,
      `finding 1 (act-4, support, c9): item c9 is not in act-4 revision 1 (items: c1, c2, c3, c4)`,
      "finding 2 (act-4, distractors, c1): distractors does not apply to flashcards; a finding cannot be recorded on it",
      "row 1 (act-1): support is 1 but has no finding; every 0 or 1 needs a finding naming the item and the reason"
    ]);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await importLocked(store, "imp-errors", csv, finds)).toMatchObject({ status: "refused" });
    expect(await store.listBatches("imp-errors")).toEqual([]);
  });

  it("a contradictory decision column shows the derived decision; a blank or matching one is fine", async () => {
    const store = await fourActivities("imp-decision");
    const sheet = (await exportReviewSheet(store, "imp-decision"))!;
    const bad = await validateImport(store, "imp-decision", { scoresCsv: filled(sheet, { "act-1": { ...ALL2, decision: "rejected" } }), findingsCsv: noFindings(sheet), reviewer: "B" });
    expect(bad.problems).toEqual(['row 1 (act-1): decision "rejected" does not match the scores; the derived decision is "accepted"']);
    for (const decision of ["", "accepted"]) {
      const ok = await validateImport(store, "imp-decision", { scoresCsv: filled(sheet, { "act-1": { ...ALL2, decision } }), findingsCsv: noFindings(sheet), reviewer: "B" });
      expect(ok.problems, decision).toEqual([]);
    }
  });
});

describe("batch commit and recovery (design §7.3, R8)", () => {
  it("recovery order: batch 1's missing records are appended after batch 2's, and every reader still returns batch 2's score and decision", async () => {
    const store = await fourActivities("imp-order");
    const sheet = (await exportReviewSheet(store, "imp-order"))!;
    await importLocked(store, "imp-order", filled(sheet, { "act-1": ALL2 }), noFindings(sheet));
    await importLocked(store, "imp-order", filled(sheet, { "act-1": { scores: { ...ALL2.scores, correctness: 0 } } }), findings(sheet, [["act-1", "correctness", "act-1", "0", "keyed answer is wrong"]]));
    const [b1, b2] = await store.listBatches("imp-order");
    // the fixture: a store whose ledgers hold batch 2's records but not batch 1's
    const damaged = new MemoryStore();
    await damaged.putImport((await store.getImport("imp-order"))!);
    for (const b of [b2!, b1!]) await damaged.commitBatch(b);
    await appendMissingRecords(damaged, "imp-order", [b2!]);
    expect((await damaged.listScores("imp-order")).map((s) => s.sequence)).toEqual([2]);
    const lock = await damaged.lock("imp-order"); // replay
    await lock.release();
    expect((await damaged.listScores("imp-order")).map((s) => s.sequence)).toEqual([2, 1]); // appended after
    const buildId = b1!.rows[0]!.buildId;
    expect(countedScore(await damaged.listScores("imp-order"), "act-1", 1, buildId)).toMatchObject({ sequence: 2, decision: "rejected" });
    expect(await damaged.listAcceptances("imp-order")).toMatchObject([{ activityId: "act-1", sequence: 2, decision: "rejected" }]);
    expect((await damaged.listBatches("imp-order")).map((b) => b.sequence)).toEqual([1, 2]); // by sequence, whatever order they were stored in
  });

  it("a crash after the batch commit and before the ledger appends: the next lock appends the missing records once, and the one after appends nothing", async () => {
    const store = await fourActivities("imp-crash");
    const sheet = (await exportReviewSheet(store, "imp-crash"))!;
    const crashing = crashBefore(store, "putScore", 1);
    await expect(importLocked(crashing, "imp-crash", filled(sheet, { "act-1": ALL2, "act-2": ALL2 }), noFindings(sheet))).rejects.toBeInstanceOf(CrashError);
    expect(await store.listBatches("imp-crash")).toHaveLength(1); // committed
    expect([await store.listScores("imp-crash"), await store.listAcceptanceRecords("imp-crash")]).toEqual([[], []]);
    await (await store.lock("imp-crash")).release(); // the next command to take the lock replays the committed batch
    expect(await store.listScores("imp-crash")).toHaveLength(2);
    expect(await store.listAcceptanceRecords("imp-crash")).toHaveLength(2);
    await (await store.lock("imp-crash")).release();
    expect(await store.listScores("imp-crash")).toHaveLength(2);
    expect(await store.listAcceptanceRecords("imp-crash")).toHaveLength(2);
  });

  it("a crash before the batch commit leaves no batch and no records, and the import can be rerun", async () => {
    const store = await fourActivities("imp-early");
    const sheet = (await exportReviewSheet(store, "imp-early"))!;
    const file = filled(sheet, { "act-1": ALL2 });
    await expect(importLocked(crashBefore(store, "commitBatch", 1), "imp-early", file, noFindings(sheet))).rejects.toBeInstanceOf(CrashError);
    expect([await store.listBatches("imp-early"), await store.listScores("imp-early"), await store.listAcceptanceRecords("imp-early")]).toEqual([[], [], []]);
    expect(await importLocked(store, "imp-early", file, noFindings(sheet))).toMatchObject({ status: "imported", batch: { sequence: 1 } });
  });
});
