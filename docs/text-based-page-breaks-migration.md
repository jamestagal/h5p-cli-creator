# Migration Guide: Timestamp Mode → Text-Based Page Breaks

This guide explains the differences between timestamp-based and text-based workflows for YouTube story extraction, and how to migrate existing configs.

## Overview

h5p-cli-creator supports two modes for defining story pages from YouTube videos:

1. **Timestamp Mode (Legacy)** - Manually specify start/end times for each page
2. **Text-Based Mode (New)** - Mark page breaks directly in transcript

Both modes remain supported. Text-based mode is recommended for new projects.

## Side-by-Side Comparison

### Timestamp Mode (Legacy)

**Config File:**
```yaml
title: "French Story"
language: fr

source:
  type: youtube
  url: "https://www.youtube.com/watch?v=abc123"
  startTime: "00:18"
  endTime: "03:23"

translation:
  enabled: true
  targetLanguage: en
  style: collapsible

pages:
  - title: "Introduction"
    startTime: "00:00"  # Manual timestamp calculation required
    endTime: "00:10"
    placeholder: true

  - title: "Morning Routine"
    startTime: "00:10"
    endTime: "00:25"
    placeholder: true

  - title: "Going Out"
    startTime: "00:25"
    endTime: "00:38"
    placeholder: true
```

**Workflow:**
1. Download video, extract transcript
2. Listen to audio, manually calculate timestamps
3. Update config with `pages` array
4. Run `youtube-extract config.yaml`
5. Hope audio/text alignment is correct (no way to verify until after generation)

**Problems:**
- Manual timestamp calculation is tedious
- >50% segment assignment rule causes audio/text misalignment
- Decimal second precision lost (Whisper uses 9.4s, config accepts MM:SS)
- No preview before expensive generation
- Difficult for continuous speech with minimal pauses

### Text-Based Mode (New)

**Config File:**
```yaml
title: "French Story"
language: fr

source:
  type: youtube
  url: "https://www.youtube.com/watch?v=abc123"
  startTime: "00:18"
  endTime: "03:23"

transcriptSource: ".youtube-cache/abc123/full-transcript-edited.txt"
matchingMode: "tolerant"

translation:
  enabled: true
  targetLanguage: en
  style: collapsible

# NO pages array - derived from transcript!
```

**Transcript File (full-transcript-edited.txt):**
```markdown
# Page 1: Introduction
Ma journée parfaite. Je m'appelle Liam.
---
# Page 2: Morning Routine
Je me réveille sans réveil. Je prends une douche chaude.
---
# Page 3: Going Out
Délicieux! Après le petit déjeuner, je sors.
---
```

**Workflow:**
1. Run `youtube-extract-transcript config.yaml` (extracts transcript)
2. Edit transcript, add page breaks using `---`
3. Run `youtube-validate-transcript config.yaml` (preview, zero cost)
4. Run `youtube-extract config.yaml` (generate story)
5. Perfect audio/text alignment guaranteed

**Benefits:**
- No timestamp calculations
- Perfect audio/text alignment (same source segments)
- Decimal precision preserved (9.4s, 17.6s)
- Validation preview before generation
- Natural workflow: review text → mark pages → generate

## Migration Steps

### Step 1: Choose Your Approach

**Option A: Start Fresh (Recommended)**
1. Run `youtube-extract-transcript config.yaml`
2. Edit generated transcript
3. Add `transcriptSource` to config
4. Remove `pages` array from config
5. Run `youtube-validate-transcript` then `youtube-extract`

**Option B: Convert Existing Config**
1. Run `youtube-extract-transcript config.yaml` (if not already done)
2. Map existing `pages` to transcript manually:
   - Listen to audio at each timestamp range
   - Find corresponding text in transcript
   - Add page break (`---`) at those points
3. Add `transcriptSource` to config
4. Remove `pages` array from config
5. Run `youtube-validate-transcript` then `youtube-extract`

### Step 2: Update Config File

**Before (Timestamp Mode):**
```yaml
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:10"
  - title: "Page 2"
    startTime: "00:10"
    endTime: "00:25"
```

**After (Text-Based Mode):**
```yaml
transcriptSource: ".youtube-cache/{VIDEO_ID}/full-transcript-edited.txt"
matchingMode: "tolerant"
# Remove pages array entirely
```

### Step 3: Create Edited Transcript

Run extraction if not already done:
```bash
node ./dist/index.js youtube-extract-transcript config.yaml
```

Edit `.youtube-cache/{VIDEO_ID}/full-transcript.txt`:
```markdown
# Page 1: Introduction
Ma journée parfaite. Je m'appelle Liam.
---
# Page 2: Morning Routine
Je me réveille sans réveil. Je prends une douche chaude.
---
```

Save as `full-transcript-edited.txt` in same directory.

### Step 4: Validate Before Generating

**Always run validation first:**
```bash
node ./dist/index.js youtube-validate-transcript config.yaml
```

Check output for:
- Format validation (page breaks correct?)
- Page durations (any too short/long?)
- Match confidence (text edited significantly?)

Example validation output:
```
✅ Format valid: 3 pages found
✅ All page breaks formatted correctly
✅ All pages have content

📊 Story Structure:
  Page 1: Introduction (9.4s) - ✅ 100% match
  Page 2: Morning Routine (14.7s) - ✅ 100% match
  Page 3: Going Out (8.2s) - ✅ 100% match

Total duration: 32.3 seconds
```

### Step 5: Generate Story

```bash
node ./dist/index.js youtube-extract config.yaml --output story.yaml
```

System will:
- Detect text-based mode (via `transcriptSource`)
- Parse transcript with page breaks
- Match text to Whisper segments
- Derive timestamps automatically
- Generate story with perfect audio/text alignment

## Matching Modes Explained

When you edit the transcript (fix typos, merge sentences, etc.), the system needs to match your edited text back to the original Whisper segments. Choose the matching mode based on how much you've edited:

### Strict Mode (`matchingMode: "strict"`)
**Use when:** Transcript is unedited or only whitespace/punctuation fixes
**Threshold:** 100% exact match after normalization
**Tolerates:**
- Extra spaces, newlines
- Punctuation differences
**Does NOT tolerate:**
- Word changes
- Additions or deletions

```yaml
matchingMode: "strict"
```

### Tolerant Mode (`matchingMode: "tolerant"`) - **DEFAULT**
**Use when:** Fixing typos, merging sentences, minor pedagogical edits
**Threshold:** 85%+ token similarity (Jaccard index)
**Tolerates:**
- Small word changes
- Minor reordering
- Small additions/deletions
**Recommended for:** Most use cases

```yaml
matchingMode: "tolerant"  # Or omit - this is default
```

### Fuzzy Mode (`matchingMode: "fuzzy"`)
**Use when:** Heavily editing text while preserving meaning
**Threshold:** 60%+ token similarity
**Tolerates:**
- Significant rewrites
- Paraphrasing
**Generates warnings:** For low-confidence matches

```yaml
matchingMode: "fuzzy"
```

**How Similarity Works:**
- System uses Jaccard similarity: `intersection(tokens) / union(tokens)`
- Example: "Je me réveille" vs "Je me suis réveillé"
  - Tokens 1: [je, me, réveille]
  - Tokens 2: [je, me, suis, réveillé]
  - Intersection: [je, me] = 2
  - Union: [je, me, réveille, suis, réveillé] = 5
  - Similarity: 2/5 = 40% (below fuzzy threshold, would fail)

## Troubleshooting Migration

### Problem: "Page text not found in Whisper segments"
**Cause:** Edited text differs too much from Whisper transcript.
**Solutions:**
1. Use `matchingMode: "fuzzy"` in config
2. Revert text closer to original Whisper output
3. Run `youtube-validate-transcript` to see exact similarity scores

### Problem: "Config validation error: Cannot use both transcriptSource and pages"
**Cause:** Config has both `transcriptSource` field AND `pages` array with timestamps.
**Solution:** Remove `pages` array from config (text-based mode derives timestamps automatically).

### Problem: Audio/text still misaligned after migration
**Cause:** Likely edited transcript doesn't match Whisper segments.
**Debug:**
1. Run `youtube-validate-transcript` to check match confidence
2. Look for pages with <100% confidence
3. Compare "Whisper transcript" vs "Your edited text" in error messages
4. Adjust transcript to be closer to Whisper output

### Problem: "No page breaks (---) found in transcript"
**Cause:** Forgot to add page break markers in edited transcript.
**Solution:** Add `---` (triple dash) on its own line between pages.

## Best Practices for Migration

1. **Start with unedited transcript:**
   - Run `youtube-extract-transcript` first
   - Review generated transcript before editing
   - Only fix clear transcription errors

2. **Use tolerant mode by default:**
   - Handles most editing scenarios
   - Switch to strict/fuzzy only if needed

3. **Validate before generating:**
   - Always run `youtube-validate-transcript` first
   - Check match confidence scores
   - Resolve warnings before full generation

4. **Test with small story first:**
   - Migrate one story as proof-of-concept
   - Verify audio/text alignment in H5P package
   - Apply learnings to remaining stories

5. **Preserve UTF-8 encoding:**
   - Ensure text editor saves as UTF-8
   - Critical for Vietnamese/French diacritics
   - Test with non-ASCII characters

## Backward Compatibility

**Key Point:** Both modes remain fully supported. You are NOT required to migrate.

- **Timestamp mode** continues working with existing configs
- **Text-based mode** is opt-in via `transcriptSource` field
- **No breaking changes** to existing workflows
- **Choose based on project needs:**
  - Use timestamp mode if existing config works well
  - Use text-based mode for new projects or when audio/text misalignment is problematic

## When to Use Each Mode

### Use Timestamp Mode When:
- Existing config already works perfectly
- Very simple story with clear timestamp boundaries
- Don't want to edit transcripts
- Working with pre-defined time ranges

### Use Text-Based Mode When:
- Starting a new YouTube story project
- Experiencing audio/text misalignment issues
- Want to edit transcripts for pedagogical reasons
- Prefer working with text over timestamps
- Need perfect audio/text alignment
- Story has continuous speech with minimal pauses

## Example: Complete Migration

**Original Config (Timestamp Mode):**
```yaml
title: "Vietnamese Morning Story"
language: vi
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=Fhw6aoJ-2qE"
translation:
  enabled: true
  targetLanguage: en
  style: collapsible
pages:
  - title: "Waking Up"
    startTime: "00:00"
    endTime: "00:12"
  - title: "Morning Routine"
    startTime: "00:12"
    endTime: "00:28"
  - title: "Breakfast"
    startTime: "00:28"
    endTime: "00:45"
```

**Migrated Config (Text-Based Mode):**
```yaml
title: "Vietnamese Morning Story"
language: vi
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=Fhw6aoJ-2qE"
transcriptSource: ".youtube-cache/Fhw6aoJ-2qE/full-transcript-edited.txt"
matchingMode: "tolerant"
translation:
  enabled: true
  targetLanguage: en
  style: collapsible
```

**Edited Transcript (full-transcript-edited.txt):**
```markdown
# Page 1: Waking Up
Trời ơi! Tôi đã quên mang theo chiếc ô.
---
# Page 2: Morning Routine
Tôi thức dậy lúc sáu giờ sáng mỗi ngày.
---
# Page 3: Breakfast
Sau đó, tôi ăn sáng với gia đình.
---
```

**Migration Commands:**
```bash
# Step 1: Extract transcript (if not already done)
node ./dist/index.js youtube-extract-transcript config.yaml

# Step 2: Edit transcript (manual step in text editor)
# Add page breaks (---) and titles (# Page N:)

# Step 3: Validate format
node ./dist/index.js youtube-validate-transcript config.yaml

# Step 4: Generate story
node ./dist/index.js youtube-extract config.yaml --output story.yaml
```

## Questions?

For more details:
- See `CLAUDE.md` section "Text-Based Page Breaks Workflow"
- See `examples/youtube-stories/text-based-example.yaml`
- See `examples/youtube-stories/full-transcript-example.txt`
