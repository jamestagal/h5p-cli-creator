import { beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { MemoryStore } from "../src/store/memory-store.js";
import { buildOutline, ingestSource, type IngestedSource, type OutlineSection, type SourceDocument } from "../src/ingest/index.js";
import { runImport, type RunImportDeps, type RunImportInput } from "../src/pipeline/run-import.js";
import { IncompatibleResumeError } from "../src/pipeline/fingerprint.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import type { ModelRequest, ModelResponse } from "../src/llm/types.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { PlanRules } from "../src/plan/planner.js";
import type { ConceptMap } from "@leaplearn/shared";
import { chunkScope, resolveScope, scopeTemplate, ScopeIntegrityError, ScopeRefusedError, type ResolvedScope } from "../src/scope/index.js";
import type { ChunkConcept } from "../src/concepts/index.js";
import { conceptResponses, passageEvidence, planOutFor, produceResponses, syntheticUnitText, unitOut, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { electricalDocx } from "./helpers/structured-sources.js";
import { IDENTITY_A } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
let bytes: Buffer;
let ingested: IngestedSource;
let unitText: string;
beforeAll(async () => {
  unitText = await syntheticUnitText();
  registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
  bytes = await electricalDocx();
  ingested = await ingestSource(bytes, "electrical.docx");
});
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const flat = (s: OutlineSection[]): OutlineSection[] => s.flatMap((x) => [x, ...flat(x.children)]);
const entry = (title: string) => { const s = flat(buildOutline(ingested.document, ingested.analysis).sections).find((x) => x.title.startsWith(title))!; return { section: s.id, title: s.title }; };
/** The scope used throughout: the whole document except sections 6 (PPE) and 7 (RTO instructions). */
const scopeFile = (edit: (f: Record<string, unknown>) => Record<string, unknown> = (f) => f): Record<string, unknown> => {
  const t = scopeTemplate(ingested, "electrical.docx") as Record<string, unknown> & { previewConfig: object };
  return edit({ ...t, include: [entry("Working safely")], exclude: [entry("6."), entry("7.")], previewConfig: { ...t.previewConfig, chunkTokens: SYNTHETIC_CHUNK_TOKENS } });
};
const resolved = (file = scopeFile()): ResolvedScope => resolveScope(file, ingested);
const input = (importId: string, overrides: Partial<RunImportInput> = {}): RunImportInput => ({
  importId, name: "electrical.docx", source: ingested.document, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 },
  promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, original: { ext: ".docx", bytes },
  scope: { file: scopeFile(), bytes, ext: ".docx" }, ...overrides
});
const deps = (store: RunImportDeps["store"], provider: RunImportDeps["provider"], overrides: Partial<RunImportDeps> = {}): RunImportDeps => ({ store, provider, registry, engineIdentity: IDENTITY_A, concurrency: 1, rules, sleep: async () => undefined, ...overrides });

/** The full script for the scoped run: parseUnit, extraction over the scope's own chunks, then merge, align, plan and produce. */
function scopedScript(): Array<ModelResponse | Error> {
  const doc = ingested.document;
  const evidence = passageEvidence(doc);
  const { script } = conceptResponses(doc, evidence, SYNTHETIC_CHUNK_TOKENS, chunkScope(resolved()));
  const { mc, bl, fc } = produceResponses(doc, evidence);
  return [r(unitOut), ...script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
}
/** The first extraction response of the scoped run (after parseUnit). */
const firstExtract = (): ModelResponse => conceptResponses(ingested.document, passageEvidence(ingested.document), SYNTHETIC_CHUNK_TOKENS, chunkScope(resolved())).script[0]!;
const withoutScope = (run: RunImportInput): RunImportInput => { const copy = { ...run }; delete copy.scope; return copy; };
/** Every record of a MemoryStore, for before/after comparison. */
const snapshot = (store: MemoryStore): string => JSON.stringify(store, (_k, v: unknown) => (v instanceof Map ? [...v.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))) : v));
const selectedIds = (): Set<string> => new Set(resolved().sentences.map((s) => s.sentenceId));
const unselectedBodyTexts = (doc: SourceDocument): string[] => {
  const chosen = selectedIds();
  const headings = new Set(ingested.analysis.headings.map((h) => h.text));
  const selectedText = doc.sentences.filter((s) => chosen.has(s.sentenceId)).map((s) => s.text).join("\n");
  return doc.sentences.filter((s) => !chosen.has(s.sentenceId) && !headings.has(s.text) && !selectedText.includes(s.text)).map((s) => s.text);
};

describe("a scoped run: only the selection reaches any model, the full source is kept", { timeout: 30_000 }, () => {
  it("runs end to end on the scope's chunks, stores the scope before the first call, and every request and citation stays inside it", async () => {
    const store = new MemoryStore();
    const provider = new FakeProvider(scopedScript());
    let atFirstCall: unknown = "never called";
    const watching = { name: "fake" as const, requests: provider.requests, complete: async (q: ModelRequest) => { if (atFirstCall === "never called") atFirstCall = await store.getArtifact("imp", "generationScope"); return provider.complete(q); } };
    const record = await runImport(input("imp"), deps(store, watching));
    expect(record.status).toBe("ready");

    const scope = resolved();
    expect(atFirstCall).toMatchObject({ scopeHash: scope.scopeHash, payload: scope.payload, previewConfig: scope.previewConfig });
    // no text unique to an unselected sentence in any request of any purpose
    const sent = provider.requests.map((q) => `${q.system}\n${q.user}`).join("\n");
    const absent = unselectedBodyTexts(ingested.document);
    expect(absent.length).toBeGreaterThan(5);
    for (const text of absent) expect(sent, text).not.toContain(text);
    expect(provider.requests.filter((q) => q.purpose === "extract")).toHaveLength(chunkScope(scope).length);
    // every citation is inside the scope; the stored source is the full document
    const map = (await store.getArtifact<ConceptMap>("imp", "conceptMap"))!;
    for (const c of map.concepts) for (const e of c.evidence) expect(selectedIds().has(e.sentenceId), e.sentenceId).toBe(true);
    expect(await store.getArtifact("imp", "source")).toEqual(ingested.document);
    expect(await store.getArtifact("imp", "generationScope")).toEqual({ payload: scope.payload, scopeHash: scope.scopeHash, previewConfig: scope.previewConfig, counts: scope.counts, partial: scope.partial, redundant: scope.redundant });
    expect(await store.getArtifact("imp", "generationScopeEntries")).toMatchObject({ history: [{ include: scope.entries.include, exclude: scope.entries.exclude }] });
  });

  it("an ancestor heading outside the scope appears only as labelled heading context, never as evidence", async () => {
    const store = new MemoryStore();
    const sub = scopeFile((f) => ({ ...f, include: [entry("2."), entry("3."), entry("4.")], exclude: [] }));
    const scope = resolveScope(sub, ingested);
    const ancestor = ingested.analysis.headings.find((h) => h.level === 1)!.text;
    const ancestorId = ingested.document.sentences.find((s) => s.text === ancestor)!.sentenceId;
    expect(scope.sentences.some((s) => s.sentenceId === ancestorId)).toBe(false);
    const extracts = conceptResponses(ingested.document, passageEvidence(ingested.document), SYNTHETIC_CHUNK_TOKENS, chunkScope(scope)).script.slice(0, chunkScope(scope).length);
    const provider = new FakeProvider([...extracts, new ProviderError("stop after extraction", "permanent", 401)]);
    await expect(runImport(input("anc", { unitText: null, scope: { file: sub, bytes, ext: ".docx" } }), deps(store, provider))).rejects.toThrow();
    for (const q of provider.requests.filter((x) => x.purpose === "extract")) {
      const lines = q.user.split("\n");
      const contextStart = lines.findIndex((l) => l.startsWith("HEADING CONTEXT"));
      const evidenceStart = lines.indexOf("EVIDENCE:");
      lines.forEach((l, i) => { if (l.includes(ancestor)) { expect(i > contextStart && i < evidenceStart && l.startsWith("- "), l).toBe(true); } });
      expect(q.user).not.toContain(`[${ancestorId}] `);
    }
  });

  it("a whole-document run stores no scope records", async () => {
    const store = new MemoryStore();
    const doc = ingested.document;
    const evidence = passageEvidence(doc);
    const { mc, bl, fc } = produceResponses(doc, evidence);
    const script = [r(unitOut), ...conceptResponses(doc, evidence).script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
    const unscoped = withoutScope(input("whole"));
    expect((await runImport(unscoped, deps(store, new FakeProvider(script), { chunkTokens: SYNTHETIC_CHUNK_TOKENS }))).status).toBe("ready");
    expect(await store.getArtifact("whole", "generationScope")).toBeNull();
    expect(await store.getArtifact("whole", "generationScopeEntries")).toBeNull();
  });
});

describe("refusals before any model call or write (direct API)", { timeout: 30_000 }, () => {
  async function refusedOn(store: MemoryStore, run: RunImportInput, depsOverrides: Partial<RunImportDeps> = {}): Promise<unknown> {
    const before = snapshot(store);
    const provider = new FakeProvider([]);
    let error: unknown = null;
    try { await runImport(run, deps(store, provider, depsOverrides)); } catch (e) { error = e; }
    expect(provider.requests).toHaveLength(0);
    expect(snapshot(store)).toBe(before);
    return error;
  }
  const withFile = (edit: (f: Record<string, unknown>) => Record<string, unknown>): RunImportInput => input("ref", { scope: { file: scopeFile(edit), bytes, ext: ".docx" } });
  const changedDoc = (edit: (d: SourceDocument) => void): SourceDocument => { const d = structuredClone(ingested.document); edit(d); return d; };

  it("refuses a malformed, rebound, mistitled or too-small scope", async () => {
    const store = new MemoryStore();
    const problems = async (run: RunImportInput) => { const e = await refusedOn(store, run); expect(e).toBeInstanceOf(ScopeRefusedError); return (e as ScopeRefusedError).problems.join(" "); };
    expect(await problems(withFile((f) => ({ ...f, extra: true })))).toMatch(/extra|nrecognized/i);
    expect(await problems(withFile((f) => ({ ...f, source: { ...(f["source"] as object), textHash: "c".repeat(64) } })))).toMatch(/textHash.*re-run leap outline/);
    expect(await problems(withFile((f) => ({ ...f, include: [{ ...entry("2."), title: "Wrong" }] })))).toContain('not "Wrong"');
    const one = ingested.document.sentences.find((s) => s.text.startsWith("Lockout and tagout is"))!.sentenceId;
    expect(await problems(withFile((f) => ({ ...f, include: [{ sentences: { from: one, to: one } }], exclude: [] })))).toMatch(/below the minimum of 500/);
  });

  it("requires complete agreement between the given document and the one re-read from the bytes, naming the first difference", async () => {
    const store = new MemoryStore();
    const cases: Array<[(d: SourceDocument) => void, string]> = [
      [(d) => { d.sentences[5]!.charStart += 1; }, "sentences[5].charStart"],
      [(d) => { d.sentences[7]!.headingPath = ["Elsewhere"]; }, "sentences[7].headingPath"],
      [(d) => { const s = d.sentences.find((x) => x.listDepth !== null)!; s.listDepth = 3; }, "listDepth"],
      [(d) => { d.sentences[3]!.text = `${d.sentences[3]!.text} `; }, "sentences[3].text"],
      [(d) => { d.metadata.codePoints += 1; }, "metadata.codePoints"] // sourceId and fileName are the caller's: re-ingestion uses them, so they always agree
    ];
    for (const [edit, field] of cases) {
      const e = await refusedOn(store, input("ref", { source: changedDoc(edit) }));
      expect(e, field).toBeInstanceOf(ScopeRefusedError);
      expect((e as ScopeRefusedError).problems.join(" ")).toContain(field);
    }
  });

  it("refuses scope bytes that are not the original, or an extension that does not match the source", async () => {
    const store = new MemoryStore();
    const other = await electricalDocx({ "word/extra.xml": "<x/>" }); // the same text, different bytes
    const differs = await refusedOn(store, input("ref", { scope: { file: scopeFile(), bytes: other, ext: ".docx" } }));
    expect((differs as ScopeRefusedError).problems.join(" ")).toMatch(/scope's bytes .* are not the original/);
    const ext = await refusedOn(store, input("ref", { scope: { file: scopeFile(), bytes, ext: ".odt" } }));
    expect((ext as ScopeRefusedError).problems.join(" ")).toMatch(/\.odt.*docx/);
  });

  it("refuses an explicit chunk size that disagrees with previewConfig, naming both; an equal one is accepted", async () => {
    const store = new MemoryStore();
    const e = await refusedOn(store, input("ref"), { chunkTokens: 400 });
    expect((e as ScopeRefusedError).problems).toEqual([`the run's chunk size 400 disagrees with the scope's previewConfig.chunkTokens ${SYNTHETIC_CHUNK_TOKENS}; previews and requests must use the same configuration`]);
    const ok = new MemoryStore();
    expect((await runImport(input("ok"), deps(ok, new FakeProvider(scopedScript()), { chunkTokens: SYNTHETIC_CHUNK_TOKENS }))).status).toBe("ready");
  });

  it("an existing import is left unchanged by every refusal", async () => {
    const store = new MemoryStore();
    expect((await runImport(input("done"), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
    expect(await refusedOn(store, { ...input("done"), scope: { file: scopeFile((f) => ({ ...f, include: [{ ...entry("2."), title: "Wrong" }] })), bytes, ext: ".docx" } })).toBeInstanceOf(ScopeRefusedError);
    expect(await refusedOn(store, input("done", { source: changedDoc((d) => { d.sentences[2]!.charEnd -= 1; }) }))).toBeInstanceOf(ScopeRefusedError);
    expect(await refusedOn(store, input("done", { scope: { file: scopeFile((f) => ({ ...f, exclude: [entry("6.")] })), bytes, ext: ".docx" } }))).toBeInstanceOf(IncompatibleResumeError);
    const unscoped = withoutScope(input("done"));
    expect(await refusedOn(store, unscoped, { chunkTokens: SYNTHETIC_CHUNK_TOKENS })).toBeInstanceOf(IncompatibleResumeError);
  });
});

describe("resume integrity: stored scope records are recomputed and compared, never trusted", { timeout: 30_000 }, () => {
  async function interrupted(importId: string): Promise<MemoryStore> {
    const store = new MemoryStore();
    await expect(runImport(input(importId), deps(store, new FakeProvider([r(unitOut), firstExtract(), new ProviderError("down", "permanent", 401)])))).rejects.toThrow();
    return store;
  }
  const tamper = async (store: MemoryStore, importId: string, edit: (record: Record<string, unknown>) => void) => {
    const record = structuredClone(await store.getArtifact<Record<string, unknown>>(importId, "generationScope"))!;
    edit(record);
    await store.putArtifact(importId, "generationScope", record);
  };

  it("a stored scope edited in any field (its declared hash left alone) is refused as altered, with no call and no change", async () => {
    const edits: Array<[string, (x: Record<string, unknown>) => void]> = [
      ["a count", (x) => { (x["counts"] as Record<string, number>)["sourceCodePoints"]! += 1; }],
      ["a partial finding", (x) => { x["partial"] = [{ kind: "paragraph", message: "invented", selected: [1], total: 2, units: "sentences" }]; }],
      ["previewConfig", (x) => { (x["previewConfig"] as Record<string, number>)["chunkTokens"] = 999; }],
      ["a passage", (x) => { ((x["payload"] as { passages: Array<{ sentenceIds: string[] }> }).passages[0]!.sentenceIds).pop(); }]
    ];
    for (const [what, edit] of edits) {
      const store = await interrupted("tamper");
      await tamper(store, "tamper", edit);
      const before = snapshot(store);
      const provider = new FakeProvider([]);
      await expect(runImport(input("tamper"), deps(store, provider)), what).rejects.toBeInstanceOf(ScopeIntegrityError);
      expect(provider.requests).toHaveLength(0);
      expect(snapshot(store)).toBe(before);
    }
  });

  it("a stored source edited on disk is refused as altered", async () => {
    const store = await interrupted("src");
    const source = structuredClone(await store.getArtifact<SourceDocument>("src", "source"))!;
    source.sentences[4]!.text = "Altered.";
    await store.putArtifact("src", "source", source);
    const before = snapshot(store);
    await expect(runImport(input("src"), deps(store, new FakeProvider([])))).rejects.toThrow(/stored source differs from the source re-read from its bytes/);
    expect(snapshot(store)).toBe(before);
  });

  it("an equivalent, differently spelt scope resumes, and its entries are appended to the history", async () => {
    const store = await interrupted("spell");
    const ids = resolved().sentences.map((s) => s.sentenceId);
    const ranges = resolved().payload.passages.map((p) => ({ sentences: { from: p.sentenceIds[0]!, to: p.sentenceIds.at(-1)! } }));
    const respelt = scopeFile((f) => ({ ...f, include: ranges, exclude: [] }));
    expect(resolveScope(respelt, ingested).scopeHash).toBe(resolved().scopeHash);
    const rest = scopedScript().slice(2); // the unit and chunk 0 were done before the interruption
    expect((await runImport(input("spell", { scope: { file: respelt, bytes, ext: ".docx" } }), deps(store, new FakeProvider(rest)))).status).toBe("ready");
    const history = (await store.getArtifact<{ history: Array<{ include: unknown[] }> }>("spell", "generationScopeEntries"))!.history;
    expect(history.map((h) => h.include)).toEqual([scopeFile()["include"], ranges]);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("the evidence guard", { timeout: 30_000 }, () => {
  it("a stored chunk whose concepts cite a sentence outside the scope stops the run before the concept map is stored", async () => {
    const store = new MemoryStore();
    await expect(runImport(input("guard"), deps(store, new FakeProvider([r(unitOut), firstExtract(), new ProviderError("down", "permanent", 401)])))).rejects.toThrow();
    const outside = ingested.document.sentences.find((s) => !selectedIds().has(s.sentenceId) && s.text.length > 20)!;
    const chunk = (await store.getArtifact<ChunkConcept[]>("guard", "chunk-0"))!;
    chunk[0]!.evidence.push({ evidenceId: `ev-${outside.sentenceId}`, sentenceId: outside.sentenceId, charStart: outside.charStart, charEnd: outside.charEnd, quote: outside.text });
    await store.putArtifact("guard", "chunk-0", chunk);
    await expect(runImport(input("guard"), deps(store, new FakeProvider(scopedScript().slice(2))))).rejects.toThrow(`evidence ${outside.sentenceId} is outside the generation scope`);
    expect(await store.getArtifact("guard", "conceptMap")).toBeNull();
  });
});
