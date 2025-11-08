import { TextHandler } from "../../../src/handlers/core/TextHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../src/compiler/ChapterBuilder";

describe("TextHandler", () => {
  let handler: TextHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;

  beforeEach(() => {
    handler = new TextHandler();

    // Mock ChapterBuilder
    mockChapterBuilder = {
      addTextPage: jest.fn().mockReturnThis(),
    } as any;

    // Mock HandlerContext
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      options: {
        verbose: true,
      },
    } as any;
  });

  describe("getContentType", () => {
    it("should return 'text' as content type", () => {
      expect(handler.getContentType()).toBe("text");
    });
  });

  describe("process", () => {
    it("should process valid text content", async () => {
      const item = {
        type: "text" as const,
        title: "Test Page",
        text: "This is test content",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
        "Test Page",
        "This is test content"
      );
    });

    it("should handle content without title", async () => {
      const item = {
        type: "text" as const,
        text: "Content without title",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
        "",
        "Content without title"
      );
    });

    it("should log progress in verbose mode", async () => {
      const item = {
        type: "text" as const,
        title: "Verbose Test",
        text: "Testing logging",
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("Verbose Test")
      );
    });

    it("should not log in non-verbose mode", async () => {
      mockContext.options.verbose = false;

      const item = {
        type: "text" as const,
        title: "Silent Test",
        text: "No logging",
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).not.toHaveBeenCalled();
    });
  });

  describe("validate", () => {
    it("should validate valid text content", () => {
      const item = {
        type: "text" as const,
        text: "Valid content",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject content without text field", () => {
      const item = {
        type: "text" as const,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("text");
    });

    it("should reject content with non-string text", () => {
      const item = {
        type: "text" as const,
        text: 123,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.AdvancedText library", () => {
      const libraries = handler.getRequiredLibraries();

      expect(libraries).toEqual(["H5P.AdvancedText"]);
    });
  });
});
