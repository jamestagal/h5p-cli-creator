/**
 * Type definitions for h5p-cli-creator's interactive book compiler
 *
 * This file centralizes all TypeScript type definitions used throughout the compiler,
 * including configuration interfaces, content types, and AI generation settings.
 */

/**
 * Reading levels for AI-generated content
 *
 * Each level includes vocabulary guidelines, sentence structure rules, and examples:
 * - kindergarten: 50-100 words, 3-5 word sentences, concrete nouns
 * - elementary: Equivalent to grade-1 through grade-5, simplified grouping
 * - grade-1: 100-300 words, 5-7 word sentences, simple adjectives
 * - grade-2: 300-500 words, 7-10 word sentences, basic compound sentences
 * - grade-3: 500-800 words, 8-12 word sentences, introductory conjunctions
 * - grade-4: 800-1200 words, 10-15 word sentences, complex sentences
 * - grade-5: 1200-1500 words, 12-18 word sentences, subordinate clauses
 * - grade-6: 1500-2000 words, 15-20 word sentences, varied sentence structure
 * - grade-7: 2000-3000 words, 18-25 word sentences, sophisticated transitions
 * - grade-8: 3000-4000 words, 20-30 word sentences, nuanced arguments
 * - grade-9: 4000-5000 words, advanced vocabulary, abstract concepts
 * - grade-10: 5000-6000 words, discipline-specific terminology
 * - grade-11: 6000-7000 words, college-level analysis
 * - grade-12: 7000-8000 words, advanced academic writing
 * - high-school: Equivalent to grade-9 through grade-12, simplified grouping
 * - college: 8000+ words, field-specific jargon, critical analysis
 * - professional: Technical vocabulary, industry standards, expert-level
 * - esl-beginner: ESL beginners, basic high-frequency vocabulary (top 1000-2000 words)
 * - esl-intermediate: ESL intermediate, everyday vocabulary and common idioms
 */
export type ReadingLevel =
  | "kindergarten"
  | "elementary"
  | "grade-1"
  | "grade-2"
  | "grade-3"
  | "grade-4"
  | "grade-5"
  | "grade-6"
  | "grade-7"
  | "grade-8"
  | "grade-9"
  | "grade-10"
  | "grade-11"
  | "grade-12"
  | "high-school"
  | "college"
  | "professional"
  | "esl-beginner"
  | "esl-intermediate";

/**
 * Tone/style options for AI content generation
 *
 * Defines the voice and writing style:
 * - educational: Clear, instructional, focused on learning outcomes
 * - professional: Formal, objective, business/technical context
 * - casual: Conversational, friendly, approachable tone
 * - academic: Scholarly, evidence-based, formal citations
 * - creative: Imaginative, expressive, narrative-driven
 */
export type Tone =
  | "educational"
  | "professional"
  | "casual"
  | "academic"
  | "creative";

/**
 * Output formatting styles
 *
 * Currently only "plain-html" is supported for H5P compatibility.
 * Uses safe HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
 *
 * Other options reserved for future use:
 * - markdown: Markdown syntax (not yet implemented)
 * - plain-text: No formatting (not yet implemented)
 */
export type OutputStyle = "plain-html" | "markdown" | "plain-text";

/**
 * Supported AI providers
 *
 * - google: Google Gemini (gemini-2.5-flash)
 * - anthropic: Anthropic Claude (claude-sonnet-4)
 */
export type AIProvider = "google" | "anthropic";

/**
 * Content types for Smart Import API
 *
 * Supports various H5P interactive content types for AI generation:
 * - ai-text: H5P.AdvancedText (formatted text content)
 * - single-choice: H5P.SingleChoiceSet (multiple choice quiz)
 * - ai-accordion: H5P.Accordion (collapsible panels)
 * - ai-true-false: H5P.TrueFalse (true/false quiz)
 * - ai-essay: H5P.Essay (open-ended writing prompt)
 * - ai-crossword: H5P.Crossword (crossword puzzle)
 * - ai-drag-text: H5P.DragText (drag-and-drop text)
 * - ai-blanks: H5P.Blanks (fill-in-the-blank)
 */
export type ContentType =
  | "ai-text"
  | "single-choice"
  | "ai-accordion"
  | "ai-true-false"
  | "ai-essay"
  | "ai-crossword"
  | "ai-drag-text"
  | "ai-blanks"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "youtube"
  | "column";

/**
 * AI item generation request for Smart Import API
 *
 * Used to request AI-generated content of specific types with configuration.
 * Each request generates one H5P content item (quiz, accordion, essay, etc.)
 */
export interface SmartImportAIRequest {
  type: ContentType;
  prompt: string;
  aiConfig?: AIConfiguration;
  /** Number of questions/items to generate (for quiz types) */
  count?: number;
  /** Number of panels to generate (for accordion) */
  panelCount?: number;
  /** Keywords for content generation (for crossword) */
  keywords?: string[];
  /** Accordion style: "glossary" | "faq" | "general" */
  style?: string;
}

/**
 * Request payload for Smart Import API
 *
 * Generates an entire Interactive Book chapter from a single prompt using AI.
 * The AI determines content structure, types, and sequencing automatically.
 */
export interface SmartImportRequest {
  /** Main topic/theme for the chapter */
  topic: string;

  /** Optional AI configuration for content generation */
  aiConfig?: AIConfiguration;

  /** Optional specific content types to generate (overrides AI decision) */
  contentTypes?: Array<{
    type: ContentType;
    count?: number;
    panelCount?: number;
    keywords?: string[];
    style?: string;
  }>;
}

/**
 * AI Configuration for content generation
 *
 * Defines how AI should generate content, including reading level, tone, language,
 * and output style. Used by:
 * - Interactive Book compiler (via book/chapter/item aiConfig)
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
 * - targetLanguage: Auto-detected from book.language, or "en"
 * - instructionalLanguage: Same as targetLanguage (monolingual by default)
 * - includeTranslations: false
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
   * Target language for educational content (ISO 639-1 code).
   *
   * Specifies the language for all AI-generated educational content including
   * questions, answers, explanations, and activity text. This is the language
   * learners will practice and engage with.
   *
   * Auto-detected from BookDefinition.language if not specified.
   * Defaults to "en" (English) if neither is set.
   *
   * @example
   * ```yaml
   * # Vietnamese language learning content
   * aiConfig:
   *   targetLanguage: "vi"
   *
   * # French immersion content
   * aiConfig:
   *   targetLanguage: "fr"
   * ```
   *
   * Common ISO 639-1 codes: en (English), vi (Vietnamese), fr (French),
   * de (German), es (Spanish), ja (Japanese), ko (Korean), zh (Chinese),
   * ar (Arabic), pt (Portuguese)
   *
   * @see LanguageUtils.getLanguageName() for full language code mapping
   */
  targetLanguage?: string;

  /**
   * Language for task instructions and scaffolding (ISO 639-1 code).
   *
   * Specifies the language for instructional text that guides learners through
   * activities: quiz instructions, task directions, activity scaffolding.
   * Useful for beginner language learners who need first-language support.
   *
   * Defaults to targetLanguage when not specified (monolingual content).
   *
   * @example
   * ```yaml
   * # Beginner Vietnamese learners (English instructions + Vietnamese content)
   * aiConfig:
   *   targetLanguage: "vi"           # Content in Vietnamese
   *   instructionalLanguage: "en"    # Instructions in English
   *
   * # Advanced learners (full Vietnamese immersion)
   * aiConfig:
   *   targetLanguage: "vi"
   *   # No instructionalLanguage = defaults to Vietnamese
   * ```
   *
   * **Use Cases:**
   * - Beginner learners: Instructions in first language (L1), content in target language (L2)
   * - Intermediate learners: Mixed approach based on complexity
   * - Advanced learners: Full immersion (instructionalLanguage = targetLanguage)
   *
   * @see targetLanguage for educational content language
   */
  instructionalLanguage?: string;

  /**
   * Include English translations in parentheses for language learners.
   *
   * When enabled, AI adds English translations after target language terms
   * to support language acquisition. Useful for beginner and intermediate learners.
   *
   * Only applies when targetLanguage is not English.
   * Defaults to false (no translations).
   *
   * @example
   * ```yaml
   * # Bilingual Vietnamese content with translations
   * aiConfig:
   *   targetLanguage: "vi"
   *   includeTranslations: true
   *
   * # Output: "Xin chào (Hello)", "Cảm ơn (Thank you)"
   * ```
   *
   * **Format:** "Target language term (English translation)"
   *
   * Can be combined with instructionalLanguage for maximum scaffolding:
   * - Instructions: First language (via instructionalLanguage)
   * - Content: Target language with translations (via includeTranslations)
   *
   * @see targetLanguage
   * @see instructionalLanguage
   */
  includeTranslations?: boolean;

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
} from "./YamlInputParser";
