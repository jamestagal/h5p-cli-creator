import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { compareCodeUnits } from "./compare.js";
import { EngineError } from "./errors.js";
import { libraryKey, loadLock, type LibraryKey, type LibraryLock, type LockedLibrary } from "./lock.js";

export interface LibraryDependencyRef {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
}
export interface LibraryJson {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  title?: string;
  runnable?: number;
  embedTypes?: string[];
  preloadedDependencies?: LibraryDependencyRef[];
  dynamicDependencies?: LibraryDependencyRef[];
  editorDependencies?: LibraryDependencyRef[];
}
export interface SemanticField {
  name: string;
  type: string;
  [k: string]: unknown;
}
export interface LibraryFile {
  path: string;
  data: () => Promise<Buffer>;
}

export interface RegistryOptions {
  lockPath: string;
  cacheDir: string;
}

export class LibraryRegistry {
  private readonly zips = new Map<string, Promise<JSZip>>();

  constructor(
    private readonly lock: LibraryLock,
    private readonly cacheDir: string
  ) {}

  get(key: string): LockedLibrary {
    const lib = this.lock.libraries[key];
    if (!lib) throw new EngineError(`library ${key} is not locked`, "LIBRARY_NOT_LOCKED");

    return lib;
  }

  resolve(machineName: string): LockedLibrary {
    const candidates = Object.values(this.lock.libraries).filter((l) => l.machineName === machineName);
    if (candidates.length === 0) throw new EngineError(`library ${machineName} is not locked`, "LIBRARY_NOT_LOCKED");

    candidates.sort((a, b) => b.majorVersion - a.majorVersion || b.minorVersion - a.minorVersion);
    const best = candidates[0];
    if (!best) throw new EngineError(`library ${machineName} is not locked`, "LIBRARY_NOT_LOCKED");

    return best;
  }

  libraryString(key: LibraryKey | string): string {
    const lib = this.get(key);

    return `${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}`;
  }

  async libraryJson(key: string): Promise<LibraryJson> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const file = zip.file(`${lib.dir}/library.json`);
    if (!file) throw new EngineError(`${lib.package} has no ${lib.dir}/library.json`, "PACKAGE_CORRUPT");

    return JSON.parse(await file.async("text")) as LibraryJson;
  }

  async semantics(key: string): Promise<SemanticField[] | null> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const file = zip.file(`${lib.dir}/semantics.json`);

    return file ? (JSON.parse(await file.async("text")) as SemanticField[]) : null;
  }

  async closure(rootKeys: LibraryKey[]): Promise<LockedLibrary[]> {
    const seen = new Map<string, LockedLibrary>();
    const visit = async (key: string): Promise<void> => {
      if (seen.has(key)) return;

      const lib = this.get(key);
      seen.set(key, lib);
      const lj = await this.libraryJson(key);
      for (const dep of [...(lj.preloadedDependencies ?? []), ...(lj.dynamicDependencies ?? [])]) {
        await visit(libraryKey(dep.machineName, dep.majorVersion, dep.minorVersion));
      }
    };
    for (const key of rootKeys) await visit(key);

    return [...seen.entries()].sort(([a], [b]) => compareCodeUnits(a, b)).map(([, lib]) => lib);
  }

  async files(key: string): Promise<LibraryFile[]> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const prefix = `${lib.dir}/`;

    return Object.values(zip.files)
      .filter((f) => !f.dir && f.name.startsWith(prefix))
      .sort((a, b) => compareCodeUnits(a.name, b.name))
      .map((f) => ({ path: f.name, data: () => f.async("nodebuffer") }));
  }

  private openPackage(lib: LockedLibrary): Promise<JSZip> {
    let pending = this.zips.get(lib.package);
    if (!pending) {
      pending = (async () => {
        const bytes = await readFile(join(this.cacheDir, lib.package));
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== lib.sha256) {
          throw new EngineError(`checksum mismatch for ${lib.package}: expected ${lib.sha256}, got ${actual}`, "PACKAGE_CHECKSUM");
        }

        return JSZip.loadAsync(bytes);
      })();
      this.zips.set(lib.package, pending);
    }

    return pending;
  }
}

export async function createRegistry(options: RegistryOptions): Promise<LibraryRegistry> {
  return new LibraryRegistry(await loadLock(options.lockPath), options.cacheDir);
}
