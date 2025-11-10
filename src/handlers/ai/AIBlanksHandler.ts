import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated blanks (fill-in-the-blank) content from a single prompt
 */
export interface AIBlanksContent {
  type: "ai-blanks" | "ai-fill-in-the-blanks";
  title?: string;
  prompt: string;
  sentenceCount?: number;              // Default: 5
  blanksPerSentence?: number;          // Default: 1, range: 1-3
  difficulty?: "easy" | "medium" | "hard";

  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

/**
 * Handler for AI-generated H5P.Blanks content
 *
 * Creates fill-in-the-blank exercises using AI to generate the content.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-blanks
 *   title: "Solar System Quiz"
 *   prompt: "Create fill-in-the-blank sentences about planets in our solar system"
 *   sentenceCount: 8
 *   blanksPerSentence: 1
 *   difficulty: "medium"
 *   aiConfig:
 *     targetAudience: "grade-6"
 *     tone: "educational"
 * ```
 */
export class AIBlanksHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-blanks";
  }

  /**
   * Validates AI blanks content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-blanks requires 'prompt' field. Please provide a prompt for generating fill-in-the-blank content."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    // Validate sentenceCount if provided
    if (item.sentenceCount !== undefined) {
      if (typeof item.sentenceCount !== "number") {
        return {
          valid: false,
          error: "Field 'sentenceCount' must be a number"
        };
      }

      if (item.sentenceCount < 1) {
        return {
          valid: false,
          error: "sentenceCount must be a positive integer (at least 1)"
        };
      }
    }

    // Validate blanksPerSentence if provided
    if (item.blanksPerSentence !== undefined) {
      if (typeof item.blanksPerSentence !== "number") {
        return {
          valid: false,
          error: "Field 'blanksPerSentence' must be a number"
        };
      }

      if (item.blanksPerSentence < 1 || item.blanksPerSentence > 3) {
        return {
          valid: false,
          error: "blanksPerSentence must be between 1 and 3"
        };
      }
    }

    // Validate difficulty if provided
    if (item.difficulty !== undefined) {
      if (!["easy", "medium", "hard"].includes(item.difficulty)) {
        return {
          valid: false,
          error: "difficulty must be one of: easy, medium, hard"
        };
      }
    }

    return { valid: true };
  }

  /**
   * Processes AI blanks content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AIBlanksContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    const sentenceCount = item.sentenceCount || 5;
    const blanksPerSentence = item.blanksPerSentence || 1;
    const difficulty = item.difficulty || "medium";

    if (options.verbose) {
      logger.log(`    - Generating AI blanks: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt}"`);
      logger.log(`      Sentence count: ${sentenceCount}, Blanks per sentence: ${blanksPerSentence}, Difficulty: ${difficulty}`);
    }

    // Generate sentences using AI
    const sentences = await this.generateBlanksSentences(
      context,
      item.prompt,
      sentenceCount,
      blanksPerSentence,
      difficulty,
      item.aiConfig
    );

    if (options.verbose) {
      logger.log(`      ✓ Generated ${sentences.length} sentences`);
    }

    // Convert AI output to H5P questions format using convertSimplifiedToNative
    const questions = sentences.map(sentence => {
      const converted = this.convertSimplifiedToNative(sentence);
      return `<p>${this.escapeHtml(converted)}</p>`;
    });

    // Build H5P Blanks structure
    const h5pContent: any = {
      library: "H5P.Blanks 1.14",
      params: {
        text: "",  // Task description (empty for AI-generated content)
        questions: questions,

        // Behaviour settings (use defaults)
        behaviour: {
          enableRetry: true,
          enableSolutionsButton: true,
          enableCheckButton: true,
          autoCheck: false,
          caseSensitive: true,
          showSolutionsRequiresInput: true,
          separateLines: false,
          confirmCheckDialog: false,
          confirmRetryDialog: false,
          acceptSpellingErrors: false
        },

        // Overall feedback
        overallFeedback: [
          {
            from: 0,
            to: 100,
            feedback: "You got @score of @total blanks correct."
          }
        ],

        // UI labels
        showSolutions: "Show solutions",
        tryAgain: "Try again",
        checkAnswer: "Check",
        submitAnswer: "Submit",
        notFilledOut: "Please fill in all blanks",
        answerIsCorrect: "':ans' is correct",
        answerIsWrong: "':ans' is wrong",
        answeredCorrectly: "Answered correctly",
        answeredIncorrectly: "Answered incorrectly",
        solutionLabel: "Correct answer:",
        inputLabel: "Blank input @num of @total",
        inputHasTipLabel: "Tip available",
        tipLabel: "Tip",
        scoreBarLabel: "You got :num out of :total points",
        a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
        a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
        a11yRetry: "Retry the task. Reset all responses and start the task over again.",
        a11yCheckingModeHeader: "Checking mode",

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

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Generates fill-in-the-blank sentences using AI
   */
  private async generateBlanksSentences(
    context: HandlerContext,
    prompt: string,
    sentenceCount: number,
    blanksPerSentence: number,
    difficulty: "easy" | "medium" | "hard",
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<Array<{ text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }>> {
    const { quizGenerator, logger, options } = context;

    // Build system prompt for blanks generation
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      aiConfig as any,
      context.chapterConfig,
      context.bookConfig
    );

    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // Build difficulty-specific instructions
    let difficultyInstructions = "";
    if (difficulty === "easy") {
      difficultyInstructions = "Use simple vocabulary and straightforward concepts. Keep sentences clear and easy to understand. Choose common, everyday words for the blanks.";
    } else if (difficulty === "medium") {
      difficultyInstructions = "Use moderate vocabulary and require some thinking. Mix common and slightly technical terms. Ensure answers require understanding of the topic.";
    } else {
      difficultyInstructions = "Use complex sentences with academic or technical vocabulary. Choose challenging blanks that require deep understanding of the subject matter.";
    }

    // Build user prompt
    const userPrompt = `${prompt}

Generate exactly ${sentenceCount} fill-in-the-blank sentences. Each sentence should have exactly ${blanksPerSentence} blank(s).

Difficulty level: ${difficulty}
${difficultyInstructions}

Format your response as a JSON array with this exact structure:
[
  {
    "text": "The Earth is {blank}.",
    "blanks": [
      {
        "answer": "round",
        "tip": "Not flat!"
      }
    ]
  }
]

Important guidelines:
- Use {blank} as a placeholder marker in the text
- Each blank object should have an "answer" field (string or array of strings for alternative answers)
- Optionally include a "tip" field with a helpful hint
- Ensure the number of {blank} markers matches the number of blanks in the array
- Make sure sentences are educational and factually correct
- Strip any HTML tags from your response

Return ONLY the JSON array with no additional text or markdown code blocks.`;

    try {
      // Use the quiz generator's AI client to generate sentences
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response received (${response.length} characters)`);
      }

      // Parse JSON response (strip markdown code fences)
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const sentences = JSON.parse(cleaned);

      if (!Array.isArray(sentences)) {
        throw new Error("AI response is not an array");
      }

      // Validate and clean sentence structure
      const cleanedSentences: Array<{ text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }> = [];
      for (const sentence of sentences) {
        if (!sentence.text || !sentence.blanks) {
          throw new Error("Sentence missing text or blanks");
        }

        if (!Array.isArray(sentence.blanks)) {
          throw new Error("Sentence blanks must be an array");
        }

        // Strip HTML tags from AI-generated text
        const cleanText = this.stripHtml(sentence.text);

        // Clean blanks
        const cleanBlanks = sentence.blanks.map((blank: any) => {
          const cleanBlank: { answer: string | string[]; tip?: string } = {
            answer: blank.answer
          };

          // Strip HTML from tip if present
          if (blank.tip) {
            cleanBlank.tip = this.stripHtml(blank.tip);
          }

          return cleanBlank;
        });

        cleanedSentences.push({
          text: cleanText,
          blanks: cleanBlanks
        });
      }

      const finalSentences = cleanedSentences.slice(0, sentenceCount); // Ensure we don't exceed requested count

      // Log generated sentence in verbose mode
      if (options.verbose && finalSentences.length > 0) {
        logger.log(`      Sample: "${finalSentences[0].text}" (${finalSentences[0].blanks.length} blanks)`);
      }

      return finalSentences;
    } catch (error) {
      logger.log(`      ⚠ AI blanks generation failed: ${error.message}`);
      logger.log(`      Using fallback content`);

      // Fallback to basic sentence if AI generation fails
      return this.getFallbackSentences(prompt, sentenceCount);
    }
  }

  /**
   * Provides fallback sentences if AI generation fails
   */
  private getFallbackSentences(
    prompt: string,
    count: number
  ): Array<{ text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }> {
    const fallback: Array<{ text: string; blanks: Array<{ answer: string | string[]; tip?: string }> }> = [];

    for (let i = 0; i < count; i++) {
      fallback.push({
        text: `AI fill-in-the-blank generation failed for prompt: "${prompt}". Please check your API key and try again. This is placeholder sentence ${i + 1} with a {blank}.`,
        blanks: [
          {
            answer: "blank",
            tip: "This is a fallback sentence"
          }
        ]
      });
    }

    return fallback;
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Blanks"];
  }

  /**
   * Strips HTML tags from text (HTML safety net for AI responses)
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")  // Remove <p> and </p> tags
      .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
      .replace(/<[^>]+>/g, "")  // Remove any other HTML tags
      .trim();
  }

  /**
   * Converts simplified sentence format to H5P native question format
   * (Copied from BlanksHandler for consistency)
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
   * (Copied from BlanksHandler for consistency)
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
   * (Copied from BlanksHandler for consistency)
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
