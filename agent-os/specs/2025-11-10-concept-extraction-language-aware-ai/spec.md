# Specification: Concept Extraction Pipeline and Language-Aware AI Configuration

## Goal

Implement a concept extraction pipeline that extracts key learning concepts from source materials, and enhance the AI configuration system with language awareness to ensure AI-generated content consistently respects target language settings for multilingual educational content.

## User Stories

- As an educator, I want to extract key concepts from Vietnamese story text so that I can generate vocabulary cards and quizzes from real learning materials instead of hallucinated content.
- As a content creator, I want to specify a target language for AI generation so that Vietnamese content stays in Vietnamese without automatic translation to English.
- As a language learning author, I want to optionally include translations in generated content so that learners can see both the target language and their native language.

## Specific Requirements

**SourceExtractor Service (Step 1: Source → Text)**
- Create service class at `src/ai/SourceExtractor.ts` exposing `extractText(sourcePath, sourceType)` method
- Support sourceType: "pdf" | "audio" | "video" | "url" | "text"
- **PDF extraction**: Use pdf-parse npm package to extract text from PDF files, preserve paragraph structure
- **Audio transcription**: Use Whisper API (via OpenAI SDK) to transcribe audio files (mp3, wav, m4a)
- **Video transcription**: Extract audio track using ffmpeg, then transcribe with Whisper API
- **URL scraping**: Use cheerio to parse HTML and extract main content text, strip navigation/footer
- **Text files**: Read directly with fs.readFile()
- Return SourceExtractionResult with extractedText, metadata (sourceType, sourceSize, extractionDate, detectedLanguage, wordCount), and warnings array
- Write extracted text to `/extracted/{basename}/full-text.txt`
- Write metadata to `/extracted/{basename}/metadata.json`
- Handle extraction failures gracefully with error messages and empty text fallback

**ConceptExtractor Service (Step 3: Text → Concepts)**
- Create service class at `src/ai/ConceptExtractor.ts` exposing `extractConcepts(sourceText, config?)` method
- **Language-agnostic extraction**: Extract concepts in the SAME language as source text (not hardcoded to Vietnamese)
- Return ExtractedConcept array with fields: term (string), definition (string), importance ("high" | "medium" | "low"), category (optional string), language (ISO 639-1 code)
- Return ConceptExtractionResult with concepts array, metadata (sourceLength, extractionDate, detectedLanguage), and suggestedContentTypes array
- Use QuizGenerator.generateRawContent() for AI extraction with structured JSON response format
- AI prompt explicitly instructs: "Extract concepts in the SAME language as the source text. Do not translate."
- Support language detection by including detected language in extraction result
- Integrate with AIConfiguration for reading-level appropriate concept complexity
- Handle extraction failures gracefully with empty concepts array and error metadata

**ExtractedConcept and ConceptExtractionResult Types**
- Define ExtractedConcept interface with term, definition, importance, category?, language fields in `src/ai/types.ts`
- Define ConceptExtractionResult interface with concepts, metadata (sourceLength, extractionDate, detectedLanguage, error?), suggestedContentTypes in `src/ai/types.ts`
- Export from `src/ai/index.ts` for public API access
- Importance enum values map to content selection: high concepts always included, medium for comprehensive content, low for exhaustive coverage
- Category field enables grouping (e.g., "vocabulary", "grammar", "culture" for language learning)

**Language-Aware AIConfiguration**
- Add targetLanguage field (optional string, ISO 639-1 codes: "en", "vi", "fr", "de", "es", "zh", "ja", etc.) to AIConfiguration interface in `src/compiler/types.ts`
- Add includeTranslations field (optional boolean, default false) to AIConfiguration interface
- Validation: targetLanguage must be 2-letter lowercase ISO code if provided, warn for unsupported codes but allow through
- Default behavior: If targetLanguage not specified, auto-detect from BookDefinition.language field
- Export LanguageCode type alias for ISO 639-1 language codes with common codes enumerated

**Enhanced AIPromptBuilder**
- Update buildSystemPrompt() method to inject language instructions when targetLanguage is present
- Add private LANGUAGE_NAMES mapping for ISO codes to full language names (en→English, vi→Vietnamese, fr→French, etc.)
- Language instruction format: "LANGUAGE REQUIREMENT: Generate all content in {languageName} ({code}). Do not translate to other languages unless explicitly instructed."
- Translation instruction format (when includeTranslations=true): "Include English translations in parentheses after Vietnamese terms for language learners."
- Insert language instructions after FORMATTING_RULES and before READING_LEVEL in system prompt
- Update resolveConfig() to cascade targetLanguage and includeTranslations fields following item > chapter > book hierarchy
- If targetLanguage in item/chapter/book differs from BookDefinition.language, log warning about potential mismatch

**HandlerContext Concepts Field**
- Add optional concepts field (ExtractedConcept[]) to HandlerContext interface in `src/handlers/HandlerContext.ts`
- Document field purpose: Extracted concepts from source materials available to all handlers for concept-based content generation
- Update HandlerContext JSDoc: Explain 3-tier fallback pattern for AI handlers (check concepts → sourceText → prompt)
- No breaking changes: Field is optional, existing handlers continue working without modification

**Handler Integration Pattern**
- Update AI handlers (AITextHandler, QuizHandler, AIAccordionHandler, AISingleChoiceSetHandler) to check context.concepts first
- If concepts present and relevant to content type, use concepts as primary content source instead of generic prompt
- Fallback chain: Use concepts if available → Use sourceText if provided → Fall back to prompt-based generation
- For quiz/question handlers: Filter concepts by importance (high/medium for default quizzes, include low for comprehensive assessments)
- For vocabulary handlers (DialogCards, Flashcards): Use concept.term and concept.definition directly when concepts available
- Pass targetLanguage and includeTranslations from resolved aiConfig to AI prompt construction

**CLI Command: extract-text (Step 1: Source → Text)**
- Create new CLI command `extract-text` in `src/modules/cli/extract-text-module.ts`
- Positional arguments: sourceFile (path to source file), outputDir (optional path to extraction output directory, defaults to `/extracted/`)
- Options: --type (pdf | audio | video | url | text, auto-detect if not specified), --language (hint for transcription accuracy), --verbose
- Call SourceExtractor.extractText() with detected or specified source type
- Write extracted text to `{outputDir}/{basename}/full-text.txt`
- Write metadata JSON to `{outputDir}/{basename}/metadata.json`
- Log extraction summary: source type, file size, word count, detected language, extraction time
- Exit codes: 0 for success, 1 for file errors, 2 for extraction errors, 3 for API errors (Whisper, network)
- Example usage: `node dist/index.js extract-text ./sources/files/lecture.pdf` → Creates `/extracted/lecture/full-text.txt`

**CLI Command: extract-concepts (Step 3: Text → Concepts)**
- Create new CLI command `extract-concepts` in `src/modules/cli/extract-concepts-module.ts`
- Positional arguments: sourceFile (path to .txt file), outputFile (path to .json output)
- Options: --language (target language code), --reading-level (AIConfiguration reading level), --verbose
- Read source text from file, call ConceptExtractor.extractConcepts(), write JSON result to output file
- Output format: Pretty-printed JSON with concepts array and metadata
- Log extraction summary: concept count, importance distribution, suggested content types
- Exit codes: 0 for success, 1 for file errors, 2 for extraction errors

**CLI Command: generate-from-concepts**
- Create new CLI command `generate-from-concepts` in `src/modules/cli/generate-from-concepts-module.ts`
- Positional arguments: conceptsFile (path to concepts JSON), outputFile (path to .h5p output), contentType (flashcards | dialogcards | quiz | accordion)
- Options: --title, --language, --reading-level, --include-translations, --importance-filter (high | medium | low)
- Load concepts JSON, filter by importance if specified, generate content using appropriate handler
- Pass concepts to HandlerContext for handlers to consume during generation
- Support YAML config file as alternative input with concepts embedded
- Enable rapid prototyping: Extract concepts once → Generate multiple content types without re-extraction

**Sources Folder Structure**
- Use existing `/sources/` directory with subdirectories: files/, links/, text/
- `/sources/files/` contains PDFs, audio files (mp3, wav, m4a), video files (mp4, avi, mov) for Step 1 extraction
- `/sources/links/` contains .txt files with URLs for web scraping
- `/sources/text/` contains plain .txt files ready for immediate concept extraction (Step 3)
- Document structure in README.md with examples of placing source materials
- CLI commands default to reading from `/sources/` if relative paths provided

**Extracted Folder Structure**
- Use existing `/extracted/` directory for Step 1 (text extraction) and Step 3 (concept extraction) outputs
- Each source creates a subdirectory: `/extracted/{basename}/`
  - `full-text.txt` - Extracted text from Step 1 (source → text)
  - `metadata.json` - Extraction metadata (source type, size, language, timestamp)
  - `concepts.json` - Extracted concepts from Step 3 (text → concepts)
- Preserve full extraction history for traceability and re-extraction
- CLI commands default to writing to `/extracted/` if relative paths provided

**Backward Compatibility**
- All AIConfiguration fields remain optional with sensible defaults
- Existing YAML files without targetLanguage or includeTranslations continue working unchanged
- Handlers check for concepts field but gracefully fall back to current prompt-based generation
- No changes to existing handler interfaces or method signatures
- Language instructions only injected when targetLanguage explicitly configured or auto-detected

## Existing Code to Leverage

**AIPromptBuilder Pattern**
- Use static methods for stateless service following current architecture
- Follow READING_LEVELS pattern for LANGUAGE_NAMES mapping (private static readonly record)
- Use buildSystemPrompt() extension pattern for adding language instructions to existing system prompt
- Follow resolveConfig() cascade pattern for new targetLanguage and includeTranslations fields
- Maintain separation: system prompt construction (AIPromptBuilder) vs content generation (QuizGenerator)

**QuizGenerator.generateRawContent() for AI Extraction**
- Use existing generateRawContent(systemPrompt, userPrompt) public method for concept extraction
- Supports both Anthropic and Google providers automatically
- Returns raw string response that ConceptExtractor parses as JSON
- Follow JSON parsing pattern: strip markdown code fences, parse, validate structure
- Reuse try-catch with error handling pattern from existing AI handlers

**HandlerContext AIConfiguration Cascade**
- Follow existing bookConfig and chapterConfig pattern for context-level configuration
- Use AIPromptBuilder.resolveConfig(item.aiConfig, context.chapterConfig, context.bookConfig) for merging
- Document 4-tier cascade in HandlerContext JSDoc: item > chapter > book > system defaults
- Apply same cascade to new targetLanguage and includeTranslations fields

**H5P Content Type JSON Structure**
- Follow existing content.json generation patterns in handlers
- Concept-based handlers build same H5P structures as prompt-based handlers
- No changes to ChapterBuilder methods (addCustomContent, addTextPage, etc.)
- Concepts are input data transformation, not output format change

**YamlInputParser Validation Pattern**
- Follow existing validation patterns for new CLI commands and YAML fields
- Add targetLanguage and includeTranslations to AIConfiguration validation
- Validate language codes using regex pattern `/^[a-z]{2}$/` for ISO 639-1 format
- Add clear error messages for invalid language codes with examples

## Smart Import Workflow Context

This feature implements **Steps 1-3 of the Smart Import API workflow**:

**Step 1: Source → Text Extraction** (IN SCOPE - Phase 6A)
- Extract text from PDF files (using pdf-parse npm package)
- Transcribe audio to text (using Whisper API via OpenAI)
- Transcribe video to text (extract audio track → transcribe with Whisper)
- Scrape text from URLs (using cheerio for HTML parsing)
- Read plain text files (already working)
- Output: `/extracted/{source}/full-text.txt`

**Step 2: Review Text** (Already supported via file editing)
- Educator reviews extracted text at `/extracted/{source}/full-text.txt`
- Can manually edit text before concept extraction
- This step is manual file editing (no CLI command needed)

**Step 3: Text → Concepts Extraction** (IN SCOPE - Phase 6A, PRIMARY FOCUS)
- Extract key concepts FROM reviewed text (language-agnostic)
- English source → English concepts, Vietnamese source → Vietnamese concepts
- Output: `/extracted/{source}/concepts.json`
- This is the ConceptExtractor service implementation

**Key Principle: Language-Agnostic Extraction**
- Source language determines concept language (not hardcoded to Vietnamese)
- If source text is in English, concepts are extracted in English
- If source text is in Vietnamese, concepts are extracted in Vietnamese
- targetLanguage in AIConfiguration controls GENERATION language, not extraction language
- Example workflow:
  - English PDF → English text → English concepts → Vietnamese quiz (with targetLanguage=vi and includeTranslations=true)
  - Vietnamese audio → Vietnamese text → Vietnamese concepts → Vietnamese flashcards (with targetLanguage=vi)

## Out of Scope

- Advanced file format parsing (Word docs, EPUB, PowerPoint - defer to Phase 6B)
- Image OCR text extraction (defer to Phase 6B with Tesseract integration)
- Frontend UI for concept review and editing (defer to Smart Import SvelteKit integration in Phase 6C)
- Concept database or persistence layer beyond JSON files (concepts stored as JSON files only)
- Multi-language translation service integration (includeTranslations generates via AI, not external translation API)
- Audio pronunciation generation for vocabulary terms
- Image generation for concept visualization
- Real-time streaming transcription (batch processing only)

## Dependencies

**New npm packages required for Step 1 source extraction:**
- `pdf-parse` (^1.1.1) - Extract text from PDF files
- `openai` (^4.0.0) - Whisper API for audio/video transcription
- `cheerio` (^1.0.0) - HTML parsing for URL scraping
- `@ffmpeg-installer/ffmpeg` (^1.1.0) - FFmpeg binary for video audio extraction
- `fluent-ffmpeg` (^2.1.2) - FFmpeg Node.js wrapper for media processing
- `language-detect` (^1.0.0) - Detect language of extracted text

**Existing dependencies (already in package.json):**
- `fs-extra` - File system operations
- `axios` - HTTP requests for URL fetching
- All existing H5P and AI dependencies remain unchanged

## Visual Design

No visual components. This is a backend service and CLI command feature.

## Testing Strategy

**Unit Tests for SourceExtractor (7 tests)**
- Test extractText() from PDF file returns text with proper structure
- Test extractText() from audio file using Whisper API returns transcription
- Test extractText() from video file extracts audio and transcribes
- Test extractText() from URL scrapes and returns main content text
- Test extractText() from plain text file returns file contents
- Test error handling for unsupported file types
- Test error handling for API failures (Whisper timeout, network errors)

**Integration Tests for Extract-Text CLI (5 tests)**
- Test extract-text command with PDF creates full-text.txt and metadata.json
- Test extract-text command with audio file creates transcription output
- Test extract-text command respects --language hint for transcription
- Test extract-text command auto-detects file type when --type not specified
- Test extract-text command handles file not found errors gracefully

**Unit Tests for ConceptExtractor (8 tests)**
- Test extractConcepts() returns ExtractedConcept array with required fields
- Test importance classification (high/medium/low) distribution
- Test language detection populates detectedLanguage in metadata
- Test category assignment for structured concepts
- Test error handling for invalid source text (empty, null, too short)
- Test error handling for AI API failures (network, rate limit, invalid response)
- Test suggestedContentTypes includes appropriate content types based on concept structure
- Test integration with AIConfiguration reading level affects concept complexity

**Unit Tests for AIPromptBuilder Language Enhancement (6 tests)**
- Test buildSystemPrompt() with targetLanguage injects language instruction
- Test buildSystemPrompt() with includeTranslations adds translation instruction
- Test buildSystemPrompt() without language fields maintains existing behavior (backward compatibility)
- Test resolveConfig() cascades targetLanguage from item > chapter > book
- Test resolveConfig() cascades includeTranslations from item > chapter > book
- Test LANGUAGE_NAMES mapping covers common ISO 639-1 codes

**Integration Tests for Extract-Concepts CLI (4 tests)**
- Test extract-concepts reads .txt file and generates valid concepts JSON
- Test extract-concepts respects --language parameter in extraction
- Test extract-concepts respects --reading-level parameter for complexity
- Test extract-concepts handles file read errors gracefully with helpful messages

**Integration Tests for Generate-From-Concepts CLI (5 tests)**
- Test generate-from-concepts creates flashcards from concepts JSON
- Test generate-from-concepts creates dialogcards from concepts JSON
- Test generate-from-concepts creates quiz from concepts JSON
- Test generate-from-concepts filters by importance level with --importance-filter
- Test generate-from-concepts respects --include-translations flag

**Integration Tests for Language-Aware AI Generation (6 tests)**
- Test Vietnamese story YAML with targetLanguage=vi generates Vietnamese content consistently
- Test Vietnamese story with includeTranslations=true includes English translations
- Test Vietnamese quiz questions stay in Vietnamese (regression test for reported issue)
- Test French content with targetLanguage=fr generates French content
- Test auto-detection from BookDefinition.language when targetLanguage not specified
- Test existing YAML files without language fields continue working (backward compatibility)

**Manual Validation**
- Extract text from Vietnamese audio file using extract-text CLI command
- Verify extracted text accuracy and language detection (should detect "vi")
- Extract concepts from Vietnamese story text in `/sources/text/vietnamese-story.txt` using extract-concepts CLI
- Verify extracted concepts are in Vietnamese (not translated to English)
- Generate dialogcards, quiz, and accordion from extracted concepts using generate-from-concepts CLI
- Build .h5p package and upload to h5p.com
- Verify Vietnamese content stays in Vietnamese throughout all content types
- Verify translations appear when includeTranslations=true
- Verify concept-based content is accurate to source material (no hallucination)
- Compare concept-based quiz vs prompt-based quiz for learning integrity

## Success Criteria

**Step 1: Source Extraction (Source → Text)**
- SourceExtractor extracts text from PDF files preserving paragraph structure
- SourceExtractor transcribes Vietnamese audio to Vietnamese text using Whisper API
- SourceExtractor extracts audio from video and transcribes to text
- SourceExtractor scrapes main content from URLs excluding navigation/footer
- extract-text CLI command creates `/extracted/{basename}/full-text.txt` and `metadata.json`
- Metadata includes detected language, word count, extraction timestamp

**Step 3: Concept Extraction (Text → Concepts)**
- ConceptExtractor extracts 10-30 concepts from 500-word story text (any language)
- Concepts extracted in SAME language as source (English source → English concepts, Vietnamese source → Vietnamese concepts)
- ExtractedConcept language field populated correctly ("en", "vi", "fr", etc.)
- extract-concepts CLI command creates valid JSON output in `/extracted/` directory

**Language-Aware AI Generation**
- AIPromptBuilder injects language instruction when targetLanguage specified
- Vietnamese quiz generated from concepts stays in Vietnamese (no automatic translation)
- French content with targetLanguage=fr generates French content consistently
- includeTranslations=true adds translations in parentheses after target language terms
- Auto-detection from BookDefinition.language works when targetLanguage not specified

**Integration & Backward Compatibility**
- generate-from-concepts CLI command creates .h5p package from concepts JSON
- Existing YAML files without language fields continue working without errors
- Handlers check context.concepts and fall back to sourceText then prompt

**Testing & Documentation**
- Unit tests pass (21+ tests: 7 SourceExtractor, 8 ConceptExtractor, 6 AIPromptBuilder)
- Integration tests pass (20+ tests: 5 extract-text, 4 extract-concepts, 5 generate-from-concepts, 6 language-aware)
- README.md updated with Smart Import workflow (Steps 1-3) and language configuration examples
- Vietnamese story demo YAML updated with targetLanguage and concepts usage
