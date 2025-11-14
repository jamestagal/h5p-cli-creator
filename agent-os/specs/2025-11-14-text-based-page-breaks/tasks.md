# Task Breakdown: Text-Based Page Breaks for Interactive Book Stories

## Overview

**Total Estimated Effort:** 10.5-13 hours
**Feature Type:** Enhancement / New Workflow
**Priority:** High

**Goal:** Replace timestamp-based page definitions with a text-based workflow where educators mark page breaks directly in transcripts, ensuring perfect audio/text alignment.

## Task List

### Foundation Layer

#### Task Group 1: Core Type Definitions and Models
**Dependencies:** None
**Estimated Effort:** 30 minutes
**Critical Path:** Yes

- [ ] 1.0 Complete foundational types and config extensions
  - [ ] 1.1 Create type definitions for text-based workflow
    - Create `PageDefinition` interface in `src/types/YouTubeExtractorTypes.ts`
    - Properties: `pageNumber: number`, `title: string`, `text: string`
    - Create `MatchedSegment` interface with `pageNumber`, `segments: TranscriptSegment[]`
    - Create `DerivedTimestamp` interface with `pageNumber`, `startTime`, `endTime`, `duration`
  - [ ] 1.2 Extend StoryConfig model
    - Add `transcriptSource?: string` field to `StoryConfig` interface in `src/models/StoryConfig.ts`
    - Add `matchingMode?: "strict" | "tolerant" | "fuzzy"` field (defaults to "tolerant")
    - Document field purposes:
      - `transcriptSource`: "Path to edited transcript file with page break markers"
      - `matchingMode`: "Text matching algorithm: strict (exact), tolerant (85%+), fuzzy (60%+)"
    - Add validation logic: Error if both `transcriptSource` and `pages[].startTime` present
    - Maintain backward compatibility (make fields optional)
  - [ ] 1.3 Create test fixtures directory structure
    - Create `tests/fixtures/transcripts/` directory
    - Create sample transcript files for testing:
      - `full-transcript-simple.txt` - 3 pages, basic case
      - `full-transcript-edited.txt` - 3 pages, minor edits (typo fixes)
      - `full-transcript-multi-segment.txt` - pages spanning multiple segments
    - Create corresponding Whisper segment JSON fixtures in `tests/fixtures/whisper-segments/`

**Acceptance Criteria:**
- Type definitions compile without errors
- StoryConfig accepts `transcriptSource` field
- Validation prevents conflicting config modes
- Test fixtures directory structure created
- Sample files ready for service testing

---

### Service Layer - Parsing

#### Task Group 2: TranscriptFileParser Service
**Dependencies:** Task Group 1
**Estimated Effort:** 1.5-2 hours
**Critical Path:** Yes

- [ ] 2.0 Complete transcript file parser implementation
  - [ ] 2.1 Write 2-5 focused tests for TranscriptFileParser
    - Test parsing valid markdown with `---` delimiters
    - Test extracting page titles from `# Page N:` headings
    - Test auto-numbering pages when headings missing
    - Test whitespace normalization (multiple spaces → single space)
    - Test error detection (empty pages, missing delimiters)
  - [ ] 2.2 Create TranscriptFileParser service class
    - File: `src/services/transcription/TranscriptFileParser.ts`
    - Constructor accepts file path
    - Implement `parse()` method returning `PageDefinition[]`
  - [ ] 2.3 Implement markdown parsing logic
    - Split file content on `---` (triple dash) delimiters
    - Parse `# Page N: Title` format using regex: `/^#\s+Page\s+(\d+):\s*(.+)$/`
    - Extract page number and title from heading
    - Extract text content (everything after heading, before next delimiter)
    - Auto-number pages sequentially if heading format not used
  - [ ] 2.4 Implement whitespace normalization
    - Trim leading/trailing whitespace from page text
    - Collapse multiple spaces to single space
    - Collapse multiple newlines to single newline (preserve paragraph breaks)
    - Pattern from GeminiTranscriptParser: `text.replace(/\s+/g, ' ').trim()`
  - [ ] 2.5 Add validation and error handling
    - Error if file not found or unreadable
    - Error if no page breaks found (no `---` delimiters)
    - Error if page has empty text content
    - Warning if page text is very short (<10 characters)
    - Provide actionable error messages with page numbers
  - [ ] 2.6 Ensure TranscriptFileParser tests pass
    - Run ONLY the 2-5 tests written in 2.1
    - Verify parsing works for valid transcripts
    - Verify error detection works correctly

**Acceptance Criteria:**
- The 2-5 tests written in 2.1 pass
- Parser correctly splits transcript on `---` delimiters
- Page titles extracted from `# Page N:` headings
- Pages auto-numbered when headings missing
- Whitespace normalized for text matching
- Validation errors are clear and actionable

---

### Service Layer - Matching

#### Task Group 3: SegmentMatcher Service (Enhanced with Sequential Matching & Fuzzy Modes)
**Dependencies:** Task Group 2
**Estimated Effort:** 2.5-3 hours
**Critical Path:** Yes

- [ ] 3.0 Complete segment matching implementation with three matching modes
  - [ ] 3.1 Write 3-6 focused tests for SegmentMatcher
    - Test sequential matching (prevents duplicate segment assignment)
    - Test repetition drills (1st "Bonjour" → 2nd "Bonjour" → 3rd "Bonjour" get unique segments)
    - Test multi-segment page matching (page text spans 3-4 segments)
    - Test single-segment page matching
    - Test tolerant mode (85% similarity threshold)
    - Test fuzzy mode (60% similarity threshold with warnings)
  - [ ] 3.2 Create SegmentMatcher service class
    - File: `src/services/transcription/SegmentMatcher.ts`
    - Constructor accepts `whisperSegments: TranscriptSegment[]`, `matchingMode: "strict" | "tolerant" | "fuzzy"`
    - Implement `matchPageToSegments(pageText: string): TranscriptSegment[]` method
    - Add `private currentSegmentIndex: number` for sequential matching pointer
  - [ ] 3.3 Implement sequential matching algorithm
    - Maintain pointer `currentSegmentIndex` in Whisper segment stream
    - Only search segments AFTER last matched segment (prevents duplicates)
    - After matching, advance pointer: `currentSegmentIndex += matched.length`
    - Critical for language learning repetition drills (preserves chronological order)
  - [ ] 3.4 Implement text normalization utilities
    - Reuse utilities from TranscriptMatcher: `preserveFormatting()`, `concatenateSegments()`
    - Create `normalizeText()` method: lowercase, trim whitespace, collapse multiple spaces
    - Preserve UTF-8 encoding (Vietnamese diacritics, French accents)
    - Apply normalization consistently to page text and segment text
  - [ ] 3.5 Implement Jaccard similarity calculator for tolerant/fuzzy modes
    - Create `calculateJaccardSimilarity(text1: string, text2: string): number` method
    - Tokenize text: `text.split(/\s+/)` to get word array
    - Calculate intersection and union of token sets
    - Return: `intersection.size / union.size` (0.0 to 1.0)
    - Use for tolerant mode (85%+ threshold) and fuzzy mode (60%+ threshold)
  - [ ] 3.6 Implement sliding window search with similarity matching
    - Search remaining segments (from currentSegmentIndex forward)
    - Try window size 1, then 2, then 3... segments
    - For each window, concatenate segments and calculate similarity
    - **Strict mode**: Require 100% match after normalization
    - **Tolerant mode**: Require ≥85% Jaccard similarity (default, recommended)
    - **Fuzzy mode**: Require ≥60% Jaccard similarity (generates warnings)
    - Return first window that meets threshold
  - [ ] 3.7 Add helpful diff output for non-100% matches
    - When similarity < 100%, generate side-by-side comparison:
      ```
      Whisper:  "Je me réveille sans réveil."
      Edited:   "Je me réveille sans un réveil."
                                      ^^^ (difference highlighted)
      Similarity: 94%
      ```
    - Show character-level or word-level diff
    - Help educators understand what changed
  - [ ] 3.8 Add match confidence reporting
    - Return `MatchedSegment` with `confidence: number` field
    - Store similarity score (0.0-1.0) for each matched page
    - Display in validation and generation output
    - Warning if any page < 90% in tolerant mode
    - Warning if any page < 80% in fuzzy mode
  - [ ] 3.9 Ensure SegmentMatcher tests pass
    - Run ONLY the 3-6 tests written in 3.1
    - Verify sequential matching prevents duplicates
    - Verify repetition drills work correctly
    - Verify all three matching modes work

**Acceptance Criteria:**
- The 3-6 tests written in 3.1 pass
- Sequential matching prevents duplicate segment assignment
- Repetition drills (repeated phrases) handled correctly
- Three matching modes work: strict (100%), tolerant (85%+), fuzzy (60%+)
- Jaccard similarity calculation accurate
- Helpful diff output for edited text
- Match confidence reported for each page

---

### Service Layer - Timestamp Derivation

#### Task Group 4: TimestampDeriver Service
**Dependencies:** Task Group 3
**Estimated Effort:** 1 hour
**Critical Path:** Yes

- [ ] 4.0 Complete timestamp derivation implementation
  - [ ] 4.1 Write 2-4 focused tests for TimestampDeriver
    - Test deriving timestamps from single-segment page
    - Test deriving timestamps from multi-segment page
    - Test decimal precision preservation (9.4s, 17.6s)
    - Test duration calculation (endTime - startTime)
  - [ ] 4.2 Create TimestampDeriver service class
    - File: `src/services/transcription/TimestampDeriver.ts`
    - Static method: `deriveTimestamps(matchedSegments: MatchedSegment[]): TimestampSegment[]`
    - No constructor needed (stateless service)
  - [ ] 4.3 Implement timestamp derivation logic
    - For each page's matched segments array:
      - startTime = first segment's startTime
      - endTime = last segment's endTime
      - duration = endTime - startTime
    - Preserve decimal precision from Whisper (9.4s, 17.6s, 24.1s)
    - Return `TimestampSegment` objects for AudioSplitter consumption
  - [ ] 4.4 Add validation
    - Error if segments array is empty
    - Error if segments not in chronological order
    - Warning if page duration > 120 seconds (2 minutes)
    - Warning if page duration < 3 seconds
  - [ ] 4.5 Ensure TimestampDeriver tests pass
    - Run ONLY the 2-4 tests written in 4.1
    - Verify timestamps derived correctly
    - Verify decimal precision preserved

**Acceptance Criteria:**
- The 2-4 tests written in 4.1 pass
- Timestamps derived from segment boundaries
- Decimal precision preserved (9.4s, 17.6s format)
- Duration calculations accurate
- Validation errors are clear

---

### CLI Integration

#### Task Group 5: Extract Transcript CLI Command
**Dependencies:** Task Groups 1-2
**Estimated Effort:** 1 hour
**Critical Path:** Yes

- [ ] 5.0 Complete youtube-extract-transcript command
  - [ ] 5.1 Create CLI command module
    - File: `src/cli/commands/youtube-extract-transcript.ts`
    - Command: `youtube-extract-transcript <config-file>`
    - Description: "Extract transcript from YouTube video for review and page break marking"
  - [ ] 5.2 Implement command handler
    - Load config YAML using existing config parser
    - Extract video ID from YouTube URL
    - Create cache directory: `.youtube-cache/{VIDEO_ID}/`
    - Check for cached `whisper-transcript.json`
  - [ ] 5.3 Integrate WhisperTranscriptionService
    - Reuse existing WhisperTranscriptionService for API calls
    - Pass language from config: `config.source.language` or detect from video
    - Handle time range trimming: `config.source.startTime`, `config.source.endTime`
    - Cache raw Whisper output to `whisper-transcript.json`
  - [ ] 5.4 Format transcript for human readability
    - Convert `TranscriptSegment[]` to readable text format
    - Separate each segment with blank line (double newline)
    - Preserve paragraph breaks from Whisper punctuation
    - UTF-8 encoding preservation
    - Output to `.youtube-cache/{VIDEO_ID}/full-transcript.txt`
  - [ ] 5.5 Add progress messages
    - "Extracting audio from YouTube video..."
    - "Transcribing audio with Whisper API... (estimated cost: $X.XX)"
    - "Using cached transcript"
    - "Transcript saved to: .youtube-cache/{VIDEO_ID}/full-transcript.txt"
    - "Next step: Edit transcript and insert page breaks using ---"
  - [ ] 5.6 Register command in CLI entry point
    - Add to `src/index.ts` command registry
    - Test command help: `youtube-extract-transcript --help`

**Acceptance Criteria:**
- Command `youtube-extract-transcript config.yaml` works
- Transcript extracted and saved to cache directory
- Human-readable format with paragraph breaks
- Progress messages displayed
- Caching works (no duplicate API calls)

---

#### Task Group 6: Validate Transcript CLI Command
**Dependencies:** Task Groups 1-5
**Estimated Effort:** 1-1.5 hours
**Critical Path:** No

- [ ] 6.0 Complete youtube-validate-transcript command for format checking
  - [ ] 6.1 Create CLI command module
    - File: `src/cli/commands/youtube-validate-transcript.ts`
    - Command: `youtube-validate-transcript <config-file>`
    - Description: "Validate transcript format and show page structure preview (no generation)"
  - [ ] 6.2 Implement validation workflow (dry run)
    - Load config YAML using existing config parser
    - Load edited transcript file from `config.transcriptSource` path
    - Parse transcript using TranscriptFileParser (validates format)
    - Load cached Whisper segments from `.youtube-cache/{VIDEO_ID}/whisper-transcript.json`
    - Match pages to segments using SegmentMatcher (dry run, no audio splitting)
    - Derive timestamps using TimestampDeriver
  - [ ] 6.3 Generate validation report output
    - Format validation results:
      ```
      ✅ Format valid: 12 pages found
      ✅ All page breaks formatted correctly
      ✅ All pages have content
      ⚠️  Page 3 is very short (6.5 seconds)
      ⚠️  Page 8 text similarity 87% (minor edits detected)
      ```
    - Page structure preview:
      ```
      📊 Story Structure:
        Page 1: Introduction (9.4s) - ✅ 100% match
        Page 2: Waking up (8.2s) - ✅ 100% match
        Page 3: Morning routine (6.5s) - ⚠️ Very short
        ...

      Total duration: 3:05 (185 seconds)
      ```
  - [ ] 6.4 Add warnings for edge cases
    - Warning if page duration < 5 seconds (very short)
    - Warning if page duration > 120 seconds (very long, >2 minutes)
    - Warning if match confidence < 90% in tolerant mode
    - Warning if match confidence < 80% in fuzzy mode
    - Info message if all pages 100% match (unedited transcript)
  - [ ] 6.5 Add actionable error messages
    - Error if transcript file not found: "Transcript file not found: {path}. Run youtube-extract-transcript first."
    - Error if Whisper cache not found: "Whisper transcript cache not found. Run youtube-extract-transcript first."
    - Error if page breaks missing: "No page breaks (---) found in transcript."
    - Error if empty pages: "Page {N} has no content between delimiters."
    - Error if text matching fails: "Page {N} text not found in Whisper segments. Similarity: {X}%. Consider using matchingMode: 'fuzzy'"
  - [ ] 6.6 Register command in CLI entry point
    - Add to `src/index.ts` command registry
    - Test command help: `youtube-validate-transcript --help`
    - Document usage: "Run before youtube-generate to catch format errors early"

**Acceptance Criteria:**
- Command `youtube-validate-transcript config.yaml` works
- Validates transcript format without generating H5P package
- Shows page structure preview with durations
- Displays match confidence for each page
- Warnings shown for edge cases (short pages, low similarity)
- Error messages are actionable and helpful
- Zero cost (no H5P generation, just validation)

---

#### Task Group 7: Generate Story CLI Command Integration
**Dependencies:** Task Groups 1-6
**Estimated Effort:** 1.5 hours
**Critical Path:** Yes

- [ ] 7.0 Complete youtube-generate command text-based mode
  - [ ] 7.1 Update youtube-generate command to support dual modes
    - File: `src/cli/commands/youtube-generate.ts` (update existing)
    - Detect mode: Check for `config.transcriptSource` field
    - If `transcriptSource` present → text-based mode
    - If `pages[].startTime` present → legacy timestamp mode
    - Error if both present
  - [ ] 7.2 Implement text-based mode workflow
    - Load edited transcript file from `config.transcriptSource` path
    - Parse transcript using TranscriptFileParser
    - Load cached Whisper segments from `.youtube-cache/{VIDEO_ID}/whisper-transcript.json`
    - Match pages to segments using SegmentMatcher (with config.matchingMode)
    - Derive timestamps using TimestampDeriver
    - Pass `TimestampSegment[]` to existing AudioSplitter
  - [ ] 7.3 Integrate with existing story generation pipeline
    - Reuse existing AudioSplitter (no changes needed)
    - Reuse existing AITranslationService for translations
    - Reuse existing InteractiveBookCreator for H5P generation
    - Pass derived timestamps instead of config timestamps
  - [ ] 7.4 Add progress messages for text-based mode
    - "Using text-based page breaks from: {transcriptSource}"
    - "Matching mode: {strict|tolerant|fuzzy}"
    - "Parsing transcript... found {N} pages"
    - "Matching text to Whisper segments..."
    - "Page {N}: matched {M} segments (duration: {X}s, confidence: {Y}%)"
    - "Deriving timestamps from matched segments..."
    - "Splitting audio into page segments..."
    - "Generating translations..."
    - "Creating Interactive Book H5P package..."
  - [ ] 7.5 Add validation and error handling
    - Error if `transcriptSource` file not found
    - Error if Whisper cache not found (run youtube-extract-transcript first)
    - Error if text matching fails (show unmatched pages/text with diff)
    - Display match confidence for each page
    - Warning if any page has low confidence (<90% tolerant, <80% fuzzy)
    - Suggest running youtube-validate-transcript first if errors occur
  - [ ] 7.6 Test end-to-end workflow
    - Manual test: Extract transcript → Edit → Validate → Generate story
    - Verify audio/text alignment in generated H5P package
    - Test with French story (current problem case)
    - Test with Vietnamese story (regression check)
    - Test with edited text (minor changes, tolerant mode)
    - Test with heavily edited text (fuzzy mode)

**Acceptance Criteria:**
- Command detects config mode correctly (text-based vs legacy)
- Text-based mode workflow executes successfully
- Audio segments generated with perfect text alignment
- Progress messages displayed at each phase
- Error messages are clear and actionable
- French story audio/text alignment issue resolved

---

### Testing & Validation

#### Task Group 8: Integration Testing and Validation
**Dependencies:** Task Groups 1-7
**Estimated Effort:** 1-1.5 hours
**Critical Path:** No

- [ ] 8.0 Complete integration testing for text-based workflow
  - [ ] 8.1 Review existing tests from Task Groups 2-4
    - Review 2-5 tests from TranscriptFileParser (Task 2.1)
    - Review 3-6 tests from SegmentMatcher (Task 3.1)
    - Review 2-4 tests from TimestampDeriver (Task 4.1)
    - Total existing tests: approximately 7-15 tests
  - [ ] 8.2 Analyze test coverage gaps for THIS feature only
    - Identify critical end-to-end workflows lacking coverage
    - Focus ONLY on text-based page breaks feature workflows
    - Prioritize integration points between services
    - Test all three matching modes (strict, tolerant, fuzzy)
    - Test sequential matching for repetition drills
    - Do NOT assess entire application test coverage
  - [ ] 8.3 Write up to 10 additional strategic tests maximum
    - Integration test: Full workflow (extract → parse → match → derive → generate)
    - Integration test: French story case (audio/text alignment fix)
    - Integration test: Vietnamese story regression test
    - Integration test: Edited text with minor changes (tolerant mode)
    - Integration test: Heavily edited text (fuzzy mode)
    - Integration test: Repetition drills (sequential matching)
    - Integration test: Multi-segment pages
    - Integration test: Config validation (dual-mode detection, matchingMode)
    - Edge case: Empty page detection
    - Edge case: Unmatched text handling with helpful diff
  - [ ] 8.4 Run feature-specific tests only
    - Run ONLY tests related to text-based page breaks feature
    - Expected total: approximately 17-25 tests maximum
    - Do NOT run entire application test suite
    - Verify critical workflows pass
    - Verify all three matching modes work correctly

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 17-25 tests total)
- Critical user workflows for text-based page breaks covered
- All three matching modes tested (strict, tolerant, fuzzy)
- Sequential matching for repetition drills tested
- No more than 10 additional tests added
- Testing focused exclusively on this feature
- French story audio/text alignment verified
- Vietnamese story regression verified

---

### Documentation & Cleanup

#### Task Group 9: Documentation and Example Updates
**Dependencies:** Task Groups 1-8
**Estimated Effort:** 45-60 minutes
**Critical Path:** No

- [ ] 9.0 Complete documentation for text-based workflow
  - [ ] 9.1 Update CLAUDE.md with text-based workflow
    - Add "Text-Based Page Breaks Workflow" section
    - Document CLI commands: `youtube-extract-transcript`, `youtube-validate-transcript`, `youtube-generate`
    - Explain markdown page break format (`---`, `# Page N:`)
    - Add example workflow steps (extract → edit → validate → generate)
    - Document config extensions: `transcriptSource` and `matchingMode` fields
    - Document matching modes (strict, tolerant, fuzzy) with guidance on when to use each
    - Document sequential matching for repetition drills
    - Add troubleshooting section (common errors, solutions)
    - Add best practices: trimming intro/outro, validation before generation
  - [ ] 9.2 Create example config files
    - File: `examples/youtube-stories/text-based-example.yaml`
    - Include `transcriptSource` field
    - Include `matchingMode: "tolerant"` with comment explaining options
    - Include comments explaining dual-mode support
    - Reference French story as working example
    - Add example showing repetition drill use case
  - [ ] 9.3 Create example transcript files
    - File: `examples/youtube-stories/full-transcript-example.txt`
    - Show markdown page break format
    - Show page title format: `# Page 1: Introduction`
    - Include 5-6 example pages with varied content
    - Include example of repetition drill (same phrase 3 times)
    - Add comments explaining format and best practices
  - [ ] 9.4 Update main README.md if needed
    - Add brief mention of text-based workflow
    - Link to CLAUDE.md for detailed docs
    - Add to features list
    - Mention Descript-style transcript-based editing paradigm
  - [ ] 9.5 Create migration guide for timestamp configs
    - File: `docs/text-based-page-breaks-migration.md`
    - Explain differences between modes (timestamp vs text-based)
    - Show side-by-side config comparison
    - Provide conversion steps (manual process)
    - Explain benefits of text-based approach (perfect alignment, easier workflow)
    - Document matching modes and when to use each

**Acceptance Criteria:**
- CLAUDE.md updated with comprehensive workflow docs
- Example config and transcript files created
- Documentation is clear and actionable
- Migration guide helps users transition

---

## Execution Order

**Recommended implementation sequence:**

1. **Foundation Layer** (Task Group 1) - 30 minutes
   - Create types and extend config model (including matchingMode)
   - Set up test fixtures

2. **Service Layer - Parsing** (Task Group 2) - 1.5-2 hours
   - Implement TranscriptFileParser
   - Test parsing and validation

3. **Service Layer - Matching** (Task Group 3) - 2.5-3 hours
   - Implement SegmentMatcher with sequential matching
   - Implement three matching modes (strict, tolerant, fuzzy)
   - Implement Jaccard similarity calculator
   - Test text matching algorithm and repetition drills

4. **Service Layer - Derivation** (Task Group 4) - 1 hour
   - Implement TimestampDeriver
   - Test timestamp calculations

5. **CLI - Extract Transcript** (Task Group 5) - 1 hour
   - Implement youtube-extract-transcript command
   - Test transcript extraction

6. **CLI - Validate Transcript** (Task Group 6) - 1-1.5 hours
   - Implement youtube-validate-transcript command
   - Test validation workflow

7. **CLI - Generate Story** (Task Group 7) - 1.5 hours
   - Update youtube-generate command for dual-mode
   - Test end-to-end workflow with all matching modes

8. **Testing & Validation** (Task Group 8) - 1-1.5 hours
   - Write integration tests
   - Test all three matching modes
   - Test sequential matching for repetition drills
   - Validate French and Vietnamese stories
   - Fill critical test coverage gaps

9. **Documentation** (Task Group 9) - 45-60 minutes
   - Update CLAUDE.md with all new features
   - Create examples (including repetition drills)
   - Create migration guide

---

## Task Effort Summary

| Task Group | Description | Estimated Effort | Critical Path |
|------------|-------------|------------------|---------------|
| Group 1 | Foundation (types, config, matchingMode) | 30 min | Yes |
| Group 2 | TranscriptFileParser | 1.5-2 hours | Yes |
| Group 3 | SegmentMatcher (sequential, 3 modes, Jaccard) | 2.5-3 hours | Yes |
| Group 4 | TimestampDeriver | 1 hour | Yes |
| Group 5 | Extract Transcript CLI | 1 hour | Yes |
| Group 6 | Validate Transcript CLI | 1-1.5 hours | No |
| Group 7 | Generate Story CLI (dual-mode) | 1.5 hours | Yes |
| Group 8 | Integration Testing (3 modes, repetition) | 1-1.5 hours | No |
| Group 9 | Documentation (all features) | 45-60 min | No |
| **TOTAL** | | **10.5-13 hours** | |

**Note:** Enhanced from original 4-6 hour estimate to include:
- Three matching modes (strict, tolerant, fuzzy) with Jaccard similarity
- Sequential matching for repetition drills
- Validation command with helpful diff output
- Comprehensive testing of all modes
- Extended documentation covering all enhancements

---

## Success Criteria

### MVP Success
1. Extract transcript to human-readable format
2. Parse markdown page break markers
3. Match text to Whisper segments (exact matching)
4. Derive timestamps from segment boundaries
5. Generate story with perfect audio/text alignment

### Testing Validation
- **French story** (current problem case): Audio and text match perfectly
- **Vietnamese story** (regression): No degradation from current quality
- **Edited text**: Minor edits (typos) work correctly
- **Multiple segments per page**: Long pages spanning 3-4 segments work
- **Short pages**: Single-segment pages work

### User Acceptance
- Educator can create 12-page French story in < 15 minutes
- No audio/text misalignment issues
- Workflow feels natural and intuitive
- Error messages are helpful and actionable

---

## Risk Mitigation

### Risk: Text matching fails for significantly edited transcripts
**Mitigation:** Implement three matching modes (strict, tolerant with 85% threshold, fuzzy with 60% threshold) to handle varying levels of edits. Tolerant mode (default) handles most use cases.

### Risk: Whitespace normalization too aggressive
**Mitigation:** Test with French and Vietnamese stories (preserve diacritics, handle punctuation)

### Risk: Breaking existing timestamp-based configs
**Mitigation:** Dual-mode support (detect config type), maintain backward compatibility

### Risk: AudioSplitter compatibility issues
**Mitigation:** TimestampDeriver outputs `TimestampSegment[]` format (same interface AudioSplitter expects)

---

## Common Pitfalls & Gotchas

### 1. SegmentMatcher State Management
**Pitfall:** SegmentMatcher maintains `currentSegmentIndex` pointer state for sequential matching. Reusing the same instance for multiple matching runs will produce incorrect results.

**Solution:** Create a fresh SegmentMatcher instance for each full story matching run. In tests, use `beforeEach()` to create new instances.

```typescript
// ❌ WRONG - reusing instance across stories
const matcher = new SegmentMatcher(segments, "tolerant");
const story1Pages = matcher.matchAllPages(story1);
const story2Pages = matcher.matchAllPages(story2); // BUG: pointer not reset!

// ✅ CORRECT - fresh instance per story
const matcher1 = new SegmentMatcher(segments1, "tolerant");
const story1Pages = matcher1.matchAllPages(story1);

const matcher2 = new SegmentMatcher(segments2, "tolerant");
const story2Pages = matcher2.matchAllPages(story2);
```

### 2. Jaccard Similarity Calculation
**Pitfall:** Easy to swap intersection/union or miscalculate set operations, leading to incorrect similarity scores.

**Solution:** Use Set operations correctly and test with known examples.

```typescript
// ✅ CORRECT implementation
function calculateJaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(text1.split(/\s+/));
  const tokens2 = new Set(text2.split(/\s+/));

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size; // intersection ÷ union, NOT the reverse!
}

// Test with known case:
// "hello world" vs "hello there"
// intersection: {hello} (1)
// union: {hello, world, there} (3)
// similarity: 1/3 = 0.333
```

### 3. Normalization Consistency
**Pitfall:** Applying normalization to page text but not segment text (or vice versa), or using different normalization for comparison vs display.

**Solution:** Create a single `normalizeText()` utility and apply consistently to BOTH sides before comparison.

```typescript
// ❌ WRONG - inconsistent normalization
const pageTextNormalized = pageText.toLowerCase().trim();
const segmentText = segment.text; // NOT normalized!
if (pageTextNormalized === segmentText) { ... } // Will never match!

// ✅ CORRECT - consistent normalization
private normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

const pageTextNormalized = this.normalizeText(pageText);
const segmentTextNormalized = this.normalizeText(segment.text);
if (pageTextNormalized === segmentTextNormalized) { ... }
```

### 4. UTF-8 Encoding Preservation
**Pitfall:** String operations in TypeScript/JavaScript can corrupt Vietnamese diacritics or French accents if not careful.

**Solution:** Avoid byte-level operations. Use `.toLowerCase()`, `.trim()`, `.replace()` which are Unicode-aware.

```typescript
// ✅ SAFE - these operations preserve diacritics
const text = "Trời ơi"; // Vietnamese
const normalized = text.toLowerCase().trim(); // "trời ơi" - diacritics preserved

// ✅ SAFE - Jaccard similarity with diacritics
const tokens = text.split(/\s+/); // ["Trời", "ơi"] - diacritics preserved
```

### 5. Sliding Window Boundary Condition
**Pitfall:** Sliding window could expand indefinitely if no match found, consuming memory and time.

**Solution:** Stop expanding window when candidate text is 2x+ page text length.

```typescript
for (let windowSize = 1; windowSize <= remainingSegments.length; windowSize++) {
  const candidateSegments = remainingSegments.slice(0, windowSize);
  const candidateText = this.concatenateSegments(candidateSegments);

  // Stop if window way too large (prevents infinite expansion)
  if (candidateText.length > pageText.length * 2) {
    break; // Prevent runaway window
  }

  // ... similarity check ...
}
```

### 6. Decimal Precision Loss in Timestamps
**Pitfall:** JavaScript number operations could lose precision on Whisper's decimal timestamps (9.4s, 17.6s).

**Solution:** Store timestamps as numbers (not strings), and preserve original precision from Whisper.

```typescript
// ✅ CORRECT - preserve Whisper's decimal precision
const derivedTimestamp: TimestampSegment = {
  pageNumber: 1,
  startTime: segments[0].startTime, // 9.4 (from Whisper, preserved)
  endTime: segments[2].endTime,     // 24.1 (from Whisper, preserved)
  duration: segments[2].endTime - segments[0].startTime // 14.7 (calculated)
};

// ❌ WRONG - rounding loses precision
const startTime = Math.round(segments[0].startTime); // 9 (lost 0.4!)
```

### 7. Markdown Parsing Edge Cases
**Pitfall:** What if educator uses `---` inside page content? Or has malformed headings like `#Page 1` (no space)?

**Solution:** Parse `---` only when it's on its own line. Allow flexible heading format.

```typescript
// Split on `---` that is on its own line (with optional whitespace)
const pages = content.split(/\n\s*---\s*\n/);

// Flexible heading regex - handles variations
const headingMatch = pageText.match(/^#\s+Page\s+(\d+)\s*:?\s*(.*)$/i);
// Matches: "# Page 1: Title", "#Page 1:Title", "# page 1 Title", etc.
```

### 8. Config Validation Timing
**Pitfall:** Trying to match segments before validating config causes confusing errors ("Whisper cache not found" instead of "conflicting config fields").

**Solution:** Validate config FIRST, before any processing.

```typescript
// ✅ CORRECT - validate config before processing
function generateStory(config: StoryConfig) {
  // FIRST: Validate config structure
  if (config.transcriptSource && config.pages?.some(p => p.startTime)) {
    throw new Error("Cannot use both transcriptSource (text-based) and pages.startTime (timestamp-based) in same config");
  }

  // THEN: Proceed with processing
  if (config.transcriptSource) {
    return generateFromTranscript(config);
  } else {
    return generateFromTimestamps(config);
  }
}
```

### 9. Error Message Clarity for Matching Failures
**Pitfall:** Generic error "text matching failed" doesn't help educator fix the problem.

**Solution:** Show WHICH page failed, similarity score, and diff output.

```typescript
// ❌ WRONG - unhelpful error
throw new Error("Text matching failed");

// ✅ CORRECT - actionable error with context
throw new Error(`
Page 5 text not found in Whisper segments.

Similarity: 45% (below 60% fuzzy threshold)

Whisper transcript:
  "Je me réveille sans réveil."

Your edited text:
  "Je me suis réveillé sans réveil."

Difference: verb tense changed ("réveille" → "réveillé")

Suggestion: Use matchingMode: "fuzzy" or revert text closer to Whisper output.
`);
```

### 10. Test Isolation for Sequential Matching
**Pitfall:** Tests sharing a SegmentMatcher instance will interfere with each other (pointer state pollution).

**Solution:** Use `beforeEach()` to create fresh instances, or create inline in each test.

```typescript
describe('SegmentMatcher', () => {
  let segments: TranscriptSegment[];

  beforeEach(() => {
    segments = [
      { startTime: 0, endTime: 5, text: "Hello" },
      { startTime: 5, endTime: 10, text: "World" }
    ];
  });

  it('matches first page', () => {
    const matcher = new SegmentMatcher(segments, "strict"); // Fresh instance
    const result = matcher.matchPageToSegments("Hello");
    expect(result).toHaveLength(1);
  });

  it('matches second page', () => {
    const matcher = new SegmentMatcher(segments, "strict"); // Fresh instance (not reused!)
    const result = matcher.matchPageToSegments("World");
    expect(result).toHaveLength(1);
  });
});
```

---

## Notes

- **Reuse existing services:** WhisperTranscriptionService, AudioSplitter, AITranslationService unchanged
- **Leverage existing utilities:** TranscriptMatcher concatenation/normalization patterns
- **UTF-8 encoding:** Critical for Vietnamese diacritics and French accents
- **Decimal precision:** Whisper provides 9.4s, 17.6s timestamps (preserve in TimestampDeriver)
- **CLI-only for Phase 1:** Web UI implementation is Phase 2 (separate spec)
