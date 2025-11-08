import { HandlerRegistry } from "../handlers/HandlerRegistry";
import { LibraryRegistry } from "./LibraryRegistry";
import { QuizGenerator } from "../ai/QuizGenerator";
import { SemanticValidator } from "./SemanticValidator";
import { ContentBuilder } from "./ContentBuilder";
import { PackageAssembler } from "./PackageAssembler";
import { HandlerContext } from "../handlers/HandlerContext";
import { BookDefinition, AnyContentItem } from "./YamlInputParser";

/**
 * Compiler options for H5P package generation
 */
export interface CompilerOptions {
  /**
   * Enable verbose logging output
   */
  verbose?: boolean;

  /**
   * AI provider selection (gemini, claude, or auto)
   */
  aiProvider?: "gemini" | "claude" | "auto";

  /**
   * Base path for resolving relative file paths
   */
  basePath?: string;
}

/**
 * H5pCompiler is a reusable class that compiles BookDefinition JSON
 * into .h5p package Buffers. It can be used by both CLI and API endpoints.
 *
 * The compiler orchestrates:
 * 1. Library fetching and dependency resolution
 * 2. Content building using registered handlers
 * 3. Package assembly into .h5p ZIP format
 *
 * Example usage:
 * ```typescript
 * const compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);
 * const h5pBuffer = await compiler.compile(bookDefinition, { verbose: true });
 * ```
 */
export class H5pCompiler {
  constructor(
    private handlerRegistry: HandlerRegistry,
    private libraryRegistry: LibraryRegistry,
    private quizGenerator: QuizGenerator
  ) {}

  /**
   * Compiles a BookDefinition into an .h5p package Buffer.
   *
   * @param bookDef Book definition with chapters and content
   * @param options Compiler options (verbose, aiProvider, basePath)
   * @returns Promise resolving to .h5p package as Buffer
   * @throws Error if content validation fails or handler is not found
   */
  public async compile(
    bookDef: BookDefinition,
    options: CompilerOptions = {}
  ): Promise<Buffer> {
    const { verbose = false, basePath = process.cwd() } = options;

    // Step 1: Fetch required libraries
    if (verbose) console.log("Fetching required libraries...");
    const requiredLibraries = this.handlerRegistry.getRequiredLibrariesForBook(bookDef);

    if (verbose) {
      console.log(`  - Required libraries: ${requiredLibraries.join(", ")}`);
    }

    // Fetch all required libraries
    for (const lib of requiredLibraries) {
      await this.libraryRegistry.fetchLibrary(lib);
    }

    // Resolve all dependencies
    const allDeps = new Map<string, any>();
    for (const lib of requiredLibraries) {
      const deps = await this.libraryRegistry.resolveDependencies(lib);
      deps.forEach(dep => {
        const key = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`;
        allDeps.set(key, dep);
      });
    }
    const dependencies = Array.from(allDeps.values());

    if (verbose) {
      console.log(`  - Total libraries with dependencies: ${dependencies.length}`);
    }

    // Step 2: Build content with handlers
    if (verbose) console.log("Building content...");
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(this.libraryRegistry, validator);

    builder.createBook(bookDef.title, bookDef.language);
    if (verbose) console.log(`  - Created book: "${bookDef.title}"`);

    // Process each chapter
    for (let i = 0; i < bookDef.chapters.length; i++) {
      const chapter = bookDef.chapters[i];
      if (verbose) console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

      const chapterBuilder = builder.addChapter(chapter.title);

      // Create handler context
      const context = this.createContext(chapterBuilder, builder, basePath, options);

      // Process each content item
      for (const item of chapter.content) {
        await this.processItem(item, context, verbose);
      }
    }

    // Step 3: Assemble package
    if (verbose) console.log("Assembling package...");
    const assembler = new PackageAssembler();
    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();

    if (verbose) {
      console.log(`  - Content chapters: ${content.chapters.length}`);
      console.log(`  - Media files: ${mediaFiles.length}`);
    }

    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      builder.getTitle(),
      builder.getLanguage(),
      this.libraryRegistry
    );

    if (verbose) console.log("  - Package assembled successfully");

    // Generate Buffer from ZIP
    return await packageZip.generateAsync({ type: "nodebuffer" });
  }

  /**
   * Creates a HandlerContext for handler execution
   * @private
   */
  private createContext(
    chapterBuilder: any,
    builder: ContentBuilder,
    basePath: string,
    options: CompilerOptions
  ): HandlerContext {
    return {
      chapterBuilder,
      libraryRegistry: this.libraryRegistry,
      quizGenerator: this.quizGenerator,
      logger: {
        log: console.log,
        warn: console.warn,
        error: console.error
      },
      mediaFiles: builder.getMediaFiles(),
      basePath,
      options: {
        verbose: options.verbose,
        aiProvider: options.aiProvider
      }
    };
  }

  /**
   * Processes a single content item using the appropriate handler
   * @private
   */
  private async processItem(
    item: AnyContentItem,
    context: HandlerContext,
    verbose: boolean
  ): Promise<void> {
    const handler = this.handlerRegistry.getHandler(item.type);

    if (!handler) {
      throw new Error(`No handler registered for content type: ${item.type}`);
    }

    // Validate before processing
    const validation = handler.validate(item);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    // Process with handler
    await handler.process(context, item);
  }
}
