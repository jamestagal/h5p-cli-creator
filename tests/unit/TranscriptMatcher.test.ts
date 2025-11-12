/**
 * Unit tests for TranscriptMatcher service
 *
 * Tests transcript matching functionality:
 * - Matching segments to timestamp ranges
 * - Handling overlapping boundaries
 * - Concatenating multiple segments
 * - Preserving formatting
 *
 * Phase 1: YouTube Story Extraction for Interactive Books
 */

import { TranscriptMatcher } from "../../src/services/TranscriptMatcher";
import { TranscriptSegment } from "../../src/services/types/YouTubeExtractorTypes";
import { StoryPageData } from "../../src/models/StoryPageData";

describe("TranscriptMatcher", () => {
  let matcher: TranscriptMatcher;

  beforeEach(() => {
    matcher = new TranscriptMatcher();
  });

  describe("findSegmentsInRange", () => {
    const transcript: TranscriptSegment[] = [
      { startTime: 0, endTime: 10, text: "First segment." },
      { startTime: 10, endTime: 20, text: "Second segment." },
      { startTime: 20, endTime: 30, text: "Third segment." },
      { startTime: 30, endTime: 40, text: "Fourth segment." }
    ];

    it("should find segments within exact range", () => {
      const segments = matcher.findSegmentsInRange(transcript, 10, 30);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Second segment.");
      expect(segments[1].text).toBe("Third segment.");
    });

    it("should include segments that overlap start boundary", () => {
      const segments = matcher.findSegmentsInRange(transcript, 5, 15);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("First segment.");
      expect(segments[1].text).toBe("Second segment.");
    });

    it("should include segments that overlap end boundary", () => {
      const segments = matcher.findSegmentsInRange(transcript, 15, 25);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Second segment.");
      expect(segments[1].text).toBe("Third segment.");
    });

    it("should handle range starting at 0", () => {
      const segments = matcher.findSegmentsInRange(transcript, 0, 15);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("First segment.");
    });

    it("should return empty array for range with no segments", () => {
      const segments = matcher.findSegmentsInRange(transcript, 50, 60);
      expect(segments).toHaveLength(0);
    });
  });

  describe("concatenateSegments", () => {
    it("should concatenate multiple segments with spacing", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 10, text: "First sentence." },
        { startTime: 10, endTime: 20, text: "Second sentence." },
        { startTime: 20, endTime: 30, text: "Third sentence." }
      ];

      const result = matcher.concatenateSegments(segments);
      expect(result).toBe("First sentence. Second sentence. Third sentence.");
    });

    it("should preserve Vietnamese diacritics", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 10, text: "Xin chào, tôi tên là Minh." },
        { startTime: 10, endTime: 20, text: "Tôi đến từ Việt Nam." }
      ];

      const result = matcher.concatenateSegments(segments);
      expect(result).toContain("Việt Nam");
      expect(result).toContain("chào");
    });

    it("should handle empty segments array", () => {
      const result = matcher.concatenateSegments([]);
      expect(result).toBe("");
    });

    it("should preserve punctuation", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 10, text: "Hello, world!" },
        { startTime: 10, endTime: 20, text: "How are you?" }
      ];

      const result = matcher.concatenateSegments(segments);
      expect(result).toBe("Hello, world! How are you?");
    });
  });

  describe("matchToPages", () => {
    const transcript: TranscriptSegment[] = [
      { startTime: 0, endTime: 20, text: "This is page one content." },
      { startTime: 20, endTime: 40, text: "This is page two content." },
      { startTime: 40, endTime: 60, text: "This is page three content." }
    ];

    const pages = [
      {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 20,
        audioPath: "page1.mp3",
        imagePath: "page1.jpg",
        isPlaceholder: true
      },
      {
        pageNumber: 2,
        title: "Page 2",
        startTime: 20,
        endTime: 40,
        audioPath: "page2.mp3",
        imagePath: "page2.jpg",
        isPlaceholder: true
      }
    ];

    it("should match transcript to pages", () => {
      const result = matcher.matchToPages(transcript, pages);
      expect(result).toHaveLength(2);
      expect(result[0].vietnameseText).toBe("This is page one content.");
      expect(result[1].vietnameseText).toBe("This is page two content.");
    });

    it("should preserve page metadata", () => {
      const result = matcher.matchToPages(transcript, pages);
      expect(result[0].pageNumber).toBe(1);
      expect(result[0].title).toBe("Page 1");
      expect(result[0].audioPath).toBe("page1.mp3");
      expect(result[0].imagePath).toBe("page1.jpg");
      expect(result[0].isPlaceholder).toBe(true);
    });

    it("should include transcript segments in result", () => {
      const result = matcher.matchToPages(transcript, pages);
      expect(result[0].transcriptSegments).toHaveLength(1);
      expect(result[0].transcriptSegments[0].text).toBe("This is page one content.");
    });
  });
});
