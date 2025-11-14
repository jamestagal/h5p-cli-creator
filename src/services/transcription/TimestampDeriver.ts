/**
 * TimestampDeriver service for deriving page timestamps from matched Whisper segments.
 *
 * Responsibilities:
 * - Derive startTime from first matched segment
 * - Derive endTime from last matched segment
 * - Calculate exact duration (endTime - startTime)
 * - Preserve Whisper's decimal precision (9.4s, 17.6s)
 * - Validate segment arrays
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import { MatchedSegment, DerivedTimestamp } from "../types/YouTubeExtractorTypes";

/**
 * TimestampDeriver derives page timestamps from matched Whisper segments.
 *
 * Stateless service (static methods only).
 *
 * Key features:
 * - **Decimal precision**: Preserves Whisper's exact timestamps (9.4s, 17.6s, 24.1s)
 * - **Multi-segment support**: Handles pages spanning multiple segments
 * - **Duration calculation**: Exact audio duration for each page
 * - **Validation**: Ensures segments are valid and chronological
 *
 * Output format includes duration field for validation and display.
 * Can be converted to AudioSplitter's TimestampSegment format by omitting duration.
 */
export class TimestampDeriver {
  /**
   * Derives timestamps from matched segments for all pages.
   *
   * For each page:
   * - startTime = first segment's startTime
   * - endTime = last segment's endTime
   * - duration = endTime - startTime
   *
   * @param matchedSegments Array of matched segments for each page
   * @returns Array of derived timestamps with duration
   * @throws Error if segments array is empty or invalid
   */
  public static deriveTimestamps(matchedSegments: MatchedSegment[]): DerivedTimestamp[] {
    const result: DerivedTimestamp[] = [];

    for (const matched of matchedSegments) {
      // Validate segments array
      if (!matched.segments || matched.segments.length === 0) {
        throw new Error(
          `Page ${matched.pageNumber} has no segments. ` +
          `Each page must have at least one matched segment.`
        );
      }

      // Get first and last segments
      const firstSegment = matched.segments[0];
      const lastSegment = matched.segments[matched.segments.length - 1];

      // Derive timestamps
      const startTime = firstSegment.startTime;
      const endTime = lastSegment.endTime;
      const duration = endTime - startTime;

      // Validate timestamps
      if (endTime <= startTime) {
        throw new Error(
          `Page ${matched.pageNumber}: Invalid timestamps. ` +
          `endTime (${endTime}) must be greater than startTime (${startTime})`
        );
      }

      // Warn if page very short (< 3 seconds)
      if (duration < 3) {
        console.warn(
          `⚠️  Warning: Page ${matched.pageNumber} is very short (${duration.toFixed(1)}s). ` +
          `Consider combining with adjacent pages.`
        );
      }

      // Warn if page very long (> 120 seconds / 2 minutes)
      if (duration > 120) {
        console.warn(
          `⚠️  Warning: Page ${matched.pageNumber} is very long (${duration.toFixed(1)}s). ` +
          `Consider splitting into multiple pages.`
        );
      }

      result.push({
        pageNumber: matched.pageNumber,
        startTime,
        endTime,
        duration
      });
    }

    return result;
  }

  /**
   * Formats duration in seconds to MM:SS format.
   *
   * Utility method for displaying durations in human-readable format.
   *
   * @param seconds Duration in seconds
   * @returns Formatted time string (MM:SS)
   */
  public static formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}
