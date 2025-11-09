# Summary Handler Implementation Requirements

## Overview

Implement handlers for H5P.Summary content type following the "standalone-first" architecture pattern. H5P.Summary is an interactive content type that presents users with a series of statements where they must choose the correct option from multiple choices.

## Content Type Analysis

### H5P.Summary-1.10 Structure

**Main Library:** H5P.Summary 1.10

**Dependencies:**
- H5P.Question 1.5 (core question framework)
- H5P.JoubelUI 1.3 (UI components)
- H5P.Transition 1.0 (animations)
- H5P.FontIcons 1.0 (icons)
- FontAwesome 4.5 (icon font)

**Content Structure:**
```json
{
  "intro": "Choose the correct statement.",
  "summaries": [
    {
      "summary": [
        "<p>Statement 1 (correct)</p>",
        "<p>Statement 2 (incorrect)</p>",
        "<p>Statement 3 (incorrect)</p>"
      ],
      "tip": "Optional tip text",
      "subContentId": "uuid"
    }
  ],
  "solvedLabel": "Progress:",
  "scoreLabel": "Wrong answers:",
  "resultLabel": "Your result",
  "overallFeedback": [
    {
      "from": 0,
      "to": 100,
      "feedback": "You got @score of @total statements (@percent %) correct."
    }
  ],
  "labelCorrect": "Correct.",
  "labelIncorrect": "Incorrect! Please try again.",
  "labelCorrectAnswers": "Correct answers.",
  "tipButtonLabel": "Show tip",
  "scoreBarLabel": "You got :num out of :total points",
  "progressText": "Progress :num of :total",
  "alternativeIncorrectLabel": "Incorrect"
}
```

## Requirements

### 1. Standalone First Architecture

**CRITICAL:** Following the architectural decision from Handler Development Guide, implement standalone handler FIRST before embedded version.

- Summary is a **runnable content type** (can be standalone H5P package)
- Build standalone handler that generates complete .h5p packages
- Then adapt for Interactive Book embedding

### 2. Handler Organization

Following the handler directory structure:

**Embedded Handler:**
- Location: `src/handlers/embedded/SummaryHandler.ts`
- Handles: Manual summary content in YAML/JSON
- Type: `"summary"`

**AI Handler:**
- Location: `src/handlers/ai/AISummaryHandler.ts`
- Handles: AI-generated summary content
- Type: `"ai-summary"`

### 3. Content Interfaces

#### Manual Summary Content

```typescript
export interface SummaryContent {
  type: "summary";
  title?: string;
  intro?: string;
  questions: Array<{
    statements: string[];  // First statement is correct
    tip?: string;
  }>;
  // Optional UI labels (use defaults if not provided)
  labels?: {
    solvedLabel?: string;
    scoreLabel?: string;
    resultLabel?: string;
    labelCorrect?: string;
    labelIncorrect?: string;
    labelCorrectAnswers?: string;
    tipButtonLabel?: string;
    scoreBarLabel?: string;
    progressText?: string;
    alternativeIncorrectLabel?: string;
  };
  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}
```

#### AI-Generated Summary Content

```typescript
export interface AISummaryContent {
  type: "ai-summary";
  title?: string;
  prompt: string;
  questionCount?: number;  // Default: 5
  statementsPerQuestion?: number;  // Default: 3
  // Content structure parameter
  style?: "true-false" | "multiple-choice" | "mixed";
  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}
```

### 4. YAML Examples

#### Manual Summary

```yaml
- type: summary
  title: "Solar System Facts"
  intro: "Choose the correct statement about each topic."
  questions:
    - statements:
        - "The Sun contains 99.86% of the solar system's mass."
        - "The Sun contains 50% of the solar system's mass."
        - "The Sun contains 75% of the solar system's mass."
      tip: "The Sun is by far the largest object in our solar system."

    - statements:
        - "Earth is the third planet from the Sun."
        - "Earth is the second planet from the Sun."
        - "Earth is the fourth planet from the Sun."
      tip: "Mercury and Venus are closer to the Sun than Earth."
```

#### AI-Generated Summary

```yaml
- type: ai-summary
  title: "Photosynthesis Quiz"
  prompt: "Create questions about photosynthesis process, chloroplasts, and plant biology."
  questionCount: 5
  statementsPerQuestion: 3
  style: "multiple-choice"
  aiConfig:
    targetAudience: "high-school"
    tone: "educational"
```

### 5. AI Integration Requirements

Following the AI Handler Pattern from the development guide:

**AIPromptBuilder Integration:**
- Use `AIPromptBuilder.resolveConfig()` for config hierarchy
- Use `AIPromptBuilder.buildSystemPrompt()` for formatting
- Keep user prompts focused on content requirements

**QuizGenerator.generateRawContent():**
- Generate summary questions using public method
- Return JSON array of question objects
- Each question has correct statement first, followed by distractors

**HTML Safety Net:**
- Strip HTML from AI responses before wrapping
- Use `stripHtml()` method pattern

**Fallback Behavior:**
- Provide minimal functional summary on AI failure
- Use text page fallback for embedded version

**Style Parameters:**
- `"true-false"`: 2 statements per question (correct/incorrect)
- `"multiple-choice"`: 3-4 statements per question
- `"mixed"`: Varying numbers of statements

### 6. Validation Requirements

**Manual Summary Validation:**
- `questions` array must exist and not be empty
- Each question must have `statements` array
- Each `statements` array must have at least 2 items
- First statement is always the correct one
- All statements must be non-empty strings
- Validate `style` enum if present

**AI Summary Validation:**
- `prompt` field required and must be string
- `questionCount` must be positive integer if provided
- `statementsPerQuestion` must be >= 2 if provided
- `style` must be valid enum value if provided

### 7. H5P Structure Generation

**Key Mappings:**
- First statement in array → correct answer
- Other statements → distractors
- Generate unique `subContentId` for each question
- Include all UI labels (use defaults)
- Include feedback ranges (use default if not provided)

**Default Labels:**
```typescript
{
  solvedLabel: "Progress:",
  scoreLabel: "Wrong answers:",
  resultLabel: "Your result",
  labelCorrect: "Correct.",
  labelIncorrect: "Incorrect! Please try again.",
  labelCorrectAnswers: "Correct answers.",
  tipButtonLabel: "Show tip",
  scoreBarLabel: "You got :num out of :total points",
  progressText: "Progress :num of :total",
  alternativeIncorrectLabel: "Incorrect"
}
```

**Default Feedback:**
```typescript
[
  {
    from: 0,
    to: 100,
    feedback: "You got @score of @total statements (@percent %) correct."
  }
]
```

### 8. Required Libraries

Both handlers must declare:
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.Summary"];
}
```

LibraryRegistry will automatically resolve dependencies:
- H5P.Question
- H5P.JoubelUI
- H5P.Transition
- H5P.FontIcons
- FontAwesome

### 9. Type System Integration

**YamlInputParser Updates:**

1. Add to ContentType union:
```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" |
  "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary";
```

2. Export interfaces:
```typescript
export { SummaryContent } from "../handlers/embedded/SummaryHandler";
export { AISummaryContent } from "../handlers/ai/AISummaryHandler";
```

3. Add to AnyContentItem union:
```typescript
| import("../handlers/embedded/SummaryHandler").SummaryContent
| import("../handlers/ai/AISummaryHandler").AISummaryContent
```

4. Add validation cases:
```typescript
case "summary":
  if (!Array.isArray(item.questions)) {
    throw new Error(`${prefix} (summary) must have a 'questions' field (array)`);
  }
  if (item.questions.length === 0) {
    throw new Error(`${prefix} (summary) must have at least one question`);
  }
  break;

case "ai-summary":
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`${prefix} (ai-summary) must have a 'prompt' field (string)`);
  }
  break;
```

### 10. Registration

Register both handlers in `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { SummaryHandler } from "../../handlers/embedded/SummaryHandler";
import { AISummaryHandler } from "../../handlers/ai/AISummaryHandler";

// In runInteractiveBookAI method (maintain registration order):
handlerRegistry.register(new SummaryHandler());      // After other embedded handlers
handlerRegistry.register(new AISummaryHandler());    // After other AI handlers
```

### 11. Testing Requirements

**Unit Tests Required:**

`tests/unit/handlers/embedded/SummaryHandler.test.ts`:
- getContentType() returns "summary"
- validate() accepts valid content
- validate() rejects missing questions array
- validate() rejects empty questions array
- validate() rejects questions without statements
- validate() rejects statements with < 2 items
- process() builds correct H5P structure
- process() uses default labels when not provided
- process() uses custom labels when provided
- process() generates unique subContentIds
- getRequiredLibraries() returns ["H5P.Summary"]

`tests/unit/handlers/ai/AISummaryHandler.test.ts`:
- getContentType() returns "ai-summary"
- validate() accepts valid content
- validate() rejects missing prompt
- validate() rejects invalid style enum
- validate() rejects invalid questionCount
- process() generates summary questions with AI
- process() uses AIPromptBuilder correctly
- process() strips HTML from AI responses
- process() provides fallback on AI failure
- process() respects style parameter
- getRequiredLibraries() returns ["H5P.Summary"]

**Integration Testing:**

Add to `examples/yaml/comprehensive-demo.yaml`:

```yaml
- title: "Summary Exercise"
  content:
    - type: summary
      title: "Manual Summary Questions"
      intro: "Test your knowledge!"
      questions:
        - statements:
            - "Correct statement"
            - "Incorrect statement 1"
            - "Incorrect statement 2"
          tip: "Think about X"

    - type: ai-summary
      title: "AI-Generated Summary"
      prompt: "Create questions about the solar system"
      questionCount: 3
      style: "multiple-choice"
```

### 12. Documentation Updates

**README.md:**
- Add Summary to "Supported Content Types" table
- Add manual and AI examples
- Describe Summary capabilities

**Handler_Development_Guide.md:**
- Optionally add Summary as example (after Accordion)

**New Example File:**
`examples/yaml/summary-example.yaml` - Comprehensive Summary examples

### 13. Success Criteria

- [ ] SummaryHandler implemented with full validation
- [ ] AISummaryHandler implemented with AI integration
- [ ] All unit tests passing (22+ tests)
- [ ] Integration test in comprehensive-demo.yaml works
- [ ] TypeScript types updated in YamlInputParser
- [ ] Handlers registered in InteractiveBookAIModule
- [ ] README.md updated with examples
- [ ] summary-example.yaml created
- [ ] Generated .h5p packages upload successfully to h5p.com
- [ ] Summary content displays correctly in Interactive Book
- [ ] AI generation produces valid summary questions
- [ ] Fallback works when AI generation fails

## Reference Files

**Development Guides:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/HandlerTemplate.ts`

**Example Handlers:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`

**H5P Package:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.Summary-1.10.h5p`

## Notes

- Summary is similar to Quiz but focuses on statement selection rather than Q&A format
- The first statement in each array is ALWAYS the correct one (critical for H5P.Summary)
- Tips are optional but helpful for learners
- AI style parameter controls how questions are structured (true/false vs multiple choice)
- Follow exact patterns from Accordion implementation for consistency
