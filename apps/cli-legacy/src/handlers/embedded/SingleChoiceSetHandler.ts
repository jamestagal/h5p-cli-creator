import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Manual single choice set content with predefined questions
 */
export interface SingleChoiceSetContent {
  type: "singlechoiceset" | "single-choice-set";
  title?: string;

  // Simplified format: array of questions
  questions: Array<{
    question: string;
    correctAnswer: string;              // The correct answer
    distractors: string[];              // Wrong answers (minimum 1)
  }>;

  // Optional behavior settings
  behaviour?: {
    timeoutCorrect?: number;            // Milliseconds to show correct feedback
    timeoutWrong?: number;              // Milliseconds to show wrong feedback
    soundEffectsEnabled?: boolean;
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    passPercentage?: number;            // 0-100
    autoContinue?: boolean;             // Auto-advance to next question
  };

  // Optional UI labels
  labels?: {
    showSolutionButton?: string;
    retryButton?: string;
    correctText?: string;
    incorrectText?: string;
    nextQuestionButton?: string;
    slideOfTotal?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}

/**
 * Handler for H5P.SingleChoiceSet content type (manual questions)
 *
 * Creates single-choice quiz questions where users select one answer from multiple options.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: singlechoiceset
 *   title: "Goji Berry Quiz"
 *   questions:
 *     - question: "Goji berries are also known as ..."
 *       correctAnswer: "Wolfberries"
 *       distractors:
 *         - "Catberries"
 *         - "Bearberries"
 * ```
 */
export class SingleChoiceSetHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "singlechoiceset";
  }

  /**
   * Validates single choice set content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.questions || !Array.isArray(item.questions)) {
      return {
        valid: false,
        error: "SingleChoiceSet requires 'questions' array. Each question needs question, correctAnswer, and distractors."
      };
    }

    if (item.questions.length === 0) {
      return {
        valid: false,
        error: "SingleChoiceSet must have at least one question"
      };
    }

    // Validate each question
    for (let i = 0; i < item.questions.length; i++) {
      const q = item.questions[i];

      if (!q.question) {
        return {
          valid: false,
          error: `Question ${i + 1} missing 'question' field`
        };
      }

      if (typeof q.question !== "string") {
        return {
          valid: false,
          error: `Question ${i + 1} 'question' must be a string`
        };
      }

      if (!q.correctAnswer) {
        return {
          valid: false,
          error: `Question ${i + 1} missing 'correctAnswer' field`
        };
      }

      if (typeof q.correctAnswer !== "string") {
        return {
          valid: false,
          error: `Question ${i + 1} 'correctAnswer' must be a string`
        };
      }

      if (!q.distractors || !Array.isArray(q.distractors)) {
        return {
          valid: false,
          error: `Question ${i + 1} missing 'distractors' array`
        };
      }

      if (q.distractors.length === 0) {
        return {
          valid: false,
          error: `Question ${i + 1} must have at least one distractor`
        };
      }

      // Validate all distractors are non-empty strings
      for (let j = 0; j < q.distractors.length; j++) {
        if (typeof q.distractors[j] !== "string" || q.distractors[j].trim() === "") {
          return {
            valid: false,
            error: `Question ${i + 1} distractor ${j + 1} must be a non-empty string`
          };
        }
      }
    }

    // Validate optional behaviour fields
    if (item.behaviour) {
      if (item.behaviour.passPercentage !== undefined) {
        if (typeof item.behaviour.passPercentage !== "number" ||
            item.behaviour.passPercentage < 0 ||
            item.behaviour.passPercentage > 100) {
          return {
            valid: false,
            error: "passPercentage must be a number between 0 and 100"
          };
        }
      }

      if (item.behaviour.timeoutCorrect !== undefined) {
        if (typeof item.behaviour.timeoutCorrect !== "number" || item.behaviour.timeoutCorrect < 0) {
          return {
            valid: false,
            error: "timeoutCorrect must be a positive number"
          };
        }
      }

      if (item.behaviour.timeoutWrong !== undefined) {
        if (typeof item.behaviour.timeoutWrong !== "number" || item.behaviour.timeoutWrong < 0) {
          return {
            valid: false,
            error: "timeoutWrong must be a positive number"
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Processes single choice set content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: SingleChoiceSetContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding single choice set: "${item.title || 'Untitled'}" (${item.questions.length} questions)`);
    }

    // Build default behaviour
    const defaultBehaviour = {
      timeoutCorrect: 1000,
      timeoutWrong: 1000,
      soundEffectsEnabled: true,
      enableRetry: true,
      enableSolutionsButton: true,
      passPercentage: 100,
      autoContinue: true
    };

    // Merge with custom behaviour if provided
    const behaviour = { ...defaultBehaviour, ...(item.behaviour || {}) };

    // Build default labels
    const defaultLabels = {
      showSolutionButtonLabel: "Show solution",
      retryButtonLabel: "Retry",
      solutionViewTitle: "Solution",
      correctText: "Correct!",
      incorrectText: "Incorrect!",
      muteButtonLabel: "Mute feedback sound",
      closeButtonLabel: "Close",
      slideOfTotal: "Slide :num of :total",
      nextButtonLabel: "Next question",
      scoreBarLabel: "You got :num out of :total points",
      solutionListQuestionNumber: "Question :num",
      a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
      a11yRetry: "Retry the task. Reset all responses and start the task over again.",
      shouldSelect: "Should have been selected",
      shouldNotSelect: "Should not have been selected"
    };

    // Merge with custom labels if provided
    const l10n = { ...defaultLabels, ...(item.labels || {}) };

    // Build default feedback
    const defaultFeedback = [
      {
        from: 0,
        to: 100,
        feedback: "You got :numcorrect of :maxscore correct"
      }
    ];

    const overallFeedback = item.feedback || defaultFeedback;

    // Transform questions to H5P choices format
    // CRITICAL: Correct answer MUST be at index 0
    const choices = item.questions.map(q => ({
      question: this.escapeHtml(q.question),
      answers: [
        this.escapeHtml(q.correctAnswer),  // Index 0 is ALWAYS correct
        ...q.distractors.map(d => this.escapeHtml(d))
      ],
      subContentId: this.generateSubContentId()
    }));

    // Build H5P SingleChoiceSet structure
    const h5pContent = {
      library: "H5P.SingleChoiceSet 1.11",
      params: {
        choices: choices,
        behaviour: behaviour,
        l10n: l10n,
        overallFeedback: overallFeedback
      },
      metadata: {
        title: item.title || "Single Choice Set",
        license: "U",
        contentType: "Single Choice Set"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.SingleChoiceSet"];
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
