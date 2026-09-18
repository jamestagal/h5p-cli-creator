import { TrueFalseHandler, TrueFalseContent } from "../../src/handlers/embedded/TrueFalseHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("TrueFalseHandler", () => {
  let handler: TrueFalseHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<Partial<ChapterBuilder>>;

  beforeEach(() => {
    handler = new TrueFalseHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn()
    };

    mockContext = {
      chapterBuilder: mockChapterBuilder as any,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      options: { verbose: false }
    } as any;
  });

  describe("getContentType", () => {
    it("should return 'truefalse'", () => {
      expect(handler.getContentType()).toBe("truefalse");
    });
  });

  describe("validate", () => {
    it("should accept valid content with question and correct fields", () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Oslo is the capital of Norway",
        correct: true
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing question field", () => {
      const item = {
        type: "truefalse",
        correct: true
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("question");
      expect(result.error).toMatch(/require/i);
    });

    it("should reject non-string question field", () => {
      const item = {
        type: "truefalse",
        question: 123,
        correct: true
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("question");
      expect(result.error).toContain("string");
    });

    it("should reject missing correct field", () => {
      const item = {
        type: "truefalse",
        question: "Test question"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("correct");
      expect(result.error).toMatch(/require/i);
    });

    it("should reject non-boolean correct field", () => {
      const item = {
        type: "truefalse",
        question: "Test question",
        correct: "true"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("correct");
      expect(result.error).toContain("boolean");
    });
  });

  describe("process", () => {
    it("should convert boolean correct field to string 'true'", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Oslo is the capital of Norway",
        correct: true
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.correct).toBe("true");
      expect(typeof addedContent.params.correct).toBe("string");
    });

    it("should convert boolean correct field to string 'false'", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "The Earth is flat",
        correct: false
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.correct).toBe("false");
      expect(typeof addedContent.params.correct).toBe("string");
    });

    it("should wrap question text in <p> tags", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.question).toMatch(/^<p>.*<\/p>$/);
      expect(addedContent.params.question).toContain("Test question");
    });

    it("should escape HTML in question text", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Question with <script>alert('xss')</script>",
        correct: true
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.question).toContain("&lt;script&gt;");
      expect(addedContent.params.question).toContain("&lt;/script&gt;");
      expect(addedContent.params.question).not.toContain("<script>");
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.TrueFalse']", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toEqual(["H5P.TrueFalse"]);
    });
  });
});
