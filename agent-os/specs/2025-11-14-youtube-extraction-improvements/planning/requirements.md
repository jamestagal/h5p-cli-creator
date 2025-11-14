# Requirements: YouTube Extraction Improvements

## Overview
Two enhancements to the YouTube story extraction workflow to improve organization and reduce costs.

## Problem Statement

### Problem 1: Audio Segments Not Co-located with Video Cache
**Current State:**
- Video cache stored in `.youtube-cache/{VIDEO_ID}/`
- Contains: `audio.mp3`, `whisper-transcript.json`, `cache-metadata.json`
- Audio segments stored separately in root `audio-segments/` folder

**Issues:**
- Assets for a video scattered across multiple locations
- Difficult to clean up cache for specific video
- Audio segments not video-specific (global folder)
- No clear relationship between cache and segments

**Impact:**
- Poor organization and maintainability
- Risk of orphaned segment files
- Harder to manage disk space

### Problem 2: Cannot Specify Video Time Range for Transcription
**Current State:**
- Whisper API transcribes entire video audio
- No way to specify start/end times for transcription
- Full video transcription even if only segment needed

**Issues:**
- Unnecessary transcription costs ($0.006/minute for unused portions)
- Longer processing time
- Common use case not supported: Skip intro/outro, extract specific segments

**Example:**
- 20-minute educational video with 2-minute intro, 1-minute outro
- Only need middle 17 minutes
- Currently pays for full 20 minutes ($0.12 vs $0.10)
- For 100 videos: $12 wasted

**Impact:**
- Higher operational costs
- Slower processing
- Less flexible workflow

## User Stories

### Story 1: Educator Creates Story from Video Segment
**As an** educator creating interactive books from YouTube videos,
**I want to** specify which portion of the video to transcribe,
**So that** I only pay for transcription of the relevant content and skip intros/outros.

**Acceptance Criteria:**
- Can specify `source.startTime` and `source.endTime` in config YAML
- Only specified range is transcribed with Whisper API
- Page timestamps are relative to trimmed audio (not full video)
- Omitting start/end times transcribes full video (backward compatible)
- Cost savings reflected in console output

**Example Config:**
```yaml
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=VIDEO_ID"
  startTime: "01:30"  # Skip 90s intro
  endTime: "15:00"    # Skip outro after 15:00

pages:
  - title: "Page 1"
    startTime: "00:00"  # Relative to 01:30 in video
    endTime: "00:45"
```

### Story 2: Developer Manages Video Cache Efficiently
**As a** developer maintaining the h5p-cli-creator tool,
**I want** all assets for a video stored together in the cache directory,
**So that** cleanup, organization, and debugging are straightforward.

**Acceptance Criteria:**
- Audio segments stored in `.youtube-cache/{VIDEO_ID}/audio-segments/`
- Cache directory contains all video-related files
- Deleting cache directory removes all associated assets
- Existing workflow continues to work (no breaking changes)

**New Structure:**
```
.youtube-cache/Y8M9RJ_4C7E/
├── audio.mp3
├── whisper-transcript.json
├── cache-metadata.json
└── audio-segments/
    ├── page1.mp3
    ├── page2.mp3
    └── ...
```

## Functional Requirements

### Feature 1: Audio Segments in Cache Directory

**FR-1.1: Audio Segment Output Directory**
- MUST store audio segments in `.youtube-cache/{VIDEO_ID}/audio-segments/`
- MUST create `audio-segments/` subdirectory automatically
- MUST maintain sequential naming: `page1.mp3`, `page2.mp3`, etc.

**FR-1.2: Backward Compatibility**
- MUST work with existing YAML handler code
- MUST update references in InteractiveBookAIHandler
- MUST update references in youtube-extract-module

**FR-1.3: Cleanup Behavior**
- Deleting `.youtube-cache/{VIDEO_ID}/` MUST remove all segments
- Cache invalidation MUST remove segments along with other cache files

### Feature 2: Video Time Range Specification

**FR-2.1: Config Schema Extension**
- MUST support optional `source.startTime` field (MM:SS or HH:MM:SS format)
- MUST support optional `source.endTime` field (MM:SS or HH:MM:SS format)
- MUST validate that `startTime < endTime`
- MUST validate that range is within video duration

**FR-2.2: Audio Extraction**
- MUST extract only specified time range from video
- MUST use ffmpeg to trim audio before transcription
- MUST save trimmed audio as `audio.mp3` in cache
- If no range specified, MUST extract full video (backward compatible)

**FR-2.3: Transcription Cost Optimization**
- MUST transcribe only trimmed audio (not full video)
- MUST calculate cost based on trimmed duration
- MUST display cost savings in console output
- Example: "Transcribing 5:30 (saved 3:15, $0.02)"

**FR-2.4: Page Timestamp Handling**
- Page timestamps MUST be relative to trimmed audio start (00:00)
- Example: Video trimmed to 01:30-15:00 → Page 1 at 00:00 = 01:30 in original video
- MUST validate page timestamps are within trimmed audio duration

**FR-2.5: Cache Metadata**
- MUST store `source.startTime` and `source.endTime` in cache-metadata.json
- MUST display range in console: "Extracted 01:30-15:00 from video"

## Non-Functional Requirements

**NFR-1: Performance**
- Time range extraction MUST NOT add >2 seconds overhead (ffmpeg trimming is fast)
- Audio segment generation MUST NOT be slower than current implementation

**NFR-2: Reliability**
- MUST handle edge cases: startTime=0, endTime=video duration
- MUST provide clear error messages for invalid ranges
- MUST validate timestamps before expensive operations

**NFR-3: Maintainability**
- MUST update documentation with new config schema
- MUST add examples for time range usage
- MUST update user guide with cost optimization tips

**NFR-4: Backward Compatibility**
- Existing config files MUST continue to work (no startTime/endTime = full video)
- Existing cache directories MUST be respected (migration not required)

## Technical Constraints

**TC-1: ffmpeg Dependency**
- Time range extraction requires ffmpeg with `-ss` (start seek) and `-to` (end time) flags
- Already required for audio segment splitting (no new dependency)

**TC-2: yt-dlp Limitation**
- yt-dlp does not support partial audio download
- Must download full video, then trim with ffmpeg

**TC-3: Whisper API**
- Whisper API accepts full audio file (cannot specify range in API call)
- Must trim audio file before API call

## Success Criteria

**Feature 1 Success:**
- ✅ All audio segments for a video stored in cache directory
- ✅ Deleting cache directory removes all related assets
- ✅ Existing workflows continue to function

**Feature 2 Success:**
- ✅ Can specify video range in config YAML
- ✅ Transcription cost reduced for partial video extraction
- ✅ Console output shows cost savings
- ✅ Page timestamps work correctly with trimmed audio
- ✅ Full video transcription still supported (no startTime/endTime)

## Out of Scope

**Not Included:**
- UI for selecting time ranges (future enhancement)
- Visual timeline preview (future enhancement)
- Automatic intro/outro detection (future enhancement)
- Re-transcription of existing cached videos with new ranges
- Migration script for existing audio-segments/ folder

## Dependencies

**Required:**
- ffmpeg (already required for audio splitting)
- yt-dlp (already required for video download)
- OpenAI API (already required for Whisper)
- js-yaml package (already required for config parsing)

## Risks and Mitigations

**Risk 1: Breaking existing workflows**
- **Mitigation:** Maintain backward compatibility, default behavior unchanged

**Risk 2: Cache directory pollution**
- **Mitigation:** Clear documentation on cache management and cleanup

**Risk 3: Confusion about timestamp references**
- **Mitigation:** Clear examples and validation error messages explaining relative timestamps

## Timeline Estimate

**Feature 1 (Audio Segments Location):** 1-2 hours
- Update AudioSplitter constructor default path
- Update youtube-extract-module to pass correct path
- Update InteractiveBookAIHandler path references
- Test with existing configs

**Feature 2 (Time Range Specification):** 3-4 hours
- Extend config schema types
- Implement ffmpeg trimming in YouTubeExtractor
- Add validation for time ranges
- Update cost calculation and console output
- Adjust page timestamp handling
- Update cache metadata
- Update documentation and examples

**Total Estimate:** 4-6 hours
