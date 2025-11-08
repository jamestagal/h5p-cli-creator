# Handler-Enhanced Compiler Architecture
## Template-Free H5P Content Generation with Composable Handlers

**Status:** Planning Document
**Created:** 2025-11-08
**Purpose:** Define the handler architecture for the template-free H5P compiler with frontend integration support

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Handler Architecture Vision](#handler-architecture-vision)
4. [Core Interfaces](#core-interfaces)
5. [Handler Registry](#handler-registry)
6. [Input Format Strategy](#input-format-strategy)
7. [SvelteKit Frontend Integration](#sveltekit-frontend-integration)
8. [Implementation Phases](#implementation-phases)
9. [Example Handlers](#example-handlers)
10. [Migration Path](#migration-path)

---

## Executive Summary

### What We're Building

A **handler-based plugin system** that works with the existing **template-free H5P compiler** to enable:

- ✅ Composable content types within Interactive Books
- ✅ AI-powered content generation
- ✅ CLI workflows (YAML input)
- ✅ Frontend UI workflows (JSON API)
- ✅ Community extensibility

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Template-FREE handlers** | Leverage existing ContentBuilder/ChapterBuilder |
| **JSON as core format** | YAML is CLI convenience, JSON for APIs |
| **Composable sub-content** | Handlers add to chapters, not standalone |
| **AI-first design** | Handlers support AI generation natively |
| **Frontend-ready** | SvelteKit can use same handlers as CLI |

### What Makes This Different

**Traditional Handler Systems:**
- Template-based (extract, modify, repackage)
- CSV-only input
- Standalone content types
- No AI integration

**Our Handler System:**
- Template-FREE (programmatic generation)
- Multi-format input (YAML, JSON, CSV)
- Composable sub-content
- AI-native with QuizGenerator integration
- Frontend API ready

---

## Current Architecture Analysis

### What We Have (Template-Free Compiler)

```
CLI Input (YAML) → YamlInputParser → BookDefinition (JSON)
                                            ↓
                                      ContentBuilder
                                            ↓
                                      ChapterBuilder ← Adds content programmatically
                                            ↓
                                      PackageAssembler → .h5p file
                                            ↑
                                      LibraryRegistry (cache-first)
```

**Key Components:**
- **YamlInputParser**: Converts YAML → JSON structure
- **ContentBuilder**: High-level API for building books
- **ChapterBuilder**: Fluent API for adding content to chapters
- **PackageAssembler**: Generates .h5p without templates
- **LibraryRegistry**: Cache-first library management
- **QuizGenerator**: AI-powered quiz generation (Gemini/Claude)

### What We Currently Support

```typescript
// From interactive-book-ai-module.ts
switch (item.type) {
  case "text":
    chapterBuilder.addTextPage(title, text);
    break;

  case "ai-text":
    // AI-generated text via Gemini/Claude
    chapterBuilder.addTextPage(title, aiGeneratedText);
    break;

  case "image":
    await chapterBuilder.addImagePage(title, path, alt);
    break;

  case "audio":
    await chapterBuilder.addAudioPage(title, path);
    break;

  case "ai-quiz":
    // AI-generated quiz via QuizGenerator
    const quizContent = await quizGenerator.generateH5pQuiz(sourceText, count);
    chapterBuilder.addQuizPage(quizContent);
    break;
}
```

**Problem:** Hardcoded content types in switch statement!

**Solution:** Replace with handler system!

---

## Handler Architecture Vision

### The Core Concept

**Handlers are plugins that know how to add specific content types to chapters.**

```typescript
// Instead of hardcoded switch statements:
switch (item.type) {
  case "text": ...
  case "image": ...
  case "quiz": ...
}

// Use dynamic handler resolution:
const handler = registry.getHandler(item.type);
await handler.addToChapter(chapterBuilder, item.data, context);
```

### Benefits

✅ **Extensibility**
- Add new content types without modifying core code
- Community can contribute handlers
- Each handler is isolated and testable

✅ **Composability**
- Mix ANY content types in a chapter
- Handlers don't know about each other
- True plugin architecture

✅ **AI Integration**
- Handlers can use AI services
- QuizGenerator as a shared utility
- Future: ImageGenerator, TextGenerator, etc.

✅ **Frontend Ready**
- Same handlers work for CLI and web UI
- JSON-based internal API
- SvelteKit can use handlers directly

---

## Core Interfaces

### ContentHandler Interface (Template-Free Version)

```typescript
/**
 * Handler for adding content to H5P Interactive Book chapters.
 * Works with ContentBuilder/ChapterBuilder (template-free).
 */
export interface ContentHandler {
  /** Unique identifier (e.g., "text", "quiz", "flashcards") */
  readonly type: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Brief description */
  readonly description: string;

  /**
   * Add content to a chapter using ChapterBuilder API.
   *
   * @param builder - ChapterBuilder to add content to
   * @param data - Content data (from YAML/JSON)
   * @param context - Shared utilities (AI, file ops, etc.)
   */
  addToChapter(
    builder: ChapterBuilder,
    data: any,
    context: HandlerContext
  ): void | Promise<void>;

  /**
   * Validate input data before processing.
   *
   * @param data - Content data to validate
   * @returns ValidationResult with success/error info
   */
  validate(data: any): ValidationResult;

  /**
   * Get H5P libraries required by this handler.
   * Used by LibraryRegistry to fetch dependencies.
   *
   * @returns Array of library names (e.g., ["H5P.MultiChoice"])
   */
  getRequiredLibraries(): string[];

  /**
   * Check if this handler can process the given data.
   * Useful for dynamic handler selection.
   *
   * @param data - Content item to check
   * @returns true if this handler can process it
   */
  canHandle(data: any): boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

/**
 * Shared utilities provided to handlers
 */
export interface HandlerContext {
  /** LibraryRegistry for fetching H5P libraries */
  readonly registry: LibraryRegistry;

  /** AI quiz generator */
  readonly quizGenerator: QuizGenerator;

  /** Logger for progress messages */
  readonly logger: Logger;

  /** Verbose mode flag */
  readonly verbose: boolean;

  /**
   * Future: Additional AI services
   * - textGenerator: TextGenerator
   * - imageGenerator: ImageGenerator
   * - flashcardGenerator: FlashcardGenerator
   */
}

/**
 * Logger interface
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}
```

---

## Handler Registry

### Registry Implementation

```typescript
/**
 * Central registry for content handlers.
 * Manages handler registration, discovery, and coordination.
 */
export class HandlerRegistry {
  private handlers: Map<string, ContentHandler> = new Map();

  /**
   * Register a content handler.
   *
   * @param handler - Handler to register
   * @throws Error if handler with same type already registered
   */
  register(handler: ContentHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(
        `Handler already registered for type: ${handler.type}`
      );
    }

    this.handlers.set(handler.type, handler);
    console.log(`✅ Registered handler: ${handler.displayName} (${handler.type})`);
  }

  /**
   * Get handler by type.
   *
   * @param type - Handler type identifier
   * @returns Handler instance or undefined
   */
  getHandler(type: string): ContentHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if handler exists for type.
   *
   * @param type - Handler type identifier
   * @returns true if handler exists
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered handlers.
   *
   * @returns Array of handler instances
   */
  getAllHandlers(): ContentHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all handler types.
   *
   * @returns Array of type identifiers
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Find handlers that can process given data.
   * Useful for automatic handler selection.
   *
   * @param data - Content item
   * @returns Array of matching handlers
   */
  findHandlers(data: any): ContentHandler[] {
    const matched: ContentHandler[] = [];

    for (const handler of this.handlers.values()) {
      if (handler.canHandle(data)) {
        matched.push(handler);
      }
    }

    return matched;
  }

  /**
   * Get all required libraries for registered handlers.
   * Used to pre-fetch libraries before generation.
   *
   * @param types - Handler types to get libraries for
   * @returns Array of unique library names
   */
  getRequiredLibraries(types: string[]): string[] {
    const libraries = new Set<string>();

    for (const type of types) {
      const handler = this.getHandler(type);
      if (handler) {
        handler.getRequiredLibraries().forEach(lib => libraries.add(lib));
      }
    }

    return Array.from(libraries);
  }
}
```

### Usage in Compiler

```typescript
// In InteractiveBookAIModule (or equivalent)
export class InteractiveBookAIModule {
  private handlerRegistry: HandlerRegistry;

  constructor() {
    // Initialize registry
    this.handlerRegistry = new HandlerRegistry();

    // Register built-in handlers
    this.registerBuiltInHandlers();
  }

  private registerBuiltInHandlers(): void {
    this.handlerRegistry.register(new TextHandler());
    this.handlerRegistry.register(new ImageHandler());
    this.handlerRegistry.register(new AudioHandler());
    this.handlerRegistry.register(new QuizHandler());
    // Future handlers registered here
  }

  private async processContentItem(
    item: AnyContentItem,
    chapterBuilder: ChapterBuilder,
    context: HandlerContext
  ): Promise<void> {
    // Get handler for this content type
    const handler = this.handlerRegistry.getHandler(item.type);

    if (!handler) {
      console.warn(`Unknown content type: ${item.type} (no handler registered)`);
      return;
    }

    // Validate
    const validation = handler.validate(item);
    if (!validation.valid) {
      console.error(`Validation failed for ${item.type}: ${validation.error}`);
      return;
    }

    // Add to chapter using handler
    await handler.addToChapter(chapterBuilder, item, context);
  }
}
```

---

## Input Format Strategy

### Core Principle: JSON is the Internal Format

**YAML, CSV, and Frontend UI are all INPUT ADAPTERS that convert to JSON.**

```
Input Formats → JSON (Internal) → Compiler
```

### Internal JSON Structure

```typescript
/**
 * Core book definition (internal format)
 */
interface BookDefinition {
  title: string;
  language: string;
  chapters: ChapterDefinition[];
}

interface ChapterDefinition {
  title: string;
  content: ContentItem[];
}

interface ContentItem {
  type: string;        // Handler type ("text", "quiz", etc.)
  [key: string]: any;  // Handler-specific data
}
```

### Input Adapter 1: YAML (CLI Users)

**Current YAML format:**
```yaml
title: "Biology Lesson"
language: "en"
chapters:
  - title: "Introduction"
    content:
      - type: text
        title: "What are cells?"
        text: "Cells are the basic unit..."

      - type: ai-quiz
        sourceText: "Cells are the basic unit..."
        questionCount: 5
```

**YamlInputParser converts to JSON:**
```typescript
class YamlInputParser {
  parse(yamlPath: string): BookDefinition {
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    const bookDef = jsyaml.load(yaml) as BookDefinition;
    return bookDef; // Already in correct JSON format!
  }
}
```

### Input Adapter 2: CSV (Legacy Compatibility)

**CSV format (row = page):**
```csv
bookTitle,chapterTitle,contentType,data1,data2
Biology 101,Intro,text,What are cells?,Cells are...
Biology 101,Intro,image,cells.jpg,Cell diagram
Biology 101,Quiz,ai-quiz,Cells are...,5
```

**CSVToJSONAdapter converts to BookDefinition:**
```typescript
class CSVToJSONAdapter {
  parse(csvPath: string): BookDefinition {
    const rows = papa.parse(csvPath, { headers: true });

    // Group by chapter, convert to BookDefinition
    const bookDef: BookDefinition = {
      title: rows[0].bookTitle,
      language: 'en',
      chapters: this.groupByChapter(rows)
    };

    return bookDef;
  }
}
```

### Input Adapter 3: SvelteKit Frontend (Web UI)

**Frontend sends JSON directly:**
```typescript
// SvelteKit API endpoint
export async function POST({ request }) {
  // Frontend sends BookDefinition JSON
  const bookDef: BookDefinition = await request.json();

  // Use compiler directly (no adapter needed!)
  const builder = new ContentBuilder(registry, validator);
  builder.createBook(bookDef.title, bookDef.language);

  // ... generate content ...

  return new Response(h5pBuffer, {
    headers: { 'Content-Type': 'application/zip' }
  });
}
```

---

## SvelteKit Frontend Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Visual Content Builder UI                    │   │
│  │  • Drag & drop content blocks                        │   │
│  │  • Form inputs (title, text, images)                │   │
│  │  • AI generation buttons                            │   │
│  │  • Live preview                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓ Sends BookDefinition JSON          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              SvelteKit API Routes (+server.ts)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  POST /api/generate-h5p                             │   │
│  │  • Receives JSON                                     │   │
│  │  • Validates structure                              │   │
│  │  • Uses ContentBuilder (same as CLI!)               │   │
│  │  • Returns .h5p file                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│           H5P Compiler (Shared Library)                      │
│  • HandlerRegistry                                           │
│  • ContentBuilder                                            │
│  • ChapterBuilder                                            │
│  • PackageAssembler                                          │
│  • LibraryRegistry                                           │
│  • QuizGenerator (AI)                                        │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Component Example

```svelte
<!-- BookBuilder.svelte -->
<script lang="ts">
  import { writable } from 'svelte/store';
  import type { BookDefinition, ChapterDefinition, ContentItem } from '$lib/types';

  let book = writable<BookDefinition>({
    title: 'My Interactive Book',
    language: 'en',
    chapters: []
  });

  function addChapter() {
    $book.chapters = [...$book.chapters, {
      title: 'New Chapter',
      content: []
    }];
  }

  function addTextBlock(chapterIndex: number) {
    const chapter = $book.chapters[chapterIndex];
    chapter.content = [...chapter.content, {
      type: 'text',
      title: '',
      text: ''
    }];
    $book = $book; // Trigger reactivity
  }

  function addQuizBlock(chapterIndex: number) {
    const chapter = $book.chapters[chapterIndex];
    chapter.content = [...chapter.content, {
      type: 'ai-quiz',
      sourceText: '',
      questionCount: 5
    }];
    $book = $book;
  }

  async function generateBook() {
    const response = await fetch('/api/generate-h5p', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify($book)
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$book.title}.h5p`;
    a.click();
  }
</script>

<div class="book-builder">
  <input bind:value={$book.title} placeholder="Book Title" />

  {#each $book.chapters as chapter, i}
    <div class="chapter">
      <input bind:value={chapter.title} placeholder="Chapter Title" />

      <div class="content-blocks">
        {#each chapter.content as item, j}
          {#if item.type === 'text'}
            <TextBlockEditor bind:data={item} />
          {:else if item.type === 'ai-quiz'}
            <QuizBlockEditor bind:data={item} />
          {/if}
        {/each}
      </div>

      <button on:click={() => addTextBlock(i)}>+ Text</button>
      <button on:click={() => addQuizBlock(i)}>+ AI Quiz</button>
    </div>
  {/each}

  <button on:click={addChapter}>+ Chapter</button>
  <button on:click={generateBook}>Generate H5P</button>
</div>
```

### API Endpoint Example

```typescript
// src/routes/api/generate-h5p/+server.ts
import type { RequestHandler } from './$types';
import type { BookDefinition } from '$lib/types';
import { ContentBuilder } from '$lib/compiler/ContentBuilder';
import { HandlerRegistry } from '$lib/compiler/HandlerRegistry';
import { LibraryRegistry } from '$lib/compiler/LibraryRegistry';
import { PackageAssembler } from '$lib/compiler/PackageAssembler';
import { QuizGenerator } from '$lib/ai/QuizGenerator';

// Initialize (could be singleton)
const handlerRegistry = new HandlerRegistry();
handlerRegistry.register(new TextHandler());
handlerRegistry.register(new ImageHandler());
handlerRegistry.register(new QuizHandler());
// ... register all handlers

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Get BookDefinition JSON from frontend
    const bookDef: BookDefinition = await request.json();

    // Initialize compiler components
    const libraryRegistry = new LibraryRegistry();
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(libraryRegistry, validator);
    const quizGenerator = new QuizGenerator();

    // Create book
    builder.createBook(bookDef.title, bookDef.language);

    // Process each chapter
    for (const chapterDef of bookDef.chapters) {
      const chapterBuilder = builder.addChapter(chapterDef.title);

      // Process each content item using handlers
      for (const item of chapterDef.content) {
        const handler = handlerRegistry.getHandler(item.type);

        if (handler) {
          const context = {
            registry: libraryRegistry,
            quizGenerator: quizGenerator,
            logger: console,
            verbose: false
          };

          await handler.addToChapter(chapterBuilder, item, context);
        }
      }
    }

    // Assemble package
    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();
    const dependencies = await libraryRegistry.resolveDependencies('H5P.InteractiveBook');

    const assembler = new PackageAssembler();
    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      bookDef.title,
      bookDef.language,
      libraryRegistry
    );

    // Save to buffer
    const buffer = await packageZip.generateAsync({ type: 'nodebuffer' });

    // Return as download
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${bookDef.title}.h5p"`
      }
    });

  } catch (error) {
    console.error('Generation failed:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

**Key Points:**
- ✅ Same handlers used by CLI and frontend
- ✅ No YAML - frontend sends JSON directly
- ✅ SvelteKit endpoint uses compiler library
- ✅ Returns .h5p file as download

---

## Implementation Phases

### Phase 1: Core Handler Infrastructure (Week 1)

**Goal:** Extract handler pattern from existing code

**Tasks:**
1. Create `src/handlers/ContentHandler.ts` (interface)
2. Create `src/handlers/HandlerRegistry.ts`
3. Create `src/handlers/HandlerContext.ts`
4. Create example handlers from existing code:
   - `TextHandler.ts` (from existing text handling)
   - `ImageHandler.ts` (from existing image handling)
   - `AudioHandler.ts` (from existing audio handling)
   - `QuizHandler.ts` (from existing quiz handling)

**No breaking changes** - handlers replicate existing behavior

### Phase 2: Integrate with InteractiveBookAIModule (Week 2)

**Goal:** Replace switch statement with handler system

**Tasks:**
1. Modify `InteractiveBookAIModule.processContentItem()` to use handlers
2. Keep backward compatibility (YAML format unchanged)
3. Test that all existing YAML examples still work
4. Verify identical .h5p output

**Success Criteria:** All existing YAML inputs produce identical output

### Phase 3: Add New Handlers (Week 3)

**Goal:** Demonstrate extensibility with new content types

**Tasks:**
1. Create `FlashcardsHandler.ts` (embed flashcards in books!)
2. Create `DialogCardsHandler.ts` (embed dialog cards!)
3. Create `VideoHandler.ts` (embed videos!)
4. Update YAML schema to support new types
5. Create example YAML files with new content types

**Success Criteria:** Can create Interactive Books with quizzes, flashcards, videos all mixed together

### Phase 4: SvelteKit Integration Preparation (Week 4)

**Goal:** Make compiler frontend-ready

**Tasks:**
1. Extract compiler to shared library (usable by CLI and API)
2. Create TypeScript types for BookDefinition/ContentItem
3. Document JSON API structure
4. Create simple API endpoint example
5. Write integration guide for frontend developers

**Success Criteria:** Clear path for SvelteKit integration

### Phase 5: Community Handlers (Ongoing)

**Goal:** Enable community contributions

**Tasks:**
1. Document handler development process
2. Create handler template/boilerplate
3. Add handler testing framework
4. Create contribution guidelines

**Success Criteria:** External developers can create and contribute handlers

---

## Example Handlers

### 1. TextHandler (Simple)

```typescript
/**
 * Handler for text content.
 * Simplest handler - adds formatted text to chapters.
 */
export class TextHandler implements ContentHandler {
  readonly type = 'text';
  readonly displayName = 'Text';
  readonly description = 'Add formatted text content';

  canHandle(data: any): boolean {
    return data.type === 'text' && data.text;
  }

  validate(data: any): ValidationResult {
    if (!data.text) {
      return {
        valid: false,
        error: 'Text content is required',
        errors: [{ field: 'text', message: 'Required', value: data.text }]
      };
    }
    return { valid: true };
  }

  async addToChapter(
    builder: ChapterBuilder,
    data: any,
    context: HandlerContext
  ): Promise<void> {
    if (context.verbose) {
      context.logger.info(`Adding text: "${data.title || 'Untitled'}"`);
    }

    builder.addTextPage(data.title || '', data.text);
  }

  getRequiredLibraries(): string[] {
    return []; // Text uses H5P.AdvancedText, already included
  }
}
```

### 2. QuizHandler (AI-Powered)

```typescript
/**
 * Handler for AI-generated quizzes.
 * Uses QuizGenerator to create questions from source text.
 */
export class QuizHandler implements ContentHandler {
  readonly type = 'ai-quiz';
  readonly displayName = 'AI Quiz';
  readonly description = 'Generate quiz questions using AI';

  canHandle(data: any): boolean {
    return data.type === 'ai-quiz' && data.sourceText;
  }

  validate(data: any): ValidationResult {
    const errors: any[] = [];

    if (!data.sourceText) {
      errors.push({
        field: 'sourceText',
        message: 'Source text for quiz generation is required',
        value: data.sourceText
      });
    }

    if (data.questionCount && (data.questionCount < 1 || data.questionCount > 20)) {
      errors.push({
        field: 'questionCount',
        message: 'Question count must be between 1 and 20',
        value: data.questionCount
      });
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? 'Validation failed' : undefined,
      errors
    };
  }

  async addToChapter(
    builder: ChapterBuilder,
    data: any,
    context: HandlerContext
  ): Promise<void> {
    const questionCount = data.questionCount || 5;

    if (context.verbose) {
      context.logger.info(`Generating AI quiz: "${data.title || 'Quiz'}"`);
      context.logger.info(`  Source text: ${data.sourceText.length} characters`);
      context.logger.info(`  Questions: ${questionCount}`);
    }

    try {
      // Use QuizGenerator from context
      const quizContent = await context.quizGenerator.generateH5pQuiz(
        data.sourceText,
        questionCount
      );

      builder.addQuizPage(quizContent);

      if (context.verbose) {
        context.logger.info(`  Generated ${quizContent.length} questions`);
      }
    } catch (error) {
      context.logger.error(`Quiz generation failed: ${error.message}`);

      // Add error message as text instead
      builder.addTextPage(
        data.title || 'Quiz',
        `Quiz generation failed: ${error.message}\n\nSource text: ${data.sourceText}`
      );
    }
  }

  getRequiredLibraries(): string[] {
    return ['H5P.MultiChoice'];
  }
}
```

### 3. VideoHandler (Media Content)

```typescript
/**
 * Handler for video content.
 * Embeds videos in Interactive Books.
 */
export class VideoHandler implements ContentHandler {
  readonly type = 'video';
  readonly displayName = 'Video';
  readonly description = 'Embed video content';

  canHandle(data: any): boolean {
    return data.type === 'video' && (data.url || data.path);
  }

  validate(data: any): ValidationResult {
    if (!data.url && !data.path) {
      return {
        valid: false,
        error: 'Video URL or path is required',
        errors: [{ field: 'url/path', message: 'Required' }]
      };
    }
    return { valid: true };
  }

  async addToChapter(
    builder: ChapterBuilder,
    data: any,
    context: HandlerContext
  ): Promise<void> {
    if (context.verbose) {
      context.logger.info(`Adding video: "${data.title || 'Video'}"`);
      context.logger.info(`  Source: ${data.url || data.path}`);
    }

    // Use ChapterBuilder's video method (to be added)
    builder.addVideoPage(
      data.title || 'Video',
      data.url || data.path,
      {
        autoplay: data.autoplay || false,
        controls: data.controls !== false
      }
    );
  }

  getRequiredLibraries(): string[] {
    return ['H5P.Video'];
  }
}
```

### 4. FlashcardsHandler (Composable Content)

```typescript
/**
 * Handler for flashcards embedded in Interactive Books.
 * Demonstrates handler composability.
 */
export class FlashcardsHandler implements ContentHandler {
  readonly type = 'flashcards';
  readonly displayName = 'Flashcards';
  readonly description = 'Embed flashcard practice';

  canHandle(data: any): boolean {
    return data.type === 'flashcards' && Array.isArray(data.cards);
  }

  validate(data: any): ValidationResult {
    if (!data.cards || data.cards.length === 0) {
      return {
        valid: false,
        error: 'At least one flashcard is required',
        errors: [{ field: 'cards', message: 'Required' }]
      };
    }
    return { valid: true };
  }

  async addToChapter(
    builder: ChapterBuilder,
    data: any,
    context: HandlerContext
  ): Promise<void> {
    if (context.verbose) {
      context.logger.info(`Adding flashcards: "${data.title || 'Flashcards'}"`);
      context.logger.info(`  Cards: ${data.cards.length}`);
    }

    // Build H5P.Flashcards structure
    const flashcardsContent = {
      cards: data.cards.map((card: any) => ({
        text: card.question || card.front,
        answer: card.answer || card.back,
        tip: card.hint || card.tip
      })),
      description: data.description || 'Practice with flashcards',
      progressText: 'Card @card of @total',
      next: 'Next',
      previous: 'Previous',
      checkAnswer: 'Check',
      showSolution: 'Show solution',
      retry: 'Retry'
    };

    // Add as H5P.Flashcards sub-content
    builder.addFlashcardsPage(flashcardsContent);
  }

  getRequiredLibraries(): string[] {
    return ['H5P.Flashcards'];
  }
}
```

---

## Migration Path

### From Current Code to Handlers

**Current: Hardcoded Switch Statement**
```typescript
// interactive-book-ai-module.ts
private async processContentItem(item, chapterBuilder, quizGenerator, verbose) {
  switch (item.type) {
    case "text":
      chapterBuilder.addTextPage(item.title, item.text);
      break;
    case "ai-quiz":
      const quiz = await quizGenerator.generateH5pQuiz(...);
      chapterBuilder.addQuizPage(quiz);
      break;
    // ... more hardcoded cases
  }
}
```

**Step 1: Extract to Handlers**
```typescript
// Create TextHandler
class TextHandler implements ContentHandler {
  async addToChapter(builder, data, context) {
    builder.addTextPage(data.title, data.text);
  }
}

// Create QuizHandler
class QuizHandler implements ContentHandler {
  async addToChapter(builder, data, context) {
    const quiz = await context.quizGenerator.generateH5pQuiz(...);
    builder.addQuizPage(quiz);
  }
}
```

**Step 2: Use Handler Registry**
```typescript
// interactive-book-ai-module.ts
private handlerRegistry = new HandlerRegistry();

constructor() {
  this.handlerRegistry.register(new TextHandler());
  this.handlerRegistry.register(new QuizHandler());
  // ... register all handlers
}

private async processContentItem(item, chapterBuilder, context) {
  const handler = this.handlerRegistry.getHandler(item.type);

  if (handler) {
    await handler.addToChapter(chapterBuilder, item, context);
  } else {
    console.warn(`Unknown content type: ${item.type}`);
  }
}
```

**Result:** Same functionality, but extensible!

### Backward Compatibility

✅ **YAML format unchanged**
- Existing YAML files work without modification
- Same content types supported

✅ **CLI commands unchanged**
- `node ./dist/index.js interactivebook-ai ...` works as before

✅ **Output identical**
- Generated .h5p files are byte-identical

### Benefits After Migration

✅ **Add new content types easily**
```typescript
// Adding video support:
handlerRegistry.register(new VideoHandler());

// That's it! Now YAML can use:
# - type: video
#   url: https://youtube.com/...
```

✅ **Test handlers independently**
```typescript
// Unit test just the QuizHandler
const handler = new QuizHandler();
const result = handler.validate({ sourceText: '...', questionCount: 5 });
expect(result.valid).toBe(true);
```

✅ **Community can contribute**
```typescript
// Someone creates TimelineHandler
import { CommunityTimelineHandler } from 'h5p-timeline-handler';
handlerRegistry.register(new CommunityTimelineHandler());
// Works immediately!
```

---

## Summary

### What We're Building

A **handler-enhanced template-free compiler** that:

1. ✅ Keeps existing template-free architecture
2. ✅ Adds composable handler system
3. ✅ Supports CLI (YAML) and Frontend (JSON) workflows
4. ✅ Enables AI-powered content generation
5. ✅ Allows community extensions

### Key Innovations

| Feature | How It Works |
|---------|--------------|
| **Template-FREE** | Uses ContentBuilder/ChapterBuilder programmatically |
| **Multi-Input** | YAML, CSV, JSON all convert to BookDefinition |
| **AI-Native** | Handlers use QuizGenerator and future AI services |
| **Composable** | Mix any content types in any order |
| **Frontend-Ready** | SvelteKit uses same handlers as CLI |

### Next Steps

1. **Week 1:** Create core handler infrastructure
2. **Week 2:** Migrate InteractiveBookAIModule to use handlers
3. **Week 3:** Add new handlers (flashcards, video, etc.)
4. **Week 4:** Prepare SvelteKit integration example

This architecture positions your H5P compiler as **the most flexible and extensible H5P generation system available**, with a clear path from CLI tools to full-featured web applications.
