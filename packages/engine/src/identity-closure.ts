/**
 * The runtime dependency closure recorded in `dist/identity.json` at build time. Pure: the build
 * script parses `pnpm-lock.yaml` and passes the object in, so the engine has no YAML dependency at runtime.
 */

interface LockDependency { specifier?: string; version: string }
export interface PnpmLockfile {
  importers?: Record<string, { dependencies?: Record<string, LockDependency> } | undefined>;
  packages?: Record<string, { resolution?: { integrity?: string; tarball?: string } } | undefined>;
  snapshots?: Record<string, { dependencies?: Record<string, string> } | undefined>;
}

export type ClosureEntry = { name: string; version: string; integrity: string } | { name: string; workspace: true };

/** JSON with every object's keys sorted by code point, no whitespace. Array order is kept. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(byCodePoint).map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]));
  }
  return value;
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `a/b/../c` → `a/c`, for resolving `link:` paths between importers. */
function joinPosix(base: string, rel: string): string {
  const out: string[] = [];
  for (const part of `${base}/${rel}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return out.join("/");
}

/** The snapshot key a dependency resolves to. An alias (`d-alias: d@4.0.0`) carries its own name. */
function snapshotKey(name: string, version: string): string {
  const bare = version.split("(")[0]!;
  return bare.lastIndexOf("@") > 0 ? version : `${name}@${version}`;
}

/** `@scope/p@2.0.0(c@3.0.0)` → `{ name: "@scope/p", version: "2.0.0", packageKey: "@scope/p@2.0.0" }`. */
function splitKey(key: string): { name: string; version: string; packageKey: string } {
  const packageKey = key.split("(")[0]!;
  const at = packageKey.lastIndexOf("@");
  if (at <= 0) throw new Error(`pnpm-lock.yaml: cannot read package key ${key}`);

  return { name: packageKey.slice(0, at), version: packageKey.slice(at + 1), packageKey };
}

/**
 * The `dependencies` (never dev or optional) of `importers`, followed recursively through `snapshots`.
 * Registry packages are `{ name, version, integrity }` from `packages[...].resolution`; workspace links are
 * `{ name, workspace: true }` and their importer's dependencies are followed too. Sorted by name, then version.
 */
export function runtimeClosure(lock: PnpmLockfile, importers: readonly string[]): ClosureEntry[] {
  const entries = new Map<string, ClosureEntry>();
  const seenImporters = new Set<string>();
  const seenSnapshots = new Set<string>();

  const visitSnapshot = (key: string): void => {
    if (seenSnapshots.has(key)) return;
    seenSnapshots.add(key);
    const { name, version, packageKey } = splitKey(key);
    const integrity = lock.packages?.[packageKey]?.resolution?.integrity;
    if (integrity === undefined) throw new Error(`pnpm-lock.yaml: ${packageKey} has no integrity in packages; the engine identity needs one for every runtime dependency`);
    entries.set(packageKey, { name, version, integrity });
    const snapshot = lock.snapshots?.[key];
    if (snapshot === undefined) throw new Error(`pnpm-lock.yaml: ${key} is missing from snapshots`);
    for (const [dep, v] of Object.entries(snapshot.dependencies ?? {})) visitSnapshot(snapshotKey(dep, v));
  };

  const visitImporter = (path: string): void => {
    if (seenImporters.has(path)) return;
    seenImporters.add(path);
    const importer = lock.importers?.[path];
    if (importer === undefined) throw new Error(`pnpm-lock.yaml: importer ${path} not found`);
    for (const [name, dep] of Object.entries(importer.dependencies ?? {})) {
      if (dep.version.startsWith("link:")) {
        entries.set(`workspace:${name}`, { name, workspace: true });
        visitImporter(joinPosix(path, dep.version.slice("link:".length)));
      } else {
        visitSnapshot(snapshotKey(name, dep.version));
      }
    }
  };

  for (const path of importers) visitImporter(path);

  return [...entries.values()].sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint("version" in a ? a.version : "", "version" in b ? b.version : ""));
}

/** The contents of `dist/identity.json`: canonical, newline-terminated, no timestamps. */
export function identityJson(input: { engineVersion: string; lock: PnpmLockfile; importers: readonly string[] }): string {
  return `${canonicalJson({ engineVersion: input.engineVersion, closure: runtimeClosure(input.lock, input.importers) })}\n`;
}
