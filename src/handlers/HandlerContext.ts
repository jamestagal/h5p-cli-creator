import { ChapterBuilder } from "../compiler/ChapterBuilder";
import { LibraryRegistry } from "../compiler/LibraryRegistry";
import { QuizGenerator } from "../ai/QuizGenerator";
import { MediaFile } from "../compiler/ContentBuilder";

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
}
