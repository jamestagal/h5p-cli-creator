# Specification: Handler-Enhanced Compiler Architecture

## Goal

Transform the existing hardcoded switch-statement content processing in InteractiveBookAIModule into a flexible, extensible handler-based plugin architecture that enables composable content types, supports multiple input formats (YAML, CSV, JSON), and provides a unified API for both CLI and SvelteKit frontend integration.

## User Stories

- As a developer, I want to add new content types by creating handlers without modifying core compiler code, so that the system is extensible and maintainable
- As a CLI user, I want to generate H5P content from YAML or CSV files using the same underlying handlers, so that I have flexibility in my workflow
- As a SvelteKit frontend developer, I want to use the same handlers via a JSON API to generate H5P packages, so that I can build rich authoring interfaces

## Specific Requirements

### Handler Core Architecture

**Create ContentHandler Interface**
- Define async `process()` method that accepts `HandlerContext` and item data, returns void
- Define `validate()` method that checks if handler can process given content item
- Define `getRequiredLibraries()` method that returns array of H5P library names needed
- Define `getContentType()` method that returns string identifier (e.g., "text", "image", "ai-quiz")
- All handlers work with ChapterBuilder API to add content to chapters
- Handlers are composable sub-content processors, not standalone package builders
- Support both synchronous and asynchronous operations for flexibility
- Template-free design - no H5pPackageBuilder usage anywhere

**Create HandlerRegistry for Dynamic Handler Management**
- Implement singleton pattern for global registry access
- Provide `register(handler: ContentHandler)` method to add handlers
- Provide `getHandler(contentType: string)` method to retrieve by type
- Provide `getAllHandlers()` method to list all registered handlers
- Provide `getRequiredLibrariesForBook(bookDef: BookDefinition)` to scan all content and collect library dependencies
- Auto-discover handlers from configured directory paths
- Support handler priority/ordering for processing conflicts

**Create HandlerContext for Shared Utilities**
- Provide access to `LibraryRegistry` (existing cache-first implementation)
- Provide access to `QuizGenerator` for AI-powered quiz generation
- Provide access to logger for progress/debug messages
- Provide access to ChapterBuilder instance for adding content
- Include media file tracking utilities (image/audio counters)
- Include path resolution utilities (relative to input file)
- Support future AI services (TextGenerator, ImageGenerator, FlashcardGenerator)
- Pass configuration options (verbose mode, AI provider selection, etc.)

### Input Format Strategy

**JSON as Core Internal Format**
- Define BookDefinition TypeScript interface (already exists in YamlInputParser.ts)
- All input adapters convert to BookDefinition JSON structure
- ChapterDefinition contains array of AnyContentItem union types
- Each content item has `type` field for handler routing
- TypeScript types ensure compile-time safety across entire pipeline
- Frontend can send BookDefinition JSON directly without conversion

**YAML Input Adapter**
- Leverage existing YamlInputParser class
- Parse YAML to BookDefinition JSON structure
- Resolve relative file paths from YAML directory
- Validate required fields and content structure
- No changes to existing YAML format - full backward compatibility
- Used by CLI for developer-friendly authoring experience

**CSV Input Adapter**
- Create CSVToJSONAdapter class to convert CSV rows to BookDefinition
- Support legacy CSV formats (flashcards, dialog cards, single-chapter books)
- Each CSV row becomes a content item in a single chapter
- Infer content types from column headers (question/answer = flashcard, text = text page)
- Map CSV columns to BookDefinition structure with sensible defaults
- Maintain backward compatibility with existing CSV workflows
- Used primarily for batch content migration and simple use cases

**Direct JSON API**
- SvelteKit frontend sends BookDefinition JSON directly to API endpoint
- No YAML/CSV parsing needed for API workflows
- Same TypeScript types shared between frontend and backend
- Validation occurs at API boundary using BookDefinition schema

### Handler Implementations

**TextHandler (Core Content Type)**
- Process content items with `type: "text"`
- Call `chapterBuilder.addTextPage(title, text)` to add formatted text
- Support multiline text with paragraph detection
- Escape HTML special characters for security
- No external dependencies - pure text processing
- Required libraries: H5P.AdvancedText 1.1
- Validation: Check for required `text` field

**ImageHandler (Media Content Type)**
- Process content items with `type: "image"`
- Support local file paths and URLs via H5pImage helper
- Call `chapterBuilder.addImagePage(title, path, alt)` to add image
- Track image files via HandlerContext media file array
- Handle download errors gracefully with fallback content
- Required libraries: H5P.Image 1.1
- Validation: Check for `path` and `alt` fields

**AudioHandler (Media Content Type)**
- Process content items with `type: "audio"`
- Support local file paths and URLs via H5pAudio helper
- Call `chapterBuilder.addAudioPage(title, path)` to add audio player
- Track audio files via HandlerContext media file array
- Handle format detection via mime-types library
- Required libraries: H5P.Audio 1.5
- Validation: Check for required `path` field

**QuizHandler (AI-Powered Content Type)**
- Process content items with `type: "ai-quiz"`
- Access QuizGenerator via HandlerContext
- Call `quizGenerator.generateH5pQuiz(sourceText, questionCount)` for AI generation
- Call `chapterBuilder.addQuizPage(quizContent)` to add generated quiz
- Support configurable question counts (default: 5)
- Provide fallback text page if AI generation fails
- Required libraries: H5P.MultiChoice 1.16 (and dependencies)
- Validation: Check for required `sourceText` field

**AITextHandler (AI Content Generation)**
- Process content items with `type: "ai-text"`
- Access AI provider (Gemini/Claude) via HandlerContext or direct API
- Generate educational content from prompts using AI
- Call `chapterBuilder.addTextPage(title, generatedText)` with AI output
- Support provider selection (Gemini, Claude, auto-detect)
- Provide error handling with descriptive fallback content
- Required libraries: H5P.AdvancedText 1.1
- Validation: Check for required `prompt` field

**FlashcardsHandler (Embedded Practice)**
- Process content items with `type: "flashcards"`
- Generate H5P.Flashcards sub-content structure
- Support image, tip, and audio fields per card
- Call `chapterBuilder.addCustomContent(flashcardsContent)` to embed in chapter
- Reuse logic from existing FlashcardsCreator (CSV-based)
- Required libraries: H5P.Flashcards 1.5
- Validation: Check for `cards` array with question/answer pairs

**DialogCardsHandler (Conversation Practice)**
- Process content items with `type: "dialogcards"`
- Generate H5P.DialogCards sub-content structure
- Support images and audio for both sides of dialog
- Call `chapterBuilder.addCustomContent(dialogCardsContent)` to embed in chapter
- Reuse logic from existing DialogCardsCreator (CSV-based)
- Required libraries: H5P.DialogCards 1.9
- Validation: Check for `cards` array with front/back text

### CLI Integration

**Replace Switch Statement in InteractiveBookAIModule**
- Remove hardcoded `processContentItem()` switch statement (lines 255-352)
- Replace with dynamic handler lookup: `registry.getHandler(item.type)`
- Call `handler.process(context, item)` for each content item
- Maintain same CLI interface and arguments (no breaking changes)
- Preserve verbose logging output format
- Keep step-by-step progress messages for user clarity

**Handler Registration at Startup**
- Import all handler classes in index.ts or module initializer
- Register handlers with HandlerRegistry before processing commands
- Order: TextHandler, ImageHandler, AudioHandler, AITextHandler, QuizHandler, FlashcardsHandler, DialogCardsHandler
- Support dynamic handler discovery from configured paths (future enhancement)

**Library Resolution with HandlerRegistry**
- Before building content, call `registry.getRequiredLibrariesForBook(bookDef)`
- Fetch all required libraries via LibraryRegistry
- Resolve dependencies for all libraries (including quiz, flashcards, etc.)
- Merge dependencies and remove duplicates by machineName-version key
- Pass complete dependency list to PackageAssembler

**Backward Compatibility Guarantees**
- Existing YAML files generate identical .h5p output
- CLI commands unchanged (no new arguments required)
- Environment variables (GOOGLE_API_KEY, ANTHROPIC_API_KEY) work as before
- Error messages maintain same clarity and helpfulness
- Verbose mode output format preserved for scripts

### SvelteKit Frontend Integration

**API Endpoint Design**
- Create `/api/generate-h5p` POST endpoint in SvelteKit routes
- Accept BookDefinition JSON in request body
- Validate JSON structure using TypeScript types
- Return .h5p file as binary download with proper Content-Type header
- Support streaming response for large packages
- Include proper error responses with status codes and messages

**Request/Response Format**
- Request: `{ bookDefinition: BookDefinition, options?: { aiProvider?: string, verbose?: boolean } }`
- Response Success: Binary .h5p file with `Content-Disposition: attachment; filename="book.h5p"`
- Response Error: `{ error: string, details?: string[] }` with appropriate HTTP status
- Support for progress callbacks (optional, for future real-time updates)

**Shared Compiler Library**
- Extract compiler workflow to reusable `H5pCompiler` class
- Constructor accepts: `(registry: HandlerRegistry, libraryRegistry: LibraryRegistry, quizGenerator: QuizGenerator)`
- Method: `async compile(bookDef: BookDefinition, options: CompilerOptions): Promise<Buffer>`
- Used identically by CLI and API routes
- No code duplication between CLI and API workflows
- Same validation, error handling, and output generation

**Frontend TypeScript Integration**
- Share BookDefinition types between backend and frontend
- Frontend form builder generates valid BookDefinition JSON
- Real-time validation before submission
- Support for drag-and-drop content block reordering
- Live preview of chapter structure (UI implementation out of scope)

### Migration Path and Phases

**Phase 1: Core Handler Infrastructure (Week 1)**
- Create ContentHandler interface, HandlerRegistry, HandlerContext
- Implement TextHandler, ImageHandler, AudioHandler
- Create unit tests for each handler with mock ChapterBuilder
- Extract handler logic patterns from existing switch statement
- Document handler development guide for contributors

**Phase 2: Integration with InteractiveBookAIModule (Week 2)**
- Replace switch statement with handler registry calls
- Implement dynamic library resolution via handlers
- Migrate AI-powered handlers (AITextHandler, QuizHandler)
- Run integration tests against existing YAML examples
- Validate backward compatibility with output comparison

**Phase 3: Extended Handler Implementations (Week 3)**
- Implement FlashcardsHandler and DialogCardsHandler
- Migrate CSV-based creators to use handlers internally
- Create CSVToJSONAdapter for legacy CSV workflows
- Add handler validation and error reporting improvements
- Create comprehensive test suite for all content types

**Phase 4: SvelteKit Integration Preparation (Week 4)**
- Extract H5pCompiler reusable class
- Create API endpoint with BookDefinition JSON input
- Share TypeScript types between frontend and backend
- Document API usage and integration patterns
- Prepare for community handler contributions

## Visual Design

No visual assets provided. This is a backend/compiler architecture specification.

## Existing Code to Leverage

**ContentBuilder and ChapterBuilder APIs**
- Use existing fluent API for building Interactive Book content programmatically
- ChapterBuilder provides `addTextPage()`, `addImagePage()`, `addAudioPage()`, `addQuizPage()`, `addCustomContent()` methods
- Handlers call these methods instead of building H5P structures directly
- MediaFile tracking built into ChapterBuilder (image/audio counters)
- Automatic chapter finalization and content structure assembly

**YamlInputParser Class**
- Already parses YAML to BookDefinition JSON structure
- Validates required fields and content types
- Resolves relative file paths from YAML directory
- Defines TypeScript interfaces: BookDefinition, ChapterDefinition, AnyContentItem
- Reuse without modification - handlers consume its output

**LibraryRegistry (Cache-First Implementation)**
- Already implemented cache-first library fetching from H5P Hub
- Methods: `fetchLibrary()`, `resolveDependencies()`, registry access
- Used by handlers via HandlerContext to get library metadata
- No changes needed - handlers access through context

**QuizGenerator (AI Integration)**
- Already implements Gemini and Claude API integration
- Methods: `generateH5pQuiz(sourceText, questionCount)` returns ready-to-use H5P.MultiChoice content
- Auto-detects provider based on environment variables
- QuizHandler accesses via HandlerContext, calls `generateH5pQuiz()` directly

**PackageAssembler**
- Already assembles .h5p packages from content, libraries, and media files
- Methods: `assemble(content, dependencies, mediaFiles, title, language, registry)`, `savePackage(zip, outputPath)`
- No changes needed - receives handler-generated content
- Works with both CLI and API workflows identically

**Existing CSV Creators (FlashcardsCreator, DialogCardsCreator)**
- Contains working logic for flashcard and dialog card content generation
- `addContent()` methods show how to build card arrays and handle media
- `addSettings()` methods show configuration patterns
- Extract content-building logic into handlers, preserve media handling patterns

**H5pImage and H5pAudio Helper Classes**
- Static methods: `fromLocalFile(path)`, `fromDownload(url)`
- Handle both local files and URLs with proper MIME type detection
- Return structured objects: `{ extension, buffer, image/audio }`
- Handlers use these helpers for media processing

**Switch Statement in InteractiveBookAIModule (Lines 255-352)**
- Shows current content item processing flow
- Cases for: text, ai-text, image, audio, ai-quiz
- Demonstrates ChapterBuilder API usage patterns
- Provides error handling examples
- Refactor into handlers that preserve same behavior

## Out of Scope

- Template-based H5P package generation (explicitly removed from architecture)
- Standalone content type handlers (focus is composable sub-content for Interactive Books)
- SvelteKit UI implementation (only API endpoint and shared types)
- Frontend form builder or visual editor (separate project)
- Real-time collaboration features
- User authentication or authorization (API assumes trusted input)
- Database integration for content storage
- Content versioning or revision history
- Automated content translation or localization
- Handler hot-reloading or runtime plugin installation
- Web-based handler development or debugging tools

## Implementation Details

### File Structure

```
src/
├── handlers/
│   ├── ContentHandler.ts           # Interface definition
│   ├── HandlerRegistry.ts          # Singleton registry
│   ├── HandlerContext.ts           # Context interface and implementation
│   ├── core/
│   │   ├── TextHandler.ts
│   │   ├── ImageHandler.ts
│   │   ├── AudioHandler.ts
│   │   └── AITextHandler.ts
│   ├── ai/
│   │   └── QuizHandler.ts
│   └── embedded/
│       ├── FlashcardsHandler.ts
│       └── DialogCardsHandler.ts
├── compiler/
│   ├── H5pCompiler.ts              # Extracted reusable compiler
│   ├── ContentBuilder.ts           # Existing
│   ├── ChapterBuilder.ts           # Existing
│   ├── PackageAssembler.ts         # Existing
│   ├── YamlInputParser.ts          # Existing
│   ├── CSVToJSONAdapter.ts         # New adapter
│   └── types.ts                    # Shared TypeScript types
├── modules/
│   └── ai/
│       └── interactive-book-ai-module.ts  # Refactored to use handlers
└── api/
    └── generate-h5p.ts             # SvelteKit API route (future)
```

### ContentHandler Interface TypeScript Definition

```typescript
export interface ContentHandler {
  /**
   * Unique content type identifier (e.g., "text", "image", "ai-quiz")
   */
  getContentType(): string;

  /**
   * Process a content item and add it to the chapter via context
   * @param context Handler execution context with utilities
   * @param item Content item data (type-specific structure)
   */
  process(context: HandlerContext, item: any): Promise<void>;

  /**
   * Validate if this handler can process the given content item
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  validate(item: any): { valid: boolean; error?: string };

  /**
   * Get H5P libraries required by this handler
   * @returns Array of library identifiers (e.g., ["H5P.Image 1.1"])
   */
  getRequiredLibraries(): string[];
}
```

### HandlerContext Interface TypeScript Definition

```typescript
export interface HandlerContext {
  /**
   * ChapterBuilder instance for adding content to current chapter
   */
  chapterBuilder: ChapterBuilder;

  /**
   * Library registry for fetching H5P library metadata
   */
  libraryRegistry: LibraryRegistry;

  /**
   * Quiz generator for AI-powered quiz creation
   */
  quizGenerator: QuizGenerator;

  /**
   * Logger for progress and debug messages
   */
  logger: Logger;

  /**
   * Media file tracking (for image/audio counters)
   */
  mediaFiles: MediaFile[];

  /**
   * Base path for resolving relative file paths
   */
  basePath: string;

  /**
   * Configuration options (verbose mode, AI provider, etc.)
   */
  options: {
    verbose?: boolean;
    aiProvider?: "gemini" | "claude" | "auto";
  };
}

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

### HandlerRegistry Implementation Pattern

```typescript
export class HandlerRegistry {
  private static instance: HandlerRegistry;
  private handlers: Map<string, ContentHandler> = new Map();

  private constructor() {}

  public static getInstance(): HandlerRegistry {
    if (!HandlerRegistry.instance) {
      HandlerRegistry.instance = new HandlerRegistry();
    }
    return HandlerRegistry.instance;
  }

  public register(handler: ContentHandler): void {
    const type = handler.getContentType();
    if (this.handlers.has(type)) {
      throw new Error(`Handler for type '${type}' already registered`);
    }
    this.handlers.set(type, handler);
  }

  public getHandler(contentType: string): ContentHandler | undefined {
    return this.handlers.get(contentType);
  }

  public getAllHandlers(): ContentHandler[] {
    return Array.from(this.handlers.values());
  }

  public getRequiredLibrariesForBook(bookDef: BookDefinition): string[] {
    const libraries = new Set<string>();

    // Always include base Interactive Book library
    libraries.add("H5P.InteractiveBook");

    // Scan all content items and collect libraries
    for (const chapter of bookDef.chapters) {
      for (const item of chapter.content) {
        const handler = this.getHandler(item.type);
        if (handler) {
          handler.getRequiredLibraries().forEach(lib => libraries.add(lib));
        }
      }
    }

    return Array.from(libraries);
  }
}
```

### Example Handler Implementation (TextHandler)

```typescript
export class TextHandler implements ContentHandler {
  public getContentType(): string {
    return "text";
  }

  public async process(context: HandlerContext, item: TextContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding text page: "${item.title || 'Untitled'}"`);
    }

    chapterBuilder.addTextPage(item.title || "", item.text);
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.text || typeof item.text !== "string") {
      return { valid: false, error: "Text content must have a 'text' field (string)" };
    }
    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.AdvancedText"];
  }
}
```

### Example Handler Implementation (QuizHandler)

```typescript
export class QuizHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-quiz";
  }

  public async process(context: HandlerContext, item: AIQuizContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
      logger.log(`      Source text length: ${item.sourceText.length} characters`);
      logger.log(`      Questions: ${item.questionCount || 5}`);
    }

    try {
      const quizContent = await quizGenerator.generateH5pQuiz(
        item.sourceText,
        item.questionCount || 5
      );
      chapterBuilder.addQuizPage(quizContent);

      if (options.verbose) {
        logger.log(`      Generated ${quizContent.length} questions`);
      }
    } catch (error) {
      logger.warn(`      AI quiz generation failed: ${error}`);
      // Fallback to text page explaining the failure
      chapterBuilder.addTextPage(
        item.title || "Quiz",
        `Quiz generation failed. Please ensure your AI API key is valid.\n\nError: ${error}`
      );
    }
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.sourceText || typeof item.sourceText !== "string") {
      return { valid: false, error: "AI quiz content must have a 'sourceText' field (string)" };
    }
    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.MultiChoice"];
  }
}
```

### Refactored InteractiveBookAIModule Pattern

```typescript
// In handler() method, after building chapters:
for (let i = 0; i < bookDef.chapters.length; i++) {
  const chapter = bookDef.chapters[i];
  if (verbose) console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

  const chapterBuilder = builder.addChapter(chapter.title);

  // Create handler context
  const context: HandlerContext = {
    chapterBuilder,
    libraryRegistry: registry,
    quizGenerator,
    logger: { log: console.log, warn: console.warn, error: console.error },
    mediaFiles: builder.getMediaFiles(),
    basePath: path.dirname(path.resolve(yamlFile)),
    options: { verbose, aiProvider }
  };

  // Process each content item with appropriate handler
  for (const item of chapter.content) {
    const handler = handlerRegistry.getHandler(item.type);

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
```

### H5pCompiler Reusable Class

```typescript
export class H5pCompiler {
  constructor(
    private handlerRegistry: HandlerRegistry,
    private libraryRegistry: LibraryRegistry,
    private quizGenerator: QuizGenerator
  ) {}

  public async compile(
    bookDef: BookDefinition,
    options: CompilerOptions = {}
  ): Promise<Buffer> {
    // Step 1: Fetch required libraries
    const requiredLibs = this.handlerRegistry.getRequiredLibrariesForBook(bookDef);
    const dependencies = await this.fetchAllLibraries(requiredLibs);

    // Step 2: Build content with handlers
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(this.libraryRegistry, validator);
    builder.createBook(bookDef.title, bookDef.language);

    for (const chapter of bookDef.chapters) {
      const chapterBuilder = builder.addChapter(chapter.title);
      const context = this.createContext(chapterBuilder, options);

      for (const item of chapter.content) {
        await this.processItem(item, context);
      }
    }

    // Step 3: Assemble package
    const assembler = new PackageAssembler();
    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();
    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      builder.getTitle(),
      builder.getLanguage(),
      this.libraryRegistry
    );

    return await packageZip.generateAsync({ type: "nodebuffer" });
  }

  private async processItem(item: AnyContentItem, context: HandlerContext): Promise<void> {
    const handler = this.handlerRegistry.getHandler(item.type);
    if (!handler) {
      throw new Error(`No handler registered for content type: ${item.type}`);
    }

    const validation = handler.validate(item);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    await handler.process(context, item);
  }
}
```

### SvelteKit API Endpoint Pattern

```typescript
// src/routes/api/generate-h5p/+server.ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { H5pCompiler } from "$lib/compiler/H5pCompiler";
import { HandlerRegistry } from "$lib/handlers/HandlerRegistry";
import { LibraryRegistry } from "$lib/compiler/LibraryRegistry";
import { QuizGenerator } from "$lib/ai/QuizGenerator";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { bookDefinition, options } = await request.json();

    // Validate input
    if (!bookDefinition || !bookDefinition.title || !bookDefinition.chapters) {
      throw error(400, "Invalid book definition");
    }

    // Initialize compiler
    const registry = HandlerRegistry.getInstance();
    const libraryRegistry = new LibraryRegistry();
    const quizGenerator = new QuizGenerator();
    const compiler = new H5pCompiler(registry, libraryRegistry, quizGenerator);

    // Compile to .h5p buffer
    const h5pBuffer = await compiler.compile(bookDefinition, options);

    // Return as downloadable file
    return new Response(h5pBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bookDefinition.title}.h5p"`
      }
    });
  } catch (err) {
    console.error("H5P generation failed:", err);
    throw error(500, err instanceof Error ? err.message : "Unknown error");
  }
};
```

## Testing Strategy

### Unit Tests for Each Handler

```typescript
// Example: TextHandler.test.ts
describe("TextHandler", () => {
  let handler: TextHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: ChapterBuilder;

  beforeEach(() => {
    handler = new TextHandler();
    mockChapterBuilder = {
      addTextPage: jest.fn()
    } as any;
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      options: { verbose: true }
    } as any;
  });

  it("should process valid text content", async () => {
    const item: TextContent = {
      type: "text",
      title: "Test Page",
      text: "This is test content"
    };

    await handler.process(mockContext, item);

    expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
      "Test Page",
      "This is test content"
    );
  });

  it("should validate text content correctly", () => {
    const valid = handler.validate({ type: "text", text: "Content" });
    expect(valid.valid).toBe(true);

    const invalid = handler.validate({ type: "text" });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain("text");
  });

  it("should return correct required libraries", () => {
    const libs = handler.getRequiredLibraries();
    expect(libs).toEqual(["H5P.AdvancedText"]);
  });
});
```

### Integration Tests for Handler Workflow

```typescript
// Example: HandlerIntegration.test.ts
describe("Handler Integration", () => {
  it("should process complete book with multiple content types", async () => {
    const bookDef: BookDefinition = {
      title: "Test Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "text", text: "Introduction", title: "Intro" },
            { type: "image", path: "/test/image.jpg", alt: "Test" }
          ]
        }
      ]
    };

    const registry = HandlerRegistry.getInstance();
    registry.register(new TextHandler());
    registry.register(new ImageHandler());

    const compiler = new H5pCompiler(registry, new LibraryRegistry(), new QuizGenerator());
    const result = await compiler.compile(bookDef);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
```

### Backward Compatibility Tests

```typescript
// Example: BackwardCompatibility.test.ts
describe("Backward Compatibility", () => {
  it("should produce identical output for existing YAML files", async () => {
    const yamlPath = "./tests/fixtures/existing-book.yaml";

    // Generate with old switch-statement approach (baseline)
    const baselineOutput = await generateWithOldMethod(yamlPath);

    // Generate with new handler approach
    const newOutput = await generateWithHandlers(yamlPath);

    // Compare content.json structures (excluding dynamic IDs)
    expect(normalizeContent(newOutput)).toEqual(normalizeContent(baselineOutput));
  });
});
```

### End-to-End API Tests

```typescript
// Example: API.test.ts
describe("API Endpoint", () => {
  it("should generate .h5p file from JSON request", async () => {
    const bookDef: BookDefinition = {
      title: "API Test Book",
      language: "en",
      chapters: [
        { title: "Chapter 1", content: [{ type: "text", text: "Content" }] }
      ]
    };

    const response = await fetch("/api/generate-h5p", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookDefinition: bookDef })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(".h5p");

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
```

## Documentation Requirements

### Handler Development Guide

- Step-by-step tutorial for creating a new handler
- Explanation of ContentHandler interface methods
- Examples of simple and complex handlers
- Best practices for error handling and validation
- Guidelines for working with ChapterBuilder API
- Instructions for registering handlers with HandlerRegistry

### API Reference

- Complete TypeScript interface documentation for ContentHandler, HandlerContext, HandlerRegistry
- BookDefinition JSON schema with examples for each content type
- API endpoint documentation with request/response formats
- Error code reference and troubleshooting guide
- Library requirements and dependency resolution explanation

### Migration Guide for Existing Users

- Overview of architectural changes and benefits
- Confirmation that existing YAML/CSV files work unchanged
- Explanation of new handler system for advanced users
- Instructions for extending with custom handlers
- Troubleshooting guide for common migration issues

### CSV Format Documentation

- Updated CSV format reference for each content type (flashcards, dialog cards, books)
- Examples of CSVToJSONAdapter usage
- Column header mappings to BookDefinition fields
- Migration path from old CSV workflows to new system

## Timeline and Phases

### Week 1: Core Handler Infrastructure

- Day 1-2: Design and implement ContentHandler interface, HandlerRegistry singleton, HandlerContext implementation
- Day 3-4: Implement core handlers (TextHandler, ImageHandler, AudioHandler) with unit tests
- Day 5: Create handler development guide and API reference documentation
- Deliverable: Working handler infrastructure with core content types

### Week 2: Integration with InteractiveBookAIModule

- Day 1-2: Refactor InteractiveBookAIModule to replace switch statement with handler registry calls
- Day 3: Implement dynamic library resolution using HandlerRegistry.getRequiredLibrariesForBook()
- Day 4: Migrate AI-powered handlers (AITextHandler, QuizHandler) with QuizGenerator integration
- Day 5: Run integration tests against existing YAML examples, validate backward compatibility
- Deliverable: Fully functional handler-based compiler with AI support

### Week 3: Extended Handler Implementations

- Day 1-2: Implement FlashcardsHandler and DialogCardsHandler by extracting logic from CSV creators
- Day 3: Create CSVToJSONAdapter for legacy CSV workflow support
- Day 4: Add comprehensive validation and error reporting across all handlers
- Day 5: Create end-to-end test suite covering all content types and input formats
- Deliverable: Complete handler ecosystem with CSV compatibility

### Week 4: SvelteKit Integration Preparation

- Day 1-2: Extract H5pCompiler reusable class from CLI module
- Day 3: Create SvelteKit API endpoint with BookDefinition JSON input
- Day 4: Share TypeScript types between frontend and backend, create API documentation
- Day 5: Document API usage patterns and prepare for community handler contributions
- Deliverable: Production-ready API and compiler library for frontend integration
