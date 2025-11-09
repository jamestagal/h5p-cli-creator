import { ChapterBuilder } from "../compiler/ChapterBuilder";
import { LibraryRegistry } from "../compiler/LibraryRegistry";
import { QuizGenerator } from "../ai/QuizGenerator";
import { MediaFile } from "../compiler/ContentBuilder";
import { AIConfiguration } from "../compiler/types";

/**
 * Logger interface for progress and debug messages
 */
export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * HandlerContext provides shared utilities and dependencies to content handlers.
 * Passed to each handler during content processing to provide access to:
 * - ChapterBuilder for adding content
 * - Library and AI service registries
 * - Media file tracking
 * - Configuration options
 * - AI configuration cascade (book > chapter > item)
 */
export interface HandlerContext {
  /**
   * ChapterBuilder instance for adding content to current chapter.
   * Handlers call methods like addTextPage(), addImagePage(), etc.
   */
  chapterBuilder: ChapterBuilder;

  /**
   * Library registry for fetching H5P library metadata.
   * Provides cache-first library fetching from H5P Hub.
   */
  libraryRegistry: LibraryRegistry;

  /**
   * Quiz generator for AI-powered quiz creation.
   * Used by QuizHandler to generate H5P.MultiChoice content.
   */
  quizGenerator: QuizGenerator;

  /**
   * Logger for progress and debug messages.
   * Respects verbose mode configuration.
   */
  logger: Logger;

  /**
   * Media file tracking array (for image/audio counters).
   * Handlers can reference this for media file management.
   */
  mediaFiles: MediaFile[];

  /**
   * Base path for resolving relative file paths.
   * Typically the directory containing the input YAML/CSV file.
   */
  basePath: string;

  /**
   * Configuration options for content processing
   */
  options: {
    /**
     * Verbose mode flag - enables detailed logging
     */
    verbose?: boolean;

    /**
     * AI provider selection for text/quiz generation
     */
    aiProvider?: "gemini" | "claude" | "auto";
  };

  /**
   * Book-level AI configuration (if specified in BookDefinition).
   *
   * Provides default AI configuration for all AI-generated content in the book.
   * This is the lowest priority level in the configuration cascade.
   *
   * Configuration cascade (from highest to lowest priority):
   * 1. item.aiConfig (specific content item - highest priority)
   * 2. chapterConfig (this chapter - overrides book level)
   * 3. bookConfig (this field - overrides system defaults)
   * 4. System defaults (grade-6, educational, plain-html - lowest priority)
   *
   * Handlers should use AIPromptBuilder.resolveConfig() to properly merge
   * configurations from all three levels (item, chapter, book).
   *
   * @see AIConfiguration for available configuration options
   * @see AIPromptBuilder.resolveConfig() for configuration merging logic
   *
   * Added in Phase 5: AI Configuration System
   */
  bookConfig?: AIConfiguration;

  /**
   * Chapter-level AI configuration (if specified in ChapterDefinition).
   *
   * Overrides book-level AI configuration for all AI content in this chapter.
   * Individual items can still override with their own aiConfig.
   *
   * Use this when a specific chapter requires different reading level or tone
   * than the rest of the book (e.g., an advanced chapter in an otherwise
   * beginner-level book).
   *
   * Configuration cascade (from highest to lowest priority):
   * 1. item.aiConfig (specific content item - highest priority)
   * 2. chapterConfig (this field - overrides book level)
   * 3. bookConfig (book-level - overrides system defaults)
   * 4. System defaults (grade-6, educational, plain-html - lowest priority)
   *
   * Handlers should use AIPromptBuilder.resolveConfig() to properly merge
   * configurations from all three levels (item, chapter, book).
   *
   * @see AIConfiguration for available configuration options
   * @see AIPromptBuilder.resolveConfig() for configuration merging logic
   *
   * Added in Phase 5: AI Configuration System
   */
  chapterConfig?: AIConfiguration;
}
