# Specification: Whisper API Transcription Integration

## Goal
Replace yt-dlp auto-generated captions with OpenAI Whisper API for high-quality transcription with accurate diacritics, punctuation, and capitalization, especially for non-English languages like Vietnamese.

## Problem Statement
Current yt-dlp transcription has critical quality issues:
- **Missing diacritics**: Vietnamese "trời" becomes "troi" (changes meaning)
- **Poor punctuation**: No periods, commas, or proper sentence structure
- **Inconsistent capitalization**: All lowercase or random caps
- **Not always available**: Many videos lack captions entirely
- **English is marginal**: Better than Vietnamese but still error-prone

User testing shows **stark quality difference** between yt-dlp and Gemini/Whisper transcriptions. Using low-quality transcripts defeats the purpose of automation - users spend hours manually correcting text.

## Solution: Whisper API as Primary Transcription Method

### Why Whisper API?
1. **95-98% accuracy** for Vietnamese vs 70-85% for yt-dlp
2. **Proper diacritics, punctuation, capitalization** - ready to use
3. **Works for any video** - no dependency on captions existing
4. **Already integrated** - openai package installed, API key configured
5. **Negligible cost** - $0.006/min ($0.03 for 5-min video, $0.18 for 30-min)
6. **Fast to implement** - No local dependencies, no installation friction
7. **Consistent results** - Same quality across all machines

### Cost Analysis
```
5-minute video: $0.03
10-minute video: $0.06
30-minute video: $0.18

vs Manual correction of yt-dlp output:
1-2 hours @ $20/hr = $20-40

vs Manual transcription from scratch:
3-5 hours @ $20/hr = $60-100

ROI: 99.7% cost savings with Whisper API
```

## User Stories
- As a Vietnamese language teacher, I want accurate transcriptions with proper diacritics and punctuation so that my interactive storybooks display correctly formatted Vietnamese text without manual correction
- As a content creator, I want reliable transcription that works for any YouTube video so that I can create story content without worrying about caption availability
- As a developer, I want a simple, maintainable transcription solution so that I can focus on features instead of debugging multiple backends

## Specific Requirements

### Core Transcription Service

**WhisperTranscriptionService**
- Single-purpose service class in `src/services/transcription/WhisperTranscriptionService.ts`
- Use OpenAI Whisper API endpoint for cloud-based transcription
- Leverage existing openai package dependency (v6.8.1 in package.json)
- Support OPENAI_API_KEY environment variable for authentication
- Upload audio file via `openai.audio.transcriptions.create()` method
- Request verbose JSON format with timestamps: `response_format: "verbose_json"`
- Parse API response and convert to TranscriptSegment format
- Return standardized TranscriptSegment array with startTime, endTime, text
- Handle API errors gracefully with retry logic for transient failures
- Provide clear error messages for authentication failures or rate limits
- Cache transcriptions in `.youtube-cache/VIDEO_ID/whisper-transcript.json`
- Estimate and log API costs before and after processing

**Response Format**
```typescript
interface WhisperResponse {
  text: string;
  segments: Array<{
    id: number;
    start: number;  // seconds
    end: number;    // seconds
    text: string;
  }>;
  language: string;
}
```

### Integration with YouTubeExtractor

**Replace Existing Transcription**
- Remove `extractTranscriptWithYtDlp()` method and yt-dlp transcript logic
- Add WhisperTranscriptionService instance to YouTubeExtractor constructor
- Update `extract()` method to use Whisper API for transcription
- Maintain existing caching structure in `.youtube-cache/VIDEO_ID/` directory
- Preserve TranscriptSegment interface compatibility for TranscriptMatcher
- Display cost estimate before processing: "Estimated transcription cost: $0.06"
- Show progress during API call: "Transcribing with Whisper API..."
- Log final cost: "Transcription complete. Cost: $0.06"

**Error Handling**
- Check for OPENAI_API_KEY before attempting transcription
- Provide clear error if API key missing: "OPENAI_API_KEY not found in environment"
- Retry failed API calls up to 3 times with exponential backoff
- Display user-friendly errors for common issues:
  - "Authentication failed - check OPENAI_API_KEY"
  - "Rate limit exceeded - please wait and try again"
  - "Audio file too large - maximum 25MB supported"
  - "Network error - check internet connection"

### Configuration

**YAML Story Config (Optional)**
```yaml
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=VIDEO_ID"
  transcription:
    language: vi  # Optional, defaults to story language
```

**Environment Variables**
- `OPENAI_API_KEY`: Required for Whisper API access (already in use for translations)
- No additional configuration needed - uses existing OpenAI setup

**CLI Options**
- No new flags needed for MVP
- Use existing `--verbose` flag to show detailed transcription progress
- Future: Add `--transcription-language` to override language detection

### Caching Strategy

**Cache Structure**
```
.youtube-cache/
  VIDEO_ID/
    audio.mp3              # Existing audio cache
    whisper-transcript.json # New Whisper transcript cache
    cache-metadata.json    # Existing metadata
    translations.json      # Existing translation cache
```

**Cache Metadata**
```json
{
  "videoId": "Y8M9RJ_4C7E",
  "transcription": {
    "provider": "whisper-api",
    "model": "whisper-1",
    "language": "vi",
    "timestamp": "2025-11-13T10:30:00Z",
    "cost": 0.06,
    "duration": 600
  }
}
```

**Cache Behavior**
- Check for `whisper-transcript.json` before making API call
- Reuse cached transcript if available (show "Using cached transcript")
- Invalidate cache if audio file changed or doesn't match metadata
- Display cache hit rate in verbose mode

### Progress Feedback

**User Experience Flow**
```bash
$ node ./dist/index.js youtube-extract story.yaml --verbose

📥 Downloading audio from YouTube...
   Audio cached: .youtube-cache/Y8M9RJ_4C7E/audio.mp3

📝 Transcribing with Whisper API...
   Language: Vietnamese (vi)
   Duration: 10.0 minutes
   Estimated cost: $0.06

   Transcription in progress... ⏳

✅ Transcription complete!
   Segments: 87
   Accuracy: High confidence
   Actual cost: $0.06
   Cached: .youtube-cache/Y8M9RJ_4C7E/whisper-transcript.json

🔄 Matching transcript to audio segments...
...
```

**Verbose Mode Details**
- API request details (endpoint, model, format)
- Response parsing progress
- Segment count and timing validation
- Cache read/write operations

## Existing Code to Leverage

### YouTubeExtractor Service
- Use existing `downloadAudio()` method to obtain audio files
- Maintain caching strategy in `.youtube-cache/VIDEO_ID/` directory
- Follow existing error handling patterns with descriptive messages
- Preserve UTF-8 encoding and Vietnamese diacritics handling
- Use existing chalk-based progress messages

### TranscriptSegment Type System
- Use existing TranscriptSegment interface from `YouTubeExtractorTypes.ts`
- Maintain startTime and endTime as number (seconds with decimals)
- Preserve text field as UTF-8 string with diacritics
- TranscriptMatcher service already handles these segments correctly

### OpenAI Integration Patterns
- Follow QuizGenerator and StoryTranslator patterns for API integration
- Use existing openai package dependency (v6.8.1)
- Implement retry logic for transient failures (copy from StoryTranslator)
- Cache API responses to reduce costs and improve performance
- Use environment variable OPENAI_API_KEY for authentication
- Handle API errors gracefully with user-friendly messages

### Service Architecture Patterns
- Follow existing service pattern from YouTubeExtractor, AudioSplitter
- Implement constructor with OpenAI client parameter
- Use async/await for all I/O operations
- Provide clear method signatures with TypeScript types
- Cache results to disk for fast iteration

## Implementation Plan

### Phase 1: Core Service (2-3 hours)
1. Create `src/services/transcription/WhisperTranscriptionService.ts`
2. Implement `transcribe(audioPath: string, language: string)` method
3. Parse Whisper verbose_json response to TranscriptSegment array
4. Add file-based caching with cache validation
5. Implement cost estimation and logging
6. Write unit tests with mocked OpenAI responses

### Phase 2: Integration (1-2 hours)
1. Update YouTubeExtractor to use WhisperTranscriptionService
2. Remove yt-dlp transcript extraction code
3. Update cache metadata structure
4. Add progress feedback messages
5. Update integration tests

### Phase 3: Testing & Validation (1 hour)
1. Test with Vietnamese video (Y8M9RJ_4C7E)
2. Test with English video
3. Verify caching works correctly
4. Compare output quality with existing Gemini transcript
5. Validate cost tracking accuracy

### Phase 4: Documentation (30 min)
1. Update youtube-story-extraction.md user guide
2. Add transcription quality comparison section
3. Document cost transparency
4. Add troubleshooting section for API errors

**Total Estimated Time: 4-6 hours**

## Testing Strategy

### Unit Tests
- Mock OpenAI API responses with sample Whisper output
- Test TranscriptSegment conversion from Whisper format
- Verify caching behavior (cache hit, cache miss, cache invalidation)
- Test error handling for various API failure scenarios
- Validate cost calculation accuracy

### Integration Tests
- Run full extraction with real YouTube video and Whisper API
- Compare Vietnamese diacritics accuracy vs yt-dlp
- Verify transcript matches audio timing
- Test cache reuse across multiple runs
- Validate TranscriptMatcher compatibility

### Quality Validation
- Compare Whisper output with known-good Gemini transcript
- Check for proper Vietnamese diacritics (ơ, ư, â, ă, etc.)
- Verify punctuation and capitalization
- Ensure sentence structure is natural
- Validate timestamp accuracy

## Success Metrics

### Quality Improvements
- **Target**: 95%+ transcription accuracy for Vietnamese
- **Baseline**: 70-85% accuracy with yt-dlp
- **Measure**: Manual review of 5-10 test videos

### User Experience
- **Target**: Zero manual transcript correction needed
- **Baseline**: 1-2 hours correction time per video with yt-dlp
- **Measure**: User feedback and time tracking

### Cost Effectiveness
- **Target**: <$0.20 per typical 30-minute video
- **Baseline**: $60-100 for manual transcription
- **ROI**: 99.7% cost reduction

### Reliability
- **Target**: 99% success rate for transcription
- **Baseline**: 60-70% caption availability with yt-dlp
- **Measure**: Success rate across 20+ test videos

## Future Enhancements (Out of MVP Scope)

### Phase 2: Local Whisper Support (Optional)
**When**: Only if users request it for bulk processing or privacy
**Why**: Enterprise users may want local processing for:
- Bulk video processing (hundreds of videos)
- Privacy requirements (no cloud uploads)
- No per-video costs

**Implementation**:
- Add WhisperLocalBackend with Python/Whisper CLI integration
- Provide installation guide (pip install openai-whisper)
- Require explicit opt-in via `--transcription-provider=whisper-local`
- Support model selection (tiny to large)
- Show GPU availability and processing time estimates

### Phase 3: YtDlp Fallback (Maybe Never)
**When**: Only if cost becomes a concern (unlikely)
**Why**: Free but low quality

**Implementation**:
- Keep yt-dlp code but mark as deprecated
- Only use if user explicitly opts in via `--transcription-provider=yt-dlp`
- Show quality warning before processing
- Recommend Whisper API as better alternative

### Other Future Options
- Support for other languages (already works, just document)
- Word-level timestamps for more precise audio splitting
- Custom Whisper fine-tuned models for domain-specific vocabulary
- Batch API support for multiple videos (when OpenAI releases it)

## Out of Scope

### Never Plan to Support
- Automatic language detection (user specifies in YAML)
- Video transcription without audio (Whisper is audio-only)
- Other transcription services (Google, AWS) - Whisper is best
- Real-time/streaming transcription (batch only)
- Transcript editing UI (users can edit YAML/generated content)
- Speaker diarization (single narrator videos)
- Frame-level timestamp alignment (audio timing sufficient)
- Custom model training (Whisper-1 is excellent as-is)
- Parallel video processing (one video at a time)

## Key Decisions

### Why Remove YtDlp Entirely?
1. **Quality is unacceptable** - Users would constantly complain
2. **Whisper cost is negligible** - $0.03-0.18 per video is nothing
3. **Simpler codebase** - No backend abstraction needed
4. **Better UX** - Consistent high quality, no "why is this bad?" questions
5. **Faster to MVP** - One path = less code, less testing

### Why Not Local Whisper in MVP?
1. **Installation friction** - Python, pip, models, GPU concerns
2. **Support burden** - "Why is it slow?" "Do I need a GPU?"
3. **Not needed** - Whisper API solves the problem perfectly
4. **Can add later** - If enterprise users need it, we'll know

### Why Whisper Over Other APIs?
1. **Best accuracy** - Industry-leading speech recognition
2. **OpenAI ecosystem** - Already using for translations
3. **Simple integration** - One API client for everything
4. **Well documented** - Excellent docs and examples
5. **Actively maintained** - OpenAI commitment to Whisper
