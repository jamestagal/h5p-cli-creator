# Specification: YouTube Transcription Alternatives with Whisper Integration

## Goal
Improve YouTube story extraction transcription quality by integrating OpenAI Whisper as an alternative to yt-dlp auto-generated captions, especially for non-English languages like Vietnamese that require accurate diacritics and punctuation.

## User Stories
- As a Vietnamese language teacher, I want accurate transcriptions with proper diacritics and punctuation so that my interactive storybooks display correctly formatted Vietnamese text
- As a content creator, I want a fallback transcription option when YouTube videos lack captions so that I can still create story content from any video

## Specific Requirements

**Multi-Backend Transcription Architecture**
- Implement TranscriptionBackend interface with validate(), transcribe(), and getBackendName() methods
- Support pluggable backends: YtDlpBackend (existing), WhisperLocalBackend, WhisperAPIBackend
- Each backend returns standardized TranscriptSegment array with startTime, endTime, text
- TranscriptionService orchestrates backend selection and fallback logic
- Preserve existing YouTubeExtractor interface while delegating transcription to new service
- Enable runtime backend selection via configuration or CLI flags

**YtDlp Transcription Backend (Existing)**
- Refactor extractTranscriptWithYtDlp() from YouTubeExtractor into YtDlpBackend class
- Maintain existing VTT subtitle download and parsing logic
- Support auto-generated and manual captions from YouTube
- Return transcripts with timestamps in seconds (floating point)
- Handle missing captions gracefully with descriptive error message
- Preserve Vietnamese diacritics and UTF-8 encoding
- Serve as default fast backend when captions are available

**Whisper Local Transcription Backend**
- Download audio using existing YouTubeExtractor.downloadAudio() method
- Execute Whisper CLI command: `whisper audio.mp3 --model medium --language vi --task transcribe --output_format json`
- Parse Whisper JSON output containing word-level and segment-level timestamps
- Convert Whisper timestamps to TranscriptSegment format matching existing interface
- Support model selection: tiny, base, small, medium, large (configurable via CLI or config)
- Detect if Whisper is installed via `whisper --version` command check
- Provide clear installation instructions if Whisper not found: pip install openai-whisper
- Cache Whisper transcriptions alongside audio in .youtube-cache/VIDEO_ID/ directory
- Estimate processing time and display progress feedback during transcription

**Whisper API Transcription Backend**
- Use OpenAI Whisper API endpoint for cloud-based transcription
- Leverage existing openai package dependency (already in package.json)
- Support OPENAI_API_KEY environment variable for authentication
- Upload audio file to Whisper API using openai.audio.transcriptions.create()
- Request JSON format with timestamps: response_format="verbose_json"
- Parse API response and convert to TranscriptSegment format
- Handle API errors gracefully with retry logic for transient failures
- Cache API transcriptions to avoid reprocessing and reduce costs
- Estimate and log API costs (approximately $0.006 per minute of audio)
- Provide clear error messages for authentication failures or rate limits

**Fallback and Priority Strategy**
- Default priority order: YtDlp (fastest) -> Whisper Local (accurate, free) -> Whisper API (accurate, paid)
- If YtDlp fails (no captions), automatically attempt next backend in priority order
- Allow users to override priority order via CLI flag: --transcription-backend="whisper-local,yt-dlp"
- Support skip-fallback flag to fail fast without trying alternatives
- Log which backend was used for each transcription attempt
- Display clear messages when falling back to alternative backend
- Allow forcing specific backend via --force-backend=whisper-api flag

**Configuration and CLI Integration**
- Add CLI flags to youtube-extract command: --transcription-backend, --whisper-model, --force-backend, --skip-fallback
- Support transcription configuration in YAML story config file under transcription section
- Environment variables: WHISPER_MODEL, TRANSCRIPTION_BACKEND, OPENAI_API_KEY
- Configuration precedence: CLI flags > YAML config > environment variables > defaults
- Default backend priority: "yt-dlp,whisper-local,whisper-api"
- Default Whisper model: "medium" (balance of speed and accuracy)
- Validate configuration before starting extraction process

**Dependency Management and Validation**
- Check for optional dependencies before using them: whisper CLI, ffmpeg, yt-dlp
- Display helpful installation instructions when dependencies are missing
- Gracefully degrade when optional backends are unavailable
- Provide system dependency check command: node ./dist/index.js check-deps
- Document installation instructions for each transcription backend
- Support --dry-run flag to validate configuration without processing

**Progress Feedback and User Experience**
- Display progress messages during transcription: "Transcribing with Whisper (medium model)..."
- Show estimated time remaining for Whisper local processing
- Display backend used in success message: "Transcription complete using Whisper Local"
- Log processing time for each backend attempt
- Provide verbose mode flag for detailed logging of backend selection and fallback
- Display clear error messages with actionable next steps when all backends fail

**Testing and Validation Strategy**
- Unit tests for each TranscriptionBackend implementation with mock audio files
- Integration tests comparing YtDlp vs Whisper transcription accuracy
- Test fallback logic by simulating backend failures
- Validate transcript quality for Vietnamese diacritics across backends
- Test caching behavior to ensure transcripts are reused correctly
- Performance benchmarks comparing backend processing times
- Cost estimation tests for Whisper API usage

## Visual Design
No visual assets provided in planning folder.

## Existing Code to Leverage

**YouTubeExtractor Service**
- Use existing extractTranscriptWithYtDlp() logic as foundation for YtDlpBackend
- Leverage downloadAudio() method to obtain audio files for Whisper processing
- Maintain caching strategy in .youtube-cache/VIDEO_ID/ directory structure
- Follow existing error handling patterns with descriptive error messages
- Preserve UTF-8 encoding and Vietnamese diacritics handling
- Use existing checkYtDlpInstalled() pattern for dependency validation

**TranscriptSegment Type System**
- Use existing TranscriptSegment interface from YouTubeExtractorTypes.ts
- Maintain startTime and endTime as number (seconds with decimals)
- Preserve text field as UTF-8 string with diacritics
- Ensure all backends return compatible TranscriptSegment arrays
- TranscriptMatcher service already handles these segments correctly

**OpenAI Integration Patterns**
- Follow QuizGenerator and StoryTranslator patterns for OpenAI API integration
- Use existing openai package dependency (v6.8.1 in package.json)
- Implement retry logic for transient API failures
- Cache API responses to reduce costs and improve performance
- Use environment variable OPENAI_API_KEY for authentication
- Handle API errors gracefully with user-friendly messages

**Service Architecture Patterns**
- Follow existing service pattern from YouTubeExtractor, TranscriptMatcher, AudioSplitter
- Implement constructor with optional configuration parameters
- Use async/await for all I/O operations
- Provide clear method signatures with TypeScript types
- Cache results to disk for fast iteration
- Handle errors with descriptive messages and recovery suggestions

**CLI Command Integration**
- Extend existing youtube-extract-module.ts with new CLI options
- Use yargs for parsing command-line flags and options
- Follow existing pattern for environment variable support
- Display progress messages using console.log with chalk for coloring
- Validate inputs before starting processing
- Provide --help documentation for new transcription options

## Out of Scope
- Automatic language detection (user must specify language for Whisper)
- Support for video transcription without audio extraction (Whisper works on audio only)
- Integration with other transcription services beyond Whisper (Google Speech-to-Text, AWS Transcribe)
- Real-time transcription or streaming transcription (batch processing only)
- Transcript editing UI or manual correction workflow
- Speaker diarization or multi-speaker identification
- Automatic timestamp alignment with video frames
- Custom Whisper model training or fine-tuning
- Whisper model quantization or optimization for faster CPU processing
- Batch transcription of multiple videos in parallel
