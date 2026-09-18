/**
 * GeminiTranscriptParser parses clean transcripts from Gemini 2.5 Pro format.
 *
 * Provides more accurate transcriptions than yt-dlp VTT parsing,
 * without repetition or VTT artifacts.
 */

export interface CleanTranscriptSegment {
  text: string;
  paragraphNumber: number;
}

export class GeminiTranscriptParser {
  /**
   * Parses a Gemini 2.5 Pro transcript (plain text with paragraph breaks).
   *
   * @param transcriptText Plain text transcript with paragraph breaks
   * @returns Array of clean transcript segments
   */
  public parseTranscript(transcriptText: string): CleanTranscriptSegment[] {
    // Split by double newlines (paragraphs)
    const paragraphs = transcriptText
      .trim()
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    return paragraphs.map((text, index) => ({
      text,
      paragraphNumber: index + 1
    }));
  }

  /**
   * Gets the full transcript as a single string.
   *
   * @param segments Array of transcript segments
   * @returns Combined transcript text
   */
  public getFullTranscript(segments: CleanTranscriptSegment[]): string {
    return segments.map(s => s.text).join('\n\n');
  }

  /**
   * Matches transcript paragraphs to story pages based on page count.
   *
   * Distributes paragraphs evenly across pages (e.g., 14 paragraphs → 11 pages).
   *
   * @param segments Array of transcript segments
   * @param pageCount Number of story pages
   * @returns Array of text for each page
   */
  public matchToPages(segments: CleanTranscriptSegment[], pageCount: number): string[] {
    if (segments.length === 0) {
      return Array(pageCount).fill("");
    }

    // If we have exactly the right number of paragraphs, use 1-to-1 mapping
    if (segments.length === pageCount) {
      return segments.map(s => s.text);
    }

    // If we have more paragraphs than pages, combine paragraphs
    if (segments.length > pageCount) {
      const pagesText: string[] = [];
      const paragraphsPerPage = Math.ceil(segments.length / pageCount);

      for (let i = 0; i < pageCount; i++) {
        const startIdx = i * paragraphsPerPage;
        const endIdx = Math.min(startIdx + paragraphsPerPage, segments.length);
        const pageSegments = segments.slice(startIdx, endIdx);
        pagesText.push(pageSegments.map(s => s.text).join(' '));
      }

      return pagesText;
    }

    // If we have fewer paragraphs than pages, distribute evenly
    const pagesText: string[] = Array(pageCount).fill("");
    segments.forEach((segment, index) => {
      const pageIndex = Math.floor((index / segments.length) * pageCount);
      if (pagesText[pageIndex]) {
        pagesText[pageIndex] += ' ' + segment.text;
      } else {
        pagesText[pageIndex] = segment.text;
      }
    });

    return pagesText;
  }
}
