import { AISingleChoiceSetHandler, AISingleChoiceSetContent } from "../../src/handlers/ai/AISingleChoiceSetHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";

describe("AISingleChoiceSetHandler", () => {
  let handler: AISingleChoiceSetHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<Partial<ChapterBuilder>>;
  let mockQuizGenerator: jest.Mocked<Partial<QuizGenerator>>;

  beforeEach(() => {
    handler = new AISingleChoiceSetHandler();

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
    it("should return 'ai-singlechoiceset'", () => {
      expect(handler.getContentType()).toBe("ai-singlechoiceset");
    });
  });

  describe("validate", () => {
    it("should accept valid AI content with prompt", () => {
      const item: AISingleChoiceSetContent = {
        type: "ai-singlechoiceset",
        prompt: "Create questions about planets"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should reject missing prompt field", () => {
      const item = {
        type: "ai-singlechoiceset"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires 'prompt' field");
    });

    it("should reject invalid difficulty enum", () => {
      const item = {
        type: "ai-singlechoiceset",
        prompt: "Test",
        difficulty: "super-hard"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("difficulty must be one of");
    });

    it("should reject invalid questionCount", () => {
      const item = {
        type: "ai-singlechoiceset",
        prompt: "Test",
        questionCount: -1
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("questionCount must be a positive integer");
    });

    it("should reject invalid distractorsPerQuestion", () => {
      const item = {
        type: "ai-singlechoiceset",
        prompt: "Test",
        distractorsPerQuestion: 0
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("distractorsPerQuestion must be at least 1");
    });
  });

  describe("process", () => {
    it("should generate single choice set with AI", async () => {
      const mockAIResponse = JSON.stringify([
        {
          question: "What is the largest planet?",
          correctAnswer: "Jupiter",
          distractors: ["Earth", "Mars"]
        },
        {
          question: "What is the smallest planet?",
          correctAnswer: "Mercury",
          distractors: ["Venus", "Mars"]
        }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AISingleChoiceSetContent = {
        type: "ai-singlechoiceset",
        prompt: "Create questions about planets",
        questionCount: 2,
        distractorsPerQuestion: 2
      };

      await handler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalledTimes(1);
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.library).toBe("H5P.SingleChoiceSet 1.11");
      expect(addedContent.params.choices).toHaveLength(2);
      expect(addedContent.params.choices[0].answers[0]).toBe("Jupiter");
    });

    it("should strip HTML from AI responses", async () => {
      const mockAIResponse = JSON.stringify([
        {
          question: "<p>What is 2+2?</p>",
          correctAnswer: "<strong>4</strong>",
          distractors: ["<em>3</em>", "<b>5</b>"]
        }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: AISingleChoiceSetContent = {
        type: "ai-singlechoiceset",
        prompt: "Math questions"
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.choices[0].question).not.toContain("<p>");
      expect(addedContent.params.choices[0].answers[0]).not.toContain("<strong>");
    });

    it("should provide fallback on AI failure", async () => {
      (mockQuizGenerator.generateRawContent as jest.Mock).mockRejectedValue(new Error("API error"));

      const item: AISingleChoiceSetContent = {
        type: "ai-singlechoiceset",
        prompt: "Test prompt"
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addTextPage).toHaveBeenCalledTimes(1);
      const callArgs = (mockChapterBuilder.addTextPage as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe("AI Generation Failed");
      expect(callArgs[1]).toContain("Unable to generate single choice questions");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.SingleChoiceSet']", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toEqual(["H5P.SingleChoiceSet"]);
    });
  });
});
