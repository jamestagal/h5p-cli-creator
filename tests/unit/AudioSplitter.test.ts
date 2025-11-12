/**
 * Unit tests for AudioSplitter service
 *
 * Tests audio segmentation functionality:
 * - Timestamp parsing (MM:SS to seconds)
 * - Timestamp validation
 * - Segment file naming
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

import { AudioSplitter } from "../../src/services/AudioSplitter";
import { AudioSegment } from "../../src/services/types/YouTubeExtractorTypes";

// Mock system calls
jest.mock("child_process");
jest.mock("fs-extra");

describe("AudioSplitter", () => {
  let splitter: AudioSplitter;

  beforeEach(() => {
    splitter = new AudioSplitter();
    jest.clearAllMocks();
  });

  describe("parseTimestamp", () => {
    it("should parse MM:SS format to seconds", () => {
      expect(splitter.parseTimestamp("00:00")).toBe(0);
      expect(splitter.parseTimestamp("00:38")).toBe(38);
      expect(splitter.parseTimestamp("01:06")).toBe(66);
      expect(splitter.parseTimestamp("05:14")).toBe(314);
    });

    it("should parse M:SS format (single digit minutes)", () => {
      expect(splitter.parseTimestamp("0:30")).toBe(30);
      expect(splitter.parseTimestamp("5:00")).toBe(300);
    });

    it("should parse HH:MM:SS format", () => {
      expect(splitter.parseTimestamp("01:00:00")).toBe(3600);
      expect(splitter.parseTimestamp("01:30:45")).toBe(5445);
    });

    it("should throw error for invalid timestamp format", () => {
      expect(() => splitter.parseTimestamp("invalid")).toThrow();
      expect(() => splitter.parseTimestamp("99")).toThrow();
      expect(() => splitter.parseTimestamp("")).toThrow();
    });
  });

  describe("formatTimestamp", () => {
    it("should format seconds to MM:SS", () => {
      expect(splitter.formatTimestamp(0)).toBe("00:00");
      expect(splitter.formatTimestamp(38)).toBe("00:38");
      expect(splitter.formatTimestamp(66)).toBe("01:06");
      expect(splitter.formatTimestamp(314)).toBe("05:14");
    });

    it("should format large values to HH:MM:SS", () => {
      expect(splitter.formatTimestamp(3600)).toBe("01:00:00");
      expect(splitter.formatTimestamp(5445)).toBe("01:30:45");
    });
  });

  describe("validateTimestamps", () => {
    it("should validate valid timestamp ranges", () => {
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 38 },
        { pageNumber: 2, startTime: 38, endTime: 66 },
        { pageNumber: 3, startTime: 66, endTime: 100 }
      ];

      const duration = 120;
      expect(() => splitter.validateTimestamps(segments, duration)).not.toThrow();
    });

    it("should throw error for overlapping timestamps", () => {
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 40 },
        { pageNumber: 2, startTime: 35, endTime: 66 } // Overlaps with page 1
      ];

      const duration = 120;
      expect(() => splitter.validateTimestamps(segments, duration)).toThrow("overlap");
    });

    it("should throw error for timestamps beyond duration", () => {
      const segments = [
        { pageNumber: 1, startTime: 0, endTime: 38 },
        { pageNumber: 2, startTime: 38, endTime: 150 } // Beyond duration
      ];

      const duration = 120;
      expect(() => splitter.validateTimestamps(segments, duration)).toThrow("beyond video duration");
    });

    it("should throw error for end time before start time", () => {
      const segments = [
        { pageNumber: 1, startTime: 50, endTime: 30 } // Invalid range
      ];

      const duration = 120;
      expect(() => splitter.validateTimestamps(segments, duration)).toThrow("end time");
    });
  });

  describe("generateSegmentFileName", () => {
    it("should generate sequential file names", () => {
      expect(splitter.generateSegmentFileName(1)).toBe("page1.mp3");
      expect(splitter.generateSegmentFileName(2)).toBe("page2.mp3");
      expect(splitter.generateSegmentFileName(11)).toBe("page11.mp3");
    });
  });
});
