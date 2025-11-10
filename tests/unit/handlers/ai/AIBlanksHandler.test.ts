import { AIBlanksHandler } from "../../../../src/handlers/ai/AIBlanksHandler";

describe("AIBlanksHandler", () => {
  let handler: AIBlanksHandler;

  beforeEach(() => {
    handler = new AIBlanksHandler();
  });

  describe("getContentType", () => {
    it("should return 'ai-blanks'", () => {
      expect(handler.getContentType()).toBe("ai-blanks");
    });
  });

  describe("validate", () => {
    it("should accept valid content with prompt", () => {
      const item = {
        type: "ai-blanks",
        prompt: "Create fill-in-the-blank sentences about photosynthesis"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing prompt with descriptive error", () => {
      const item = {
        type: "ai-blanks",
        title: "Test"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("prompt");
    });

    it("should reject invalid difficulty enum", () => {
      const item = {
        type: "ai-blanks",
        prompt: "Test prompt",
        difficulty: "invalid-difficulty"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("difficulty");
    });

    it("should reject invalid sentenceCount", () => {
      const item = {
        type: "ai-blanks",
        prompt: "Test prompt",
        sentenceCount: 0
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("sentenceCount");
    });

    it("should reject invalid blanksPerSentence", () => {
      const item = {
        type: "ai-blanks",
        prompt: "Test prompt",
        blanksPerSentence: 0
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("blanksPerSentence");
    });

    it("should accept valid difficulty levels", () => {
      const difficulties = ["easy", "medium", "hard"];

      difficulties.forEach(difficulty => {
        const item = {
          type: "ai-blanks",
          prompt: "Test prompt",
          difficulty
        };

        const result = handler.validate(item);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.Blanks']", () => {
      expect(handler.getRequiredLibraries()).toEqual(["H5P.Blanks"]);
    });
  });
});
