/**
 * Unit tests for YouTubeExtractor service
 *
 * Tests YouTube extraction functionality:
 * - Video ID extraction from URLs
 * - Cache directory management
 * - Cache hit detection
 * - Whisper API integration for transcription
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 * Phase 2: Whisper API Transcription Integration
 */

import { YouTubeExtractor } from "../../src/services/YouTubeExtractor";
import { WhisperTranscriptionService } from "../../src/services/transcription/WhisperTranscriptionService";
import * as fsExtra from "fs-extra";
import * as path from "path";

// Mock chalk
jest.mock("chalk", () => ({
  default: {
    blue: jest.fn((text: string) => text),
    green: jest.fn((text: string) => text),
    gray: jest.fn((text: string) => text),
    red: jest.fn((text: string) => text),
    yellow: jest.fn((text: string) => text)
  },
  blue: jest.fn((text: string) => text),
  green: jest.fn((text: string) => text),
  gray: jest.fn((text: string) => text),
  red: jest.fn((text: string) => text),
  yellow: jest.fn((text: string) => text)
}));

// Mock system calls and external dependencies
jest.mock("child_process");
jest.mock("fs-extra");
jest.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: jest.fn()
  }
}));

// Mock WhisperTranscriptionService
jest.mock("../../src/services/transcription/WhisperTranscriptionService");

describe("YouTubeExtractor", () => {
  let extractor: YouTubeExtractor;
  let mockWhisperService: jest.Mocked<WhisperTranscriptionService>;

  beforeEach(() => {
    extractor = new YouTubeExtractor();
    jest.clearAllMocks();
  });

  describe("extractVideoId", () => {
    it("should extract video ID from watch?v= URL format", () => {
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";
      const videoId = extractor.extractVideoId(url);
      expect(videoId).toBe("Y8M9RJ_4C7E");
    });

    it("should extract video ID from youtu.be/ short URL format", () => {
      const url = "https://youtu.be/Y8M9RJ_4C7E";
      const videoId = extractor.extractVideoId(url);
      expect(videoId).toBe("Y8M9RJ_4C7E");
    });

    it("should extract video ID from embed/ URL format", () => {
      const url = "https://www.youtube.com/embed/Y8M9RJ_4C7E";
      const videoId = extractor.extractVideoId(url);
      expect(videoId).toBe("Y8M9RJ_4C7E");
    });

    it("should handle URLs with extra query parameters", () => {
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E&t=30s&list=PLxyz";
      const videoId = extractor.extractVideoId(url);
      expect(videoId).toBe("Y8M9RJ_4C7E");
    });

    it("should throw error for invalid YouTube URL", () => {
      const url = "https://example.com/video";
      expect(() => extractor.extractVideoId(url)).toThrow("Invalid YouTube URL");
    });
  });

  describe("getCacheDirectory", () => {
    it("should return cache directory path for video ID", () => {
      const videoId = "Y8M9RJ_4C7E";
      const cachePath = extractor.getCacheDirectory(videoId);
      expect(cachePath).toContain(".youtube-cache");
      expect(cachePath).toContain(videoId);
    });

    it("should create consistent path for same video ID", () => {
      const videoId = "Y8M9RJ_4C7E";
      const path1 = extractor.getCacheDirectory(videoId);
      const path2 = extractor.getCacheDirectory(videoId);
      expect(path1).toBe(path2);
    });
  });

  describe("isCached", () => {
    it("should return true when both audio and transcript exist", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock file existence
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);

      const cached = await extractor.isCached(videoId);
      expect(cached).toBe(true);
    });

    it("should return false when audio file missing", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock only transcript exists
      (fsExtra.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return filePath.includes("transcript.json");
      });

      const cached = await extractor.isCached(videoId);
      expect(cached).toBe(false);
    });

    it("should return false when transcript file missing", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock only audio exists
      (fsExtra.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return filePath.includes("audio.mp3");
      });

      const cached = await extractor.isCached(videoId);
      expect(cached).toBe(false);
    });

    it("should return false when neither file exists", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock no files exist
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);

      const cached = await extractor.isCached(videoId);
      expect(cached).toBe(false);
    });
  });

  describe("Whisper API Integration", () => {
    beforeEach(() => {
      // Create mock WhisperTranscriptionService
      mockWhisperService = {
        transcribe: jest.fn()
      } as any;

      // Create extractor with mock Whisper service
      extractor = new YouTubeExtractor(undefined, mockWhisperService);
    });

    it("should call WhisperTranscriptionService when extracting transcript", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const audioPath = "/cache/Y8M9RJ_4C7E/audio.mp3";
      const language = "vi";

      // Mock no cache
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 }); // 1 MB

      // Mock Whisper response
      const mockSegments = [
        { startTime: 0, endTime: 5, text: "Xin chào các bạn" },
        { startTime: 5, endTime: 10, text: "Hôm nay trời đẹp" }
      ];
      mockWhisperService.transcribe.mockResolvedValue(mockSegments);

      // Mock writeJson for caching
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      // Extract transcript
      const result = await extractor.extractTranscript(videoId, audioPath, language);

      // Verify Whisper service was called
      expect(mockWhisperService.transcribe).toHaveBeenCalledWith(audioPath, language, videoId);
      expect(result).toEqual(mockSegments);
    });

    it("should save cache metadata with Whisper transcription details", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const metadata = {
        videoId: "Y8M9RJ_4C7E",
        audioPath: "/cache/audio.mp3",
        transcriptPath: "/cache/transcript.json",
        downloadDate: "2025-11-13T10:00:00Z",
        duration: 600,
        title: "Test Video",
        transcription: {
          provider: "whisper-api" as const,
          model: "whisper-1" as const,
          language: "vi",
          timestamp: "2025-11-13T10:30:00Z",
          cost: 0.06,
          duration: 600
        }
      };

      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      await extractor.saveCacheMetadata(videoId, metadata);

      // Verify metadata was saved with transcription details
      expect(fsExtra.writeJson).toHaveBeenCalledWith(
        expect.stringContaining("cache-metadata.json"),
        expect.objectContaining({
          transcription: expect.objectContaining({
            provider: "whisper-api",
            model: "whisper-1",
            language: "vi"
          })
        }),
        expect.any(Object)
      );
    });

    it("should propagate errors from WhisperTranscriptionService", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const audioPath = "/cache/audio.mp3";
      const language = "vi";

      // Mock no cache
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 }); // 1 MB

      // Mock Whisper error
      const whisperError = new Error("Authentication failed - check OPENAI_API_KEY");
      mockWhisperService.transcribe.mockRejectedValue(whisperError);

      // Extract transcript should throw
      await expect(extractor.extractTranscript(videoId, audioPath, language)).rejects.toThrow(
        "Failed to extract transcript: Authentication failed - check OPENAI_API_KEY"
      );
    });

    it("should use cached transcript when available", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const audioPath = "/cache/audio.mp3";
      const language = "vi";

      const cachedSegments = [
        { startTime: 0, endTime: 5, text: "Cached transcript" }
      ];

      // Mock cache hit
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.readJson as jest.Mock).mockResolvedValue(cachedSegments);

      // Extract transcript
      const result = await extractor.extractTranscript(videoId, audioPath, language);

      // Verify Whisper service was NOT called
      expect(mockWhisperService.transcribe).not.toHaveBeenCalled();
      expect(result).toEqual(cachedSegments);
    });

    it("should preserve Vietnamese diacritics in transcript", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const audioPath = "/cache/audio.mp3";
      const language = "vi";

      // Mock no cache
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 }); // 1 MB

      // Mock Whisper response with Vietnamese diacritics
      const mockSegments = [
        { startTime: 0, endTime: 5, text: "Trời ơi! Được rồi." },
        { startTime: 5, endTime: 10, text: "Tiếng Việt đẹp lắm." }
      ];
      mockWhisperService.transcribe.mockResolvedValue(mockSegments);

      // Mock writeJson
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      // Extract transcript
      const result = await extractor.extractTranscript(videoId, audioPath, language);

      // Verify Vietnamese diacritics preserved
      expect(result[0].text).toContain("ơ");
      expect(result[0].text).toContain("ư");
      expect(result[1].text).toContain("ế");
      expect(result[1].text).toContain("ẹ");
    });
  });
});
