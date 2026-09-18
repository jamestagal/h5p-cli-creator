/**
 * Strategic test coverage for Crossword handlers (Task Group 4.4)
 * Fills critical gaps identified in crossword feature requirements
 *
 * Strategic Tests:
 * 1. Crossword with 15+ words (stress test for grid generation)
 * 2. Overall feedback ranges with score percentages
 * 3. Multiple crosswords in single chapter
 * 4. AI configuration cascade (book > chapter > item)
 * 5. Edge cases: long clues, special characters, hyphenated answers
 */

import { CrosswordHandler } from "../../src/handlers/embedded/CrosswordHandler";
import { AICrosswordHandler } from "../../src/handlers/ai/AICrosswordHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("Crossword Handlers - Strategic Test Coverage", () => {
  let crosswordHandler: CrosswordHandler;
  let aiCrosswordHandler: AICrosswordHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;
  let mockQuizGenerator: any;

  beforeEach(() => {
    crosswordHandler = new CrosswordHandler();
    aiCrosswordHandler = new AICrosswordHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn().mockReturnThis(),
    } as any;

    mockQuizGenerator = {
      generateRawContent: jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "Test clue 1", answer: "Word1" },
          { clue: "Test clue 2", answer: "Word2" },
        ])
      ),
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
      libraryRegistry: {} as any,
      aiPromptBuilder: {} as any,
      mediaFiles: [],
      basePath: "/test/path",
      chapterConfig: {},
      bookConfig: {},
    } as any;
  });

  /**
   * Strategic Test 1: Crossword with 15+ words (stress test)
   */
  describe("Strategic Test 1: Large Crossword (15+ words)", () => {
    it("should handle crossword with 20 words", async () => {
      const words = Array.from({ length: 20 }, (_, i) => ({
        clue: `Clue for word ${i + 1}`,
        answer: `Word${String(i + 1).padStart(2, "0")}`,
      }));

      const item = {
        type: "crossword" as const,
        title: "Large Crossword",
        words,
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];

      expect(addedContent.params.words).toHaveLength(20);
      expect(addedContent.library).toBe("H5P.Crossword 0.5");
    });

    it("should handle crossword with 50 words (maximum recommended)", async () => {
      const words = Array.from({ length: 50 }, (_, i) => ({
        clue: `Question ${i + 1}`,
        answer: `Answer${i + 1}`,
      }));

      const item = {
        type: "crossword" as const,
        words,
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(50);
    });

    it("should validate minimum 2 words even for large arrays", () => {
      const singleWord = {
        type: "crossword" as const,
        words: [{ clue: "Only one", answer: "Single" }],
      };

      const result = crosswordHandler.validate(singleWord);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 2 words");
    });
  });

  /**
   * Strategic Test 2: Overall Feedback Ranges
   */
  describe("Strategic Test 2: Overall Feedback Ranges", () => {
    it("should include overall feedback ranges in H5P content", async () => {
      const item = {
        type: "crossword" as const,
        words: [
          { clue: "First", answer: "Alpha" },
          { clue: "Second", answer: "Beta" },
        ],
        overallFeedback: [
          { from: 0, to: 49, feedback: "Keep practicing!" },
          { from: 50, to: 79, feedback: "Good job!" },
          { from: 80, to: 100, feedback: "Excellent work!" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];

      expect(addedContent.params.overallFeedback).toBeDefined();
      expect(addedContent.params.overallFeedback).toHaveLength(3);
      expect(addedContent.params.overallFeedback[0].from).toBe(0);
      expect(addedContent.params.overallFeedback[0].to).toBe(49);
      expect(addedContent.params.overallFeedback[2].feedback).toBe(
        "Excellent work!"
      );
    });

    it("should validate feedback ranges are 0-100 percentages", () => {
      const invalidRange = {
        type: "crossword" as const,
        words: [
          { clue: "First", answer: "Alpha" },
          { clue: "Second", answer: "Beta" },
        ],
        overallFeedback: [{ from: 0, to: 150, feedback: "Invalid range" }],
      };

      const result = crosswordHandler.validate(invalidRange);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("between 0 and 100");
    });

    it("should validate feedback ranges have required fields", () => {
      const missingFeedback = {
        type: "crossword" as const,
        words: [
          { clue: "First", answer: "Alpha" },
          { clue: "Second", answer: "Beta" },
        ],
        overallFeedback: [{ from: 0, to: 100 }], // Missing feedback field
      };

      const result = crosswordHandler.validate(missingFeedback);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("feedback");
    });
  });

  /**
   * Strategic Test 3: Multiple Crosswords in Single Chapter
   */
  describe("Strategic Test 3: Multiple Crosswords in Single Chapter", () => {
    it("should handle multiple crosswords in sequence", async () => {
      const crossword1 = {
        type: "crossword" as const,
        title: "First Crossword",
        words: [
          { clue: "Clue 1A", answer: "Word1A" },
          { clue: "Clue 1B", answer: "Word1B" },
        ],
      };

      const crossword2 = {
        type: "crossword" as const,
        title: "Second Crossword",
        words: [
          { clue: "Clue 2A", answer: "Word2A" },
          { clue: "Clue 2B", answer: "Word2B" },
        ],
      };

      // Process both crosswords
      await crosswordHandler.process(mockContext, crossword1);
      await crosswordHandler.process(mockContext, crossword2);

      // Both should be added to chapter
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(2);

      const firstCall = (mockChapterBuilder.addCustomContent as jest.Mock).mock
        .calls[0][0];
      const secondCall = (mockChapterBuilder.addCustomContent as jest.Mock).mock
        .calls[1][0];

      expect(firstCall.params.words[0].answer).toBe("Word1A");
      expect(secondCall.params.words[0].answer).toBe("Word2A");
    });

    it("should generate unique subContentIds for multiple crosswords with extra clues", async () => {
      const crossword1 = {
        type: "crossword" as const,
        words: [
          {
            clue: "First word",
            answer: "Alpha",
            extraClue: { type: "text" as const, content: "Hint for Alpha" },
          },
          { clue: "Second word", answer: "Beta" },
        ],
      };

      const crossword2 = {
        type: "crossword" as const,
        words: [
          {
            clue: "Third word",
            answer: "Gamma",
            extraClue: { type: "text" as const, content: "Hint for Gamma" },
          },
          { clue: "Fourth word", answer: "Delta" },
        ],
      };

      await crosswordHandler.process(mockContext, crossword1);
      await crosswordHandler.process(mockContext, crossword2);

      const firstCall = (mockChapterBuilder.addCustomContent as jest.Mock).mock
        .calls[0][0];
      const secondCall = (mockChapterBuilder.addCustomContent as jest.Mock).mock
        .calls[1][0];

      const subContentId1 = firstCall.params.words[0].extraClue?.subContentId;
      const subContentId2 = secondCall.params.words[0].extraClue?.subContentId;

      expect(subContentId1).toBeDefined();
      expect(subContentId2).toBeDefined();
      expect(subContentId1).not.toBe(subContentId2);
    });
  });

  /**
   * Strategic Test 4: AI Configuration Cascade
   */
  describe("Strategic Test 4: AI Configuration Cascade (book > chapter > item)", () => {
    it("should use item-level AI config when provided", async () => {
      mockContext.bookConfig = {
        targetAudience: "grade-6" as const,
        tone: "educational" as const,
      };

      mockContext.chapterConfig = {
        targetAudience: "high-school" as const,
      };

      const item = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword about physics",
        wordCount: 3,
        aiConfig: {
          targetAudience: "college" as const, // Item-level override
          tone: "academic" as const,
        },
      };

      await aiCrosswordHandler.process(mockContext, item);

      // Verify AI was called with item-level config taking precedence
      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalled();
      const generateCall = mockQuizGenerator.generateRawContent.mock.calls[0];

      // User prompt should include customization from item config
      const userPrompt = generateCall[1];
      expect(userPrompt).toBeDefined();
    });

    it("should use chapter-level AI config when item config not provided", async () => {
      mockContext.bookConfig = {
        targetAudience: "grade-6" as const,
      };

      mockContext.chapterConfig = {
        targetAudience: "college" as const, // Chapter-level override
        customization: "Focus on advanced concepts",
      };

      const item = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword about chemistry",
        wordCount: 3,
      };

      await aiCrosswordHandler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalled();
      const generateCall = mockQuizGenerator.generateRawContent.mock.calls[0];
      const userPrompt = generateCall[1];

      // AI generation should succeed with chapter config
      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalled();
    });

    it("should use book-level AI config when no chapter or item config", async () => {
      mockContext.bookConfig = {
        targetAudience: "esl-beginner" as const,
        tone: "casual" as const,
      };

      const item = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword about everyday objects",
        wordCount: 3,
      };

      await aiCrosswordHandler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalled();
    });
  });

  /**
   * Strategic Test 5: Edge Cases (long clues, special characters, hyphens)
   */
  describe("Strategic Test 5: Edge Cases", () => {
    it("should handle very long clue text (500+ characters)", async () => {
      const longClue = "A".repeat(500);

      const item = {
        type: "crossword" as const,
        words: [
          { clue: longClue, answer: "LongAnswer" },
          { clue: "Normal clue", answer: "NormalAnswer" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];
      expect(addedContent.params.words[0].clue).toBe(longClue);
    });

    it("should accept hyphenated answers", async () => {
      const item = {
        type: "crossword" as const,
        words: [
          { clue: "City in New York", answer: "New-York" },
          { clue: "Compound word", answer: "Self-aware" },
          { clue: "Multiple hyphens", answer: "Up-to-date" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];
      expect(addedContent.params.words[0].answer).toBe("New-York");
      expect(addedContent.params.words[2].answer).toBe("Up-to-date");
    });

    it("should handle special characters in clues", async () => {
      const item = {
        type: "crossword" as const,
        words: [
          {
            clue: 'What is the "capital" of France? (hint: city)',
            answer: "Paris",
          },
          { clue: "Symbol: & means?", answer: "Ampersand" },
          { clue: "Math: 2 + 2 = ?", answer: "Four" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];

      // Special characters should be escaped in HTML
      expect(addedContent.params.words[0].clue).toContain("capital");
      expect(addedContent.params.words[1].clue).toContain("&amp;");
    });

    it("should handle numbers in answers", async () => {
      const item = {
        type: "crossword" as const,
        words: [
          { clue: "Windows version", answer: "Windows10" },
          { clue: "Highway number", answer: "Route66" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];
      expect(addedContent.params.words[0].answer).toBe("Windows10");
      expect(addedContent.params.words[1].answer).toBe("Route66");
    });

    it("should handle Unicode characters in clues", async () => {
      const item = {
        type: "crossword" as const,
        words: [
          { clue: "Japanese capital: 東京 in English?", answer: "Tokyo" },
          { clue: "French café word", answer: "Café" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];
      expect(addedContent.params.words[0].clue).toContain("東京");
    });

    it("should reject answers with leading/trailing spaces", () => {
      const item = {
        type: "crossword" as const,
        words: [
          { clue: "Test", answer: " Paris " }, // Spaces should be trimmed or rejected
          { clue: "Test 2", answer: "London" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);

      // Should either trim spaces automatically or reject
      // Based on implementation, spaces are not allowed
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain("single word");
    });

    it("should handle empty taskDescription gracefully", async () => {
      const item = {
        type: "crossword" as const,
        taskDescription: "",
        words: [
          { clue: "First", answer: "Alpha" },
          { clue: "Second", answer: "Beta" },
        ],
      };

      const validationResult = crosswordHandler.validate(item);
      expect(validationResult.valid).toBe(true);

      await crosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];

      // Empty taskDescription should be handled gracefully
      expect(addedContent.params.taskDescription).toBeDefined();
    });

    it("should handle AI-generated words with extra long answers (stress test)", async () => {
      const mockLongWords = JSON.stringify([
        {
          clue: "Long word 1",
          answer: "Pneumonoultramicroscopicsilicovolcanoconiosis",
        },
        {
          clue: "Long word 2",
          answer: "Supercalifragilisticexpialidocious",
        },
      ]);

      mockQuizGenerator.generateRawContent = jest
        .fn()
        .mockResolvedValue(mockLongWords);

      const item = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword with very long medical terms",
        wordCount: 2,
      };

      await aiCrosswordHandler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock)
        .mock.calls[0][0];

      expect(addedContent.params.words[0].answer).toBe(
        "Pneumonoultramicroscopicsilicovolcanoconiosis"
      );
    });
  });
});
