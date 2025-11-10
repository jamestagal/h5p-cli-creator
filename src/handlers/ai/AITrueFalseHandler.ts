import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated true/false content from a single prompt
 */
export interface AITrueFalseContent {
  type: "ai-truefalse" | "ai-true-false";
  title?: string;
  prompt: string;
  questionCount?: number;              // Default: 5

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
 * Handler for AI-generated H5P.TrueFalse content
 *
 * Creates true/false questions using AI to generate the content.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-truefalse
 *   title: "Solar System Quiz"
 *   prompt: "Create true/false questions about planets in our solar system"
 *   questionCount: 10
 *   difficulty: "medium"
 *   aiConfig:
 *     targetAudience: "grade-6"
 *     tone: "educational"
 * ```
 */
export class AITrueFalseHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-truefalse";
  }

  /**
   * Validates AI true/false content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-truefalse requires 'prompt' field. Please provide a prompt for generating true/false questions."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    if (item.questionCount !== undefined) {
      if (typeof item.questionCount !== "number" || item.questionCount < 1) {
        return {
          valid: false,
          error: "questionCount must be a positive integer"
        };
      }
    }

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
   * Processes AI true/false content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AITrueFalseContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI true/false questions: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt.substring(0, 60)}${item.prompt.length > 60 ? '...' : ''}"`);
      logger.log(`      Question count: ${item.questionCount || 5}`);
      if (item.difficulty) {
        logger.log(`      Difficulty: ${item.difficulty}`);
      }
    }

    // Generate questions using AI
    const questions = await this.generateQuestions(
      context,
      item.prompt,
      item.questionCount || 5,
      item.difficulty || "medium",
      item.aiConfig
    );

    if (questions === null) {
      // AI generation failed, use fallback
      if (options.verbose) {
        logger.log(`      ⚠ Using fallback true/false question`);
      }
      this.addFallbackQuestion(chapterBuilder, item.prompt);
      return;
    }

    if (options.verbose) {
      logger.log(`      ✓ Generated ${questions.length} true/false questions`);
      if (questions.length > 0) {
        const sample = questions[0].question.substring(0, 50);
        logger.log(`      Sample: "${sample}${questions[0].question.length > 50 ? '...' : ''}"`);
      }
    }

    // Add each question as a separate TrueFalse content item
    for (const q of questions) {
      this.addTrueFalseQuestion(chapterBuilder, q.question, q.correct, item.title);
    }
  }

  /**
   * Generates true/false questions using AI
   */
  private async generateQuestions(
    context: HandlerContext,
    prompt: string,
    questionCount: number,
    difficulty: "easy" | "medium" | "hard",
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<Array<{ question: string; correct: boolean }> | null> {
    const { quizGenerator, logger, options } = context;

    // Build system prompt for question generation
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      aiConfig as any,
      context.chapterConfig,
      context.bookConfig
    );

    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // Build difficulty instructions
    const difficultyInstructions: Record<string, string> = {
      easy: "Create simple, obvious statements that are clearly true or false. Use straightforward facts.",
      medium: "Create moderately complex statements requiring some thought to evaluate. Include nuanced facts.",
      hard: "Create complex statements with subtle distinctions. Use advanced concepts that require careful analysis."
    };

    // Build user prompt
    const userPrompt = `${prompt}

Generate exactly ${questionCount} true/false questions.

Difficulty: ${difficulty}
${difficultyInstructions[difficulty]}

Format your response as a JSON array with this exact structure:
[
  {
    "question": "Statement to evaluate as true or false",
    "correct": true
  },
  {
    "question": "Another statement",
    "correct": false
  }
]

Return ONLY the JSON array with no additional text or markdown code blocks.`;

    try {
      // Use the quiz generator's AI client to generate questions
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response length: ${response.length} characters`);
      }

      // Parse JSON response
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const questions = JSON.parse(cleaned);

      if (!Array.isArray(questions)) {
        throw new Error("AI response is not an array");
      }

      // Validate and clean question structure
      const cleanedQuestions: Array<{ question: string; correct: boolean }> = [];
      for (const q of questions) {
        if (!q.question || typeof q.correct !== "boolean") {
          throw new Error("Question missing 'question' (string) or 'correct' (boolean) field");
        }

        // Strip HTML from AI-generated question text
        const cleanQuestion = this.stripHtml(q.question);

        cleanedQuestions.push({
          question: cleanQuestion,
          correct: q.correct
        });
      }

      const finalQuestions = cleanedQuestions.slice(0, questionCount); // Ensure we don't exceed requested count

      return finalQuestions;
    } catch (error: any) {
      logger.log(`      ⚠ AI true/false generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Adds a single true/false question to the chapter
   */
  private addTrueFalseQuestion(
    chapterBuilder: any,
    question: string,
    correct: boolean,
    title?: string
  ): void {
    // Build default behaviour
    const defaultBehaviour = {
      enableRetry: true,
      enableSolutionsButton: true,
      enableCheckButton: true,
      confirmCheckDialog: false,
      confirmRetryDialog: false,
      autoCheck: false
    };

    // Build default labels (l10n)
    const defaultLabels = {
      trueText: "True",
      falseText: "False",
      score: "You got @score of @total points",
      checkAnswer: "Check",
      submitAnswer: "Submit",
      showSolutionButton: "Show solution",
      tryAgain: "Retry",
      wrongAnswerMessage: "Wrong answer",
      correctAnswerMessage: "Correct answer",
      scoreBarLabel: "You got :num out of :total points",
      a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
      a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
      a11yRetry: "Retry the task. Reset all responses and start the task over again."
    };

    // Build default confirmation dialogs
    const confirmCheck = {
      header: "Finish ?",
      body: "Are you sure you wish to finish ?",
      cancelLabel: "Cancel",
      confirmLabel: "Finish"
    };

    const confirmRetry = {
      header: "Retry ?",
      body: "Are you sure you wish to retry ?",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm"
    };

    // Build H5P TrueFalse structure
    const h5pContent = {
      library: "H5P.TrueFalse 1.8",
      params: {
        question: `<p>${this.escapeHtml(question)}</p>`,
        correct: correct ? "true" : "false",  // CRITICAL: Convert boolean to string
        behaviour: defaultBehaviour,
        l10n: defaultLabels,
        confirmCheck: confirmCheck,
        confirmRetry: confirmRetry
      },
      metadata: {
        title: title || "True/False Question",
        license: "U",
        contentType: "True/False Question"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Adds a fallback question when AI generation fails
   */
  private addFallbackQuestion(chapterBuilder: any, prompt: string): void {
    const fallbackQuestion = `AI generation failed for prompt: "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}". Please check your API key and try again.`;

    this.addTrueFalseQuestion(
      chapterBuilder,
      fallbackQuestion,
      true,  // Safe default
      "AI Generation Failed"
    );
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.TrueFalse"];
  }

  /**
   * Strips HTML tags from text (safety net for AI responses)
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")           // Remove <p> and </p> tags
      .replace(/<br\s*\/?>/gi, " ")      // Replace <br> with space
      .replace(/<[^>]+>/g, "")           // Remove any other HTML tags
      .trim();
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
