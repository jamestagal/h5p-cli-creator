# Raw Idea: Concept Extraction Pipeline with Language-Aware AI Configuration

**Feature Name**: Concept Extraction Pipeline with Language-Aware AI Configuration

**Brief Description**:
This feature implements the foundation for the **Smart Import 4-Step Workflow** - a powerful system for generating H5P content from source materials with language awareness and learning integrity.

## The 4-Step Smart Import Workflow

### STEP 1: Upload Content
You upload content (PDF, audio, video) or paste a link (URL) for us to analyze. Optionally, customize your input by adding learning objectives, difficulty level, target language, etc.

**Implementation**: SourceExtractor service + extract-text CLI command

### STEP 2: Review Text
We transcode or scrape the content and make a textual version for you to review. Edit the text to focus on key learning material before concept extraction.

**Implementation**: Manual file editing at `/extracted/{source}/full-text.txt`

### STEP 3: Review Concepts
We analyze the reviewed text and find concepts in it. The concepts chosen will be used to create interactive questions and more. Review and edit the extracted concepts as needed.

**Implementation**: ConceptExtractor service + extract-concepts CLI command

### STEP 4: Select Content Types
You choose what content types should be created (flashcards, quizzes, dialogcards, etc.) and we generate the content for you based on your chosen concepts!

**Implementation**: generate-from-concepts CLI command + Handler integration with context.concepts

## Two Major Components

1. **Source Extraction & Concept Extraction Pipeline (Steps 1-3)**: Extract text from various sources (PDF/audio/video/URL), then extract key concepts from that text to enable source-based content generation with learning integrity.

2. **Language-Aware AI Configuration**: Enhance the AI configuration system with targetLanguage and includeTranslations fields to ensure AI-generated content respects the target language and provides appropriate translations for language learning contexts.

**Context**:
- Part of Phase 6A implementation (Smart Import foundation - Steps 1-4)
- Builds on Phase 5's Universal AI Configuration system
- Addresses real-world issue: AI inconsistently generates content in target language (e.g., Vietnamese quiz generated in English instead of Vietnamese)
- Enables source-based content generation for educational integrity

**Key Components**:
1. SourceExtractor service (Step 1)
2. ConceptExtractor service (Step 3)
3. Enhanced AIConfiguration interface with language fields (Steps 3-4)
4. Updated AIPromptBuilder with language context injection (Step 4)
5. HandlerContext extension with concepts field (Step 4)
6. CLI commands: extract-text, extract-concepts, generate-from-concepts
7. /sources/ and /extracted/ folder structure
