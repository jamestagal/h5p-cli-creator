import type { Readable } from "node:stream";

export interface AssetEntry {
  assetId: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  open(): Readable;
}

export type AssetManifest = ReadonlyMap<string, AssetEntry>;

export function emptyAssetManifest(): AssetManifest {
  return new Map();
}
