# Handler API Reference

Complete TypeScript interface documentation for the Handler-Enhanced Compiler Architecture.

## Table of Contents

1. [ContentHandler Interface](#contenthandler-interface)
2. [HandlerContext Interface](#handlercontext-interface)
3. [HandlerRegistry Class](#handlerregistry-class)
4. [ChapterBuilder API](#chapterbuilder-api)
5. [Content Type Definitions](#content-type-definitions)

## ContentHandler Interface

The core interface that all content handlers must implement.

```typescript
export interface ContentHandler {
  getContentType(): string;
  process(context: HandlerContext, item: any): Promise<void>;
  validate(item: any): { valid: boolean; error?: string };
  getRequiredLibraries(): string[];
}
```

### Methods

#### `getContentType(): string`

Returns the unique content type identifier for this handler.

**Returns:**
- `string`: Content type identifier (e.g., "text", "image", "ai-quiz")

**Example:**
```typescript
public getContentType(): string {
  return "text";
}
```

---

#### `process(context: HandlerContext, item: any): Promise<void>`

Processes a content item and adds it to the current chapter.

**Parameters:**
- `context` (HandlerContext): Execution context with utilities and dependencies
- `item` (any): Content item data with type-specific structure

**Returns:**
- `Promise<void>`: Resolves when processing completes

**Throws:**
- May throw errors for processing failures (e.g., file not found, API errors)

**Example:**
```typescript
public async process(context: HandlerContext, item: TextContent): Promise<void> {
  const { chapterBuilder, logger, options } = context;

  if (options.verbose) {
    logger.log(`Adding text page: "${item.title}"`);
  }

  chapterBuilder.addTextPage(item.title || "", item.text);
}
```

---

#### `validate(item: any): { valid: boolean; error?: string }`

Validates a content item's structure and required fields.

**Parameters:**
- `item` (any): Content item to validate

**Returns:**
- Object with:
  - `valid` (boolean): `true` if validation passes, `false` otherwise
  - `error?` (string): Optional error message describing validation failure

**Example:**
```typescript
public validate(item: any): { valid: boolean; error?: string } {
  if (!item.text || typeof item.text !== "string") {
    return { valid: false, error: "Text content must have a 'text' field (string)" };
  }
  return { valid: true };
}
```

---

#### `getRequiredLibraries(): string[]`

Returns H5P library identifiers required by this handler.

**Returns:**
- `string[]`: Array of library identifiers (e.g., `["H5P.AdvancedText"]`)

**Example:**
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.AdvancedText"];
}
```

---

## HandlerContext Interface

Provides shared utilities and dependencies to content handlers during processing.

```typescript
export interface HandlerContext {
  chapterBuilder: ChapterBuilder;
  libraryRegistry: LibraryRegistry;
  quizGenerator: QuizGenerator;
  logger: Logger;
  mediaFiles: MediaFile[];
  basePath: string;
  options: {
    verbose?: boolean;
    aiProvider?: "gemini" | "claude" | "auto";
  };
}
```

### Properties

#### `chapterBuilder: ChapterBuilder`

ChapterBuilder instance for adding content to the current chapter.

**Usage:**
```typescript
context.chapterBuilder.addTextPage(title, text);
await context.chapterBuilder.addImagePage(title, path, alt);
```

**See:** [ChapterBuilder API](#chapterbuilder-api)

---

#### `libraryRegistry: LibraryRegistry`

Library registry for fetching H5P library metadata.

**Usage:**
```typescript
const library = await context.libraryRegistry.fetchLibrary("H5P.Image", "1.1");
```

---

#### `quizGenerator: QuizGenerator`

Quiz generator for AI-powered quiz creation.

**Usage:**
```typescript
const quiz = await context.quizGenerator.generateH5pQuiz(sourceText, questionCount);
```

**Note:** Only available when AI provider is configured (GOOGLE_API_KEY or ANTHROPIC_API_KEY).

---

#### `logger: Logger`

Logger for progress, warning, and error messages.

**Interface:**
```typescript
interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

**Usage:**
```typescript
context.logger.log("Processing content...");
context.logger.warn("Optional field missing, using default");
context.logger.error("Failed to process content");
```

---

#### `mediaFiles: MediaFile[]`

Array tracking media files added to the package.

**Type:**
```typescript
interface MediaFile {
  filename: string;
  buffer: Buffer;
}
```

**Usage:**
Typically managed automatically by ChapterBuilder. Handlers can reference for advanced use cases.

---

#### `basePath: string`

Base directory path for resolving relative file paths.

**Usage:**
```typescript
const absolutePath = path.resolve(context.basePath, relativePath);
```

---

#### `options: { verbose?: boolean; aiProvider?: string }`

Configuration options for content processing.

**Properties:**
- `verbose` (boolean, optional): Enable detailed logging
- `aiProvider` (string, optional): AI provider selection ("gemini", "claude", "auto")

**Usage:**
```typescript
if (context.options.verbose) {
  context.logger.log("Detailed progress information");
}
```

---

## HandlerRegistry Class

Singleton registry for managing content handlers.

```typescript
export class HandlerRegistry {
  public static getInstance(): HandlerRegistry;
  public register(handler: ContentHandler): void;
  public getHandler(contentType: string): ContentHandler | undefined;
  public getAllHandlers(): ContentHandler[];
  public getRequiredLibrariesForBook(bookDef: BookDefinition): string[];
}
```

### Methods

#### `static getInstance(): HandlerRegistry`

Get the singleton HandlerRegistry instance.

**Returns:**
- `HandlerRegistry`: Global registry instance

**Example:**
```typescript
const registry = HandlerRegistry.getInstance();
```

---

#### `register(handler: ContentHandler): void`

Register a content handler with the registry.

**Parameters:**
- `handler` (ContentHandler): Handler to register

**Throws:**
- Error if handler type already registered

**Example:**
```typescript
registry.register(new TextHandler());
registry.register(new ImageHandler());
```

---

#### `getHandler(contentType: string): ContentHandler | undefined`

Retrieve a handler by content type.

**Parameters:**
- `contentType` (string): Content type identifier

**Returns:**
- `ContentHandler | undefined`: Handler if found, undefined otherwise

**Example:**
```typescript
const handler = registry.getHandler("text");
if (handler) {
  await handler.process(context, item);
}
```

---

#### `getAllHandlers(): ContentHandler[]`

Get all registered handlers.

**Returns:**
- `ContentHandler[]`: Array of all registered handlers

**Example:**
```typescript
const handlers = registry.getAllHandlers();
console.log(`Registered ${handlers.length} handlers`);
```

---

#### `getRequiredLibrariesForBook(bookDef: BookDefinition): string[]`

Scan a BookDefinition and collect all required H5P libraries.

**Parameters:**
- `bookDef` (BookDefinition): Book definition to scan

**Returns:**
- `string[]`: Array of unique library identifiers

**Example:**
```typescript
const libraries = registry.getRequiredLibrariesForBook(bookDef);
// ["H5P.InteractiveBook", "H5P.AdvancedText", "H5P.Image"]
```

**Note:** Always includes "H5P.InteractiveBook" as base library.

---

## ChapterBuilder API

Methods for adding content to chapters.

### Text Content

#### `addTextPage(title: string, text: string): this`

Add a formatted text page to the chapter.

**Parameters:**
- `title` (string): Page title (displayed as H2 heading)
- `text` (string): Text content (supports paragraphs with double newlines)

**Returns:**
- `this`: ChapterBuilder for method chaining

**Example:**
```typescript
chapterBuilder.addTextPage(
  "Introduction",
  "Welcome to the chapter!\n\nThis is a new paragraph."
);
```

---

### Image Content

#### `addImagePage(title: string, imagePath: string, alt: string): Promise<this>`

Add an image page to the chapter. Supports both local files and URLs.

**Parameters:**
- `title` (string): Page title
- `imagePath` (string): Path to image file or URL
- `alt` (string): Alt text for accessibility

**Returns:**
- `Promise<this>`: Resolves to ChapterBuilder for chaining

**Example:**
```typescript
// Local file
await chapterBuilder.addImagePage(
  "Diagram",
  "/path/to/image.jpg",
  "Flow diagram"
);

// URL
await chapterBuilder.addImagePage(
  "Photo",
  "https://example.com/photo.jpg",
  "Sample photo"
);
```

---

### Audio Content

#### `addAudioPage(title: string, audioPath: string): Promise<this>`

Add an audio page to the chapter. Supports both local files and URLs.

**Parameters:**
- `title` (string): Page title
- `audioPath` (string): Path to audio file or URL

**Returns:**
- `Promise<this>`: Resolves to ChapterBuilder for chaining

**Example:**
```typescript
// Local file
await chapterBuilder.addAudioPage(
  "Pronunciation",
  "/path/to/audio.mp3"
);

// URL
await chapterBuilder.addAudioPage(
  "Podcast",
  "https://example.com/audio.mp3"
);
```

---

### Quiz Content

#### `addQuizPage(quizContent: H5pMultipleChoiceContent[]): this`

Add quiz questions to the chapter.

**Parameters:**
- `quizContent` (H5pMultipleChoiceContent[]): Array of H5P.MultiChoice content structures

**Returns:**
- `this`: ChapterBuilder for method chaining

**Example:**
```typescript
const quiz = await quizGenerator.generateH5pQuiz(sourceText, 5);
chapterBuilder.addQuizPage(quiz);
```

---

### Custom Content

#### `addCustomContent(content: any): this`

Add custom H5P content to the chapter.

**Parameters:**
- `content` (any): H5P content structure

**Returns:**
- `this`: ChapterBuilder for method chaining

**Example:**
```typescript
chapterBuilder.addCustomContent({
  library: "H5P.Flashcards 1.5",
  params: {
    cards: [
      { text: "Front", answer: "Back" }
    ]
  },
  metadata: {
    contentType: "Flashcards",
    license: "U",
    title: "Practice Cards"
  }
});
```

---

## Content Type Definitions

TypeScript interfaces for content items.

### Base Types

```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz";

export interface ContentItem {
  type: ContentType;
}

export type AnyContentItem =
  | TextContent
  | AITextContent
  | ImageContent
  | AudioContent
  | AIQuizContent;
```

---

### TextContent

```typescript
export interface TextContent extends ContentItem {
  type: "text";
  text: string;
  title?: string;
}
```

**Example:**
```yaml
- type: text
  title: "Introduction"
  text: "Welcome to the chapter!"
```

---

### ImageContent

```typescript
export interface ImageContent extends ContentItem {
  type: "image";
  path: string;
  alt: string;
  title?: string;
}
```

**Example:**
```yaml
- type: image
  title: "Diagram"
  path: "./images/chart.png"
  alt: "Data flow chart"
```

---

### AudioContent

```typescript
export interface AudioContent extends ContentItem {
  type: "audio";
  path: string;
  title?: string;
}
```

**Example:**
```yaml
- type: audio
  title: "Pronunciation"
  path: "./audio/example.mp3"
```

---

### AITextContent

```typescript
export interface AITextContent extends ContentItem {
  type: "ai-text";
  prompt: string;
  title?: string;
}
```

**Example:**
```yaml
- type: ai-text
  title: "Overview"
  prompt: "Explain photosynthesis in simple terms"
```

---

### AIQuizContent

```typescript
export interface AIQuizContent extends ContentItem {
  type: "ai-quiz";
  sourceText: string;
  questionCount?: number;
  title?: string;
}
```

**Example:**
```yaml
- type: ai-quiz
  title: "Practice Quiz"
  sourceText: "Photosynthesis is the process..."
  questionCount: 5
```

---

### BookDefinition

```typescript
export interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  chapters: ChapterDefinition[];
}

export interface ChapterDefinition {
  title: string;
  content: AnyContentItem[];
}
```

**Example:**
```yaml
title: "My Interactive Book"
language: "en"
description: "Educational content"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Content here"
```

---

## Related Documentation

- [Handler Development Guide](./Handler_Development_Guide.md) - Step-by-step tutorial
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [README.md](../README.md) - Project overview

## Version History

- **v1.0.0** - Initial handler architecture release
