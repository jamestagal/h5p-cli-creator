import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIQuizContent } from "../../compiler/YamlInputParser";

/**
 * QuizHandler processes AI-generated quiz content items for Interactive Books.
 * Uses QuizGenerator to create multiple-choice questions from source text.
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
   * @param context Handler execution context with QuizGenerator
   * @param item AI-quiz content item with sourceText and optional questionCount
   */
  public async process(context: HandlerContext, item: AIQuizContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
      logger.log(`      Source text length: ${item.sourceText.length} characters`);
      logger.log(`      Questions: ${item.questionCount || 5}`);
    }

    try {
      const quizContent = await quizGenerator.generateH5pQuiz(
        item.sourceText,
        item.questionCount || 5
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
   * Validate AI-quiz content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.sourceText || typeof item.sourceText !== "string") {
      return { valid: false, error: "AI quiz content must have a 'sourceText' field (string)" };
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
