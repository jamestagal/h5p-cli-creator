import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, createReadStream, statSync } from "node:fs";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compile, compileToBuffer, compileToFile, createRegistry, validate, type LibraryRegistry } from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const card = (): AssetEntry => { const p = resolve(fixtures, "assets/card.jpg"); return { assetId: "card", sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType: "image/jpeg", open: () => createReadStream(p) }; };
const load = (n: string) => ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${n}.json`), "utf8")));
const goldenHashes: Record<string, string> = JSON.parse(readFileSync(resolve(fixtures, "golden-hashes.json"), "utf8"));

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
    await expect(compileToFile(invalid, new Map(), resolve(dir, "out.h5p"), { registry })).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]); // validation failed before any file was opened

    await expect(compileToFile(load("multi-choice"), new Map(), resolve(dir, "missing-dir", "out.h5p"), { registry })).rejects.toThrow(/ENOENT/);
    expect(await readdir(dir)).toEqual([]); // unwritable destination leaves nothing behind

    await compileToFile(load("flashcards"), new Map([["card", card()]]), resolve(dir, "out.h5p"), { registry });
    expect(await readdir(dir)).toEqual(["out.h5p"]);
  });

  it("validate accepts an image-bearing spec when the manifest has the asset, and reports the missing asset otherwise", async () => {
    expect(await validate(load("multi-choice"), new Map(), { registry })).toEqual([]);
    expect(await validate(load("flashcards"), new Map([["card", card()]]), { registry })).toEqual([]);
    await expect(validate(load("flashcards"), new Map(), { registry })).rejects.toThrow(/asset card is not in the manifest/);
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

  it("matches the committed golden hash for flashcards@1 (a mismatch means the toolchain, yazl, a handler or a library changed and the hash must be re-recorded deliberately)", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const hash = createHash("sha256").update(buf).digest("hex");
    expect(hash, "compiled bytes for flashcards@1 no longer match packages/engine/test/fixtures/golden-hashes.json: the Node/zlib toolchain, yazl, a handler or a library changed. Re-record the hash deliberately if the change was intended.").toBe(goldenHashes["flashcards@1"]);
  });
});
