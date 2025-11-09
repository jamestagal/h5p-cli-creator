import { SingleChoiceSetHandler, SingleChoiceSetContent } from "../../src/handlers/embedded/SingleChoiceSetHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";

describe("SingleChoiceSetHandler", () => {
  let handler: SingleChoiceSetHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<Partial<ChapterBuilder>>;

  beforeEach(() => {
    handler = new SingleChoiceSetHandler();

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
    it("should return 'singlechoiceset'", () => {
      expect(handler.getContentType()).toBe("singlechoiceset");
    });
  });

  describe("validate", () => {
    it("should accept valid content structure", () => {
      const item: SingleChoiceSetContent = {
        type: "singlechoiceset",
        questions: [
          {
            question: "What is 2+2?",
            correctAnswer: "4",
            distractors: ["3", "5"]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should reject missing questions array", () => {
      const item = {
        type: "singlechoiceset"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires 'questions' array");
    });

    it("should reject empty questions array", () => {
      const item = {
        type: "singlechoiceset",
        questions: []
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must have at least one question");
    });

    it("should reject questions missing correctAnswer", () => {
      const item = {
        type: "singlechoiceset",
        questions: [
          {
            question: "What is 2+2?",
            distractors: ["3", "5"]
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing 'correctAnswer'");
    });

    it("should reject questions with empty distractors", () => {
      const item = {
        type: "singlechoiceset",
        questions: [
          {
            question: "What is 2+2?",
            correctAnswer: "4",
            distractors: []
          }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must have at least one distractor");
    });
  });

  describe("process", () => {
    it("should place correct answer at index 0", async () => {
      const item: SingleChoiceSetContent = {
        type: "singlechoiceset",
        questions: [
          {
            question: "What is the capital of France?",
            correctAnswer: "Paris",
            distractors: ["London", "Berlin"]
          }
        ]
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.library).toBe("H5P.SingleChoiceSet 1.11");
      expect(addedContent.params.choices).toHaveLength(1);
      expect(addedContent.params.choices[0].answers[0]).toBe("Paris");
      expect(addedContent.params.choices[0].answers).toContain("London");
      expect(addedContent.params.choices[0].answers).toContain("Berlin");
    });

    it("should apply default behaviour settings", async () => {
      const item: SingleChoiceSetContent = {
        type: "singlechoiceset",
        questions: [
          {
            question: "Test question",
            correctAnswer: "Correct",
            distractors: ["Wrong"]
          }
        ]
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.behaviour.timeoutCorrect).toBe(1000);
      expect(addedContent.params.behaviour.timeoutWrong).toBe(1000);
      expect(addedContent.params.behaviour.soundEffectsEnabled).toBe(true);
      expect(addedContent.params.behaviour.enableRetry).toBe(true);
      expect(addedContent.params.behaviour.enableSolutionsButton).toBe(true);
      expect(addedContent.params.behaviour.passPercentage).toBe(100);
      expect(addedContent.params.behaviour.autoContinue).toBe(true);
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return ['H5P.SingleChoiceSet']", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toEqual(["H5P.SingleChoiceSet"]);
    });
  });
});
