import { ImageHandler } from "../../../src/handlers/core/ImageHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../src/compiler/ChapterBuilder";

describe("ImageHandler", () => {
  let handler: ImageHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;

  beforeEach(() => {
    handler = new ImageHandler();

    // Mock ChapterBuilder
    mockChapterBuilder = {
      addImagePage: jest.fn().mockResolvedValue(undefined as any),
    } as any;

    // Mock HandlerContext
    mockContext = {
      chapterBuilder: mockChapterBuilder,
      basePath: "/test/base/path",
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
    it("should return 'image' as content type", () => {
      expect(handler.getContentType()).toBe("image");
    });
  });

  describe("process", () => {
    it("should process local file path", async () => {
      const item = {
        type: "image",
        path: "/path/to/image.jpg",
        alt: "Test Image",
        title: "Image Title",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addImagePage).toHaveBeenCalledWith(
        "Image Title",
        "/path/to/image.jpg",
        "Test Image"
      );
    });

    it("should process URL", async () => {
      const item = {
        type: "image",
        path: "https://example.com/image.jpg",
        alt: "Remote Image",
        title: "Remote",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addImagePage).toHaveBeenCalledWith(
        "Remote",
        "https://example.com/image.jpg",
        "Remote Image"
      );
    });

    it("should handle image without title", async () => {
      const item = {
        type: "image",
        path: "/test.jpg",
        alt: "No title image",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addImagePage).toHaveBeenCalledWith(
        "",
        "/test.jpg",
        "No title image"
      );
    });

    it("should log progress in verbose mode", async () => {
      const item = {
        type: "image",
        path: "/test.jpg",
        alt: "Test",
        title: "Verbose Image",
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("Verbose Image")
      );
    });
  });

  describe("validate", () => {
    it("should validate valid image content", () => {
      const item = {
        type: "image",
        path: "/test.jpg",
        alt: "Test alt text",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject content without path field", () => {
      const item = {
        type: "image",
        alt: "Missing path",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("path");
    });

    it("should reject content without alt field", () => {
      const item = {
        type: "image",
        path: "/test.jpg",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("alt");
    });

    it("should reject content with non-string fields", () => {
      const item = {
        type: "image",
        path: 123,
        alt: "Test",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.Image library", () => {
      const libraries = handler.getRequiredLibraries();

      expect(libraries).toEqual(["H5P.Image"]);
    });
  });
});
