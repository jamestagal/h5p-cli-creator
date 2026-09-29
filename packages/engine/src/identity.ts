import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./identity-closure.js";

/** The canonical document the fingerprint hashes. Paths are relative and `/`-separated; lists are sorted by path. */
export interface EngineIdentityInputs {
  engineDist: [string, string][];
  workspaceDist: [string, string][];
  librariesLockSha256: string;
  zlib: string;
}

export interface EngineIdentity {
  /** sha256 of `canonicalJson(inputs)`, 64 hex characters. */
  fingerprint: string;
  /** `engine@<version>+<fingerprint[0..12]>`. */
  display: string;
  inputs: EngineIdentityInputs;
  /** Recorded beside the fingerprint, never hashed into it. */
  nodeVersion: string;
}

/** Test seams. Production callers pass nothing: every directory is located from this module's own URL. */
export interface EngineIdentityOptions { engineDistDir?: string; workspaceDistDir?: string; zlib?: string; nodeVersion?: string }

// src/identity.ts under tests and dist/identity.js when built both sit one level below the package root.
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function hashTree(dir: string): Promise<[string, string][]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && !e.name.endsWith(".tsbuildinfo")).map((e) => join(e.parentPath, e.name));
  const hashed = await Promise.all(files.map(async (f): Promise<[string, string]> => [relative(dir, f).split(sep).join("/"), sha256(await readFile(f))]));

  return hashed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

async function engineVersion(engineDistDir: string): Promise<string> {
  const text = await readFile(join(engineDistDir, "identity.json"), "utf8").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") throw new Error(`${join(engineDistDir, "identity.json")} is missing; build the engine with \`pnpm --filter @leaplearn/engine build\``);
    throw err;
  });

  return (JSON.parse(text) as { engineVersion: string }).engineVersion;
}

/**
 * The content-derived identity of this engine build: its dist bytes, `@leaplearn/shared`'s dist bytes
 * (through which `dist/identity.json` also carries the runtime dependency closure), the libraries lock and zlib.
 * Reads only under the engine's own directory (including its linked `@leaplearn/shared`) and `librariesDir`.
 */
export async function engineIdentity(librariesDir: string, options: EngineIdentityOptions = {}): Promise<EngineIdentity> {
  const engineDistDir = options.engineDistDir ?? join(packageRoot, "dist");
  const workspaceDistDir = options.workspaceDistDir ?? join(await realpath(join(packageRoot, "node_modules", "@leaplearn", "shared")), "dist");
  const [version, engineDist, workspaceDist, librariesLock] = await Promise.all([
    engineVersion(engineDistDir), hashTree(engineDistDir), hashTree(workspaceDistDir), readFile(join(librariesDir, "libraries.lock.json"))
  ]);
  const inputs: EngineIdentityInputs = { engineDist, workspaceDist, librariesLockSha256: sha256(librariesLock), zlib: options.zlib ?? process.versions.zlib };
  const fingerprint = sha256(canonicalJson(inputs));

  return { fingerprint, display: `engine@${version}+${fingerprint.slice(0, 12)}`, inputs, nodeVersion: options.nodeVersion ?? process.versions.node };
}
