# Specification: YouTube Story Extraction for Interactive Books

## Goal
Automate the creation of Interactive Book digital storybooks from YouTube videos by extracting audio, transcripts, and translations based on user-defined timestamps, reducing manual work from 3-5 hours to 15-30 minutes per story.

## User Stories
- As a Vietnamese language teacher, I want to extract audio segments from a YouTube video at specific timestamps so that I can create interactive storybook pages without manual audio editing
- As a content creator, I want the tool to automatically extract Vietnamese transcripts and translate them to English so that I can provide bilingual learning materials

## Specific Requirements

**YAML-First Configuration Approach**
- User defines story structure in YAML config file with source video URL, page timestamps, and translation settings
- Config includes page-level overrides for custom images or placeholder images
- First page is special type "youtube-intro" for video embed and full transcript accordion
- Story pages include startTime and endTime in MM:SS format for audio segmentation
- Support both collapsible and inline translation styles using HTML details element
- Config is passed to CLI command: `node ./dist/index.js youtube-extract config.yaml`

**YouTube Audio Extraction Service**
- Download audio from YouTube URL using yt-dlp system dependency
- Cache downloaded audio in `.youtube-cache/VIDEO_ID/` directory structure
- Reuse cached audio on subsequent runs to enable fast iteration on timestamps
- Output audio format: MP3 for universal H5P compatibility
- Validate YouTube URL format before attempting download
- Handle download failures with clear error messages about yt-dlp installation

**YouTube Transcript Extraction Service**
- Extract video transcript with timestamps using youtube-transcript API
- Support auto-generated captions and manual captions
- Cache transcript data alongside audio in `.youtube-cache/VIDEO_ID/` directory
- Handle videos without captions by providing clear error message with fallback instructions
- Preserve Vietnamese diacritics and special characters correctly

**Audio Segmentation Service**
- Split cached audio at user-defined timestamps using ffmpeg
- Use copy codec (no re-encoding) to preserve audio quality
- Output segments to `audio-segments/` directory with sequential naming: page1.mp3, page2.mp3
- Validate timestamp format and ranges before processing
- Handle edge cases: overlapping timestamps, timestamps beyond video duration
- Achieve precision within 0.1 seconds of specified timestamps

**Transcript Matching Service**
- Match transcript segments to timestamp ranges for each page
- Extract Vietnamese text for each page based on timestamp boundaries
- Handle timestamp overlaps gracefully by including overlapping text
- Preserve punctuation, paragraph breaks, and formatting from original transcript
- Concatenate multiple transcript segments into cohesive page text

**Translation Service with Context Awareness**
- Translate Vietnamese text to English using OpenAI GPT API
- Provide story context to translation model for narrative consistency across pages
- Use system prompt to request natural, readable English translations
- Cache translations to avoid reprocessing and reduce API costs
- Handle translation failures gracefully with fallback to untranslated text
- Estimate and log API costs per story (approximately $0.01 per 5-minute video)

**Interactive Book YAML Generation**
- Generate valid Interactive Book YAML from extracted data
- Page 0: YouTube iframe embed plus accordion with full transcript
- Story pages: Image path, audio path, Vietnamese text, collapsible English translation
- Use HTML details element for collapsible translations: `<details><summary>English</summary><p><em>Translation...</em></p></details>`
- Reference audio segments with relative paths: `../audio-segments/page1.mp3`
- Use placeholder image paths or custom image paths as specified in config
- Output generated YAML to file specified in config or default to `{video-id}-story.yaml`

**Placeholder Image Workflow**
- Provide default placeholder image in project assets
- Reference placeholder in generated YAML when page config sets `placeholder: true`
- Support custom image paths when user provides `image: ./path/to/image.jpg`
- Document image replacement workflow for iterative content improvement
- Copy custom images to appropriate directories during YAML generation

**CLI Command Module Integration**
- Implement YamlInputParser integration for parsing YouTube story config files
- Create dedicated CLI command: `youtube-extract <config.yaml>`
- Display progress messages during extraction, segmentation, translation, YAML generation
- Show clear error messages for missing dependencies (ffmpeg, yt-dlp not installed)
- Output success message with generated file paths and next step instructions
- Support verbose mode flag for detailed logging of each processing step

## Visual Design
No visual assets provided in planning folder.

## Existing Code to Leverage

**YamlInputParser and Type System**
- Use YamlInputParser.parseYamlFile() for reading and validating YAML config files
- Extend ContentType union with new types: "youtube-intro", "youtube-page"
- Follow existing BookDefinition pattern with chapters array and content items
- Leverage path resolution logic from resolveContentPaths() for audio and image files
- Use existing AIConfiguration cascade pattern for translation service integration

**HandlerContext and ContentHandler Pattern**
- Implement handlers following ContentHandler interface: getContentType(), process(), validate(), getRequiredLibraries()
- Use HandlerContext for accessing ChapterBuilder, LibraryRegistry, Logger, and options
- Follow error handling pattern from AITextHandler: try-catch with graceful fallbacks
- Register new handlers in HandlerRegistry for automatic discovery

**H5pCompiler Compilation Pipeline**
- Use H5pCompiler.compile() for generating final .h5p package from generated YAML
- Leverage LibraryRegistry for fetching required H5P libraries (H5P.Video, H5P.Accordion)
- Follow ContentBuilder pattern for adding content items to chapters
- Use PackageAssembler for final ZIP packaging with proper H5P structure

**QuizGenerator AI Integration Patterns**
- Follow QuizGenerator pattern for OpenAI API integration with error handling
- Use environment variable OPENAI_API_KEY or ANTHROPIC_API_KEY for authentication
- Implement retry logic for transient API failures
- Cache AI-generated content to reduce API calls and costs
- Use AIPromptBuilder for consistent prompt construction with system instructions

**Existing Audio/Image Handling**
- Reference AudioHandler and ImageHandler for media file processing patterns
- Use ChapterBuilder.addAudioPage() and ChapterBuilder.addImagePage() methods
- Follow MediaFile tracking pattern for managing media assets
- Leverage existing URL vs local file detection logic from content handlers

## Out of Scope
- Automatic timestamp detection using AI or audio analysis (future enhancement)
- Video frame extraction for images (future enhancement)
- AI image generation integration (future enhancement)
- Batch processing multiple videos simultaneously (future enhancement)
- Web UI for visual timestamp editor (future enhancement)
- Integration with Concept Extraction pipeline for vocabulary flashcards (future enhancement)
- Quiz generation from story content (future enhancement)
- Audio pronunciation highlighting synchronized with text (future enhancement)
- Support for languages other than Vietnamese to English translation (future enhancement)
- Custom translation service providers beyond OpenAI (future enhancement)
