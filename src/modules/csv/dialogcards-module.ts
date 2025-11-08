import * as fs from "fs";
import * as papa from "papaparse";
import * as yargs from "yargs";
import * as path from "path";

import { CSVToJSONAdapter } from "../../compiler/CSVToJSONAdapter";
import { HandlerRegistry } from "../../handlers/HandlerRegistry";
import { DialogCardsHandler } from "../../handlers/embedded/DialogCardsHandler";
import { LibraryRegistry } from "../../compiler/LibraryRegistry";
import { ContentBuilder } from "../../compiler/ContentBuilder";
import { PackageAssembler } from "../../compiler/PackageAssembler";
import { SemanticValidator } from "../../compiler/SemanticValidator";
import { HandlerContext } from "../../handlers/HandlerContext";

/**
 * This is the yargs module for dialogcards.
 * Now uses CSVToJSONAdapter and handlers internally for consistency.
 */
export class DialogCardsModule implements yargs.CommandModule {
  public command = "dialogcards <input> <output>";
  public describe =
    "Converts csv input to h5p dialog cards content. The headings for the columns \
                     should be: front, back, [image] (image is the URL of an image to include)";
  public builder = (y: yargs.Argv) =>
    y
      .positional("input", { describe: "csv input file" })
      .positional("output", {
        describe: "h5p output file including .h5p extension",
      })
      .option("l", {
        describe: "language for translations in h5p content",
        default: "en",
        type: "string",
      })
      .option("d", { describe: "CSV delimiter", default: ";", type: "string" })
      .option("e", { describe: "encoding", default: "UTF-8", type: "string" })
      .option("n", {
        describe: "name/title of the content",
        default: "Flashcards",
        type: "string",
      })
      .option("m", {
        describe: "mode of the content",
        default: "repetition",
        type: "string",
        choices: ["repetition", "normal"],
      })
      .option("verbose", {
        describe: "enable verbose logging",
        default: false,
        type: "boolean",
        alias: "v",
      });

  public handler = async (argv) => {
    await this.runDialogcards(
      argv.input,
      argv.output,
      argv.n,
      argv.e,
      argv.d,
      argv.l,
      argv.m,
      argv.verbose
    );
  };

  private async runDialogcards(
    csvfile: string,
    outputfile: string,
    title: string,
    encoding: BufferEncoding,
    delimiter: string,
    language: string,
    mode: "repetition" | "normal",
    verbose: boolean = false
  ): Promise<void> {
    console.log("Creating dialog cards content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    // Parse CSV
    const csv = fs.readFileSync(csvfile, { encoding });
    const csvParsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    // Convert CSV to BookDefinition using adapter
    const bookDef = CSVToJSONAdapter.convertDialogCards(csvParsed.data as any, {
      title,
      language,
      mode,
    });

    if (verbose) {
      console.log(`  Book: "${bookDef.title}" (${bookDef.language})`);
      console.log(`  Chapters: ${bookDef.chapters.length}`);
    }

    // Initialize handler registry and register dialog cards handler
    const registry = HandlerRegistry.getInstance();
    if (!registry.getHandler("dialogcards")) {
      registry.register(new DialogCardsHandler());
    }

    // Initialize library registry
    const libraryRegistry = new LibraryRegistry();

    // Fetch required libraries
    if (verbose) {
      console.log("  Fetching required libraries...");
    }
    const requiredLibs = registry.getRequiredLibrariesForBook(bookDef);
    const dependencies: any[] = [];
    for (const lib of requiredLibs) {
      const libraryData = await libraryRegistry.fetchLibrary(lib);
      if (libraryData) {
        dependencies.push(libraryData);
        const deps = await libraryRegistry.resolveDependencies(libraryData);
        dependencies.push(...deps);
      }
    }

    // Build content with handlers
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(libraryRegistry, validator);
    builder.createBook(bookDef.title, bookDef.language);

    if (verbose) {
      console.log("  Building content with handlers...");
    }

    for (const chapter of bookDef.chapters) {
      if (verbose) {
        console.log(`  - Processing chapter: "${chapter.title}"`);
      }

      const chapterBuilder = builder.addChapter(chapter.title);

      // Create handler context
      const context: HandlerContext = {
        chapterBuilder,
        libraryRegistry,
        quizGenerator: null as any, // Not needed for dialog cards
        logger: {
          log: verbose ? console.log : () => {},
          warn: console.warn,
          error: console.error,
        },
        mediaFiles: builder.getMediaFiles(),
        basePath: path.dirname(path.resolve(csvfile)),
        options: { verbose },
      };

      // Process each content item with appropriate handler
      for (const item of chapter.content) {
        const handler = registry.getHandler(item.type);

        if (!handler) {
          console.warn(`    - Unknown content type: ${item.type}`);
          continue;
        }

        // Validate before processing
        const validation = handler.validate(item);
        if (!validation.valid) {
          console.error(`    - Validation failed: ${validation.error}`);
          continue;
        }

        // Process with handler
        await handler.process(context, item);
      }
    }

    // Assemble package
    if (verbose) {
      console.log("  Assembling package...");
    }

    const assembler = new PackageAssembler();
    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();
    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      builder.getTitle(),
      builder.getLanguage(),
      libraryRegistry
    );

    // Save package
    await assembler.savePackage(packageZip, outputfile);
    console.log(`Dialog cards package created: ${outputfile}`);
  }
}
