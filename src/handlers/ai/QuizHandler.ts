import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIQuizContent } from "../../compiler/YamlInputParser";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * QuizHandler processes AI-generated quiz content items for Interactive Books.
 * Uses QuizGenerator to create multiple-choice questions from source text.
 *
 * Phase 5: Integrated with AIPromptBuilder for reading level-appropriate quiz generation.
 */
export class QuizHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "ai-quiz";
  }

  /**
   * Process an AI-quiz content item by generating quiz questions and adding to chapter.
   * Calls QuizGenerator with source text and question count.
   *
   * Phase 5: Applies AI configuration to quiz generation:
   * - Reading level affects question vocabulary and complexity
   * - Tone affects question style (educational, professional, etc.)
   * - Customization can add specific requirements
   *
   * Configuration cascade (highest to lowest priority):
   * 1. item.aiConfig (specific to this quiz)
   * 2. context.chapterConfig (chapter-level override)
   * 3. context.bookConfig (book-level default)
   * 4. System defaults (grade-6, educational)
   *
   * @param context Handler execution context with QuizGenerator and configuration cascade
   * @param item AI-quiz content item with sourceText and optional aiConfig
   */
  public async process(context: HandlerContext, item: AIQuizContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options, bookConfig, chapterConfig } = context;

    // Resolve configuration hierarchy: item > chapter > book > defaults
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      chapterConfig,
      bookConfig
    );

    if (options.verbose) {
      logger.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
      logger.log(`      Reading level: ${resolvedConfig.targetAudience}`);
      logger.log(`      Source text length: ${item.sourceText.length} characters`);
      logger.log(`      Questions: ${item.questionCount || 5}`);
    }

    try {
      // Generate quiz with reading level configuration
      const quizContent = await quizGenerator.generateH5pQuiz(
        item.sourceText,
        item.questionCount || 5,
        resolvedConfig
      );
      chapterBuilder.addQuizPage(quizContent);

      if (options.verbose) {
        logger.log(`      Generated ${quizContent.length} questions`);
      }
    } catch (error) {
      logger.warn(`      AI quiz generation failed: ${error}`);
      // Fallback to text page explaining the failure
      chapterBuilder.addTextPage(
        item.title || "Quiz",
        `Quiz generation failed. Please ensure your AI API key is valid.\n\nError: ${error}`
      );
    }
  }

  /**
   * Validate AI-quiz content item structure.
   *
   * Phase 5: Validates optional aiConfig fields if provided.
   *
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.sourceText || typeof item.sourceText !== "string") {
      return { valid: false, error: "AI quiz content must have a 'sourceText' field (string)" };
    }

    // Validate aiConfig if present (same validation as AITextHandler)
    if (item.aiConfig) {
      const validLevels = [
        "elementary",
        "grade-6",
        "grade-9",
        "high-school",
        "college",
        "professional",
        "esl-beginner",
        "esl-intermediate"
      ];
      const validTones = ["educational", "professional", "casual", "academic"];

      if (item.aiConfig.targetAudience && !validLevels.includes(item.aiConfig.targetAudience)) {
        return {
          valid: false,
          error: `Invalid targetAudience: ${item.aiConfig.targetAudience}. Valid options: ${validLevels.join(", ")}`
        };
      }

      if (item.aiConfig.tone && !validTones.includes(item.aiConfig.tone)) {
        return {
          valid: false,
          error: `Invalid tone: ${item.aiConfig.tone}. Valid options: ${validTones.join(", ")}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for AI-quiz content
   * @returns Array containing H5P.MultiChoice library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.MultiChoice"];
  }
}
