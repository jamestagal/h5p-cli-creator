import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { ANTHROPIC_TIMEOUT_MS, createAnthropicProvider, IncompatibleResumeError, ingestMarkdown, ingestPdf, ingestText, ReplayProvider, RecordingProvider, runImport, READING_LEVEL_IDS, StoreLockedError, TONE_IDS, type ImportRecord, type ModelProvider, type PlannedType, type ReadingLevel, type Tone } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { formatCostReport, writeReports } from "./report.js";

export interface GenerateArgs {
  source: string; out: string; unit?: string; types: string; budgetUsd: number; maxRequests: number; maxTokens: number; maxSeconds: number;
  language: string; readingLevel: string; tone: string; customisation?: string; name?: string; libraries: string;
  provider: "anthropic" | "replay" | "record"; fixtures?: string; concurrency: number;
}

export function importIdFor(outDir: string): string {
  return basename(resolve(outDir)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
}

export async function engineFingerprint(librariesDir: string): Promise<string> {
  const lock = await readFile(resolve(librariesDir, "libraries.lock.json"));
  const enginePkg = JSON.parse(await readFile(new URL("../../../packages/engine/package.json", import.meta.url), "utf8")) as { version: string };
  return `engine@${enginePkg.version}+lock:${createHash("sha256").update(lock).digest("hex").slice(0, 12)}`;
}

function providerFor(args: GenerateArgs): ModelProvider {
  if (args.provider === "replay") { if (!args.fixtures) throw new Error("--fixtures is required with --provider replay"); return new ReplayProvider(resolve(args.fixtures)); }

  const live = createAnthropicProvider();
  if (args.provider === "record") { if (!args.fixtures) throw new Error("--fixtures is required with --provider record"); return new RecordingProvider(live, resolve(args.fixtures)); }

  return live;
}

export async function generate(args: GenerateArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const types = args.types.split(",").map((t) => t.trim()).filter(Boolean) as PlannedType[];
  for (const t of types) if (!["multiChoice", "blanks", "flashcards"].includes(t)) throw new Error(`unsupported type ${t}; phase 2 supports multiChoice, blanks, flashcards`);
  if (new Set(types).size !== types.length) throw new Error(`--types lists a type more than once (${args.types}); name each type once`);

  if (!(READING_LEVEL_IDS as readonly string[]).includes(args.readingLevel)) throw new Error(`unknown reading level ${args.readingLevel}`);

  if (!(TONE_IDS as readonly string[]).includes(args.tone)) throw new Error(`unknown tone ${args.tone}`);

  const sourcePath = resolve(args.source);
  const sourceId = `src-${basename(sourcePath)}`;
  const ext = extname(sourcePath).toLowerCase();
  const source = ext === ".pdf" ? await ingestPdf(await readFile(sourcePath), { sourceId, fileName: basename(sourcePath) })
    : ext === ".md" ? await ingestMarkdown(await readFile(sourcePath, "utf8"), { sourceId, fileName: basename(sourcePath) })
    : await ingestText(await readFile(sourcePath, "utf8"), { sourceId, fileName: basename(sourcePath) });
  const unitText = args.unit ? await readFile(resolve(args.unit), "utf8") : null;
  const registry = await createRegistry({ lockPath: resolve(args.libraries, "libraries.lock.json"), cacheDir: resolve(args.libraries, "cache") });
  const outDir = resolve(args.out);
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const promptConfig = { readingLevel: args.readingLevel as ReadingLevel, tone: args.tone as Tone, language: args.language, ...(args.customisation ? { customisation: args.customisation } : {}) };
  const budget = { usdMicro: Math.round(args.budgetUsd * 1_000_000), requests: args.maxRequests, tokens: args.maxTokens, elapsedMs: Math.round(args.maxSeconds * 1000) };
  const fingerprint = await engineFingerprint(args.libraries);
  let record: ImportRecord;
  try {
    record = await runImport(
      { importId, name: args.name ?? basename(sourcePath), source, unitText, selectedTypes: types, budget, promptConfig, language: args.language, customisation: args.customisation ?? null },
      { store, provider: providerFor(args), registry, engineFingerprint: fingerprint, concurrency: args.concurrency, maxAttemptMs: ANTHROPIC_TIMEOUT_MS, onProgress: (e) => io.err(`${e.kind === "status" ? `status: ${e.status}` : e.kind === "activity" ? `${e.activityId}: ${e.status}${e.error ? ` (${e.error})` : ""}` : `${e.purpose}: ${e.status}${e.costUsdMicro === null ? "" : ` ($${(e.costUsdMicro / 1_000_000).toFixed(4)})`}`}\n`) }
    );
  } catch (err) {
    if (err instanceof IncompatibleResumeError || err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; }

    throw err;
  }
  const activities = await store.listActivities(importId);
  io.out(`import ${importId}: ${record.status}${record.error ? ` — ${record.error}` : ""}\n`);
  for (const a of activities) io.out(`  ${a.activityId}  ${a.type.padEnd(12)}  ${a.status}${a.currentRevision ? `  builds/${a.activityId}-r${a.currentRevision}.h5p` : ""}${a.error ? `  ${a.error}` : ""}\n`);
  const { rows, report } = await writeReports(store, importId, outDir);
  io.out(`mapping: ${rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
  io.out(formatCostReport(report) + "\n");
  return record.status === "ready" ? 0 : record.status === "ready_with_failures" ? 2 : 1;
}
