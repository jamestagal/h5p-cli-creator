import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated single choice set content from a single prompt
 */
export interface AISingleChoiceSetContent {
  type: "ai-singlechoiceset" | "ai-single-choice-set";
  title?: string;
  prompt: string;
  questionCount?: number;              // Default: 5
  distractorsPerQuestion?: number;     // Default: 2 (total 3 options)

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
 * Handler for AI-generated H5P.SingleChoiceSet content
 *
 * Creates single-choice quiz questions using AI to generate the content.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-singlechoiceset
 *   title: "Solar System Quiz"
 *   prompt: "Create single-choice questions about planets in our solar system"
 *   questionCount: 8
 *   distractorsPerQuestion: 3
 *   difficulty: "medium"
 * ```
 */
export class AISingleChoiceSetHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-singlechoiceset";
  }

  /**
   * Validates AI single choice set content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-singlechoiceset requires 'prompt' field. Please provide a prompt for generating quiz questions."
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

    if (item.distractorsPerQuestion !== undefined) {
      if (typeof item.distractorsPerQuestion !== "number" || item.distractorsPerQuestion < 1) {
        return {
          valid: false,
          error: "distractorsPerQuestion must be at least 1"
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
   * Processes AI single choice set content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AISingleChoiceSetContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI single choice set: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt}"`);
      logger.log(`      Question count: ${item.questionCount || 5}`);
      logger.log(`      Distractors per question: ${item.distractorsPerQuestion || 2}`);
    }

    // Generate questions using AI
    const questions = await this.generateQuestions(
      context,
      item.prompt,
      item.questionCount || 5,
      this.getDistractorCount(item),
      item.aiConfig
    );

    if (questions === null) {
      // AI generation failed, use fallback
      if (options.verbose) {
        logger.log(`      ⚠ Using fallback text page`);
      }
      chapterBuilder.addTextPage(
        "AI Generation Failed",
        `Unable to generate single choice questions for: "${item.prompt}". Please check your API key and try again.`,
        false
      );
      return;
    }

    if (options.verbose) {
      logger.log(`      ✓ Generated ${questions.length} questions`);
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

    // Build default feedback
    const defaultFeedback = [
      {
        from: 0,
        to: 100,
        feedback: "You got :numcorrect of :maxscore correct"
      }
    ];

    // Transform questions to H5P choices format
    // CRITICAL: Correct answer MUST be at index 0
    const choices = questions.map(q => ({
      question: this.stripHtml(q.question),
      answers: [
        this.stripHtml(q.correctAnswer),  // Index 0 is ALWAYS correct
        ...q.distractors.map(d => this.stripHtml(d))
      ],
      subContentId: this.generateSubContentId()
    }));

    // Build H5P SingleChoiceSet structure
    const h5pContent = {
      library: "H5P.SingleChoiceSet 1.11",
      params: {
        choices: choices,
        behaviour: defaultBehaviour,
        l10n: defaultLabels,
        overallFeedback: defaultFeedback
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
   * Determines distractor count based on difficulty or explicit setting
   */
  private getDistractorCount(item: AISingleChoiceSetContent): number {
    // Explicit distractorsPerQuestion takes precedence
    if (item.distractorsPerQuestion !== undefined) {
      return item.distractorsPerQuestion;
    }

    // Map difficulty to distractor count
    if (item.difficulty === "easy") {
      return 2;  // 3 total options
    } else if (item.difficulty === "hard") {
      return 4;  // 5 total options
    } else {
      return 2;  // medium or default: 3 total options
    }
  }

  /**
   * Generates questions using AI
   */
  private async generateQuestions(
    context: HandlerContext,
    prompt: string,
    questionCount: number,
    distractorsPerQuestion: number,
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<Array<{ question: string; correctAnswer: string; distractors: string[] }> | null> {
    const { quizGenerator, logger, options } = context;

    // Build system prompt for question generation
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      aiConfig as any,
      context.chapterConfig,
      context.bookConfig
    );

    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // Build user prompt
    const userPrompt = `${prompt}

Generate exactly ${questionCount} single-choice quiz questions. Each question should have:
- 1 correct answer
- ${distractorsPerQuestion} incorrect answers (distractors)

Format your response as a JSON array with this exact structure:
[
  {
    "question": "Question text here?",
    "correctAnswer": "Correct answer here",
    "distractors": ["Wrong answer 1", "Wrong answer 2"]
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
      const cleanedQuestions: Array<{ question: string; correctAnswer: string; distractors: string[] }> = [];
      for (const q of questions) {
        if (!q.question || !q.correctAnswer || !q.distractors || !Array.isArray(q.distractors)) {
          throw new Error("Question missing required fields");
        }

        cleanedQuestions.push({
          question: q.question,
          correctAnswer: q.correctAnswer,
          distractors: q.distractors
        });
      }

      const finalQuestions = cleanedQuestions.slice(0, questionCount); // Ensure we don't exceed requested count

      // Log generated questions in verbose mode
      if (options.verbose && finalQuestions.length > 0) {
        logger.log(`      Sample question: "${finalQuestions[0].question.substring(0, 50)}..."`);
      }

      return finalQuestions;
    } catch (error: any) {
      logger.log(`      ⚠ AI single choice set generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.SingleChoiceSet"];
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
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
