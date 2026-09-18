#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compileToFile, createRegistry } from "@leaplearn/engine";
import { csvToFlashcardsSpec } from "./csv-to-flashcards.js";
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
    .demandCommand(1)
    .strict()
    .fail(reportFailure)
    .exitProcess(false)
    .parse();
} catch (err) {
  reportFailure(undefined, err instanceof Error ? err : new Error(String(err)));
}
