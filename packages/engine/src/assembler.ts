import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import type { AssetEntry, AssetManifest } from "@leaplearn/shared";
import { EngineError } from "./errors.js";
import type { H5PContent } from "./params.js";
import type { LibraryRegistry } from "./registry.js";
import type { LockedLibrary } from "./lock.js";

// yazl's `dateToDosDateTime` reads local-time getters (getFullYear, getHours, ...), so an
// instant fixed with a `Z` UTC suffix produces different DOS date/time fields (and therefore
// different package bytes) depending on the process's `TZ`. Constructing this from local-time
// fields instead makes DOS date 10273 / time 0 in every timezone — but only if construction and
// reading happen under the same zone: a Date built once at module load stores a fixed absolute
// instant, and re-reading its local-time getters after `TZ` changes mid-process would convert
// that instant into a different local date/time. Building it fresh on every call keeps
// construction and reading in the same zone regardless of what `TZ` was when the module loaded.
function fixedMtime(): Date {
  return new Date(2000, 0, 1, 0, 0, 0);
}
// `forceDosTimestamp` skips yazl's Info-ZIP "UT" extra-timestamp field, which otherwise encodes
// `mtime.getTime()` (an absolute instant) alongside the DOS date/time (a local-time encoding):
// fixing `fixedMtime()`'s local fields necessarily leaves its absolute instant TZ-dependent, so
// without this flag the "UT" field alone would still make package bytes vary by `TZ`.
const FORCE_DOS_TIMESTAMP = true;
const FILE_MODE = 0o100644;
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface PackageInput {
  title: string;
  language: string;
  mainLibrary: LockedLibrary;
  closure: LockedLibrary[];
  content: H5PContent;
  /** content/-relative media path -> assetId */
  media: Map<string, string>;
  assets: AssetManifest;
}

export function buildH5pJson(input: PackageInput): Record<string, unknown> {
  return {
    title: input.title,
    language: input.language,
    mainLibrary: input.mainLibrary.machineName,
    embedTypes: ["div"],
    license: "U",
    defaultLanguage: input.language,
    preloadedDependencies: input.closure.map((l) => ({ machineName: l.machineName, majorVersion: l.majorVersion, minorVersion: l.minorVersion }))
  };
}

interface Entry { name: string; add: (zip: ZipFile) => Promise<void>; }

function destroyStream(stream: Readable, err?: Error): void {
  stream.destroy(err);
}

/**
 * Verifies length and sha256 while streaming. Calls `fail` as soon as the source ends with the
 * wrong length or hash (or errors), so a bad asset rejects the build before the archive finishes.
 */
function verifying(asset: AssetEntry, fail: (err: Error) => void): Transform {
  const hash = createHash("sha256");
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) { hash.update(chunk); seen += chunk.length; cb(null, chunk); },
    flush(cb) {
      const actual = hash.digest("hex");
      if (seen !== asset.byteLength) {
        fail(new EngineError(`asset ${asset.assetId} length mismatch: declared byteLength ${asset.byteLength}, streamed ${seen}`, "ASSET_LENGTH"));
      } else if (actual !== asset.sha256) {
        fail(new EngineError(`asset ${asset.assetId} hash mismatch: expected ${asset.sha256}, got ${actual}`, "ASSET_HASH"));
      }
      cb();
    }
  });
}

export async function writePackage(input: PackageInput, registry: LibraryRegistry, output: NodeJS.WritableStream): Promise<string[]> {
  const opts = { mtime: fixedMtime(), mode: FILE_MODE, compress: true, forceDosTimestamp: FORCE_DOS_TIMESTAMP };
  const zip = new ZipFile();
  const sources: Readable[] = [];
  let settled = false;

  const abort = (err: Error): void => {
    if (settled) return;
    settled = true;
    for (const s of sources) destroyStream(s);
    // yazl types `outputStream` as the ambient `NodeJS.ReadableStream`, which declares no
    // `destroy`; it is a real `PassThrough` at runtime (see yazl's `index.js`), so this
    // reinterprets it as the concrete `Readable` class that actually has the method.
    destroyStream(zip.outputStream as unknown as Readable, err);
  };

  zip.on("error", abort);

  // `pipeline()` attaches its own error handling on both ends synchronously, so a destination that
  // fails to even open (e.g. ENOENT on a missing directory) cannot fire "error" before anyone is
  // listening. It also destroys both streams together on any single error, unlike plain `.pipe()`,
  // which does not stop the source on a destination error: a destination that errors on every write
  // would otherwise keep re-erroring as more chunks arrive instead of rejecting exactly once.
  const outputDone = pipeline(zip.outputStream, output);
  // The destination can reject before the entry-building work below reaches `await outputDone`;
  // routing it through `abort` (instead of a no-op) both destroys every open asset source stream
  // for a destination-only failure (pipeline() only owns zip.outputStream and output, not our
  // side-loaded asset streams) and silences Node's transient "unhandled rejection" false positive
  // for that window. `await outputDone` below still delivers the original error to the caller.
  outputDone.catch(abort);

  const entries: Entry[] = [];
  try {
    entries.push({ name: "h5p.json", add: async (z) => z.addBuffer(Buffer.from(JSON.stringify(buildH5pJson(input))), "h5p.json", opts) });
    entries.push({ name: "content/content.json", add: async (z) => z.addBuffer(Buffer.from(JSON.stringify(input.content.params)), "content/content.json", opts) });

    for (const [path, assetId] of input.media) {
      const asset = input.assets.get(assetId);
      if (!asset) throw new EngineError(`asset ${assetId} is not in the manifest`, "ASSET_MISSING");
      entries.push({
        name: `content/${path}`,
        add: async (z) => {
          const source = asset.open();
          const check = verifying(asset, abort);
          source.on("error", abort);
          check.on("error", abort);
          sources.push(source, check);
          // The destination can already have failed by the time this entry is reached (entries
          // are registered with `zip` well ahead of when their bytes actually flow to `output`);
          // `abort`'s cleanup only reaches streams that existed in `sources` when it ran, so a
          // stream opened afterwards must be destroyed immediately instead of being piped into an
          // archive that is no longer going anywhere.
          if (settled) { destroyStream(source); destroyStream(check); return; }
          z.addReadStream(source.pipe(check), `content/${path}`, { ...opts, size: asset.byteLength });
        }
      });
    }

    for (const lib of input.closure) {
      for (const f of await registry.files(`${lib.machineName}-${lib.majorVersion}.${lib.minorVersion}`)) {
        entries.push({ name: f.path, add: async (z) => z.addBuffer(await f.data(), f.path, opts) });
      }
    }

    entries.sort((a, b) => compareCodeUnits(a.name, b.name));
    const seenNames = new Set<string>();
    for (const e of entries) {
      if (seenNames.has(e.name)) throw new EngineError(`duplicate entry ${e.name}`, "DUPLICATE_ENTRY");
      seenNames.add(e.name);
    }

    for (const e of entries) await e.add(zip);
    zip.end();
  } catch (err) {
    abort(err instanceof Error ? err : new Error(String(err)));
  }
  await outputDone;
  return entries.map((e) => e.name);
}
