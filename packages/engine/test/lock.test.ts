import { describe, it, expect } from "vitest";
import { LibraryLockSchema, libraryKey } from "../src/lock.js";

describe("library lock", () => {
  it("builds keys as name-major.minor", () => {
    expect(libraryKey("H5P.MultiChoice", 1, 16)).toBe("H5P.MultiChoice-1.16");
  });
  it("validates a lock document", () => {
    const lock = LibraryLockSchema.parse({
      schemaVersion: 1, generatedAt: "2026-09-18T00:00:00.000Z",
      libraries: { "H5P.MultiChoice-1.16": { machineName: "H5P.MultiChoice", majorVersion: 1, minorVersion: 16, patchVersion: 14, package: "H5P.MultiChoice-1.16.h5p", dir: "H5P.MultiChoice-1.16", sha256: "a".repeat(64) } }
    });
    expect(lock.libraries["H5P.MultiChoice-1.16"]?.patchVersion).toBe(14);
  });
  it("rejects a key that disagrees with its entry", () => {
    expect(() => LibraryLockSchema.parse({
      schemaVersion: 1, generatedAt: "x",
      libraries: { "H5P.Wrong-1.0": { machineName: "H5P.MultiChoice", majorVersion: 1, minorVersion: 16, patchVersion: 14, package: "p.h5p", dir: "d", sha256: "a".repeat(64) } }
    })).toThrow(/key/);
  });
});
