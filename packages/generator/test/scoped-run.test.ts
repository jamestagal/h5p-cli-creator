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
import { crashBefore, CrashError } from "./helpers/crashing-store.js";
import { regenerateActivity } from "../src/pipeline/regenerate.js";
import { RUBRIC_VERSION } from "@leaplearn/shared";

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
    expect(await store.getArtifact("imp", "generationScope")).toEqual({ payload: scope.payload, scopeHash: scope.scopeHash, previewConfig: scope.previewConfig, counts: scope.counts, partial: scope.partial }); // redundant-entry notes are spelling, kept with the entries
    expect(await store.getArtifact("imp", "generationScopeEntries")).toMatchObject({ history: [{ include: scope.entries.include, exclude: scope.entries.exclude, redundant: scope.redundant }] });
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
    expect(await store.getImport("whole")).not.toHaveProperty("generationScope");
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

describe("review of 686e41a: spelling, missing records, the evidence guard, regeneration", { timeout: 30_000 }, () => {
  const complete = async (importId: string): Promise<MemoryStore> => {
    const store = new MemoryStore();
    expect((await runImport(input(importId), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
    return store;
  };
  const drop = (store: MemoryStore, importId: string, name: string) => (store as unknown as { artifacts: Map<string, unknown> }).artifacts.delete(`${importId}/${name}`);
  type History = { history: Array<{ include: unknown[]; redundant?: string[] }> };

  it("adding an already-selected child keeps the hash and resumes: redundancy is spelling, kept with the entries, not in the integrity record", async () => {
    const store = new MemoryStore();
    await expect(runImport(input("redundant"), deps(store, new FakeProvider([r(unitOut), firstExtract(), new ProviderError("down", "permanent", 401)])))).rejects.toThrow();
    const withChild = scopeFile((f) => ({ ...f, include: [...(f["include"] as unknown[]), entry("2.")] }));
    expect(resolveScope(withChild, ingested).scopeHash).toBe(resolved().scopeHash);
    expect(resolveScope(withChild, ingested).redundant).toHaveLength(1);
    expect((await runImport(input("redundant", { scope: { file: withChild, bytes, ext: ".docx" } }), deps(store, new FakeProvider(scopedScript().slice(2))))).status).toBe("ready");
    expect(await store.getArtifact<Record<string, unknown>>("redundant", "generationScope")).not.toHaveProperty("redundant");
    const history = (await store.getArtifact<History>("redundant", "generationScopeEntries"))!.history;
    expect(history.map((h) => h.redundant)).toEqual([[], [`include ${entry("2.").section} (${entry("2.").title}) is already selected by other entries`]]);
  });

  it("a finished import records a new equivalent spelling, with no model call", async () => {
    const store = await complete("finished");
    const ranges = resolved().payload.passages.map((p) => ({ sentences: { from: p.sentenceIds[0]!, to: p.sentenceIds.at(-1)! } }));
    const provider = new FakeProvider([]);
    expect((await runImport(input("finished", { scope: { file: scopeFile((f) => ({ ...f, include: ranges, exclude: [] })), bytes, ext: ".docx" } }), deps(store, provider))).status).toBe("ready");
    expect(provider.requests).toHaveLength(0);
    expect((await store.getArtifact<History>("finished", "generationScopeEntries"))!.history.map((h) => h.include)).toEqual([scopeFile()["include"], ranges]);
  });

  it("a completed scoped import missing its stored source or scope record is refused, with no call and no change", async () => {
    for (const name of ["source", "generationScope"]) {
      const store = await complete(`missing-${name}`);
      drop(store, `missing-${name}`, name);
      const before = snapshot(store);
      const provider = new FakeProvider([]);
      await expect(runImport(input(`missing-${name}`), deps(store, provider)), name).rejects.toThrow(new RegExp(`stored ${name === "source" ? "source" : "generation scope"} is missing`));
      expect(provider.requests).toHaveLength(0);
      expect(snapshot(store)).toBe(before);
    }
  });

  it("an interruption before the source and scope were first stored still resumes", async () => {
    const store = new MemoryStore();
    const crashing = crashBefore(store, "putArtifact", 1, (args) => args[1] === "source");
    await expect(runImport(input("early"), deps(crashing, new FakeProvider([])))).rejects.toBeInstanceOf(CrashError);
    expect(await store.getImport("early")).not.toBeNull();
    expect(await store.getArtifact("early", "source")).toBeNull();
    expect((await runImport(input("early"), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
  });

  async function cachedChunkTampered(importId: string, tamper: (chunk: ChunkConcept[], outside: SourceDocument["sentences"][number]) => void) {
    const store = new MemoryStore();
    await expect(runImport(input(importId), deps(store, new FakeProvider([r(unitOut), firstExtract(), new ProviderError("down", "permanent", 401)])))).rejects.toThrow();
    const outside = ingested.document.sentences.find((s) => !selectedIds().has(s.sentenceId) && s.text.length > 40)!;
    const chunk = (await store.getArtifact<ChunkConcept[]>(importId, "chunk-0"))!;
    tamper(chunk, outside);
    await store.putArtifact(importId, "chunk-0", chunk);
    const provider = new FakeProvider(scopedScript().slice(2));
    await expect(runImport(input(importId), deps(store, provider))).rejects.toThrow(/outside the generation scope|does not match the source/);
    for (const q of provider.requests) expect(`${q.system}\n${q.user}`, q.purpose).not.toContain(outside.text);
    expect(provider.requests.filter((q) => q.purpose === "merge" || q.purpose === "align" || q.purpose === "plan")).toEqual([]);
    expect(await store.getArtifact(importId, "conceptMap")).toBeNull();
  }

  it("a cached chunk citing an excluded sentence is refused before merge, alignment or any later request", async () => {
    await cachedChunkTampered("guard-id", (chunk, outside) => { chunk[0]!.evidence.push({ evidenceId: `ev-${outside.sentenceId}`, sentenceId: outside.sentenceId, charStart: outside.charStart, charEnd: outside.charEnd, quote: outside.text }); });
  });

  it("a cached chunk whose in-scope citation carries excluded text is refused the same way", async () => {
    await cachedChunkTampered("guard-quote", (chunk, outside) => { chunk[0]!.evidence[0] = { ...chunk[0]!.evidence[0]!, quote: outside.text }; });
  });

  it("regeneration checks the stored concept map against the stored scope before producing", async () => {
    const store = await complete("regen");
    const target = (await store.listActivities("regen")).find((a) => a.type === "multiChoice")!;
    const rev = (await store.getRevision(target.activityId, target.currentRevision!))!;
    await store.putScore({ rowKey: "k1", batchId: "b1", sequence: 1, rowIndex: 0, sheetId: "s", importId: "regen", activityId: target.activityId, revision: rev.revision, buildId: rev.currentBuildId!, unitTextHash: null, rubricVersion: RUBRIC_VERSION, reviewer: "B", scores: { correctness: 1, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 3, decision: "needs-revision", decidedAt: "t" });
    const outside = ingested.document.sentences.find((s) => !selectedIds().has(s.sentenceId) && s.text.length > 40)!;
    const map = (await store.getArtifact<ConceptMap>("regen", "conceptMap"))!;
    map.concepts[0]!.evidence.push({ evidenceId: `ev-${outside.sentenceId}`, sentenceId: outside.sentenceId, charStart: outside.charStart, charEnd: outside.charEnd, quote: outside.text });
    await store.putArtifact("regen", "conceptMap", map);
    const provider = new FakeProvider([]);
    await expect(regenerateActivity({ importId: "regen", activityId: target.activityId, note: "Again." }, { store, provider, registry, engineIdentity: IDENTITY_A, sleep: async () => undefined })).rejects.toThrow(/outside the generation scope/);
    expect(provider.requests).toHaveLength(0);
    expect(await store.listRegenerations("regen")).toEqual([]);
  });
});

describe("review of cc7c52f: a scoped import keeps its identity when its scope record is removed", { timeout: 30_000 }, () => {
  const drop = (store: MemoryStore, importId: string, name: string) => (store as unknown as { artifacts: Map<string, unknown> }).artifacts.delete(`${importId}/${name}`);
  /** A completed scoped import, one activity scored needs-revision, its stored concept map citing an excluded sentence. */
  async function tamperedForRegeneration(importId: string): Promise<{ store: MemoryStore; activityId: string; revision: number; outside: SourceDocument["sentences"][number] }> {
    const store = new MemoryStore();
    expect((await runImport(input(importId), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
    const target = (await store.listActivities(importId)).find((a) => a.type === "multiChoice")!;
    const rev = (await store.getRevision(target.activityId, target.currentRevision!))!;
    await store.putScore({ rowKey: "k1", batchId: "b1", sequence: 1, rowIndex: 0, sheetId: "s", importId, activityId: target.activityId, revision: rev.revision, buildId: rev.currentBuildId!, unitTextHash: null, rubricVersion: RUBRIC_VERSION, reviewer: "B", scores: { correctness: 1, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 3, decision: "needs-revision", decidedAt: "t" });
    const outside = ingested.document.sentences.find((s) => !selectedIds().has(s.sentenceId) && s.text.length > 40)!;
    const map = (await store.getArtifact<ConceptMap>(importId, "conceptMap"))!;
    map.concepts[0]!.evidence.push({ evidenceId: `ev-${outside.sentenceId}`, sentenceId: outside.sentenceId, charStart: outside.charStart, charEnd: outside.charEnd, quote: outside.text });
    await store.putArtifact(importId, "conceptMap", map);
    return { store, activityId: target.activityId, revision: rev.revision, outside };
  }
  const regenDeps = (store: MemoryStore, provider: FakeProvider) => ({ store, provider, registry, engineIdentity: IDENTITY_A, sleep: async () => undefined });

  it("the import record carries the scope's hash, independently of the stored scope record", async () => {
    const store = new MemoryStore();
    expect((await runImport(input("marked"), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
    expect((await store.getImport("marked"))!.generationScope).toEqual({ scopeHash: resolved().scopeHash });
  });

  it("a new regeneration request is refused when the stored scope (and its entries) are removed: no call, no request used, nothing changed", async () => {
    for (const removed of [["generationScope"], ["generationScope", "generationScopeEntries"]]) {
      const id = `regen-new-${removed.length}`;
      const { store, activityId } = await tamperedForRegeneration(id);
      for (const name of removed) drop(store, id, name);
      const before = snapshot(store);
      const provider = new FakeProvider([r(produceResponses(ingested.document, passageEvidence(ingested.document)).mc)]);
      await expect(regenerateActivity({ importId: id, activityId, note: "Again." }, regenDeps(store, provider)), removed.join("+")).rejects.toThrow(/scoped import, but its stored generation scope is missing/);
      expect(provider.requests).toHaveLength(0);
      expect(await store.listRegenerations(id)).toEqual([]);
      expect(snapshot(store)).toBe(before);
    }
  });

  it("a resumed (running) regeneration request is refused the same way, before any write or call", async () => {
    const id = "regen-resumed";
    const { store, activityId, revision } = await tamperedForRegeneration(id);
    const record = (await store.getImport(id))!;
    await store.putRegeneration({ requestId: `${activityId}:regen:1`, importId: id, activityId, index: 1, baseRevision: revision, targetRevision: revision + 1, note: "Again.", budget: record.budget, status: "running", outcome: null, createdAt: "t", completedAt: null });
    drop(store, id, "generationScope");
    drop(store, id, "generationScopeEntries");
    const before = snapshot(store);
    const provider = new FakeProvider([r(produceResponses(ingested.document, passageEvidence(ingested.document)).mc)]);
    await expect(regenerateActivity({ importId: id, activityId }, regenDeps(store, provider))).rejects.toThrow(/scoped import, but its stored generation scope is missing/);
    expect(provider.requests).toHaveLength(0);
    expect((await store.listRegenerations(id)).map((q) => q.status)).toEqual(["running"]);
    expect(snapshot(store)).toBe(before);
  });

  it("a stored scope record whose hash is not the one the import record carries is refused, by regeneration and by a resume", async () => {
    const { store, activityId } = await tamperedForRegeneration("regen-marker");
    const record = (await store.getImport("regen-marker"))!;
    await store.putImport({ ...record, generationScope: { scopeHash: "0".repeat(64) } });
    const before = snapshot(store);
    const provider = new FakeProvider([]);
    await expect(regenerateActivity({ importId: "regen-marker", activityId, note: "Again." }, regenDeps(store, provider))).rejects.toThrow(/import record/);
    await expect(runImport(input("regen-marker"), deps(store, provider))).rejects.toBeInstanceOf(ScopeIntegrityError);
    expect(provider.requests).toHaveLength(0);
    expect(snapshot(store)).toBe(before);
  });

  it("a resume of a scoped import whose stored concept map cites excluded text is refused before any write", async () => {
    const { store } = await tamperedForRegeneration("resume-map");
    const before = snapshot(store);
    const provider = new FakeProvider([]);
    await expect(runImport(input("resume-map"), deps(store, provider))).rejects.toThrow(/outside the generation scope/);
    expect(provider.requests).toHaveLength(0);
    expect(snapshot(store)).toBe(before);
  });

  it("an unscoped run of a scoped import is refused even when its scope record was removed and the fingerprint rewritten to the unscoped one", async () => {
    const store = new MemoryStore();
    expect((await runImport(input("unscoped-of-scoped"), deps(store, new FakeProvider(scopedScript())))).status).toBe("ready");
    drop(store, "unscoped-of-scoped", "generationScope");
    drop(store, "unscoped-of-scoped", "generationScopeEntries");
    const unscoped = withoutScope(input("unscoped-of-scoped"));
    const fresh = new MemoryStore();
    await expect(runImport(unscoped, deps(fresh, new FakeProvider([new ProviderError("down", "permanent", 401)]), { chunkTokens: SYNTHETIC_CHUNK_TOKENS }))).rejects.toThrow();
    await store.putImport({ ...(await store.getImport("unscoped-of-scoped"))!, fingerprint: (await fresh.getImport("unscoped-of-scoped"))!.fingerprint });
    const before = snapshot(store);
    const provider = new FakeProvider([]);
    await expect(runImport(unscoped, deps(store, provider, { chunkTokens: SYNTHETIC_CHUNK_TOKENS }))).rejects.toBeInstanceOf(ScopeIntegrityError);
    expect(provider.requests).toHaveLength(0);
    expect(snapshot(store)).toBe(before);
  });
});
