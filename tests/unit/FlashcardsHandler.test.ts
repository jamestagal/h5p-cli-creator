import { FlashcardsHandler } from "../../src/handlers/embedded/FlashcardsHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("FlashcardsHandler", () => {
  let handler: FlashcardsHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;
  let addCustomContentSpy: jest.SpyInstance;

  beforeEach(() => {
    handler = new FlashcardsHandler();

    addCustomContentSpy = jest.fn();
    mockChapterBuilder = {
      addCustomContent: addCustomContentSpy,
    } as any;

    mockContext = {
      chapterBuilder: mockChapterBuilder,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      options: { verbose: true },
      basePath: "/test/path",
      mediaFiles: [],
    } as any;
  });

  it("should return 'flashcards' as content type", () => {
    expect(handler.getContentType()).toBe("flashcards");
  });

  it("should return H5P.Flashcards as required library", () => {
    const libs = handler.getRequiredLibraries();
    expect(libs).toEqual(["H5P.Flashcards"]);
  });

  it("should validate content with cards array", () => {
    const validItem = {
      type: "flashcards" as const,
      cards: [
        { question: "What is 2+2?", answer: "4" },
        { question: "What is 3+3?", answer: "6" },
      ],
    };

    const result = handler.validate(validItem);
    expect(result.valid).toBe(true);
  });

  it("should fail validation when cards array is missing", () => {
    const invalidItem = {
      type: "flashcards" as const,
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cards");
  });

  it("should fail validation when cards is not an array", () => {
    const invalidItem = {
      type: "flashcards" as const,
      cards: "not an array",
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("array");
  });

  it("should fail validation when cards array is empty", () => {
    const invalidItem = {
      type: "flashcards" as const,
      cards: [],
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least one card");
  });

  it("should process flashcard content and generate H5P structure", async () => {
    const item = {
      type: "flashcards" as const,
      title: "Math Quiz",
      description: "Practice basic math",
      cards: [
        { question: "What is 2+2?", answer: "4" },
        { question: "What is 3+3?", answer: "6", tip: "Think of 3 groups of 2" },
      ],
    };

    await handler.process(mockContext, item);

    expect(addCustomContentSpy).toHaveBeenCalledTimes(1);
    const flashcardsContent = addCustomContentSpy.mock.calls[0][0];

    // Verify structure
    expect(flashcardsContent.library).toBe("H5P.Flashcards 1.5");
    expect(flashcardsContent.params.cards).toHaveLength(2);
    expect(flashcardsContent.params.cards[0].text).toBe("What is 2+2?");
    expect(flashcardsContent.params.cards[0].answer).toBe("4");
    expect(flashcardsContent.params.cards[1].tip).toBe("Think of 3 groups of 2");
  });

  it("should handle flashcards with media files", async () => {
    const item = {
      type: "flashcards" as const,
      cards: [
        {
          question: "What is this animal?",
          answer: "Cat",
          image: "/test/path/cat.jpg",
        },
      ],
    };

    // Mock H5pImage.fromLocalFile to avoid actual file I/O
    jest.mock("../../src/models/h5p-image", () => ({
      H5pImage: {
        fromLocalFile: jest.fn().mockResolvedValue({
          extension: ".jpg",
          buffer: Buffer.from("fake-image"),
          image: { path: "", mime: "image/jpeg", width: 100, height: 100 },
        }),
      },
    }));

    await handler.process(mockContext, item);

    expect(addCustomContentSpy).toHaveBeenCalled();
    // Media handling will be tested in integration tests
  });
});
