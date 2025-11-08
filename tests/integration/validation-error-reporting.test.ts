import { TextHandler } from "../../src/handlers/core/TextHandler";
import { ImageHandler } from "../../src/handlers/core/ImageHandler";
import { AudioHandler } from "../../src/handlers/core/AudioHandler";
import { QuizHandler } from "../../src/handlers/ai/QuizHandler";
import { FlashcardsHandler } from "../../src/handlers/embedded/FlashcardsHandler";
import { DialogCardsHandler } from "../../src/handlers/embedded/DialogCardsHandler";
import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { BookDefinition } from "../../src/compiler/YamlInputParser";

describe("Handler Validation and Error Reporting", () => {
  describe("TextHandler validation", () => {
    it("should reject missing text field", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text", title: "Test" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("text");
      expect(result.error).toContain("field");
    });

    it("should reject non-string text field", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text", text: 123 });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });

    it("should accept valid text content", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text", text: "Valid text", title: "Test" });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept text without title", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text", text: "Valid text" });

      expect(result.valid).toBe(true);
    });
  });

  describe("ImageHandler validation", () => {
    it("should reject missing path field", () => {
      const handler = new ImageHandler();
      const result = handler.validate({ type: "image", alt: "Test" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("path");
    });

    it("should reject missing alt field", () => {
      const handler = new ImageHandler();
      const result = handler.validate({ type: "image", path: "/test/image.jpg" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("alt");
    });

    it("should accept valid image content", () => {
      const handler = new ImageHandler();
      const result = handler.validate({ type: "image", path: "/test/image.jpg", alt: "Test image" });

      expect(result.valid).toBe(true);
    });
  });

  describe("AudioHandler validation", () => {
    it("should reject missing path field", () => {
      const handler = new AudioHandler();
      const result = handler.validate({ type: "audio" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("path");
    });

    it("should accept valid audio content", () => {
      const handler = new AudioHandler();
      const result = handler.validate({ type: "audio", path: "/test/audio.mp3", title: "Test" });

      expect(result.valid).toBe(true);
    });
  });

  describe("QuizHandler validation", () => {
    it("should reject missing sourceText field", () => {
      const handler = new QuizHandler();
      const result = handler.validate({ type: "ai-quiz", title: "Quiz" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("sourceText");
    });

    it("should reject non-string sourceText", () => {
      const handler = new QuizHandler();
      const result = handler.validate({ type: "ai-quiz", sourceText: 123 });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });

    it("should accept valid quiz content", () => {
      const handler = new QuizHandler();
      const result = handler.validate({
        type: "ai-quiz",
        sourceText: "The capital of France is Paris.",
        questionCount: 5
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("FlashcardsHandler validation", () => {
    it("should reject missing cards array", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({ type: "flashcards", title: "Test" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("cards");
      expect(result.error).toContain("array");
    });

    it("should reject non-array cards field", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({ type: "flashcards", cards: "not an array" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("array");
    });

    it("should reject empty cards array", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({ type: "flashcards", cards: [] });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least one");
    });

    it("should reject card without question", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({
        type: "flashcards",
        cards: [{ answer: "Test answer" }]
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Card 1");
      expect(result.error).toContain("question");
    });

    it("should reject card without answer", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({
        type: "flashcards",
        cards: [{ question: "Test question" }]
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Card 1");
      expect(result.error).toContain("answer");
    });

    it("should accept valid flashcards content", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({
        type: "flashcards",
        cards: [
          { question: "Q1", answer: "A1", tip: "Tip1" },
          { question: "Q2", answer: "A2" }
        ]
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("DialogCardsHandler validation", () => {
    it("should reject missing cards array", () => {
      const handler = new DialogCardsHandler();
      const result = handler.validate({ type: "dialogcards", title: "Test" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("cards");
    });

    it("should reject empty cards array", () => {
      const handler = new DialogCardsHandler();
      const result = handler.validate({ type: "dialogcards", cards: [] });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least one");
    });

    it("should reject card without front", () => {
      const handler = new DialogCardsHandler();
      const result = handler.validate({
        type: "dialogcards",
        cards: [{ back: "Back text" }]
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Card 1");
      expect(result.error).toContain("front");
    });

    it("should reject card without back", () => {
      const handler = new DialogCardsHandler();
      const result = handler.validate({
        type: "dialogcards",
        cards: [{ front: "Front text" }]
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Card 1");
      expect(result.error).toContain("back");
    });

    it("should accept valid dialog cards content", () => {
      const handler = new DialogCardsHandler();
      const result = handler.validate({
        type: "dialogcards",
        cards: [
          { front: "Hello", back: "Hola" },
          { front: "Goodbye", back: "Adiós", image: "test.jpg" }
        ]
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Validation error messages quality", () => {
    it("should provide helpful suggestions for missing text", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text" });

      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/text.*field/i);
    });

    it("should provide helpful suggestions for missing image path", () => {
      const handler = new ImageHandler();
      const result = handler.validate({ type: "image", alt: "Test" });

      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/path/i);
    });

    it("should provide helpful suggestions for invalid flashcards", () => {
      const handler = new FlashcardsHandler();
      const result = handler.validate({ type: "flashcards", cards: "invalid" });

      expect(result.error).toBeTruthy();
      expect(result.error).toMatch(/array/i);
    });
  });

  describe("Registry-based validation for book content", () => {
    beforeAll(() => {
      const registry = HandlerRegistry.getInstance();

      // Ensure all handlers are registered
      if (!registry.getHandler("text")) registry.register(new TextHandler());
      if (!registry.getHandler("image")) registry.register(new ImageHandler());
      if (!registry.getHandler("audio")) registry.register(new AudioHandler());
    });

    it("should validate all content items in a book", () => {
      const registry = HandlerRegistry.getInstance();
      const errors: string[] = [];

      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              { type: "text", text: "Valid text" },
              { type: "text", title: "Missing text field" } as any, // Invalid
              { type: "image", path: "/test.jpg", alt: "Test" },
              { type: "image", path: "/test2.jpg" } as any, // Invalid - missing alt
            ]
          }
        ]
      };

      for (let chIdx = 0; chIdx < bookDef.chapters.length; chIdx++) {
        const chapter = bookDef.chapters[chIdx];
        for (let itemIdx = 0; itemIdx < chapter.content.length; itemIdx++) {
          const item = chapter.content[itemIdx];
          const handler = registry.getHandler(item.type);

          if (!handler) {
            errors.push(`Chapter ${chIdx + 1}, Item ${itemIdx + 1}: Unknown content type "${item.type}"`);
            continue;
          }

          const validation = handler.validate(item);
          if (!validation.valid) {
            errors.push(`Chapter ${chIdx + 1}, Item ${itemIdx + 1}: ${validation.error}`);
          }
        }
      }

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain("Chapter 1, Item 2");
      expect(errors[0]).toContain("text");
      expect(errors[1]).toContain("Chapter 1, Item 4");
      expect(errors[1]).toContain("alt");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string in text field", () => {
      const handler = new TextHandler();
      const result = handler.validate({ type: "text", text: "" });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("text");
    });

    it("should handle null values", () => {
      const handler = new ImageHandler();
      const result = handler.validate({ type: "image", path: null, alt: "Test" });

      expect(result.valid).toBe(false);
    });

    it("should handle undefined values", () => {
      const handler = new AudioHandler();
      const result = handler.validate({ type: "audio", path: undefined });

      expect(result.valid).toBe(false);
    });
  });
});
