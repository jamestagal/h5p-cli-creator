# YouTube Story Extraction - Requirements

## Overview
Automate the creation of Interactive Book digital storybooks from YouTube videos by extracting audio, transcripts, and translations based on user-defined timestamps.

## Problem Statement
Creating Vietnamese language learning storybooks from YouTube videos is currently a manual, time-consuming process that involves:
- Manually extracting audio from YouTube videos
- Splitting audio into page segments
- Extracting and typing out transcript text for each page
- Translating Vietnamese text to English
- Finding or generating images for each page
- Manually assembling everything in Interactive Book format

**Time per story:** 3-5 hours of manual work
**Goal:** Reduce to 15-30 minutes (90% time savings)

## Use Case
The primary use case is Vietnamese language learning stories:
- Source: YouTube videos with Vietnamese narration
- Target: Interactive Book H5P packages
- Structure: Each page contains:
  - Image (AI-generated or from video, initially placeholder)
  - Audio segment (14-60 seconds per page)
  - Vietnamese text
  - English translation (collapsible)
- First page: YouTube video embed + full transcript in accordion

## Prototype Requirements

### Test Case Video
- **URL:** https://www.youtube.com/watch?v=Y8M9RJ_4C7E
- **Title:** Vietnamese listening practice story
- **Duration:** ~5:14
- **Pages:** 11 pages plus video intro page (12 total chapters)

### Page Timestamps
```
Page 1:  0:00 - 0:38  (38 seconds)
Page 2:  0:38 - 1:06  (28 seconds)
Page 3:  1:06 - 1:39  (33 seconds)
Page 4:  1:39 - 2:06  (27 seconds)
Page 5:  2:06 - 2:43  (37 seconds)
Page 6:  2:43 - 3:08  (25 seconds)
Page 7:  3:08 - 3:34  (26 seconds)
Page 8:  3:34 - 3:51  (17 seconds)
Page 9:  3:51 - 4:17  (26 seconds)
Page 10: 4:17 - 4:37  (20 seconds)
Page 11: 4:37 - 5:14  (37 seconds)
```

## Functional Requirements

### FR1: YAML Configuration Format
**Priority:** P0 (Critical)

Users define story structure in YAML:
```yaml
title: "Story Title"
language: vi

source:
  type: youtube
  url: "https://youtube.com/watch?v=..."

translation:
  enabled: true
  targetLanguage: en
  style: collapsible  # <details> HTML element

pages:
  - title: "Video introduction"
    type: youtube-intro
    includeTranscript: true

  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:38"
    placeholder: true  # Use placeholder image

  - title: "Page 2"
    startTime: "00:38"
    endTime: "01:06"
    image: "./images/custom.jpg"  # Or provide custom image
```

### FR2: YouTube Data Extraction
**Priority:** P0 (Critical)

- Download audio from YouTube URL (using yt-dlp)
- Extract video transcript with timestamps (using youtube-transcript-api)
- Cache downloads in `.youtube-cache/` directory
- Reuse cached data on subsequent runs

### FR3: Audio Segmentation
**Priority:** P0 (Critical)

- Split audio at user-defined timestamps using ffmpeg
- Output format: MP3 (copy codec, no re-encoding)
- Naming: `page1.mp3`, `page2.mp3`, etc.
- Store in `audio-segments/` directory

### FR4: Transcript Matching
**Priority:** P0 (Critical)

- Match transcript segments to timestamp ranges
- Extract Vietnamese text for each page
- Handle timestamp overlaps gracefully
- Preserve punctuation and formatting

### FR5: Translation Service
**Priority:** P1 (High)

- Translate Vietnamese text to English using OpenAI GPT
- Context-aware translation (story context)
- Preserve tone and narrative flow
- Cache translations to avoid re-processing

### FR6: Interactive Book YAML Generation
**Priority:** P0 (Critical)

Generate Interactive Book YAML with structure:
```yaml
chapters:
  # Page 0: YouTube embed + transcript accordion
  - title: "Video introduction"
    content:
      - type: text
        text: '<iframe>...</iframe>'
      - type: accordion
        panels:
          - title: "Video transcript"
            content: "[full transcript]"

  # Pages 1-N: Story pages
  - title: "Page 1"
    content:
      - type: image
        path: "../images/page1.jpg"
      - type: audio
        path: "../audio-segments/page1.mp3"
      - type: text
        text: |
          <p>Vietnamese text...</p>
          <details>
            <summary><strong>English</strong></summary>
            <p><em>English translation...</em></p>
          </details>
```

### FR7: Placeholder Image Workflow
**Priority:** P1 (High)

- Provide default placeholder image
- Allow users to replace placeholders later
- Support custom images per page
- Document image replacement workflow

### FR8: CLI Command
**Priority:** P0 (Critical)

```bash
node ./dist/index.js youtube-extract <config.yaml>

# Example:
node ./dist/index.js youtube-extract vietnamese-story-config.yaml
```

Output:
- Generated Interactive Book YAML
- Audio segment files
- Transcript text file
- Success message with next steps

## Non-Functional Requirements

### NFR1: Performance
- Initial run (download): 1-2 minutes for 5-minute video
- Cached run: 10-20 seconds
- Audio splitting: < 5 seconds for 11 segments

### NFR2: Error Handling
- Graceful failure if YouTube URL invalid
- Clear error messages for missing dependencies (ffmpeg, yt-dlp)
- Fallback if transcript unavailable
- Validation of timestamp format

### NFR3: Dependencies
**System dependencies:**
- ffmpeg (required)
- yt-dlp (required)

**Node.js packages:**
- @distube/ytdl-core
- fluent-ffmpeg
- youtube-transcript

### NFR4: Output Quality
- Audio quality: Match source quality
- Translation quality: Context-aware, natural
- YAML formatting: Valid, human-readable
- File organization: Clean directory structure

## Success Criteria

### Prototype Success (Day 1-2)
✅ Successfully extracts audio and transcript from test video
✅ Splits audio at 11 timestamps
✅ Matches transcript text to each segment
✅ Generates valid Interactive Book YAML
✅ YAML compiles to H5P package using existing `yaml` command

### Full Feature Success
✅ Translation working with context awareness
✅ YouTube embed and transcript accordion
✅ Collapsible English translations using `<details>`
✅ Placeholder image workflow documented
✅ Reduces manual work from 3-5 hours to 15-30 minutes

## Out of Scope (Future Enhancements)

### Phase 2 (Future)
- Automatic timestamp detection (AI-based)
- Video frame extraction for images
- AI image generation integration
- Batch processing multiple videos
- Web UI for timestamp definition

### Phase 3 (Future)
- Integration with Concept Extraction (Phase 6C)
- Vocabulary flashcard generation from transcript
- Quiz generation from story content
- Audio pronunciation highlighting

## Integration Points

### Existing Systems
- **YamlInputParser:** Parse story config YAML
- **InteractiveBookHandler:** Use existing handler for compilation
- **H5pCompiler:** Standard compilation pipeline
- **OpenAI API:** Translation service (existing integration)

### Future Systems
- **Concept Extraction (Phase 6C):** Extract vocabulary from transcript
- **Language-Aware AI (Phase 6A):** Vietnamese content preservation
- **SvelteKit Frontend:** Visual timestamp editor

## User Stories

**US1:** As a Vietnamese language teacher, I want to extract audio segments from a YouTube video at specific timestamps so that I can create interactive storybook pages without manual audio editing.

**US2:** As a content creator, I want the tool to automatically extract Vietnamese transcripts and translate them to English so that I can provide bilingual learning materials.

**US3:** As an educator, I want to embed the full YouTube video on the first page with a collapsible transcript so that learners can watch the complete story before reading individual pages.

**US4:** As a language instructor, I want to use placeholder images initially and replace them later with custom illustrations so that I can publish content quickly and improve it iteratively.

**US5:** As a digital content producer, I want the tool to cache YouTube downloads so that I can iterate on timestamps without re-downloading the video each time.

## Technical Constraints

### TC1: External Service Dependencies
- YouTube API rate limits
- OpenAI API costs (~$0.01 per story)
- ffmpeg binary installation required

### TC2: Platform Compatibility
- macOS: brew install ffmpeg yt-dlp
- Linux: apt-get install ffmpeg yt-dlp
- Windows: Binary downloads required

### TC3: Audio Constraints
- Maximum video duration: 60 minutes (practical limit)
- Minimum segment length: 5 seconds
- Audio format: MP3 (universal H5P support)

## Risk Assessment

### High Risk
- **YouTube API changes:** Could break download/transcript extraction
- **Translation quality:** May require prompt tuning
- **Dependency installation:** Users may struggle with ffmpeg/yt-dlp setup

### Medium Risk
- **Timestamp precision:** ffmpeg accuracy ±0.1 seconds
- **Transcript availability:** Not all videos have captions
- **Character encoding:** Vietnamese diacritics handling

### Low Risk
- **Audio splitting:** ffmpeg is reliable
- **YAML generation:** Well-defined structure
- **Caching:** Standard file system operations

## Acceptance Criteria

### AC1: YouTube Extraction
- [x] Downloads audio from YouTube URL
- [x] Extracts Vietnamese transcript with timestamps
- [x] Caches files in `.youtube-cache/VIDEO_ID/`
- [x] Reuses cache on subsequent runs

### AC2: Audio Processing
- [x] Splits audio at exact timestamps (±0.1s)
- [x] Outputs MP3 files with sequential naming
- [x] Preserves audio quality (no re-encoding)
- [x] Validates timestamp format before processing

### AC3: Text Processing
- [x] Matches transcript to timestamp ranges
- [x] Extracts Vietnamese text for each page
- [x] Handles special characters (diacritics) correctly
- [x] Preserves paragraph structure

### AC4: Translation
- [x] Translates Vietnamese to English using OpenAI
- [x] Maintains story context across pages
- [x] Produces natural, readable English
- [x] Caches translations to avoid reprocessing

### AC5: YAML Generation
- [x] Generates valid Interactive Book YAML
- [x] First page: YouTube embed + transcript accordion
- [x] Story pages: Image + Audio + Bilingual text
- [x] Collapsible English using `<details>` element
- [x] Proper file path references

### AC6: CLI Integration
- [x] `youtube-extract` command works
- [x] Clear progress messages during processing
- [x] Error messages are actionable
- [x] Success message shows next steps

### AC7: End-to-End Workflow
- [x] Config YAML → Generated IB YAML → Compiled H5P
- [x] H5P package uploads to H5P.com successfully
- [x] Audio plays correctly in each page
- [x] Translations display correctly
- [x] YouTube embed works on first page

## Implementation Phases

### Phase 1: Core Extraction (Day 1, 6 hours)
**Goal:** Basic YouTube → Audio + Transcript extraction

**Deliverables:**
- YouTubeExtractor service
- AudioSplitter service
- TranscriptMatcher service
- Basic test case working

**Files:**
- `src/services/YouTubeExtractor.ts`
- `src/services/AudioSplitter.ts`
- `src/services/TranscriptMatcher.ts`
- `src/models/StoryConfig.ts`

### Phase 2: Full Integration (Day 2, 6 hours)
**Goal:** Complete workflow with translation and YAML generation

**Deliverables:**
- Translation service (OpenAI)
- Interactive Book YAML generator
- CLI command module
- Full test with actual video

**Files:**
- `src/services/StoryTranslator.ts`
- `src/services/InteractiveBookGenerator.ts`
- `src/youtube-extract-module.ts`
- `examples/youtube-stories/test-config.yaml`

### Phase 3: Polish & Documentation (Day 3, 4 hours)
**Goal:** Production-ready with docs

**Deliverables:**
- Error handling and validation
- User documentation
- Example configs
- Dependency installation guide

**Files:**
- `docs/user-guides/youtube-story-extraction.md`
- `examples/youtube-stories/README.md`
- Updated `README.md`

## Example Workflow

### Input: Story Config
```yaml
# examples/youtube-stories/vietnamese-story-config.yaml
title: "Vietnamese Children's Story"
language: vi

source:
  type: youtube
  url: "https://www.youtube.com/watch?v=Y8M9RJ_4C7E"

translation:
  enabled: true
  targetLanguage: en
  style: collapsible

pages:
  - title: "Video introduction"
    type: youtube-intro
    includeTranscript: true

  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:38"
    placeholder: true

  # ... 10 more pages with timestamps
```

### Command Execution
```bash
$ node ./dist/index.js youtube-extract examples/youtube-stories/vietnamese-story-config.yaml

📺 YouTube Story Extraction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Downloading audio from YouTube...
✓ Extracting Vietnamese transcript...
✓ Splitting audio into 11 segments...
✓ Matching transcript to timestamps...
✓ Translating to English (using OpenAI)...
✓ Generating Interactive Book YAML...

✅ Success!

Generated files:
  📄 vietnamese-story.yaml (Interactive Book)
  🎵 audio-segments/ (11 MP3 files)
  📝 full-transcript.txt

Next step:
  node ./dist/index.js yaml vietnamese-story.yaml vietnamese-story.h5p
```

### Output: Generated YAML
Ready-to-compile Interactive Book YAML with:
- YouTube embed page
- 11 story pages
- Audio segments
- Bilingual text
- Placeholder images

## Dependencies Documentation

### System Dependencies
```bash
# macOS
brew install ffmpeg yt-dlp

# Ubuntu/Debian
sudo apt-get install ffmpeg
pip install yt-dlp

# Check installation
ffmpeg -version
yt-dlp --version
```

### Node.js Dependencies
```json
{
  "dependencies": {
    "@distube/ytdl-core": "^4.13.0",
    "fluent-ffmpeg": "^2.1.2",
    "youtube-transcript": "^1.0.6"
  }
}
```

## Cost Analysis

### Per Story (5-minute video, 11 pages)
- YouTube download: Free
- Transcript extraction: Free
- Audio processing: Free (ffmpeg)
- Translation (OpenAI GPT-4): ~$0.01
- **Total cost:** ~$0.01 per story

### Time Savings
- **Manual process:** 3-5 hours
- **Automated process:** 15-30 minutes
- **Time saved:** 2.5-4.5 hours (90% reduction)
- **ROI:** Pays for itself after 1 story

## Future Enhancements (Post-Prototype)

### Enhancement 1: Auto-Timestamp Detection
Use AI to suggest optimal page break points:
- Detect pauses in audio
- Identify sentence boundaries
- Suggest natural break points
- User can accept/modify suggestions

### Enhancement 2: Video Frame Extraction
Extract video frames for images:
- Capture frame at segment start/middle
- Basic image quality filtering
- Option to use as page images
- Still allow manual replacement

### Enhancement 3: Concept Extraction Integration
Connect to Phase 6C spec:
- Extract vocabulary from transcript
- Generate flashcards automatically
- Create quiz questions
- Build glossary

### Enhancement 4: Batch Processing
Process multiple videos at once:
- Config file with multiple videos
- Parallel processing
- Progress dashboard
- Combined output directory

## Related Specs

### Concept Extraction Pipeline (Phase 6C)
- **Location:** `agent-os/specs/2025-11-10-concept-extraction-language-aware-ai/`
- **Connection:** YouTube stories provide source content for concept extraction
- **Integration:** Extract vocabulary/grammar from transcript

### Language-Aware AI (Phase 6A)
- **Connection:** Ensures Vietnamese content stays in Vietnamese
- **Integration:** Use targetLanguage: vi for content generation

### Smart Import Architecture
- **Connection:** YouTube extraction is a type of smart import
- **Integration:** Follows same pattern as PDF/audio/video extraction
