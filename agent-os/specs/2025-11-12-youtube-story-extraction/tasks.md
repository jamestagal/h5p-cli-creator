# Task Breakdown: YouTube Story Extraction for Interactive Books

## Overview
Automate creation of Vietnamese language learning Interactive Books from YouTube videos by extracting audio, transcripts, translations, and generating ready-to-compile YAML. Reduces manual work from 3-5 hours to 15-30 minutes per story (90% time savings).

**Total Estimated Effort:** 16 hours
**Total Tasks:** 42 sub-tasks across 5 task groups

## Task List

### Phase 1: Foundation & Core Services

#### Task Group 1: Type Definitions and Data Models
**Dependencies:** None
**Estimated Effort:** 1.5 hours

- [ ] 1.0 Complete type definitions and data models
  - [ ] 1.1 Create StoryConfig type definition
    - Define YAML config structure: title, language, source, translation, pages
    - Source config: type (youtube), url
    - Translation config: enabled, targetLanguage, style (collapsible/inline)
    - Page types: youtube-intro (with includeTranscript flag), story page (with startTime, endTime, image/placeholder)
    - Location: `src/models/StoryConfig.ts`
  - [ ] 1.2 Create YouTubeExtractorTypes
    - VideoMetadata: videoId, title, duration, thumbnailUrl
    - TranscriptSegment: startTime, endTime, text (Vietnamese with diacritics)
    - AudioSegment: pageNumber, filePath, startTime, endTime
    - CacheMetadata: videoId, audioPath, transcriptPath, downloadDate
    - Location: `src/services/types/YouTubeExtractorTypes.ts`
  - [ ] 1.3 Create StoryPageData type
    - pageNumber, title, startTime, endTime
    - vietnameseText, englishTranslation
    - audioPath, imagePath, isPlaceholder
    - transcriptSegments array
    - Location: `src/models/StoryPageData.ts`
  - [ ] 1.4 Extend ContentType union in compiler/types.ts
    - Add "youtube-intro" type for video embed page
    - Add "youtube-page" type for story pages (or reuse existing "text" type)
    - Ensure compatibility with existing BookDefinition structure
    - Location: `src/compiler/types.ts`

**Acceptance Criteria:**
- All type definitions compile without errors
- Types align with YAML config structure from requirements
- Types support Vietnamese character encoding (UTF-8)
- ContentType union includes new YouTube page types

---

#### Task Group 2: YouTube Extraction Service
**Dependencies:** Task Group 1
**Estimated Effort:** 3 hours

- [ ] 2.0 Complete YouTube extraction service
  - [ ] 2.1 Write 2-4 focused tests for YouTubeExtractor
    - Test video ID extraction from various YouTube URL formats
    - Test cache directory creation for new video
    - Test cache hit detection for previously downloaded video
    - Mock yt-dlp system calls for testing
    - Location: `tests/unit/YouTubeExtractor.test.ts`
  - [ ] 2.2 Implement YouTubeExtractor class
    - extractVideoId(url: string): Parse YouTube URL (watch?v=, youtu.be/, embed/)
    - downloadAudio(videoId: string): Call yt-dlp system command with MP3 output
    - extractTranscript(videoId: string): Use youtube-transcript library
    - getCacheDirectory(videoId: string): Return `.youtube-cache/VIDEO_ID/`
    - isCached(videoId: string): Check if audio and transcript exist in cache
    - Location: `src/services/YouTubeExtractor.ts`
  - [ ] 2.3 Add yt-dlp system dependency validation
    - checkYtDlpInstalled(): Execute `yt-dlp --version` and handle errors
    - Provide installation instructions in error message
    - Support fallback to legacy youtube-dl if yt-dlp not found
    - Location: Add to YouTubeExtractor constructor
  - [ ] 2.4 Implement caching strategy
    - Create `.youtube-cache/VIDEO_ID/audio.mp3` for downloaded audio
    - Create `.youtube-cache/VIDEO_ID/transcript.json` for transcript data
    - Store metadata: `cache-metadata.json` with download timestamp
    - Skip download if cache is fresh (< 7 days old)
    - Location: Cache logic in YouTubeExtractor methods
  - [ ] 2.5 Add Vietnamese character encoding handling
    - Set UTF-8 encoding for transcript extraction
    - Preserve Vietnamese diacritics (ă, â, đ, ê, ô, ơ, ư, etc.)
    - Test with sample Vietnamese text
    - Location: TranscriptExtractor configuration
  - [ ] 2.6 Ensure YouTubeExtractor tests pass
    - Run ONLY the 2-4 tests written in 2.1
    - Verify cache directory creation works
    - Verify video ID parsing handles multiple URL formats
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 2.1 pass
- Downloads audio from YouTube URL as MP3
- Extracts transcript with timestamps
- Caches files in `.youtube-cache/VIDEO_ID/` directory
- Reuses cache on subsequent runs
- Validates yt-dlp installation with clear error messages
- Preserves Vietnamese diacritics correctly

---

#### Task Group 3: Audio Segmentation Service
**Dependencies:** Task Group 2
**Estimated Effort:** 2.5 hours

- [ ] 3.0 Complete audio segmentation service
  - [ ] 3.1 Write 2-4 focused tests for AudioSplitter
    - Test timestamp parsing (MM:SS format to seconds)
    - Test timestamp validation (overlaps, out-of-range)
    - Test segment file naming (page1.mp3, page2.mp3, etc.)
    - Mock ffmpeg system calls for testing
    - Location: `tests/unit/AudioSplitter.test.ts`
  - [ ] 3.2 Implement AudioSplitter class
    - splitAudio(audioPath, segments, outputDir): Main method
    - parseTimestamp(timeString): Convert "MM:SS" to seconds
    - validateTimestamps(segments, duration): Check for overlaps and out-of-range
    - generateSegment(input, output, start, end): Execute ffmpeg command
    - Use ffmpeg copy codec: `ffmpeg -i input.mp3 -ss START -to END -c copy output.mp3`
    - Location: `src/services/AudioSplitter.ts`
  - [ ] 3.3 Add ffmpeg system dependency validation
    - checkFfmpegInstalled(): Execute `ffmpeg -version` and handle errors
    - Provide installation instructions in error message (brew, apt-get, etc.)
    - Fail gracefully if ffmpeg not found
    - Location: Add to AudioSplitter constructor
  - [ ] 3.4 Implement segment output organization
    - Create `audio-segments/` directory if not exists
    - Name segments sequentially: `page1.mp3`, `page2.mp3`, etc.
    - Clean up existing segments before regenerating (optional flag)
    - Return array of AudioSegment objects with paths
    - Location: AudioSplitter.splitAudio() method
  - [ ] 3.5 Add timestamp precision handling
    - Target precision: ±0.1 seconds
    - Use high-precision ffmpeg flags: `-ss` (seek start) and `-to` (seek end)
    - Handle edge cases: segment starts at 0:00, segment ends at video end
    - Location: AudioSplitter.generateSegment() method
  - [ ] 3.6 Ensure AudioSplitter tests pass
    - Run ONLY the 2-4 tests written in 3.1
    - Verify timestamp parsing handles MM:SS format correctly
    - Verify validation catches overlapping timestamps
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 3.1 pass
- Splits audio at exact timestamps (±0.1s precision)
- Outputs MP3 files with sequential naming (page1.mp3, page2.mp3)
- Preserves audio quality using copy codec (no re-encoding)
- Validates timestamp format before processing
- Validates ffmpeg installation with clear error messages

---

#### Task Group 4: Transcript Matching Service
**Dependencies:** Task Group 2, Task Group 3
**Estimated Effort:** 2 hours

- [ ] 4.0 Complete transcript matching service
  - [ ] 4.1 Write 2-4 focused tests for TranscriptMatcher
    - Test matching transcript segments to timestamp range
    - Test handling overlapping timestamp boundaries
    - Test concatenating multiple segments into page text
    - Test preserving paragraph breaks and punctuation
    - Location: `tests/unit/TranscriptMatcher.test.ts`
  - [ ] 4.2 Implement TranscriptMatcher class
    - matchToPages(transcript, pages): Main method returns StoryPageData[]
    - findSegmentsInRange(segments, startTime, endTime): Filter by timestamp
    - concatenateSegments(segments): Join text with proper spacing
    - preserveFormatting(text): Maintain paragraph breaks and punctuation
    - Location: `src/services/TranscriptMatcher.ts`
  - [ ] 4.3 Handle timestamp overlaps gracefully
    - Include overlapping text in both pages
    - Use inclusive start, exclusive end for boundaries
    - Document overlap handling strategy in code comments
    - Location: TranscriptMatcher.findSegmentsInRange()
  - [ ] 4.4 Preserve Vietnamese text formatting
    - Maintain punctuation (periods, commas, question marks)
    - Preserve paragraph breaks from original transcript
    - Handle sentence fragments at segment boundaries
    - Ensure UTF-8 encoding throughout
    - Location: TranscriptMatcher.concatenateSegments()
  - [ ] 4.5 Ensure TranscriptMatcher tests pass
    - Run ONLY the 2-4 tests written in 4.1
    - Verify segments are matched to correct timestamp ranges
    - Verify text concatenation preserves formatting
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 4.1 pass
- Matches transcript segments to timestamp ranges accurately
- Extracts Vietnamese text for each page
- Handles timestamp overlaps gracefully
- Preserves punctuation, paragraph breaks, and formatting
- Concatenates multiple segments into cohesive page text

---

### Phase 2: Translation & YAML Generation

#### Task Group 5: Translation Service with Context Awareness
**Dependencies:** Task Group 4
**Estimated Effort:** 3 hours

- [ ] 5.0 Complete translation service
  - [ ] 5.1 Write 2-4 focused tests for StoryTranslator
    - Test OpenAI API integration with mocked responses
    - Test context-aware translation (story context passed)
    - Test translation caching to avoid reprocessing
    - Test graceful fallback when translation fails
    - Location: `tests/unit/StoryTranslator.test.ts`
  - [ ] 5.2 Implement StoryTranslator class
    - translatePages(pages, storyContext): Translate all pages with context
    - translateSinglePage(page, context): Translate one page
    - buildTranslationPrompt(text, context): Create context-aware prompt
    - cacheTranslation(key, translation): Store in cache
    - getCachedTranslation(key): Retrieve from cache
    - Location: `src/services/StoryTranslator.ts`
  - [ ] 5.3 Integrate OpenAI GPT API
    - Follow QuizGenerator pattern for API integration
    - Use environment variable OPENAI_API_KEY for authentication
    - Use GPT-4 model for high-quality translation
    - System prompt: "You are a professional translator. Translate Vietnamese to natural, readable English while preserving the story's tone and narrative flow."
    - Include story title and context in user prompt
    - Location: StoryTranslator.translateSinglePage()
  - [ ] 5.4 Implement translation caching strategy
    - Cache key: hash of (videoId + pageNumber + vietnameseText)
    - Store in `.youtube-cache/VIDEO_ID/translations.json`
    - Skip API call if translation exists in cache
    - Log cache hits/misses in verbose mode
    - Location: Cache logic in StoryTranslator methods
  - [ ] 5.5 Add retry logic for transient API failures
    - Retry up to 3 times with exponential backoff
    - Handle rate limiting (429 errors)
    - Handle network errors (timeouts, connection failures)
    - Fallback: Return untranslated text with warning message
    - Location: API call wrapper in StoryTranslator
  - [ ] 5.6 Estimate and log API costs
    - Calculate token usage per translation
    - Log estimated cost per page (verbose mode)
    - Show total estimated cost after all translations
    - Typical cost: ~$0.01 per 5-minute video (11 pages)
    - Location: Add cost tracking to StoryTranslator
  - [ ] 5.7 Ensure StoryTranslator tests pass
    - Run ONLY the 2-4 tests written in 5.1
    - Verify API integration works with mocked responses
    - Verify caching prevents duplicate API calls
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 5.1 pass
- Translates Vietnamese text to English using OpenAI GPT
- Provides story context to translation model for consistency
- Uses natural, readable English translation style
- Caches translations to avoid reprocessing
- Handles translation failures gracefully with fallback
- Estimates and logs API costs per story

---

#### Task Group 6: Interactive Book YAML Generation
**Dependencies:** Task Group 5
**Estimated Effort:** 2.5 hours

- [ ] 6.0 Complete Interactive Book YAML generation
  - [ ] 6.1 Write 2-4 focused tests for InteractiveBookYamlGenerator
    - Test page 0 generation (YouTube embed + accordion)
    - Test story page generation (image + audio + bilingual text)
    - Test collapsible translation HTML formatting
    - Test YAML structure validation
    - Location: `tests/unit/InteractiveBookYamlGenerator.test.ts`
  - [ ] 6.2 Implement InteractiveBookYamlGenerator class
    - generateYaml(config, pages, outputPath): Main method
    - generateIntroPage(videoUrl, fullTranscript): YouTube embed page
    - generateStoryPage(pageData): Image + audio + text page
    - formatCollapsibleTranslation(vietnamese, english): HTML details element
    - writeYamlFile(data, outputPath): Output to file
    - Location: `src/services/InteractiveBookYamlGenerator.ts`
  - [ ] 6.3 Generate YouTube intro page (page 0)
    - Embed YouTube video using iframe (responsive embed code)
    - Add H5P.Accordion with full Vietnamese transcript
    - Accordion panel title: "Video transcript" (translated to target language)
    - Include collapse/expand functionality
    - Location: InteractiveBookYamlGenerator.generateIntroPage()
  - [ ] 6.4 Generate story pages (pages 1-N)
    - Image content type: Use placeholder or custom image path
    - Audio content type: Reference `../audio-segments/pageN.mp3`
    - Text content type with HTML: Vietnamese text + collapsible English
    - Use HTML details element: `<details><summary><strong>English</strong></summary><p><em>Translation...</em></p></details>`
    - Location: InteractiveBookYamlGenerator.generateStoryPage()
  - [ ] 6.5 Handle placeholder vs custom images
    - If page.placeholder === true: Use default placeholder image path
    - If page.image provided: Use custom image path
    - Copy custom images to appropriate directory if needed
    - Default placeholder: `assets/placeholder-image.png`
    - Location: Image path resolution logic
  - [ ] 6.6 Format YAML output correctly
    - Use js-yaml library for YAML serialization
    - Maintain proper indentation (2 spaces)
    - Preserve multi-line text blocks with pipe (|) syntax
    - Escape special characters in HTML content
    - Output to file: `{video-id}-story.yaml` or config-specified path
    - Location: InteractiveBookYamlGenerator.writeYamlFile()
  - [ ] 6.7 Ensure InteractiveBookYamlGenerator tests pass
    - Run ONLY the 2-4 tests written in 6.1
    - Verify YouTube intro page structure is correct
    - Verify story pages include all required content types
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 6.1 pass
- Generates valid Interactive Book YAML from extracted data
- Page 0: YouTube iframe embed + accordion with full transcript
- Story pages: Image path, audio path, Vietnamese text, collapsible English translation
- Uses HTML details element for collapsible translations
- References audio segments with relative paths
- Uses placeholder or custom image paths as configured
- Outputs well-formatted, human-readable YAML

---

### Phase 3: CLI Integration & End-to-End Testing

#### Task Group 7: CLI Command Module
**Dependencies:** Task Groups 1-6
**Estimated Effort:** 2 hours

- [ ] 7.0 Complete CLI command module
  - [ ] 7.1 Write 2-4 focused tests for youtube-extract command
    - Test YAML config parsing and validation
    - Test progress message display
    - Test error handling for invalid config
    - Test success message with output file paths
    - Location: `tests/integration/youtube-extract.test.ts`
  - [ ] 7.2 Create YouTubeExtractModule class
    - Implement yargs.CommandModule interface
    - Command: `youtube-extract <config.yaml>`
    - Options: --verbose, --skip-translation, --output
    - Parse config YAML using YamlInputParser pattern
    - Location: `src/youtube-extract-module.ts`
  - [ ] 7.3 Orchestrate extraction pipeline
    - Step 1: Parse config YAML and validate structure
    - Step 2: Extract audio and transcript from YouTube (YouTubeExtractor)
    - Step 3: Split audio at timestamps (AudioSplitter)
    - Step 4: Match transcript to pages (TranscriptMatcher)
    - Step 5: Translate pages (StoryTranslator)
    - Step 6: Generate Interactive Book YAML (InteractiveBookYamlGenerator)
    - Location: YouTubeExtractModule.handler() method
  - [ ] 7.4 Display progress messages during processing
    - Use logger for each major step
    - Show progress indicators: checkmarks (✓) or spinners
    - Display: "Downloading audio from YouTube..."
    - Display: "Extracting Vietnamese transcript..."
    - Display: "Splitting audio into N segments..."
    - Display: "Matching transcript to timestamps..."
    - Display: "Translating to English (using OpenAI)..."
    - Display: "Generating Interactive Book YAML..."
    - Location: Progress logging throughout handler
  - [ ] 7.5 Show clear error messages
    - Missing dependencies: "Error: ffmpeg not found. Install with: brew install ffmpeg"
    - Invalid YouTube URL: "Error: Invalid YouTube URL format"
    - No transcript available: "Error: Video does not have captions. Please enable captions or provide manual transcript."
    - Translation API failure: "Warning: Translation failed, using Vietnamese text only"
    - Location: Error handling in handler
  - [ ] 7.6 Output success message with next steps
    - Show generated file paths
    - Display: "Generated files:"
    - Display: "  📄 vietnamese-story.yaml (Interactive Book)"
    - Display: "  🎵 audio-segments/ (N MP3 files)"
    - Display: "  📝 full-transcript.txt"
    - Display: "Next step: node ./dist/index.js yaml vietnamese-story.yaml vietnamese-story.h5p"
    - Location: Success message in handler
  - [ ] 7.7 Register command in index.ts
    - Import YouTubeExtractModule
    - Add to yargs command chain: `.command(new YouTubeExtractModule())`
    - Test command appears in help: `node ./dist/index.js --help`
    - Location: `src/index.ts`
  - [ ] 7.8 Ensure CLI command tests pass
    - Run ONLY the 2-4 tests written in 7.1
    - Verify command registration works
    - Verify config parsing handles valid/invalid inputs
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 7.1 pass
- CLI command `youtube-extract <config.yaml>` works
- Clear progress messages displayed during extraction
- Error messages are actionable with installation instructions
- Success message shows generated file paths and next steps
- Command registered in main CLI (`node ./dist/index.js --help`)

---

#### Task Group 8: End-to-End Testing & Validation
**Dependencies:** Task Group 7
**Estimated Effort:** 2 hours

- [ ] 8.0 Complete end-to-end testing and validation
  - [ ] 8.1 Create test case YAML config
    - Video URL: https://www.youtube.com/watch?v=Y8M9RJ_4C7E
    - Title: "Vietnamese Children's Story"
    - 11 pages with precise timestamps (from requirements.md)
    - Page 0: youtube-intro with transcript accordion
    - Pages 1-11: Story pages with timestamps
    - Location: `examples/youtube-stories/test-story-config.yaml`
  - [ ] 8.2 Test complete extraction workflow
    - Run: `node ./dist/index.js youtube-extract examples/youtube-stories/test-story-config.yaml`
    - Verify audio downloaded to `.youtube-cache/Y8M9RJ_4C7E/audio.mp3`
    - Verify transcript downloaded to `.youtube-cache/Y8M9RJ_4C7E/transcript.json`
    - Verify 11 audio segments created in `audio-segments/`
    - Verify generated YAML file created
    - Location: Manual test or automated integration test
  - [ ] 8.3 Test YAML compilation to H5P
    - Run: `node ./dist/index.js yaml [generated-yaml] test-story.h5p`
    - Verify H5P package created successfully
    - Verify package size is reasonable (< 50MB)
    - Check for compilation errors
    - Location: Manual test
  - [ ] 8.4 Validate H5P package structure
    - Unzip test-story.h5p and inspect contents
    - Verify h5p.json has correct metadata
    - Verify content/content.json structure
    - Verify audio-segments/ files included
    - Verify placeholder image included
    - Location: Manual inspection or automated test
  - [ ] 8.5 Test H5P package on H5P.com
    - Upload test-story.h5p to H5P.com
    - Verify Interactive Book opens without errors
    - Test page 0: YouTube video plays, accordion expands/collapses
    - Test story pages: Audio plays, images display, translations expand
    - Verify Vietnamese diacritics display correctly
    - Location: Manual test on H5P.com
  - [ ] 8.6 Test caching behavior
    - Run extraction command again with same config
    - Verify cache is reused (fast execution, < 20 seconds)
    - Verify no re-download of audio or transcript
    - Location: Manual test
  - [ ] 8.7 Test error scenarios
    - Test with invalid YouTube URL
    - Test with missing ffmpeg (temporarily rename binary)
    - Test with missing yt-dlp
    - Test with video that has no captions
    - Verify error messages are clear and actionable
    - Location: Manual test or automated error tests

**Acceptance Criteria:**
- Config YAML → Generated IB YAML → Compiled H5P package workflow works
- H5P package uploads to H5P.com successfully
- Audio plays correctly in each page
- Translations display correctly with collapsible details
- YouTube embed works on first page
- Caching reduces repeat execution time to < 20 seconds
- Error messages are clear for missing dependencies and invalid inputs

---

### Phase 4: Documentation & Polish

#### Task Group 9: Documentation
**Dependencies:** Task Group 8
**Estimated Effort:** 2 hours

- [ ] 9.0 Complete user documentation
  - [ ] 9.1 Create YouTube Story Extraction user guide
    - Overview: Feature purpose and benefits (90% time savings)
    - Prerequisites: ffmpeg, yt-dlp installation instructions
    - Config YAML format: Detailed structure with examples
    - Workflow: Step-by-step guide from config to H5P
    - Troubleshooting: Common errors and solutions
    - Location: `docs/user-guides/youtube-story-extraction.md`
  - [ ] 9.2 Create example configs
    - Basic example: Simple story with placeholder images
    - Advanced example: Custom images, custom output paths
    - Minimal example: Bare minimum config
    - Include timestamps for test video (Y8M9RJ_4C7E)
    - Location: `examples/youtube-stories/`
  - [ ] 9.3 Create README for examples directory
    - Explain purpose of example configs
    - Link to main user guide
    - Instructions for running examples
    - Expected output for each example
    - Location: `examples/youtube-stories/README.md`
  - [ ] 9.4 Update main README.md
    - Add YouTube Story Extraction to feature list
    - Add quick start example in usage section
    - Link to detailed user guide
    - Add to table of contents
    - Location: `README.md`
  - [ ] 9.5 Create dependency installation guide
    - macOS: `brew install ffmpeg yt-dlp`
    - Ubuntu/Debian: `sudo apt-get install ffmpeg && pip install yt-dlp`
    - Windows: Download binaries and add to PATH
    - Verification: `ffmpeg -version && yt-dlp --version`
    - Location: Add to docs/user-guides/youtube-story-extraction.md
  - [ ] 9.6 Document placeholder image workflow
    - Provide default placeholder image in `assets/placeholder-image.png`
    - Explain how to replace placeholders with custom images
    - Document iterative workflow: Generate with placeholders → Replace images → Recompile
    - Location: Add to user guide
  - [ ] 9.7 Document API cost estimation
    - OpenAI GPT-4 cost per 1K tokens
    - Estimated tokens per page (Vietnamese + English)
    - Typical cost per story: ~$0.01 for 5-minute video
    - Location: Add to user guide

**Acceptance Criteria:**
- Comprehensive user guide covers entire workflow
- Example configs provided for basic and advanced use cases
- Installation instructions clear for all platforms (macOS, Linux, Windows)
- Placeholder image workflow documented
- API cost estimation documented
- Main README.md updated with feature

---

#### Task Group 10: Error Handling & Edge Cases
**Dependencies:** Task Group 8
**Estimated Effort:** 1.5 hours

- [ ] 10.0 Complete error handling and edge cases
  - [ ] 10.1 Add config validation
    - Validate YAML structure matches StoryConfig type
    - Check required fields: title, source.url, pages array
    - Validate timestamp format (MM:SS)
    - Validate timestamp ranges (no negatives, end > start)
    - Location: Add validation to YouTubeExtractModule
  - [ ] 10.2 Handle YouTube URL edge cases
    - Support multiple URL formats: youtube.com/watch?v=, youtu.be/, /embed/
    - Handle URLs with extra parameters (?t=, &list=, etc.)
    - Validate video ID format (11 characters, alphanumeric)
    - Location: YouTubeExtractor.extractVideoId()
  - [ ] 10.3 Handle transcript unavailable scenario
    - Check if video has captions before processing
    - Provide clear error message: "Video does not have captions"
    - Suggest workaround: "Enable captions or provide manual transcript file"
    - Location: YouTubeExtractor.extractTranscript()
  - [ ] 10.4 Handle audio splitting edge cases
    - Segment starts at 0:00 (handle start of file)
    - Segment ends at video end (handle EOF)
    - Overlapping timestamps (include shared text)
    - Very short segments (< 5 seconds warning)
    - Location: AudioSplitter validation and edge case handling
  - [ ] 10.5 Handle translation API rate limiting
    - Detect 429 rate limit errors
    - Implement exponential backoff retry
    - Max retries: 3 with delays (1s, 2s, 4s)
    - Fallback: Return untranslated text with warning
    - Location: StoryTranslator retry logic
  - [ ] 10.6 Handle file system errors
    - Check write permissions for output directories
    - Handle disk full errors gracefully
    - Clean up partial files on failure
    - Location: Error handling in all file write operations

**Acceptance Criteria:**
- Config validation catches invalid YAML structure
- YouTube URL parsing handles multiple formats
- Clear error for videos without captions
- Audio splitting handles edge cases (start, end, overlaps)
- Translation API rate limiting handled with retry logic
- File system errors handled gracefully

---

## Execution Order

Recommended implementation sequence:

1. **Phase 1 (Foundation):** Task Groups 1-4 (9 hours)
   - Build core services: Types, YouTube extraction, audio splitting, transcript matching
   - Focus on solid foundation for data extraction and processing

2. **Phase 2 (Translation & YAML):** Task Groups 5-6 (5.5 hours)
   - Add translation service and YAML generation
   - Complete the data pipeline from extraction to output

3. **Phase 3 (Integration):** Task Groups 7-8 (4 hours)
   - Build CLI command and test end-to-end workflow
   - Validate complete pipeline with real YouTube video

4. **Phase 4 (Polish):** Task Groups 9-10 (3.5 hours)
   - Documentation, error handling, edge cases
   - Production-ready feature with comprehensive docs

**Total Estimated Effort:** 22 hours (includes testing time)

---

## Testing Strategy

### Focused Testing Approach
- Each task group (1-7) writes **2-4 focused tests maximum**
- Tests cover only critical behaviors for that component
- Test verification runs ONLY newly written tests, not entire suite
- Task Group 8 provides integration testing for end-to-end workflow

### Test Coverage Summary
- **Unit tests:** ~20-28 tests total across 7 task groups
- **Integration tests:** End-to-end workflow validation in Task Group 8
- **Manual tests:** H5P.com upload and playback validation

### No Additional Test Gap Filling
- This feature uses external services (YouTube, OpenAI) extensively
- Comprehensive mocking would be time-intensive and brittle
- Focus on core logic testing and integration validation
- Production testing will validate service integration

---

## Risk Mitigation

### High-Risk Areas
1. **YouTube API Changes**
   - Risk: YouTube could change download/transcript APIs
   - Mitigation: Use established libraries (yt-dlp, youtube-transcript)
   - Mitigation: Document alternative approaches in user guide

2. **Translation Quality**
   - Risk: Translations may not be natural or context-aware
   - Mitigation: Include story context in translation prompt
   - Mitigation: Use GPT-4 for high-quality output
   - Mitigation: Support manual translation editing workflow

3. **Dependency Installation**
   - Risk: Users struggle to install ffmpeg/yt-dlp
   - Mitigation: Provide clear installation guide for all platforms
   - Mitigation: Check for dependencies and show actionable errors

### Medium-Risk Areas
1. **Timestamp Precision**
   - Risk: ffmpeg may not split at exact timestamps
   - Mitigation: Use high-precision ffmpeg flags
   - Mitigation: Target ±0.1s precision (acceptable for audio)

2. **Character Encoding**
   - Risk: Vietnamese diacritics may be corrupted
   - Mitigation: Use UTF-8 throughout entire pipeline
   - Mitigation: Test with real Vietnamese content early

---

## Dependencies

### System Dependencies
- **ffmpeg** (required): Audio splitting
- **yt-dlp** (required): YouTube audio/video download

### Node.js Dependencies
```json
{
  "dependencies": {
    "@distube/ytdl-core": "^4.13.0",
    "fluent-ffmpeg": "^2.1.2",
    "youtube-transcript": "^1.0.6",
    "js-yaml": "^4.1.0"
  }
}
```

### API Services
- **OpenAI API** (optional): Translation service
  - Requires OPENAI_API_KEY environment variable
  - Estimated cost: ~$0.01 per 5-minute video

---

## Success Metrics

### Functional Success
- [ ] Extracts audio and transcript from YouTube videos
- [ ] Splits audio at user-defined timestamps with ±0.1s precision
- [ ] Matches transcript text to each audio segment
- [ ] Translates Vietnamese to English with story context
- [ ] Generates valid Interactive Book YAML
- [ ] Compiles to H5P package that works on H5P.com

### Performance Success
- [ ] Initial run (with download): 1-2 minutes for 5-minute video
- [ ] Cached run (reprocessing): < 20 seconds
- [ ] Audio splitting: < 5 seconds for 11 segments

### User Experience Success
- [ ] Reduces manual work from 3-5 hours to 15-30 minutes (90% savings)
- [ ] Clear progress messages throughout extraction
- [ ] Actionable error messages for common issues
- [ ] Smooth workflow from config YAML to final H5P package

---

## File Structure

```
src/
├── models/
│   ├── StoryConfig.ts              # YAML config types
│   └── StoryPageData.ts            # Page data model
├── services/
│   ├── types/
│   │   └── YouTubeExtractorTypes.ts  # Service type definitions
│   ├── YouTubeExtractor.ts         # YouTube audio/transcript extraction
│   ├── AudioSplitter.ts            # ffmpeg audio segmentation
│   ├── TranscriptMatcher.ts        # Match transcript to timestamps
│   ├── StoryTranslator.ts          # OpenAI translation service
│   └── InteractiveBookYamlGenerator.ts  # YAML generation
├── youtube-extract-module.ts       # CLI command module
└── index.ts                        # Register new command

tests/
├── unit/
│   ├── YouTubeExtractor.test.ts
│   ├── AudioSplitter.test.ts
│   ├── TranscriptMatcher.test.ts
│   ├── StoryTranslator.test.ts
│   ├── InteractiveBookYamlGenerator.test.ts
│   └── youtube-extract.test.ts
└── integration/
    └── youtube-extract-e2e.test.ts

examples/
└── youtube-stories/
    ├── README.md
    ├── test-story-config.yaml
    ├── basic-example.yaml
    └── advanced-example.yaml

docs/
└── user-guides/
    └── youtube-story-extraction.md

assets/
└── placeholder-image.png

.youtube-cache/              # Git-ignored cache directory
└── VIDEO_ID/
    ├── audio.mp3
    ├── transcript.json
    └── translations.json

audio-segments/              # Generated audio files
└── page*.mp3
```
