import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { ImageContent } from "../../compiler/YamlInputParser";

/**
 * ImageHandler processes image content items for Interactive Books.
 * Supports both local file paths and URLs.
 * Uses H5pImage helper for media processing.
 */
export class ImageHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "image";
  }

  /**
   * Process an image content item and add it to the chapter.
   * Supports both local files and URLs via H5pImage helper.
   * @param context Handler execution context
   * @param item Image content item with path, alt, and optional title
   */
  public async process(context: HandlerContext, item: ImageContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding image page: "${item.title || item.alt}"`);
    }

    // ChapterBuilder.addImagePage handles both local files and URLs internally
    await chapterBuilder.addImagePage(item.title || "", item.path, item.alt);
  }

  /**
   * Validate image content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.path || typeof item.path !== "string") {
      return {
        valid: false,
        error: "Image content must have a 'path' field (string). Please add a path property pointing to your image file."
      };
    }

    if (item.path.trim() === "") {
      return {
        valid: false,
        error: "Image 'path' field cannot be empty. Please provide a valid file path or URL."
      };
    }

    if (!item.alt || typeof item.alt !== "string") {
      return {
        valid: false,
        error: "Image content must have an 'alt' field (string) for accessibility. Please add an alt text description."
      };
    }

    if (item.alt.trim() === "") {
      return {
        valid: false,
        error: "Image 'alt' field cannot be empty. Please provide a descriptive alt text for accessibility."
      };
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for image content
   * @returns Array containing H5P.Image library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Image"];
  }
}
