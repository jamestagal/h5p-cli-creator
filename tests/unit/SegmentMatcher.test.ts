/**
 * Tests for SegmentMatcher service.
 *
 * Tests sequential matching algorithm with three matching modes:
 * - Sequential matching (prevents duplicate segment assignment)
 * - Repetition drills (1st "Bonjour" → 2nd "Bonjour" → 3rd "Bonjour")
 * - Multi-segment page matching
 * - Single-segment page matching
 * - Tolerant mode (85% similarity threshold)
 * - Fuzzy mode (60% similarity threshold)
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import * as path from "path";
import * as fsExtra from "fs-extra";
import { SegmentMatcher } from "../../src/services/transcription/SegmentMatcher";
import { TranscriptSegment } from "../../src/services/types/YouTubeExtractorTypes";

describe("SegmentMatcher", () => {
  describe("sequential matching (prevents duplicates)", () => {
    it("should match pages sequentially without duplicate segments", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "First segment" },
        { startTime: 5, endTime: 10, text: "Second segment" },
        { startTime: 10, endTime: 15, text: "Third segment" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      const result1 = matcher.matchPageToSegments("First segment");
      const result2 = matcher.matchPageToSegments("Second segment");
      const result3 = matcher.matchPageToSegments("Third segment");

      // Each page should match different segments (no duplicates)
      expect(result1.segments).toHaveLength(1);
      expect(result1.segments[0].text).toBe("First segment");

      expect(result2.segments).toHaveLength(1);
      expect(result2.segments[0].text).toBe("Second segment");

      expect(result3.segments).toHaveLength(1);
      expect(result3.segments[0].text).toBe("Third segment");
    });

    it("should handle repetition drills (repeated phrases get unique segments)", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 2.5, text: "Bonjour" },
        { startTime: 2.5, endTime: 5.0, text: "Bonjour" },
        { startTime: 5.0, endTime: 7.5, text: "Bonjour" },
        { startTime: 7.5, endTime: 10.0, text: "Au revoir" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      const page1 = matcher.matchPageToSegments("Bonjour");
      const page2 = matcher.matchPageToSegments("Bonjour");
      const page3 = matcher.matchPageToSegments("Bonjour");
      const page4 = matcher.matchPageToSegments("Au revoir");

      // Each "Bonjour" should match different segment chronologically
      expect(page1.segments[0].startTime).toBe(0);
      expect(page2.segments[0].startTime).toBe(2.5);
      expect(page3.segments[0].startTime).toBe(5.0);
      expect(page4.segments[0].startTime).toBe(7.5);
    });
  });

  describe("multi-segment page matching", () => {
    it("should match page text spanning multiple segments", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "First part" },
        { startTime: 5, endTime: 10, text: "Second part" },
        { startTime: 10, endTime: 15, text: "Third part" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      // Page spanning 2 segments
      const result = matcher.matchPageToSegments("First part Second part");

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe("First part");
      expect(result.segments[1].text).toBe("Second part");
      expect(result.confidence).toBe(1.0); // Exact match
    });

    it("should match page spanning all segments", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Part one" },
        { startTime: 5, endTime: 10, text: "Part two" },
        { startTime: 10, endTime: 15, text: "Part three" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      const result = matcher.matchPageToSegments("Part one Part two Part three");

      expect(result.segments).toHaveLength(3);
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("single-segment page matching", () => {
    it("should match single segment exactly", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Hello world" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      const result = matcher.matchPageToSegments("Hello world");

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].text).toBe("Hello world");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("tolerant mode (85% similarity)", () => {
    it("should match with minor edits (typo fixes)", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "The quick brown fox jumps over the lazy dog" }
      ];

      const matcher = new SegmentMatcher(segments, "tolerant");

      // Minor edit: removed "the" before "lazy" (8/9 tokens = 88.9% similarity)
      const result = matcher.matchPageToSegments("The quick brown fox jumps over lazy dog");

      expect(result.segments).toHaveLength(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("should reject if similarity below 85%", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Original text here" }
      ];

      const matcher = new SegmentMatcher(segments, "tolerant");

      // Heavily edited (< 85% similarity)
      expect(() => {
        matcher.matchPageToSegments("Completely different content");
      }).toThrow("not found");
    });
  });

  describe("fuzzy mode (60% similarity)", () => {
    it("should match with significant edits", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "The quick brown fox jumps over" }
      ];

      const matcher = new SegmentMatcher(segments, "fuzzy");

      // Significant edits: removed "over" (5/6 tokens = 83.3% similarity)
      // In fuzzy mode we just need 60%+
      const result = matcher.matchPageToSegments("The quick brown fox jumps");

      expect(result.segments).toHaveLength(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0.60);
    });

    it("should reject if similarity below 60%", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Original text" }
      ];

      const matcher = new SegmentMatcher(segments, "fuzzy");

      // Completely different (< 60% similarity)
      expect(() => {
        matcher.matchPageToSegments("Totally unrelated content here now");
      }).toThrow("not found");
    });
  });

  describe("strict mode (exact match)", () => {
    it("should require exact match after normalization", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "  Hello   world  " }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      // Same text with different whitespace (should normalize)
      const result = matcher.matchPageToSegments("Hello world");

      expect(result.segments).toHaveLength(1);
      expect(result.confidence).toBe(1.0);
    });

    it("should reject even minor edits in strict mode", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Hello world" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");

      // Minor difference (should fail strict mode)
      expect(() => {
        matcher.matchPageToSegments("Hello there");
      }).toThrow("not found");
    });
  });
});
