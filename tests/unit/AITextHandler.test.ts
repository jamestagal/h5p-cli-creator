import { AITextHandler } from "../../src/handlers/core/AITextHandler";
import { HandlerContext } from "../../src/handlers/HandlerContext";

/**
 * Unit tests for AITextHandler
 * Tests Task Group 2.3: AI-Powered Handlers
 */
describe("AITextHandler", () => {
  let handler: AITextHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: any;
  let mockLogger: any;

  beforeEach(() => {
    handler = new AITextHandler();

    mockChapterBuilder = {
      addTextPage: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockContext = {
      chapterBuilder: mockChapterBuilder,
      libraryRegistry: {} as any,
      quizGenerator: {} as any,
      logger: mockLogger,
      mediaFiles: [],
      basePath: "/test",
      options: { verbose: false }
    };
  });

  test("should return correct content type", () => {
    expect(handler.getContentType()).toBe("ai-text");
  });

  test("should validate content with prompt field", () => {
    const validItem = {
      type: "ai-text",
      prompt: "Generate content about biology"
    };

    const result = handler.validate(validItem);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("should fail validation with missing prompt field", () => {
    const invalidItem = {
      type: "ai-text",
      title: "No prompt"
    };

    const result = handler.validate(invalidItem);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("prompt");
  });

  test("should return correct required libraries", () => {
    const libraries = handler.getRequiredLibraries();

    expect(libraries).toEqual(["H5P.AdvancedText"]);
  });

  test("should add fallback content when AI generation fails", async () => {
    // Clear environment variables to force failure
    const originalGoogleKey = process.env.GOOGLE_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const item = {
      type: "ai-text" as const,
      prompt: "Test prompt",
      title: "Test Title"
    };

    await handler.process(mockContext, item);

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
      "Test Title",
      expect.stringContaining("AI text generation failed")
    );

    // Restore environment variables
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  test("should log verbose output when verbose mode enabled", async () => {
    mockContext.options.verbose = true;

    // Clear environment to trigger error path
    const originalGoogleKey = process.env.GOOGLE_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const item = {
      type: "ai-text" as const,
      prompt: "Test prompt for verbose logging",
      title: "Verbose Test"
    };

    await handler.process(mockContext, item);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining("Generating AI text")
    );

    // Restore environment variables
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });
});
