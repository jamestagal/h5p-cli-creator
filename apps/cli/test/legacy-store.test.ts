import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { FileStore } from "../src/file-store.js";
import { readLegacyImport } from "../src/legacy-store.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const fixture = resolve(import.meta.dirname, "fixtures/phase2-store");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const unitTxt = resolve(root, "packages/generator/test/fixtures/synthetic/unit-synele001.txt");
const librariesDir = resolve(root, "libraries");

/** Every file under `dir` as `relative path + sha256 of its bytes`, sorted, hashed once: any added, removed or changed file changes it. */
async function treeHash(dir: string): Promise<string> {
  const lines: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) { lines.push(`${relative(dir, path).split(sep).join("/")}/`); await walk(path); continue; }

      lines.push(`${relative(dir, path).split(sep).join("/")} ${createHash("sha256").update(await readFile(path)).digest("hex")}`);
    }
  };
  await walk(dir);
  return createHash("sha256").update(lines.sort().join("\n")).digest("hex");
}

async function phase2Copy(): Promise<string> {
  const out = join(await mkdtemp(join(tmpdir(), "leap-legacy-")), "phase2-store");
  await cp(fixture, out, { recursive: true });
  return out;
}

async function leap(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = { ...process.env };
  delete env["ANTHROPIC_API_KEY"];
  const child = spawn(process.execPath, [cliDist, ...args], { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
  child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
  const code = await new Promise<number | null>((done) => child.on("exit", (status) => done(status)));
  return { code, stdout, stderr };
}

const LEGACY_MESSAGE = /^leap: .*phase2-store was created by phase 2 \(store version 1\)\. It is kept unchanged and is read-only\. Use a new output directory for phase-3 commands\.$/m;

describe("phase-2 import directories are read-only", () => {
  it("reports the store version without writing", async () => {
    const out = await phase2Copy();
    const before = await treeHash(out);
    expect(await FileStore.storeVersionAt(out)).toBe(1);
    expect(await FileStore.storeVersionAt(join(out, "missing"))).toBeNull();
    expect(await treeHash(out)).toBe(before);
  });

  it("refuses generate (resume), review --decision and review --criterion, and leaves the directory byte-identical", async () => {
    expect(existsSync(cliDist), `${cliDist} must be built before this test`).toBe(true);
    const out = await phase2Copy();
    const fixtures = await mkdtemp(join(tmpdir(), "leap-no-fixtures-"));
    const before = await treeHash(out);

    const resumed = await leap(["generate", "--source", sourceMd, "--unit", unitTxt, "--out", out, "--provider", "replay", "--fixtures", fixtures, "--libraries", librariesDir]);
    expect(resumed.stderr, resumed.stderr).toMatch(LEGACY_MESSAGE);
    expect(resumed.code).toBe(1);
    expect(resumed.stdout).toBe("");

    const accepted = await leap(["review", "--out", out, "--activity", "act-1", "--reviewer", "owner", "--decision", "accepted"]);
    expect(accepted.stderr, accepted.stderr).toMatch(LEGACY_MESSAGE);
    expect(accepted.code).toBe(1);

    const aligned = await leap(["review", "--out", out, "--activity", "act-1", "--reviewer", "owner", "--criterion", "PC2.1", "--alignment", "confirmed"]);
    expect(aligned.stderr, aligned.stderr).toMatch(LEGACY_MESSAGE);
    expect(aligned.code).toBe(1);

    expect(await treeHash(out)).toBe(before);
  }, 60_000);

  it("reads a phase-2 import as recorded: the engine fingerprint verbatim, no build records, the truncated tail skipped but not cut", async () => {
    const out = await phase2Copy();
    const before = await treeHash(out);
    const view = await readLegacyImport(out);
    expect(view.storeVersion).toBe(1);
    expect(view.engineFingerprintSemantics).toBe("recorded at production (phase 2)");
    expect(view.activities.map((a) => a.activityId)).toEqual(["act-1"]);
    expect(view.revisions).toHaveLength(1);
    expect(view.revisions[0]?.engineFingerprint).toBe("engine@0.1.0+lock:3f2a9c1b7d4e");
    expect(view.revisions[0]?.buildKey).toBe("builds/act-1-r1.h5p");
    expect(view.acceptances).toEqual([{ importId: "phase2-store", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "owner", notes: "phase-2 plumbing check, not a quality judgement", decidedAt: "2026-09-19T02:00:00.000Z" }]);
    expect(view.alignmentReviews.map((r) => [r.criterionId, r.decision])).toEqual([["PC2.1", "confirmed"]]);
    expect(await treeHash(out)).toBe(before);
    expect(await readFile(join(out, "acceptances.jsonl"), "utf8")).toMatch(/"revi$/); // the fragment is still there
  });

  it("refuses to read a current-version import as legacy", async () => {
    const out = await phase2Copy();
    const record = JSON.parse(await readFile(join(out, "import.json"), "utf8")) as Record<string, unknown>;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(out, "import.json"), JSON.stringify({ ...record, storeVersion: 2 }));
    await expect(readLegacyImport(out)).rejects.toMatchObject({ name: "NotALegacyImportError" });
  });
});
