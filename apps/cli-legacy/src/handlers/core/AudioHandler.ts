import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AudioContent } from "../../compiler/YamlInputParser";

/**
 * AudioHandler processes audio content items for Interactive Books.
 * Supports both local file paths and URLs.
 * Uses H5pAudio helper for media processing.
 */
export class AudioHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "audio";
  }

  /**
   * Process an audio content item and add it to the chapter.
   * Supports both local files and URLs via H5pAudio helper.
   * @param context Handler execution context
   * @param item Audio content item with path and optional title
   */
  public async process(context: HandlerContext, item: AudioContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding audio page: "${item.title || 'Audio'}"`);
    }

    // ChapterBuilder.addAudioPage handles both local files and URLs internally
    await chapterBuilder.addAudioPage(item.title || "", item.path);
  }

  /**
   * Validate audio content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.path || typeof item.path !== "string") {
      return {
        valid: false,
        error: "Audio content must have a 'path' field (string). Please add a path property pointing to your audio file."
      };
    }

    if (item.path.trim() === "") {
      return {
        valid: false,
        error: "Audio 'path' field cannot be empty. Please provide a valid file path or URL."
      };
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for audio content
   * @returns Array containing H5P.Audio library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Audio"];
  }
}
