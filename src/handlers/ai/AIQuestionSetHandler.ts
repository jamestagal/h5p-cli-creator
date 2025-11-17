import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";
import { HandlerRegistry } from "../HandlerRegistry";
import { ChapterBuilder } from "../../compiler/ChapterBuilder";
import { MediaFile } from "../../compiler/ContentBuilder";
import { randomUUID } from "crypto";

/**
 * AI-generated QuestionSet content configuration
 *
 * QuestionSet is a container that wraps multiple question types into a unified quiz experience
 * with intro pages, progress tracking, and comprehensive result screens.
 *
 * YAML Usage Example:
 * ```yaml
 * title: "Vietnamese Greetings Quiz"
 * language: vi
 *
 * aiConfig:
 *   targetLanguage: "vi"
 *   instructionalLanguage: "en"
 *   includeTranslations: true
 *   targetAudience: "esl-beginner"
 *
 * chapters:
 *   - title: "Greetings Assessment"
 *     content:
 *       - type: ai-questionset
 *         title: "Vietnamese Greetings Quiz"
 *
 *         introPage:
 *           showIntro: true
 *           title: "Vietnamese Greetings Assessment"
 *           introduction: "<p>This quiz tests your understanding of Vietnamese greetings.</p>"
 *           startButtonText: "Begin Quiz"
 *
 *         progressType: "textual"
 *         passPercentage: 70
 *
 *         questions:
 *           - type: ai-multichoice
 *             prompt: "Create a question about Vietnamese greetings"
 *           - type: ai-blanks
 *             prompt: "Create fill-in-the-blank about greeting phrases"
 *             sentenceCount: 2
 *           - type: ai-truefalse
 *             prompt: "Create true/false about formal greetings"
 *             questionCount: 2
 *
 *         endGame:
 *           showResults: true
 *           message: "Quiz completed!"
 *           overallFeedback:
 *             - from: 0
 *               to: 49
 *               feedback: "Keep practicing!"
 *             - from: 50
 *               to: 79
 *               feedback: "Good job!"
 *             - from: 80
 *               to: 100
 *               feedback: "Excellent!"
 * ```
 */
export interface AIQuestionSetContent {
  type: "ai-questionset" | "questionset";
  title?: string;

  // Intro page configuration
  introPage?: {
    showIntro: boolean;
    title?: string;
    introduction?: string;  // HTML supported
    startButtonText?: string;
  };

  // Quiz settings
  progressType?: "dots" | "textual";
  passPercentage?: number;  // 0-100
  randomQuestions?: boolean;
  poolSize?: number;  // For question banking

  // Questions array (mixed types)
  questions: Array<{
    type: string;  // "ai-multichoice", "ai-blanks", "ai-dragtext", "ai-truefalse", "ai-essay", "ai-singlechoiceset"
    prompt: string;
    title?: string;
    // Question-type-specific parameters passed to handler
    [key: string]: any;
  }>;

  // End game configuration
  endGame?: {
    showResults: boolean;
    message?: string;
    overallFeedback?: Array<{
      from: number;  // Percentage 0-100
      to: number;    // Percentage 0-100
      feedback: string;
    }>;
  };

  // AI configuration (inherits from chapter/book)
  aiConfig?: {
    targetLanguage?: string;
    instructionalLanguage?: string;
    includeTranslations?: boolean;
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

/**
 * Capture ChapterBuilder that stores content instead of adding to parent array
 * Used to capture handler-generated content without adding it to the actual chapter
 */
class CaptureChapterBuilder {
  private capturedContent: any[] = [];

  constructor(
    private basePath: string,
    private mediaFiles: MediaFile[],
    private audioAutoplay: boolean = false
  ) {}

  public addCustomContent(content: any): this {
    this.capturedContent.push(content);
    return this;
  }

  public addTextPage(title: string, text: string): this {
    // Not needed for QuestionSet, but implement for completeness
    return this;
  }

  public addImagePage(imagePath: string, altText: string, title?: string): this {
    // Not needed for QuestionSet
    return this;
  }

  public addAudioPage(audioPath: string, title?: string): this {
    // Not needed for QuestionSet
    return this;
  }

  public addQuizPage(quizContent: any): this {
    // MultiChoiceHandler uses this method
    this.capturedContent.push(quizContent);
    return this;
  }

  public getContent(): any[] {
    return this.capturedContent;
  }

  public getLastContent(): any {
    return this.capturedContent.length > 0
      ? this.capturedContent[this.capturedContent.length - 1]
      : null;
  }

  public clearContent(): void {
    this.capturedContent = [];
  }
}

/**
 * Handler for AI-generated H5P.QuestionSet content
 *
 * Creates comprehensive quiz assessments with mixed question types by delegating to existing handlers.
 * Wraps questions in QuestionSet structure with intro pages, progress tracking, and result screens.
 *
 * Supports 6 question types via existing handlers:
 * - ai-multichoice: MultiChoiceHandler (H5P.MultiChoice) - note: currently named ai-quiz in registry
 * - ai-blanks: AIBlanksHandler (H5P.Blanks)
 * - ai-dragtext: AIDragTextHandler (H5P.DragText)
 * - ai-truefalse: AITrueFalseHandler (H5P.TrueFalse)
 * - ai-essay: AIEssayHandler (H5P.Essay)
 * - ai-singlechoiceset: AISingleChoiceSetHandler (H5P.SingleChoiceSet)
 */
export class AIQuestionSetHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-questionset";
  }

  /**
   * Validates AI QuestionSet content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Validate questions array exists and is non-empty
    if (!item.questions || !Array.isArray(item.questions)) {
      return {
        valid: false,
        error: "AI-questionset requires 'questions' field as a non-empty array"
      };
    }

    if (item.questions.length === 0) {
      return {
        valid: false,
        error: "AI-questionset must have at least one question in the questions array"
      };
    }

    // Validate each question has required fields and supported type
    const supportedTypes = [
      "ai-quiz",  // MultiChoiceHandler (H5P.MultiChoice) - current registry name
      "ai-multichoice",  // Alias for ai-quiz
      "ai-blanks",
      "ai-dragtext",
      "ai-truefalse",
      "ai-essay",
      "ai-singlechoiceset"
    ];

    for (let i = 0; i < item.questions.length; i++) {
      const question = item.questions[i];

      if (!question.type || typeof question.type !== "string") {
        return {
          valid: false,
          error: `Question ${i + 1} is missing 'type' field (string)`
        };
      }

      if (!supportedTypes.includes(question.type)) {
        return {
          valid: false,
          error: `Question ${i + 1} has unsupported type '${question.type}'. Supported types: ${supportedTypes.join(", ")}`
        };
      }

      // For ai-quiz (MultiChoice), sourceText is required instead of prompt
      if (question.type === "ai-quiz" || question.type === "ai-multichoice") {
        if (!question.sourceText && !question.prompt) {
          return {
            valid: false,
            error: `Question ${i + 1} (${question.type}) is missing 'sourceText' or 'prompt' field (string)`
          };
        }
      } else {
        if (!question.prompt || typeof question.prompt !== "string") {
          return {
            valid: false,
            error: `Question ${i + 1} (${question.type}) is missing 'prompt' field (string)`
          };
        }
      }
    }

    // Validate introPage structure if provided
    if (item.introPage) {
      if (typeof item.introPage.showIntro !== "boolean") {
        return {
          valid: false,
          error: "introPage.showIntro must be a boolean"
        };
      }

      if (item.introPage.title !== undefined && typeof item.introPage.title !== "string") {
        return {
          valid: false,
          error: "introPage.title must be a string"
        };
      }

      if (item.introPage.introduction !== undefined && typeof item.introPage.introduction !== "string") {
        return {
          valid: false,
          error: "introPage.introduction must be a string"
        };
      }

      if (item.introPage.startButtonText !== undefined && typeof item.introPage.startButtonText !== "string") {
        return {
          valid: false,
          error: "introPage.startButtonText must be a string"
        };
      }
    }

    // Validate progressType if provided
    if (item.progressType !== undefined) {
      if (!["dots", "textual"].includes(item.progressType)) {
        return {
          valid: false,
          error: "progressType must be either 'dots' or 'textual'"
        };
      }
    }

    // Validate passPercentage if provided
    if (item.passPercentage !== undefined) {
      if (typeof item.passPercentage !== "number" || item.passPercentage < 0 || item.passPercentage > 100) {
        return {
          valid: false,
          error: "passPercentage must be a number between 0 and 100"
        };
      }
    }

    // Validate endGame structure if provided
    if (item.endGame) {
      if (typeof item.endGame.showResults !== "boolean") {
        return {
          valid: false,
          error: "endGame.showResults must be a boolean"
        };
      }

      if (item.endGame.overallFeedback !== undefined) {
        if (!Array.isArray(item.endGame.overallFeedback)) {
          return {
            valid: false,
            error: "endGame.overallFeedback must be an array"
          };
        }

        for (let i = 0; i < item.endGame.overallFeedback.length; i++) {
          const feedback = item.endGame.overallFeedback[i];

          if (typeof feedback.from !== "number" || typeof feedback.to !== "number") {
            return {
              valid: false,
              error: `endGame.overallFeedback[${i}]: 'from' and 'to' must be numbers`
            };
          }

          if (feedback.from < 0 || feedback.from > 100 || feedback.to < 0 || feedback.to > 100) {
            return {
              valid: false,
              error: `endGame.overallFeedback[${i}]: 'from' and 'to' must be between 0 and 100`
            };
          }

          if (typeof feedback.feedback !== "string") {
            return {
              valid: false,
              error: `endGame.overallFeedback[${i}]: 'feedback' must be a string`
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Processes AI QuestionSet content and adds it to the chapter
   *
   * Uses handler delegation pattern:
   * 1. Iterate through questions array
   * 2. For each question, resolve appropriate handler
   * 3. Call handler.process() with capture builder to generate H5P content
   * 4. Extract generated content and wrap in QuestionSet question structure
   * 5. Build complete QuestionSet with intro/end screens
   */
  public async process(context: HandlerContext, item: AIQuestionSetContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI QuestionSet: "${item.title || 'Untitled Quiz'}"`);
      logger.log(`      Questions: ${item.questions.length} mixed types`);
    }

    try {
      // Resolve AI configuration (item > chapter > book)
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        item.aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );

      // Generate questions via handler delegation
      const questions: any[] = [];
      const handlerRegistry = HandlerRegistry.getInstance();

      for (let i = 0; i < item.questions.length; i++) {
        const questionDef = item.questions[i];

        if (options.verbose) {
          logger.log(`      [${i + 1}/${item.questions.length}] Generating ${questionDef.type}...`);
        }

        try {
          // Normalize question type (ai-multichoice → ai-quiz for registry lookup)
          const normalizedType = questionDef.type === "ai-multichoice" ? "ai-quiz" : questionDef.type;

          // Get handler for question type
          const handler = handlerRegistry.getHandler(normalizedType);

          if (!handler) {
            throw new Error(`No handler registered for question type: ${normalizedType}`);
          }

          // Merge question-level aiConfig with item-level and resolved config
          const questionConfig = AIPromptBuilder.resolveConfig(
            questionDef.aiConfig as any,
            item.aiConfig as any,
            resolvedConfig
          );

          // Create capture builder to intercept handler output
          const captureBuilder = new CaptureChapterBuilder(
            context.basePath,
            context.mediaFiles,
            false
          );

          // Prepare question definition for handler
          // For ai-quiz (MultiChoice), it expects sourceText not prompt
          const handlerQuestionDef = { ...questionDef };
          if (normalizedType === "ai-quiz" && questionDef.prompt && !questionDef.sourceText) {
            handlerQuestionDef.sourceText = questionDef.prompt;
          }

          // Create handler context with capture builder
          const questionContext: HandlerContext = {
            ...context,
            chapterBuilder: captureBuilder as any,  // Type cast to ChapterBuilder
            bookConfig: resolvedConfig,
            chapterConfig: questionConfig
          };

          // Process question with handler
          await handler.process(questionContext, handlerQuestionDef);

          // Extract the generated content from capture builder
          const generatedContent = captureBuilder.getLastContent();

          if (!generatedContent) {
            throw new Error(`Handler ${normalizedType} did not generate content`);
          }

          // Get library name from handler
          const libraries = handler.getRequiredLibraries();
          const libraryName = libraries && libraries.length > 0 ? libraries[0] : "Unknown";

          // Wrap in QuestionSet question structure
          const questionSetQuestion = {
            library: this.resolveLibraryVersion(libraryName, context),
            params: generatedContent.params || generatedContent,
            metadata: generatedContent.metadata || {
              contentType: this.getContentTypeDisplayName(questionDef.type),
              license: "U",
              title: questionDef.title || `Question ${i + 1}`
            },
            subContentId: generatedContent.subContentId || randomUUID()
          };

          questions.push(questionSetQuestion);

          if (options.verbose) {
            logger.log(`      [${i + 1}/${item.questions.length}] ✓ Generated ${questionDef.type}`);
          }
        } catch (error) {
          logger.warn(`      [${i + 1}/${item.questions.length}] ✗ Failed to generate ${questionDef.type}: ${error.message}`);

          // Add fallback question
          questions.push(this.createFallbackQuestion(questionDef, i, error.message));
        }
      }

      // Build intro page
      const introPage = this.buildIntroPage(item, resolvedConfig);

      // Build end game screen
      const endGame = this.buildEndGame(item, resolvedConfig);

      // Build complete QuestionSet structure
      const questionSetContent: any = {
        library: "H5P.QuestionSet 1.20",
        params: {
          introPage,
          progressType: item.progressType || "dots",
          passPercentage: item.passPercentage || 50,
          disableBackwardsNavigation: false,
          randomQuestions: item.randomQuestions || false,
          poolSize: item.poolSize || 0,
          questions,
          endGame,
          texts: this.buildUITexts(resolvedConfig)
        },
        metadata: {
          title: item.title || "Question Set",
          license: "U",
          contentType: "Question Set"
        },
        subContentId: randomUUID()
      };

      chapterBuilder.addCustomContent(questionSetContent);

      if (options.verbose) {
        logger.log(`      ✓ QuestionSet complete with ${questions.length} questions`);
      }
    } catch (error) {
      logger.error(`      ✗ QuestionSet generation failed: ${error.message}`);

      // Add fallback content
      chapterBuilder.addTextPage(
        item.title || "Quiz",
        `<p>Quiz generation failed. Please check your configuration and try again.</p><p>Error: ${error.message}</p>`
      );
    }
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.QuestionSet"];
  }

  /**
   * Resolves library name to full version string
   * E.g., "H5P.Blanks" → "H5P.Blanks 1.14"
   */
  private resolveLibraryVersion(libraryName: string, context: HandlerContext): string {
    // If already has version, return as-is
    if (/\s+\d+\.\d+/.test(libraryName)) {
      return libraryName;
    }

    // Known library versions (from QuestionSet-1.20 package)
    const libraryVersions: Record<string, string> = {
      "H5P.MultiChoice": "H5P.MultiChoice 1.16",
      "H5P.Blanks": "H5P.Blanks 1.14",
      "H5P.DragText": "H5P.DragText 1.10",
      "H5P.TrueFalse": "H5P.TrueFalse 1.8",
      "H5P.Essay": "H5P.Essay 1.5",
      "H5P.SingleChoiceSet": "H5P.SingleChoiceSet 1.11"
    };

    return libraryVersions[libraryName] || libraryName;
  }

  /**
   * Gets display name for content type
   */
  private getContentTypeDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      "ai-quiz": "Multiple Choice",
      "ai-multichoice": "Multiple Choice",
      "ai-blanks": "Fill in the Blanks",
      "ai-dragtext": "Drag the Words",
      "ai-truefalse": "True/False",
      "ai-essay": "Essay",
      "ai-singlechoiceset": "Single Choice Set"
    };

    return displayNames[type] || "Question";
  }

  /**
   * Builds intro page structure
   */
  private buildIntroPage(item: AIQuestionSetContent, config: any): any {
    const showIntro = item.introPage?.showIntro ?? true;
    const title = item.introPage?.title || item.title || "Quiz";
    const introduction = item.introPage?.introduction || "<p>Answer the following questions.</p>";
    const startButtonText = item.introPage?.startButtonText || "Start Quiz";

    return {
      showIntroPage: showIntro,
      title,
      introduction,
      startButtonText
    };
  }

  /**
   * Builds end game screen structure
   */
  private buildEndGame(item: AIQuestionSetContent, config: any): any {
    const showResults = item.endGame?.showResults ?? true;
    const message = item.endGame?.message || "You got @score of @total points";

    // Default feedback ranges if not provided
    const overallFeedback = item.endGame?.overallFeedback || [
      { from: 0, to: 49, feedback: "Try again! Review the material and take the quiz again." },
      { from: 50, to: 79, feedback: "Good job! You're making progress." },
      { from: 80, to: 100, feedback: "Excellent! You've mastered the material." }
    ];

    return {
      showResultPage: showResults,
      message,
      overallFeedback,
      solutionButtonText: "Show solution",
      retryButtonText: "Retry",
      finishButtonText: "Finish",
      submitButtonText: "Submit",
      showAnimations: false,
      skippable: false,
      skipButtonText: "Skip video"
    };
  }

  /**
   * Builds UI text strings for QuestionSet buttons
   */
  private buildUITexts(config: any): any {
    return {
      prevButton: "Previous question",
      nextButton: "Next question",
      finishButton: "Finish",
      submitButton: "Submit",
      textualProgress: "Question: @current of @total questions",
      jumpToQuestion: "Question %d of %total",
      questionLabel: "Question",
      readSpeakerProgress: "Question @current of @total",
      unansweredText: "Unanswered",
      answeredText: "Answered",
      currentQuestionText: "Current question"
    };
  }

  /**
   * Creates a fallback question when generation fails
   */
  private createFallbackQuestion(questionDef: any, index: number, errorMessage: string): any {
    return {
      library: "H5P.MultiChoice 1.16",
      params: {
        question: `<p>Question ${index + 1} generation failed.</p><p>Error: ${errorMessage}</p>`,
        answers: [
          { correct: true, text: "This is a placeholder question", tipsAndFeedback: { tip: "", chosenFeedback: "", notChosenFeedback: "" } }
        ],
        behaviour: {
          enableRetry: true,
          enableSolutionsButton: true,
          enableCheckButton: true,
          type: "auto",
          singlePoint: false,
          randomAnswers: true,
          showSolutionsRequiresInput: true,
          confirmCheckDialog: false,
          confirmRetryDialog: false,
          autoCheck: false,
          passPercentage: 100,
          showScorePoints: true
        },
        UI: {
          checkAnswerButton: "Check",
          submitAnswerButton: "Submit",
          showSolutionButton: "Show solution",
          tryAgainButton: "Retry",
          tipsLabel: "Show tip",
          scoreBarLabel: "You got :num out of :total points",
          tipAvailable: "Tip available",
          feedbackAvailable: "Feedback available",
          readFeedback: "Read feedback",
          wrongAnswer: "Wrong answer",
          correctAnswer: "Correct answer",
          shouldCheck: "Should have been checked",
          shouldNotCheck: "Should not have been checked",
          noInput: "Please answer before viewing the solution",
          a11yCheck: "Check the answers",
          a11yShowSolution: "Show the solution",
          a11yRetry: "Retry the task"
        },
        confirmCheck: {
          header: "Finish?",
          body: "Are you sure you wish to finish?",
          cancelLabel: "Cancel",
          confirmLabel: "Finish"
        },
        confirmRetry: {
          header: "Retry?",
          body: "Are you sure you wish to retry?",
          cancelLabel: "Cancel",
          confirmLabel: "Confirm"
        }
      },
      metadata: {
        contentType: "Multiple Choice",
        license: "U",
        title: `Question ${index + 1} (Failed)`
      },
      subContentId: randomUUID()
    };
  }
}
