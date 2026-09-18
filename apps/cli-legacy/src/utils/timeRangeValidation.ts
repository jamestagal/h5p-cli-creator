/**
 * Time range validation utilities for YouTube video extraction.
 *
 * Provides parsing and validation functions for video time range specifications.
 * Ensures startTime/endTime are valid and within video duration before
 * expensive operations like downloading and transcription.
 *
 * Phase 3: YouTube Extraction Improvements - Time Range Specification
 */

/**
 * Parses timestamp string to seconds.
 *
 * Supported formats:
 * - MM:SS (e.g., "01:30" = 90 seconds)
 * - M:SS (e.g., "5:00" = 300 seconds)
 * - HH:MM:SS (e.g., "01:30:45" = 5445 seconds)
 *
 * This function provides the same parsing logic as AudioSplitter.parseTimestamp()
 * but is available as a standalone utility for use across the codebase.
 *
 * @param timeString Timestamp in MM:SS or HH:MM:SS format
 * @returns Time in seconds
 * @throws Error if format is invalid
 *
 * @example
 * parseTimeToSeconds("01:30")      // Returns 90
 * parseTimeToSeconds("5:00")       // Returns 300
 * parseTimeToSeconds("01:30:45")   // Returns 5445
 */
export function parseTimeToSeconds(timeString: string): number {
  const parts = timeString.split(":").map(Number);

  if (parts.length === 2) {
    // MM:SS or M:SS format
    const [minutes, seconds] = parts;
    if (isNaN(minutes) || isNaN(seconds) || seconds < 0 || seconds >= 60) {
      throw new Error(
        `Invalid timestamp format: ${timeString}. Expected MM:SS format with valid seconds (0-59).`
      );
    }
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      isNaN(seconds) ||
      minutes < 0 ||
      minutes >= 60 ||
      seconds < 0 ||
      seconds >= 60
    ) {
      throw new Error(
        `Invalid timestamp format: ${timeString}. Expected HH:MM:SS format with valid minutes (0-59) and seconds (0-59).`
      );
    }
    return hours * 3600 + minutes * 60 + seconds;
  } else {
    throw new Error(
      `Invalid timestamp format: ${timeString}. Expected MM:SS or HH:MM:SS format.`
    );
  }
}

/**
 * Formats seconds to timestamp string (MM:SS or HH:MM:SS).
 *
 * Used for displaying timestamps in error messages and console output.
 *
 * @param seconds Time in seconds
 * @returns Timestamp string in MM:SS or HH:MM:SS format
 *
 * @example
 * formatSecondsToTime(90)      // Returns "01:30"
 * formatSecondsToTime(5445)    // Returns "01:30:45"
 */
export function formatSecondsToTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

/**
 * Validates time range for video extraction.
 *
 * Validation rules:
 * 1. startTime must be less than endTime
 * 2. startTime must be >= 0
 * 3. endTime must be within video duration (with 1 second tolerance)
 * 4. Range must be at least 1 second long
 *
 * Throws descriptive errors with formatted timestamps for user-friendly messages.
 *
 * @param startTime Start time string in MM:SS or HH:MM:SS format
 * @param endTime End time string in MM:SS or HH:MM:SS format
 * @param videoDuration Video duration in seconds
 * @throws Error if validation fails with clear, actionable message
 *
 * @example Valid usage:
 * ```typescript
 * // Valid: 1:30 to 15:00 in a 20-minute video
 * validateTimeRange("01:30", "15:00", 1200);  // OK
 *
 * // Invalid: start time after end time
 * validateTimeRange("15:00", "01:30", 1200);  // Throws error
 *
 * // Invalid: end time beyond video duration
 * validateTimeRange("01:30", "25:00", 1200);  // Throws error
 * ```
 */
export function validateTimeRange(
  startTime: string,
  endTime: string,
  videoDuration: number
): void {
  // Parse timestamps to seconds
  let startSeconds: number;
  let endSeconds: number;

  try {
    startSeconds = parseTimeToSeconds(startTime);
  } catch (error: any) {
    throw new Error(`Invalid startTime: ${error.message}`);
  }

  try {
    endSeconds = parseTimeToSeconds(endTime);
  } catch (error: any) {
    throw new Error(`Invalid endTime: ${error.message}`);
  }

  // Validate: startTime must be non-negative
  if (startSeconds < 0) {
    throw new Error(
      `Invalid time range: startTime cannot be negative (got ${startTime}).`
    );
  }

  // Validate: startTime must be before endTime
  if (startSeconds >= endSeconds) {
    throw new Error(
      `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}). ` +
        `The start time is at ${startSeconds} seconds and end time is at ${endSeconds} seconds.`
    );
  }

  // Validate: range must be at least 1 second
  if (endSeconds - startSeconds < 1) {
    throw new Error(
      `Invalid time range: extraction range must be at least 1 second long. ` +
        `Got ${endSeconds - startSeconds} seconds between ${startTime} and ${endTime}.`
    );
  }

  // Validate: endTime must not exceed video duration (with 1 second tolerance)
  if (endSeconds > videoDuration + 1) {
    const durationFormatted = formatSecondsToTime(videoDuration);
    throw new Error(
      `Invalid time range: endTime (${endTime}) exceeds video duration (${durationFormatted}). ` +
        `The video is ${videoDuration} seconds long, but you specified an end time of ${endSeconds} seconds.`
    );
  }

  // Validate: startTime must be within video duration
  if (startSeconds > videoDuration) {
    const durationFormatted = formatSecondsToTime(videoDuration);
    throw new Error(
      `Invalid time range: startTime (${startTime}) exceeds video duration (${durationFormatted}). ` +
        `The video is only ${videoDuration} seconds long.`
    );
  }
}

/**
 * Validates page timestamps against trimmed audio duration.
 *
 * When a video is trimmed using startTime/endTime, page timestamps must be
 * relative to the trimmed audio (starting at 00:00, not the original video time).
 *
 * This function validates that all page timestamps are within the trimmed duration.
 *
 * @param pageStartTime Page start time in MM:SS format
 * @param pageEndTime Page end time in MM:SS format
 * @param trimmedDuration Trimmed audio duration in seconds
 * @param pageNumber Page number for error messages
 * @throws Error if page timestamps exceed trimmed audio duration
 *
 * @example
 * ```typescript
 * // Video trimmed from 01:30 to 15:00 (13.5 minutes = 810 seconds)
 * // Page timestamps are relative to trimmed audio (00:00 = 01:30 in original video)
 *
 * validatePageTimestamps("00:00", "00:45", 810, 1);  // OK
 * validatePageTimestamps("05:00", "10:00", 810, 2);  // OK
 * validatePageTimestamps("12:00", "20:00", 810, 3);  // Error: exceeds 13:30 duration
 * ```
 */
export function validatePageTimestamps(
  pageStartTime: string,
  pageEndTime: string,
  trimmedDuration: number,
  pageNumber: number
): void {
  let startSeconds: number;
  let endSeconds: number;

  try {
    startSeconds = parseTimeToSeconds(pageStartTime);
  } catch (error: any) {
    throw new Error(
      `Page ${pageNumber}: Invalid startTime format. ${error.message}`
    );
  }

  try {
    endSeconds = parseTimeToSeconds(pageEndTime);
  } catch (error: any) {
    throw new Error(
      `Page ${pageNumber}: Invalid endTime format. ${error.message}`
    );
  }

  // Validate: page startTime must be non-negative
  if (startSeconds < 0) {
    throw new Error(
      `Page ${pageNumber}: startTime cannot be negative (got ${pageStartTime}).`
    );
  }

  // Validate: page endTime must be after startTime
  if (endSeconds <= startSeconds) {
    throw new Error(
      `Page ${pageNumber}: endTime (${pageEndTime}) must be after startTime (${pageStartTime}).`
    );
  }

  // Validate: page endTime must not exceed trimmed audio duration
  if (endSeconds > trimmedDuration + 1) {
    // Allow 1 second tolerance
    const durationFormatted = formatSecondsToTime(trimmedDuration);
    throw new Error(
      `Page ${pageNumber}: endTime (${pageEndTime}) exceeds trimmed audio duration (${durationFormatted}). ` +
        `The trimmed audio is ${trimmedDuration} seconds long, but page ${pageNumber} ends at ${endSeconds} seconds.`
    );
  }
}
