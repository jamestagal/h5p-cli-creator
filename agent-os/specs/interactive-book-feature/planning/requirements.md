# Requirements: Interactive Book Feature

## Overview
Add support for the H5P Interactive Book content type to h5p-cli-creator, allowing users to generate interactive digital storybooks from CSV files.

## Goals
- Enable mass creation of Interactive Book H5P packages from CSV input
- Support text, images, and audio for each book page/chapter
- Follow the existing architecture pattern (Module + Creator + Model)
- Maintain consistency with existing Flashcards and Dialog Cards implementations

## User Stories

### As a content creator
- I want to create an Interactive Book from a CSV file so that I can generate multiple books efficiently
- I want to include images on pages so that my books are visually engaging
- I want to add audio narration to pages so that readers can listen to the story
- I want to specify book title, page titles, and page text in CSV format

### As a developer
- I want the implementation to follow the existing ContentCreator pattern so that it's consistent with other content types
- I want proper error handling for missing media files
- I want the code to be maintainable and well-documented

## Functional Requirements

### CSV Input Format
**Required columns:**
- `bookTitle` - Title of the entire book
- `pageTitle` - Title of each page/chapter
- `pageText` - Main text content for the page

**Optional columns:**
- `language` - Language code (default: 'en')
- `imagePath` - Path to image file for the page
- `imageAlt` - Alt text for accessibility
- `audioPath` - Path to audio narration file
- `coverImage` - Book cover image (first row only)
- `coverDescription` - Cover description text (first row only)

### CLI Command
```bash
node ./dist/index.js interactivebook <input.csv> <output.h5p> [options]

Options:
  -l, --language <code>   Language code (default: "en")
  -t, --title <title>     Override book title from CSV
  -d, --delimiter <char>  CSV delimiter (default: ",")
  -e, --encoding <enc>    File encoding (default: "UTF-8")
```

### Content Structure
Each Interactive Book contains:
- **Chapters array**: One chapter per CSV row
- **Chapter structure**: Each chapter contains an `item.content` array with:
  - H5P.AdvancedText (title + body text)
  - H5P.Image (optional)
  - H5P.Audio (optional)

### Media File Handling
- Support local file paths (resolved relative to CSV file location)
- Copy media files to appropriate directories in H5P package:
  - Images → `content/images/`
  - Audio → `content/audios/`
- Detect MIME types automatically
- Provide clear error messages for missing files

## Technical Requirements

### Architecture Components

1. **Module Class**: `src/interactivebook-module.ts` (or `interactive-book-module.ts`)
   - Implements `yargs.CommandModule`
   - Handles CLI argument parsing
   - Parses CSV with papaparse
   - Creates H5pPackage and InteractiveBookCreator

2. **Creator Class**: `src/interactivebook-creator.ts` (or `interactive-book-creator.ts`)
   - Extends `ContentCreator<H5pInteractiveBookContent>`
   - Implements abstract methods: `contentObjectFactory()`, `addContent()`, `addSettings()`
   - Generates chapter structures with nested H5P content types
   - Handles media file copying via H5pPackage methods

3. **Model Class**: `src/models/h5p-interactivebook-content.ts` (or `h5p-interactive-book-content.ts`)
   - Extends `H5pContent`
   - Defines TypeScript interfaces for Interactive Book structure
   - Includes: chapters, bookCover, metadata

4. **Registration**: Update `src/index.ts`
   - Import InteractiveBookModule
   - Register with `.command(new InteractiveBookModule())`

### Integration with Existing Code
- Use `H5pPackage.createFromHub("H5P.InteractiveBook", language)` to download/cache the template
- Use `H5pImage.fromLocalFile()` for image handling (if exists)
- Use `H5pAudio.fromLocalFile()` for audio handling (if exists)
- Use `h5pPackage.addContentFile()` to add media files to package
- Follow naming convention: H5P classes start with `H5p`, creator classes don't

## Existing Code Review

### Files Already Created
1. **src/models/h5p-interactive-book.ts** (misnamed - contains module code)
2. **src/interactive-book-creator.ts** (creator implementation)

### Issues Identified

**Module file (h5p-interactive-book.ts):**
- ❌ Wrong filename - should be `interactivebook-module.ts` or `interactive-book-module.ts`
- ❌ Typo in command: `<o>` should be `<output>`
- ✅ Good: CLI options setup, CSV parsing, H5pPackage creation

**Creator file (interactive-book-creator.ts):**
- ❌ Doesn't extend ContentCreator properly - missing abstract method implementations
- ❌ Direct calls to `h5pPackage.updateContent()` and `h5pPackage.addMetadata()` (these methods may not exist)
- ❌ Media file copying not properly integrated with H5pPackage
- ✅ Good: Chapter structure logic, HTML generation, MIME type detection

**Missing:**
- ❌ No model class (`H5pInteractiveBookContent`) defining the content structure
- ❌ No proper integration with `ContentCreator` workflow
- ❌ No registration in `index.ts`
- ❌ No test CSV file in `tests/` directory
- ❌ No template file preparation guidance

## Implementation Checklist

### Phase 1: Fix Architecture (Required)
- [ ] Rename/move module file to proper location
- [ ] Fix typo in command definition
- [ ] Create proper model class (`H5pInteractiveBookContent`)
- [ ] Refactor creator to properly extend `ContentCreator<H5pInteractiveBookContent>`
- [ ] Implement `contentObjectFactory()`, `addContent()`, `addSettings()`
- [ ] Use `h5pPackage.addContentFile()` for media files
- [ ] Register module in `index.ts`

### Phase 2: Media File Handling
- [ ] Integrate with `H5pImage` and `H5pAudio` helper classes (if they exist)
- [ ] Properly copy files to H5P package using existing methods
- [ ] Test with local image and audio files
- [ ] Handle missing file errors gracefully

### Phase 3: Testing & Validation
- [ ] Create test CSV file in `tests/` directory
- [ ] Create/obtain Interactive Book template for `content-type-cache/`
- [ ] Build and test: `npm run build`
- [ ] Generate test book: `node ./dist/index.js interactivebook ./tests/book1.csv ./test-book.h5p`
- [ ] Upload to H5P platform and verify functionality
- [ ] Test with images, audio, and text-only pages

### Phase 4: Documentation
- [ ] Update README.md with Interactive Book usage examples
- [ ] Create example CSV template
- [ ] Document CSV format in CLAUDE.md (already done)
- [ ] Add inline code documentation

## Success Criteria
- ✅ CLI command works: `node ./dist/index.js interactivebook input.csv output.h5p`
- ✅ Generated .h5p files can be uploaded to H5P platform successfully
- ✅ Books display correctly with text, images, and audio
- ✅ Error messages are clear and helpful
- ✅ Code follows existing patterns and conventions
- ✅ Works with both local media files and text-only books

## Timeline Estimate
- **Phase 1** (Architecture fixes): 1-2 days
- **Phase 2** (Media handling): 1-2 days
- **Phase 3** (Testing): 1-2 days
- **Phase 4** (Documentation): 0.5-1 day

**Total: 4-7 days** for complete, production-ready implementation

## Reference Documents
- [docs/h5p-cli-creator_Analysis_for_Interactive_Books.md](../../../docs/h5p-cli-creator_Analysis_for_Interactive_Books.md) - Detailed analysis with code examples
- [CLAUDE.md](../../../CLAUDE.md) - Architecture and implementation guide
- Existing implementations: [flashcards-module.ts](../../../src/flashcards-module.ts), [flashcards-creator.ts](../../../src/flashcards-creator.ts)
