import { EssayHandler } from "../../../src/handlers/embedded/EssayHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../src/compiler/ChapterBuilder";

describe("EssayHandler", () => {
  let handler: EssayHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<ChapterBuilder>;

  beforeEach(() => {
    handler = new EssayHandler();

    // Mock ChapterBuilder
    mockChapterBuilder = {
      addCustomContent: jest.fn().mockReturnThis(),
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
      basePath: "/test/path",
    } as any;
  });

  describe("getContentType", () => {
    it("should return 'essay' as content type", () => {
      expect(handler.getContentType()).toBe("essay");
    });
  });

  describe("validate", () => {
    it("should validate content with taskDescription and keywords array", () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay about photosynthesis",
        keywords: [
          { keyword: "chlorophyll" },
          { keyword: "sunlight" },
        ],
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject content missing taskDescription field", () => {
      const item = {
        type: "essay" as const,
        keywords: [{ keyword: "test" }],
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("taskDescription");
    });

    it("should reject content missing keywords array", () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("keywords");
    });

    it("should validate keyword alternatives as array of strings", () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "adventure",
            alternatives: ["quest", "journey"],
          },
        ],
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(true);
    });

    it("should reject invalid keyword alternatives (not an array)", () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "adventure",
            alternatives: "quest" as any, // Invalid: should be array
          },
        ],
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("alternatives");
      expect(result.error).toContain("array");
    });

    it("should validate maximumLength > minimumLength cross-field check", () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [{ keyword: "test" }],
        behaviour: {
          minimumLength: 100,
          maximumLength: 50, // Invalid: less than minimum
        },
      };

      const result = handler.validate(item);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximumLength");
      expect(result.error).toContain("minimumLength");
    });

    it("should validate points and occurrences are positive numbers", () => {
      const validItem = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            points: 5,
            occurrences: 2,
          },
        ],
      };

      expect(handler.validate(validItem).valid).toBe(true);

      // Test negative points
      const invalidPoints = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            points: -5,
          },
        ],
      };

      const pointsResult = handler.validate(invalidPoints);
      expect(pointsResult.valid).toBe(false);
      expect(pointsResult.error).toContain("points");

      // Test negative occurrences
      const invalidOccurrences = {
        type: "essay" as const,
        taskDescription: "Write an essay",
        keywords: [
          {
            keyword: "test",
            occurrences: -1,
          },
        ],
      };

      const occurrencesResult = handler.validate(invalidOccurrences);
      expect(occurrencesResult.valid).toBe(false);
      expect(occurrencesResult.error).toContain("occurrences");
    });
  });

  describe("process", () => {
    it("should preserve wildcard * characters in keywords", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay about photography",
        keywords: [
          { keyword: "*photo*" }, // Wildcard pattern
        ],
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify wildcard is preserved in the H5P structure
      expect(JSON.stringify(callArg)).toContain("*photo*");
      // Ensure it's NOT escaped
      expect(JSON.stringify(callArg)).not.toContain("\\*photo\\*");
    });

    it("should preserve /regex/ patterns in keywords", async () => {
      const item = {
        type: "essay" as const,
        taskDescription: "Write an essay about patterns",
        keywords: [
          { keyword: "/^photo.*/" }, // Regex pattern
        ],
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
      const callArg = mockChapterBuilder.addCustomContent.mock.calls[0][0];

      // Verify regex pattern is preserved
      expect(JSON.stringify(callArg)).toContain("/^photo.*/");
      // Ensure it's NOT modified
      expect(JSON.stringify(callArg)).not.toContain("\\/^photo.*\\/");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.Essay library", () => {
      const libraries = handler.getRequiredLibraries();

      expect(libraries).toEqual(["H5P.Essay"]);
    });
  });
});
