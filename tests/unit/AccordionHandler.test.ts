import { AccordionHandler, AccordionContent } from "../../src/handlers/embedded/AccordionHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";
import { ChapterBuilder } from "../../src/compiler/ChapterBuilder";
import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";

describe("AccordionHandler", () => {
  let handler: AccordionHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: jest.Mocked<Partial<ChapterBuilder>>;
  let mockQuizGenerator: jest.Mocked<Partial<QuizGenerator>>;
  let mockAIPromptBuilder: any;

  beforeEach(() => {
    handler = new AccordionHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn()
    };

    mockQuizGenerator = {
      generateRawContent: jest.fn()
    } as any;

    mockAIPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue("System prompt for accordion")
    } as any;

    mockContext = {
      chapterBuilder: mockChapterBuilder as any,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      options: { verbose: false },
      quizGenerator: mockQuizGenerator as any,
      aiPromptBuilder: mockAIPromptBuilder as AIPromptBuilder,
      libraryRegistry: {} as any,
      mediaFiles: [],
      basePath: "/test"
    };
  });

  describe("getContentType", () => {
    it("should return 'accordion'", () => {
      expect(handler.getContentType()).toBe("accordion");
    });
  });

  describe("validate - Manual Accordion", () => {
    it("should accept valid accordion content", () => {
      const item: AccordionContent = {
        type: "accordion",
        panels: [
          { title: "Question 1", content: "Answer 1" },
          { title: "Question 2", content: "Answer 2" }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should accept accordion with title and hTag", () => {
      const item: AccordionContent = {
        type: "accordion",
        title: "FAQ",
        panels: [
          { title: "Q1", content: "A1" }
        ],
        hTag: "h3"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should reject missing panels array", () => {
      const item = {
        type: "accordion"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires 'panels' array");
    });

    it("should reject empty panels array", () => {
      const item = {
        type: "accordion",
        panels: []
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must have at least one panel");
    });

    it("should reject panel without title", () => {
      const item = {
        type: "accordion",
        panels: [
          { content: "Answer" }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Panel 1 missing 'title'");
    });

    it("should reject panel without content", () => {
      const item = {
        type: "accordion",
        panels: [
          { title: "Question" }
        ]
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Panel 1 missing 'content'");
    });

    it("should reject invalid hTag", () => {
      const item = {
        type: "accordion",
        panels: [
          { title: "Q", content: "A" }
        ],
        hTag: "h5"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("hTag must be one of: h2, h3, h4");
    });
  });

  describe("validate - AI Accordion", () => {
    it("should accept valid ai-accordion content", () => {
      const item: any = {
        type: "ai-accordion",
        prompt: "Create FAQ about photosynthesis"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should accept ai-accordion with optional fields", () => {
      const item: any = {
        type: "ai-accordion",
        title: "FAQ",
        prompt: "Create FAQ",
        panelCount: 5,
        hTag: "h3",
        aiConfig: {
          targetAudience: "grade-9",
          tone: "educational"
        }
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(true);
    });

    it("should reject ai-accordion without prompt", () => {
      const item = {
        type: "ai-accordion"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("requires 'prompt' field");
    });

    it("should reject invalid panelCount type", () => {
      const item = {
        type: "ai-accordion",
        prompt: "Test",
        panelCount: "five"
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("panelCount' must be a number");
    });

    it("should reject panelCount out of range", () => {
      const item = {
        type: "ai-accordion",
        prompt: "Test",
        panelCount: 25
      };

      const result = handler.validate(item);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("panelCount must be between 1 and 20");
    });
  });

  describe("process - Manual Accordion", () => {
    it("should process manual accordion and add to chapter", async () => {
      const item: AccordionContent = {
        type: "accordion",
        title: "FAQ",
        panels: [
          { title: "Question 1", content: "Answer 1" },
          { title: "Question 2", content: "Answer 2" }
        ],
        hTag: "h3"
      };

      await handler.process(mockContext, item);

      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.library).toBe("H5P.Accordion 1.0");
      expect(addedContent.params.panels).toHaveLength(2);
      expect(addedContent.params.panels[0].title).toBe("Question 1");
      expect(addedContent.params.panels[0].content.library).toBe("H5P.AdvancedText 1.1");
      expect(addedContent.params.panels[0].content.params.text).toContain("Answer 1");
      expect(addedContent.params.hTag).toBe("h3");
    });

    it("should escape HTML in panel content", async () => {
      const item: AccordionContent = {
        type: "accordion",
        panels: [
          { title: "Test", content: "Content with <script>alert('xss')</script>" }
        ]
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      const panelText = addedContent.params.panels[0].content.params.text;

      expect(panelText).toContain("&lt;script&gt;");
      expect(panelText).toContain("&lt;/script&gt;");
      expect(panelText).not.toContain("<script>");
    });

    it("should use default h2 if hTag not specified", async () => {
      const item: AccordionContent = {
        type: "accordion",
        panels: [
          { title: "Q", content: "A" }
        ]
      };

      await handler.process(mockContext, item);

      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];
      expect(addedContent.params.hTag).toBe("h2");
    });

    it("should log when verbose is enabled", async () => {
      mockContext.options.verbose = true;

      const item: AccordionContent = {
        type: "accordion",
        title: "Test Accordion",
        panels: [
          { title: "Q1", content: "A1" },
          { title: "Q2", content: "A2" }
        ]
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Adding accordion: "Test Accordion" (2 panels)')
      );
    });
  });

  describe("process - AI Accordion", () => {
    it("should generate accordion panels using AI", async () => {
      const mockAIResponse = JSON.stringify([
        { title: "What is photosynthesis?", content: "Photosynthesis is the process..." },
        { title: "Where does it occur?", content: "It occurs in chloroplasts..." },
        { title: "What are the products?", content: "Oxygen and glucose are produced..." }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: any = {
        type: "ai-accordion",
        title: "Photosynthesis FAQ",
        prompt: "Create FAQ about photosynthesis basics",
        panelCount: 3,
        aiConfig: {
          targetAudience: "grade-6",
          tone: "educational"
        }
      };

      await handler.process(mockContext, item);

      // Verify AI prompt was built
      expect(mockAIPromptBuilder.buildPrompt).toHaveBeenCalledWith({
        contentType: "accordion",
        targetAudience: "grade-6",
        tone: "educational",
        customization: undefined,
        outputFormat: "plain-html"
      });

      // Verify AI generation was called
      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalledWith(
        "System prompt for accordion",
        expect.stringContaining("Create FAQ about photosynthesis basics")
      );

      // Verify content was added
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.panels).toHaveLength(3);
      expect(addedContent.params.panels[0].title).toBe("What is photosynthesis?");
      expect(addedContent.params.panels[0].content.params.text).toContain("Photosynthesis is the process...");
    });

    it("should use default panelCount of 5 if not specified", async () => {
      const mockAIResponse = JSON.stringify(
        Array.from({ length: 5 }, (_, i) => ({
          title: `Question ${i + 1}`,
          content: `Answer ${i + 1}`
        }))
      );

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: any = {
        type: "ai-accordion",
        prompt: "Create FAQ"
      };

      await handler.process(mockContext, item);

      expect(mockQuizGenerator.generateRawContent).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Generate exactly 5 accordion panels")
      );
    });

    it("should handle AI generation failure with fallback panels", async () => {
      (mockQuizGenerator.generateRawContent as jest.Mock).mockRejectedValue(new Error("API error"));

      const item: any = {
        type: "ai-accordion",
        prompt: "Create FAQ",
        panelCount: 3
      };

      await handler.process(mockContext, item);

      // Should still add content with fallback panels
      expect(mockChapterBuilder.addCustomContent).toHaveBeenCalledTimes(1);
      const addedContent = (mockChapterBuilder.addCustomContent as jest.Mock).mock.calls[0][0];

      expect(addedContent.params.panels).toHaveLength(3);
      expect(addedContent.params.panels[0].title).toContain("Section 1");
      expect(addedContent.params.panels[0].content.params.text).toContain("AI accordion generation failed");
    });

    it("should log AI generation details when verbose", async () => {
      mockContext.options.verbose = true;

      const mockAIResponse = JSON.stringify([
        { title: "Q1", content: "A1" }
      ]);

      (mockQuizGenerator.generateRawContent as jest.Mock).mockResolvedValue(mockAIResponse);

      const item: any = {
        type: "ai-accordion",
        title: "Test",
        prompt: "Test prompt",
        panelCount: 1
      };

      await handler.process(mockContext, item);

      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating AI accordion: "Test"')
      );
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Prompt: "Test prompt"')
      );
      expect(mockContext.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Generated 1 accordion panels')
      );
    });
  });

  describe("getRequiredLibraries", () => {
    it("should return H5P.Accordion", () => {
      const libraries = handler.getRequiredLibraries();
      expect(libraries).toEqual(["H5P.Accordion"]);
    });
  });
});
