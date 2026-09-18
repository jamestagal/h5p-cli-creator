import { TrueFalseHandler } from "../../../../src/handlers/embedded/TrueFalseHandler";
import { HandlerContext } from "../../../../src/handlers/HandlerContext";
import * as path from "path";

// Mock fs module for video processing
jest.mock("fs", () => ({
  readFileSync: jest.fn((filePath: string) => {
    // Return a fake buffer for video files
    if (filePath.includes("video") || filePath.includes(".mp4")) {
      return Buffer.from("fake-video-content");
    }
    // For real image/audio files, use the actual fs
    const actualFs = jest.requireActual("fs");
    return actualFs.readFileSync(filePath);
  })
}));

// Mock mime-types for video
jest.mock("mime-types", () => ({
  lookup: jest.fn((filePath: string) => {
    const actualMime = jest.requireActual("mime-types");
    if (filePath.includes(".mp4")) {
      return "video/mp4";
    }
    return actualMime.lookup(filePath);
  })
}));

describe("TrueFalseHandler - Media Handling", () => {
  let handler: TrueFalseHandler;

  beforeEach(() => {
    handler = new TrueFalseHandler();
  });

  describe("validate - media validation", () => {
    it("should accept valid media object with image type", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "/path/to/image.jpg",
          type: "image",
          alt: "Image of Earth",
          disableZooming: true
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid media object without type (will be detected)", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "/path/to/image.jpg"
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid media.type enum", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "/path/to/file.txt",
          type: "document"
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("media 'type' must be one of: image, video, audio");
    });

    it("should reject media without path", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          type: "image",
          alt: "Earth"
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("media object requires 'path' field");
    });

    it("should reject non-string media.alt", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "/path/to/image.jpg",
          alt: 123
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("media 'alt' must be a string");
    });

    it("should reject non-boolean media.disableZooming", () => {
      const item = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "/path/to/image.jpg",
          disableZooming: "true"
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("media 'disableZooming' must be a boolean");
    });
  });

  describe("process - media handling", () => {
    let mockContext: HandlerContext;
    let mockChapterBuilder: any;
    let mediaFilesArray: any[];

    beforeEach(() => {
      mediaFilesArray = [];

      mockChapterBuilder = {
        addCustomContent: jest.fn(),
        // Mock mediaFilesArray property that handlers can push to
        get mediaFilesArray() {
          return mediaFilesArray;
        }
      };

      mockContext = {
        chapterBuilder: mockChapterBuilder,
        logger: {
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        },
        options: {
          verbose: false
        },
        basePath: path.resolve(__dirname, "../../../"),
        libraryRegistry: {} as any,
        quizGenerator: {} as any,
        aiPromptBuilder: {} as any,
        mediaFiles: []
      };
    });

    it("should process image media correctly", async () => {
      const item = {
        type: "truefalse" as const,
        title: "Geography Question",
        question: "The Earth is round",
        correct: true,
        media: {
          path: "images/test-image.jpg",
          type: "image" as const,
          alt: "Photo of Earth"
        }
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify media structure exists
      expect(h5pContent.params.media).toBeDefined();
      expect(h5pContent.params.media.type).toBeDefined();
      expect(h5pContent.params.media.type.library).toBe("H5P.Image 1.1");
      expect(h5pContent.params.media.type.params).toBeDefined();
      expect(h5pContent.params.media.type.params.alt).toBe("Photo of Earth");
      expect(h5pContent.params.media.type.subContentId).toBeDefined();

      // Verify disableImageZooming is NOT included by default for images
      expect(h5pContent.params.media.disableImageZooming).toBeUndefined();
    });

    it("should include disableImageZooming only for images when specified", async () => {
      const item = {
        type: "truefalse" as const,
        question: "The Earth is round",
        correct: true,
        media: {
          path: "images/test-image.jpg",
          type: "image" as const,
          disableZooming: true
        }
      };

      await handler.process(mockContext, item);

      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify disableImageZooming is included when specified
      expect(h5pContent.params.media.disableImageZooming).toBe(true);
    });

    it("should process video media correctly", async () => {
      const item = {
        type: "truefalse" as const,
        question: "The Earth rotates",
        correct: true,
        media: {
          path: "videos/earth-rotation.mp4",
          type: "video" as const
        }
      };

      await handler.process(mockContext, item);

      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify media structure for video
      expect(h5pContent.params.media).toBeDefined();
      expect(h5pContent.params.media.type).toBeDefined();
      expect(h5pContent.params.media.type.library).toBe("H5P.Video 1.6");
      expect(h5pContent.params.media.type.params).toBeDefined();
      expect(h5pContent.params.media.type.subContentId).toBeDefined();

      // Verify disableImageZooming is NOT included for videos
      expect(h5pContent.params.media.disableImageZooming).toBeUndefined();
    });

    it("should process audio media correctly", async () => {
      const item = {
        type: "truefalse" as const,
        question: "Sound travels through air",
        correct: true,
        media: {
          path: "audios/test-audio.mp3",
          type: "audio" as const
        }
      };

      await handler.process(mockContext, item);

      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify media structure for audio
      expect(h5pContent.params.media).toBeDefined();
      expect(h5pContent.params.media.type).toBeDefined();
      expect(h5pContent.params.media.type.library).toBe("H5P.Audio 1.5");
      expect(h5pContent.params.media.type.params).toBeDefined();
      expect(h5pContent.params.media.type.subContentId).toBeDefined();

      // Verify disableImageZooming is NOT included for audio
      expect(h5pContent.params.media.disableImageZooming).toBeUndefined();
    });

    it("should detect media type from file extension when type not provided", async () => {
      const item = {
        type: "truefalse" as const,
        question: "Images can be JPG format",
        correct: true,
        media: {
          path: "images/test-image.jpg"
          // type not specified - should be detected
        }
      };

      await handler.process(mockContext, item);

      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify image type was detected
      expect(h5pContent.params.media).toBeDefined();
      expect(h5pContent.params.media.type.library).toBe("H5P.Image 1.1");
    });

    it("should work without media when not provided", async () => {
      const item = {
        type: "truefalse" as const,
        question: "The Earth is round",
        correct: true
        // no media
      };

      await handler.process(mockContext, item);

      const h5pContent = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify no media in params
      expect(h5pContent.params.media).toBeUndefined();
    });
  });
});
