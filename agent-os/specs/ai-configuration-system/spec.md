# Specification: AI Configuration System (Phase 5)

## Goal

Eliminate manual formatting instructions from teacher prompts and provide a **universal** AI configuration system that ensures consistent, grade-appropriate content across **all AI-generated H5P content** (Interactive Books, standalone Flashcards, Dialog Cards, Summaries, etc.) through centralized prompt engineering and reading level presets.

## Scope: Universal AI Configuration

This system provides AI configuration for **two primary entry points:**

1. **Interactive Book Entry Point** (YAML/JSON)
   - For creating Interactive Books with AI-generated chapters
   - Configuration via BookDefinition.aiConfig
   - Current focus for Phase 5 implementation

2. **Smart Import Entry Point** (API)
   - For generating ANY H5P content type from source material
   - Matches H5P.com's Smart Import workflow (4-step process)
   - Configuration via generation request payload
   - Foundation established in Phase 5, full implementation in Phase 6

**Key Principle:** AIConfiguration is **universal** - same types, same presets, same prompt builder used regardless of entry point or content type being generated.

## User Stories

**Interactive Book Use Cases:**
- As a teacher, I want to write simple prompts like "Explain photosynthesis" without worrying about formatting rules, so I can focus on content rather than technical details
- As a curriculum designer, I want to specify a reading level for my entire book (e.g., "6th grade") and have all AI-generated content automatically match that level, so students receive age-appropriate material
- As an ESL instructor, I want to customize AI output with specific instructions like "use simple vocabulary" or "include visual examples" without cluttering my content prompts, so I can tailor content to my students' needs

**Smart Import Use Cases:**
- As a teacher, I want to upload a PDF or paste text and have AI automatically generate multiple H5P content types (flashcards, quiz, summary) with consistent reading level and tone
- As a content creator, I want to configure reading level once (e.g., "elementary") and have ALL generated content types match that level, not configure each type separately
- As an administrator, I want the same AI configuration system to work for both Interactive Books and standalone content generation, reducing complexity

## Specific Requirements

### AIConfiguration Type System

- Define `AIConfiguration` interface with optional fields for `targetAudience`, `tone`, `outputStyle`, and `customization`
- Support 8 predefined reading levels: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate
- Support 4 tone options: educational, professional, casual, academic
- Support outputStyle configuration (always defaults to plain-html for H5P compatibility)
- Export types from `types.ts` for frontend consumption via TypeScript and JSON schema
- Make all fields optional with sensible defaults (grade-6, educational, plain-html)
- Ensure backward compatibility with existing YAML files that have no `aiConfig`

### BookDefinition Extension

- Add optional `aiConfig?: AIConfiguration` field to `BookDefinition` interface in `YamlInputParser.ts`
- Support book-level configuration that applies to all AI content in the book
- Allow chapter-level override by adding optional `aiConfig` to `ChapterDefinition`
- Allow item-level override by adding optional `aiConfig` to `AITextContent` and `AIQuizContent` types
- Configuration precedence: item-level > chapter-level > book-level > system defaults
- Validate `aiConfig` structure during YAML parsing with clear error messages
- Document configuration hierarchy in code comments

### AIPromptBuilder Service (Universal)

- Create `AIPromptBuilder` class in `src/ai/AIPromptBuilder.ts` to centralize prompt construction logic for **ALL AI generation**
- Implement `buildSystemPrompt(config?: AIConfiguration): string` method that generates formatting rules and reading level guidance
- Implement `buildCompletePrompt(userPrompt: string, config?: AIConfiguration): string` method that combines system prompt + user prompt + customization
- Define hardcoded reading level presets with vocabulary, sentence structure, and tone guidelines
- Include non-negotiable formatting rules: plain text only, HTML tags only (h2, p, strong, em, ul, li), no markdown, no asterisks
- Ensure formatting rules are NEVER exposed to teachers - always baked into system prompts
- Make prompt builder **completely stateless and universal** - works for Interactive Book handlers AND standalone content generators
- **Critical:** No dependency on BookDefinition or any specific content type - AIConfiguration is the only input

### Reading Level Presets

- **Elementary (grades 1-5)**: Short sentences (8-12 words), basic vocabulary, concrete examples, friendly tone, avoid abstract concepts
- **Grade 6 (ages 11-12)**: Medium sentences (12-15 words), grade-appropriate vocabulary, some technical terms with definitions, clear explanations, relatable examples
- **Grade 9 (ages 14-15)**: Longer sentences (15-20 words), broader vocabulary, technical terms expected, analytical thinking, real-world applications
- **High School (grades 10-12)**: Complex sentences (18-25 words), advanced vocabulary, subject-specific terminology, critical thinking, college preparation
- **College Level**: Academic style, discipline-specific language, assumes background knowledge, analytical depth, research-oriented
- **Professional/Adult**: Industry terminology, assumes expertise, concise and actionable, professional tone, real-world focus
- **ESL Beginner (A1-A2 CEFR)**: Very short sentences (5-8 words), common everyday vocabulary, present tense, simple grammar, explicit context
- **ESL Intermediate (B1-B2 CEFR)**: Medium sentences (10-15 words), expanded vocabulary, varied tenses, idiomatic expressions introduced gradually, cultural context

### Handler Integration

- Update `AITextHandler` to use `AIPromptBuilder` for all content generation
- Extract `aiConfig` from BookDefinition context passed through HandlerContext
- Override with chapter-level or item-level `aiConfig` if present
- Build complete prompt with system rules + user prompt + customization before AI API call
- Update `QuizHandler` to apply reading level to question generation (vocabulary and complexity)
- Ensure all AI output follows consistent formatting rules regardless of handler type
- Log reading level and tone in verbose mode for debugging
- Maintain backward compatibility: if no `aiConfig` present, use grade-6 defaults

### HandlerContext Extension

- Add optional `bookConfig?: AIConfiguration` field to `HandlerContext` interface
- Add optional `chapterConfig?: AIConfiguration` field for chapter-level overrides
- Pass configuration through context from `H5pCompiler` to handlers
- Make configuration accessible to all handlers without coupling them to YamlInputParser
- Document configuration fields in HandlerContext JSDoc comments
- Preserve existing context structure for backward compatibility

### YAML Format Support

- Support book-level `aiConfig` at top level of YAML file alongside title, language, chapters
- Support chapter-level `aiConfig` within chapter definition to override book settings
- Support item-level `aiConfig` within content items (ai-text, ai-quiz) to override all parent settings
- Parse and validate `aiConfig` structure in `YamlInputParser`
- Provide clear YAML validation errors if invalid reading level or tone specified
- Support multiline customization strings using YAML pipe (`|`) syntax
- Maintain full backward compatibility with existing YAML files

### JSON API Format (Interactive Books)

- Accept `aiConfig` in BookDefinition JSON payload for API endpoint
- Validate `aiConfig` structure at API boundary before compilation
- Return clear error messages if invalid reading level or tone specified
- Support same configuration hierarchy as YAML (book > chapter > item)
- Document JSON structure in API reference with examples
- Ensure TypeScript types are shared between frontend and backend

### Smart Import API Pattern (Foundation for Phase 6)

**Phase 5 Scope:** Document the integration pattern for future implementation
**Phase 6 Scope:** Full implementation of Smart Import workflow

**Smart Import 4-Step Workflow (from H5P.com):**
1. **Upload Source** - File/Link/Text + Language + Customization (aiConfig)
2. **Review Text** - AI extracts/transcribes content
3. **Review Concepts** - AI identifies key concepts
4. **Select Content Types** - Generate multiple H5P types from same source

**API Request Structure:**
```typescript
POST /api/smart-import/generate
{
  "source": {
    "type": "text" | "file" | "url",
    "content": string | File | URL
  },
  "language": "en",
  "aiConfig": {  // Same AIConfiguration type - applied universally!
    "targetAudience": "grade-6",
    "tone": "educational",
    "customization": "Focus on visual learners"
  },
  "outputTypes": [
    "flashcards",          // Generate standalone flashcards.h5p
    "dialog-cards",        // Generate standalone dialog-cards.h5p
    "summary",             // Generate standalone summary.h5p
    "interactive-book",    // Generate interactive-book.h5p with selected sub-content
    "course-presentation", // Generate course-presentation.h5p with selected sub-content
    "question-set"         // Generate question-set.h5p with selected sub-content
  ],
  "compositeOptions": {
    // Options for Interactive Book (supports 24 sub-content types)
    "interactive-book": {
      "includeSubContent": [
        "flashcards",      // Embed flashcards in book chapters
        "ai-quiz",         // Embed quizzes in book chapters
        "summary"          // Embed summaries in book chapters
        // NOT including "dialog-cards" - user's choice!
      ],
      "chaptersFromSections": true,  // Auto-create chapters from source sections
      "maxChapters": 10
    },
    // Options for Course Presentation (supports 11 sub-content types)
    "course-presentation": {
      "includeSubContent": [
        "multiple-choice",
        "fill-in-blanks",
        "mark-the-words"
      ],
      "slidesFromSections": true,
      "maxSlides": 20
    },
    // Options for Question Set (supports 8 sub-content types)
    "question-set": {
      "includeSubContent": [
        "multiple-choice",
        "drag-drop",
        "essay"
      ],
      "randomizeQuestions": true,
      "questionsPerSet": 10
    }
    // Phase 6+: interactive-video, branching-scenario, page, virtual-tour-360
  }
}
```

**Response Structure:**
```typescript
{
  "status": "success",
  "packages": [
    {
      "type": "flashcards",
      "filename": "flashcards.h5p",
      "buffer": Buffer,
      "size": 45312
    },
    {
      "type": "dialog-cards",
      "filename": "dialog-cards.h5p",
      "buffer": Buffer,
      "size": 38192
    },
    {
      "type": "summary",
      "filename": "summary.h5p",
      "buffer": Buffer,
      "size": 12483
    },
    {
      "type": "interactive-book",
      "filename": "interactive-book.h5p",
      "buffer": Buffer,
      "size": 123456,
      "metadata": {
        "chapters": 5,
        "includedSubContent": ["flashcards", "ai-quiz", "summary"]
      }
    },
    {
      "type": "course-presentation",
      "filename": "course-presentation.h5p",
      "buffer": Buffer,
      "size": 98765,
      "metadata": {
        "slides": 12,
        "includedSubContent": ["multiple-choice", "fill-in-blanks", "mark-the-words"]
      }
    },
    {
      "type": "question-set",
      "filename": "question-set.h5p",
      "buffer": Buffer,
      "size": 54321,
      "metadata": {
        "questions": 10,
        "includedSubContent": ["multiple-choice", "drag-drop", "essay"]
      }
    }
  ],
  "aiConfig": {
    "targetAudience": "grade-6",
    "tone": "educational"
  }
}
```

**Key Architectural Points:**
- **Same AIConfiguration** used for ALL content types (standalone AND embedded in composite types)
- **Supports 7 H5P Composite Content Types** (each can include sub-content):
  1. **Interactive Book** (24 sub-content types) - Phase 5 focus
  2. **Course Presentation** (11 sub-content types) - Phase 6+
  3. **Interactive Video** (8 sub-content types) - Phase 6+
  4. **Question Set** (8 sub-content types) - Phase 6+
  5. **Page/Column** (25 sub-content types) - Phase 6+
  6. **Branching Scenario** (3 sub-content types) - Phase 6+
  7. **Virtual Tour (360)** (2 sub-content types) - Phase 6+
- **Two-level user control:**
  1. `outputTypes` - Which packages to generate (standalone + composite)
  2. `compositeOptions[type].includeSubContent` - Which content types to embed in each composite type
- User can generate composite types WITHOUT standalone packages
- User can generate standalone packages WITHOUT composite types
- User can generate BOTH simultaneously with fine-grained control
- **Our advantage over H5P.com:** Explicit per-composite-type control vs "include everything" approach
- **Same AIPromptBuilder** service constructs prompts for all generators (standalone AND composite)
- **Same reading level presets** apply across all content types
- Each content type generator uses AIPromptBuilder universally
- Configuration is **not tied to BookDefinition** - it's universal across all entry points

**Example Usage Scenario:**

A teacher uploads a 10-page PDF about "The Solar System" with aiConfig set to "grade-6". They select:
- `outputTypes: ["flashcards", "dialog-cards", "interactive-book"]`
- `includeSubContent: ["flashcards", "ai-quiz"]`

**Smart Import generates from ONE source:**

1. **flashcards.h5p** (standalone) - 8 planet flashcards for review
2. **dialog-cards.h5p** (standalone) - 6 space terminology cards
3. **interactive-book.h5p** (5 chapters):
   - Chapter 1: "Introduction" - AI-generated text
   - Chapter 2: "Inner Planets" - AI-generated text + embedded flashcards + embedded quiz
   - Chapter 3: "Outer Planets" - AI-generated text + embedded flashcards + embedded quiz
   - Chapter 4: "Moons and Asteroids" - AI-generated text + embedded quiz
   - Chapter 5: "Summary" - AI-generated text

**ALL content uses grade-6 reading level** - teacher configured once, applied everywhere!

**TypeScript Interfaces for Smart Import (Phase 5 - Export for Phase 6):**

```typescript
// Export from src/compiler/types.ts

export interface SmartImportRequest {
  source: {
    type: "text" | "file" | "url";
    content: string | File | URL;
  };
  language: string;
  aiConfig?: AIConfiguration;  // Same universal type!
  outputTypes: ContentTypeOption[];
  compositeOptions?: CompositeContentOptions;  // Options for composite types
}

export type ContentTypeOption =
  | "flashcards"
  | "dialog-cards"
  | "summary"
  | "ai-quiz"
  | "interactive-book"
  | "course-presentation"
  | "interactive-video"
  | "question-set"
  | "page"
  | "branching-scenario"
  | "virtual-tour-360"
  | "timeline"
  | "accordion"
  | "image-hotspots"
  | "multiple-choice"
  | "fill-in-blanks"
  | "mark-the-words"
  | "drag-drop"
  | "essay";

export interface CompositeContentOptions {
  "interactive-book"?: InteractiveBookOptions;
  "course-presentation"?: CoursePresentationOptions;
  "interactive-video"?: InteractiveVideoOptions;
  "question-set"?: QuestionSetOptions;
  "page"?: PageOptions;
  "branching-scenario"?: BranchingScenarioOptions;
  "virtual-tour-360"?: VirtualTourOptions;
}

// Interactive Book - 24 sub-content types (Phase 5 focus)
export interface InteractiveBookOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to embed in chapters
  chaptersFromSections?: boolean;           // Auto-create chapters from source sections
  maxChapters?: number;                     // Limit number of chapters
}

// Course Presentation - 11 sub-content types (Phase 6+)
export interface CoursePresentationOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to embed in slides
  slidesFromSections?: boolean;             // Auto-create slides from source sections
  maxSlides?: number;                       // Limit number of slides
}

// Interactive Video - 8 sub-content types (Phase 6+)
export interface InteractiveVideoOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to embed as interactions
  videoSource?: string | File;              // Video file or URL
  interactionsFromTimestamps?: boolean;     // Auto-place interactions at section timestamps
}

// Question Set - 8 sub-content types (Phase 6+)
export interface QuestionSetOptions {
  includeSubContent?: ContentTypeOption[];  // Which question types to include
  randomizeQuestions?: boolean;             // Randomize question order
  questionsPerSet?: number;                 // Number of questions to generate
}

// Page (Column) - 25 sub-content types (Phase 6+)
export interface PageOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to include in single-page layout
  sectionsFromHeadings?: boolean;           // Create sections from source headings
}

// Branching Scenario - 3 sub-content types (Phase 6+)
export interface BranchingScenarioOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to use in branches (limited to 3)
  branchesFromChoices?: boolean;            // Auto-create branches from source decision points
}

// Virtual Tour (360) - 2 sub-content types (Phase 6+)
export interface VirtualTourOptions {
  includeSubContent?: ContentTypeOption[];  // Which types to embed in 360 scenes (limited to 2)
  scenes360Source?: (string | File)[];      // Array of 360 images/videos
}

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
    chapters?: number;                          // Interactive Book
    slides?: number;                            // Course Presentation
    questions?: number;                         // Question Set
    scenes?: number;                            // Virtual Tour (360)
    branches?: number;                          // Branching Scenario
    duration?: number;                          // Interactive Video (seconds)
    sections?: number;                          // Page

    // Universal:
    includedSubContent?: ContentTypeOption[];  // Which sub-content types are embedded
    itemCount?: number;                        // Total items (for standalone types)
  };
}
```

**Phase 5 Deliverables:**
- Document Smart Import integration pattern with request/response examples for all 7 composite types
- Ensure AIPromptBuilder works for ANY content type (standalone AND composite)
- Export ALL Smart Import types for Phase 6 implementation:
  - `SmartImportRequest`
  - `SmartImportResponse`
  - `CompositeContentOptions`
  - `InteractiveBookOptions` (Phase 5 focus)
  - `CoursePresentationOptions` (Phase 6+)
  - `InteractiveVideoOptions` (Phase 6+)
  - `QuestionSetOptions` (Phase 6+)
  - `PageOptions` (Phase 6+)
  - `BranchingScenarioOptions` (Phase 6+)
  - `VirtualTourOptions` (Phase 6+)
  - `GeneratedPackage`
  - `ContentTypeOption`
- Document type usage in smart-import-api.md with examples for each composite type
- Note: Phase 5 implements Interactive Book, Phase 6+ implements other composite types

## Visual Design

No visual mockups provided for this specification. Frontend UI components will be designed separately based on H5P.com Smart Import pattern (dropdown for reading level, dropdown for tone, textarea for customization).

## Existing Code to Leverage

### AITextHandler Current Implementation

- Located at `src/handlers/core/AITextHandler.ts` (lines 23-71)
- Already supports Gemini and Claude API integration with environment variable detection
- Uses `item.prompt` directly passed to AI model without system prompt
- Extends this by calling `AIPromptBuilder.buildCompletePrompt(item.prompt, resolvedConfig)` before API call
- Preserve error handling and fallback content logic
- Maintain verbose logging pattern with reading level information added

### QuizHandler Current Implementation

- Located at `src/handlers/ai/QuizHandler.ts` (lines 23-49)
- Uses `QuizGenerator.generateH5pQuiz()` for question generation
- Extend `QuizGenerator.generateQuiz()` to accept optional `AIConfiguration` parameter
- Modify prompt template in QuizGenerator (lines 69-91) to include reading level guidance
- Apply vocabulary and question complexity based on target audience
- Preserve existing error handling and fallback text page logic

### QuizGenerator Prompt Template

- Located at `src/ai/QuizGenerator.ts` (lines 69-91)
- Current prompt includes formatting requirements but no reading level guidance
- Extend prompt template to accept reading level parameter
- Add vocabulary complexity, question structure, and distractor difficulty based on reading level
- Maintain JSON response format requirement for parsing consistency
- Keep existing validation and error handling logic

### YamlInputParser Type Definitions

- Located at `src/compiler/YamlInputParser.ts` (lines 1-123)
- Already defines `BookDefinition`, `ChapterDefinition`, `AITextContent`, `AIQuizContent` interfaces
- Extend these interfaces with optional `aiConfig?: AIConfiguration` field
- Maintain existing validation logic in `validateBookDefinition()` and `validateContentItem()` methods
- Add validation for `aiConfig` structure if present
- Preserve path resolution and YAML parsing logic

### HandlerContext Interface

- Located at `src/handlers/HandlerContext.ts` (lines 23-74)
- Provides shared utilities to all handlers (chapterBuilder, libraryRegistry, quizGenerator, logger, mediaFiles, basePath, options)
- Extend with `bookConfig` and `chapterConfig` fields for configuration cascade
- Maintain existing structure for backward compatibility
- Document new fields with JSDoc comments

### H5pCompiler Context Creation

- Located at `src/compiler/H5pCompiler.ts` (lines 170-192)
- Creates HandlerContext in `createContext()` private method
- Extract `aiConfig` from BookDefinition and pass through context
- Extract chapter `aiConfig` if present and pass as override
- Preserve existing context fields (verbose, aiProvider, basePath)
- Maintain same context creation pattern

## Out of Scope

**Deferred to Phase 6 (Smart Import Implementation):**
- Full Smart Import API endpoint implementation
- Source content extraction/transcription services
- Concept identification and key term extraction
- Multi-content-type generation from single source
- Standalone content generators (FlashcardsGenerator, SummaryGenerator, etc.)

**Out of Scope Entirely:**
- AI model fine-tuning or custom model training (use prompt engineering only)
- Custom reading level creation beyond 8 predefined options
- Language-specific prompt templates (English only, use existing `language` field for output language)
- Content quality scoring or automated assessment
- Multi-turn AI conversations or iterative content refinement
- Real-time preview of AI output in UI
- A/B testing different prompt strategies
- Cost optimization or AI provider switching based on content type
- Caching of AI-generated content (each generation is fresh)
- User-created formatting rule customization (system-managed only)

## Architecture Overview

### Configuration Hierarchy

```
System Defaults (grade-6, educational, plain-html)
  ↓ (override)
Book-Level aiConfig (in BookDefinition)
  ↓ (override)
Chapter-Level aiConfig (in ChapterDefinition)
  ↓ (override)
Item-Level aiConfig (in AITextContent or AIQuizContent)
```

### Prompt Construction Flow

```
User writes YAML:
  chapters:
    - content:
        - type: ai-text
          prompt: "Explain photosynthesis"

        ↓

AIPromptBuilder.buildCompletePrompt(prompt, config):
  1. Generate system prompt with formatting rules
  2. Add reading level guidance (vocabulary, sentences)
  3. Append user's content prompt
  4. Append customization text if provided

        ↓

Complete Prompt sent to AI:
  "You are an educational content generator. Output plain HTML only using <p>, <h2>, <strong>, <em> tags.
   No markdown. No asterisks. Write for 6th grade reading level using 12-15 word sentences with
   grade-appropriate vocabulary. Define technical terms.

   Explain photosynthesis"

        ↓

AI generates formatted, grade-appropriate content
```

### Component Integration

```
YamlInputParser
  ├─> Parses aiConfig from YAML
  └─> Validates reading level/tone values

H5pCompiler
  ├─> Extracts book/chapter aiConfig
  ├─> Passes through HandlerContext
  └─> Processes items with handlers

AITextHandler / QuizHandler
  ├─> Receives context with aiConfig
  ├─> Resolves configuration hierarchy
  ├─> Calls AIPromptBuilder.buildCompletePrompt()
  └─> Sends complete prompt to AI provider

AIPromptBuilder
  ├─> Loads reading level preset
  ├─> Generates system prompt with rules
  └─> Combines prompt sections
```

## Technical Design

### TypeScript Interfaces

**File: `src/compiler/types.ts`**

```typescript
/**
 * Reading level targeting for AI-generated content.
 * Each level defines vocabulary complexity, sentence structure, and tone.
 */
export type ReadingLevel =
  | "elementary"       // Grades 1-5
  | "grade-6"          // Ages 11-12 (DEFAULT)
  | "grade-9"          // Ages 14-15
  | "high-school"      // Grades 10-12
  | "college"          // Undergraduate level
  | "professional"     // Industry/adult learners
  | "esl-beginner"     // A1-A2 CEFR
  | "esl-intermediate"; // B1-B2 CEFR

/**
 * Tone of AI-generated content
 */
export type Tone =
  | "educational"   // DEFAULT - Clear, instructional, approachable
  | "professional"  // Formal, business-like, concise
  | "casual"        // Conversational, friendly, relatable
  | "academic";     // Scholarly, research-oriented, precise

/**
 * Output formatting style.
 * NOTE: H5P requires plain-html, other options reserved for future use.
 */
export type OutputStyle =
  | "plain-html"    // DEFAULT - HTML tags only (p, h2, strong, em, ul, li)
  | "rich-html"     // Reserved for future
  | "markdown";     // Reserved for future

/**
 * AI configuration for content generation.
 * Can be specified at book, chapter, or item level with cascading overrides.
 */
export interface AIConfiguration {
  /**
   * Target reading level for vocabulary and sentence complexity.
   * Defaults to "grade-6" if not specified.
   */
  targetAudience?: ReadingLevel;

  /**
   * Tone and style of generated content.
   * Defaults to "educational" if not specified.
   */
  tone?: Tone;

  /**
   * Output formatting style.
   * Defaults to "plain-html" (required for H5P).
   * Other options reserved for future use.
   */
  outputStyle?: OutputStyle;

  /**
   * Free-text customization instructions appended to system prompt.
   * Examples: "Focus on visual learners", "Include real-world examples",
   * "Use analogies to explain complex concepts"
   */
  customization?: string;
}
```

**File: `src/compiler/YamlInputParser.ts` (Extensions)**

```typescript
/**
 * Complete book definition from YAML
 */
export interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  aiConfig?: AIConfiguration;  // NEW: Book-level AI configuration
  chapters: ChapterDefinition[];
}

/**
 * Chapter definition from YAML
 */
export interface ChapterDefinition {
  title: string;
  aiConfig?: AIConfiguration;  // NEW: Chapter-level AI configuration override
  content: AnyContentItem[];
}

/**
 * AI-generated text content
 */
export interface AITextContent extends ContentItem {
  type: "ai-text";
  prompt: string;
  title?: string;
  aiConfig?: AIConfiguration;  // NEW: Item-level AI configuration override
}

/**
 * AI-generated quiz content
 */
export interface AIQuizContent extends ContentItem {
  type: "ai-quiz";
  sourceText: string;
  questionCount?: number;
  title?: string;
  aiConfig?: AIConfiguration;  // NEW: Item-level AI configuration override
}
```

**File: `src/handlers/HandlerContext.ts` (Extensions)**

```typescript
/**
 * HandlerContext provides shared utilities and dependencies to content handlers.
 */
export interface HandlerContext {
  chapterBuilder: ChapterBuilder;
  libraryRegistry: LibraryRegistry;
  quizGenerator: QuizGenerator;
  logger: Logger;
  mediaFiles: MediaFile[];
  basePath: string;

  /**
   * Configuration options for content processing
   */
  options: {
    verbose?: boolean;
    aiProvider?: "gemini" | "claude" | "auto";
  };

  /**
   * Book-level AI configuration (if specified in BookDefinition).
   * Provides default configuration for all AI content in the book.
   * NEW in Phase 5
   */
  bookConfig?: AIConfiguration;

  /**
   * Chapter-level AI configuration (if specified in ChapterDefinition).
   * Overrides book-level configuration for this chapter's content.
   * NEW in Phase 5
   */
  chapterConfig?: AIConfiguration;
}
```

### AIPromptBuilder Implementation

**File: `src/ai/AIPromptBuilder.ts`**

```typescript
import { AIConfiguration, ReadingLevel, Tone } from "../compiler/types";

/**
 * Reading level preset configuration
 */
interface ReadingLevelPreset {
  sentenceLength: string;
  vocabulary: string;
  style: string;
  examples: string;
}

/**
 * AIPromptBuilder constructs complete prompts for AI content generation.
 * Centralizes formatting rules, reading level guidance, and prompt composition.
 *
 * Teachers write simple content prompts. This class adds all technical requirements.
 */
export class AIPromptBuilder {
  /**
   * Reading level presets with vocabulary and structure guidelines
   */
  private static readonly READING_LEVELS: Record<ReadingLevel, ReadingLevelPreset> = {
    "elementary": {
      sentenceLength: "Use very short sentences (8-12 words). Avoid complex sentence structures.",
      vocabulary: "Use simple, everyday vocabulary. Avoid technical terms. If a technical term is necessary, explain it in very simple words.",
      style: "Use a friendly, encouraging tone. Break concepts into very small steps.",
      examples: "Use concrete, tangible examples from everyday life. Avoid abstract concepts."
    },
    "grade-6": {
      sentenceLength: "Use medium-length sentences (12-15 words). Keep structure clear and direct.",
      vocabulary: "Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.",
      style: "Use a clear, instructional tone. Make concepts relatable to students' lives.",
      examples: "Use relatable examples from school, home, and popular culture. Include analogies when helpful."
    },
    "grade-9": {
      sentenceLength: "Use longer sentences (15-20 words) with some complexity. Vary sentence structure for engagement.",
      vocabulary: "Use broader vocabulary. Introduce technical terms with brief definitions. Expect increasing subject knowledge.",
      style: "Use an engaging, analytical tone. Encourage critical thinking.",
      examples: "Use real-world applications and current events. Connect to broader themes."
    },
    "high-school": {
      sentenceLength: "Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.",
      vocabulary: "Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.",
      style: "Use a sophisticated, academic tone. Promote analysis and evaluation.",
      examples: "Use college-level examples, research references, and interdisciplinary connections."
    },
    "college": {
      sentenceLength: "Use academic sentence structures of varying complexity. Expect comprehension of dense text.",
      vocabulary: "Use discipline-specific language freely. Assume foundational knowledge in the subject area.",
      style: "Use a scholarly, precise tone. Encourage synthesis and original thought.",
      examples: "Reference research, theories, and debates in the field. Assume intellectual maturity."
    },
    "professional": {
      sentenceLength: "Use concise, efficient sentences. Get to the point quickly.",
      vocabulary: "Use industry-standard terminology. Assume professional expertise.",
      style: "Use a professional, actionable tone. Focus on practical application.",
      examples: "Use industry case studies, best practices, and real-world scenarios. Emphasize ROI and outcomes."
    },
    "esl-beginner": {
      sentenceLength: "Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.",
      vocabulary: "Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.",
      style: "Use a patient, supportive tone. Repeat key concepts. Use explicit context.",
      examples: "Use universal concepts (food, family, weather, time). Avoid culturally specific references."
    },
    "esl-intermediate": {
      sentenceLength: "Use medium sentences (10-15 words). Introduce varied sentence patterns gradually.",
      vocabulary: "Expand vocabulary to everyday situations. Introduce common idioms with explanations. Use multiple tenses.",
      style: "Use a clear, encouraging tone. Build confidence with scaffolded complexity.",
      examples: "Include cultural context when introducing idioms. Use travel, work, and education scenarios."
    }
  };

  /**
   * Tone presets for content style
   */
  private static readonly TONES: Record<Tone, string> = {
    "educational": "Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.",
    "professional": "Use a formal, business-like tone. Be concise and action-oriented. Focus on practical outcomes.",
    "casual": "Use a conversational, friendly tone. Write as if talking to a peer. Be relatable and warm.",
    "academic": "Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence."
  };

  /**
   * Non-negotiable formatting rules for H5P compatibility.
   * These rules are NEVER exposed to teachers - always baked into system prompts.
   */
  private static readonly FORMATTING_RULES = `
CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
- Use ONLY plain HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
- Wrap all paragraphs in <p> tags
- Use <h2> for section headings only (not <h1> or <h3>)
- Use <strong> for emphasis, <em> for italics
- Use <ul> and <li> for lists
- DO NOT use markdown formatting (no **, no *, no #, no -)
- DO NOT use special characters for formatting
- DO NOT use code blocks or syntax highlighting
- Separate paragraphs with blank lines for readability
- Output valid, clean HTML that renders correctly in H5P Interactive Books
`.trim();

  /**
   * Builds a system prompt with formatting rules and reading level guidance.
   * This prompt is prepended to the user's content prompt.
   *
   * @param config AI configuration (reading level, tone, etc.)
   * @returns Complete system prompt with all technical requirements
   */
  public static buildSystemPrompt(config?: AIConfiguration): string {
    const targetAudience = config?.targetAudience || "grade-6";
    const tone = config?.tone || "educational";
    const readingLevel = this.READING_LEVELS[targetAudience];
    const toneGuidance = this.TONES[tone];

    const systemPrompt = `
You are an expert educational content generator creating content for H5P Interactive Books.

${this.FORMATTING_RULES}

READING LEVEL: ${targetAudience.toUpperCase()}
${readingLevel.sentenceLength}
${readingLevel.vocabulary}
${readingLevel.style}
${readingLevel.examples}

TONE: ${tone.toUpperCase()}
${toneGuidance}
`.trim();

    return systemPrompt;
  }

  /**
   * Builds a complete prompt ready for AI API call.
   * Combines: system prompt + user's content prompt + customization (if provided)
   *
   * @param userPrompt The teacher's content prompt (e.g., "Explain photosynthesis")
   * @param config AI configuration for reading level and tone
   * @returns Complete prompt ready for Gemini or Claude API
   */
  public static buildCompletePrompt(
    userPrompt: string,
    config?: AIConfiguration
  ): string {
    const systemPrompt = this.buildSystemPrompt(config);
    const customization = config?.customization?.trim();

    let completePrompt = systemPrompt;
    completePrompt += "\n\n---\n\n";
    completePrompt += userPrompt;

    if (customization) {
      completePrompt += "\n\n";
      completePrompt += `ADDITIONAL CUSTOMIZATION:\n${customization}`;
    }

    return completePrompt;
  }

  /**
   * Resolves configuration hierarchy: item > chapter > book > defaults.
   *
   * @param itemConfig Item-level configuration (highest priority)
   * @param chapterConfig Chapter-level configuration
   * @param bookConfig Book-level configuration
   * @returns Resolved configuration with all fields populated
   */
  public static resolveConfig(
    itemConfig?: AIConfiguration,
    chapterConfig?: AIConfiguration,
    bookConfig?: AIConfiguration
  ): AIConfiguration {
    return {
      targetAudience:
        itemConfig?.targetAudience ||
        chapterConfig?.targetAudience ||
        bookConfig?.targetAudience ||
        "grade-6",
      tone:
        itemConfig?.tone ||
        chapterConfig?.tone ||
        bookConfig?.tone ||
        "educational",
      outputStyle:
        itemConfig?.outputStyle ||
        chapterConfig?.outputStyle ||
        bookConfig?.outputStyle ||
        "plain-html",
      customization:
        itemConfig?.customization ||
        chapterConfig?.customization ||
        bookConfig?.customization ||
        undefined
    };
  }
}
```

### Updated AITextHandler

**File: `src/handlers/core/AITextHandler.ts` (Modified)**

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AITextContent } from "../../compiler/YamlInputParser";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

export class AITextHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-text";
  }

  public async process(context: HandlerContext, item: AITextContent): Promise<void> {
    const { chapterBuilder, logger, options, bookConfig, chapterConfig } = context;

    // Resolve configuration hierarchy
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      chapterConfig,
      bookConfig
    );

    if (options.verbose) {
      logger.log(`    - Generating AI text: "${item.title || 'Untitled'}"`);
      logger.log(`      Reading level: ${resolvedConfig.targetAudience}`);
      logger.log(`      Tone: ${resolvedConfig.tone}`);
      logger.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);
    }

    try {
      // Build complete prompt with system instructions
      const completePrompt = AIPromptBuilder.buildCompletePrompt(
        item.prompt,
        resolvedConfig
      );

      let generatedText = "";

      // Use Gemini if available, otherwise Claude
      if (process.env.GOOGLE_API_KEY) {
        if (options.verbose) logger.log(`      Using Gemini 2.5 Flash`);
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(completePrompt);
        generatedText = result.response.text();
      } else if (process.env.ANTHROPIC_API_KEY) {
        if (options.verbose) logger.log(`      Using Claude Sonnet 4`);
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: completePrompt
          }]
        });
        generatedText = response.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("");
      } else {
        throw new Error("No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY");
      }

      chapterBuilder.addTextPage(item.title || "AI-Generated Content", generatedText);
      if (options.verbose) logger.log(`      Generated ${generatedText.length} characters`);
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);
      chapterBuilder.addTextPage(
        item.title || "Content",
        `AI text generation failed. Please check your API key configuration.\n\nPrompt was: ${item.prompt}`
      );
    }
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return { valid: false, error: "AI-text content must have a 'prompt' field (string)" };
    }

    // Validate aiConfig if present
    if (item.aiConfig) {
      const validLevels = ["elementary", "grade-6", "grade-9", "high-school", "college", "professional", "esl-beginner", "esl-intermediate"];
      const validTones = ["educational", "professional", "casual", "academic"];

      if (item.aiConfig.targetAudience && !validLevels.includes(item.aiConfig.targetAudience)) {
        return { valid: false, error: `Invalid targetAudience: ${item.aiConfig.targetAudience}. Valid options: ${validLevels.join(", ")}` };
      }

      if (item.aiConfig.tone && !validTones.includes(item.aiConfig.tone)) {
        return { valid: false, error: `Invalid tone: ${item.aiConfig.tone}. Valid options: ${validTones.join(", ")}` };
      }
    }

    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.AdvancedText"];
  }
}
```

### Updated QuizHandler

**File: `src/handlers/ai/QuizHandler.ts` (Modified)**

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIQuizContent } from "../../compiler/YamlInputParser";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

export class QuizHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-quiz";
  }

  public async process(context: HandlerContext, item: AIQuizContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options, bookConfig, chapterConfig } = context;

    // Resolve configuration hierarchy
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      chapterConfig,
      bookConfig
    );

    if (options.verbose) {
      logger.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
      logger.log(`      Reading level: ${resolvedConfig.targetAudience}`);
      logger.log(`      Source text length: ${item.sourceText.length} characters`);
      logger.log(`      Questions: ${item.questionCount || 5}`);
    }

    try {
      // Generate quiz with reading level configuration
      const quizContent = await quizGenerator.generateH5pQuiz(
        item.sourceText,
        item.questionCount || 5,
        resolvedConfig  // NEW: Pass configuration to quiz generator
      );
      chapterBuilder.addQuizPage(quizContent);

      if (options.verbose) {
        logger.log(`      Generated ${quizContent.length} questions`);
      }
    } catch (error) {
      logger.warn(`      AI quiz generation failed: ${error}`);
      chapterBuilder.addTextPage(
        item.title || "Quiz",
        `Quiz generation failed. Please ensure your AI API key is valid.\n\nError: ${error}`
      );
    }
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.sourceText || typeof item.sourceText !== "string") {
      return { valid: false, error: "AI quiz content must have a 'sourceText' field (string)" };
    }

    // Validate aiConfig if present (same as AITextHandler)
    if (item.aiConfig) {
      const validLevels = ["elementary", "grade-6", "grade-9", "high-school", "college", "professional", "esl-beginner", "esl-intermediate"];
      const validTones = ["educational", "professional", "casual", "academic"];

      if (item.aiConfig.targetAudience && !validLevels.includes(item.aiConfig.targetAudience)) {
        return { valid: false, error: `Invalid targetAudience: ${item.aiConfig.targetAudience}. Valid options: ${validLevels.join(", ")}` };
      }

      if (item.aiConfig.tone && !validTones.includes(item.aiConfig.tone)) {
        return { valid: false, error: `Invalid tone: ${item.aiConfig.tone}. Valid options: ${validTones.join(", ")}` };
      }
    }

    return { valid: true };
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.MultiChoice"];
  }
}
```

### Updated QuizGenerator

**File: `src/ai/QuizGenerator.ts` (Modified generateQuiz method)**

```typescript
// Add import at top
import { AIConfiguration } from "../compiler/types";
import { AIPromptBuilder } from "./AIPromptBuilder";

// Modify generateQuiz method signature and implementation
public async generateQuiz(
  sourceText: string,
  questionCount: number = 5,
  config?: AIConfiguration  // NEW: Optional AI configuration
): Promise<QuizContent> {
  try {
    // Build reading-level-aware prompt
    const readingLevel = config?.targetAudience || "grade-6";
    const basePrompt = `Generate ${questionCount} multiple-choice quiz questions about this educational text:

${sourceText}

Requirements:
- Each question should have 4 answer options
- Only one answer should be correct
- Questions should test understanding, not just recall
- Answers should be clear and unambiguous
- Include common misconceptions as incorrect answers
- Match the vocabulary and complexity to ${readingLevel} reading level
${this.getReadingLevelQuizGuidance(readingLevel)}

Return ONLY a JSON array with this exact format (no additional text):
[
  {
    "question": "What is the main concept?",
    "answers": [
      { "text": "Correct answer", "correct": true },
      { "text": "Incorrect answer 1", "correct": false },
      { "text": "Incorrect answer 2", "correct": false },
      { "text": "Incorrect answer 3", "correct": false }
    ]
  }
]`;

    // Use AIPromptBuilder for consistent formatting if customization provided
    const prompt = config?.customization
      ? AIPromptBuilder.buildCompletePrompt(basePrompt, config)
      : basePrompt;

    let responseText: string;

    if (this.provider === "anthropic" && this.anthropic) {
      const message = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }]
      });
      responseText = message.content
        .filter((block) => block.type === "text")
        .map((block) => (block as any).text)
        .join("");
    } else if (this.provider === "google" && this.gemini) {
      const model = this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      responseText = result.response.text();
    } else {
      throw new Error("No AI provider initialized");
    }

    const questions = this.parseAIResponse(responseText);
    return { questions };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Quiz generation failed: ${error.message}`);
    }
    throw new Error("Quiz generation failed: Unknown error");
  }
}

/**
 * Provides reading-level-specific guidance for quiz question generation.
 * @private
 */
private getReadingLevelQuizGuidance(level: string): string {
  const guidance: Record<string, string> = {
    "elementary": "- Use very simple vocabulary in questions and answers\n- Questions should test basic comprehension only\n- Avoid complex sentence structures in questions",
    "grade-6": "- Use grade-appropriate vocabulary\n- Include some application questions beyond recall\n- Keep questions clear and direct",
    "grade-9": "- Use broader vocabulary and some technical terms\n- Include analysis and application questions\n- Test deeper understanding of concepts",
    "high-school": "- Use advanced vocabulary and subject terminology\n- Focus on analysis, evaluation, and synthesis\n- Test critical thinking skills",
    "college": "- Use discipline-specific language freely\n- Test higher-order thinking and analysis\n- Include questions requiring synthesis of concepts",
    "professional": "- Use industry terminology\n- Focus on practical application and problem-solving\n- Test real-world scenario understanding",
    "esl-beginner": "- Use only common, high-frequency vocabulary\n- Keep questions very simple and direct\n- Avoid idioms and complex grammar",
    "esl-intermediate": "- Use everyday vocabulary with some expansion\n- Include varied sentence patterns\n- Introduce common expressions gradually"
  };

  return guidance[level] || guidance["grade-6"];
}

// Also modify generateH5pQuiz to accept config
public async generateH5pQuiz(
  sourceText: string,
  questionCount: number = 5,
  config?: AIConfiguration  // NEW: Optional AI configuration
): Promise<H5pMultipleChoiceContent[]> {
  const quizContent = await this.generateQuiz(sourceText, questionCount, config);
  return this.toH5pFormat(quizContent.questions);
}
```

### Updated H5pCompiler

**File: `src/compiler/H5pCompiler.ts` (Modified createContext method)**

```typescript
/**
 * Creates a HandlerContext for handler execution
 * @private
 */
private createContext(
  chapterBuilder: any,
  builder: ContentBuilder,
  basePath: string,
  options: CompilerOptions,
  bookConfig?: AIConfiguration,      // NEW parameter
  chapterConfig?: AIConfiguration    // NEW parameter
): HandlerContext {
  return {
    chapterBuilder,
    libraryRegistry: this.libraryRegistry,
    quizGenerator: this.quizGenerator,
    logger: {
      log: console.log,
      warn: console.warn,
      error: console.error
    },
    mediaFiles: builder.getMediaFiles(),
    basePath,
    options: {
      verbose: options.verbose,
      aiProvider: options.aiProvider
    },
    bookConfig,      // NEW: Pass book-level AI config
    chapterConfig    // NEW: Pass chapter-level AI config
  };
}

// Update compile method to extract and pass configs
public async compile(
  bookDef: BookDefinition,
  options: CompilerOptions = {}
): Promise<Buffer> {
  const { verbose = false, basePath = process.cwd() } = options;

  // ... (library fetching code unchanged)

  // Step 2: Build content with handlers
  if (verbose) console.log("Building content...");
  const validator = new SemanticValidator();
  const builder = new ContentBuilder(this.libraryRegistry, validator);

  builder.createBook(bookDef.title, bookDef.language);
  if (verbose) {
    console.log(`  - Created book: "${bookDef.title}"`);
    if (bookDef.aiConfig) {
      console.log(`  - Book-level AI config: ${bookDef.aiConfig.targetAudience || 'grade-6'}, ${bookDef.aiConfig.tone || 'educational'}`);
    }
  }

  // Process each chapter
  for (let i = 0; i < bookDef.chapters.length; i++) {
    const chapter = bookDef.chapters[i];
    if (verbose) console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

    const chapterBuilder = builder.addChapter(chapter.title);

    // Create handler context with book and chapter configs
    const context = this.createContext(
      chapterBuilder,
      builder,
      basePath,
      options,
      bookDef.aiConfig,     // NEW: Pass book config
      chapter.aiConfig      // NEW: Pass chapter config
    );

    // Process each content item
    for (const item of chapter.content) {
      await this.processItem(item, context, verbose);
    }
  }

  // ... (assembly code unchanged)
}
```

## YAML Format Examples

### Book-Level Configuration

```yaml
title: "Biology Fundamentals"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: |
    Focus on visual learners. Use analogies to explain complex concepts.
    Include real-world examples from nature that students can observe.

chapters:
  - title: "Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain the process of photosynthesis"
        title: "What is Photosynthesis?"

      - type: ai-quiz
        sourceText: "Photosynthesis is the process by which plants..."
        questionCount: 5
        title: "Test Your Knowledge"
```

### Chapter-Level Override

```yaml
title: "Mixed Difficulty Course"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"

chapters:
  - title: "Introduction"
    content:
      - type: ai-text
        prompt: "Introduce quantum physics to beginners"

  - title: "Advanced Topics"
    aiConfig:
      targetAudience: "college"  # Override for this chapter only
      tone: "academic"
    content:
      - type: ai-text
        prompt: "Explain quantum entanglement and Bell's theorem"

      - type: ai-quiz
        sourceText: "Quantum entanglement involves..."
        questionCount: 10
```

### Item-Level Override

```yaml
title: "ESL Science Course"
language: "en"
aiConfig:
  targetAudience: "esl-intermediate"
  tone: "educational"

chapters:
  - title: "The Water Cycle"
    content:
      - type: ai-text
        aiConfig:
          targetAudience: "esl-beginner"  # Simpler for intro
        prompt: "Explain what the water cycle is"
        title: "Introduction"

      - type: ai-text
        prompt: "Explain the stages of the water cycle in detail"
        title: "The Process"  # Uses chapter default: esl-intermediate

      - type: ai-quiz
        aiConfig:
          targetAudience: "esl-beginner"  # Simpler quiz
          customization: "Use only present tense. Avoid idioms."
        sourceText: "The water cycle includes evaporation, condensation, precipitation..."
        questionCount: 3
```

### Customization Field Usage

```yaml
title: "Advanced Biology"
language: "en"
aiConfig:
  targetAudience: "high-school"
  tone: "educational"
  customization: |
    TEACHING APPROACH:
    - Emphasize visual learning with descriptions students can visualize
    - Use medical and health-related examples to maintain relevance
    - Connect concepts to AP Biology curriculum
    - Include mnemonics where helpful for memorization

    SPECIAL FOCUS:
    - Prepare students for standardized testing
    - Use Socratic questioning to promote critical thinking

chapters:
  - title: "Cell Biology"
    content:
      - type: ai-text
        prompt: "Explain the structure and function of mitochondria"
```

## JSON API Format

### API Request Example

```json
{
  "bookDefinition": {
    "title": "Science Fundamentals",
    "language": "en",
    "aiConfig": {
      "targetAudience": "grade-6",
      "tone": "educational",
      "customization": "Focus on hands-on experiments students can try at home"
    },
    "chapters": [
      {
        "title": "Forces and Motion",
        "content": [
          {
            "type": "ai-text",
            "prompt": "Explain Newton's First Law of Motion",
            "title": "Inertia"
          },
          {
            "type": "ai-quiz",
            "sourceText": "Newton's First Law states that an object at rest stays at rest...",
            "questionCount": 5,
            "title": "Quiz"
          }
        ]
      }
    ]
  },
  "options": {
    "verbose": true,
    "aiProvider": "auto"
  }
}
```

### API Response (Success)

```
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="Science Fundamentals.h5p"

[Binary .h5p file data]
```

### API Response (Error - Invalid Reading Level)

```json
{
  "error": "Validation failed",
  "details": [
    "Invalid targetAudience: 'advanced'. Valid options: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate"
  ]
}
```

## Prompt Engineering Details

### System Prompt Structure

Every AI request includes a system prompt with three sections:

1. **Formatting Rules** (non-negotiable, never visible to teachers)
   - HTML tag requirements
   - Markdown prohibition
   - H5P compatibility rules

2. **Reading Level Guidance** (based on targetAudience)
   - Sentence length specifications
   - Vocabulary complexity guidance
   - Style and tone requirements
   - Example type expectations

3. **Tone Application** (based on tone parameter)
   - Educational: instructional, step-by-step
   - Professional: concise, action-oriented
   - Casual: conversational, relatable
   - Academic: scholarly, evidence-based

### Example Complete Prompt (Grade 6, Educational)

```
You are an expert educational content generator creating content for H5P Interactive Books.

CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
- Use ONLY plain HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
- Wrap all paragraphs in <p> tags
- Use <h2> for section headings only (not <h1> or <h3>)
- Use <strong> for emphasis, <em> for italics
- Use <ul> and <li> for lists
- DO NOT use markdown formatting (no **, no *, no #, no -)
- DO NOT use special characters for formatting
- DO NOT use code blocks or syntax highlighting
- Separate paragraphs with blank lines for readability
- Output valid, clean HTML that renders correctly in H5P Interactive Books

READING LEVEL: GRADE-6
Use medium-length sentences (12-15 words). Keep structure clear and direct.
Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.
Use a clear, instructional tone. Make concepts relatable to students' lives.
Use relatable examples from school, home, and popular culture. Include analogies when helpful.

TONE: EDUCATIONAL
Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.

---

Explain the process of photosynthesis

ADDITIONAL CUSTOMIZATION:
Focus on visual learners. Use analogies to explain complex concepts.
```

### Example AI Output (Compliant)

```html
<h2>What is Photosynthesis?</h2>

<p>Photosynthesis is the process plants use to make their own food. Think of it like a kitchen inside every leaf, where plants cook up energy using sunlight, water, and air.</p>

<p>Here's how it works in three simple steps:</p>

<ul>
  <li><strong>Step 1: Collecting Ingredients</strong> - Plants take in water through their roots and carbon dioxide (a gas in the air) through tiny holes in their leaves.</li>
  <li><strong>Step 2: Using Sunlight Energy</strong> - Special parts of the leaf called chloroplasts capture sunlight. This energy powers the whole process.</li>
  <li><strong>Step 3: Making Food</strong> - The plant combines water and carbon dioxide using sunlight energy to create glucose (a type of sugar) that feeds the plant.</li>
</ul>

<p>As a bonus, plants release oxygen (the air we breathe) as a byproduct. It's like when you bake cookies and the smell fills your house - oxygen is the pleasant side effect of photosynthesis.</p>
```

## Migration Guide

### For Existing YAML Files

**No changes required!** All existing YAML files work unchanged:

```yaml
# This still works perfectly (uses grade-6 defaults)
title: "My Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain gravity"
```

### For Users Who Want Better AI Output

Add `aiConfig` gradually:

```yaml
# Start with book-level config
title: "My Book"
language: "en"
aiConfig:
  targetAudience: "high-school"  # Just add this!
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain gravity"  # Now gets high-school level content
```

### For Advanced Users

Use full hierarchy:

```yaml
title: "My Book"
language: "en"
aiConfig:
  targetAudience: "grade-9"
  tone: "educational"

chapters:
  - title: "Advanced Chapter"
    aiConfig:
      targetAudience: "college"  # Override for this chapter
    content:
      - type: ai-text
        aiConfig:
          customization: "Include research citations"  # Item-level addition
        prompt: "Explain general relativity"
```

### Cleaning Up Old Prompts

**Before (manual formatting instructions):**
```yaml
- type: ai-text
  prompt: |
    Write about photosynthesis.
    IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold,
    no special characters. Write naturally with proper paragraphs separated by blank lines.
    Use HTML tags like <p> and <h2> only.
```

**After (clean prompt with aiConfig):**
```yaml
- type: ai-text
  prompt: "Explain photosynthesis"
  # System handles formatting automatically!
```

## Testing Strategy

### Unit Tests

**File: `src/ai/AIPromptBuilder.test.ts`**

```typescript
describe("AIPromptBuilder", () => {
  describe("buildSystemPrompt", () => {
    it("should generate default system prompt for grade-6", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt();
      expect(prompt).toContain("READING LEVEL: GRADE-6");
      expect(prompt).toContain("12-15 words");
      expect(prompt).toContain("TONE: EDUCATIONAL");
      expect(prompt).toContain("plain HTML tags");
    });

    it("should generate ESL beginner prompt with simplified language", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        targetAudience: "esl-beginner"
      });
      expect(prompt).toContain("READING LEVEL: ESL-BEGINNER");
      expect(prompt).toContain("5-8 words");
      expect(prompt).toContain("common, high-frequency vocabulary");
    });

    it("should include professional tone guidance", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt({
        tone: "professional"
      });
      expect(prompt).toContain("TONE: PROFESSIONAL");
      expect(prompt).toContain("concise");
      expect(prompt).toContain("action-oriented");
    });

    it("should always include formatting rules", () => {
      const prompt = AIPromptBuilder.buildSystemPrompt();
      expect(prompt).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(prompt).toContain("DO NOT use markdown");
      expect(prompt).toContain("<p>, <h2>, <strong>");
    });
  });

  describe("buildCompletePrompt", () => {
    it("should combine system prompt and user prompt", () => {
      const complete = AIPromptBuilder.buildCompletePrompt("Explain gravity");
      expect(complete).toContain("CRITICAL FORMATTING REQUIREMENTS");
      expect(complete).toContain("Explain gravity");
    });

    it("should append customization when provided", () => {
      const complete = AIPromptBuilder.buildCompletePrompt("Explain gravity", {
        customization: "Include real-world examples"
      });
      expect(complete).toContain("Explain gravity");
      expect(complete).toContain("ADDITIONAL CUSTOMIZATION");
      expect(complete).toContain("Include real-world examples");
    });

    it("should not include customization section when not provided", () => {
      const complete = AIPromptBuilder.buildCompletePrompt("Explain gravity");
      expect(complete).not.toContain("ADDITIONAL CUSTOMIZATION");
    });
  });

  describe("resolveConfig", () => {
    it("should use defaults when no config provided", () => {
      const resolved = AIPromptBuilder.resolveConfig();
      expect(resolved.targetAudience).toBe("grade-6");
      expect(resolved.tone).toBe("educational");
      expect(resolved.outputStyle).toBe("plain-html");
    });

    it("should prioritize item > chapter > book", () => {
      const resolved = AIPromptBuilder.resolveConfig(
        { targetAudience: "college" },  // item
        { targetAudience: "high-school" },  // chapter
        { targetAudience: "grade-6" }  // book
      );
      expect(resolved.targetAudience).toBe("college");
    });

    it("should merge configs correctly", () => {
      const resolved = AIPromptBuilder.resolveConfig(
        { targetAudience: "college" },  // item has only targetAudience
        { tone: "academic" },  // chapter has only tone
        { customization: "Focus on examples" }  // book has only customization
      );
      expect(resolved.targetAudience).toBe("college");
      expect(resolved.tone).toBe("academic");
      expect(resolved.customization).toBe("Focus on examples");
    });
  });
});
```

### Handler Integration Tests

**File: `src/handlers/core/AITextHandler.test.ts`**

```typescript
describe("AITextHandler with AIConfiguration", () => {
  let handler: AITextHandler;
  let mockContext: HandlerContext;

  beforeEach(() => {
    handler = new AITextHandler();
    mockContext = {
      chapterBuilder: { addTextPage: jest.fn() },
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      options: { verbose: true },
      bookConfig: { targetAudience: "grade-6", tone: "educational" },
      chapterConfig: undefined
    } as any;

    // Mock environment variable
    process.env.GOOGLE_API_KEY = "test-key";
  });

  it("should use book-level config when no item config", async () => {
    const item: AITextContent = {
      type: "ai-text",
      prompt: "Explain gravity"
    };

    // Mock AI response
    jest.spyOn(AIPromptBuilder, "buildCompletePrompt");

    await handler.process(mockContext, item);

    expect(AIPromptBuilder.buildCompletePrompt).toHaveBeenCalledWith(
      "Explain gravity",
      expect.objectContaining({
        targetAudience: "grade-6",
        tone: "educational"
      })
    );
  });

  it("should override with item-level config", async () => {
    const item: AITextContent = {
      type: "ai-text",
      prompt: "Explain quantum physics",
      aiConfig: { targetAudience: "college", tone: "academic" }
    };

    jest.spyOn(AIPromptBuilder, "buildCompletePrompt");

    await handler.process(mockContext, item);

    expect(AIPromptBuilder.buildCompletePrompt).toHaveBeenCalledWith(
      "Explain quantum physics",
      expect.objectContaining({
        targetAudience: "college",
        tone: "academic"
      })
    );
  });

  it("should validate aiConfig in item", () => {
    const invalid = handler.validate({
      type: "ai-text",
      prompt: "Test",
      aiConfig: { targetAudience: "invalid-level" }
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain("Invalid targetAudience");
  });

  it("should accept valid aiConfig", () => {
    const valid = handler.validate({
      type: "ai-text",
      prompt: "Test",
      aiConfig: { targetAudience: "college", tone: "academic" }
    });

    expect(valid.valid).toBe(true);
  });
});
```

### End-to-End Tests

**File: `tests/integration/ai-config-e2e.test.ts`**

```typescript
describe("AI Configuration End-to-End", () => {
  it("should generate book with grade-6 defaults", async () => {
    const bookDef: BookDefinition = {
      title: "Test Book",
      language: "en",
      chapters: [{
        title: "Chapter 1",
        content: [{
          type: "ai-text",
          prompt: "Explain photosynthesis"
        }]
      }]
    };

    const compiler = new H5pCompiler(registry, libraryRegistry, quizGenerator);
    const buffer = await compiler.compile(bookDef, { verbose: true });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // Extract and verify content.json
    const zip = await JSZip.loadAsync(buffer);
    const contentJson = await zip.file("content/content.json")?.async("string");
    const content = JSON.parse(contentJson!);

    // Verify AI-generated content exists and is HTML formatted
    expect(content.chapters[0].item.content[0].params.text).toMatch(/<p>/);
    expect(content.chapters[0].item.content[0].params.text).not.toMatch(/\*\*/);
  });

  it("should apply book-level ESL beginner configuration", async () => {
    const bookDef: BookDefinition = {
      title: "ESL Book",
      language: "en",
      aiConfig: {
        targetAudience: "esl-beginner",
        tone: "educational"
      },
      chapters: [{
        title: "Basics",
        content: [{
          type: "ai-text",
          prompt: "Explain weather"
        }]
      }]
    };

    // Mock AI to verify prompt includes ESL guidance
    const mockGenerate = jest.fn().mockResolvedValue({
      response: { text: () => "<p>Weather is the air outside.</p>" }
    });

    // Run compilation and verify ESL-appropriate output
    const compiler = new H5pCompiler(registry, libraryRegistry, quizGenerator);
    const buffer = await compiler.compile(bookDef);

    expect(buffer).toBeInstanceOf(Buffer);
    // Additional assertions on prompt construction would go here
  });

  it("should handle configuration hierarchy correctly", async () => {
    const bookDef: BookDefinition = {
      title: "Mixed Level Book",
      language: "en",
      aiConfig: { targetAudience: "grade-6" },
      chapters: [
        {
          title: "Intro",
          content: [{
            type: "ai-text",
            prompt: "Basic intro"
          }]
        },
        {
          title: "Advanced",
          aiConfig: { targetAudience: "college" },
          content: [
            {
              type: "ai-text",
              prompt: "College level content"
            },
            {
              type: "ai-text",
              aiConfig: { targetAudience: "professional" },
              prompt: "Expert level content"
            }
          ]
        }
      ]
    };

    // Verify each content item uses correct configuration level
    // (implementation would check prompts sent to AI)
  });
});
```

## Documentation Requirements

### YAML Format Reference Update

Add new section to YAML documentation:

**File: `docs/yaml-format.md` (new section)**

```markdown
## AI Configuration

Control how AI-generated content (ai-text and ai-quiz) is created.

### Book-Level Configuration

Apply configuration to all AI content in the book:

```yaml
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Include real-world examples"
```

### Reading Levels

- `elementary` - Grades 1-5
- `grade-6` - Ages 11-12 (DEFAULT)
- `grade-9` - Ages 14-15
- `high-school` - Grades 10-12
- `college` - Undergraduate level
- `professional` - Industry/adult learners
- `esl-beginner` - A1-A2 CEFR
- `esl-intermediate` - B1-B2 CEFR

### Tones

- `educational` - Clear, instructional (DEFAULT)
- `professional` - Formal, business-like
- `casual` - Conversational, friendly
- `academic` - Scholarly, research-oriented

### Customization Field

Free-text instructions for specific requirements:

```yaml
aiConfig:
  customization: |
    Focus on visual learners
    Use analogies to explain concepts
    Include hands-on experiment ideas
```

### Configuration Hierarchy

More specific configurations override general ones:

1. Item-level (highest priority)
2. Chapter-level
3. Book-level
4. System defaults (lowest priority)
```

### API Integration Guide Update

**File: `docs/api-integration.md` (new section)**

```markdown
## AI Configuration in API Requests

Include `aiConfig` in your BookDefinition JSON:

```json
{
  "title": "My Book",
  "language": "en",
  "aiConfig": {
    "targetAudience": "grade-6",
    "tone": "educational",
    "customization": "Focus on practical examples"
  },
  "chapters": [...]
}
```

### TypeScript Types

```typescript
import { BookDefinition, AIConfiguration } from "h5p-cli-creator/types";

const bookDef: BookDefinition = {
  title: "Science Course",
  language: "en",
  aiConfig: {
    targetAudience: "high-school",
    tone: "educational"
  },
  chapters: [...]
};
```

### Validation

Invalid configurations return HTTP 400 with details:

```json
{
  "error": "Validation failed",
  "details": [
    "Invalid targetAudience: 'advanced'. Valid options: elementary, grade-6, ..."
  ]
}
```
```

### Teacher Guide (New Document)

**File: `docs/teacher-guide-ai-config.md`**

```markdown
# Teacher's Guide: AI Configuration

## Quick Start

Want AI to write content at the right level for your students? Just add this to your YAML file:

```yaml
aiConfig:
  targetAudience: "grade-6"  # Change to match your students
```

That's it! All AI-generated content will now match 6th grade reading level.

## Choosing a Reading Level

### For K-12 Students

- **elementary** - Grades 1-5 (very simple sentences, basic vocabulary)
- **grade-6** - Ages 11-12 (standard middle school)
- **grade-9** - Ages 14-15 (high school freshmen/sophomores)
- **high-school** - Grades 10-12 (college prep)

### For English Language Learners

- **esl-beginner** - Just starting English (simple present tense, common words)
- **esl-intermediate** - Building fluency (varied grammar, everyday situations)

### For Adults

- **college** - University students (academic language, assumes background)
- **professional** - Workplace training (industry terms, practical focus)

## Customization Tips

Use the customization field for specific teaching approaches:

```yaml
aiConfig:
  targetAudience: "grade-6"
  customization: |
    Focus on visual learners
    Include examples students can try at home
    Use sports analogies when possible
```

## Common Mistakes to Avoid

Don't include formatting instructions in your prompts anymore!

**OLD WAY (don't do this):**
```yaml
- type: ai-text
  prompt: "Explain gravity. Use simple sentences. No markdown. Use HTML tags."
```

**NEW WAY (do this):**
```yaml
aiConfig:
  targetAudience: "elementary"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain gravity"  # Clean and simple!
```

The system handles all formatting automatically based on your reading level choice.
```

## Implementation Timeline

### Week 1: Core Infrastructure

**Days 1-2: Type System and Interfaces**
- Create `AIConfiguration` interface in `src/compiler/types.ts`
- Extend `BookDefinition`, `ChapterDefinition`, `AITextContent`, `AIQuizContent` with optional `aiConfig` field
- Extend `HandlerContext` with `bookConfig` and `chapterConfig` fields
- Write unit tests for type definitions
- Update exports from `types.ts`

**Days 3-4: AIPromptBuilder Implementation**
- Create `src/ai/AIPromptBuilder.ts` with reading level presets
- Implement `buildSystemPrompt()` with formatting rules and reading level guidance
- Implement `buildCompletePrompt()` for complete prompt assembly
- Implement `resolveConfig()` for configuration hierarchy
- Write comprehensive unit tests for all methods
- Test all 8 reading levels and 4 tones

**Day 5: Documentation and Review**
- Document TypeScript interfaces with JSDoc comments
- Create reading level preset reference document
- Review implementation with stakeholders
- Prepare for handler integration

### Week 2: Handler Integration

**Days 1-2: AITextHandler Update**
- Modify `src/handlers/core/AITextHandler.ts` to use `AIPromptBuilder`
- Implement configuration resolution (item > chapter > book)
- Update process() method to build complete prompts
- Add aiConfig validation to validate() method
- Add verbose logging for reading level and tone
- Write handler-specific unit tests

**Day 3: QuizHandler and QuizGenerator Updates**
- Modify `src/handlers/ai/QuizHandler.ts` to use configuration
- Update `src/ai/QuizGenerator.ts` to accept `AIConfiguration` parameter
- Add reading-level-specific quiz guidance to prompt template
- Implement `getReadingLevelQuizGuidance()` private method
- Update both `generateQuiz()` and `generateH5pQuiz()` signatures
- Write quiz-specific tests

**Day 4: H5pCompiler Integration**
- Modify `src/compiler/H5pCompiler.ts` to extract and pass configs
- Update `createContext()` method signature with bookConfig and chapterConfig
- Modify `compile()` method to extract aiConfig from BookDefinition and chapters
- Add verbose logging for configuration hierarchy
- Maintain backward compatibility

**Day 5: Integration Testing**
- Create end-to-end tests with various configuration hierarchies
- Test all reading levels produce appropriate output
- Verify backward compatibility with existing YAML files
- Test configuration override precedence
- Performance testing with AI API calls

### Week 3: YAML Parsing and Validation

**Days 1-2: YamlInputParser Updates**
- Extend `validateBookDefinition()` to validate aiConfig structure
- Add validation for reading level and tone values
- Provide clear error messages for invalid configurations
- Update `validateContentItem()` for item-level aiConfig
- Preserve path resolution and existing validation logic
- Write YAML parsing tests

**Days 3-4: Comprehensive Testing**
- Test valid and invalid YAML configurations
- Test configuration hierarchy (book > chapter > item)
- Test customization field with multiline strings
- Test validation error messages
- Create test fixtures for all reading levels
- Backward compatibility testing with legacy YAML files

**Day 5: Documentation**
- Update YAML format reference documentation
- Create before/after migration examples
- Document validation error messages
- Create troubleshooting guide
- Write teacher-facing documentation

### Week 4: Frontend Preparation and Polish

**Days 1-2: API Integration**
- Ensure AIConfiguration types are exported for frontend
- Test JSON API with aiConfig in request payload
- Verify validation at API boundary
- Test error responses with clear messages
- Document API request/response formats
- Create Postman/curl examples

**Day 3: JSON Schema Generation**
- Generate JSON schema for AIConfiguration
- Generate JSON schema for BookDefinition with aiConfig
- Provide schema files for frontend validation
- Document schema usage in API guide

**Day 4: Final Testing and Bug Fixes**
- Run full test suite (unit, integration, e2e)
- Fix any discovered issues
- Performance optimization if needed
- Code review and refactoring
- Update changelog

**Day 5: Documentation and Release**
- Finalize all documentation (YAML ref, API guide, teacher guide)
- Create migration guide for existing users
- Update README with AI configuration examples
- Prepare release notes
- Tag version for release

## Success Metrics

### Functional Requirements

- All 8 reading levels produce appropriately-leveled content
- Configuration hierarchy (item > chapter > book > defaults) works correctly
- Backward compatibility: existing YAML files work unchanged with grade-6 defaults
- All AI output follows formatting rules (HTML only, no markdown)
- Customization field appends correctly to system prompts
- Validation provides clear error messages for invalid configurations

### Code Quality

- Test coverage > 80% for new code (AIPromptBuilder, handler updates, validation)
- All TypeScript types exported and documented
- No breaking changes to existing APIs
- Clear JSDoc comments on all public methods
- Consistent code style with existing codebase

### User Experience

- Teachers can write simple prompts without formatting instructions
- Reading level selection is intuitive (8 clear options)
- Customization field provides flexibility for advanced users
- Error messages are actionable and non-technical
- Documentation includes examples for common use cases

### Performance

- No significant performance degradation vs current implementation
- AI API calls remain unchanged in count (one per ai-text/ai-quiz item)
- Prompt building adds negligible overhead (< 1ms per item)
- Package compilation time unchanged

## Future Enhancements (Out of Scope for Phase 5)

- **Multi-language prompt templates**: System prompts in languages other than English
- **Custom reading level creation**: Allow users to define their own reading level presets
- **AI output caching**: Cache generated content to reduce API calls and costs
- **Content quality scoring**: Automated assessment of AI output quality and appropriateness
- **A/B testing framework**: Compare different prompt strategies for effectiveness
- **Real-time preview**: Live preview of AI-generated content in UI before committing
- **Cost optimization**: Automatic provider selection based on content type and cost
- **Advanced customization**: Visual customization builder in frontend UI
- **Reading level auto-detection**: Analyze existing content to suggest appropriate level
- **Accessibility enhancements**: Screen reader optimizations for AI configuration UI
