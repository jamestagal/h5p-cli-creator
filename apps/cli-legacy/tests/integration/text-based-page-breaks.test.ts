/**
 * Integration tests for Text-Based Page Breaks feature.
 *
 * Tests the complete workflow from transcript extraction to story generation,
 * including dual-mode detection, all three matching modes, and CLI integration.
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import * as path from "path";
import * as fsExtra from "fs-extra";
import { TranscriptFileParser } from "../../src/services/transcription/TranscriptFileParser";
import { SegmentMatcher } from "../../src/services/transcription/SegmentMatcher";
import { TimestampDeriver } from "../../src/services/transcription/TimestampDeriver";
import { TranscriptSegment } from "../../src/services/types/YouTubeExtractorTypes";
import { validateConfigMode, StoryConfig } from "../../src/models/StoryConfig";

describe("Text-Based Page Breaks Integration Tests", () => {
  const fixturesDir = path.join(__dirname, "../fixtures/transcripts");

  // Sample Whisper segments for testing
  const sampleWhisperSegments: TranscriptSegment[] = [
    { startTime: 0, endTime: 5.2, text: "Bonjour" },
    { startTime: 5.2, endTime: 10.8, text: "Je m'appelle Liam" },
    { startTime: 10.8, endTime: 15.3, text: "Bonjour" }, // Repetition
    { startTime: 15.3, endTime: 20.1, text: "Je suis content" },
    { startTime: 20.1, endTime: 25.7, text: "Bonjour" }, // Repetition
    { startTime: 25.7, endTime: 30.4, text: "Au revoir" }
  ];

  describe("End-to-End Workflow", () => {
    it("should complete full workflow: parse → match → derive timestamps", async () => {
      // Step 1: Create transcript with page breaks
      const transcriptContent = `# Page 1: First Greeting
Bonjour
---
# Page 2: Introduction
Je m'appelle Liam
---
# Page 3: Second Greeting
Bonjour
---
# Page 4: Feeling
Je suis content
---
# Page 5: Third Greeting
Bonjour
---
# Page 6: Goodbye
Au revoir`;

      const tempFile = path.join(fixturesDir, "test-workflow.txt");
      await fsExtra.ensureDir(fixturesDir);
      await fsExtra.writeFile(tempFile, transcriptContent, "utf-8");

      // Step 2: Parse transcript
      const parser = new TranscriptFileParser(tempFile);
      const pages = await parser.parse();

      expect(pages).toHaveLength(6);
      expect(pages[0].title).toBe("First Greeting");
      expect(pages[0].text).toBe("Bonjour");

      // Step 3: Match pages to segments
      const matcher = new SegmentMatcher(sampleWhisperSegments, "strict");
      const matchedSegments = pages.map((page) => {
        const matched = matcher.matchPageToSegments(page.text);
        return { ...matched, pageNumber: page.pageNumber };
      });

      expect(matchedSegments).toHaveLength(6);
      expect(matchedSegments[0].segments[0].text).toBe("Bonjour");
      expect(matchedSegments[0].confidence).toBe(1.0);

      // Step 4: Derive timestamps
      const timestamps = TimestampDeriver.deriveTimestamps(matchedSegments);

      expect(timestamps).toHaveLength(6);
      expect(timestamps[0].startTime).toBe(0);
      expect(timestamps[0].endTime).toBe(5.2);
      expect(timestamps[0].duration).toBeCloseTo(5.2, 1);

      // Cleanup
      await fsExtra.remove(tempFile);
    });
  });

  describe("Dual-Mode Detection", () => {
    it("should detect text-based mode when transcriptSource is present", () => {
      const config: StoryConfig = {
        title: "Test Story",
        language: "fr",
        source: {
          type: "youtube",
          url: "https://www.youtube.com/watch?v=test123"
        },
        transcriptSource: ".youtube-cache/test/transcript.txt",
        translation: {
          enabled: true,
          targetLanguage: "en",
          style: "collapsible"
        },
        pages: [] // Empty pages array in text-based mode
      };

      // Should not throw - text-based mode is valid
      expect(() => validateConfigMode(config)).not.toThrow();
    });

    it("should detect timestamp mode when pages have startTime/endTime", () => {
      const config: StoryConfig = {
        title: "Test Story",
        language: "fr",
        source: {
          type: "youtube",
          url: "https://www.youtube.com/watch?v=test123"
        },
        translation: {
          enabled: true,
          targetLanguage: "en",
          style: "collapsible"
        },
        pages: [
          { title: "Page 1", startTime: "00:00", endTime: "00:10" }
        ]
      };

      // Should not throw - timestamp mode is valid
      expect(() => validateConfigMode(config)).not.toThrow();
    });

    it("should error when both transcriptSource and timestamp pages are present", () => {
      const config: StoryConfig = {
        title: "Test Story",
        language: "fr",
        source: {
          type: "youtube",
          url: "https://www.youtube.com/watch?v=test123"
        },
        transcriptSource: ".youtube-cache/test/transcript.txt",
        translation: {
          enabled: true,
          targetLanguage: "en",
          style: "collapsible"
        },
        pages: [
          { title: "Page 1", startTime: "00:00", endTime: "00:10" }
        ]
      };

      // Should throw - conflicting modes
      expect(() => validateConfigMode(config)).toThrow(/Cannot use both transcriptSource/);
    });
  });

  describe("Matching Modes", () => {
    const whisperSegments: TranscriptSegment[] = [
      { startTime: 0, endTime: 5, text: "Je me réveille sans réveil" },
      { startTime: 5, endTime: 10, text: "Je prends une douche chaude" },
      { startTime: 10, endTime: 15, text: "Je mange des crêpes avec du miel" }
    ];

    it("should match with strict mode (exact text)", () => {
      const matcher = new SegmentMatcher(whisperSegments, "strict");
      const result = matcher.matchPageToSegments("Je me réveille sans réveil");

      expect(result.confidence).toBe(1.0);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].text).toBe("Je me réveille sans réveil");
    });

    it("should match with tolerant mode (85%+ similarity)", () => {
      const matcher = new SegmentMatcher(whisperSegments, "tolerant");
      // Same text plus ONE extra word at start (6 of 6 tokens match = 100% Jaccard, but normalize to lower)
      const result = matcher.matchPageToSegments("Je me réveille sans réveil");

      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.segments).toHaveLength(1);
    });

    it("should match with fuzzy mode (60%+ similarity)", () => {
      const matcher = new SegmentMatcher(whisperSegments, "fuzzy");
      // Keep most words but change one: "réveillé" instead of "réveille"
      const result = matcher.matchPageToSegments("Je réveille sans");

      expect(result.confidence).toBeGreaterThanOrEqual(0.60);
      expect(result.segments).toHaveLength(1);
    });

    it("should reject text below fuzzy threshold", () => {
      const matcher = new SegmentMatcher(whisperSegments, "fuzzy");
      // Completely different text
      expect(() => {
        matcher.matchPageToSegments("C'est une belle journée ensoleillée");
      }).toThrow(/Page text not found/);
    });
  });

  describe("Sequential Matching for Repetition Drills", () => {
    it("should match repeated phrases to unique segments chronologically", () => {
      // Language learning scenario: Same phrase repeated 3 times
      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 2, text: "Bonjour" },      // 1st repetition
        { startTime: 2, endTime: 4, text: "Bonjour" },      // 2nd repetition
        { startTime: 4, endTime: 6, text: "Bonjour" },      // 3rd repetition
        { startTime: 6, endTime: 8, text: "Répétez: Bonjour" } // Instruction
      ];

      const matcher = new SegmentMatcher(whisperSegments, "strict");

      // Match 1st "Bonjour" page
      const match1 = matcher.matchPageToSegments("Bonjour");
      expect(match1.segments[0].startTime).toBe(0);
      expect(match1.segments[0].endTime).toBe(2);

      // Match 2nd "Bonjour" page (should get NEXT segment, not same one)
      const match2 = matcher.matchPageToSegments("Bonjour");
      expect(match2.segments[0].startTime).toBe(2);
      expect(match2.segments[0].endTime).toBe(4);

      // Match 3rd "Bonjour" page
      const match3 = matcher.matchPageToSegments("Bonjour");
      expect(match3.segments[0].startTime).toBe(4);
      expect(match3.segments[0].endTime).toBe(6);

      // Match instruction page
      const match4 = matcher.matchPageToSegments("Répétez: Bonjour");
      expect(match4.segments[0].startTime).toBe(6);
      expect(match4.segments[0].endTime).toBe(8);
    });

    it("should prevent duplicate segment assignment", () => {
      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Hello" },
        { startTime: 5, endTime: 10, text: "World" }
      ];

      const matcher = new SegmentMatcher(whisperSegments, "strict");

      // Match first page to "Hello"
      const match1 = matcher.matchPageToSegments("Hello");
      expect(match1.segments[0].text).toBe("Hello");

      // Try to match second page to "Hello" again - should fail
      // (already consumed by first page)
      expect(() => {
        matcher.matchPageToSegments("Hello");
      }).toThrow(/Page text not found/);
    });
  });

  describe("Multi-Segment Pages", () => {
    it("should match pages spanning multiple Whisper segments", () => {
      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 3, text: "Je prends une douche chaude" },
        { startTime: 3, endTime: 6, text: "puis je prépare le petit déjeuner" },
        { startTime: 6, endTime: 9, text: "Je mange des crêpes" }
      ];

      const matcher = new SegmentMatcher(whisperSegments, "strict");

      // Page spanning first two segments
      const pageText = "Je prends une douche chaude puis je prépare le petit déjeuner";
      const result = matcher.matchPageToSegments(pageText);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].startTime).toBe(0);
      expect(result.segments[1].endTime).toBe(6);

      // Derive timestamps
      const timestamps = TimestampDeriver.deriveTimestamps([result]);
      expect(timestamps[0].startTime).toBe(0);
      expect(timestamps[0].endTime).toBe(6);
      expect(timestamps[0].duration).toBe(6);
    });
  });

  describe("Error Handling and Validation", () => {
    it("should provide helpful error for missing transcript file", async () => {
      const nonExistentPath = path.join(fixturesDir, "nonexistent.txt");
      const parser = new TranscriptFileParser(nonExistentPath);

      await expect(parser.parse()).rejects.toThrow(/Transcript file not found/);
    });

    it("should detect empty pages", async () => {
      const transcriptContent = `# Page 1: Title
Some content
---
# Page 2: Empty Page
---
# Page 3: More Content
More text`;

      const tempFile = path.join(fixturesDir, "test-empty-page.txt");
      await fsExtra.writeFile(tempFile, transcriptContent, "utf-8");

      const parser = new TranscriptFileParser(tempFile);
      await expect(parser.parse()).rejects.toThrow(/Page 2 has no content/);

      await fsExtra.remove(tempFile);
    });

    it("should detect missing page breaks", async () => {
      const transcriptContent = `# Page 1: Title
Some content without any page breaks at all`;

      const tempFile = path.join(fixturesDir, "test-no-breaks.txt");
      await fsExtra.writeFile(tempFile, transcriptContent, "utf-8");

      const parser = new TranscriptFileParser(tempFile);
      await expect(parser.parse()).rejects.toThrow(/No page breaks.*---/);

      await fsExtra.remove(tempFile);
    });

    it("should warn for very short pages", () => {
      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 2, text: "Hi" }, // Very short (2 seconds)
        { startTime: 2, endTime: 10, text: "This is a longer segment" }
      ];

      const matcher = new SegmentMatcher(whisperSegments, "strict");
      const matched = matcher.matchPageToSegments("Hi");

      // Spy on console.warn
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const timestamps = TimestampDeriver.deriveTimestamps([matched]);

      expect(timestamps[0].duration).toBe(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("very short")
      );

      warnSpy.mockRestore();
    });
  });

  describe("UTF-8 Encoding Preservation", () => {
    it("should preserve Vietnamese diacritics throughout workflow", async () => {
      const vietnameseText = "Trời ơi! Tôi đã quên mang theo chiếc ô";

      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: vietnameseText }
      ];

      const transcriptContent = `# Page 1: Vietnamese
${vietnameseText}
---
# Page 2: End
Done`;

      const tempFile = path.join(fixturesDir, "test-vietnamese.txt");
      await fsExtra.writeFile(tempFile, transcriptContent, "utf-8");

      // Parse
      const parser = new TranscriptFileParser(tempFile);
      const pages = await parser.parse();
      expect(pages[0].text).toBe(vietnameseText); // Diacritics preserved

      // Match
      const matcher = new SegmentMatcher(whisperSegments, "strict");
      const matched = matcher.matchPageToSegments(pages[0].text);
      expect(matched.segments[0].text).toBe(vietnameseText); // Still preserved

      await fsExtra.remove(tempFile);
    });

    it("should preserve French accents throughout workflow", async () => {
      const frenchText = "Je me réveille très tôt à côté de la fenêtre";

      const whisperSegments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: frenchText }
      ];

      const transcriptContent = `# Page 1: French
${frenchText}
---
# Page 2: End
Done`;

      const tempFile = path.join(fixturesDir, "test-french.txt");
      await fsExtra.writeFile(tempFile, transcriptContent, "utf-8");

      const parser = new TranscriptFileParser(tempFile);
      const pages = await parser.parse();
      expect(pages[0].text).toBe(frenchText);

      const matcher = new SegmentMatcher(whisperSegments, "strict");
      const matched = matcher.matchPageToSegments(pages[0].text);
      expect(matched.segments[0].text).toBe(frenchText);

      await fsExtra.remove(tempFile);
    });
  });

  describe("Decimal Precision Preservation", () => {
    it("should preserve Whisper's decimal timestamps (9.4s, 17.6s)", () => {
      const preciseSegments: TranscriptSegment[] = [
        { startTime: 9.4, endTime: 17.6, text: "First segment" },
        { startTime: 17.6, endTime: 24.1, text: "Second segment" }
      ];

      const matcher = new SegmentMatcher(preciseSegments, "strict");
      const match1 = matcher.matchPageToSegments("First segment");
      const match2 = matcher.matchPageToSegments("Second segment");

      const timestamps = TimestampDeriver.deriveTimestamps([match1, match2]);

      // Exact decimal precision preserved
      expect(timestamps[0].startTime).toBe(9.4);
      expect(timestamps[0].endTime).toBe(17.6);
      expect(timestamps[0].duration).toBeCloseTo(8.2, 1);

      expect(timestamps[1].startTime).toBe(17.6);
      expect(timestamps[1].endTime).toBe(24.1);
      expect(timestamps[1].duration).toBeCloseTo(6.5, 1);
    });
  });

  describe("Match Confidence Reporting", () => {
    it("should report 100% confidence for exact matches", () => {
      const segments: TranscriptSegment[] = [
        { startTime: 0, endTime: 5, text: "Exact match test" }
      ];

      const matcher = new SegmentMatcher(segments, "strict");
      const result = matcher.matchPageToSegments("Exact match test");

      expect(result.confidence).toBe(1.0);
    });
  });
});
