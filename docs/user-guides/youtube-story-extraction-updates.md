# Documentation Updates for YouTube Extraction Improvements

## INSERT AFTER LINE 233 (After "URLs with extra parameters" line in Source Configuration section)

**Time Range Extraction (Optional Cost Optimization):**

- `source.startTime` (optional): Start time for video extraction (format: `MM:SS` or `HH:MM:SS`)
- `source.endTime` (optional): End time for video extraction (format: `MM:SS` or `HH:MM:SS`)

**Why use time ranges?**

Extracting only the relevant portion of a video reduces Whisper API transcription costs by skipping intros, outros, or irrelevant content.

**Example:**
```yaml
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=VIDEO_ID"
  startTime: "01:30"  # Skip 90-second intro
  endTime: "18:30"    # Skip outro after 18:30
```

**Cost savings example:**
- Full 20-minute video: $0.12 (1200 seconds × $0.006/minute)
- Trimmed to 17 minutes (skip 2-min intro + 1-min outro): $0.10
- **Savings: $0.02 per video (17% reduction)**

**Supported time formats:**
- `MM:SS` - Minutes and seconds (e.g., "01:30" = 1 minute 30 seconds)
- `HH:MM:SS` - Hours, minutes, and seconds (e.g., "01:30:00" = 1 hour 30 minutes)

**How it works:**
1. Tool downloads full video audio (yt-dlp limitation)
2. Audio is trimmed to specified range using ffmpeg (fast, < 2 seconds)
3. Only trimmed audio is transcribed with Whisper API
4. Page timestamps are relative to trimmed audio start (see below)

**Important: Page timestamps are relative to trimmed audio**

When using `startTime` and `endTime`, page timestamps become relative to the extracted range:
- Page `startTime: "00:00"` corresponds to `source.startTime` in the original video
- Page endTime must not exceed `(source.endTime - source.startTime)`

**Example:**
```yaml
source:
  startTime: "01:30"  # Original video time 01:30
  endTime: "15:00"    # Original video time 15:00
  # Extracted duration: 13:30

pages:
  - title: "Page 1"
    startTime: "00:00"  # This is 01:30 in original video
    endTime: "00:45"    # This is 02:15 in original video

  - title: "Page 2"
    startTime: "00:45"  # This is 02:15 in original video
    endTime: "01:30"    # This is 03:00 in original video
```

**Backward compatibility:**
- Omitting `startTime` and `endTime` extracts the full video (default behavior)
- Existing configs without time ranges continue to work unchanged

---

## UPDATE SECTION "How Caching Works" (around line 354)

**Replace existing cache file list with:**

When you run the extraction command, the tool caches:
- **Downloaded audio**: `.youtube-cache/VIDEO_ID/audio.mp3` (trimmed if time range specified)
- **Whisper transcript**: `.youtube-cache/VIDEO_ID/whisper-transcript.json`
- **Translations**: `.youtube-cache/VIDEO_ID/translations.json`
- **Cache metadata**: `.youtube-cache/VIDEO_ID/cache-metadata.json` (includes extraction range)
- **Audio segments**: `.youtube-cache/VIDEO_ID/audio-segments/` (page1.mp3, page2.mp3, etc.)

**Cache organization:**

All assets for a video are co-located in a single directory for easy management:

```
.youtube-cache/VIDEO_ID/
├── audio.mp3                    # Extracted audio (trimmed if startTime/endTime specified)
├── whisper-transcript.json      # Full transcript from Whisper API
├── cache-metadata.json          # Includes extraction range, cost info, transcription metadata
├── translations.json            # Cached translations
└── audio-segments/              # Audio segments for each page
    ├── page1.mp3
    ├── page2.mp3
    ├── page3.mp3
    └── ...
```

**Benefits:**
- Delete entire cache directory to remove all video assets
- No orphaned segment files in separate directories
- Clear organization for debugging and management

---

## UPDATE SECTION "Cache Metadata" (around line 368)

**Replace example metadata with:**

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
  },
  "extractionRange": {
    "startTime": "01:30",
    "endTime": "15:00"
  }
}
```

**New field:**
- `extractionRange` (optional): Stores the time range used for extraction when `source.startTime` and `source.endTime` are specified
- Helps track which portion of the video was transcribed
- Omitted when full video is extracted (no time range)

---

## INSERT BEFORE "Error: 'End time must be after start time'" (around line 686)

### Error: "Invalid time format - use MM:SS or HH:MM:SS"

**Cause:** Time range format not recognized

**Solution:** Use valid timestamp formats:
```yaml
# Valid formats:
startTime: "01:30"     # MM:SS (1 minute 30 seconds)
startTime: "00:01:30"  # HH:MM:SS (1 minute 30 seconds)
startTime: "01:30:00"  # HH:MM:SS (1 hour 30 minutes)

# Invalid formats:
startTime: "90"        # ERROR: Must include colons
startTime: "1:30"      # ERROR: Minutes must be zero-padded (01:30)
startTime: "90s"       # ERROR: No unit suffixes
```

### Error: "startTime must be before endTime"

**Cause:** Invalid time range - startTime ≥ endTime

**Solution:** Ensure startTime is before endTime:
```yaml
# Wrong:
source:
  startTime: "15:00"
  endTime: "10:00"  # ERROR: Before start time

# Correct:
source:
  startTime: "10:00"
  endTime: "15:00"
```

This error is caught early before expensive operations (downloading/transcription) to save API costs.

### Error: "endTime exceeds video duration"

**Cause:** Specified endTime is beyond the video length

**Solution:** Check video duration and adjust timestamps:
```bash
# Get video info with yt-dlp
yt-dlp --dump-json "https://www.youtube.com/watch?v=VIDEO_ID" | grep '"duration"'
```

Ensure `source.endTime` is less than or equal to video duration.

**Example:**
- Video duration: 10:00 (10 minutes)
- Invalid endTime: "15:00" (beyond video end)
- Valid endTime: "10:00" or less

### Error: "Page N endTime (MM:SS) exceeds trimmed audio duration (MM:SS)"

**Cause:** Page timestamp exceeds the extracted audio duration when using time range extraction

**Solution:** Page timestamps must be relative to trimmed audio, not original video:

```yaml
source:
  startTime: "01:30"  # Original video time
  endTime: "10:00"    # Original video time
  # Extracted duration: 08:30 (8 minutes 30 seconds)

pages:
  # Wrong: Page timestamp exceeds trimmed duration
  - title: "Page X"
    startTime: "08:00"
    endTime: "10:00"  # ERROR: Exceeds 08:30 duration

  # Correct: Page timestamp within trimmed duration
  - title: "Page X"
    startTime: "08:00"
    endTime: "08:30"  # OK: Within trimmed duration
```

**Remember:** When using `source.startTime` and `source.endTime`:
- Page timestamps start at 00:00 (not source.startTime)
- Page timestamps must not exceed (source.endTime - source.startTime)
- Page startTime "00:00" = source.startTime in original video

---

## INSERT IN "Cost Transparency" SECTION (after line 141)

### Cost Savings with Time Range Extraction

**Reduce transcription costs** by extracting only the relevant portion of videos:

**Example 1: Skip intro/outro (20-minute educational video)**
- Full video transcription: 20:00 = $0.12
- With time range (skip 2-min intro + 1-min outro): 17:00 = $0.10
- **Savings: $0.02 per video (17% reduction)**
- For 100 videos: **$2.00 savings**

**Example 2: Extract specific segment (60-minute documentary)**
- Full video transcription: 60:00 = $0.36
- Extract only relevant 15-minute segment: 15:00 = $0.09
- **Savings: $0.27 per video (75% reduction)**
- For 50 videos: **$13.50 savings**

**Example 3: Very long video (2-hour lecture)**
- Full video transcription: 120:00 = $0.72
- Extract key 30-minute section: 30:00 = $0.18
- **Savings: $0.54 per video (75% reduction)**
- For 20 videos: **$10.80 savings**

**How to specify time range:**
```yaml
source:
  type: youtube
  url: "https://www.youtube.com/watch?v=VIDEO_ID"
  startTime: "02:00"  # Skip 2-minute intro
  endTime: "58:00"    # Skip 2-minute outro (60-min video)
```

**Console output shows savings:**
```
✓ Trimming audio to 02:00-58:00 (56:00 duration)
  Original video: 60:00 ($0.36)
  Transcribing: 56:00 ($0.34)
  Savings: $0.02 (6%)
```

**When to use time ranges:**
- Educational videos with long intros/outros
- Documentaries with credits or unrelated segments
- Lecture recordings with pre-class setup or post-class discussion
- Story videos with opening/closing music
- Any video where only a portion is relevant for learning

**Backward compatibility:**
- Omitting `startTime`/`endTime` transcribes full video (default)
- No changes needed to existing configs

---

## INSERT IN "Force Re-transcription" SECTION (after line 424)

**When deleting cache, all assets are removed:**
```bash
# Delete entire cache directory for a video
rm -rf .youtube-cache/VIDEO_ID/

# This removes:
# - audio.mp3
# - whisper-transcript.json
# - cache-metadata.json
# - translations.json
# - audio-segments/ (all page MP3 files)
```

All video assets are co-located in the cache directory for easy cleanup.

