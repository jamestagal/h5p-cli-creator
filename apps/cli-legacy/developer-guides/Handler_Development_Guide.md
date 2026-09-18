# Handler Development Guide

This guide explains how to create new content handlers for the H5P CLI Creator's handler-based architecture.

**IMPORTANT ARCHITECTURAL DECISIONS:**

1. **STANDALONE FIRST FOR RUNNABLE CONTENT**: If your content type can be a standalone H5P package (not just embedded in Interactive Book), create the standalone handler FIRST, then create the embedded version. Examples: Accordion, Quiz, Flashcards, Dialog Cards.

2. **YAML/JSON OVER CSV**: This project is designed for SvelteKit frontend integration. All new handlers should be designed for YAML/JSON input. CSV modules are legacy.

3. **AI INTEGRATION PATTERN**: Use `AIPromptBuilder.resolveConfig()` for hierarchical config and `AIPromptBuilder.buildSystemPrompt()` for formatting instructions.

## Table of Contents

1. [Overview](#overview)
2. [Handler Interface](#handler-interface)
3. [Creating a New Handler](#creating-a-new-handler)
4. [AI Handler Pattern](#ai-handler-pattern)
5. [Handler Registration](#handler-registration)
6. [Best Practices](#best-practices)
7. [Examples](#examples)

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

### Step 1: Determine Handler Type and Location

**CRITICAL DECISION:** Is your content type runnable as standalone H5P?

- **Runnable content** (can be standalone H5P package): Create standalone handler FIRST, then embedded version
  - Examples: Accordion, Quiz, Flashcards, Dialog Cards
  - Strategy: Build standalone, then adapt for Interactive Book embedding

- **Embedded-only content** (only works inside Interactive Book): Create embedded handler only
  - Examples: Text, Image, Audio
  - These content types have no meaning outside of a container

**Handler directory structure:**

- **Core handlers** (text, image, audio): `src/handlers/core/`
- **AI handlers** (ai-quiz, ai-text, ai-accordion): `src/handlers/ai/`
- **Embedded handlers** (flashcards, dialogcards, accordion): `src/handlers/embedded/`

**File naming convention:** `[ContentType]Handler.ts` (e.g., `AccordionHandler.ts`, `AIAccordionHandler.ts`)

**IMPORTANT:** AI handlers belong in `src/handlers/ai/`, NOT in `src/handlers/embedded/`, even if they generate embedded content.

### Step 2: Define Content Interface

Define a TypeScript interface for your content structure:

```typescript
/**
 * Example for manual content
 */
export interface AccordionContent {
  type: "accordion";
  title?: string;
  panels: Array<{
    title: string;
    content: string;
  }>;
  hTag?: "h2" | "h3" | "h4";  // Content structure parameter
}

/**
 * Example for AI-generated content
 */
export interface AIAccordionContent {
  type: "ai-accordion";
  title?: string;
  prompt: string;
  panelCount?: number;
  style?: "faq" | "glossary" | "general";  // Content structure parameter
  aiConfig?: {  // Universal AI Configuration
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}
```

**Key considerations:**
- Include the `type` field matching your content type identifier
- Mark optional fields with `?`
- For AI handlers, include optional `aiConfig` for Universal AI Configuration
- Content structure parameters (like `style`, `hTag`) are separate from `aiConfig`

### Step 3: Implement the Handler

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

### Step 4: Implement Processing Logic

Use the `HandlerContext` to access the ChapterBuilder and add content:

```typescript
public async process(context: HandlerContext, item: MyContent): Promise<void> {
  const { chapterBuilder, logger, options } = context;

  // BEST PRACTICE: Log progress in verbose mode
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

**IMPORTANT:** Always use `escapeHtml()` for user-provided text to prevent XSS:

```typescript
private escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>\"']/g, m => map[m]);
}
```

### Step 5: Implement Comprehensive Validation

Validate ALL required fields, types, and constraints:

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

  // Validate arrays (Example from AccordionHandler)
  if (!Array.isArray(item.panels)) {
    return { valid: false, error: "Accordion requires 'panels' array" };
  }
  if (item.panels.length === 0) {
    return { valid: false, error: "Accordion must have at least one panel" };
  }

  // Validate enum values (Example from AccordionHandler)
  if (item.hTag && !["h2", "h3", "h4"].includes(item.hTag)) {
    return { valid: false, error: "hTag must be one of: h2, h3, h4" };
  }

  // All validations passed
  return { valid: true };
}
```

**Validation best practices:**
- Validate ALL required fields
- Check types explicitly (`typeof`, `Array.isArray`)
- Provide clear, actionable error messages
- Validate nested structures (arrays, objects)
- Check for empty arrays if they shouldn't be empty
- Validate enum values with explicit checks

### Step 6: Declare Required Libraries

Return an array of H5P library identifiers your handler needs:

```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.AdvancedText", "H5P.Image"];
}
```

**IMPORTANT:** Include ALL libraries your handler uses:
- Main library (e.g., `"H5P.Accordion"`)
- Nested libraries (e.g., `"H5P.AdvancedText"` for accordion panels)
- The LibraryRegistry will automatically resolve transitive dependencies

## AI Handler Pattern

AI handlers follow a specific pattern for generating content using LLMs. This section covers critical patterns learned from production implementations.

### Core Principles

1. **AIPromptBuilder Integration**: Use static methods for config resolution and system prompt generation
2. **QuizGenerator.generateRawContent()**: Public method for custom AI content generation
3. **HTML Safety Net**: Always strip HTML from AI responses before wrapping in proper tags
4. **Fallback Behavior**: Provide minimal functional content when AI generation fails
5. **Style Parameters**: Separate content structure from AI behavior configuration

### AIPromptBuilder Static Methods

**CRITICAL:** `AIPromptBuilder` methods are **STATIC**, not instance methods.

```typescript
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

public async process(context: HandlerContext, item: AIContent): Promise<void> {
  const { quizGenerator, logger, options } = context;

  // ✅ CORRECT: Static method calls
  const resolvedConfig = AIPromptBuilder.resolveConfig(
    item.aiConfig as any,
    context.chapterConfig,
    context.bookConfig
  );
  const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

  // ❌ WRONG: Instance method calls
  // const systemPrompt = aiPromptBuilder.buildPrompt(...);  // ERROR!
}
```

### Config Resolution Hierarchy

The `resolveConfig()` method merges AI configuration from three levels:

```typescript
const resolvedConfig = AIPromptBuilder.resolveConfig(
  item.aiConfig,        // Item-level (highest priority)
  context.chapterConfig, // Chapter-level
  context.bookConfig    // Book-level (lowest priority)
);
```

**Precedence:** item > chapter > book > system defaults

### System Prompt Generation

The `buildSystemPrompt()` method handles formatting instructions automatically:

```typescript
const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);
// System prompt includes:
// - Reading level instructions (e.g., "grade-6")
// - Tone guidance (e.g., "educational")
// - Output format (e.g., "plain-html")
// - Custom instructions from aiConfig.customization
```

**IMPORTANT:** Don't add formatting instructions to user prompts - the system prompt handles this.

### QuizGenerator.generateRawContent()

Use this public method to generate custom AI content:

```typescript
public async process(context: HandlerContext, item: AIContent): Promise<void> {
  const { quizGenerator } = context;

  try {
    // Resolve config and build system prompt
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig as any,
      context.chapterConfig,
      context.bookConfig
    );
    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // Build user prompt
    const userPrompt = `${item.prompt}\n\nGenerate exactly ${item.count} items...`;

    // Generate content
    const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

    // Parse and use response...
  } catch (error) {
    // Provide fallback...
  }
}
```

### HTML Stripping Pattern

AI responses may contain HTML despite system prompt instructions. Always strip as safety net:

```typescript
/**
 * Strips HTML tags from AI-generated content
 */
private stripHtml(text: string): string {
  return text
    .replace(/<\/?p>/gi, "")          // Remove <p> and </p>
    .replace(/<br\s*\/?>/gi, " ")     // Replace <br> with space
    .replace(/<[^>]+>/g, "")          // Remove all other tags
    .trim();
}

// Usage:
const cleanedContent = this.stripHtml(generatedData.content);
const h5pText = `<p>${this.escapeHtml(cleanedContent)}</p>`;
```

### Fallback Pattern

Always provide fallback content when AI generation fails:

```typescript
try {
  // AI generation...
} catch (error) {
  logger.warn(`      AI generation failed: ${error}`);

  // Provide minimal functional fallback
  const fallbackContent = {
    library: "H5P.AdvancedText 1.1",
    params: {
      text: `<p>AI generation failed for: ${this.escapeHtml(item.prompt)}</p>`
    },
    metadata: {
      title: "Fallback Content",
      license: "U",
      contentType: "Text"
    },
    subContentId: this.generateSubContentId()
  };

  chapterBuilder.addCustomContent(fallbackContent);
}
```

### Style Parameters vs AI Config

**Content structure parameters** (like `style`) are separate from **AI behavior configuration** (`aiConfig`):

```typescript
export interface AIAccordionContent {
  type: "ai-accordion";
  prompt: string;

  // Content structure parameter (how to organize output)
  style?: "faq" | "glossary" | "general";

  // AI behavior configuration (how to generate output)
  aiConfig?: {
    targetAudience?: string;  // Reading level
    tone?: string;            // Writing tone
    customization?: string;   // Custom instructions
  };
}
```

**How to use style parameters:**

```typescript
// Build user prompt with style-specific instructions
let styleInstructions = "";
if (item.style === "faq") {
  styleInstructions = "Each panel should be a question-and-answer pair...";
} else if (item.style === "glossary") {
  styleInstructions = "Each panel should define a key term...";
} else {
  styleInstructions = "Each panel should have a clear topic...";
}

const userPrompt = `${item.prompt}\n\n${styleInstructions}`;
```

**Why separate?**
- `style` controls **content structure** (FAQ vs glossary format)
- `aiConfig` controls **AI behavior** (reading level, tone)
- Both will be configurable in SvelteKit UI (separate dropdowns)

### Complete AI Handler Example

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

export interface AIAccordionContent {
  type: "ai-accordion";
  title?: string;
  prompt: string;
  panelCount?: number;
  style?: "faq" | "glossary" | "general";
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

export class AIAccordionHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-accordion";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return { valid: false, error: "AI accordion requires 'prompt' field (string)" };
    }

    if (item.style && !["faq", "glossary", "general"].includes(item.style)) {
      return { valid: false, error: "style must be one of: faq, glossary, general" };
    }

    return { valid: true };
  }

  public async process(context: HandlerContext, item: AIAccordionContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI accordion: "${item.title || 'Untitled'}"`);
    }

    try {
      // Resolve config and build system prompt
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        item.aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );
      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Build user prompt with style-specific instructions
      const style = item.style || "general";
      const panelCount = item.panelCount || 5;

      let styleInstructions = "";
      if (style === "faq") {
        styleInstructions = "Each panel should be a question-and-answer pair.";
      } else if (style === "glossary") {
        styleInstructions = "Each panel should define a key term.";
      } else {
        styleInstructions = "Each panel should have a clear topic.";
      }

      const userPrompt = `${item.prompt}\n\nGenerate exactly ${panelCount} accordion panels. ${styleInstructions}

Return a JSON array of objects with this structure:
[
  { "title": "Panel title", "content": "Panel content" },
  ...
]`;

      // Generate content
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      // Parse JSON (strip code fences if present)
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const panels = JSON.parse(cleaned);

      // Strip HTML as safety net
      const cleanedPanels = panels.map((panel: any) => ({
        title: panel.title,
        content: this.stripHtml(panel.content)
      }));

      // Build H5P structure
      const h5pContent = {
        library: "H5P.Accordion 1.0",
        params: {
          panels: cleanedPanels.slice(0, panelCount).map((panel: any) => ({
            title: panel.title,
            content: {
              library: "H5P.AdvancedText 1.1",
              params: {
                text: `<p>${this.escapeHtml(panel.content)}</p>`
              },
              subContentId: this.generateSubContentId(),
              metadata: {
                contentType: "Text",
                license: "U",
                title: "Untitled Text"
              }
            }
          })),
          hTag: "h2"
        },
        metadata: {
          title: item.title || "AI Generated Accordion",
          license: "U",
          contentType: "Accordion"
        },
        subContentId: this.generateSubContentId()
      };

      chapterBuilder.addCustomContent(h5pContent);

      if (options.verbose) {
        logger.log(`      Generated ${cleanedPanels.length} panels`);
      }
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);

      // Fallback
      chapterBuilder.addTextPage(
        item.title || "Accordion",
        `AI accordion generation failed for prompt: "${item.prompt}"`
      );
    }
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.Accordion"];
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>\"']/g, m => map[m]);
  }

  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
```

### Common AI Handler Issues

1. **"Property does not exist on type 'AIPromptBuilder'"**
   - AIPromptBuilder methods are STATIC
   - Use: `AIPromptBuilder.resolveConfig()` NOT `aiPromptBuilder.resolveConfig()`

2. **"AI generation not working, using fallback"**
   - Check if `generateRawContent()` is public in QuizGenerator
   - Verify AI API keys are set (ANTHROPIC_API_KEY or GOOGLE_API_KEY)
   - Check console logs for detailed error messages

3. **"HTML tags appearing in content"**
   - Add HTML stripping before wrapping in proper tags
   - Use `stripHtml()` method before `escapeHtml()`

4. **"Handler file in wrong location"**
   - AI handlers go in `src/handlers/ai/`
   - Check for old compiled files in `dist/` after moving

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

### Example 3: AI-Powered Accordion Handler (Production)

This is a real production example from the AIAccordionHandler:

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

export interface AIAccordionContent {
  type: "ai-accordion";
  title?: string;
  prompt: string;
  panelCount?: number;
  style?: "faq" | "glossary" | "general";
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

export class AIAccordionHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-accordion";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return { valid: false, error: "AI accordion requires 'prompt' field (string)" };
    }

    if (item.style && !["faq", "glossary", "general"].includes(item.style)) {
      return { valid: false, error: "style must be one of: faq, glossary, general" };
    }

    return { valid: true };
  }

  public async process(context: HandlerContext, item: AIAccordionContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI accordion: "${item.title || 'Untitled'}"`);
    }

    try {
      // CRITICAL: Use AIPromptBuilder static methods
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        item.aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );
      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Build user prompt with style-specific instructions
      const style = item.style || "general";
      const panelCount = item.panelCount || 5;

      let styleInstructions = "";
      if (style === "faq") {
        styleInstructions = "Each panel should be a question-and-answer pair.";
      } else if (style === "glossary") {
        styleInstructions = "Each panel should define a key term.";
      } else {
        styleInstructions = "Each panel should have a clear topic.";
      }

      const userPrompt = `${item.prompt}\n\nGenerate exactly ${panelCount} accordion panels. ${styleInstructions}

Return a JSON array of objects with this structure:
[
  { "title": "Panel title", "content": "Panel content" },
  ...
]`;

      // Generate content using QuizGenerator.generateRawContent()
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      // Parse JSON (strip code fences if present)
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const panels = JSON.parse(cleaned);

      // Strip HTML as safety net
      const cleanedPanels = panels.map((panel: any) => ({
        title: panel.title,
        content: this.stripHtml(panel.content)
      }));

      // Build H5P structure
      const h5pContent = {
        library: "H5P.Accordion 1.0",
        params: {
          panels: cleanedPanels.slice(0, panelCount).map((panel: any) => ({
            title: panel.title,
            content: {
              library: "H5P.AdvancedText 1.1",
              params: {
                text: `<p>${this.escapeHtml(panel.content)}</p>`
              },
              subContentId: this.generateSubContentId(),
              metadata: {
                contentType: "Text",
                license: "U",
                title: "Untitled Text"
              }
            }
          })),
          hTag: "h2"
        },
        metadata: {
          title: item.title || "AI Generated Accordion",
          license: "U",
          contentType: "Accordion"
        },
        subContentId: this.generateSubContentId()
      };

      chapterBuilder.addCustomContent(h5pContent);

      if (options.verbose) {
        logger.log(`      Generated ${cleanedPanels.length} panels`);
      }
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);

      // Fallback
      chapterBuilder.addTextPage(
        item.title || "Accordion",
        `AI accordion generation failed for prompt: "${item.prompt}"`
      );
    }
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.Accordion"];
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>\"']/g, m => map[m]);
  }

  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
