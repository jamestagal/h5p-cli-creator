import { HandlerRegistry } from "../handlers/HandlerRegistry";
import { LibraryRegistry } from "./LibraryRegistry";
import { QuizGenerator } from "../ai/QuizGenerator";
import { AIPromptBuilder } from "../ai/AIPromptBuilder";
import { SemanticValidator } from "./SemanticValidator";
import { ContentBuilder } from "./ContentBuilder";
import { PackageAssembler } from "./PackageAssembler";
import { LibraryValidator } from "./LibraryValidator";
import { HandlerContext } from "../handlers/HandlerContext";
import { BookDefinition, AnyContentItem, H5PDefinition, isStandaloneDefinition, StandaloneDefinition, ContentType } from "./YamlInputParser";
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
 * H5pCompiler is a reusable class that compiles H5P content definitions
 * into .h5p package Buffers. It can be used by both CLI and API endpoints.
 *
 * Supports two formats:
 * - Interactive Book (BookDefinition) - Content organized in chapters
 * - Standalone Content (StandaloneDefinition) - Single content item
 *
 * The compiler orchestrates:
 * 1. Library fetching and dependency resolution
 * 2. Content building using registered handlers
 * 3. Package assembly into .h5p ZIP format
 *
 * Example usage:
 * ```typescript
 * const compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);
 * const h5pBuffer = await compiler.compile(definition, { verbose: true });
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
   * Compiles an H5P content definition into an .h5p package Buffer.
   * Automatically detects format and routes to appropriate compilation method.
   *
   * @param definition H5P content definition (BookDefinition or StandaloneDefinition)
   * @param options Compiler options (verbose, aiProvider, basePath)
   * @returns Promise resolving to .h5p package as Buffer
   * @throws Error if content validation fails or handler is not found
   */
  public async compile(
    definition: H5PDefinition,
    options: CompilerOptions = {}
  ): Promise<Buffer> {
    // Route to appropriate compilation method based on format
    if (isStandaloneDefinition(definition)) {
      return this.compileStandalone(definition, options);
    }
    return this.compileBook(definition, options);
  }

  /**
   * Compiles a BookDefinition (Interactive Book) into an .h5p package Buffer.
   *
   * @param bookDef Book definition with chapters and content
   * @param options Compiler options (verbose, aiProvider, basePath)
   * @returns Promise resolving to .h5p package as Buffer
   * @throws Error if content validation fails or handler is not found
   */
  private async compileBook(
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
   * Compiles a StandaloneDefinition into an .h5p package Buffer.
   * Generates a standalone H5P package with a single content item (not Interactive Book).
   *
   * @param standaloneDef Standalone content definition
   * @param options Compiler options (verbose, aiProvider, basePath)
   * @returns Promise resolving to .h5p package as Buffer
   * @throws Error if content validation fails or handler is not found
   */
  private async compileStandalone(
    standaloneDef: StandaloneDefinition,
    options: CompilerOptions = {}
  ): Promise<Buffer> {
    const { verbose = false, basePath = process.cwd() } = options;

    // Step 1: Get required library for this content type
    const contentType = standaloneDef.content.type;
    const mainLibrary = this.getMainLibraryForContentType(contentType);
    const requiredLibraries = [mainLibrary];

    if (verbose) {
      console.log(`Generating standalone ${contentType} package...`);
      console.log(`  - Main library: ${mainLibrary}`);
    }

    // Step 2: Fetch library and dependencies
    if (verbose) console.log("Fetching required libraries...");

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

    // Step 3: Build content with handler
    if (verbose) console.log("Building content...");

    const handler = this.handlerRegistry.getHandler(contentType);
    if (!handler) {
      throw new Error(`No handler registered for content type: ${contentType}`);
    }

    // Validate content
    const validation = handler.validate(standaloneDef.content);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    // Create mock chapter builder to capture content params
    let capturedContent: any = null;
    const mockChapterBuilder = {
      addCustomContent: (content: any) => {
        capturedContent = content.params;  // Extract params from h5pContent structure
      },
      addText: () => {},
      addImage: () => {},
      addAudio: () => {}
    };

    // Create handler context with mock chapter builder
    const mediaFiles: Array<{ filename: string; buffer: Buffer }> = [];
    const context: HandlerContext = {
      libraryRegistry: this.libraryRegistry,
      quizGenerator: this.quizGenerator,
      aiPromptBuilder: this.aiPromptBuilder,
      logger: {
        log: verbose ? console.log : () => {},
        warn: console.warn,
        error: console.error
      },
      mediaFiles,
      basePath,
      options: {
        verbose,
        aiProvider: options.aiProvider
      },
      bookConfig: standaloneDef.aiConfig,  // Use standalone aiConfig as book-level config
      chapterBuilder: mockChapterBuilder as any
    };

    // Call handler process() to generate content (it will call mockChapterBuilder.addCustomContent)
    await handler.process(context, standaloneDef.content);

    if (!capturedContent) {
      throw new Error(`Handler for ${contentType} did not generate content`);
    }

    const contentParams = capturedContent;

    if (verbose) {
      console.log(`  - Content generated successfully`);
      console.log(`  - Media files: ${mediaFiles.length}`);
    }

    // Step 4: Assemble standalone package
    if (verbose) console.log("Assembling package...");

    const assembler = new PackageAssembler();
    const packageZip = await assembler.assembleStandalone(
      contentParams,
      mainLibrary,
      dependencies,
      mediaFiles,
      standaloneDef.title,
      standaloneDef.language || "en",
      standaloneDef.description,
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
   * Maps content types to their corresponding H5P main library names.
   * @param contentType Content type from YAML
   * @returns Main library name (e.g., "H5P.Crossword")
   * @throws Error if content type is not supported for standalone generation
   * @private
   */
  private getMainLibraryForContentType(contentType: ContentType): string {
    // Map content types to H5P library names
    const libraryMap: Record<string, string> = {
      "crossword": "H5P.Crossword",
      "ai-crossword": "H5P.Crossword",
      "essay": "H5P.Essay",
      "ai-essay": "H5P.Essay",
      "blanks": "H5P.Blanks",
      "fill-in-the-blanks": "H5P.Blanks",
      "ai-blanks": "H5P.Blanks",
      "ai-fill-in-the-blanks": "H5P.Blanks",
      "dragtext": "H5P.DragText",
      "drag-the-words": "H5P.DragText",
      "ai-dragtext": "H5P.DragText",
      "ai-drag-the-words": "H5P.DragText",
      "truefalse": "H5P.TrueFalse",
      "true-false": "H5P.TrueFalse",
      "ai-truefalse": "H5P.TrueFalse",
      "ai-true-false": "H5P.TrueFalse",
      "singlechoiceset": "H5P.SingleChoiceSet",
      "single-choice-set": "H5P.SingleChoiceSet",
      "ai-singlechoiceset": "H5P.SingleChoiceSet",
      "ai-single-choice-set": "H5P.SingleChoiceSet",
      "dialogcards": "H5P.DialogCards",
      "flashcards": "H5P.Flashcards"
    };

    const library = libraryMap[contentType];
    if (!library) {
      throw new Error(`Content type "${contentType}" is not supported for standalone generation`);
    }
    return library;
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
