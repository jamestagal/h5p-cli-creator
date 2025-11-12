# YouTube Story Extraction Examples

This directory contains example configuration files for the YouTube Story Extraction feature. These examples demonstrate different use cases and levels of complexity.

## Prerequisites

Before running these examples, ensure you have:

1. **System dependencies installed:**
   ```bash
   # macOS
   brew install ffmpeg yt-dlp

   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   pip install yt-dlp
   ```

2. **OpenAI API key** (for examples with translation):
   ```bash
   # Create .env file in project root
   echo "OPENAI_API_KEY=your_api_key_here" > .env
   ```

3. **Project built:**
   ```bash
   npm install
   npm run build
   ```

## Example Files

### 1. basic-example.yaml

**Purpose:** Simple story with placeholder images

**Features:**
- Uses test video with known good Vietnamese captions
- Enables English translation
- Uses placeholder images (no custom images needed)
- 11 story pages with precise timestamps

**Use case:** Quick start, learning the feature, testing setup

**Run:**
```bash
node ./dist/index.js youtube-extract examples/youtube-stories/basic-example.yaml
node ./dist/index.js yaml basic-example.yaml basic-example.h5p
```

**Expected output:**
- `basic-example.yaml` - Generated Interactive Book YAML
- `audio-segments/` - 11 MP3 files (page1.mp3 through page11.mp3)
- `full-transcript.txt` - Complete Vietnamese transcript
- `basic-example.h5p` - Compiled H5P package (after second command)

**Estimated time:**
- First run: 1-2 minutes
- Cached run: 10-20 seconds

**Estimated cost:** ~$0.01 (translation only)

---

### 2. advanced-example.yaml

**Purpose:** Production workflow with custom images

**Features:**
- Descriptive page titles
- Mix of placeholder and custom images
- Demonstrates iterative workflow
- Same test video as basic example

**Use case:** Real-world production, custom illustrations, iterative improvement

**Workflow:**
1. Generate with placeholders first
2. Review audio segments and timestamps
3. Create or source custom images
4. Update config with image paths
5. Regenerate (fast with cache)
6. Compile and upload

**Run:**
```bash
# Step 1: Generate with placeholders
node ./dist/index.js youtube-extract examples/youtube-stories/advanced-example.yaml

# Step 2: Review and adjust timestamps if needed

# Step 3: Add custom images to ./images/folk-tale/ directory
mkdir -p images/folk-tale

# Step 4: Edit advanced-example.yaml
# - Uncomment image paths
# - Update with actual file names

# Step 5: Regenerate (fast!)
node ./dist/index.js youtube-extract examples/youtube-stories/advanced-example.yaml

# Step 6: Compile
node ./dist/index.js yaml advanced-example.yaml advanced-example.h5p
```

**Expected output:**
- Same as basic example, plus custom images in compiled H5P

---

### 3. minimal-example.yaml

**Purpose:** Bare minimum configuration

**Features:**
- No translation (saves API costs)
- Only 3 pages (quick testing)
- Placeholder images only
- Vietnamese text only

**Use case:** Testing without API key, prototyping, Vietnamese-only content

**Run:**
```bash
node ./dist/index.js youtube-extract examples/youtube-stories/minimal-example.yaml
node ./dist/index.js yaml minimal-example.yaml minimal-example.h5p
```

**Expected output:**
- `minimal-example.yaml` - Vietnamese-only Interactive Book
- `audio-segments/` - 3 MP3 files (page1.mp3, page2.mp3, page3.mp3)
- `full-transcript.txt` - Vietnamese transcript
- `minimal-example.h5p` - Compiled H5P package

**Estimated time:** < 1 minute

**Estimated cost:** $0 (no translation)

---

### 4. test-story-config.yaml

**Purpose:** Complete test case for development

**Features:**
- Full 11-page story
- Translation enabled
- All timestamps from requirements specification
- Used in integration tests

**Use case:** Validation, testing, reference implementation

**Run:**
```bash
node ./dist/index.js youtube-extract examples/youtube-stories/test-story-config.yaml
node ./dist/index.js yaml test-story-config.yaml test-story.h5p
```

## Test Video

All examples use the same test video:
- **URL:** https://www.youtube.com/watch?v=Y8M9RJ_4C7E
- **Title:** Vietnamese listening practice story
- **Duration:** ~5:14
- **Language:** Vietnamese with auto-generated captions
- **Content:** Children's folk tale (appropriate for all ages)

This video was selected because:
- Has high-quality Vietnamese captions
- Appropriate length for testing
- Clear audio quality
- Natural pause points for segmentation

## Running All Examples

To test all examples in sequence:

```bash
#!/bin/bash
# Run all YouTube story extraction examples

echo "Building project..."
npm run build

echo -e "\n=== Running basic example ==="
node ./dist/index.js youtube-extract examples/youtube-stories/basic-example.yaml
node ./dist/index.js yaml basic-example.yaml basic-example.h5p

echo -e "\n=== Running minimal example (no translation) ==="
node ./dist/index.js youtube-extract examples/youtube-stories/minimal-example.yaml
node ./dist/index.js yaml minimal-example.yaml minimal-example.h5p

echo -e "\n=== Running test config ==="
node ./dist/index.js youtube-extract examples/youtube-stories/test-story-config.yaml
node ./dist/index.js yaml test-story-config.yaml test-story.h5p

echo -e "\n=== Summary ==="
ls -lh *.h5p
echo "Upload these H5P files to your H5P platform for testing"
```

## Verifying Output

After running examples, verify:

1. **Audio segments created:**
   ```bash
   ls -lh audio-segments/
   # Should show page1.mp3, page2.mp3, etc.
   ```

2. **YAML generated:**
   ```bash
   cat basic-example.yaml
   # Should show complete Interactive Book structure
   ```

3. **H5P package created:**
   ```bash
   ls -lh *.h5p
   # Should show .h5p file(s)
   ```

4. **Test on platform:**
   - Upload .h5p to H5P.com or your platform
   - Open Interactive Book
   - Test page 0: Video plays, transcript expands
   - Test story pages: Audio plays, text displays, translation expands

## Caching Behavior

After first run, the tool caches:
- **Audio:** `.youtube-cache/Y8M9RJ_4C7E/audio.mp3`
- **Transcript:** `.youtube-cache/Y8M9RJ_4C7E/transcript.json`
- **Translations:** `.youtube-cache/Y8M9RJ_4C7E/translations.json`

**To clear cache:**
```bash
rm -rf .youtube-cache/Y8M9RJ_4C7E/
```

**Cache benefits:**
- Fast iteration on timestamps (10-20 seconds vs 1-2 minutes)
- Avoid redundant API calls (save money)
- Test different page structures quickly

## Customizing Examples

To create your own story:

1. **Copy an example:**
   ```bash
   cp examples/youtube-stories/basic-example.yaml my-story.yaml
   ```

2. **Update config:**
   - Change `title` to your story title
   - Update `source.url` to your YouTube video
   - Adjust `pages` array with your timestamps

3. **Watch video and note timestamps:**
   - Use YouTube's timestamp feature (right-click video)
   - Note start and end times for each page
   - Aim for 14-60 second segments

4. **Run extraction:**
   ```bash
   node ./dist/index.js youtube-extract my-story.yaml
   ```

5. **Iterate:**
   - Review audio segments
   - Adjust timestamps if needed
   - Regenerate (fast with cache)

6. **Compile:**
   ```bash
   node ./dist/index.js yaml my-story.yaml my-story.h5p
   ```

## Troubleshooting

### "ffmpeg not found"
Install ffmpeg: `brew install ffmpeg` (macOS) or `sudo apt-get install ffmpeg` (Linux)

### "yt-dlp not found"
Install yt-dlp: `brew install yt-dlp` (macOS) or `pip install yt-dlp` (Linux)

### "Video does not have captions"
Use a different video with Vietnamese captions, or enable auto-generated captions on your video.

### "Translation failed"
Check `OPENAI_API_KEY` in `.env` file. Or disable translation:
```yaml
translation:
  enabled: false
```

### "Invalid timestamp format"
Use `MM:SS` format: `"01:30"` not `"1:30"` or `"90"`

### Audio segments sound wrong
Adjust timestamps in config YAML and regenerate (fast with cache).

## Learn More

For comprehensive documentation, see:
- [YouTube Story Extraction User Guide](../../docs/user-guides/youtube-story-extraction.md)
- [Main README](../../README.md)

## Need Help?

- Review error messages carefully (they include solutions)
- Check verbose mode: `--verbose` flag
- Test with minimal example first (no API key needed)
- Verify dependencies: `ffmpeg -version && yt-dlp --version`
