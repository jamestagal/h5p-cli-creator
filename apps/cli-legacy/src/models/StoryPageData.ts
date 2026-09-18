import { TranscriptSegment } from "../services/types/YouTubeExtractorTypes";

/**
 * Story page data model for Interactive Book generation.
 *
 * Represents the complete data for a single story page including:
 * - Page metadata (number, title, timestamps)
 * - Vietnamese text and English translation
 * - Audio and image file paths
 * - Transcript segments used for this page
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

/**
 * Complete data for a single story page
 *
 * This is the intermediate data structure used between extraction services
 * and YAML generation. Contains all information needed to generate a page
 * in the Interactive Book YAML.
 */
export interface StoryPageData {
  /**
   * Page number (1-based)
   */
  pageNumber: number;

  /**
   * Page title
   */
  title: string;

  /**
   * Audio segment start time in seconds
   */
  startTime: number;

  /**
   * Audio segment end time in seconds
   */
  endTime: number;

  /**
   * Vietnamese text extracted from transcript segments
   * Preserves diacritics and formatting (UTF-8)
   */
  vietnameseText: string;

  /**
   * English translation (optional, if translation enabled)
   */
  englishTranslation?: string;

  /**
   * Path to audio segment file (page1.mp3, page2.mp3, etc.)
   */
  audioPath: string;

  /**
   * Path to image file (placeholder or custom)
   */
  imagePath: string;

  /**
   * Flag indicating if image is placeholder
   */
  isPlaceholder: boolean;

  /**
   * Array of transcript segments that contributed to this page's text
   * Used for debugging and verification
   */
  transcriptSegments: TranscriptSegment[];
}
