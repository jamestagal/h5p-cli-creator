# Task Breakdown: Concept Extraction Pipeline and Language-Aware AI Configuration

## Overview

Implement a concept extraction pipeline that extracts key learning concepts from source materials, and enhance the AI configuration system with language awareness to ensure AI-generated content consistently respects target language settings for multilingual educational content.

**Total Estimated Tasks:** 47 focused tasks organized into 6 phases

**Critical Requirements:**
- Extract 10-30 concepts from 500-word Vietnamese story text with Vietnamese definitions
- Vietnamese content stays in Vietnamese when targetLanguage=vi (no automatic translation)
- Translations only appear when includeTranslations=true
- Backward compatibility: existing YAML files without language fields continue working
- Use QuizGenerator.generateRawContent() for AI extraction with structured JSON response
- Follow AIPromptBuilder patterns for language configuration cascade

**Key Success Metrics:**
- Unit tests pass (14+ tests)
- Integration tests pass (15+ tests)
- Vietnamese story demo generates Vietnamese content consistently
- Concept-based content is accurate to source material (no hallucination)
- extract-concepts and generate-from-concepts CLI commands work end-to-end

## Task List

---

### Phase 1: Type Definitions and Interfaces

**Dependencies:** None

**Purpose:** Build the foundation type system for concept extraction and language-aware AI configuration. This establishes the data structures that all other phases will use.

#### Task Group 1.1: ExtractedConcept and ConceptExtractionResult Types

- [ ] 1.0 Define concept extraction type system
  - [ ] 1.1 Write 2-8 focused tests for ExtractedConcept and ConceptExtractionResult
    - Test ExtractedConcept has required fields: term, definition, importance, language
    - Test importance enum values ("high" | "medium" | "low")
    - Test ConceptExtractionResult includes concepts array and metadata
    - Test metadata includes sourceLength, extractionDate, detectedLanguage
    - Test suggestedContentTypes array includes valid content type names
    - Test error metadata field is optional and contains error messages
    - **LIMIT: Maximum 8 tests for type definitions only**

  - [ ] 1.2 Create ExtractedConcept interface in `src/ai/types.ts`
    - Fields: term (string), definition (string), importance ("high" | "medium" | "low")
    - Optional fields: category (string), language (ISO 639-1 code string)
    - Add JSDoc explaining importance levels: high (always included), medium (comprehensive), low (exhaustive)
    - Add JSDoc explaining category usage: "vocabulary", "grammar", "culture", etc.

  - [ ] 1.3 Create ConceptExtractionResult interface in `src/ai/types.ts`
    - concepts field: ExtractedConcept[]
    - metadata field: object with sourceLength (number), extractionDate (string ISO 8601), detectedLanguage (string)
    - metadata.error field: optional string for extraction failures
    - suggestedContentTypes field: string[] with content type names

  - [ ] 1.4 Export types from `src/ai/index.ts`
    - Add: `export { ExtractedConcept, ConceptExtractionResult } from "./types";`
    - Ensure types are part of public API

  - [ ] 1.5 Ensure type definition tests pass
    - Run ONLY the 2-8 tests written in task 1.1
    - Verify type structures match spec requirements
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 1.1 pass
- ExtractedConcept interface includes all required fields with correct types
- ConceptExtractionResult structure includes concepts, metadata, suggestedContentTypes
- Types exported from src/ai/index.ts public API
- TypeScript compiler reports no type errors

---

### Phase 2: Language-Aware AI Configuration

**Dependencies:** Phase 1 (Task Group 1.1)

**Purpose:** Enhance the AI configuration system with language awareness to ensure AI-generated content respects target language settings and optionally includes translations.

#### Task Group 2.1: AIConfiguration Language Fields

- [ ] 2.0 Add language fields to AIConfiguration
  - [ ] 2.1 Write 2-8 focused tests for AIConfiguration language fields
    - Test targetLanguage field accepts valid ISO 639-1 codes ("en", "vi", "fr", etc.)
    - Test targetLanguage validation rejects invalid codes (3+ letters, uppercase, numbers)
    - Test includeTranslations field is optional boolean
    - Test AIConfiguration with both language fields present
    - Test AIConfiguration without language fields (backward compatibility)
    - **LIMIT: Maximum 8 tests for configuration validation only**

  - [ ] 2.2 Update AIConfiguration interface in `src/compiler/types.ts`
    - Add targetLanguage field: optional string (ISO 639-1 codes)
    - Add includeTranslations field: optional boolean (default false)
    - Add JSDoc: "ISO 639-1 language code (e.g., 'en', 'vi', 'fr', 'de', 'es', 'zh', 'ja')"
    - Add JSDoc: "When true, include translations in parentheses after target language terms"

  - [ ] 2.3 Create LanguageCode type alias in `src/compiler/types.ts`
    - Export type: `type LanguageCode = string;` with JSDoc listing common codes
    - Document common codes: en (English), vi (Vietnamese), fr (French), de (German), es (Spanish), zh (Chinese), ja (Japanese)
    - Note: Accept any 2-letter lowercase code for extensibility

  - [ ] 2.4 Add language field validation in YamlInputParser
    - Validate targetLanguage matches regex: `/^[a-z]{2}$/` if provided
    - Log warning for unsupported codes but allow through (forward compatibility)
    - Error message example: "Invalid language code 'eng'. Use 2-letter ISO 639-1 codes like 'en', 'vi', 'fr'."

  - [ ] 2.5 Ensure AIConfiguration language tests pass
    - Run ONLY the 2-8 tests written in task 2.1
    - Verify validation accepts valid codes and rejects invalid codes
    - Verify backward compatibility with existing configs
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.1 pass
- AIConfiguration includes optional targetLanguage and includeTranslations fields
- LanguageCode type alias exported and documented
- Validation rejects invalid language codes with helpful error messages
- Existing AIConfiguration usage continues working (backward compatible)

#### Task Group 2.2: Enhanced AIPromptBuilder

- [ ] 2.6 Implement language-aware system prompts
  - [ ] 2.7 Write 2-8 focused tests for AIPromptBuilder language enhancements
    - Test buildSystemPrompt() with targetLanguage injects language instruction
    - Test buildSystemPrompt() with includeTranslations adds translation instruction
    - Test buildSystemPrompt() without language fields maintains existing behavior
    - Test resolveConfig() cascades targetLanguage from item > chapter > book
    - Test resolveConfig() cascades includeTranslations from item > chapter > book
    - Test LANGUAGE_NAMES mapping covers common ISO 639-1 codes
    - **LIMIT: Maximum 8 tests for prompt builder enhancements only**

  - [ ] 2.8 Add LANGUAGE_NAMES mapping in AIPromptBuilder
    - Add private static readonly LANGUAGE_NAMES: Record<string, string>
    - Map codes to full names: en→English, vi→Vietnamese, fr→French, de→German, es→Spanish, zh→Chinese, ja→Japanese
    - Follow READING_LEVELS pattern for structure

  - [ ] 2.9 Update buildSystemPrompt() method for language instructions
    - Check if config.targetLanguage is present
    - If present, inject language instruction: "LANGUAGE REQUIREMENT: Generate all content in {languageName} ({code}). Do not translate to other languages unless explicitly instructed."
    - If config.includeTranslations is true, add translation instruction: "Include English translations in parentheses after {languageName} terms for language learners."
    - Insert language instructions AFTER FORMATTING_RULES and BEFORE READING_LEVEL section
    - Maintain proper section ordering for system prompt

  - [ ] 2.10 Update resolveConfig() method for language field cascade
    - Follow existing cascade pattern for targetAudience and tone
    - Cascade targetLanguage: item.aiConfig > chapterConfig > bookConfig > undefined
    - Cascade includeTranslations: item.aiConfig > chapterConfig > bookConfig > false
    - Log warning if targetLanguage differs from BookDefinition.language field

  - [ ] 2.11 Add auto-detection fallback for targetLanguage
    - If targetLanguage not specified in resolved config, check BookDefinition.language
    - Map BookDefinition.language to targetLanguage in resolveConfig() if not explicitly set
    - Document fallback behavior in JSDoc

  - [ ] 2.12 Ensure AIPromptBuilder language tests pass
    - Run ONLY the 2-8 tests written in task 2.7
    - Verify language instructions appear in system prompts correctly
    - Verify cascade behavior works for all three config levels
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.7 pass
- LANGUAGE_NAMES mapping includes common language codes
- buildSystemPrompt() injects language instructions when targetLanguage present
- resolveConfig() cascades targetLanguage and includeTranslations following item > chapter > book hierarchy
- Auto-detection from BookDefinition.language works as fallback
- System prompt structure maintains proper section ordering

---

### Phase 3: Concept Extraction Service

**Dependencies:** Phase 1 (Task Group 1.1), Phase 2 (Task Groups 2.1, 2.2)

**Purpose:** Build the ConceptExtractor service that uses AI to extract key learning concepts from source materials with language detection and importance classification.

#### Task Group 3.1: ConceptExtractor Implementation

- [ ] 3.0 Implement ConceptExtractor service
  - [ ] 3.1 Write 2-8 focused tests for ConceptExtractor
    - Test extractConcepts() returns ExtractedConcept array with required fields
    - Test importance classification distribution (high/medium/low)
    - Test language detection populates detectedLanguage in metadata
    - Test error handling for invalid source text (empty, null, too short)
    - Test error handling for AI API failures (network, timeout, invalid response)
    - Test integration with AIConfiguration reading level affects concept complexity
    - Test suggestedContentTypes includes appropriate content types
    - **LIMIT: Maximum 8 tests for core extraction functionality only**

  - [ ] 3.2 Create ConceptExtractor class in `src/ai/ConceptExtractor.ts`
    - Export ConceptExtractor class with static extractConcepts() method
    - Constructor not needed (stateless service following AIPromptBuilder pattern)
    - Import QuizGenerator, AIPromptBuilder, AIConfiguration
    - Add comprehensive JSDoc explaining concept extraction workflow

  - [ ] 3.3 Implement extractConcepts() method signature
    - Method: `static async extractConcepts(sourceText: string, config?: AIConfiguration): Promise<ConceptExtractionResult>`
    - Parameters: sourceText (required string), config (optional AIConfiguration)
    - Returns: Promise<ConceptExtractionResult> with concepts array and metadata
    - Throws: Error if API call fails or response cannot be parsed

  - [ ] 3.4 Build extraction system prompt
    - Use AIPromptBuilder.buildSystemPrompt(config) for reading-level guidance
    - Add concept extraction-specific instructions after standard rules
    - Specify JSON response format with term, definition, importance, category, language fields
    - Include importance criteria: high (core concepts), medium (supporting concepts), low (supplementary details)

  - [ ] 3.5 Build extraction user prompt
    - Request 10-30 concepts based on source text length
    - Specify target language detection requirement
    - Request category assignment for structured concepts
    - Request suggestedContentTypes based on concept structure
    - Include source text in prompt

  - [ ] 3.6 Call QuizGenerator.generateRawContent() for AI extraction
    - Pass systemPrompt and userPrompt to generateRawContent()
    - Supports both Anthropic and Google providers automatically
    - Returns raw string response containing JSON

  - [ ] 3.7 Parse and validate AI response
    - Strip markdown code fences (```json, ```) if present
    - Parse JSON response into ConceptExtractionResult structure
    - Validate concepts array has required fields
    - Validate importance values are "high" | "medium" | "low"
    - Generate metadata: sourceLength, extractionDate (ISO 8601), detectedLanguage

  - [ ] 3.8 Implement error handling with graceful degradation
    - Wrap extraction in try-catch block
    - On AI failure: return ConceptExtractionResult with empty concepts array
    - Include error message in metadata.error field
    - Log error details for debugging
    - Do NOT throw exceptions - return error state in result

  - [ ] 3.9 Ensure ConceptExtractor tests pass
    - Run ONLY the 2-8 tests written in task 3.1
    - Verify extraction returns valid concepts with proper structure
    - Verify error handling returns empty concepts with error metadata
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 3.1 pass
- ConceptExtractor.extractConcepts() returns valid ConceptExtractionResult
- AI extraction uses QuizGenerator.generateRawContent() with proper prompts
- Language detection populates detectedLanguage in metadata
- Importance classification distributes concepts across high/medium/low levels
- Error handling returns graceful error state instead of throwing exceptions
- Integration with AIConfiguration affects concept complexity appropriately

---

### Phase 4: HandlerContext Integration

**Dependencies:** Phase 1 (Task Group 1.1), Phase 3 (Task Group 3.1)

**Purpose:** Add concepts field to HandlerContext and update AI handlers to use extracted concepts as primary content source when available, following a 3-tier fallback pattern.

#### Task Group 4.1: HandlerContext Concepts Field

- [ ] 4.0 Add concepts field to HandlerContext
  - [ ] 4.1 Write 2-8 focused tests for HandlerContext concepts integration
    - Test HandlerContext accepts optional concepts field
    - Test HandlerContext without concepts maintains backward compatibility
    - Test concepts field is passed to handlers correctly
    - **LIMIT: Maximum 8 tests for context integration only**

  - [ ] 4.2 Update HandlerContext interface in `src/handlers/HandlerContext.ts`
    - Add concepts field: `concepts?: ExtractedConcept[];` (optional array)
    - Add JSDoc: "Extracted concepts from source materials available to all handlers for concept-based content generation"
    - Import ExtractedConcept type from "../ai/types"

  - [ ] 4.3 Document 3-tier fallback pattern in HandlerContext JSDoc
    - Update JSDoc with fallback chain explanation
    - Pattern: "AI handlers should check: 1) context.concepts (if available), 2) sourceText (if provided), 3) prompt (fallback)"
    - Explain concept-based generation produces more accurate, less hallucinated content
    - Note: Field is optional for backward compatibility

  - [ ] 4.4 Ensure HandlerContext tests pass
    - Run ONLY the 2-8 tests written in task 4.1
    - Verify concepts field is optional and does not break existing code
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 4.1 pass
- HandlerContext includes optional concepts field with proper type
- JSDoc clearly documents 3-tier fallback pattern for AI handlers
- No breaking changes to existing HandlerContext usage

#### Task Group 4.2: Handler Integration Updates

- [ ] 4.5 Update AI handlers to use concepts
  - [ ] 4.6 Write 2-8 focused tests for handler concept integration
    - Test AITextHandler checks context.concepts before prompt-based generation
    - Test QuizHandler filters concepts by importance for question generation
    - Test concepts-based generation produces structured content
    - Test fallback to prompt-based generation when concepts unavailable
    - Test targetLanguage and includeTranslations passed to AI prompts
    - **LIMIT: Maximum 8 tests for handler integration only**

  - [ ] 4.7 Update AITextHandler in `src/handlers/core/AITextHandler.ts`
    - Check if context.concepts exists and has length > 0
    - If concepts available: build user prompt referencing concepts array
    - If no concepts: fall back to existing prompt-based generation
    - Pass targetLanguage and includeTranslations from resolved aiConfig to prompt

  - [ ] 4.8 Update QuizHandler in `src/handlers/ai/QuizHandler.ts`
    - Check if context.concepts exists and has length > 0
    - If concepts available: filter by importance (high/medium for default quizzes)
    - Use concept.term and concept.definition as question material
    - If no concepts: fall back to existing prompt-based generation
    - Pass targetLanguage and includeTranslations from resolved aiConfig to prompt

  - [ ] 4.9 Update AIAccordionHandler in `src/handlers/ai/AIAccordionHandler.ts`
    - Check if context.concepts exists and has length > 0
    - If concepts available: use concepts for panel titles and content
    - Group concepts by category if available
    - If no concepts: fall back to existing prompt-based generation
    - Pass targetLanguage and includeTranslations from resolved aiConfig to prompt

  - [ ] 4.10 Update AISingleChoiceSetHandler in `src/handlers/ai/AISingleChoiceSetHandler.ts`
    - Check if context.concepts exists and has length > 0
    - If concepts available: generate questions from high/medium importance concepts
    - Use concept definitions for correct answers and generate distractors
    - If no concepts: fall back to existing prompt-based generation
    - Pass targetLanguage and includeTranslations from resolved aiConfig to prompt

  - [ ] 4.11 Update DialogCardsHandler for vocabulary concepts
    - Check if context.concepts exists and has length > 0
    - If concepts available: use concept.term for front, concept.definition for back
    - Filter by importance or category (e.g., "vocabulary" category)
    - If no concepts: fall back to existing prompt-based generation
    - Pass targetLanguage and includeTranslations from resolved aiConfig to prompt

  - [ ] 4.12 Ensure handler integration tests pass
    - Run ONLY the 2-8 tests written in task 4.6
    - Verify handlers check concepts field before generation
    - Verify fallback to prompt-based generation works
    - Verify language settings passed to AI prompts
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 4.6 pass
- All AI handlers check context.concepts before prompt-based generation
- Handlers filter concepts by importance and category appropriately
- Fallback chain (concepts > sourceText > prompt) works correctly
- targetLanguage and includeTranslations passed to AI prompt construction
- No breaking changes to existing handler behavior

---

### Phase 5: CLI Commands

**Dependencies:** Phase 3 (Task Group 3.1), Phase 4 (Task Groups 4.1, 4.2)

**Purpose:** Build CLI commands for extracting concepts from source text and generating H5P content from extracted concepts, enabling rapid prototyping workflows.

#### Task Group 5.1: Extract-Concepts CLI Command

- [ ] 5.0 Implement extract-concepts CLI command
  - [ ] 5.1 Write 2-8 focused tests for extract-concepts command
    - Test command reads .txt file and generates valid concepts JSON
    - Test command respects --language parameter in extraction
    - Test command respects --reading-level parameter for complexity
    - Test command handles file read errors gracefully with helpful messages
    - Test command writes output to /extracted/ directory
    - Test command logs extraction summary (concept count, importance distribution)
    - **LIMIT: Maximum 8 tests for CLI command functionality only**

  - [ ] 5.2 Create extract-concepts-module.ts in `src/modules/cli/`
    - Implement yargs.CommandModule interface
    - Define command: "extract-concepts <sourceFile> <outputFile>"
    - Positional arguments: sourceFile (path to .txt), outputFile (path to .json)
    - Options: --language (target language code), --reading-level (AIConfiguration reading level), --verbose

  - [ ] 5.3 Implement extract-concepts command handler
    - Read source text from sourceFile using fs-extra
    - Build AIConfiguration from CLI options (language, reading-level)
    - Call ConceptExtractor.extractConcepts(sourceText, config)
    - Write ConceptExtractionResult to outputFile as pretty-printed JSON
    - Default output path to /extracted/ if relative path provided

  - [ ] 5.4 Add extraction summary logging
    - Log concept count: "Extracted 23 concepts"
    - Log importance distribution: "High: 8, Medium: 10, Low: 5"
    - Log detected language: "Detected language: vi (Vietnamese)"
    - Log suggested content types: "Suggested: flashcards, dialogcards, quiz"
    - Respect --verbose flag for detailed logging

  - [ ] 5.5 Implement error handling and exit codes
    - Exit code 0: Successful extraction
    - Exit code 1: File read/write errors (file not found, permission denied)
    - Exit code 2: Extraction errors (AI API failure, invalid response)
    - Log clear error messages with actionable guidance

  - [ ] 5.6 Update sources folder structure documentation
    - Document /sources/ directory with subdirectories: files/, links/, text/
    - Document /sources/text/ for plain .txt files ready for extraction
    - Add example in README.md showing how to place source materials
    - CLI defaults to /sources/text/ if relative path provided for sourceFile

  - [ ] 5.7 Update extracted folder structure documentation
    - Document /extracted/ directory for concept extraction outputs
    - Use filename pattern: `{basename}-concepts-{timestamp}.json`
    - Include source file path and extraction parameters in JSON metadata
    - CLI defaults to /extracted/ if relative path provided for outputFile

  - [ ] 5.8 Ensure extract-concepts tests pass
    - Run ONLY the 2-8 tests written in task 5.1
    - Verify command reads files and generates valid JSON
    - Verify CLI options affect extraction appropriately
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 5.1 pass
- extract-concepts command reads .txt files and writes valid JSON
- Command respects --language and --reading-level options
- Extraction summary logged with concept count and distribution
- Error handling provides clear messages with exit codes
- Default paths to /sources/text/ and /extracted/ work correctly

#### Task Group 5.2: Generate-From-Concepts CLI Command

- [ ] 5.9 Implement generate-from-concepts CLI command
  - [ ] 5.10 Write 2-8 focused tests for generate-from-concepts command
    - Test command creates flashcards from concepts JSON
    - Test command creates dialogcards from concepts JSON
    - Test command creates quiz from concepts JSON
    - Test command filters by importance level with --importance-filter
    - Test command respects --include-translations flag
    - Test command handles invalid concepts JSON gracefully
    - **LIMIT: Maximum 8 tests for CLI command functionality only**

  - [ ] 5.11 Create generate-from-concepts-module.ts in `src/modules/cli/`
    - Implement yargs.CommandModule interface
    - Define command: "generate-from-concepts <conceptsFile> <outputFile> <contentType>"
    - Positional arguments: conceptsFile (path to concepts JSON), outputFile (path to .h5p), contentType (flashcards | dialogcards | quiz | accordion)
    - Options: --title, --language, --reading-level, --include-translations, --importance-filter (high | medium | low)

  - [ ] 5.12 Implement generate-from-concepts command handler
    - Read concepts JSON from conceptsFile using fs-extra
    - Parse JSON into ConceptExtractionResult structure
    - Filter concepts by --importance-filter if specified (high only, high+medium, or all)
    - Build AIConfiguration from CLI options
    - Create HandlerContext with concepts field populated

  - [ ] 5.13 Implement content type routing
    - Route to appropriate handler based on contentType argument
    - flashcards: Use FlashcardsHandler or similar pattern
    - dialogcards: Use DialogCardsHandler with concepts
    - quiz: Use QuizHandler with concepts
    - accordion: Use AIAccordionHandler with concepts
    - Generate .h5p package with H5pCompiler

  - [ ] 5.14 Pass concepts to HandlerContext
    - Set context.concepts = filtered concepts array
    - Handlers will check concepts field and use for generation
    - Enable concept-based generation for all supported content types

  - [ ] 5.15 Support YAML config file as alternative input
    - If conceptsFile ends with .yaml, parse as YAML with embedded concepts
    - Extract concepts from YAML structure (concepts field at book/chapter level)
    - Merge concepts from file with concepts from YAML for comprehensive source

  - [ ] 5.16 Add generation summary logging
    - Log concept count used: "Generating from 15 concepts"
    - Log importance filter applied: "Filtered to high+medium importance only"
    - Log content type generated: "Created quiz with 10 questions"
    - Respect --verbose flag for detailed logging

  - [ ] 5.17 Ensure generate-from-concepts tests pass
    - Run ONLY the 2-8 tests written in task 5.10
    - Verify command generates valid .h5p packages from concepts JSON
    - Verify importance filtering works correctly
    - Verify --include-translations flag affects output
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 5.10 pass
- generate-from-concepts command creates valid .h5p packages
- Command supports multiple content types (flashcards, dialogcards, quiz, accordion)
- Importance filtering reduces concepts appropriately
- --include-translations flag affects AI generation
- YAML config file alternative input works
- Concepts passed to HandlerContext enable concept-based generation

---

### Phase 6: Testing and Documentation

**Dependencies:** Phases 1-5 (All previous phases)

**Purpose:** Fill critical testing gaps, create integration examples, update documentation, and verify end-to-end functionality with manual validation.

#### Task Group 6.1: Test Coverage Review & Gap Analysis

- [ ] 6.0 Review test coverage and fill critical gaps
  - [ ] 6.1 Review existing tests from previous phases
    - Review 2-8 tests from Phase 1 (Type Definitions)
    - Review 2-8 tests from Phase 2.1 (AIConfiguration Language Fields)
    - Review 2-8 tests from Phase 2.2 (Enhanced AIPromptBuilder)
    - Review 2-8 tests from Phase 3 (ConceptExtractor)
    - Review 2-8 tests from Phase 4.1 (HandlerContext Integration)
    - Review 2-8 tests from Phase 4.2 (Handler Updates)
    - Review 2-8 tests from Phase 5.1 (Extract-Concepts CLI)
    - Review 2-8 tests from Phase 5.2 (Generate-From-Concepts CLI)
    - Total existing: approximately 16-64 tests

  - [ ] 6.2 Analyze test coverage gaps for THIS feature only
    - Identify critical gaps in end-to-end concept extraction workflow
    - Identify critical gaps in language-aware AI generation workflows
    - Identify critical gaps in CLI command integration
    - Focus ONLY on gaps related to this spec's feature requirements
    - Do NOT assess entire application test coverage
    - Prioritize integration workflows over unit test gaps

  - [ ] 6.3 Write up to 10 additional strategic tests maximum
    - Test end-to-end: extract concepts from Vietnamese text → generate quiz → verify Vietnamese content
    - Test end-to-end: extract concepts → generate dialogcards → verify concept terms used
    - Test language auto-detection from BookDefinition.language when targetLanguage not specified
    - Test includeTranslations=true adds English translations in parentheses
    - Test backward compatibility: existing YAML files without language fields work unchanged
    - Test concept importance filtering affects quiz question selection
    - Test category grouping affects accordion panel organization
    - Test error handling: AI API failure during extraction returns graceful error state
    - Test error handling: invalid concepts JSON produces clear error message
    - Test CLI commands with sources/text/ and extracted/ default paths
    - **LIMIT: Maximum 10 additional tests to fill critical gaps only**
    - **DO NOT write comprehensive coverage for all scenarios**

  - [ ] 6.4 Run feature-specific tests only
    - Run ONLY tests related to concept extraction and language-aware AI features
    - Expected total: approximately 26-74 tests maximum
    - Do NOT run entire application test suite
    - Verify all feature-specific tests pass

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 26-74 tests total)
- Critical end-to-end workflows for concept extraction and language-aware AI covered
- No more than 10 additional tests added beyond phases 1-5
- Testing focused exclusively on this spec's feature requirements

#### Task Group 6.2: Integration Examples

- [ ] 6.5 Create Vietnamese story example materials
  - [ ] 6.6 Add Vietnamese story text file
    - File: `/sources/text/vietnamese-story.txt`
    - Create 500-word Vietnamese story with cultural and educational content
    - Include vocabulary concepts, grammar patterns, cultural references
    - Use authentic Vietnamese language (no English mixing)

  - [ ] 6.7 Add Vietnamese story YAML configuration
    - File: `/examples/yaml/vietnamese-story-demo.yaml`
    - Include BookDefinition with language: "vi"
    - Add targetLanguage: "vi" in book-level aiConfig
    - Add chapter with AI-generated content types (text, quiz, dialogcards, accordion)
    - Include example with includeTranslations: true for learner-facing content
    - Include example with includeTranslations: false for immersive content

  - [ ] 6.8 Add concept extraction workflow example
    - Create example showing extract-concepts command usage
    - Create example showing generate-from-concepts command usage
    - Include example concepts JSON in /extracted/ directory
    - Document workflow: extract once → generate multiple content types

  - [ ] 6.9 Update comprehensive-demo.yaml
    - File: `/examples/yaml/comprehensive-demo.yaml`
    - Add new chapter: "Language-Aware Content"
    - Add examples showing targetLanguage for different languages (French, Spanish, Vietnamese)
    - Add examples showing includeTranslations behavior
    - Include concept-based content generation examples

  - [ ] 6.10 Test .h5p package generation
    - Build .h5p from vietnamese-story-demo.yaml
    - Verify package builds without errors
    - Verify Vietnamese content stays in Vietnamese
    - Verify translations appear when includeTranslations=true
    - Check content.json structure for language consistency

**Acceptance Criteria:**
- Vietnamese story text file created in /sources/text/
- vietnamese-story-demo.yaml includes language-aware configuration
- Concept extraction workflow examples documented
- comprehensive-demo.yaml updated with language-aware examples
- Generated .h5p packages include Vietnamese content correctly

#### Task Group 6.3: Documentation Updates

- [ ] 6.11 Update README.md with concept extraction features
  - [ ] 6.12 Add "Concept Extraction Pipeline" section
    - Explain concept extraction workflow and benefits
    - Document extract-concepts CLI command with examples
    - Document generate-from-concepts CLI command with examples
    - Show rapid prototyping workflow: extract once → generate multiple types
    - Explain concept importance levels and filtering

  - [ ] 6.13 Add "Language-Aware AI Configuration" section
    - Document targetLanguage field usage and ISO 639-1 codes
    - Document includeTranslations field for bilingual content
    - Explain language configuration cascade (item > chapter > book)
    - Show examples for Vietnamese, French, Spanish content
    - Explain auto-detection from BookDefinition.language

  - [ ] 6.14 Add "Sources and Extracted Folders" section
    - Document /sources/ directory structure (files/, links/, text/)
    - Document /extracted/ directory for concept extraction outputs
    - Explain file naming patterns and metadata
    - Show examples of organizing source materials

  - [ ] 6.15 Update "AIConfiguration Reference" table
    - Add targetLanguage field row with description and examples
    - Add includeTranslations field row with description and examples
    - Update examples showing language-aware configuration

  - [ ] 6.16 Create inline code documentation
    - Add comprehensive JSDoc comments to ConceptExtractor class
    - Add comprehensive JSDoc comments to ExtractedConcept interface
    - Add comprehensive JSDoc comments to ConceptExtractionResult interface
    - Update AIPromptBuilder JSDoc with language instruction documentation
    - Update HandlerContext JSDoc with concepts field documentation
    - Include usage examples in JSDoc

  - [ ] 6.17 Create concept extraction guide
    - File: `/docs/concept-extraction-guide.md`
    - Explain when to use concept extraction vs prompt-based generation
    - Document best practices for source text preparation
    - Show examples of concept-based quiz vs prompt-based quiz quality
    - Explain importance classification and filtering strategies
    - Include troubleshooting section for common issues

**Acceptance Criteria:**
- README.md includes comprehensive concept extraction and language-aware AI sections
- All new fields documented in AIConfiguration reference table
- Inline JSDoc comments comprehensive and include examples
- concept-extraction-guide.md created with best practices
- Sources and extracted folder structure clearly documented

#### Task Group 6.4: Manual Validation Testing

- [ ] 6.18 Perform manual validation with Vietnamese story
  - [ ] 6.19 Extract concepts from Vietnamese story
    - Run: `extract-concepts sources/text/vietnamese-story.txt extracted/vietnamese-concepts.json --language=vi`
    - Verify 10-30 concepts extracted
    - Verify concepts include Vietnamese terms with Vietnamese definitions
    - Verify detectedLanguage is "vi" in metadata
    - Verify suggestedContentTypes includes appropriate types

  - [ ] 6.20 Generate dialogcards from concepts
    - Run: `generate-from-concepts extracted/vietnamese-concepts.json vietnamese-dialogcards.h5p dialogcards --title="Vietnamese Vocabulary"`
    - Verify .h5p package builds successfully
    - Upload to h5p.com platform
    - Verify dialogcards use concept terms and definitions
    - Verify Vietnamese text stays in Vietnamese

  - [ ] 6.21 Generate quiz from concepts
    - Run: `generate-from-concepts extracted/vietnamese-concepts.json vietnamese-quiz.h5p quiz --importance-filter=high`
    - Verify .h5p package builds successfully
    - Upload to h5p.com platform
    - Verify quiz questions use high-importance concepts
    - Verify Vietnamese questions and answers stay in Vietnamese
    - Verify no automatic translation to English

  - [ ] 6.22 Test includeTranslations flag
    - Run: `generate-from-concepts extracted/vietnamese-concepts.json vietnamese-quiz-translations.h5p quiz --include-translations`
    - Verify .h5p package builds successfully
    - Upload to h5p.com platform
    - Verify English translations appear in parentheses after Vietnamese terms
    - Verify translation format: "Xin chào (Hello)"

  - [ ] 6.23 Build Vietnamese story interactive book
    - Run: `npm run build && node dist/index.js compile examples/yaml/vietnamese-story-demo.yaml vietnamese-story.h5p`
    - Verify .h5p package builds successfully
    - Upload to h5p.com platform
    - Navigate through chapters and verify Vietnamese content consistency
    - Test quiz questions are in Vietnamese
    - Test dialogcards are in Vietnamese
    - Test accordion panels are in Vietnamese
    - Verify no unexpected English translations

  - [ ] 6.24 Test backward compatibility
    - Build .h5p from existing YAML files without language fields
    - Verify packages build successfully
    - Verify existing behavior unchanged
    - Verify no errors or warnings related to missing language fields

  - [ ] 6.25 Compare concept-based vs prompt-based content
    - Generate quiz from concepts: Use vietnamese-concepts.json
    - Generate quiz from prompt: Use prompt-based AIQuizHandler
    - Compare accuracy: Concept-based should match source material better
    - Compare hallucination: Concept-based should have fewer factual errors
    - Document quality differences in validation notes

**Acceptance Criteria:**
- extract-concepts CLI command works end-to-end
- generate-from-concepts CLI command works for all content types
- Vietnamese content stays in Vietnamese consistently (no automatic translation)
- includeTranslations flag adds English translations when specified
- Generated .h5p packages upload to h5p.com without errors
- Vietnamese story interactive book displays and functions correctly
- Concept-based content is more accurate than prompt-based content
- Backward compatibility maintained (existing YAML files work)
- All manual validation tests pass

---

## Execution Order

Recommended implementation sequence:

1. **Phase 1: Type Definitions and Interfaces** - Foundation for both features
2. **Phase 2: Language-Aware AI Configuration** - Enhance AIConfig and AIPromptBuilder
3. **Phase 3: Concept Extraction Service** - Build ConceptExtractor
4. **Phase 4: HandlerContext Integration** - Add concepts field and update handlers
5. **Phase 5: CLI Commands** - Build extract-concepts and generate-from-concepts
6. **Phase 6: Testing and Documentation** - Fill testing gaps, create examples, validate

**Why this order?**

- Type definitions establish data structures used by all other phases
- Language-aware AI configuration enhances prompt building before concept extraction
- Concept extraction service depends on language-aware prompts
- Handler integration enables concept-based content generation
- CLI commands provide end-to-end workflows for extraction and generation
- Testing phase verifies complete integration and fills coverage gaps

---

## Key Implementation Notes

### Critical Requirements

1. **Language Consistency (CRITICAL)**
   - Vietnamese content MUST stay in Vietnamese when targetLanguage=vi
   - No automatic translation to English unless includeTranslations=true
   - Test this explicitly with Vietnamese story example
   - Regression test for reported issue: Vietnamese quiz questions translating to English

2. **Concept Extraction Accuracy**
   - Extract 10-30 concepts from 500-word text
   - Concepts include term, definition, importance, category, language
   - Language detection populates detectedLanguage in metadata
   - Graceful error handling: return empty concepts with error metadata instead of throwing

3. **Backward Compatibility**
   - All new fields optional with sensible defaults
   - Existing YAML files without language fields work unchanged
   - Handlers gracefully fall back when concepts not available
   - No breaking changes to existing interfaces or method signatures

4. **3-Tier Fallback Pattern**
   - AI handlers check: 1) context.concepts (if available), 2) sourceText (if provided), 3) prompt (fallback)
   - Concept-based generation produces more accurate, less hallucinated content
   - Prompt-based generation still works when concepts unavailable

5. **Testing Constraints**
   - Each development phase writes 2-8 focused tests maximum
   - Test ONLY critical behaviors, not exhaustive coverage
   - Testing gap analysis phase adds maximum 10 additional tests
   - Total expected: 26-74 tests for entire feature
   - Run feature-specific tests only, NOT entire application suite

### Reference Patterns

**ConceptExtractor Pattern:**
```typescript
// Stateless service following AIPromptBuilder pattern
export class ConceptExtractor {
  static async extractConcepts(
    sourceText: string,
    config?: AIConfiguration
  ): Promise<ConceptExtractionResult> {
    // Build prompts
    const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);
    const userPrompt = `Extract 10-30 key concepts from: ${sourceText}`;

    // Call AI
    const rawResponse = await QuizGenerator.generateRawContent(
      systemPrompt,
      userPrompt
    );

    // Parse JSON
    const concepts = JSON.parse(stripCodeFences(rawResponse));

    return {
      concepts,
      metadata: {
        sourceLength: sourceText.length,
        extractionDate: new Date().toISOString(),
        detectedLanguage: detectLanguage(concepts)
      },
      suggestedContentTypes: determineSuggestedTypes(concepts)
    };
  }
}
```

**Language-Aware Prompt Pattern:**
```typescript
// AIPromptBuilder enhancement
public static buildSystemPrompt(config?: AIConfiguration): string {
  let prompt = this.FORMATTING_RULES;

  // Inject language instructions AFTER formatting, BEFORE reading level
  if (config?.targetLanguage) {
    const languageName = this.LANGUAGE_NAMES[config.targetLanguage] || config.targetLanguage;
    prompt += `\n\nLANGUAGE REQUIREMENT: Generate all content in ${languageName} (${config.targetLanguage}). Do not translate to other languages unless explicitly instructed.`;

    if (config.includeTranslations) {
      prompt += `\nInclude English translations in parentheses after ${languageName} terms for language learners.`;
    }
  }

  // Add reading level guidance
  const readingLevel = this.READING_LEVELS[config?.targetAudience || "grade-6"];
  prompt += `\n\nREADING LEVEL:\n${readingLevel}`;

  return prompt;
}
```

**Handler Concepts Integration Pattern:**
```typescript
// QuizHandler with concepts fallback
async process(item: QuizContentItem, context: HandlerContext): Promise<void> {
  const resolvedConfig = AIPromptBuilder.resolveConfig(
    item.aiConfig,
    context.chapterAIConfig,
    context.bookAIConfig
  );

  let userPrompt: string;

  // 3-tier fallback: concepts > sourceText > prompt
  if (context.concepts && context.concepts.length > 0) {
    // Use high and medium importance concepts for quiz
    const quizConcepts = context.concepts.filter(
      c => c.importance === "high" || c.importance === "medium"
    );
    userPrompt = `Generate ${item.questionCount} quiz questions from these concepts:\n${JSON.stringify(quizConcepts)}`;
  } else if (item.sourceText) {
    userPrompt = `Generate ${item.questionCount} quiz questions from: ${item.sourceText}`;
  } else {
    userPrompt = `Generate ${item.questionCount} quiz questions about ${item.prompt}`;
  }

  const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);
  const rawResponse = await context.quizGenerator.generateRawContent(
    systemPrompt,
    userPrompt
  );

  // Process response...
}
```

**CLI Command Pattern:**
```typescript
// extract-concepts-module.ts
export class ExtractConceptsModule implements yargs.CommandModule {
  command = "extract-concepts <sourceFile> <outputFile>";

  async handler(args: any) {
    const sourceText = fs.readFileSync(args.sourceFile, "utf-8");

    const config: AIConfiguration = {
      targetAudience: args.readingLevel || "grade-6",
      targetLanguage: args.language
    };

    const result = await ConceptExtractor.extractConcepts(sourceText, config);

    const outputPath = path.resolve(args.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

    console.log(`Extracted ${result.concepts.length} concepts`);
    console.log(`High: ${countByImportance(result.concepts, "high")}`);
    console.log(`Medium: ${countByImportance(result.concepts, "medium")}`);
    console.log(`Low: ${countByImportance(result.concepts, "low")}`);
  }
}
```

---

## Success Metrics

- [ ] ConceptExtractor extracts 10-30 concepts from 500-word Vietnamese story
- [ ] Extracted concepts include Vietnamese terms with Vietnamese definitions
- [ ] ExtractedConcept language field populated with "vi" for Vietnamese content
- [ ] AIPromptBuilder injects Vietnamese language instruction when targetLanguage=vi
- [ ] Vietnamese quiz generated from concepts stays in Vietnamese (no English translation)
- [ ] Vietnamese accordion panels use Vietnamese consistently
- [ ] includeTranslations=true adds English translations in parentheses
- [ ] extract-concepts CLI command creates valid JSON in /extracted/ directory
- [ ] generate-from-concepts CLI command creates .h5p packages from concepts JSON
- [ ] Existing YAML files without language fields work without errors (backward compatible)
- [ ] Unit tests pass (14+ tests minimum)
- [ ] Integration tests pass (15+ tests minimum)
- [ ] Total tests: 26-74 tests for entire feature
- [ ] README.md updated with concept extraction workflow and language configuration
- [ ] Vietnamese story demo YAML includes targetLanguage and concept usage
- [ ] Manual validation: Vietnamese content stays in Vietnamese on h5p.com
- [ ] Concept-based content more accurate than prompt-based content (no hallucination)

---

## Vietnamese Story Demo Workflow

End-to-end validation workflow for manual testing:

```bash
# 1. Extract concepts from Vietnamese story
npm run build
node dist/index.js extract-concepts sources/text/vietnamese-story.txt extracted/vietnamese-concepts.json --language=vi --verbose

# 2. Generate dialogcards from concepts
node dist/index.js generate-from-concepts extracted/vietnamese-concepts.json vietnamese-vocab.h5p dialogcards --title="Vietnamese Vocabulary" --language=vi

# 3. Generate quiz from high-importance concepts
node dist/index.js generate-from-concepts extracted/vietnamese-concepts.json vietnamese-quiz.h5p quiz --importance-filter=high --language=vi

# 4. Generate quiz with translations for learners
node dist/index.js generate-from-concepts extracted/vietnamese-concepts.json vietnamese-quiz-bilingual.h5p quiz --language=vi --include-translations

# 5. Build full interactive book from YAML
node dist/index.js compile examples/yaml/vietnamese-story-demo.yaml vietnamese-story-book.h5p

# 6. Upload to h5p.com and verify:
# - Vietnamese content stays in Vietnamese (no automatic translation)
# - Translations appear when includeTranslations=true
# - Concept-based quiz questions match source material accurately
# - No hallucinated content or factual errors
```

**Validation Checklist:**
- [ ] All commands run without errors
- [ ] Generated .h5p packages open in H5P editor/viewer
- [ ] Vietnamese text renders correctly (UTF-8 encoding)
- [ ] No unexpected English translations in immersive content
- [ ] English translations present in bilingual content format: "Xin chào (Hello)"
- [ ] Quiz questions based on extracted concepts (verifiable against source text)
- [ ] Dialogcards use concept terms and definitions directly
- [ ] Concept importance filtering reduces content to high-priority concepts only

---

## Phase-Specific Notes

### Phase 1 Notes
- Define types first before any implementation
- ExtractedConcept and ConceptExtractionResult are public API types
- Language field uses ISO 639-1 string type for flexibility

### Phase 2 Notes
- Language configuration follows existing cascade pattern (item > chapter > book)
- Auto-detection from BookDefinition.language is fallback behavior
- Warning logs when targetLanguage differs from BookDefinition.language
- Language instructions injected AFTER formatting rules, BEFORE reading level

### Phase 3 Notes
- ConceptExtractor is stateless service (static methods only)
- Uses QuizGenerator.generateRawContent() for AI calls
- Graceful error handling: return empty concepts with error metadata
- Language detection happens during AI extraction (no external library)

### Phase 4 Notes
- HandlerContext.concepts field is optional for backward compatibility
- All AI handlers check concepts before prompt-based generation
- Fallback chain: concepts > sourceText > prompt
- targetLanguage and includeTranslations passed to prompt construction

### Phase 5 Notes
- CLI commands support rapid prototyping: extract once → generate multiple types
- Default paths: sources/text/ for input, extracted/ for output
- Importance filtering enables focused content generation
- YAML config file alternative enables embedded concepts

### Phase 6 Notes
- Vietnamese story demo is primary validation case
- Manual testing on h5p.com required for language consistency verification
- Concept-based vs prompt-based quality comparison documents feature value
- Backward compatibility testing ensures no breaking changes
