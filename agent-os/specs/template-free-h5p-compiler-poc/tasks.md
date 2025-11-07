# Task Breakdown: Template-Free H5P Content Compiler POC

## Overview
Total Tasks: 6 major task groups with 34 sub-tasks
Estimated Timeline: 16-24 hours of focused development

## Task List

### Phase 1: Library Management Foundation

#### Task Group 1: Library Registry with Hub API Integration
**Dependencies:** None

- [x] 1.0 Complete Library Registry foundation
  - [x] 1.1 Write 2-8 focused tests for LibraryRegistry
    - Test library fetching from Hub API
    - Test local caching behavior (cache hit/miss)
    - Test library metadata extraction
    - Skip exhaustive edge cases (network errors, malformed responses)
  - [x] 1.2 Create LibraryRegistry class in src/compiler/LibraryRegistry.ts
    - Method: `fetchLibrary(name: string): Promise<LibraryMetadata>`
    - Method: `getLibrary(name: string): Promise<LibraryMetadata>`
    - Method: `resolveDependencies(libraryName: string): Promise<LibraryMetadata[]>`
    - Reuse H5pPackage download and caching patterns
    - Extract library.json and semantics.json from downloaded packages
  - [x] 1.3 Implement library metadata extraction
    - Parse library.json for version, dependencies, preloadedJs, preloadedCss
    - Extract semantics.json using JSZip
    - Store metadata in memory registry (Map<string, LibraryMetadata>)
  - [x] 1.4 Implement dependency resolution
    - Recursively fetch all dependencies from library.json
    - Build complete dependency tree
    - Handle circular dependencies gracefully
  - [x] 1.5 Test library fetching for H5P.InteractiveBook
    - Fetch H5P.InteractiveBook from Hub
    - Verify dependencies include FontAwesome, H5P.JoubelUI
    - Verify semantics.json is extracted correctly
  - [x] 1.6 Ensure library registry tests pass
    - Run ONLY the 2-8 tests written in 1.1
    - Verify caching reduces redundant downloads
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 1.1 pass ✓
- LibraryRegistry can fetch and cache H5P.InteractiveBook and dependencies ✓
- Dependency tree is resolved correctly ✓
- semantics.json is extracted from library packages ✓

### Phase 2: Semantic Understanding

#### Task Group 2: Semantic Parser and Validator
**Dependencies:** Task Group 1

- [ ] 2.0 Complete Semantic Parser and Validator
  - [ ] 2.1 Write 2-8 focused tests for SemanticValidator
    - Test field type validation (text, number, boolean, library, group, list)
    - Test required field validation
    - Test nested structure validation
    - Skip exhaustive validation scenarios
  - [ ] 2.2 Create SemanticValidator class in src/compiler/SemanticValidator.ts
    - Method: `parseSemantics(semanticsJson: any): SemanticSchema`
    - Method: `validate(content: any, schema: SemanticSchema): ValidationResult`
    - Method: `getFieldDefinition(fieldPath: string): FieldDefinition`
  - [ ] 2.3 Implement semantic field parser
    - Parse field definitions: name, type, label, description, default
    - Extract validation rules: required, min, max, pattern
    - Build recursive schema for nested groups and lists
    - Handle library references (e.g., "library": "H5P.Column 1.18")
  - [ ] 2.4 Implement content validation logic
    - Check required fields are present
    - Verify field types match definitions (string vs number vs object vs array)
    - Validate library references match expected format
    - Generate detailed error messages with field paths
  - [ ] 2.5 Test validation with H5P.InteractiveBook schema
    - Parse semantics.json from H5P.InteractiveBook library
    - Validate sample book structure against schema
    - Test error messages for invalid content
  - [ ] 2.6 Ensure semantic validator tests pass
    - Run ONLY the 2-8 tests written in 2.1
    - Verify validation catches type mismatches
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.1 pass
- SemanticValidator parses H5P.InteractiveBook semantics.json
- Content validation catches required field errors
- Validation provides clear error messages with field paths

### Phase 3: Content Building API

#### Task Group 3: Content Builder with Fluent API
**Dependencies:** Task Group 2

- [ ] 3.0 Complete Content Builder with fluent API
  - [ ] 3.1 Write 2-8 focused tests for ContentBuilder
    - Test chapter creation
    - Test nested content addition (text, image, audio)
    - Test automatic semantic validation
    - Skip exhaustive content type combinations
  - [ ] 3.2 Create ContentBuilder class in src/compiler/ContentBuilder.ts
    - Method: `createBook(title: string, language: string): this`
    - Method: `addChapter(chapterTitle: string): ChapterBuilder`
    - Method: `build(): BookContent`
    - Method: `validate(): ValidationResult`
  - [ ] 3.3 Create ChapterBuilder helper class
    - Method: `addTextPage(title: string, text: string): this`
    - Method: `addImagePage(title: string, imagePath: string, alt: string): this`
    - Method: `addAudioPage(title: string, audioPath: string): this`
    - Method: `addCustomContent(content: any): this`
  - [ ] 3.4 Implement H5P nested content structure generation
    - Generate H5P.Column content wrapper
    - Generate H5P.AdvancedText with proper HTML formatting
    - Generate H5P.Image with metadata
    - Generate H5P.Audio with metadata
    - Reuse patterns from InteractiveBookCreator
  - [ ] 3.5 Integrate media file handling
    - Reuse H5pImage.fromLocalFile() and H5pImage.fromDownload()
    - Reuse H5pAudio.fromLocalFile() and H5pAudio.fromDownload()
    - Track media files for package assembly phase
  - [ ] 3.6 Implement automatic semantic validation
    - Validate content structure during build()
    - Use SemanticValidator to check against schema
    - Throw descriptive errors for invalid content
  - [ ] 3.7 Test building multi-chapter book
    - Create book with 3+ chapters
    - Add text, image, and audio pages
    - Verify nested structure matches H5P.InteractiveBook format
  - [ ] 3.8 Ensure content builder tests pass
    - Run ONLY the 2-8 tests written in 3.1
    - Verify fluent API creates valid structures
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 3.1 pass
- ContentBuilder creates valid H5P.InteractiveBook structures
- Fluent API supports nested content creation
- Automatic validation catches structural errors

### Phase 4: Package Assembly

#### Task Group 4: Template-Free Package Assembly
**Dependencies:** Task Group 3

- [ ] 4.0 Complete Package Assembler
  - [ ] 4.1 Write 2-8 focused tests for PackageAssembler
    - Test h5p.json generation
    - Test content.json assembly
    - Test library bundling
    - Skip exhaustive packaging scenarios
  - [ ] 4.2 Create PackageAssembler class in src/compiler/PackageAssembler.ts
    - Method: `assemble(content: BookContent, registry: LibraryRegistry): JSZip`
    - Method: `generateH5pJson(content: BookContent): any`
    - Method: `bundleLibraries(libraries: LibraryMetadata[]): void`
    - Method: `addMediaFiles(files: MediaFile[]): void`
  - [ ] 4.3 Implement h5p.json generation
    - Set title, language, mainLibrary from content
    - Build preloadedDependencies array from registry
    - Set embedTypes, license metadata
    - Follow H5P specification format
  - [ ] 4.4 Implement library bundling without templates
    - Copy library directories from LibraryRegistry cache
    - Include library.json, semantics.json, preloadedJs, preloadedCss
    - Preserve directory structure (e.g., H5P.InteractiveBook-1.8/)
    - Do NOT use template files
  - [ ] 4.5 Implement media file assembly
    - Copy image files to content/images/ with proper paths
    - Copy audio files to content/audios/ with proper paths
    - Set correct MIME types in ZIP
    - Update content.json references to match paths
  - [ ] 4.6 Implement content.json assembly
    - Serialize ContentBuilder output to JSON
    - Add to content/content.json in ZIP
    - Validate JSON structure before assembly
  - [ ] 4.7 Test complete package assembly
    - Build sample book with ContentBuilder
    - Assemble into .h5p ZIP without templates
    - Verify ZIP structure matches H5P specification
    - Check all required files present (h5p.json, content/content.json, libraries)
  - [ ] 4.8 Ensure package assembler tests pass
    - Run ONLY the 2-8 tests written in 4.1
    - Verify packages have correct structure
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 4.1 pass
- PackageAssembler generates valid .h5p packages without templates
- All required libraries are bundled correctly
- Media files are included with proper paths

### Phase 5: AI Integration

#### Task Group 5: AI Content Generation
**Dependencies:** Task Group 3

- [ ] 5.0 Complete AI Quiz Generator
  - [ ] 5.1 Write 2-8 focused tests for QuizGenerator
    - Test quiz generation from sample text
    - Test H5P.MultipleChoice structure creation
    - Test error handling for API failures
    - Skip exhaustive AI response scenarios
  - [ ] 5.2 Install @anthropic-ai/sdk dependency
    - Add to package.json
    - Configure TypeScript types
    - Set up API key handling (environment variable)
  - [ ] 5.3 Create QuizGenerator class in src/ai/QuizGenerator.ts
    - Method: `generateQuiz(sourceText: string): Promise<QuizContent>`
    - Method: `parseAIResponse(response: string): QuizQuestion[]`
    - Method: `toH5pFormat(questions: QuizQuestion[]): any`
  - [ ] 5.4 Implement Claude API integration
    - Use Anthropic SDK to call Claude API
    - Provide system prompt for quiz generation
    - Parse structured JSON response
    - Handle API errors gracefully (return empty quiz or throw)
  - [ ] 5.5 Implement H5P.MultipleChoice content generation
    - Create proper H5P.MultipleChoice structure
    - Format question text, answers array, correct indices
    - Add metadata (behaviour, l10n settings)
    - Reference H5P.MultipleChoice semantics.json
  - [ ] 5.6 Integrate with ContentBuilder
    - Add ContentBuilder.addQuizPage(questions: QuizContent) method
    - Embed H5P.MultipleChoice in chapter structure
    - Test end-to-end: text -> QuizGenerator -> ContentBuilder
  - [ ] 5.7 Test AI generation pipeline
    - Generate quiz from sample biology text
    - Verify H5P.MultipleChoice structure is valid
    - Test with SemanticValidator
  - [ ] 5.8 Ensure AI generator tests pass
    - Run ONLY the 2-8 tests written in 5.1
    - Verify quiz structures are valid
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 5.1 pass
- QuizGenerator calls Claude API successfully
- Generated quizzes have valid H5P.MultipleChoice structure
- Pipeline integrates with ContentBuilder

### Phase 6: End-to-End Testing

#### Task Group 6: POC Validation and Testing
**Dependencies:** Task Groups 1-5

- [ ] 6.0 Complete POC validation
  - [ ] 6.1 Create YAML input parser
    - Install js-yaml dependency
    - Create YamlInputParser class in src/compiler/YamlInputParser.ts
    - Method: `parse(yamlPath: string): BookDefinition`
    - Support book metadata, chapters, AI directives
  - [ ] 6.2 Create biology-lesson.yaml test file
    - Define book structure with 4 chapters
    - Chapter 1: AI-generated summary of photosynthesis
    - Chapter 2: Image page with test-image.jpg
    - Chapter 3: Audio page with test-audio.mp3
    - Chapter 4: AI-generated quiz from photosynthesis text
  - [ ] 6.3 Create test media files
    - Add tests/test-image.jpg (sample image)
    - Add tests/test-audio.mp3 (sample audio)
    - Ensure files are referenced in biology-lesson.yaml
  - [ ] 6.4 Implement end-to-end POC script
    - Create examples/poc-demo.ts
    - Parse biology-lesson.yaml
    - Use LibraryRegistry to fetch libraries
    - Use QuizGenerator for AI content
    - Use ContentBuilder to build book
    - Use PackageAssembler to create .h5p
    - Output to examples/biology-lesson.h5p
  - [ ] 6.5 Run POC script and generate biology-lesson.h5p
    - Execute: `npm run build && node dist/examples/poc-demo.js`
    - Verify .h5p file is created
    - Inspect ZIP structure manually
  - [ ] 6.6 Validate on h5p.com platform
    - Upload biology-lesson.h5p to h5p.com
    - Verify package passes validation
    - Test all content displays correctly (text, images, audio)
    - Test AI-generated quiz functions properly
  - [ ] 6.7 Validate in Lumi H5P editor
    - Open biology-lesson.h5p in Lumi
    - Verify content is editable
    - Check for any platform-specific issues
  - [ ] 6.8 Document POC results
    - Create agent-os/specs/template-free-h5p-compiler-poc/poc-results.md
    - Document what worked
    - Document any issues encountered
    - List platform compatibility findings
    - Provide recommendations for production implementation
  - [ ] 6.9 Review all feature-specific tests
    - Run tests from Task Groups 1-5 (approximately 10-40 tests total)
    - Verify critical workflows pass
    - Do NOT run comprehensive test suite
  - [ ] 6.10 Fill critical test gaps if needed
    - Identify gaps in integration test coverage
    - Add maximum of 10 strategic tests for end-to-end workflows
    - Focus on LibraryRegistry -> SemanticValidator -> ContentBuilder -> PackageAssembler pipeline
    - Skip edge cases and error scenarios unless business-critical

**Acceptance Criteria:**
- biology-lesson.h5p is generated successfully
- Package uploads and displays correctly on h5p.com
- Package opens and edits correctly in Lumi
- All content types render properly (text, images, audio, quiz)
- AI-generated content integrates seamlessly
- POC validates template-free approach is viable
- All feature-specific tests pass (approximately 20-50 tests total)

## Execution Order

Recommended implementation sequence:

1. **Phase 1: Library Management** (Task Group 1) - 3-4 hours ✓ COMPLETED
   - Foundation for all other components
   - Must complete before semantic parsing

2. **Phase 2: Semantic Understanding** (Task Group 2) - 2-3 hours
   - Required for content validation
   - Enables type-safe content building

3. **Phase 3: Content Building** (Task Group 3) - 4-5 hours
   - Core API for content creation
   - Can proceed in parallel with AI work after Group 2

4. **Phase 4: Package Assembly** (Task Group 4) - 3-4 hours
   - Critical path for template-free generation
   - Depends on library registry and content builder

5. **Phase 5: AI Integration** (Task Group 5) - 2-3 hours
   - Can start after Group 3 completes
   - Independent of package assembly

6. **Phase 6: End-to-End Testing** (Task Group 6) - 2-4 hours
   - Final integration and validation
   - Upload testing and documentation

## Implementation Notes

### TypeScript Patterns
- Use strict type checking for all new classes
- Define interfaces for LibraryMetadata, SemanticSchema, ValidationResult
- Follow existing naming conventions (H5p prefix for H5P domain objects)
- Use async/await for all I/O operations

### Testing Strategy
- Write 2-8 focused tests per task group during development
- Test ONLY critical behaviors, not exhaustive coverage
- Run only feature-specific tests during development phases
- Fill test gaps strategically in Phase 6 (max 10 additional tests)
- Focus on integration workflows over unit test coverage

### Reuse Existing Code
- Leverage H5pPackage download and caching logic for LibraryRegistry ✓
- Reuse LanguageStrings semantic parsing patterns for SemanticValidator
- Adapt InteractiveBookCreator nested content patterns for ContentBuilder
- Reuse H5pImage and H5pAudio media handling helpers
- Follow ContentCreator orchestration pattern for POC script

### Dependencies to Add
- @anthropic-ai/sdk (AI integration)
- js-yaml (YAML parsing)
- @types/js-yaml (TypeScript types)
- jest, @types/jest, ts-jest (testing) ✓

### Success Metrics
- Zero template files used in generation
- Valid .h5p package passes h5p.com validation
- All content types display correctly on H5P platforms
- AI-generated quiz questions are well-formed
- Complete pipeline: YAML -> AI -> ContentBuilder -> .h5p works end-to-end

## Out of Scope for POC

- CLI interface (use programmatic API only)
- Support for content types beyond H5P.InteractiveBook
- Comprehensive error handling and recovery
- Performance optimization
- Production-grade test coverage
- Documentation generation from semantics
- Handler/plugin architecture (defer to post-POC)
- Multi-modal AI capabilities
