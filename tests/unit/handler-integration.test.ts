import { AITextHandler } from "../../src/handlers/core/AITextHandler";
import { QuizHandler } from "../../src/handlers/ai/QuizHandler";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { AITextContent, AIQuizContent } from "../../src/compiler/YamlInputParser";

/**
 * Task Group 5.4.1: Handler Integration Tests
 *
 * These tests verify that AITextHandler and QuizHandler:
 * - Use book-level config when no item config provided
 * - Override with item-level config when provided
 * - Validate aiConfig fields correctly
 * - Apply reading level to generated content
 * - Resolve configuration hierarchy properly
 */

describe("AITextHandler Integration with AIConfiguration", () => {
  let handler: AITextHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: any;

  beforeEach(() => {
    handler = new AITextHandler();
    mockChapterBuilder = {
      addTextPage: jest.fn()
    };
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      options: {
        verbose: true
      },
      bookConfig: {
        targetAudience: "grade-6",
        tone: "educational"
      },
      chapterConfig: undefined,
      libraryRegistry: {} as any,
      quizGenerator: {} as any,
      aiPromptBuilder: {} as any,
      mediaFiles: [],
      basePath: "/test"
    };
  });

  describe("Configuration Resolution", () => {
    it("should use book-level config when no item config", async () => {
      const item: AITextContent = {
        type: "ai-text",
        prompt: "Explain gravity"
      };

      // Mock AIPromptBuilder to spy on calls
      const buildCompletePromptSpy = jest.spyOn(AIPromptBuilder, "buildCompletePrompt");
      const resolveConfigSpy = jest.spyOn(AIPromptBuilder, "resolveConfig");

      // Mock AI response
      process.env.GOOGLE_API_KEY = "test-key";
      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => "<p>Gravity is a force.</p>"
        }
      });
      jest.mock("@google/generative-ai", () => ({
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
          getGenerativeModel: () => ({
            generateContent: mockGenerateContent
          })
        }))
      }));

      await handler.process(mockContext, item);

      // Verify resolveConfig was called with book config
      expect(resolveConfigSpy).toHaveBeenCalledWith(
        undefined, // no item config
        undefined, // no chapter config
        mockContext.bookConfig
      );

      // Verify buildCompletePrompt was called with resolved config
      expect(buildCompletePromptSpy).toHaveBeenCalledWith(
        "Explain gravity",
        expect.objectContaining({
          targetAudience: "grade-6",
          tone: "educational"
        })
      );

      buildCompletePromptSpy.mockRestore();
      resolveConfigSpy.mockRestore();
      delete process.env.GOOGLE_API_KEY;
    });

    it("should override with item-level config", async () => {
      const item: AITextContent = {
        type: "ai-text",
        prompt: "Explain quantum physics",
        aiConfig: {
          targetAudience: "college",
          tone: "academic"
        }
      };

      const resolveConfigSpy = jest.spyOn(AIPromptBuilder, "resolveConfig");
      const buildCompletePromptSpy = jest.spyOn(AIPromptBuilder, "buildCompletePrompt");

      process.env.GOOGLE_API_KEY = "test-key";
      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => "<p>Quantum physics content.</p>"
        }
      });
      jest.mock("@google/generative-ai");

      await handler.process(mockContext, item);

      // Verify item config takes precedence
      expect(resolveConfigSpy).toHaveBeenCalledWith(
        item.aiConfig,
        undefined,
        mockContext.bookConfig
      );

      // Verify college-level academic tone applied
      expect(buildCompletePromptSpy).toHaveBeenCalledWith(
        "Explain quantum physics",
        expect.objectContaining({
          targetAudience: "college",
          tone: "academic"
        })
      );

      resolveConfigSpy.mockRestore();
      buildCompletePromptSpy.mockRestore();
      delete process.env.GOOGLE_API_KEY;
    });

    it("should use chapter-level config when item has no config", async () => {
      mockContext.chapterConfig = {
        targetAudience: "high-school",
        tone: "professional"
      };

      const item: AITextContent = {
        type: "ai-text",
        prompt: "Explain photosynthesis"
      };

      const resolveConfigSpy = jest.spyOn(AIPromptBuilder, "resolveConfig");

      process.env.GOOGLE_API_KEY = "test-key";
      jest.mock("@google/generative-ai");

      await handler.process(mockContext, item);

      // Verify chapter config overrides book config
      expect(resolveConfigSpy).toHaveBeenCalledWith(
        undefined,
        mockContext.chapterConfig,
        mockContext.bookConfig
      );

      resolveConfigSpy.mockRestore();
      delete process.env.GOOGLE_API_KEY;
    });
  });

  describe("Validation", () => {
    it("should reject invalid targetAudience", () => {
      const invalid = handler.validate({
        type: "ai-text",
        prompt: "Test",
        aiConfig: { targetAudience: "invalid-level" as any }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("Invalid targetAudience");
      expect(invalid.error).toContain("elementary");
      expect(invalid.error).toContain("grade-6");
    });

    it("should reject invalid tone", () => {
      const invalid = handler.validate({
        type: "ai-text",
        prompt: "Test",
        aiConfig: { tone: "invalid-tone" as any }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("Invalid tone");
      expect(invalid.error).toContain("educational");
      expect(invalid.error).toContain("professional");
    });

    it("should accept valid aiConfig", () => {
      const valid = handler.validate({
        type: "ai-text",
        prompt: "Test",
        aiConfig: {
          targetAudience: "college",
          tone: "academic",
          customization: "Include research examples"
        }
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });

    it("should accept missing aiConfig", () => {
      const valid = handler.validate({
        type: "ai-text",
        prompt: "Test"
      });

      expect(valid.valid).toBe(true);
    });
  });
});

describe("QuizHandler Integration with AIConfiguration", () => {
  let handler: QuizHandler;
  let mockContext: HandlerContext;
  let mockQuizGenerator: any;

  beforeEach(() => {
    handler = new QuizHandler();
    mockQuizGenerator = {
      generateH5pQuiz: jest.fn().mockResolvedValue([
        {
          library: "H5P.MultiChoice 1.16",
          params: { question: "Test question" },
          metadata: { contentType: "Multiple Choice" }
        }
      ])
    };
    mockContext = {
      chapterBuilder: {
        addQuizPage: jest.fn(),
        addTextPage: jest.fn(),
        addImagePage: jest.fn(),
        addAudioPage: jest.fn(),
        addCustomContent: jest.fn()
      } as any,  // Use 'as any' to satisfy TypeScript without implementing all ChapterBuilder methods
      quizGenerator: mockQuizGenerator,
      aiPromptBuilder: {} as any,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      options: {
        verbose: true
      },
      bookConfig: {
        targetAudience: "grade-9",
        tone: "educational"
      },
      chapterConfig: undefined,
      libraryRegistry: {} as any,
      mediaFiles: [],
      basePath: "/test"
    };
  });

  describe("Configuration Resolution", () => {
    it("should use resolved config for quiz generation", async () => {
      const item: AIQuizContent = {
        type: "ai-quiz",
        sourceText: "Photosynthesis is the process...",
        questionCount: 5
      };

      const resolveConfigSpy = jest.spyOn(AIPromptBuilder, "resolveConfig");

      await handler.process(mockContext, item);

      // Verify config was resolved
      expect(resolveConfigSpy).toHaveBeenCalledWith(
        undefined,
        undefined,
        mockContext.bookConfig
      );

      // Verify generateH5pQuiz called with resolved config
      expect(mockQuizGenerator.generateH5pQuiz).toHaveBeenCalledWith(
        "Photosynthesis is the process...",
        5,
        expect.objectContaining({
          targetAudience: "grade-9",
          tone: "educational"
        })
      );

      resolveConfigSpy.mockRestore();
    });

    it("should apply item-level reading level to quiz", async () => {
      const item: AIQuizContent = {
        type: "ai-quiz",
        sourceText: "Complex scientific text...",
        questionCount: 10,
        aiConfig: {
          targetAudience: "esl-beginner",
          customization: "Use only present tense"
        }
      };

      await handler.process(mockContext, item);

      // Verify ESL-beginner config passed to generator
      expect(mockQuizGenerator.generateH5pQuiz).toHaveBeenCalledWith(
        "Complex scientific text...",
        10,
        expect.objectContaining({
          targetAudience: "esl-beginner",
          customization: "Use only present tense"
        })
      );
    });
  });

  describe("Validation", () => {
    it("should reject invalid targetAudience", () => {
      const invalid = handler.validate({
        type: "ai-quiz",
        sourceText: "Test",
        aiConfig: { targetAudience: "super-advanced" as any }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("Invalid targetAudience");
    });

    it("should reject invalid tone", () => {
      const invalid = handler.validate({
        type: "ai-quiz",
        sourceText: "Test",
        aiConfig: { tone: "silly" as any }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("Invalid tone");
    });

    it("should accept valid aiConfig", () => {
      const valid = handler.validate({
        type: "ai-quiz",
        sourceText: "Test",
        aiConfig: {
          targetAudience: "high-school",
          tone: "professional"
        }
      });

      expect(valid.valid).toBe(true);
    });
  });
});
