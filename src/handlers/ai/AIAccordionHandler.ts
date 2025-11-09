import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated accordion content from a single prompt
 */
export interface AIAccordionContent {
  type: "ai-accordion";
  title?: string;
  prompt: string;
  panelCount?: number;
  hTag?: "h2" | "h3" | "h4";
  style?: "faq" | "glossary" | "general";  // Style hint for AI generation
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

/**
 * Handler for AI-generated H5P.Accordion content
 *
 * Creates collapsible accordion panels using AI to generate the content.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-accordion
 *   title: "Photosynthesis FAQ"
 *   prompt: "Create FAQ about photosynthesis basics"
 *   panelCount: 5
 * ```
 */
export class AIAccordionHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-accordion";
  }

  /**
   * Validates AI accordion content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-accordion requires 'prompt' field. Please provide a prompt for generating accordion panels."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    if (item.panelCount && typeof item.panelCount !== "number") {
      return {
        valid: false,
        error: "Field 'panelCount' must be a number"
      };
    }

    if (item.panelCount && (item.panelCount < 1 || item.panelCount > 20)) {
      return {
        valid: false,
        error: "panelCount must be between 1 and 20"
      };
    }

    // Validate hTag if provided
    if (item.hTag && !["h2", "h3", "h4"].includes(item.hTag)) {
      return {
        valid: false,
        error: "hTag must be one of: h2, h3, h4"
      };
    }

    return { valid: true };
  }

  /**
   * Processes AI accordion content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AIAccordionContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI accordion: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt}"`);
      logger.log(`      Panel count: ${item.panelCount || 5}`);
    }

    // Generate panels using AI
    const panels = await this.generateAccordionPanels(
      context,
      item.prompt,
      item.panelCount || 5,
      item.style || "general",
      item.aiConfig
    );

    if (options.verbose) {
      logger.log(`      ✓ Generated ${panels.length} accordion panels`);
    }

    // Build H5P Accordion structure
    const h5pContent = {
      library: "H5P.Accordion 1.0",
      params: {
        panels: panels.map(panel => ({
          title: panel.title,
          content: {
            library: "H5P.AdvancedText 1.1",
            params: {
              text: `<p>${this.escapeHtml(panel.content)}</p>`
            },
            subContentId: this.generateSubContentId(),
            metadata: {
              contentType: "Text",
              license: "U",
              title: "Untitled Text"
            }
          }
        })),
        hTag: item.hTag || "h2"
      },
      metadata: {
        title: item.title || "Accordion",
        license: "U",
        contentType: "Accordion"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Generates accordion panels using AI
   */
  private async generateAccordionPanels(
    context: HandlerContext,
    prompt: string,
    panelCount: number,
    style: "faq" | "glossary" | "general",
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<Array<{ title: string; content: string }>> {
    const { quizGenerator, logger, options } = context;

    // Build system prompt for accordion generation
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      aiConfig as any,
      context.chapterConfig,
      context.bookConfig
    );

    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // Build style-specific instructions
    let styleInstructions = "";

    if (style === "faq") {
      styleInstructions = "Each panel should be a question-and-answer pair. The title should be a clear question, and the content should be a concise answer (2-4 sentences).";
    } else if (style === "glossary") {
      styleInstructions = "Each panel should define a key term. The title should be the term or concept, and the content should be a clear definition or explanation (2-4 sentences).";
    } else {
      styleInstructions = "Each panel should have a clear topic or heading as the title, and a concise explanation as the content (2-4 sentences).";
    }

    // Build user prompt
    const userPrompt = `${prompt}

Generate exactly ${panelCount} accordion panels. ${styleInstructions}

Format your response as a JSON array with this exact structure:
[
  {
    "title": "${style === "faq" ? "Question here?" : style === "glossary" ? "Term or Concept" : "Topic or Heading"}",
    "content": "${style === "faq" ? "Answer here (2-4 sentences)" : "Definition or explanation here (2-4 sentences)"}"
  }
]

Return ONLY the JSON array with no additional text or markdown code blocks.`;

    try {
      // Use the quiz generator's AI client to generate panels
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response length: ${response.length} characters`);
      }

      // Parse JSON response
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const panels = JSON.parse(cleaned);

      if (!Array.isArray(panels)) {
        throw new Error("AI response is not an array");
      }

      // Validate and clean panel structure
      const cleanedPanels: Array<{ title: string; content: string }> = [];
      for (const panel of panels) {
        if (!panel.title || !panel.content) {
          throw new Error("Panel missing title or content");
        }

        // Strip any HTML tags from AI response - we'll add our own <p> tags later
        const cleanContent = panel.content
          .replace(/<\/?p>/gi, "")  // Remove <p> and </p> tags
          .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
          .replace(/<[^>]+>/g, "")  // Remove any other HTML tags
          .trim();

        cleanedPanels.push({
          title: panel.title,
          content: cleanContent
        });
      }

      const finalPanels = cleanedPanels.slice(0, panelCount); // Ensure we don't exceed requested count

      // Log generated panels in verbose mode
      if (options.verbose && finalPanels.length > 0) {
        logger.log(`      Sample panel: "${finalPanels[0].title}" → "${finalPanels[0].content.substring(0, 50)}..."`);
      }

      return finalPanels;
    } catch (error) {
      logger.log(`      ⚠ AI accordion generation failed: ${error.message}`);
      logger.log(`      Using fallback panels`);

      // Fallback to basic panels if AI generation fails
      return this.getFallbackPanels(prompt, panelCount);
    }
  }

  /**
   * Provides fallback panels if AI generation fails
   */
  private getFallbackPanels(prompt: string, count: number): Array<{ title: string; content: string }> {
    const fallback: Array<{ title: string; content: string }> = [];

    for (let i = 0; i < count; i++) {
      fallback.push({
        title: `Section ${i + 1}`,
        content: `AI accordion generation failed for prompt: "${prompt}". Please check your API key and try again.`
      });
    }

    return fallback;
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Accordion"];
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
