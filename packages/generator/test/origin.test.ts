import { describe, expect, it } from "vitest";
import { countSourceCodePoints, normaliseWithOrigin, type OriginRun } from "../src/ingest/structure/origin.js";
import { normaliseBlockText } from "../src/ingest/structure/blocks.js";

/** Runs → the raw text an adapter builds and its generated ranges (UTF-16 offsets into that raw text). */
function raw(runs: OriginRun[]): { text: string; generated: Array<[number, number]> } {
  let text = "";
  const generated: Array<[number, number]> = [];
  for (const r of runs) { if (r.generated && r.text !== "") generated.push([text.length, text.length + r.text.length]); text += r.text; }
  return { text, generated };
}
const src = (text: string): OriginRun => ({ text });
const gen = (text: string): OriginRun => ({ text, generated: true });
const norm = (runs: OriginRun[], options?: Parameters<typeof normaliseWithOrigin>[2]) => { const r = raw(runs); return normaliseWithOrigin(r.text, r.generated, options); };
/** The generated substrings of a result, in order. */
const generatedParts = (r: { text: string; generated: Array<[number, number]> }): string[] => r.generated.map(([a, b]) => r.text.slice(a, b));

describe("normaliseWithOrigin: the joined text is authoritative", () => {
  it("normalises the joined runs exactly as normaliseBlockText does, for every case below", () => {
    const cases: OriginRun[][] = [
      [src("Caf"), src("e"), src("́")],
      [gen("[1]"), src("́ x")],
      [src("e"), gen("[2]")],
      [gen("e"), src("́")],
      [src("ᄀ"), src("ᅡ"), src("ᆨ")],
      [gen("[3]"), src("\u{1D49C}")],
      [src("\u{1F469}"), src("‍"), src("\u{1F527}")],
      [src("a  "), gen(" "), src("  b")],
      [src("  x\r\ny \t "), gen("[4]"), src(" ")],
      [src(" lead"), gen("•"), src("trail　")]
    ];
    for (const runs of cases) expect(norm(runs).text).toBe(normaliseBlockText(raw(runs).text));
  });

  it("composes a base and a combining mark in separate authored runs into one source é (per-run NFC would not)", () => {
    const r = norm([src("Caf"), src("e"), src("́")]);
    expect(r.text).toBe("Café");
    expect("e".normalize("NFC") + "́".normalize("NFC")).not.toBe(r.text.slice(3)); // why runs are never normalised independently
    expect(r.generated).toEqual([]);
    expect(countSourceCodePoints(r.text, r.generated)).toBe(4);
  });

  it("keeps a generated marker generated and the authored combining mark after it source, where NFC leaves the cluster unchanged", () => {
    const r = norm([gen("[1]"), src("́ x")]);
    expect(r.text).toBe("[1]́ x");
    expect(generatedParts(r)).toEqual(["[1]"]);
    expect(countSourceCodePoints(r.text, r.generated)).toBe(3); // U+0301, space, x
  });

  it("keeps an authored base before a generated marker source", () => {
    const r = norm([src("e"), gen("[2]")]);
    expect(generatedParts(r)).toEqual(["[2]"]);
    expect(countSourceCodePoints(r.text, r.generated)).toBe(1);
  });

  it("treats a cluster that NFC changes and that mixes origins as wholly generated, so the count can only fall", () => {
    for (const runs of [[gen("e"), src("́")], [src("e"), gen("́")]]) {
      const r = norm(runs);
      expect(r.text).toBe("é");
      expect(generatedParts(r)).toEqual(["é"]);
      expect(countSourceCodePoints(r.text, r.generated)).toBe(0);
    }
  });

  it("composes Hangul jamo split across authored runs into one source syllable", () => {
    const r = norm([src("ᄀ"), src("ᅡ"), src("ᆨ")]);
    expect(r.text).toBe("각");
    expect(countSourceCodePoints(r.text, r.generated)).toBe(1);
  });

  it("never splits an astral character between origins, next to a marker or across authored runs", () => {
    const a = norm([gen("[3]"), src("\u{1D49C}")]);
    expect(generatedParts(a)).toEqual(["[3]"]);
    expect(a.text.length).toBe(5);
    expect(countSourceCodePoints(a.text, a.generated)).toBe(1);
    const z = norm([src("\u{1F469}"), src("‍"), src("\u{1F527}")]);
    expect(z.text).toBe("👩‍🔧");
    expect(z.generated).toEqual([]);
  });

  it("gives a collapsed space the source origin if any whitespace it replaced was source", () => {
    const mixed = norm([src("a  "), gen(" "), src("  b")]);
    expect(mixed.text).toBe("a b");
    expect(mixed.generated).toEqual([]);
    const generatedOnly = norm([src("a"), gen(" "), src("b")]);
    expect(generatedParts(generatedOnly)).toEqual([" "]);
    expect(countSourceCodePoints(generatedOnly.text, generatedOnly.generated)).toBe(2);
  });

  it("drops trimmed characters with their origin, including non-ASCII whitespace that String.prototype.trim removes", () => {
    const r = norm([src(" lead"), gen("•"), src("trail　")]);
    expect(r.text).toBe("lead•trail");
    expect(generatedParts(r)).toEqual(["•"]);
    const crlf = norm([src("  x\r\ny \t "), gen("[4]"), src(" ")]);
    expect(crlf.text).toBe("x y [4]");
    expect(generatedParts(crlf)).toEqual(["[4]"]);
  });

  it("needs no mapping for text of a single origin: wholly source or wholly generated", () => {
    expect(norm([src("plain é text")]).generated).toEqual([]);
    const g = norm([gen("[Note 1]")]);
    expect(generatedParts(g)).toEqual(["[Note 1]"]);
    expect(g.fallback).toBeNull();
  });
});

describe("normaliseWithOrigin: the conservative fallback", () => {
  // A cluster normaliser that disagrees with whole-text NFC: Unicode does not promise that NFC never crosses a
  // grapheme cluster boundary, so the fallback must exist; this injects the disagreement it guards against.
  const disagreeing = { clusterNormalise: (s: string) => s.normalize("NFD") };

  it("keeps the exact text, marks the whole block generated and reports one originFallback with the raw counts", () => {
    const runs = [src("Café "), gen("[1]"), src(" ok")];
    const r = norm(runs, disagreeing);
    expect(r.text).toBe(normaliseBlockText(raw(runs).text));
    expect(r.generated).toEqual([[0, r.text.length]]);
    expect(countSourceCodePoints(r.text, r.generated)).toBe(0);
    expect(r.fallback).toEqual({ sourceCodePoints: 8, generatedCodePoints: 3 }); // "Café " and " ok" as source, "[1]" generated, before normalisation
  });

  it("does not fall back when the cluster normaliser agrees with whole-text NFC", () => {
    expect(norm([src("Café "), gen("[1]")]).fallback).toBeNull();
  });
});

describe("counting is by Unicode code point", () => {
  it("👩‍🔧 is 3 code points, 1 grapheme cluster and 5 UTF-16 code units, and counts 3", () => {
    const s = "\u{1F469}‍\u{1F527}";
    expect([...s].length).toBe(3);
    expect([...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(s)].length).toBe(1);
    expect(s.length).toBe(5);
    expect(countSourceCodePoints(s, [])).toBe(3);
  });

  it("counts é once whether precomposed or composed from e and U+0301, and 𝒜 (2 UTF-16 units) once", () => {
    expect(countSourceCodePoints("é", [])).toBe(1);
    expect(countSourceCodePoints(norm([src("e"), src("́")]).text, [])).toBe(1);
    expect("\u{1D49C}".length).toBe(2);
    expect(countSourceCodePoints("\u{1D49C}", [])).toBe(1);
  });

  it("counts only outside generated spans, within the requested range", () => {
    const text = "[Table 1, row 1] Column 1: 👩‍🔧";
    const generated: Array<[number, number]> = [[0, 27]];
    expect(countSourceCodePoints(text, generated)).toBe(3);
    expect(countSourceCodePoints(text, generated, 27, 29)).toBe(1);
  });
});
