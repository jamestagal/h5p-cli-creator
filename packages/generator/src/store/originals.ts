import { sha256Hex } from "./builds.js";
import { OriginalSourceError, type OriginalSourceExt } from "./types.js";

/** Throws OriginalSourceError unless `bytes` under `ext` is exactly the original already stored for the import. */
export function assertSameOriginal(importId: string, existing: { ext: OriginalSourceExt; bytes: Buffer }, ext: OriginalSourceExt, bytes: Buffer): void {
  if (existing.ext === ext && existing.bytes.equals(bytes)) return;
  throw new OriginalSourceError(`import ${importId} already holds its original source (${existing.ext}, sha256 ${sha256Hex(existing.bytes)}); refusing to replace it with different bytes (${ext}, sha256 ${sha256Hex(bytes)}). The original is stored once and never replaced; use a new output directory for a changed source`);
}
