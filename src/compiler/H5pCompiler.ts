import { HandlerRegistry } from "../handlers/HandlerRegistry";
import { LibraryRegistry } from "./LibraryRegistry";
import { QuizGenerator } from "../ai/QuizGenerator";
import { AIPromptBuilder } from "../ai/AIPromptBuilder";
import { SemanticValidator } from "./SemanticValidator";
import { ContentBuilder } from "./ContentBuilder";
import { PackageAssembler } from "./PackageAssembler";
import { LibraryValidator } from "./LibraryValidator";
import { HandlerContext } from "../handlers/HandlerContext";
import { BookDefinition, AnyContentItem } from "./YamlInputParser";
import { AIConfiguration } from "./types";
import * as JSZip from "jszip";

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
  private aiPromptBuilder: AIPromptBuilder;

  constructor(
    private handlerRegistry: HandlerRegistry,
    private libraryRegistry: LibraryRegistry,
    private quizGenerator: QuizGenerator
  ) {
    this.aiPromptBuilder = new AIPromptBuilder();
  }

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

    // Step 1: Validate required libraries (detect version/case mismatches)
    const requiredLibraries = this.handlerRegistry.getRequiredLibrariesForBook(bookDef);

    if (verbose) {
      const validator = new LibraryValidator();
      const validationResults = await validator.validateLibraries(requiredLibraries, verbose);
      const summary = validator.getSummary(validationResults);

      if (summary.hasIssues) {
        console.log(`\n⚠ Warning: Found ${summary.caseMismatch + summary.versionMismatch} library issue(s)`);
        console.log(`  - Case mismatches will be handled automatically`);
        console.log(`  - Version mismatches may cause runtime errors\n`);
      }
    }

    // Step 2: Fetch required libraries
    if (verbose) console.log("Fetching required libraries...");

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
    if (verbose) {
      console.log(`  - Created book: "${bookDef.title}"`);

      // Log book-level AI configuration if present (Task 5.5.5)
      if (bookDef.aiConfig) {
        const targetAudience = bookDef.aiConfig.targetAudience || "grade-6";
        const tone = bookDef.aiConfig.tone || "educational";
        console.log(`  - Book-level AI config: ${targetAudience}, ${tone}`);
        if (bookDef.aiConfig.customization) {
          console.log(`    Customization: "${bookDef.aiConfig.customization.substring(0, 60)}${bookDef.aiConfig.customization.length > 60 ? "..." : ""}"`);
        }
      }
    }

    // Process each chapter
    for (let i = 0; i < bookDef.chapters.length; i++) {
      const chapter = bookDef.chapters[i];
      if (verbose) {
        console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

        // Log chapter-level AI configuration if present (Task 5.5.5)
        if (chapter.aiConfig) {
          const targetAudience = chapter.aiConfig.targetAudience || "grade-6";
          const tone = chapter.aiConfig.tone || "educational";
          console.log(`    Chapter-level AI config override: ${targetAudience}, ${tone}`);
        }
      }

      const chapterBuilder = builder.addChapter(chapter.title);

      // Create handler context with book and chapter AI configs (Task 5.5.5, 5.5.6)
      const context = this.createContext(
        chapterBuilder,
        builder,
        basePath,
        options,
        bookDef.aiConfig,  // Pass book-level AI config
        chapter.aiConfig   // Pass chapter-level AI config
      );

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

    // Generate Buffer from ZIP - Filter out directory entries (H5P.com doesn't allow them)
    const cleanZip = new JSZip();

    // Copy only files (not directories) to clean zip
    const files = Object.keys(packageZip.files);
    for (const fileName of files) {
      const file = packageZip.files[fileName];

      // Skip directory entries (H5P.com validation rejects empty directories)
      if (file.dir) {
        continue;
      }

      // Copy file content WITHOUT creating folder entries
      const content = await file.async("nodebuffer");
      cleanZip.file(fileName, content, { createFolders: false });
    }

    return await cleanZip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });
  }

  /**
   * Creates a HandlerContext for handler execution.
   *
   * Passes book-level and chapter-level AI configuration through context
   * to allow handlers to resolve configuration hierarchy.
   *
   * @param chapterBuilder ChapterBuilder for adding content
   * @param builder ContentBuilder for media file tracking
   * @param basePath Base path for resolving file paths
   * @param options Compiler options
   * @param bookConfig Book-level AI configuration (optional) - Task 5.5.6
   * @param chapterConfig Chapter-level AI configuration (optional) - Task 5.5.6
   * @returns HandlerContext with all dependencies and configuration
   * @private
   */
  private createContext(
    chapterBuilder: any,
    builder: ContentBuilder,
    basePath: string,
    options: CompilerOptions,
    bookConfig?: AIConfiguration,      // Task 5.5.6: Add bookConfig parameter
    chapterConfig?: AIConfiguration    // Task 5.5.6: Add chapterConfig parameter
  ): HandlerContext {
    return {
      chapterBuilder,
      libraryRegistry: this.libraryRegistry,
      quizGenerator: this.quizGenerator,
      aiPromptBuilder: this.aiPromptBuilder,
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
      },
      bookConfig,      // Task 5.5.6: Include bookConfig in context
      chapterConfig    // Task 5.5.6: Include chapterConfig in context
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
