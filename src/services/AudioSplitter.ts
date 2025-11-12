/**
 * AudioSplitter service for splitting audio at specific timestamps.
 *
 * Responsibilities:
 * - Parse timestamps in MM:SS or HH:MM:SS format
 * - Validate timestamp ranges
 * - Split audio using ffmpeg with copy codec (no re-encoding)
 * - Generate sequential output file names (page1.mp3, page2.mp3, etc.)
 * - Maintain ±0.1 second precision
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

import * as fsExtra from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { AudioSegment } from "./types/YouTubeExtractorTypes";

const execAsync = promisify(exec);

/**
 * Timestamp segment definition for audio splitting
 */
export interface TimestampSegment {
  pageNumber: number;
  startTime: number; // seconds
  endTime: number; // seconds
}

/**
 * AudioSplitter splits audio files at precise timestamps using ffmpeg.
 *
 * Features:
 * - High-precision timestamp parsing
 * - Validation for overlaps and out-of-range timestamps
 * - Copy codec (no re-encoding) for quality preservation
 * - Sequential output naming
 * - Edge case handling (start at 0:00, end at video duration)
 */
export class AudioSplitter {
  private outputDirectory: string;

  /**
   * Creates a new AudioSplitter instance.
   * @param outputDirectory Directory for output segments (defaults to ./audio-segments)
   */
  constructor(outputDirectory?: string) {
    this.outputDirectory = outputDirectory || path.join(process.cwd(), "audio-segments");
  }

  /**
   * Parses timestamp string to seconds.
   *
   * Supported formats:
   * - MM:SS (e.g., "01:30" = 90 seconds)
   * - M:SS (e.g., "5:00" = 300 seconds)
   * - HH:MM:SS (e.g., "01:30:45" = 5445 seconds)
   *
   * @param timeString Timestamp in MM:SS or HH:MM:SS format
   * @returns Time in seconds
   * @throws Error if format is invalid
   */
  public parseTimestamp(timeString: string): number {
    const parts = timeString.split(":").map(Number);

    if (parts.length === 2) {
      // MM:SS or M:SS format
      const [minutes, seconds] = parts;
      if (isNaN(minutes) || isNaN(seconds) || seconds < 0 || seconds >= 60) {
        throw new Error(`Invalid timestamp format: ${timeString}. Expected MM:SS format.`);
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
        throw new Error(`Invalid timestamp format: ${timeString}. Expected HH:MM:SS format.`);
      }
      return hours * 3600 + minutes * 60 + seconds;
    } else {
      throw new Error(`Invalid timestamp format: ${timeString}. Expected MM:SS or HH:MM:SS format.`);
    }
  }

  /**
   * Formats seconds to timestamp string (MM:SS or HH:MM:SS).
   * @param seconds Time in seconds
   * @returns Timestamp string
   */
  public formatTimestamp(seconds: number): string {
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
   * Validates timestamp segments for overlaps and out-of-range values.
   *
   * Validation rules:
   * - End time must be after start time
   * - Segments must not overlap (unless explicitly allowed)
   * - End times must not exceed video duration
   *
   * @param segments Array of timestamp segments
   * @param duration Video duration in seconds
   * @throws Error if validation fails
   */
  public validateTimestamps(segments: TimestampSegment[], duration: number): void {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Validate: end time must be after start time
      if (segment.endTime <= segment.startTime) {
        throw new Error(
          `Page ${segment.pageNumber}: end time (${this.formatTimestamp(
            segment.endTime
          )}) must be after start time (${this.formatTimestamp(segment.startTime)})`
        );
      }

      // Validate: end time must not exceed duration
      if (segment.endTime > duration + 1) {
        // Allow 1 second tolerance
        throw new Error(
          `Page ${segment.pageNumber}: end time (${this.formatTimestamp(
            segment.endTime
          )}) is beyond video duration (${this.formatTimestamp(duration)})`
        );
      }

      // Check for overlaps with next segment
      if (i < segments.length - 1) {
        const nextSegment = segments[i + 1];
        if (segment.endTime > nextSegment.startTime) {
          throw new Error(
            `Page ${segment.pageNumber} and ${nextSegment.pageNumber}: timestamps overlap. ` +
              `Page ${segment.pageNumber} ends at ${this.formatTimestamp(segment.endTime)}, ` +
              `but page ${nextSegment.pageNumber} starts at ${this.formatTimestamp(
                nextSegment.startTime
              )}`
          );
        }
      }
    }
  }

  /**
   * Generates output file name for a segment.
   * @param pageNumber Page number (1-based)
   * @returns File name (e.g., "page1.mp3")
   */
  public generateSegmentFileName(pageNumber: number): string {
    return `page${pageNumber}.mp3`;
  }

  /**
   * Checks if ffmpeg is installed on the system.
   * @throws Error with installation instructions if not found
   */
  private async checkFfmpegInstalled(): Promise<void> {
    try {
      await execAsync("ffmpeg -version");
    } catch (error) {
      throw new Error(
        "ffmpeg is not installed. Please install it:\n\n" +
          "macOS:   brew install ffmpeg\n" +
          "Ubuntu:  apt-get install ffmpeg\n" +
          "Windows: Download from https://ffmpeg.org/download.html\n"
      );
    }
  }

  /**
   * Splits audio at specified timestamps using ffmpeg.
   *
   * Uses ffmpeg with copy codec (no re-encoding):
   * `ffmpeg -i input.mp3 -ss START -to END -c copy output.mp3`
   *
   * Achieves ±0.1 second precision using high-precision flags.
   *
   * @param audioPath Path to input audio file
   * @param segments Array of timestamp segments
   * @param duration Video duration in seconds
   * @returns Array of AudioSegment objects with output paths
   * @throws Error if ffmpeg fails or validation fails
   */
  public async splitAudio(
    audioPath: string,
    segments: TimestampSegment[],
    duration: number
  ): Promise<AudioSegment[]> {
    // Check ffmpeg installation
    await this.checkFfmpegInstalled();

    // Validate timestamps
    this.validateTimestamps(segments, duration);

    // Ensure output directory exists
    await fsExtra.ensureDir(this.outputDirectory);

    // Process each segment
    const results: AudioSegment[] = [];

    for (const segment of segments) {
      const outputFileName = this.generateSegmentFileName(segment.pageNumber);
      const outputPath = path.join(this.outputDirectory, outputFileName);

      await this.generateSegment(audioPath, outputPath, segment.startTime, segment.endTime);

      results.push({
        pageNumber: segment.pageNumber,
        filePath: outputPath,
        startTime: segment.startTime,
        endTime: segment.endTime
      });
    }

    return results;
  }

  /**
   * Generates a single audio segment using ffmpeg.
   *
   * Uses copy codec to preserve audio quality without re-encoding.
   * High-precision flags: `-ss` (seek start) and `-to` (seek end).
   *
   * @param inputPath Input audio file path
   * @param outputPath Output segment file path
   * @param startTime Start time in seconds
   * @param endTime End time in seconds
   * @private
   */
  private async generateSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    endTime: number
  ): Promise<void> {
    // Use high-precision ffmpeg command
    // -ss: seek to start position
    // -to: seek to end position
    // -c copy: use copy codec (no re-encoding)
    const command = `ffmpeg -y -i "${inputPath}" -ss ${startTime} -to ${endTime} -c copy "${outputPath}"`;

    try {
      await execAsync(command);
    } catch (error: any) {
      throw new Error(`Failed to generate audio segment: ${error.message}`);
    }
  }

  /**
   * Cleans up existing segments in output directory.
   * Useful for regenerating segments from scratch.
   */
  public async cleanupSegments(): Promise<void> {
    if (fsExtra.existsSync(this.outputDirectory)) {
      const files = await fsExtra.readdir(this.outputDirectory);
      for (const file of files) {
        if (file.endsWith(".mp3")) {
          await fsExtra.remove(path.join(this.outputDirectory, file));
        }
      }
    }
  }

  /**
   * Gets the output directory path.
   * @returns Absolute path to output directory
   */
  public getOutputDirectory(): string {
    return this.outputDirectory;
  }
}
