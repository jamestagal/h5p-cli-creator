import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
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
  const res = await fetch(ref);
  if (!res.ok) throw new Error(`image ${ref}: HTTP ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!Object.values(MIME).includes(mimeType)) throw new Error(`image ${ref}: unsupported content-type ${mimeType || "(none)"}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, mimeType, open: () => Readable.from([bytes]) };
};
