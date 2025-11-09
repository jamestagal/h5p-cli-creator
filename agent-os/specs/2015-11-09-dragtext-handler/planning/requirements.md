# DragText (Drag the Words) Handler Implementation Requirements

## Overview

Implement handlers for H5P.DragText content type following the "standalone-first" architecture pattern. H5P.DragText (also known as "Drag the Words") is an interactive content type where users drag words to fill in blanks in a text, creating engaging fill-in-the-blank exercises.

## Content Type Analysis

### H5P.DragText-1.10 Structure

**Main Library:** H5P.DragText 1.10

**Dependencies:**
- H5P.Question 1.5 (core question framework)
- H5P.JoubelUI 1.3 (UI components)
- H5P.Transition 1.0 (animations)
- H5P.FontIcons 1.0 (icons)
- FontAwesome 4.5 (icon font)
- jQuery.ui 1.10 (drag and drop functionality)

**Content Structure:**
```json
{
  "taskDescription": "<p>What are the colors of these berries when they are ripe?</p>",
  "textField": "Blueberries are *blue:Check the name of the berry!*.\nStrawberries are *red*.\nCloudberries are *orange*.",
  "distractors": "*green*",
  "checkAnswer": "Check",
  "tryAgain": "Retry",
  "showSolution": "Show Solution",
  "behaviour": {
    "enableRetry": true,
    "enableSolutionsButton": true,
    "instantFeedback": false,
    "enableCheckButton": true
  },
  "overallFeedback": [
    {
      "from": 0,
      "to": 100,
      "feedback": "Score: @score of @total."
    }
  ],
  "correctText": "Correct!",
  "incorrectText": "Incorrect!",
  "media": {
    "disableImageZooming": false
  }
}
```

**TextField Format:**
- Text with blanks marked by asterisks: `*correct_answer*` or `*correct_answer:tip*`
- Multiple correct answers: `*answer1/answer2/answer3*`
- Answers with tips: `*answer:This is a helpful tip*`
- Distractors (incorrect options): Defined separately in `distractors` field

## Requirements

### 1. Standalone First Architecture

**CRITICAL:** Following the architectural decision from Handler Development Guide, implement standalone handler FIRST before embedded version.

- DragText is a **runnable content type** (can be standalone H5P package)
- Build standalone handler that generates complete .h5p packages
- Then adapt for Interactive Book embedding

### 2. Handler Organization

Following the handler directory structure:

**Embedded Handler:**
- Location: `src/handlers/embedded/DragTextHandler.ts`
- Handles: Manual drag text content in YAML/JSON
- Type: `"dragtext"` or `"drag-the-words"`

**AI Handler:**
- Location: `src/handlers/ai/AIDragTextHandler.ts`
- Handles: AI-generated drag text content
- Type: `"ai-dragtext"` or `"ai-drag-the-words"`

### 3. Content Interfaces

#### Manual DragText Content

```typescript
export interface DragTextContent {
  type: "dragtext" | "drag-the-words";
  title?: string;
  taskDescription?: string;
  // Simplified format: array of sentences with blanks
  sentences: Array<{
    text: string;  // Text with {blank} markers
    blanks: Array<{
      answer: string | string[];  // Single answer or multiple correct answers
      tip?: string;
    }>;
  }>;
  // OR alternative format: textField string (H5P native format)
  textField?: string;  // "Text with *answer* or *answer:tip* markers"

  distractors?: string[];  // Incorrect answer options

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    instantFeedback?: boolean;
    enableCheckButton?: boolean;
  };

  // Optional UI labels
  labels?: {
    checkAnswer?: string;
    tryAgain?: string;
    showSolution?: string;
    correctText?: string;
    incorrectText?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}
```

#### AI-Generated DragText Content

```typescript
export interface AIDragTextContent {
  type: "ai-dragtext" | "ai-drag-the-words";
  title?: string;
  prompt: string;
  sentenceCount?: number;  // Default: 5
  blanksPerSentence?: number;  // Default: 2
  includeDistractors?: boolean;  // Default: true
  distractorCount?: number;  // Default: 3

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

#### Manual DragText (Simplified Format)

```yaml
- type: dragtext
  title: "Berry Colors"
  taskDescription: "What are the colors of these berries when they are ripe?"
  sentences:
    - text: "Blueberries are {blank}."
      blanks:
        - answer: "blue"
          tip: "Check the name of the berry!"

    - text: "Strawberries are {blank}."
      blanks:
        - answer: "red"

    - text: "Cloudberries are {blank}."
      blanks:
        - answer: "orange"

  distractors:
    - "green"
    - "purple"
```

#### Manual DragText (H5P Native Format)

```yaml
- type: dragtext
  title: "Berry Colors"
  taskDescription: "What are the colors of these berries when they are ripe?"
  textField: |
    Blueberries are *blue:Check the name of the berry!*.
    Strawberries are *red*.
    Cloudberries are *orange*.
  distractors: "*green*\n*purple*"
```

#### AI-Generated DragText

```yaml
- type: ai-dragtext
  title: "Photosynthesis Blanks"
  prompt: "Create fill-in-the-blank sentences about photosynthesis, chloroplasts, and plant biology."
  sentenceCount: 5
  blanksPerSentence: 2
  includeDistractors: true
  distractorCount: 3
  difficulty: "medium"
  aiConfig:
    targetAudience: "high-school"
    tone: "educational"
```

### 5. TextField Format Conversion

**From Simplified to H5P Format:**

Simplified YAML:
```yaml
text: "Blueberries are {blank} and {blank}."
blanks:
  - answer: "blue"
    tip: "Think about the name!"
  - answer: ["small", "tiny", "little"]
```

Converts to H5P textField:
```
"Blueberries are *blue:Think about the name!* and *small/tiny/little*."
```

**Format Rules:**
- `*answer*` - Single correct answer
- `*answer1/answer2/answer3*` - Multiple correct answers (any is valid)
- `*answer:tip text*` - Answer with tooltip
- Distractors use same `*distractor*` format in separate field

### 6. AI Integration Requirements

Following the AI Handler Pattern from the development guide:

**AIPromptBuilder Integration:**
- Use `AIPromptBuilder.resolveConfig()` for config hierarchy
- Use `AIPromptBuilder.buildSystemPrompt()` for formatting
- Keep user prompts focused on content requirements

**QuizGenerator.generateRawContent():**
- Generate fill-in-the-blank sentences
- Return JSON array of sentence objects
- Each sentence has text and blanks array
- Include distractors if requested

**HTML Safety Net:**
- Strip HTML from AI responses before processing
- Use `stripHtml()` method pattern
- Escape HTML in taskDescription

**Fallback Behavior:**
- Provide minimal functional drag text on AI failure
- Use text page fallback for embedded version

**Difficulty Levels:**
- `"easy"`: Simple vocabulary, 1 blank per sentence, obvious answers
- `"medium"`: Moderate vocabulary, 2 blanks per sentence, some distractors
- `"hard"`: Advanced vocabulary, 3+ blanks per sentence, many distractors

### 7. Validation Requirements

**Manual DragText Validation:**
- Either `sentences` array OR `textField` string must be provided
- If `sentences`: must have at least one sentence
- Each sentence must have `text` and `blanks` array
- Each blank must have `answer` (string or array of strings)
- `answer` must be non-empty
- If `textField`: must contain at least one `*answer*` marker
- Validate `difficulty` enum if present
- Validate behavior boolean fields

**AI DragText Validation:**
- `prompt` field required and must be string
- `sentenceCount` must be positive integer if provided
- `blanksPerSentence` must be positive integer if provided
- `distractorCount` must be non-negative integer if provided
- `difficulty` must be valid enum value if provided
- `includeDistractors` must be boolean if provided

### 8. H5P Structure Generation

**Key Mappings:**

From simplified format:
```typescript
{
  text: "Blueberries are {blank}.",
  blanks: [{ answer: "blue", tip: "Hint" }]
}
```

To H5P textField:
```
"Blueberries are *blue:Hint*."
```

**Default Labels:**
```typescript
{
  checkAnswer: "Check",
  tryAgain: "Retry",
  showSolution: "Show Solution",
  correctText: "Correct!",
  incorrectText: "Incorrect!",
  tipLabel: "Show tip",
  scoreBarLabel: "You got :num out of :total points"
}
```

**Default Behavior:**
```typescript
{
  enableRetry: true,
  enableSolutionsButton: true,
  instantFeedback: false,
  enableCheckButton: true
}
```

**Default Feedback:**
```typescript
[
  {
    from: 0,
    to: 100,
    feedback: "Score: @score of @total."
  }
]
```

### 9. Required Libraries

Both handlers must declare:
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.DragText"];
}
```

LibraryRegistry will automatically resolve dependencies:
- H5P.Question
- H5P.JoubelUI
- H5P.Transition
- H5P.FontIcons
- FontAwesome
- jQuery.ui

### 10. Type System Integration

**YamlInputParser Updates:**

1. Add to ContentType union:
```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" |
  "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary" |
  "dragtext" | "drag-the-words" | "ai-dragtext" | "ai-drag-the-words";
```

2. Export interfaces:
```typescript
export { DragTextContent } from "../handlers/embedded/DragTextHandler";
export { AIDragTextContent } from "../handlers/ai/AIDragTextHandler";
```

3. Add to AnyContentItem union:
```typescript
| import("../handlers/embedded/DragTextHandler").DragTextContent
| import("../handlers/ai/AIDragTextHandler").AIDragTextContent
```

4. Add validation cases:
```typescript
case "dragtext":
case "drag-the-words":
  if (!item.sentences && !item.textField) {
    throw new Error(`${prefix} (dragtext) must have either 'sentences' array or 'textField' string`);
  }
  if (item.sentences && !Array.isArray(item.sentences)) {
    throw new Error(`${prefix} (dragtext) 'sentences' must be an array`);
  }
  if (item.sentences && item.sentences.length === 0) {
    throw new Error(`${prefix} (dragtext) must have at least one sentence`);
  }
  break;

case "ai-dragtext":
case "ai-drag-the-words":
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`${prefix} (ai-dragtext) must have a 'prompt' field (string)`);
  }
  break;
```

### 11. Registration

Register both handlers in `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { DragTextHandler } from "../../handlers/embedded/DragTextHandler";
import { AIDragTextHandler } from "../../handlers/ai/AIDragTextHandler";

// In runInteractiveBookAI method (maintain registration order):
handlerRegistry.register(new DragTextHandler());      // After summary handler
handlerRegistry.register(new AIDragTextHandler());    // After ai-summary handler
```

### 12. Testing Requirements

**Unit Tests Required:**

`tests/unit/handlers/embedded/DragTextHandler.test.ts`:
- getContentType() returns "dragtext"
- validate() accepts valid simplified format
- validate() accepts valid textField format
- validate() rejects missing both sentences and textField
- validate() rejects empty sentences array
- validate() rejects sentences without blanks
- validate() rejects blanks without answers
- process() converts simplified format to H5P textField
- process() uses textField directly when provided
- process() includes distractors correctly
- process() uses default labels when not provided
- process() uses custom labels when provided
- process() uses default behavior when not provided
- process() uses custom behavior when provided
- getRequiredLibraries() returns ["H5P.DragText"]

`tests/unit/handlers/ai/AIDragTextHandler.test.ts`:
- getContentType() returns "ai-dragtext"
- validate() accepts valid content
- validate() rejects missing prompt
- validate() rejects invalid difficulty enum
- validate() rejects invalid sentenceCount
- validate() rejects invalid blanksPerSentence
- process() generates drag text with AI
- process() uses AIPromptBuilder correctly
- process() strips HTML from AI responses
- process() provides fallback on AI failure
- process() respects difficulty parameter
- process() includes distractors when requested
- getRequiredLibraries() returns ["H5P.DragText"]

**Integration Testing:**

Add to `examples/yaml/comprehensive-demo.yaml`:

```yaml
- title: "Drag the Words Exercise"
  content:
    - type: dragtext
      title: "Manual Drag Text"
      taskDescription: "Fill in the blanks!"
      sentences:
        - text: "The Sun is the {blank} in our solar system."
          blanks:
            - answer: ["star", "center"]
        - text: "Earth is the {blank} planet from the Sun."
          blanks:
            - answer: "third"
              tip: "Count from the Sun outward"
      distractors:
        - "fourth"
        - "moon"

    - type: ai-dragtext
      title: "AI-Generated Drag Text"
      prompt: "Create fill-in-the-blank sentences about the solar system"
      sentenceCount: 3
      blanksPerSentence: 2
      difficulty: "medium"
```

### 13. Documentation Updates

**README.md:**
- Add DragText to "Supported Content Types" table
- Add manual and AI examples
- Describe DragText capabilities
- Explain both simplified and textField formats

**Handler_Development_Guide.md:**
- Optionally add DragText as example (after Summary)

**New Example File:**
`examples/yaml/dragtext-example.yaml` - Comprehensive DragText examples showing both formats

### 14. Success Criteria

- [ ] DragTextHandler implemented with full validation
- [ ] Support for both simplified and textField formats
- [ ] AIDragTextHandler implemented with AI integration
- [ ] All unit tests passing (26+ tests)
- [ ] Integration test in comprehensive-demo.yaml works
- [ ] TypeScript types updated in YamlInputParser
- [ ] Handlers registered in InteractiveBookAIModule
- [ ] README.md updated with examples
- [ ] dragtext-example.yaml created
- [ ] Generated .h5p packages upload successfully to h5p.com
- [ ] DragText content displays correctly in Interactive Book
- [ ] Words are draggable and droppable
- [ ] AI generation produces valid drag text exercises
- [ ] Fallback works when AI generation fails
- [ ] Both type aliases ("dragtext" and "drag-the-words") work

## Reference Files

**Development Guides:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/HandlerTemplate.ts`

**Example Handlers:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`

**H5P Package:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.DragText-1.10.h5p`

## Notes

- DragText uses a special textField format with `*answer*` markers
- Provide simplified YAML format for easier authoring, convert to H5P format internally
- Multiple correct answers supported with `/` separator: `*answer1/answer2*`
- Tips attached to answers with `:` separator: `*answer:tip text*`
- Distractors are incorrect options shown alongside correct answers
- jQuery.ui provides drag and drop functionality
- AI difficulty parameter affects vocabulary complexity and blank count
- Support both "dragtext" and "drag-the-words" type names for flexibility
- Follow exact patterns from Accordion/Summary implementations for consistency
