import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { TextHandler } from "../../src/handlers/core/TextHandler";
import { ImageHandler } from "../../src/handlers/core/ImageHandler";
import { AudioHandler } from "../../src/handlers/core/AudioHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { QuizGenerator } from "../../src/ai/QuizGenerator";

/**
 * Integration tests for handler-based content processing
 * Tests Task Group 2.1: Switch Statement Replacement
 */
describe("Handler-Based Content Processing", () => {
  let registry: HandlerRegistry;
  let mockChapterBuilder: any;
  let mockContext: HandlerContext;

  beforeEach(() => {
    // Reset singleton registry for each test
    (HandlerRegistry as any).instance = undefined;
    registry = HandlerRegistry.getInstance();

    // Register core handlers
    registry.register(new TextHandler());
    registry.register(new ImageHandler());
    registry.register(new AudioHandler());

    // Create mock ChapterBuilder
    mockChapterBuilder = {
      addTextPage: jest.fn(),
      addImagePage: jest.fn().mockResolvedValue(undefined),
      addAudioPage: jest.fn().mockResolvedValue(undefined),
      addQuizPage: jest.fn()
    };

    // Create mock HandlerContext
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      libraryRegistry: {} as LibraryRegistry,
      quizGenerator: {} as QuizGenerator,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      mediaFiles: [],
      basePath: "/test/path",
      options: { verbose: false }
    };
  });

  test("should lookup handler by content type", () => {
    const textHandler = registry.getHandler("text");
    const imageHandler = registry.getHandler("image");
    const audioHandler = registry.getHandler("audio");

    expect(textHandler).toBeDefined();
    expect(textHandler?.getContentType()).toBe("text");
    expect(imageHandler).toBeDefined();
    expect(imageHandler?.getContentType()).toBe("image");
    expect(audioHandler).toBeDefined();
    expect(audioHandler?.getContentType()).toBe("audio");
  });

  test("should process multiple content types in sequence", async () => {
    const contentItems = [
      { type: "text", text: "Hello world", title: "Intro" },
      { type: "image", path: "/test/image.jpg", alt: "Test image", title: "Figure 1" },
      { type: "audio", path: "/test/audio.mp3", title: "Audio 1" }
    ];

    for (const item of contentItems) {
      const handler = registry.getHandler(item.type);
      expect(handler).toBeDefined();

      const validation = handler!.validate(item);
      expect(validation.valid).toBe(true);

      await handler!.process(mockContext, item);
    }

    expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith("Intro", "Hello world");
    expect(mockChapterBuilder.addImagePage).toHaveBeenCalledWith("Figure 1", "/test/image.jpg", "Test image");
    expect(mockChapterBuilder.addAudioPage).toHaveBeenCalledWith("Audio 1", "/test/audio.mp3");
  });

  test("should handle unknown content type gracefully", () => {
    const unknownHandler = registry.getHandler("unknown-type");
    expect(unknownHandler).toBeUndefined();
  });

  test("should handle validation failure", () => {
    const textHandler = registry.getHandler("text");
    expect(textHandler).toBeDefined();

    // Missing required 'text' field
    const invalidItem = { type: "text", title: "Bad" };
    const validation = textHandler!.validate(invalidItem);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("text");
  });

  test("should process text content with verbose logging", async () => {
    mockContext.options.verbose = true;
    const textHandler = registry.getHandler("text");

    const item = { type: "text", text: "Test content", title: "Test Title" };
    await textHandler!.process(mockContext, item);

    expect(mockContext.logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Adding text page")
    );
    expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith("Test Title", "Test content");
  });

  test("should validate all content types correctly", () => {
    const validItems = [
      { type: "text", text: "Valid text" },
      { type: "image", path: "/path/to/image.jpg", alt: "Alt text" },
      { type: "audio", path: "/path/to/audio.mp3" }
    ];

    validItems.forEach(item => {
      const handler = registry.getHandler(item.type);
      expect(handler).toBeDefined();

      const validation = handler!.validate(item);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  test("should handle image validation failures", () => {
    const imageHandler = registry.getHandler("image");
    expect(imageHandler).toBeDefined();

    // Missing path
    const missingPath = { type: "image", alt: "Alt text" };
    let validation = imageHandler!.validate(missingPath);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("path");

    // Missing alt
    const missingAlt = { type: "image", path: "/test/image.jpg" };
    validation = imageHandler!.validate(missingAlt);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("alt");
  });

  test("should handle audio validation failures", () => {
    const audioHandler = registry.getHandler("audio");
    expect(audioHandler).toBeDefined();

    // Missing path
    const missingPath = { type: "audio", title: "Audio" };
    const validation = audioHandler!.validate(missingPath);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("path");
  });
});
