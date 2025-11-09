import * as yaml from "js-yaml";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { AIConfiguration } from "./types";

/**
 * Content directive types that can be specified in YAML
 */
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" | "flashcards" | "dialogcards";

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
  | DialogCardsContent;

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
 */
export interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  chapters: ChapterDefinition[];
  /**
   * Optional AI configuration for all AI-generated content in this book.
   *
   * Provides default reading level, tone, and customization for all AI content
   * items (ai-text, ai-quiz) throughout the book. Chapters and individual items
   * can override these settings as needed.
   *
   * Configuration hierarchy (from highest to lowest priority):
   * 1. item.aiConfig (specific content item)
   * 2. chapter.aiConfig (specific chapter)
   * 3. book.aiConfig (this field)
   * 4. system defaults (grade-6, educational, plain-html)
   *
   * @example
   * {
   *   title: "Biology for 6th Graders",
   *   language: "en",
   *   aiConfig: {
   *     targetAudience: "grade-6",
   *     tone: "educational",
   *     customization: "Focus on visual learners. Use real-world examples."
   *   },
   *   chapters: [...]
   * }
   */
  aiConfig?: AIConfiguration;
}

/**
 * YamlInputParser parses YAML input files describing H5P Interactive Book structure.
 * Supports book metadata, chapters, content types, and AI directives.
 */
export class YamlInputParser {
  /**
   * Valid reading level values for aiConfig.targetAudience validation
   */
  private static readonly VALID_READING_LEVELS = [
    "elementary",
    "grade-6",
    "grade-9",
    "high-school",
    "college",
    "professional",
    "esl-beginner",
    "esl-intermediate"
  ];

  /**
   * Valid tone values for aiConfig.tone validation
   */
  private static readonly VALID_TONES = [
    "educational",
    "professional",
    "casual",
    "academic"
  ];

  /**
   * Parses a YAML file into a BookDefinition structure.
   * @param yamlPath Path to YAML file
   * @returns Parsed book definition
   * @throws Error if file cannot be read or YAML is invalid
   */
  public async parse(yamlPath: string): Promise<BookDefinition> {
    try {
      // Read YAML file
      const yamlContent = await fsExtra.readFile(yamlPath, "utf8");

      // Parse YAML
      const parsed = yaml.load(yamlContent) as any;

      // Validate structure
      this.validateBookDefinition(parsed);

      // Resolve relative paths in content items
      const basePath = path.dirname(path.resolve(yamlPath));
      this.resolveContentPaths(parsed, basePath);

      return parsed as BookDefinition;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse YAML file: ${error.message}`);
      }
      throw new Error("Failed to parse YAML file: Unknown error");
    }
  }

  /**
   * Validates that the parsed YAML has required structure.
   * @param parsed Parsed YAML object
   * @throws Error if validation fails
   */
  private validateBookDefinition(parsed: any): void {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML must contain an object");
    }

    if (!parsed.title || typeof parsed.title !== "string") {
      throw new Error("Book must have a 'title' field (string)");
    }

    if (!parsed.language || typeof parsed.language !== "string") {
      throw new Error("Book must have a 'language' field (string)");
    }

    // Validate book-level aiConfig if present (Task 5.5.3)
    if (parsed.aiConfig) {
      this.validateAIConfig(parsed.aiConfig, "Book");
    }

    if (!Array.isArray(parsed.chapters)) {
      throw new Error("Book must have a 'chapters' field (array)");
    }

    if (parsed.chapters.length === 0) {
      throw new Error("Book must have at least one chapter");
    }

    // Validate each chapter
    parsed.chapters.forEach((chapter: any, index: number) => {
      if (!chapter.title || typeof chapter.title !== "string") {
        throw new Error(`Chapter ${index + 1} must have a 'title' field (string)`);
      }

      // Validate chapter-level aiConfig if present (Task 5.5.3)
      if (chapter.aiConfig) {
        this.validateAIConfig(chapter.aiConfig, `Chapter ${index + 1}`);
      }

      if (!Array.isArray(chapter.content)) {
        throw new Error(`Chapter ${index + 1} must have a 'content' field (array)`);
      }

      if (chapter.content.length === 0) {
        throw new Error(`Chapter ${index + 1} must have at least one content item`);
      }

      // Validate each content item
      chapter.content.forEach((item: any, itemIndex: number) => {
        this.validateContentItem(item, index + 1, itemIndex + 1);
      });
    });
  }

  /**
   * Validates AI configuration structure and values.
   * @param aiConfig AI configuration object to validate
   * @param context Context string for error messages (e.g., "Book", "Chapter 1", "Chapter 2, item 3")
   * @throws Error if validation fails
   * @private
   */
  private validateAIConfig(aiConfig: any, context: string): void {
    if (typeof aiConfig !== "object" || aiConfig === null) {
      throw new Error(`${context}: aiConfig must be an object`);
    }

    // Validate targetAudience if present
    if (aiConfig.targetAudience !== undefined) {
      if (typeof aiConfig.targetAudience !== "string") {
        throw new Error(`${context}: aiConfig.targetAudience must be a string`);
      }

      if (!YamlInputParser.VALID_READING_LEVELS.includes(aiConfig.targetAudience)) {
        throw new Error(
          `${context}: Invalid targetAudience: '${aiConfig.targetAudience}'. ` +
          `Valid options: ${YamlInputParser.VALID_READING_LEVELS.join(", ")}`
        );
      }
    }

    // Validate tone if present
    if (aiConfig.tone !== undefined) {
      if (typeof aiConfig.tone !== "string") {
        throw new Error(`${context}: aiConfig.tone must be a string`);
      }

      if (!YamlInputParser.VALID_TONES.includes(aiConfig.tone)) {
        throw new Error(
          `${context}: Invalid tone: '${aiConfig.tone}'. ` +
          `Valid options: ${YamlInputParser.VALID_TONES.join(", ")}`
        );
      }
    }

    // Validate customization if present
    if (aiConfig.customization !== undefined && typeof aiConfig.customization !== "string") {
      throw new Error(`${context}: aiConfig.customization must be a string`);
    }

    // Validate outputStyle if present (for completeness, though usually defaults to plain-html)
    if (aiConfig.outputStyle !== undefined) {
      const validOutputStyles = ["plain-html", "rich-html", "markdown"];
      if (!validOutputStyles.includes(aiConfig.outputStyle)) {
        throw new Error(
          `${context}: Invalid outputStyle: '${aiConfig.outputStyle}'. ` +
          `Valid options: ${validOutputStyles.join(", ")}`
        );
      }
    }
  }

  /**
   * Validates a single content item.
   * @param item Content item to validate
   * @param chapterNum Chapter number for error messages
   * @param itemNum Item number for error messages
   * @throws Error if validation fails
   */
  private validateContentItem(item: any, chapterNum: number, itemNum: number): void {
    const prefix = `Chapter ${chapterNum}, item ${itemNum}`;

    if (!item.type || typeof item.type !== "string") {
      throw new Error(`${prefix} must have a 'type' field (string)`);
    }

    const validTypes: ContentType[] = ["text", "image", "audio", "ai-text", "ai-quiz", "flashcards", "dialogcards"];
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
    }
  }

  /**
   * Resolves relative file paths in content items to absolute paths.
   * @param bookDef Book definition with potentially relative paths
   * @param basePath Base directory to resolve paths from
   */
  private resolveContentPaths(bookDef: any, basePath: string): void {
    for (const chapter of bookDef.chapters) {
      for (const item of chapter.content) {
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
  }
}
