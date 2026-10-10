import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRegistry, engineIdentity, type EngineIdentity, type LibraryRegistry } from "@leaplearn/engine";
import type { ConceptMap } from "@leaplearn/shared";
import { FakeProvider, fakeResponse } from "../../../packages/generator/src/llm/fake-provider.js";
import { buildOutline, chunkScope, DEFAULT_PROMPT_CONFIG, ingestSource, MemoryStore, resolveScope, runImport, scopeTemplate, SCOPE_UNSUPPORTED_NOTE, type IngestedSource, type OutlineSection, type ResolvedScope } from "@leaplearn/generator";
import { FileStore } from "../src/file-store.js";
import { gateReport } from "../src/gate-report.js";
import { costReport, formatCostReport, writeReports } from "../src/report.js";
import { conceptResponses, passageEvidence, planOutFor, produceResponses, syntheticUnitText, unitOut, SYNTHETIC_CHUNK_TOKENS } from "../../../packages/generator/test/helpers/synthetic.js";
import { electricalDocx } from "../../../packages/generator/test/helpers/structured-sources.js";

const root = resolve(import.meta.dirname, "../../..");
const libraries = resolve(root, "libraries");
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };
const r = (v: unknown) => fakeResponse({ outputText: JSON.stringify(v) });
const flat = (s: OutlineSection[]): OutlineSection[] => s.flatMap((x) => [x, ...flat(x.children)]);
let registry: LibraryRegistry; let identity: EngineIdentity; let bytes: Buffer; let ingested: IngestedSource; let unitText: string;
beforeAll(async () => {
  registry = await createRegistry({ lockPath: resolve(libraries, "libraries.lock.json"), cacheDir: resolve(libraries, "cache") });
  identity = await engineIdentity(libraries);
  bytes = await electricalDocx();
  ingested = await ingestSource(bytes, "electrical.docx");
  unitText = await syntheticUnitText();
});
const entry = (title: string) => { const s = flat(buildOutline(ingested.document, ingested.analysis).sections).find((x) => x.title.startsWith(title))!; return { section: s.id, title: s.title }; };
const scopeFile = (): Record<string, unknown> => {
  const t = scopeTemplate(ingested, "electrical.docx") as Record<string, unknown> & { previewConfig: object };
  return { ...t, include: [entry("Working safely")], exclude: [entry("6."), entry("7.")], previewConfig: { ...t.previewConfig, chunkTokens: SYNTHETIC_CHUNK_TOKENS } };
};

/** A completed scoped import on disk, with its reports written as `leap generate` writes them, and PC1.2 left unsupported by its alignment. */
async function scopedImport(): Promise<{ dir: string; scope: ResolvedScope }> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-scope-reports-")), "imp");
  await mkdir(dir);
  const file = scopeFile();
  const scope = resolveScope(file, ingested);
  const doc = ingested.document;
  const evidence = passageEvidence(doc);
  const { mc, bl, fc } = produceResponses(doc, evidence);
  const script = [r(unitOut), ...conceptResponses(doc, evidence, SYNTHETIC_CHUNK_TOKENS, chunkScope(scope)).script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
  const store = new FileStore(dir);
  expect((await runImport({ importId: "imp", name: "electrical.docx", source: doc, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, original: { ext: ".docx", bytes }, scope: { file, bytes, ext: ".docx" } }, { store, provider: new FakeProvider(script), registry, engineIdentity: identity, concurrency: 1, rules: { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } }, sleep: async () => undefined })).status).toBe("ready");
  const map = (await store.getArtifact<ConceptMap>("imp", "conceptMap"))!;
  await store.putArtifact("imp", "conceptMap", { ...map, alignment: { ...(map.alignment ?? { criteria: [] }), unsupportedCriteriaIds: ["PC1.2"] } });
  await writeReports(store, "imp", dir);
  return { dir, scope };
}
/** Every heading and sentence of the source (the excluded sections' included): none may appear in a sanitised output. */
const contentStrings = (): string[] => [...new Set([...ingested.analysis.headings.map((h) => h.text), ...ingested.document.sentences.map((s) => s.text).filter((t) => t.length >= 12)])];

describe("scope in the import's reports and the gate report (generation scope design §2.9, Step 4)", { timeout: 60_000 }, () => {
  it("cost.json and the printed cost report state a scoped import's hash and counts, and explain its unsupported targets", async () => {
    const { dir, scope } = await scopedImport();
    const cost = JSON.parse(await readFile(join(dir, "cost.json"), "utf8")) as Record<string, unknown>;
    expect(cost["generationScope"]).toEqual({ scopeHash: scope.scopeHash, counts: { sentences: scope.counts.sentences, documentSentences: scope.counts.documentSentences, passages: scope.counts.passages, sourceCodePoints: scope.counts.sourceCodePoints, partialStructures: scope.partial.length }, unsupportedTargets: ["PC1.2"] });
    const text = formatCostReport(await costReport(new FileStore(dir), "imp"));
    expect(text.split("\n")[0]).toBe(`Generation scope ${scope.scopeHash.slice(0, 12)}: ${scope.counts.sentences} of ${scope.counts.documentSentences} sentences in ${scope.counts.passages} passage(s), ${scope.counts.sourceCodePoints} code points of source text, ${scope.partial.length} partial structure(s)`);
    expect(text).toContain(`Unit targets with no supporting concept: PC1.2 (${SCOPE_UNSUPPORTED_NOTE})`);
  });

  it("a whole-document import's cost.json is unchanged (no scope key) and its printed report says 'whole document'", async () => {
    const store = new MemoryStore();
    await store.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: "0".repeat(64), concepts: [], alignment: { criteria: [], unsupportedCriteriaIds: ["PC1.2"] } });
    const report = await costReport(store, "imp");
    expect(report).not.toHaveProperty("generationScope");
    const text = formatCostReport(report);
    expect(text.split("\n")[0]).toBe("Generation scope: whole document");
    expect(text).not.toContain(SCOPE_UNSUPPORTED_NOTE);
  });

  it("leap gate-report: the report and the summary carry the scope hash and counts, and no heading or source text", async () => {
    const { dir, scope } = await scopedImport();
    const summary = join(await mkdtemp(join(tmpdir(), "leap-scope-sum-")), "summary.json");
    const run = io();
    expect(await gateReport({ dirs: [dir], summary }, run.io)).toBe(0);
    const md = await readFile(join(dir, "gate-report.md"), "utf8");
    expect(md).toContain(`- Generation scope ${scope.scopeHash.slice(0, 12)}: ${scope.counts.sentences} of ${scope.counts.documentSentences} sentences`);
    expect(md).toContain(`- Unsupported targets: PC1.2 (${SCOPE_UNSUPPORTED_NOTE})`);
    const json = await readFile(summary, "utf8");
    expect(JSON.parse(json)).toMatchObject({ imports: [{ generationScope: { scopeHash: scope.scopeHash, counts: { sentences: scope.counts.sentences, passages: scope.counts.passages } } }] });
    for (const text of contentStrings()) { expect(json, text).not.toContain(text); expect(md, text).not.toContain(text); }
  });
});
