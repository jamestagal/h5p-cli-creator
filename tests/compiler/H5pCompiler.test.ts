import { H5pCompiler } from "../../src/compiler/H5pCompiler";
import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { BookDefinition } from "../../src/compiler/YamlInputParser";
import { TextHandler } from "../../src/handlers/core/TextHandler";

describe("H5pCompiler", () => {
  let compiler: H5pCompiler;
  let handlerRegistry: HandlerRegistry;
  let libraryRegistry: LibraryRegistry;
  let quizGenerator: QuizGenerator;

  beforeEach(() => {
    // Set environment variable to allow QuizGenerator initialization
    process.env.GOOGLE_API_KEY = "test-key";

    // Reset singleton before each test
    (HandlerRegistry as any).instance = undefined;
    handlerRegistry = HandlerRegistry.getInstance();

    // Register TextHandler for basic tests
    handlerRegistry.register(new TextHandler());

    libraryRegistry = new LibraryRegistry();
    quizGenerator = new QuizGenerator();
    compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
  });

  describe("compile()", () => {
    it("should compile a valid BookDefinition to Buffer", async () => {
      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Introduction",
                text: "This is test content"
              }
            ]
          }
        ]
      };

      const result = await compiler.compile(bookDef);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    }, 30000);

    it("should throw error for unknown content type", async () => {
      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "unknown-type",
                title: "Invalid"
              } as any
            ]
          }
        ]
      };

      await expect(compiler.compile(bookDef)).rejects.toThrow("No handler registered for content type");
    });

    it("should throw error for invalid content that fails validation", async () => {
      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Missing text field"
                // Missing required 'text' field
              } as any
            ]
          }
        ]
      };

      await expect(compiler.compile(bookDef)).rejects.toThrow("Validation failed");
    });

    it("should handle multiple chapters with different content types", async () => {
      const bookDef: BookDefinition = {
        title: "Multi-Chapter Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Intro",
                text: "Introduction text"
              }
            ]
          },
          {
            title: "Chapter 2",
            content: [
              {
                type: "text",
                title: "Content",
                text: "More content here"
              }
            ]
          }
        ]
      };

      const result = await compiler.compile(bookDef);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    }, 30000);

    it("should pass compiler options to handler context", async () => {
      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Test",
                text: "Test content"
              }
            ]
          }
        ]
      };

      const options = {
        verbose: true,
        aiProvider: "gemini" as const,
        basePath: "/test/path"
      };

      const result = await compiler.compile(bookDef, options);

      expect(result).toBeInstanceOf(Buffer);
    }, 30000);

    it("should fetch required libraries based on content types", async () => {
      const fetchLibrarySpy = jest.spyOn(libraryRegistry, "fetchLibrary");

      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Test",
                text: "Test content"
              }
            ]
          }
        ]
      };

      await compiler.compile(bookDef);

      expect(fetchLibrarySpy).toHaveBeenCalled();
    }, 30000);

    it("should generate valid .h5p package structure", async () => {
      const bookDef: BookDefinition = {
        title: "Package Structure Test",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              {
                type: "text",
                title: "Test",
                text: "Content"
              }
            ]
          }
        ]
      };

      const result = await compiler.compile(bookDef);

      // Check that result is a valid ZIP buffer (starts with PK signature)
      expect(result[0]).toBe(0x50); // 'P'
      expect(result[1]).toBe(0x4B); // 'K'
    }, 30000);
  });
});
