import { DragTextHandler } from "../../../../src/handlers/embedded/DragTextHandler";

describe("DragTextHandler", () => {
  let handler: DragTextHandler;

  beforeEach(() => {
    handler = new DragTextHandler();
  });

  describe("getContentType", () => {
    it("should return 'dragtext'", () => {
      expect(handler.getContentType()).toBe("dragtext");
    });
  });

  describe("validate", () => {
    it("should accept valid simplified format with sentences array", () => {
      const item = {
        type: "dragtext",
        sentences: [
          {
            text: "The Sun is the {blank} in our solar system.",
            blanks: [
              { answer: "star" }
            ]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid textField format", () => {
      const item = {
        type: "dragtext",
        textField: "Blueberries are *blue*. Strawberries are *red*."
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing both sentences and textField with descriptive error", () => {
      const item = {
        type: "dragtext",
        title: "Test"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("either 'sentences' array or 'textField' string");
    });

    it("should reject empty sentences array", () => {
      const item = {
        type: "dragtext",
        sentences: []
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least one sentence");
    });

    it("should reject sentences without blanks array", () => {
      const item = {
        type: "dragtext",
        sentences: [
          {
            text: "Some text {blank}"
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("blanks");
    });

    it("should reject blanks without answer field", () => {
      const item = {
        type: "dragtext",
        sentences: [
          {
            text: "Some text {blank}",
            blanks: [{ tip: "hint" }]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("answer");
    });

    it("should reject blank answer as empty string", () => {
      const item = {
        type: "dragtext",
        sentences: [
          {
            text: "Some text {blank}",
            blanks: [{ answer: "" }]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.DragText']", () => {
      expect(handler.getRequiredLibraries()).toEqual(["H5P.DragText"]);
    });
  });
});
