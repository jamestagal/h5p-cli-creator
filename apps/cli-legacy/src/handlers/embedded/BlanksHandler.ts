import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Manual blanks (fill-in-the-blank) content with typed answers
 *
 * Supports two input formats:
 * 1. Simplified format with sentences array and {blank} markers
 * 2. H5P native questions format with *answer* markers
 */
export interface BlanksContent {
  type: "blanks" | "fill-in-the-blanks";
  title?: string;
  taskDescription?: string;

  // Simplified format: array of sentences with blanks
  sentences?: Array<{
    text: string;  // Text with {blank} markers
    blanks: Array<{
      answer: string | string[];  // Single answer or multiple correct answers
      tip?: string;
    }>;
  }>;

  // OR alternative format: questions array (H5P native format)
  questions?: string[];  // Sentences with *answer* markers

  // Optional media above the task
  media?: {
    path: string;
    type?: "image" | "video" | "audio";
    alt?: string;
    disableZooming?: boolean;  // For images only
  };

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    enableCheckButton?: boolean;
    autoCheck?: boolean;
    caseSensitive?: boolean;
    showSolutionsRequiresInput?: boolean;
    separateLines?: boolean;
    confirmCheckDialog?: boolean;
    confirmRetryDialog?: boolean;
    acceptSpellingErrors?: boolean;
  };

  // Optional UI labels
  labels?: {
    showSolutions?: string;
    tryAgain?: string;
    checkAnswer?: string;
    submitAnswer?: string;
    notFilledOut?: string;
    answerIsCorrect?: string;
    answerIsWrong?: string;
    answeredCorrectly?: string;
    answeredIncorrectly?: string;
    solutionLabel?: string;
    inputLabel?: string;
    inputHasTipLabel?: string;
    tipLabel?: string;
    scoreBarLabel?: string;
    a11yCheck?: string;
    a11yShowSolution?: string;
    a11yRetry?: string;
    a11yCheckingModeHeader?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}

/**
 * Handler for H5P.Blanks content type (manual content)
 *
 * Creates fill-in-the-blank exercises where users type answers into input fields.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: blanks
 *   title: "Norwegian Berries"
 *   taskDescription: "Fill in the missing words"
 *   sentences:
 *     - text: "Blueberries are {blank} colored berries."
 *       blanks:
 *         - answer: "blue"
 *           tip: "Think about the name"
 *     - text: "{blank} are orange berries."
 *       blanks:
 *         - answer: ["Cloudberries", "Cloud berries"]
 *   behaviour:
 *     caseSensitive: false
 *     acceptSpellingErrors: true
 * ```
 *
 * Alternative questions format:
 * ```yaml
 * - type: blanks
 *   title: "Norwegian Berries"
 *   questions:
 *     - "Blueberries are *blue:Think about the name* colored berries."
 *     - "*Cloudberries/Cloud berries* are orange berries."
 * ```
 */
export class BlanksHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "blanks";
  }

  /**
   * Validates blanks content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Check that either sentences OR questions is provided (mutually exclusive)
    if (!item.sentences && !item.questions) {
      return {
        valid: false,
        error: "Blanks requires either 'sentences' array or 'questions' array. Please provide one of these fields."
      };
    }

    if (item.sentences && item.questions) {
      return {
        valid: false,
        error: "Cannot have both 'sentences' and 'questions' - use one format only"
      };
    }

    // Validate sentences format if provided
    if (item.sentences) {
      if (!Array.isArray(item.sentences)) {
        return {
          valid: false,
          error: "Field 'sentences' must be an array"
        };
      }

      if (item.sentences.length === 0) {
        return {
          valid: false,
          error: "Blanks must have at least one sentence"
        };
      }

      // Validate each sentence
      for (let i = 0; i < item.sentences.length; i++) {
        const sentence = item.sentences[i];

        if (!sentence.text || typeof sentence.text !== "string") {
          return {
            valid: false,
            error: `Sentence ${i + 1} missing 'text' field (string)`
          };
        }

        if (!sentence.blanks || !Array.isArray(sentence.blanks)) {
          return {
            valid: false,
            error: `Sentence ${i + 1} missing 'blanks' array`
          };
        }

        if (sentence.blanks.length === 0) {
          return {
            valid: false,
            error: `Sentence ${i + 1} must have at least one blank`
          };
        }

        // Validate each blank
        for (let j = 0; j < sentence.blanks.length; j++) {
          const blank = sentence.blanks[j];

          if (!blank.answer) {
            return {
              valid: false,
              error: `Sentence ${i + 1}, blank ${j + 1} missing 'answer' field`
            };
          }

          // Validate answer is string or array
          if (typeof blank.answer === "string") {
            if (blank.answer.trim() === "") {
              return {
                valid: false,
                error: `Sentence ${i + 1}, blank ${j + 1} answer must be non-empty`
              };
            }
          } else if (Array.isArray(blank.answer)) {
            if (blank.answer.length === 0) {
              return {
                valid: false,
                error: `Sentence ${i + 1}, blank ${j + 1} answer array must be non-empty`
              };
            }

            // Check all array elements are non-empty strings
            for (let k = 0; k < blank.answer.length; k++) {
              if (typeof blank.answer[k] !== "string" || blank.answer[k].trim() === "") {
                return {
                  valid: false,
                  error: `Sentence ${i + 1}, blank ${j + 1} all answers must be non-empty strings`
                };
              }
            }
          } else {
            return {
              valid: false,
              error: `Sentence ${i + 1}, blank ${j + 1} answer must be string or array of strings`
            };
          }

          // Validate tip is string if provided
          if (blank.tip !== undefined && typeof blank.tip !== "string") {
            return {
              valid: false,
              error: `Sentence ${i + 1}, blank ${j + 1} tip must be a string`
            };
          }
        }

        // Validate {blank} count matches blanks array length
        const blankCount = (sentence.text.match(/\{blank\}/g) || []).length;
        if (blankCount !== sentence.blanks.length) {
          return {
            valid: false,
            error: `Sentence ${i + 1} has ${blankCount} {blank} markers but ${sentence.blanks.length} blanks defined`
          };
        }
      }
    }

    // Validate questions format if provided
    if (item.questions) {
      if (!Array.isArray(item.questions)) {
        return {
          valid: false,
          error: "Field 'questions' must be an array"
        };
      }

      if (item.questions.length === 0) {
        return {
          valid: false,
          error: "Blanks must have at least one question"
        };
      }

      // Validate each question
      for (let i = 0; i < item.questions.length; i++) {
        const question = item.questions[i];

        if (typeof question !== "string") {
          return {
            valid: false,
            error: `Question ${i + 1} must be a string`
          };
        }

        // Check for at least one asterisk marker
        if (!question.includes("*")) {
          return {
            valid: false,
            error: `Question ${i + 1} must contain at least one blank marked with *answer* format`
          };
        }
      }
    }

    // Validate media if provided
    if (item.media) {
      if (typeof item.media !== "object") {
        return {
          valid: false,
          error: "Field 'media' must be an object"
        };
      }

      if (!item.media.path || typeof item.media.path !== "string") {
        return {
          valid: false,
          error: "media.path is required and must be a string"
        };
      }

      if (item.media.type && !["image", "video", "audio"].includes(item.media.type)) {
        return {
          valid: false,
          error: "media.type must be 'image', 'video', or 'audio'"
        };
      }
    }

    // Validate behaviour fields if provided
    if (item.behaviour) {
      const validBehaviourFields = [
        "enableRetry", "enableSolutionsButton", "enableCheckButton", "autoCheck",
        "caseSensitive", "showSolutionsRequiresInput", "separateLines",
        "confirmCheckDialog", "confirmRetryDialog", "acceptSpellingErrors"
      ];
      for (const field of validBehaviourFields) {
        if (item.behaviour[field] !== undefined && typeof item.behaviour[field] !== "boolean") {
          return {
            valid: false,
            error: `behaviour.${field} must be boolean`
          };
        }
      }
    }

    // Validate feedback ranges if provided
    if (item.feedback) {
      if (!Array.isArray(item.feedback)) {
        return {
          valid: false,
          error: "Field 'feedback' must be an array"
        };
      }

      for (let i = 0; i < item.feedback.length; i++) {
        const feedbackItem = item.feedback[i];

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
   * Processes blanks content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: BlanksContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // Build questions array from sentences or use provided questions
    let questions: string[];
    let sentenceCount = 0;

    if (item.sentences) {
      // Convert simplified format to H5P questions format
      questions = item.sentences.map(sentence => {
        const converted = this.convertSimplifiedToNative(sentence);
        return `<p>${this.escapeHtml(converted)}</p>`;
      });
      sentenceCount = item.sentences.length;
    } else {
      // Use provided questions (already in H5P native format)
      questions = item.questions!.map(q => `<p>${this.escapeHtml(q)}</p>`);
      sentenceCount = item.questions!.length;
    }

    if (options.verbose) {
      logger.log(`    - Adding blanks: "${item.title || 'Untitled'}" (${sentenceCount} sentences)`);
    }

    // Escape HTML in taskDescription
    const taskDescription = item.taskDescription
      ? `<p>${this.escapeHtml(item.taskDescription)}</p>`
      : "";

    // Build H5P Blanks structure
    const h5pContent: any = {
      library: "H5P.Blanks 1.14",
      params: {
        text: taskDescription,
        questions: questions,

        // Behaviour settings
        behaviour: {
          enableRetry: item.behaviour?.enableRetry !== undefined ? item.behaviour.enableRetry : true,
          enableSolutionsButton: item.behaviour?.enableSolutionsButton !== undefined ? item.behaviour.enableSolutionsButton : true,
          enableCheckButton: item.behaviour?.enableCheckButton !== undefined ? item.behaviour.enableCheckButton : true,
          autoCheck: item.behaviour?.autoCheck !== undefined ? item.behaviour.autoCheck : false,
          caseSensitive: item.behaviour?.caseSensitive !== undefined ? item.behaviour.caseSensitive : true,
          showSolutionsRequiresInput: item.behaviour?.showSolutionsRequiresInput !== undefined ? item.behaviour.showSolutionsRequiresInput : true,
          separateLines: item.behaviour?.separateLines !== undefined ? item.behaviour.separateLines : false,
          confirmCheckDialog: item.behaviour?.confirmCheckDialog !== undefined ? item.behaviour.confirmCheckDialog : false,
          confirmRetryDialog: item.behaviour?.confirmRetryDialog !== undefined ? item.behaviour.confirmRetryDialog : false,
          acceptSpellingErrors: item.behaviour?.acceptSpellingErrors !== undefined ? item.behaviour.acceptSpellingErrors : false
        },

        // Overall feedback
        overallFeedback: item.feedback || [
          {
            from: 0,
            to: 100,
            feedback: "You got @score of @total blanks correct."
          }
        ],

        // UI labels
        showSolutions: item.labels?.showSolutions || "Show solutions",
        tryAgain: item.labels?.tryAgain || "Try again",
        checkAnswer: item.labels?.checkAnswer || "Check",
        submitAnswer: item.labels?.submitAnswer || "Submit",
        notFilledOut: item.labels?.notFilledOut || "Please fill in all blanks",
        answerIsCorrect: item.labels?.answerIsCorrect || "':ans' is correct",
        answerIsWrong: item.labels?.answerIsWrong || "':ans' is wrong",
        answeredCorrectly: item.labels?.answeredCorrectly || "Answered correctly",
        answeredIncorrectly: item.labels?.answeredIncorrectly || "Answered incorrectly",
        solutionLabel: item.labels?.solutionLabel || "Correct answer:",
        inputLabel: item.labels?.inputLabel || "Blank input @num of @total",
        inputHasTipLabel: item.labels?.inputHasTipLabel || "Tip available",
        tipLabel: item.labels?.tipLabel || "Tip",
        scoreBarLabel: item.labels?.scoreBarLabel || "You got :num out of :total points",
        a11yCheck: item.labels?.a11yCheck || "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
        a11yShowSolution: item.labels?.a11yShowSolution || "Show the solution. The task will be marked with its correct solution.",
        a11yRetry: item.labels?.a11yRetry || "Retry the task. Reset all responses and start the task over again.",
        a11yCheckingModeHeader: item.labels?.a11yCheckingModeHeader || "Checking mode",

        // Confirmation dialogs
        confirmCheck: {
          header: "Finish ?",
          body: "Are you sure?",
          cancelLabel: "Cancel",
          confirmLabel: "Finish"
        },
        confirmRetry: {
          header: "Retry ?",
          body: "Are you sure?",
          cancelLabel: "Cancel",
          confirmLabel: "Confirm"
        }
      },
      metadata: {
        title: item.title || "Fill in the Blanks",
        license: "U",
        contentType: "Fill in the Blanks"
      },
      subContentId: this.generateSubContentId()
    };

    // Add media if provided
    if (item.media) {
      // TODO: Implement media support in future iteration
      // This will require building H5P.Image/Video/Audio structures
      // and adding them to the params.media field
    }

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Blanks"];
  }

  /**
   * Converts simplified sentence format to H5P native question format
   *
   * Converts {blank} markers to *answer* format:
   * - Single answer: {blank} with answer "word" → *word*
   * - Multiple answers: {blank} with answers ["word1", "word2"] → *word1/word2*
   * - Answer with tip: {blank} with answer "word" and tip "hint" → *word:hint*
   * - Combined: {blank} with answers ["word1", "word2"] and tip "hint" → *word1/word2:hint*
   */
  private convertSimplifiedToNative(sentence: { text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }): string {
    let result = sentence.text;
    let blankIndex = 0;

    // Replace each {blank} marker with corresponding H5P format
    result = result.replace(/\{blank\}/g, () => {
      if (blankIndex >= sentence.blanks.length) {
        throw new Error("Mismatch between {blank} count and blanks array length");
      }

      const blank = sentence.blanks[blankIndex];
      blankIndex++;

      // Build answer string
      let answerStr: string;
      if (Array.isArray(blank.answer)) {
        // Multiple answers: join with /
        answerStr = blank.answer.join("/");
      } else {
        // Single answer
        answerStr = blank.answer;
      }

      // Add tip if provided
      if (blank.tip) {
        return `*${answerStr}:${blank.tip}*`;
      } else {
        return `*${answerStr}*`;
      }
    });

    return result;
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
      "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
