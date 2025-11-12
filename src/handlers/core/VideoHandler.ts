import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { VideoContent } from "../../compiler/YamlInputParser";

/**
 * VideoHandler processes video content items for Interactive Books.
 * Supports YouTube videos via H5P.Video library.
 */
export class VideoHandler implements ContentHandler {
  /**
   * Returns the content type identifier
   */
  public getContentType(): string {
    return "video";
  }

  /**
   * Process a video content item and add it to the chapter.
   * Creates H5P.Video content with YouTube support.
   * @param context Handler execution context
   * @param item Video content item with URL
   */
  public async process(context: HandlerContext, item: VideoContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding video page: "${item.title || 'Video'}"`);
    }

    // Build H5P.Video content structure
    const videoContent = {
      library: "H5P.Video 1.6",
      params: {
        visuals: {
          fit: true,
          controls: true
        },
        playback: {
          autoplay: false,
          loop: false
        },
        l10n: {
          name: "Video",
          loading: "Video player loading...",
          noPlayers: "Found no video players that supports the given video format.",
          noSources: "Video source is missing.",
          aborted: "Media playback has been aborted.",
          networkFailure: "Network failure.",
          cannotDecode: "Unable to decode media.",
          formatNotSupported: "Video format not supported.",
          mediaEncrypted: "Media encrypted.",
          unknownError: "Unknown error.",
          invalidYtId: "Invalid YouTube ID.",
          unknownYtId: "Unable to find video with the given YouTube ID.",
          restrictedYt: "The owner of this video does not allow it to be embedded."
        },
        sources: [
          {
            path: item.url,
            mime: "video/YouTube",
            copyright: {
              license: "U"
            }
          }
        ]
      },
      metadata: {
        contentType: "Video",
        license: "U",
        title: item.title || "Video"
      }
    };

    // Add video to chapter
    chapterBuilder.addCustomContent(videoContent);
  }

  /**
   * Validate video content item structure
   * @param item Content item to validate
   * @returns Validation result with optional error message
   */
  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.url || typeof item.url !== "string") {
      return {
        valid: false,
        error: "Video content must have a 'url' field (string). Please add a url property pointing to your YouTube video."
      };
    }

    if (item.url.trim() === "") {
      return {
        valid: false,
        error: "Video 'url' field cannot be empty. Please provide a valid YouTube URL."
      };
    }

    // Validate YouTube URL format
    if (!item.url.includes("youtube.com") && !item.url.includes("youtu.be")) {
      return {
        valid: false,
        error: "Video 'url' must be a YouTube URL. Only YouTube videos are currently supported."
      };
    }

    return { valid: true };
  }

  /**
   * Get required H5P libraries for video content
   * @returns Array containing H5P.Video library
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Video"];
  }
}
