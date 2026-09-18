import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import type { AssetEntry, AssetManifest } from "@leaplearn/shared";
import { EngineError } from "./errors.js";
import type { H5PContent } from "./params.js";
import type { LibraryRegistry } from "./registry.js";
import type { LockedLibrary } from "./lock.js";

const FIXED_MTIME = new Date("2000-01-01T00:00:00Z");
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
  const opts = { mtime: FIXED_MTIME, mode: FILE_MODE, compress: true };
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
  // this silences Node's transient "unhandled rejection" false positive for that window without
  // swallowing the error, which the `await outputDone` at the end of this function still surfaces.
  outputDone.catch(() => undefined);

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
