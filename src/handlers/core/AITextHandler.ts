import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AITextContent } from "../../compiler/YamlInputParser";

/**
 * AITextHandler processes AI-generated text content items for Interactive Books.
 * Uses Google Gemini or Anthropic Claude to generate educational content from prompts.
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
   * @param context Handler execution context
   * @param item AI-text content item with prompt and optional title
   */
  public async process(context: HandlerContext, item: AITextContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI text: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);
    }

    try {
      let generatedText = "";

      // Use Gemini if available, otherwise Claude
      if (process.env.GOOGLE_API_KEY) {
        if (options.verbose) logger.log(`      Using Gemini 2.5 Flash`);
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(item.prompt);
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
            content: item.prompt
          }]
        });
        generatedText = response.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("");
      } else {
        throw new Error("No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY");
      }

      chapterBuilder.addTextPage(item.title || "AI-Generated Content", generatedText);
      if (options.verbose) logger.log(`      Generated ${generatedText.length} characters`);
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);
      chapterBuilder.addTextPage(
        item.title || "Content",
        `AI text generation failed. Please check your API key configuration.\n\nPrompt was: ${item.prompt}`
      );
    }
  }

  /**
   * Validate AI-text content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return { valid: false, error: "AI-text content must have a 'prompt' field (string)" };
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
