import { describe, it, expect } from "vitest";
import { assertWritableStoreVersion, LegacyStoreError, MalformedStoreVersionError, STORE_VERSION, storeVersionOf, UnsupportedStoreVersionError } from "../src/store/types.js";

/** Records as JSON.parse returns them: the TypeScript type of `storeVersion` is not enforced on disk. */
const parsed = (json: string): object => JSON.parse(json) as object;

describe("store version of a parsed import record", () => {
  it("treats an absent version as a phase-2 (version 1) import", () => {
    expect(storeVersionOf(parsed(`{"importId":"i"}`), "import i")).toBe(1);
    expect(() => assertWritableStoreVersion(parsed(`{"importId":"i"}`), "import i")).toThrow(LegacyStoreError);
  });

  it("permits writes only for the numeric current version", () => {
    expect(STORE_VERSION).toBe(2);
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":2}`), "import i")).not.toThrow();
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":1}`), "import i")).toThrow(LegacyStoreError);
    expect(() => assertWritableStoreVersion(parsed(`{"storeVersion":3}`), "import i")).toThrow(UnsupportedStoreVersionError);
  });

  it.each([
    [`"bogus"`], [`"2"`], [`{}`], [`[]`], [`null`], [`true`], [`2.5`], [`0`], [`-2`], [`1e400`]
  ])("refuses a malformed version %s instead of reading it as some number", (raw) => {
    const record = parsed(`{"importId":"i","storeVersion":${raw}}`);
    expect(() => storeVersionOf(record, "import i")).toThrow(MalformedStoreVersionError);
    expect(() => assertWritableStoreVersion(record, "import i")).toThrow(MalformedStoreVersionError);
    expect(() => assertWritableStoreVersion(record, "import i")).toThrow(/import i has a malformed storeVersion/);
  });
});
