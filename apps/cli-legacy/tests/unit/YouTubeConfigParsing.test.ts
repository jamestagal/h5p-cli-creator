/**
 * Unit tests for YouTube config parsing and validation
 *
 * Tests config parsing functionality for time range specifications:
 * - Parsing startTime/endTime from config
 * - Backward compatibility (no time range)
 * - Invalid range rejection with clear errors
 * - Page timestamp validation against trimmed duration
 *
 * Phase 3: YouTube Extraction Improvements - Task Group 5
 */

import * as yaml from "js-yaml";
import { StoryConfig } from "../../src/models/StoryConfig";
import { validateTimeRange, validatePageTimestamps, parseTimeToSeconds } from "../../src/utils/timeRangeValidation";

describe("YouTube Config Parsing", () => {
  describe("Config with startTime/endTime", () => {
    it("should parse config with startTime and endTime correctly", () => {
      const yamlContent = `
title: "Test Story"
language: vi
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=TEST_ID"
  startTime: "01:30"
  endTime: "15:00"
translation:
  enabled: true
  targetLanguage: en
  style: collapsible
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:45"
`;

      const config = yaml.load(yamlContent) as StoryConfig;

      expect(config.source.startTime).toBe("01:30");
      expect(config.source.endTime).toBe("15:00");
      expect(config.source.url).toBe("https://www.youtube.com/watch?v=TEST_ID");
    });

    it("should parse time range in HH:MM:SS format", () => {
      const yamlContent = `
title: "Long Video Story"
language: en
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=LONG_VIDEO"
  startTime: "00:05:30"
  endTime: "01:30:00"
translation:
  enabled: false
  targetLanguage: en
  style: collapsible
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "05:00"
`;

      const config = yaml.load(yamlContent) as StoryConfig;

      expect(config.source.startTime).toBe("00:05:30");
      expect(config.source.endTime).toBe("01:30:00");

      // Verify timestamps parse correctly
      const startSeconds = parseTimeToSeconds(config.source.startTime!);
      const endSeconds = parseTimeToSeconds(config.source.endTime!);

      expect(startSeconds).toBe(330); // 5 minutes 30 seconds
      expect(endSeconds).toBe(5400);  // 1 hour 30 minutes
    });
  });

  describe("Backward compatibility (no time range)", () => {
    it("should work with config without startTime/endTime", () => {
      const yamlContent = `
title: "Full Video Story"
language: vi
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=FULL_VIDEO"
translation:
  enabled: true
  targetLanguage: en
  style: collapsible
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:45"
`;

      const config = yaml.load(yamlContent) as StoryConfig;

      expect(config.source.startTime).toBeUndefined();
      expect(config.source.endTime).toBeUndefined();
      expect(config.source.url).toBe("https://www.youtube.com/watch?v=FULL_VIDEO");
    });
  });

  describe("Invalid range rejection", () => {
    it("should reject range where startTime >= endTime", () => {
      const startTime = "15:00";
      const endTime = "01:30";
      const videoDuration = 1200; // 20 minutes

      expect(() => {
        validateTimeRange(startTime, endTime, videoDuration);
      }).toThrow(/startTime.*must be before endTime/);
    });

    it("should reject range where endTime exceeds video duration", () => {
      const startTime = "01:30";
      const endTime = "25:00"; // 25 minutes
      const videoDuration = 1200; // 20 minutes (20:00)

      expect(() => {
        validateTimeRange(startTime, endTime, videoDuration);
      }).toThrow(/endTime.*exceeds video duration/);
    });

    it("should reject range with invalid format", () => {
      const startTime = "invalid";
      const endTime = "15:00";
      const videoDuration = 1200;

      expect(() => {
        validateTimeRange(startTime, endTime, videoDuration);
      }).toThrow(/Invalid.*format/);
    });

    it("should reject range where startTime exceeds video duration", () => {
      const startTime = "25:00"; // Beyond video duration
      const endTime = "26:00"; // Also beyond, but startTime is checked after endTime in validation
      const videoDuration = 1200; // 20 minutes

      // Note: The validation checks endTime first, so this will throw endTime error
      expect(() => {
        validateTimeRange(startTime, endTime, videoDuration);
      }).toThrow(/exceeds video duration/);
    });
  });

  describe("Page timestamp validation against trimmed duration", () => {
    it("should validate page timestamps within trimmed duration", () => {
      // Video trimmed from 01:30 to 15:00 = 13:30 duration (810 seconds)
      const trimmedDuration = 810;

      // Page 1: 00:00 to 00:45 (valid)
      expect(() => {
        validatePageTimestamps("00:00", "00:45", trimmedDuration, 1);
      }).not.toThrow();

      // Page 2: 05:00 to 10:00 (valid)
      expect(() => {
        validatePageTimestamps("05:00", "10:00", trimmedDuration, 2);
      }).not.toThrow();
    });

    it("should reject page timestamps exceeding trimmed duration", () => {
      // Video trimmed from 01:30 to 15:00 = 13:30 duration (810 seconds)
      const trimmedDuration = 810;

      // Page 3: 12:00 to 20:00 (invalid - exceeds 13:30)
      expect(() => {
        validatePageTimestamps("12:00", "20:00", trimmedDuration, 3);
      }).toThrow(/Page 3.*endTime.*exceeds trimmed audio duration/);
    });

    it("should provide clear error message for out-of-range page timestamps", () => {
      // Video trimmed from 01:30 to 10:00 = 8:30 duration (510 seconds)
      const trimmedDuration = 510;

      // Page 3: 05:00 to 10:30 (invalid - exceeds 8:30)
      expect(() => {
        validatePageTimestamps("05:00", "10:30", trimmedDuration, 3);
      }).toThrow(/Page 3.*endTime \(10:30\) exceeds trimmed audio duration \(08:30\)/);
    });

    it("should validate that page timestamps are relative to trimmed audio (not original video)", () => {
      // Video trimmed from 01:30 to 15:00 = 13:30 duration (810 seconds)
      // Page timestamps start at 00:00 (which is 01:30 in original video)
      const trimmedDuration = 810;

      // Page starting at 00:00 should be valid (not 01:30)
      expect(() => {
        validatePageTimestamps("00:00", "00:45", trimmedDuration, 1);
      }).not.toThrow();

      // Maximum valid page end time should be ~13:30, not 15:00
      expect(() => {
        validatePageTimestamps("13:00", "13:30", trimmedDuration, 5);
      }).not.toThrow();

      // Page ending at 15:00 should be invalid (exceeds trimmed duration)
      expect(() => {
        validatePageTimestamps("14:00", "15:00", trimmedDuration, 6);
      }).toThrow(/exceeds trimmed audio duration/);
    });
  });
});
