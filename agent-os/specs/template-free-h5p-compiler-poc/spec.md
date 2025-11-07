# Specification: Template-Free H5P Content Compiler with AI Integration (POC)

## Goal
Build a proof of concept system that generates H5P Interactive Book packages programmatically without requiring manual template creation, by fetching H5P library files from the Hub, parsing semantic definitions, validating content structures, and assembling complete .h5p packages from scratch with AI-powered content generation capabilities.

## User Stories
- As a content developer, I want to generate H5P packages without downloading templates manually so that I can automate content production workflows
- As an AI-assisted educator, I want to describe content in plain language and have it automatically compiled into valid H5P packages so that I can focus on pedagogy instead of technical H5P structure

## Specific Requirements

**Library Registry with Hub API Integration**
- Fetch library metadata and packages from H5P Hub API (https://api.h5p.org/v1/)
- Download .h5p library packages for H5P.InteractiveBook and dependencies (H5P.Column, H5P.AdvancedText, H5P.Image, H5P.Audio)
- Cache downloaded libraries locally in content-type-cache directory to avoid redundant downloads
- Extract semantics.json from library packages using JSZip
- Parse library.json to extract version information and dependency lists
- Resolve dependency trees recursively to ensure all required libraries are available
- Store library metadata in memory registry for fast lookup during content generation

**Semantic Parser and Validator**
- Parse semantics.json structure to understand field definitions, types, and constraints
- Extract field metadata including name, type, label, description, default values, and validation rules
- Build type definitions dynamically from semantic field types (text, number, boolean, library, group, list)
- Validate content objects against semantic definitions before package assembly
- Check required fields are present and non-empty
- Verify field types match semantic definitions (string vs number vs object vs array)
- Validate library references match expected format (library name with version)
- Provide detailed error messages with field paths and expected values when validation fails

**Content Builder with Type-Safe API**
- Provide fluent builder API for constructing H5P content structures programmatically
- Support nested content creation (Interactive Book -> chapters -> column -> text/image/audio)
- Automatic semantic validation during content construction
- Type-safe methods for adding chapters, pages, and sub-content elements
- Helper methods for common content types (addTextPage, addImagePage, addAudioPage, addQuizPage)
- Automatic generation of required metadata (contentType, license, title)
- Support for media file references with proper path resolution

**Package Assembler for Template-Free Generation**
- Build complete .h5p ZIP structure from scratch without template files
- Generate content/content.json with validated content structure
- Generate h5p.json with package metadata (title, language, mainLibrary, preloadedDependencies)
- Bundle all required library directories from registry into package
- Include media files (images, audio) in content directory with proper paths
- Set correct MIME types and file permissions in ZIP structure
- Validate package structure matches H5P specification before output
- Output .h5p file that passes validation on H5P platforms (h5p.com, Lumi, LMS systems)

**AI Content Generator - Quiz from Text**
- Accept plain text input (educational content, lesson text)
- Use Claude API (@anthropic-ai/sdk) to extract quiz questions
- Generate H5P.MultipleChoice content structures from AI output
- Parse AI-generated questions into proper H5P format with question text, answers array, and correct answer indices
- Integrate generated quiz content into ContentBuilder for inclusion in Interactive Book
- Handle AI API errors gracefully with fallback to empty quiz or manual content
- Demonstrate complete pipeline: Text -> AI -> ContentBuilder -> SemanticValidator -> PackageAssembler -> .h5p file

**YAML/JSON Input Format for POC**
- Accept YAML or JSON input describing book structure instead of CSV
- Support book metadata (title, language, coverDescription)
- Support chapter/page definitions with pageTitle, pageText, imagePath, audioPath, imageAlt
- Support AI generator directives (generate: quiz, sourceText: "photosynthesis content")
- Parse YAML/JSON into intermediate data structures for ContentBuilder
- Validate input structure before content generation
- Provide clear error messages for malformed input files

**Testing and Validation Infrastructure**
- Create test YAML input file with multi-page book structure
- Include test media files (test-image.jpg, test-audio.mp3)
- Generate biology-lesson.h5p as proof of concept output
- Upload generated package to h5p.com platform for validation
- Test in Lumi H5P editor for local validation
- Verify all content displays correctly (text formatting, images, audio playback)
- Verify AI-generated quiz questions render and function properly
- Document any platform-specific issues or incompatibilities discovered

## Visual Design
No visual mockups for POC - this is a backend/CLI system. Success criteria is that generated packages display correctly on standard H5P platforms.

## Existing Code to Leverage

**H5pPackage class for library management**
- Uses axios to download from H5P Hub API (https://api.h5p.org/v1/content-types/{name})
- Implements local caching in content-type-cache directory
- Provides JSZip integration for extracting library files
- Has methods: createFromHub(), clearContent(), addMainContentFile(), addContentFile(), savePackage()
- Reuse download and caching logic for new LibraryRegistry component

**LanguageStrings class for semantic parsing**
- Already extracts semantics.json from library packages (line 21)
- Parses semantic field definitions into object structure
- Demonstrates how to navigate JSZip library directories
- Reuse semantic extraction pattern for new SemanticValidator component

**ContentCreator abstract base class pattern**
- Provides template for content generation workflow
- Methods: contentObjectFactory(), addContent(), addSettings(), create()
- Demonstrates how to orchestrate H5pPackage, content model, and JSON generation
- Reuse orchestration pattern but eliminate dependency on downloaded templates

**H5pImage and H5pAudio helper classes**
- Support both local file paths and URL downloads
- Handle MIME type detection and metadata extraction
- Methods: fromLocalFile(), fromDownload()
- Return buffer, extension, and H5P metadata object
- Reuse for media file handling in new ContentBuilder component

**Interactive Book content model and creator**
- H5pInteractiveBookContent defines chapters array and bookCover structure
- InteractiveBookCreator demonstrates nested content creation (chapters -> column -> text/image/audio)
- Shows proper H5P.Column, H5P.AdvancedText, H5P.Image, H5P.Audio structure
- Reuse nested content patterns and H5P library version numbers (H5P.Column 1.18, H5P.AdvancedText 1.1, H5P.Image 1.1, H5P.Audio 1.5)

## Out of Scope
- Support for H5P content types other than H5P.InteractiveBook (flashcards, dialog cards, etc will be added post-POC)
- Full handler/plugin architecture implementation (defer until POC validates approach)
- Complex AI pipelines with multiple generators (only one QuizGenerator for POC)
- Multi-modal AI capabilities (video transcription, PDF extraction, image analysis)
- CLI interface (POC will use programmatic API only, CLI added later)
- Production-grade error handling and recovery mechanisms
- Performance optimization and parallel processing
- Comprehensive test suite with unit and integration tests
- Documentation generation from semantic definitions
- Template caching strategies beyond basic file caching
- Support for all 54 H5P content types
- Web-based UI or editor interface
