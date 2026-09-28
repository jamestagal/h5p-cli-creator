import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, createReadStream, statSync } from "node:fs";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compile, compileToBuffer, compileToFile, createRegistry, validate, type LibraryRegistry, type Logger } from "../src/index.js";
import { crc32, entryData, readZipStructure } from "./helpers/zip-structure.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const card = (): AssetEntry => { const p = resolve(fixtures, "assets/card.jpg"); return { assetId: "card", sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType: "image/jpeg", open: () => createReadStream(p) }; };
const load = (n: string) => ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${n}.json`), "utf8")));
interface Golden {
  content: { sha256: string; entries: number };
  package: { sha256: string; runtime: { node: string; zlib: string; platform: string; arch: string } };
}
const goldens: Record<string, Golden> = JSON.parse(readFileSync(resolve(fixtures, "golden-hashes.json"), "utf8"));
const flashcardsGolden = goldens["flashcards@1"]!;
/** Deflate output is implementation-defined, so the compressed-bytes golden holds only on the runtime it was recorded on. */
const onRecordedRuntime = ((r) => process.versions.node === r.node && process.versions.zlib === r.zlib && process.platform === r.platform && process.arch === r.arch)(flashcardsGolden.package.runtime);
const describeRuntime = (r: Golden["package"]["runtime"]): string => `${r.platform} ${r.arch}, Node ${r.node}, zlib ${r.zlib}`;

describe("compile", () => {
  it("produces byte-identical packages for identical inputs", async () => {
    const a = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const b = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    expect(createHash("sha256").update(a).digest("hex")).toBe(createHash("sha256").update(b).digest("hex"));
  });

  it("writes h5p.json, content/content.json, media and every closure library, with no directory entries and sorted names", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.some((n) => zip.files[n]!.dir)).toBe(false);
    expect(names).toEqual([...names].sort());
    const h5p = JSON.parse(await zip.file("h5p.json")!.async("text"));
    expect(h5p.mainLibrary).toBe("H5P.Flashcards");
    expect(h5p.preloadedDependencies.map((d: { machineName: string }) => d.machineName)).toContain("H5P.Flashcards");
    expect(zip.file("content/content.json")).not.toBeNull();
    expect(zip.file("content/images/fc-1-c2.jpg")).not.toBeNull();
    expect(names.some((n) => n.startsWith("H5P.Flashcards-1.5/"))).toBe(true);
    for (const d of h5p.preloadedDependencies) expect(names.some((n) => n.startsWith(`${d.machineName}-${d.majorVersion}.${d.minorVersion}/library.json`))).toBe(true);
  });

  it("rejects when an asset's bytes do not match its declared hash", async () => {
    const bad = card(); bad.sha256 = "0".repeat(64);
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/hash/);
  });

  it("rejects when an asset's length does not match its declared byteLength", async () => {
    const bad = card(); bad.byteLength = bad.byteLength + 1;
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/byteLength|length/);
  });

  it("rejects when an asset source stream errors", async () => {
    const { Readable } = await import("node:stream");
    const bad = card(); bad.open = () => { const r = new Readable({ read() { this.destroy(new Error("disk gone")); } }); return r; };
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/disk gone/);
  });

  it("rejects when the destination errors, and compileToFile leaves no partial output", async () => {
    const { Writable } = await import("node:stream");
    const failing = new Writable({ write(_c, _e, cb) { cb(new Error("destination full")); } });
    await expect(compile(load("multi-choice"), new Map(), failing, { registry })).rejects.toThrow(/destination full/);

    const { mkdtemp, readdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(resolve(tmpdir(), "h5p-out-"));
    const bad = card(); bad.sha256 = "0".repeat(64);
    await expect(compileToFile(load("flashcards"), new Map([["card", bad]]), resolve(dir, "out.h5p"), { registry })).rejects.toThrow(/hash/);
    expect(await readdir(dir)).toEqual([]);

    const invalid = load("multi-choice"); (invalid as { answers: unknown }).answers = "nope";
    await expect(compileToFile(invalid, new Map(), resolve(dir, "out.h5p"), { registry })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [expect.objectContaining({ path: "answers", code: "SCHEMA" })] });
    expect(await readdir(dir)).toEqual([]); // validation failed before any file was opened

    await expect(compileToFile(load("multi-choice"), new Map(), resolve(dir, "missing-dir", "out.h5p"), { registry })).rejects.toThrow(/ENOENT/);
    expect(await readdir(dir)).toEqual([]); // unwritable destination leaves nothing behind

    await compileToFile(load("flashcards"), new Map([["card", card()]]), resolve(dir, "out.h5p"), { registry });
    expect(await readdir(dir)).toEqual(["out.h5p"]);
  });

  it("validate accepts an image-bearing spec when the manifest has the asset, and reports the missing asset otherwise", async () => {
    expect(await validate(load("multi-choice"), new Map(), { registry })).toEqual([]);
    expect(await validate(load("flashcards"), new Map([["card", card()]]), { registry })).toEqual([]);
    expect(await validate(load("flashcards"), new Map(), { registry })).toEqual([{ path: "cards[1].imageAssetId", message: "asset card is not in the manifest", code: "ASSET_MISSING" }]);
    await expect(compileToBuffer(load("flashcards"), new Map(), { registry })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [{ path: "cards[1].imageAssetId", message: "asset card is not in the manifest", code: "ASSET_MISSING" }] });
  });

  it("changes bytes when the revision changes (sub-content ids differ)", async () => {
    const a = await compileToBuffer(load("question-set-nested"), new Map(), { registry, revision: 1 });
    const b = await compileToBuffer(load("question-set-nested"), new Map(), { registry, revision: 2 });
    expect(a.equals(b)).toBe(false);
  });

  it("encodes a fixed DOS-only timestamp for every zip entry, with no timezone-dependent extra field", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });

    const localSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    let offset = buf.indexOf(localSignature);
    let localHeader: { time: number; date: number } | undefined;
    while (offset !== -1) {
      const nameLength = buf.readUInt16LE(offset + 26);
      const name = buf.toString("utf8", offset + 30, offset + 30 + nameLength);
      if (name === "h5p.json") {
        localHeader = { time: buf.readUInt16LE(offset + 10), date: buf.readUInt16LE(offset + 12) };
        break;
      }
      offset = buf.indexOf(localSignature, offset + 4);
    }
    expect(localHeader).toEqual({ time: 0, date: 10273 });

    // `forceDosTimestamp` must suppress yazl's Info-ZIP "UT" extra-timestamp field (which encodes
    // the absolute epoch instant, not just the DOS date/time) on the central-directory record too;
    // otherwise the DOS field above stays fixed while this field still varies with `TZ`.
    const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    offset = buf.indexOf(centralSignature);
    let extraFieldLength: number | undefined;
    while (offset !== -1) {
      const nameLength = buf.readUInt16LE(offset + 28);
      const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
      if (name === "h5p.json") {
        extraFieldLength = buf.readUInt16LE(offset + 30);
        break;
      }
      offset = buf.indexOf(centralSignature, offset + 4);
    }
    expect(extraFieldLength).toBe(0);
  });

  it("produces identical bytes under different timezones", async () => {
    const originalTz = process.env.TZ;
    try {
      const zones = ["UTC", "Asia/Tokyo", "America/New_York"];
      const hashes: string[] = [];
      const offsets: number[] = [];
      for (const zone of zones) {
        process.env.TZ = zone;
        offsets.push(new Date(2000, 0, 1).getTimezoneOffset());
        const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
        hashes.push(createHash("sha256").update(buf).digest("hex"));
      }
      expect(new Set(hashes).size).toBe(1);
      // Proves the TZ switch actually took effect (otherwise the hash equality above would be
      // vacuous, e.g. if Node cached the offset from process start).
      expect(new Set(offsets).size).toBeGreaterThanOrEqual(2);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("destroys open asset streams when the destination errors", async () => {
    const { Writable } = await import("node:stream");
    const asset = card();
    const openStream = asset.open();
    asset.open = () => openStream;
    const failing = new Writable({ write(_c, _e, cb) { cb(new Error("destination full")); } });
    await expect(compile(load("flashcards"), new Map([["card", asset]]), failing, { registry, revision: 1 })).rejects.toThrow(/destination full/);
    expect(openStream.destroyed).toBe(true);
  });

  it("matches the portable content golden for flashcards@1: every entry's uncompressed bytes, on any runtime", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const zip = readZipStructure(buf);
    const lines = zip.entries.map((e, i) => `${e.name} ${createHash("sha256").update(entryData(buf, e, zip.locals[i]!)).digest("hex")}`).sort();
    expect(lines).toHaveLength(flashcardsGolden.content.entries);
    const content = createHash("sha256").update(lines.join("\n")).digest("hex");
    expect(content, "the uncompressed content of flashcards@1 changed: a handler, the params, a library or the fixture changed. Re-record the content golden deliberately if the change was intended.").toBe(flashcardsGolden.content.sha256);
  });

  it("writes the same ZIP metadata on any runtime: fixed times, modes and versions, no extra fields or comments, CRCs and sizes that match the data", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const zip = readZipStructure(buf);
    expect(zip.commentLength).toBe(0);
    const names = zip.entries.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))); // UTF-16 code-unit order
    expect(names.some((n) => n.endsWith("/"))).toBe(false);
    const streamed = new Set(["content/images/fc-1-c2.jpg"]); // media arrives as a stream, so its sizes and CRC follow in a data descriptor
    let previousOffset = -1;
    zip.entries.forEach((e, i) => {
      const local = zip.locals[i]!;
      const data = entryData(buf, e, local);
      const where = `${e.name}: `;
      expect({ versionMadeBy: e.versionMadeBy, versionNeeded: e.versionNeeded, method: e.method, dosTime: e.dosTime, dosDate: e.dosDate, extraLength: e.extraLength, commentLength: e.commentLength, diskStart: e.diskStart, internalAttributes: e.internalAttributes, externalAttributes: e.externalAttributes }, where)
        .toEqual({ versionMadeBy: 0x033f, versionNeeded: 20, method: 8, dosTime: 0, dosDate: 10273, extraLength: 0, commentLength: 0, diskStart: 0, internalAttributes: 0, externalAttributes: (0o100644 << 16) >>> 0 });
      expect(e.flags, where).toBe(streamed.has(e.name) ? 0x0808 : 0x0800); // UTF-8 names; bit 3 only for streamed entries
      expect({ versionNeeded: local.versionNeeded, flags: local.flags, method: local.method, dosTime: local.dosTime, dosDate: local.dosDate, extraLength: local.extraLength, name: local.name }, where)
        .toEqual({ versionNeeded: e.versionNeeded, flags: e.flags, method: e.method, dosTime: e.dosTime, dosDate: e.dosDate, extraLength: 0, name: e.name });
      expect(crc32(data), where).toBe(e.crc32);
      expect(data.length, where).toBe(e.uncompressedSize);
      if (streamed.has(e.name)) {
        expect({ crc32: local.crc32, compressedSize: local.compressedSize, uncompressedSize: local.uncompressedSize }, where).toEqual({ crc32: 0, compressedSize: 0, uncompressedSize: 0 });
        const after = local.dataOffset + e.compressedSize;
        expect({ signature: buf.readUInt32LE(after), crc32: buf.readUInt32LE(after + 4), compressedSize: buf.readUInt32LE(after + 8), uncompressedSize: buf.readUInt32LE(after + 12) }, where)
          .toEqual({ signature: 0x08074b50, crc32: e.crc32, compressedSize: e.compressedSize, uncompressedSize: e.uncompressedSize });
      } else {
        expect({ crc32: local.crc32, compressedSize: local.compressedSize, uncompressedSize: local.uncompressedSize }, where).toEqual({ crc32: e.crc32, compressedSize: e.compressedSize, uncompressedSize: e.uncompressedSize });
      }
      expect(e.localHeaderOffset, where).toBeGreaterThan(previousOffset); // local records in central-directory order
      previousOffset = e.localHeaderOffset;
    });
  });

  it("compresses every entry exactly as this runtime's zlib does at level 6 (yazl's default), so a change of level or method is caught on any runtime", async () => {
    const { deflateRawSync } = await import("node:zlib");
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const zip = readZipStructure(buf);
    zip.entries.forEach((e, i) => {
      const local = zip.locals[i]!;
      const stored = buf.subarray(local.dataOffset, local.dataOffset + e.compressedSize);
      expect(stored.equals(deflateRawSync(entryData(buf, e, local), { level: 6 })), `${e.name}: stored stream is not this runtime's level-6 deflate`).toBe(true);
    });
  });

  it.runIf(onRecordedRuntime)(`matches the compressed-bytes golden for flashcards@1 on its recorded runtime (${describeRuntime(flashcardsGolden.package.runtime)})`, async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const hash = createHash("sha256").update(buf).digest("hex");
    expect(hash, "on the recorded runtime, compiled bytes for flashcards@1 no longer match: the runtime's deflate output, yazl, a handler or a library changed. The content and metadata goldens say which layer. Re-record deliberately if the change was intended.").toBe(flashcardsGolden.package.sha256);
  });

  it("calls the injected logger with a compiled summary after a successful write", async () => {
    const lines: string[] = [];
    const logger: Logger = { info: (msg) => lines.push(msg), warn: () => undefined };
    await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1, logger });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^compiled H5P\.Flashcards: \d+ entries, \d+ libraries$/);
  });

  it("rejects a flashcards spec whose two cards share an id, so the engine can no longer overwrite one card's image mapping with the other's", async () => {
    const duplicateFlashcards: ActivitySpec = {
      id: "fc-dup", title: "Dup", type: "flashcards", language: "en", schemaVersion: 1,
      cards: [
        { id: "c1", front: "front1", back: "back1", imageAssetId: "card" },
        { id: "c1", front: "front2", back: "back2", imageAssetId: "card" }
      ]
    };
    const assets = new Map([["card", card()]]);

    expect(await validate(duplicateFlashcards, assets, { registry })).toEqual([{ path: "cards[1].id", message: 'duplicate id "c1" in cards', code: "SCHEMA" }]);
    await expect(compileToBuffer(duplicateFlashcards, assets, { registry, revision: 1 })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [expect.objectContaining({ path: "cards[1].id", code: "SCHEMA" })] });
  });

  it("validate returns coded schema issues with a path instead of throwing", async () => {
    const badShape = { ...load("multi-choice"), answers: "nope" } as unknown as ActivitySpec;
    const issues = await validate(badShape, new Map(), { registry });
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue).toMatchObject({ code: "SCHEMA", path: expect.stringMatching(/^answers/) });
  });
});
