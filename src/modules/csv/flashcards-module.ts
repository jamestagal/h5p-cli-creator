import * as fs from "fs";
import * as papa from "papaparse";
import * as path from "path";
import * as yargs from "yargs";

import { CSVToJSONAdapter } from "../../compiler/CSVToJSONAdapter";
import { HandlerRegistry } from "../../handlers/HandlerRegistry";
import { FlashcardsHandler } from "../../handlers/embedded/FlashcardsHandler";
import { LibraryRegistry } from "../../compiler/LibraryRegistry";
import { ContentBuilder } from "../../compiler/ContentBuilder";
import { PackageAssembler } from "../../compiler/PackageAssembler";
import { SemanticValidator } from "../../compiler/SemanticValidator";
import { HandlerContext } from "../../handlers/HandlerContext";

/**
 * This is the yargs module for flashcards.
 * Now uses CSVToJSONAdapter and handlers internally for consistency.
 */
export class FlashcardsModule implements yargs.CommandModule {
  public command = "flashcards <input> <output>";
  public describe =
    "Converts csv input to h5p flashcard content. The headings for the columns \
                     should be: question, answer, [tip], [image] (image is the URL of an image to include)";
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
      .option("t", {
        describe: "title of the content",
        default: "Flashcards",
        type: "string",
      })
      .option("description", {
        describe: "description of the content",
        default: "Write in the answers to the questions.",
        type: "string",
      })
      .option("verbose", {
        describe: "enable verbose logging",
        default: false,
        type: "boolean",
        alias: "v",
      });

  public handler = async (argv) => {
    await this.runFlashcards(
      argv.input,
      argv.output,
      argv.t,
      argv.e,
      argv.d,
      argv.l,
      argv.description,
      argv.verbose
    );
  };

  private async runFlashcards(
    csvfile: string,
    outputfile: string,
    title: string,
    encoding: BufferEncoding,
    delimiter: string,
    language: string,
    description: string,
    verbose: boolean = false
  ): Promise<void> {
    console.log("Creating flashcards content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    // Parse CSV
    const csv = fs.readFileSync(csvfile, encoding);
    const csvParsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    // Convert CSV to BookDefinition using adapter
    const bookDef = CSVToJSONAdapter.convertFlashcards(csvParsed.data as any, {
      title,
      language,
      description,
    });

    if (verbose) {
      console.log(`  Book: "${bookDef.title}" (${bookDef.language})`);
      console.log(`  Chapters: ${bookDef.chapters.length}`);
    }

    // Initialize handler registry and register flashcards handler
    const registry = HandlerRegistry.getInstance();
    if (!registry.getHandler("flashcards")) {
      registry.register(new FlashcardsHandler());
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
        quizGenerator: null as any, // Not needed for flashcards
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
    console.log(`Flashcards package created: ${outputfile}`);
  }
}
