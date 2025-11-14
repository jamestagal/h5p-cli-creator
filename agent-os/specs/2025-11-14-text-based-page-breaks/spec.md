# Specification: Text-Based Page Breaks for Interactive Book Stories

## Goal
Replace the timestamp-based page definition workflow with a text-based approach where educators insert page break markers directly in the transcript, ensuring perfect audio/text alignment and integrating seamlessly with the Smart Import Step 2: Review Text workflow.

## User Stories
- As an educator, I want to extract a transcript from a YouTube video so that I can review and mark page breaks before generating the story
- As an educator, I want to insert page break markers in the transcript so that I can define story pages based on natural narrative boundaries without calculating timestamps

## Specific Requirements

**Extract Transcript Only (CLI Command)**
- New CLI command `youtube-extract-transcript config.yaml` outputs human-readable transcript
- Outputs to `.youtube-cache/{VIDEO_ID}/full-transcript.txt` with paragraph breaks
- Text matches Whisper segments exactly (UTF-8 encoding preserves diacritics)
- Each Whisper segment separated by blank line for readability
- Uses existing WhisperTranscriptionService for API calls and caching

**Markdown Page Break Format**
- Use `---` (triple dash) as page break delimiter following markdown horizontal rule convention
- Use `# Page N: Title` format for page titles (markdown heading level 1)
- Text between delimiters becomes page content
- Pages auto-numbered sequentially if heading format not used
- Support paragraph breaks within page content (preserve formatting)

**TranscriptFileParser Service**
- Parse edited transcript file with page break markers
- Extract page structure: pageNumber, title, text for each page
- Validate format and provide actionable error messages (empty pages, missing delimiters, etc.)
- Normalize whitespace (multiple spaces/newlines to single space) for text matching
- Return structured array of PageDefinition objects

**SegmentMatcher Service**
- **Sequential matching algorithm**: Maintain pointer in Whisper segment stream, only search forward from last match
- Each page matches segments AFTER previous page's last matched segment (prevents duplicate assignment, preserves chronological order)
- Critical for language learning videos with repetition drills (1st "Bonjour" → 2nd "Bonjour" → 3rd "Bonjour" each get unique segments)
- **Three matching modes** (configurable via `matchingMode` in YAML):
  - `strict`: Exact text match after normalization (whitespace/punctuation only)
  - `tolerant` (default): Token-based similarity using Jaccard index (85%+ match threshold)
  - `fuzzy`: Relaxed matching (60%+ similarity) with warnings for significant edits
- **Token-based similarity** (Jaccard index): Compare shared tokens between page text and candidate segments
- **Sliding window search**: Try 1 segment, then 2 segments, then 3+ segments to find best multi-segment match
- **Helpful diff output**: When similarity < 100%, display side-by-side comparison showing Whisper text vs edited text
- Normalize text for comparison (trim whitespace, collapse multiple spaces, lowercase for comparison)
- Handle multi-segment pages (page text spans multiple Whisper segments)
- Detect and report unmatched text with actionable error messages
- Return matched segments array for each page with confidence score

**TimestampDeriver Service**
- Derive page timestamps from matched Whisper segments
- Use segment boundaries with decimal precision (9.4s, 17.6s from Whisper API)
- For multi-segment pages: startTime = first segment start, endTime = last segment end
- Calculate exact audio duration for each page (endTime - startTime)
- Return TimestampSegment objects for AudioSplitter consumption

**YAML Config Extension**
- Add optional `transcriptSource` field to StoryConfig (path to edited transcript file)
- Add optional `matchingMode` field: `"strict"` | `"tolerant"` | `"fuzzy"` (defaults to `"tolerant"`)
- **Matching mode guidance**:
  - `strict`: Use when transcript is unedited or only whitespace/punctuation fixes
  - `tolerant` (recommended): Use when fixing typos, merging sentences, minor pedagogical edits (default)
  - `fuzzy`: Use when heavily editing text while preserving meaning (generates warnings)
- Dual-mode support: `transcriptSource` (text-based) OR `pages` array with timestamps (legacy)
- Error if both `transcriptSource` and `pages.startTime` present in config
- Text-based mode skips timestamp parsing entirely (page definitions come from transcript)
- Legacy mode remains backward compatible (no breaking changes)

**CLI Command Integration**
- `youtube-extract-transcript config.yaml` creates initial transcript file
- `youtube-validate-transcript config.yaml` validates transcript format and shows page structure preview (no generation)
- `youtube-generate config.yaml --output story.yaml` generates story from marked transcript
- Config references edited transcript via `transcriptSource` field
- System automatically matches text, derives timestamps, generates audio segments
- Display progress messages for each phase (extracting, matching, deriving, generating)

**Validation Command (youtube-validate-transcript)**
- **Purpose**: Sanity-check transcript format before full story generation (zero cost, fast feedback)
- **Output**:
  - Format validation (page breaks, headings, content presence)
  - Page structure preview with titles and durations
  - Warnings for edge cases (very short/long pages, low similarity matches)
  - Matching confidence scores per page
- **Example output**:
  ```
  ✅ Format valid: 12 pages found
  ✅ All page breaks formatted correctly
  ✅ All pages have content
  ⚠️  Page 3 is very short (6.5 seconds)
  ⚠️  Page 8 text similarity 87% (minor edits detected)

  📊 Story Structure:
    Page 1: Introduction (9.4s) - ✅ 100% match
    Page 2: Waking up (8.2s) - ✅ 100% match
    Page 3: Morning routine (6.5s) - ⚠️ Very short
    ...

  Total duration: 3:05 (185 seconds)
  ```
- **Best practice**: Run validation before `youtube-generate` to catch format errors early

**File Storage Structure**
- `.youtube-cache/{VIDEO_ID}/whisper-transcript.json` - Raw Whisper API response (cached)
- `.youtube-cache/{VIDEO_ID}/full-transcript.txt` - Human-readable initial transcript
- `.youtube-cache/{VIDEO_ID}/full-transcript-edited.txt` - Edited version with page breaks
- `.youtube-cache/{VIDEO_ID}/audio-segments/page1.mp3` - Generated audio segments
- Use existing cache structure (no new directories required)

## Visual Design
No visual mockups provided (CLI-only for Phase 1).

## Existing Code to Leverage

**WhisperTranscriptionService (src/services/transcription/WhisperTranscriptionService.ts)**
- Already transcribes audio with Whisper API and caches results to `whisper-transcript.json`
- Returns TranscriptSegment array with startTime, endTime, text fields
- Preserves UTF-8 encoding (Vietnamese diacritics, French accents)
- Handles API retry logic, cost estimation, file validation
- Reuse for initial transcript extraction in `youtube-extract-transcript` command

**TranscriptMatcher (src/services/TranscriptMatcher.ts)**
- Contains `concatenateSegments()` method for joining Whisper segments with proper spacing
- Contains `preserveFormatting()` for whitespace normalization
- Contains `completeSentenceBoundaries()` for sentence completion logic
- Reuse concatenation and normalization utilities in new SegmentMatcher service
- Adapt segment matching logic (currently uses >50% overlap, new version uses exact text match)

**AudioSplitter (src/services/AudioSplitter.ts)**
- Splits audio at precise timestamps using ffmpeg with copy codec
- Accepts TimestampSegment array (pageNumber, startTime, endTime)
- Generates sequential output files (page1.mp3, page2.mp3)
- Validates timestamp ranges and checks for overlaps
- Reuse unchanged in text-based workflow (derives timestamps then splits audio)

**GeminiTranscriptParser (src/services/GeminiTranscriptParser.ts)**
- Parses plain text transcripts with paragraph breaks (double newlines)
- Demonstrates paragraph splitting pattern: `split(/\n\n+/)` for multiple newlines
- Shows text normalization approach: `trim()` and `filter(p => p.length > 0)`
- Adapt paragraph parsing logic for markdown page break format (`---` delimiters)
- Reference as pattern for TranscriptFileParser implementation

**StoryConfig (src/models/StoryConfig.ts)**
- Defines YAML config structure with source, translation, pages fields
- Shows dual-mode pattern with `manualTranscriptPath` optional field
- Extend with `transcriptSource` field for edited transcript path
- Add validation logic to prevent both `transcriptSource` and timestamp-based `pages`
- Maintain backward compatibility (existing configs continue working)

## Best Practices & Usage Guidance

**Trimming Intro/Outro Before Transcript Extraction**
- Use `source.startTime` and `source.endTime` to trim intro music, "hey guys" intros, outro music, end screens
- Extract transcript AFTER trimming (text-based pages work on trimmed audio only)
- Example workflow:
  1. Set time range in config: `startTime: "00:18"`, `endTime: "03:23"`
  2. Run `youtube-extract-transcript config.yaml`
  3. Review transcript → if intro/outro still present → adjust time range → re-extract
  4. Mark page breaks in trimmed transcript
  5. Generate story

**Template Examples for Common Patterns**
- **Simple narrative story** (French/Vietnamese learning):
  ```markdown
  # Page 1: Introduction
  Ma journée parfaite. Je m'appelle Liam.
  ---
  # Page 2: Morning routine
  Je me réveille sans réveil.
  ---
  ```

- **Repetition drill** (beginner language learning):
  ```markdown
  # Page 1: First repetition
  Bonjour
  ---
  # Page 2: Second repetition
  Bonjour
  ---
  # Page 3: Student turn
  Répétez: Bonjour
  ---
  ```

- **Multi-segment page** (longer narrative):
  ```markdown
  # Page 1: Morning routine
  Je prends une douche chaude puis je prépare le petit déjeuner.
  Je mange des crêpes avec du miel et bois du jus d'orange frais.
  Délicieux! Après le petit déjeuner, je sors.
  ---
  ```

**Common Errors Guide**
- ❌ **Missing page break**: `Error: Found text after last page - did you forget ---?`
- ❌ **Empty page**: `Error: Page 3 has no content between delimiters`
- ❌ **Wrong heading format**: `Warning: Found 'Page 1 Introduction' instead of '# Page 1: Introduction'`
- ❌ **Text doesn't match**: `Error: Page 5 text not found in Whisper segments. Similarity: 45%. Consider using matchingMode: "fuzzy"`

## Out of Scope
- Web UI implementation (CLI only for Phase 1)
- Visual editor with drag-and-drop page breaks
- Real-time audio/text alignment preview
- AI-powered re-segmentation for heavily rewritten transcripts (beyond fuzzy matching)
- Concept extraction integration (Step 3 of Smart Import)
- Multi-language UI translations for error messages
- Migration tool for converting legacy timestamp configs to text-based format
- Backward compatibility mode (text-based is NEW workflow, not replacement)
- Auto-suggestion of page break locations based on natural pauses
- Undo/redo functionality for page break editing
