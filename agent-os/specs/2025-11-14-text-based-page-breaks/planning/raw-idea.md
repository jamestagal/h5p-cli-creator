# Raw Idea: Text-Based Page Breaks for Interactive Book Stories

**Feature Name**: Text-Based Page Breaks for Interactive Book Stories

**Brief Description**:
Replace the timestamp-based page definition approach with a text-based workflow where educators insert page break markers directly in the transcript. This solves fundamental audio/text alignment issues discovered during French story testing and integrates seamlessly with the Smart Import Step 2: Review Text workflow.

## The Problem

During testing of YouTube story extraction with a French learning video, we discovered critical issues with the timestamp-based approach:

1. **Audio/Text Misalignment**: Timestamp ranges create audio segments, but the >50% segment assignment rule can assign different text to the page, causing audio to say words that aren't displayed.

2. **Decimal Second Limitations**: Whisper provides precise timestamps (9.4s, 17.6s), but our parser only accepts whole seconds, forcing rounding that causes further misalignment.

3. **Difficult for Continuous Speech**: When the narrator speaks continuously with only 0.5-1 second gaps, choosing timestamp boundaries becomes error-prone guesswork.

**Example of the problem:**
- Config says Page 1: 00:00 to 00:10
- Whisper Segment 1: 0-9.4s ("...vous parler")
- Whisper Segment 2: 9.4-17.6s ("de ma journée parfaite...")
- Result: Segment 2 is 92.7% in Page 2, so it's assigned there
- **Audio/Text Mismatch**: Page 1 audio is only 9.4s and missing "de ma journée parfaite"

## The Solution

**Let users define pages by marking text, not timestamps.**

### User Workflow

1. **Extract transcript**:
   ```bash
   youtube-extract-transcript config.yaml
   ```
   Output: `.youtube-cache/{VIDEO_ID}/full-transcript.txt`

2. **Mark page breaks** (educator edits file):
   ```markdown
   # Page 1: Introduction
   Ma journée parfaite. Je m'appelle Liam. J'ai 24 ans.
   Aujourd'hui je veux vous parler de ma journée parfaite.
   ---
   # Page 2: Waking up
   Je me réveille sans réveil. Je me sens plein d'énergie.
   ---
   # Page 3: Morning routine
   Je prends une douche chaude puis je prépare le petit déjeuner.
   ---
   ```

3. **Generate story**:
   ```bash
   youtube-generate config.yaml --output story.yaml
   ```
   System automatically:
   - Matches marked text to Whisper segments
   - Derives exact timestamps from segment boundaries
   - Creates audio segments that perfectly match text
   - Generates story YAML + H5P package

### Why This Works

✅ **Perfect Alignment**: Audio and text derive from the same Whisper segments
✅ **Decimal Precision**: Uses Whisper's exact timestamps (9.4s, 17.6s, etc.)
✅ **User-Friendly**: Working with text is more intuitive than timestamps
✅ **Fits Smart Import**: This IS Step 2: Review Text from the workflow
✅ **Universal**: Same approach works for PDF, audio, web scraping sources

## Integration with Smart Import Workflow

This feature implements **STEP 2: Review Text** from the 4-Step Smart Import:

**STEP 1: Upload Content** → Extract transcript
**STEP 2: Review Text** → Fix errors + mark page breaks ← **THIS FEATURE**
**STEP 3: Review Concepts** → Extract terms (future)
**STEP 4: Generate Content** → Create Interactive Book

**Key insight**: The same "Review Text" step is needed for ALL source types (PDF, video, audio, web). For Interactive Books specifically, we just add page break markers during this step.

## Technical Approach

### New Services

1. **TranscriptFileParser**: Parse markdown transcript with `---` delimiters and `# Page` headings
2. **SegmentMatcher**: Match page text to original Whisper segments (exact matching)
3. **TimestampDeriver**: Calculate page start/end times from matched segments

### Config Format

```yaml
title: "My perfect day"
language: fr

source:
  type: youtube
  url: "https://www.youtube.com/watch?v=Fhw6aoJ-2qE"
  startTime: "00:18"
  endTime: "03:23"

# NEW: Reference edited transcript instead of defining pages
transcriptSource: ".youtube-cache/Fhw6aoJ-2qE/full-transcript-edited.txt"

translation:
  enabled: true
  targetLanguage: en
  style: collapsible
```

### File Structure

```
.youtube-cache/Fhw6aoJ-2qE/
├── trimmed-audio.mp3               # Extracted audio segment
├── whisper-transcript.json          # Raw Whisper API output
├── full-transcript.txt              # Human-readable (initial)
├── full-transcript-edited.txt       # With page breaks (user edits)
├── reviewed-transcript.json         # Parsed structure
└── audio-segments/
    ├── page1.mp3                    # Generated from matched segments
    ├── page2.mp3
    └── ...
```

## Scope for Phase 1 (CLI Only)

**In Scope:**
- Extract transcript to human-readable format
- Parse markdown page break markers (`---`, `# Page N:`)
- Match text to Whisper segments (exact matching)
- Derive timestamps from segment boundaries
- Generate story with perfect audio/text alignment
- CLI commands: `youtube-extract-transcript`, `youtube-generate`

**Out of Scope (Future Phases):**
- Web UI with visual editor
- Button-based page break insertion
- Fuzzy text matching for heavily edited transcripts
- Concept extraction integration
- Migration tool for legacy timestamp configs

## Success Metrics

1. **French story test**: Audio and text perfectly aligned (no mismatches)
2. **Vietnamese story test**: No regression in quality
3. **User experience**: Can create 12-page story in < 15 minutes
4. **Code quality**: Simpler than timestamp approach (no >50% calculations)
5. **Extensibility**: Easy to add web UI later

## Why Deprecate Timestamp Mode?

The text-based approach is **fundamentally superior**:

1. ❌ **Timestamp mode**: Audio segments and text segments can diverge
2. ✅ **Text mode**: Audio and text derive from identical Whisper segments

3. ❌ **Timestamp mode**: Limited to whole seconds (parser limitation)
4. ✅ **Text mode**: Supports decimal precision from Whisper

5. ❌ **Timestamp mode**: Requires manual calculation and guesswork
6. ✅ **Text mode**: User works with text directly (more intuitive)

7. ❌ **Timestamp mode**: Separate step outside Smart Import workflow
8. ✅ **Text mode**: IS the Smart Import Step 2: Review Text

**Decision**: Make text-based the **new recommended workflow** for Interactive Books. Timestamp configs become legacy (no migration needed - new workflow, new configs).

## Estimated Effort

**Phase 1 Implementation**: 4-6 hours
- TranscriptFileParser: 1-2 hours
- SegmentMatcher: 1-2 hours
- TimestampDeriver: 1 hour
- CLI integration: 1 hour
- Testing & validation: 1-2 hours

**Future Web UI**: 8-12 hours (separate phase)

## Next Steps

1. Create comprehensive spec.md using spec-writer agent
2. Create tasks.md breaking down implementation
3. Implement Phase 1 (CLI-based workflow)
4. Test with French and Vietnamese stories
5. Document new workflow in CLAUDE.md
6. Plan Phase 2 (Web UI) based on Phase 1 learnings
