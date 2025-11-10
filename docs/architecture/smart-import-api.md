# Smart Import API Documentation

## Overview

The Smart Import API provides a **4-step workflow** for effortlessly generating multiple H5P content types from source materials (PDF, audio, video, URL) with language-aware AI configuration and learning integrity. This document establishes the foundation for Smart Import implementation in Phase 6.

**Phase 5 Status:** Architecture documented, types exported, foundation established ✅
**Phase 6A Status:** 4-Step Workflow implementation (current focus) 🚧

## The 4-Step Smart Import Workflow

Smart Import transforms source materials into H5P content through a transparent, reviewable process:

### **STEP 1: Upload Content**
Upload content (PDF, audio, video) or paste a link (URL) for analysis. Optionally customize with learning objectives, difficulty level, target language, etc.
- **Technology**: SourceExtractor service (pdf-parse, Whisper API, cheerio)
- **CLI**: `extract-text ./sources/files/lecture.pdf`
- **Output**: `/extracted/{source}/full-text.txt` + `metadata.json`

### **STEP 2: Review Text**
We transcode/scrape content and make a textual version for you to review. Edit the text to focus on key learning material before concept extraction.
- **Technology**: Standard file editing (any text editor)
- **Process**: User edits `/extracted/{source}/full-text.txt`
- **Output**: Reviewed and edited text file

### **STEP 3: Review Concepts**
We analyze the reviewed text and extract concepts. The concepts chosen will be used to create interactive questions and more. Review and edit extracted concepts as needed.
- **Technology**: ConceptExtractor service (AI-powered concept extraction)
- **CLI**: `extract-concepts ./extracted/lecture/full-text.txt`
- **Output**: `/extracted/{source}/concepts.json`

### **STEP 4: Select Content Types**
Choose content types (flashcards, quizzes, dialogcards, etc.) and we generate the content for you based on your chosen concepts with language-aware AI.
- **Technology**: Handler integration with `context.concepts` + language-aware AIConfiguration
- **CLI**: `generate-from-concepts ./extracted/lecture/concepts.json ./output.h5p --content-type quiz`
- **Output**: `.h5p` package with generated content

---

## TL;DR - Key Architectural Decision

**LEARNING INTEGRITY PRINCIPLE:** Smart Import generates ALL content (flashcards, quizzes, summaries, etc.) FROM the extracted source text, not from thin air.

```typescript
// ✅ CORRECT (Smart Import - Source-Based)
userPrompt = `Based on this source text: "${sourceText}", create 10 flashcards...`;

// ❌ WRONG (Would create hallucinated content)
userPrompt = `Create 10 flashcards about photosynthesis...`;
```

**Why this matters:**
- **Learning Integrity**: Assessments test what was actually taught in the source material
- **Content Consistency**: All activities reference the same foundational knowledge
- **Educational Quality**: No AI hallucinations - only source-derived content

**Implementation Status:**
- **Phase 5 (Current)**: Prompt-based generation (YAML/JSON workflow) ✅
- **Phase 6 (Next)**: Add source-based generation (Smart Import) + support both modes 🚧

**Handler Pattern (Phase 6):**
```typescript
// Handlers check for sourceText and use appropriate mode
if (context.sourceText) {
  // Source-based: Generate FROM extracted text
  userPrompt = `Based on: ${context.sourceText}...`;
} else {
  // Prompt-based: Generate FROM user prompt
  userPrompt = `${item.prompt}...`;
}
```

## Key Concepts

### Source Content as Foundation for Learning Integrity

**CRITICAL ARCHITECTURAL PRINCIPLE:** All AI-generated content in Smart Import is derived from the **extracted source text**. This ensures:

1. **Learning Integrity**: Questions, flashcards, and activities are based on the actual source material, not AI hallucinations
2. **Content Consistency**: All generated content types reference the same foundational knowledge
3. **Educational Quality**: Assessments test what was actually taught in the source material

**Two AI Generation Modes:**

1. **Source-Based Generation** (Smart Import - Phase 6, Recommended)
   - AI generates content FROM extracted source text
   - Used for: Flashcards, quizzes, dialog cards, summaries
   - Pattern: `generateRawContent(systemPrompt, "Based on this text: [sourceText], create 10 flashcards...")`
   - Ensures: Learning integrity and factual accuracy

2. **Prompt-Based Generation** (Interactive Book - Phase 5, Current)
   - AI generates content FROM user prompt alone
   - Used for: ai-text, ai-quiz, ai-accordion in YAML/JSON workflow
   - Pattern: `generateRawContent(systemPrompt, "Explain photosynthesis for grade 6...")`
   - Flexible: But may generate content not aligned with source material

**Implementation Goal (Phase 6+):** Both modes should be supported. Smart Import uses source-based mode by default, but can fall back to prompt-based mode if no source is available.

### Two Entry Points for AI Configuration

The h5p-cli-creator system supports two distinct entry points for AI-powered content generation:

1. **Interactive Book Entry Point** (Fully implemented in Phase 5)
   - Input: YAML or JSON BookDefinition
   - Output: Single Interactive Book .h5p package
   - Configuration: Via `BookDefinition.aiConfig`
   - AI Mode: Prompt-based generation (user prompts)
   - Use case: Creating structured educational books with chapters

2. **Smart Import Entry Point** (Foundation in Phase 5, implementation in Phase 6)
   - Input: Source content (PDF/text/URL) + generation request
   - Output: Multiple .h5p packages of different content types
   - Configuration: Via `SmartImportRequest.aiConfig`
   - AI Mode: Source-based generation (extracted text + prompts)
   - Use case: Rapid content generation from existing materials

**Key Architectural Principle:** Both entry points use the **same** `AIConfiguration` type, `AIPromptBuilder` service, and reading level presets. The AI configuration system is truly universal.

### Universal AI Configuration

The same `aiConfig` applies to ALL generated content types:

```typescript
// One configuration, multiple outputs
const request = {
  source: { type: "text", content: "..." },
  aiConfig: {
    targetAudience: "grade-6",
    tone: "educational"
  },
  outputTypes: ["flashcards", "dialog-cards", "interactive-book"]
};

// ALL three packages use grade-6 reading level!
```

## Smart Import Workflow

The Smart Import workflow transforms source materials into H5P content through a transparent, reviewable 4-step process:

### **STEP 1: Upload Content**

Upload content (PDF, audio, video) or paste a link (URL) for analysis. Optionally customize with learning objectives, difficulty level, target language, etc.

**User Action**: Provides content source and configuration options

```typescript
POST /api/smart-import/upload
{
  "source": {
    "type": "file" | "url" | "text",
    "content": File | string
  },
  "language": "en"
}

Response:
{
  "sourceId": "uuid-1234",
  "extractedText": "...",
  "wordCount": 1523,
  "status": "ready"
}
```

### **STEP 2: Review Text**

We transcode or scrape the content and make a textual version for you to review. Edit the text to focus on key learning material before concept extraction.

**User Action**: Reviews and edits extracted text

**System Action**: Extracts text from source (PDF/audio/video/URL)

```typescript
GET /api/smart-import/source/{sourceId}

Response:
{
  "sourceId": "uuid-1234",
  "originalText": "...",
  "extractedText": "...",
  "metadata": {
    "wordCount": 1523,
    "estimatedReadingTime": "7 minutes",
    "detectedLanguage": "en"
  }
}
```

**Phase 6A Implementation**: CLI workflow uses file editing; API workflow provides edit interface.

---

### **STEP 3: Review Concepts**

We analyze the reviewed text and find concepts in it. The concepts chosen will be used to create interactive questions and more. Review and edit the extracted concepts as needed.

**User Action**: Reviews and selects concepts for content generation

**System Action**: AI extracts key concepts from reviewed text (language-agnostic)

```typescript
POST /api/smart-import/extract-concepts
{
  "sourceId": "uuid-1234",
  "sourceText": "..."
}

Response:
{
  "concepts": [
    {
      "term": "Photosynthesis",
      "definition": "Process by which plants convert light energy...",
      "importance": "high"
    },
    {
      "term": "Chlorophyll",
      "definition": "Green pigment in plants...",
      "importance": "medium"
    }
  ],
  "suggestedContentTypes": [
    "flashcards",   // Good for terminology
    "ai-quiz",      // Good for comprehension
    "dialog-cards"  // Good for Q&A format
  ]
}
```

---

### **STEP 4: Select Content Types**

You choose what content types should be created (flashcards, quizzes, dialogcards, etc.) and we generate the content for you based on your chosen concepts with language-aware AI!

**User Action**: Selects content types and configures language options

**System Action**: Generates H5P content FROM concepts (not hallucinated)

```typescript
POST /api/smart-import/generate
{
  "sourceId": "uuid-1234",
  "sourceText": "...",
  "language": "en",

  // Universal AI configuration (Phase 5 ✅) + Language-aware (Phase 6A ✅)
  "aiConfig": {
    "readingLevel": "grade-6",           // Phase 5: Reading level presets
    "tone": "educational",               // Phase 5: Tone presets
    "targetLanguage": "vi",              // Phase 6A: Target language for generation
    "includeTranslations": true,         // Phase 6A: Include translations for language learning
    "customPrompt": "Focus on visual learners"
  },

  // Extracted concepts from Step 3 (Phase 6A ✅)
  "concepts": [
    { "term": "Photosynthesis", "definition": "...", "importance": "high", "language": "en" }
  ],

  // Select output types
  "outputTypes": [
    "flashcards",
    "dialog-cards",
    "interactive-book"
  ],

  // Optional: Configure composite types
  "compositeOptions": {
    "interactive-book": {
      "includeSubContent": ["flashcards", "ai-quiz"],
      "chaptersFromSections": true,
      "maxChapters": 8
    }
  }
}

Response:
{
  "status": "success",
  "packages": [
    {
      "type": "flashcards",
      "filename": "flashcards.h5p",
      "buffer": Buffer,
      "size": 45312,
      "metadata": { "itemCount": 12 }
    },
    {
      "type": "dialog-cards",
      "filename": "dialog-cards.h5p",
      "buffer": Buffer,
      "size": 38192,
      "metadata": { "itemCount": 8 }
    },
    {
      "type": "interactive-book",
      "filename": "interactive-book.h5p",
      "buffer": Buffer,
      "size": 234567,
      "metadata": {
        "chapters": 5,
        "includedSubContent": ["flashcards", "ai-quiz"]
      }
    }
  ],
  "aiConfig": {
    "targetAudience": "grade-6",
    "tone": "educational"
  }
}
```

## TypeScript Types (Phase 5 Exported)

All types are exported from `src/compiler/types.ts` for Phase 6 implementation:

### SmartImportRequest

```typescript
export interface SmartImportRequest {
  source: {
    type: "text" | "file" | "url";
    content: string | File | URL;
  };
  language: string;
  aiConfig?: AIConfiguration;  // Universal AI config!
  outputTypes: ContentTypeOption[];
  compositeOptions?: CompositeContentOptions;
}
```

### ContentTypeOption

```typescript
export type ContentTypeOption =
  // Standalone types (Phase 6)
  | "flashcards"
  | "dialog-cards"
  | "summary"
  | "ai-quiz"
  | "timeline"
  | "accordion"
  | "image-hotspots"
  | "multiple-choice"
  | "fill-in-blanks"
  | "mark-the-words"
  | "drag-drop"
  | "essay"

  // Composite types (Phase 6+)
  | "interactive-book"        // 24 sub-content types
  | "course-presentation"     // 11 sub-content types
  | "interactive-video"       // 8 sub-content types
  | "question-set"            // 8 sub-content types
  | "page"                    // 25 sub-content types
  | "branching-scenario"      // 3 sub-content types
  | "virtual-tour-360";       // 2 sub-content types
```

### CompositeContentOptions

```typescript
export interface CompositeContentOptions {
  "interactive-book"?: InteractiveBookOptions;
  "course-presentation"?: CoursePresentationOptions;
  "interactive-video"?: InteractiveVideoOptions;
  "question-set"?: QuestionSetOptions;
  "page"?: PageOptions;
  "branching-scenario"?: BranchingScenarioOptions;
  "virtual-tour-360"?: VirtualTourOptions;
}
```

### InteractiveBookOptions (Phase 5)

```typescript
export interface InteractiveBookOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to embed
  chaptersFromSections?: boolean;           // Auto-create chapters
  maxChapters?: number;                     // Limit chapters
}
```

### Other Composite Options (Phase 6+)

```typescript
export interface CoursePresentationOptions {
  includeSubContent?: ContentTypeOption[];
  slidesFromSections?: boolean;
  maxSlides?: number;
}

export interface InteractiveVideoOptions {
  includeSubContent?: ContentTypeOption[];
  videoSource?: string | File;
  interactionsFromTimestamps?: boolean;
}

export interface QuestionSetOptions {
  includeSubContent?: ContentTypeOption[];
  randomizeQuestions?: boolean;
  questionsPerSet?: number;
}

export interface PageOptions {
  includeSubContent?: ContentTypeOption[];
  sectionsFromHeadings?: boolean;
}

export interface BranchingScenarioOptions {
  includeSubContent?: ContentTypeOption[];  // Limited to 3 types
  branchesFromChoices?: boolean;
}

export interface VirtualTourOptions {
  includeSubContent?: ContentTypeOption[];  // Limited to 2 types
  scenes360Source?: (string | File)[];
}
```

### SmartImportResponse

```typescript
export interface SmartImportResponse {
  status: "success" | "error";
  packages?: GeneratedPackage[];
  aiConfig?: AIConfiguration;
  error?: string;
  details?: string[];
}

export interface GeneratedPackage {
  type: ContentTypeOption;
  filename: string;
  buffer: Buffer;
  size: number;
  metadata?: {
    // For composite types:
    chapters?: number;
    slides?: number;
    questions?: number;
    scenes?: number;
    branches?: number;
    duration?: number;
    sections?: number;

    // Universal:
    includedSubContent?: ContentTypeOption[];
    itemCount?: number;
  };
}
```

## Supported H5P Composite Content Types

Smart Import supports 7 H5P composite content types that can include sub-content:

### 1. Interactive Book (Phase 5 ✅)

**Sub-content types supported:** 24 types including:
- Text content (H5P.AdvancedText)
- Images (H5P.Image)
- Videos (H5P.Video)
- Audio (H5P.Audio)
- Flashcards (H5P.Flashcards)
- Dialog Cards (H5P.DialogCards)
- Multiple Choice (H5P.MultiChoice)
- True/False (H5P.TrueFalse)
- Fill in Blanks (H5P.Blanks)
- Drag and Drop (H5P.DragQuestion)
- And 14 more...

**Example:**
```typescript
{
  outputTypes: ["interactive-book"],
  compositeOptions: {
    "interactive-book": {
      includeSubContent: ["flashcards", "ai-quiz", "dialog-cards"],
      chaptersFromSections: true,
      maxChapters: 10
    }
  }
}
```

### 2. Course Presentation (Phase 6+)

**Sub-content types supported:** 11 types including:
- Text
- Images
- Videos
- Multiple Choice questions
- Fill in Blanks
- Drag and Drop
- Summary
- And 4 more...

**Example:**
```typescript
{
  outputTypes: ["course-presentation"],
  compositeOptions: {
    "course-presentation": {
      includeSubContent: ["multiple-choice", "fill-in-blanks", "summary"],
      slidesFromSections: true,
      maxSlides: 20
    }
  }
}
```

### 3. Interactive Video (Phase 6+)

**Sub-content types supported:** 8 types including:
- Text
- Images
- Multiple Choice
- Fill in Blanks
- Summary
- Statements (True/False)
- And 2 more...

### 4. Question Set (Phase 6+)

**Sub-content types supported:** 8 question types:
- Multiple Choice
- True/False
- Fill in Blanks
- Drag and Drop
- Mark the Words
- Drag Text
- Essay
- Arithmetic Quiz

### 5. Page (Column) (Phase 6+)

**Sub-content types supported:** 25 types (most flexible composite type)

### 6. Branching Scenario (Phase 6+)

**Sub-content types supported:** 3 types (limited):
- Course Presentation
- Interactive Video
- Text

### 7. Virtual Tour (360) (Phase 6+)

**Sub-content types supported:** 2 types (limited):
- Text
- Images

## Example Usage Scenarios

### Scenario 1: Generate Flashcards Only

```typescript
POST /api/smart-import/generate
{
  "source": {
    "type": "text",
    "content": "Photosynthesis is the process by which plants..."
  },
  "language": "en",
  "aiConfig": {
    "targetAudience": "elementary",
    "tone": "educational"
  },
  "outputTypes": ["flashcards"]
}

// Generates: flashcards.h5p (elementary reading level)
```

### Scenario 2: Generate Multiple Standalone Types

```typescript
{
  "aiConfig": {
    "targetAudience": "high-school",
    "tone": "academic"
  },
  "outputTypes": [
    "flashcards",
    "dialog-cards",
    "ai-quiz"
  ]
}

// Generates:
// - flashcards.h5p (high-school level)
// - dialog-cards.h5p (high-school level)
// - ai-quiz.h5p (high-school level)
// ALL using academic tone!
```

### Scenario 3: Interactive Book with Embedded Content

```typescript
{
  "aiConfig": {
    "targetAudience": "grade-9",
    "customization": "Focus on real-world applications"
  },
  "outputTypes": ["interactive-book"],
  "compositeOptions": {
    "interactive-book": {
      includeSubContent: ["flashcards", "ai-quiz", "dialog-cards"],
      chaptersFromSections": true,
      "maxChapters": 8
    }
  }
}

// Generates:
// - interactive-book.h5p with 8 chapters
//   - Each chapter has AI-generated text (grade-9 level)
//   - Embedded flashcards for review
//   - Embedded quizzes for assessment
//   - Embedded dialog cards for Q&A
```

### Scenario 4: Both Standalone AND Composite

```typescript
{
  "aiConfig": {
    "targetAudience": "college",
    "tone": "academic"
  },
  "outputTypes": [
    "flashcards",      // Standalone
    "dialog-cards",    // Standalone
    "interactive-book" // Composite
  ],
  "compositeOptions": {
    "interactive-book": {
      includeSubContent: ["flashcards", "ai-quiz"],  // User chose NOT to include dialog-cards
      chaptersFromSections": true
    }
  }
}

// Generates:
// - flashcards.h5p (standalone, college level)
// - dialog-cards.h5p (standalone, college level)
// - interactive-book.h5p (composite, college level)
//   - Contains embedded flashcards
//   - Contains embedded quizzes
//   - Does NOT contain dialog-cards (user's choice)
```

### Scenario 5: Multi-Composite Generation

```typescript
{
  "aiConfig": {
    "targetAudience": "professional",
    "tone": "professional",
    "customization": "Focus on ROI and business outcomes"
  },
  "outputTypes": [
    "interactive-book",
    "course-presentation",
    "question-set"
  ],
  "compositeOptions": {
    "interactive-book": {
      includeSubContent": ["summary", "ai-quiz"],
      "maxChapters": 5
    },
    "course-presentation": {
      includeSubContent": ["multiple-choice", "fill-in-blanks"],
      "maxSlides": 15
    },
    "question-set": {
      includeSubContent": ["multiple-choice", "essay"],
      "questionsPerSet": 10,
      "randomizeQuestions": true
    }
  }
}

// Generates:
// - interactive-book.h5p (5 chapters, professional level)
// - course-presentation.h5p (15 slides, professional level)
// - question-set.h5p (10 questions, professional level)
// ALL using professional tone and ROI focus!
```

## Our Advantage Over H5P.com

**H5P.com approach:**
- Generates ALL possible content types from source
- User has limited control over what's included
- "Include everything" philosophy

**Our approach:**
- User explicitly selects which standalone types to generate
- User explicitly selects which sub-content to embed in each composite type
- Fine-grained control at two levels:
  1. `outputTypes` - Which packages to create
  2. `compositeOptions[type].includeSubContent` - What to embed in each composite type

**Example of our advantage:**
```typescript
// User wants Interactive Book with flashcards and quizzes,
// but ALSO wants standalone dialog-cards for separate review
{
  "outputTypes": [
    "dialog-cards",      // Standalone package
    "interactive-book"   // Composite package
  ],
  "compositeOptions": {
    "interactive-book": {
      includeSubContent: ["flashcards", "ai-quiz"]
      // Notice: NOT including dialog-cards in book
    }
  }
}

// Result:
// - dialog-cards.h5p (standalone for review sessions)
// - interactive-book.h5p (has flashcards and quizzes, but NOT dialog-cards)
```

## Validation Examples

### Invalid Reading Level

```typescript
POST /api/smart-import/generate
{
  "aiConfig": {
    "targetAudience": "advanced"  // ❌ Invalid
  }
}

Response: HTTP 400
{
  "error": "Validation failed",
  "details": [
    "Invalid targetAudience: 'advanced'. Valid options: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate"
  ]
}
```

### Invalid Tone

```typescript
{
  "aiConfig": {
    "tone": "funny"  // ❌ Invalid
  }
}

Response: HTTP 400
{
  "error": "Validation failed",
  "details": [
    "Invalid tone: 'funny'. Valid options: educational, professional, casual, academic"
  ]
}
```

### Invalid Content Type

```typescript
{
  "outputTypes": ["unknown-type"]  // ❌ Invalid
}

Response: HTTP 400
{
  "error": "Validation failed",
  "details": [
    "Invalid content type: 'unknown-type'"
  ]
}
```

## Implementation Roadmap

### Phase 5 (Current) ✅
- [x] Define TypeScript interfaces
- [x] Export types from `src/compiler/types.ts`
- [x] Document API structure and workflow
- [x] Establish universal AIConfiguration architecture
- [x] Document relationship to Interactive Book entry point
- [x] Implement prompt-based AI generation (YAML/JSON workflow)
- [x] Document source-based vs prompt-based generation modes

### Phase 6A: 4-Step Workflow Foundation (Current)
**STEP 1: Upload Content - Source Extraction**
- [ ] Implement SourceExtractor service (PDF, audio, video, URL extraction)
- [ ] Create extract-text CLI command
- [ ] Add npm dependencies: pdf-parse, openai (Whisper), cheerio, ffmpeg
- [ ] Write SourceExtractionResult types
- [ ] Unit tests for SourceExtractor (7 tests)
- [ ] Integration tests for extract-text CLI (5 tests)

**STEP 2: Review Text - Manual Editing**
- [x] Support manual file editing workflow (no code needed)
- [ ] Document file editing process in user guides

**STEP 3: Review Concepts - Concept Extraction**
- [ ] Implement ConceptExtractor service (language-agnostic AI extraction)
- [ ] Create ExtractedConcept and ConceptExtractionResult types
- [ ] Create extract-concepts CLI command
- [ ] Unit tests for ConceptExtractor (8 tests)
- [ ] Integration tests for extract-concepts CLI (4 tests)

**STEP 4: Select Content Types - Language-Aware Generation**
- [ ] Add targetLanguage and includeTranslations fields to AIConfiguration
- [ ] Update AIPromptBuilder to inject language instructions
- [ ] Extend HandlerContext with concepts field (3-tier fallback)
- [ ] Update AI handlers to check context.concepts first
- [ ] Create generate-from-concepts CLI command
- [ ] Unit tests for AIPromptBuilder language features (6 tests)
- [ ] Integration tests for generate-from-concepts CLI (5 tests)
- [ ] Integration tests for language-aware generation (6 tests)

**Infrastructure & Documentation**
- [ ] Create /sources/ folder structure (files/, links/, text/)
- [ ] Create /extracted/ folder structure with subdirectories
- [ ] Update README.md with Smart Import workflow documentation
- [ ] Update Vietnamese story demo with targetLanguage examples
- [ ] Write CLI usage examples for all 3 commands

### Phase 6B: Advanced Extraction (Future)
- [ ] Word/EPUB/PowerPoint extraction
- [ ] Image OCR text extraction (Tesseract)
- [ ] Advanced concept extraction (entity recognition, relationships)
- [ ] Concept database and persistence layer

### Phase 6C: Smart Import UI (Future)
- [ ] SvelteKit frontend for Smart Import workflow
- [ ] Visual concept review and editing interface
- [ ] Batch content generation interface
- [ ] Source content library management

### Phase 7+ (Future)
- [ ] Interactive Video support
- [ ] Branching Scenario support
- [ ] Virtual Tour (360) support
- [ ] Page/Column support
- [ ] Advanced concept extraction (entity recognition, relationship mapping)
- [ ] Multi-language support for prompts
- [ ] Source content caching and reuse

## Architecture Principles

### Universal Design

The AIConfiguration system is **NOT tied to BookDefinition**:

```typescript
// Interactive Book Entry (Phase 5)
interface BookDefinition {
  aiConfig?: AIConfiguration;  // Uses universal type
  // ...
}

// Smart Import Entry (Phase 6)
interface SmartImportRequest {
  aiConfig?: AIConfiguration;  // Same universal type!
  // ...
}
```

Both use the same:
- `AIPromptBuilder` service
- Reading level presets
- Tone specifications
- Configuration resolution logic

### HandlerContext Extension for Smart Import (Phase 6A)

The `HandlerContext` interface will be extended to support source-based generation with concepts:

```typescript
export interface HandlerContext {
  chapterBuilder: ChapterBuilder;
  libraryRegistry: LibraryRegistry;
  quizGenerator: QuizGenerator;
  aiPromptBuilder: AIPromptBuilder;
  logger: Logger;
  mediaFiles: MediaFile[];
  options: Options;
  bookConfig?: AIConfiguration;
  chapterConfig?: AIConfiguration;

  /**
   * Optional source text for AI content generation.
   *
   * When present, AI handlers should generate content BASED ON this source text
   * to ensure learning integrity (assessments test actual content).
   *
   * When absent, AI handlers use prompt-based generation (more flexible,
   * but may generate content not aligned with specific source material).
   *
   * Populated by:
   * - Smart Import Step 1 (Phase 6A): Extracted from PDF/audio/video/URL
   * - Interactive Book YAML (Phase 5): undefined (uses prompt-based mode)
   *
   * @example
   * // Source-based generation (Smart Import)
   * if (context.sourceText) {
   *   const userPrompt = `Based on this text: ${context.sourceText}, create quiz...`;
   * }
   * // Prompt-based generation (YAML)
   * else {
   *   const userPrompt = `${item.prompt}`;
   * }
   */
  sourceText?: string;

  /**
   * Optional extracted concepts for concept-based content generation.
   *
   * When present, AI handlers should use concepts as PRIMARY content source
   * for vocabulary cards, quizzes, and other learning activities.
   *
   * This enables the 3-tier fallback pattern:
   * 1. Use concepts if available (BEST - structured, reviewed concepts)
   * 2. Use sourceText if provided (GOOD - source-based generation)
   * 3. Use prompt alone (OK - prompt-based generation)
   *
   * Populated by:
   * - Smart Import Step 3 (Phase 6A): Extracted concepts from reviewed text
   * - YAML with concepts field: User-provided concepts
   * - Otherwise: undefined (falls back to sourceText or prompt)
   *
   * @example
   * // Concept-based generation (BEST)
   * if (context.concepts && context.concepts.length > 0) {
   *   // Use concepts directly for flashcards/vocabulary
   *   const cards = context.concepts.map(c => ({ term: c.term, definition: c.definition }));
   * }
   * // Source-based generation (GOOD)
   * else if (context.sourceText) {
   *   const userPrompt = `Based on this text: ${context.sourceText}, create quiz...`;
   * }
   * // Prompt-based generation (OK)
   * else {
   *   const userPrompt = `${item.prompt}`;
   * }
   */
  concepts?: ExtractedConcept[];
}
```

### Stateless Prompt Building

```typescript
// Works for ANY content type, ANY entry point
AIPromptBuilder.buildCompletePrompt(
  "Explain photosynthesis",
  { targetAudience: "grade-6", tone: "educational" }
);
```

No dependency on:
- BookDefinition
- SmartImportRequest
- Content type
- Entry point

### Generator Pattern

Each content type has a dedicated generator:

```typescript
interface ContentGenerator {
  generate(
    sourceText: string,
    config?: AIConfiguration
  ): Promise<H5PContent>;
}

// Examples:
class FlashcardsGenerator implements ContentGenerator { ... }
class DialogCardsGenerator implements ContentGenerator { ... }
class InteractiveBookGenerator implements ContentGenerator { ... }
```

All generators use `AIPromptBuilder` universally.

### Source-Based vs Prompt-Based Generation Examples

**Source-Based Generation (Smart Import - Ensures Learning Integrity):**

```typescript
// Handler implementation for Smart Import
export class AIDragTextHandler implements ContentHandler {
  public async process(context: HandlerContext, item: AIDragTextContent): Promise<void> {
    const { quizGenerator, sourceText } = context;  // sourceText from extraction!

    // Resolve AI config
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      context.chapterConfig,
      context.bookConfig
    );
    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // BUILD USER PROMPT WITH SOURCE TEXT
    const userPrompt = `Based on the following source text, create ${item.sentenceCount || 5} drag-the-words sentences.

SOURCE TEXT:
${sourceText}

Generate sentences that test comprehension of key concepts from the source text above.
Return JSON array: [{ "text": "...", "blanks": [{ "answer": "word" }] }]`;

    const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);
    // Process response...
  }
}
```

**Prompt-Based Generation (Interactive Book - Flexible but May Hallucinate):**

```typescript
// Handler implementation for Interactive Book YAML
export class AIDragTextHandler implements ContentHandler {
  public async process(context: HandlerContext, item: AIDragTextContent): Promise<void> {
    const { quizGenerator } = context;
    // NO sourceText - just user's prompt!

    // Resolve AI config
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      context.chapterConfig,
      context.bookConfig
    );
    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // BUILD USER PROMPT FROM ITEM PROMPT ALONE
    const userPrompt = `${item.prompt}

Generate ${item.sentenceCount || 5} drag-the-words sentences.
Return JSON array: [{ "text": "...", "blanks": [{ "answer": "word" }] }]`;

    const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);
    // Process response...
  }
}
```

**Unified Handler Supporting Both Modes (Phase 6 Goal):**

```typescript
export class AIDragTextHandler implements ContentHandler {
  public async process(context: HandlerContext, item: AIDragTextContent): Promise<void> {
    const { quizGenerator, sourceText } = context;

    // Resolve AI config
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      context.chapterConfig,
      context.bookConfig
    );
    const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

    // CHOOSE MODE BASED ON CONTEXT
    let userPrompt: string;

    if (sourceText) {
      // SOURCE-BASED MODE (Smart Import)
      userPrompt = `Based on the following source text, ${item.prompt}

SOURCE TEXT:
${sourceText}

Generate ${item.sentenceCount || 5} sentences that test comprehension of key concepts from the source.
Return JSON array: [{ "text": "...", "blanks": [{ "answer": "word" }] }]`;
    } else {
      // PROMPT-BASED MODE (Interactive Book YAML)
      userPrompt = `${item.prompt}

Generate ${item.sentenceCount || 5} drag-the-words sentences.
Return JSON array: [{ "text": "...", "blanks": [{ "answer": "word" }] }]`;
    }

    const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);
    // Process response...
  }
}
```

**Key Differences:**

| Aspect | Source-Based (Smart Import) | Prompt-Based (YAML/JSON) |
|--------|----------------------------|--------------------------|
| Input | Extracted source text + prompt | User prompt only |
| Learning Integrity | High (tests actual content) | Variable (may hallucinate) |
| Use Case | Converting existing materials | Creating new content |
| Context Availability | `context.sourceText` present | `context.sourceText` undefined |
| Prompt Pattern | "Based on this text: [source]..." | "Create content about..." |

## See Also

- [API Integration Guide](api-integration.md) - Interactive Book API (Phase 5)
- [Teacher's Guide](teacher-guide-ai-config.md) - Using AI configuration
- [Prompt Engineering Reference](prompt-engineering.md) - How prompts are built
- [YAML Format Reference](yaml-format.md) - Interactive Book YAML format
