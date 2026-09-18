import { BlanksHandler } from "../../../../src/handlers/embedded/BlanksHandler";

describe("BlanksHandler", () => {
  let handler: BlanksHandler;

  beforeEach(() => {
    handler = new BlanksHandler();
  });

  describe("getContentType", () => {
    it("should return 'blanks'", () => {
      expect(handler.getContentType()).toBe("blanks");
    });
  });

  describe("validate", () => {
    it("should accept valid sentences format", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "Blueberries are {blank} colored berries.",
            blanks: [
              { answer: "blue" }
            ]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid questions format", () => {
      const item = {
        type: "blanks",
        questions: [
          "Blueberries are *blue* colored berries.",
          "Cloudberries are *orange* berries."
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing both sentences and questions", () => {
      const item = {
        type: "blanks",
        title: "Test"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("either 'sentences' array or 'questions' array");
    });

    it("should reject having both sentences and questions", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "Test {blank}",
            blanks: [{ answer: "answer" }]
          }
        ],
        questions: ["Test *answer*"]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot have both");
    });

    it("should reject sentences without blanks array", () => {
      const item = {
        type: "blanks",
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

    it("should accept alternative answers as string array", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "Earth has {blank} moon(s).",
            blanks: [
              { answer: ["one", "1"] }
            ]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should validate blank count matches blanks array length", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "The {blank} is {blank}.",
            blanks: [
              { answer: "Sun" }
              // Missing second blank definition
            ]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("2 {blank} markers but 1 blanks defined");
    });

    it("should accept valid media object with image", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "The sky is {blank}.",
            blanks: [{ answer: "blue" }]
          }
        ],
        media: {
          path: "images/sky.jpg",
          type: "image",
          alt: "Blue sky",
          disableZooming: false
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept behavior settings override", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "Test {blank}",
            blanks: [{ answer: "answer" }]
          }
        ],
        behaviour: {
          caseSensitive: false,
          acceptSpellingErrors: true,
          enableRetry: false
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept multiple blanks per sentence", () => {
      const item = {
        type: "blanks",
        sentences: [
          {
            text: "The {blank} is {blank} and {blank}.",
            blanks: [
              { answer: "Sun" },
              { answer: "hot" },
              { answer: "bright" }
            ]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("convertSimplifiedToNative", () => {
    it("should convert simple blank to native format", () => {
      const sentence = {
        text: "Blueberries are {blank}.",
        blanks: [{ answer: "blue" }]
      };

      // Access private method through any cast for testing
      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("Blueberries are *blue*.");
    });

    it("should convert alternative answers with / separator", () => {
      const sentence = {
        text: "Earth has {blank} moon(s).",
        blanks: [{ answer: ["one", "1"] }]
      };

      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("Earth has *one/1* moon(s).");
    });

    it("should append tips with : separator", () => {
      const sentence = {
        text: "The Sun is a {blank}.",
        blanks: [{ answer: "star", tip: "Not a planet!" }]
      };

      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("The Sun is a *star:Not a planet!*.");
    });

    it("should handle combined alternatives and tips", () => {
      const sentence = {
        text: "Water freezes at {blank} degrees.",
        blanks: [{ answer: ["zero", "0"], tip: "Think of ice" }]
      };

      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("Water freezes at *zero/0:Think of ice* degrees.");
    });

    it("should handle multiple blanks in correct order", () => {
      const sentence = {
        text: "The {blank} is {blank}.",
        blanks: [
          { answer: "Sun" },
          { answer: "hot" }
        ]
      };

      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("The *Sun* is *hot*.");
    });

    it("should handle special characters in answers", () => {
      const sentence = {
        text: "The answer is {blank}.",
        blanks: [{ answer: "42°C" }]
      };

      const result = (handler as any).convertSimplifiedToNative(sentence);
      expect(result).toBe("The answer is *42°C*.");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.Blanks']", () => {
      expect(handler.getRequiredLibraries()).toEqual(["H5P.Blanks"]);
    });
  });
});
