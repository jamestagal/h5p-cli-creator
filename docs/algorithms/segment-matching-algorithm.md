# Segment Matching Algorithm

## Overview

The SegmentMatcher algorithm matches user-edited page text to Whisper API transcript segments to derive accurate audio timestamps. This is critical for text-based page break workflows where users manually define page boundaries.

## Problem Statement

When users edit a Whisper transcript and add custom page breaks with `---` delimiters, we need to:
1. Match their edited text back to the original Whisper segments
2. Derive accurate start/end timestamps for audio splitting
3. Handle text edits while maintaining high confidence matches
4. Prevent duplicate segment assignment across pages

## Core Algorithm: Greedy Best-Match with Sequential Pointer

### Key Principles

1. **Sequential Matching**: Maintains a forward-moving pointer (`currentSegmentIndex`) that never backtracks
2. **Sliding Window Search**: Expands window from 1 segment to N segments to find optimal match
3. **Best-Match Selection**: Returns the window with highest similarity score, not just first match above threshold
4. **Greedy Window Expansion**: When similarity scores are equal, prefers larger windows (more complete audio)

### Algorithm Steps

```typescript
function matchPageToSegments(pageText: string): MatchedSegment {
  // 1. Normalize text for comparison (lowercase, collapse whitespace)
  const normalizedPageText = normalizeText(pageText);

  // 2. Get remaining segments from current pointer position
  const remainingSegments = segments.slice(currentSegmentIndex);

  // 3. Sliding window search - try increasing window sizes
  let bestMatch = null;

  for (let windowSize = 1; windowSize <= remainingSegments.length; windowSize++) {
    const candidateSegments = remainingSegments.slice(0, windowSize);
    const candidateText = concatenateSegments(candidateSegments);
    const normalizedCandidateText = normalizeText(candidateText);

    // 4. Calculate Jaccard similarity (token-based)
    const similarity = calculateJaccardSimilarity(normalizedPageText, normalizedCandidateText);

    // 5. Track best match meeting threshold
    if (similarity >= threshold) {
      // CRITICAL: Prefer larger window when similarity is equal
      if (!bestMatch ||
          similarity > bestMatch.similarity ||
          (similarity === bestMatch.similarity && candidateSegments.length > bestMatch.segments.length)) {
        bestMatch = { segments: candidateSegments, similarity };
      }
    }

    // 6. Early stopping conditions
    if (candidateText.length > pageText.length * 2) {
      break; // Candidate too large - prevents runaway
    }
    if (bestMatch && similarity < bestMatch.similarity - 0.1) {
      break; // Similarity dropped >10% - probably included next page content
    }
  }

  // 7. Advance pointer to prevent duplicate assignment
  if (bestMatch) {
    currentSegmentIndex += bestMatch.segments.length;
    return bestMatch;
  }

  throw new Error("No match found above threshold");
}
```

## Key Improvements (November 2024)

### Issue 1: Partial Matches with Missing Audio

**Problem**: Algorithm returned FIRST match above threshold, not BEST match.

**Example**:
- User's Page 1 text: "Một ngày kia, Peter đi ra khỏi khách sạn của mình. Vừa mới thức dậy, Peter đi ra khỏi khách sạn của mình."
- Whisper Segment 0: "Một ngày kia, Peter đi ra khỏi khách sạn của mình."
- Whisper Segment 1: "Vừa mới thức dậy, Peter đi ra khỏi khách sạn của mình."
- Old behavior: Matched 1 segment (73% similarity) and stopped
- New behavior: Continues to find 2 segments (100% similarity)

**Solution**: Track `bestMatch` across all window sizes, return highest similarity.

```typescript
// OLD (incorrect):
if (similarity >= threshold) {
  return { segments: candidateSegments, confidence: similarity };
}

// NEW (correct):
if (similarity >= threshold) {
  if (!bestMatch || similarity > bestMatch.similarity) {
    bestMatch = { segments: candidateSegments, similarity };
  }
}
// Continue expanding window...
```

### Issue 2: Equal Similarity with Different Window Sizes

**Problem**: When two window sizes achieve same similarity (e.g., both 100%), algorithm would return smaller window, missing audio.

**Example**:
- Page 7 text ends with: "Peter thấy rất là lạ."
- Window of 8 segments: 100% similarity (missing last sentence audio)
- Window of 9 segments: 100% similarity (includes last sentence audio)
- Old behavior: Returns 8 segments (first 100% match)
- New behavior: Returns 9 segments (larger window preferred)

**Solution**: When similarity is equal, prefer LARGER window.

```typescript
if (similarity >= threshold) {
  if (!bestMatch ||
      similarity > bestMatch.similarity ||
      (similarity === bestMatch.similarity && candidateSegments.length > bestMatch.segments.length)) {
    bestMatch = { segments: candidateSegments, similarity };
  }
}
```

### Issue 3: Runaway Window Expansion

**Problem**: Without bounds, window could expand indefinitely.

**Solution**: Two early stopping conditions:

```typescript
// Stop if candidate text is way too large (>2x page text length)
if (candidateText.length > pageText.length * 2) {
  break;
}

// Stop if similarity drops significantly (>10% decrease)
if (bestMatch && similarity < bestMatch.similarity - 0.1) {
  break; // Probably included content from next page
}
```

## Similarity Calculation: Jaccard Index

Uses token-based Jaccard similarity for fuzzy matching:

```
similarity = |intersection(tokens1, tokens2)| / |union(tokens1, tokens2)|
```

**Example**:
- Text 1: "hello world"
- Text 2: "hello there"
- Tokens1: {hello, world}
- Tokens2: {hello, there}
- Intersection: {hello} = 1 token
- Union: {hello, world, there} = 3 tokens
- Similarity: 1/3 = 0.333 (33.3%)

**Advantages**:
- Handles word reordering gracefully
- Robust to minor edits (insertions, deletions)
- Language-agnostic (works with Vietnamese diacritics, French accents)

## Matching Modes

Three modes with different similarity thresholds:

| Mode      | Threshold | Use Case                                    |
|-----------|-----------|---------------------------------------------|
| `strict`  | 100%      | No edits, exact Whisper transcript          |
| `tolerant`| 85%+      | Minor edits (typo fixes, punctuation)       |
| `fuzzy`   | 60%+      | Moderate edits (sentence reordering, cuts)  |

## Sequential Matching Prevents Duplicates

The `currentSegmentIndex` pointer ensures each segment is assigned to at most one page:

```
Page 1: segments[0..1]   (pointer advances to 2)
Page 2: segments[2..7]   (pointer advances to 8)
Page 3: segments[8..12]  (pointer advances to 13)
```

**Critical for language learning**: Repetition drills require separate audio for each occurrence of the same phrase.

## Performance Characteristics

- **Time Complexity**: O(N × M) where N = number of segments, M = max window size
- **Space Complexity**: O(1) - constant space for best match tracking
- **Typical Performance**: 10 pages × 70 segments = ~0.5s on modern hardware

## Error Handling

When no match found above threshold:

```typescript
throw new Error(
  `Page text not found in Whisper segments.

  Similarity: ${bestSimilarity}% (below ${threshold}% ${matchingMode} threshold)

  Whisper transcript: "${whisperText}"
  Your edited text: "${pageText}"

  Suggestion: ${getSuggestion(bestSimilarity)}`
);
```

Suggestions:
- 85%+ similarity → Try `tolerant` mode or revert minor edits
- 60%+ similarity → Try `fuzzy` mode or revert to closer match
- <60% similarity → Text heavily edited, revert to original

## Testing Strategy

### Unit Tests
- Exact matches (100% similarity)
- Partial matches (60-99% similarity)
- Multi-segment matches (window expansion)
- Edge cases (empty text, single segment, all segments)

### Integration Tests
- Real Whisper transcripts (Vietnamese, French, English)
- User-edited transcripts with page breaks
- Confidence score verification across all pages

### Regression Tests
- Issue 1: Partial match bug (1 segment vs 2 segments)
- Issue 2: Equal similarity bug (8 segments vs 9 segments)
- Issue 3: Page boundary audio misalignment

## Future Improvements

1. **Adaptive Thresholds**: Adjust threshold based on edit distance
2. **Semantic Similarity**: Use embeddings for meaning-based matching
3. **Alignment Visualization**: Show which Whisper segments matched which page text
4. **Confidence Calibration**: Correlate confidence scores with actual audio-text alignment quality

## References

- [TranscriptMatcher.ts](../../src/services/TranscriptMatcher.ts) - Timestamp-based matching (legacy)
- [SegmentMatcher.ts](../../src/services/transcription/SegmentMatcher.ts) - Text-based matching (current)
- [YouTubeExtractorTypes.ts](../../src/services/types/YouTubeExtractorTypes.ts) - Type definitions
