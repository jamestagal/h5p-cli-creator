import { QuizHandler } from "../../src/handlers/ai/QuizHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";

/**
 * Unit tests for QuizHandler
 * Tests Task Group 2.3: AI-Powered Handlers
 */
describe("QuizHandler", () => {
  let handler: QuizHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: any;
  let mockQuizGenerator: any;
  let mockLogger: any;

  beforeEach(() => {
    handler = new QuizHandler();

    mockChapterBuilder = {
      addTextPage: jest.fn(),
      addQuizPage: jest.fn()
    };

    mockQuizGenerator = {
      generateH5pQuiz: jest.fn().mockResolvedValue([
        { question: "Q1", answers: [] },
        { question: "Q2", answers: [] }
      ])
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockContext = {
      chapterBuilder: mockChapterBuilder,
      libraryRegistry: {} as any,
      quizGenerator: mockQuizGenerator,
      logger: mockLogger,
      mediaFiles: [],
      basePath: "/test",
      options: { verbose: false }
    };
  });

  test("should return correct content type", () => {
    expect(handler.getContentType()).toBe("ai-quiz");
  });

  test("should validate content with sourceText field", () => {
    const validItem = {
      type: "ai-quiz",
      sourceText: "This is the source text for generating quiz questions",
      questionCount: 5
    };

    const result = handler.validate(validItem);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("should fail validation with missing sourceText field", () => {
    const invalidItem = {
      type: "ai-quiz",
      questionCount: 5
    };

    const result = handler.validate(invalidItem);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("sourceText");
  });

  test("should return correct required libraries", () => {
    const libraries = handler.getRequiredLibraries();

    expect(libraries).toEqual(["H5P.MultiChoice"]);
  });

  test("should generate quiz with QuizGenerator", async () => {
    const item = {
      type: "ai-quiz" as const,
      sourceText: "Biology is the study of life",
      questionCount: 3,
      title: "Biology Quiz"
    };

    await handler.process(mockContext, item);

    expect(mockQuizGenerator.generateH5pQuiz).toHaveBeenCalledWith(
      "Biology is the study of life",
      3,
      expect.objectContaining({
        targetAudience: "grade-6",
        tone: "educational",
        outputStyle: "plain-html"
      })
    );
    expect(mockChapterBuilder.addQuizPage).toHaveBeenCalledWith([
      { question: "Q1", answers: [] },
      { question: "Q2", answers: [] }
    ]);
  });

  test("should use default question count if not specified", async () => {
    const item = {
      type: "ai-quiz" as const,
      sourceText: "Source text without question count"
    };

    await handler.process(mockContext, item);

    expect(mockQuizGenerator.generateH5pQuiz).toHaveBeenCalledWith(
      "Source text without question count",
      5,
      expect.objectContaining({
        targetAudience: "grade-6",
        tone: "educational",
        outputStyle: "plain-html"
      })
    );
  });

  test("should add fallback text page when quiz generation fails", async () => {
    mockQuizGenerator.generateH5pQuiz.mockRejectedValue(new Error("API error"));

    const item = {
      type: "ai-quiz" as const,
      sourceText: "Test source",
      title: "Failed Quiz"
    };

    await handler.process(mockContext, item);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("AI quiz generation failed")
    );
    expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
      "Failed Quiz",
      expect.stringContaining("Quiz generation failed")
    );
  });

  test("should log verbose output when verbose mode enabled", async () => {
    mockContext.options.verbose = true;

    const item = {
      type: "ai-quiz" as const,
      sourceText: "Source text for verbose test",
      questionCount: 4,
      title: "Verbose Quiz"
    };

    await handler.process(mockContext, item);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Generating AI quiz")
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Source text length")
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Questions: 4")
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Generated 2 questions")
    );
  });
});
