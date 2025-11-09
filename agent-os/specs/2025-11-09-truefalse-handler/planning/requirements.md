# TrueFalse Handler Implementation Requirements

## Overview

Implement handlers for H5P.TrueFalse content type following the "standalone-first" architecture pattern. H5P.TrueFalse is a simple question type that presents a statement and asks users to determine if it's true or false.

## Content Type Analysis

### H5P.TrueFalse-1.8 Structure

**Main Library:** H5P.TrueFalse 1.8

**Dependencies:**
- H5P.Question 1.5 (core question framework)
- H5P.JoubelUI 1.3 (UI components)
- H5P.FontIcons 1.0 (icon font)
- FontAwesome 4.5 (icon font)

**Content Structure:**
```json
{
  "question": "<p>Oslo is the capital of Norway.</p>\n",
  "correct": "true",  // String: "true" or "false"

  "media": {
    "type": {
      "library": "H5P.Image 1.1",  // Optional: H5P.Image, H5P.Video, or H5P.Audio
      "params": { /* image/video/audio params */ },
      "subContentId": "uuid"
    },
    "disableImageZooming": true  // Only for H5P.Image
  },

  "behaviour": {
    "enableRetry": true,
    "enableSolutionsButton": true,
    "enableCheckButton": true,
    "confirmCheckDialog": false,
    "confirmRetryDialog": false,
    "autoCheck": false,
    "feedbackOnCorrect": "",  // Optional custom feedback
    "feedbackOnWrong": ""     // Optional custom feedback
  },

  "l10n": {
    "trueText": "True",
    "falseText": "False",
    "score": "You got @score of @total points",
    "checkAnswer": "Check",
    "submitAnswer": "Submit",
    "showSolutionButton": "Show solution",
    "tryAgain": "Retry",
    "wrongAnswerMessage": "Wrong answer",
    "correctAnswerMessage": "Correct answer",
    "scoreBarLabel": "You got :num out of :total points",
    "a11yCheck": "Check the answers...",
    "a11yShowSolution": "Show the solution...",
    "a11yRetry": "Retry the task..."
  },

  "confirmCheck": {
    "header": "Finish ?",
    "body": "Are you sure you wish to finish ?",
    "cancelLabel": "Cancel",
    "confirmLabel": "Finish"
  },

  "confirmRetry": {
    "header": "Retry ?",
    "body": "Are you sure you wish to retry ?",
    "cancelLabel": "Cancel",
    "confirmLabel": "Confirm"
  }
}
```

**CRITICAL:** The `correct` field is a **STRING** ("true" or "false"), not a boolean.

## Requirements

### 1. Standalone First Architecture

**CRITICAL:** Following the architectural decision from Handler Development Guide, implement standalone handler FIRST before embedded version.

- TrueFalse is a **runnable content type** (can be standalone H5P package)
- Build standalone handler that generates complete .h5p packages
- Then adapt for Interactive Book embedding

### 2. Handler Organization

Following the handler directory structure:

**Embedded Handler:**
- Location: `src/handlers/embedded/TrueFalseHandler.ts`
- Handles: Manual true/false questions in YAML/JSON
- Type: `"truefalse"` or `"true-false"`

**AI Handler:**
- Location: `src/handlers/ai/AITrueFalseHandler.ts`
- Handles: AI-generated true/false questions
- Type: `"ai-truefalse"` or `"ai-true-false"`

### 3. Content Interfaces

#### Manual TrueFalse Content

```typescript
export interface TrueFalseContent {
  type: "truefalse" | "true-false";
  title?: string;

  // The statement to evaluate
  question: string;

  // Is the statement true or false?
  correct: boolean;

  // Optional media above the question
  media?: {
    path: string;           // Path to image/video/audio file
    type?: "image" | "video" | "audio";
    alt?: string;           // For images
    disableZooming?: boolean;  // For images only
  };

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    confirmCheckDialog?: boolean;
    confirmRetryDialog?: boolean;
    autoCheck?: boolean;
    feedbackOnCorrect?: string;
    feedbackOnWrong?: string;
  };

  // Optional UI labels
  labels?: {
    trueText?: string;
    falseText?: string;
    checkAnswer?: string;
    showSolutionButton?: string;
    tryAgain?: string;
    wrongAnswerMessage?: string;
    correctAnswerMessage?: string;
  };
}
```

#### AI-Generated TrueFalse Content

```typescript
export interface AITrueFalseContent {
  type: "ai-truefalse" | "ai-true-false";
  title?: string;
  prompt: string;
  questionCount?: number;              // Default: 5

  // Content structure parameter
  difficulty?: "easy" | "medium" | "hard";

  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}
```

### 4. YAML Examples

#### Manual TrueFalse

```yaml
- type: truefalse
  title: "Capital Cities"
  question: "Oslo is the capital of Norway"
  correct: true

- type: truefalse
  title: "Geography Question"
  question: "The Earth is flat"
  correct: false
  media:
    path: "./images/earth.jpg"
    alt: "Photo of Earth from space"
  behaviour:
    enableRetry: true
    feedbackOnWrong: "The Earth is actually round!"
```

#### AI-Generated TrueFalse

```yaml
- type: ai-truefalse
  title: "Solar System Quiz"
  prompt: "Create true/false questions about planets in our solar system, their characteristics, and positions"
  questionCount: 10
  difficulty: "medium"
  aiConfig:
    targetAudience: "grade-6"
    tone: "educational"
```

### 5. H5P Structure Generation

**Key Mappings:**

From simplified format:
```typescript
{
  question: "Oslo is the capital of Norway",
  correct: true
}
```

To H5P format:
```json
{
  "question": "<p>Oslo is the capital of Norway</p>",
  "correct": "true"  // STRING, not boolean!
}
```

**CRITICAL:** Convert boolean `true`/`false` to string `"true"`/`"false"` for H5P structure.

**Default Behaviour:**
```typescript
{
  enableRetry: true,
  enableSolutionsButton: true,
  enableCheckButton: true,
  confirmCheckDialog: false,
  confirmRetryDialog: false,
  autoCheck: false
}
```

**Default Labels:**
```typescript
{
  trueText: "True",
  falseText: "False",
  score: "You got @score of @total points",
  checkAnswer: "Check",
  submitAnswer: "Submit",
  showSolutionButton: "Show solution",
  tryAgain: "Retry",
  wrongAnswerMessage: "Wrong answer",
  correctAnswerMessage: "Correct answer",
  scoreBarLabel: "You got :num out of :total points",
  a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
  a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
  a11yRetry: "Retry the task. Reset all responses and start the task over again."
}
```

**Default Confirmation Dialogs:**
```typescript
{
  confirmCheck: {
    header: "Finish ?",
    body: "Are you sure you wish to finish ?",
    cancelLabel: "Cancel",
    confirmLabel: "Finish"
  },
  confirmRetry: {
    header: "Retry ?",
    body: "Are you sure you wish to retry ?",
    cancelLabel: "Cancel",
    confirmLabel: "Confirm"
  }
}
```

### 6. AI Integration Requirements

Following the AI Handler Pattern from the development guide:

**AIPromptBuilder Integration:**
- Use `AIPromptBuilder.resolveConfig()` for config hierarchy
- Use `AIPromptBuilder.buildSystemPrompt()` for formatting
- Keep user prompts focused on content requirements

**QuizGenerator.generateRawContent():**
- Generate true/false questions
- Return JSON array of question objects
- Each question has: question (string), correct (boolean)

**HTML Safety Net:**
- Strip HTML from AI responses before processing
- Use `stripHtml()` method pattern
- Escape HTML in question text

**Fallback Behavior:**
- Provide minimal functional true/false question on AI failure
- Use text page fallback for embedded version

**Difficulty Levels:**
- `"easy"`: Simple, obvious statements
- `"medium"`: Moderate complexity, requires thought
- `"hard"`: Complex statements, subtle distinctions

### 7. Validation Requirements

**Manual TrueFalse Validation:**
- `question` field required and must be string
- `correct` field required and must be boolean
- `media.path` must be string if media provided
- `media.type` must be "image", "video", or "audio" if provided
- Validate behaviour boolean fields
- Validate feedback strings (max 2048 chars per semantics)

**AI TrueFalse Validation:**
- `prompt` field required and must be string
- `questionCount` must be positive integer if provided
- `difficulty` must be valid enum value if provided

### 8. Required Libraries

Both handlers must declare:
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.TrueFalse"];
}
```

LibraryRegistry will automatically resolve dependencies:
- H5P.Question
- H5P.JoubelUI
- H5P.FontIcons
- FontAwesome

### 9. Type System Integration

**YamlInputParser Updates:**

1. Add to ContentType union:
```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" |
  "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary" |
  "singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set" |
  "truefalse" | "true-false" | "ai-truefalse" | "ai-true-false";
```

2. Export interfaces:
```typescript
export { TrueFalseContent } from "../handlers/embedded/TrueFalseHandler";
export { AITrueFalseContent } from "../handlers/ai/AITrueFalseHandler";
```

3. Add to AnyContentItem union:
```typescript
| import("../handlers/embedded/TrueFalseHandler").TrueFalseContent
| import("../handlers/ai/AITrueFalseHandler").AITrueFalseContent
```

4. Add validation cases:
```typescript
case "truefalse":
case "true-false":
  if (!item.question || typeof item.question !== "string") {
    throw new Error(`${prefix} (truefalse) must have 'question' field (string)`);
  }
  if (typeof item.correct !== "boolean") {
    throw new Error(`${prefix} (truefalse) must have 'correct' field (boolean)`);
  }
  break;

case "ai-truefalse":
case "ai-true-false":
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`${prefix} (ai-truefalse) must have a 'prompt' field (string)`);
  }
  break;
```

### 10. Registration

Register both handlers in `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { TrueFalseHandler } from "../../handlers/embedded/TrueFalseHandler";
import { AITrueFalseHandler } from "../../handlers/ai/AITrueFalseHandler";

// In runInteractiveBookAI method (maintain registration order):
handlerRegistry.register(new TrueFalseHandler());      // After singlechoiceset handler
handlerRegistry.register(new AITrueFalseHandler());    // After ai-singlechoiceset handler
```

### 11. Testing Requirements

**Unit Tests Required:**

`tests/unit/handlers/embedded/TrueFalseHandler.test.ts`:
- getContentType() returns "truefalse"
- validate() accepts valid content
- validate() rejects missing question field
- validate() rejects missing correct field
- validate() rejects non-boolean correct field
- validate() rejects non-string question field
- validate() accepts valid media object
- validate() rejects invalid media type
- process() builds H5P structure correctly
- process() converts boolean to string for correct field
- process() wraps question text in <p> tags
- process() uses default behaviour when not provided
- process() uses custom behaviour when provided
- process() uses default labels when not provided
- process() uses custom labels when provided
- process() handles media correctly (image/video/audio)
- process() escapes HTML in question text
- getRequiredLibraries() returns ["H5P.TrueFalse"]

`tests/unit/handlers/ai/AITrueFalseHandler.test.ts`:
- getContentType() returns "ai-truefalse"
- validate() accepts valid content
- validate() rejects missing prompt
- validate() rejects invalid difficulty enum
- validate() rejects invalid questionCount
- process() generates true/false questions with AI
- process() uses AIPromptBuilder correctly
- process() strips HTML from AI responses
- process() provides fallback on AI failure
- process() respects difficulty parameter
- process() generates correct number of questions
- process() converts AI boolean to string for H5P
- getRequiredLibraries() returns ["H5P.TrueFalse"]

**Integration Testing:**

Add to `examples/yaml/comprehensive-demo.yaml`:

```yaml
- title: "True/False Questions"
  content:
    - type: truefalse
      title: "Manual True/False"
      question: "The Sun is a star"
      correct: true

    - type: truefalse
      title: "Manual with Media"
      question: "Earth is the largest planet in our solar system"
      correct: false
      media:
        path: "./images/planets.jpg"
        alt: "Planets of the solar system"
      behaviour:
        feedbackOnWrong: "Jupiter is the largest planet!"

    - type: ai-truefalse
      title: "AI-Generated True/False"
      prompt: "Create true/false questions about the solar system, focusing on planet characteristics and positions"
      questionCount: 5
      difficulty: "medium"
```

### 12. Documentation Updates

**README.md:**
- Add TrueFalse to "Supported Content Types" table
- Add manual and AI examples
- Describe TrueFalse capabilities

**Handler_Development_Guide.md:**
- Optionally add TrueFalse as example

**New Example File:**
`examples/yaml/truefalse-example.yaml` - Comprehensive TrueFalse examples

### 13. Success Criteria

- [ ] TrueFalseHandler implemented with full validation
- [ ] Boolean-to-string conversion for correct field working
- [ ] AITrueFalseHandler implemented with AI integration
- [ ] All unit tests passing (31+ tests)
- [ ] Integration test in comprehensive-demo.yaml works
- [ ] TypeScript types updated in YamlInputParser
- [ ] Handlers registered in InteractiveBookAIModule
- [ ] README.md updated with examples
- [ ] truefalse-example.yaml created
- [ ] Generated .h5p packages upload successfully to h5p.com
- [ ] TrueFalse content displays correctly in Interactive Book
- [ ] Questions are clickable and provide feedback
- [ ] AI generation produces valid true/false questions
- [ ] Fallback works when AI generation fails
- [ ] Both type aliases work ("truefalse" and "true-false")
- [ ] Media support works (image/video/audio)

## Reference Files

**Development Guides:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/HandlerTemplate.ts`

**Example Handlers:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`

**H5P Package:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.TrueFalse-1.8.h5p`

## Notes

- TrueFalse is one of the simplest H5P question types
- The `correct` field must be converted from boolean to string "true"/"false"
- Media support is optional but adds visual context
- Auto-check feature allows instant feedback without "Check" button
- Confirmation dialogs can be enabled for accessibility
- Custom feedback messages can override defaults
- Support both "truefalse" and "true-false" type names for flexibility
- Follow exact patterns from Accordion/Summary implementations for consistency
- Question text should be wrapped in `<p>` tags and HTML-escaped
