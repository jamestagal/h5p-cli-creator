# Smart Import API Documentation

## Overview

The Smart Import API provides a powerful workflow for generating multiple H5P content types from a single source (PDF, text, URL) with universal AI configuration. This document establishes the foundation for Smart Import implementation in Phase 6.

**Phase 5 Status:** Architecture documented, types exported, foundation established
**Phase 6 Status:** Full implementation (coming soon)

## Key Concepts

### Two Entry Points for AI Configuration

The h5p-cli-creator system supports two distinct entry points for AI-powered content generation:

1. **Interactive Book Entry Point** (Fully implemented in Phase 5)
   - Input: YAML or JSON BookDefinition
   - Output: Single Interactive Book .h5p package
   - Configuration: Via `BookDefinition.aiConfig`
   - Use case: Creating structured educational books with chapters

2. **Smart Import Entry Point** (Foundation in Phase 5, implementation in Phase 6)
   - Input: Source content (PDF/text/URL) + generation request
   - Output: Multiple .h5p packages of different content types
   - Configuration: Via `SmartImportRequest.aiConfig`
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

Inspired by H5P.com's Smart Import, our implementation provides a 4-step process:

### Step 1: Upload Source

User provides content source and language:

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

### Step 2: Review Text

AI extracts and cleans content:

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

User can edit extracted text before proceeding.

### Step 3: Review Concepts

AI identifies key concepts for content generation:

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

### Step 4: Select Content Types & Generate

User configures AI and selects which content types to generate:

```typescript
POST /api/smart-import/generate
{
  "sourceId": "uuid-1234",
  "sourceText": "...",
  "language": "en",

  // Universal AI configuration (Phase 5 ✅)
  "aiConfig": {
    "targetAudience": "grade-6",
    "tone": "educational",
    "customization": "Focus on visual learners"
  },

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

### Phase 6 (Next)
- [ ] Implement source content extraction (PDF, URL, text)
- [ ] Implement concept identification AI service
- [ ] Implement standalone content generators:
  - [ ] FlashcardsGenerator
  - [ ] DialogCardsGenerator
  - [ ] SummaryGenerator
  - [ ] QuizGenerator (extend existing)
- [ ] Implement composite content generators:
  - [ ] InteractiveBookGenerator (leverage Phase 5 work)
  - [ ] CoursePresentationGenerator
  - [ ] QuestionSetGenerator
- [ ] Implement Smart Import API endpoints:
  - [ ] POST /api/smart-import/upload
  - [ ] GET /api/smart-import/source/:id
  - [ ] POST /api/smart-import/extract-concepts
  - [ ] POST /api/smart-import/generate
- [ ] Create Smart Import UI components
- [ ] Write integration tests

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

## See Also

- [API Integration Guide](api-integration.md) - Interactive Book API (Phase 5)
- [Teacher's Guide](teacher-guide-ai-config.md) - Using AI configuration
- [Prompt Engineering Reference](prompt-engineering.md) - How prompts are built
- [YAML Format Reference](yaml-format.md) - Interactive Book YAML format
