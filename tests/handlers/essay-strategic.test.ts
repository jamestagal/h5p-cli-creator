/**
 * Strategic test coverage for Essay handlers
 * Fills critical gaps identified in Task Group 6.2
 */

import { EssayHandler } from "../../src/handlers/embedded/EssayHandler";
import { AIEssayHandler } from "../../src/handlers/ai/AIEssayHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("Essay Handlers - Strategic Test Coverage", () => {
  let essayHandler: EssayHandler;
  let aiEssayHandler: AIEssayHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;
  let mockQuizGenerator: any;

  beforeEach(() => {
    essayHandler = new EssayHandler();
    aiEssayHandler = new AIEssayHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn().mockReturnThis(),
    } as any;

    mockQuizGenerator = {
      generateRawContent: jest.fn().mockResolvedValue(JSON.stringify({
        taskDescription: "Test task description",
        keywords: [{ keyword: "test" }]
      })),
    };

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

  describe("Feedback String Length Validation", () => {
    it("should validate feedbackIncluded max length (1000 chars)", () => {
      const longFeedback = "a".repeat(1001);

      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            feedbackIncluded: longFeedback,
          },
        ],
      };

      const result = essayHandler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("feedbackIncluded");
      expect(result.error).toContain("1000");
    });

    it("should validate feedbackMissed max length (1000 chars)", () => {
      const longFeedback = "a".repeat(1001);

      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            feedbackMissed: longFeedback,
          },
        ],
      };

      const result = essayHandler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("feedbackMissed");
      expect(result.error).toContain("1000");
    });

    it("should accept feedback strings within limit (1000 chars)", () => {
      const validFeedback = "a".repeat(1000);

      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            feedbackIncluded: validFeedback,
            feedbackMissed: validFeedback,
          },
        ],
      };

      const result = essayHandler.validate(item);

      expect(result.valid).toBe(true);
    });
  });

  describe("Task Description Length Validation", () => {
    it("should validate taskDescription max length (10000 chars)", () => {
      const longDescription = "a".repeat(10001);

      const item = {
        type: "essay" as const,
        taskDescription: longDescription,
        keywords: [{ keyword: "test" }],
      };

      const result = essayHandler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("taskDescription");
      expect(result.error).toContain("10000");
    });

    it("should accept taskDescription within limit (10000 chars)", () => {
      const validDescription = "a".repeat(10000);

      const item = {
        type: "essay" as const,
        taskDescription: validDescription,
        keywords: [{ keyword: "test" }],
      };

      const result = essayHandler.validate(item);

      expect(result.valid).toBe(true);
    });
  });

  describe("SubContentId Generation", () => {
    it("should generate unique subContentId for Essay content", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      expect(callArg.subContentId).toBeDefined();
      expect(typeof callArg.subContentId).toBe("string");
      expect(callArg.subContentId.length).toBeGreaterThan(0);
    });

    it("should generate unique subContentIds for multiple Essay items", async () => {
      const item1 = {
        type: "essay" as const,
        taskDescription: "Write first essay",
        keywords: [{ keyword: "test1" }],
      };

      const item2 = {
        type: "essay" as const,
        taskDescription: "Write second essay",
        keywords: [{ keyword: "test2" }],
      };

      await essayHandler.process(mockContext, item1);
      await essayHandler.process(mockContext, item2);

      const call1 = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const call2 = mockChapterBuilder.addCustomContent.mock.calls[1][0];

      expect(call1.subContentId).not.toBe(call2.subContentId);
    });
  });

  describe("Sample Solution Support", () => {
    it("should include sample solution with introduction and sample", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
        solution: {
          introduction: "Here is how to approach this essay:",
          sample: "This is an example answer that demonstrates...",
        },
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const callArgStr = JSON.stringify(callArg);

      expect(callArgStr).toContain("Here is how to approach this essay:");
      expect(callArgStr).toContain("This is an example answer that demonstrates");
    });
  });

  describe("AI Markdown Fence Stripping", () => {
    it("should strip markdown code fences from AI response", async () => {
      // Mock AI response with markdown code fences
      mockQuizGenerator.generateRawContent.mockResolvedValue(`\`\`\`json
{
  "taskDescription": "Describe photosynthesis",
  "keywords": [{ "keyword": "chlorophyll" }]
}
\`\`\``);

      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
      };

      await aiEssayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Should process successfully despite markdown fences
      expect(callArg).toBeDefined();
      expect(callArg.library).toBe("H5P.Essay 1.5");
    });

    it("should handle AI response without markdown fences", async () => {
      // Mock AI response without markdown fences
      mockQuizGenerator.generateRawContent.mockResolvedValue(JSON.stringify({
        taskDescription: "Describe photosynthesis",
        keywords: [{ keyword: "chlorophyll" }]
      }));

      const item = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
      };

      await aiEssayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      expect(callArg).toBeDefined();
      expect(callArg.library).toBe("H5P.Essay 1.5");
    });
  });

  describe("Default Labels and Behaviour", () => {
    it("should apply default behaviour values", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
        // No behaviour specified - should use defaults
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const behaviour = callArg.params.behaviour;

      expect(behaviour.enableRetry).toBe(true);
      expect(behaviour.inputFieldSize).toBe("10");
      expect(behaviour.ignoreScoring).toBe(false);
      expect(behaviour.percentagePassing).toBe(50);
    });

    it("should apply default labels", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
        // No labels specified - should use defaults
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const callArgStr = JSON.stringify(callArg);

      expect(callArgStr).toContain("Check");
      expect(callArgStr).toContain("Submit");
      expect(callArgStr).toContain("Retry");
      expect(callArgStr).toContain("Show solution");
    });
  });

  describe("Multiple Keyword Alternatives", () => {
    it("should handle keywords with multiple alternatives", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write about exploration",
        keywords: [
          {
            keyword: "adventure",
            alternatives: ["quest", "journey", "expedition", "voyage"],
            points: 5,
          },
        ],
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const callArgStr = JSON.stringify(callArg);

      // Verify all alternatives are present
      expect(callArgStr).toContain("quest");
      expect(callArgStr).toContain("journey");
      expect(callArgStr).toContain("expedition");
      expect(callArgStr).toContain("voyage");
    });
  });

  describe("AI Difficulty Levels", () => {
    it("should generate different content for different difficulty levels", async () => {
      const easyItem = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
        difficulty: "easy" as const,
      };

      const hardItem = {
        type: "ai-essay" as const,
        prompt: "Create an essay question about photosynthesis",
        difficulty: "hard" as const,
      };

      // Test that both difficulty levels are processed without errors
      await aiEssayHandler.process(mockContext, easyItem);
      await aiEssayHandler.process(mockContext, hardItem);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(2);

      // Verify both calls to AI include difficulty-related instructions
      const aiCalls = mockQuizGenerator.generateRawContent.mock.calls;
      expect(aiCalls.length).toBe(2);

      // Easy difficulty should mention "50-200 characters"
      expect(aiCalls[0][1]).toContain("50-200");

      // Hard difficulty should mention "200-1000 characters"
      expect(aiCalls[1][1]).toContain("200-1000");
    });
  });

  describe("Overall Feedback Ranges", () => {
    it("should include custom overall feedback ranges", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
        overallFeedback: [
          { from: 0, to: 49, feedback: "Needs improvement" },
          { from: 50, to: 79, feedback: "Good work" },
          { from: 80, to: 100, feedback: "Excellent!" },
        ],
      };

      await essayHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const callArgStr = JSON.stringify(callArg);

      expect(callArgStr).toContain("Needs improvement");
      expect(callArgStr).toContain("Good work");
      expect(callArgStr).toContain("Excellent!");
    });
  });
});
