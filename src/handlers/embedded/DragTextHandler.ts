import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Manual drag text content with fill-in-the-blank exercises
 *
 * Supports two input formats:
 * 1. Simplified format with sentences array and {blank} markers
 * 2. H5P native textField format with *answer* markers
 */
export interface DragTextContent {
  type: "dragtext" | "drag-the-words";
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

  // OR alternative format: textField string (H5P native format)
  textField?: string;  // "Text with *answer* or *answer:tip* markers"

  distractors?: string[] | string;  // Incorrect answer options (array or H5P native format string)

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    instantFeedback?: boolean;
    enableCheckButton?: boolean;
  };

  // Optional UI labels
  labels?: {
    checkAnswer?: string;
    tryAgain?: string;
    showSolution?: string;
    correctText?: string;
    incorrectText?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}

/**
 * Handler for H5P.DragText content type (manual content)
 *
 * Creates fill-in-the-blank exercises where users drag words into blanks.
 *
 * Manual usage in YAML:
 * ```yaml
 * - type: dragtext
 *   title: "Berry Colors"
 *   taskDescription: "What are the colors of these berries when they are ripe?"
 *   sentences:
 *     - text: "Blueberries are {blank}."
 *       blanks:
 *         - answer: "blue"
 *           tip: "Check the name of the berry!"
 *     - text: "Strawberries are {blank}."
 *       blanks:
 *         - answer: "red"
 *   distractors:
 *     - "green"
 *     - "purple"
 * ```
 *
 * Alternative textField format:
 * ```yaml
 * - type: dragtext
 *   title: "Berry Colors"
 *   textField: |
 *     Blueberries are *blue:Check the name of the berry!*.
 *     Strawberries are *red*.
 *   distractors: "*green*\n*purple*"
 * ```
 */
export class DragTextHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "dragtext";
  }

  /**
   * Validates drag text content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Check that either sentences OR textField is provided
    if (!item.sentences && !item.textField) {
      return {
        valid: false,
        error: "DragText requires either 'sentences' array or 'textField' string. Please provide one of these fields."
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
          error: "DragText must have at least one sentence"
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

          if (blank.answer === undefined || blank.answer === null) {
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

    // Validate textField format if provided
    if (item.textField) {
      if (typeof item.textField !== "string") {
        return {
          valid: false,
          error: "Field 'textField' must be a string"
        };
      }

      // Check for at least one asterisk marker
      if (!item.textField.includes("*")) {
        return {
          valid: false,
          error: "Field 'textField' must contain at least one blank marked with *answer* format"
        };
      }
    }

    // Validate behaviour fields if provided
    if (item.behaviour) {
      const validBehaviourFields = ["enableRetry", "enableSolutionsButton", "instantFeedback", "enableCheckButton"];
      for (const field of validBehaviourFields) {
        if (item.behaviour[field] !== undefined && typeof item.behaviour[field] !== "boolean") {
          return {
            valid: false,
            error: `behaviour.${field} must be boolean`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Processes drag text content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: DragTextContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // Build textField from sentences or use provided textField
    let textField: string;
    let blankCount = 0;

    if (item.sentences) {
      // Convert simplified format to H5P textField format
      const convertedSentences: string[] = [];
      for (const sentence of item.sentences) {
        convertedSentences.push(this.convertToTextField(sentence));
        blankCount += sentence.blanks.length;
      }
      textField = convertedSentences.join("\n");
    } else {
      // Use provided textField
      textField = item.textField!;
      // Count blanks in textField
      blankCount = (textField.match(/\*[^*]+\*/g) || []).length;
    }

    if (options.verbose) {
      logger.log(`    - Adding drag text: "${item.title || 'Untitled'}" (${blankCount} blanks)`);
    }

    // Build distractors string
    let distractorsField = "";
    if (item.distractors) {
      if (typeof item.distractors === "string") {
        // Native H5P format: already formatted with asterisks
        distractorsField = item.distractors;
      } else if (Array.isArray(item.distractors) && item.distractors.length > 0) {
        // Simplified format: convert array to H5P format
        distractorsField = item.distractors.map(d => `*${d}*`).join("\n");
      }
    }

    // Escape HTML in taskDescription
    const taskDescription = item.taskDescription
      ? `<p>${this.escapeHtml(item.taskDescription)}</p>\n`
      : "";

    // Build H5P DragText structure
    const h5pContent = {
      library: "H5P.DragText 1.10",
      params: {
        taskDescription: taskDescription,
        textField: textField,
        distractors: distractorsField,

        // UI labels
        checkAnswer: item.labels?.checkAnswer || "Check",
        tryAgain: item.labels?.tryAgain || "Retry",
        showSolution: item.labels?.showSolution || "Show Solution",
        correctText: item.labels?.correctText || "Correct!",
        incorrectText: item.labels?.incorrectText || "Incorrect!",
        tipLabel: "Show tip",
        scoreBarLabel: "You got :num out of :total points",

        // Behaviour settings
        behaviour: {
          enableRetry: item.behaviour?.enableRetry !== undefined ? item.behaviour.enableRetry : true,
          enableSolutionsButton: item.behaviour?.enableSolutionsButton !== undefined ? item.behaviour.enableSolutionsButton : true,
          instantFeedback: item.behaviour?.instantFeedback !== undefined ? item.behaviour.instantFeedback : false,
          enableCheckButton: item.behaviour?.enableCheckButton !== undefined ? item.behaviour.enableCheckButton : true
        },

        // Overall feedback
        overallFeedback: item.feedback || [
          {
            from: 0,
            to: 100,
            feedback: "Score: @score of @total."
          }
        ],

        // Media settings
        media: {
          disableImageZooming: false
        },

        // Additional a11y labels
        dropZoneIndex: "Drop Zone @index.",
        empty: "Drop Zone @index is empty.",
        contains: "Drop Zone @index contains draggable @draggable.",
        resetDropTitle: "Reset drop",
        resetDropDescription: "Are you sure you want to reset this drop zone?",
        grabbed: "Draggable is grabbed.",
        cancelledDragging: "Cancelled dragging.",
        correctAnswer: "Correct answer:",
        feedbackHeader: "Feedback",
        submitAnswer: "Submit",
        ariaDraggableIndex: "@index of @count draggables.",
        a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
        a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
        a11yRetry: "Retry the task. Reset all responses and start the task over again."
      },
      metadata: {
        title: item.title || "Drag the Words",
        license: "U",
        contentType: "Drag the Words"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.DragText"];
  }

  /**
   * Converts simplified sentence format to H5P textField format
   *
   * Converts {blank} markers to *answer* format:
   * - Single answer: {blank} with answer "word" → *word*
   * - Multiple answers: {blank} with answers ["word1", "word2"] → *word1/word2*
   * - Answer with tip: {blank} with answer "word" and tip "hint" → *word:hint*
   */
  private convertToTextField(sentence: { text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }): string {
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
