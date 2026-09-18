/**
 * TranscriptFileParser service for parsing edited transcripts with page break markers.
 *
 * Responsibilities:
 * - Parse markdown format with `---` delimiters
 * - Extract page titles from `# Page N: Title` headings
 * - Auto-number pages when headings missing
 * - Normalize whitespace for matching
 * - Validate format and provide actionable error messages
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import * as fsExtra from "fs-extra";
import { PageDefinition } from "../types/YouTubeExtractorTypes";

/**
 * TranscriptFileParser parses markdown transcripts with page break markers.
 *
 * Markdown format:
 * - `---` (triple dash) = page break delimiter
 * - `# Page N: Title` = page heading (optional)
 * - Text between delimiters = page content
 *
 * Example:
 * ```markdown
 * # Page 1: Introduction
 * Ma journée parfaite. Je m'appelle Liam.
 * ---
 * # Page 2: Morning routine
 * Je me réveille sans réveil.
 * ---
 * ```
 *
 * Features:
 * - Flexible heading format (handles variations)
 * - Auto-numbering when headings missing
 * - Whitespace normalization (multiple spaces → single space)
 * - UTF-8 encoding preservation (Vietnamese diacritics, French accents)
 * - Validation with actionable error messages
 */
export class TranscriptFileParser {
  private filePath: string;

  /**
   * Creates a new TranscriptFileParser instance.
   * @param filePath Path to transcript file (absolute or relative)
   */
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Parses transcript file and returns array of PageDefinition objects.
   *
   * Workflow:
   * 1. Read file with UTF-8 encoding
   * 2. Split on `---` delimiters
   * 3. Parse each page: extract title, text, normalize whitespace
   * 4. Validate: no empty pages, at least one page break
   * 5. Return structured PageDefinition array
   *
   * @returns Array of PageDefinition objects
   * @throws Error if file not found, no page breaks, or empty pages
   */
  public async parse(): Promise<PageDefinition[]> {
    // Step 1: Read file
    if (!(await fsExtra.pathExists(this.filePath))) {
      throw new Error(`Transcript file not found: ${this.filePath}`);
    }

    const content = await fsExtra.readFile(this.filePath, "utf-8");

    // Step 2: Split on page break delimiters
    // Use regex to match `---` on its own line (with optional whitespace)
    const rawPages = content.split(/\n\s*---\s*\n/);

    if (rawPages.length < 2) {
      throw new Error(
        `No page breaks (---) found in transcript. ` +
        `Transcript must have at least one page break to define pages. ` +
        `Format: Text\\n---\\nMore text`
      );
    }

    // Step 3: Parse each page
    const pages: PageDefinition[] = [];

    for (let i = 0; i < rawPages.length; i++) {
      const rawPage = rawPages[i].trim();

      if (!rawPage) {
        // Skip empty pages at end (trailing delimiter case)
        if (i === rawPages.length - 1) {
          continue;
        }
        throw new Error(
          `Page ${i + 1} has no content between delimiters. ` +
          `Each page must have text content.`
        );
      }

      // Parse heading and extract title
      const { title, text } = this.parsePageContent(rawPage, i + 1);

      // Normalize whitespace
      const normalizedText = this.normalizeWhitespace(text);

      // Validate non-empty text
      if (normalizedText.length < 1) {
        throw new Error(
          `Page ${i + 1} has no content between delimiters. ` +
          `Each page must have text content.`
        );
      }

      // Warn if very short text
      if (normalizedText.length < 10) {
        console.warn(
          `⚠️  Warning: Page ${i + 1} is very short (${normalizedText.length} characters). ` +
          `Consider combining with adjacent pages.`
        );
      }

      pages.push({
        pageNumber: i + 1,
        title,
        text: normalizedText
      });
    }

    return pages;
  }

  /**
   * Parses page content to extract title and text.
   *
   * Heading format variations supported:
   * - `# Page 1: Title` (standard)
   * - `#Page 1:Title` (no spaces)
   * - `# page 1 Title` (lowercase, no colon)
   * - No heading (auto-generate title)
   *
   * @param rawPage Raw page content string
   * @param pageNumber Page number for auto-generated titles
   * @returns Object with title and text
   */
  private parsePageContent(rawPage: string, pageNumber: number): { title: string; text: string } {
    // Try to match heading format: # Page N: Title
    // Flexible regex handles variations
    const headingMatch = rawPage.match(/^#\s*Page\s+(\d+)\s*:?\s*(.*)$/im);

    if (headingMatch) {
      const title = headingMatch[2].trim();
      // Remove heading from text
      const text = rawPage.replace(/^#\s*Page\s+\d+\s*:?.*$/im, "").trim();

      return {
        title: title || `Page ${pageNumber}`, // Use auto-generated if title empty
        text
      };
    }

    // No heading found - auto-generate title
    return {
      title: `Page ${pageNumber}`,
      text: rawPage.trim()
    };
  }

  /**
   * Normalizes whitespace in text for matching.
   *
   * Normalization rules:
   * - Trim leading/trailing whitespace
   * - Collapse multiple spaces to single space
   * - Collapse multiple newlines to single space
   * - Preserve UTF-8 encoding (Vietnamese diacritics, French accents)
   *
   * Examples:
   * - "Text   with    spaces" → "Text with spaces"
   * - "Text\n\n\nwith newlines" → "Text with newlines"
   * - "  Trimmed  " → "Trimmed"
   *
   * @param text Input text
   * @returns Normalized text
   */
  private normalizeWhitespace(text: string): string {
    // Collapse all whitespace (spaces, newlines, tabs) to single space
    let normalized = text.replace(/\s+/g, " ");

    // Trim leading/trailing whitespace
    normalized = normalized.trim();

    return normalized;
  }
}
