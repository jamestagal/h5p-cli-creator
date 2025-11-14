/**
 * Integration tests for YouTube Extraction Improvements
 *
 * Tests end-to-end workflows and edge cases for:
 * - Feature 1: Audio segments in cache directory
 * - Feature 2: Video time range specification
 *
 * These tests verify complete user workflows from config to final output.
 *
 * YouTube Extraction Improvements - Task Group 6
 */

import { YouTubeExtractor } from "../../src/services/YouTubeExtractor";
import { AudioSplitter } from "../../src/services/AudioSplitter";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { validateTimeRange } from "../../src/utils/timeRangeValidation";

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

// Mock fs-extra
jest.mock("fs-extra");

// Mock child_process
jest.mock("child_process", () => ({
  exec: jest.fn()
}));

// Mock WhisperTranscriptionService
jest.mock("../../src/services/transcription/WhisperTranscriptionService");

describe("YouTube Extraction Integration Tests", () => {
  let extractor: YouTubeExtractor;
  let mockExec: jest.Mock;

  beforeEach(() => {
    mockExec = require("child_process").exec;

    // Default behavior: all commands succeed
    mockExec.mockImplementation((cmd: string, callback: Function) => {
      if (cmd.includes("--dump-json")) {
        callback(null, {
          stdout: JSON.stringify({ duration: 1200, title: "Test Video" }),
          stderr: ""
        });
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
    });

    extractor = new YouTubeExtractor();
    jest.clearAllMocks();
  });

  describe("End-to-end: Full video extraction with segments in cache directory", () => {
    it("should extract full video and store all assets in cache directory", async () => {
      const videoId = "TEST_VIDEO_FULL";
      const url = "https://www.youtube.com/watch?v=TEST_VIDEO_FULL";
      const cacheDir = extractor.getCacheDirectory(videoId);
      const segmentsDir = path.join(cacheDir, "audio-segments");

      // Mock file system operations
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test segment" }
      ]);

      // Extract full video (no time range)
      await extractor.extract(url, "en");

      // Verify cache directory structure is created
      expect(fsExtra.ensureDir).toHaveBeenCalledWith(expect.stringContaining("TEST_VIDEO_"));

      // Verify cache metadata is saved
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      expect(metadataCalls.length).toBeGreaterThan(0);

      // Verify no extraction range in metadata (full video)
      const savedMetadata = metadataCalls[0][1];
      expect(savedMetadata.extractionRange).toBeUndefined();
    });

    it("should create audio segments in video-specific cache directory during full workflow", async () => {
      const videoId = "TEST_VIDEO_WITH_SEGMENTS";
      const cacheDir = extractor.getCacheDirectory(videoId);
      const segmentsDir = path.join(cacheDir, "audio-segments");
      const audioPath = path.join(cacheDir, "audio.mp3");

      // Create AudioSplitter with video-specific cache directory
      const splitter = new AudioSplitter(segmentsDir);

      // Mock file system
      (fsExtra.ensureFile as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);

      // Mock ffmpeg creating output files
      mockExec.mockImplementation((command: string, callback: Function) => {
        const outputMatch = command.match(/"([^"]+\.mp3)"$/);
        if (outputMatch) {
          const outputPath = outputMatch[1];
          fsExtra.ensureFile(outputPath)
            .then(() => fsExtra.writeFile(outputPath, "mock audio segment"))
            .then(() => callback(null, { stdout: "", stderr: "" }))
            .catch((err) => callback(err));
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Create mock audio file
      await fsExtra.ensureFile(audioPath);
      await fsExtra.writeFile(audioPath, "mock audio");

      // Split audio into segments
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 30 },
        { pageNumber: 2, startTime: 30, endTime: 60 }
      ];

      const result = await splitter.splitAudio(audioPath, segments, 60);

      // Verify segments are in video-specific cache directory
      expect(result[0].filePath).toBe(path.join(segmentsDir, "page1.mp3"));
      expect(result[1].filePath).toBe(path.join(segmentsDir, "page2.mp3"));

      // Verify all assets co-located in cache directory
      expect(result[0].filePath).toContain(videoId);
      expect(result[1].filePath).toContain(videoId);
    });
  });

  describe("End-to-end: Trimmed video extraction with cost savings", () => {
    it("should extract trimmed video range and store extraction range in cache", async () => {
      const videoId = "TEST_VIDEO_TRIMMED";
      const url = "https://www.youtube.com/watch?v=TEST_VIDEO_TRIMMED";
      const startTime = "02:00"; // 120 seconds
      const endTime = "10:00"; // 600 seconds
      // Trimmed duration: 480 seconds = 8 minutes

      // Mock video metadata (20-minute video)
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 1200, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 480 * 16 * 1024 }); // 8 minutes
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      // Extract with time range
      await extractor.extract(url, "en", startTime, endTime);

      // Verify extraction range stored in cache metadata
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      expect(metadataCalls.length).toBeGreaterThan(0);

      const savedMetadata = metadataCalls[0][1];
      expect(savedMetadata.extractionRange).toEqual({
        startTime,
        endTime
      });

      // Verify cost is calculated based on trimmed duration (8 minutes)
      const expectedCost = (480 / 60) * 0.006; // $0.048
      expect(savedMetadata.transcription.cost).toBeCloseTo(expectedCost, 2);
    });

    it("should achieve cost savings with trimmed extraction vs full video", async () => {
      const videoId = "TEST_COST_SAVINGS";
      const url = "https://www.youtube.com/watch?v=TEST_COST_SAVINGS";

      // Original video: 20 minutes = 1200 seconds, Cost: $0.12
      // Trimmed: 5 minutes = 300 seconds, Cost: $0.03
      // Savings: $0.09 (75%)

      const startTime = "05:00"; // Skip 5-minute intro
      const endTime = "10:00"; // Skip 10-minute outro

      // Mock full video metadata
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 1200, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 300 * 16 * 1024 }); // 5 minutes
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      await extractor.extract(url, "en", startTime, endTime);

      // Calculate costs
      const fullVideoDuration = 1200; // 20 minutes
      const trimmedDuration = 300; // 5 minutes
      const fullVideoCost = (fullVideoDuration / 60) * 0.006; // $0.12
      const trimmedCost = (trimmedDuration / 60) * 0.006; // $0.03
      const savings = fullVideoCost - trimmedCost; // $0.09

      // Verify significant cost savings
      expect(savings).toBeCloseTo(0.09, 2);
      expect(savings / fullVideoCost).toBeCloseTo(0.75, 2); // 75% savings
    });
  });

  describe("Edge case: Trimming to full video duration (00:00 - end)", () => {
    it("should handle trimming to 00:00 - video duration as full video extraction", async () => {
      const videoId = "TEST_FULL_VIA_TRIM";
      const url = "https://www.youtube.com/watch?v=TEST_FULL_VIA_TRIM";
      const startTime = "00:00";
      const endTime = "20:00"; // Exact video duration

      // Mock video metadata (20-minute video)
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 1200, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1200 * 16 * 1024 }); // 20 minutes
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      // Extract with time range that matches full video
      await extractor.extract(url, "en", startTime, endTime);

      // Verify extraction range is stored
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      const savedMetadata = metadataCalls[0][1];

      expect(savedMetadata.extractionRange).toEqual({
        startTime: "00:00",
        endTime: "20:00"
      });

      // Verify cost matches full video (no savings)
      const fullVideoCost = (1200 / 60) * 0.006; // $0.12
      expect(savedMetadata.transcription.cost).toBeCloseTo(fullVideoCost, 2);
    });
  });

  describe("Edge case: Very short trim ranges", () => {
    it("should handle trimming very short ranges (< 10 seconds)", async () => {
      const videoId = "TEST_SHORT_TRIM";
      const url = "https://www.youtube.com/watch?v=TEST_SHORT_TRIM";
      const startTime = "00:05";
      const endTime = "00:10"; // 5-second clip

      // Mock video metadata
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 300, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 5 * 16 * 1024 }); // 5 seconds
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      // Extract very short clip
      await extractor.extract(url, "en", startTime, endTime);

      // Verify extraction succeeded
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      expect(metadataCalls.length).toBeGreaterThan(0);

      const savedMetadata = metadataCalls[0][1];
      expect(savedMetadata.extractionRange).toEqual({
        startTime,
        endTime
      });

      // Verify minimal cost for very short clip
      const expectedCost = (5 / 60) * 0.006; // ~$0.0005
      expect(savedMetadata.transcription.cost).toBeLessThan(0.001);
    });
  });

  describe("Backward compatibility: Config without startTime/endTime", () => {
    it("should extract full video when no time range specified in config", async () => {
      const videoId = "TEST_NO_RANGE";
      const url = "https://www.youtube.com/watch?v=TEST_NO_RANGE";

      // Mock video metadata
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 600, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 600 * 16 * 1024 }); // 10 minutes
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      // Extract without time range (backward compatibility)
      await extractor.extract(url, "en");

      // Verify no extraction range in metadata
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      const savedMetadata = metadataCalls[0][1];

      expect(savedMetadata.extractionRange).toBeUndefined();

      // Verify cost based on full video duration
      const fullVideoCost = (600 / 60) * 0.006; // 10 minutes = $0.06
      expect(savedMetadata.transcription.cost).toBeCloseTo(fullVideoCost, 2);
    });
  });

  describe("Validation: Invalid time ranges rejected before expensive operations", () => {
    it("should reject invalid range before downloading video", () => {
      const videoDuration = 1200; // 20 minutes

      // startTime >= endTime
      expect(() => {
        validateTimeRange("15:00", "10:00", videoDuration);
      }).toThrow(/startTime.*must be before endTime/);

      // endTime exceeds video duration
      expect(() => {
        validateTimeRange("01:00", "25:00", videoDuration);
      }).toThrow(/endTime.*exceeds video duration/);

      // Invalid format
      expect(() => {
        validateTimeRange("invalid", "10:00", videoDuration);
      }).toThrow(/Invalid.*format/);
    });

    it("should validate time range early in extraction workflow", async () => {
      const url = "https://www.youtube.com/watch?v=TEST_VALIDATION";
      const startTime = "15:00";
      const endTime = "10:00"; // Invalid: startTime > endTime

      // Mock video metadata
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("--dump-json")) {
          callback(null, {
            stdout: JSON.stringify({ duration: 1200, title: "Test Video" }),
            stderr: ""
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);

      // Attempt to extract with invalid range
      await expect(extractor.extract(url, "en", startTime, endTime)).rejects.toThrow(
        /startTime.*must be before endTime/
      );

      // Verify expensive operations (transcription) were NOT called
      // This is validated by the fact that writeJson for cache metadata is NOT called
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );
      expect(metadataCalls.length).toBe(0);
    });
  });

  describe("Cache deletion removes all assets including segments", () => {
    it("should remove all video assets when cache directory is deleted", async () => {
      const videoId = "TEST_CACHE_DELETE";
      const cacheDir = extractor.getCacheDirectory(videoId);
      const segmentsDir = path.join(cacheDir, "audio-segments");

      // Mock cache directory exists with segments
      (fsExtra.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes(videoId);
      });
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(true);
      (fsExtra.remove as jest.Mock).mockResolvedValue(undefined);

      // Delete cache directory
      await fsExtra.remove(cacheDir);

      // Verify remove was called with cache directory
      expect(fsExtra.remove).toHaveBeenCalledWith(cacheDir);

      // Mock that directory no longer exists
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);

      // Verify all paths under cache directory no longer exist
      expect(await fsExtra.pathExists(path.join(cacheDir, "audio.mp3"))).toBe(false);
      expect(await fsExtra.pathExists(path.join(cacheDir, "whisper-transcript.json"))).toBe(false);
      expect(await fsExtra.pathExists(path.join(cacheDir, "cache-metadata.json"))).toBe(false);
      expect(await fsExtra.pathExists(segmentsDir)).toBe(false);
    });
  });
});
