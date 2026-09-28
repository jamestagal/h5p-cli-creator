import { inflateRawSync } from "node:zlib";

/**
 * A structural reading of a ZIP archive, from the end-of-central-directory record inward, never by
 * scanning for signature bytes (which can occur inside compressed data). Offsets and field layouts
 * follow PKWARE APPNOTE 6.3.10 §4.3. Only what the engine writes is supported: one disk, no ZIP64.
 */
export interface CentralEntry {
  name: string;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  extraLength: number;
  commentLength: number;
  diskStart: number;
  internalAttributes: number;
  externalAttributes: number;
  localHeaderOffset: number;
}
export interface LocalHeader {
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  name: string;
  extraLength: number;
  dataOffset: number;
}
export interface ZipStructure {
  entries: CentralEntry[];
  locals: LocalHeader[];
  commentLength: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZipStructure(buf: Buffer): ZipStructure {
  // The EOCD record is 22 bytes plus a comment of at most 65535 bytes; search backwards within that window.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  const centralDirectorySize = buf.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buf.readUInt32LE(eocd + 16);
  const commentLength = buf.readUInt16LE(eocd + 20);
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0 || buf.readUInt16LE(eocd + 8) !== count) throw new Error("multi-disk archives are not supported");

  const entries: CentralEntry[] = [];
  let at = centralDirectoryOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== CENTRAL) throw new Error(`central directory record ${n} has no signature at offset ${at}`);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const entryCommentLength = buf.readUInt16LE(at + 32);
    entries.push({
      versionMadeBy: buf.readUInt16LE(at + 4), versionNeeded: buf.readUInt16LE(at + 6), flags: buf.readUInt16LE(at + 8), method: buf.readUInt16LE(at + 10),
      dosTime: buf.readUInt16LE(at + 12), dosDate: buf.readUInt16LE(at + 14), crc32: buf.readUInt32LE(at + 16), compressedSize: buf.readUInt32LE(at + 20),
      uncompressedSize: buf.readUInt32LE(at + 24), extraLength, commentLength: entryCommentLength, diskStart: buf.readUInt16LE(at + 34),
      internalAttributes: buf.readUInt16LE(at + 36), externalAttributes: buf.readUInt32LE(at + 38), localHeaderOffset: buf.readUInt32LE(at + 42),
      name: buf.toString("utf8", at + 46, at + 46 + nameLength)
    });
    at += 46 + nameLength + extraLength + entryCommentLength;
  }
  if (at !== centralDirectoryOffset + centralDirectorySize) throw new Error("central directory size does not match its records");

  const locals = entries.map((e): LocalHeader => {
    const h = e.localHeaderOffset;
    if (buf.readUInt32LE(h) !== LOCAL) throw new Error(`${e.name}: no local header at offset ${h}`);
    const nameLength = buf.readUInt16LE(h + 26);
    const extraLength = buf.readUInt16LE(h + 28);
    return {
      versionNeeded: buf.readUInt16LE(h + 4), flags: buf.readUInt16LE(h + 6), method: buf.readUInt16LE(h + 8), dosTime: buf.readUInt16LE(h + 10), dosDate: buf.readUInt16LE(h + 12),
      crc32: buf.readUInt32LE(h + 14), compressedSize: buf.readUInt32LE(h + 18), uncompressedSize: buf.readUInt32LE(h + 22),
      name: buf.toString("utf8", h + 30, h + 30 + nameLength), extraLength, dataOffset: h + 30 + nameLength + extraLength
    };
  });
  return { entries, locals, commentLength, centralDirectoryOffset, centralDirectorySize };
}

/** The entry's uncompressed bytes, inflated from its own compressed stream (not via a ZIP library). */
export function entryData(buf: Buffer, entry: CentralEntry, local: LocalHeader): Buffer {
  const compressed = buf.subarray(local.dataOffset, local.dataOffset + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`${entry.name}: unsupported compression method ${entry.method}`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
/** CRC-32 (IEEE 802.3), as ZIP stores it. Implemented here so the check does not depend on the runtime's zlib. */
export function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
