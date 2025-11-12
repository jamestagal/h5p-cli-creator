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
    // Validate words array (required)
    if (!item.words || !Array.isArray(item.words)) {
      return {
        valid: false,
        error: "Crossword requires 'words' array with clue/answer pairs. Each word needs 'clue' and 'answer' fields."
      };
    }

    // Validate minimum 2 words required for grid generation
    if (item.words.length < 2) {
      return {
        valid: false,
        error: "Crossword requires at least 2 words for grid generation. Please provide at least 2 word/clue pairs."
      };
    }

    // Validate each word
    for (let i = 0; i < item.words.length; i++) {
      const word = item.words[i];

      // Validate clue (required, non-empty string)
      if (!word.clue) {
        return {
          valid: false,
          error: `Word ${i + 1} missing 'clue' field (required, non-empty string)`
        };
      }

      if (typeof word.clue !== "string") {
        return {
          valid: false,
          error: `Word ${i + 1} 'clue' must be a string. Received: ${typeof word.clue}`
        };
      }

      if (word.clue.trim() === "") {
        return {
          valid: false,
          error: `Word ${i + 1} 'clue' must be non-empty`
        };
      }

      // Validate answer (required, single word, no spaces)
      if (!word.answer) {
        return {
          valid: false,
          error: `Word ${i + 1} missing 'answer' field (required)`
        };
      }

      if (typeof word.answer !== "string") {
        return {
          valid: false,
          error: `Word ${i + 1} 'answer' must be a string. Received: ${typeof word.answer}`
        };
      }

      if (word.answer.trim() === "") {
        return {
          valid: false,
          error: `Word ${i + 1} 'answer' must be non-empty`
        };
      }

      // CRITICAL: Validate single word (no spaces allowed, hyphens allowed)
      if (word.answer.includes(" ")) {
        return {
          valid: false,
          error: `Word ${i + 1} answer must be a single word (no spaces allowed): '${word.answer}'. Use hyphens for compound words (e.g., 'New-York').`
        };
      }

      // Validate answer length recommendation (3-15 characters)
      if (word.answer.length < 3) {
        return {
          valid: false,
          error: `Word ${i + 1} answer '${word.answer}' is too short. Recommended length: 3-15 characters.`
        };
      }

      if (word.answer.length > 15) {
        return {
          valid: false,
          error: `Word ${i + 1} answer '${word.answer}' is too long. Recommended length: 3-15 characters.`
        };
      }

      // Validate extra clue if provided
      if (word.extraClue) {
        if (typeof word.extraClue !== "object") {
          return {
            valid: false,
            error: `Word ${i + 1} 'extraClue' must be an object`
          };
        }

        // Validate extra clue type
        if (!word.extraClue.type) {
          return {
            valid: false,
            error: `Word ${i + 1} extraClue missing 'type' field`
          };
        }

        const validExtraClueTypes = ["text", "image", "audio", "video"];
        if (!validExtraClueTypes.includes(word.extraClue.type)) {
          return {
            valid: false,
            error: `Word ${i + 1} extraClue type must be one of: ${validExtraClueTypes.join(", ")}. Received: ${word.extraClue.type}`
          };
        }

        // Validate text extra clue has content
        if (word.extraClue.type === "text") {
          if (!word.extraClue.content || typeof word.extraClue.content !== "string") {
            return {
              valid: false,
              error: `Word ${i + 1} extraClue type 'text' requires 'content' field (non-empty string)`
            };
          }

          if (word.extraClue.content.trim() === "") {
            return {
              valid: false,
              error: `Word ${i + 1} extraClue 'content' must be non-empty`
            };
          }
        }

        // Validate media extra clue types (image, audio, video) - for future implementation
        if (["image", "audio", "video"].includes(word.extraClue.type)) {
          // Media extra clues not yet supported in v1
          return {
            valid: false,
            error: `Word ${i + 1} extraClue type '${word.extraClue.type}' is not yet supported. Only 'text' extra clues are supported in this version.`
          };
        }
      }
    }

    // Validate theme colors if provided
    if (item.theme) {
      const colorFields = [
        "backgroundColor",
        "gridColor",
        "cellBackgroundColor",
        "cellColor",
        "clueIdColor",
        "cellBackgroundColorHighlight",
        "cellColorHighlight",
        "clueIdColorHighlight"
      ];

      for (const field of colorFields) {
        if (item.theme[field] !== undefined) {
          if (typeof item.theme[field] !== "string") {
            return {
              valid: false,
              error: `theme.${field} must be a string (hex color format)`
            };
          }

          // Validate hex color format (#RRGGBB)
          const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
          if (!hexColorRegex.test(item.theme[field])) {
            return {
              valid: false,
              error: `theme.${field} must be a valid hex color (format: #RRGGBB, e.g., '#173354'). Received: ${item.theme[field]}`
            };
          }
        }
      }
    }

    // Validate behaviour fields if provided
    if (item.behaviour) {
      const booleanFields = [
        "enableInstantFeedback",
        "scoreWords",
        "applyPenalties",
        "enableRetry",
        "enableSolutionsButton",
        "keepCorrectAnswers"
      ];

      for (const field of booleanFields) {
        if (item.behaviour[field] !== undefined && typeof item.behaviour[field] !== "boolean") {
          return {
            valid: false,
            error: `behaviour.${field} must be boolean. Received: ${typeof item.behaviour[field]}`
          };
        }
      }

      // Validate poolSize if provided
      if (item.behaviour.poolSize !== undefined) {
        if (typeof item.behaviour.poolSize !== "number" || !Number.isInteger(item.behaviour.poolSize)) {
          return {
            valid: false,
            error: "behaviour.poolSize must be an integer"
          };
        }

        if (item.behaviour.poolSize < 2) {
          return {
            valid: false,
            error: "behaviour.poolSize must be at least 2"
          };
        }

        if (item.behaviour.poolSize > item.words.length) {
          return {
            valid: false,
            error: `behaviour.poolSize (${item.behaviour.poolSize}) cannot exceed total words (${item.words.length})`
          };
        }
      }
    }

    // Validate overall feedback ranges if provided
    if (item.overallFeedback) {
      if (!Array.isArray(item.overallFeedback)) {
        return {
          valid: false,
          error: "Field 'overallFeedback' must be an array"
        };
      }

      for (let i = 0; i < item.overallFeedback.length; i++) {
        const feedbackItem = item.overallFeedback[i];

        if (typeof feedbackItem.from !== "number" || feedbackItem.from < 0 || feedbackItem.from > 100) {
          return {
            valid: false,
            error: `Feedback ${i + 1} 'from' must be a number between 0 and 100`
          };
        }

        if (typeof feedbackItem.to !== "number" || feedbackItem.to < 0 || feedbackItem.to > 100) {
          return {
            valid: false,
            error: `Feedback ${i + 1} 'to' must be a number between 0 and 100`
          };
        }

        if (typeof feedbackItem.feedback !== "string") {
          return {
            valid: false,
            error: `Feedback ${i + 1} 'feedback' must be a string`
          };
        }
      }
    }

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
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding crossword: "${item.title || 'Untitled'}" (${item.words.length} words)`);
    }

    // Build task description with HTML formatting
    const taskDescription = item.taskDescription
      ? `<p>${this.escapeHtml(item.taskDescription)}</p>`
      : "";

    // Build words array for H5P.Crossword
    const h5pWords = await Promise.all(
      item.words.map(async (word, index) => {
        const h5pWord: any = {
          clue: this.escapeHtml(word.clue),
          answer: word.answer,
          orientation: "across", // Auto-determined by H5P client-side
          fixWord: false // Don't manually position words
        };

        // Add extra clue if provided (text only in v1)
        if (word.extraClue && word.extraClue.type === "text") {
          h5pWord.extraClue = this.buildTextExtraClue((word.extraClue as TextExtraClue).content);
        }

        return h5pWord;
      })
    );

    // Build behaviour settings with sensible defaults
    const behaviour: any = {
      enableInstantFeedback: item.behaviour?.enableInstantFeedback !== undefined
        ? item.behaviour.enableInstantFeedback
        : false,
      scoreWords: item.behaviour?.scoreWords !== undefined
        ? item.behaviour.scoreWords
        : true,
      applyPenalties: item.behaviour?.applyPenalties !== undefined
        ? item.behaviour.applyPenalties
        : false,
      enableRetry: item.behaviour?.enableRetry !== undefined
        ? item.behaviour.enableRetry
        : true,
      enableSolutionsButton: item.behaviour?.enableSolutionsButton !== undefined
        ? item.behaviour.enableSolutionsButton
        : true,
      keepCorrectAnswers: item.behaviour?.keepCorrectAnswers !== undefined
        ? item.behaviour.keepCorrectAnswers
        : false
    };

    // Add poolSize if provided (0 = use all words)
    if (item.behaviour?.poolSize !== undefined) {
      behaviour.poolSize = item.behaviour.poolSize;
    } else {
      behaviour.poolSize = 0;
    }

    // Build theme settings if provided
    const theme: any = {};
    if (item.theme) {
      if (item.theme.backgroundColor) theme.backgroundColor = item.theme.backgroundColor;
      if (item.theme.gridColor) theme.gridColor = item.theme.gridColor;
      if (item.theme.cellBackgroundColor) theme.cellBackgroundColor = item.theme.cellBackgroundColor;
      if (item.theme.cellColor) theme.cellColor = item.theme.cellColor;
      if (item.theme.clueIdColor) theme.clueIdColor = item.theme.clueIdColor;
      if (item.theme.cellBackgroundColorHighlight) theme.cellBackgroundColorHighlight = item.theme.cellBackgroundColorHighlight;
      if (item.theme.cellColorHighlight) theme.cellColorHighlight = item.theme.cellColorHighlight;
      if (item.theme.clueIdColorHighlight) theme.clueIdColorHighlight = item.theme.clueIdColorHighlight;
    }

    // Build overall feedback ranges
    const overallFeedback = item.overallFeedback || [
      { from: 0, to: 49, feedback: "Keep practicing!" },
      { from: 50, to: 79, feedback: "Good work!" },
      { from: 80, to: 100, feedback: "Excellent!" }
    ];

    // Escape HTML in feedback strings
    const escapedFeedback = overallFeedback.map((range) => ({
      from: range.from,
      to: range.to,
      feedback: this.escapeHtml(range.feedback)
    }));

    // Build H5P.Crossword structure
    const h5pContent: any = {
      library: "H5P.Crossword 0.5",
      params: {
        taskDescription: taskDescription,
        words: h5pWords,
        behaviour: behaviour,
        overallFeedback: escapedFeedback,

        // UI labels (l10n)
        l10n: {
          across: "Across",
          down: "Down",
          checkAnswer: "Check",
          submitAnswer: "Submit",
          showSolution: "Show solution",
          tryAgain: "Retry",
          extraClue: "Extra clue",
          closeWindow: "Close window",
          couldNotGenerateCrossword: "Could not generate crossword with those words",
          couldNotGenerateCrosswordTooFewWords: "Could not generate crossword. You need at least two words."
        },

        // Accessibility labels (a11y)
        a11y: {
          crosswordGrid: "Crossword grid. Use arrow keys to navigate and keyboard to enter characters. Use tab to navigate to clue list.",
          column: "column",
          row: "row",
          across: "across",
          down: "down",
          empty: "Empty",
          resultFor: "Result for",
          correct: "Correct",
          wrong: "Wrong",
          point: "Point",
          solutionFor: "Solution for",
          extraClue: "Extra clue",
          letterSevenOfNine: "Letter @position of @length",
          lettersWord: "Letters of the word:",
          check: "Check the characters. Correct answers will be marked with a green background, wrong answers with a red background.",
          showSolution: "Show the solution. The crossword will be filled with the correct answers.",
          retry: "Retry the task. Reset all responses and start the task over again.",
          solutionText: "Solution",
          clueText: "Clue"
        }
      },
      metadata: {
        title: item.title || "Crossword",
        license: "U",
        contentType: "Crossword"
      },
      subContentId: this.generateSubContentId()
    };

    // Add theme if provided
    if (Object.keys(theme).length > 0) {
      h5pContent.params.theme = theme;
    }

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Builds H5P.AdvancedText sub-content structure for text extra clues
   */
  private buildTextExtraClue(content: string): any {
    return {
      library: "H5P.AdvancedText 1.1",
      params: {
        text: `<p>${this.escapeHtml(content)}</p>`
      },
      metadata: {
        contentType: "Text",
        license: "U",
        title: "Untitled Text"
      },
      subContentId: this.generateSubContentId()
    };
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
