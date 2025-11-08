import { CSVToJSONAdapter } from "../../src/compiler/CSVToJSONAdapter";
import { BookDefinition, FlashcardsContent, DialogCardsContent, TextContent } from "../../src/compiler/YamlInputParser";

describe("CSVToJSONAdapter", () => {
  describe("Flashcards CSV conversion", () => {
    it("should convert flashcards CSV to BookDefinition with cards array", () => {
      const csvData = [
        { question: "What is H5P?", answer: "An open-source content framework", tip: "Think about interactivity" },
        { question: "What is Node.js?", answer: "A JavaScript runtime", tip: "" }
      ];

      const result = CSVToJSONAdapter.convertFlashcards(csvData, {
        title: "My Flashcards",
        language: "en",
        description: "Test flashcards"
      });

      expect(result.title).toBe("My Flashcards");
      expect(result.language).toBe("en");
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].title).toBe("My Flashcards");
      expect(result.chapters[0].content).toHaveLength(1);

      const flashcardsContent = result.chapters[0].content[0] as FlashcardsContent;
      expect(flashcardsContent.type).toBe("flashcards");
      expect(flashcardsContent.cards).toHaveLength(2);
      expect(flashcardsContent.cards[0].question).toBe("What is H5P?");
      expect(flashcardsContent.cards[0].answer).toBe("An open-source content framework");
      expect(flashcardsContent.cards[0].tip).toBe("Think about interactivity");
    });

    it("should handle flashcards with image paths", () => {
      const csvData = [
        { question: "Q1", answer: "A1", image: "images/test.jpg" }
      ];

      const result = CSVToJSONAdapter.convertFlashcards(csvData, {
        title: "Test",
        language: "en"
      });

      const flashcardsContent = result.chapters[0].content[0] as FlashcardsContent;
      expect(flashcardsContent.cards[0].image).toBe("images/test.jpg");
    });
  });

  describe("Dialog Cards CSV conversion", () => {
    it("should convert dialog cards CSV to BookDefinition with cards array", () => {
      const csvData = [
        { front: "Hello", back: "Hola", image: "", audio: "" },
        { front: "Goodbye", back: "Adiós", image: "test.jpg", audio: "test.mp3" }
      ];

      const result = CSVToJSONAdapter.convertDialogCards(csvData, {
        title: "Spanish Cards",
        language: "en",
        mode: "repetition"
      });

      expect(result.title).toBe("Spanish Cards");
      expect(result.language).toBe("en");
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].content).toHaveLength(1);

      const dialogContent = result.chapters[0].content[0] as DialogCardsContent;
      expect(dialogContent.type).toBe("dialogcards");
      expect(dialogContent.mode).toBe("repetition");
      expect(dialogContent.cards).toHaveLength(2);
      expect(dialogContent.cards[0].front).toBe("Hello");
      expect(dialogContent.cards[0].back).toBe("Hola");
      expect(dialogContent.cards[1].image).toBe("test.jpg");
      expect(dialogContent.cards[1].audio).toBe("test.mp3");
    });
  });

  describe("Simple book CSV conversion", () => {
    it("should convert text-based CSV rows to individual text pages", () => {
      const csvData = [
        { pageTitle: "Introduction", pageText: "Welcome to the book." },
        { pageTitle: "Chapter 1", pageText: "This is the first chapter." }
      ];

      const result = CSVToJSONAdapter.convertSimpleBook(csvData, {
        title: "My Book",
        language: "en"
      });

      expect(result.title).toBe("My Book");
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].content).toHaveLength(2);

      const firstPage = result.chapters[0].content[0] as TextContent;
      expect(firstPage.type).toBe("text");
      expect(firstPage.title).toBe("Introduction");
      expect(firstPage.text).toBe("Welcome to the book.");

      const secondPage = result.chapters[0].content[1] as TextContent;
      expect(secondPage.type).toBe("text");
      expect(secondPage.title).toBe("Chapter 1");
      expect(secondPage.text).toBe("This is the first chapter.");
    });
  });

  describe("Column header inference", () => {
    it("should infer flashcards from question/answer columns", () => {
      const headers = ["question", "answer", "tip"];
      const contentType = CSVToJSONAdapter.inferContentType(headers);
      expect(contentType).toBe("flashcards");
    });

    it("should infer dialog cards from front/back columns", () => {
      const headers = ["front", "back", "image"];
      const contentType = CSVToJSONAdapter.inferContentType(headers);
      expect(contentType).toBe("dialogcards");
    });

    it("should infer simple book from text-based columns", () => {
      const headers = ["pageTitle", "pageText"];
      const contentType = CSVToJSONAdapter.inferContentType(headers);
      expect(contentType).toBe("text");
    });

    it("should default to text for unknown column patterns", () => {
      const headers = ["unknown", "columns"];
      const contentType = CSVToJSONAdapter.inferContentType(headers);
      expect(contentType).toBe("text");
    });
  });

  describe("Auto-detection conversion", () => {
    it("should auto-detect and convert flashcards CSV", () => {
      const csvData = [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" }
      ];

      const result = CSVToJSONAdapter.convertAuto(csvData, {
        title: "Auto Test",
        language: "en"
      });

      expect(result.chapters[0].content[0].type).toBe("flashcards");
    });

    it("should auto-detect and convert dialog cards CSV", () => {
      const csvData = [
        { front: "F1", back: "B1" },
        { front: "F2", back: "B2" }
      ];

      const result = CSVToJSONAdapter.convertAuto(csvData, {
        title: "Auto Test",
        language: "en"
      });

      expect(result.chapters[0].content[0].type).toBe("dialogcards");
    });
  });
});
