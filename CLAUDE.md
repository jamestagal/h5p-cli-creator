# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

h5p-cli-creator is a command-line utility for mass creating H5P content packages from CSV input files. It downloads H5P content type packages from the H5P Hub, populates them with data from CSV files, and outputs `.h5p` files. Currently supports **Flashcards**, **Dialog Cards**, and **Interactive Book** content types.

## Agent OS Integration

This project integrates with Agent OS for product planning and feature development:

- **Product Documentation**: [agent-os/product/](agent-os/product/) contains mission.md, roadmap.md, and tech-stack.md
- **Specs**: Feature specifications are tracked in `agent-os/specs/` when using Agent OS workflows
- **Analysis**: [docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md](docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md) provides detailed analysis for extending to Interactive Book content type with implementation examples and timeline estimates
- **Use `/shape-spec` or `/write-spec`** to create feature specifications following Agent OS patterns

## Development Commands

### Building and Running
```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript to ./dist
node ./dist/index.js --help                    # General help
node ./dist/index.js flashcards --help         # Flashcards command help
node ./dist/index.js dialogcards --help        # Dialog cards command help
node ./dist/index.js interactivebook --help    # Interactive Book command help
```

### Example Usage
```bash
# Create flashcards from CSV
node ./dist/index.js flashcards ./tests/flash1.csv ./output.h5p -l=de -t="My Flashcards" --description="Enter translations"

# Create dialog cards from CSV
node ./dist/index.js dialogcards ./tests/dialog1.csv ./output.h5p -l=de -n="My Cards" -m="repetition"

# Create interactive book from CSV
node ./dist/index.js interactivebook ./tests/book1.csv ./output.h5p -l=en -t="My Story Book"

# Batch processing multiple files
for file in ./input/*.csv; do
  output="${file%.csv}.h5p"
  node ./dist/index.js flashcards "$file" "$output" -l=en
done
```

### Testing

Currently there is no automated test suite. Testing is done manually:

1. **Build**: `npm run build`
2. **Test with sample CSVs**: Use files in [tests/](tests/) directory (flash1.csv, dialog1.csv, book1.csv)
3. **Validate output**: Upload generated .h5p files to an H5P platform and verify functionality

When adding new content types, create corresponding test CSV files in the tests/ directory.

## Text-Based Page Breaks Workflow for YouTube Stories

h5p-cli-creator supports extracting Interactive Book stories from YouTube videos using a text-based workflow that ensures perfect audio/text alignment. Instead of manually calculating timestamps, educators mark page breaks directly in the transcript.

### Why Text-Based Mode?

**Problems with Timestamp-Based Approach:**
- Audio/text misalignment due to >50% segment assignment rule
- Decimal second limitations (Whisper uses 9.4s, 17.6s but config accepts MM:SS)
- Difficult for continuous speech with minimal pauses
- Manual timestamp calculation is tedious and error-prone

**Benefits of Text-Based Mode:**
- Perfect audio/text alignment (same source segments)
- Natural workflow: review text → mark pages → generate
- No timestamp calculations required
- Supports decimal precision from Whisper
- Easy to edit transcripts while preserving audio boundaries

### Three-Step Workflow

#### Step 1: Extract Transcript

Extract the transcript from a YouTube video for review:

```bash
node ./dist/index.js youtube-extract-transcript config.yaml
```

This command:
- Downloads audio from YouTube video
- Transcribes with Whisper API (or uses cache)
- Saves human-readable transcript to `.youtube-cache/{VIDEO_ID}/full-transcript.txt`
- Each Whisper segment separated by blank line

**Output location:** `.youtube-cache/{VIDEO_ID}/full-transcript.txt`

#### Step 2: Edit Transcript and Mark Page Breaks

Open the transcript file and:
1. Fix any transcription errors (typos, formatting)
2. Insert page breaks using `---` (triple dash)
3. Add page titles using `# Page N: Title` format
4. Save as `full-transcript-edited.txt` in same directory

**Markdown Format:**
```markdown
# Page 1: Introduction
Ma journée parfaite. Je m'appelle Liam.
---
# Page 2: Morning Routine
Je me réveille sans réveil.
---
# Page 3: Breakfast
Je prends une douche chaude puis je prépare le petit déjeuner.
---
```

**Format Rules:**
- `---` on its own line = page break
- `# Page N: Title` = page heading (optional, auto-numbered if omitted)
- Text between delimiters = page content
- Multiple paragraphs within a page are preserved
- UTF-8 encoding preserves diacritics (Vietnamese, French, etc.)

#### Step 3: Validate (Optional but Recommended)

Before generating, validate the transcript format:

```bash
node ./dist/index.js youtube-validate-transcript config.yaml
```

This command:
- Validates page break format
- Shows page structure preview with durations
- Reports match confidence for each page
- Displays warnings for edge cases (short pages, low similarity)
- **Zero cost** (no H5P generation, just validation)

**Example output:**
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

#### Step 4: Generate Story

Generate the Interactive Book from the marked transcript:

```bash
node ./dist/index.js youtube-extract config.yaml --output story.yaml
```

This command:
- Detects text-based mode (config has `transcriptSource` field)
- Parses edited transcript with page breaks
- Matches page text to Whisper segments
- Derives timestamps from segment boundaries
- Splits audio at precise timestamps
- Generates translations (if enabled)
- Creates Interactive Book YAML + H5P package

### Config File Structure

**Text-Based Mode Config:**

```yaml
title: "French Story with Text-Based Pages"
language: fr

source:
  type: youtube
  url: "https://www.youtube.com/watch?v=abc123"
  startTime: "00:18"  # Optional: Skip intro
  endTime: "03:23"    # Optional: Skip outro

transcriptSource: ".youtube-cache/abc123/full-transcript-edited.txt"
matchingMode: "tolerant"  # or "strict", "fuzzy"

translation:
  enabled: true
  targetLanguage: en
  style: collapsible
```

**Key Fields:**
- `transcriptSource`: Path to edited transcript with page breaks
- `matchingMode`: Text matching algorithm (see below)
- **Do NOT include** `pages` array with timestamps (conflicting modes error)

### Matching Modes

The system supports three matching modes for handling edited text:

#### Strict Mode (`matchingMode: "strict"`)
- **Threshold:** 100% exact match after normalization
- **Use when:** Transcript is unedited or only whitespace/punctuation fixes
- **Tolerates:** Extra spaces, newlines, punctuation differences
- **Does NOT tolerate:** Word changes, additions, deletions

```yaml
matchingMode: "strict"
```

#### Tolerant Mode (`matchingMode: "tolerant"`) - **DEFAULT**
- **Threshold:** 85%+ token similarity (Jaccard index)
- **Use when:** Fixing typos, merging sentences, minor pedagogical edits
- **Tolerates:** Small word changes, reordering, minor additions/deletions
- **Recommended for:** Most use cases

```yaml
matchingMode: "tolerant"  # Or omit - this is default
```

#### Fuzzy Mode (`matchingMode: "fuzzy"`)
- **Threshold:** 60%+ token similarity
- **Use when:** Heavily editing text while preserving meaning
- **Tolerates:** Significant rewrites, paraphrasing
- **Generates warnings:** For low-confidence matches

```yaml
matchingMode: "fuzzy"
```

**How Matching Works:**
- System uses **sequential matching**: Each page matches segments AFTER previous page's last matched segment
- Prevents duplicate segment assignment
- Critical for language learning repetition drills (1st "Bonjour" → 2nd "Bonjour" → 3rd "Bonjour")
- Uses Jaccard similarity: `intersection(tokens) / union(tokens)`
- Sliding window search: Tries 1 segment, then 2, then 3+ to find best multi-segment match

### Special Use Cases

#### Repetition Drills (Language Learning)

For videos with repeated phrases, sequential matching ensures each repetition gets its own unique segment:

```markdown
# Page 1: First Repetition
Bonjour
---
# Page 2: Second Repetition
Bonjour
---
# Page 3: Student Turn
Répétez: Bonjour
---
```

Each "Bonjour" page maps to a different Whisper segment chronologically.

#### Multi-Segment Pages

Pages spanning multiple Whisper segments work automatically:

```markdown
# Page 1: Morning Routine
Je prends une douche chaude puis je prépare le petit déjeuner.
Je mange des crêpes avec du miel et bois du jus d'orange frais.
Délicieux! Après le petit déjeuner, je sors.
---
```

System finds all segments containing this text and derives timestamps from first segment start to last segment end.

#### Trimming Intro/Outro

Use `source.startTime` and `source.endTime` to skip intro music, "hey guys" intros, outro music, end screens:

```yaml
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=abc123"
  startTime: "00:18"  # Skip 18-second intro
  endTime: "03:23"    # Stop at 3:23, skip outro
```

**Important:** Extract transcript AFTER trimming. Text-based pages work on trimmed audio only.

### Troubleshooting

#### Error: "No page breaks (---) found in transcript"
**Cause:** Transcript doesn't have any `---` delimiters.
**Solution:** Add at least one `---` between pages.

#### Error: "Page N has no content between delimiters"
**Cause:** Empty page (two `---` with nothing between).
**Solution:** Add content to the page or remove extra delimiter.

#### Error: "Page text not found in Whisper segments. Similarity: X%"
**Cause:** Edited text differs too much from Whisper transcript for current matching mode.
**Solutions:**
1. Use `matchingMode: "fuzzy"` in config (tolerates 60%+ similarity)
2. Revert text closer to Whisper output
3. Run `youtube-validate-transcript` to preview matching before generation

#### Warning: "Page N is very short (X seconds)"
**Cause:** Page duration < 5 seconds.
**Impact:** May feel rushed for learners.
**Solution:** Consider combining with adjacent pages.

#### Warning: "Page N is very long (X seconds, >2 minutes)"
**Cause:** Page duration > 120 seconds.
**Impact:** May be too long for single page in learning context.
**Solution:** Consider splitting into multiple pages.

#### Warning: "Page N text similarity X% (minor edits detected)"
**Cause:** Match confidence < 100% in tolerant mode.
**Impact:** Text was edited (not exact match to Whisper).
**Action:** Review page to ensure edits are intentional.

### Best Practices

1. **Always validate first:** Run `youtube-validate-transcript` before `youtube-extract` to catch format errors early (zero cost)
2. **Trim intro/outro carefully:** Set `source.startTime` and `source.endTime` BEFORE extracting transcript
   - **CRITICAL:** Start time precision is essential for perfect audio/text alignment
   - Listen to the video at your chosen startTime to verify the EXACT first word
   - Skip ALL intro content (music, "hey guys", instructional words, questions)
   - Even a 1-second offset causes ALL Whisper segment boundaries to misalign
   - This cascades through every page, causing audio/text splits throughout the story
   - If Page 1 audio doesn't match text, try adjusting startTime by ±1 second and re-extract
3. **Use tolerant mode:** Default matching mode handles most editing scenarios
4. **Preview page structure:** Check validation output for durations and confidence
5. **Preserve UTF-8:** Ensure editor saves as UTF-8 for Vietnamese/French diacritics
6. **Sequential repetitions:** For language drills, let sequential matching handle repeated phrases automatically

### File Storage Structure

Text-based mode uses this cache structure:

```
.youtube-cache/{VIDEO_ID}/
├── audio.mp3                      # Downloaded audio (trimmed if time range specified)
├── whisper-transcript.json        # Raw Whisper API response (cached)
├── full-transcript.txt            # Human-readable initial transcript
├── full-transcript-edited.txt    # Edited version with page breaks (you create this)
├── translations.json               # Cached English translations (used by both text-based and timestamp-based workflows)
├── cache-metadata.json            # Cache metadata (video duration, Whisper model, costs, etc.)
└── audio-segments/
    ├── page1.mp3                  # Generated audio segments
    ├── page2.mp3
    └── ...
```

**Note on translations.json:** This file is NOT specific to text-based mode. It's generated by the AITranslationService and used by BOTH text-based and timestamp-based workflows to cache English translations and avoid redundant API calls. The timestamp-based WORKFLOW CODE was replaced by text-based mode, but timestamp-based CONFIGS still work for backward compatibility.

### Backward Compatibility

Text-based mode is NEW workflow, not a replacement:
- **Timestamp mode** (legacy): Still works with `pages[].startTime/endTime` in config
- **Text-based mode** (new): Works with `transcriptSource` field in config
- **Error if both:** System prevents mixing modes in same config

### Example Configs

See `examples/youtube-stories/text-based-example.yaml` for complete config example.

See `examples/youtube-stories/full-transcript-example.txt` for transcript format example.



## Multi-Language AI Content Generation

h5p-cli-creator supports generating AI-powered educational content in multiple languages (Vietnamese, French, German, Spanish, etc.) with optional scaffolding for language learners.

### Key Features

#### 1. Target Language Configuration

Generate educational content (questions, answers, explanations) in any language:

```yaml
aiConfig:
  targetLanguage: "vi"  # ISO 639-1 code (vi=Vietnamese, fr=French, de=German, etc.)
```

#### 2. Instructional Language (Beginner Scaffolding)

Provide task instructions in a different language to support language learners:

```yaml
aiConfig:
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English (scaffolding)
```

**Use Case:** Beginner learners need instructions in their first language to understand what to do, but practice content in the target language.

**Generated Output:**
- Task instructions: "Choose the correct answer" (English)
- Questions: "Peter đi đâu?" (Vietnamese)
- Answers: "Quán cà phê", "Nhà hàng" (Vietnamese)

#### 3. Translation Support

Add English translations for vocabulary support:

```yaml
aiConfig:
  targetLanguage: "vi"
  instructionalLanguage: "en"
  includeTranslations: true      # Add English translations in parentheses
```

**Generated Output:**
- "Xin chào (Hello)"
- "Cảm ơn (Thank you)"
- "Quán cà phê (Cafe)"

### Configuration Patterns

#### Pattern 1: Beginner Scaffolding

For lower beginner language learners who need first-language instructions:

```yaml
title: "Peter learns Trời ơi!"
language: vi

aiConfig:
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English
  includeTranslations: true      # Add translations
  targetAudience: "esl-beginner"

chapters:
  - title: "Vietnamese Greetings"
    content:
      - type: ai-singlechoiceset
        title: "Greeting Quiz"
        prompt: "Create questions about Vietnamese greetings"
        questionCount: 5
```

**Example:** `examples/multi-language/vietnamese-beginner.yaml`

#### Pattern 2: Full Immersion

For advanced learners ready for monolingual content:

```yaml
title: "La Culture Française"
language: fr

aiConfig:
  targetLanguage: "fr"           # All content in French
  includeTranslations: false     # No translations (immersion)
  targetAudience: "high-school"

chapters:
  - title: "La Gastronomie"
    content:
      - type: ai-text
        prompt: "Décrivez la cuisine française"
```

**Note:** When `instructionalLanguage` is not specified, it defaults to `targetLanguage` (monolingual mode).

**Example:** `examples/multi-language/french-immersion.yaml`

#### Pattern 3: Bilingual Content

For intermediate learners comfortable with target language instructions but needing vocabulary support:

```yaml
aiConfig:
  targetLanguage: "vi"
  instructionalLanguage: "vi"    # Same as target (monolingual instructions)
  includeTranslations: true      # But add translations for vocabulary
```

### Configuration Cascade

Language settings cascade from book → chapter → item levels:

```yaml
# Book level (applies to all content)
aiConfig:
  targetLanguage: "vi"

chapters:
  # Chapter level (overrides book for this chapter)
  - title: "Chapter 1"
    aiConfig:
      targetLanguage: "fr"    # This chapter in French
    content:
      # Item level (overrides chapter and book)
      - type: ai-text
        aiConfig:
          targetLanguage: "de"  # This item in German
        prompt: "Write a story"
```

**Resolution Order (highest to lowest priority):**
1. Item-level `aiConfig.targetLanguage`
2. Chapter-level `aiConfig.targetLanguage`
3. Book-level `aiConfig.targetLanguage`
4. Auto-detected from `BookDefinition.language`
5. Default to English

### Auto-Detection from Book Language

When `targetLanguage` is not specified, it auto-detects from the book's `language` field:

```yaml
title: "Vietnamese Story"
language: vi  # Auto-detected as targetLanguage

# No aiConfig needed - will default to Vietnamese content
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write a story"  # Generated in Vietnamese
```

### Supported Languages

Common ISO 639-1 language codes:

| Code | Language   | Example Usage                          |
|------|------------|----------------------------------------|
| `vi` | Vietnamese | Language learning, cultural content    |
| `fr` | French     | Literature, culture, language courses  |
| `de` | German     | Language learning, technical content   |
| `es` | Spanish    | Language courses, cultural studies     |
| `ja` | Japanese   | Language learning, cultural content    |
| `ko` | Korean     | Language courses, K-pop culture        |
| `zh` | Chinese    | Language learning, history             |
| `ar` | Arabic     | Language courses, cultural studies     |
| `pt` | Portuguese | Language learning, Brazilian culture   |
| `en` | English    | Default (no special configuration)     |

**Note:** The system accepts any ISO 639-1 code. Unknown codes are passed through with a warning but do not block generation.

### JSON Error Handling and Retry Logic

The system includes robust JSON error handling to reduce AI generation failures from ~20% to <5%:

#### Automatic Retry with Exponential Backoff

- **Maximum 3 retry attempts** before falling back to error content
- **Exponential backoff:** 1s, 2s, 4s between attempts
- **Progressive degradation:** Increases `max_tokens` if truncation detected
- **Provider-specific handling:** Different strategies for Gemini vs Claude

#### Verbose Logging

Run with `--verbose` flag to see detailed debugging information:

```bash
node dist/index.js interactivebook-ai config.yaml output.h5p --verbose
```

**Verbose output includes:**
- Raw AI responses (first 500 characters)
- Processing steps (strip markdown → extract JSON → validate → parse)
- Retry attempts with reasons
- Truncation detection
- Final decision (success/retry/fallback)

**Example verbose output:**
```
[VERBOSE] AI Provider: gemini-2.5-flash
[VERBOSE] Raw response (first 500 chars): Here's your quiz:
```json
{
  "questions": [
    {"text": "What is..."}
[VERBOSE] After stripMarkdown: {"questions": [{"text": "What is..."}]}
[VERBOSE] Validation: Complete JSON ✓
[VERBOSE] Parse: Success ✓
```

#### Error Recovery Strategies

1. **Truncation errors:** Automatically increase `max_tokens` (2048 → 4096 → 8192)
2. **Malformed JSON:** Retry with same parameters (transient error)
3. **Markdown wrapping:** Automatically strip code fences and explanatory text
4. **Final fallback:** Generate valid H5P structure with actionable error message

### Backward Compatibility

Existing YAML configs without language fields continue working unchanged:

```yaml
# Legacy config (no language fields)
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"

# Defaults to English content (100% backward compatible)
```

### Best Practices

#### For Beginner Learners

- Use English instructions (`instructionalLanguage: "en"`) to reduce cognitive load
- Enable translations (`includeTranslations: true`) for vocabulary support
- Start with `esl-beginner` audience for appropriate difficulty
- Provide cultural context in accordion panels

#### For Intermediate Learners

- Use target language instructions (no `instructionalLanguage` specified)
- Optionally include translations for new vocabulary
- Mix scaffolding approaches across different chapters
- Gradually reduce translation support as learners progress

#### For Advanced Learners

- Full immersion mode (`includeTranslations: false`)
- No instructional scaffolding (monolingual)
- Use `high-school` or `college` audience for complexity
- Focus on cultural and contextual understanding

### Troubleshooting

#### AI Generates Wrong Language

**Symptom:** Content appears in English despite `targetLanguage: "vi"`

**Solutions:**
1. Verify configuration cascade (check item/chapter/book levels)
2. Run with `--verbose` to see system prompt injection
3. Check if `targetLanguage` is misspelled or invalid
4. Ensure AI provider supports target language

#### Translations Not Appearing

**Symptom:** `includeTranslations: true` but no English translations in output

**Solutions:**
1. Verify `targetLanguage` is NOT "en" (translations only for non-English)
2. Check if AI provider followed instructions (use `--verbose`)
3. Verify configuration cascade didn't override at item level

#### JSON Parse Errors

**Symptom:** "AI generation failed" errors frequently

**Solutions:**
1. Run with `--verbose` to see retry attempts and raw responses
2. Check API key and quota status
3. Verify network connectivity to AI provider
4. Review logs for truncation or malformed JSON patterns
5. Consider reducing `questionCount` or content complexity

**Success Rate:** With retry logic and error handling, JSON parse success rate should be >95%.

### Example Files

- **Beginner Scaffolding:** `examples/multi-language/vietnamese-beginner.yaml`
- **Full Immersion:** `examples/multi-language/french-immersion.yaml`
- **Documentation:** `examples/multi-language/README.md`

### Related Specifications

- **Full Specification:** `agent-os/specs/2025-11-16-multi-language-ai-robust-json/spec.md`
- **Requirements:** `agent-os/specs/2025-11-16-multi-language-ai-robust-json/planning/requirements.md`
- **Task Breakdown:** `agent-os/specs/2025-11-16-multi-language-ai-robust-json/tasks.md`

## Architecture

### Core Components

1. **Entry Point** ([index.ts](src/index.ts))
   - Uses `yargs` for CLI command routing
   - Registers command modules (FlashcardsModule, DialogCardsModule, InteractiveBookModule)
   - Each content type is a separate yargs command

2. **Module Pattern** (e.g., [flashcards-module.ts](src/flashcards-module.ts))
   - Implements `yargs.CommandModule` interface
   - Defines CLI arguments and options
   - Parses CSV input using papaparse
   - Orchestrates H5pPackage creation and content generation
   - Each module creates an H5pPackage and corresponding Creator

3. **Creator Pattern** ([content-creator.ts](src/content-creator.ts))
   - Abstract base class `ContentCreator<T extends H5pContent>`
   - Provides infrastructure for all content types
   - Concrete implementations (e.g., [flashcards-creator.ts](src/flashcards-creator.ts), [interactive-book-creator.ts](src/interactive-book-creator.ts)) extend this
   - Key methods to implement:
     - `contentObjectFactory()`: Instantiate content model
     - `addContent()`: Populate content from CSV data
     - `addSettings()`: Configure content settings
   - The `create()` method orchestrates the full workflow

4. **H5P Package Management** ([h5p-package.ts](src/h5p-package.ts))
   - Downloads content type packages from H5P Hub API
   - Caches packages locally in `content-type-cache/` directory
   - Manages JSZip operations for H5P package structure
   - Handles language strings from H5P libraries
   - Methods: `clearContent()`, `addMainContentFile()`, `addContentFile()`, `savePackage()`

5. **Content Models** ([src/models/](src/models/))
   - TypeScript classes representing H5P content structures
   - Base class: `H5pContent`
   - Specific implementations: `H5pFlashcardsContent`, `H5pDialogCardsContent`, `H5pInteractiveBookContent`
   - Supporting models: `H5pImage`, `H5pAudio`, `H5pCopyrightInformation`

### Data Flow

1. User invokes CLI command with CSV file and options
2. Module parses CSV using papaparse
3. Module creates `H5pPackage.createFromHub()` (downloads or uses cached package)
4. Module instantiates Creator with parsed data
5. Creator extends `ContentCreator` and populates content via abstract methods
6. Creator handles media files (images/audio) from local paths or URLs
7. Package is saved as `.h5p` file

### Media File Handling

Both local files and URLs are supported for images and audio:
- Local paths: Resolved relative to CSV file directory
- URLs: Downloaded via axios and embedded in package
- Files are added to package with `h5pPackage.addContentFile(path, buffer)`
- Helper classes `H5pImage` and `H5pAudio` provide `fromLocalFile()` and `fromDownload()` methods

## Adding New Content Types

To add support for a new H5P content type:

1. Create a **Module class** in `src/{contenttype}-module.ts`:
   - Implement `yargs.CommandModule`
   - Define command, positional args, and options
   - Parse CSV input
   - Instantiate H5pPackage and Creator

2. Create a **Creator class** in `src/{contenttype}-creator.ts`:
   - Extend `ContentCreator<YourContentType>`
   - Implement `contentObjectFactory()`, `addContent()`, `addSettings()`
   - Handle CSV row-to-content mapping
   - Process any media files

3. Create a **Content model** in `src/models/h5p-{contenttype}-content.ts`:
   - Extend `H5pContent`
   - Define properties matching H5P content type schema

4. Register the module in [index.ts](src/index.ts):
   ```typescript
   .command(new YourContentTypeModule())
   ```

Reference [flashcards-module.ts](src/flashcards-module.ts) and [flashcards-creator.ts](src/flashcards-creator.ts) as implementation examples.

### Interactive Book Implementation Guide

For implementing Interactive Book support (detailed analysis in [docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md](docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md)):

**Key considerations:**
- Interactive Book uses a `chapters` array in content.json
- Each chapter contains an `item.content` array with multiple H5P sub-content types (H5P.AdvancedText, H5P.Image, H5P.Audio)
- CSV format: Each row = one page, with columns: bookTitle, pageTitle, pageText, imagePath, imageAlt, audioPath
- Template creation: Manually create a sample Interactive Book in H5P editor, download as .h5p, place in templates/

**Implementation pattern:**
1. Parse CSV rows into page data structures
2. For each page, create a chapter object with nested content types
3. Use `<h2>` tags for page titles, `<p>` tags for text in H5P.AdvancedText
4. Copy media files to `content/images/` and `content/audios/` directories
5. Build proper H5P sub-content structures for H5P.Image and H5P.Audio

**Completed implementation:**
- [interactive-book-module.ts](src/interactive-book-module.ts): CLI command module
- [interactive-book-creator.ts](src/interactive-book-creator.ts): Content creation logic following ContentCreator pattern
- [h5p-interactivebook-content.ts](src/models/h5p-interactivebook-content.ts): Content model

## Understanding H5P Package Structure

H5P packages (.h5p files) are ZIP archives with this structure:

```
package.h5p (ZIP file)
├── h5p.json                    # Package metadata (title, language, main library)
├── content/
│   ├── content.json            # Main content data (what your Creator builds)
│   ├── images/                 # Image files referenced in content.json
│   ├── audios/                 # Audio files referenced in content.json
│   └── videos/                 # Video files (if applicable)
└── [H5P library directories]   # Library code (downloaded from Hub)
```

**To understand a content type's structure:**
1. Create sample content manually in H5P editor
2. Download as .h5p
3. Unzip and examine content/content.json
4. Use this as your template and reference for implementation

## ⚠️ CRITICAL: H5P Library Versioning Requirements

**H5P platforms enforce STRICT version matching.** Version mismatches are the #1 cause of "content not rendering" issues.

### The Version Matching Rule

H5P platforms (h5p.com, Moodle, WordPress) validate that:
1. **h5p.json** declares the exact library versions
2. **content.json** references match those declared versions
3. **Library directories** bundled in the .h5p match declared versions
4. Platform's H5P core is compatible with the library versions

**If ANY version doesn't match exactly, content will fail to render.**

### Real-World Example: DialogCards 1.8 vs 1.9

**Symptom:** DialogCards appear in editor as "Empty column", don't render in player.

**Root Cause Analysis:**
- Package declared `H5P.Dialogcards 1.8` in h5p.json
- Package bundled `H5P.Dialogcards-1.8/` library files
- Platform expected/required `H5P.Dialogcards 1.9`
- **Result:** Complete rendering failure despite correct content structure

**Key Differences Between Versions:**
- DialogCards 1.8: Core API 1.15, patch 1.8.2, 29 language files
- DialogCards 1.9: Core API 1.26, patch 1.9.18, 45 language files
- Different JavaScript/CSS implementations (non-compatible)
- Different semantics.json schemas

**The Fix:**
1. Add `H5P.Dialogcards-1.9.h5p` to `content-type-cache/` (from working package)
2. Update handler: `library: "H5P.Dialogcards 1.9"` in DialogCardsHandler.ts
3. Rebuild package - LibraryRegistry auto-selects version 1.9 from cache
4. Verify h5p.json shows `"minorVersion": 9`

### Debugging Workflow for Version Issues

**When content doesn't render after upload:**

1. **Create reference package from platform:**
   ```bash
   # Create sample content manually on target platform
   # Download as working-reference.h5p
   ```

2. **Compare versions in h5p.json:**
   ```bash
   # Check working package
   unzip -q -c working-reference.h5p "h5p.json" | python3 -m json.tool | grep -A 2 "machineName"

   # Check your generated package
   unzip -q -c your-package.h5p "h5p.json" | python3 -m json.tool | grep -A 2 "machineName"
   ```

3. **Compare library directories:**
   ```bash
   # Check what libraries are bundled
   unzip -l working-reference.h5p | grep "^.*H5P\." | grep "/$" | sort
   unzip -l your-package.h5p | grep "^.*H5P\." | grep "/$" | sort
   ```

4. **Extract and compare specific library versions:**
   ```bash
   # Check DialogCards version in library.json
   unzip -q -c package.h5p "H5P.Dialogcards-1.9/library.json" | python3 -m json.tool | grep -E "majorVersion|minorVersion|patchVersion"
   ```

5. **Verify content.json references:**
   ```bash
   # Find all library references in content
   unzip -q -c package.h5p "content/content.json" | python3 -c "
   import json, sys, re
   data = json.load(sys.stdin)
   libs = re.findall(r'\"library\":\\s*\"([^\"]+)\"', json.dumps(data))
   for lib in sorted(set(libs)):
       print(lib)
   "
   ```

### Version Management Best Practices

**Cache Management:**
```
content-type-cache/
├── H5P.InteractiveBook-1.11.h5p    ✅ Versioned filename (preferred)
├── H5P.Dialogcards-1.9.h5p         ✅ Versioned filename (preferred)
├── H5P.MultiChoice-1.16.h5p        ✅ Versioned filename (preferred)
└── H5P.Image.h5p                   ⚠️  Non-versioned (legacy, avoid)
```

**Handler Code Versioning:**
- Always specify full version in handlers: `"H5P.Dialogcards 1.9"` not `"H5P.Dialogcards"`
- Update handler code when changing cached library versions
- Test on target platform before distributing packages

**LibraryRegistry Behavior:**
- Auto-selects LATEST version from cache when multiple exist
- Prefers versioned filenames: `H5P.Dialogcards-1.9.h5p`
- Falls back to non-versioned: `H5P.Dialogcards.h5p`
- Sorting: Descending by major.minor (1.9 > 1.8)

**Platform Compatibility Strategy:**
1. **Identify target platform version** - Create/download reference package
2. **Extract library versions** - Document in `content-type-cache/README.md`
3. **Keep reference packages** - Store working .h5p files for comparison
4. **Test before distributing** - Always upload to target platform first
5. **Document version requirements** - Track which platform versions work

### Common Version Pitfall Scenarios

❌ **Scenario 1: Mixing library sources**
- Downloaded `H5P.Dialogcards-1.8.h5p` from Hub
- Extracted `H5P.Column-1.18` from InteractiveBook-1.11
- Result: Incompatible dependency versions, rendering failure

❌ **Scenario 2: Assuming backward compatibility**
- Generated package with DialogCards 1.8
- Platform upgraded to require 1.9
- Result: Old packages stop working on updated platform

❌ **Scenario 3: Non-versioned cache files**
- Multiple `H5P.Dialogcards.h5p` files from different dates
- No way to know which version without extracting
- Result: Unpredictable builds, inconsistent output

✅ **Correct Approach:**
- Use versioned filenames always
- Match handler version declarations to cached libraries
- Keep working reference packages from each target platform
- Test on actual deployment platform before distribution
- Document version requirements in project docs

## Naming Convention

**Classes from H5P libraries or content types start with `H5p`** (e.g., `H5pImage`, `H5pFlashcard`). Classes that are part of the creator infrastructure do NOT use this prefix (e.g., `ContentCreator`, `FlashcardsModule`).

## CSV Format

- Delimiter: configurable (default `;`)
- Encoding: configurable (default `UTF-8`)
- Headers: Required (e.g., `question`, `answer`, `tip`, `image`)
- Empty lines: Skipped automatically

## Dependencies

- **yargs**: CLI argument parsing
- **papaparse**: CSV parsing
- **jszip**: H5P package (ZIP) manipulation
- **axios**: Downloading packages from H5P Hub and media files
- **fs-extra**: Enhanced file system operations
- **mime-types**: MIME type detection for media files
- **buffer-image-size**: Image dimension detection

## Future Architecture Plans

The [docs/](docs/) directory contains design documentation for planned improvements:

### Handler/Plugin Architecture

[H5P_Handler_Architecture_Complete_Design.md](docs/deprecated/H5P_Handler_Architecture_Complete_Design.md) proposes a handler-based plugin system that would:
- **Eliminate code duplication**: Each content type implements a standard `ContentHandler` interface
- **Enable rapid content type additions**: New handlers can be added in ~30-60 minutes vs 4-8 hours currently
- **Improve maintainability**: Each handler is isolated and independently testable
- **Auto-generate documentation**: CSV format docs and CLI help generated from handler definitions

**Key concepts from the design:**
- `ContentHandler` interface defines: `validate()`, `generate()`, `parseCSV()`, `getCSVColumns()`, `getCLIOptions()`
- `HandlerRegistry` manages handler registration and discovery
- `HandlerContext` provides shared utilities (file operations, logging, MIME detection)
- Dynamic CLI command generation from registered handlers

**Implementation structure:**
```
src/handlers/
├── ContentHandler.ts        # Core interfaces
├── HandlerRegistry.ts        # Registry implementation
├── HandlerContextImpl.ts     # Context utilities
├── FlashcardsHandler.ts      # Refactored flashcards
├── DialogCardsHandler.ts     # Refactored dialog cards
└── InteractiveBookHandler.ts # Example new content type
```

See [H5P_Handler_Implementation_File_Structure.md](docs/deprecated/H5P_Handler_Implementation_File_Structure.md) for detailed implementation guide.

### Git Workflow

[Git_Forking_vs_Cloning_Complete_Guide.md](docs/deprecated/Git_Forking_vs_Cloning_Complete_Guide.md) explains the fork-based contribution workflow:
- Fork the repository on GitHub first
- Clone your fork locally
- Add upstream remote: `git remote add upstream https://github.com/sr258/h5p-cli-creator.git`
- Work on feature branches
- Push to your fork, then create PR to upstream

**Quick setup:**
```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/h5p-cli-creator.git
cd h5p-cli-creator
git remote add upstream https://github.com/sr258/h5p-cli-creator.git
git checkout -b feature/your-feature
```
