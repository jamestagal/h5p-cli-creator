import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Manual essay content with keyword-based automatic scoring
 *
 * H5P.Essay allows students to write free-form text responses that are
 * automatically scored based on keyword matching, with support for wildcards,
 * regex patterns, and keyword alternatives (synonyms).
 */
export interface EssayContent {
  type: "essay";
  title?: string;
  taskDescription: string; // HTML task description (required)
  placeholderText?: string; // Help text in input field

  keywords: Array<{
    keyword: string; // Word/phrase, supports * wildcard and /regex/
    alternatives?: string[]; // Synonyms/variations
    points?: number; // Default: 1
    occurrences?: number; // How many times to award points, default: 1
    caseSensitive?: boolean; // Default: true
    forgiveMistakes?: boolean; // Allow minor spelling errors, default: false
    feedbackIncluded?: string; // Feedback if keyword found
    feedbackMissed?: string; // Feedback if keyword missing
  }>;

  solution?: {
    introduction?: string; // HTML introduction to sample solution
    sample?: string; // HTML sample solution text
  };

  media?: {
    path: string;
    type?: "image" | "video" | "audio";
    alt?: string; // For images
    disableZooming?: boolean; // For images only
  };

  behaviour?: {
    minimumLength?: number; // Min characters required
    maximumLength?: number; // Max characters allowed
    inputFieldSize?: "1" | "3" | "10"; // Lines, default: "10"
    enableRetry?: boolean; // Default: true
    ignoreScoring?: boolean; // Show only feedback, no score, default: false
    percentagePassing?: number; // 0-100, passing threshold
    percentageMastering?: number; // 0-100, mastering threshold
  };

  overallFeedback?: Array<{
    from: number; // Percentage 0-100
    to: number; // Percentage 0-100
    feedback: string;
  }>;

  labels?: {
    checkAnswer?: string;
    submitAnswer?: string;
    tryAgain?: string;
    showSolution?: string;
    feedbackHeader?: string;
    solutionTitle?: string;
  };
}

/**
 * Handler for H5P.Essay content type (manual content)
 *
 * Creates essay questions with keyword-based automatic scoring.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: essay
 *   title: "The Hobbit Summary"
 *   taskDescription: |
 *     <p>Please describe the novel <em>"The Hobbit"</em> by J.R.R. Tolkien
 *     with at least 100 characters and up to 500 characters.</p>
 *   placeholderText: "In a hole in the ground there lived a hobbit..."
 *   keywords:
 *     - keyword: "Bilbo"
 *       points: 10
 *       occurrences: 3
 *       feedbackMissed: "You should mention the main character by name."
 *     - keyword: "adventure"
 *       alternatives: ["quest", "journey"]
 *       points: 10
 *   solution:
 *     introduction: |
 *       <p>Remember that you were not expected to come up with
 *       the exact same solution. This is just a good example.</p>
 *     sample: |
 *       <p>The book is about Bilbo Baggins, a hobbit who goes on
 *       an unexpected adventure with Gandalf and thirteen dwarfs...</p>
 *   behaviour:
 *     minimumLength: 100
 *     maximumLength: 500
 * ```
 */
export class EssayHandler implements ContentHandler {
  private static readonly MAX_TASK_LENGTH = 10000;
  private static readonly MAX_FEEDBACK_LENGTH = 1000;

  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "essay";
  }

  /**
   * Validates essay content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Validate taskDescription (required)
    if (!item.taskDescription) {
      return {
        valid: false,
        error: "Essay requires 'taskDescription' field (string). Provide the essay question or prompt."
      };
    }

    if (typeof item.taskDescription !== "string") {
      return {
        valid: false,
        error: "Field 'taskDescription' must be a string"
      };
    }

    if (item.taskDescription.length > EssayHandler.MAX_TASK_LENGTH) {
      return {
        valid: false,
        error: `taskDescription exceeds maximum length of ${EssayHandler.MAX_TASK_LENGTH} characters (current: ${item.taskDescription.length})`
      };
    }

    // Validate keywords (required array)
    if (!item.keywords || !Array.isArray(item.keywords)) {
      return {
        valid: false,
        error: "Essay requires 'keywords' array. Each keyword needs a 'keyword' field (string) for scoring."
      };
    }

    if (item.keywords.length === 0) {
      return {
        valid: false,
        error: "Essay must have at least one keyword for scoring"
      };
    }

    // Validate each keyword
    for (let i = 0; i < item.keywords.length; i++) {
      const keyword = item.keywords[i];

      // Validate keyword.keyword (required)
      if (!keyword.keyword) {
        return {
          valid: false,
          error: `Keyword ${i + 1} missing 'keyword' field (string)`
        };
      }

      if (typeof keyword.keyword !== "string") {
        return {
          valid: false,
          error: `Keyword ${i + 1} 'keyword' must be a string. Received: ${typeof keyword.keyword}`
        };
      }

      // Validate alternatives (optional array of strings)
      if (keyword.alternatives !== undefined) {
        if (!Array.isArray(keyword.alternatives)) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'alternatives' must be an array of strings`
          };
        }

        for (let j = 0; j < keyword.alternatives.length; j++) {
          if (typeof keyword.alternatives[j] !== "string") {
            return {
              valid: false,
              error: `Keyword ${i + 1} alternatives[${j}] must be a string`
            };
          }
        }
      }

      // Validate points (optional positive number)
      if (keyword.points !== undefined) {
        if (typeof keyword.points !== "number") {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'points' must be a number. Received: ${typeof keyword.points}`
          };
        }
        if (keyword.points <= 0) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'points' must be positive. Received: ${keyword.points}`
          };
        }
      }

      // Validate occurrences (optional positive integer)
      if (keyword.occurrences !== undefined) {
        if (typeof keyword.occurrences !== "number" || !Number.isInteger(keyword.occurrences)) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'occurrences' must be an integer. Received: ${keyword.occurrences}`
          };
        }
        if (keyword.occurrences <= 0) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'occurrences' must be positive. Received: ${keyword.occurrences}`
          };
        }
      }

      // Validate feedbackIncluded (optional string with max length)
      if (keyword.feedbackIncluded !== undefined) {
        if (typeof keyword.feedbackIncluded !== "string") {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'feedbackIncluded' must be a string`
          };
        }
        if (keyword.feedbackIncluded.length > EssayHandler.MAX_FEEDBACK_LENGTH) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'feedbackIncluded' exceeds maximum length of ${EssayHandler.MAX_FEEDBACK_LENGTH} characters (current: ${keyword.feedbackIncluded.length})`
          };
        }
      }

      // Validate feedbackMissed (optional string with max length)
      if (keyword.feedbackMissed !== undefined) {
        if (typeof keyword.feedbackMissed !== "string") {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'feedbackMissed' must be a string`
          };
        }
        if (keyword.feedbackMissed.length > EssayHandler.MAX_FEEDBACK_LENGTH) {
          return {
            valid: false,
            error: `Keyword ${i + 1} 'feedbackMissed' exceeds maximum length of ${EssayHandler.MAX_FEEDBACK_LENGTH} characters (current: ${keyword.feedbackMissed.length})`
          };
        }
      }
    }

    // Validate media if provided
    if (item.media) {
      if (!item.media.path || typeof item.media.path !== "string") {
        return {
          valid: false,
          error: "media.path is required and must be a string"
        };
      }

      if (item.media.type && !["image", "video", "audio"].includes(item.media.type)) {
        return {
          valid: false,
          error: "media.type must be one of: image, video, audio"
        };
      }
    }

    // Validate behaviour fields
    if (item.behaviour) {
      // Validate minimumLength (non-negative integer)
      if (item.behaviour.minimumLength !== undefined) {
        if (typeof item.behaviour.minimumLength !== "number" || !Number.isInteger(item.behaviour.minimumLength)) {
          return {
            valid: false,
            error: "behaviour.minimumLength must be an integer"
          };
        }
        if (item.behaviour.minimumLength < 0) {
          return {
            valid: false,
            error: "behaviour.minimumLength must be a non-negative integer"
          };
        }
      }

      // Validate maximumLength (non-negative integer)
      if (item.behaviour.maximumLength !== undefined) {
        if (typeof item.behaviour.maximumLength !== "number" || !Number.isInteger(item.behaviour.maximumLength)) {
          return {
            valid: false,
            error: "behaviour.maximumLength must be an integer"
          };
        }
        if (item.behaviour.maximumLength < 0) {
          return {
            valid: false,
            error: "behaviour.maximumLength must be a non-negative integer"
          };
        }
      }

      // CRITICAL: Cross-field validation (maximumLength > minimumLength)
      if (item.behaviour.minimumLength !== undefined && item.behaviour.maximumLength !== undefined) {
        if (item.behaviour.maximumLength <= item.behaviour.minimumLength) {
          return {
            valid: false,
            error: `maximumLength (${item.behaviour.maximumLength}) must be greater than minimumLength (${item.behaviour.minimumLength})`
          };
        }
      }

      // Validate percentagePassing (0-100)
      if (item.behaviour.percentagePassing !== undefined) {
        if (typeof item.behaviour.percentagePassing !== "number") {
          return {
            valid: false,
            error: "behaviour.percentagePassing must be a number"
          };
        }
        if (item.behaviour.percentagePassing < 0 || item.behaviour.percentagePassing > 100) {
          return {
            valid: false,
            error: "behaviour.percentagePassing must be between 0 and 100"
          };
        }
      }

      // Validate percentageMastering (0-100)
      if (item.behaviour.percentageMastering !== undefined) {
        if (typeof item.behaviour.percentageMastering !== "number") {
          return {
            valid: false,
            error: "behaviour.percentageMastering must be a number"
          };
        }
        if (item.behaviour.percentageMastering < 0 || item.behaviour.percentageMastering > 100) {
          return {
            valid: false,
            error: "behaviour.percentageMastering must be between 0 and 100"
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Processes essay content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: EssayContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding essay: "${item.title || 'Untitled'}" (${item.keywords.length} keywords)`);
    }

    // Build task description with HTML formatting
    const taskDescription = this.formatTaskDescription(item.taskDescription);

    // Build keywords array for H5P
    const h5pKeywords = item.keywords.map((keyword) => {
      const h5pKeyword: any = {
        keyword: keyword.keyword, // CRITICAL: Preserve wildcards (*) and regex (/pattern/)
        options: {
          caseSensitive: keyword.caseSensitive !== undefined ? keyword.caseSensitive : true,
          forgiveMistakes: keyword.forgiveMistakes !== undefined ? keyword.forgiveMistakes : false,
        },
      };

      // Add alternatives array if provided (H5P expects array format)
      if (keyword.alternatives && keyword.alternatives.length > 0) {
        h5pKeyword.alternatives = keyword.alternatives;
      }

      // Add points (default: 1)
      h5pKeyword.points = keyword.points !== undefined ? keyword.points : 1;

      // Add occurrences (default: 1)
      h5pKeyword.occurrences = keyword.occurrences !== undefined ? keyword.occurrences : 1;

      // Add feedback strings (escape HTML)
      if (keyword.feedbackIncluded) {
        h5pKeyword.feedbackIncluded = this.escapeHtml(keyword.feedbackIncluded);
      }
      if (keyword.feedbackMissed) {
        h5pKeyword.feedbackMissed = this.escapeHtml(keyword.feedbackMissed);
      }

      return h5pKeyword;
    });

    // Build behaviour object
    const behaviour: any = {
      enableRetry: item.behaviour?.enableRetry !== undefined ? item.behaviour.enableRetry : true,
      inputFieldSize: item.behaviour?.inputFieldSize || "10",
      ignoreScoring: item.behaviour?.ignoreScoring !== undefined ? item.behaviour.ignoreScoring : false,
      percentagePassing: item.behaviour?.percentagePassing !== undefined ? item.behaviour.percentagePassing : 50,
      percentageMastering: item.behaviour?.percentageMastering !== undefined ? item.behaviour.percentageMastering : 100,
    };

    // Add character length constraints if provided
    if (item.behaviour?.minimumLength !== undefined) {
      behaviour.minimumLength = item.behaviour.minimumLength;
    }
    if (item.behaviour?.maximumLength !== undefined) {
      behaviour.maximumLength = item.behaviour.maximumLength;
    }

    // Build solution object if provided
    let solution: any = undefined;
    if (item.solution) {
      solution = {};
      if (item.solution.introduction) {
        solution.introduction = `<p>${this.escapeHtml(item.solution.introduction)}</p>`;
      }
      if (item.solution.sample) {
        solution.sample = `<p>${this.escapeHtml(item.solution.sample)}</p>`;
      }
    }

    // Build overall feedback ranges
    const overallFeedback = item.overallFeedback || [
      { from: 0, to: 49, feedback: "You could improve your essay. Review the feedback." },
      { from: 50, to: 79, feedback: "Good work! You included some important points." },
      { from: 80, to: 100, feedback: "Excellent! Your essay covers all the key points." },
    ];

    // Escape HTML in feedback strings
    const escapedFeedback = overallFeedback.map((range) => ({
      from: range.from,
      to: range.to,
      feedback: this.escapeHtml(range.feedback),
    }));

    // Build H5P Essay structure
    const h5pContent: any = {
      library: "H5P.Essay 1.5",
      params: {
        taskDescription: taskDescription,
        placeholderText: item.placeholderText || "",
        keywords: h5pKeywords,
        overallFeedback: escapedFeedback,
        behaviour: behaviour,

        // UI labels
        checkAnswer: item.labels?.checkAnswer || "Check",
        submitAnswer: item.labels?.submitAnswer || "Submit",
        tryAgain: item.labels?.tryAgain || "Retry",
        showSolution: item.labels?.showSolution || "Show solution",
        feedbackHeader: item.labels?.feedbackHeader || "Feedback",
        solutionTitle: item.labels?.solutionTitle || "Sample solution",

        // Accessibility labels
        remainingChars: "Remaining characters: @chars",
        notEnoughChars: "You must enter at least @chars characters!",
        messageSave: "saved",
        messageSaving: "Saving...",
        messageSubmitted: "Your answer has been submitted",
        messageSubmitting: "Submitting...",
      },
      metadata: {
        title: item.title || "Essay",
        license: "U",
        contentType: "Essay",
      },
      subContentId: this.generateSubContentId(),
    };

    // Add solution if provided
    if (solution) {
      h5pContent.params.solution = solution;
    }

    // Add media if provided
    if (item.media) {
      // Media handling will be implemented in a future task
      // For now, add a placeholder structure
      h5pContent.params.media = {
        disableImageZooming: false,
      };
    }

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Essay"];
  }

  /**
   * Formats task description with proper HTML tags
   */
  private formatTaskDescription(text: string): string {
    // If text already has HTML tags, escape the entire thing
    if (text.includes("<") || text.includes(">")) {
      // User provided HTML, escape it
      return `<p>${this.escapeHtml(text)}</p>`;
    }

    // Plain text, wrap in paragraph
    return `<p>${this.escapeHtml(text)}</p>`;
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
