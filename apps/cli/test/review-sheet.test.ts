import { describe, it, expect } from "vitest";
import { cp, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileStore } from "../src/file-store.js";
import { importIdFor } from "../src/generate.js";
import { reviewSheet } from "../src/review-sheet.js";

const phase2 = resolve(import.meta.dirname, "fixtures/phase2-store");

/** An import directory with one promoted, built multiChoice activity and a unit. */
async function seededDir(): Promise<{ dir: string; store: FileStore; importId: string }> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-sheet-")), "imp");
  const store = new FileStore(dir); const importId = importIdFor(dir);
  await store.putImport({ storeVersion: 2, importId, orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: "u".repeat(64), selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: importId, createdAt: "t", updatedAt: "t" });
  await store.putArtifact(importId, "unit", { code: "SYNELE001", title: "Isolate and test electrical equipment", release: "Release 1", assessmentConditions: null, textHash: "u".repeat(64), knowledgeEvidence: [], performanceEvidence: [], elements: [{ id: "E2", number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout devices and tags" }] }] });
  await store.putArtifact(importId, "source", { sourceId: "src", kind: "markdown", text: "Lock it out.", textHash: "s".repeat(64), sentences: [{ sentenceId: "s1", charStart: 0, charEnd: 12, text: "Lock it out." }], metadata: { characters: 12, codePoints: 12, extractionVersion: "x" } });
  await store.putArtifact(importId, "conceptMap", { sourceId: "src", textHash: "s".repeat(64), concepts: [{ conceptId: "c1", kind: "content", name: "Lockout", summary: "Lock it out.", evidence: [{ evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 12, quote: "Lock it out." }] }] });
  await store.putActivity({ activityId: "act-1", importId, type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false, unitTextHash: "u".repeat(64) });
  await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "Locks", type: "multiChoice", language: "en", schemaVersion: 1, question: "Who removes a lock?", answers: [{ text: "The worker who applied it", correct: true }, { text: "Anyone", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } }, schemaVersion: 1, promptVersion: "p", origin: "generate", requestId: null, modelConfig: { provider: "fake", models: {}, profiles: {} }, note: null, currentBuildId: "0123456789abcdef", attemptIds: [], createdAt: "t" });
  await store.putBuildRecord({ importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", buildKey: "builds/act-1-r1-abc.h5p", sha256: "0".repeat(64), byteLength: 1, engineFingerprint: "e".repeat(64), engineDisplay: "engine", engineInputs: { engineDist: [], workspaceDist: [], librariesLockSha256: "1".repeat(64), zlib: "1.3.1" }, nodeVersion: "20.20.2", builtAt: "t" });
  return { dir, store, importId };
}

const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

describe("leap review-sheet", () => {
  it("writes the manifest once under reviews/sheets/, then review-sheet.md, scores.csv and findings.csv in the import directory", async () => {
    const { dir, store, importId } = await seededDir();
    const first = io();
    expect(await reviewSheet({ out: dir }, first.io, () => new Date("2026-10-02T01:00:00Z"))).toBe(0);
    const [manifestFile] = await readdir(join(dir, "reviews", "sheets"));
    const sheetId = manifestFile!.replace(/\.json$/, "");
    expect(JSON.parse(await readFile(join(dir, "reviews", "sheets", manifestFile!), "utf8"))).toMatchObject({ sheetId, importId, unitTextHash: "u".repeat(64), rubricVersion: "r1", createdAt: "2026-10-02T01:00:00.000Z", entries: [{ activityId: "act-1", revision: 1, buildId: "0123456789abcdef", type: "multiChoice", itemIds: ["act-1"] }] });
    expect(first.out.join("")).toContain(`sheet ${sheetId} (new): 1 activity to review`);
    const md = await readFile(join(dir, "review-sheet.md"), "utf8");
    expect(md).toContain("Who removes a lock?");
    expect(md).toContain("[s1] Lock it out.");
    expect(md).toContain(`Package: ${join(dir, "builds/act-1-r1-abc.h5p")}`);
    expect(await readFile(join(dir, "scores.csv"), "utf8")).toBe(`sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision\n${sheetId},act-1,1,0123456789abcdef,,,,,,,\n`);
    expect(await readFile(join(dir, "findings.csv"), "utf8")).toBe("sheetId,activityId,dimension,itemId,score,reason\n");

    const again = io();
    expect(await reviewSheet({ out: dir }, again.io, () => new Date("2026-10-05T01:00:00Z"))).toBe(0);
    expect(again.out.join("")).toContain(`sheet ${sheetId} (unchanged since 2026-10-02T01:00:00.000Z)`);
    expect(await readdir(join(dir, "reviews", "sheets"))).toEqual([manifestFile]);
    expect((await store.getSheet(importId, sheetId))!.createdAt).toBe("2026-10-02T01:00:00.000Z");
  });

  it("says so and writes nothing when every promoted activity's current build already has a scored review", async () => {
    const { dir, store, importId } = await seededDir();
    await store.putScore({ rowKey: "k", batchId: "b", sequence: 1, rowIndex: 0, sheetId: "s", importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", unitTextHash: "u".repeat(64), rubricVersion: "r1", reviewer: "r", scores: { correctness: 2, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 2, decision: "accepted", decidedAt: "t" });
    const run = io();
    expect(await reviewSheet({ out: dir }, run.io)).toBe(0);
    expect(run.out.join("")).toBe("nothing to review: every promoted activity's current build already has a scored review\n");
    expect((await readdir(dir)).filter((n) => /review-sheet\.md|scores\.csv|findings\.csv|reviews/.test(n))).toEqual([]);
  });

  it("refuses a phase-2 (store version 1) directory and changes nothing", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-sheet-v1-")), "phase2-store");
    await cp(phase2, dir, { recursive: true });
    const before = (await readdir(dir)).sort();
    const run = io();
    expect(await reviewSheet({ out: dir }, run.io)).toBe(1);
    expect(run.err.join("")).toMatch(/^leap: .* was created by phase 2 \(store version 1\)\. It is kept unchanged and is read-only/);
    expect((await readdir(dir)).sort()).toEqual(before);
  });
});
