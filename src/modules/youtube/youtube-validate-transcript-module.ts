/**
 * YouTube Validate Transcript CLI Module for validating transcript format.
 *
 * This module validates the edited transcript format and shows a page structure
 * preview WITHOUT generating the full H5P package. It's a dry-run validation
 * tool to catch format errors early in the workflow.
 *
 * Command: youtube-validate-transcript <config.yaml>
 * Purpose: Format validation + page structure preview (zero cost, fast feedback)
 *
 * Phase: Text-Based Page Breaks for Interactive Books
 */

import * as path from "path";
import * as yargs from "yargs";
import * as fsExtra from "fs-extra";
import * as yaml from "js-yaml";

import { StoryConfig } from "../../models/StoryConfig";
import { YouTubeExtractor } from "../../services/YouTubeExtractor";
import { TranscriptFileParser } from "../../services/transcription/TranscriptFileParser";
import { SegmentMatcher } from "../../services/transcription/SegmentMatcher";
import { TimestampDeriver } from "../../services/transcription/TimestampDeriver";
import { TranscriptSegment, MatchedSegment } from "../../services/types/YouTubeExtractorTypes";

/**
 * YouTubeValidateTranscriptModule is the CLI command handler for youtube-validate-transcript.
 *
 * This command validates the edited transcript format and shows a preview of the
 * page structure WITHOUT generating the H5P package. It's a sanity-check tool
 * to catch format errors early.
 *
 * Workflow:
 * 1. Parse config YAML
 * 2. Load edited transcript from config.transcriptSource
 * 3. Parse transcript with TranscriptFileParser (validates format)
 * 4. Load cached Whisper segments
 * 5. Match pages to segments with SegmentMatcher
 * 6. Derive timestamps with TimestampDeriver
 * 7. Display validation report and page structure preview
 */
export class YouTubeValidateTranscriptModule implements yargs.CommandModule {
  public command = "youtube-validate-transcript <config>";
  public describe =
    "Validate transcript format and show page structure preview (no H5P generation). \
    Run this before youtube-extract to catch format errors early. \
    Zero cost - just validates the edited transcript format.";

  public builder = (y: yargs.Argv) =>
    y
      .positional("config", {
        describe: "YAML config file with transcriptSource field",
        type: "string",
      })
      .option("verbose", {
        describe: "Show detailed processing logs",
        default: false,
        type: "boolean",
        alias: "v",
      })
      .example(
        "$0 youtube-validate-transcript ./config.yaml",
        "Validate transcript format and show preview"
      )
      .example(
        "$0 youtube-validate-transcript ./config.yaml --verbose",
        "Validate with detailed logs"
      );

  public handler = async (argv) => {
    await this.runValidateTranscript(argv.config, argv.verbose);
  };

  private async runValidateTranscript(
    configPath: string,
    verbose: boolean
  ): Promise<void> {
    console.log("=== YouTube Transcript Validation ===\n");

    try {
      // Step 1: Parse and validate config YAML
      if (verbose) console.log("Step 1: Parsing config YAML...");
      const config = await this.parseAndValidateConfig(configPath);

      // Validate that transcriptSource is present
      if (!config.transcriptSource) {
        throw new Error(
          "Missing required field: transcriptSource\n\n" +
          "The config must include transcriptSource field pointing to edited transcript.\n" +
          "Example:\n" +
          "  transcriptSource: \".youtube-cache/{VIDEO_ID}/full-transcript-edited.txt\"\n\n" +
          "Run youtube-extract-transcript first to generate the initial transcript."
        );
      }

      if (verbose) {
        console.log(`  - Language: ${config.language}`);
        console.log(`  - Video: ${config.source.url}`);
        console.log(`  - Transcript: ${config.transcriptSource}`);
        console.log(`  - Matching Mode: ${config.matchingMode || "tolerant"}`);
        console.log();
      }

      // Step 2: Extract video ID and locate transcript
      console.log("Step 2: Loading transcript and Whisper cache...");
      const extractor = new YouTubeExtractor();
      const videoId = extractor.extractVideoId(config.source.url);

      if (verbose) console.log(`  - Video ID: ${videoId}`);

      const cacheDir = extractor.getCacheDirectory(videoId);
      const whisperCachePath = path.join(cacheDir, "whisper-transcript.json");

      // Check if Whisper cache exists
      if (!await fsExtra.pathExists(whisperCachePath)) {
        throw new Error(
          `Whisper transcript cache not found: ${whisperCachePath}\n\n` +
          "Run youtube-extract-transcript first to generate the Whisper transcript."
        );
      }

      // Load transcript file
      const transcriptPath = path.resolve(config.transcriptSource);
      if (!await fsExtra.pathExists(transcriptPath)) {
        throw new Error(
          `Transcript file not found: ${config.transcriptSource}\n\n` +
          "Make sure you've edited the transcript and saved it at this location."
        );
      }

      console.log(`  ✓ Transcript file found: ${config.transcriptSource}`);
      console.log(`  ✓ Whisper cache found`);
      if (verbose) console.log();

      // Step 3: Parse transcript
      console.log("Step 3: Parsing transcript...");
      const parser = new TranscriptFileParser(transcriptPath);
      const pages = await parser.parse();

      console.log(`  ✓ Format valid: ${pages.length} pages found`);
      console.log(`  ✓ All page breaks formatted correctly`);
      console.log(`  ✓ All pages have content`);

      if (verbose) {
        pages.forEach((page) => {
          const textPreview = page.text.substring(0, 50).replace(/\n/g, " ");
          console.log(`    - Page ${page.pageNumber}: ${page.title || "(no title)"} - ${textPreview}...`);
        });
        console.log();
      }

      // Step 4: Load Whisper segments
      console.log("Step 4: Matching text to Whisper segments...");
      const whisperSegments: TranscriptSegment[] = await fsExtra.readJson(whisperCachePath, { encoding: "utf-8" });

      // Step 5: Match pages to segments
      const matchingMode = config.matchingMode || "tolerant";
      const matcher = new SegmentMatcher(whisperSegments, matchingMode);

      const matchedSegments: MatchedSegment[] = pages.map((page) => {
        const matched = matcher.matchPageToSegments(page.text);
        // Override pageNumber (SegmentMatcher sets it to 0)
        return {
          ...matched,
          pageNumber: page.pageNumber
        };
      });

      console.log(`  ✓ All ${pages.length} pages matched to Whisper segments`);
      if (verbose) console.log();

      // Step 6: Derive timestamps
      console.log("Step 5: Deriving timestamps...");
      const timestamps = TimestampDeriver.deriveTimestamps(matchedSegments);

      console.log(`  ✓ Timestamps derived for ${timestamps.length} pages`);
      if (verbose) console.log();

      // Step 7: Generate validation report
      console.log("\n=== Validation Report ===\n");

      // Check for warnings
      let hasWarnings = false;
      const warnings: string[] = [];

      timestamps.forEach((ts, index) => {
        const matched = matchedSegments[index];

        // Check for very short pages
        if (ts.duration < 5) {
          warnings.push(`⚠️  Page ${ts.pageNumber}: Very short duration (${ts.duration.toFixed(1)}s)`);
          hasWarnings = true;
        }

        // Check for very long pages
        if (ts.duration > 120) {
          warnings.push(`⚠️  Page ${ts.pageNumber}: Very long duration (${ts.duration.toFixed(1)}s, >2 minutes)`);
          hasWarnings = true;
        }

        // Check for low confidence in tolerant mode
        if (matchingMode === "tolerant" && matched.confidence < 0.9) {
          warnings.push(`⚠️  Page ${ts.pageNumber}: Low match confidence (${(matched.confidence * 100).toFixed(1)}%)`);
          hasWarnings = true;
        }

        // Check for low confidence in fuzzy mode
        if (matchingMode === "fuzzy" && matched.confidence < 0.8) {
          warnings.push(`⚠️  Page ${ts.pageNumber}: Low match confidence (${(matched.confidence * 100).toFixed(1)}%)`);
          hasWarnings = true;
        }
      });

      if (hasWarnings) {
        warnings.forEach((warning) => console.log(warning));
        console.log();
      }

      // Check if all pages have 100% match
      const allPerfect = matchedSegments.every((m) => m.confidence === 1.0);
      if (allPerfect) {
        console.log("ℹ️  All pages have 100% match (unedited transcript)\n");
      }

      // Page structure preview
      console.log("📊 Story Structure:\n");

      const totalDuration = timestamps.reduce((sum, ts) => sum + ts.duration, 0);

      timestamps.forEach((ts, index) => {
        const matched = matchedSegments[index];
        const page = pages[index];
        const title = page.title || `Page ${page.pageNumber}`;
        const duration = ts.duration.toFixed(1);
        const confidence = (matched.confidence * 100).toFixed(0);

        let status = "✅";
        if (matched.confidence < 1.0) {
          status = "⚠️";
        }
        if (ts.duration < 5) {
          status = "⚠️";
        }

        console.log(`  Page ${ts.pageNumber}: ${title} (${duration}s) - ${status} ${confidence}% match`);
      });

      console.log();
      const minutes = Math.floor(totalDuration / 60);
      const seconds = Math.floor(totalDuration % 60);
      console.log(`Total duration: ${minutes}:${String(seconds).padStart(2, '0')} (${totalDuration.toFixed(1)} seconds)`);
      console.log();

      // Success message
      console.log("✅ Validation Passed!\n");
      console.log("Next step:");
      console.log(`  node ./dist/index.js youtube-extract ${configPath} --output story.yaml`);
      console.log();

    } catch (error) {
      console.error("\n❌ Validation failed:");

      if (error instanceof Error) {
        console.error(`  ${error.message}`);
        if (verbose && error.stack) {
          console.error("\nStack trace:");
          console.error(error.stack);
        }
      } else {
        console.error(`  ${error}`);
      }

      process.exit(1);
    }
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

    return config;
  }
}
