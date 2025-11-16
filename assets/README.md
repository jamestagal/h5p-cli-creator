# Assets Directory

This directory contains default assets used by the h5p-cli-creator tool.

## Placeholder Image

### Default Placeholder

The `placeholder-image.png` file is used as a default placeholder image for YouTube Story Extraction when `placeholder: true` is set in the config YAML.

**To create your own placeholder image:**

```bash
# Using ImageMagick (macOS/Linux)
convert -size 800x600 -background lightgray -fill darkgray -gravity center \
  -pointsize 48 label:"Placeholder Image" placeholder-image.png

# Using ImageMagick 7+ (newer syntax)
magick -size 800x600 -background lightgray -fill darkgray -gravity center \
  -pointsize 48 label:"Placeholder Image" placeholder-image.png
```

**Or use any image editor:**
- Recommended size: 800x600 pixels (4:3 aspect ratio)
- Format: PNG, JPG, or GIF
- Keep file size reasonable (< 500KB)
- Name: `placeholder-image.png`

### Usage

When you set `placeholder: true` in YouTube story extraction config:

```yaml
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:38"
    placeholder: true  # Uses assets/placeholder-image.png
```

The generated YAML will reference:
```yaml
- type: image
  path: "assets/placeholder-image.png"
```

### Custom Placeholders

You can replace `assets/placeholder-image.png` with your own default placeholder:

1. Create an 800x600 image
2. Save as `assets/placeholder-image.png`
3. All future placeholder pages will use your custom image

### Per-Page Custom Images

To use different images for specific pages, provide the path directly:

```yaml
pages:
  - title: "Page 1"
    startTime: "00:00"
    endTime: "00:38"
    image: "./images/custom-page1.jpg"  # Custom image path
```

## Other Assets

This directory can be used for other default assets as the project evolves:
- Default audio files
- Default fonts
- Default stylesheets
- Template files
