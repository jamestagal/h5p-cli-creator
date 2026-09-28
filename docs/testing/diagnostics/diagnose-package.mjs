#!/usr/bin/env node
// Golden-package diagnostic. Writes, to --out:
//   <name>.h5p          the package bytes examined (compiled here, or copied from --from)
//   diagnosis.json      runtime, source revision, package and content hashes, and every ZIP header field per entry
//   SHA256SUMS          sha256 of the two files above
//
// Compile the flashcards@1 golden fixture with this checkout's built engine (run `pnpm -r build` first):
//   node docs/testing/diagnostics/diagnose-package.mjs --out <dir> [--repo <checkout, default: this one>]
// Examine an existing package instead (for example an original golden .h5p), without compiling:
//   node docs/testing/diagnostics/diagnose-package.mjs --from <file.h5p> --out <dir>
//
// It reads the ZIP structurally (end-of-central-directory inward, PKWARE APPNOTE 6.3.10 §4.3) and computes CRC-32 itself,
// so nothing in the report depends on a ZIP library. Only inflating an entry uses the runtime's zlib; inflate output is
// fully determined by the compressed stream, unlike deflate.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const outDir = arg("--out");
const from = arg("--from");
if (!outDir) { console.error("usage: diagnose-package.mjs --out <dir> [--repo <checkout>] [--from <file.h5p>]"); process.exit(2); }

const repo = resolve(arg("--repo") ?? resolve(import.meta.dirname, "../../.."));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (...a) => { try { return execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim(); } catch { return null; } };

let buf; let name; let compiledFrom = null;
if (from) {
  buf = readFileSync(resolve(from)); name = basename(from);
} else {
  const engineDir = resolve(repo, "packages/engine");
  // @leaplearn/shared is a workspace package whose exports map has only an "import" condition; load its built entry directly (the path the engine's node_modules link resolves to).
  const { ActivitySpec } = await import(pathToFileURL(resolve(repo, "packages/shared/dist/index.js")).href);
  const { compileToBuffer, createRegistry } = await import(pathToFileURL(resolve(engineDir, "dist/index.js")).href);
  const fixtures = resolve(engineDir, "test/fixtures");
  const registry = await createRegistry({ lockPath: resolve(repo, "libraries/libraries.lock.json"), cacheDir: resolve(repo, "libraries/cache") });
  const cardPath = resolve(fixtures, "assets/card.jpg");
  const card = { assetId: "card", sha256: sha256(readFileSync(cardPath)), byteLength: statSync(cardPath).size, mimeType: "image/jpeg", open: () => createReadStream(cardPath) };
  buf = await compileToBuffer(ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs/flashcards.json"), "utf8"))), new Map([["card", card]]), { registry, revision: 1 });
  name = "flashcards-1.h5p";
  compiledFrom = { fixture: "packages/engine/test/fixtures/specs/flashcards.json", revision: 1, librariesLockSha256: sha256(readFileSync(resolve(repo, "libraries/libraries.lock.json"))) };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data) => { let c = 0xffffffff; for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { eocd = i; break; }
if (eocd === -1) throw new Error("no end-of-central-directory record");
const archive = { disk: buf.readUInt16LE(eocd + 4), centralDirectoryDisk: buf.readUInt16LE(eocd + 6), entriesOnDisk: buf.readUInt16LE(eocd + 8), entries: buf.readUInt16LE(eocd + 10), centralDirectorySize: buf.readUInt32LE(eocd + 12), centralDirectoryOffset: buf.readUInt32LE(eocd + 16), commentLength: buf.readUInt16LE(eocd + 20), centralDirectorySha256: sha256(buf.subarray(buf.readUInt32LE(eocd + 16), eocd)) };

const entries = [];
let at = archive.centralDirectoryOffset;
for (let n = 0; n < archive.entries; n++) {
  if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`central record ${n}: bad signature`);
  const nameLength = buf.readUInt16LE(at + 28); const extraLength = buf.readUInt16LE(at + 30); const commentLength = buf.readUInt16LE(at + 32);
  const central = { versionMadeBy: buf.readUInt16LE(at + 4), versionNeeded: buf.readUInt16LE(at + 6), flags: buf.readUInt16LE(at + 8), method: buf.readUInt16LE(at + 10), dosTime: buf.readUInt16LE(at + 12), dosDate: buf.readUInt16LE(at + 14), crc32: buf.readUInt32LE(at + 16), compressedSize: buf.readUInt32LE(at + 20), uncompressedSize: buf.readUInt32LE(at + 24), extraLength, extraHex: buf.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength).toString("hex"), commentLength, diskStart: buf.readUInt16LE(at + 34), internalAttributes: buf.readUInt16LE(at + 36), externalAttributes: buf.readUInt32LE(at + 38), localHeaderOffset: buf.readUInt32LE(at + 42) };
  const entryName = buf.toString("utf8", at + 46, at + 46 + nameLength);
  at += 46 + nameLength + extraLength + commentLength;
  const h = central.localHeaderOffset;
  const lNameLength = buf.readUInt16LE(h + 26); const lExtraLength = buf.readUInt16LE(h + 28);
  const local = { versionNeeded: buf.readUInt16LE(h + 4), flags: buf.readUInt16LE(h + 6), method: buf.readUInt16LE(h + 8), dosTime: buf.readUInt16LE(h + 10), dosDate: buf.readUInt16LE(h + 12), crc32: buf.readUInt32LE(h + 14), compressedSize: buf.readUInt32LE(h + 18), uncompressedSize: buf.readUInt32LE(h + 22), nameMatches: buf.toString("utf8", h + 30, h + 30 + lNameLength) === entryName, extraLength: lExtraLength, extraHex: buf.subarray(h + 30 + lNameLength, h + 30 + lNameLength + lExtraLength).toString("hex") };
  const dataOffset = h + 30 + lNameLength + lExtraLength;
  const compressed = buf.subarray(dataOffset, dataOffset + central.compressedSize);
  const data = central.method === 0 ? Buffer.from(compressed) : central.method === 8 ? inflateRawSync(compressed) : null;
  const after = dataOffset + central.compressedSize;
  const descriptor = (central.flags & 0x8) ? (buf.readUInt32LE(after) === 0x08074b50 ? { signed: true, crc32: buf.readUInt32LE(after + 4), compressedSize: buf.readUInt32LE(after + 8), uncompressedSize: buf.readUInt32LE(after + 12) } : { signed: false, crc32: buf.readUInt32LE(after), compressedSize: buf.readUInt32LE(after + 4), uncompressedSize: buf.readUInt32LE(after + 8) }) : null;
  entries.push({ name: entryName, uncompressedSha256: data ? sha256(data) : null, crc32Computed: data ? crc32(data) : null, compressedSha256: sha256(compressed), central, local, dataDescriptor: descriptor });
}

const lines = entries.map((e) => `${e.name} ${e.uncompressedSha256}`).sort();
const diagnosis = {
  tool: "docs/testing/diagnostics/diagnose-package.mjs",
  createdAt: new Date().toISOString(),
  runtime: { node: process.versions.node, zlib: process.versions.zlib, platform: process.platform, arch: process.arch, osRelease: release(), tz: process.env.TZ ?? null },
  source: { gitHead: git("rev-parse", "HEAD"), gitStatusShort: git("status", "--short"), compiledFrom, examinedFile: from ? resolve(from) : null },
  package: { file: name, sha256: sha256(buf), bytes: buf.length },
  content: { sha256: createHash("sha256").update(lines.join("\n")).digest("hex"), entries: lines.length, definition: "sha256 of the lines '<entry name> <sha256 of uncompressed bytes>', sorted by UTF-16 code unit, joined with \\n" },
  archive,
  entries
};
mkdirSync(resolve(outDir), { recursive: true });
writeFileSync(resolve(outDir, name), buf);
writeFileSync(resolve(outDir, "diagnosis.json"), JSON.stringify(diagnosis, null, 2) + "\n");
writeFileSync(resolve(outDir, "SHA256SUMS"), `${sha256(buf)}  ${name}\n${sha256(readFileSync(resolve(outDir, "diagnosis.json")))}  diagnosis.json\n`);
console.log(JSON.stringify({ runtime: diagnosis.runtime, package: diagnosis.package.sha256, content: diagnosis.content.sha256, entries: entries.length, out: resolve(outDir) }));
