import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkSentences, extractChunkConcepts, extractionRequest, renderEvidence } from "../src/concepts/index.js";
import { buildOutline, EXTRACTION_VERSION, finaliseDocument, ingestSource, ingestText, sourceAnalysis, type IngestedSource, type OutlineSection, type SourceDocument } from "../src/ingest/index.js";
import { normaliseBlocks, type Block, type Cell } from "../src/ingest/structure/blocks.js";
import { linearize } from "../src/ingest/structure/linearize.js";
import type { StageRunner } from "../src/llm/runner.js";
import { chunkScope, parseScopeFile, renderScopedEvidence, resolveScope, SCOPE_FORMAT, SCOPED_LAYOUT_VERSION, scopeHashOf, scopePayload, scopeTemplate, ScopeRefusedError, type ResolvedScope } from "../src/scope/index.js";
import { electricalDocx, electricalOdt } from "./helpers/structured-sources.js";
import { fixtures } from "./helpers/synthetic.js";

const row = (...texts: string[]): Cell[] => texts.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
const SHA = "a".repeat(64);
/** A paragraph of `n` sentences, each about 32 code points: long enough that small selections pass the minimum. */
const para = (word: string, n: number): Block => ({ kind: "paragraph", text: Array.from({ length: n }, (_, i) => `${word} sentence ${i + 1} of this paragraph.`).join(" ") });

/** A structured source built from blocks, as ingestSource would return it (the bytes' hash is a stand-in). */
function built(blocks: Block[]): Pick<IngestedSource, "document" | "analysis" | "originalSha256"> {
  const lin = linearize(normaliseBlocks(blocks));
  const document = finaliseDocument("docx", lin.text, lin.segments, { sourceId: "src-scope", fileName: "scope.docx" }, { extractor: "docx", originalSha256: SHA });
  return { document, analysis: sourceAnalysis(document, lin), originalSha256: SHA };
}
function fileFor(source: Pick<IngestedSource, "document" | "originalSha256">, include: unknown[], exclude: unknown[] = [], previewConfig: Record<string, unknown> = {}): Record<string, unknown> {
  const t = scopeTemplate(source, "scope.docx") as Record<string, unknown> & { previewConfig: Record<string, unknown> };
  return { ...t, include, exclude, previewConfig: { ...t.previewConfig, ...previewConfig } };
}
const flat = (sections: OutlineSection[]): OutlineSection[] => sections.flatMap((s) => [s, ...flat(s.children)]);
const sectionEntry = (source: Pick<IngestedSource, "document" | "analysis">, title: string, nth = 0) => { const s = flat(buildOutline(source.document, source.analysis).sections).filter((x) => x.title === title)[nth]!; return { section: s.id, title: s.title }; };
const ids = (r: ResolvedScope): string[] => r.sentences.map((s) => s.sentenceId);
const under = (doc: SourceDocument, ...path: string[]): string[] => doc.sentences.filter((s) => path.every((p, i) => s.headingPath[i] === p)).map((s) => s.sentenceId);
const refusal = (f: () => unknown): string[] => { try { f(); } catch (e) { if (e instanceof ScopeRefusedError) return e.problems; throw e; } throw new Error("not refused"); };

const DOC: Block[] = [
  para("Front", 3),
  { kind: "heading", level: 1, text: "Safety" }, para("Safety", 17),
  { kind: "heading", level: 2, text: "Isolation" }, para("Isolation", 17),
  { kind: "heading", level: 2, text: "Testing" }, para("Testing", 17),
  { kind: "heading", level: 1, text: "Records" }, para("Records", 17)
];

describe("the scope file: schema and versions", () => {
  const source = built(DOC);

  it("accepts the template outline writes once something is included, and rejects extra fields and malformed entries", () => {
    const ok = fileFor(source, [sectionEntry(source, "Safety")]);
    expect(parseScopeFile(ok).include).toHaveLength(1);
    expect(refusal(() => parseScopeFile({ ...ok, extra: 1 })).join(" ")).toMatch(/extra|unrecognized/i);
    expect(refusal(() => parseScopeFile({ ...ok, include: [{ section: "sec-s9" }] })).join(" ")).toMatch(/include/);
    expect(refusal(() => parseScopeFile({ ...ok, include: [{ sentences: { from: "s1" } }] })).join(" ")).toMatch(/include/);
    expect(refusal(() => parseScopeFile({ ...ok, previewConfig: { chunkTokens: 0, scopedLayoutVersion: SCOPED_LAYOUT_VERSION } })).join(" ")).toMatch(/chunkTokens/);
  });

  it("refuses an unknown scopeFormat or scopedLayoutVersion by name", () => {
    const ok = fileFor(source, [sectionEntry(source, "Safety")]);
    expect(refusal(() => resolveScope({ ...ok, scopeFormat: SCOPE_FORMAT + 1 }, source)).join(" ")).toContain(`scopeFormat ${SCOPE_FORMAT + 1} is not supported`);
    expect(refusal(() => resolveScope(fileFor(source, [sectionEntry(source, "Safety")], [], { scopedLayoutVersion: SCOPED_LAYOUT_VERSION + 1 }), source)).join(" ")).toContain(`scopedLayoutVersion ${SCOPED_LAYOUT_VERSION + 1} is not supported`);
  });
});

describe("binding: a scope is bound to its source for every format", () => {
  it("binds to the bytes' sha256, the text hash and the extraction version; any mismatch is refused with 're-run leap outline'", async () => {
    const md = await readFile(resolve(fixtures, "source-electrical-safety.md"));
    const sources: Array<[string, Buffer]> = [
      ["e.txt", md], ["e.md", md], ["e.pdf", await readFile(resolve(fixtures, "source-electrical-safety.pdf"))],
      ["e.docx", await electricalDocx()], ["e.odt", await electricalOdt()]
    ];
    for (const [name, bytes] of sources) {
      const s = await ingestSource(bytes, name);
      const all = { sentences: { from: s.document.sentences[0]!.sentenceId, to: s.document.sentences.at(-1)!.sentenceId } };
      const good: Record<string, unknown> = { ...(scopeTemplate(s, name) as Record<string, unknown>), include: [all] };
      expect(resolveScope(good, s).counts.sentences, name).toBe(s.document.sentences.length);
      const src = good["source"] as Record<string, string>;
      for (const [field, value] of [["originalSha256", "b".repeat(64)], ["textHash", "c".repeat(64)], ["extractionVersion", "2000-01-01.1"]] as const) {
        const problems = refusal(() => resolveScope({ ...good, source: { ...src, [field]: value } }, s));
        expect(problems.join(" "), `${name} ${field}`).toMatch(new RegExp(`${field}.*re-run leap outline`));
      }
      expect(resolveScope({ ...good, source: { ...src, fileName: "renamed.bin" } }, s).scopeHash).toBe(resolveScope(good, s).scopeHash); // fileName is informational
    }
  });
});

describe("resolution: parent and subsection selection without duplicate text", () => {
  const source = built(DOC);
  const doc = source.document;
  const safety = sectionEntry(source, "Safety"); const isolation = sectionEntry(source, "Isolation"); const testing = sectionEntry(source, "Testing");

  it("a section selects its subtree; a subsection alone selects only itself; parent minus child drops the child", () => {
    expect(ids(resolveScope(fileFor(source, [safety]), source))).toEqual(under(doc, "Safety"));
    expect(ids(resolveScope(fileFor(source, [isolation]), source))).toEqual(under(doc, "Safety", "Isolation"));
    expect(ids(resolveScope(fileFor(source, [safety], [testing]), source))).toEqual(under(doc, "Safety").filter((id) => !under(doc, "Safety", "Testing").includes(id)));
  });

  it("parent and child together select each sentence once, and the child entry is listed as redundant", () => {
    const r = resolveScope(fileFor(source, [safety, isolation]), source);
    expect(ids(r)).toEqual(under(doc, "Safety"));
    expect(new Set(ids(r)).size).toBe(ids(r).length);
    expect(r.redundant).toEqual([`include ${isolation.section} (Isolation) is already selected by other entries`]);
  });

  it("refuses unknown ids, a mismatched title, an exclude that removes nothing, a reversed range and an empty result, listing every problem", () => {
    const problems = refusal(() => resolveScope(fileFor(source, [
      { section: "sec-s9999", title: "Nowhere" }, { section: safety.section, title: "Not the title" }, { sentences: { from: "s20", to: "s10" } }, { sentences: { from: "s1", to: "s9999" } }
    ], [{ section: sectionEntry(source, "Records").section, title: "Records" }]), source));
    expect(problems).toEqual([
      "include sec-s9999: no such section in the outline",
      `include ${safety.section}: its title is "Safety", not "Not the title"`,
      "include s20–s10: the range starts after it ends",
      "include s1–s9999: no sentence s9999",
      `exclude ${sectionEntry(source, "Records").section} (Records) removes nothing that is included`
    ]);
    expect(refusal(() => resolveScope(fileFor(source, [isolation], [isolation]), source))).toEqual(["the scope selects no sentences"]);
  });

  it("property: resolved ids are unique, in document order, maximal passages, and each sentence's text is its slice of the stored text", () => {
    let seed = 7;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const n = doc.sentences.length;
    for (let trial = 0; trial < 60; trial++) {
      const range = () => { const a = rand(n); const b = a + rand(Math.min(8, n - a)); return { sentences: { from: doc.sentences[a]!.sentenceId, to: doc.sentences[b]!.sentenceId } }; };
      const include = Array.from({ length: 1 + rand(4) }, range);
      let r: ResolvedScope;
      try { r = resolveScope(fileFor(source, include, rand(2) ? [range()] : []), source); } catch (e) { if (e instanceof ScopeRefusedError) continue; throw e; }
      const index = new Map(doc.sentences.map((s, i) => [s.sentenceId, i]));
      const positions = ids(r).map((id) => index.get(id)!);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(new Set(positions).size).toBe(positions.length);
      expect(r.payload.passages.flatMap((p) => p.sentenceIds)).toEqual(ids(r));
      r.payload.passages.forEach((p, k) => {
        const ps = p.sentenceIds.map((id) => index.get(id)!);
        ps.forEach((x, i) => { if (i > 0) expect(x).toBe(ps[i - 1]! + 1); });
        if (k > 0) expect(ps[0]! - index.get(r.payload.passages[k - 1]!.sentenceIds.at(-1)!)!).toBeGreaterThan(1);
      });
      for (const s of r.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
      for (const s of r.sentences) expect(doc.sentences).toContain(s); // the original sentence objects, never renumbered
    }
  });
});

describe("the minimum: 500 code points of source text, counted once, within the selection", () => {
  async function plain(): Promise<Pick<IngestedSource, "document" | "analysis" | "originalSha256">> {
    // s1: 299 astral code points and a full stop (300 code points, 599 UTF-16 units); s2: 199; s3: 1
    const text = `${"\u{1D49C}".repeat(299)}.\n${"b".repeat(198)}.\nc\n${"Filler line for admission. ".repeat(20).trim()}`;
    const document = await ingestText(text, { sourceId: "src-plain", fileName: "plain.txt" });
    return { document, analysis: sourceAnalysis(document, null), originalSha256: SHA };
  }
  const range = (from: string, to: string) => ({ sentences: { from, to } });

  it("499 is refused naming the count; 500 is accepted; code points, not UTF-16 units", async () => {
    const s = await plain();
    expect(s.document.sentences.slice(0, 3).map((x) => [...x.text].length)).toEqual([300, 199, 1]);
    expect(refusal(() => resolveScope(fileFor(s, [range("s1", "s2")]), s))).toEqual(["the selection has 499 code points of source text, below the minimum of 500"]);
    expect(resolveScope(fileFor(s, [range("s1", "s3")]), s).counts.sourceCodePoints).toBe(500);
  });

  it("generated text never counts: a table of empty cells is refused even though its stored text is far over 500", () => {
    const empty = Array.from({ length: 12 }, () => "");
    const s = built([para("Front", 20), { kind: "heading", level: 1, text: "Grid" }, { kind: "table", index: 1, headerRows: 0, rows: [["a", ...empty.slice(1)], ...Array.from({ length: 6 }, () => [...empty])].map((r) => row(...r)) }]);
    const grid = sectionEntry(s, "Grid");
    expect(refusal(() => resolveScope(fileFor(s, [grid]), s))[0]).toMatch(/^the selection has 5 code points of source text/); // "Grid" and "a"
  });

  it("a later row selected alone counts its header once: 16 + 484 = 500", () => {
    const header = "Sixteen-char hdr";
    const s = built([para("Front", 20), { kind: "table", index: 1, headerRows: 1, rows: [row(header), row("first"), row("x".repeat(484))] }]);
    const rowSentence = s.document.sentences.find((x) => x.text.startsWith("[Table 1, row 2]"))!.sentenceId;
    expect(resolveScope(fileFor(s, [range(rowSentence, rowSentence)]), s).counts.sourceCodePoints).toBe(500);
  });
});

describe("partial structures: detected from the analysis and reported", () => {
  const blocks: Block[] = [
    para("Front", 20),
    { kind: "heading", level: 1, text: "Parts" },
    { kind: "table", index: 3, headerRows: 1, rows: [row("K", "V"), row("a", "1"), row("b", "2"), row("c", "3"), row("d", "4")] },
    { kind: "listItem", depth: 0, label: "1.", text: "One." }, { kind: "listItem", depth: 0, label: "2.", text: "Two. Two again." }, { kind: "listItem", depth: 0, label: "3.", text: "Three." },
    { kind: "note", n: 2, text: "", blocks: [{ kind: "paragraph", text: "Note line one." }, { kind: "paragraph", text: "Note line two." }, { kind: "paragraph", text: "Note line three." }] },
    { kind: "paragraph", text: "First of four. Second of four. Third of four. Fourth of four." },
    para("Tail", 20)
  ];
  const s = built(blocks);
  const doc = s.document;
  const id = (text: string) => doc.sentences.find((x) => x.text === text || x.text.startsWith(text))!.sentenceId;
  const tail = (from: string) => ({ sentences: { from, to: doc.sentences.at(-1)!.sentenceId } });

  it("reports a partial table, list, list item, note and paragraph exactly", () => {
    const r = resolveScope(fileFor(s, [
      { sentences: { from: "s1", to: id("[Table 3, row 2]") } },
      { sentences: { from: id("2. Two."), to: id("2. Two.") } },
      { sentences: { from: id("[Note 2] Note line two."), to: id("[Note 2] Note line two.") } },
      { sentences: { from: id("Second of four."), to: id("Third of four.") } },
      tail(id("Tail sentence 1"))
    ]), s);
    expect(r.partial.map((p) => p.message)).toEqual([
      "Table 3 under Parts: 2 of 4 rows (rows 1–2)",
      "List 1 under Parts: 1 of 3 items (item 2)",
      "List 1, item 2: 1 of 2 sentences",
      "Note 2: 1 of 3 lines (line 2)",
      `Paragraph at ${id("First of four.")}–${id("Fourth of four.")}: 2 of 4 sentences`
    ]);
  });

  it("section entries never produce a partial structure", () => {
    expect(resolveScope(fileFor(s, [sectionEntry(s, "Parts")]), s).partial).toEqual([]);
  });
});

describe("the canonical scopeHash", () => {
  const source = built(DOC);
  const isolation = sectionEntry(source, "Isolation");

  it("is the sha256 of exactly this JSON, with keys in this order", () => {
    const r = resolveScope(fileFor(source, [isolation]), source);
    const sentenceIds = under(source.document, "Safety", "Isolation");
    const expected = JSON.stringify({
      scopeHashVersion: 1, scopeFormat: 1,
      binding: { originalSha256: SHA, textHash: source.document.textHash, extractionVersion: EXTRACTION_VERSION },
      passages: [{ sentenceIds }],
      context: [{ passage: 0, from: sentenceIds[0], to: sentenceIds.at(-1), headingPath: ["Safety", "Isolation"] }]
    });
    expect(JSON.stringify(r.payload)).toBe(expected);
    expect(r.scopeHash).toBe(createHash("sha256").update(expected, "utf8").digest("hex"));
  });

  it("covers binding, passages and context, and nothing else: equivalent spellings, fileName and previewConfig leave it unchanged", () => {
    const bySection = resolveScope(fileFor(source, [isolation]), source);
    const sentenceIds = under(source.document, "Safety", "Isolation");
    const byRange = resolveScope(fileFor(source, [{ sentences: { from: sentenceIds[0], to: sentenceIds.at(-1) } }]), source);
    const byTwoRanges = resolveScope(fileFor(source, [{ sentences: { from: sentenceIds[0], to: sentenceIds[5] } }, { sentences: { from: sentenceIds[3], to: sentenceIds.at(-1) } }]), source);
    expect(byRange.scopeHash).toBe(bySection.scopeHash);
    expect(byTwoRanges.scopeHash).toBe(bySection.scopeHash);
    expect(resolveScope(fileFor(source, [isolation], [], { chunkTokens: 400 }), source).scopeHash).toBe(bySection.scopeHash);
    expect(resolveScope(fileFor(source, [{ sentences: { from: sentenceIds[0], to: sentenceIds.at(-2) } }]), source).scopeHash).not.toBe(bySection.scopeHash);
    const p = bySection.payload;
    expect(scopeHashOf(scopePayload(p.binding, p.passages, p.context))).toBe(bySection.scopeHash);
    expect(scopeHashOf(scopePayload(p.binding, p.passages, [{ ...p.context[0]!, headingPath: ["Safety", "Renamed"] }]))).not.toBe(bySection.scopeHash);
    expect(scopeHashOf(scopePayload({ ...p.binding, textHash: "d".repeat(64) }, p.passages, p.context))).not.toBe(bySection.scopeHash);
  });

  it("context runs break where the heading path changes, within each passage", () => {
    const safety = sectionEntry(source, "Safety");
    const r = resolveScope(fileFor(source, [safety]), source);
    expect(r.payload.context.map((c) => [c.passage, c.headingPath])).toEqual([[0, ["Safety"]], [0, ["Safety", "Isolation"]], [0, ["Safety", "Testing"]]]);
  });
});

describe("scoped rendering: one contract for requests and preview", () => {
  const source = built(DOC);
  const doc = source.document;
  const at = (path: string[], k: number) => under(doc, ...path)[k]!;
  const range = (from: string, to: string) => ({ sentences: { from, to } });
  const evidenceLines = (text: string) => text.slice(text.indexOf("EVIDENCE:\n") + "EVIDENCE:\n".length).split("\n");

  it("a long passage across chunks continues at its next sentence: no marker and no restart at the boundaries", () => {
    const r = resolveScope(fileFor(source, [sectionEntry(source, "Safety")], [], { chunkTokens: 200 }), source);
    const chunks = chunkScope(r);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const rendered = renderScopedEvidence(r);
    expect(rendered.join("\n")).not.toContain("[gap:");
    const firstIds = chunks.map((c) => c.sentences[0]!.sentenceId);
    chunks.forEach((c, k) => { if (k > 0) expect(doc.sentences.findIndex((x) => x.sentenceId === firstIds[k])).toBe(doc.sentences.findIndex((x) => x.sentenceId === chunks[k - 1]!.sentences.at(-1)!.sentenceId) + 1); });
    expect(chunks.flatMap((c) => c.sentences.map((x) => x.sentenceId))).toEqual(ids(r));
  });

  it("an omission inside a chunk, and one exactly at a chunk boundary, each get one marker naming the omitted range", () => {
    const a = [at(["Safety", "Isolation"], 0), at(["Safety", "Isolation"], 9)] as const;
    const b = [at(["Safety", "Testing"], 0), at(["Safety", "Testing"], 9)] as const; // about 320 code points each: together over the minimum
    const inside = resolveScope(fileFor(source, [range(a[0], a[1]), range(b[0], b[1])]), source);
    const text = renderScopedEvidence(inside);
    expect(text).toHaveLength(1);
    const gapFrom = doc.sentences[doc.sentences.findIndex((x) => x.sentenceId === a[1]) + 1]!.sentenceId;
    const gapTo = doc.sentences[doc.sentences.findIndex((x) => x.sentenceId === b[0]) - 1]!.sentenceId;
    const marker = `[gap: sentences ${gapFrom}–${gapTo} are not in the generation scope]`;
    expect(evidenceLines(text[0]!).filter((l) => l.startsWith("[gap:"))).toEqual([marker]);
    expect(evidenceLines(text[0]!)[evidenceLines(text[0]!).indexOf(marker) + 1]).toMatch(new RegExp(`^\\[${b[0]}\\] `));
    // a chunk size that ends the first chunk exactly at the end of the first passage
    const tokensFor = (r: ResolvedScope, budget: number) => chunkScope({ ...r, previewConfig: { ...r.previewConfig, chunkTokens: budget } });
    const budget = [...Array(2000).keys()].map((t) => t + 50).find((t) => { const c = tokensFor(inside, t); return c.length === 2 && c[0]!.sentences.at(-1)!.sentenceId === a[1]; })!;
    const boundary = tokensFor(inside, budget);
    const second = renderEvidence(boundary[1]!);
    expect(evidenceLines(second)[0]).toBe(marker);
    expect(renderEvidence(boundary[0]!)).not.toContain("[gap:");
  });

  it("text before the first passage and after the last gets no marker", () => {
    const r = resolveScope(fileFor(source, [sectionEntry(source, "Isolation")]), source);
    expect(renderScopedEvidence(r).join("\n")).not.toContain("[gap:");
  });

  it("heading context breaks at gaps and is labelled context only; scoped requests carry the two scope lines", () => {
    const a = [at(["Safety", "Isolation"], 0), at(["Safety", "Isolation"], 7)] as const;
    const b = [at(["Safety", "Isolation"], 10), at(["Safety", "Isolation"], 17)] as const;
    const r = resolveScope(fileFor(source, [range(a[0], a[1]), range(b[0], b[1])], [], {}), source);
    const [text] = renderScopedEvidence(r);
    expect(text).toContain("- Passages are separate parts of the document; do not treat text across a gap as continuous.");
    expect(text).toContain("- Headings in HEADING CONTEXT are context only and cannot be cited.");
    expect(text).toContain(`- Safety › Isolation: ${a[0]} to ${a[1]}\n- Safety › Isolation: ${b[0]} to ${b[1]}`);
    expect(text).not.toContain(`${a[0]} to ${b[1]}`);
  });

  it("the preview is the request: each chunk's rendering is exactly the end of its extraction request", () => {
    const r = resolveScope(fileFor(source, [sectionEntry(source, "Safety")], [sectionEntry(source, "Testing")], { chunkTokens: 500 }), source);
    const chunks = chunkScope(r);
    const rendered = renderScopedEvidence(r);
    expect(rendered).toHaveLength(chunks.length);
    chunks.forEach((c, k) => expect(extractionRequest(c, {}).user.endsWith(`\n\n${rendered[k]}`) || extractionRequest(c, {}).user.endsWith(rendered[k]!)).toBe(true));
  });

  it("uses previewConfig.chunkTokens: a smaller chunk size gives more chunks for the same scope", () => {
    const big = resolveScope(fileFor(source, [sectionEntry(source, "Safety")], [], { chunkTokens: 6000 }), source);
    const small = resolveScope(fileFor(source, [sectionEntry(source, "Safety")], [], { chunkTokens: 300 }), source);
    expect(chunkScope(big)).toHaveLength(1);
    expect(chunkScope(small).length).toBeGreaterThan(1);
  });

  it("an unscoped chunk renders exactly as before: no scope lines, no markers, the original heading context header", () => {
    const [chunk] = chunkSentences(doc.sentences, 6000);
    const text = renderEvidence(chunk!);
    expect(text).not.toContain("GENERATION SCOPE");
    expect(text).toContain("HEADING CONTEXT (the section each sentence is in):");
    expect(extractionRequest(chunk!, {}).user.endsWith(text)).toBe(true);
  });

  it("a model citing a gap marker's range or an excluded ancestor heading is rejected by extraction verification", async () => {
    const r = resolveScope(fileFor(source, [sectionEntry(source, "Isolation")]), source);
    const [chunk] = chunkScope(r);
    const ancestor = under(doc, "Safety")[0]!; // the "Safety" heading line: context only here
    const issues: string[][] = [];
    const runner: StageRunner = { run: async (call) => { issues.push(await call.verify!({ concepts: [{ name: "Lockout", summary: "Locks are applied.", kind: "content", sentenceIds: [ancestor] }] } as never)); throw new Error("stop"); } };
    await expect(extractChunkConcepts(doc, chunk!, runner)).rejects.toThrow("stop");
    expect(issues[0]).toEqual([`concept "Lockout" cites ${ancestor}, which is not in the evidence list`]);
  });
});
