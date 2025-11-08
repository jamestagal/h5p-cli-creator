import { HandlerContext } from "./HandlerContext";

/**
 * ContentHandler defines the interface for processing H5P content items.
 * Each content type (text, image, audio, quiz, etc.) implements this interface
 * to provide composable content generation for Interactive Books.
 */
export interface ContentHandler {
  /**
   * Unique content type identifier (e.g., "text", "image", "ai-quiz")
   * @returns String identifier matching content item type field
   */
  getContentType(): string;

  /**
   * Process a content item and add it to the chapter via context.
   * Called for each content item during book compilation.
   * @param context Handler execution context with utilities and dependencies
   * @param item Content item data (type-specific structure)
   */
  process(context: HandlerContext, item: any): Promise<void>;

  /**
   * Validate if this handler can process the given content item.
   * Checks for required fields and data structure.
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  validate(item: any): { valid: boolean; error?: string };

  /**
   * Get H5P libraries required by this handler.
   * Used for dynamic library resolution during package assembly.
   * @returns Array of library identifiers (e.g., ["H5P.Image 1.1"])
   */
  getRequiredLibraries(): string[];
}
