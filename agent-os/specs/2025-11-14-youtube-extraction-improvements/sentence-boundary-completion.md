# Technical Doc: Sentence Boundary Completion

**Date:** 2025-11-14
**Type:** Bug Fix / Enhancement
**Complexity:** Low-Medium (1-2 hours)
**Related:** YouTube Extraction Improvements (2025-11-14)

## Problem

Whisper API segments audio based on speech pauses, not sentence boundaries. This causes sentences to be split mid-way across page boundaries, creating poor reading experience.

**Example (French story):**
- Page 1 ends: "Aujourd'hui je veux vous" ❌ (incomplete)
- Page 2 starts: "parler de ma journée parfaite." ❌ (fragment)

**Root Cause:**
Whisper segment 1 (0-9.4s): "...Aujourd'hui je veux vous"
Whisper segment 2 (9.4-17.6s): "parler de ma journée parfaite..."

The >50% segment assignment rule correctly prevents duplicates but preserves Whisper's mid-sentence cuts.

## Why Vietnamese Story Worked

The Vietnamese story appeared to work because:
- Whisper segments happened to align better with sentence boundaries (luck)
- The >50% rule fixed OVERLAPPING segments causing DUPLICATES
- But didn't address MID-SENTENCE cuts (they weren't as prominent)

## Solution

**Post-process pages after segment assignment** to complete sentences at boundaries.

### Algorithm

```typescript
// After assigning segments to pages with >50% rule:
for each page (except last):
  1. Check if page ends mid-sentence (no ending punctuation: . ! ? … » " ')
  2. If incomplete:
     - Find text from next page up to first sentence-ending punctuation
     - Append completion to current page
     - Remove from next page
  3. Preserve proper spacing and formatting
```

### Multi-Language Punctuation Support

**Sentence-ending punctuation by language:**
- French: `.`, `!`, `?`, `…`, `»` (closing guillemet)
- Vietnamese: `.`, `!`, `?`
- English: `.`, `!`, `?`
- Spanish: `.`, `!`, `?`, `¡`, `¿`

**Regex pattern:**
```typescript
const SENTENCE_ENDING = /[.!?…»"']+$/;  // Ends with punctuation
const SENTENCE_BOUNDARY = /^([^.!?…»]+[.!?…»]["\s]*)/;  // Extract to first punctuation
```

## Implementation

### New Method in TranscriptMatcher

```typescript
/**
 * Completes sentences that were split across page boundaries by Whisper segmentation.
 *
 * Whisper API segments audio based on speech pauses, not sentence boundaries.
 * This causes sentences to be split mid-way, creating poor reading experience.
 *
 * This method:
 * 1. Detects pages ending without sentence-ending punctuation
 * 2. Extracts text from next page up to first sentence boundary
 * 3. Appends completion to current page
 * 4. Removes completed text from next page
 *
 * Preserves the >50% segment assignment logic (no duplicates).
 *
 * @param pages Array of story pages with assigned transcript text
 * @returns Pages with completed sentences at boundaries
 */
public completeSentenceBoundaries(pages: StoryPageData[]): StoryPageData[] {
  // TODO: Rename vietnameseText to sourceText for language neutrality

  for (let i = 0; i < pages.length - 1; i++) {
    const currentPage = pages[i];
    const nextPage = pages[i + 1];

    // Check if current page ends mid-sentence
    const currentText = currentPage.vietnameseText.trim();
    const endsWithPunctuation = /[.!?…»"']+$/.test(currentText);

    if (!endsWithPunctuation && nextPage.vietnameseText) {
      // Extract text from next page up to first sentence-ending punctuation
      const match = nextPage.vietnameseText.match(/^([^.!?…»]+[.!?…»]["'\s]*)/);

      if (match) {
        const completion = match[1].trim();

        // Append completion to current page
        currentPage.vietnameseText = currentText + ' ' + completion;

        // Remove completed text from next page
        nextPage.vietnameseText = nextPage.vietnameseText
          .substring(match[0].length)
          .trim();
      }
    }
  }

  return pages;
}
```

### Integration Point

Call after segment assignment in `matchToPages()`:

```typescript
public matchToPages(
  transcript: TranscriptSegment[],
  pages: PageDefinition[]
): StoryPageData[] {
  const results: StoryPageData[] = [];

  // ... existing segment assignment logic ...

  // NEW: Complete sentences at page boundaries
  return this.completeSentenceBoundaries(results);
}
```

## Testing Strategy

### Test Cases

1. **French story** (current failure case)
   - Verify Page 1 ends with complete sentence
   - Verify Page 2 starts with new sentence
   - Check all 12 pages for sentence completion

2. **Vietnamese story** (regression test)
   - Ensure no changes to pages that already have complete sentences
   - Verify no duplicates introduced

3. **Edge cases**
   - Last page (should not be modified)
   - Page with only punctuation completion (e.g., just `"."`)
   - Multiple punctuation marks (e.g., `"!?"`)
   - Quotation marks after punctuation (e.g., `sentence." `)

### Validation

```bash
# Test with French story
node ./dist/index.js youtube-extract examples/youtube-stories/test-french-story-config.yaml --output french-test.yaml

# Verify sentence boundaries in output
# Page 1 should end: "...vous parler de ma journée parfaite."
# Page 2 should start with new sentence

# Test with Vietnamese story (regression)
node ./dist/index.js youtube-extract examples/youtube-stories/test-story-config.yaml --output vietnamese-test.yaml

# Verify no regressions
```

## Files Modified

- `src/services/TranscriptMatcher.ts`
  - Add `completeSentenceBoundaries()` method
  - Update `matchToPages()` to call new method
  - Update class documentation

## Technical Debt

**Property Naming:**
- `StoryPageData.vietnameseText` should be renamed to `sourceText` or `transcriptText`
- Currently language-specific despite handling multiple languages
- Breaking change - defer to future refactor

## Benefits

- Natural reading flow across pages
- Works with any language
- Preserves >50% segment assignment (no duplicates)
- Minimal code changes (~30 lines)
- Handles edge cases gracefully

## Limitations

- Assumes punctuation-based sentence endings (works for Western languages)
- May not handle languages without sentence-ending punctuation (Chinese, Japanese)
- Future: Could use NLP libraries for more sophisticated sentence detection
