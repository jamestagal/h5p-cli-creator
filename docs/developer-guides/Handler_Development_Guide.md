# Handler Development Guide

This guide explains how to create new content handlers for the H5P CLI Creator's handler-based architecture.

## Table of Contents

1. [Overview](#overview)
2. [Handler Interface](#handler-interface)
3. [Creating a New Handler](#creating-a-new-handler)
4. [Handler Registration](#handler-registration)
5. [Best Practices](#best-practices)
6. [Examples](#examples)

## Overview

The Handler-Enhanced Compiler Architecture uses content handlers to process different types of content in Interactive Books. Each handler is a self-contained module that:

- Identifies its content type (e.g., "text", "image", "ai-quiz")
- Validates content structure
- Processes content and adds it to chapters
- Declares required H5P libraries

Handlers are **composable** - they work independently and can be combined in any order within chapters.

## Handler Interface

All handlers must implement the `ContentHandler` interface:

```typescript
export interface ContentHandler {
  /**
   * Unique content type identifier (e.g., "text", "image", "ai-quiz")
   */
  getContentType(): string;

  /**
   * Process a content item and add it to the chapter via context
   */
  process(context: HandlerContext, item: any): Promise<void>;

  /**
   * Validate if this handler can process the given content item
   */
  validate(item: any): { valid: boolean; error?: string };

  /**
   * Get H5P libraries required by this handler
   */
  getRequiredLibraries(): string[];
}
```

### Method Descriptions

#### `getContentType(): string`

Returns a unique string identifier for this content type. This matches the `type` field in YAML/JSON content items.

**Example:**
```typescript
public getContentType(): string {
  return "text"; // Matches { type: "text", ... }
}
```

#### `process(context: HandlerContext, item: any): Promise<void>`

Processes a content item and adds it to the current chapter. This is where your handler's main logic lives.

**Parameters:**
- `context`: HandlerContext with access to ChapterBuilder, registries, logger, etc.
- `item`: The content item data (type-specific structure)

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

#### `validate(item: any): { valid: boolean; error?: string }`

Validates the structure and required fields of a content item. Called before `process()` to ensure data integrity.

**Returns:**
- `{ valid: true }` if validation passes
- `{ valid: false, error: "Description" }` if validation fails

**Example:**
```typescript
public validate(item: any): { valid: boolean; error?: string } {
  if (!item.text || typeof item.text !== "string") {
    return { valid: false, error: "Text content must have a 'text' field (string)" };
  }
  return { valid: true };
}
```

#### `getRequiredLibraries(): string[]`

Returns an array of H5P library identifiers required by this handler. Used for dynamic library resolution during package assembly.

**Example:**
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.AdvancedText"];
}
```

## Creating a New Handler

### Step 1: Create Handler File

Create a new TypeScript file in the appropriate directory:

- **Core handlers** (text, image, audio): `src/handlers/core/`
- **AI handlers** (ai-quiz, ai-text): `src/handlers/ai/`
- **Embedded handlers** (flashcards, dialogcards): `src/handlers/embedded/`
- **Custom handlers**: Choose appropriate directory or create new category

**File naming convention:** `[ContentType]Handler.ts` (e.g., `TextHandler.ts`)

### Step 2: Implement the Interface

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

export class MyContentHandler implements ContentHandler {
  public getContentType(): string {
    return "my-content";
  }

  public async process(context: HandlerContext, item: any): Promise<void> {
    // Your processing logic here
  }

  public validate(item: any): { valid: boolean; error?: string } {
    // Your validation logic here
  }

  public getRequiredLibraries(): string[] {
    // Return required H5P libraries
  }
}
```

### Step 3: Implement Processing Logic

Use the `HandlerContext` to access the ChapterBuilder and add content:

```typescript
public async process(context: HandlerContext, item: MyContent): Promise<void> {
  const { chapterBuilder, logger, options } = context;

  // Optional: Log progress in verbose mode
  if (options.verbose) {
    logger.log(`    - Adding ${this.getContentType()} page: "${item.title}"`);
  }

  // Add content using ChapterBuilder methods
  chapterBuilder.addTextPage(item.title, item.content);
  // or
  await chapterBuilder.addImagePage(item.title, item.path, item.alt);
  // or
  chapterBuilder.addCustomContent(myH5pStructure);
}
```

### Step 4: Implement Validation

Validate all required fields and data types:

```typescript
public validate(item: any): { valid: boolean; error?: string } {
  // Check required fields
  if (!item.requiredField) {
    return { valid: false, error: "Must have 'requiredField'" };
  }

  // Check field types
  if (typeof item.requiredField !== "string") {
    return { valid: false, error: "'requiredField' must be a string" };
  }

  // All validations passed
  return { valid: true };
}
```

### Step 5: Declare Required Libraries

Return an array of H5P library identifiers your handler needs:

```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.AdvancedText", "H5P.Image"];
}
```

## Handler Registration

### Registration at Startup

Handlers must be registered with the `HandlerRegistry` before use. This typically happens in the module initialization:

```typescript
import { HandlerRegistry } from "./handlers/HandlerRegistry";
import { TextHandler } from "./handlers/core/TextHandler";
import { ImageHandler } from "./handlers/core/ImageHandler";

// Get registry instance
const registry = HandlerRegistry.getInstance();

// Register handlers
registry.register(new TextHandler());
registry.register(new ImageHandler());
```

### Registration Order

Handlers are registered in a specific order for consistency:

1. Core handlers (text, image, audio)
2. AI handlers (ai-text, ai-quiz)
3. Embedded handlers (flashcards, dialogcards)
4. Custom handlers

The order doesn't affect functionality (handlers are independent), but it provides consistency for debugging and documentation.

## Best Practices

### Error Handling

**Always validate before processing:**
```typescript
const validation = handler.validate(item);
if (!validation.valid) {
  logger.error(`Validation failed: ${validation.error}`);
  return; // or throw error
}
```

**Handle async errors gracefully:**
```typescript
try {
  await chapterBuilder.addImagePage(title, path, alt);
} catch (error) {
  logger.error(`Failed to add image: ${error.message}`);
  // Provide fallback or rethrow
}
```

### Logging Guidelines

**Use verbose mode for detailed logging:**
```typescript
if (options.verbose) {
  logger.log(`    - Processing ${item.title}`);
  logger.log(`      File: ${item.path}`);
}
```

**Always log errors and warnings:**
```typescript
logger.error("Failed to process content");
logger.warn("Missing optional field, using default");
```

### Working with ChapterBuilder

**Available methods:**
- `addTextPage(title: string, text: string)`: Add formatted text content
- `addImagePage(title: string, path: string, alt: string)`: Add image (local or URL)
- `addAudioPage(title: string, path: string)`: Add audio (local or URL)
- `addQuizPage(quizContent: H5pMultipleChoiceContent[])`: Add quiz questions
- `addCustomContent(content: any)`: Add any H5P content structure

**Example usage:**
```typescript
// Text page
chapterBuilder.addTextPage("Introduction", "Welcome to the chapter!");

// Image page (handles local files and URLs automatically)
await chapterBuilder.addImagePage("Diagram", "./images/chart.png", "Data chart");

// Custom H5P content
chapterBuilder.addCustomContent({
  library: "H5P.CustomLibrary 1.0",
  params: { /* custom params */ },
  metadata: { /* metadata */ }
});
```

### Type Safety

**Define TypeScript interfaces for your content:**
```typescript
interface MyContent extends ContentItem {
  type: "my-content";
  requiredField: string;
  optionalField?: number;
}

public async process(context: HandlerContext, item: MyContent): Promise<void> {
  // TypeScript knows item structure
  console.log(item.requiredField); // Type-safe
}
```

### Media File Handling

**Use H5pImage and H5pAudio helpers:**
```typescript
import { H5pImage } from "../../models/h5p-image";

// ChapterBuilder handles this automatically, but if you need manual control:
const { image, buffer, extension } = await H5pImage.fromLocalFile(path);
// or
const { image, buffer, extension } = await H5pImage.fromDownload(url);
```

## Examples

### Example 1: Simple Text Handler

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { TextContent } from "../../compiler/YamlInputParser";

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

### Example 2: Image Handler with Media Processing

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { ImageContent } from "../../compiler/YamlInputParser";

export class ImageHandler implements ContentHandler {
  public getContentType(): string {
    return "image";
  }

  public async process(context: HandlerContext, item: ImageContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding image page: "${item.title || item.alt}"`);
    }

    // ChapterBuilder automatically handles local files and URLs
    await chapterBuilder.addImagePage(item.title || "", item.path, item.alt);
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.path || typeof item.path !== "string") {
      return { valid: false, error: "Image content must have a 'path' field (string)" };
    }
    if (!item.alt || typeof item.alt !== "string") {
      return { valid: false, error: "Image content must have an 'alt' field (string)" };
    }
    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.Image"];
  }
}
```

### Example 3: AI-Powered Quiz Handler

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIQuizContent } from "../../compiler/YamlInputParser";

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
      // Use QuizGenerator from context
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
      return {
        valid: false,
        error: "AI quiz content must have a 'sourceText' field (string)"
      };
    }
    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.MultiChoice"];
  }
}
```

## Testing Your Handler

Create unit tests for your handler:

```typescript
import { MyContentHandler } from "../../../src/handlers/MyContentHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";

describe("MyContentHandler", () => {
  let handler: MyContentHandler;
  let mockContext: HandlerContext;

  beforeEach(() => {
    handler = new MyContentHandler();
    mockContext = {
      chapterBuilder: {
        addTextPage: jest.fn(),
      },
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      options: { verbose: true },
    } as any;
  });

  it("should return correct content type", () => {
    expect(handler.getContentType()).toBe("my-content");
  });

  it("should validate valid content", () => {
    const item = { type: "my-content", requiredField: "value" };
    const result = handler.validate(item);
    expect(result.valid).toBe(true);
  });

  it("should process content correctly", async () => {
    const item = { type: "my-content", requiredField: "value" };
    await handler.process(mockContext, item);
    expect(mockContext.chapterBuilder.addTextPage).toHaveBeenCalled();
  });
});
```

## Next Steps

- Review the [API Reference](./Handler_API_Reference.md) for complete interface documentation
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines
- Check existing handlers in `src/handlers/` for more examples

## Questions?

Open an issue on GitHub or refer to the project documentation for more information.
