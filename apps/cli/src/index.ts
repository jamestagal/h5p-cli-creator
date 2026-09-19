#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compileToFile, createRegistry } from "@leaplearn/engine";
import { csvToFlashcardsSpec } from "./csv-to-flashcards.js";
import { generate } from "./generate.js";
import { localImageResolver, networkImageResolver } from "./image-resolver.js";

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
      .option("source", { type: "string", demandOption: true, describe: ".pdf, .md or .txt" })
      .option("out", { type: "string", demandOption: true, describe: "output directory (the import store; rerun to resume)" })
      .option("unit", { type: "string", describe: "unit of competency text file" })
      .option("types", { type: "string", default: "multiChoice,blanks,flashcards" })
      .option("budget-usd", { type: "number", default: 2, describe: "estimated spend cap in USD (reservations are estimates; the report shows reservation underestimates and any spend over the cap)" })
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
      .option("concurrency", { type: "number", default: 3, describe: "activity types generated at once (each type is one serial lane)" }),
      async (argv) => {
        const code = await generate({ source: argv.source, out: argv.out, ...(argv.unit ? { unit: argv.unit } : {}), types: argv.types, budgetUsd: argv["budget-usd"], maxRequests: argv["max-requests"], maxTokens: argv["max-tokens"], maxSeconds: argv["max-seconds"], language: argv.language, readingLevel: argv["reading-level"], tone: argv.tone, ...(argv.customisation ? { customisation: argv.customisation } : {}), ...(argv.name ? { name: argv.name } : {}), libraries: argv.libraries, provider: argv.provider, ...(argv.fixtures ? { fixtures: argv.fixtures } : {}), concurrency: argv.concurrency }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
    .demandCommand(1)
    .strict()
    .fail(reportFailure)
    .exitProcess(false)
    .parse();
} catch (err) {
  reportFailure(undefined, err instanceof Error ? err : new Error(String(err)));
}
