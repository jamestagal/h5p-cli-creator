import { AICrosswordHandler } from "../../src/handlers/ai/AICrosswordHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";

/**
 * Task Group 3.1: AICrosswordHandler Tests
 *
 * These tests verify that AICrosswordHandler:
 * - Generates crossword from valid prompt
 * - Respects wordCount parameter (5, 10, 15 words)
 * - Applies difficulty levels (easy: 5-8 letters, medium: 6-12, hard: 8-15)
 * - Includes extra clues when includeExtraClues=true
 * - Parses AI response with markdown code fences (```json)
 * - Rejects multi-word answers from AI (skip with warning)
 * - Provides fallback on AI generation failure
 * - Applies universal AI config (targetAudience, tone, customization)
 */

describe("AICrosswordHandler", () => {
  let handler: AICrosswordHandler;
  let mockContext: HandlerContext;

  beforeEach(() => {
    handler = new AICrosswordHandler();
    mockContext = {
      chapterBuilder: {
        addCustomContent: jest.fn()
      } as any,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      options: {
        verbose: true
      },
      libraryRegistry: {} as any,
      quizGenerator: {
        generateRawContent: jest.fn()
      } as any,
      aiPromptBuilder: {} as any,
      mediaFiles: [],
      basePath: "/test"
    };
  });

  describe("Test 1: Generate crossword from valid prompt", () => {
    it("should generate crossword from valid prompt", async () => {
      // Mock AI response
      const mockAIResponse = JSON.stringify([
        { clue: "The red planet", answer: "Mars" },
        { clue: "Largest planet", answer: "Jupiter" },
        { clue: "Ringed planet", answer: "Saturn" }
      ]);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      const content = {
        type: "ai-crossword" as const,
        title: "Solar System",
        prompt: "Create a crossword about planets"
      };

      await handler.process(mockContext, content);

      expect(mockContext.chapterBuilder.addCustomContent).toHaveBeenCalled();
      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.library).toBe("H5P.Crossword 0.5");
      expect(addedContent.params.words).toHaveLength(3);
      expect(addedContent.params.words[0].clue).toBe("The red planet");
      expect(addedContent.params.words[0].answer).toBe("Mars");
    });
  });

  describe("Test 2: Respect wordCount parameter", () => {
    it("should generate exactly 5 words when wordCount=5", async () => {
      const mockAIResponse = JSON.stringify([
        { clue: "Clue 1", answer: "Word1" },
        { clue: "Clue 2", answer: "Word2" },
        { clue: "Clue 3", answer: "Word3" },
        { clue: "Clue 4", answer: "Word4" },
        { clue: "Clue 5", answer: "Word5" }
      ]);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, { type: "ai-crossword" as const, prompt: "Test", wordCount: 5 });

      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(5);
    });

    it("should generate exactly 10 words when wordCount=10", async () => {
      const mockWords = Array.from({ length: 10 }, (_, i) => ({
        clue: `Clue ${i + 1}`,
        answer: `Word${i + 1}`
      }));
      const mockAIResponse = JSON.stringify(mockWords);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, { type: "ai-crossword" as const, prompt: "Test", wordCount: 10 });

      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(10);
    });

    it("should generate exactly 15 words when wordCount=15", async () => {
      const mockWords = Array.from({ length: 15 }, (_, i) => ({
        clue: `Clue ${i + 1}`,
        answer: `Word${i + 1}`
      }));
      const mockAIResponse = JSON.stringify(mockWords);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, { type: "ai-crossword" as const, prompt: "Test", wordCount: 15 });

      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(15);
    });
  });

  describe("Test 3: Apply difficulty levels", () => {
    it("should include easy difficulty guidance in prompt", async () => {
      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "Simple clue", answer: "Easy" },
          { clue: "Another clue", answer: "Simple" }
        ])
      );

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        difficulty: "easy",
        wordCount: 2
      });

      const generateCall = (mockContext.quizGenerator.generateRawContent as jest.Mock).mock.calls[0];
      const userPrompt = generateCall[1];

      expect(userPrompt).toContain("simple vocabulary");
      expect(userPrompt).toContain("5-8");
    });

    it("should include medium difficulty guidance in prompt", async () => {
      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "Moderate clue", answer: "Medium" },
          { clue: "Another clue", answer: "Standard" }
        ])
      );

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        difficulty: "medium",
        wordCount: 2
      });

      const generateCall = (mockContext.quizGenerator.generateRawContent as jest.Mock).mock.calls[0];
      const userPrompt = generateCall[1];

      expect(userPrompt).toContain("moderate vocabulary");
      expect(userPrompt).toContain("6-12");
    });

    it("should include hard difficulty guidance in prompt", async () => {
      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "Complex clue", answer: "Challenging" },
          { clue: "Difficult clue", answer: "Advanced" }
        ])
      );

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        difficulty: "hard",
        wordCount: 2
      });

      const generateCall = (mockContext.quizGenerator.generateRawContent as jest.Mock).mock.calls[0];
      const userPrompt = generateCall[1];

      expect(userPrompt).toContain("complex academic vocabulary");
      expect(userPrompt).toContain("8-15");
    });
  });

  describe("Test 4: Include extra clues when includeExtraClues=true", () => {
    it("should generate extra clues when includeExtraClues=true", async () => {
      const mockAIResponse = JSON.stringify([
        {
          clue: "The red planet",
          answer: "Mars",
          extraClue: "Fourth planet from the Sun"
        },
        {
          clue: "Largest planet",
          answer: "Jupiter",
          extraClue: "Named after the king of gods"
        }
      ]);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Planets",
        wordCount: 2,
        includeExtraClues: true
      });

      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words[0].extraClue).toBeDefined();
      expect(addedContent.params.words[0].extraClue.library).toBe("H5P.AdvancedText 1.1");
      expect(addedContent.params.words[0].extraClue.params.text).toContain("Fourth planet from the Sun");
    });
  });

  describe("Test 5: Parse AI response with markdown code fences", () => {
    it("should parse AI response with markdown code fences", async () => {
      const mockAIResponse = "```json\n" + JSON.stringify([
        { clue: "Test clue", answer: "Test" },
        { clue: "Another clue", answer: "Answer" }
      ]) + "\n```";

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, { type: "ai-crossword" as const, prompt: "Test", wordCount: 2 });

      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(2);
      expect(addedContent.params.words[0].clue).toBe("Test clue");
    });
  });

  describe("Test 6: Reject multi-word answers from AI", () => {
    it("should skip multi-word answers with spaces and log warning", async () => {
      const mockAIResponse = JSON.stringify([
        { clue: "Valid clue", answer: "Valid" },
        { clue: "Invalid clue", answer: "New York" }, // Multi-word - should be skipped
        { clue: "Another valid", answer: "Paris" }
      ]);

      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(mockAIResponse);

      await handler.process(mockContext, { type: "ai-crossword" as const, prompt: "Test", wordCount: 3 });

      // Should have logged warning about multi-word answer
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("multi-word")
      );
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("New York")
      );

      // Should only include 2 valid words (skipped the multi-word one)
      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(2);
      expect(addedContent.params.words[0].answer).toBe("Valid");
      expect(addedContent.params.words[1].answer).toBe("Paris");
    });
  });

  describe("Test 7: Fallback on AI generation failure", () => {
    it("should provide fallback content when AI fails", async () => {
      mockContext.quizGenerator.generateRawContent = jest.fn().mockRejectedValue(
        new Error("AI generation failed")
      );

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        wordCount: 5
      });

      // Should have logged warning
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("AI crossword generation failed")
      );

      // Should still generate content (fallback)
      expect(mockContext.chapterBuilder.addCustomContent).toHaveBeenCalled();
      const addedContent = (mockContext.chapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.words).toHaveLength(5);
      expect(addedContent.params.words[0].clue).toContain("AI generation failed");
    });
  });

  describe("Test 8: Apply universal AI config", () => {
    it("should apply targetAudience, tone, and customization from aiConfig", async () => {
      mockContext.quizGenerator.generateRawContent = jest.fn().mockResolvedValue(
        JSON.stringify([
          { clue: "Simple clue", answer: "Word" },
          { clue: "Another clue", answer: "Test" }
        ])
      );

      await handler.process(mockContext, {
        type: "ai-crossword" as const,
        prompt: "Test prompt",
        wordCount: 2,
        aiConfig: {
          targetAudience: "grade-6",
          tone: "educational",
          customization: "Focus on science vocabulary"
        }
      });

      // Verify generateRawContent was called with system prompt
      expect(mockContext.quizGenerator.generateRawContent).toHaveBeenCalled();
      const generateCall = (mockContext.quizGenerator.generateRawContent as jest.Mock).mock.calls[0];
      const systemPrompt = generateCall[0];
      const userPrompt = generateCall[1];

      // Should include AI config in prompts
      expect(systemPrompt).toBeDefined();
      expect(userPrompt).toContain("Focus on science vocabulary");
    });
  });

  describe("Validation tests", () => {
    it("should require prompt field", () => {
      const result = handler.validate({
        type: "ai-crossword"
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("prompt");
    });

    it("should validate wordCount is positive integer", () => {
      const result = handler.validate({
        prompt: "Test",
        wordCount: -5
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("positive integer");
    });

    it("should validate difficulty is valid enum", () => {
      const result = handler.validate({
        prompt: "Test",
        difficulty: "super-hard"
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("easy, medium, hard");
    });

    it("should validate includeExtraClues is boolean", () => {
      const result = handler.validate({
        prompt: "Test",
        includeExtraClues: "yes"
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("boolean");
    });
  });

  describe("Handler interface methods", () => {
    it("should return correct content type", () => {
      expect(handler.getContentType()).toBe("ai-crossword");
    });

    it("should return required libraries", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toContain("H5P.Crossword");
    });
  });
});
