# Specification: Interactive Book Content Type Support

## Goal
Add Interactive Book content type support to h5p-cli-creator, enabling users to generate interactive digital storybooks from CSV files with text, images, and audio, following the established Module + Creator + Model architecture pattern.

## User Stories
- As a content creator, I want to generate Interactive Book H5P packages from CSV files so that I can efficiently create multiple digital storybooks
- As a developer, I want the implementation to follow the existing ContentCreator pattern so that it maintains consistency with Flashcards and Dialog Cards implementations

## Specific Requirements

**Module Implementation (interactivebook-module.ts)**
- Implement yargs.CommandModule interface with command "interactivebook <input> <output>"
- Define CLI options: -l (language), -t (title override), -d (CSV delimiter), -e (encoding)
- Parse CSV input using papaparse with header detection and empty line skipping
- Create H5pPackage instance using H5pPackage.createFromHub("H5P.InteractiveBook", language)
- Instantiate InteractiveBookCreator with parsed data and CSV directory path
- Call creator.create() followed by creator.savePackage()
- Fix existing typo: change "<o>" to "<output>" in command definition

**Creator Implementation (interactivebook-creator.ts)**
- Extend ContentCreator<H5pInteractiveBookContent> abstract class (currently missing generic type parameter)
- Implement contentObjectFactory() to return new H5pInteractiveBookContent instance
- Implement addContent() to iterate through CSV data and build chapters array
- Implement addSettings() to configure book metadata and title
- Handle media files using H5pImage.fromLocalFile() and H5pAudio.fromLocalFile() helper classes
- Use h5pPackage.addContentFile() to add media buffers to package (not direct file copying)
- Support both local file paths (relative to CSV) and HTTP/HTTPS URLs for images and audio
- Generate proper H5P content structure with nested H5P.AdvancedText, H5P.Image, and H5P.Audio content types
- Provide clear error messages for missing files using console.warn() with context

**Model Implementation (h5p-interactivebook-content.ts)**
- Create new model class extending H5pContent
- Define chapters property as array of chapter objects
- Define bookCover property with coverDescription field
- Include metadata fields: title, language
- Model should match H5P Interactive Book content.json structure

**CSV Input Format**
- Required columns: bookTitle, pageTitle, pageText
- Optional columns: language, imagePath, imageAlt, audioPath, coverImage, coverDescription
- Each row represents one chapter/page in the book
- First row's bookTitle used for entire book unless overridden by -t flag
- Empty lines automatically skipped by papaparse
- Default delimiter: comma (,) - overridable with -d flag
- Default encoding: UTF-8 - overridable with -e flag

**Chapter Structure Generation**
- Each chapter contains item.content array with nested H5P content types
- H5P.AdvancedText added first with HTML containing h2 title and p tags for body text
- H5P.Image added if imagePath provided with proper mime type, path, and alt text
- H5P.Audio added if audioPath provided with minimalistic player mode and autoplay disabled
- All media paths resolved relative to CSV file directory
- Image files stored in content/images/ directory within package
- Audio files stored in content/audios/ directory within package

**Media File Handling**
- Detect URL vs local path by checking for http:// or https:// prefix
- For local files: use path.join(sourcePath, filePath) to resolve absolute path
- For URLs: download using H5pImage.fromDownload() or H5pAudio.fromDownload()
- Extract buffer, extension, and H5P object from helper class return value
- Generate sequential filenames: images/0.jpg, images/1.png, audios/0.mp3, etc.
- Call h5pPackage.addContentFile(filename, buffer) to add to package
- Set path property on H5P object after adding to package
- Wrap media processing in try-catch blocks with descriptive warnings

**Registration and Integration**
- Import InteractiveBookModule in src/index.ts
- Register using .command(new InteractiveBookModule())
- Follow existing pattern: module placed between other command registrations
- Ensure TypeScript compilation includes all new files
- Module filename should be interactivebook-module.ts (currently misnamed as h5p-interactive-book.ts)

**Error Handling and Validation**
- Validate CSV file exists and is readable before parsing
- Check for required columns (bookTitle, pageTitle, pageText) in CSV
- Provide clear error message if H5P package download fails
- Warn when media files not found but continue processing other pages
- Include file path and error message in warnings
- Use console.log for success messages, console.warn for non-fatal issues, console.error for critical failures

**HTML Text Generation**
- Escape HTML special characters in user input to prevent injection
- Wrap page title in h2 tags if provided
- Split pageText by double newlines (\n\n) to create separate paragraphs
- Wrap each paragraph in p tags
- Trim whitespace from paragraphs before HTML generation

## Existing Code to Leverage

**ContentCreator Abstract Class (src/content-creator.ts)**
- Provides create() method that orchestrates workflow: clear content, call addContent(), call addSettings(), add language strings, save main content file
- Constructor accepts h5pPackage and sourcePath parameters
- Requires implementation of three abstract methods: contentObjectFactory(), addContent(), addSettings()
- Automatically clears package content and initializes content object
- Handles JSON serialization of content object to content.json

**H5pPackage Infrastructure (src/h5p-package.ts)**
- createFromHub() static method downloads or uses cached H5P package
- addContentFile(path, buffer) method adds media files to package ZIP
- addMetadata() method updates h5p.json metadata
- clearContent() method removes existing content from package
- Manages JSZip internally for package manipulation
- Caches downloaded packages in content-type-cache/ directory

**H5pImage Helper Class (src/models/h5p-image.ts)**
- fromLocalFile(path) returns {image, buffer, extension} with auto-detected mime type and dimensions
- fromDownload(url) fetches image from URL and returns same structure
- Sets copyright.license to "U" (unlicensed) by default
- Automatically detects image dimensions using buffer-image-size
- Uses mime-types library for MIME type detection

**H5pAudio Helper Class (src/models/h5p-audio.ts)**
- fromLocalFile(path) returns {audio, buffer, extension} with auto-detected mime type
- fromDownload(url) fetches audio from URL and returns same structure
- Normalizes audio/mp3 to audio/mpeg for H5P compatibility
- Sets copyright.license to "U" by default
- Uses mime-types library for MIME type detection

**FlashcardsCreator Pattern (src/flashcards-creator.ts)**
- Demonstrates proper ContentCreator extension with generic type parameter
- Shows how to iterate through CSV data in addContent()
- Demonstrates media file handling: check for URL prefix, call helper class, get filename, add to package, set path
- Uses sequential counter for generating unique filenames
- Shows proper error handling with try-catch and console.error

## Out of Scope
- Automated testing framework setup (manual testing only for this phase)
- Support for URL downloads of media files (focus on local files first, URL support can follow existing pattern)
- Interactive elements within pages (quizzes, drag-drop) - stick to basic content types
- Multiple images per page - only one image per chapter in initial implementation
- Video support - only images and audio for now
- Cover image customization beyond description text
- Table of contents configuration options
- Rich text formatting beyond basic HTML escaping
- Markdown-to-HTML conversion for text content
- Database or Google Sheets integration - CSV files only
