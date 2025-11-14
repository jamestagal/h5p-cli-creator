# Task Breakdown: YouTube Extraction Improvements

## Overview
**Total Estimated Time:** 4-6 hours
**Total Tasks:** 2 major features with 18 sub-tasks

## Task List

### Feature 1: Audio Segments in Cache Directory

#### Task Group 1: Cache Directory Organization
**Dependencies:** None
**Estimated Time:** 1-2 hours

- [ ] 1.0 Complete audio segment cache relocation
  - [ ] 1.1 Write 2-6 focused tests for cache directory organization
    - Test audio segments created in correct cache location (`.youtube-cache/{VIDEO_ID}/audio-segments/`)
    - Test segment naming remains sequential (page1.mp3, page2.mp3)
    - Test cache deletion removes audio segments
    - Limit to critical path tests only (no exhaustive coverage)
  - [ ] 1.2 Update youtube-extract-module.ts to pass video-specific path
    - Pass `.youtube-cache/{VIDEO_ID}/audio-segments/` to AudioSplitter constructor
    - Construct path using `path.join(extractor.getCacheDirectory(videoId), "audio-segments")`
    - Ensure directory is created before AudioSplitter is instantiated
  - [ ] 1.3 Verify AudioSplitter constructor accepts custom path
    - Review constructor: `constructor(outputDirectory?: string)`
    - Confirm default behavior: `./audio-segments` (backward compatible)
    - Confirm custom path behavior: accepts absolute path
    - No changes needed to AudioSplitter class (already supports this)
  - [ ] 1.4 Update InteractiveBookAIHandler path references
    - Update any hardcoded references to `audio-segments/` directory
    - Use paths relative to `.youtube-cache/{VIDEO_ID}/audio-segments/`
    - Ensure YAML generation references correct segment paths
  - [ ] 1.5 Ensure audio segment cache tests pass
    - Run ONLY the 2-6 tests written in 1.1
    - Verify segments appear in correct cache location
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-6 tests written in 1.1 pass
- Audio segments stored in `.youtube-cache/{VIDEO_ID}/audio-segments/`
- Deleting cache directory removes all segments
- Existing workflow continues to work (backward compatible)
- No breaking changes to AudioSplitter API

---

### Feature 2: Video Time Range Specification

#### Task Group 2: Type System and Schema Extensions
**Dependencies:** None
**Estimated Time:** 30-45 minutes

- [ ] 2.0 Complete type system extensions
  - [ ] 2.1 Extend VideoSourceConfig interface in YouTubeExtractorTypes.ts
    - Add optional `startTime?: string` field (MM:SS or HH:MM:SS format)
    - Add optional `endTime?: string` field (MM:SS or HH:MM:SS format)
    - Document that omitting both fields = full video (backward compatible)
  - [ ] 2.2 Extend CacheMetadata interface in YouTubeExtractorTypes.ts
    - Add optional `extractionRange?: { startTime: string; endTime: string }` field
    - Store original time strings (not converted to seconds)
    - Maintain backward compatibility (field is optional)
  - [ ] 2.3 Add time range validation utilities
    - Create `parseTimeToSeconds(timeString: string): number` utility
    - Support both MM:SS and HH:MM:SS formats
    - Reuse AudioSplitter's timestamp parsing logic if applicable
    - Add `validateTimeRange(startTime: string, endTime: string, videoDuration: number)` utility
    - Validate startTime < endTime
    - Validate range within video duration
    - Return clear error messages for invalid ranges

**Acceptance Criteria:**
- Type system supports optional startTime/endTime fields
- Validation utilities handle all time formats
- Backward compatibility maintained (optional fields)

#### Task Group 3: Audio Trimming Implementation
**Dependencies:** Task Group 2
**Estimated Time:** 1-2 hours

- [ ] 3.0 Complete audio trimming implementation
  - [ ] 3.1 Write 2-6 focused tests for audio trimming
    - Test trimmed audio has correct duration
    - Test trimmed audio starts at specified time
    - Test full video extraction when no range specified (backward compatibility)
    - Test validation rejects invalid ranges (startTime >= endTime)
    - Limit to critical workflow tests only
  - [ ] 3.2 Implement ffmpeg trimming in YouTubeExtractor
    - Add `trimAudio()` method to YouTubeExtractor class
    - Use ffmpeg command: `ffmpeg -y -i input.mp3 -ss START_SECONDS -to END_SECONDS -c copy trimmed.mp3`
    - Convert MM:SS/HH:MM:SS to decimal seconds for ffmpeg
    - Use copy codec (`-c copy`) to avoid re-encoding (fast, no quality loss)
    - Overwrite original audio.mp3 with trimmed version
  - [ ] 3.3 Integrate trimming into downloadAudio() workflow
    - After yt-dlp downloads full audio, check if time range specified
    - If startTime/endTime present, call trimAudio() with range
    - If no range specified, skip trimming (backward compatible)
    - Log trimming operation: "Trimming audio to 01:30-15:00..."
  - [ ] 3.4 Update cache metadata to store extraction range
    - Save `extractionRange: { startTime, endTime }` in cache-metadata.json when specified
    - Display range in console: "Extracted 01:30-15:00 from video"
    - Load extraction range from cache for display/reference
  - [ ] 3.5 Ensure audio trimming tests pass
    - Run ONLY the 2-6 tests written in 3.1
    - Verify trimmed audio has correct duration
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-6 tests written in 3.1 pass
- ffmpeg trimming works correctly with copy codec
- Trimmed audio overwrites original audio.mp3 in cache
- Cache metadata stores extraction range
- Full video extraction still works (no range = no trimming)

#### Task Group 4: Cost Calculation and Transparency
**Dependencies:** Task Group 3
**Estimated Time:** 30-45 minutes

- [ ] 4.0 Complete cost calculation updates
  - [ ] 4.1 Write 2-4 focused tests for cost calculation
    - Test cost calculated based on trimmed duration (not full video)
    - Test cost savings displayed correctly
    - Limit to critical cost calculation tests only
  - [ ] 4.2 Update WhisperTranscriptionService cost display
    - Calculate cost based on trimmed audio duration
    - Display cost savings when range specified
    - Format: "Transcribing 5:30 (saved 3:15, $0.02)"
    - Show original video duration, trimmed duration, and savings
  - [ ] 4.3 Add cost transparency to console output
    - Before transcription: "Original video: 20:00 ($0.12), Trimming to: 17:00 ($0.10), Savings: $0.02"
    - After transcription: Log actual cost based on trimmed duration
    - Store cost savings in cache metadata for reference
  - [ ] 4.4 Ensure cost calculation tests pass
    - Run ONLY the 2-4 tests written in 4.1
    - Verify cost calculation uses trimmed duration
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 4.1 pass
- Cost calculated based on trimmed audio only
- Console output clearly shows cost savings
- Cache metadata tracks transcription cost

#### Task Group 5: Config Parsing and Validation
**Dependencies:** Task Groups 2-4
**Estimated Time:** 45 minutes - 1 hour

- [ ] 5.0 Complete config parsing and validation
  - [ ] 5.1 Write 2-6 focused tests for config parsing
    - Test config with startTime/endTime parses correctly
    - Test config without range works (backward compatibility)
    - Test invalid ranges rejected with clear errors
    - Test page timestamps validated against trimmed duration
    - Limit to critical validation tests only
  - [ ] 5.2 Update youtube-extract-module.ts config parsing
    - Parse `source.startTime` and `source.endTime` from YAML config
    - Pass time range to YouTubeExtractor.extract() method
    - Validate time range format before extraction begins
    - Provide clear error messages for invalid formats
  - [ ] 5.3 Update page timestamp validation
    - Validate page timestamps are within trimmed audio duration
    - Page startTime "00:00" maps to source.startTime in original video
    - Page endTime must not exceed (source.endTime - source.startTime)
    - Error message example: "Page 3 endTime 10:30 exceeds trimmed audio duration 8:45"
  - [ ] 5.4 Ensure config parsing tests pass
    - Run ONLY the 2-6 tests written in 5.1
    - Verify time range parsing and validation
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-6 tests written in 5.1 pass
- Config parsing handles optional startTime/endTime
- Validation provides clear error messages
- Page timestamps validated against trimmed duration
- Backward compatibility maintained (no range = full video)

---

### Testing & Documentation

#### Task Group 6: Integration Testing and Documentation
**Dependencies:** Task Groups 1-5
**Estimated Time:** 1-1.5 hours

- [ ] 6.0 Complete integration testing and documentation
  - [ ] 6.1 Review existing tests and fill critical gaps only
    - Review tests from Task Groups 1-5 (approximately 8-22 tests)
    - Identify missing end-to-end workflow tests
    - Focus ONLY on critical user workflows for these two features
    - Do NOT assess entire application test coverage
  - [ ] 6.2 Write up to 8 additional strategic tests maximum
    - End-to-end: Full video extraction with segments in cache directory
    - End-to-end: Trimmed video extraction with cost savings
    - Integration: Cache metadata includes extraction range
    - Integration: Deleting cache removes all assets including segments
    - Edge case: Trimming to 00:00 - video duration (full video via trimming)
    - Edge case: Very short trim ranges (< 10 seconds)
    - Backward compatibility: Config without startTime/endTime works
    - Validation: Invalid time ranges rejected before expensive operations
    - Maximum 8 tests total - focus on high-value scenarios only
  - [ ] 6.3 Update example YAML configs
    - Update `examples/youtube-stories/*.yaml` with startTime/endTime examples
    - Add comments explaining time range feature
    - Add example showing cost savings calculation
    - Add example with full video (no range specified)
  - [ ] 6.4 Update user documentation
    - Update `docs/user-guides/youtube-story-extraction.md`
    - Document startTime/endTime config fields
    - Document time format support (MM:SS and HH:MM:SS)
    - Document cost savings feature
    - Document cache directory organization changes
    - Add troubleshooting section for time range validation errors
  - [ ] 6.5 Run feature-specific tests only
    - Run ONLY tests related to these two features (approximately 16-30 tests total)
    - Verify all critical workflows pass
    - Do NOT run the entire application test suite
    - Fix any failing tests before marking complete

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 16-30 tests total)
- No more than 8 additional tests added when filling gaps
- Example YAML configs demonstrate new features
- User documentation complete and accurate
- Testing focused exclusively on these two features

---

## Execution Order

Recommended implementation sequence:

1. **Feature 1 - Cache Directory Organization** (Task Group 1)
   - Simple refactoring, no new functionality
   - Establishes proper file organization
   - Quick win to build momentum

2. **Feature 2 - Type System** (Task Group 2)
   - Foundation for time range feature
   - No runtime logic, just types and validation utilities
   - Enables parallel work on subsequent groups

3. **Feature 2 - Audio Trimming** (Task Group 3)
   - Core functionality of time range feature
   - Depends on type system being complete
   - Most complex implementation work

4. **Feature 2 - Cost Calculation** (Task Group 4)
   - Enhances user experience with transparency
   - Depends on trimming being functional
   - Relatively straightforward implementation

5. **Feature 2 - Config Parsing** (Task Group 5)
   - Wires everything together
   - Depends on all Feature 2 components
   - Final implementation piece

6. **Integration Testing & Documentation** (Task Group 6)
   - Verifies complete workflows
   - Fills any test coverage gaps
   - Documents features for users

---

## Implementation Notes

### Key Technical Considerations

**AudioSplitter Path Handling:**
- AudioSplitter constructor already supports custom output directory
- No internal changes needed to AudioSplitter class
- youtube-extract-module just needs to pass correct path

**ffmpeg Trimming Strategy:**
- Download full video first (yt-dlp limitation)
- Trim immediately after download using ffmpeg
- Use `-c copy` codec to avoid re-encoding (< 2 seconds overhead)
- Overwrite audio.mp3 with trimmed version
- All subsequent operations work with trimmed audio

**Timestamp Relativity:**
- Page timestamps are always relative to trimmed audio start (00:00)
- Example: Video trimmed to 01:30-15:00
  - Page 1 at 00:00 = 01:30 in original video
  - Page 2 at 02:15 = 03:45 in original video
- Clear documentation needed to explain this relationship

**Backward Compatibility:**
- Omitting startTime/endTime = full video extraction (current behavior)
- Existing cache files without extraction range remain valid
- No breaking changes to existing APIs or workflows
- Optional fields in type system (VideoSourceConfig, CacheMetadata)

**Cost Calculation:**
- Whisper API pricing: $0.006/minute
- Calculate based on trimmed duration only
- Display savings: (full duration - trimmed duration) * $0.006
- Store cost in cache metadata for transparency

### Testing Philosophy

**Focused Test Writing:**
- Each task group writes 2-6 tests maximum during development
- Tests cover ONLY critical behaviors, not exhaustive coverage
- Test verification runs ONLY newly written tests, not entire suite
- Integration testing (Task Group 6) adds maximum 8 additional tests
- Total tests for these features: approximately 16-30 tests

**Test Priorities:**
- Happy path: Features work as designed
- Backward compatibility: Existing workflows unaffected
- Validation: Invalid inputs rejected with clear errors
- Edge cases: Only business-critical scenarios (trimming to full duration, etc.)

### File Modifications Expected

**Type Definitions:**
- `src/services/types/YouTubeExtractorTypes.ts` - Extend interfaces

**Core Services:**
- `src/services/YouTubeExtractor.ts` - Add trimming logic
- `src/services/AudioSplitter.ts` - No changes (already supports custom path)
- `src/services/transcription/WhisperTranscriptionService.ts` - Update cost display

**Module:**
- `src/modules/youtube-extract-module.ts` - Parse config, pass paths, validate ranges

**Documentation:**
- `docs/user-guides/youtube-story-extraction.md` - Document new features
- `examples/youtube-stories/*.yaml` - Add examples with time ranges

**Tests (New Files):**
- Test files for each task group (location TBD based on project structure)

---

## Success Criteria

**Feature 1 Success:**
- Audio segments stored in `.youtube-cache/{VIDEO_ID}/audio-segments/`
- Deleting cache directory removes all related assets
- Existing workflows continue to function without changes
- No breaking changes to AudioSplitter API

**Feature 2 Success:**
- Can specify startTime/endTime in config YAML
- Transcription cost reduced for partial video extraction
- Console output shows cost savings clearly
- Page timestamps work correctly with trimmed audio
- Full video transcription still supported (no range = full video)
- Cache metadata stores extraction range for reference

**Overall Success:**
- All feature-specific tests pass (approximately 16-30 tests)
- Documentation complete and accurate
- Examples demonstrate new features
- Backward compatibility maintained
- Implementation time: 4-6 hours as estimated

---

## Common Pitfalls & Gotchas

### ⚠️ CRITICAL: ffmpeg Path Dependencies
**Problem:** ffmpeg must be in PATH or extraction fails
**Must Do:**
- Ensure ffmpeg is available before audio operations
- Provide clear error message if ffmpeg not found
- Test with PATH environment variable set correctly

**Example Check:**
```typescript
// Check ffmpeg availability before processing
const { stdout } = await execAsync('which ffmpeg');
if (!stdout) {
  throw new Error('ffmpeg not found in PATH');
}
```

### ⚠️ Audio Trimming with Copy Codec
**Problem:** Re-encoding audio is slow and lossy
- ❌ **WRONG**: `ffmpeg -i audio.mp3 -ss 90 -to 900 output.mp3` (re-encodes)
- ✅ **CORRECT**: `ffmpeg -i audio.mp3 -ss 90 -to 900 -c copy output.mp3` (copy codec)

**Why:** Copy codec (`-c copy`) extracts segment without re-encoding, preserving quality and speed.

**Pattern to Follow:**
```bash
ffmpeg -y -i audio.mp3 -ss {startSeconds} -to {endSeconds} -c copy trimmed.mp3
```

### ⚠️ Timestamp Parsing and Validation Order
**Problem:** Parsing timestamps after validation causes confusing errors
**Must Do:**
1. Parse timestamp strings to seconds FIRST
2. Validate parsed values (startTime < endTime, within video duration)
3. Use parsed values for ffmpeg commands

**Example:**
```typescript
// ✅ CORRECT order
const startSeconds = parseTimestamp(config.source.startTime);  // Parse first
const endSeconds = parseTimestamp(config.source.endTime);
if (startSeconds >= endSeconds) {  // Validate parsed values
  throw new Error(`Invalid range: start (${startSeconds}s) must be before end (${endSeconds}s)`);
}
```

### ⚠️ Relative vs Absolute Timestamps
**Problem:** Page timestamps must be relative to trimmed audio, not original video
**Must Do:**
- When video trimmed from 01:30-15:00, page timestamps start at 00:00 (not 01:30)
- Validate page timestamps against trimmed duration, not full video
- Document this clearly in examples and error messages

**Example:**
```yaml
source:
  startTime: "01:30"  # Trim from 1:30 in video
  endTime: "15:00"    # Trim to 15:00 in video

pages:
  - title: "Page 1"
    startTime: "00:00"  # ← This is 01:30 in original video
    endTime: "00:45"    # ← This is 02:15 in original video
```

### ⚠️ UTF-8 Encoding for Vietnamese
**Problem:** Losing diacritics due to incorrect encoding
**Must Do:**
- Always use `encoding: 'utf8'` when reading/writing files
- Test with actual Vietnamese characters: trời, được, tiếng
- Preserve diacritics through entire pipeline (API → cache → output)

**Example:**
```typescript
await fs.writeFile(cachePath, JSON.stringify(segments, null, 2), 'utf8');
```

### ⚠️ Cache Directory Structure
**Problem:** Using wrong video ID for cache lookup causes cache misses
**Must Do:**
- Pass `videoId` parameter through all methods
- Audio segments path: `.youtube-cache/${videoId}/audio-segments/`
- Don't hardcode cache paths - use videoId variable

**Example:**
```typescript
// ❌ WRONG: Hardcoded path
const segmentsPath = `audio-segments/`;

// ✅ CORRECT: Dynamic with videoId
const segmentsPath = path.join('.youtube-cache', videoId, 'audio-segments');
```

### ⚠️ Cost Calculation with Trimmed Audio
**Problem:** Using wrong duration causes incorrect cost estimates
**Must Do:**
- Calculate cost based on TRIMMED audio duration (not full video)
- Show cost savings: "Transcribing 5:30 instead of 8:45 (saved $0.02)"
- Get duration from trimmed audio file metadata
- Formula: `(trimmedDuration / 60) * 0.006`

**Example Display:**
```
✓ Transcribing 5:30 (trimmed from 8:45)
  Whisper API cost: $0.03 (saved $0.02 by skipping intro/outro)
```

### ⚠️ AudioSplitter Output Directory
**Problem:** AudioSplitter uses default path if not provided
**Must Do:**
- ALWAYS pass explicit output directory to AudioSplitter constructor
- Don't rely on default behavior (it uses root `audio-segments/`)
- Pass video-specific path: `.youtube-cache/${videoId}/audio-segments`

**Example:**
```typescript
// ❌ WRONG: Uses default (root audio-segments/)
const splitter = new AudioSplitter();

// ✅ CORRECT: Explicit video-specific path
const segmentsDir = path.join(cacheDir, 'audio-segments');
const splitter = new AudioSplitter(segmentsDir);
```

### ⚠️ Backward Compatibility Testing
**Problem:** New features break existing configs without range specification
**Must Do:**
- Test with config that has NO startTime/endTime (should work as before)
- Ensure optional fields truly optional (no undefined errors)
- Validate existing example configs still work

**Test Case:**
```yaml
# This MUST still work (no startTime/endTime = full video)
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=VIDEO_ID"
  # No startTime or endTime - should extract full video
```
