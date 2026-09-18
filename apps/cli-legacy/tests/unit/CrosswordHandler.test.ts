import { CrosswordHandler } from "../../src/handlers/embedded/CrosswordHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";

/**
 * Task Group 2.1: CrosswordHandler Validation Tests
 *
 * These tests verify that CrosswordHandler:
 * - Validates minimum 2 words required for grid generation
 * - Rejects single-word crosswords
 * - Rejects multi-word answers with spaces
 * - Accepts answers with hyphens (e.g., "New-York")
 * - Rejects empty clue text
 * - Validates extra clue text format
 * - Validates theme color hex format (#RRGGBB)
 * - Validates behaviour boolean fields
 */

describe("CrosswordHandler Validation", () => {
  let handler: CrosswordHandler;
  let mockContext: HandlerContext;

  beforeEach(() => {
    handler = new CrosswordHandler();
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
      quizGenerator: {} as any,
      aiPromptBuilder: {} as any,
      mediaFiles: [],
      basePath: "/test"
    };
  });

  describe("Test 1: Valid crossword with 5 words", () => {
    it("should accept valid crossword with 5 words (minimum 2 required)", () => {
      const valid = handler.validate({
        type: "crossword",
        title: "Geography Quiz",
        words: [
          { clue: "Statue of Liberty is located in?", answer: "NewYork" },
          { clue: "Taj Mahal is located in?", answer: "Agra" },
          { clue: "Eiffel Tower is located in?", answer: "Paris" },
          { clue: "Big Ben is located in?", answer: "London" },
          { clue: "Colosseum is located in?", answer: "Rome" }
        ]
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });
  });

  describe("Test 2: Reject single-word crossword", () => {
    it("should reject crossword with only 1 word (minimum 2 required)", () => {
      const invalid = handler.validate({
        type: "crossword",
        title: "Single Word",
        words: [
          { clue: "Capital of France", answer: "Paris" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("at least 2 words");
      expect(invalid.error).toContain("grid generation");
    });
  });

  describe("Test 3: Reject multi-word answers with spaces", () => {
    it("should reject answers containing spaces", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Statue of Liberty location", answer: "New York" },
          { clue: "Taj Mahal location", answer: "Agra" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("single word");
      expect(invalid.error).toContain("New York");
      expect(invalid.error).toContain("no spaces");
    });
  });

  describe("Test 4: Accept answers with hyphens", () => {
    it("should accept answers with hyphens (e.g., 'New-York')", () => {
      const valid = handler.validate({
        type: "crossword",
        words: [
          { clue: "City with Statue of Liberty", answer: "New-York" },
          { clue: "Taj Mahal city", answer: "Agra" },
          { clue: "City with Eiffel Tower", answer: "Paris" }
        ]
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });
  });

  describe("Test 5: Reject empty clue text", () => {
    it("should reject words with empty clue", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { clue: "", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("clue");
      expect(invalid.error).toContain("non-empty");
    });

    it("should reject words with missing clue field", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("clue");
    });
  });

  describe("Test 6: Validate extra clue text format", () => {
    it("should accept text extra clue with valid content", () => {
      const valid = handler.validate({
        type: "crossword",
        words: [
          {
            clue: "Capital of France",
            answer: "Paris",
            extraClue: {
              type: "text",
              content: "The city of lights, over 2 million inhabitants"
            }
          },
          { clue: "Capital of UK", answer: "London" }
        ]
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });

    it("should reject extra clue with invalid type", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          {
            clue: "Capital of France",
            answer: "Paris",
            extraClue: {
              type: "invalid-type",
              content: "Some content"
            }
          },
          { clue: "Capital of UK", answer: "London" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("extraClue type");
      expect(invalid.error).toContain("text");
    });

    it("should reject text extra clue with missing content", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          {
            clue: "Capital of France",
            answer: "Paris",
            extraClue: {
              type: "text"
            }
          },
          { clue: "Capital of UK", answer: "London" }
        ]
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("content");
    });
  });

  describe("Test 7: Validate theme color hex format", () => {
    it("should accept valid hex colors in theme", () => {
      const valid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ],
        theme: {
          backgroundColor: "#173354",
          gridColor: "#000000",
          cellBackgroundColor: "#ffffff",
          cellColor: "#333333"
        }
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });

    it("should reject invalid hex color format (missing #)", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ],
        theme: {
          backgroundColor: "173354"
        }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("hex");
      expect(invalid.error).toContain("#");
    });

    it("should reject invalid hex color format (wrong length)", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ],
        theme: {
          backgroundColor: "#1733"
        }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("hex");
    });
  });

  describe("Test 8: Validate behaviour boolean fields", () => {
    it("should accept valid boolean behaviour fields", () => {
      const valid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ],
        behaviour: {
          enableInstantFeedback: false,
          scoreWords: true,
          applyPenalties: false,
          enableRetry: true,
          enableSolutionsButton: true
        }
      });

      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();
    });

    it("should reject non-boolean behaviour field", () => {
      const invalid = handler.validate({
        type: "crossword",
        words: [
          { clue: "Capital of France", answer: "Paris" },
          { clue: "Capital of UK", answer: "London" }
        ],
        behaviour: {
          enableRetry: "yes"
        }
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain("boolean");
      expect(invalid.error).toContain("enableRetry");
    });
  });

  describe("ContentHandler interface methods", () => {
    it("should return 'crossword' from getContentType()", () => {
      expect(handler.getContentType()).toBe("crossword");
    });

    it("should return ['H5P.Crossword'] from getRequiredLibraries()", () => {
      const libs = handler.getRequiredLibraries();
      expect(libs).toEqual(["H5P.Crossword"]);
    });
  });
});
