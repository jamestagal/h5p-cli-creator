# H5P Content Type Cache

This directory stores downloaded H5P content type packages for offline use and faster performance.

## Naming Convention

**Format:** `ContentType-MajorVersion.MinorVersion.h5p`

**Examples:**
```
H5P.Flashcards-1.5.h5p
H5P.MultiChoice-1.16.h5p
H5P.InteractiveBook-1.8.h5p
H5P.CoursePresentation-1.25.h5p
```

## Why Version Numbers Matter

1. **Version Identification**: Know which version you're using
2. **Multiple Versions**: Support caching different versions simultaneously
3. **Semantic Matching**: LibraryRegistry can pick the right version
4. **Future-Proof**: When v2.0 comes out, you can keep v1.x cached

## How to Download Content Types

### Method 1: Use the Download Script (Recommended)

```bash
cd scripts
chmod +x download-content-types.sh
./download-content-types.sh
```

### Method 2: Manual Download

1. **Visit H5P.org content type page**:
   - Go to https://h5p.org/content-types-and-applications
   - Find the content type you want
   - Click "Get it" or "Download"

2. **Check the version**:
   - Before downloading, note the version number (e.g., "1.16.14")
   - Extract Major.Minor (e.g., "1.16" from "1.16.14")

3. **Rename the file**:
   - Downloaded: `h5p-multi-choice-1-16-14.h5p`
   - Rename to: `H5P.MultiChoice-1.16.h5p`

4. **Place in this directory**

### Method 3: Extract from Existing H5P Package

If you have an .h5p package that uses a content type:

```bash
# Extract the package
unzip my-flashcards.h5p -d temp/

# Check library.json for version
cat temp/H5P.Flashcards-1.5/library.json
# Look for: "majorVersion": 1, "minorVersion": 5

# Copy the embedded library
cp temp/H5P.Flashcards-1.5.h5p content-type-cache/H5P.Flashcards-1.5.h5p
```

## Currently Cached

| Content Type | Version | Size | Purpose |
|--------------|---------|------|---------|
| H5P.Flashcards | 1.5 | ~1.8MB | Learning flashcards |
| H5P.DialogCards | 1.8 | ~1.6MB | Conversation cards |
| H5P.InteractiveBook | 1.8 | ~6.3MB | Multi-chapter books |
| H5P.MultiChoice | 1.16 | ~1.6MB | Multiple choice quizzes |
| H5P.Column | 1.18 | ~6.2MB | Column layout (dependency) |

## How LibraryRegistry Uses This Cache

**New cache-first strategy** (implemented in LibraryRegistry.ts):

1. **Check cache first** (instant)
   - Looks for `ContentType-X.Y.h5p`
   - Falls back to legacy `ContentType.h5p` for backward compatibility

2. **Extract from parent** (fast)
   - If not cached, tries extracting from parent packages
   - Example: FontAwesome bundled in InteractiveBook

3. **Download from Hub** (slow, last resort)
   - Only if cache miss AND extraction fails
   - Auto-saves with version number for future use

## Version Matching Strategy

When multiple versions are cached:

```
content-type-cache/
├── H5P.MultiChoice-1.14.h5p
├── H5P.MultiChoice-1.15.h5p
└── H5P.MultiChoice-1.16.h5p  ← Latest version used by default
```

**Default behavior:** Uses latest version (1.16)
**Specific version:** Can request `fetchLibrary("H5P.MultiChoice", "1.15")`

## Benefits of Caching

- ⚡ **Speed**: Instant vs 2-5 seconds Hub download
- 🔒 **Reliability**: No network errors, works offline
- 💾 **Bandwidth**: Don't re-download 6MB files every time
- 🎯 **Version Control**: Lock to specific versions

## File Size Reference

Typical sizes:
- Small content types (MultiChoice, Summary): 1-2 MB
- Medium content types (Flashcards, DragQuestion): 2-4 MB
- Large content types (InteractiveBook, CoursePresentation): 6-12 MB

Total cache size for 10 content types: ~50-80 MB

## Cleanup

Remove old versions you don't need:

```bash
# Keep only latest version of each content type
cd content-type-cache
ls H5P.MultiChoice-*.h5p
rm H5P.MultiChoice-1.14.h5p  # Remove old version
```

## Need More Content Types?

Visit https://h5p.org/content-types-and-applications to see all available content types.

Popular ones not yet cached:
- H5P.CoursePresentation (presentations with slides)
- H5P.Video (interactive video)
- H5P.DragQuestion (drag and drop)
- H5P.ImageHotspots (clickable images)
- H5P.Timeline (chronological timelines)
- H5P.Accordion (collapsible sections)
