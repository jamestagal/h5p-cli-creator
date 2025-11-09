# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

h5p-cli-creator is a command-line utility for mass creating H5P content packages from CSV input files. It downloads H5P content type packages from the H5P Hub, populates them with data from CSV files, and outputs `.h5p` files. Currently supports **Flashcards**, **Dialog Cards**, and **Interactive Book** content types.

## Agent OS Integration

This project integrates with Agent OS for product planning and feature development:

- **Product Documentation**: [agent-os/product/](agent-os/product/) contains mission.md, roadmap.md, and tech-stack.md
- **Specs**: Feature specifications are tracked in `agent-os/specs/` when using Agent OS workflows
- **Analysis**: [docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md](docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md) provides detailed analysis for extending to Interactive Book content type with implementation examples and timeline estimates
- **Use `/shape-spec` or `/write-spec`** to create feature specifications following Agent OS patterns

## Development Commands

### Building and Running
```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript to ./dist
node ./dist/index.js --help                    # General help
node ./dist/index.js flashcards --help         # Flashcards command help
node ./dist/index.js dialogcards --help        # Dialog cards command help
node ./dist/index.js interactivebook --help    # Interactive Book command help
```

### Example Usage
```bash
# Create flashcards from CSV
node ./dist/index.js flashcards ./tests/flash1.csv ./output.h5p -l=de -t="My Flashcards" --description="Enter translations"

# Create dialog cards from CSV
node ./dist/index.js dialogcards ./tests/dialog1.csv ./output.h5p -l=de -n="My Cards" -m="repetition"

# Create interactive book from CSV
node ./dist/index.js interactivebook ./tests/book1.csv ./output.h5p -l=en -t="My Story Book"

# Batch processing multiple files
for file in ./input/*.csv; do
  output="${file%.csv}.h5p"
  node ./dist/index.js flashcards "$file" "$output" -l=en
done
```

### Testing

Currently there is no automated test suite. Testing is done manually:

1. **Build**: `npm run build`
2. **Test with sample CSVs**: Use files in [tests/](tests/) directory (flash1.csv, dialog1.csv, book1.csv)
3. **Validate output**: Upload generated .h5p files to an H5P platform and verify functionality

When adding new content types, create corresponding test CSV files in the tests/ directory.

## Architecture

### Core Components

1. **Entry Point** ([index.ts](src/index.ts))
   - Uses `yargs` for CLI command routing
   - Registers command modules (FlashcardsModule, DialogCardsModule, InteractiveBookModule)
   - Each content type is a separate yargs command

2. **Module Pattern** (e.g., [flashcards-module.ts](src/flashcards-module.ts))
   - Implements `yargs.CommandModule` interface
   - Defines CLI arguments and options
   - Parses CSV input using papaparse
   - Orchestrates H5pPackage creation and content generation
   - Each module creates an H5pPackage and corresponding Creator

3. **Creator Pattern** ([content-creator.ts](src/content-creator.ts))
   - Abstract base class `ContentCreator<T extends H5pContent>`
   - Provides infrastructure for all content types
   - Concrete implementations (e.g., [flashcards-creator.ts](src/flashcards-creator.ts), [interactive-book-creator.ts](src/interactive-book-creator.ts)) extend this
   - Key methods to implement:
     - `contentObjectFactory()`: Instantiate content model
     - `addContent()`: Populate content from CSV data
     - `addSettings()`: Configure content settings
   - The `create()` method orchestrates the full workflow

4. **H5P Package Management** ([h5p-package.ts](src/h5p-package.ts))
   - Downloads content type packages from H5P Hub API
   - Caches packages locally in `content-type-cache/` directory
   - Manages JSZip operations for H5P package structure
   - Handles language strings from H5P libraries
   - Methods: `clearContent()`, `addMainContentFile()`, `addContentFile()`, `savePackage()`

5. **Content Models** ([src/models/](src/models/))
   - TypeScript classes representing H5P content structures
   - Base class: `H5pContent`
   - Specific implementations: `H5pFlashcardsContent`, `H5pDialogCardsContent`, `H5pInteractiveBookContent`
   - Supporting models: `H5pImage`, `H5pAudio`, `H5pCopyrightInformation`

### Data Flow

1. User invokes CLI command with CSV file and options
2. Module parses CSV using papaparse
3. Module creates `H5pPackage.createFromHub()` (downloads or uses cached package)
4. Module instantiates Creator with parsed data
5. Creator extends `ContentCreator` and populates content via abstract methods
6. Creator handles media files (images/audio) from local paths or URLs
7. Package is saved as `.h5p` file

### Media File Handling

Both local files and URLs are supported for images and audio:
- Local paths: Resolved relative to CSV file directory
- URLs: Downloaded via axios and embedded in package
- Files are added to package with `h5pPackage.addContentFile(path, buffer)`
- Helper classes `H5pImage` and `H5pAudio` provide `fromLocalFile()` and `fromDownload()` methods

## Adding New Content Types

To add support for a new H5P content type:

1. Create a **Module class** in `src/{contenttype}-module.ts`:
   - Implement `yargs.CommandModule`
   - Define command, positional args, and options
   - Parse CSV input
   - Instantiate H5pPackage and Creator

2. Create a **Creator class** in `src/{contenttype}-creator.ts`:
   - Extend `ContentCreator<YourContentType>`
   - Implement `contentObjectFactory()`, `addContent()`, `addSettings()`
   - Handle CSV row-to-content mapping
   - Process any media files

3. Create a **Content model** in `src/models/h5p-{contenttype}-content.ts`:
   - Extend `H5pContent`
   - Define properties matching H5P content type schema

4. Register the module in [index.ts](src/index.ts):
   ```typescript
   .command(new YourContentTypeModule())
   ```

Reference [flashcards-module.ts](src/flashcards-module.ts) and [flashcards-creator.ts](src/flashcards-creator.ts) as implementation examples.

### Interactive Book Implementation Guide

For implementing Interactive Book support (detailed analysis in [docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md](docs/deprecated/h5p-cli-creator_Analysis_for_Interactive_Books.md)):

**Key considerations:**
- Interactive Book uses a `chapters` array in content.json
- Each chapter contains an `item.content` array with multiple H5P sub-content types (H5P.AdvancedText, H5P.Image, H5P.Audio)
- CSV format: Each row = one page, with columns: bookTitle, pageTitle, pageText, imagePath, imageAlt, audioPath
- Template creation: Manually create a sample Interactive Book in H5P editor, download as .h5p, place in templates/

**Implementation pattern:**
1. Parse CSV rows into page data structures
2. For each page, create a chapter object with nested content types
3. Use `<h2>` tags for page titles, `<p>` tags for text in H5P.AdvancedText
4. Copy media files to `content/images/` and `content/audios/` directories
5. Build proper H5P sub-content structures for H5P.Image and H5P.Audio

**Completed implementation:**
- [interactive-book-module.ts](src/interactive-book-module.ts): CLI command module
- [interactive-book-creator.ts](src/interactive-book-creator.ts): Content creation logic following ContentCreator pattern
- [h5p-interactivebook-content.ts](src/models/h5p-interactivebook-content.ts): Content model

## Understanding H5P Package Structure

H5P packages (.h5p files) are ZIP archives with this structure:

```
package.h5p (ZIP file)
├── h5p.json                    # Package metadata (title, language, main library)
├── content/
│   ├── content.json            # Main content data (what your Creator builds)
│   ├── images/                 # Image files referenced in content.json
│   ├── audios/                 # Audio files referenced in content.json
│   └── videos/                 # Video files (if applicable)
└── [H5P library directories]   # Library code (downloaded from Hub)
```

**To understand a content type's structure:**
1. Create sample content manually in H5P editor
2. Download as .h5p
3. Unzip and examine content/content.json
4. Use this as your template and reference for implementation

## ⚠️ CRITICAL: H5P Library Versioning Requirements

**H5P platforms enforce STRICT version matching.** Version mismatches are the #1 cause of "content not rendering" issues.

### The Version Matching Rule

H5P platforms (h5p.com, Moodle, WordPress) validate that:
1. **h5p.json** declares the exact library versions
2. **content.json** references match those declared versions
3. **Library directories** bundled in the .h5p match declared versions
4. Platform's H5P core is compatible with the library versions

**If ANY version doesn't match exactly, content will fail to render.**

### Real-World Example: DialogCards 1.8 vs 1.9

**Symptom:** DialogCards appear in editor as "Empty column", don't render in player.

**Root Cause Analysis:**
- Package declared `H5P.Dialogcards 1.8` in h5p.json
- Package bundled `H5P.Dialogcards-1.8/` library files
- Platform expected/required `H5P.Dialogcards 1.9`
- **Result:** Complete rendering failure despite correct content structure

**Key Differences Between Versions:**
- DialogCards 1.8: Core API 1.15, patch 1.8.2, 29 language files
- DialogCards 1.9: Core API 1.26, patch 1.9.18, 45 language files
- Different JavaScript/CSS implementations (non-compatible)
- Different semantics.json schemas

**The Fix:**
1. Add `H5P.Dialogcards-1.9.h5p` to `content-type-cache/` (from working package)
2. Update handler: `library: "H5P.Dialogcards 1.9"` in DialogCardsHandler.ts
3. Rebuild package - LibraryRegistry auto-selects version 1.9 from cache
4. Verify h5p.json shows `"minorVersion": 9`

### Debugging Workflow for Version Issues

**When content doesn't render after upload:**

1. **Create reference package from platform:**
   ```bash
   # Create sample content manually on target platform
   # Download as working-reference.h5p
   ```

2. **Compare versions in h5p.json:**
   ```bash
   # Check working package
   unzip -q -c working-reference.h5p "h5p.json" | python3 -m json.tool | grep -A 2 "machineName"

   # Check your generated package
   unzip -q -c your-package.h5p "h5p.json" | python3 -m json.tool | grep -A 2 "machineName"
   ```

3. **Compare library directories:**
   ```bash
   # Check what libraries are bundled
   unzip -l working-reference.h5p | grep "^.*H5P\." | grep "/$" | sort
   unzip -l your-package.h5p | grep "^.*H5P\." | grep "/$" | sort
   ```

4. **Extract and compare specific library versions:**
   ```bash
   # Check DialogCards version in library.json
   unzip -q -c package.h5p "H5P.Dialogcards-1.9/library.json" | python3 -m json.tool | grep -E "majorVersion|minorVersion|patchVersion"
   ```

5. **Verify content.json references:**
   ```bash
   # Find all library references in content
   unzip -q -c package.h5p "content/content.json" | python3 -c "
   import json, sys, re
   data = json.load(sys.stdin)
   libs = re.findall(r'\"library\":\\s*\"([^\"]+)\"', json.dumps(data))
   for lib in sorted(set(libs)):
       print(lib)
   "
   ```

### Version Management Best Practices

**Cache Management:**
```
content-type-cache/
├── H5P.InteractiveBook-1.11.h5p    ✅ Versioned filename (preferred)
├── H5P.Dialogcards-1.9.h5p         ✅ Versioned filename (preferred)
├── H5P.MultiChoice-1.16.h5p        ✅ Versioned filename (preferred)
└── H5P.Image.h5p                   ⚠️  Non-versioned (legacy, avoid)
```

**Handler Code Versioning:**
- Always specify full version in handlers: `"H5P.Dialogcards 1.9"` not `"H5P.Dialogcards"`
- Update handler code when changing cached library versions
- Test on target platform before distributing packages

**LibraryRegistry Behavior:**
- Auto-selects LATEST version from cache when multiple exist
- Prefers versioned filenames: `H5P.Dialogcards-1.9.h5p`
- Falls back to non-versioned: `H5P.Dialogcards.h5p`
- Sorting: Descending by major.minor (1.9 > 1.8)

**Platform Compatibility Strategy:**
1. **Identify target platform version** - Create/download reference package
2. **Extract library versions** - Document in `content-type-cache/README.md`
3. **Keep reference packages** - Store working .h5p files for comparison
4. **Test before distributing** - Always upload to target platform first
5. **Document version requirements** - Track which platform versions work

### Common Version Pitfall Scenarios

❌ **Scenario 1: Mixing library sources**
- Downloaded `H5P.Dialogcards-1.8.h5p` from Hub
- Extracted `H5P.Column-1.18` from InteractiveBook-1.11
- Result: Incompatible dependency versions, rendering failure

❌ **Scenario 2: Assuming backward compatibility**
- Generated package with DialogCards 1.8
- Platform upgraded to require 1.9
- Result: Old packages stop working on updated platform

❌ **Scenario 3: Non-versioned cache files**
- Multiple `H5P.Dialogcards.h5p` files from different dates
- No way to know which version without extracting
- Result: Unpredictable builds, inconsistent output

✅ **Correct Approach:**
- Use versioned filenames always
- Match handler version declarations to cached libraries
- Keep working reference packages from each target platform
- Test on actual deployment platform before distribution
- Document version requirements in project docs

## Naming Convention

**Classes from H5P libraries or content types start with `H5p`** (e.g., `H5pImage`, `H5pFlashcard`). Classes that are part of the creator infrastructure do NOT use this prefix (e.g., `ContentCreator`, `FlashcardsModule`).

## CSV Format

- Delimiter: configurable (default `;`)
- Encoding: configurable (default `UTF-8`)
- Headers: Required (e.g., `question`, `answer`, `tip`, `image`)
- Empty lines: Skipped automatically

## Dependencies

- **yargs**: CLI argument parsing
- **papaparse**: CSV parsing
- **jszip**: H5P package (ZIP) manipulation
- **axios**: Downloading packages from H5P Hub and media files
- **fs-extra**: Enhanced file system operations
- **mime-types**: MIME type detection for media files
- **buffer-image-size**: Image dimension detection

## Future Architecture Plans

The [docs/](docs/) directory contains design documentation for planned improvements:

### Handler/Plugin Architecture

[H5P_Handler_Architecture_Complete_Design.md](docs/deprecated/H5P_Handler_Architecture_Complete_Design.md) proposes a handler-based plugin system that would:
- **Eliminate code duplication**: Each content type implements a standard `ContentHandler` interface
- **Enable rapid content type additions**: New handlers can be added in ~30-60 minutes vs 4-8 hours currently
- **Improve maintainability**: Each handler is isolated and independently testable
- **Auto-generate documentation**: CSV format docs and CLI help generated from handler definitions

**Key concepts from the design:**
- `ContentHandler` interface defines: `validate()`, `generate()`, `parseCSV()`, `getCSVColumns()`, `getCLIOptions()`
- `HandlerRegistry` manages handler registration and discovery
- `HandlerContext` provides shared utilities (file operations, logging, MIME detection)
- Dynamic CLI command generation from registered handlers

**Implementation structure:**
```
src/handlers/
├── ContentHandler.ts        # Core interfaces
├── HandlerRegistry.ts        # Registry implementation
├── HandlerContextImpl.ts     # Context utilities
├── FlashcardsHandler.ts      # Refactored flashcards
├── DialogCardsHandler.ts     # Refactored dialog cards
└── InteractiveBookHandler.ts # Example new content type
```

See [H5P_Handler_Implementation_File_Structure.md](docs/deprecated/H5P_Handler_Implementation_File_Structure.md) for detailed implementation guide.

### Git Workflow

[Git_Forking_vs_Cloning_Complete_Guide.md](docs/deprecated/Git_Forking_vs_Cloning_Complete_Guide.md) explains the fork-based contribution workflow:
- Fork the repository on GitHub first
- Clone your fork locally
- Add upstream remote: `git remote add upstream https://github.com/sr258/h5p-cli-creator.git`
- Work on feature branches
- Push to your fork, then create PR to upstream

**Quick setup:**
```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/h5p-cli-creator.git
cd h5p-cli-creator
git remote add upstream https://github.com/sr258/h5p-cli-creator.git
git checkout -b feature/your-feature
```
