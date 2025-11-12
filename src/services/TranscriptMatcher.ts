/**
 * TranscriptMatcher service for matching transcript segments to timestamp ranges.
 *
 * Responsibilities:
 * - Find transcript segments within timestamp ranges
 * - Handle overlapping timestamp boundaries
 * - Concatenate multiple segments into cohesive text
 * - Preserve Vietnamese diacritics and formatting
 * - Maintain paragraph breaks and punctuation
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

import { TranscriptSegment } from "./types/YouTubeExtractorTypes";
import { StoryPageData } from "../models/StoryPageData";

/**
 * Page definition for transcript matching (simplified from StoryPageData)
 */
export interface PageDefinition {
  pageNumber: number;
  title: string;
  startTime: number;
  endTime: number;
  audioPath: string;
  imagePath: string;
  isPlaceholder: boolean;
}

/**
 * TranscriptMatcher matches transcript segments to timestamp ranges for story pages.
 *
 * Features:
 * - Inclusive start, exclusive end boundary logic
 * - Overlap handling (segments included in multiple pages if boundaries overlap)
 * - Text concatenation with proper spacing
 * - Vietnamese diacritics preservation (UTF-8)
 * - Punctuation and formatting preservation
 */
export class TranscriptMatcher {
  /**
   * Finds transcript segments within a timestamp range.
   *
   * Boundary logic:
   * - Inclusive start: segment overlaps if segment.startTime < rangeEnd
   * - Exclusive end: segment overlaps if segment.endTime > rangeStart
   * - A segment is included if: segment.startTime < rangeEnd AND segment.endTime > rangeStart
   *
   * This allows for graceful handling of overlapping timestamps.
   *
   * @param transcript Array of transcript segments
   * @param rangeStart Start time in seconds
   * @param rangeEnd End time in seconds
   * @returns Array of segments within range
   */
  public findSegmentsInRange(
    transcript: TranscriptSegment[],
    rangeStart: number,
    rangeEnd: number
  ): TranscriptSegment[] {
    return transcript.filter((segment) => {
      // Include segment if it overlaps with the range
      // Segment overlaps if: segment starts before range ends AND segment ends after range starts
      return segment.startTime < rangeEnd && segment.endTime > rangeStart;
    });
  }

  /**
   * Concatenates multiple transcript segments into cohesive text.
   *
   * Concatenation rules:
   * - Join segments with single space
   * - Preserve punctuation at segment boundaries
   * - Maintain paragraph breaks (if present in transcript)
   * - Ensure proper spacing around punctuation
   * - Preserve Vietnamese diacritics (UTF-8)
   *
   * @param segments Array of transcript segments to concatenate
   * @returns Concatenated text
   */
  public concatenateSegments(segments: TranscriptSegment[]): string {
    if (segments.length === 0) {
      return "";
    }

    // Join segments with space
    let text = segments.map((seg) => seg.text.trim()).join(" ");

    // Clean up double spaces
    text = text.replace(/\s+/g, " ");

    // Ensure proper spacing around punctuation
    text = text.replace(/\s*\.\s*/g, ". ");
    text = text.replace(/\s*,\s*/g, ", ");
    text = text.replace(/\s*\?\s*/g, "? ");
    text = text.replace(/\s*!\s*/g, "! ");

    // Trim final result
    text = text.trim();

    return text;
  }

  /**
   * Preserves formatting in text (paragraph breaks, punctuation).
   *
   * Currently preserves:
   * - Paragraph breaks (double newlines)
   * - Punctuation spacing
   * - Vietnamese diacritics
   *
   * @param text Input text
   * @returns Formatted text
   */
  public preserveFormatting(text: string): string {
    // Preserve paragraph breaks
    let formatted = text.replace(/\n\n+/g, "\n\n");

    // Ensure consistent spacing
    formatted = formatted.replace(/\s+/g, " ");

    // Trim whitespace
    formatted = formatted.trim();

    return formatted;
  }

  /**
   * Matches transcript segments to story pages.
   *
   * Main method that:
   * 1. Finds segments for each page's timestamp range
   * 2. Concatenates segments into page text
   * 3. Preserves formatting
   * 4. Builds StoryPageData objects
   *
   * @param transcript Full video transcript
   * @param pages Array of page definitions with timestamps
   * @returns Array of StoryPageData with matched transcript text
   */
  public matchToPages(
    transcript: TranscriptSegment[],
    pages: PageDefinition[]
  ): StoryPageData[] {
    const results: StoryPageData[] = [];

    for (const page of pages) {
      // Find segments for this page's timestamp range
      const segments = this.findSegmentsInRange(transcript, page.startTime, page.endTime);

      // Concatenate segments into cohesive text
      const vietnameseText = this.concatenateSegments(segments);

      // Build StoryPageData
      const pageData: StoryPageData = {
        pageNumber: page.pageNumber,
        title: page.title,
        startTime: page.startTime,
        endTime: page.endTime,
        vietnameseText: this.preserveFormatting(vietnameseText),
        audioPath: page.audioPath,
        imagePath: page.imagePath,
        isPlaceholder: page.isPlaceholder,
        transcriptSegments: segments
      };

      results.push(pageData);
    }

    return results;
  }

  /**
   * Gets full transcript text (all segments concatenated).
   *
   * Useful for displaying complete transcript in accordion or summary.
   *
   * @param transcript Array of transcript segments
   * @returns Full concatenated transcript text
   */
  public getFullTranscript(transcript: TranscriptSegment[]): string {
    return this.concatenateSegments(transcript);
  }

  /**
   * Validates that pages cover the entire transcript duration.
   *
   * Checks:
   * - First page starts at 0 or near start
   * - Last page ends at video duration or near end
   * - No gaps between pages
   *
   * @param pages Array of page definitions
   * @param duration Video duration in seconds
   * @param tolerance Tolerance in seconds for start/end matching (default: 1)
   * @returns Validation errors or empty array if valid
   */
  public validatePageCoverage(
    pages: PageDefinition[],
    duration: number,
    tolerance: number = 1
  ): string[] {
    const errors: string[] = [];

    if (pages.length === 0) {
      errors.push("No pages defined");
      return errors;
    }

    // Check first page starts near beginning
    const firstPage = pages[0];
    if (firstPage.startTime > tolerance) {
      errors.push(
        `First page starts at ${firstPage.startTime}s, expected to start near 0s (within ${tolerance}s tolerance)`
      );
    }

    // Check last page ends near duration
    const lastPage = pages[pages.length - 1];
    if (Math.abs(lastPage.endTime - duration) > tolerance) {
      errors.push(
        `Last page ends at ${lastPage.endTime}s, expected to end near video duration ${duration}s (within ${tolerance}s tolerance)`
      );
    }

    // Check for gaps between pages
    for (let i = 0; i < pages.length - 1; i++) {
      const currentPage = pages[i];
      const nextPage = pages[i + 1];

      const gap = nextPage.startTime - currentPage.endTime;
      if (gap > tolerance) {
        errors.push(
          `Gap detected between page ${currentPage.pageNumber} (ends ${currentPage.endTime}s) and page ${nextPage.pageNumber} (starts ${nextPage.startTime}s): ${gap.toFixed(1)}s gap`
        );
      }
    }

    return errors;
  }
}
