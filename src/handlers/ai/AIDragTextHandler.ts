import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated drag text content from a single prompt
 */
export interface AIDragTextContent {
  type: "ai-dragtext" | "ai-drag-the-words";
  title?: string;
  prompt: string;
  sentenceCount?: number;  // Default: 5
  blanksPerSentence?: number;  // Default: 2
  includeDistractors?: boolean;  // Default: true
  distractorCount?: number;  // Default: 3

  // Content structure parameter
  difficulty?: "easy" | "medium" | "hard";

  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

/**
 * Handler for AI-generated H5P.DragText content
 *
 * Creates fill-in-the-blank exercises using AI to generate the content.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-dragtext
 *   title: "Photosynthesis Blanks"
 *   prompt: "Create fill-in-the-blank sentences about photosynthesis, chloroplasts, and plant biology."
 *   sentenceCount: 5
 *   blanksPerSentence: 2
 *   includeDistractors: true
 *   distractorCount: 3
 *   difficulty: "medium"
 *   aiConfig:
 *     targetAudience: "high-school"
 *     tone: "educational"
 * ```
 */
export class AIDragTextHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-dragtext";
  }

  /**
   * Validates AI drag text content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-dragtext requires 'prompt' field. Please provide a prompt for generating drag text exercises."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    if (item.sentenceCount !== undefined) {
      if (typeof item.sentenceCount !== "number" || item.sentenceCount < 1) {
        return {
          valid: false,
          error: "Field 'sentenceCount' must be a positive number (1 or more)"
        };
      }
    }

    if (item.blanksPerSentence !== undefined) {
      if (typeof item.blanksPerSentence !== "number" || item.blanksPerSentence < 1) {
        return {
          valid: false,
          error: "Field 'blanksPerSentence' must be a positive number (1 or more)"
        };
      }
    }

    if (item.distractorCount !== undefined) {
      if (typeof item.distractorCount !== "number" || item.distractorCount < 0) {
        return {
          valid: false,
          error: "Field 'distractorCount' must be a non-negative number (0 or more)"
        };
      }
    }

    if (item.includeDistractors !== undefined && typeof item.includeDistractors !== "boolean") {
      return {
        valid: false,
        error: "Field 'includeDistractors' must be boolean"
      };
    }

    if (item.difficulty !== undefined) {
      const validDifficulties = ["easy", "medium", "hard"];
      if (!validDifficulties.includes(item.difficulty)) {
        return {
          valid: false,
          error: `Field 'difficulty' must be one of: ${validDifficulties.join(", ")}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Processes AI drag text content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AIDragTextContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // Determine effective parameters
    const sentenceCount = item.sentenceCount || 5;
    const difficulty = item.difficulty || "medium";
    const includeDistractors = item.includeDistractors !== undefined ? item.includeDistractors : true;
    const distractorCount = item.distractorCount || 3;

    // Determine blanksPerSentence based on difficulty if not explicitly provided
    let blanksPerSentence = item.blanksPerSentence;
    if (blanksPerSentence === undefined) {
      if (difficulty === "easy") {
        blanksPerSentence = 1;
      } else if (difficulty === "medium") {
        blanksPerSentence = 2;
      } else {
        blanksPerSentence = 3;
      }
    }

    if (options.verbose) {
      logger.log(`    - Generating AI drag text: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt}"`);
      logger.log(`      Sentence count: ${sentenceCount}`);
      logger.log(`      Blanks per sentence: ${blanksPerSentence}`);
      logger.log(`      Difficulty: ${difficulty}`);
      logger.log(`      Include distractors: ${includeDistractors}`);
    }

    // Generate drag text sentences using AI
    const result = await this.generateDragTextSentences(
      context,
      item.prompt,
      sentenceCount,
      blanksPerSentence,
      difficulty,
      includeDistractors,
      distractorCount,
      item.aiConfig
    );

    if (options.verbose) {
      logger.log(`      ✓ Generated ${result.sentences.length} sentences with ${result.totalBlanks} total blanks`);
    }

    // Build textField from sentences
    const textFieldLines: string[] = [];
    for (const sentence of result.sentences) {
      textFieldLines.push(this.convertToTextField(sentence));
    }
    const textField = textFieldLines.join("\n");

    // Build distractors string
    let distractorsField = "";
    if (result.distractors.length > 0) {
      distractorsField = result.distractors.map(d => `*${d}*`).join("\n");
    }

    // Build H5P DragText structure
    const h5pContent = {
      library: "H5P.DragText 1.10",
      params: {
        taskDescription: "",
        textField: textField,
        distractors: distractorsField,

        // UI labels
        checkAnswer: "Check",
        tryAgain: "Retry",
        showSolution: "Show Solution",
        correctText: "Correct!",
        incorrectText: "Incorrect!",
        tipLabel: "Show tip",
        scoreBarLabel: "You got :num out of :total points",

        // Behaviour settings
        behaviour: {
          enableRetry: true,
          enableSolutionsButton: true,
          instantFeedback: false,
          enableCheckButton: true
        },

        // Overall feedback
        overallFeedback: [
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
   * Generates drag text sentences using AI
   */
  private async generateDragTextSentences(
    context: HandlerContext,
    prompt: string,
    sentenceCount: number,
    blanksPerSentence: number,
    difficulty: "easy" | "medium" | "hard",
    includeDistractors: boolean,
    distractorCount: number,
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<{ sentences: Array<{ text: string; blanks: Array<{ answer: string }> }>; distractors: string[]; totalBlanks: number }> {
    const { quizGenerator, logger, options } = context;

    try {
      // Build system prompt for drag text generation
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Build difficulty-specific vocabulary instructions
      let vocabularyGuidance = "";
      let distractorGuidance = "";

      if (difficulty === "easy") {
        vocabularyGuidance = `
- Use simple, everyday vocabulary appropriate for beginners
- Choose obvious, clear answers that are easy to identify
- Keep sentences short and straightforward
- Use ${blanksPerSentence} blank per sentence
- Make answers common, familiar words`;

        if (includeDistractors) {
          distractorGuidance = `Include ${distractorCount} distractor words that are obviously incorrect but still related to the topic.`;
        }
      } else if (difficulty === "medium") {
        vocabularyGuidance = `
- Use moderate, grade-level vocabulary
- Choose answers that require some thought but are not obscure
- Use ${blanksPerSentence} blanks per sentence
- Balance between common and subject-specific terms
- Make the exercise moderately challenging`;

        if (includeDistractors) {
          distractorGuidance = `Include ${distractorCount} distractor words that are plausible but incorrect, testing understanding.`;
        }
      } else {
        vocabularyGuidance = `
- Use advanced, subject-specific vocabulary
- Choose answers that require deep understanding of the topic
- Use ${blanksPerSentence} blanks per sentence
- Include technical terms and specialized language
- Make the exercise challenging and thought-provoking`;

        if (includeDistractors) {
          distractorGuidance = `Include ${distractorCount} distractor words that are very plausible and require careful analysis to distinguish from correct answers.`;
        }
      }

      // Build user prompt
      const userPrompt = `${prompt}

Generate exactly ${sentenceCount} fill-in-the-blank sentences. ${vocabularyGuidance}

${includeDistractors ? distractorGuidance : "Do not include distractors."}

IMPORTANT FORMAT INSTRUCTIONS:
- Use {blank} markers in the text (NOT asterisk markers like *word*)
- Each sentence must have EXACTLY ${blanksPerSentence} {blank} marker(s)
- The number of {blank} markers in text must match the length of the blanks array
- Do NOT use H5P asterisk format (*answer*) - we will convert that later

Format your response as a JSON object with this exact structure:
{
  "sentences": [
    {
      "text": "The Sun is the {blank} in our solar system.",
      "blanks": [
        { "answer": "star" }
      ]
    },
    {
      "text": "Earth is the {blank} planet from the {blank}.",
      "blanks": [
        { "answer": "third" },
        { "answer": "Sun" }
      ]
    }
  ],
  "distractors": ["moon", "asteroid", "comet"]
}

Return ONLY the JSON object with no additional text or markdown code blocks.`;

      // Use the quiz generator's AI client to generate sentences
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response length: ${response.length} characters`);
      }

      // Parse JSON response
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const data = JSON.parse(cleaned);

      if (!data.sentences || !Array.isArray(data.sentences)) {
        throw new Error("AI response missing 'sentences' array");
      }

      // Validate and clean sentence structure
      const cleanedSentences: Array<{ text: string; blanks: Array<{ answer: string }> }> = [];
      let totalBlanks = 0;

      for (const sentence of data.sentences) {
        if (!sentence.text || !sentence.blanks || !Array.isArray(sentence.blanks)) {
          throw new Error("Sentence missing text or blanks array");
        }

        // Validate {blank} count matches blanks.length
        const blankCount = (sentence.text.match(/\{blank\}/g) || []).length;
        if (blankCount !== sentence.blanks.length) {
          logger.log(`      ⚠ Warning: Sentence has ${blankCount} {blank} markers but ${sentence.blanks.length} blanks defined, fixing...`);
        }

        // Strip HTML from text and answers
        const cleanText = this.stripHtml(sentence.text);
        const cleanBlanks = sentence.blanks.map((b: any) => ({
          answer: this.stripHtml(b.answer || "")
        }));

        cleanedSentences.push({
          text: cleanText,
          blanks: cleanBlanks
        });

        totalBlanks += cleanBlanks.length;
      }

      // Get distractors
      const distractors: string[] = [];
      if (includeDistractors && data.distractors && Array.isArray(data.distractors)) {
        for (const d of data.distractors) {
          if (typeof d === "string") {
            distractors.push(this.stripHtml(d));
          }
        }
      }

      const finalSentences = cleanedSentences.slice(0, sentenceCount); // Ensure we don't exceed requested count

      // Log generated sentences in verbose mode
      if (options.verbose && finalSentences.length > 0) {
        const sampleText = finalSentences[0].text.substring(0, 60);
        logger.log(`      Sample sentence: "${sampleText}${finalSentences[0].text.length > 60 ? '...' : ''}"`);
      }

      return {
        sentences: finalSentences,
        distractors: distractors,
        totalBlanks: totalBlanks
      };
    } catch (error) {
      logger.log(`      ⚠ AI drag text generation failed: ${error.message}`);
      logger.log(`      Using fallback content`);

      // Fallback to basic sentence if AI generation fails
      return this.getFallbackContent(prompt);
    }
  }

  /**
   * Provides fallback content if AI generation fails
   */
  private getFallbackContent(prompt: string): { sentences: Array<{ text: string; blanks: Array<{ answer: string }> }>; distractors: string[]; totalBlanks: number } {
    return {
      sentences: [
        {
          text: `AI generation failed for prompt: "${prompt}". Please check your API key and try again. The answer is {blank}.`,
          blanks: [
            { answer: "failed" }
          ]
        }
      ],
      distractors: ["error", "retry"],
      totalBlanks: 1
    };
  }

  /**
   * Converts sentence to H5P textField format
   */
  private convertToTextField(sentence: { text: string; blanks: Array<{ answer: string }> }): string {
    let result = sentence.text;
    let blankIndex = 0;

    // Replace each {blank} marker with corresponding H5P format
    result = result.replace(/\{blank\}/g, () => {
      if (blankIndex >= sentence.blanks.length) {
        // Fallback to placeholder if mismatch
        return "*___*";
      }

      const blank = sentence.blanks[blankIndex];
      blankIndex++;

      // Single answer format
      return `*${blank.answer}*`;
    });

    return result;
  }

  /**
   * Strips HTML tags from text
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")  // Remove <p> and </p> tags
      .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
      .replace(/<[^>]+>/g, "")  // Remove any other HTML tags
      .trim();
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.DragText"];
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
