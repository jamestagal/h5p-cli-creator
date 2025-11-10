import { AIDragTextHandler } from "../../../../src/handlers/ai/AIDragTextHandler";

describe("AIDragTextHandler", () => {
  let handler: AIDragTextHandler;

  beforeEach(() => {
    handler = new AIDragTextHandler();
  });

  describe("getContentType", () => {
    it("should return 'ai-dragtext'", () => {
      expect(handler.getContentType()).toBe("ai-dragtext");
    });
  });

  describe("validate", () => {
    it("should accept valid content with prompt", () => {
      const item = {
        type: "ai-dragtext",
        prompt: "Create fill-in-the-blank sentences about photosynthesis"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing prompt with descriptive error", () => {
      const item = {
        type: "ai-dragtext",
        title: "Test"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("prompt");
    });

    it("should reject invalid difficulty enum", () => {
      const item = {
        type: "ai-dragtext",
        prompt: "Test prompt",
        difficulty: "invalid-difficulty"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("difficulty");
    });

    it("should reject invalid sentenceCount", () => {
      const item = {
        type: "ai-dragtext",
        prompt: "Test prompt",
        sentenceCount: 0
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("sentenceCount");
    });

    it("should reject invalid blanksPerSentence", () => {
      const item = {
        type: "ai-dragtext",
        prompt: "Test prompt",
        blanksPerSentence: -1
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("blanksPerSentence");
    });

    it("should reject invalid distractorCount", () => {
      const item = {
        type: "ai-dragtext",
        prompt: "Test prompt",
        distractorCount: -5
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("distractorCount");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.DragText']", () => {
      expect(handler.getRequiredLibraries()).toEqual(["H5P.DragText"]);
    });
  });
});
