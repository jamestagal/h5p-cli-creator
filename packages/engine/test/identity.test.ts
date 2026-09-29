import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { identityJson, runtimeClosure, type PnpmLockfile } from "../src/identity-closure.js";
import { engineIdentity } from "../src/identity.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtureLock = parse(readFileSync(resolve(import.meta.dirname, "fixtures/identity/pnpm-lock.yaml"), "utf8")) as PnpmLockfile;
const IMPORTERS = ["packages/engine", "packages/shared"];

/** Rebuilds `value` with every object's keys in reverse order, so canonical output cannot rely on input order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  return value;
}

describe("runtime dependency closure", () => {
  it("follows dependencies (not devDependencies) of the named importers through snapshots, carrying integrity, and records workspace links", () => {
    expect(runtimeClosure(fixtureLock, IMPORTERS)).toEqual([
      { name: "@leaplearn/shared", workspace: true },
      { name: "@scope/p", version: "2.0.0", integrity: "sha512-scopep" },
      { name: "a", version: "1.0.0", integrity: "sha512-aaa" },
      { name: "b", version: "2.1.0", integrity: "sha512-bbb" },
      { name: "c", version: "3.0.0", integrity: "sha512-ccc" },
      { name: "d", version: "4.0.0", integrity: "sha512-ddd" }
    ]);
  });

  it("follows a workspace link into the linked importer's dependencies", () => {
    const names = runtimeClosure(fixtureLock, ["packages/engine"]).map((e) => e.name);
    expect(names).toContain("@scope/p");
    expect(names).not.toContain("unrelated");
    expect(names).not.toContain("dev-only");
  });

  it("refuses a package without an integrity string rather than recording a weaker identity", () => {
    const lock = structuredClone(fixtureLock);
    lock.packages!["b@2.1.0"] = { resolution: { tarball: "https://example.invalid/b.tgz" } };
    expect(() => runtimeClosure(lock, IMPORTERS)).toThrow(/b@2\.1\.0.*integrity/);
  });

  it("refuses a dependency missing from snapshots", () => {
    const lock = structuredClone(fixtureLock);
    delete lock.snapshots!["b@2.1.0"];
    expect(() => runtimeClosure(lock, IMPORTERS)).toThrow(/b@2\.1\.0/);
  });

  it("writes byte-identical identity.json for the same lockfile in a different key order", () => {
    const a = identityJson({ engineVersion: "0.1.0", lock: fixtureLock, importers: IMPORTERS });
    const b = identityJson({ engineVersion: "0.1.0", lock: reverseKeys(fixtureLock) as PnpmLockfile, importers: [...IMPORTERS].reverse() });
    expect(b).toBe(a);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(JSON.parse(a) as object)).toEqual(["closure", "engineVersion"]);
  });
});

describe("engineIdentity sensitivity", () => {
  let dir: string;
  let engineDistDir: string;
  let workspaceDistDir: string;
  let librariesDir: string;
  const opts = (extra: { zlib?: string; nodeVersion?: string } = {}) => ({ engineDistDir, workspaceDistDir, zlib: "1.3.1", nodeVersion: "20.20.2", ...extra });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "engine-identity-"));
    engineDistDir = join(dir, "engine-dist");
    workspaceDistDir = join(dir, "shared-dist");
    librariesDir = join(dir, "libraries");
    mkdirSync(join(engineDistDir, "handlers"), { recursive: true });
    mkdirSync(workspaceDistDir);
    mkdirSync(librariesDir);
    writeFileSync(join(engineDistDir, "identity.json"), identityJson({ engineVersion: "0.1.0", lock: fixtureLock, importers: IMPORTERS }));
    writeFileSync(join(engineDistDir, "index.js"), "export const a = 1;\n");
    writeFileSync(join(engineDistDir, "handlers", "mc.js"), "export const b = 2;\n");
    writeFileSync(join(workspaceDistDir, "index.js"), "export const s = 1;\n");
    writeFileSync(join(librariesDir, "libraries.lock.json"), "{\"libraries\":[]}\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("describes its inputs canonically and displays engine@<version>+<12 hex>", async () => {
    const id = await engineIdentity(librariesDir, opts());
    expect(id.inputs.engineDist.map(([p]) => p)).toEqual(["handlers/mc.js", "identity.json", "index.js"]);
    expect(id.inputs.workspaceDist.map(([p]) => p)).toEqual(["index.js"]);
    expect(id.inputs.zlib).toBe("1.3.1");
    expect(id.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(id.display).toBe(`engine@0.1.0+${id.fingerprint.slice(0, 12)}`);
    expect(id.nodeVersion).toBe("20.20.2");
  });

  it("changes when one byte changes in engine dist, shared dist or the libraries lock, or when zlib changes", async () => {
    const base = (await engineIdentity(librariesDir, opts())).fingerprint;
    const flip = async (file: string) => {
      const before = readFileSync(file);
      const after = Buffer.from(before); after[0] = after[0]! ^ 1;
      writeFileSync(file, after);
      const fp = (await engineIdentity(librariesDir, opts())).fingerprint;
      writeFileSync(file, before);
      return fp;
    };
    const changed = [
      await flip(join(engineDistDir, "handlers", "mc.js")),
      await flip(join(workspaceDistDir, "index.js")),
      await flip(join(librariesDir, "libraries.lock.json")),
      (await engineIdentity(librariesDir, opts({ zlib: "1.2.12" }))).fingerprint
    ];
    for (const fp of changed) expect(fp).not.toBe(base);
    expect(new Set(changed).size).toBe(changed.length);
    expect((await engineIdentity(librariesDir, opts())).fingerprint).toBe(base);
  });

  it("does not change with the Node version, which is recorded beside the fingerprint", async () => {
    const a = await engineIdentity(librariesDir, opts({ nodeVersion: "20.20.1" }));
    const b = await engineIdentity(librariesDir, opts({ nodeVersion: "20.20.2" }));
    expect(b.fingerprint).toBe(a.fingerprint);
    expect([a.nodeVersion, b.nodeVersion]).toEqual(["20.20.1", "20.20.2"]);
  });

  it("ignores *.tsbuildinfo files", async () => {
    const base = (await engineIdentity(librariesDir, opts())).fingerprint;
    writeFileSync(join(engineDistDir, "tsconfig.tsbuildinfo"), "{}");
    writeFileSync(join(workspaceDistDir, "tsconfig.tsbuildinfo"), "{}");
    expect((await engineIdentity(librariesDir, opts())).fingerprint).toBe(base);
  });

  it("names the engine build step when dist/identity.json is missing", async () => {
    rmSync(join(engineDistDir, "identity.json"));
    await expect(engineIdentity(librariesDir, opts())).rejects.toThrow(/identity\.json.*build/);
  });

  it("uses process.versions for zlib and Node when nothing is injected", async () => {
    const id = await engineIdentity(librariesDir, { engineDistDir, workspaceDistDir });
    expect(id.inputs.zlib).toBe(process.versions.zlib);
    expect(id.nodeVersion).toBe(process.versions.node);
  });
});

/**
 * Copies the engine and shared sources (no dist) into a fresh tree, links their installed dependencies,
 * with `@leaplearn/shared` pointing at the copied package, and runs the engine's real build steps there.
 */
function cleanBuild(into: string): { engineDistDir: string; workspaceDistDir: string } {
  const shared = join(into, "packages/shared");
  const engine = join(into, "packages/engine");
  cpSync(resolve(root, "tsconfig.base.json"), join(into, "tsconfig.base.json"));
  cpSync(resolve(root, "pnpm-lock.yaml"), join(into, "pnpm-lock.yaml"));
  for (const f of ["package.json", "tsconfig.json", "src"]) cpSync(resolve(root, "packages/shared", f), join(shared, f), { recursive: true });
  for (const f of ["package.json", "tsconfig.json", "src", "scripts"]) cpSync(resolve(root, "packages/engine", f), join(engine, f), { recursive: true });
  symlinkSync(realpathSync(resolve(root, "packages/shared/node_modules")), join(shared, "node_modules"));
  const realModules = resolve(root, "packages/engine/node_modules");
  for (const entry of readdirSync(realModules)) {
    if (entry === ".bin") continue;
    if (entry.startsWith("@")) {
      mkdirSync(join(engine, "node_modules", entry), { recursive: true });
      for (const sub of readdirSync(join(realModules, entry))) {
        const target = entry === "@leaplearn" && sub === "shared" ? shared : realpathSync(join(realModules, entry, sub));
        symlinkSync(target, join(engine, "node_modules", entry, sub));
      }
    } else {
      mkdirSync(join(engine, "node_modules"), { recursive: true });
      symlinkSync(realpathSync(join(realModules, entry)), join(engine, "node_modules", entry));
    }
  }
  const tsc = join(realpathSync(join(realModules, "typescript")), "bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: shared, stdio: "pipe" });
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: engine, stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/write-identity.mjs"], { cwd: engine, stdio: "pipe" });

  return { engineDistDir: join(engine, "dist"), workspaceDistDir: join(shared, "dist") };
}

describe("engineIdentity reproducibility", () => {
  it("gives the same fingerprint for two clean builds in separate directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "engine-clean-builds-"));
    try {
      const a = cleanBuild(join(dir, "a"));
      const b = cleanBuild(join(dir, "b"));
      const librariesDir = resolve(root, "libraries");
      const idA = await engineIdentity(librariesDir, a);
      const idB = await engineIdentity(librariesDir, b);
      expect(idB.inputs).toEqual(idA.inputs);
      expect(idB.fingerprint).toBe(idA.fingerprint);

      const written = JSON.parse(readFileSync(join(a.engineDistDir, "identity.json"), "utf8")) as { engineVersion: string; closure: { name: string; workspace?: true; integrity?: string }[] };
      expect(written.engineVersion).toBe("0.1.0");
      expect(written.closure).toContainEqual({ name: "@leaplearn/shared", workspace: true });
      for (const name of ["jszip", "yazl", "sanitize-html", "zod"]) expect(written.closure.find((e) => e.name === name)?.integrity).toMatch(/^sha512-/);
      expect(written.closure.map((e) => e.name)).not.toContain("vitest");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
