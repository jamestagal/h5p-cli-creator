import { describe, it, expect } from "vitest";
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  it("writes the manifest once and the sheet's bundle beside it; exporting the same sheet again keeps the reviewer's filled-in files", async () => {
    const { dir, store, importId } = await seededDir();
    const first = io();
    expect(await reviewSheet({ out: dir }, first.io, () => new Date("2026-10-02T01:00:00Z"))).toBe(0);
    const sheets = join(dir, "reviews", "sheets");
    const manifestFile = (await readdir(sheets)).find((n) => n.endsWith(".json"))!;
    const sheetId = manifestFile.replace(/\.json$/, "");
    expect((await readdir(sheets)).sort()).toEqual([sheetId, manifestFile].sort());
    expect(JSON.parse(await readFile(join(sheets, manifestFile), "utf8"))).toMatchObject({ sheetId, importId, unitTextHash: "u".repeat(64), rubricVersion: "r1", createdAt: "2026-10-02T01:00:00.000Z", entries: [{ activityId: "act-1", revision: 1, buildId: "0123456789abcdef", type: "multiChoice", itemIds: ["act-1"] }] });
    expect(first.out.join("")).toContain(`sheet ${sheetId} (new): 1 activity to review`);
    const bundle = join(sheets, sheetId);
    expect((await readdir(bundle)).sort()).toEqual(["findings.csv", "review-sheet.md", "scores.csv"]);
    const md = await readFile(join(bundle, "review-sheet.md"), "utf8");
    expect(md).toContain("Who removes a lock?");
    expect(md).toContain("[s1] Lock it out.");
    expect(md).toContain(`Package: ${join(dir, "builds/act-1-r1-abc.h5p")}`);
    expect(await readFile(join(bundle, "scores.csv"), "utf8")).toBe(`sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision\n${sheetId},act-1,1,0123456789abcdef,,,,,,,\n`);
    expect(await readFile(join(bundle, "findings.csv"), "utf8")).toBe("sheetId,activityId,dimension,itemId,score,reason\n");
    expect((await readdir(dir)).filter((n) => /review-sheet\.md|scores\.csv|findings\.csv/.test(n))).toEqual([]); // nothing loose in the import directory

    // the reviewer fills in scores and a finding, deletes the sheet text by mistake, and exports again
    const scores = `sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision\n${sheetId},act-1,1,0123456789abcdef,2,1,2,2,2,6,\n`;
    const findings = `sheetId,activityId,dimension,itemId,score,reason\n${sheetId},act-1,support,act-1,1,cited passage is partial\n`;
    await writeFile(join(bundle, "scores.csv"), scores);
    await writeFile(join(bundle, "findings.csv"), findings);
    await rm(join(bundle, "review-sheet.md"));
    const again = io();
    expect(await reviewSheet({ out: dir }, again.io, () => new Date("2026-10-05T01:00:00Z"))).toBe(0);
    expect(again.out.join("")).toContain(`sheet ${sheetId} (unchanged since 2026-10-02T01:00:00.000Z)`);
    expect(again.out.join("")).toContain(`${join(bundle, "scores.csv")} (kept: already there, not rewritten)`);
    expect(await readFile(join(bundle, "scores.csv"), "utf8")).toBe(scores);
    expect(await readFile(join(bundle, "findings.csv"), "utf8")).toBe(findings);
    expect(await readFile(join(bundle, "review-sheet.md"), "utf8")).toBe(md); // only the missing file is recreated
    expect((await readdir(sheets)).sort()).toEqual([sheetId, manifestFile].sort());
    expect((await store.getSheet(importId, sheetId))!.createdAt).toBe("2026-10-02T01:00:00.000Z");
  });

  it("a changed sheet gets a new bundle, and the earlier bundle stays exactly as the reviewer left it", async () => {
    const { dir, store, importId } = await seededDir();
    await reviewSheet({ out: dir }, io().io);
    const sheets = join(dir, "reviews", "sheets");
    const firstId = (await readdir(sheets)).find((n) => n.endsWith(".json"))!.replace(/\.json$/, "");
    const filled = `sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision\n${firstId},act-1,1,0123456789abcdef,2,2,2,2,2,4,\n`;
    await writeFile(join(sheets, firstId, "scores.csv"), filled);
    // a second promoted activity appears (a regeneration, say): the sheet changes
    await store.putActivity({ activityId: "act-2", importId, type: "multiChoice", order: 1, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: [], error: null, dropped: false, unitTextHash: "u".repeat(64) });
    const rev = (await store.getRevision("act-1", 1))!;
    await store.putRevision({ ...rev, activityId: "act-2", spec: { ...rev.spec, id: "act-2" }, currentBuildId: "fedcba9876543210" });
    await store.putBuildRecord({ ...(await store.getBuildRecord("0123456789abcdef"))!, activityId: "act-2", buildId: "fedcba9876543210", buildKey: "builds/act-2-r1-abc.h5p" });
    const run = io();
    expect(await reviewSheet({ out: dir }, run.io)).toBe(0);
    const ids = (await readdir(sheets)).filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, ""));
    expect(ids).toHaveLength(2);
    const secondId = ids.find((id) => id !== firstId)!;
    expect(run.out.join("")).toContain(`sheet ${secondId} (new): 2 activities to review`);
    expect(await readFile(join(sheets, firstId, "scores.csv"), "utf8")).toBe(filled);
    expect((await readFile(join(sheets, secondId, "scores.csv"), "utf8")).trimEnd().split("\n")).toHaveLength(3);
  });

  it("refuses a symbolic link anywhere on the way to the bundle, and writes nothing through it", async () => {
    for (const where of ["reviews", "bundle", "file"] as const) {
      const { dir } = await seededDir();
      const elsewhere = await mkdtemp(join(tmpdir(), "leap-sheet-elsewhere-"));
      if (where === "reviews") {
        await symlink(elsewhere, join(dir, "reviews"));
      } else {
        await reviewSheet({ out: dir }, io().io);
        const sheets = join(dir, "reviews", "sheets");
        const id = (await readdir(sheets)).find((n) => n.endsWith(".json"))!.replace(/\.json$/, "");
        if (where === "bundle") { await rm(join(sheets, id), { recursive: true }); await symlink(elsewhere, join(sheets, id)); }
        else { await rm(join(sheets, id, "scores.csv")); await symlink(join(elsewhere, "scores.csv"), join(sheets, id, "scores.csv")); }
      }
      const run = io();
      expect(await reviewSheet({ out: dir }, run.io), where).toBe(1);
      expect(run.err.join(""), where).toMatch(/^leap: .* is a symbolic link; review files are never written through a link/);
      expect(await readdir(elsewhere), where).toEqual([]);
    }
  });

  it("refuses a promoted activity whose build record is missing: a named error and exit 1, never 'nothing to review'", async () => {
    const { dir } = await seededDir();
    await rm(join(dir, "builds", "records", "0123456789abcdef.json"));
    const run = io();
    expect(await reviewSheet({ out: dir }, run.io)).toBe(1);
    expect(run.err.join("")).toMatch(/^leap: import imp: activity act-1 revision 1 points at build 0123456789abcdef, whose build record is missing; the review sheet was not written/);
    expect(run.out.join("")).toBe("");
    expect(await readdir(dir)).not.toContain("reviews");
  });

  it("says so and writes nothing when every promoted activity's current build already has a scored review", async () => {
    const { dir, store, importId } = await seededDir();
    await store.putScore({ rowKey: "k", batchId: "b", sequence: 1, rowIndex: 0, sheetId: "s", importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", unitTextHash: "u".repeat(64), rubricVersion: "r1", reviewer: "r", scores: { correctness: 2, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 2, decision: "accepted", decidedAt: "t" });
    const run = io();
    expect(await reviewSheet({ out: dir }, run.io)).toBe(0);
    expect(run.out.join("")).toBe("nothing to review: every promoted activity's current build already has a scored review\n");
    expect((await readdir(dir)).filter((n) => /review-sheet\.md|scores\.csv|findings\.csv|reviews/.test(n))).toEqual([]); // no manifest, no bundle
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
