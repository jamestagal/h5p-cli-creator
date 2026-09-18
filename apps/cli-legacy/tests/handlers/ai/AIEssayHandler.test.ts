import { AIEssayHandler } from "../../../src/handlers/ai/AIEssayHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../src/compiler/ChapterBuilder";

describe("AIEssayHandler", () => {
  let handler: AIEssayHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;
  let mockQuizGenerator: any;

  beforeEach(() => {
    handler = new AIEssayHandler();

    // Mock ChapterBuilder
    mockChapterBuilder = {
      addCustomContent: jest.fn().mockReturnThis(),
    } as any;

    // Mock QuizGenerator with AI response
    mockQuizGenerator = {
      generateRawContent: jest.fn().mockResolvedValue(JSON.stringify({
        taskDescription: "Describe the process of photosynthesis in plants.",
        placeholderText: "Begin by explaining...",
        keywords: [
          {
            keyword: "chlorophyll",
            alternatives: ["chloroplast pigment", "green pigment"],
            points: 2,
            feedbackIncluded: "Excellent! You mentioned chlorophyll.",
            feedbackMissed: "Remember to discuss the role of chlorophyll."
          },
          {
            keyword: "sunlight",
            alternatives: ["solar energy", "light energy"],
            points: 2
          }
        ],
        solution: {
          introduction: "A strong answer should include...",
          sample: "Photosynthesis is the process by which..."
        }
      })),
    };

    // Mock HandlerContext
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      quizGenerator: mockQuizGenerator,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      options: {
        verbose: true,
      },
      basePath: "/test/path",
      chapterConfig: {},
      bookConfig: {},
    } as any;
  });

  describe("getContentType", () => {
    it("should return 'ai-essay' as content type", () => {
      expect(handler.getContentType()).toBe("ai-essay");
    });
  });

  describe("validate", () => {
    it("should validate content with valid AI prompt", () => {
      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis for high school students",
        keywordCount: 5,
        difficulty: "medium" as const,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject content missing prompt field", () => {
      const item = {
        type: "ai-essay" as const,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("prompt");
    });

    it("should validate keywordCount range (1-20)", () => {
      // Valid: within range
      const validItem = {
        type: "ai-essay" as const,
        prompt: "Create an essay question",
        keywordCount: 10,
      };

      expect(handler.validate(validItem).valid).toBe(true);

      // Invalid: below range
      const tooLow = {
        type: "ai-essay" as const,
        prompt: "Create an essay question",
        keywordCount: 0,
      };

      const lowResult = handler.validate(tooLow);
      expect(lowResult.valid).toBe(false);
      expect(lowResult.error).toContain("keywordCount");

      // Invalid: above range
      const tooHigh = {
        type: "ai-essay" as const,
        prompt: "Create an essay question",
        keywordCount: 25,
      };

      const highResult = handler.validate(tooHigh);
      expect(highResult.valid).toBe(false);
      expect(highResult.error).toContain("keywordCount");
    });

    it("should validate maximumLength > minimumLength cross-field check", () => {
      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question",
        minimumLength: 200,
        maximumLength: 100, // Invalid: less than minimum
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximumLength");
      expect(result.error).toContain("minimumLength");
    });

    it("should validate difficulty enum", () => {
      // Valid difficulties
      const validDifficulties = ["easy", "medium", "hard"];

      for (const difficulty of validDifficulties) {
        const item = {
          type: "ai-essay" as const,
          prompt: "Create an essay question",
          difficulty: difficulty as "easy" | "medium" | "hard",
        };

        expect(handler.validate(item).valid).toBe(true);
      }

      // Invalid difficulty
      const invalidItem = {
        type: "ai-essay" as const,
        prompt: "Create an essay question",
        difficulty: "impossible" as any,
      };

      const result = handler.validate(invalidItem);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("difficulty");
    });
  });

  describe("process", () => {
    it("should strip HTML from AI-generated text", async () => {
      // Mock AI response with HTML tags
      mockQuizGenerator.generateRawContent.mockResolvedValue(JSON.stringify({
        taskDescription: "<p>Describe the <strong>process</strong> of photosynthesis.</p>",
        placeholderText: "<p>Begin by explaining...</p>",
        keywords: [
          {
            keyword: "chlorophyll",
            alternatives: ["<em>green pigment</em>"],
            feedbackIncluded: "<p>Great job!</p>"
          }
        ],
        solution: {
          introduction: "<p>A strong answer should include...</p>",
          sample: "<p>Photosynthesis is the process...</p>"
        }
      }));

      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify HTML tags are stripped from AI response
      // Note: The handler will re-add <p> tags, but AI's original HTML should be stripped first
      const callArgStr = JSON.stringify(callArg);

      // Should NOT contain AI's original nested HTML
      expect(callArgStr).not.toContain("<p><p>");
      expect(callArgStr).not.toContain("<strong>");
      expect(callArgStr).not.toContain("<em>");
    });

    it("should preserve wildcards in AI-generated keywords if applicable", async () => {
      // Mock AI response with wildcard keyword
      mockQuizGenerator.generateRawContent.mockResolvedValue(JSON.stringify({
        taskDescription: "Write about photography",
        keywords: [
          { keyword: "*photo*" } // Wildcard pattern
        ]
      }));

      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photography",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify wildcard is preserved
      expect(JSON.stringify(callArg)).toContain("*photo*");
      expect(JSON.stringify(callArg)).not.toContain("\\*photo\\*");
    });

    it("should handle AI generation failure with fallback content", async () => {
      // Mock AI failure
      mockQuizGenerator.generateRawContent.mockRejectedValue(new Error("API key invalid"));

      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify fallback content was generated
      const callArgStr = JSON.stringify(callArg);
      expect(callArgStr).toContain("AI generation failed");
      expect(callArgStr).toContain("error"); // Fallback keyword
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.Essay library", () => {
      const libraries = handler.getRequiredLibraries();

      expect(libraries).toEqual(["H5P.Essay"]);
    });
  });
});
