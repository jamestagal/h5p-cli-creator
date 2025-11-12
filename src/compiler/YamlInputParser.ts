import * as yaml from "js-yaml";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { AIConfiguration } from "./types";

/**
 * Content directive types that can be specified in YAML
 *
 * Phase 1 (YouTube Story Extraction): Added "youtube-intro" and "youtube-page" types
 * - youtube-intro: YouTube video embed + transcript accordion (first page)
 * - youtube-page: Story page with audio segment + Vietnamese/English text (optional, can reuse "text" type)
 * - video: H5P.Video content for YouTube embeds (using proper H5P.Video library)
 */
export type ContentType = "text" | "image" | "audio" | "video" | "ai-text" | "ai-quiz" | "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set" | "dragtext" | "drag-the-words" | "ai-dragtext" | "ai-drag-the-words" | "blanks" | "fill-in-the-blanks" | "ai-blanks" | "ai-fill-in-the-blanks" | "essay" | "ai-essay" | "truefalse" | "true-false" | "ai-truefalse" | "ai-true-false" | "crossword" | "ai-crossword" | "youtube-intro" | "youtube-page";

/**
 * Base content item interface
 */
export interface ContentItem {
  type: ContentType;
}

/**
 * Text content with explicit text
 */
export interface TextContent extends ContentItem {
  type: "text";
  text: string;
  title?: string;
}

/**
 * AI-generated text content
 *
 * Supports optional AI configuration for item-level overrides.
 * Configuration precedence: item.aiConfig > chapter.aiConfig > book.aiConfig > system defaults
 */
export interface AITextContent extends ContentItem {
  type: "ai-text";
  prompt: string;
  title?: string;
  /**
   * Optional AI configuration for this specific content item.
   *
   * Overrides chapter-level and book-level AI configuration.
   * Use this when you need different reading level, tone, or customization
   * for a specific item within a chapter.
   *
   * @example
   * {
   *   type: "ai-text",
   *   prompt: "Explain quantum physics",
   *   aiConfig: {
   *     targetAudience: "college",  // Override book's "grade-6" setting
   *     tone: "academic"
   *   }
   * }
   */
  aiConfig?: AIConfiguration;
}

/**
 * Image content
 */
export interface ImageContent extends ContentItem {
  type: "image";
  path: string;
  alt: string;
  title?: string;
}

/**
 * Audio content
 */
export interface AudioContent extends ContentItem {
  type: "audio";
  path: string;
  title?: string;
}

/**
 * Video content (YouTube)
 */
export interface VideoContent extends ContentItem {
  type: "video";
  url: string;
  title?: string;
}

/**
 * AI-generated quiz content
 *
 * Supports optional AI configuration for item-level overrides.
 * Configuration precedence: item.aiConfig > chapter.aiConfig > book.aiConfig > system defaults
 */
export interface AIQuizContent extends ContentItem {
  type: "ai-quiz";
  sourceText: string;
  questionCount?: number;
  title?: string;
  /**
   * Optional AI configuration for this specific quiz.
   *
   * Overrides chapter-level and book-level AI configuration.
   * Use this to adjust question difficulty, vocabulary level, or add
   * specific customization for this quiz.
   *
   * @example
   * {
   *   type: "ai-quiz",
   *   sourceText: "Photosynthesis is...",
   *   questionCount: 5,
   *   aiConfig: {
   *     targetAudience: "esl-beginner",
   *     customization: "Use only present tense. Avoid idioms."
   *   }
   * }
   */
  aiConfig?: AIConfiguration;
}

/**
 * Flashcards content
 */
export interface FlashcardsContent extends ContentItem {
  type: "flashcards";
  title?: string;
  description?: string;
  cards: Array<{
    question: string;
    answer: string;
    tip?: string;
    image?: string;
  }>;
}

/**
 * Dialog cards content
 */
export interface DialogCardsContent extends ContentItem {
  type: "dialogcards";
  title?: string;
  mode?: "normal" | "repetition";
  cards: Array<{
    front: string;
    back: string;
    image?: string;
    audio?: string;
  }>;
}

// Export accordion content types
export { AccordionContent } from "../handlers/embedded/AccordionHandler";
export { AIAccordionContent } from "../handlers/ai/AIAccordionHandler";

// Export single choice set content types
export { SingleChoiceSetContent } from "../handlers/embedded/SingleChoiceSetHandler";
export { AISingleChoiceSetContent } from "../handlers/ai/AISingleChoiceSetHandler";

// Export drag text content types
export { DragTextContent } from "../handlers/embedded/DragTextHandler";
export { AIDragTextContent } from "../handlers/ai/AIDragTextHandler";

// Export blanks content types
export { BlanksContent } from "../handlers/embedded/BlanksHandler";
export { AIBlanksContent } from "../handlers/ai/AIBlanksHandler";

// Export essay content types
export { EssayContent } from "../handlers/embedded/EssayHandler";
export { AIEssayContent } from "../handlers/ai/AIEssayHandler";

// Export true/false content types
export { TrueFalseContent } from "../handlers/embedded/TrueFalseHandler";
export { AITrueFalseContent } from "../handlers/ai/AITrueFalseHandler";

// Export crossword content types
export { CrosswordContent } from "../handlers/embedded/CrosswordHandler";
export { AICrosswordContent } from "../handlers/ai/AICrosswordHandler";

/**
 * Union type for all content items
 */
export type AnyContentItem =
  | TextContent
  | AITextContent
  | ImageContent
  | AudioContent
  | AIQuizContent
  | FlashcardsContent
  | DialogCardsContent
  | import("../handlers/embedded/AccordionHandler").AccordionContent
  | import("../handlers/ai/AIAccordionHandler").AIAccordionContent
  | import("../handlers/embedded/SingleChoiceSetHandler").SingleChoiceSetContent
  | import("../handlers/ai/AISingleChoiceSetHandler").AISingleChoiceSetContent
  | import("../handlers/embedded/DragTextHandler").DragTextContent
  | import("../handlers/ai/AIDragTextHandler").AIDragTextContent
  | import("../handlers/embedded/BlanksHandler").BlanksContent
  | import("../handlers/ai/AIBlanksHandler").AIBlanksContent
  | import("../handlers/embedded/EssayHandler").EssayContent
  | import("../handlers/ai/AIEssayHandler").AIEssayContent
  | import("../handlers/embedded/TrueFalseHandler").TrueFalseContent
  | import("../handlers/ai/AITrueFalseHandler").AITrueFalseContent
  | import("../handlers/embedded/CrosswordHandler").CrosswordContent
  | import("../handlers/ai/AICrosswordHandler").AICrosswordContent;

/**
 * Chapter definition from YAML
 *
 * Supports optional AI configuration for chapter-level overrides.
 * Configuration hierarchy:
 * - item.aiConfig (highest priority)
 * - chapter.aiConfig (overrides book.aiConfig)
 * - book.aiConfig
 * - system defaults (lowest priority)
 */
export interface ChapterDefinition {
  title: string;
  content: AnyContentItem[];
  /**
   * Optional AI configuration for all AI-generated content in this chapter.
   *
   * Overrides book-level AI configuration for all AI content items in this chapter.
   * Individual items can still override with their own aiConfig.
   *
   * Use this when a specific chapter needs a different reading level or tone
   * than the rest of the book (e.g., an advanced chapter in an otherwise
   * beginner-level book).
   *
   * @example
   * {
   *   title: "Advanced Topics",
   *   aiConfig: {
   *     targetAudience: "college",  // Override book's "grade-6" setting
   *     tone: "academic"
   *   },
   *   content: [...]
   * }
   */
  aiConfig?: AIConfiguration;
}

/**
 * Complete book definition from YAML
 *
 * Supports optional AI configuration at the book level.
 * This is a UNIVERSAL configuration system that works for:
 * - Interactive Books (via YAML/JSON BookDefinition)
 * - Smart Import API (via request payload)
 * - Any AI-generated H5P content
 *
 * Configuration hierarchy (from highest to lowest priority):
 * 1. item.aiConfig (specific content item - highest priority)
 * 2. chapter.aiConfig (overrides book level)
 * 3. book.aiConfig (this field - overrides system defaults)
 * 4. System defaults (grade-6, educational, plain-html - lowest priority)
 *
 * All AI handlers should use AIPromptBuilder.resolveConfig() to properly merge
 * configurations from all three levels.
 */
export interface BookDefinition {
  title: string;
  language?: string;
  coverImage?: string;
  chapters: ChapterDefinition[];
  /**
   * Optional AI configuration for all AI-generated content in the book.
   *
   * Provides default AI configuration for all AI content types (ai-text, ai-quiz, ai-accordion, etc.)
   * Chapters can override with chapter.aiConfig, and individual items can override with item.aiConfig.
   *
   * Use this to set a consistent reading level and tone for the entire book,
   * while still allowing chapter-level and item-level customization.
   *
   * @example Book for middle school students:
   * {
   *   title: "Introduction to Biology",
   *   aiConfig: {
   *     targetAudience: "grade-6",
   *     tone: "educational",
   *     customization: "Use simple vocabulary. Define scientific terms."
   *   },
   *   chapters: [...]
   * }
   *
   * @example Book for advanced readers:
   * {
   *   title: "Advanced Quantum Mechanics",
   *   aiConfig: {
   *     targetAudience: "college",
   *     tone: "academic",
   *     customization: "Use formal mathematical notation. Assume calculus knowledge."
   *   },
   *   chapters: [...]
   * }
   *
   * Added in Phase 5: AI Configuration System
   */
  aiConfig?: AIConfiguration;
}

/**
 * Standalone content definition (no Interactive Book wrapper)
 *
 * Used for content types that should be generated as standalone H5P packages
 * rather than embedded in an Interactive Book. Some H5P content types (like Crossword)
 * are not supported as sub-content in Interactive Book and must be standalone.
 *
 * @example Standalone Crossword:
 * {
 *   title: "World Geography Crossword",
 *   language: "en",
 *   description: "Test your geography knowledge",
 *   content: {
 *     type: "crossword",
 *     words: [...]
 *   }
 * }
 *
 * @example Standalone AI Crossword:
 * {
 *   title: "Science Vocabulary Quiz",
 *   content: {
 *     type: "ai-crossword",
 *     prompt: "Create a crossword about photosynthesis",
 *     wordCount: 10
 *   },
 *   aiConfig: {
 *     targetAudience: "grade-6",
 *     tone: "educational"
 *   }
 * }
 */
export interface StandaloneDefinition {
  /**
   * Title of the standalone H5P content
   */
  title: string;

  /**
   * Language code (e.g., "en", "es", "fr")
   * Defaults to "en" if not specified
   */
  language?: string;

  /**
   * Optional description/task description for the content
   */
  description?: string;

  /**
   * Single content item (e.g., crossword, essay, blanks, etc.)
   */
  content: AnyContentItem;

  /**
   * Optional AI configuration for AI-generated standalone content
   * Only applies to AI content types (ai-crossword, ai-essay, etc.)
   */
  aiConfig?: AIConfiguration;
}

/**
 * Union type for either Interactive Book or Standalone content
 */
export type H5PDefinition = BookDefinition | StandaloneDefinition;

/**
 * Type guard to check if definition is standalone
 */
export function isStandaloneDefinition(def: H5PDefinition): def is StandaloneDefinition {
  return 'content' in def && !('chapters' in def);
}

/**
 * Type guard to check if definition is Interactive Book
 */
export function isBookDefinition(def: H5PDefinition): def is BookDefinition {
  return 'chapters' in def;
}

/**
 * YamlInputParser parses YAML definitions into structured H5P content definitions.
 *
 * Supports two formats:
 * 1. **Interactive Book** (with chapters) - Multiple content items organized in chapters
 * 2. **Standalone Content** (no chapters) - Single content type as standalone H5P package
 *
 * Supported content types:
 * - Multiple content types (text, image, audio, flashcards, dialog cards, accordion, single choice set, drag text, blanks, essay, true/false, crossword)
 * - AI-generated content (ai-text, ai-quiz, ai-accordion, ai-singlechoiceset, ai-dragtext, ai-blanks, ai-essay, ai-truefalse, ai-crossword)
 * - YouTube story content (youtube-intro, youtube-page) - Phase 1
 * - Book-level, chapter-level, and item-level AI configuration (Phase 5)
 * - Relative and absolute file paths
 * - Comprehensive validation
 *
 * Detection logic:
 * - If YAML has `chapters` field → Interactive Book (BookDefinition)
 * - If YAML has `content` field (no chapters) → Standalone (StandaloneDefinition)
 */
export class YamlInputParser {
  /**
   * Parses a YAML file into either a BookDefinition or StandaloneDefinition.
   * Automatically detects format based on presence of 'chapters' vs 'content' field.
   *
   * @param yamlFilePath Path to YAML file
   * @returns Parsed and validated H5PDefinition (BookDefinition or StandaloneDefinition)
   */
  public static parseYamlFile(yamlFilePath: string): H5PDefinition {
    if (!fsExtra.existsSync(yamlFilePath)) {
      throw new Error(`YAML file not found: ${yamlFilePath}`);
    }

    const yamlContent = fsExtra.readFileSync(yamlFilePath, "utf-8");
    const basePath = path.dirname(yamlFilePath);

    return this.parseYamlString(yamlContent, basePath);
  }

  /**
   * Parses YAML content string into either a BookDefinition or StandaloneDefinition.
   * Automatically detects format based on presence of 'chapters' vs 'content' field.
   *
   * @param yamlContent YAML content as string
   * @param basePath Base directory for resolving relative paths (defaults to current directory)
   * @returns Parsed and validated H5PDefinition (BookDefinition or StandaloneDefinition)
   */
  public static parseYamlString(yamlContent: string, basePath: string = process.cwd()): H5PDefinition {
    let parsed: any;

    try {
      parsed = yaml.load(yamlContent);
    } catch (error: any) {
      throw new Error(`Failed to parse YAML: ${error.message}`);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML content must be a valid object");
    }

    // Detect format: Interactive Book (chapters) vs Standalone (content)
    const hasChapters = 'chapters' in parsed;
    const hasContent = 'content' in parsed;

    if (hasChapters && hasContent) {
      throw new Error("YAML cannot have both 'chapters' and 'content' fields. Use 'chapters' for Interactive Book or 'content' for standalone content.");
    }

    if (!hasChapters && !hasContent) {
      throw new Error("YAML must have either 'chapters' (for Interactive Book) or 'content' (for standalone content).");
    }

    let definition: H5PDefinition;

    if (hasChapters) {
      // Interactive Book format
      definition = this.validateAndBuildBookDefinition(parsed);
    } else {
      // Standalone content format
      definition = this.validateAndBuildStandaloneDefinition(parsed);
    }

    // Resolve relative file paths to absolute paths
    this.resolveContentPaths(definition, basePath);

    return definition;
  }

  /**
   * Validates parsed YAML and constructs a BookDefinition.
   * @param data Parsed YAML data
   * @returns Validated BookDefinition
   */
  private static validateAndBuildBookDefinition(data: any): BookDefinition {
    // Validate book-level fields
    if (!data.title || typeof data.title !== "string") {
      throw new Error("Book must have a 'title' field (string)");
    }

    if (!data.chapters || !Array.isArray(data.chapters)) {
      throw new Error("Book must have a 'chapters' field (array)");
    }

    if (data.chapters.length === 0) {
      throw new Error("Book must have at least one chapter");
    }

    // Validate book-level aiConfig if present (Task 5.5.1)
    if (data.aiConfig) {
      this.validateAIConfig(data.aiConfig, "Book");
    }

    // Validate each chapter
    for (let i = 0; i < data.chapters.length; i++) {
      const chapter = data.chapters[i];

      if (!chapter.title || typeof chapter.title !== "string") {
        throw new Error(`Chapter ${i + 1} must have a 'title' field (string)`);
      }

      if (!chapter.content || !Array.isArray(chapter.content)) {
        throw new Error(`Chapter ${i + 1} must have a 'content' field (array)`);
      }

      if (chapter.content.length === 0) {
        throw new Error(`Chapter ${i + 1} must have at least one content item`);
      }

      // Validate chapter-level aiConfig if present (Task 5.5.2)
      if (chapter.aiConfig) {
        this.validateAIConfig(chapter.aiConfig, `Chapter ${i + 1}`);
      }

      // Validate each content item
      for (let j = 0; j < chapter.content.length; j++) {
        this.validateContentItem(chapter.content[j], i + 1, j + 1);
      }
    }

    return data as BookDefinition;
  }

  /**
   * Validates parsed YAML and constructs a StandaloneDefinition.
   * @param data Parsed YAML data
   * @returns Validated StandaloneDefinition
   */
  private static validateAndBuildStandaloneDefinition(data: any): StandaloneDefinition {
    // Validate standalone-level fields
    if (!data.title || typeof data.title !== "string") {
      throw new Error("Standalone content must have a 'title' field (string)");
    }

    if (!data.content || typeof data.content !== "object") {
      throw new Error("Standalone content must have a 'content' field (object)");
    }

    // Validate content-level aiConfig if present
    if (data.aiConfig) {
      this.validateAIConfig(data.aiConfig, "Standalone content");
    }

    // Validate the single content item (use null for chapterNum/itemNum for clearer errors)
    this.validateStandaloneContentItem(data.content);

    return data as StandaloneDefinition;
  }

  /**
   * Validates a standalone content item (no chapter context).
   * @param item Content item to validate
   */
  private static validateStandaloneContentItem(item: any): void {
    const prefix = "Standalone content";

    if (!item.type || typeof item.type !== "string") {
      throw new Error(`${prefix} must have a 'type' field (string)`);
    }

    const validTypes: ContentType[] = ["text", "image", "audio", "video", "ai-text", "ai-quiz", "flashcards", "dialogcards", "accordion", "ai-accordion", "singlechoiceset", "single-choice-set", "ai-singlechoiceset", "ai-single-choice-set", "dragtext", "drag-the-words", "ai-dragtext", "ai-drag-the-words", "blanks", "fill-in-the-blanks", "ai-blanks", "ai-fill-in-the-blanks", "essay", "ai-essay", "truefalse", "true-false", "ai-truefalse", "ai-true-false", "crossword", "ai-crossword", "youtube-intro", "youtube-page"];
    if (!validTypes.includes(item.type)) {
      throw new Error(
        `${prefix} has invalid type '${item.type}'. Valid types: ${validTypes.join(", ")}`
      );
    }

    // Validate item-level aiConfig if present
    if (item.aiConfig) {
      this.validateAIConfig(item.aiConfig, prefix);
    }

    // Reuse the same type-specific validation logic from validateContentItem
    // Just call it with dummy chapter/item numbers
    this.validateContentItem(item, 0, 0);
  }

  /**
   * Validates AI configuration structure.
   * @param aiConfig AI configuration object to validate
   * @param prefix Prefix for error messages (e.g., "Book", "Chapter 1", "Chapter 2, item 3")
   */
  private static validateAIConfig(aiConfig: any, prefix: string): void {
    if (typeof aiConfig !== "object" || aiConfig === null) {
      throw new Error(`${prefix} aiConfig must be an object`);
    }

    // Validate targetAudience if present
    if (aiConfig.targetAudience !== undefined && typeof aiConfig.targetAudience !== "string") {
      throw new Error(`${prefix} aiConfig.targetAudience must be a string`);
    }

    // Validate tone if present
    if (aiConfig.tone !== undefined && typeof aiConfig.tone !== "string") {
      throw new Error(`${prefix} aiConfig.tone must be a string`);
    }

    // Validate customization if present
    if (aiConfig.customization !== undefined && typeof aiConfig.customization !== "string") {
      throw new Error(`${prefix} aiConfig.customization must be a string`);
    }

    // Validate outputFormat if present
    if (aiConfig.outputFormat !== undefined && typeof aiConfig.outputFormat !== "string") {
      throw new Error(`${prefix} aiConfig.outputFormat must be a string`);
    }
  }

  /**
   * Validates individual content items.
   * @param item Content item to validate
   * @param chapterNum Chapter number (for error messages)
   * @param itemNum Item number (for error messages)
   */
  private static validateContentItem(item: any, chapterNum: number, itemNum: number): void {
    const prefix = `Chapter ${chapterNum}, item ${itemNum}`;

    if (!item.type || typeof item.type !== "string") {
      throw new Error(`${prefix} must have a 'type' field (string)`);
    }

    const validTypes: ContentType[] = ["text", "image", "audio", "video", "ai-text", "ai-quiz", "flashcards", "dialogcards", "accordion", "ai-accordion", "singlechoiceset", "single-choice-set", "ai-singlechoiceset", "ai-single-choice-set", "dragtext", "drag-the-words", "ai-dragtext", "ai-drag-the-words", "blanks", "fill-in-the-blanks", "ai-blanks", "ai-fill-in-the-blanks", "essay", "ai-essay", "truefalse", "true-false", "ai-truefalse", "ai-true-false", "crossword", "ai-crossword", "youtube-intro", "youtube-page"];
    if (!validTypes.includes(item.type)) {
      throw new Error(
        `${prefix} has invalid type '${item.type}'. Valid types: ${validTypes.join(", ")}`
      );
    }

    // Validate item-level aiConfig if present (Task 5.5.4)
    if (item.aiConfig) {
      this.validateAIConfig(item.aiConfig, prefix);
    }

    // Type-specific validation
    switch (item.type) {
      case "text":
        if (!item.text || typeof item.text !== "string") {
          throw new Error(`${prefix} (text) must have a 'text' field (string)`);
        }
        break;

      case "ai-text":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-text) must have a 'prompt' field (string)`);
        }
        break;

      case "image":
        if (!item.path || typeof item.path !== "string") {
          throw new Error(`${prefix} (image) must have a 'path' field (string)`);
        }
        if (!item.alt || typeof item.alt !== "string") {
          throw new Error(`${prefix} (image) must have an 'alt' field (string)`);
        }
        break;

      case "audio":
        if (!item.path || typeof item.path !== "string") {
          throw new Error(`${prefix} (audio) must have a 'path' field (string)`);
        }
        break;

      case "video":
        if (!item.url || typeof item.url !== "string") {
          throw new Error(`${prefix} (video) must have a 'url' field (string)`);
        }
        break;

      case "ai-quiz":
        if (!item.sourceText || typeof item.sourceText !== "string") {
          throw new Error(`${prefix} (ai-quiz) must have a 'sourceText' field (string)`);
        }
        break;

      case "flashcards":
        if (!Array.isArray(item.cards)) {
          throw new Error(`${prefix} (flashcards) must have a 'cards' field (array)`);
        }
        if (item.cards.length === 0) {
          throw new Error(`${prefix} (flashcards) must have at least one card`);
        }
        break;

      case "dialogcards":
        if (!Array.isArray(item.cards)) {
          throw new Error(`${prefix} (dialogcards) must have a 'cards' field (array)`);
        }
        if (item.cards.length === 0) {
          throw new Error(`${prefix} (dialogcards) must have at least one card`);
        }
        break;

      case "accordion":
        if (!Array.isArray(item.panels)) {
          throw new Error(`${prefix} (accordion) must have a 'panels' field (array)`);
        }
        if (item.panels.length === 0) {
          throw new Error(`${prefix} (accordion) must have at least one panel`);
        }
        break;

      case "ai-accordion":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-accordion) must have a 'prompt' field (string)`);
        }
        break;

      case "singlechoiceset":
      case "single-choice-set":
        if (!Array.isArray(item.questions)) {
          throw new Error(`${prefix} (singlechoiceset) must have 'questions' array`);
        }
        if (item.questions.length === 0) {
          throw new Error(`${prefix} (singlechoiceset) must have at least one question`);
        }
        break;

      case "ai-singlechoiceset":
      case "ai-single-choice-set":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-singlechoiceset) must have a 'prompt' field (string)`);
        }
        break;

      case "dragtext":
      case "drag-the-words":
        if (!item.sentences && !item.textField) {
          throw new Error(`${prefix} (dragtext) must have either 'sentences' array or 'textField' string`);
        }
        if (item.sentences && !Array.isArray(item.sentences)) {
          throw new Error(`${prefix} (dragtext) 'sentences' must be an array`);
        }
        if (item.sentences && item.sentences.length === 0) {
          throw new Error(`${prefix} (dragtext) must have at least one sentence`);
        }
        break;

      case "ai-dragtext":
      case "ai-drag-the-words":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-dragtext) must have a 'prompt' field (string)`);
        }
        break;

      case "blanks":
      case "fill-in-the-blanks":
        if (!item.sentences && !item.questions) {
          throw new Error(`${prefix} (blanks) must have either 'sentences' or 'questions' array`);
        }
        if (item.sentences && item.questions) {
          throw new Error(`${prefix} (blanks) cannot have both 'sentences' and 'questions' - use one format only`);
        }
        break;

      case "ai-blanks":
      case "ai-fill-in-the-blanks":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-blanks) must have a 'prompt' field (string)`);
        }
        break;

      case "essay":
        if (!item.taskDescription || typeof item.taskDescription !== "string") {
          throw new Error(`${prefix} (essay) must have a 'taskDescription' field (string)`);
        }
        if (!item.keywords || !Array.isArray(item.keywords)) {
          throw new Error(`${prefix} (essay) must have a 'keywords' array with at least one keyword`);
        }
        if (item.keywords.length === 0) {
          throw new Error(`${prefix} (essay) must have at least one keyword in the 'keywords' array`);
        }
        break;

      case "ai-essay":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-essay) must have a 'prompt' field (string)`);
        }
        break;

      case "truefalse":
      case "true-false":
        if (!item.question || typeof item.question !== "string") {
          throw new Error(`${prefix} (truefalse) must have 'question' field (string)`);
        }
        if (typeof item.correct !== "boolean") {
          throw new Error(`${prefix} (truefalse) must have 'correct' field (boolean)`);
        }
        break;

      case "ai-truefalse":
      case "ai-true-false":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-truefalse) must have a 'prompt' field (string)`);
        }
        break;

      case "crossword":
        if (!Array.isArray(item.words)) {
          throw new Error(`${prefix} (crossword) must have a 'words' field (array)`);
        }
        if (item.words.length < 2) {
          throw new Error(`${prefix} (crossword) must have at least 2 words for grid generation`);
        }
        break;

      case "ai-crossword":
        if (!item.prompt || typeof item.prompt !== "string") {
          throw new Error(`${prefix} (ai-crossword) must have a 'prompt' field (string)`);
        }
        break;

      case "youtube-intro":
        // YouTube intro page validation (Phase 1)
        // No required fields beyond type - will be populated by YouTubeExtractor
        break;

      case "youtube-page":
        // YouTube story page validation (Phase 1)
        // No required fields beyond type - will be populated by YouTubeExtractor
        break;
    }
  }

  /**
   * Resolves relative file paths in content items to absolute paths.
   * Handles both BookDefinition (with chapters) and StandaloneDefinition (single content).
   *
   * @param definition Book or Standalone definition with potentially relative paths
   * @param basePath Base directory to resolve paths from
   */
  private static resolveContentPaths(definition: H5PDefinition, basePath: string): void {
    // Handle standalone content
    if (isStandaloneDefinition(definition)) {
      this.resolveItemPaths(definition.content, basePath);
      return;
    }

    // Handle Interactive Book (chapters)
    const bookDef = definition as BookDefinition;
    for (const chapter of bookDef.chapters) {
      for (const item of chapter.content) {
        this.resolveItemPaths(item, basePath);
      }
    }

    // Resolve cover image path if present (books only)
    if (bookDef.coverImage &&
        !bookDef.coverImage.startsWith("http://") &&
        !bookDef.coverImage.startsWith("https://") &&
        !path.isAbsolute(bookDef.coverImage)) {
      bookDef.coverImage = path.resolve(basePath, bookDef.coverImage);
    }
  }

  /**
   * Resolves relative file paths in a single content item.
   * @param item Content item with potentially relative paths
   * @param basePath Base directory to resolve paths from
   */
  private static resolveItemPaths(item: any, basePath: string): void {
    // Resolve paths for image and audio content
    if (item.type === "image" || item.type === "audio") {
      if (!item.path.startsWith("http://") &&
          !item.path.startsWith("https://") &&
          !path.isAbsolute(item.path)) {
        item.path = path.resolve(basePath, item.path);
      }
    }

    // Resolve paths in flashcard images
    if (item.type === "flashcards" && Array.isArray(item.cards)) {
      for (const card of item.cards) {
        if (card.image &&
            !card.image.startsWith("http://") &&
            !card.image.startsWith("https://") &&
            !path.isAbsolute(card.image)) {
          card.image = path.resolve(basePath, card.image);
        }
      }
    }

    // Resolve paths in dialog card images and audio
    if (item.type === "dialogcards" && Array.isArray(item.cards)) {
      for (const card of item.cards) {
        if (card.image &&
            !card.image.startsWith("http://") &&
            !card.image.startsWith("https://") &&
            !path.isAbsolute(card.image)) {
          card.image = path.resolve(basePath, card.image);
        }
        if (card.audio &&
            !card.audio.startsWith("http://") &&
            !card.audio.startsWith("https://") &&
            !path.isAbsolute(card.audio)) {
          card.audio = path.resolve(basePath, card.audio);
        }
      }
    }
  }
}
