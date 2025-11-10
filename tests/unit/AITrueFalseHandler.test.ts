import { AITrueFalseHandler, AITrueFalseContent } from "../../src/handlers/ai/AITrueFalseHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { QuizGenerator } from "../../src/ai/QuizGenerator";

describe("AITrueFalseHandler", () => {
  let handler: AITrueFalseHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<Partial<ChapterBuilder>>;
  let mockQuizGenerator: jest.Mocked<Partial<QuizGenerator>>;

  beforeEach(() => {
    handler = new AITrueFalseHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn(),
      addTextPage: jest.fn()
    };

    mockQuizGenerator = {
      generateRawContent: jest.fn()
    } as any;

    mockContext = {
      chapterBuilder: mockChapterBuilder as any,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      options: { verbose: false },
      quizGenerator: mockQuizGenerator as any,
      bookConfig: undefined,
      chapterConfig: undefined
    } as any;
  });

  describe("getContentType", () => {
    it("should return 'ai-truefalse'", () => {
      expect(handler.getContentType()).toBe("ai-truefalse");
    });
  });

  describe("validate", () => {
    it("should accept valid AI content with prompt", () => {
      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Create true/false questions about planets"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should reject missing prompt field", () => {
      const item = {
        type: "ai-truefalse"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires 'prompt' field");
    });

    it("should reject invalid difficulty enum", () => {
      const item = {
        type: "ai-truefalse",
        prompt: "Test",
        difficulty: "super-hard"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("difficulty must be one of");
    });

    it("should reject invalid questionCount (non-positive)", () => {
      const item = {
        type: "ai-truefalse",
        prompt: "Test",
        questionCount: -1
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("questionCount must be a positive integer");
    });
  });

  describe("process", () => {
    it("should generate true/false questions with AI", async () => {
      const mockAIResponse = JSON.stringify([
        {
          question: "The Sun is a star",
          correct: true
        },
        {
          question: "Earth is the largest planet",
          correct: false
        }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Create true/false questions about the solar system",
        questionCount: 2
      };

      await handler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalledTimes(1);
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(2);

      const firstCall = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(firstCall.library).toBe("H5P.TrueFalse 1.8");
      expect(firstCall.params.question).toContain("The Sun is a star");
    });

    it("should convert AI boolean to string for H5P (CRITICAL)", async () => {
      const mockAIResponse = JSON.stringify([
        {
          question: "Test question true",
          correct: true
        },
        {
          question: "Test question false",
          correct: false
        }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Test"
      };

      await handler.process(mockContext, item);

      const calls = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls;

      // First question should have correct = "true" (string)
      expect(calls[0][0].params.correct).toBe("true");
      expect(typeof calls[0][0].params.correct).toBe("string");

      // Second question should have correct = "false" (string)
      expect(calls[1][0].params.correct).toBe("false");
      expect(typeof calls[1][0].params.correct).toBe("string");
    });

    it("should strip HTML from AI-generated question text", async () => {
      const mockAIResponse = JSON.stringify([
        {
          question: "<p>What is <strong>2+2</strong>?</p>",
          correct: true
        }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Math questions"
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      // Should wrap in <p> tags after stripping HTML from AI response
      expect(addedContent.params.question).toMatch(/^<p>.*<\/p>$/);
      expect(addedContent.params.question).toContain("What is 2+2?");
      // Should not contain the nested <strong> tags from AI
      expect(addedContent.params.question).not.toContain("<strong>");
      // Final result should be clean text wrapped in <p> tags
      expect(addedContent.params.question).toBe("<p>What is 2+2?</p>");
    });

    it("should provide fallback on AI failure", async () => {
      (mockQuizGenerator.generateRawContent as jest.Mock).mockRejectedValue(new Error("API error"));

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Test prompt"
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.library).toBe("H5P.TrueFalse 1.8");
      expect(addedContent.params.question).toContain("AI generation failed");
      expect(addedContent.params.correct).toBe("true");
    });

    it("should use default questionCount of 5 if not specified", async () => {
      const mockAIResponse = JSON.stringify(
        Array.from({ length: 5 }, (_, i) => ({
          question: `Question ${i + 1}`,
          correct: i % 2 === 0
        }))
      );

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Create questions"
      };

      await handler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Generate exactly 5 true/false questions")
      );
    });

    it("should respect difficulty parameter", async () => {
      const mockAIResponse = JSON.stringify([
        { question: "Test", correct: true }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        prompt: "Test",
        questionCount: 1,
        difficulty: "hard"
      };

      await handler.process(mockContext, item);

      const userPrompt = (mockQuizGenerator.generateRawContent as jest.Mock).mock.calls[0][1];
      expect(userPrompt).toContain("Difficulty: hard");
    });

    it("should log AI generation details when verbose", async () => {
      mockContext.options.verbose = true;

      const mockAIResponse = JSON.stringify([
        { question: "Test", correct: true }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AITrueFalseContent = {
        type: "ai-truefalse",
        title: "Test Quiz",
        prompt: "Test prompt",
        questionCount: 1
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating AI true/false questions: "Test Quiz"')
      );
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Question count: 1')
      );
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.TrueFalse']", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toEqual(["H5P.TrueFalse"]);
    });
  });
});
