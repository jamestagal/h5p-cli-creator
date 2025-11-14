/**
 * Unit tests for YouTube audio trimming functionality
 *
 * Tests video time range extraction features:
 * - Audio trimming with ffmpeg
 * - Time range validation
 * - Cache metadata storage of extraction range
 * - Backward compatibility (no range = full video)
 *
 * Phase 3: YouTube Extraction Improvements - Audio Trimming
 */

import { YouTubeExtractor } from "../../src/services/YouTubeExtractor";
import * as fsExtra from "fs-extra";
import * as path from "path";
import { parseTimeToSeconds } from "../../src/utils/timeRangeValidation";

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

describe("YouTubeExtractor - Audio Trimming", () => {
  let extractor: YouTubeExtractor;
  let mockExec: jest.Mock;

  beforeEach(() => {
    // Get the mocked exec function
    mockExec = require("child_process").exec;

    // Default behavior: all commands succeed
    mockExec.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: "", stderr: "" });
    });

    extractor = new YouTubeExtractor();
    jest.clearAllMocks();
  });

  describe("trimAudio", () => {
    it("should trim audio to specified time range using ffmpeg", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const startTime = "01:30"; // 90 seconds
      const endTime = "15:00"; // 900 seconds

      // Mock file system operations
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 }); // 1 MB
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);

      // Track ffmpeg commands
      let ffmpegCommand = "";
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("ffmpeg") && cmd.includes("-ss")) {
          ffmpegCommand = cmd;
        }
        callback(null, { stdout: "", stderr: "" });
      });

      // Call trimAudio
      await (extractor as any).trimAudio(videoId, startTime, endTime);

      // Verify ffmpeg command is correct
      expect(ffmpegCommand).toContain("ffmpeg");
      expect(ffmpegCommand).toContain("-ss 90");
      expect(ffmpegCommand).toContain("-to 900");
      expect(ffmpegCommand).toContain("-c copy");

      // Verify file was moved to replace original
      expect(fsExtra.move).toHaveBeenCalledWith(
        expect.stringContaining("audio-trimmed.mp3"),
        expect.stringContaining("audio.mp3"),
        { overwrite: true }
      );
    });

    it("should overwrite original audio.mp3 with trimmed version", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const cacheDir = extractor.getCacheDirectory(videoId);
      const audioPath = path.join(cacheDir, "audio.mp3");
      const trimmedPath = path.join(cacheDir, "audio-trimmed.mp3");

      // Mock file system operations
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 512 }); // Smaller after trim
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);

      // Call trimAudio
      await (extractor as any).trimAudio(videoId, "01:30", "15:00");

      // Verify the trimmed file replaces original
      expect(fsExtra.move).toHaveBeenCalledWith(
        trimmedPath,
        audioPath,
        { overwrite: true }
      );
    });

    it("should convert MM:SS timestamps to decimal seconds for ffmpeg", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);

      // Mock execAsync and capture command
      let capturedCommand = "";
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("-ss")) {
          capturedCommand = cmd;
        }
        callback(null, { stdout: "", stderr: "" });
      });

      // Test with MM:SS format
      await (extractor as any).trimAudio(videoId, "02:30", "10:45");

      // Verify command uses decimal seconds (150 and 645)
      expect(capturedCommand).toContain("-ss 150");
      expect(capturedCommand).toContain("-to 645");
    });

    it("should support HH:MM:SS timestamp format", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);

      // Mock execAsync and capture command
      let capturedCommand = "";
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("-ss")) {
          capturedCommand = cmd;
        }
        callback(null, { stdout: "", stderr: "" });
      });

      // Test with HH:MM:SS format
      await (extractor as any).trimAudio(videoId, "00:01:30", "00:15:00");

      // Verify command uses decimal seconds (90 and 900)
      expect(capturedCommand).toContain("-ss 90");
      expect(capturedCommand).toContain("-to 900");
    });

    it("should throw error if startTime >= endTime", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Attempt to trim with invalid range
      await expect((extractor as any).trimAudio(videoId, "15:00", "01:30")).rejects.toThrow(
        "startTime"
      );
    });

    it("should handle ffmpeg errors gracefully", async () => {
      const videoId = "Y8M9RJ_4C7E";

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);

      // Mock execAsync to fail for ffmpeg trimming command
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        if (cmd.includes("ffmpeg") && cmd.includes("-ss")) {
          callback(new Error("ffmpeg processing failed"), null);
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      });

      // Should throw error
      await expect((extractor as any).trimAudio(videoId, "01:30", "15:00")).rejects.toThrow(
        "Failed to trim audio"
      );
    });
  });

  describe("downloadAudio with time range", () => {
    it("should skip trimming when no time range specified (backward compatibility)", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);

      // Track execAsync calls
      const execCalls: string[] = [];
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        execCalls.push(cmd);
        callback(null, { stdout: "", stderr: "" });
      });

      // Download without time range
      await extractor.downloadAudio(videoId, url);

      // Verify trimming was NOT called (no ffmpeg trim command)
      const ffmpegTrimCalls = execCalls.filter(
        (call) => call.includes("ffmpeg") && call.includes("-ss")
      );
      expect(ffmpegTrimCalls.length).toBe(0);
    });
  });

  describe("Cache metadata with extraction range", () => {
    it("should store extraction range in cache metadata", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const metadata = {
        videoId: "Y8M9RJ_4C7E",
        audioPath: "/cache/audio.mp3",
        transcriptPath: "/cache/transcript.json",
        downloadDate: "2025-11-14T10:00:00Z",
        duration: 900,
        title: "Test Video",
        extractionRange: {
          startTime: "01:30",
          endTime: "15:00"
        }
      };

      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      await extractor.saveCacheMetadata(videoId, metadata);

      // Verify metadata includes extraction range
      expect(fsExtra.writeJson).toHaveBeenCalledWith(
        expect.stringContaining("cache-metadata.json"),
        expect.objectContaining({
          extractionRange: {
            startTime: "01:30",
            endTime: "15:00"
          }
        }),
        expect.any(Object)
      );
    });

    it("should load extraction range from cache metadata", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const cachedMetadata = {
        videoId: "Y8M9RJ_4C7E",
        audioPath: "/cache/audio.mp3",
        transcriptPath: "/cache/transcript.json",
        downloadDate: "2025-11-14T10:00:00Z",
        extractionRange: {
          startTime: "01:30",
          endTime: "15:00"
        }
      };

      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.readJson as jest.Mock).mockResolvedValue(cachedMetadata);

      const loaded = await extractor.loadCacheMetadata(videoId);

      // Verify extraction range was loaded
      expect(loaded).toBeDefined();
      expect(loaded?.extractionRange).toEqual({
        startTime: "01:30",
        endTime: "15:00"
      });
    });

    it("should work with cache metadata without extraction range (backward compatibility)", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const cachedMetadata = {
        videoId: "Y8M9RJ_4C7E",
        audioPath: "/cache/audio.mp3",
        transcriptPath: "/cache/transcript.json",
        downloadDate: "2025-11-14T10:00:00Z"
        // No extractionRange field
      };

      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
      (fsExtra.readJson as jest.Mock).mockResolvedValue(cachedMetadata);

      const loaded = await extractor.loadCacheMetadata(videoId);

      // Should load successfully without extraction range
      expect(loaded).toBeDefined();
      expect(loaded?.extractionRange).toBeUndefined();
    });
  });
});
