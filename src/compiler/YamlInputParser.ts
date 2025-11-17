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
export type ContentType = "text" | "image" | "audio" | "video" | "ai-text" | "ai-quiz" | "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set" | "dragtext" | "drag-the-words" | "ai-dragtext" | "ai-drag-the-words" | "blanks" | "fill-in-the-blanks" | "ai-blanks" | "ai-fill-in-the-blanks" | "essay" | "ai-essay" | "truefalse" | "true-false" | "ai-truefalse" | "ai-true-false" | "crossword" | "ai-crossword" | "questionset" | "ai-questionset" | "youtube-intro" | "youtube-page";

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

// Export questionset content types
export { AIQuestionSetContent } from "../handlers/ai/AIQuestionSetHandler";

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
  /**
   * Enable automatic audio playback for all audio content (default: false).
   *
   * When enabled, audio content will automatically start playing when the page loads.
   * Particularly useful for:
   * - Digital audiobooks (seamless listening experience)
   * - Language learning materials (immediate audio immersion)
   * - Accessibility (reduces clicks for users with motor impairments)
   *
   * Defaults to false for standard interactive behavior where users
   * must click play to start audio.
   *
   * @example
   * ```yaml
   * # Vietnamese audio story with autoplay
   * title: "Vietnamese Audio Story"
   * language: vi
   * audioAutoplay: true
   *
   * chapters:
   *   - title: "Chapter 1"
   *     content:
   *       - type: audio
   *         title: "Listen to the story"
   *         path: audio/chapter1.mp3
   *         # Audio will autoplay when page loads
   * ```
   */
  audioAutoplay?: boolean;
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
 * Parses YAML input file into BookDefinition
 */
export class YamlInputParser {
  static parse(filePath: string): BookDefinition {
    const fileContent = fsExtra.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(fileContent) as BookDefinition;

    // Validate required fields
    if (!parsed.title) {
      throw new Error(`Missing required field: title`);
    }
    if (!parsed.chapters || parsed.chapters.length === 0) {
      throw new Error(`Book must have at least one chapter`);
    }

    return parsed;
  }
}
