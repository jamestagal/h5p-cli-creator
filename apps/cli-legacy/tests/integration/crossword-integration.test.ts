/**
 * Crossword Integration Tests (Task Group 4.2)
 *
 * Integration tests for crossword handlers within the handler registry system.
 * These tests verify that crossword handlers integrate correctly with the system.
 *
 * Test Coverage:
 * - Integration test 1: Register and retrieve crossword handlers from registry
 * - Integration test 2: Process manual crossword content through handler
 * - Integration test 3: Process AI crossword content through handler
 * - Integration test 4: Verify H5P.Crossword library requirements
 * - Integration test 5: Verify extra clue (text) content generation
 */

import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { CrosswordHandler } from "../../src/handlers/embedded/CrosswordHandler";
import { AICrosswordHandler } from "../../src/handlers/ai/AICrosswordHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";

describe("Crossword Handler Integration Tests", () => {
  let registry: HandlerRegistry;
  let mockChapterBuilder: any;
  let mockContext: HandlerContext;
  let mockQuizGenerator: any;

  beforeEach(() => {
    // Reset singleton registry for each test
    (HandlerRegistry as any).instance = undefined;
    registry = HandlerRegistry.getInstance();

    // Register crossword handlers
    registry.register(new CrosswordHandler());
    registry.register(new AICrosswordHandler());

    // Create mock QuizGenerator
    mockQuizGenerator = {
      generateRawContent: jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "The red planet", answer: "Mars" },
          { clue: "Largest planet", answer: "Jupiter" },
          { clue: "Ringed planet", answer: "Saturn" },
        ])
      ),
    };

    // Create mock ChapterBuilder
    mockChapterBuilder = {
      addCustomContent: jest.fn().mockReturnThis(),
      addTextPage: jest.fn(),
      addImagePage: jest.fn().mockResolvedValue(undefined),
      addAudioPage: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock HandlerContext
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      libraryRegistry: {} as LibraryRegistry,
      quizGenerator: mockQuizGenerator,
      aiPromptBuilder: {} as AIPromptBuilder,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      mediaFiles: [],
      basePath: "/test/path",
      options: { verbose: false },
    };
  });

  /**
   * Integration Test 1: Handler Registry Integration
   */
  describe("Integration Test 1: Handler Registry Integration", () => {
    it("should register and retrieve crossword handler from registry", () => {
      const handler = registry.getHandler("crossword");
      expect(handler).toBeDefined();
      expect(handler?.getContentType()).toBe("crossword");
    });

    it("should register and retrieve ai-crossword handler from registry", () => {
      const handler = registry.getHandler("ai-crossword");
      expect(handler).toBeDefined();
      expect(handler?.getContentType()).toBe("ai-crossword");
    });

    it("should return correct content types from handlers", () => {
      const crosswordHandler = registry.getHandler("crossword");
      const aiCrosswordHandler = registry.getHandler("ai-crossword");

      expect(crosswordHandler?.getContentType()).toBe("crossword");
      expect(aiCrosswordHandler?.getContentType()).toBe("ai-crossword");
    });
  });

  /**
   * Integration Test 2: Manual Crossword Processing
   */
  describe("Integration Test 2: Manual Crossword Content Processing", () => {
    it("should process manual crossword through handler", async () => {
      const handler = registry.getHandler("crossword");
      expect(handler).toBeDefined();

      const content = {
        type: "crossword" as const,
        title: "Geography Quiz",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" },
          { clue: "Capital of Italy", answer: "Rome" },
        ],
      };

      // Validate content
      const validation = handler!.validate(content);
      expect(validation.valid).toBe(true);

      // Process content
      await handler!.process(mockContext, content);

      // Verify addCustomContent was called
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();

      // Verify content structure
      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      expect(addedContent.library).toBe("H5P.Crossword 0.5");
      expect(addedContent.params.words).toHaveLength(3);
      expect(addedContent.params.words[0].clue).toBe("Capital of France");
      expect(addedContent.params.words[0].answer).toBe("Paris");
    });

    it("should handle validation errors gracefully", () => {
      const handler = registry.getHandler("crossword");
      expect(handler).toBeDefined();

      // Invalid content: only 1 word (minimum 2 required)
      const invalidContent = {
        type: "crossword" as const,
        words: [{ clue: "Single word", answer: "Only" }],
      };

      const validation = handler!.validate(invalidContent);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("at least 2 words");
    });

    it("should process crossword with theme and behaviour settings", async () => {
      const handler = registry.getHandler("crossword");

      const content = {
        type: "crossword" as const,
        words: [
          { clue: "First", answer: "Alpha" },
          { clue: "Second", answer: "Beta" },
        ],
        theme: {
          backgroundColor: "#173354",
          gridColor: "#000000",
        },
        behaviour: {
          scoreWords: true,
          enableRetry: true,
        },
      };

      await handler!.process(mockContext, content);

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      expect(addedContent.params.theme).toBeDefined();
      expect(addedContent.params.theme.backgroundColor).toBe("#173354");
      expect(addedContent.params.behaviour).toBeDefined();
      expect(addedContent.params.behaviour.scoreWords).toBe(true);
    });
  });

  /**
   * Integration Test 3: AI Crossword Processing
   */
  describe("Integration Test 3: AI Crossword Content Processing", () => {
    it("should process AI crossword through handler", async () => {
      const handler = registry.getHandler("ai-crossword");
      expect(handler).toBeDefined();

      const content = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword about planets",
        wordCount: 3,
        difficulty: "medium" as const,
      };

      // Validate content
      const validation = handler!.validate(content);
      expect(validation.valid).toBe(true);

      // Process content
      await handler!.process(mockContext, content);

      // Verify AI generator was called
      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalled();

      // Verify content was added
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      expect(addedContent.library).toBe("H5P.Crossword 0.5");
      expect(addedContent.params.words).toBeDefined();
      expect(addedContent.params.words.length).toBeGreaterThan(0);
    });

    it("should apply difficulty levels in AI prompts", async () => {
      const handler = registry.getHandler("ai-crossword");

      const easyContent = {
        type: "ai-crossword" as const,
        prompt: "Create a crossword about fruits",
        wordCount: 3,
        difficulty: "easy" as const,
      };

      await handler!.process(mockContext, easyContent);

      const generateCall = mockQuizGenerator.generateRawContent.mock.calls[0];
      const userPrompt = generateCall[1];

      expect(userPrompt).toContain("simple vocabulary");
      expect(userPrompt).toContain("5-8");
    });

    it("should handle AI generation failures with fallback", async () => {
      const handler = registry.getHandler("ai-crossword");

      // Mock AI failure
      mockQuizGenerator.generateRawContent = jest
        .fn()
        .mockRejectedValue(new Error("AI generation failed"));

      const content = {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        wordCount: 5,
      };

      // Should still process without throwing
      await handler!.process(mockContext, content);

      // Should still add content (fallback)
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(5); // Fallback has 5 words
    });
  });

  /**
   * Integration Test 4: Library Requirements Verification
   */
  describe("Integration Test 4: H5P.Crossword Library Requirements", () => {
    it("should return H5P.Crossword library from crossword handler", () => {
      const handler = registry.getHandler("crossword");
      const requiredLibs = handler!.getRequiredLibraries();

      expect(requiredLibs).toContain("H5P.Crossword");
    });

    it("should return H5P.Crossword library from AI crossword handler", () => {
      const handler = registry.getHandler("ai-crossword");
      const requiredLibs = handler!.getRequiredLibraries();

      expect(requiredLibs).toContain("H5P.Crossword");
    });

    it("should collect all required libraries for mixed content", () => {
      // Register additional handlers for this test
      const allHandlers = registry.getAllHandlers();
      const allLibraries = new Set<string>();

      for (const handler of allHandlers) {
        const libs = handler.getRequiredLibraries();
        libs.forEach((lib) => allLibraries.add(lib));
      }

      // Should include H5P.Crossword
      expect(allLibraries.has("H5P.Crossword")).toBe(true);
    });
  });

  /**
   * Integration Test 5: Extra Clue Text Content Generation
   */
  describe("Integration Test 5: Extra Clue Text Content Generation", () => {
    it("should generate H5P.AdvancedText sub-content for extra clues", async () => {
      const handler = registry.getHandler("crossword");

      const content = {
        type: "crossword" as const,
        words: [
          {
            clue: "Capital of France",
            answer: "Paris",
            extraClue: {
              type: "text" as const,
              content: "The city of lights, over 2 million inhabitants",
            },
          },
          {
            clue: "Capital of UK",
            answer: "London",
            extraClue: {
              type: "text" as const,
              content: "Home to Big Ben and the Thames River",
            },
          },
        ],
      };

      await handler!.process(mockContext, content);

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const words = addedContent.params.words;

      // Both words should have extra clues
      expect(words[0].extraClue).toBeDefined();
      expect(words[0].extraClue.library).toBe("H5P.AdvancedText 1.1");
      expect(words[0].extraClue.params.text).toContain("city of lights");
      expect(words[0].extraClue.subContentId).toBeDefined();

      expect(words[1].extraClue).toBeDefined();
      expect(words[1].extraClue.library).toBe("H5P.AdvancedText 1.1");
      expect(words[1].extraClue.params.text).toContain("Big Ben");
      expect(words[1].extraClue.subContentId).toBeDefined();

      // SubContentIds should be unique
      expect(words[0].extraClue.subContentId).not.toBe(
        words[1].extraClue.subContentId
      );
    });

    it("should handle words without extra clues correctly", async () => {
      const handler = registry.getHandler("crossword");

      const content = {
        type: "crossword" as const,
        words: [
          {
            clue: "With extra clue",
            answer: "First",
            extraClue: {
              type: "text" as const,
              content: "Hint for first word",
            },
          },
          {
            clue: "Without extra clue",
            answer: "Second",
          },
        ],
      };

      await handler!.process(mockContext, content);

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const words = addedContent.params.words;

      // First word has extra clue
      expect(words[0].extraClue).toBeDefined();

      // Second word does not have extra clue
      expect(words[1].extraClue).toBeUndefined();
    });

    it("should generate extra clues for AI crossword when includeExtraClues=true", async () => {
      const handler = registry.getHandler("ai-crossword");

      // Mock AI response with extra clues
      mockQuizGenerator.generateRawContent = jest.fn().mockResolvedValue(
        JSON.stringify([
          {
            clue: "The red planet",
            answer: "Mars",
            extraClue: "Fourth planet from the Sun",
          },
          {
            clue: "Largest planet",
            answer: "Jupiter",
            extraClue: "Named after the king of gods",
          },
        ])
      );

      const content = {
        type: "ai-crossword" as const,
        prompt: "Planets",
        wordCount: 2,
        includeExtraClues: true,
      };

      await handler!.process(mockContext, content);

      const addedContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const words = addedContent.params.words;

      // Both AI-generated words should have extra clues
      expect(words[0].extraClue).toBeDefined();
      expect(words[0].extraClue.library).toBe("H5P.AdvancedText 1.1");
      expect(words[0].extraClue.params.text).toContain("Fourth planet");

      expect(words[1].extraClue).toBeDefined();
      expect(words[1].extraClue.params.text).toContain("king of gods");
    });
  });

  /**
   * Additional Integration Test: Multiple Crosswords in Sequence
   */
  describe("Integration Test 6: Multiple Crosswords Processing", () => {
    it("should process multiple crosswords in sequence without conflict", async () => {
      const handler = registry.getHandler("crossword");

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

      await handler!.process(mockContext, crossword1);
      await handler!.process(mockContext, crossword2);

      // Both should be added
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(2);

      const firstCall = mockChapterBuilder.addCustomContent.mock.calls[0][0];
      const secondCall = mockChapterBuilder.addCustomContent.mock.calls[1][0];

      expect(firstCall.params.words[0].answer).toBe("Word1A");
      expect(secondCall.params.words[0].answer).toBe("Word2A");
    });
  });
});
