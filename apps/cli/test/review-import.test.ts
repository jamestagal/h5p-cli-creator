import { describe, it, expect } from "vitest";
import { cp, mkdtemp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { countedScore, type ReviewBatch } from "@leaplearn/generator";
import { FileStore } from "../src/file-store.js";
import { review } from "../src/review.js";
import { reviewImport } from "../src/review-import.js";
import { reviewSheet } from "../src/review-sheet.js";
import { seededDir } from "./helpers/seeded-import.js";

const phase2 = resolve(import.meta.dirname, "fixtures/phase2-store");
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

/** The seeded import plus a second promoted multiChoice activity, exported to a sheet; returns the bundle's paths. */
async function exported() {
  const seeded = await seededDir();
  const { store, importId, dir } = seeded;
  await store.putActivity({ activityId: "act-2", importId, type: "multiChoice", order: 1, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false, unitTextHash: "u".repeat(64) });
  const rev = (await store.getRevision("act-1", 1))!;
  await store.putRevision({ ...rev, activityId: "act-2", spec: { ...rev.spec, id: "act-2" }, currentBuildId: "fedcba9876543210" });
  await store.putBuildRecord({ ...(await store.getBuildRecord("0123456789abcdef"))!, activityId: "act-2", buildId: "fedcba9876543210", buildKey: "builds/act-2-r1-abc.h5p" });
  expect(await reviewSheet({ out: dir }, io().io)).toBe(0);
  const sheets = join(dir, "reviews", "sheets");
  const sheetId = (await readdir(sheets)).find((n) => n.endsWith(".json"))!.replace(/\.json$/, "");
  return { ...seeded, sheetId, scores: join(sheets, sheetId, "scores.csv"), findings: join(sheets, sheetId, "findings.csv") };
}
const header = "sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision";
const row = (sheetId: string, activityId: string, buildId: string, cells: string) => `${sheetId},${activityId},1,${buildId},${cells}`;

describe("leap review-import", () => {
  it("imports scored rows as batch files, skips committed and unscored rows, says when there is nothing new, and refreshes mapping.csv", async () => {
    const { dir, store, importId, sheetId, scores } = await exported();
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,2,2,2,2,4,"), row(sheetId, "act-2", "fedcba9876543210", ",,,,,,")].join("\n") + "\n");
    const first = io();
    expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, first.io, () => new Date("2026-10-02T03:00:00Z"))).toBe(0);
    expect(first.out[0]).toMatch(/^imported batch 1 \([0-9a-f]{12}\): 1 new row \(1 accepted\); 0 already committed, 1 not scored\n$/);
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toMatch(/\nact-1,multiChoice,Locks,1,,PC2\.1,reviewed,/);

    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,2,2,2,2,4,"), row(sheetId, "act-2", "fedcba9876543210", "2,2,2,2,2,5,accepted")].join("\n") + "\n");
    expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, io().io)).toBe(0);
    const again = io();
    expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, again.io)).toBe(0);
    expect(again.out.join("")).toBe("nothing new to import (2 rows already committed, 0 not scored)\n");
    expect((await readdir(join(dir, "reviews", "batches"))).sort()).toEqual([expect.stringMatching(/^000001-[0-9a-f]{64}\.json$/), expect.stringMatching(/^000002-[0-9a-f]{64}\.json$/)]);
    expect((await readFile(join(dir, "scores.jsonl"), "utf8")).trimEnd().split("\n")).toHaveLength(2);
    expect((await store.listAcceptanceRecords(importId)).map((a) => [a.activityId, a.sequence, a.decision])).toEqual([["act-1", 1, "accepted"], ["act-2", 2, "accepted"]]);
  });

  it("reports every problem, exits 1 and writes nothing: no batch file, and the ledgers are byte-identical", async () => {
    const { dir, sheetId, scores, findings } = await exported();
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,1,2,2,2,4,accepted"), row(sheetId, "act-2", "fedcba9876543210", "2,2,,,,3,")].join("\n") + "\n");
    await writeFile(findings, `sheetId,activityId,dimension,itemId,score,reason\n${sheetId},act-1,support,act-9,1,"partial, at best"\n`);
    const run = io();
    expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, run.io)).toBe(1);
    expect(run.err.join("")).toBe([
      "leap: nothing was imported; 2 problems to fix:",
      "  row 2 (act-2): partly scored: distractors, mapping, usefulness are blank; score every applicable dimension or none",
      "  finding 1 (act-1, support, act-9): item act-9 is not in act-1 revision 1 (items: act-1)", // the rubric rule is not applied over a broken finding
      ""
    ].join("\n"));
    expect(await readdir(join(dir, "reviews"))).toEqual(["sheets"]);
    expect(await readdir(dir)).not.toContain("scores.jsonl");
  });

  it("a stale row refuses the whole import and leaves the batch files and both ledgers byte-identical", async () => {
    const { dir, store, importId, sheetId, scores } = await exported();
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,2,2,2,2,4,")].join("\n") + "\n");
    await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, io().io);
    // act-2 is regenerated after the export: revision 2 is now current
    const rev = (await store.getRevision("act-2", 1))!;
    await store.putRevision({ ...rev, revision: 2, origin: "regenerate", currentBuildId: "fedcba9876543211" });
    await store.putActivity({ ...(await store.listActivities(importId)).find((a) => a.activityId === "act-2")!, currentRevision: 2 });
    const snapshot = async () => [await readFile(join(dir, "scores.jsonl")), await readFile(join(dir, "acceptances.jsonl")), (await readdir(join(dir, "reviews", "batches"))).join()];
    const before = await snapshot();
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,2,2,2,2,4,"), row(sheetId, "act-2", "fedcba9876543210", "2,2,2,2,2,5,")].join("\n") + "\n");
    const run = io();
    expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, run.io)).toBe(1);
    expect(run.err.join("")).toBe("leap: nothing was imported; 1 problem to fix:\n  row 2 (act-2): stale: revision changed (the sheet has revision 1; the activity is now at revision 2)\n");
    expect(await snapshot()).toEqual(before);
  });

  it("orders batches by their recorded sequence, not their file names; a committed batch with missing ledger records is completed on the next lock", async () => {
    const { dir, importId, sheetId, scores } = await exported();
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "2,2,2,2,2,4,")].join("\n") + "\n");
    await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, io().io);
    await writeFile(scores, [header, row(sheetId, "act-1", "0123456789abcdef", "0,2,2,2,2,4,")].join("\n") + "\n");
    await writeFile(join(dir, "reviews", "sheets", sheetId, "findings.csv"), `sheetId,activityId,dimension,itemId,score,reason\n${sheetId},act-1,correctness,act-1,0,keyed answer is wrong\n`);
    await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, io().io);
    const batches = join(dir, "reviews", "batches");
    const [one, two] = (await readdir(batches)).sort();
    await rename(join(batches, one!), join(batches, "zz-first.json")); // directory order now puts batch 1 last
    await rename(join(batches, two!), join(batches, "aa-second.json"));
    expect((await new FileStore(dir).listBatches(importId)).map((b) => b.sequence)).toEqual([1, 2]);

    // a crash left batch 1's ledger records unwritten: drop them from the ledgers, then take the lock
    const b1 = JSON.parse(await readFile(join(batches, "zz-first.json"), "utf8")) as ReviewBatch;
    for (const ledger of ["scores.jsonl", "acceptances.jsonl"]) {
      const kept = (await readFile(join(dir, ledger), "utf8")).trimEnd().split("\n").filter((l) => (JSON.parse(l) as { batchId?: string }).batchId !== b1.batchId);
      await writeFile(join(dir, ledger), kept.join("\n") + "\n");
    }
    const reopened = new FileStore(dir);
    await (await reopened.lock(importId)).release();
    const ledgerScores = await reopened.listScores(importId);
    expect(ledgerScores.map((s) => s.sequence)).toEqual([2, 1]); // batch 1's record appended after batch 2's
    expect(countedScore(ledgerScores, "act-1", 1, "0123456789abcdef")).toMatchObject({ sequence: 2, decision: "rejected" });
    expect((await reopened.listAcceptances(importId)).find((a) => a.activityId === "act-1")).toMatchObject({ sequence: 2, decision: "rejected" });
    await (await reopened.lock(importId)).release();
    expect(await reopened.listScores(importId)).toHaveLength(2); // the second lock appends nothing
  });
});

describe("leap review --decision", () => {
  it("exits 1 on a version-2 store: acceptance comes from review-sheet and review-import", async () => {
    const { dir } = await seededDir();
    const run = io();
    expect(await review({ out: dir, activity: "act-1", reviewer: "Benjamin", decision: "accepted" }, run.io)).toBe(1);
    expect(run.err.join("")).toBe("leap: acceptance is recorded through leap review-sheet and leap review-import\n");
  });

  it("exits 1 on the phase-2 fixture with the legacy message", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-review-v1-")), "phase2-store");
    await cp(phase2, dir, { recursive: true });
    const run = io();
    expect(await review({ out: dir, activity: "act-1", reviewer: "Benjamin", decision: "accepted" }, run.io)).toBe(1);
    expect(run.err.join("")).toMatch(/^leap: .* was created by phase 2 \(store version 1\)\. It is kept unchanged and is read-only/);
  });
});
