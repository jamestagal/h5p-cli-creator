import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MemoryStore } from "../src/store/memory-store.js";
import { buildOutline, ingestSource, type IngestedSource, type OutlineSection } from "../src/ingest/index.js";
import { resolveScope, scopeRecord, scopeTemplate, type ResolvedScope } from "../src/scope/index.js";
import { formatGateReport, gateImport, gateSummary, snapshotImport } from "../src/report/gate.js";
import { scopeFigures, scopeLine, SCOPE_UNSUPPORTED_NOTE, storedScopeFigures } from "../src/report/scope.js";
import type { ImportRecord } from "../src/store/types.js";

const docx = resolve(import.meta.dirname, "fixtures/structure/structure.docx");
const flat = (s: OutlineSection[]): OutlineSection[] => s.flatMap((x) => [x, ...flat(x.children)]);
let ingested: IngestedSource;
let scope: ResolvedScope;
beforeAll(async () => {
  ingested = await ingestSource(await readFile(docx), "structure.docx");
  // one section and the first row of a table elsewhere: a partial structure, whose message names headings
  const planning = flat(buildOutline(ingested.document, ingested.analysis).sections).find((s) => s.title === "Planning the audit")!;
  const row = ingested.document.sentences.find((s) => s.text.startsWith("[Table 2, row 1]"))!.sentenceId;
  scope = resolveScope({ ...(scopeTemplate(ingested, "structure.docx") as Record<string, unknown>), include: [{ section: planning.id, title: planning.title }, { sentences: { from: row, to: row } }] }, ingested);
});

const record = (patch: Partial<ImportRecord> = {}): ImportRecord => ({ storeVersion: 2, importId: "imp", orgId: "local", name: "structure.docx", sourceType: "docx", status: "ready", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 5_000_000, requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t", ...patch });
/** A store holding a finished import: scoped (marker and stored record) unless `scoped` is false; its concept map leaves PC1.2 unsupported. */
async function store(scoped: boolean, edit: (s: MemoryStore) => Promise<void> = async () => undefined): Promise<MemoryStore> {
  const s = new MemoryStore();
  await s.putImport(record(scoped ? { generationScope: { scopeHash: scope.scopeHash } } : {}));
  await s.putArtifact("imp", "source", ingested.document);
  await s.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: ingested.document.textHash, concepts: [], alignment: { criteria: [], unsupportedCriteriaIds: ["PC1.2"] } });
  if (scoped) {
    await s.putArtifact("imp", "generationScope", scopeRecord(scope));
    await s.putArtifact("imp", "generationScopeEntries", { history: [{ include: [], exclude: [], redundant: [], firstUsedAt: "t" }] });
  }
  await edit(s);
  return s;
}
const drop = (s: MemoryStore, name: string) => (s as unknown as { artifacts: Map<string, unknown> }).artifacts.delete(`imp/${name}`);
const gate = async (s: MemoryStore) => gateImport(await snapshotImport(s, "imp"), "/dir");

/** Every heading of the source, every sentence's text, and every partial-structure message: none may appear in a sanitised output. */
function contentStrings(): string[] {
  const headings = ingested.analysis.headings.map((h) => h.text);
  const sentences = ingested.document.sentences.map((s) => s.text).filter((t) => t.length >= 12);
  return [...new Set([...headings, ...sentences, ...scope.partial.map((p) => p.message)])];
}

describe("scope figures for reports (generation scope design §2.9, Step 4)", () => {
  it("a scoped import's figures are its hash and counts, with partial structures counted, never described", async () => {
    expect(scope.partial).toHaveLength(1);
    const figures = await storedScopeFigures(await store(true), "imp");
    expect(figures).toEqual({ scopeHash: scope.scopeHash, counts: { sentences: scope.counts.sentences, documentSentences: scope.counts.documentSentences, passages: scope.counts.passages, sourceCodePoints: scope.counts.sourceCodePoints, partialStructures: 1 } });
    expect(scopeLine(figures)).toBe(`Generation scope ${scope.scopeHash.slice(0, 12)}: ${scope.counts.sentences} of ${scope.counts.documentSentences} sentences in ${scope.counts.passages} passage(s), ${scope.counts.sourceCodePoints} code points of source text, 1 partial structure(s)`);
  });

  it("a whole-document import has no figures, and its line says so", async () => {
    expect(await storedScopeFigures(await store(false), "imp")).toBeNull();
    expect(scopeLine(null)).toBe("Generation scope: whole document");
  });

  it("a scoped import whose stored record is missing, or is not the one its import record names, keeps its identity without counts", async () => {
    const missing = await storedScopeFigures(await store(true, async (s) => { drop(s, "generationScope"); }), "imp");
    expect(missing).toEqual({ scopeHash: scope.scopeHash, counts: null });
    expect(scopeLine(missing)).toBe(`Generation scope ${scope.scopeHash.slice(0, 12)}: the stored scope record is missing or altered; counts unavailable`);
    const other = "a".repeat(64);
    expect(scopeFigures(record({ generationScope: { scopeHash: other } }), scopeRecord(scope), true)).toEqual({ scopeHash: other, counts: null });
    // with only the entries history left, it is still scoped, with no hash to show
    const onlyEntries = await storedScopeFigures(await store(true, async (s) => { drop(s, "generationScope"); await s.putImport(record()); }), "imp");
    expect(onlyEntries).toEqual({ scopeHash: null, counts: null });
    expect(scopeLine(onlyEntries)).toBe("Generation scope (hash unknown): the stored scope record is missing or altered; counts unavailable");
  });
});

describe("the gate report and its summary state the scope by hash and counts only", () => {
  it("a scoped import: the report's scope line, the summary's figures, the unsupported-target note, and no heading or source text in either", async () => {
    const g = await gate(await store(true));
    const md = formatGateReport([g], []);
    expect(md).toContain(`- ${scopeLine({ scopeHash: scope.scopeHash, counts: { ...scope.counts, partialStructures: 1 } })}`);
    expect(md).toContain(`- Unsupported targets: PC1.2 (${SCOPE_UNSUPPORTED_NOTE})`);
    const summary = gateSummary([g], []) as { imports: Array<Record<string, unknown>> };
    expect(summary.imports[0]!["generationScope"]).toEqual({ scopeHash: scope.scopeHash, counts: { sentences: scope.counts.sentences, documentSentences: scope.counts.documentSentences, passages: scope.counts.passages, sourceCodePoints: scope.counts.sourceCodePoints, partialStructures: 1 } });
    const json = JSON.stringify(summary);
    for (const text of contentStrings()) { expect(json, text).not.toContain(text); expect(md, text).not.toContain(text); }
  });

  it("a whole-document import: 'whole document', a null summary entry, and the unsupported line as before", async () => {
    const g = await gate(await store(false));
    const md = formatGateReport([g], []);
    expect(md).toContain("- Generation scope: whole document");
    expect(md).toContain("- Unsupported targets: PC1.2\n");
    expect((gateSummary([g], []) as { imports: Array<Record<string, unknown>> }).imports[0]!["generationScope"]).toBeNull();
  });

  it("a scoped import whose stored record was removed is still reported as scoped, without counts", async () => {
    const g = await gate(await store(true, async (s) => { drop(s, "generationScope"); }));
    expect(formatGateReport([g], [])).toContain(`- Generation scope ${scope.scopeHash.slice(0, 12)}: the stored scope record is missing or altered; counts unavailable`);
    expect((gateSummary([g], []) as { imports: Array<Record<string, unknown>> }).imports[0]!["generationScope"]).toEqual({ scopeHash: scope.scopeHash, counts: null });
  });
});
