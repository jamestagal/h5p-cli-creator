# Blanks Handler Implementation Requirements

## Overview

Implement handlers for H5P.Blanks content type following the "standalone-first" architecture pattern. H5P.Blanks (Fill in the Blanks) is a cloze test where users type answers into input fields embedded within text. This is similar to DragText but uses typed input instead of drag-and-drop.

## Content Type Analysis

### H5P.Blanks-1.14 Structure

**Main Library:** H5P.Blanks 1.14

**Dependencies:**
- H5P.Question 1.5 (core question framework)
- H5P.JoubelUI 1.3 (UI components)
- H5P.TextUtilities 1.3 (text processing)
- FontAwesome 4.5 (icon font)

**Content Structure:**
```json
{
  "text": "<p>Insert the missing words...</p>",  // Task description
  "questions": [
    "<p>Blueberries are *blue* colored berries.</p>",
    "<p>*Cloud*berries are orange berries.</p>",
    "<p>Blackcurrant is related to *black*currant.</p>"
  ],

  "media": {
    "type": {
      "library": "H5P.Image 1.1",  // Optional: H5P.Image, H5P.Video, or H5P.Audio
      "params": { /* image/video/audio params */ }
    },
    "disableImageZooming": true  // Only for H5P.Image
  },

  "behaviour": {
    "enableRetry": true,
    "enableSolutionsButton": true,
    "enableCheckButton": true,
    "autoCheck": false,
    "caseSensitive": true,
    "showSolutionsRequiresInput": true,
    "separateLines": false,
    "confirmCheckDialog": false,
    "confirmRetryDialog": false,
    "acceptSpellingErrors": false
  },

  "overallFeedback": [
    {
      "from": 0,
      "to": 100,
      "feedback": "You got @score of @total blanks correct."
    }
  ],

  // Labels (extensive l10n)
  "showSolutions": "Show solutions",
  "tryAgain": "Try again",
  "checkAnswer": "Check",
  "submitAnswer": "Submit",
  "notFilledOut": "Please fill in all blanks",
  "answerIsCorrect": "':ans' is correct",
  "answerIsWrong": "':ans' is wrong",
  "answeredCorrectly": "Answered correctly",
  "answeredIncorrectly": "Answered incorrectly",
  "solutionLabel": "Correct answer:",
  "inputLabel": "Blank input @num of @total",
  "inputHasTipLabel": "Tip available",
  "tipLabel": "Tip",
  "scoreBarLabel": "You got :num out of :total points",
  "a11yCheck": "Check the answers...",
  "a11yShowSolution": "Show the solution...",
  "a11yRetry": "Retry the task...",
  "a11yCheckingModeHeader": "Checking mode",

  "confirmCheck": {
    "header": "Finish ?",
    "body": "Are you sure?",
    "cancelLabel": "Cancel",
    "confirmLabel": "Finish"
  },

  "confirmRetry": {
    "header": "Retry ?",
    "body": "Are you sure?",
    "cancelLabel": "Cancel",
    "confirmLabel": "Confirm"
  }
}
```

**CRITICAL SYNTAX:** Blanks use asterisk markers `*answer*` with optional features:
- **Basic blank**: `*answer*`
- **Alternative answers**: `*answer1/answer2/answer3*`
- **With tip**: `*answer:tip text*`
- **Combined**: `*answer1/answer2:tip text*`

## Requirements

### 1. Standalone First Architecture

**CRITICAL:** Following the architectural decision from Handler Development Guide, implement standalone handler FIRST before embedded version.

- Blanks is a **runnable content type** (can be standalone H5P package)
- Build standalone handler that generates complete .h5p packages
- Then adapt for Interactive Book embedding

### 2. Handler Organization

Following the handler directory structure:

**Embedded Handler:**
- Location: `src/handlers/embedded/BlanksHandler.ts`
- Handles: Manual fill-in-the-blank content in YAML/JSON
- Type: `"blanks"` or `"fill-in-the-blanks"`

**AI Handler:**
- Location: `src/handlers/ai/AIBlanksHandler.ts`
- Handles: AI-generated fill-in-the-blank content
- Type: `"ai-blanks"` or `"ai-fill-in-the-blanks"`

### 3. Content Interfaces

#### Manual Blanks Content

```typescript
export interface BlanksContent {
  type: "blanks" | "fill-in-the-blanks";
  title?: string;
  taskDescription?: string;  // Instructions for the task

  // Dual format support (like DragText)

  // OPTION 1: Simplified format (recommended)
  sentences?: Array<{
    text: string;           // Sentence with {blank} placeholders
    blanks: Array<{
      answer: string | string[];  // Single answer or alternatives
      tip?: string;              // Optional hint
    }>;
  }>;

  // OPTION 2: Native H5P format (for advanced users)
  questions?: string[];  // Sentences with *answer* markers

  // Optional media above the task
  media?: {
    path: string;
    type?: "image" | "video" | "audio";
    alt?: string;
    disableZooming?: boolean;  // For images only
  };

  // Optional behavior settings
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    autoCheck?: boolean;
    caseSensitive?: boolean;
    showSolutionsRequiresInput?: boolean;
    separateLines?: boolean;
    confirmCheckDialog?: boolean;
    confirmRetryDialog?: boolean;
    acceptSpellingErrors?: boolean;
  };

  // Optional UI labels
  labels?: {
    showSolutions?: string;
    tryAgain?: string;
    checkAnswer?: string;
    notFilledOut?: string;
    answerIsCorrect?: string;
    answerIsWrong?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}
```

#### AI-Generated Blanks Content

```typescript
export interface AIBlanksContent {
  type: "ai-blanks" | "ai-fill-in-the-blanks";
  title?: string;
  prompt: string;
  sentenceCount?: number;              // Default: 5
  blanksPerSentence?: number;          // Default: 1

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

#### Manual Blanks (Simplified Format)

```yaml
- type: blanks
  title: "Norwegian Berries"
  taskDescription: "Fill in the missing words about berries"
  sentences:
    - text: "Blueberries are {blank} colored berries."
      blanks:
        - answer: "blue"
          tip: "Think about the name"

    - text: "{blank} are orange berries found in arctic tundra."
      blanks:
        - answer: ["Cloudberries", "Cloud berries"]

    - text: "Blackcurrant is related to {blank}."
      blanks:
        - answer: "blackcurrant"

  behaviour:
    caseSensitive: false
    acceptSpellingErrors: true
```

#### Manual Blanks (Native H5P Format)

```yaml
- type: blanks
  title: "Norwegian Berries"
  taskDescription: "Fill in the missing words"
  questions:
    - "Blueberries are *blue:Think about the name* colored berries."
    - "*Cloudberries/Cloud berries* are orange berries."
    - "Blackcurrant is related to *blackcurrant*."
```

#### AI-Generated Blanks

```yaml
- type: ai-blanks
  title: "Solar System Quiz"
  prompt: "Create fill-in-the-blank sentences about planets in our solar system"
  sentenceCount: 8
  blanksPerSentence: 1
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
  text: "The Earth is {blank}.",
  blanks: [{ answer: ["round", "spherical"], tip: "Not flat!" }]
}
```

To H5P native format:
```text
"The Earth is *round/spherical:Not flat!*."
```

**Conversion Logic:**
1. Replace `{blank}` placeholders with `*answer*` markers
2. Join alternative answers with `/`
3. Append tip with `:` if present
4. Ensure blanks are in correct order

**Default Behaviour:**
```typescript
{
  enableRetry: true,
  enableSolutionsButton: true,
  enableCheckButton: true,
  autoCheck: false,
  caseSensitive: true,
  showSolutionsRequiresInput: true,
  separateLines: false,
  confirmCheckDialog: false,
  confirmRetryDialog: false,
  acceptSpellingErrors: false
}
```

**Default Labels:**
```typescript
{
  showSolutions: "Show solutions",
  tryAgain: "Try again",
  checkAnswer: "Check",
  submitAnswer: "Submit",
  notFilledOut: "Please fill in all blanks",
  answerIsCorrect: "':ans' is correct",
  answerIsWrong: "':ans' is wrong",
  answeredCorrectly: "Answered correctly",
  answeredIncorrectly: "Answered incorrectly",
  solutionLabel: "Correct answer:",
  inputLabel: "Blank input @num of @total",
  inputHasTipLabel: "Tip available",
  tipLabel: "Tip",
  scoreBarLabel: "You got :num out of :total points",
  a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
  a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
  a11yRetry: "Retry the task. Reset all responses and start the task over again.",
  a11yCheckingModeHeader: "Checking mode"
}
```

**Default Feedback:**
```typescript
[
  {
    from: 0,
    to: 100,
    feedback: "You got @score of @total blanks correct."
  }
]
```

### 6. AI Integration Requirements

Following the AI Handler Pattern from the development guide:

**AIPromptBuilder Integration:**
- Use `AIPromptBuilder.resolveConfig()` for config hierarchy
- Use `AIPromptBuilder.buildSystemPrompt()` for formatting
- Keep user prompts focused on content requirements

**QuizGenerator.generateRawContent():**
- Generate fill-in-the-blank sentences
- Return JSON array of sentence objects
- Each sentence has: text (string), blanks (array of {answer, tip?})

**HTML Safety Net:**
- Strip HTML from AI responses before processing
- Use `stripHtml()` method pattern
- Escape HTML in sentence text

**Fallback Behavior:**
- Provide minimal functional blanks exercise on AI failure
- Use text page fallback for embedded version

**Difficulty Levels:**
- `"easy"`: Simple vocabulary, 1 blank per sentence
- `"medium"`: Moderate complexity, 1-2 blanks per sentence
- `"hard"`: Complex sentences, 2-3 blanks per sentence

### 7. Validation Requirements

**Manual Blanks Validation:**
- EITHER `sentences` OR `questions` must be present (not both)
- If `sentences` format:
  - Must be array with at least 1 sentence
  - Each sentence must have `text` field (string)
  - Each sentence must have `blanks` array (min 1 blank)
  - Each blank must have `answer` field (string or string array)
  - Blank count in text must match blanks array length
- If `questions` format:
  - Must be array with at least 1 question
  - Each question must be string
  - Each question must contain at least one `*answer*` marker
- Validate behaviour boolean fields
- Validate caseSensitive, acceptSpellingErrors booleans
- Validate feedback ranges (0-100)

**AI Blanks Validation:**
- `prompt` field required and must be string
- `sentenceCount` must be positive integer if provided
- `blanksPerSentence` must be 1-3 if provided
- `difficulty` must be valid enum value if provided

### 8. Required Libraries

Both handlers must declare:
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.Blanks"];
}
```

LibraryRegistry will automatically resolve dependencies:
- H5P.Question
- H5P.JoubelUI
- H5P.TextUtilities
- FontAwesome

### 9. Type System Integration

**YamlInputParser Updates:**

1. Add to ContentType union:
```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" |
  "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary" |
  "singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set" |
  "truefalse" | "true-false" | "ai-truefalse" | "ai-true-false" |
  "blanks" | "fill-in-the-blanks" | "ai-blanks" | "ai-fill-in-the-blanks";
```

2. Export interfaces:
```typescript
export { BlanksContent } from "../handlers/embedded/BlanksHandler";
export { AIBlanksContent } from "../handlers/ai/AIBlanksHandler";
```

3. Add to AnyContentItem union:
```typescript
| import("../handlers/embedded/BlanksHandler").BlanksContent
| import("../handlers/ai/AIBlanksHandler").AIBlanksContent
```

4. Add validation cases:
```typescript
case "blanks":
case "fill-in-the-blanks":
  if (!item.sentences && !item.questions) {
    throw new Error(`${prefix} (blanks) must have either 'sentences' or 'questions' array`);
  }
  if (item.sentences && item.questions) {
    throw new Error(`${prefix} (blanks) cannot have both 'sentences' and 'questions' - use one format only`);
  }
  break;

case "ai-blanks":
case "ai-fill-in-the-blanks":
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`${prefix} (ai-blanks) must have a 'prompt' field (string)`);
  }
  break;
```

### 10. Registration

Register both handlers in `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { BlanksHandler } from "../../handlers/embedded/BlanksHandler";
import { AIBlanksHandler } from "../../handlers/ai/AIBlanksHandler";

// In runInteractiveBookAI method (maintain registration order):
handlerRegistry.register(new BlanksHandler());      // After truefalse handler
handlerRegistry.register(new AIBlanksHandler());    // After ai-truefalse handler
```

### 11. Testing Requirements

**Unit Tests Required:**

`tests/unit/handlers/embedded/BlanksHandler.test.ts`:
- getContentType() returns "blanks"
- validate() accepts valid sentences format
- validate() accepts valid questions format
- validate() rejects missing both sentences and questions
- validate() rejects having both sentences and questions
- validate() rejects empty sentences array
- validate() rejects sentences without text field
- validate() rejects sentences without blanks array
- validate() rejects blanks without answer field
- validate() accepts string answer
- validate() accepts string array answer
- validate() accepts optional tip field
- validate() accepts valid media object
- validate() rejects invalid media type
- process() builds H5P structure from sentences format
- process() builds H5P structure from questions format
- process() converts simplified to native format correctly
- process() handles alternative answers (string array)
- process() handles tips correctly
- process() uses default behaviour when not provided
- process() uses custom behaviour when provided
- process() handles media correctly (image/video/audio)
- process() escapes HTML in sentence text
- getRequiredLibraries() returns ["H5P.Blanks"]

`tests/unit/handlers/ai/AIBlanksHandler.test.ts`:
- getContentType() returns "ai-blanks"
- validate() accepts valid content
- validate() rejects missing prompt
- validate() rejects invalid difficulty enum
- validate() rejects invalid sentenceCount
- validate() rejects invalid blanksPerSentence
- process() generates blanks with AI
- process() uses AIPromptBuilder correctly
- process() strips HTML from AI responses
- process() provides fallback on AI failure
- process() respects difficulty parameter
- process() generates correct number of sentences
- process() generates correct number of blanks per sentence
- process() converts AI output to H5P format
- getRequiredLibraries() returns ["H5P.Blanks"]

**Integration Testing:**

Add to `examples/yaml/comprehensive-demo.yaml`:

```yaml
- title: "Fill in the Blanks"
  content:
    - type: blanks
      title: "Manual Blanks (Simplified)"
      taskDescription: "Complete the sentences"
      sentences:
        - text: "The Sun is a {blank}."
          blanks:
            - answer: "star"
              tip: "Not a planet!"

        - text: "Earth has {blank} moon(s)."
          blanks:
            - answer: ["one", "1"]

      behaviour:
        caseSensitive: false
        acceptSpellingErrors: true

    - type: blanks
      title: "Manual Blanks (Native Format)"
      questions:
        - "The Sun is a *star:Not a planet!*."
        - "Earth has *one/1* moon(s)."

    - type: ai-blanks
      title: "AI-Generated Blanks"
      prompt: "Create fill-in-the-blank sentences about the solar system"
      sentenceCount: 5
      blanksPerSentence: 1
      difficulty: "medium"
```

### 12. Documentation Updates

**README.md:**
- Add Blanks to "Supported Content Types" table
- Add manual and AI examples (both formats)
- Describe Blanks capabilities
- Explain dual format support

**Handler_Development_Guide.md:**
- Optionally add Blanks as example

**New Example File:**
`examples/yaml/blanks-example.yaml` - Comprehensive Blanks examples

### 13. Success Criteria

- [ ] BlanksHandler implemented with full validation
- [ ] Dual format support (simplified + native) working
- [ ] Simplified-to-native conversion working correctly
- [ ] AIBlanksHandler implemented with AI integration
- [ ] All unit tests passing (38+ tests)
- [ ] Integration test in comprehensive-demo.yaml works
- [ ] TypeScript types updated in YamlInputParser
- [ ] Handlers registered in InteractiveBookAIModule
- [ ] README.md updated with examples
- [ ] blanks-example.yaml created
- [ ] Generated .h5p packages upload successfully to h5p.com
- [ ] Blanks content displays correctly in Interactive Book
- [ ] User can type answers and get feedback
- [ ] AI generation produces valid blanks exercises
- [ ] Fallback works when AI generation fails
- [ ] Both type aliases work ("blanks" and "fill-in-the-blanks")
- [ ] Media support works (image/video/audio)
- [ ] Alternative answers work correctly
- [ ] Tips display correctly
- [ ] Case sensitivity setting works
- [ ] Spelling error tolerance works

## Reference Files

**Development Guides:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/HandlerTemplate.ts`

**Example Handlers:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/DragTextHandler.ts` (very similar pattern)
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIDragTextHandler.ts`

**H5P Package:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.Blanks-1.14.h5p`

## Notes

- Blanks is very similar to DragText but uses typed input instead of drag-and-drop
- Uses `*answer*` syntax (identical to DragText)
- Supports alternative answers with `/` separator
- Supports optional tips with `:` separator
- Case sensitivity and spelling error tolerance are important features
- Media support is optional but adds visual context
- Dual format support (like DragText) provides flexibility for users
- Support both "blanks" and "fill-in-the-blanks" type names for flexibility
- Follow exact patterns from DragText implementation for consistency
- Question text should use HTML-escaped content with blanks properly converted
