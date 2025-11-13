/**
 * YouTubeExtractor service for extracting audio and transcripts from YouTube videos.
 *
 * Responsibilities:
 * - Extract video ID from YouTube URLs (multiple formats)
 * - Download audio using yt-dlp system command
 * - Extract transcript with timestamps using Whisper API
 * - Manage caching in .youtube-cache/VIDEO_ID/ directory
 * - Preserve Vietnamese diacritics (UTF-8 encoding)
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 * Phase 2: Whisper API Transcription Integration
 */

import * as fsExtra from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { VideoMetadata, TranscriptSegment, CacheMetadata } from "./types/YouTubeExtractorTypes";
import { WhisperTranscriptionService } from "./transcription/WhisperTranscriptionService";

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
   * @param videoId YouTube video ID
   * @param url Full YouTube URL
   * @returns Path to downloaded audio file
   * @throws Error if yt-dlp not installed or download fails
   */
  public async downloadAudio(videoId: string, url: string): Promise<string> {
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

    // Download using yt-dlp
    const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" "${url}"`;

    try {
      await execAsync(command);
      console.log(chalk.green("Audio download complete:"), outputPath);
      return outputPath;
    } catch (error: any) {
      throw new Error(`Failed to download audio: ${error.message}`);
    }
  }

  /**
   * Extracts transcript from YouTube video with timestamps using Whisper API.
   *
   * Uses WhisperTranscriptionService for high-quality transcription.
   * Preserves Vietnamese diacritics with UTF-8 encoding.
   * Displays cost estimate and progress messages.
   *
   * @param videoId YouTube video ID
   * @param audioPath Path to audio file
   * @param language Language code (e.g., "vi" for Vietnamese, "en" for English)
   * @returns Array of transcript segments with timestamps
   * @throws Error if transcription fails
   */
  public async extractTranscript(
    videoId: string,
    audioPath: string,
    language: string = "vi"
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
      // Calculate duration and estimated cost before API call
      const duration = await this.getAudioDuration(audioPath);
      const durationMinutes = duration / 60;
      const estimatedCost = durationMinutes * 0.006;

      console.log(chalk.gray(`Duration: ${durationMinutes.toFixed(1)} minutes`));
      console.log(chalk.gray(`Estimated cost: $${estimatedCost.toFixed(2)}`));

      // Use Whisper API for transcription
      const segments = await this.whisperService.transcribe(audioPath, language, videoId);

      // Cache the transcript with UTF-8 encoding
      await fsExtra.writeJson(transcriptPath, segments, {
        encoding: "utf-8",
        spaces: 2
      });

      console.log(chalk.green("Transcription complete!"));
      console.log(chalk.gray(`Actual cost: $${estimatedCost.toFixed(2)}`));
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
   * Complete extraction workflow for a YouTube video.
   *
   * Steps:
   * 1. Extract video ID from URL
   * 2. Check cache (skip download if cached)
   * 3. Download audio as MP3
   * 4. Extract transcript with Whisper API
   * 5. Save cache metadata with transcription details
   *
   * @param url YouTube video URL
   * @param language Language code for transcription (default: "vi")
   * @returns Object with video metadata, audio path, and transcript segments
   */
  public async extract(
    url: string,
    language: string = "vi"
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
      } else {
        metadata = await this.getVideoMetadata(url);
      }

      // Display cached transcription info
      if (cachedMetadata?.transcription) {
        console.log(chalk.gray(`Cached transcription: ${cachedMetadata.transcription.language} (${cachedMetadata.transcription.provider})`));
        console.log(chalk.gray(`Previous cost: $${cachedMetadata.transcription.cost.toFixed(2)}`));
      }
    } else {
      // Download fresh data
      metadata = await this.getVideoMetadata(url);
      audioPath = await this.downloadAudio(videoId, url);
      transcript = await this.extractTranscript(videoId, audioPath, language);

      // Calculate transcription cost
      const duration = await this.getAudioDuration(audioPath);
      const durationMinutes = duration / 60;
      const cost = durationMinutes * 0.006;

      // Save cache metadata with transcription details
      await this.saveCacheMetadata(videoId, {
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
      });
    }

    return {
      metadata,
      audioPath,
      transcript
    };
  }
}
