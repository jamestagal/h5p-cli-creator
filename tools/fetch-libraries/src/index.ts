import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { libraryKey, type LibraryLock, type LockedLibrary } from "@leaplearn/engine";

/**
 * Usage: fetch-libraries --from <dir-of-h5p-packages> --out <libraries-dir>
 * Scans every .h5p in --from, records every library directory it contains, copies the packages
 * into <out>/cache and writes <out>/libraries.lock.json. When two packages contain the same
 * library key, the higher patch version wins; ties go to the alphabetically first package.
 */
async function main(): Promise<void> {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!, process.argv[i + 1]!);
  const from = resolve(args.get("--from") ?? "apps/cli-legacy/content-type-cache");
  const out = resolve(args.get("--out") ?? "libraries");
  await mkdir(join(out, "cache"), { recursive: true });

  const chosen = new Map<string, LockedLibrary>();
  const packages = (await readdir(from)).filter((f) => f.endsWith(".h5p")).sort();

  for (const pkgName of packages) {
    const bytes = await readFile(join(from, pkgName));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const zip = await JSZip.loadAsync(bytes);
    const libraryJsonPaths = Object.keys(zip.files).filter((p) => /^[^/]+\/library\.json$/.test(p));

    for (const p of libraryJsonPaths) {
      const dir = p.slice(0, -"/library.json".length);
      const lib = JSON.parse(await zip.file(p)!.async("text")) as { machineName: string; majorVersion: number; minorVersion: number; patchVersion: number };
      const key = libraryKey(lib.machineName, lib.majorVersion, lib.minorVersion);
      const candidate: LockedLibrary = { machineName: lib.machineName, majorVersion: lib.majorVersion, minorVersion: lib.minorVersion, patchVersion: lib.patchVersion, package: pkgName, dir, sha256 };
      const existing = chosen.get(key);
      if (!existing || candidate.patchVersion > existing.patchVersion) chosen.set(key, candidate);
    }
    await copyFile(join(from, pkgName), join(out, "cache", pkgName));
  }

  const lock: LibraryLock = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    libraries: Object.fromEntries([...chosen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  };
  await writeFile(join(out, "libraries.lock.json"), JSON.stringify(lock, null, 2) + "\n");
  process.stdout.write(`wrote ${chosen.size} libraries from ${packages.length} packages to ${out}\n`);
}

main().catch((err) => { process.stderr.write(String(err) + "\n"); process.exit(1); });
