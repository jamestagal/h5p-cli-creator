/**
 * YouTube Extract CLI Module for extracting stories from YouTube videos.
 *
 * This module orchestrates the complete YouTube story extraction pipeline:
 * 1. Parse config YAML and validate structure
 * 2. Extract audio and transcript from YouTube (YouTubeExtractor)
 * 3. DUAL-MODE SUPPORT:
 *    - TEXT-BASED MODE: Parse edited transcript, match to segments, derive timestamps
 *    - TIMESTAMP MODE: Use config timestamps directly (legacy, backward compatible)
 * 4. Split audio at timestamps (AudioSplitter)
 * 5. Match transcript to pages (TranscriptMatcher)
 * 6. Translate pages (StoryTranslator)
 * 7. Generate Interactive Book YAML (InteractiveBookYamlGenerator)
 *
 * Phase 3: YouTube Story Extraction for Interactive Books
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import * as path from "path";
import * as yargs from "yargs";
import * as fsExtra from "fs-extra";
import * as yaml from "js-yaml";

import { StoryConfig, isYouTubeIntroPage, isStoryPage, validateConfigMode } from "../../models/StoryConfig";
import { YouTubeExtractor } from "../../services/YouTubeExtractor";
import { AudioSplitter, TimestampSegment } from "../../services/AudioSplitter";
import { TranscriptMatcher, PageDefinition } from "../../services/TranscriptMatcher";
import { StoryTranslator } from "../../services/StoryTranslator";
import { InteractiveBookYamlGenerator } from "../../services/InteractiveBookYamlGenerator";
import { GeminiTranscriptParser } from "../../services/GeminiTranscriptParser";
import { TranscriptSegment, MatchedSegment, DerivedTimestamp } from "../../services/types/YouTubeExtractorTypes";
import { validateTimeRange, validatePageTimestamps, parseTimeToSeconds } from "../../utils/timeRangeValidation";

// Text-based mode services
import { TranscriptFileParser } from "../../services/transcription/TranscriptFileParser";
import { SegmentMatcher } from "../../services/transcription/SegmentMatcher";
import { TimestampDeriver } from "../../services/transcription/TimestampDeriver";
import { PageDefinition as TextPageDefinition } from "../../services/types/YouTubeExtractorTypes";

/**
 * YouTubeExtractModule is the CLI command handler for youtube-extract.
 *
 * Command: youtube-extract <config.yaml>
 * Options: --verbose, --skip-translation, --output
 *
 * Follows the same pattern as FlashcardsModule and InteractiveBookAIModule.
 */
export class YouTubeExtractModule implements yargs.CommandModule {
  public command = "youtube-extract <config>";
  public describe =
    "Extracts audio, transcript, and translations from YouTube video to generate Interactive Book YAML. \
    Supports both text-based (transcriptSource) and timestamp-based (pages) workflows. \
    Requires ffmpeg and yt-dlp system dependencies. Requires OPENAI_API_KEY environment variable for translation.";

  public builder = (y: yargs.Argv) =>
    y
      .positional("config", {
        describe: "YAML config file defining story structure (text-based or timestamp-based)",
        type: "string",
      })
      .option("output", {
        describe: "Output path for generated YAML (defaults to {video-id}-story.yaml)",
        type: "string",
        alias: "o",
      })
      .option("skip-translation", {
        describe: "Skip translation step (generate Vietnamese-only content)",
        default: false,
        type: "boolean",
      })
      .option("verbose", {
        describe: "Show detailed processing logs",
        default: false,
        type: "boolean",
        alias: "v",
      })
      .example(
        "$0 youtube-extract ./config.yaml",
        "Extract story from YouTube video using config"
      )
      .example(
        "$0 youtube-extract ./config.yaml --output story.yaml",
        "Extract with custom output path"
      )
      .example(
        "$0 youtube-extract ./config.yaml --skip-translation",
        "Extract without translation (Vietnamese only)"
      );

  public handler = async (argv) => {
    await this.runYouTubeExtract(
      argv.config,
      argv.output,
      argv.skipTranslation,
      argv.verbose
    );
  };

  private async runYouTubeExtract(
    configPath: string,
    outputPath: string | undefined,
    skipTranslation: boolean,
    verbose: boolean
  ): Promise<void> {
    console.log("=== YouTube Story Extraction ===\n");

    try {
      // Step 1: Parse and validate config YAML
      if (verbose) console.log("Step 1: Parsing config YAML...");
      const config = await this.parseAndValidateConfig(configPath);

      // Validate config mode (text-based vs timestamp-based)
      validateConfigMode(config);

      // Detect mode
      const isTextBasedMode = !!config.transcriptSource;
      const mode = isTextBasedMode ? "text-based" : "timestamp-based";

      console.log(`Mode: ${mode}`);
      if (isTextBasedMode) {
        console.log(`  - Transcript: ${config.transcriptSource}`);
        console.log(`  - Matching Mode: ${config.matchingMode || "tolerant"}`);
      }

      if (verbose) {
        console.log(`  - Title: "${config.title}"`);
        console.log(`  - Language: ${config.language}`);
        console.log(`  - Video: ${config.source.url}`);
        if (config.source.startTime && config.source.endTime) {
          console.log(`  - Time Range: ${config.source.startTime} - ${config.source.endTime}`);
        }
        if (!isTextBasedMode) {
          console.log(`  - Pages: ${config.pages.length}`);
        }
        console.log();
      }

      // Step 2: Extract audio and transcript from YouTube
      console.log("Step 2: Extracting from YouTube...");
      const extractor = new YouTubeExtractor();
      const videoId = extractor.extractVideoId(config.source.url);

      if (verbose) console.log(`  - Video ID: ${videoId}`);

      let audioPath: string;
      let transcript: TranscriptSegment[];
      let metadata: any;

      // Check if manual transcript is provided (Gemini format)
      if (config.manualTranscriptPath) {
        console.log("  - Using manual transcript (Gemini 2.5 Pro format)");

        // Download audio only (skip yt-dlp transcript extraction)
        metadata = await extractor.getVideoMetadata(config.source.url);

        // Validate time range against video duration (if specified)
        if (config.source.startTime && config.source.endTime) {
          validateTimeRange(config.source.startTime, config.source.endTime, metadata.duration);
        }

        audioPath = await extractor.downloadAudio(
          videoId,
          config.source.url,
          config.source.startTime,
          config.source.endTime
        );

        // Load and parse Gemini transcript
        const transcriptPath = path.resolve(config.manualTranscriptPath);
        if (!fsExtra.existsSync(transcriptPath)) {
          throw new Error(`Manual transcript file not found: ${config.manualTranscriptPath}`);
        }

        const transcriptText = await fsExtra.readFile(transcriptPath, "utf-8");
        const geminiParser = new GeminiTranscriptParser();
        const geminiSegments = geminiParser.parseTranscript(transcriptText);

        // Convert Gemini paragraphs to TranscriptSegments with synthetic timestamps
        // Distribute paragraphs evenly across video duration
        transcript = this.createSyntheticTranscriptSegments(geminiSegments, metadata.duration);

        console.log("  ✓ Manual transcript loaded");
        if (verbose) {
          console.log(`  - Gemini paragraphs: ${geminiSegments.length}`);
          console.log(`  - Converted to ${transcript.length} transcript segments`);
        }
      } else {
        // Use yt-dlp transcript extraction (original workflow)
        const isCached = await extractor.isCached(videoId);
        if (isCached) {
          console.log("  ✓ Using cached audio and transcript");
        } else {
          console.log("  - Downloading audio from YouTube...");
          console.log("  - Extracting transcript with Whisper API...");
        }

        // Get video metadata first to validate time range
        metadata = await extractor.getVideoMetadata(config.source.url);

        // Validate time range format and logical consistency before extraction
        if (config.source.startTime && config.source.endTime) {
          if (verbose) {
            console.log(`  - Validating time range: ${config.source.startTime} - ${config.source.endTime}`);
          }

          try {
            validateTimeRange(config.source.startTime, config.source.endTime, metadata.duration);
          } catch (error: any) {
            throw new Error(`Time range validation failed: ${error.message}`);
          }
        }

        // Extract with time range parameters
        const extractResult = await extractor.extract(
          config.source.url,
          config.language,
          config.source.startTime,
          config.source.endTime
        );
        audioPath = extractResult.audioPath;
        transcript = extractResult.transcript;
        metadata = extractResult.metadata;

        if (!isCached) {
          console.log("  ✓ Audio downloaded");
          console.log("  ✓ Transcript extracted");
        }
      }

      if (verbose) {
        console.log(`  - Title: "${metadata.title}"`);
        console.log(`  - Duration: ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`);
        console.log(`  - Transcript segments: ${transcript.length}`);
        console.log();
      }

      // Calculate trimmed duration for validation
      let trimmedDuration: number;
      if (config.source.startTime && config.source.endTime) {
        const startSeconds = parseTimeToSeconds(config.source.startTime);
        const endSeconds = parseTimeToSeconds(config.source.endTime);
        trimmedDuration = endSeconds - startSeconds;

        if (verbose) {
          console.log(`  - Trimmed audio duration: ${Math.floor(trimmedDuration / 60)}:${String(Math.floor(trimmedDuration % 60)).padStart(2, '0')}`);
        }
      } else {
        // No trimming - use full video duration
        trimmedDuration = metadata.duration;
      }

      // DUAL-MODE WORKFLOW BRANCHING
      let timestampSegments: TimestampSegment[];
      let textBasedPages: TextPageDefinition[] | undefined;

      if (isTextBasedMode) {
        // TEXT-BASED MODE WORKFLOW
        console.log("\n=== Text-Based Mode Workflow ===\n");

        // Step 3a: Load and parse edited transcript
        console.log("Step 3: Parsing edited transcript...");
        const transcriptPath = path.resolve(config.transcriptSource!);

        if (!await fsExtra.pathExists(transcriptPath)) {
          throw new Error(
            `Transcript file not found: ${config.transcriptSource}\n\n` +
            "Make sure you've created and edited the transcript file.\n" +
            "Run youtube-extract-transcript first to generate the initial transcript."
          );
        }

        const parser = new TranscriptFileParser(transcriptPath);
        const pages = await parser.parse();

        console.log(`  ✓ Found ${pages.length} pages with page breaks`);
        if (verbose) {
          pages.forEach((page) => {
            const textPreview = page.text.substring(0, 50).replace(/\n/g, " ");
            console.log(`    - Page ${page.pageNumber}: ${page.title} - ${textPreview}...`);
          });
          console.log();
        }

        // Store for later use in transcript matching
        textBasedPages = pages;

        // Step 4a: Load cached Whisper segments
        console.log("Step 4: Loading Whisper segments...");
        const cacheDir = extractor.getCacheDirectory(videoId);
        const whisperCachePath = path.join(cacheDir, "whisper-transcript.json");

        if (!await fsExtra.pathExists(whisperCachePath)) {
          throw new Error(
            `Whisper transcript cache not found: ${whisperCachePath}\n\n` +
            "Run youtube-extract-transcript first to generate the Whisper transcript."
          );
        }

        const whisperSegments: TranscriptSegment[] = await fsExtra.readJson(whisperCachePath, { encoding: "utf-8" });
        console.log(`  ✓ Loaded ${whisperSegments.length} Whisper segments`);
        if (verbose) console.log();

        // Step 5a: Match pages to segments
        console.log("Step 5: Matching text to Whisper segments...");
        const matchingMode = config.matchingMode || "tolerant";
        console.log(`  - Using ${matchingMode} matching mode`);

        const matcher = new SegmentMatcher(whisperSegments, matchingMode);
        const matchedSegments: MatchedSegment[] = pages.map((page) => {
          const matched = matcher.matchPageToSegments(page.text);
          // Override pageNumber (SegmentMatcher sets it to 0)
          return {
            ...matched,
            pageNumber: page.pageNumber
          };
        });

        console.log(`  ✓ Matched ${matchedSegments.length} pages to segments`);

        // Show confidence scores
        matchedSegments.forEach((matched) => {
          const confidence = (matched.confidence * 100).toFixed(0);
          const segmentCount = matched.segments.length;
          const status = matched.confidence === 1.0 ? "✅" : matched.confidence >= 0.9 ? "⚠️" : "❗";
          console.log(`    ${status} Page ${matched.pageNumber}: ${segmentCount} segment(s), ${confidence}% confidence`);
        });
        if (verbose) console.log();

        // Step 6a: Derive timestamps from matched segments
        console.log("Step 6: Deriving timestamps from matched segments...");
        const derivedTimestamps: DerivedTimestamp[] = TimestampDeriver.deriveTimestamps(matchedSegments);

        console.log(`  ✓ Derived timestamps for ${derivedTimestamps.length} pages`);
        if (verbose) {
          derivedTimestamps.forEach((ts) => {
            console.log(
              `    - Page ${ts.pageNumber}: ${ts.startTime.toFixed(1)}s - ${ts.endTime.toFixed(1)}s (${ts.duration.toFixed(1)}s)`
            );
          });
          console.log();
        }

        // Convert DerivedTimestamp[] to TimestampSegment[] for AudioSplitter
        timestampSegments = derivedTimestamps.map((ts) => ({
          pageNumber: ts.pageNumber,
          startTime: ts.startTime,
          endTime: ts.endTime
        }));

      } else {
        // TIMESTAMP MODE WORKFLOW (Legacy, backward compatible)
        console.log("\n=== Timestamp Mode Workflow (Legacy) ===\n");

        // Validate page timestamps against trimmed duration
        if (verbose) console.log("Step 3: Validating page timestamps...");
        const storyPages = config.pages.filter(isStoryPage);
        for (let i = 0; i < storyPages.length; i++) {
          const page = storyPages[i];
          const pageNumber = i + 1;

          try {
            validatePageTimestamps(page.startTime, page.endTime, trimmedDuration, pageNumber);
          } catch (error: any) {
            throw new Error(
              `Page timestamp validation failed: ${error.message}\n` +
              `Note: Page timestamps are relative to trimmed audio start (00:00), not original video.`
            );
          }
        }

        if (verbose) console.log("  ✓ All page timestamps valid");
        if (verbose) console.log();

        // Build timestamp segments from story pages (skip intro page)
        timestampSegments = storyPages.map((page, index) => ({
          pageNumber: index + 1,
          startTime: this.parseTimestamp(page.startTime),
          endTime: this.parseTimestamp(page.endTime)
        }));
      }

      // COMMON WORKFLOW (both modes converge here)
      console.log("\n=== Common Processing Steps ===\n");

      // Step 7 (or 3b): Split audio at timestamps
      console.log(`Step ${isTextBasedMode ? '7' : '3'}: Splitting audio into segments...`);

      // Construct video-specific cache directory path for audio segments
      const audioSegmentsDir = path.join(extractor.getCacheDirectory(videoId), "audio-segments");

      // Ensure directory is created before AudioSplitter is instantiated
      await fsExtra.ensureDir(audioSegmentsDir);

      // Pass video-specific path to AudioSplitter constructor
      const splitter = new AudioSplitter(audioSegmentsDir);

      const audioSegments = await splitter.splitAudio(audioPath, timestampSegments, trimmedDuration);
      console.log(`  ✓ Created ${audioSegments.length} audio segments`);
      if (verbose) console.log();

      // Step 8 (or 4b): Match transcript to pages
      console.log(`Step ${isTextBasedMode ? '8' : '4'}: Matching transcript to pages...`);
      const matcher = new TranscriptMatcher();

      // Build page definitions for matcher
      let pageDefinitions: PageDefinition[];

      if (isTextBasedMode && textBasedPages) {
        // Text-based mode: Use pages from transcript parser
        pageDefinitions = textBasedPages.map((page, index) => {
          const audioSegment = audioSegments[index];
          const ts = timestampSegments[index];
          return {
            pageNumber: page.pageNumber,
            title: page.title,
            startTime: ts.startTime,
            endTime: ts.endTime,
            audioPath: path.relative(process.cwd(), audioSegment.filePath),
            imagePath: "placeholder.png",
            isPlaceholder: true
          };
        });
      } else {
        // Timestamp mode: Use pages from config
        const storyPages = config.pages.filter(isStoryPage);
        pageDefinitions = storyPages.map((page, index) => {
          const audioSegment = audioSegments[index];
          return {
            pageNumber: index + 1,
            title: page.title,
            startTime: this.parseTimestamp(page.startTime),
            endTime: this.parseTimestamp(page.endTime),
            audioPath: path.relative(process.cwd(), audioSegment.filePath),
            imagePath: page.image || "placeholder.png",
            isPlaceholder: page.placeholder !== false // Default to true
          };
        });
      }

      const pageData = matcher.matchToPages(transcript, pageDefinitions);
      console.log(`  ✓ Matched transcript to ${pageData.length} pages`);

      if (verbose) {
        pageData.forEach((page, index) => {
          const textPreview = page.vietnameseText.substring(0, 50).replace(/\n/g, " ") + "...";
          console.log(`    - Page ${index + 1}: ${textPreview}`);
        });
        console.log();
      }

      // Step 9 (or 5b): Translate pages (if enabled)
      let translatedPageData = pageData;
      if (config.translation.enabled && !skipTranslation) {
        console.log(`Step ${isTextBasedMode ? '9' : '5'}: Translating to English...`);

        if (!process.env.OPENAI_API_KEY) {
          console.warn("  ⚠ Warning: OPENAI_API_KEY not found. Skipping translation.");
          console.warn("  Set OPENAI_API_KEY environment variable to enable translation.");
        } else {
          const translator = new StoryTranslator();
          const storyContext = `Title: ${config.title}\nLanguage: ${config.language}\nThis is a children's story in Vietnamese.`;

          translatedPageData = await translator.translatePages(pageData, storyContext, videoId);
          console.log(`  ✓ Translated ${translatedPageData.length} pages`);

          if (verbose) {
            const totalCost = translatedPageData.length * 0.001; // Rough estimate
            console.log(`  - Estimated cost: $${totalCost.toFixed(3)}`);
            console.log();
          }
        }
      } else {
        if (verbose) {
          console.log(`Step ${isTextBasedMode ? '9' : '5'}: Skipping translation (--skip-translation flag or disabled in config)`);
          console.log();
        }
      }

      // Step 10 (or 6b): Generate Interactive Book YAML
      console.log(`Step ${isTextBasedMode ? '10' : '6'}: Generating Interactive Book YAML...`);
      const generator = new InteractiveBookYamlGenerator();

      // Build full transcript for accordion
      const fullTranscript = matcher.getFullTranscript(transcript);

      // Determine output path
      const finalOutputPath = outputPath ||
        config.outputPath ||
        path.join(process.cwd(), `${videoId}-story.yaml`);

      await generator.generateYaml(
        config,
        translatedPageData,
        fullTranscript,
        finalOutputPath
      );

      console.log(`  ✓ Generated YAML: ${finalOutputPath}`);
      console.log();

      // Success message with next steps
      console.log("✅ Success!\n");
      console.log("Generated files:");
      console.log(`  📄 ${path.basename(finalOutputPath)} (Interactive Book YAML)`);
      console.log(`  🎵 ${path.relative(process.cwd(), audioSegmentsDir)}/ (${audioSegments.length} MP3 files)`);
      console.log(`  💾 .youtube-cache/${videoId}/ (cached audio and transcript)`);
      console.log();
      console.log("Next step:");
      console.log(`  PATH="/opt/homebrew/bin:$PATH" node ./dist/index.js yaml ${finalOutputPath} ${videoId}-story.h5p`);
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
        } else if (error.message.includes("transcript") || error.message.includes("captions")) {
          console.error("  Error: Video does not have captions");
          console.error("\n  Solutions:");
          console.error("    - Enable auto-generated captions on YouTube");
          console.error("    - Manually add captions to the video");
          console.error("    - Use a different video with captions");
        } else if (error.message.includes("Time range validation failed") || error.message.includes("Page timestamp validation failed")) {
          // Clear, actionable error message for time range issues
          console.error(`  ${error.message}`);
        } else if (error.message.includes("Config validation error")) {
          // Config mode validation error
          console.error(`  ${error.message}`);
        } else if (error.message.includes("Page text not found") || error.message.includes("not found in Whisper segments")) {
          // Text matching error
          console.error(`  ${error.message}`);
          console.error("\n  Suggestions:");
          console.error("    - Check that edited text matches Whisper transcript closely");
          console.error("    - Try using matchingMode: 'fuzzy' in config");
          console.error("    - Run youtube-validate-transcript first to preview matching");
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
    if (!config.title) {
      throw new Error("Missing required field: title");
    }
    if (!config.language) {
      throw new Error("Missing required field: language");
    }
    if (!config.source || !config.source.url) {
      throw new Error("Missing required field: source.url");
    }

    // Text-based mode: transcriptSource required, pages optional
    // Timestamp mode: pages required
    const hasTranscriptSource = !!config.transcriptSource;
    const hasPages = config.pages && config.pages.length > 0;

    if (!hasTranscriptSource && !hasPages) {
      throw new Error(
        "Missing required field: either transcriptSource (text-based mode) or pages (timestamp mode) must be specified"
      );
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

    // Validate timestamp format for story pages (timestamp mode only)
    if (!hasTranscriptSource && hasPages) {
      const storyPages = config.pages.filter(isStoryPage);
      for (const page of storyPages) {
        if (!this.isValidTimestamp(page.startTime)) {
          throw new Error(`Invalid timestamp format: ${page.startTime}. Expected MM:SS format.`);
        }
        if (!this.isValidTimestamp(page.endTime)) {
          throw new Error(`Invalid timestamp format: ${page.endTime}. Expected MM:SS format.`);
        }

        // Validate timestamp ranges
        const startSeconds = this.parseTimestamp(page.startTime);
        const endSeconds = this.parseTimestamp(page.endTime);

        if (startSeconds < 0) {
          throw new Error(`Invalid start time: ${page.startTime} (cannot be negative)`);
        }
        if (endSeconds <= startSeconds) {
          throw new Error(`Invalid time range: ${page.startTime} - ${page.endTime} (end must be after start)`);
        }
      }
    }

    return config;
  }

  /**
   * Validates timestamp format (MM:SS).
   */
  private isValidTimestamp(timestamp: string): boolean {
    return /^\d{1,2}:\d{2}$/.test(timestamp);
  }

  /**
   * Validates extended timestamp format (MM:SS or HH:MM:SS).
   */
  private isValidExtendedTimestamp(timestamp: string): boolean {
    return /^\d{1,2}:\d{2}$/.test(timestamp) || /^\d{1,2}:\d{2}:\d{2}$/.test(timestamp);
  }

  /**
   * Parses timestamp string to seconds.
   */
  private parseTimestamp(timestamp: string): number {
    const [minutes, seconds] = timestamp.split(":").map(Number);
    return minutes * 60 + seconds;
  }

  /**
   * Creates synthetic TranscriptSegments from Gemini paragraphs.
   *
   * Distributes paragraphs evenly across video duration with synthetic timestamps.
   * This allows using the Gemini transcript with the existing TranscriptMatcher workflow.
   *
   * @param geminiSegments Array of Gemini paragraph segments
   * @param duration Video duration in seconds
   * @returns Array of TranscriptSegments with synthetic timestamps
   */
  private createSyntheticTranscriptSegments(
    geminiSegments: { text: string; paragraphNumber: number }[],
    duration: number
  ): TranscriptSegment[] {
    if (geminiSegments.length === 0) {
      return [];
    }

    // Calculate segment duration (evenly distribute across video)
    const segmentDuration = duration / geminiSegments.length;

    return geminiSegments.map((segment, index) => {
      const startTime = index * segmentDuration;
      const endTime = (index + 1) * segmentDuration;

      return {
        startTime,
        endTime,
        text: segment.text
      };
    });
  }
}
