/**
 * Type definitions for YouTube extraction services.
 *
 * These types define the data structures used throughout the YouTube story extraction pipeline:
 * - Video metadata from YouTube
 * - Transcript segments with timestamps
 * - Audio segments with file paths
 * - Cache metadata for reusing downloads
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
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
}
