import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { TextContent } from "../../compiler/YamlInputParser";

/**
 * TextHandler processes text content items for Interactive Books.
 * Adds formatted text pages using H5P.AdvancedText library.
 */
export class TextHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "text";
  }

  /**
   * Process a text content item and add it to the chapter
   * @param context Handler execution context
   * @param item Text content item with title and text fields
   */
  public async process(context: HandlerContext, item: TextContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding text page: "${item.title || 'Untitled'}"`);
    }

    chapterBuilder.addTextPage(item.title || "", item.text);
  }

  /**
   * Validate text content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.text || typeof item.text !== "string") {
      return {
        valid: false,
        error: "Text content must have a 'text' field (string). Please add a text property to your content item."
      };
    }

    if (item.text.trim() === "") {
      return {
        valid: false,
        error: "Text content 'text' field cannot be empty. Please provide content text."
      };
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for text content
   * @returns Array containing H5P.AdvancedText library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.AdvancedText"];
  }
}
