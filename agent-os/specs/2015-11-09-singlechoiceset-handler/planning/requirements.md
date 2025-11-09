# SingleChoiceSet Handler Implementation Requirements

## Overview

Implement handlers for H5P.SingleChoiceSet content type following the "standalone-first" architecture pattern. H5P.SingleChoiceSet is an interactive content type that presents a series of single-choice questions, where users select one answer from multiple options for each question.

## Content Type Analysis

### H5P.SingleChoiceSet-1.11 Structure

**Main Library:** H5P.SingleChoiceSet 1.11

**Dependencies:**
- H5P.Question 1.5 (core question framework)
- H5P.JoubelUI 1.3 (UI components)
- H5P.Transition 1.0 (animations)
- FontAwesome 4.5 (icon font)

**Content Structure:**
```json
{
  "choices": [
    {
      "question": "Goji berries are also known as ...",
      "answers": [
        "Wolfberries",  // Index 0 is ALWAYS correct
        "Catberries",
        "Bearberries"
      ],
      "subContentId": "uuid"
    }
  ],
  "behaviour": {
    "timeoutCorrect": 1000,
    "timeoutWrong": 1000,
    "soundEffectsEnabled": true,
    "enableRetry": true,
    "enableSolutionsButton": true,
    "passPercentage": 100,
    "autoContinue": true
  },
  "l10n": {
    "showSolutionButtonLabel": "Show solution",
    "retryButtonLabel": "Retry",
    "correctText": "Correct!",
    "incorrectText": "Incorrect!",
    // ... more labels
  },
  "overallFeedback": [
    {
      "from": 0,
      "to": 100,
      "feedback": "You got :numcorrect of :maxscore correct"
    }
  ]
}
```

**CRITICAL:** The **first answer in the `answers` array is ALWAYS the correct answer**. Other answers are distractors.

## Requirements

### 1. Standalone First Architecture

**CRITICAL:** Following the architectural decision from Handler Development Guide, implement standalone handler FIRST before embedded version.

- SingleChoiceSet is a **runnable content type** (can be standalone H5P package)
- Build standalone handler that generates complete .h5p packages
- Then adapt for Interactive Book embedding

### 2. Handler Organization

Following the handler directory structure:

**Embedded Handler:**
- Location: `src/handlers/embedded/SingleChoiceSetHandler.ts`
- Handles: Manual single choice set content in YAML/JSON
- Type: `"singlechoiceset"` or `"single-choice-set"`

**AI Handler:**
- Location: `src/handlers/ai/AISingleChoiceSetHandler.ts`
- Handles: AI-generated single choice set content
- Type: `"ai-singlechoiceset"` or `"ai-single-choice-set"`

### 3. Content Interfaces

#### Manual SingleChoiceSet Content

```typescript
export interface SingleChoiceSetContent {
  type: "singlechoiceset" | "single-choice-set";
  title?: string;

  // Simplified format: array of questions
  questions: Array<{
    question: string;
    correctAnswer: string;              // The correct answer
    distractors: string[];              // Wrong answers (2+)
  }>;

  // Optional behavior settings
  behaviour?: {
    timeoutCorrect?: number;            // Milliseconds to show correct feedback
    timeoutWrong?: number;              // Milliseconds to show wrong feedback
    soundEffectsEnabled?: boolean;
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    passPercentage?: number;            // 0-100
    autoContinue?: boolean;             // Auto-advance to next question
  };

  // Optional UI labels
  labels?: {
    showSolutionButton?: string;
    retryButton?: string;
    correctText?: string;
    incorrectText?: string;
    nextQuestionButton?: string;
    slideOfTotal?: string;
  };

  // Optional feedback ranges
  feedback?: Array<{
    from: number;
    to: number;
    feedback: string;
  }>;
}
```

#### AI-Generated SingleChoiceSet Content

```typescript
export interface AISingleChoiceSetContent {
  type: "ai-singlechoiceset" | "ai-single-choice-set";
  title?: string;
  prompt: string;
  questionCount?: number;              // Default: 5
  distractorsPerQuestion?: number;     // Default: 2 (total 3 options)

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

#### Manual SingleChoiceSet

```yaml
- type: singlechoiceset
  title: "Goji Berry Quiz"
  questions:
    - question: "Goji berries are also known as ..."
      correctAnswer: "Wolfberries"
      distractors:
        - "Catberries"
        - "Bearberries"

    - question: "Goji berries are native to ..."
      correctAnswer: "Asia"
      distractors:
        - "Africa"
        - "Europe"

    - question: "Goji berries are usually sold ..."
      correctAnswer: "Dried"
      distractors:
        - "Pickled"
        - "Frozen"

  behaviour:
    timeoutCorrect: 1000
    timeoutWrong: 1000
    soundEffectsEnabled: true
    enableRetry: true
    passPercentage: 100
```

#### AI-Generated SingleChoiceSet

```yaml
- type: ai-singlechoiceset
  title: "Solar System Quiz"
  prompt: "Create single-choice questions about planets in our solar system, their characteristics, and their positions."
  questionCount: 8
  distractorsPerQuestion: 3
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
  question: "What color is the sky?",
  correctAnswer: "Blue",
  distractors: ["Red", "Green"]
}
```

To H5P choices format:
```json
{
  "question": "What color is the sky?",
  "answers": ["Blue", "Red", "Green"],  // Correct FIRST
  "subContentId": "uuid"
}
```

**CRITICAL:** Always place correct answer at **index 0** of the answers array.

**Default Behaviour:**
```typescript
{
  timeoutCorrect: 1000,
  timeoutWrong: 1000,
  soundEffectsEnabled: true,
  enableRetry: true,
  enableSolutionsButton: true,
  passPercentage: 100,
  autoContinue: true
}
```

**Default Labels:**
```typescript
{
  showSolutionButtonLabel: "Show solution",
  retryButtonLabel: "Retry",
  solutionViewTitle: "Solution",
  correctText: "Correct!",
  incorrectText: "Incorrect!",
  muteButtonLabel: "Mute feedback sound",
  closeButtonLabel: "Close",
  slideOfTotal: "Slide :num of :total",
  nextButtonLabel: "Next question",
  scoreBarLabel: "You got :num out of :total points",
  solutionListQuestionNumber: "Question :num",
  a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
  a11yRetry: "Retry the task. Reset all responses and start the task over again.",
  shouldSelect: "Should have been selected",
  shouldNotSelect: "Should not have been selected"
}
```

**Default Feedback:**
```typescript
[
  {
    from: 0,
    to: 100,
    feedback: "You got :numcorrect of :maxscore correct"
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
- Generate single-choice questions
- Return JSON array of question objects
- Each question has: question, correctAnswer, distractors
- Number of distractors controlled by `distractorsPerQuestion`

**HTML Safety Net:**
- Strip HTML from AI responses before processing
- Use `stripHtml()` method pattern
- Escape HTML in question text and answers

**Fallback Behavior:**
- Provide minimal functional single choice set on AI failure
- Use text page fallback for embedded version

**Difficulty Levels:**
- `"easy"`: Simple questions, 2 distractors (3 total options)
- `"medium"`: Moderate questions, 3 distractors (4 total options)
- `"hard"`: Complex questions, 4+ distractors (5+ total options)

### 7. Validation Requirements

**Manual SingleChoiceSet Validation:**
- `questions` array must be present and non-empty
- Each question must have:
  - `question` field (string, non-empty)
  - `correctAnswer` field (string, non-empty)
  - `distractors` array (min 1 distractor, typically 2-4)
- All distractors must be non-empty strings
- Validate behaviour boolean and number fields
- Validate passPercentage (0-100)
- Validate timeout values (positive integers)

**AI SingleChoiceSet Validation:**
- `prompt` field required and must be string
- `questionCount` must be positive integer if provided
- `distractorsPerQuestion` must be 1+ if provided
- `difficulty` must be valid enum value if provided

### 8. Required Libraries

Both handlers must declare:
```typescript
public getRequiredLibraries(): string[] {
  return ["H5P.SingleChoiceSet"];
}
```

LibraryRegistry will automatically resolve dependencies:
- H5P.Question
- H5P.JoubelUI
- H5P.Transition
- FontAwesome

### 9. Type System Integration

**YamlInputParser Updates:**

1. Add to ContentType union:
```typescript
export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" |
  "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary" |
  "singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set";
```

2. Export interfaces:
```typescript
export { SingleChoiceSetContent } from "../handlers/embedded/SingleChoiceSetHandler";
export { AISingleChoiceSetContent } from "../handlers/ai/AISingleChoiceSetHandler";
```

3. Add to AnyContentItem union:
```typescript
| import("../handlers/embedded/SingleChoiceSetHandler").SingleChoiceSetContent
| import("../handlers/ai/AISingleChoiceSetHandler").AISingleChoiceSetContent
```

4. Add validation cases:
```typescript
case "singlechoiceset":
case "single-choice-set":
  if (!Array.isArray(item.questions)) {
    throw new Error(`${prefix} (singlechoiceset) must have 'questions' array`);
  }
  if (item.questions.length === 0) {
    throw new Error(`${prefix} (singlechoiceset) must have at least one question`);
  }
  break;

case "ai-singlechoiceset":
case "ai-single-choice-set":
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`${prefix} (ai-singlechoiceset) must have a 'prompt' field (string)`);
  }
  break;
```

### 10. Registration

Register both handlers in `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { SingleChoiceSetHandler } from "../../handlers/embedded/SingleChoiceSetHandler";
import { AISingleChoiceSetHandler } from "../../handlers/ai/AISingleChoiceSetHandler";

// In runInteractiveBookAI method (maintain registration order):
handlerRegistry.register(new SingleChoiceSetHandler());      // After dragtext handler
handlerRegistry.register(new AISingleChoiceSetHandler());    // After ai-dragtext handler
```

### 11. Testing Requirements

**Unit Tests Required:**

`tests/unit/handlers/embedded/SingleChoiceSetHandler.test.ts`:
- getContentType() returns "singlechoiceset"
- validate() accepts valid content
- validate() rejects missing questions array
- validate() rejects empty questions array
- validate() rejects questions without question field
- validate() rejects questions without correctAnswer
- validate() rejects questions without distractors
- validate() rejects empty distractors array
- process() builds H5P structure correctly
- process() places correct answer at index 0
- process() shuffles distractors after correct answer
- process() uses default behaviour when not provided
- process() uses custom behaviour when provided
- process() uses default labels when not provided
- process() uses custom labels when provided
- getRequiredLibraries() returns ["H5P.SingleChoiceSet"]

`tests/unit/handlers/ai/AISingleChoiceSetHandler.test.ts`:
- getContentType() returns "ai-singlechoiceset"
- validate() accepts valid content
- validate() rejects missing prompt
- validate() rejects invalid difficulty enum
- validate() rejects invalid questionCount
- validate() rejects invalid distractorsPerQuestion
- process() generates single choice set with AI
- process() uses AIPromptBuilder correctly
- process() strips HTML from AI responses
- process() provides fallback on AI failure
- process() respects difficulty parameter
- process() generates correct number of questions
- process() generates correct number of distractors
- getRequiredLibraries() returns ["H5P.SingleChoiceSet"]

**Integration Testing:**

Add to `examples/yaml/comprehensive-demo.yaml`:

```yaml
- title: "Single Choice Questions"
  content:
    - type: singlechoiceset
      title: "Manual Single Choice Set"
      questions:
        - question: "The Sun is a ..."
          correctAnswer: "star"
          distractors:
            - "planet"
            - "moon"

        - question: "Earth has ... moon(s)"
          correctAnswer: "one"
          distractors:
            - "two"
            - "none"

      behaviour:
        passPercentage: 80
        autoContinue: true

    - type: ai-singlechoiceset
      title: "AI-Generated Single Choice Set"
      prompt: "Create single-choice questions about the solar system focusing on planet characteristics and positions"
      questionCount: 5
      distractorsPerQuestion: 2
      difficulty: "medium"
```

### 12. Documentation Updates

**README.md:**
- Add SingleChoiceSet to "Supported Content Types" table
- Add manual and AI examples
- Describe SingleChoiceSet capabilities

**Handler_Development_Guide.md:**
- Optionally add SingleChoiceSet as example

**New Example File:**
`examples/yaml/singlechoiceset-example.yaml` - Comprehensive SingleChoiceSet examples

### 13. Success Criteria

- [ ] SingleChoiceSetHandler implemented with full validation
- [ ] Correct answer always placed at index 0 of answers array
- [ ] AISingleChoiceSetHandler implemented with AI integration
- [ ] All unit tests passing (28+ tests)
- [ ] Integration test in comprehensive-demo.yaml works
- [ ] TypeScript types updated in YamlInputParser
- [ ] Handlers registered in InteractiveBookAIModule
- [ ] README.md updated with examples
- [ ] singlechoiceset-example.yaml created
- [ ] Generated .h5p packages upload successfully to h5p.com
- [ ] SingleChoiceSet content displays correctly in Interactive Book
- [ ] Questions are clickable and provide feedback
- [ ] AI generation produces valid single choice sets
- [ ] Fallback works when AI generation fails
- [ ] Both type aliases work ("singlechoiceset" and "single-choice-set")

## Reference Files

**Development Guides:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/HandlerTemplate.ts`

**Example Handlers:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`

**H5P Package:**
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.SingleChoiceSet-1.11.h5p`

## Notes

- SingleChoiceSet presents ONE question at a time (slideshow format)
- First answer in array is ALWAYS correct (critical for H5P structure)
- Distractors are shuffled but correct answer stays at index 0
- Sound effects provide audio feedback for correct/incorrect answers
- Auto-continue feature automatically advances to next question
- Pass percentage determines if user "passes" the set
- Support both "singlechoiceset" and "single-choice-set" type names for flexibility
- Follow exact patterns from Accordion/Summary implementations for consistency
