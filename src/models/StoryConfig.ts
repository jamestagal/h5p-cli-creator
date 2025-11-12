/**
 * Story configuration model for YouTube Story Extraction feature.
 *
 * Defines the YAML config structure users provide to extract stories from YouTube videos.
 * Users specify source video URL, page timestamps, translation settings, and image options.
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

/**
 * Source configuration for YouTube video
 */
export interface SourceConfig {
  /**
   * Source type (currently only "youtube" is supported)
   */
  type: "youtube";

  /**
   * YouTube video URL (supports multiple formats: watch?v=, youtu.be/, embed/)
   */
  url: string;
}

/**
 * Translation configuration for bilingual content
 */
export interface TranslationConfig {
  /**
   * Enable/disable translation
   */
  enabled: boolean;

  /**
   * Target language code (e.g., "en", "es", "fr")
   */
  targetLanguage: string;

  /**
   * Translation display style
   * - collapsible: HTML <details> element (default)
   * - inline: Display translation inline with original text
   */
  style: "collapsible" | "inline";
}

/**
 * YouTube intro page configuration (page 0)
 */
export interface YouTubeIntroPage {
  /**
   * Page title
   */
  title: string;

  /**
   * Page type identifier
   */
  type: "youtube-intro";

  /**
   * Include full transcript in accordion
   */
  includeTranscript: boolean;
}

/**
 * Story page configuration with timestamps
 */
export interface StoryPage {
  /**
   * Page title
   */
  title: string;

  /**
   * Audio segment start time (MM:SS format)
   */
  startTime: string;

  /**
   * Audio segment end time (MM:SS format)
   */
  endTime: string;

  /**
   * Use placeholder image (default: true)
   */
  placeholder?: boolean;

  /**
   * Custom image path (optional, overrides placeholder)
   */
  image?: string;
}

/**
 * Union type for all page configurations
 */
export type PageConfig = YouTubeIntroPage | StoryPage;

/**
 * Complete story configuration from YAML
 *
 * Users define this structure in YAML config files.
 * Passed to youtube-extract command for processing.
 *
 * @example Basic configuration:
 * ```yaml
 * title: "Vietnamese Children's Story"
 * language: vi
 *
 * source:
 *   type: youtube
 *   url: "https://www.youtube.com/watch?v=Y8M9RJ_4C7E"
 *
 * translation:
 *   enabled: true
 *   targetLanguage: en
 *   style: collapsible
 *
 * pages:
 *   - title: "Video introduction"
 *     type: youtube-intro
 *     includeTranscript: true
 *
 *   - title: "Page 1"
 *     startTime: "00:00"
 *     endTime: "00:38"
 *     placeholder: true
 * ```
 */
export interface StoryConfig {
  /**
   * Story title
   */
  title: string;

  /**
   * Language code (e.g., "vi" for Vietnamese, "en" for English)
   */
  language: string;

  /**
   * Source video configuration
   */
  source: SourceConfig;

  /**
   * Translation configuration
   */
  translation: TranslationConfig;

  /**
   * Array of page configurations (intro page + story pages)
   */
  pages: PageConfig[];

  /**
   * Optional output file path for generated YAML
   * Defaults to {video-id}-story.yaml if not specified
   */
  outputPath?: string;

  /**
   * Optional path to manual transcript file (Gemini 2.5 Pro format)
   * If provided, uses this instead of extracting transcript from YouTube with yt-dlp
   * Format: Plain text with paragraph breaks (double newlines)
   * More accurate than yt-dlp VTT parsing (avoids repetition and artifacts)
   */
  manualTranscriptPath?: string;
}

/**
 * Type guard to check if page is YouTube intro page
 */
export function isYouTubeIntroPage(page: PageConfig): page is YouTubeIntroPage {
  return (page as YouTubeIntroPage).type === "youtube-intro";
}

/**
 * Type guard to check if page is story page
 */
export function isStoryPage(page: PageConfig): page is StoryPage {
  return "startTime" in page && "endTime" in page;
}
