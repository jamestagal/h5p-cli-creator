#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compileToFile, createRegistry } from "@leaplearn/engine";
import { csvToFlashcardsSpec } from "./csv-to-flashcards.js";
import { DEFAULT_CHUNK_TOKENS, extract } from "./extract.js";
import { generate } from "./generate.js";
import { localImageResolver, networkImageResolver } from "./image-resolver.js";
import { review } from "./review.js";
import { reviewSheet } from "./review-sheet.js";
import { reviewImport } from "./review-import.js";
import { regenerate } from "./regenerate.js";

let reported = false;
function reportFailure(msg: string | null | undefined, err: Error | undefined): void {
  if (reported) return;

  reported = true;
  const message = err instanceof Error ? err.message : (msg ?? "unknown error");
  process.stderr.write(`leap: ${message}\n`);
  process.exitCode = 1;
}

try {
  await yargs(hideBin(process.argv))
    .scriptName("leap")
    .command("flashcards <input> <output>", "Build an H5P.Flashcards package from a CSV (columns: question, answer, tip, image)", (y) => y
      .positional("input", { type: "string", demandOption: true })
      .positional("output", { type: "string", demandOption: true })
      .option("title", { type: "string", default: "Flashcards" })
      .option("language", { type: "string", default: "en" })
      .option("allow-network", { type: "boolean", default: false, describe: "fetch http(s) image URLs referenced in the CSV" })
      .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries"), describe: "directory containing libraries.lock.json and cache/" }),
      async (argv) => {
        const csv = await readFile(argv.input, "utf8");
        const resolveImage = argv["allow-network"] ? networkImageResolver : localImageResolver;
        const { spec, assets } = await csvToFlashcardsSpec(csv, { id: basename(argv.input, ".csv"), title: argv.title, language: argv.language, baseDir: dirname(resolve(argv.input)), resolveImage });
        const registry = await createRegistry({ lockPath: resolve(argv.libraries, "libraries.lock.json"), cacheDir: resolve(argv.libraries, "cache") });
        const result = await compileToFile(spec, assets, argv.output, { registry });
        process.stdout.write(`wrote ${argv.output} (${result.entries.length} entries, ${result.libraries.length} libraries)\n`);
      })
    .command("generate", "Generate multiChoice, blanks and flashcards activities from a source (and optional unit of competency), compile them, and report cost", (y) => y
      .option("source", { type: "string", demandOption: true, describe: ".txt, .md, .pdf, .docx or .odt" })
      .option("out", { type: "string", demandOption: true, describe: "output directory (the import store; rerun to resume)" })
      .option("unit", { type: "string", describe: "unit of competency text file" })
      .option("types", { type: "string", default: "multiChoice,blanks,flashcards" })
      .option("budget-usd", { type: "number", describe: "estimated spend cap in USD for this import (reservations are estimates; the report shows reservation underestimates and any spend over the cap). Default: the run's ledger cap for a paid run, else $2" })
      .option("max-requests", { type: "number", default: 200, describe: "hard limit on model requests" })
      .option("max-tokens", { type: "number", default: 2_000_000, describe: "estimated cap on reserved input + output tokens" })
      .option("max-seconds", { type: "number", default: 1800, describe: "hard limit on elapsed time for this import, counted across runs" })
      .option("language", { type: "string", default: "en" })
      .option("reading-level", { type: "string", default: "high-school" })
      .option("tone", { type: "string", default: "educational" })
      .option("customisation", { type: "string" })
      .option("name", { type: "string" })
      .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries") })
      .option("provider", { choices: ["anthropic", "replay", "record"] as const, default: "anthropic" as const })
      .option("fixtures", { type: "string", describe: "fixture directory for --provider replay|record" })
      .option("concurrency", { type: "number", default: 3, describe: "activity types generated at once (each type is one serial lane)" })
      .option("ledger", { type: "string", describe: "pilot ledger (JSON) authorising paid runs; required with --provider anthropic or record" })
      .option("run", { type: "string", describe: "the run's id in the ledger; required with --provider anthropic or record" }),
      async (argv) => {
        const code = await generate({ source: argv.source, out: argv.out, ...(argv.unit ? { unit: argv.unit } : {}), types: argv.types, ...(argv["budget-usd"] !== undefined ? { budgetUsd: argv["budget-usd"] } : {}), ...(argv.ledger ? { ledger: argv.ledger } : {}), ...(argv.run ? { run: argv.run } : {}), maxRequests: argv["max-requests"], maxTokens: argv["max-tokens"], maxSeconds: argv["max-seconds"], language: argv.language, readingLevel: argv["reading-level"], tone: argv.tone, ...(argv.customisation ? { customisation: argv.customisation } : {}), ...(argv.name ? { name: argv.name } : {}), libraries: argv.libraries, provider: argv.provider, ...(argv.fixtures ? { fixtures: argv.fixtures } : {}), concurrency: argv.concurrency }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
    .command("extract", "Ingest a source exactly as generate would and write extracted.txt, tables.md, extract.json and warnings.md for review; no model call, API key or ledger", (y) => y
      .option("source", { type: "string", demandOption: true, describe: ".txt, .md, .pdf, .docx or .odt" })
      .option("out", { type: "string", demandOption: true, describe: "output directory: outside the repository, or under docs/uoc/ (real material stays out of git)" })
      .option("chunk-tokens", { type: "number", default: DEFAULT_CHUNK_TOKENS, describe: "chunk budget used to size table rows and extraction requests" }),
      async (argv) => {
        process.exitCode = await extract({ source: argv.source, out: argv.out, chunkTokens: argv["chunk-tokens"] }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
      })
    .command("review", "Record an alignment decision against a promoted activity and refresh mapping.csv and cost.json (acceptance comes from leap review-sheet and leap review-import)", (y) => y
      .option("out", { type: "string", demandOption: true, describe: "the import directory" })
      .option("activity", { type: "string", demandOption: true })
      .option("reviewer", { type: "string", demandOption: true })
      .option("decision", { choices: ["accepted", "rejected"] as const })
      .option("notes", { type: "string" })
      .option("criterion", { type: "string" })
      .option("alignment", { choices: ["confirmed", "rejected", "added"] as const })
      .option("item", { type: "string" }),
      async (argv) => {
        const code = await review({ out: argv.out, activity: argv.activity, reviewer: argv.reviewer, ...(argv.decision ? { decision: argv.decision } : {}), ...(argv.notes ? { notes: argv.notes } : {}), ...(argv.criterion ? { criterion: argv.criterion } : {}), ...(argv.alignment ? { alignment: argv.alignment } : {}), ...(argv.item ? { item: argv.item } : {}) }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
    .command("review-sheet", "Export a review sheet (review-sheet.md, scores.csv, findings.csv) for every promoted activity whose current build has no scored review; its manifest is kept under reviews/sheets/", (y) => y
      .option("out", { type: "string", demandOption: true, describe: "the import directory" }),
      async (argv) => {
        process.exitCode = await reviewSheet({ out: argv.out }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
      })
    .command("review-import", "Import a filled-in review sheet: checks every row and finding first, then commits the new scores as one batch with their derived decisions", (y) => y
      .option("out", { type: "string", demandOption: true, describe: "the import directory" })
      .option("scores", { type: "string", demandOption: true, describe: "the filled-in scores.csv" })
      .option("findings", { type: "string", describe: "the filled-in findings.csv (default: findings.csv beside the scores file)" })
      .option("reviewer", { type: "string", demandOption: true, describe: "the person who scored the sheet" }),
      async (argv) => {
        process.exitCode = await reviewImport({ out: argv.out, scores: argv.scores, ...(argv.findings ? { findings: argv.findings } : {}), reviewer: argv.reviewer }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
      })
    .command("regenerate", "Produce a new revision of a reviewed needs-revision or rejected activity, with the reviewer's note; at most two requests per activity, and an interrupted request is finished first", (y) => y
      .option("out", { type: "string", demandOption: true, describe: "the import directory" })
      .option("activity", { type: "string", demandOption: true })
      .option("note", { type: "string", describe: "what the reviewer wants changed; required for a new request, optional when finishing an interrupted one" })
      .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries") })
      .option("provider", { choices: ["anthropic", "replay", "record"] as const, default: "anthropic" as const })
      .option("fixtures", { type: "string", describe: "fixture directory for --provider replay|record" })
      .option("budget-usd", { type: "number", describe: "estimated spend cap for this request (at most the run's ledger cap); the import's own budget applies otherwise" })
      .option("ledger", { type: "string", describe: "pilot ledger (JSON) authorising paid runs; required with --provider anthropic or record" })
      .option("run", { type: "string", describe: "the run's id in the ledger; required with --provider anthropic or record" }),
      async (argv) => {
        process.exitCode = await regenerate({ out: argv.out, activity: argv.activity, libraries: argv.libraries, provider: argv.provider, ...(argv.note !== undefined ? { note: argv.note } : {}), ...(argv.fixtures ? { fixtures: argv.fixtures } : {}), ...(argv["budget-usd"] !== undefined ? { budgetUsd: argv["budget-usd"] } : {}), ...(argv.ledger ? { ledger: argv.ledger } : {}), ...(argv.run ? { run: argv.run } : {}) }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
      })
    .demandCommand(1)
    .strict()
    .fail(reportFailure)
    .exitProcess(false)
    .parse();
} catch (err) {
  reportFailure(undefined, err instanceof Error ? err : new Error(String(err)));
}
