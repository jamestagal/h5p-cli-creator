import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { TextHandler } from "../../src/handlers/core/TextHandler";
import { ImageHandler } from "../../src/handlers/core/ImageHandler";
import { AudioHandler } from "../../src/handlers/core/AudioHandler";
import { AITextHandler } from "../../src/handlers/core/AITextHandler";
import { QuizHandler } from "../../src/handlers/ai/QuizHandler";
import { BookDefinition } from "../../src/compiler/YamlInputParser";

/**
 * Integration tests for dynamic library resolution
 * Tests Task Group 2.2: Dynamic Library Resolution
 */
describe("Dynamic Library Resolution", () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    // Reset singleton registry for each test
    (HandlerRegistry as any).instance = undefined;
    registry = HandlerRegistry.getInstance();

    // Register all handlers
    registry.register(new TextHandler());
    registry.register(new ImageHandler());
    registry.register(new AudioHandler());
    registry.register(new AITextHandler());
    registry.register(new QuizHandler());
  });

  test("should scan all content types in book and collect libraries", () => {
    const bookDef: BookDefinition = {
      title: "Test Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "text", text: "Hello" },
            { type: "image", path: "/test.jpg", alt: "Test" }
          ]
        },
        {
          title: "Chapter 2",
          content: [
            { type: "audio", path: "/test.mp3" },
            { type: "ai-text", prompt: "Generate content" }
          ]
        }
      ]
    };

    const libraries = registry.getRequiredLibrariesForBook(bookDef);

    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries).toContain("H5P.AdvancedText");
    expect(libraries).toContain("H5P.Image");
    expect(libraries).toContain("H5P.Audio");
    expect(libraries.length).toBeGreaterThan(0);
  });

  test("should deduplicate libraries from multiple content items", () => {
    const bookDef: BookDefinition = {
      title: "Test Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "text", text: "First text" },
            { type: "text", text: "Second text" },
            { type: "text", text: "Third text" }
          ]
        }
      ]
    };

    const libraries = registry.getRequiredLibrariesForBook(bookDef);

    // Should only have H5P.AdvancedText once, plus H5P.InteractiveBook
    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries).toContain("H5P.AdvancedText");
    expect(libraries.length).toBe(2);
  });

  test("should include H5P.MultiChoice for quiz content", () => {
    const bookDef: BookDefinition = {
      title: "Quiz Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "ai-quiz", sourceText: "Test content for quiz", questionCount: 5 }
          ]
        }
      ]
    };

    const libraries = registry.getRequiredLibrariesForBook(bookDef);

    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries).toContain("H5P.MultiChoice");
  });

  test("should handle complex book with multiple content types", () => {
    const bookDef: BookDefinition = {
      title: "Complex Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "text", text: "Introduction" },
            { type: "image", path: "/intro.jpg", alt: "Intro" },
            { type: "ai-text", prompt: "Explain this topic" }
          ]
        },
        {
          title: "Chapter 2",
          content: [
            { type: "audio", path: "/lesson.mp3" },
            { type: "ai-quiz", sourceText: "Quiz source", questionCount: 3 }
          ]
        }
      ]
    };

    const libraries = registry.getRequiredLibrariesForBook(bookDef);

    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries).toContain("H5P.AdvancedText");
    expect(libraries).toContain("H5P.Image");
    expect(libraries).toContain("H5P.Audio");
    expect(libraries).toContain("H5P.MultiChoice");
    expect(libraries.length).toBe(5);
  });

  test("should always include base InteractiveBook library", () => {
    const emptyBook: BookDefinition = {
      title: "Empty Book",
      language: "en",
      chapters: []
    };

    const libraries = registry.getRequiredLibrariesForBook(emptyBook);

    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries.length).toBeGreaterThanOrEqual(1);
  });

  test("should handle unknown content types gracefully", () => {
    const bookDef: BookDefinition = {
      title: "Test Book",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [
            { type: "text", text: "Valid content" },
            { type: "unknown-type" as any, data: "Invalid" }
          ]
        }
      ]
    };

    const libraries = registry.getRequiredLibrariesForBook(bookDef);

    // Should include libraries for valid content only
    expect(libraries).toContain("H5P.InteractiveBook");
    expect(libraries).toContain("H5P.AdvancedText");
  });
});
