# POC Demo: Template-Free H5P Compiler

This directory contains the proof-of-concept demonstration for the template-free H5P content compiler with AI integration.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your Anthropic API key:**
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Run the POC demo:**
   ```bash
   node dist/examples/poc-demo.js
   ```

5. **Check output:**
   ```bash
   ls -lh examples/biology-lesson.h5p
   ```

## Files in This Directory

### Input Files

- **biology-lesson.yaml** - YAML definition of the Interactive Book structure
  - 4 chapters with mixed content types
  - AI-generated text and quiz
  - Image and audio content
  - Demonstrates complete feature set

### Demo Scripts

- **poc-demo.ts** - Complete end-to-end POC demonstration
  - Parses YAML input
  - Fetches H5P libraries from Hub
  - Generates AI content using Claude
  - Builds Interactive Book structure
  - Assembles .h5p package without templates
  - Saves biology-lesson.h5p

- **poc-package-assembly-demo.ts** - Earlier demo focusing on package assembly
  - Shows LibraryRegistry and PackageAssembler in action
  - Does not include AI features

- **ai-quiz-demo.ts** - AI quiz generation demo
  - Shows QuizGenerator in isolation
  - Tests Claude API integration

### Legacy Files

- **interactive-book-template.csv** - CSV format for old Interactive Book module
  - Not used by new compiler
  - Kept for reference

## Output Files

After running `poc-demo.ts`:

- **biology-lesson.h5p** - Generated H5P package ready for upload
  - Complete Interactive Book with 4 chapters
  - Includes all H5P libraries (fetched from Hub)
  - Contains embedded images and audio
  - Features AI-generated content and quiz

## What the POC Demonstrates

### 1. Library Management
- Downloads H5P.InteractiveBook from H5P Hub API
- Automatically resolves and fetches all dependencies
- Downloads H5P.MultipleChoice for quiz support
- Caches libraries locally to avoid redundant downloads
- No manual template downloads required

### 2. YAML Input Parsing
- Parses structured YAML book definitions
- Validates book structure and content types
- Resolves file paths (images, audio)
- Supports AI directives (ai-text, ai-quiz)

### 3. AI Content Generation
- Uses Claude API to generate educational text
- Generates multiple-choice quiz questions from source text
- Formats AI output as H5P.MultipleChoice structures
- Handles API errors gracefully

### 4. Content Building
- Fluent API for building Interactive Books
- Supports text, image, audio, and quiz content
- Automatic semantic validation
- Tracks media files for package assembly

### 5. Template-Free Package Assembly
- Generates h5p.json from scratch
- Bundles all required library directories
- Includes media files with proper paths
- Creates valid .h5p ZIP structure
- No template files used

### 6. Platform Compatibility
- Generates packages compatible with H5P.com
- Works in Lumi H5P editor
- Follows H5P specification exactly

## Architecture Overview

The POC demonstrates a complete pipeline:

```
YAML Input (biology-lesson.yaml)
    |
    v
YamlInputParser
    |
    v
LibraryRegistry (fetch from H5P Hub)
    |
    v
ContentBuilder (+ QuizGenerator for AI)
    |
    v
SemanticValidator
    |
    v
PackageAssembler
    |
    v
Output (.h5p file)
```

### Key Components

1. **YamlInputParser** (`src/compiler/YamlInputParser.ts`)
   - Parses YAML book definitions
   - Validates structure
   - Resolves file paths

2. **LibraryRegistry** (`src/compiler/LibraryRegistry.ts`)
   - Fetches libraries from H5P Hub
   - Manages dependency resolution
   - Caches libraries locally

3. **SemanticValidator** (`src/compiler/SemanticValidator.ts`)
   - Parses semantics.json from libraries
   - Validates content against schemas
   - Provides detailed error messages

4. **ContentBuilder** (`src/compiler/ContentBuilder.ts`)
   - Fluent API for book creation
   - ChapterBuilder for nested content
   - Media file tracking

5. **PackageAssembler** (`src/compiler/PackageAssembler.ts`)
   - Generates h5p.json
   - Bundles library directories
   - Includes media files
   - Saves .h5p ZIP

6. **QuizGenerator** (`src/ai/QuizGenerator.ts`)
   - Claude API integration
   - Parses AI responses
   - Formats as H5P.MultipleChoice

## Next Steps

After running the POC:

1. **Validate the package:**
   - Upload `biology-lesson.h5p` to https://h5p.com
   - Test in Lumi H5P editor
   - Follow `../agent-os/specs/template-free-h5p-compiler-poc/VALIDATION_GUIDE.md`

2. **Document results:**
   - Fill in `../agent-os/specs/template-free-h5p-compiler-poc/poc-results.md`
   - Record what worked and what didn't
   - Provide recommendations

3. **Plan production:**
   - Based on POC results, decide on production implementation
   - Consider CLI interface design
   - Plan additional content type support
   - Evaluate handler/plugin architecture migration

## Troubleshooting

### "Cannot find module 'js-yaml'"

Run: `npm install`

### "ANTHROPIC_API_KEY not set"

Export your API key:
```bash
export ANTHROPIC_API_KEY="your-key"
```

Or create a `.env` file in project root.

### "Library download failed"

Check internet connection and H5P Hub availability:
```bash
curl https://api.h5p.org/v1/content-types
```

### "test-image.jpg not found"

Ensure test media files exist:
```bash
ls tests/test-image.jpg tests/test-audio.mp3
```

These files should already be in the repository (created in Phase 3).

## Technical Details

### Dependencies

- **js-yaml**: YAML parsing
- **@anthropic-ai/sdk**: Claude API integration
- **jszip**: ZIP package creation
- **axios**: HTTP requests for library downloads
- **fs-extra**: Enhanced file operations

### File Sizes

- biology-lesson.h5p: ~5-10 MB (due to bundled libraries)
- Cached libraries: ~20-30 MB total

### Performance

- First run (download libraries): ~30-60 seconds
- Subsequent runs (cached): ~5-15 seconds
- AI generation: ~5-10 seconds per AI directive

## Support

For issues or questions:
1. Check VALIDATION_GUIDE.md for troubleshooting steps
2. Review poc-results.md for known issues
3. Inspect dist/examples/poc-demo.js for implementation details
