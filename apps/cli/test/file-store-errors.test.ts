import { describe, it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

// The container runs tests as root, for whom chmod does not deny access, so a permission error is injected at the
// module boundary instead: readdir fails with EACCES for one directory and behaves normally everywhere else.
const denied = { dir: "" };
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: (async (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) => {
      if (denied.dir !== "" && String(path) === denied.dir) throw Object.assign(new Error(`EACCES: permission denied, scandir '${denied.dir}'`), { code: "EACCES" });
      return (actual.readdir as (...a: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readdir
  };
});

const { FileStore } = await import("../src/file-store.js");

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const unitTxt = resolve(root, "packages/generator/test/fixtures/synthetic/unit-synele001.txt");
const librariesDir = resolve(root, "libraries");

const importRecord = (importId: string) => ({ storeVersion: 2, importId, orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 10, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: importId, createdAt: "t", updatedAt: "t" });
const activityRecord = { activityId: "act-1", importId: "f1-store", type: "multiChoice", order: 0, status: "generating", currentRevision: null, conceptIds: [], criteriaIds: [], error: null, dropped: false, unitTextHash: null };

/** An import directory named f1-store (so its import id is f1-store) with one activity and no revisions yet. */
async function storeDir(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-f1-")), "f1-store");
  await mkdir(join(dir, "activities"), { recursive: true });
  await writeFile(join(dir, "import.json"), JSON.stringify(importRecord("f1-store")));
  await writeFile(join(dir, "activities", "act-1.json"), JSON.stringify(activityRecord));
  return dir;
}

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

describe("FileStore directory reads propagate errors other than ENOENT", () => {
  it("activities present as a file: listActivities rejects with ENOTDIR", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-f1-")), "f1-store");
    await mkdir(dir);
    await writeFile(join(dir, "activities"), "not a directory");
    await expect(new FileStore(dir).listActivities("f1-store")).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("activities present as a file: leap generate resuming the directory exits non-zero without writing", async () => {
    expect(existsSync(cliDist), `${cliDist} must be built before this test`).toBe(true);
    const dir = join(await mkdtemp(join(tmpdir(), "leap-f1-cli-")), "f1-store");
    await mkdir(dir);
    await writeFile(join(dir, "import.json"), JSON.stringify(importRecord("f1-store")));
    await writeFile(join(dir, "activities"), "not a directory");
    const fixtures = await mkdtemp(join(tmpdir(), "leap-no-fixtures-"));
    const before = await treeHash(dir);
    const run = await leap(["generate", "--source", sourceMd, "--unit", unitTxt, "--out", dir, "--provider", "replay", "--fixtures", fixtures, "--libraries", librariesDir]);
    expect(run.code, run.stderr).not.toBe(0);
    expect(run.stderr).toMatch(/ENOTDIR/);
    expect(run.stdout).toBe("");
    expect(await readdir(fixtures)).toEqual([]);
    expect(await treeHash(dir)).toBe(before);
  }, 60_000);

  it("revisions/<id> present as a file: listRevisions rejects with ENOTDIR", async () => {
    const dir = await storeDir();
    await mkdir(join(dir, "revisions"));
    await writeFile(join(dir, "revisions", "act-1"), "not a directory");
    await expect(new FileStore(dir).listRevisions("act-1")).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("EACCES on the activities directory propagates instead of reading as no activities", async () => {
    const dir = await storeDir();
    denied.dir = join(dir, "activities");
    try { await expect(new FileStore(dir).listActivities("f1-store")).rejects.toMatchObject({ code: "EACCES" }); } finally { denied.dir = ""; }
  });

  it("EACCES on revisions/<id> propagates instead of reading as no revisions", async () => {
    const dir = await storeDir();
    await mkdir(join(dir, "revisions", "act-1"), { recursive: true });
    denied.dir = join(dir, "revisions", "act-1");
    try { await expect(new FileStore(dir).listRevisions("act-1")).rejects.toMatchObject({ code: "EACCES" }); } finally { denied.dir = ""; }
  });

  it("a missing activities or revisions/<id> directory still reads as empty", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-f1-empty-")), "f1-store");
    await mkdir(dir);
    const store = new FileStore(dir);
    expect(await store.listActivities("f1-store")).toEqual([]);
    expect(await store.listRevisions("act-1")).toEqual([]);
    expect(denied.dir).toBe("");
    expect((await new FileStore(await storeDir()).listActivities("f1-store")).map((a) => a.activityId)).toEqual(["act-1"]);
  });
});
