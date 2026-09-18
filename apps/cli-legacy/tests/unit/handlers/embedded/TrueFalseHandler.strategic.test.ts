/**
 * Strategic tests for TrueFalseHandler (Task 5.2)
 *
 * These tests cover critical functionality not addressed in the main test suites:
 * - Behaviour override functionality
 * - Label customization
 * - Confirmation dialog configuration
 * - Feedback message customization
 */

import { TrueFalseHandler, TrueFalseContent } from "../../../../src/handlers/embedded/TrueFalseHandler";
import { HandlerContext } from "../../../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../../../src/compiler/ChapterBuilder";

describe("TrueFalseHandler - Strategic Tests", () => {
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

  describe("Behaviour Override", () => {
    it("should merge user-provided behaviour with defaults", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true,
        behaviour: {
          enableRetry: false,
          confirmCheckDialog: true,
          autoCheck: true
        }
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      const behaviour = addedContent.params.behaviour;

      // User-provided values should override defaults
      expect(behaviour.enableRetry).toBe(false);
      expect(behaviour.confirmCheckDialog).toBe(true);
      expect(behaviour.autoCheck).toBe(true);

      // Other defaults should still be present
      expect(behaviour.enableSolutionsButton).toBe(true);
      expect(behaviour.enableCheckButton).toBe(true);
    });

    it("should include custom feedback in behaviour", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "The Earth is round",
        correct: true,
        behaviour: {
          feedbackOnCorrect: "Great job! That's absolutely correct!",
          feedbackOnWrong: "Not quite. The Earth is actually round, not flat."
        }
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      const behaviour = addedContent.params.behaviour;

      expect(behaviour.feedbackOnCorrect).toBe("Great job! That's absolutely correct!");
      expect(behaviour.feedbackOnWrong).toBe("Not quite. The Earth is actually round, not flat.");
    });
  });

  describe("Label Customization", () => {
    it("should merge user-provided labels with defaults", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true,
        labels: {
          trueText: "Richtig",
          falseText: "Falsch",
          checkAnswer: "Prüfen"
        }
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      const l10n = addedContent.params.l10n;

      // User-provided values should override defaults
      expect(l10n.trueText).toBe("Richtig");
      expect(l10n.falseText).toBe("Falsch");
      expect(l10n.checkAnswer).toBe("Prüfen");

      // Other defaults should still be present
      expect(l10n.showSolutionButton).toBe("Show solution");
      expect(l10n.tryAgain).toBe("Retry");
    });

    it("should include accessibility labels from defaults", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      const l10n = addedContent.params.l10n;

      // Accessibility labels should be present
      expect(l10n.a11yCheck).toBeDefined();
      expect(l10n.a11yShowSolution).toBeDefined();
      expect(l10n.a11yRetry).toBeDefined();
      expect(l10n.a11yCheck).toContain("Check the answers");
    });
  });

  describe("Confirmation Dialog Configuration", () => {
    it("should include default confirmation dialogs", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.confirmCheck).toBeDefined();
      expect(addedContent.params.confirmCheck.header).toBe("Finish ?");
      expect(addedContent.params.confirmCheck.confirmLabel).toBe("Finish");

      expect(addedContent.params.confirmRetry).toBeDefined();
      expect(addedContent.params.confirmRetry.header).toBe("Retry ?");
      expect(addedContent.params.confirmRetry.confirmLabel).toBe("Confirm");
    });

    it("should work with confirmCheckDialog enabled", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true,
        behaviour: {
          confirmCheckDialog: true
        }
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.behaviour.confirmCheckDialog).toBe(true);
      expect(addedContent.params.confirmCheck).toBeDefined();
    });
  });

  describe("H5P Structure Completeness", () => {
    it("should generate complete H5P structure with all required fields", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        title: "Geography Quiz",
        question: "Oslo is the capital of Norway",
        correct: true
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      // Verify complete H5P structure
      expect(addedContent.library).toBe("H5P.TrueFalse 1.8");
      expect(addedContent.params).toBeDefined();
      expect(addedContent.metadata).toBeDefined();
      expect(addedContent.subContentId).toBeDefined();

      // Verify metadata
      expect(addedContent.metadata.title).toBe("Geography Quiz");
      expect(addedContent.metadata.contentType).toBe("True/False Question");

      // Verify all required params
      expect(addedContent.params.question).toBeDefined();
      expect(addedContent.params.correct).toBeDefined();
      expect(addedContent.params.behaviour).toBeDefined();
      expect(addedContent.params.l10n).toBeDefined();
      expect(addedContent.params.confirmCheck).toBeDefined();
      expect(addedContent.params.confirmRetry).toBeDefined();
    });

    it("should generate unique subContentId for each question", async () => {
      const item: TrueFalseContent = {
        type: "truefalse",
        question: "Test question",
        correct: true
      };

      // Process the same item twice
      await handler.process(mockContext, item);
      await handler.process(mockContext, item);

      const calls = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls;
      const firstId = calls[0][0].subContentId;
      const secondId = calls[1][0].subContentId;

      // SubContentIds should be unique
      expect(firstId).toBeDefined();
      expect(secondId).toBeDefined();
      expect(firstId).not.toBe(secondId);
    });
  });
});
