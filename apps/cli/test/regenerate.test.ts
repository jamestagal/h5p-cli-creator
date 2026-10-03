import { describe, it, expect } from "vitest";
import { cp, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_PLAN_RULES, DEFAULT_PROMPT_CONFIG, type ModelProvider } from "@leaplearn/generator";
import { regenerate } from "../src/regenerate.js";
import { seededDir } from "./helpers/seeded-import.js";

const root = resolve(import.meta.dirname, "../../..");
const libraries = resolve(root, "libraries");
const phase2 = resolve(import.meta.dirname, "fixtures/phase2-store");
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

/** The seeded import with a needs-revision review of act-1's current build. */
async function needsRevision() {
  const seeded = await seededDir();
  await seeded.store.putScore({ rowKey: "k", batchId: "b", sequence: 1, rowIndex: 0, sheetId: "s", importId: seeded.importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", unitTextHash: "u".repeat(64), rubricVersion: "r1", reviewer: "B", scores: { correctness: 1, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [{ dimension: "correctness", itemId: "act-1", score: 1, reason: "ambiguous" }], minutes: 3, decision: "needs-revision", decidedAt: "t" });
  return seeded;
}

describe("leap regenerate", () => {
  it("a paid provider without a ledger entry is refused before any request is appended", async () => {
    const { dir, store, importId } = await needsRevision();
    for (const provider of ["anthropic", "record"] as const) {
      const run = io();
      expect(await regenerate({ out: dir, activity: "act-1", note: "fix it", libraries, provider, fixtures: join(dir, "fixtures") }, run.io)).toBe(1);
      expect(run.err.join("")).toContain(`--provider ${provider} can make paid calls, so it needs --ledger <file> and --run <id>`);
    }
    const ledger = join(await mkdtemp(join(tmpdir(), "leap-regen-ledger-")), "ledger.json");
    await writeFile(ledger, JSON.stringify({ totalCapUsd: 1, runs: [{ runId: "S1", outDir: join(dir, "..", "other"), capUsd: 1, authorisedBy: "B", authorisedOn: "2026-10-02" }] }));
    const listed = io();
    expect(await regenerate({ out: dir, activity: "act-1", note: "fix it", libraries, provider: "anthropic", ledger, run: "P1" }, listed.io)).toBe(1);
    expect(listed.err.join("")).toContain('run "P1" is not in the ledger');
    expect(await store.listRegenerations(importId)).toEqual([]);
    expect(await readdir(dir)).not.toContain("regenerations.jsonl");
  });

  it("refuses an activity that is not eligible, and a phase-2 directory, with exit 1 and nothing appended", async () => {
    const { dir, store, importId } = await seededDir(); // no scored review
    const run = io();
    expect(await regenerate({ out: dir, activity: "act-1", note: "fix it", libraries, provider: "replay", fixtures: join(dir, "none") }, run.io)).toBe(1);
    expect(run.err.join("")).toBe("leap: activity act-1 revision 1 has no scored review of its current build; review it with leap review-sheet and leap review-import first\n");
    expect(await store.listRegenerations(importId)).toEqual([]);
    const v1 = join(await mkdtemp(join(tmpdir(), "leap-regen-v1-")), "phase2-store");
    await cp(phase2, v1, { recursive: true });
    const legacy = io();
    expect(await regenerate({ out: v1, activity: "act-1", note: "fix it", libraries, provider: "replay", fixtures: join(v1, "none") }, legacy.io)).toBe(1);
    expect(legacy.err.join("")).toMatch(/^leap: .* was created by phase 2 \(store version 1\)/);
  });

  it("an import without stored production settings is refused before any request is appended (3 Oct)", async () => {
    const { dir, store, importId } = await needsRevision(); // seeded before settings were stored
    const run = io();
    expect(await regenerate({ out: dir, activity: "act-1", note: "fix it", libraries, provider: "replay", fixtures: join(dir, "none") }, run.io)).toBe(1);
    expect(run.err.join("")).toContain(`import ${importId} has no stored production settings`);
    expect(await store.listRegenerations(importId)).toEqual([]);
  });

  it("a ledger cap above the import's does not raise it, without --budget-usd (3 Oct)", async () => {
    const { dir, store, importId } = await needsRevision(); // the import's cap is $0.000001
    await store.putArtifact(importId, "settings", { promptConfig: DEFAULT_PROMPT_CONFIG, rules: DEFAULT_PLAN_RULES, language: "en" });
    await store.putArtifact(importId, "plan", [{ activityId: "act-1", slot: 1, type: "multiChoice", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "Lockout" }]);
    const ledger = join(await mkdtemp(join(tmpdir(), "leap-regen-ledger-")), "ledger.json");
    await writeFile(ledger, JSON.stringify({ totalCapUsd: 1, runs: [{ runId: "P1", outDir: dir, capUsd: 1, authorisedBy: "B", authorisedOn: "2026-10-03" }] }));
    let calls = 0;
    const provider: ModelProvider = { name: "fake", complete: async () => { calls += 1; throw new Error("no call is expected"); } };
    const run = io();
    expect(await regenerate({ out: dir, activity: "act-1", note: "fix it", libraries, provider: "anthropic", ledger, run: "P1" }, run.io, { provider })).toBe(1);
    expect(run.err.join("")).toContain("failed (budget: ");
    expect(calls).toBe(0);
    expect(await store.listRegenerations(importId)).toMatchObject([{ status: "failed", budget: { usdMicro: 1 } }]);
  });
});
