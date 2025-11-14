/**
 * SegmentMatcher service for matching page text to Whisper transcript segments.
 *
 * Responsibilities:
 * - Sequential matching algorithm (prevents duplicate segment assignment)
 * - Three matching modes: strict (100%), tolerant (85%+), fuzzy (60%+)
 * - Jaccard similarity calculation for token-based matching
 * - Sliding window search for multi-segment pages
 * - Helpful diff output for non-100% matches
 * - Match confidence reporting
 *
 * Phase 4: Text-Based Page Breaks for Interactive Book Stories
 */

import { TranscriptSegment, MatchedSegment } from "../types/YouTubeExtractorTypes";

/**
 * SegmentMatcher matches page text to Whisper segments using sequential matching.
 *
 * Key features:
 * - **Sequential matching**: Maintains pointer in segment stream, only searches forward
 * - **Three matching modes**: strict (exact), tolerant (85%+ Jaccard), fuzzy (60%+ Jaccard)
 * - **Jaccard similarity**: Token-based similarity using Set intersection/union
 * - **Sliding window**: Tries 1 segment, then 2, then 3+ to find best match
 * - **UTF-8 safe**: Preserves Vietnamese diacritics and French accents
 * - **Decimal precision**: Preserves Whisper's exact timestamps (9.4s, 17.6s)
 *
 * Critical for language learning repetition drills:
 * - 1st "Bonjour" → segments[0]
 * - 2nd "Bonjour" → segments[1]
 * - 3rd "Bonjour" → segments[2]
 * Each repetition gets its own unique segment chronologically.
 */
export class SegmentMatcher {
  private segments: TranscriptSegment[];
  private matchingMode: "strict" | "tolerant" | "fuzzy";
  private currentSegmentIndex: number;

  // Similarity thresholds for each mode
  private readonly STRICT_THRESHOLD = 1.0;
  private readonly TOLERANT_THRESHOLD = 0.85;
  private readonly FUZZY_THRESHOLD = 0.60;

  /**
   * Creates a new SegmentMatcher instance.
   *
   * IMPORTANT: Create a fresh instance for each story matching run.
   * Reusing instances will produce incorrect results due to pointer state.
   *
   * @param segments Whisper transcript segments
   * @param matchingMode Matching mode: strict, tolerant, or fuzzy
   */
  constructor(segments: TranscriptSegment[], matchingMode: "strict" | "tolerant" | "fuzzy") {
    this.segments = segments;
    this.matchingMode = matchingMode;
    this.currentSegmentIndex = 0; // Sequential matching pointer
  }

  /**
   * Matches page text to Whisper segments.
   *
   * Sequential matching algorithm:
   * 1. Start search from currentSegmentIndex (not from beginning)
   * 2. Try sliding window sizes: 1 segment, then 2, then 3+
   * 3. Calculate similarity for each window
   * 4. Return first window meeting threshold
   * 5. Advance pointer: currentSegmentIndex += matched.length
   *
   * @param pageText Page content text (normalized)
   * @returns MatchedSegment with segments and confidence score
   * @throws Error if no match found meeting similarity threshold
   */
  public matchPageToSegments(pageText: string): MatchedSegment {
    const normalizedPageText = this.normalizeText(pageText);
    const remainingSegments = this.segments.slice(this.currentSegmentIndex);

    if (remainingSegments.length === 0) {
      throw new Error(
        `Page text not found: All segments already matched. ` +
        `Page text: "${pageText.substring(0, 50)}..."`
      );
    }

    // Determine similarity threshold based on mode
    let threshold: number;
    switch (this.matchingMode) {
      case "strict":
        threshold = this.STRICT_THRESHOLD;
        break;
      case "tolerant":
        threshold = this.TOLERANT_THRESHOLD;
        break;
      case "fuzzy":
        threshold = this.FUZZY_THRESHOLD;
        break;
    }

    // Sliding window search
    for (let windowSize = 1; windowSize <= remainingSegments.length; windowSize++) {
      const candidateSegments = remainingSegments.slice(0, windowSize);
      const candidateText = this.concatenateSegments(candidateSegments);
      const normalizedCandidateText = this.normalizeText(candidateText);

      // Calculate similarity
      const similarity = this.calculateJaccardSimilarity(normalizedPageText, normalizedCandidateText);

      // Check if meets threshold
      if (similarity >= threshold) {
        // Match found! Advance pointer
        this.currentSegmentIndex += windowSize;

        // Log diff if not exact match
        if (similarity < 1.0) {
          console.warn(`⚠️  Match confidence: ${(similarity * 100).toFixed(1)}% (${this.matchingMode} mode)`);
          this.logDiff(normalizedPageText, normalizedCandidateText);
        }

        return {
          pageNumber: 0, // Will be set by caller
          segments: candidateSegments,
          confidence: similarity
        };
      }

      // Stop expanding window if candidate way too large (prevents runaway)
      if (candidateText.length > pageText.length * 2) {
        break;
      }
    }

    // No match found
    const bestCandidate = remainingSegments[0];
    const bestCandidateText = this.normalizeText(bestCandidate.text);
    const bestSimilarity = this.calculateJaccardSimilarity(normalizedPageText, bestCandidateText);

    throw new Error(
      `Page text not found in Whisper segments.\n\n` +
      `Similarity: ${(bestSimilarity * 100).toFixed(1)}% (below ${threshold * 100}% ${this.matchingMode} threshold)\n\n` +
      `Whisper transcript:\n  "${bestCandidate.text}"\n\n` +
      `Your edited text:\n  "${pageText.substring(0, 100)}..."\n\n` +
      `Suggestion: ${this.getSuggestion(bestSimilarity)}`
    );
  }

  /**
   * Concatenates multiple segments into single text.
   *
   * Joins segments with single space, preserving punctuation.
   * Reuses logic from TranscriptMatcher.concatenateSegments().
   *
   * @param segments Array of transcript segments
   * @returns Concatenated text
   */
  private concatenateSegments(segments: TranscriptSegment[]): string {
    if (segments.length === 0) {
      return "";
    }

    // Join segments with space
    let text = segments.map((seg) => seg.text.trim()).join(" ");

    // Clean up double spaces
    text = text.replace(/\s+/g, " ");

    // Trim final result
    text = text.trim();

    return text;
  }

  /**
   * Normalizes text for comparison.
   *
   * Normalization rules:
   * - Lowercase for case-insensitive comparison
   * - Trim whitespace
   * - Collapse multiple spaces to single space
   * - Preserve UTF-8 encoding (Vietnamese diacritics, French accents)
   *
   * IMPORTANT: Apply consistently to BOTH page text and segment text.
   *
   * @param text Input text
   * @returns Normalized text
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, " ");
  }

  /**
   * Calculates Jaccard similarity between two text strings.
   *
   * Jaccard index formula:
   * - intersection / union of token sets
   * - Range: 0.0 (no overlap) to 1.0 (identical)
   *
   * Example:
   * - "hello world" vs "hello there"
   * - Tokens1: {hello, world}
   * - Tokens2: {hello, there}
   * - Intersection: {hello} (1 token)
   * - Union: {hello, world, there} (3 tokens)
   * - Similarity: 1/3 = 0.333
   *
   * @param text1 First text
   * @param text2 Second text
   * @returns Similarity score (0.0-1.0)
   */
  private calculateJaccardSimilarity(text1: string, text2: string): number {
    // Tokenize by whitespace
    const tokens1 = new Set(text1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(text2.split(/\s+/).filter(t => t.length > 0));

    // Calculate intersection using Array.from() for ES5 compatibility
    const tokens1Array = Array.from(tokens1);
    const intersection = new Set(tokens1Array.filter(x => tokens2.has(x)));

    // Calculate union using Array.from() for ES5 compatibility
    const unionArray = tokens1Array.concat(Array.from(tokens2));
    const union = new Set(unionArray);

    // Handle edge case: both empty
    if (union.size === 0) {
      return 1.0;
    }

    // Jaccard index: intersection / union
    return intersection.size / union.size;
  }

  /**
   * Logs helpful diff output for non-100% matches.
   *
   * Shows side-by-side comparison:
   * - Whisper text
   * - Edited text
   * - Difference highlighted (character-level or word-level)
   *
   * @param pageText Normalized page text
   * @param candidateText Normalized candidate text
   */
  private logDiff(pageText: string, candidateText: string): void {
    console.warn(`\n  Whisper:  "${candidateText}"`);
    console.warn(`  Edited:   "${pageText}"`);

    // Simple word-level diff
    const pageWords = pageText.split(/\s+/);
    const candidateWords = candidateText.split(/\s+/);

    const added = pageWords.filter(w => !candidateWords.includes(w));
    const removed = candidateWords.filter(w => !pageWords.includes(w));

    if (added.length > 0) {
      console.warn(`  Added words: ${added.join(", ")}`);
    }
    if (removed.length > 0) {
      console.warn(`  Removed words: ${removed.join(", ")}`);
    }
    console.warn("");
  }

  /**
   * Gets suggestion for improving match based on similarity score.
   *
   * @param similarity Similarity score
   * @returns Suggestion string
   */
  private getSuggestion(similarity: number): string {
    if (similarity >= 0.85) {
      return "Try using matchingMode: 'tolerant' or revert minor edits";
    } else if (similarity >= 0.60) {
      return "Try using matchingMode: 'fuzzy' or revert text closer to Whisper output";
    } else {
      return "Text heavily edited. Revert text closer to original Whisper transcript";
    }
  }
}
