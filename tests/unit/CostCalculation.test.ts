/**
 * Unit tests for cost calculation and transparency
 *
 * Tests cost calculation features:
 * - Cost calculated based on trimmed duration (not full video)
 * - Cost savings stored in cache metadata
 * - Cache metadata stores cost information
 *
 * Phase 3: YouTube Extraction Improvements - Cost Calculation and Transparency
 */

import { YouTubeExtractor } from "../../src/services/YouTubeExtractor";
import { WhisperTranscriptionService } from "../../src/services/transcription/WhisperTranscriptionService";
import * as fsExtra from "fs-extra";

// Mock chalk (following pattern from YouTubeAudioTrimming.test.ts)
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

describe("Cost Calculation and Transparency", () => {
  let extractor: YouTubeExtractor;
  let mockExec: jest.Mock;
  let mockWhisperService: jest.Mocked<WhisperTranscriptionService>;

  beforeEach(() => {
    // Get the mocked exec function
    mockExec = require("child_process").exec;

    // Default behavior: all commands succeed
    mockExec.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: JSON.stringify({ duration: 1200, title: "Test Video" }), stderr: "" });
    });

    // Mock WhisperTranscriptionService
    mockWhisperService = new WhisperTranscriptionService() as jest.Mocked<WhisperTranscriptionService>;
    mockWhisperService.transcribe = jest.fn().mockResolvedValue([
      { startTime: 0, endTime: 5, text: "Test segment" }
    ]);

    extractor = new YouTubeExtractor(undefined, mockWhisperService);
    jest.clearAllMocks();
  });

  describe("Cost calculation based on trimmed duration", () => {
    it("should calculate cost based on trimmed audio duration, not full video", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";
      const startTime = "01:30"; // 90 seconds
      const endTime = "15:00"; // 900 seconds
      // Trimmed duration: 810 seconds = 13.5 minutes
      // Cost: 13.5 * $0.006 = $0.081

      // Mock file system for audio download
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.move as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      // Mock trimmed audio file size (810 seconds * 16 KB/s)
      const trimmedSizeBytes = 810 * 16 * 1024; // 13,271,040 bytes
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: trimmedSizeBytes });

      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      // Extract with time range
      await extractor.extract(url, "en", startTime, endTime);

      // Verify cache metadata stores correct cost (based on trimmed duration)
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );

      expect(metadataCalls.length).toBeGreaterThan(0);
      const savedMetadata = metadataCalls[0][1];

      // Cost should be based on trimmed duration (13.5 minutes)
      expect(savedMetadata.transcription).toBeDefined();
      expect(savedMetadata.transcription.cost).toBeCloseTo(0.081, 2);
      expect(savedMetadata.transcription.duration).toBeCloseTo(810, 0);

      // Verify extraction range is stored
      expect(savedMetadata.extractionRange).toEqual({
        startTime,
        endTime
      });
    });

    it("should store cost in cache metadata for reference", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";

      // Mock file system
      (fsExtra.existsSync as jest.Mock).mockReturnValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 5 * 60 * 16 * 1024 }); // 5 minutes
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      await extractor.extract(url, "en");

      // Verify cache metadata includes cost
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );

      expect(metadataCalls.length).toBeGreaterThan(0);
      const savedMetadata = metadataCalls[0][1];

      expect(savedMetadata.transcription).toBeDefined();
      expect(savedMetadata.transcription.cost).toBeGreaterThan(0);
      expect(savedMetadata.transcription.duration).toBeGreaterThan(0);
      expect(savedMetadata.transcription.provider).toBe("whisper-api");
      expect(savedMetadata.transcription.model).toBe("whisper-1");
    });
  });

  describe("Cost savings with trimming", () => {
    it("should calculate lower cost for trimmed video vs full video", async () => {
      const videoId = "Y8M9RJ_4C7E";
      const url = "https://www.youtube.com/watch?v=Y8M9RJ_4C7E";
      const startTime = "02:00"; // 120 seconds
      const endTime = "10:00"; // 600 seconds
      // Trimmed: 480 seconds = 8 minutes, Cost: $0.048
      // Original: 20 minutes = 1200 seconds, Cost: $0.12
      // Savings: $0.072

      // Mock full video duration (20 minutes)
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

      // Mock trimmed audio size (8 minutes)
      const trimmedSizeBytes = 480 * 16 * 1024;
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: trimmedSizeBytes });

      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.readJson as jest.Mock).mockResolvedValue([
        { startTime: 0, endTime: 5, text: "Test" }
      ]);

      await extractor.extract(url, "en", startTime, endTime);

      // Verify cache metadata shows trimmed cost
      const metadataCalls = (fsExtra.writeJson as jest.Mock).mock.calls.filter((call) =>
        call[0].includes("cache-metadata.json")
      );

      const savedMetadata = metadataCalls[0][1];

      // Cost should be for 8 minutes (trimmed), not 20 minutes (original)
      const expectedCost = (480 / 60) * 0.006; // 8 minutes * $0.006/min = $0.048
      expect(savedMetadata.transcription.cost).toBeCloseTo(expectedCost, 2);

      // Calculate savings (what we would have paid for full video)
      const fullVideoCost = (1200 / 60) * 0.006; // 20 minutes * $0.006/min = $0.12
      const savings = fullVideoCost - expectedCost; // $0.072

      // Verify savings is significant
      expect(savings).toBeGreaterThan(0.07);
    });
  });
});
