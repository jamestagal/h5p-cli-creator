import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import { safeFetch, SafeFetchError } from "@leaplearn/generator";
import type { AssetEntry } from "@leaplearn/shared";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
const isUrl = (ref: string): boolean => /^https?:\/\//i.test(ref);

export type ImageResolver = (ref: string, baseDir: string) => Promise<AssetEntry>;

export const localImageResolver: ImageResolver = async (ref, baseDir) => {
  if (isUrl(ref)) throw new Error(`image is a URL (${ref}); use --allow-network to fetch remote images`);
  const path = isAbsolute(ref) ? ref : join(baseDir, ref);
  const mimeType = MIME[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`unsupported image type: ${ref}`);
  const bytes = await readFile(path);
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, mimeType, open: () => createReadStream(path) };
};

/** Application-side network access; the engine never fetches. */
export const networkImageResolver: ImageResolver = async (ref, baseDir) => {
  if (!isUrl(ref)) return localImageResolver(ref, baseDir);
  let fetched;
  try {
    fetched = await safeFetch(ref, { allowedContentTypes: Object.values(MIME), maxBytes: 20 * 1024 * 1024, timeoutMs: 20_000 });
  } catch (err) {
    if (err instanceof SafeFetchError) throw new Error(`image ${ref}: ${err.message} (${err.reason})`);
    throw err;
  }
  const bytes = fetched.body;
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, mimeType: fetched.contentType!, open: () => Readable.from([bytes]) };
};
