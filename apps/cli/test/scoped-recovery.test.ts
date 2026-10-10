import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRegistry, engineIdentity, type EngineIdentity, type LibraryRegistry } from "@leaplearn/engine";
import { FakeProvider, fakeResponse } from "../../../packages/generator/src/llm/fake-provider.js";
import { buildOutline, chunkScope, DEFAULT_PROMPT_CONFIG, IncompatibleResumeError, ingestSource, resolveScope, runImport, scopeTemplate, ScopeIntegrityError, type IngestedSource, type OutlineSection, type RunImportInput } from "@leaplearn/generator";
import { FileStore, REPORTS_PENDING } from "../src/file-store.js";
import { generate } from "../src/generate.js";
import { reviewImport } from "../src/review-import.js";
import { reviewSheet } from "../src/review-sheet.js";
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
const scopeFile = (exclude: string[]): Record<string, unknown> => {
  const t = scopeTemplate(ingested, "electrical.docx") as Record<string, unknown> & { previewConfig: object };
  return { ...t, include: [entry("Working safely")], exclude: exclude.map(entry), previewConfig: { ...t.previewConfig, chunkTokens: SYNTHETIC_CHUNK_TOKENS } };
};
const input = (file: Record<string, unknown>): RunImportInput => ({ importId: "imp", name: "electrical.docx", source: ingested.document, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, original: { ext: ".docx", bytes }, scope: { file, bytes, ext: ".docx" } });
const deps = (dir: string, provider: FakeProvider) => ({ store: new FileStore(dir), provider, registry, engineIdentity: identity, concurrency: 1, rules: { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } }, sleep: async () => undefined });

/** Every file of the directory except the lock (which a command removes when it releases it). */
async function files(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== "lock") await walk(p); } else out[p] = (await readFile(p)).toString("base64"); } };
  await walk(dir);
  return out;
}

/**
 * A completed scoped import on disk with one scored review batch committed but not applied (its ledger records were
 * lost in a crash) and the pending-reports marker present: the state lock recovery repairs.
 */
async function pendingRecovery(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-scoped-recovery-")), "imp");
  await mkdir(dir);
  const file = scopeFile(["6.", "7."]);
  const doc = ingested.document;
  const evidence = passageEvidence(doc);
  const { mc, bl, fc } = produceResponses(doc, evidence);
  const script = [r(unitOut), ...conceptResponses(doc, evidence, SYNTHETIC_CHUNK_TOKENS, chunkScope(resolveScope(file, ingested))).script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
  expect((await runImport(input(file), deps(dir, new FakeProvider(script)))).status).toBe("ready");
  expect(await reviewSheet({ out: dir }, io().io)).toBe(0);
  const sheets = join(dir, "reviews", "sheets");
  const sheetId = (await readdir(sheets)).find((n) => n.endsWith(".json"))!.replace(/\.json$/, "");
  const scores = join(sheets, sheetId, "scores.csv");
  const [header, first] = (await readFile(scores, "utf8")).trimEnd().split("\n");
  await writeFile(scores, `${header}\n${first!.split(",").slice(0, 4).join(",")},2,2,2,2,2,4,\n`);
  expect(await reviewImport({ out: dir, scores, reviewer: "Benjamin" }, io().io)).toBe(0);
  for (const ledger of ["scores.jsonl", "acceptances.jsonl"]) await writeFile(join(dir, ledger), ""); // the crash
  await writeFile(join(dir, REPORTS_PENDING), `${JSON.stringify({ reason: "test" })}\n`);
  return dir;
}

describe("refused scoped resumes leave the directory as it was, recovery included (review of 686e41a)", { timeout: 60_000 }, () => {
  it("an incompatible scope (direct API and leap generate) and an altered stored scope are refused without lock recovery writing anything", async () => {
    const dir = await pendingRecovery();
    const before = await files(dir);
    expect(Object.keys(before)).toContain(join(dir, REPORTS_PENDING));
    const provider = new FakeProvider([]);
    await expect(runImport(input(scopeFile(["6."])), deps(dir, provider))).rejects.toBeInstanceOf(IncompatibleResumeError);
    expect(await files(dir)).toEqual(before);

    const other = join(dir, "..", "other-scope.json");
    await writeFile(other, JSON.stringify(scopeFile(["6."])));
    const source = join(dir, "..", "electrical.docx");
    await writeFile(source, bytes);
    await mkdir(join(dir, "..", "fixtures"), { recursive: true });
    const run = io();
    expect(await generate({ source, out: dir, scope: other, types: "multiChoice,blanks,flashcards", maxRequests: 50, maxTokens: 500_000, maxSeconds: 600, language: "en", readingLevel: DEFAULT_PROMPT_CONFIG.readingLevel, tone: DEFAULT_PROMPT_CONFIG.tone, libraries, provider: "replay", fixtures: join(dir, "..", "fixtures"), concurrency: 1 }, run.io)).toBe(1);
    expect(run.err.join("")).toContain("generation scope");
    expect(await files(dir)).toEqual(before);

    const stored = join(dir, "artifacts", "generationScope.json");
    const record = JSON.parse(await readFile(stored, "utf8")) as { counts: { sentences: number } };
    record.counts.sentences += 1;
    await writeFile(stored, JSON.stringify(record));
    const altered = await files(dir);
    await expect(runImport(input(scopeFile(["6.", "7."])), deps(dir, provider))).rejects.toBeInstanceOf(ScopeIntegrityError);
    expect(await files(dir)).toEqual(altered);
    expect(provider.requests).toHaveLength(0);
  });

  it("a valid scoped resume still recovers: the committed batch is applied, the reports are rewritten and the marker removed", async () => {
    const dir = await pendingRecovery();
    const provider = new FakeProvider([]);
    expect((await runImport(input(scopeFile(["6.", "7."])), deps(dir, provider))).status).toBe("ready");
    expect(provider.requests).toHaveLength(0);
    expect(await new FileStore(dir).listScores("imp")).toHaveLength(1);
    expect(await readdir(dir)).not.toContain(REPORTS_PENDING);
    expect(await readFile(join(dir, "mapping.csv"), "utf8")).toMatch(/,reviewed,/);
  });
});
