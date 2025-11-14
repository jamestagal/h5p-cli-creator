# Specification: YouTube Extraction Improvements

## Goal
Improve YouTube story extraction organization and cost efficiency by co-locating audio segments within video cache directories and enabling video time range specification to reduce Whisper API transcription costs.

## User Stories
- As an educator creating interactive books from YouTube videos, I want to specify which portion of the video to transcribe, so that I only pay for transcription of the relevant content and skip intros/outros.
- As a developer maintaining the h5p-cli-creator tool, I want all assets for a video stored together in the cache directory, so that cleanup, organization, and debugging are straightforward.

## Specific Requirements

**Relocate Audio Segments to Cache Directory**
- Audio segments currently stored in root `audio-segments/` folder must be moved to `.youtube-cache/{VIDEO_ID}/audio-segments/`
- AudioSplitter constructor must accept outputDirectory parameter from youtube-extract-module with video-specific path
- All video-related files (audio.mp3, whisper-transcript.json, cache-metadata.json, audio-segments/) co-located in single directory
- Deleting cache directory removes all associated assets including segments
- Maintain existing naming convention: page1.mp3, page2.mp3, etc.
- youtube-extract-module must pass `.youtube-cache/{VIDEO_ID}/audio-segments/` to AudioSplitter
- InteractiveBookYamlGenerator must reference segments with correct path relative to working directory
- No breaking changes to existing API or workflow

**Support Video Time Range Specification**
- Add optional `source.startTime` field to config YAML schema (MM:SS or HH:MM:SS format)
- Add optional `source.endTime` field to config YAML schema (MM:SS or HH:MM:SS format)
- Validate startTime < endTime before extraction begins
- Validate range is within video duration using metadata
- Extract only specified time range from video using ffmpeg trimming
- Transcribe only trimmed audio with Whisper API (not full video)
- Display cost savings in console: "Transcribing 5:30 (saved 3:15, $0.02)"
- Page timestamps are relative to trimmed audio start (00:00), not original video
- If no startTime/endTime specified, extract full video (backward compatible)

**Update Cache Metadata Structure**
- Store `source.startTime` and `source.endTime` in cache-metadata.json when specified
- Display extraction range in console: "Extracted 01:30-15:00 from video"
- Cache metadata tracks trimmed audio parameters for future reference
- Existing cache files without range metadata remain valid (backward compatible)

**Audio Extraction and Trimming Strategy**
- Download full video audio first using yt-dlp (yt-dlp cannot download partial ranges)
- Trim audio using ffmpeg with `-ss` (start seek) and `-to` (end time) flags immediately after download
- Overwrite audio.mp3 in cache with trimmed version
- All subsequent operations (transcription, splitting) work with trimmed audio
- Trimming adds minimal overhead (<2 seconds) using copy codec

**Page Timestamp Validation and Adjustment**
- Validate all page timestamps are within trimmed audio duration
- Page startTime "00:00" maps to source.startTime in original video
- Page endTime must not exceed (source.endTime - source.startTime)
- Clear error messages for out-of-range page timestamps: "Page 3 endTime 10:30 exceeds trimmed audio duration 8:45"
- Documentation examples showing relationship between source range and page timestamps

**Cost Calculation and Transparency**
- Calculate Whisper API cost based on trimmed audio duration only
- Display cost savings: "Original video: 20:00 ($0.12), Trimming to: 17:00 ($0.10), Savings: $0.02"
- Log trimmed duration in minutes and cost estimate before API call
- Update cost display in cache metadata for trimmed extractions

**Config Schema Changes**
- Extend StoryConfig source interface with optional startTime and endTime string fields
- Add validation functions for time range format and logical consistency
- Support both MM:SS and HH:MM:SS formats for ranges (not just MM:SS like pages)
- Preserve backward compatibility: omitting fields extracts full video

**ffmpeg Trimming Implementation**
- Use `ffmpeg -y -i input.mp3 -ss START_SECONDS -to END_SECONDS -c copy trimmed.mp3`
- Start and end times in decimal seconds (convert from MM:SS format)
- Copy codec avoids re-encoding (fast, no quality loss)
- High-precision seeking for accurate trimming
- Replace original audio.mp3 with trimmed version in cache

## Visual Design
No visual assets provided for this specification.

## Existing Code to Leverage

**AudioSplitter Constructor Pattern**
- Already accepts optional outputDirectory parameter (defaults to ./audio-segments)
- Simply pass video-specific path from youtube-extract-module
- No internal changes needed to AudioSplitter class
- Path construction: `path.join(extractor.getCacheDirectory(videoId), "audio-segments")`

**YouTubeExtractor Cache Management**
- getCacheDirectory(videoId) provides base directory for video assets
- isCached() checks for audio.mp3 and whisper-transcript.json presence
- saveCacheMetadata() and loadCacheMetadata() handle metadata persistence
- Extend CacheMetadata interface to include startTime/endTime fields

**AudioSplitter Timestamp Parsing**
- parseTimestamp() method handles both MM:SS and HH:MM:SS formats
- formatTimestamp() converts seconds back to display strings
- validateTimestamps() checks ranges and overlaps
- Reuse parsing logic for source.startTime and source.endTime validation

**ffmpeg Audio Processing**
- AudioSplitter already uses ffmpeg for segment generation with copy codec
- Same command pattern: `ffmpeg -y -i input -ss START -to END -c copy output`
- Add trimming step in YouTubeExtractor.downloadAudio() after yt-dlp completes
- Trimming code nearly identical to segment generation but overwrites audio.mp3

**Whisper API Cost Calculation**
- WhisperTranscriptionService uses getAudioDuration() for cost estimation
- Cost calculation: `durationMinutes * 0.006`
- Already displays cost in console before and after transcription
- Extend to show savings when using trimmed audio vs full video

## Out of Scope
- UI for visually selecting time ranges (future enhancement)
- Visual timeline preview of video segments (future enhancement)
- Automatic intro/outro detection using AI (future enhancement)
- Re-transcription of existing cached videos with new ranges
- Migration script to move existing audio-segments/ to cache directories
- Support for multiple non-contiguous time ranges in single extraction
- Trimming during download (yt-dlp limitation)
- Server-side Whisper API range specification (API limitation)
- Automatic cost optimization recommendations
- Batch processing of multiple videos with different time ranges
