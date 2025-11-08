import * as yaml from "js-yaml";
import * as fsExtra from "fs-extra";
import * as path from "path";

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
 */
export interface AITextContent extends ContentItem {
  type: "ai-text";
  prompt: string;
  title?: string;
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
 */
export interface AIQuizContent extends ContentItem {
  type: "ai-quiz";
  sourceText: string;
  questionCount?: number;
  title?: string;
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
 */
export interface ChapterDefinition {
  title: string;
  content: AnyContentItem[];
}

/**
 * Complete book definition from YAML
 */
export interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  chapters: ChapterDefinition[];
}

/**
 * YamlInputParser parses YAML input files describing H5P Interactive Book structure.
 * Supports book metadata, chapters, content types, and AI directives.
 */
export class YamlInputParser {
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
