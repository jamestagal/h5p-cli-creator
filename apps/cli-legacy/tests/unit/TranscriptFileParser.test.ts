/**
 * Tests for TranscriptFileParser service.
 *
 * Tests parsing markdown transcripts with page break delimiters:
 * - Valid markdown with `---` delimiters
 * - Page titles from `# Page N:` headings
 * - Auto-numbering pages when headings missing
 * - Whitespace normalization (multiple spaces → single space)
 * - Error detection (empty pages, missing delimiters)
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import * as path from "path";
import * as fsExtra from "fs-extra";
import { TranscriptFileParser } from "../../src/services/transcription/TranscriptFileParser";
import { PageDefinition } from "../../src/services/types/YouTubeExtractorTypes";

describe("TranscriptFileParser", () => {
  const fixturesDir = path.join(__dirname, "../fixtures/transcripts");

  describe("parse", () => {
    it("should parse valid markdown with --- delimiters", async () => {
      const filePath = path.join(fixturesDir, "full-transcript-simple.txt");
      const parser = new TranscriptFileParser(filePath);

      const pages = await parser.parse();

      expect(pages).toHaveLength(3);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[0].title).toBe("Introduction");
      expect(pages[0].text).toContain("Ma journée parfaite");
      expect(pages[1].pageNumber).toBe(2);
      expect(pages[1].title).toBe("Morning routine");
      expect(pages[2].pageNumber).toBe(3);
      expect(pages[2].title).toBe("Going outside");
    });

    it("should extract page titles from # Page N: headings", async () => {
      const filePath = path.join(fixturesDir, "full-transcript-simple.txt");
      const parser = new TranscriptFileParser(filePath);

      const pages = await parser.parse();

      // Verify titles are extracted correctly
      expect(pages[0].title).toBe("Introduction");
      expect(pages[1].title).toBe("Morning routine");
      expect(pages[2].title).toBe("Going outside");
    });

    it("should auto-number pages when headings missing", async () => {
      // Create temp file without headings
      const tempFile = path.join(fixturesDir, "temp-no-headings.txt");
      await fsExtra.writeFile(
        tempFile,
        "First page content\n---\nSecond page content\n---\nThird page content",
        "utf-8"
      );

      const parser = new TranscriptFileParser(tempFile);
      const pages = await parser.parse();

      expect(pages).toHaveLength(3);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[0].title).toBe("Page 1");
      expect(pages[1].pageNumber).toBe(2);
      expect(pages[1].title).toBe("Page 2");
      expect(pages[2].pageNumber).toBe(3);
      expect(pages[2].title).toBe("Page 3");

      // Cleanup
      await fsExtra.remove(tempFile);
    });

    it("should normalize whitespace (multiple spaces → single space)", async () => {
      // Create temp file with extra whitespace
      const tempFile = path.join(fixturesDir, "temp-whitespace.txt");
      await fsExtra.writeFile(
        tempFile,
        "# Page 1: Test\nThis   has    multiple    spaces\n---\n# Page 2: Test\nAnd  many   newlines\n\n\n",
        "utf-8"
      );

      const parser = new TranscriptFileParser(tempFile);
      const pages = await parser.parse();

      // Whitespace should be collapsed
      expect(pages[0].text).toBe("This has multiple spaces");
      expect(pages[1].text).toBe("And many newlines");

      // Cleanup
      await fsExtra.remove(tempFile);
    });

    it("should detect and report empty pages", async () => {
      // Create temp file with empty page (only heading, no content after)
      const tempFile = path.join(fixturesDir, "temp-empty.txt");
      await fsExtra.writeFile(
        tempFile,
        "# Page 1: Test\nContent here\n---\n# Page 2: Empty\n   \n---\n# Page 3: More\nMore content",
        "utf-8"
      );

      const parser = new TranscriptFileParser(tempFile);

      await expect(parser.parse()).rejects.toThrow("Page 2 has no content");

      // Cleanup
      await fsExtra.remove(tempFile);
    });

    it("should error if no page breaks found", async () => {
      // Create temp file without delimiters
      const tempFile = path.join(fixturesDir, "temp-no-breaks.txt");
      await fsExtra.writeFile(tempFile, "Just some text without delimiters", "utf-8");

      const parser = new TranscriptFileParser(tempFile);

      await expect(parser.parse()).rejects.toThrow("No page breaks");

      // Cleanup
      await fsExtra.remove(tempFile);
    });

    it("should error if file not found", async () => {
      const parser = new TranscriptFileParser("/nonexistent/file.txt");

      await expect(parser.parse()).rejects.toThrow("not found");
    });
  });
});
