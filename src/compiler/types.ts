/**
 * Library dependency information from library.json
 */
export interface LibraryDependency {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
}

/**
 * Preloaded JavaScript file reference
 */
export interface PreloadedJs {
  path: string;
}

/**
 * Preloaded CSS file reference
 */
export interface PreloadedCss {
  path: string;
}

/**
 * Complete library metadata extracted from library.json and semantics.json
 */
export interface LibraryMetadata {
  machineName: string;
  title: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  runnable?: number;
  fullscreen?: number;
  embedTypes?: string[];
  preloadedJs?: PreloadedJs[];
  preloadedCss?: PreloadedCss[];
  preloadedDependencies?: LibraryDependency[];
  editorDependencies?: LibraryDependency[];
  dynamicDependencies?: LibraryDependency[];
  semantics?: any;
  libraryDirectory?: string;
}

/**
 * Library.json file structure
 */
export interface LibraryJson {
  machineName: string;
  title: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  runnable?: number;
  fullscreen?: number;
  embedTypes?: string[];
  preloadedJs?: PreloadedJs[];
  preloadedCss?: PreloadedCss[];
  preloadedDependencies?: LibraryDependency[];
  editorDependencies?: LibraryDependency[];
  dynamicDependencies?: LibraryDependency[];
}

/**
 * Field definition from semantics.json
 */
export interface FieldDefinition {
  name: string;
  type: string;
  label?: string;
  description?: string;
  importance?: string;
  default?: any;
  optional?: boolean;
  widget?: string;
  options?: string[];
  min?: number;
  max?: number;
  pattern?: string;
  common?: boolean;
  fields?: FieldDefinition[];
  field?: FieldDefinition;
}

/**
 * Parsed semantic schema from semantics.json
 */
export interface SemanticSchema {
  fields: FieldDefinition[];
}

/**
 * Validation error with field path and message
 */
export interface ValidationError {
  fieldPath: string;
  message: string;
  expectedType?: string;
  actualType?: string;
}

/**
 * Result of content validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Reading level targeting for AI-generated content.
 * Each level defines vocabulary complexity, sentence structure, and tone.
 *
 * Levels are based on educational standards and CEFR (Common European Framework of Reference):
 * - elementary: Grades 1-5
 * - grade-6: Ages 11-12 (DEFAULT)
 * - grade-9: Ages 14-15
 * - high-school: Grades 10-12
 * - college: Undergraduate level
 * - professional: Industry/adult learners
 * - esl-beginner: A1-A2 CEFR
 * - esl-intermediate: B1-B2 CEFR
 */
export type ReadingLevel =
  | "elementary"
  | "grade-6"
  | "grade-9"
  | "high-school"
  | "college"
  | "professional"
  | "esl-beginner"
  | "esl-intermediate";

/**
 * Tone of AI-generated content.
 * Defines the style and voice of the generated text.
 *
 * Options:
 * - educational: Clear, instructional, approachable (DEFAULT)
 * - professional: Formal, business-like, concise
 * - casual: Conversational, friendly, relatable
 * - academic: Scholarly, research-oriented, precise
 */
export type Tone =
  | "educational"
  | "professional"
  | "casual"
  | "academic";

/**
 * Output formatting style for AI-generated content.
 *
 * NOTE: H5P requires plain-html, other options reserved for future use.
 *
 * Options:
 * - plain-html: HTML tags only (p, h2, strong, em, ul, li) - DEFAULT and REQUIRED for H5P
 * - rich-html: Reserved for future (tables, div, span, etc.)
 * - markdown: Reserved for future (would be converted to HTML)
 */
export type OutputStyle =
  | "plain-html"
  | "rich-html"
  | "markdown";

/**
 * AI configuration for content generation.
 *
 * This is a UNIVERSAL configuration system that works across ALL AI-generated H5P content:
 * - Interactive Books (via BookDefinition.aiConfig)
 * - Smart Import API (via request.aiConfig)
 * - Standalone content generators (Flashcards, Dialog Cards, Summaries, etc.)
 *
 * Can be specified at multiple levels with cascading overrides:
 * - Book level (applies to all AI content in the book)
 * - Chapter level (overrides book-level for that chapter)
 * - Item level (overrides chapter and book level for that item)
 *
 * Configuration precedence: item > chapter > book > system defaults
 *
 * All fields are optional. System defaults:
 * - targetAudience: "grade-6"
 * - tone: "educational"
 * - outputStyle: "plain-html"
 */
export interface AIConfiguration {
  /**
   * Target reading level for vocabulary and sentence complexity.
   *
   * Defines the appropriate reading level for the generated content. Each level
   * includes specific guidance for vocabulary, sentence structure, and examples.
   *
   * Defaults to "grade-6" if not specified.
   *
   * @see ReadingLevel for available options
   */
  targetAudience?: ReadingLevel;

  /**
   * Tone and style of generated content.
   *
   * Defines how the content should be written - formal, casual, academic, etc.
   * This affects word choice, sentence structure, and overall voice.
   *
   * Defaults to "educational" if not specified.
   *
   * @see Tone for available options
   */
  tone?: Tone;

  /**
   * Output formatting style.
   *
   * Defines the markup format for generated content. Currently, only "plain-html"
   * is supported for H5P compatibility (using tags: p, h2, strong, em, ul, li).
   *
   * Defaults to "plain-html" (required for H5P).
   * Other options reserved for future use.
   *
   * @see OutputStyle for available options
   */
  outputStyle?: OutputStyle;

  /**
   * Free-text customization instructions appended to system prompt.
   *
   * Provides additional context and requirements for AI content generation.
   * This field is for advanced users who want to add specific instructions
   * beyond the structured reading level and tone settings.
   *
   * Examples:
   * - "Focus on visual learners"
   * - "Include real-world examples from medicine"
   * - "Use analogies to explain complex concepts"
   * - "Emphasize practical applications over theory"
   *
   * The customization text is appended to the AI system prompt after formatting
   * rules and reading level guidance. It does NOT replace or override the
   * system-managed formatting rules.
   */
  customization?: string;
}

/**
 * Compiler options for H5P package generation
 *
 * Re-exported from H5pCompiler for convenience
 */
export { CompilerOptions } from "./H5pCompiler";

/**
 * Book definition types
 *
 * Re-exported from YamlInputParser for convenience and frontend integration
 */
export {
  BookDefinition,
  ChapterDefinition,
  AnyContentItem,
  ContentType,
  TextContent,
  AITextContent,
  ImageContent,
  AudioContent,
  AIQuizContent,
  FlashcardsContent,
  DialogCardsContent
} from "./YamlInputParser";
