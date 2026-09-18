/**
 * Tests for TimestampDeriver service.
 *
 * Tests timestamp derivation from matched Whisper segments:
 * - Single-segment page timestamps
 * - Multi-segment page timestamps
 * - Decimal precision preservation (9.4s, 17.6s)
 * - Duration calculation (endTime - startTime)
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import { TimestampDeriver } from "../../src/services/transcription/TimestampDeriver";
import { MatchedSegment, DerivedTimestamp } from "../../src/services/types/YouTubeExtractorTypes";

describe("TimestampDeriver", () => {
  describe("deriveTimestamps", () => {
    it("should derive timestamps from single-segment page", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [
            { startTime: 9.4, endTime: 17.6, text: "Single segment" }
          ],
          confidence: 1.0
        }
      ];

      const result = TimestampDeriver.deriveTimestamps(matchedSegments);

      expect(result).toHaveLength(1);
      expect(result[0].pageNumber).toBe(1);
      expect(result[0].startTime).toBe(9.4);
      expect(result[0].endTime).toBe(17.6);
      expect(result[0].duration).toBeCloseTo(8.2, 1);
    });

    it("should derive timestamps from multi-segment page", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [
            { startTime: 0, endTime: 5.3, text: "First" },
            { startTime: 5.3, endTime: 10.7, text: "Second" },
            { startTime: 10.7, endTime: 15.2, text: "Third" }
          ],
          confidence: 1.0
        }
      ];

      const result = TimestampDeriver.deriveTimestamps(matchedSegments);

      expect(result).toHaveLength(1);
      expect(result[0].pageNumber).toBe(1);
      expect(result[0].startTime).toBe(0); // First segment start
      expect(result[0].endTime).toBe(15.2); // Last segment end
      expect(result[0].duration).toBeCloseTo(15.2, 1);
    });

    it("should preserve decimal precision from Whisper", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [
            { startTime: 9.4, endTime: 17.6, text: "Test" }
          ],
          confidence: 1.0
        }
      ];

      const result = TimestampDeriver.deriveTimestamps(matchedSegments);

      // Exact decimal values preserved
      expect(result[0].startTime).toBe(9.4);
      expect(result[0].endTime).toBe(17.6);
    });

    it("should calculate duration correctly", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [
            { startTime: 10.5, endTime: 25.8, text: "Test" }
          ],
          confidence: 1.0
        }
      ];

      const result = TimestampDeriver.deriveTimestamps(matchedSegments);

      expect(result[0].duration).toBeCloseTo(15.3, 1); // 25.8 - 10.5 = 15.3
    });

    it("should handle multiple pages", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [{ startTime: 0, endTime: 10, text: "Page 1" }],
          confidence: 1.0
        },
        {
          pageNumber: 2,
          segments: [{ startTime: 10, endTime: 20, text: "Page 2" }],
          confidence: 1.0
        },
        {
          pageNumber: 3,
          segments: [{ startTime: 20, endTime: 30, text: "Page 3" }],
          confidence: 1.0
        }
      ];

      const result = TimestampDeriver.deriveTimestamps(matchedSegments);

      expect(result).toHaveLength(3);
      expect(result[0].startTime).toBe(0);
      expect(result[1].startTime).toBe(10);
      expect(result[2].startTime).toBe(20);
    });

    it("should error if segments array is empty", () => {
      const matchedSegments: MatchedSegment[] = [
        {
          pageNumber: 1,
          segments: [],
          confidence: 1.0
        }
      ];

      expect(() => {
        TimestampDeriver.deriveTimestamps(matchedSegments);
      }).toThrow("no segments");
    });
  });
});
