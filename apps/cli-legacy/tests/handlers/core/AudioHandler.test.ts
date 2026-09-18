import { AudioHandler } from "../../../src/handlers/core/AudioHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../src/compiler/ChapterBuilder";

describe("AudioHandler", () => {
  let handler: AudioHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;

  beforeEach(() => {
    handler = new AudioHandler();

    // Mock ChapterBuilder
    mockChapterBuilder = {
      addAudioPage: jest.fn().mockResolvedValue(undefined as any),
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
    it("should return 'audio' as content type", () => {
      expect(handler.getContentType()).toBe("audio");
    });
  });

  describe("process", () => {
    it("should process local audio file", async () => {
      const item = {
        type: "audio" as const,
        path: "/path/to/audio.mp3",
        title: "Audio Title",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addAudioPage).toHaveBeenCalledWith(
        "Audio Title",
        "/path/to/audio.mp3"
      );
    });

    it("should process audio URL", async () => {
      const item = {
        type: "audio" as const,
        path: "https://example.com/audio.mp3",
        title: "Remote Audio",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addAudioPage).toHaveBeenCalledWith(
        "Remote Audio",
        "https://example.com/audio.mp3"
      );
    });

    it("should handle audio without title", async () => {
      const item = {
        type: "audio" as const,
        path: "/test.mp3",
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addAudioPage).toHaveBeenCalledWith(
        "",
        "/test.mp3"
      );
    });

    it("should log progress in verbose mode", async () => {
      const item = {
        type: "audio" as const,
        path: "/test.mp3",
        title: "Verbose Audio",
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining("Verbose Audio")
      );
    });

    it("should not log in non-verbose mode", async () => {
      mockContext.options.verbose = false;

      const item = {
        type: "audio" as const,
        path: "/test.mp3",
        title: "Silent Audio",
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).not.toHaveBeenCalled();
    });
  });

  describe("validate", () => {
    it("should validate valid audio content", () => {
      const item = {
        type: "audio" as const,
        path: "/test.mp3",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject content without path field", () => {
      const item = {
        type: "audio" as const,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("path");
    });

    it("should reject content with non-string path", () => {
      const item = {
        type: "audio" as const,
        path: 123,
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.Audio library", () => {
      const libraries = handler.getRequiredLibraries();

      expect(libraries).toEqual(["H5P.Audio"]);
    });
  });
});
