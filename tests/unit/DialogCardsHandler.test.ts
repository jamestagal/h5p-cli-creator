import { DialogCardsHandler } from "../../src/handlers/embedded/DialogCardsHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("DialogCardsHandler", () => {
  let handler: DialogCardsHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;
  let addCustomContentSpy: jest.SpyInstance;

  beforeEach(() => {
    handler = new DialogCardsHandler();

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

  it("should return 'dialogcards' as content type", () => {
    expect(handler.getContentType()).toBe("dialogcards");
  });

  it("should return H5P.Dialogcards as required library", () => {
    const libs = handler.getRequiredLibraries();
    expect(libs).toEqual(["H5P.Dialogcards"]);  // lowercase 'c' - correct H5P library name
  });

  it("should validate content with cards array", () => {
    const validItem = {
      type: "dialogcards" as const,
      cards: [
        { front: "Hello", back: "Hola" },
        { front: "Goodbye", back: "Adiós" },
      ],
    };

    const result = handler.validate(validItem);
    expect(result.valid).toBe(true);
  });

  it("should fail validation when cards array is missing", () => {
    const invalidItem = {
      type: "dialogcards" as const,
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cards");
  });

  it("should fail validation when cards is not an array", () => {
    const invalidItem = {
      type: "dialogcards" as const,
      cards: "not an array",
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("array");
  });

  it("should fail validation when cards array is empty", () => {
    const invalidItem = {
      type: "dialogcards" as const,
      cards: [],
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least one card");
  });

  it("should fail validation when card is missing front text", () => {
    const invalidItem = {
      type: "dialogcards" as const,
      cards: [{ back: "Hola" }],
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("front");
  });

  it("should fail validation when card is missing back text", () => {
    const invalidItem = {
      type: "dialogcards" as const,
      cards: [{ front: "Hello" }],
    };

    const result = handler.validate(invalidItem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("back");
  });

  it("should process dialog cards content and generate H5P structure", async () => {
    const item = {
      type: "dialogcards" as const,
      title: "Spanish Vocabulary",
      mode: "repetition" as const,
      cards: [
        { front: "Hello", back: "Hola" },
        { front: "Goodbye", back: "Adiós" },
      ],
    };

    await handler.process(mockContext, item);

    expect(addCustomContentSpy).toHaveBeenCalledTimes(1);
    const dialogCardsContent = addCustomContentSpy.mock.calls[0][0];

    // Verify structure
    expect(dialogCardsContent.library).toBe("H5P.Dialogcards 1.9");  // lowercase 'c' - correct H5P library name
    expect(dialogCardsContent.params.dialogs).toHaveLength(2);
    expect(dialogCardsContent.params.dialogs[0].text).toBe("<p>Hello</p>");  // HTML wrapped
    expect(dialogCardsContent.params.dialogs[0].answer).toBe("<p>Hola</p>");  // HTML wrapped
    expect(dialogCardsContent.params.mode).toBe("repetition");
  });

  it("should handle dialog cards with media files", async () => {
    const item = {
      type: "dialogcards" as const,
      cards: [
        {
          front: "Listen",
          back: "Translation",
          image: "/test/path/image.jpg",
          audio: "/test/path/audio.mp3",
        },
      ],
    };

    // Media handling mocks would go here
    await handler.process(mockContext, item);

    expect(addCustomContentSpy).toHaveBeenCalled();
    // Full media handling will be tested in integration tests
  });

  it("should default to normal mode when not specified", async () => {
    const item = {
      type: "dialogcards" as const,
      cards: [{ front: "Hello", back: "Hola" }],
    };

    await handler.process(mockContext, item);

    const dialogCardsContent = addCustomContentSpy.mock.calls[0][0];
    expect(dialogCardsContent.params.mode).toBe("normal");  // Default is "normal" mode (matching H5P.com behavior)
  });
});
