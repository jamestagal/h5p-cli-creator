import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AITextContent } from "../../compiler/YamlInputParser";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AITextHandler processes AI-generated text content items for Interactive Books.
 * Uses Google Gemini or Anthropic Claude to generate educational content from prompts.
 *
 * Phase 5: Integrated with AIPromptBuilder for reading level-appropriate content generation.
 */
export class AITextHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "ai-text";
  }

  /**
   * Process an AI-text content item by generating text from AI and adding it to the chapter.
   * Supports both Gemini and Claude AI providers.
   *
   * Phase 5: Uses AIPromptBuilder to construct complete prompts with:
   * - Reading level guidance (vocabulary, sentence structure)
   * - Tone specification
   * - H5P formatting rules
   * - Optional customization instructions
   *
   * Configuration cascade (highest to lowest priority):
   * 1. item.aiConfig (specific to this content item)
   * 2. context.chapterConfig (chapter-level override)
   * 3. context.bookConfig (book-level default)
   * 4. System defaults (grade-6, educational)
   *
   * @param context Handler execution context with configuration cascade
   * @param item AI-text content item with prompt and optional aiConfig
   */
  public async process(context: HandlerContext, item: AITextContent): Promise<void> {
    const { chapterBuilder, logger, options, bookConfig, chapterConfig } = context;

    // Resolve configuration hierarchy: item > chapter > book > defaults
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      chapterConfig,
      bookConfig
    );

    if (options.verbose) {
      logger.log(`    - Generating AI text: "${item.title || 'Untitled'}"`);
      logger.log(`      Reading level: ${resolvedConfig.targetAudience}`);
      logger.log(`      Tone: ${resolvedConfig.tone}`);
      logger.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);
    }

    try {
      // Build complete prompt with system instructions and reading level guidance
      const completePrompt = AIPromptBuilder.buildCompletePrompt(
        item.prompt,
        resolvedConfig
      );

      let generatedText = "";

      // Use Gemini if available, otherwise Claude
      if (process.env.GOOGLE_API_KEY) {
        if (options.verbose) logger.log(`      Using Gemini 2.5 Flash`);
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(completePrompt);
        generatedText = result.response.text();
      } else if (process.env.ANTHROPIC_API_KEY) {
        if (options.verbose) logger.log(`      Using Claude Sonnet 4`);
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: completePrompt
          }]
        });
        generatedText = response.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("");
      } else {
        throw new Error("No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY");
      }

      // Use escapeHtml=false because AI generates valid HTML (not plain text)
      chapterBuilder.addTextPage(item.title || "AI-Generated Content", generatedText, false);
      if (options.verbose) logger.log(`      Generated ${generatedText.length} characters`);
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);
      // Use escapeHtml=true for error messages (plain text)
      chapterBuilder.addTextPage(
        item.title || "Content",
        `AI text generation failed. Please check your API key configuration.\n\nPrompt was: ${item.prompt}`,
        true
      );
    }
  }

  /**
   * Validate AI-text content item structure.
   *
   * Phase 5: Validates optional aiConfig fields if provided.
   *
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return { valid: false, error: "AI-text content must have a 'prompt' field (string)" };
    }

    // Validate aiConfig if present
    if (item.aiConfig) {
      const validLevels = [
        "elementary",
        "grade-6",
        "grade-9",
        "high-school",
        "college",
        "professional",
        "esl-beginner",
        "esl-intermediate"
      ];
      const validTones = ["educational", "professional", "casual", "academic"];

      if (item.aiConfig.targetAudience && !validLevels.includes(item.aiConfig.targetAudience)) {
        return {
          valid: false,
          error: `Invalid targetAudience: ${item.aiConfig.targetAudience}. Valid options: ${validLevels.join(", ")}`
        };
      }

      if (item.aiConfig.tone && !validTones.includes(item.aiConfig.tone)) {
        return {
          valid: false,
          error: `Invalid tone: ${item.aiConfig.tone}. Valid options: ${validTones.join(", ")}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for AI-text content
   * @returns Array containing H5P.AdvancedText library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.AdvancedText"];
  }
}
