import {
  AIConfiguration,
  ReadingLevel,
  Tone,
  OutputStyle
} from "../../src/compiler/types";
import {
  BookDefinition,
  ChapterDefinition,
  AITextContent,
  AIQuizContent
} from "../../src/compiler/YamlInputParser";
import { HandlerContext } from "../../src/handlers/HandlerContext";

/**
 * Unit tests for AIConfiguration type system
 * Tests Task Group 5.1: Core Types and Interfaces
 */
describe("AIConfiguration Type System", () => {
  describe("ReadingLevel type constraint enforcement", () => {
    test("should accept valid reading levels", () => {
      const validLevels: ReadingLevel[] = [
        "elementary",
        "grade-6",
        "grade-9",
        "high-school",
        "college",
        "professional",
        "esl-beginner",
        "esl-intermediate"
      ];

      // This test verifies TypeScript compilation allows all 8 reading levels
      expect(validLevels.length).toBe(8);
    });

    test("should enforce reading level type constraint at compile time", () => {
      // TypeScript will catch invalid reading levels at compile time
      const config: AIConfiguration = {
        targetAudience: "grade-6" // Valid
      };

      expect(config.targetAudience).toBe("grade-6");
    });
  });

  describe("Tone type constraint enforcement", () => {
    test("should accept valid tones", () => {
      const validTones: Tone[] = [
        "educational",
        "professional",
        "casual",
        "academic"
      ];

      // This test verifies TypeScript compilation allows all 4 tones
      expect(validTones.length).toBe(4);
    });

    test("should enforce tone type constraint at compile time", () => {
      // TypeScript will catch invalid tones at compile time
      const config: AIConfiguration = {
        tone: "educational" // Valid
      };

      expect(config.tone).toBe("educational");
    });
  });

  describe("AIConfiguration interface structure validation", () => {
    test("should allow empty configuration (all fields optional)", () => {
      const config: AIConfiguration = {};

      expect(config).toBeDefined();
      expect(config.targetAudience).toBeUndefined();
      expect(config.tone).toBeUndefined();
      expect(config.outputStyle).toBeUndefined();
      expect(config.customization).toBeUndefined();
    });

    test("should allow partial configuration", () => {
      const config: AIConfiguration = {
        targetAudience: "college"
      };

      expect(config.targetAudience).toBe("college");
      expect(config.tone).toBeUndefined();
    });

    test("should allow complete configuration", () => {
      const config: AIConfiguration = {
        targetAudience: "high-school",
        tone: "academic",
        outputStyle: "plain-html",
        customization: "Focus on visual learners"
      };

      expect(config.targetAudience).toBe("high-school");
      expect(config.tone).toBe("academic");
      expect(config.outputStyle).toBe("plain-html");
      expect(config.customization).toBe("Focus on visual learners");
    });
  });

  describe("BookDefinition extension with optional aiConfig", () => {
    test("should allow BookDefinition without aiConfig (backward compatibility)", () => {
      const book: BookDefinition = {
        title: "Test Book",
        language: "en",
        chapters: []
      };

      expect(book.aiConfig).toBeUndefined();
    });

    test("should allow BookDefinition with aiConfig", () => {
      const book: BookDefinition = {
        title: "Test Book",
        language: "en",
        aiConfig: {
          targetAudience: "grade-6",
          tone: "educational"
        },
        chapters: []
      };

      expect(book.aiConfig).toBeDefined();
      expect(book.aiConfig?.targetAudience).toBe("grade-6");
      expect(book.aiConfig?.tone).toBe("educational");
    });
  });

  describe("ChapterDefinition extension with optional aiConfig", () => {
    test("should allow ChapterDefinition without aiConfig", () => {
      const chapter: ChapterDefinition = {
        title: "Chapter 1",
        content: []
      };

      expect(chapter.aiConfig).toBeUndefined();
    });

    test("should allow ChapterDefinition with aiConfig (override)", () => {
      const chapter: ChapterDefinition = {
        title: "Chapter 1",
        aiConfig: {
          targetAudience: "college",
          tone: "academic"
        },
        content: []
      };

      expect(chapter.aiConfig).toBeDefined();
      expect(chapter.aiConfig?.targetAudience).toBe("college");
      expect(chapter.aiConfig?.tone).toBe("academic");
    });
  });

  describe("AITextContent and AIQuizContent extensions", () => {
    test("should allow AITextContent without aiConfig", () => {
      const content: AITextContent = {
        type: "ai-text",
        prompt: "Explain photosynthesis"
      };

      expect(content.aiConfig).toBeUndefined();
    });

    test("should allow AITextContent with aiConfig (item-level override)", () => {
      const content: AITextContent = {
        type: "ai-text",
        prompt: "Explain photosynthesis",
        aiConfig: {
          targetAudience: "elementary",
          customization: "Use simple analogies"
        }
      };

      expect(content.aiConfig).toBeDefined();
      expect(content.aiConfig?.targetAudience).toBe("elementary");
      expect(content.aiConfig?.customization).toBe("Use simple analogies");
    });

    test("should allow AIQuizContent without aiConfig", () => {
      const content: AIQuizContent = {
        type: "ai-quiz",
        sourceText: "Photosynthesis is the process..."
      };

      expect(content.aiConfig).toBeUndefined();
    });

    test("should allow AIQuizContent with aiConfig (item-level override)", () => {
      const content: AIQuizContent = {
        type: "ai-quiz",
        sourceText: "Photosynthesis is the process...",
        questionCount: 5,
        aiConfig: {
          targetAudience: "grade-9",
          tone: "educational"
        }
      };

      expect(content.aiConfig).toBeDefined();
      expect(content.aiConfig?.targetAudience).toBe("grade-9");
      expect(content.aiConfig?.tone).toBe("educational");
    });
  });

  describe("HandlerContext bookConfig and chapterConfig fields", () => {
    test("should allow HandlerContext without AI configuration fields", () => {
      const context: HandlerContext = {
        chapterBuilder: {} as any,
        libraryRegistry: {} as any,
      aiPromptBuilder: {} as any,
        quizGenerator: {} as any,
        logger: {
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        },
        mediaFiles: [],
        basePath: "/test",
        options: {}
      };

      expect(context.bookConfig).toBeUndefined();
      expect(context.chapterConfig).toBeUndefined();
    });

    test("should allow HandlerContext with bookConfig only", () => {
      const context: HandlerContext = {
        chapterBuilder: {} as any,
        libraryRegistry: {} as any,
      aiPromptBuilder: {} as any,
        quizGenerator: {} as any,
        logger: {
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        },
        mediaFiles: [],
        basePath: "/test",
        options: {},
        bookConfig: {
          targetAudience: "grade-6",
          tone: "educational"
        }
      };

      expect(context.bookConfig).toBeDefined();
      expect(context.bookConfig?.targetAudience).toBe("grade-6");
      expect(context.chapterConfig).toBeUndefined();
    });

    test("should allow HandlerContext with both bookConfig and chapterConfig", () => {
      const context: HandlerContext = {
        chapterBuilder: {} as any,
        libraryRegistry: {} as any,
      aiPromptBuilder: {} as any,
        quizGenerator: {} as any,
        logger: {
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn()
        },
        mediaFiles: [],
        basePath: "/test",
        options: {},
        bookConfig: {
          targetAudience: "grade-6",
          tone: "educational"
        },
        chapterConfig: {
          targetAudience: "college", // Chapter-level override
          tone: "academic"
        }
      };

      expect(context.bookConfig).toBeDefined();
      expect(context.bookConfig?.targetAudience).toBe("grade-6");
      expect(context.chapterConfig).toBeDefined();
      expect(context.chapterConfig?.targetAudience).toBe("college");
    });
  });
});
