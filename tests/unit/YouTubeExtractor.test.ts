/**
 * Unit tests for YouTubeExtractor service
 *
 * Tests YouTube extraction functionality:
 * - Video ID extraction from URLs
 * - Cache directory management
 * - Cache hit detection
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

import { YouTubeExtractor } from "../../src/services/YouTubeExtractor";
import * as fsExtra from "fs-extra";
import * as path from "path";

// Mock system calls and external dependencies
jest.mock("child_process");
jest.mock("fs-extra");
jest.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: jest.fn()
  }
}));

describe("YouTubeExtractor", () => {
  let extractor: YouTubeExtractor;

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
});
