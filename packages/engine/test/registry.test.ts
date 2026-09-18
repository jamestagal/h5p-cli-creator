import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";

const root = resolve(import.meta.dirname, "../../..");

describe("LibraryRegistry", () => {
  let reg: LibraryRegistry;
  beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

  it("resolves a machine name to its locked version and formats the library string", () => {
    const lib = reg.resolve("H5P.MultiChoice");
    expect(`${lib.majorVersion}.${lib.minorVersion}`).toBe("1.16");
    expect(reg.libraryString("H5P.MultiChoice-1.16")).toBe("H5P.MultiChoice 1.16");
  });

  it("reads library.json and semantics from the checksummed package", async () => {
    const lj = await reg.libraryJson("H5P.MultiChoice-1.16");
    expect(lj.machineName).toBe("H5P.MultiChoice");
    const sem = await reg.semantics("H5P.MultiChoice-1.16");
    expect(sem?.map((f) => f.name)).toContain("answers");
  });

  it("computes the transitive closure over preloaded dependencies", async () => {
    const keys = (await reg.closure(["H5P.MultiChoice-1.16"])).map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
    expect(keys).toEqual(expect.arrayContaining(["H5P.MultiChoice-1.16", "H5P.JoubelUI-1.3", "H5P.Question-1.5", "FontAwesome-4.5"]));
    expect(keys).toEqual([...keys].sort());
  });

  it("throws for a library that is not locked", () => {
    expect(() => reg.get("H5P.Nope-1.0")).toThrow(/LIBRARY_NOT_LOCKED|not locked/);
  });

  it("refuses a package whose checksum does not match", async () => {
    const { mkdtemp, cp, writeFile, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(resolve(tmpdir(), "lock-"));
    await cp(resolve(root, "libraries"), dir, { recursive: true });
    const lock = JSON.parse(await readFile(resolve(dir, "libraries.lock.json"), "utf8"));
    lock.libraries["H5P.MultiChoice-1.16"].sha256 = "0".repeat(64);
    await writeFile(resolve(dir, "libraries.lock.json"), JSON.stringify(lock));
    const bad = await createRegistry({ lockPath: resolve(dir, "libraries.lock.json"), cacheDir: resolve(dir, "cache") });
    await expect(bad.libraryJson("H5P.MultiChoice-1.16")).rejects.toThrow(/checksum/);
  });
});
