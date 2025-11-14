/**
 * YouTube Extract Transcript CLI Module for extracting transcripts only.
 *
 * This module extracts and formats transcripts from YouTube videos for human review
 * and page break marking. It's the first step in the text-based page breaks workflow.
 *
 * Command: youtube-extract-transcript <config.yaml>
 * Output: .youtube-cache/{VIDEO_ID}/full-transcript.txt
 *
 * Phase: Text-Based Page Breaks for Interactive Books
 */

import * as path from "path";
import * as yargs from "yargs";
import * as fsExtra from "fs-extra";
import * as yaml from "js-yaml";

import { StoryConfig } from "../../models/StoryConfig";
import { YouTubeExtractor } from "../../services/YouTubeExtractor";
import { TranscriptSegment } from "../../services/types/YouTubeExtractorTypes";

/**
 * YouTubeExtractTranscriptModule is the CLI command handler for youtube-extract-transcript.
 *
 * This command extracts the transcript from a YouTube video without generating the
 * full Interactive Book. The transcript is saved in human-readable format for
 * educators to review, edit, and mark page breaks.
 *
 * Workflow:
 * 1. Parse config YAML
 * 2. Extract video ID from YouTube URL
 * 3. Download audio and transcribe with Whisper API (or use cache)
 * 4. Format transcript with paragraph breaks
 * 5. Save to .youtube-cache/{VIDEO_ID}/full-transcript.txt
 */
export class YouTubeExtractTranscriptModule implements yargs.CommandModule {
  public command = "youtube-extract-transcript <config>";
  public describe =
    "Extract transcript from YouTube video for review and page break marking. \
    Outputs human-readable transcript to .youtube-cache/{VIDEO_ID}/full-transcript.txt. \
    Requires ffmpeg, yt-dlp, and OPENAI_API_KEY environment variable.";

  public builder = (y: yargs.Argv) =>
    y
      .positional("config", {
        describe: "YAML config file defining video source and language",
        type: "string",
      })
      .option("verbose", {
        describe: "Show detailed processing logs",
        default: false,
        type: "boolean",
        alias: "v",
      })
      .example(
        "$0 youtube-extract-transcript ./config.yaml",
        "Extract transcript from YouTube video"
      )
      .example(
        "$0 youtube-extract-transcript ./config.yaml --verbose",
        "Extract with detailed logs"
      );

  public handler = async (argv) => {
    await this.runExtractTranscript(argv.config, argv.verbose);
  };

  private async runExtractTranscript(
    configPath: string,
    verbose: boolean
  ): Promise<void> {
    console.log("=== YouTube Transcript Extraction ===\n");

    try {
      // Step 1: Parse and validate config YAML
      if (verbose) console.log("Step 1: Parsing config YAML...");
      const config = await this.parseAndValidateConfig(configPath);

      if (verbose) {
        console.log(`  - Language: ${config.language}`);
        console.log(`  - Video: ${config.source.url}`);
        if (config.source.startTime && config.source.endTime) {
          console.log(`  - Time Range: ${config.source.startTime} - ${config.source.endTime}`);
        }
        console.log();
      }

      // Step 2: Extract video ID and check cache
      console.log("Step 2: Extracting from YouTube...");
      const extractor = new YouTubeExtractor();
      const videoId = extractor.extractVideoId(config.source.url);

      if (verbose) console.log(`  - Video ID: ${videoId}`);

      const cacheDir = extractor.getCacheDirectory(videoId);
      const transcriptCachePath = path.join(cacheDir, "whisper-transcript.json");
      const outputPath = path.join(cacheDir, "full-transcript.txt");

      // Check if transcript is already cached
      const isCached = await extractor.isCached(videoId);
      if (isCached) {
        console.log("  ✓ Using cached audio and transcript");
      } else {
        console.log("  - Downloading audio from YouTube...");
        console.log("  - Transcribing audio with Whisper API...");
      }

      // Step 3: Get video metadata and extract transcript
      const metadata = await extractor.getVideoMetadata(config.source.url);

      if (verbose) {
        console.log(`  - Title: "${metadata.title}"`);
        console.log(`  - Duration: ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`);
      }

      // Extract with time range parameters (trimming handled by extractor)
      const extractResult = await extractor.extract(
        config.source.url,
        config.language,
        config.source.startTime,
        config.source.endTime
      );

      const transcript = extractResult.transcript;

      if (!isCached) {
        console.log("  ✓ Audio downloaded");
        console.log("  ✓ Transcript extracted");
      }

      if (verbose) {
        console.log(`  - Transcript segments: ${transcript.length}`);
        console.log();
      }

      // Step 4: Format transcript for human readability
      console.log("Step 3: Formatting transcript...");
      const formattedTranscript = this.formatTranscriptForReview(transcript);

      // Save to cache directory
      await fsExtra.ensureDir(cacheDir);
      await fsExtra.writeFile(outputPath, formattedTranscript, "utf-8");

      console.log(`  ✓ Transcript saved to: ${outputPath}`);
      console.log();

      // Success message with next steps
      console.log("✅ Success!\n");
      console.log("Generated file:");
      console.log(`  📄 ${outputPath}`);
      console.log();
      console.log("Next steps:");
      console.log("  1. Open the transcript file and review the text");
      console.log("  2. Fix any transcription errors");
      console.log("  3. Insert page breaks using --- (triple dash)");
      console.log("  4. Add page titles using # Page N: Title format");
      console.log("  5. Save the edited transcript");
      console.log("  6. Run: youtube-validate-transcript config.yaml (to check format)");
      console.log("  7. Run: youtube-extract config.yaml (to generate story)");
      console.log();

    } catch (error) {
      console.error("\n❌ Extraction failed:");

      if (error instanceof Error) {
        // Handle specific error types with actionable messages
        if (error.message.includes("yt-dlp")) {
          console.error("  Error: yt-dlp not found");
          console.error("\n  Install yt-dlp:");
          console.error("    macOS:    brew install yt-dlp");
          console.error("    Ubuntu:   pip install yt-dlp");
          console.error("    Windows:  Download from https://github.com/yt-dlp/yt-dlp/releases");
        } else if (error.message.includes("ffmpeg")) {
          console.error("  Error: ffmpeg not found");
          console.error("\n  Install ffmpeg:");
          console.error("    macOS:    brew install ffmpeg");
          console.error("    Ubuntu:   sudo apt-get install ffmpeg");
          console.error("    Windows:  Download from https://ffmpeg.org/download.html");
        } else if (error.message.includes("Invalid YouTube URL")) {
          console.error(`  ${error.message}`);
          console.error("\n  Supported formats:");
          console.error("    - https://www.youtube.com/watch?v=VIDEO_ID");
          console.error("    - https://youtu.be/VIDEO_ID");
          console.error("    - https://www.youtube.com/embed/VIDEO_ID");
        } else if (error.message.includes("OPENAI_API_KEY")) {
          console.error("  Error: OPENAI_API_KEY not found");
          console.error("\n  Set OPENAI_API_KEY environment variable:");
          console.error("    export OPENAI_API_KEY='sk-...'");
          console.error("\n  Get API key from: https://platform.openai.com/api-keys");
        } else {
          console.error(`  ${error.message}`);
          if (verbose && error.stack) {
            console.error("\nStack trace:");
            console.error(error.stack);
          }
        }
      } else {
        console.error(`  ${error}`);
      }

      process.exit(1);
    }
  }

  /**
   * Formats transcript segments as human-readable text for review.
   *
   * Converts Whisper API segments to readable format:
   * - Each segment on its own line
   * - Blank line between segments for readability
   * - Preserves UTF-8 encoding (Vietnamese diacritics, French accents)
   * - Preserves paragraph breaks from Whisper punctuation
   *
   * @param segments Array of Whisper transcript segments
   * @returns Formatted transcript text
   */
  private formatTranscriptForReview(segments: TranscriptSegment[]): string {
    // Join segments with double newline (blank line) for readability
    const lines = segments.map((segment) => segment.text.trim());
    return lines.join("\n\n") + "\n";
  }

  /**
   * Parses and validates config YAML file.
   * @param configPath Path to config YAML file
   * @returns Validated StoryConfig
   * @throws Error if config is invalid
   */
  private async parseAndValidateConfig(configPath: string): Promise<StoryConfig> {
    const resolvedPath = path.resolve(configPath);

    if (!fsExtra.existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const configContent = await fsExtra.readFile(resolvedPath, "utf-8");
    const config = yaml.load(configContent) as StoryConfig;

    // Validate required fields
    if (!config.language) {
      throw new Error("Missing required field: language");
    }
    if (!config.source || !config.source.url) {
      throw new Error("Missing required field: source.url");
    }

    // Validate time range format (if specified)
    if (config.source.startTime && !this.isValidExtendedTimestamp(config.source.startTime)) {
      throw new Error(
        `Invalid source.startTime format: ${config.source.startTime}. Expected MM:SS or HH:MM:SS format.`
      );
    }
    if (config.source.endTime && !this.isValidExtendedTimestamp(config.source.endTime)) {
      throw new Error(
        `Invalid source.endTime format: ${config.source.endTime}. Expected MM:SS or HH:MM:SS format.`
      );
    }

    // Validate that both startTime and endTime are specified together
    if ((config.source.startTime && !config.source.endTime) || (!config.source.startTime && config.source.endTime)) {
      throw new Error(
        "Both source.startTime and source.endTime must be specified together. " +
        "Cannot specify only one of them."
      );
    }

    return config;
  }

  /**
   * Validates extended timestamp format (MM:SS or HH:MM:SS).
   */
  private isValidExtendedTimestamp(timestamp: string): boolean {
    return /^\d{1,2}:\d{2}$/.test(timestamp) || /^\d{1,2}:\d{2}:\d{2}$/.test(timestamp);
  }
}
