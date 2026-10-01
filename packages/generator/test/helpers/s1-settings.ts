import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { ingestPdf } from "../../src/ingest/index.js";
import { DEFAULT_CHUNK_TOKENS } from "../../src/pipeline/fingerprint.js";
import type { RunImportDeps, RunImportInput } from "../../src/pipeline/run-import.js";
import { DEFAULT_PLAN_RULES } from "../../src/plan/planner.js";
import { DEFAULT_PROMPT_CONFIG } from "../../src/prompts/system.js";

const repoRoot = resolve(import.meta.dirname, "../../../..");

/**
 * The settings run S1 records under (plan Task 10, R12), and that every S1 replay consumer must use: the recorded
 * request keys only match when each of these is the same. `leap generate` supplies the same values for the S1 command
 * (its defaults, `--concurrency 1`, and an out directory whose name gives import ID `s1`). Paths are repo-relative.
 */
export const S1_SETTINGS = Object.freeze({
  importId: "s1",
  sourcePath: "packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf",
  unitPath: "packages/generator/test/fixtures/synthetic/unit-synele001.txt",
  sourceKind: "pdf",
  selectedTypes: ["multiChoice", "blanks", "flashcards"],
  language: "en",
  promptConfig: DEFAULT_PROMPT_CONFIG,
  customisation: null,
  chunkTokens: DEFAULT_CHUNK_TOKENS,
  rules: DEFAULT_PLAN_RULES,
  concurrency: 1
});
export type S1Settings = typeof S1_SETTINGS;

/** The runImport input for S1: the PDF through current ingestion, with the source ID `leap generate` gives it. */
export async function s1Input(budgetUsdMicro: number): Promise<RunImportInput> {
  const sourcePath = resolve(repoRoot, S1_SETTINGS.sourcePath);
  const source = await ingestPdf(await readFile(sourcePath), { sourceId: `src-${basename(sourcePath)}`, fileName: basename(sourcePath) });
  return {
    importId: S1_SETTINGS.importId, name: basename(sourcePath), source, unitText: await readFile(resolve(repoRoot, S1_SETTINGS.unitPath), "utf8"),
    selectedTypes: [...S1_SETTINGS.selectedTypes] as RunImportInput["selectedTypes"], budget: { usdMicro: budgetUsdMicro },
    promptConfig: S1_SETTINGS.promptConfig, language: S1_SETTINGS.language, customisation: S1_SETTINGS.customisation
  };
}

/** The deps that decide request content and order for S1; the caller adds store, provider, registry and engine identity. */
export const S1_DEPS = Object.freeze({ chunkTokens: S1_SETTINGS.chunkTokens, rules: S1_SETTINGS.rules, concurrency: S1_SETTINGS.concurrency }) satisfies Partial<RunImportDeps>;

/**
 * What a consumer actually passed to runImport, in S1_SETTINGS's shape, so a test can compare it field by field. A path
 * reads as the S1 path only when the content passed is what current ingestion makes of that file (or the file's text,
 * for the unit). Unset deps read as runImport's defaults.
 */
export async function settingsOf(input: RunImportInput, deps: RunImportDeps): Promise<Record<keyof S1Settings, unknown>> {
  const expected = await s1Input(1);
  const sameSource = input.source.textHash === expected.source.textHash && input.source.sourceId === expected.source.sourceId && input.source.metadata.extractionVersion === expected.source.metadata.extractionVersion;
  return {
    importId: input.importId,
    sourcePath: sameSource ? S1_SETTINGS.sourcePath : `(another source: ${input.source.sourceId})`,
    unitPath: input.unitText === expected.unitText ? S1_SETTINGS.unitPath : "(another unit text)",
    sourceKind: input.source.kind,
    selectedTypes: input.selectedTypes,
    language: input.language,
    promptConfig: input.promptConfig,
    customisation: input.customisation,
    chunkTokens: deps.chunkTokens ?? DEFAULT_CHUNK_TOKENS,
    rules: deps.rules ?? DEFAULT_PLAN_RULES,
    concurrency: deps.concurrency
  };
}
