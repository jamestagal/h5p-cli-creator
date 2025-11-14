# Requirements: Text-Based Page Breaks for Interactive Book Stories

**Date:** 2025-11-14
**Feature Type:** Enhancement / New Workflow
**Priority:** High
**Estimated Effort:** 4-6 hours

## Executive Summary

Replace the timestamp-based page definition approach with a text-based approach that allows educators to insert page break markers directly in the transcript. This solves fundamental audio/text alignment issues and integrates seamlessly with the Smart Import workflow (Phase 2: Review Text).

## Problem Statement

### Current Issues with Timestamp-Based Approach

**Problem 1: Audio/Text Misalignment**
- Timestamp ranges (e.g., 00:00-00:10) create audio segments
- >50% segment assignment rule determines which text appears on page
- These can diverge, causing audio to say different words than displayed text
- Example: Page 1 audio includes "de ma journée parfaite" but text doesn't show it

**Problem 2: Decimal Second Limitations**
- Whisper segments have precise boundaries (9.4s, 17.6s, 24.1s)
- Timestamp parser only accepts whole seconds (MM:SS or HH:MM:SS format)
- Rounding to whole seconds causes further misalignment
- Natural speech pauses don't align with nice round timestamps

**Problem 3: Difficult for Continuous Speech**
- Narrator speaks continuously with only 0.5-1 second gaps
- Choosing timestamp boundaries is error-prone guesswork
- No way to verify audio/text alignment until after generation
- Manual timestamp calculation is tedious and confusing

**Problem 4: Doesn't Fit Smart Import Workflow**
- Smart Import Step 2: "Review Text" is already required for all sources
- Adding page breaks during text review is natural workflow
- Timestamp approach requires separate, manual calculation step
- Breaks the flow: review text → calculate timestamps → come back to config

## Proposed Solution

### Text-Based Page Breaks with Whisper Segment Matching

**Core Concept:** Define pages by marking text, not by specifying timestamps.

**How It Works:**
1. Extract transcript from video (Whisper API)
2. User reviews transcript and inserts page break markers
3. System matches marked text to original Whisper segments
4. System derives timestamps from segment boundaries
5. Audio segments perfectly align with text (same source segments)

### Workflow

```
STEP 1: Extract Transcript
  youtube-extract-transcript config.yaml
  ↓
  Output: .youtube-cache/{VIDEO_ID}/full-transcript.txt

STEP 2: Review Text & Mark Pages (Educator)
  - Opens full-transcript.txt
  - Fixes any transcription errors
  - Inserts page break markers: ---
  - Adds page titles: # Page 1: Introduction
  - Saves as: full-transcript-edited.txt

STEP 3: Generate Story
  youtube-generate config.yaml --output story.yaml
  ↓
  System:
  - Loads full-transcript-edited.txt
  - Matches text to Whisper segments
  - Derives timestamps from segment boundaries
  - Creates audio segments
  - Generates story YAML + H5P package
```

## User Stories

### US1: Extract Transcript Only
**As an educator**
**I want to** extract just the transcript from a YouTube video
**So that** I can review and mark page breaks before generating the story

**Acceptance Criteria:**
- CLI command: `youtube-extract-transcript config.yaml`
- Outputs `full-transcript.txt` in human-readable format
- Each paragraph separated by blank line
- Text matches Whisper segments exactly

### US2: Mark Page Breaks in Text
**As an educator**
**I want to** insert page break markers in the transcript
**So that** I can define story pages based on natural narrative boundaries

**Acceptance Criteria:**
- Use `---` as page break delimiter (markdown horizontal rule)
- Use `# Page N: Title` for page titles
- Text between delimiters becomes page content
- Example format:
  ```markdown
  # Page 1: Introduction
  Ma journée parfaite. Je m'appelle Liam.
  ---
  # Page 2: Waking up
  Je me réveille sans réveil.
  ---
  ```

### US3: Generate Story from Marked Transcript
**As an educator**
**I want to** generate a story using my marked transcript
**So that** audio and text are perfectly aligned

**Acceptance Criteria:**
- CLI command: `youtube-generate config.yaml --output story.yaml`
- Config references edited transcript: `transcriptSource: ".youtube-cache/{ID}/full-transcript-edited.txt"`
- System matches text to Whisper segments
- System derives timestamps automatically
- Audio segments match text exactly (no misalignment)

### US4: Edit Text While Preserving Segments
**As an educator**
**I want to** fix transcription errors in the text
**So that** displayed text is correct while audio remains unchanged

**Acceptance Criteria:**
- Minor edits (typos, punctuation) are allowed
- System uses normalized comparison (lowercase, remove accents)
- Major rewrites trigger warning
- Educator confirms segment mapping if text differs significantly

## Technical Requirements

### TR1: TranscriptFileParser Service
- Parse edited transcript with page break markers
- Support markdown format: `---` delimiters and `# Page` titles
- Extract page structure: pageNumber, title, text
- Validate format and provide helpful error messages

### TR2: SegmentMatcher Service
- Match page text to Whisper segments using exact matching
- Support normalized comparison for minor edits
- Handle multi-segment pages (text spans multiple Whisper segments)
- Detect and report unmatched text (significant edits)

### TR3: TimestampDeriver Service
- Derive page timestamps from matched Whisper segments
- Use segment start/end times (supports decimals: 9.4s, 17.6s)
- Combine multiple segments for pages spanning boundaries
- Calculate exact audio duration for each page

### TR4: CLI Commands
- `youtube-extract-transcript config.yaml`
  - Outputs: `.youtube-cache/{VIDEO_ID}/full-transcript.txt`
  - Human-readable format with paragraph breaks

- `youtube-generate config.yaml --output story.yaml`
  - Reads: `config.transcriptSource` field
  - Matches text to segments
  - Derives timestamps
  - Generates story YAML + H5P package

### TR5: YAML Config Updates
- New field: `transcriptSource: string` (path to edited transcript)
- Deprecate: timestamp-based `pages` array (legacy mode)
- Dual-mode support:
  - If `transcriptSource` present → text-based mode
  - If `pages` with timestamps → legacy mode
  - If both → error

### TR6: Storage Format
- `.youtube-cache/{VIDEO_ID}/whisper-transcript.json` (raw Whisper output)
- `.youtube-cache/{VIDEO_ID}/full-transcript.txt` (human-readable, initial)
- `.youtube-cache/{VIDEO_ID}/full-transcript-edited.txt` (with page breaks)
- `.youtube-cache/{VIDEO_ID}/reviewed-transcript.json` (parsed structure)

## Integration with Smart Import Workflow

This feature implements **STEP 2: Review Text** from the Smart Import 4-Step Workflow:

### STEP 1: Upload Content
- User specifies video URL and time range
- System extracts transcript
- Output: `full-transcript.txt`

### STEP 2: Review Text (This Feature!)
- User reviews transcript
- Fixes transcription errors
- Inserts page break markers
- Saves edited version

### STEP 3: Review Concepts (Future)
- System extracts key terms/concepts
- User reviews and selects
- Used for vocabulary accordions, flashcards, etc.

### STEP 4: Generate Content
- System generates Interactive Book from marked transcript
- Audio/text perfectly aligned
- Translations generated
- H5P package created

## Benefits

### For Educators
✅ **Easier workflow** - Work with text instead of timestamps
✅ **Visual clarity** - See exactly what text appears on each page
✅ **Flexible editing** - Fix transcription errors naturally
✅ **No math required** - No timestamp calculations
✅ **Instant preview** - Text shows page structure immediately

### For System
✅ **Perfect alignment** - Audio and text always match
✅ **Decimal precision** - Use exact Whisper timestamps (9.4s, 17.6s)
✅ **Simpler code** - No >50% overlap calculations needed
✅ **Better errors** - Can validate text matching vs silent misalignment
✅ **Maintainable** - Single source of truth (Whisper segments)

### For Platform
✅ **Fits Smart Import** - Aligns with Step 2: Review Text
✅ **Universal approach** - Same workflow for PDF, audio, web scraping
✅ **Extensible** - Easy to add UI later (button-based page breaks)
✅ **Scalable** - Works for any video length or language

## Non-Goals (Out of Scope for Phase 1)

❌ Web UI implementation (CLI only for Phase 1)
❌ Visual editor with drag-and-drop
❌ Concept extraction integration
❌ Multi-language UI translations
❌ Migration tool for legacy configs
❌ Backward compatibility (text-based is new workflow, not replacement)

## Success Criteria

### MVP Success
1. ✅ Extract transcript to human-readable format
2. ✅ Parse markdown page break markers
3. ✅ Match text to Whisper segments (exact matching)
4. ✅ Derive timestamps from segment boundaries
5. ✅ Generate story with perfect audio/text alignment

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

## Constraints

- Must support all languages (French, Vietnamese, English, etc.)
- Must preserve Vietnamese diacritics and special characters (UTF-8)
- Must work with existing `.youtube-cache` directory structure
- Must not break existing YouTube extraction features (time ranges, translations)
- CLI-only for Phase 1 (Web UI is Phase 2)

## Dependencies

### Existing Services
- `YouTubeExtractor` - Audio/video download and trimming
- `TranscriptService` - Whisper API integration
- `TranscriptMatcher` - Segment assignment (will be simplified!)
- `AITranslationService` - Generate English translations

### New Services (To Build)
- `TranscriptFileParser` - Parse markdown transcript with page breaks
- `SegmentMatcher` - Match text to Whisper segments
- `TimestampDeriver` - Calculate timestamps from segments

## Edge Cases

1. **Empty page text**: Error - each page must have content
2. **Text doesn't match Whisper**: Warning + show diff, ask to confirm
3. **No page breaks**: Error - must have at least 1 page break
4. **Duplicate page titles**: Warning but allowed
5. **Very long pages** (>2 minutes): Warning but allowed
6. **Very short pages** (<5 seconds): Warning but allowed
7. **Text edited significantly**: Fuzzy matching fails → error with suggestions

## Open Questions

1. **Normalized matching tolerance**: How different can edited text be?
   - Decision: Start with exact matching, add fuzzy matching if needed

2. **Multiple spaces/line breaks**: How to handle whitespace normalization?
   - Decision: Normalize all whitespace to single space for matching

3. **Page numbering**: Auto-number or use markdown headings?
   - Decision: Parse `# Page N:` headings, auto-number if missing

4. **Error recovery**: What if text matching fails mid-story?
   - Decision: Fail fast with detailed error showing problematic page/text

## Future Enhancements (Phase 2+)

### Web UI for Page Breaks
- Rich text editor with [+ Insert Page Break] button
- Visual page preview showing audio duration
- Drag-and-drop to reorder pages
- Live preview of audio/text alignment

### Advanced Matching
- Fuzzy text matching for significant edits
- AI-powered re-segmentation if text heavily edited
- Visual diff showing Whisper vs edited text

### Concept Integration
- Extract key terms from reviewed transcript
- Generate vocabulary accordions automatically
- Support multi-content-type generation (flashcards, dialog cards, etc.)

## Reference Materials

### Related Specs
- `2025-11-12-youtube-story-extraction` - Original YouTube extraction feature
- `2025-11-14-youtube-extraction-improvements` - Audio segments in cache + time ranges
- `2025-11-10-concept-extraction-language-aware-ai` - Smart Import Step 3 planning

### Documentation
- Smart Import 4-Step Workflow: `agent-os/specs/2025-11-10-concept-extraction-language-aware-ai/planning/raw-idea.md`
- TranscriptMatcher implementation: `src/services/TranscriptMatcher.ts`
- Sentence boundary completion: `agent-os/specs/2025-11-14-youtube-extraction-improvements/sentence-boundary-completion.md`

### Test Cases
- French story config: `examples/youtube-stories/test-french-story-config.yaml`
- Vietnamese story config: `examples/youtube-stories/test-story-config.yaml`
- Whisper transcript sample: `.youtube-cache/Fhw6aoJ-2qE/whisper-transcript.json`
