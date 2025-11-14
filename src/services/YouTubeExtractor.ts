/**
 * YouTubeExtractor service for extracting audio and transcripts from YouTube videos.
 *
 * Responsibilities:
 * - Extract video ID from YouTube URLs (multiple formats)
 * - Download audio using yt-dlp system command
 * - Extract transcript with timestamps using Whisper API
 * - Manage caching in .youtube-cache/VIDEO_ID/ directory
 * - Preserve Vietnamese diacritics (UTF-8 encoding)
 * - Support time range extraction with ffmpeg trimming
 * - Display cost transparency and savings
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 * Phase 2: Whisper API Transcription Integration
 * Phase 3: YouTube Extraction Improvements - Audio Trimming and Cost Transparency
 */

import * as fsExtra from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { VideoMetadata, TranscriptSegment, CacheMetadata } from "./types/YouTubeExtractorTypes";
import { WhisperTranscriptionService } from "./transcription/WhisperTranscriptionService";
import { parseTimeToSeconds } from "../utils/timeRangeValidation";

const execAsync = promisify(exec);

/**
 * YouTubeExtractor extracts audio and transcripts from YouTube videos.
 *
 * Features:
 * - Multiple URL format support (watch?v=, youtu.be/, embed/)
 * - Audio download as MP3 using yt-dlp
 * - Transcript extraction using Whisper API
 * - Caching strategy for fast iteration
 * - Vietnamese character encoding preservation
 * - Cost transparency for transcription
 * - Time range extraction (trim before transcription)
 * - Cost savings display when trimming is used
 */
export class YouTubeExtractor {
  private cacheBasePath: string;
  private whisperService: WhisperTranscriptionService;

  /**
   * Creates a new YouTubeExtractor instance.
   * @param cacheBasePath Base directory for cache (defaults to .youtube-cache in current directory)
   * @param whisperService WhisperTranscriptionService instance (defaults to new instance)
   */
  constructor(cacheBasePath?: string, whisperService?: WhisperTranscriptionService) {
    this.cacheBasePath = cacheBasePath || path.join(process.cwd(), ".youtube-cache");
    this.whisperService = whisperService || new WhisperTranscriptionService();
  }

  /**
   * Extracts video ID from YouTube URL.
   *
   * Supports multiple URL formats:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   * - URLs with extra query parameters (?t=, &list=, etc.)
   *
   * @param url YouTube video URL
   * @returns 11-character video ID
   * @throws Error if URL format is invalid
   */
  public extractVideoId(url: string): string {
    // Pattern 1: watch?v=VIDEO_ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return watchMatch[1];
    }

    // Pattern 2: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      return shortMatch[1];
    }

    // Pattern 3: embed/VIDEO_ID
    const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    throw new Error(`Invalid YouTube URL: ${url}. Expected format: youtube.com/watch?v=VIDEO_ID or youtu.be/VIDEO_ID`);
  }

  /**
   * Gets cache directory path for a video ID.
   * @param videoId YouTube video ID
   * @returns Absolute path to cache directory
   */
  public getCacheDirectory(videoId: string): string {
    return path.join(this.cacheBasePath, videoId);
  }

  /**
   * Checks if video data is cached.
   * @param videoId YouTube video ID
   * @returns True if both audio and transcript are cached
   */
  public async isCached(videoId: string): Promise<boolean> {
    const cacheDir = this.getCacheDirectory(videoId);
    const audioPath = path.join(cacheDir, "audio.mp3");
    const transcriptPath = path.join(cacheDir, "whisper-transcript.json");

    return fsExtra.existsSync(audioPath) && fsExtra.existsSync(transcriptPath);
  }

  /**
   * Downloads audio from YouTube video as MP3.
   *
   * Uses yt-dlp system command with the following options:
   * - Extract audio only
   * - Convert to MP3 format
   * - Output to cache directory
   * - Preserve metadata
   *
   * If startTime and endTime are provided, trims the audio after download.
   *
   * @param videoId YouTube video ID
   * @param url Full YouTube URL
   * @param startTime Optional start time for trimming (MM:SS or HH:MM:SS)
   * @param endTime Optional end time for trimming (MM:SS or HH:MM:SS)
   * @returns Path to downloaded (and possibly trimmed) audio file
   * @throws Error if yt-dlp not installed or download fails
   */
  public async downloadAudio(
    videoId: string,
    url: string,
    startTime?: string,
    endTime?: string
  ): Promise<string> {
    // Check if yt-dlp is installed
    await this.checkYtDlpInstalled();

    const cacheDir = this.getCacheDirectory(videoId);
    await fsExtra.ensureDir(cacheDir);

    const outputPath = path.join(cacheDir, "audio.mp3");

    // Check if already downloaded
    if (fsExtra.existsSync(outputPath)) {
      console.log(chalk.blue("Audio cached:"), outputPath);
      return outputPath;
    }

    console.log(chalk.blue("Downloading audio from YouTube..."));

    // Download full video using yt-dlp (yt-dlp cannot download partial ranges)
    const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" "${url}"`;

    try {
      await execAsync(command);
      console.log(chalk.green("Audio download complete:"), outputPath);

      // Trim audio if time range specified
      if (startTime && endTime) {
        console.log(chalk.blue(`Trimming audio to ${startTime}-${endTime}...`));
        await this.trimAudio(videoId, startTime, endTime);
        console.log(chalk.green(`Audio trimmed to ${startTime}-${endTime}`));
      }

      return outputPath;
    } catch (error: any) {
      throw new Error(`Failed to download audio: ${error.message}`);
    }
  }

  /**
   * Trims audio to specified time range using ffmpeg.
   *
   * Strategy:
   * 1. Download full video first (yt-dlp limitation)
   * 2. Trim using ffmpeg with copy codec (no re-encoding, <2 seconds overhead)
   * 3. Overwrite original audio.mp3 with trimmed version
   *
   * Uses ffmpeg command:
   * `ffmpeg -y -i audio.mp3 -ss START_SECONDS -to END_SECONDS -c copy audio-trimmed.mp3`
   *
   * @param videoId YouTube video ID
   * @param startTime Start time in MM:SS or HH:MM:SS format
   * @param endTime End time in MM:SS or HH:MM:SS format
   * @throws Error if ffmpeg fails or invalid time range
   * @private
   */
  private async trimAudio(videoId: string, startTime: string, endTime: string): Promise<void> {
    // Check if ffmpeg is installed
    await this.checkFfmpegInstalled();

    const cacheDir = this.getCacheDirectory(videoId);
    const audioPath = path.join(cacheDir, "audio.mp3");
    const trimmedPath = path.join(cacheDir, "audio-trimmed.mp3");

    // Convert timestamps to seconds
    const startSeconds = parseTimeToSeconds(startTime);
    const endSeconds = parseTimeToSeconds(endTime);

    // Validate range
    if (startSeconds >= endSeconds) {
      throw new Error(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}). ` +
          `Got ${startSeconds} seconds and ${endSeconds} seconds.`
      );
    }

    // Trim audio using ffmpeg with copy codec
    // -y: overwrite output file
    // -i: input file
    // -ss: start time in seconds
    // -to: end time in seconds
    // -c copy: copy codec (no re-encoding, preserves quality and speed)
    const command = `ffmpeg -y -i "${audioPath}" -ss ${startSeconds} -to ${endSeconds} -c copy "${trimmedPath}"`;

    try {
      await execAsync(command);

      // Replace original audio with trimmed version
      await fsExtra.move(trimmedPath, audioPath, { overwrite: true });
    } catch (error: any) {
      throw new Error(`Failed to trim audio: ${error.message}`);
    }
  }

  /**
   * Extracts transcript from YouTube video with timestamps using Whisper API.
   *
   * Uses WhisperTranscriptionService for high-quality transcription.
   * Preserves Vietnamese diacritics with UTF-8 encoding.
   * Displays cost estimate and progress messages.
   * Shows cost savings when audio is trimmed.
   *
   * @param videoId YouTube video ID
   * @param audioPath Path to audio file
   * @param language Language code (e.g., "vi" for Vietnamese, "en" for English)
   * @param originalDuration Optional original video duration for cost savings display
   * @returns Array of transcript segments with timestamps
   * @throws Error if transcription fails
   */
  public async extractTranscript(
    videoId: string,
    audioPath: string,
    language: string = "vi",
    originalDuration?: number
  ): Promise<TranscriptSegment[]> {
    const cacheDir = this.getCacheDirectory(videoId);
    await fsExtra.ensureDir(cacheDir);

    const transcriptPath = path.join(cacheDir, "whisper-transcript.json");

    // Check if already cached
    if (fsExtra.existsSync(transcriptPath)) {
      console.log(chalk.blue("Using cached Whisper transcript"));
      const cached = await fsExtra.readJson(transcriptPath, { encoding: "utf-8" });
      return cached as TranscriptSegment[];
    }

    // Display progress message
    console.log(chalk.blue("Transcribing with Whisper API..."));
    console.log(chalk.gray(`Language: ${this.getLanguageName(language)} (${language})`));

    try {
      // Use Whisper API for transcription (with original duration for cost savings display)
      const segments = await this.whisperService.transcribe(audioPath, language, videoId, originalDuration);

      // Cache the transcript with UTF-8 encoding
      await fsExtra.writeJson(transcriptPath, segments, {
        encoding: "utf-8",
        spaces: 2
      });

      console.log(chalk.green("Transcription complete!"));
      console.log(chalk.gray(`Cached: ${transcriptPath}`));

      return segments;
    } catch (error: any) {
      throw new Error(`Failed to extract transcript: ${error.message}`);
    }
  }

  /**
   * Gets video metadata from YouTube.
   *
   * Extracts:
   * - Video ID
   * - Title
   * - Duration
   * - Thumbnail URL
   *
   * @param url YouTube video URL
   * @returns Video metadata
   */
  public async getVideoMetadata(url: string): Promise<VideoMetadata> {
    const videoId = this.extractVideoId(url);

    try {
      // Use yt-dlp to get video metadata
      const command = `yt-dlp --dump-json --no-download "${url}"`;
      const { stdout } = await execAsync(command);
      const metadata = JSON.parse(stdout);

      return {
        videoId,
        title: metadata.title || "Unknown Title",
        duration: metadata.duration || 0,
        thumbnailUrl: metadata.thumbnail || ""
      };
    } catch (error: any) {
      // Fallback to basic metadata
      return {
        videoId,
        title: "Unknown Title",
        duration: 0,
        thumbnailUrl: ""
      };
    }
  }

  /**
   * Saves cache metadata to disk.
   * @param videoId YouTube video ID
   * @param metadata Cache metadata to save
   */
  public async saveCacheMetadata(videoId: string, metadata: CacheMetadata): Promise<void> {
    const cacheDir = this.getCacheDirectory(videoId);
    await fsExtra.ensureDir(cacheDir);

    const metadataPath = path.join(cacheDir, "cache-metadata.json");
    await fsExtra.writeJson(metadataPath, metadata, {
      encoding: "utf-8",
      spaces: 2
    });
  }

  /**
   * Loads cache metadata from disk.
   * @param videoId YouTube video ID
   * @returns Cache metadata or null if not found
   */
  public async loadCacheMetadata(videoId: string): Promise<CacheMetadata | null> {
    const cacheDir = this.getCacheDirectory(videoId);
    const metadataPath = path.join(cacheDir, "cache-metadata.json");

    if (!fsExtra.existsSync(metadataPath)) {
      return null;
    }

    return await fsExtra.readJson(metadataPath, { encoding: "utf-8" });
  }

  /**
   * Checks if yt-dlp is installed on the system.
   * @throws Error with installation instructions if not found
   */
  private async checkYtDlpInstalled(): Promise<void> {
    try {
      await execAsync("yt-dlp --version");
    } catch (error) {
      // Try fallback to youtube-dl
      try {
        await execAsync("youtube-dl --version");
      } catch {
        throw new Error(
          "yt-dlp is not installed. Please install it:\n\n" +
          "macOS:   brew install yt-dlp\n" +
          "Ubuntu:  pip install yt-dlp\n" +
          "Windows: Download from https://github.com/yt-dlp/yt-dlp/releases\n"
        );
      }
    }
  }

  /**
   * Checks if ffmpeg is installed on the system.
   * @throws Error with installation instructions if not found
   * @private
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
   * Gets audio duration from file metadata.
   *
   * Uses file size heuristic for estimation.
   * Average MP3 bitrate: 128 kbps = 16 KB/s
   *
   * @param audioPath Path to audio file
   * @returns Duration in seconds
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    const stats = await fsExtra.stat(audioPath);
    const estimatedDuration = stats.size / (16 * 1024); // seconds
    return estimatedDuration;
  }

  /**
   * Gets language name from language code.
   * @param code Language code (e.g., "vi", "en")
   * @returns Language name
   */
  private getLanguageName(code: string): string {
    const languages: { [key: string]: string } = {
      vi: "Vietnamese",
      en: "English",
      zh: "Chinese",
      es: "Spanish",
      fr: "French",
      de: "German",
      ja: "Japanese",
      ko: "Korean"
    };
    return languages[code] || code;
  }

  /**
   * Formats duration in seconds to MM:SS or HH:MM:SS format.
   *
   * @param seconds Duration in seconds
   * @returns Formatted time string (e.g., "5:30", "1:15:45")
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  }

  /**
   * Complete extraction workflow for a YouTube video.
   *
   * Steps:
   * 1. Extract video ID from URL
   * 2. Check cache (skip download if cached)
   * 3. Download audio as MP3
   * 4. Trim audio if time range specified
   * 5. Extract transcript with Whisper API
   * 6. Save cache metadata with transcription details
   *
   * @param url YouTube video URL
   * @param language Language code for transcription (default: "vi")
   * @param startTime Optional start time for trimming (MM:SS or HH:MM:SS)
   * @param endTime Optional end time for trimming (MM:SS or HH:MM:SS)
   * @returns Object with video metadata, audio path, and transcript segments
   */
  public async extract(
    url: string,
    language: string = "vi",
    startTime?: string,
    endTime?: string
  ): Promise<{
    metadata: VideoMetadata;
    audioPath: string;
    transcript: TranscriptSegment[];
  }> {
    // Extract video ID
    const videoId = this.extractVideoId(url);

    // Check if cached
    const cached = await this.isCached(videoId);

    let audioPath: string;
    let transcript: TranscriptSegment[];
    let metadata: VideoMetadata;

    if (cached) {
      // Load from cache
      console.log(chalk.blue("Using cached data for video:"), videoId);
      const cacheDir = this.getCacheDirectory(videoId);
      audioPath = path.join(cacheDir, "audio.mp3");
      transcript = await fsExtra.readJson(path.join(cacheDir, "whisper-transcript.json"), {
        encoding: "utf-8"
      });

      // Try to load metadata
      const cachedMetadata = await this.loadCacheMetadata(videoId);
      if (cachedMetadata) {
        metadata = {
          videoId,
          title: cachedMetadata.title || "Unknown Title",
          duration: cachedMetadata.duration || 0,
          thumbnailUrl: ""
        };

        // Display extraction range if present
        if (cachedMetadata.extractionRange) {
          console.log(
            chalk.gray(
              `Extracted ${cachedMetadata.extractionRange.startTime}-${cachedMetadata.extractionRange.endTime} from video`
            )
          );
        }
      } else {
        metadata = await this.getVideoMetadata(url);
      }

      // Display cached transcription info
      if (cachedMetadata?.transcription) {
        console.log(chalk.gray(`Cached transcription: ${cachedMetadata.transcription.language} (${cachedMetadata.transcription.provider})`));
        console.log(chalk.gray(`Previous cost: $${cachedMetadata.transcription.cost.toFixed(2)}`));

        // Display cost savings if extraction range was used
        if (cachedMetadata.extractionRange && cachedMetadata.duration) {
          const originalMinutes = cachedMetadata.duration / 60;
          const trimmedMinutes = cachedMetadata.transcription.duration / 60;
          const originalCost = originalMinutes * 0.006;
          const savings = originalCost - cachedMetadata.transcription.cost;

          if (savings > 0) {
            console.log(chalk.gray(`Cost savings from trimming: $${savings.toFixed(2)}`));
          }
        }
      }
    } else {
      // Download fresh data
      metadata = await this.getVideoMetadata(url);
      audioPath = await this.downloadAudio(videoId, url, startTime, endTime);

      // Display cost transparency before transcription
      if (startTime && endTime && metadata.duration) {
        const trimmedDuration = await this.getAudioDuration(audioPath);
        const originalDuration = metadata.duration;

        const originalMinutes = originalDuration / 60;
        const trimmedMinutes = trimmedDuration / 60;
        const originalCost = originalMinutes * 0.006;
        const trimmedCost = trimmedMinutes * 0.006;
        const savings = originalCost - trimmedCost;

        const originalTime = this.formatDuration(originalDuration);
        const trimmedTime = this.formatDuration(trimmedDuration);

        console.log(
          chalk.gray(
            `Original video: ${originalTime} ($${originalCost.toFixed(2)}), ` +
            `Trimming to: ${trimmedTime} ($${trimmedCost.toFixed(2)}), ` +
            `Savings: $${savings.toFixed(2)}`
          )
        );
      }

      // Extract transcript with cost savings display
      transcript = await this.extractTranscript(
        videoId,
        audioPath,
        language,
        startTime && endTime ? metadata.duration : undefined
      );

      // Calculate transcription cost
      const duration = await this.getAudioDuration(audioPath);
      const durationMinutes = duration / 60;
      const cost = durationMinutes * 0.006;

      // Build cache metadata
      const cacheMetadata: CacheMetadata = {
        videoId,
        audioPath,
        transcriptPath: path.join(this.getCacheDirectory(videoId), "whisper-transcript.json"),
        downloadDate: new Date().toISOString(),
        duration: metadata.duration,
        title: metadata.title,
        transcription: {
          provider: "whisper-api",
          model: "whisper-1",
          language: language,
          timestamp: new Date().toISOString(),
          cost: cost,
          duration: duration
        }
      };

      // Add extraction range if specified
      if (startTime && endTime) {
        cacheMetadata.extractionRange = {
          startTime,
          endTime
        };
        console.log(chalk.gray(`Extracted ${startTime}-${endTime} from video`));
      }

      // Save cache metadata with transcription details
      await this.saveCacheMetadata(videoId, cacheMetadata);
    }

    return {
      metadata,
      audioPath,
      transcript
    };
  }
}
