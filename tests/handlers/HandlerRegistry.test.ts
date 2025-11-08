import { HandlerRegistry } from "../../src/handlers/HandlerRegistry";
import { ContentHandler } from "../../src/handlers/ContentHandler";
import { BookDefinition } from "../../src/compiler/YamlInputParser";

describe("HandlerRegistry", () => {
  let registry: HandlerRegistry;
  let mockHandler: ContentHandler;

  beforeEach(() => {
    // Get fresh instance for each test (singleton reset)
    registry = HandlerRegistry.getInstance();

    // Clear any registered handlers from previous tests
    // @ts-ignore - accessing private property for testing
    registry["handlers"].clear();

    // Create mock handler
    mockHandler = {
      getContentType: jest.fn().mockReturnValue("test-type"),
      process: jest.fn().mockResolvedValue(undefined),
      validate: jest.fn().mockReturnValue({ valid: true }),
      getRequiredLibraries: jest.fn().mockReturnValue(["H5P.TestLibrary"]),
    };
  });

  describe("Singleton Pattern", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = HandlerRegistry.getInstance();
      const instance2 = HandlerRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Handler Registration", () => {
    it("should register handler successfully", () => {
      expect(() => registry.register(mockHandler)).not.toThrow();
      const retrieved = registry.getHandler("test-type");
      expect(retrieved).toBe(mockHandler);
    });

    it("should prevent duplicate handler registration", () => {
      registry.register(mockHandler);
      expect(() => registry.register(mockHandler)).toThrow(
        "Handler for type 'test-type' already registered"
      );
    });

    it("should retrieve handler by content type", () => {
      registry.register(mockHandler);
      const handler = registry.getHandler("test-type");
      expect(handler).toBe(mockHandler);
    });

    it("should return undefined for unknown content type", () => {
      const handler = registry.getHandler("unknown-type");
      expect(handler).toBeUndefined();
    });
  });

  describe("getAllHandlers", () => {
    it("should return all registered handlers", () => {
      const mockHandler2: ContentHandler = {
        getContentType: jest.fn().mockReturnValue("another-type"),
        process: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockReturnValue({ valid: true }),
        getRequiredLibraries: jest.fn().mockReturnValue(["H5P.AnotherLibrary"]),
      };

      registry.register(mockHandler);
      registry.register(mockHandler2);

      const handlers = registry.getAllHandlers();
      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(mockHandler);
      expect(handlers).toContain(mockHandler2);
    });
  });

  describe("getRequiredLibrariesForBook", () => {
    it("should scan all content items and collect libraries", () => {
      const textHandler: ContentHandler = {
        getContentType: jest.fn().mockReturnValue("text"),
        process: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockReturnValue({ valid: true }),
        getRequiredLibraries: jest.fn().mockReturnValue(["H5P.AdvancedText"]),
      };

      const imageHandler: ContentHandler = {
        getContentType: jest.fn().mockReturnValue("image"),
        process: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockReturnValue({ valid: true }),
        getRequiredLibraries: jest.fn().mockReturnValue(["H5P.Image"]),
      };

      registry.register(textHandler);
      registry.register(imageHandler);

      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              { type: "text", text: "Hello" },
              { type: "image", path: "/test.jpg", alt: "Test" },
            ],
          },
        ],
      };

      const libraries = registry.getRequiredLibrariesForBook(bookDef);

      // Should include base Interactive Book library
      expect(libraries).toContain("H5P.InteractiveBook");
      // Should include handler libraries
      expect(libraries).toContain("H5P.AdvancedText");
      expect(libraries).toContain("H5P.Image");
    });

    it("should always include H5P.InteractiveBook library", () => {
      const bookDef: BookDefinition = {
        title: "Empty Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [],
          },
        ],
      };

      const libraries = registry.getRequiredLibrariesForBook(bookDef);
      expect(libraries).toContain("H5P.InteractiveBook");
    });

    it("should deduplicate libraries", () => {
      const textHandler: ContentHandler = {
        getContentType: jest.fn().mockReturnValue("text"),
        process: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockReturnValue({ valid: true }),
        getRequiredLibraries: jest.fn().mockReturnValue(["H5P.AdvancedText"]),
      };

      registry.register(textHandler);

      const bookDef: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: [
          {
            title: "Chapter 1",
            content: [
              { type: "text", text: "First" },
              { type: "text", text: "Second" },
            ],
          },
        ],
      };

      const libraries = registry.getRequiredLibrariesForBook(bookDef);

      // Should only appear once despite multiple text items
      const textLibCount = libraries.filter(lib => lib === "H5P.AdvancedText").length;
      expect(textLibCount).toBe(1);
    });
  });
});
