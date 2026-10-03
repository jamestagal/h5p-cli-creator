import { describe, it, expect } from "vitest";
import { cp, link, mkdir, mkdtemp, readdir, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RUBRIC_VERSION } from "@leaplearn/shared";
import { gateReport } from "../src/gate-report.js";
import { seededDir } from "./helpers/seeded-import.js";

const phase2 = resolve(import.meta.dirname, "fixtures/phase2-store");
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

/** The seeded import with its plan and a scored, rejected review whose finding has a reviewer's reason. */
async function reviewed() {
  const seeded = await seededDir();
  await seeded.store.putArtifact(seeded.importId, "plan", [{ activityId: "act-1", slot: 1, type: "multiChoice", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "Lockout focus" }]);
  await seeded.store.putScore({ rowKey: "k", batchId: "b", sequence: 1, rowIndex: 0, sheetId: "s", importId: seeded.importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", unitTextHash: "u".repeat(64), rubricVersion: RUBRIC_VERSION, reviewer: "Benjamin", scores: { correctness: 0, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [{ dimension: "correctness", itemId: "act-1", score: 0, reason: "rto-claim: the key repeats the packet's own arrangement" }], minutes: 3, decision: "rejected", decidedAt: "t" });
  return seeded;
}
async function legacyCopy(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-gate-v1-")), "phase2-store");
  await cp(phase2, dir, { recursive: true });
  return dir;
}
const snapshotFiles = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else out[p] = (await readFile(p)).toString("base64"); } };
  await walk(dir);
  return out;
};

describe("leap gate-report", () => {
  it("writes gate-report.md in the first directory and a summary with no content strings", async () => {
    const { dir } = await reviewed();
    const summary = join(await mkdtemp(join(tmpdir(), "leap-gate-sum-")), "summary.json");
    const run = io();
    expect(await gateReport({ dirs: [dir], summary }, run.io)).toBe(0);
    expect(run.out.join("")).toContain("complete; thresholds not frozen, not evaluated");
    const md = await readFile(join(dir, "gate-report.md"), "utf8");
    expect(md).toMatch(/\| multiChoice \| 1 \| 1 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 1 \| 0 \| 0\/1 \(0%\) \| 0\/1 \(0%\) \|/);
    expect(md).toContain("Negative check (findings tagged `rto-claim`): 1 finding(s) on 1 activity");
    const json = await readFile(summary, "utf8");
    expect(JSON.parse(json)).toMatchObject({ thresholdsFrozen: false, imports: [{ status: "complete", unit: { code: "SYNELE001" } }], plannedMinimum: { multiChoice: 25, blanks: 15, flashcards: 5 } });
    // no source sentence, activity text, target text, title, focus or finding reason, in either file
    const content = ["Lock it out.", "Who removes a lock?", "The worker who applied it", "Anyone", "Locks", "Lockout", "Apply lockout devices and tags", "Isolate and secure equipment", "Isolate and test electrical equipment", "Lockout focus", "repeats the packet"];
    for (const text of content) { expect(json).not.toContain(text); expect(md).not.toContain(text); }
  });

  it("lists a phase-2 directory as not eligible, changes no figure, and writes nothing in it", async () => {
    const { dir } = await reviewed();
    const v1 = await legacyCopy();
    const before = await snapshotFiles(v1);
    const alone = join(await mkdtemp(join(tmpdir(), "leap-gate-sum-")), "a.json");
    const withLegacy = join(await mkdtemp(join(tmpdir(), "leap-gate-sum-")), "b.json");
    expect(await gateReport({ dirs: [dir], summary: alone }, io().io)).toBe(0);
    const run = io();
    expect(await gateReport({ dirs: [dir, v1], summary: withLegacy }, run.io)).toBe(0);
    const a = JSON.parse(await readFile(alone, "utf8")) as Record<string, unknown>; const b = JSON.parse(await readFile(withLegacy, "utf8")) as Record<string, unknown>;
    expect(b.imports).toEqual(a.imports);
    expect(b.pooled).toEqual(a.pooled);
    expect(b.notEligible).toHaveLength(1);
    expect(await readFile(join(dir, "gate-report.md"), "utf8")).toMatch(/## Not eligible \(phase-2 store\)\n\n- .*historical acceptances \d+ accepted, \d+ needs-revision, \d+ rejected; no rubric scores; excluded from the gate/);
    expect(await snapshotFiles(v1)).toEqual(before);
  });

  it("refuses a phase-2 directory first, since gate-report.md is never written there", async () => {
    const v1 = await legacyCopy();
    const run = io();
    expect(await gateReport({ dirs: [v1] }, run.io)).toBe(1);
    expect(run.err.join("")).toContain("is a phase-2 store, which is never written");
    expect(await readdir(v1)).not.toContain("gate-report.md");
  });

  it("never writes over store files: a summary or report path inside an import directory, a symlink, or a hard link is refused before anything is written (review of 2179e31)", async () => {
    const { dir } = await reviewed();
    const v1 = await legacyCopy();
    const elsewhere = await mkdtemp(join(tmpdir(), "leap-gate-out-"));
    const alias = join(elsewhere, "alias.json"); await symlink(join(v1, "import.json"), alias);
    const hard = join(elsewhere, "hard.json"); await link(join(dir, "import.json"), hard);
    const v1Before = await snapshotFiles(v1); const v2Import = await readFile(join(dir, "import.json"), "utf8");
    const cases: Array<[string, RegExp]> = [
      [join(v1, "import.json"), /is inside the import directory/],
      [join(dir, "import.json"), /is inside the import directory|has other hard links/], // hard-linked below, so either refusal applies
      [join(dir, "reviews", "summary.json"), /is inside the import directory|does not exist/],
      [join(dir, "gate-report.md"), /is inside the import directory/],
      [alias, /is not a regular file/],
      [hard, /has other hard links/]
    ];
    await mkdir(join(dir, "reviews"), { recursive: true });
    for (const [summary, message] of cases) {
      const run = io();
      expect(await gateReport({ dirs: [dir, v1], summary }, run.io)).toBe(1);
      expect(run.err.join("")).toMatch(message);
      expect(run.err.join("")).toContain("nothing was written");
    }
    expect(await readdir(dir)).not.toContain("gate-report.md"); // neither destination was published
    expect(await snapshotFiles(v1)).toEqual(v1Before);
    expect(await readFile(join(dir, "import.json"), "utf8")).toBe(v2Import);
    // the report's own path is protected the same way: a gate-report.md that is a link to the import record is refused
    await symlink(join(dir, "import.json"), join(dir, "gate-report.md"));
    const run = io();
    expect(await gateReport({ dirs: [dir] }, run.io)).toBe(1);
    expect(run.err.join("")).toMatch(/the report .*gate-report\.md exists and is not a regular file/);
    expect(await readFile(join(dir, "import.json"), "utf8")).toBe(v2Import);
  });
});
