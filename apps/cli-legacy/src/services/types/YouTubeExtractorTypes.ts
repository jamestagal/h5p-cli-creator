/**
 * Type definitions for YouTube extraction services.
 *
 * These types define the data structures used throughout the YouTube story extraction pipeline:
 * - Video metadata from YouTube
 * - Transcript segments with timestamps
 * - Audio segments with file paths
 * - Cache metadata for reusing downloads
 * - Text-based page definitions for page break workflow
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 * Phase 2: Whisper API Transcription Integration
 * Phase 3: YouTube Extraction Improvements - Time Range Specification
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

/**
 * Video metadata extracted from YouTube
 */
export interface VideoMetadata {
  /**
   * YouTube video ID (11 characters)
   */
  videoId: string;

  /**
   * Video title
   */
  title: string;

  /**
   * Video duration in seconds
   */
  duration: number;

  /**
   * Thumbnail URL
   */
  thumbnailUrl: string;
}

/**
 * Transcript segment with timestamp and Vietnamese text
 *
 * Extracted from YouTube's caption/subtitle data.
 * Preserves Vietnamese diacritics (ă, â, đ, ê, ô, ơ, ư, etc.)
 */
export interface TranscriptSegment {
  /**
   * Segment start time in seconds
   */
  startTime: number;

  /**
   * Segment end time in seconds
   */
  endTime: number;

  /**
   * Vietnamese text with diacritics preserved (UTF-8)
   */
  text: string;
}

/**
 * Audio segment created by splitting full audio at timestamps
 */
export interface AudioSegment {
  /**
   * Page number (1-based)
   */
  pageNumber: number;

  /**
   * File path to MP3 segment
   */
  filePath: string;

  /**
   * Segment start time in seconds
   */
  startTime: number;

  /**
   * Segment end time in seconds
   */
  endTime: number;
}

/**
 * Transcription metadata for Whisper API
 *
 * Tracks transcription provider, model, language, and costs.
 * Used for cache validation and cost transparency.
 */
export interface TranscriptionMetadata {
  /**
   * Transcription provider (always "whisper-api" for Whisper API)
   */
  provider: "whisper-api";

  /**
   * Whisper model used (always "whisper-1")
   */
  model: "whisper-1";

  /**
   * Language code (e.g., "vi" for Vietnamese, "en" for English)
   */
  language: string;

  /**
   * Transcription timestamp (ISO 8601 format)
   */
  timestamp: string;

  /**
   * Transcription cost in USD
   */
  cost: number;

  /**
   * Audio duration in seconds
   */
  duration: number;
}

/**
 * Time range specification for video extraction
 *
 * Stores the original time strings from the config.
 * Used to track what portion of the video was extracted and transcribed.
 */
export interface ExtractionRange {
  /**
   * Start time in MM:SS or HH:MM:SS format
   * @example "01:30" - Start at 1 minute 30 seconds
   * @example "00:15:30" - Start at 15 minutes 30 seconds
   */
  startTime: string;

  /**
   * End time in MM:SS or HH:MM:SS format
   * @example "15:00" - End at 15 minutes
   * @example "01:30:00" - End at 1 hour 30 minutes
   */
  endTime: string;
}

/**
 * Cache metadata for YouTube downloads
 *
 * Stored in .youtube-cache/VIDEO_ID/cache-metadata.json
 * Used to determine if cached data is still valid
 */
export interface CacheMetadata {
  /**
   * YouTube video ID
   */
  videoId: string;

  /**
   * Path to cached audio file (audio.mp3)
   */
  audioPath: string;

  /**
   * Path to cached transcript file (transcript.json)
   */
  transcriptPath: string;

  /**
   * Download timestamp (ISO 8601 format)
   */
  downloadDate: string;

  /**
   * Video duration in seconds
   */
  duration?: number;

  /**
   * Video title
   */
  title?: string;

  /**
   * Transcription metadata (Whisper API)
   *
   * Optional field for backward compatibility with existing cache files.
   * Present when transcript was generated using Whisper API.
   */
  transcription?: TranscriptionMetadata;

  /**
   * Extraction range specification (optional)
   *
   * When present, indicates that the cached audio is a trimmed version
   * of the full video, containing only the specified time range.
   *
   * This field tracks cost optimization: by trimming the video before
   * transcription, users pay only for the relevant portion of the content.
   *
   * If omitted, the cached audio contains the full video (backward compatible).
   *
   * @example
   * ```json
   * {
   *   "extractionRange": {
   *     "startTime": "01:30",
   *     "endTime": "15:00"
   *   }
   * }
   * ```
   */
  extractionRange?: ExtractionRange;
}

/**
 * Page definition extracted from text-based transcript with page breaks.
 *
 * Used in text-based workflow where educators mark page breaks in transcript.
 * Contains page structure before timestamp derivation.
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */
export interface PageDefinition {
  /**
   * Page number (1-based, sequential)
   */
  pageNumber: number;

  /**
   * Page title (extracted from markdown heading or auto-generated)
   */
  title: string;

  /**
   * Page content text (between page break delimiters)
   * Whitespace normalized for matching (multiple spaces → single space)
   */
  text: string;
}

/**
 * Matched transcript segments for a page.
 *
 * Result of matching page text to Whisper segments using SegmentMatcher.
 * Includes confidence score from similarity matching.
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */
export interface MatchedSegment {
  /**
   * Page number (1-based)
   */
  pageNumber: number;

  /**
   * Matched Whisper segments for this page
   * Can include multiple segments for pages spanning segment boundaries
   */
  segments: TranscriptSegment[];

  /**
   * Match confidence score (0.0-1.0)
   * 1.0 = exact match after normalization
   * 0.85-0.99 = tolerant mode match (minor edits detected)
   * 0.60-0.84 = fuzzy mode match (significant edits detected)
   */
  confidence: number;
}

/**
 * Derived timestamp for a page based on matched segments.
 *
 * Calculated from matched Whisper segment boundaries.
 * Used by AudioSplitter to generate audio segments.
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */
export interface DerivedTimestamp {
  /**
   * Page number (1-based)
   */
  pageNumber: number;

  /**
   * Derived start time in seconds (from first matched segment)
   * Preserves Whisper's decimal precision (e.g., 9.4, 17.6)
   */
  startTime: number;

  /**
   * Derived end time in seconds (from last matched segment)
   * Preserves Whisper's decimal precision (e.g., 24.1, 35.8)
   */
  endTime: number;

  /**
   * Page duration in seconds (endTime - startTime)
   * Calculated field for validation and display
   */
  duration: number;
}
