import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Extra clue types for crossword hints
 *
 * Extra clues are displayed in a modal overlay when users click the info icon
 * next to a clue. They provide additional hints to help solve the word.
 */
export type ExtraClueType = TextExtraClue | ImageExtraClue | AudioExtraClue | VideoExtraClue;

/**
 * Text-based extra clue (formatted text with HTML support)
 */
export interface TextExtraClue {
  type: "text";
  content: string; // Plain text or HTML
}

/**
 * Image-based extra clue (visual hint)
 */
export interface ImageExtraClue {
  type: "image";
  path: string; // Local file path or URL
  alt: string; // Alternative text (required for accessibility)
}

/**
 * Audio-based extra clue (audio hint)
 * Future support - not implemented in v1
 */
export interface AudioExtraClue {
  type: "audio";
  path: string; // Local file path or URL
}

/**
 * Video-based extra clue (video hint)
 * Future support - not implemented in v1
 */
export interface VideoExtraClue {
  type: "video";
  path: string; // Local file path or URL
}

/**
 * Internal representation of a crossword word
 *
 * This structure is used to build the H5P.Crossword content.json format.
 * The orientation field ("across" or "down") is automatically determined by
 * the H5P library client-side during grid generation.
 */
export interface CrosswordWord {
  clue: string; // The clue text shown to the user
  answer: string; // The answer word (single word, no spaces)
  extraClue?: ExtraClueType; // Optional extra hint
  orientation?: "across" | "down"; // Auto-determined by H5P library
  fixWord?: boolean; // Manual positioning (false for auto-placement)
}

/**
 * Manual crossword content with word/clue pairs
 *
 * H5P.Crossword automatically generates the puzzle grid layout from a word list.
 * Our handler only needs to provide word/clue pairs - the complex crossword
 * placement algorithms are handled entirely by the H5P library client-side.
 *
 * **Key Features:**
 * - Automatic grid generation (no manual word positioning needed)
 * - Single-word answers only (no spaces, hyphens allowed)
 * - Optional extra clues (text, image, audio, video)
 * - Extensive theme customization (colors, backgrounds)
 * - Configurable behaviour settings (scoring, penalties, retry)
 * - Overall feedback ranges based on score percentages
 *
 * **H5P.Crossword 0.5 Content Structure:**
 * ```json
 * {
 *   "taskDescription": "<p>HTML task description</p>",
 *   "words": [
 *     {
 *       "clue": "Statue of liberty is located in?",
 *       "answer": "New York",
 *       "orientation": "across",  // Auto-determined by H5P
 *       "fixWord": false,         // Don't manually position
 *       "extraClue": {            // Optional H5P.AdvancedText sub-content
 *         "library": "H5P.AdvancedText 1.1",
 *         "params": {
 *           "text": "<p>The city in US, over 8 mil. inhabitants</p>"
 *         },
 *         "metadata": {
 *           "contentType": "Text",
 *           "license": "U",
 *           "title": "Untitled Text"
 *         },
 *         "subContentId": "generated-uuid"
 *       }
 *     }
 *   ],
 *   "behaviour": {
 *     "enableInstantFeedback": false,
 *     "scoreWords": true,
 *     "applyPenalties": false,
 *     "enableRetry": true,
 *     "enableSolutionsButton": true,
 *     "poolSize": 0
 *   },
 *   "theme": {
 *     "backgroundColor": "#173354",
 *     "gridColor": "#000000",
 *     "cellBackgroundColor": "#ffffff",
 *     "cellColor": "#000000",
 *     "clueIdColor": "#606060",
 *     "cellBackgroundColorHighlight": "#3e8de8",
 *     "cellColorHighlight": "#ffffff",
 *     "clueIdColorHighlight": "#1a73d9"
 *   },
 *   "overallFeedback": [
 *     {
 *       "from": 0,
 *       "to": 49,
 *       "feedback": "Keep practicing!"
 *     },
 *     {
 *       "from": 50,
 *       "to": 100,
 *       "feedback": "Great job!"
 *     }
 *   ],
 *   "l10n": {
 *     "across": "Across",
 *     "down": "Down",
 *     "checkAnswer": "Check",
 *     "couldNotGenerateCrossword": "Could not generate crossword...",
 *     // ... complete label set provided by handler
 *   },
 *   "a11y": {
 *     "across": "across",
 *     "down": "down",
 *     "crosswordGrid": "Crossword grid",
 *     // ... complete accessibility label set
 *   }
 * }
 * ```
 */
export interface CrosswordContent {
  type: "crossword";
  title?: string;
  taskDescription?: string; // HTML description shown above the crossword

  /**
   * Array of word/clue pairs (minimum 2 words required)
   *
   * Each word must have:
   * - clue: Non-empty string describing the word
   * - answer: Single word (no spaces, hyphens allowed), 3-15 characters recommended
   * - extraClue: Optional hint (text, image, audio, video)
   */
  words: Array<{
    clue: string;
    answer: string;
    extraClue?: ExtraClueType;
  }>;

  /**
   * Behaviour settings (all optional)
   */
  behaviour?: {
    /**
     * Show feedback immediately after each answer vs on submit
     * Default: false
     */
    enableInstantFeedback?: boolean;

    /**
     * Score by complete words vs individual characters
     * Default: true
     */
    scoreWords?: boolean;

    /**
     * Apply -1 point penalty for wrong answers
     * Default: false
     */
    applyPenalties?: boolean;

    /**
     * Allow retry after submission
     * Default: true
     */
    enableRetry?: boolean;

    /**
     * Show solutions button
     * Default: true
     */
    enableSolutionsButton?: boolean;

    /**
     * Randomize subset of words (0 = use all words)
     * Default: 0
     */
    poolSize?: number;

    /**
     * Keep correct answers on retry
     * Default: false
     */
    keepCorrectAnswers?: boolean;
  };

  /**
   * Theme customization (all optional, colors must be hex format #RRGGBB)
   */
  theme?: {
    backgroundColor?: string; // Background color for crossword area
    gridColor?: string; // Grid border color
    cellBackgroundColor?: string; // Normal cell background
    cellColor?: string; // Normal cell text color
    clueIdColor?: string; // Normal clue ID number color
    cellBackgroundColorHighlight?: string; // Highlighted cell background
    cellColorHighlight?: string; // Highlighted cell text color
    clueIdColorHighlight?: string; // Highlighted clue ID number color
  };

  /**
   * Overall feedback ranges based on score percentages
   *
   * Example:
   * ```yaml
   * overallFeedback:
   *   - from: 0
   *     to: 49
   *     feedback: "Keep practicing!"
   *   - from: 50
   *     to: 79
   *     feedback: "Good work!"
   *   - from: 80
   *     to: 100
   *     feedback: "Excellent!"
   * ```
   */
  overallFeedback?: Array<{
    from: number; // 0-100
    to: number; // 0-100
    feedback: string;
  }>;
}

/**
 * Handler for H5P.Crossword content type (manual content)
 *
 * Creates interactive crossword puzzles where users fill in words based on clues.
 * The H5P.Crossword library automatically generates the grid layout from the word list.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: crossword
 *   title: "Geography Quiz"
 *   taskDescription: "Famous landmarks around the world"
 *   words:
 *     - clue: "Statue of liberty is located in?"
 *       answer: "New York"
 *       extraClue:
 *         type: text
 *         content: "The city in US, over 8 mil. inhabitants"
 *
 *     - clue: "Taj Mahal is located in which city?"
 *       answer: "Agra"
 *
 *     - clue: "Eiffel Tower is located in?"
 *       answer: "Paris"
 *
 *   behaviour:
 *     enableInstantFeedback: false
 *     scoreWords: true
 *     applyPenalties: false
 *     enableRetry: true
 *     enableSolutionsButton: true
 *
 *   theme:
 *     backgroundColor: "#173354"
 *     gridColor: "#000000"
 *     cellBackgroundColor: "#ffffff"
 *     cellColor: "#000000"
 *
 *   overallFeedback:
 *     - from: 0
 *       to: 49
 *       feedback: "Keep practicing!"
 *     - from: 50
 *       to: 100
 *       feedback: "Great job!"
 * ```
 */
export class CrosswordHandler implements ContentHandler {
  /**
   * Returns the content type identifier this handler supports
   */
  public getContentType(): string {
    return "crossword";
  }

  /**
   * Returns the required H5P libraries for this content type
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Crossword"];
  }

  /**
   * Validates crossword content structure and constraints
   *
   * Validation rules:
   * - Minimum 2 words required for grid generation
   * - Each word must have non-empty clue (string)
   * - Each word must have single-word answer (no spaces, hyphens allowed)
   * - Answer length recommendation: 3-15 characters
   * - Extra clue type must be valid: text, image, audio, video
   * - Theme colors must be valid hex format (#RRGGBB)
   * - Behaviour fields must be boolean types
   * - Feedback ranges must be 0-100 percentages
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // TODO: Implement validation in Task Group 2
    return { valid: true };
  }

  /**
   * Processes crossword content and generates H5P package structure
   *
   * Builds H5P.Crossword content.json with:
   * - words array with clue, answer, orientation (auto), fixWord (false)
   * - Extra clue sub-content (H5P.AdvancedText for text hints)
   * - Behaviour settings with sensible defaults
   * - Theme customization if provided
   * - Overall feedback ranges
   * - Complete l10n and a11y label sets
   */
  public async process(
    context: HandlerContext,
    item: CrosswordContent
  ): Promise<void> {
    // TODO: Implement H5P content generation in Task Group 2
  }

  /**
   * Escapes HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Generates a unique sub-content ID for H5P sub-content structures
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
