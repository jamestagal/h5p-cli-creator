# Task Breakdown: H5P.Summary Handlers Implementation

## Overview
Total Tasks: 48 sub-tasks across 4 task groups

This feature implements manual and AI-generated handlers for H5P.Summary content type, enabling Interactive Books to include statement-selection exercises where learners choose correct statements from multiple options.

**Critical Implementation Note:** First statement in each array is ALWAYS correct (H5P.Summary requirement)

## Task List

### Phase 1: Manual Summary Handler (Embedded)

#### Task Group 1: SummaryHandler Implementation
**Dependencies:** None

- [ ] 1.0 Complete manual Summary handler
  - [ ] 1.1 Write 2-8 focused tests for SummaryHandler
    - Test getContentType() returns "summary"
    - Test validate() accepts valid content with questions array
    - Test validate() rejects missing questions array with descriptive error
    - Test validate() rejects empty questions array
    - Test validate() rejects questions without statements array
    - Test validate() rejects statements with < 2 items
    - Test process() builds correct H5P.Summary structure
    - Test getRequiredLibraries() returns ["H5P.Summary"]
  - [ ] 1.2 Create SummaryContent interface in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/SummaryHandler.ts`
    - Interface fields: type="summary", title (optional), intro (optional), questions array, labels (optional), feedback (optional)
    - Each question has: statements (string array), tip (optional string)
    - Labels object has all UI customization fields (solvedLabel, scoreLabel, etc.)
    - Feedback array has: from (number), to (number), feedback (string)
    - Add JSDoc comments with YAML example
  - [ ] 1.3 Implement SummaryHandler class structure
    - Implement ContentHandler interface
    - Add getContentType() method returning "summary"
    - Add getRequiredLibraries() method returning ["H5P.Summary"]
    - Add private generateSubContentId() method using timestamp-random pattern
    - Add private escapeHtml() method for text sanitization
  - [ ] 1.4 Implement validate() method with comprehensive checks
    - Validate questions array exists and is non-empty
    - Loop through each question to validate statements array exists
    - Validate each statements array has minimum 2 items
    - Validate all statements are non-empty strings
    - Validate hTag enum if provided (not applicable to Summary, but for consistency)
    - Return { valid: boolean; error?: string } with descriptive error messages
  - [ ] 1.5 Implement process() method to build H5P.Summary structure
    - Log verbose output: "Adding summary: [title] ([N] questions)"
    - Build H5P content object with library="H5P.Summary 1.0"
    - Build params object with intro (default: "Choose the correct statement.")
    - Build summaries array from questions, wrapping each statement in `<p>` tags with escapeHtml()
    - Add tip and subContentId to each summary object
    - Add all UI labels with defaults (solvedLabel, scoreLabel, resultLabel, etc.)
    - Add overallFeedback array with default or custom ranges
    - Add metadata object with title, license="U", contentType="Summary"
    - Call chapterBuilder.addCustomContent() with built structure
  - [ ] 1.6 Ensure SummaryHandler tests pass
    - Run ONLY the 2-8 tests written in 1.1
    - Verify validation logic works correctly
    - Verify H5P structure generation is correct
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 1.1 pass
- SummaryHandler validates content correctly with descriptive errors
- H5P.Summary structure generated matches expected format
- First statement in each summary array is positioned correctly (will be marked as correct)
- Default labels and feedback applied when not provided
- Custom labels and feedback used when provided

### Phase 2: AI Summary Handler

#### Task Group 2: AISummaryHandler Implementation
**Dependencies:** Task Group 1

- [ ] 2.0 Complete AI Summary handler
  - [ ] 2.1 Write 2-8 focused tests for AISummaryHandler
    - Test getContentType() returns "ai-summary"
    - Test validate() accepts valid content with prompt
    - Test validate() rejects missing prompt with descriptive error
    - Test validate() rejects invalid style enum ("invalid-style")
    - Test validate() rejects invalid questionCount (< 1)
    - Test validate() rejects invalid statementsPerQuestion (< 2)
    - Test process() calls AIPromptBuilder.resolveConfig() correctly
    - Test getRequiredLibraries() returns ["H5P.Summary"]
  - [ ] 2.2 Create AISummaryContent interface in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AISummaryHandler.ts`
    - Interface fields: type="ai-summary", title (optional), prompt (required string)
    - Add questionCount (optional number, default 5)
    - Add statementsPerQuestion (optional number, default 3, minimum 2)
    - Add style (optional: "true-false" | "multiple-choice" | "mixed", default "multiple-choice")
    - Add aiConfig (optional: targetAudience, tone, customization)
    - Add JSDoc comments with YAML example showing AI generation
  - [ ] 2.3 Implement AISummaryHandler class structure
    - Implement ContentHandler interface
    - Add getContentType() method returning "ai-summary"
    - Add getRequiredLibraries() method returning ["H5P.Summary"]
    - Add private generateSubContentId() method
    - Add private escapeHtml() method
    - Add private stripHtml() method to remove AI-generated HTML tags
    - Add private getFallbackQuestions() method for AI failure handling
  - [ ] 2.4 Implement validate() method with AI-specific checks
    - Validate prompt field exists and is string
    - Validate questionCount is positive integer if provided
    - Validate statementsPerQuestion >= 2 if provided
    - Validate style is valid enum value if provided: "true-false", "multiple-choice", "mixed"
    - Return { valid: boolean; error?: string } with descriptive error messages
  - [ ] 2.5 Implement process() method with AI integration
    - Log verbose output: "Generating AI summary: [title]", prompt, questionCount
    - Call generateSummaryQuestions() to get AI-generated questions
    - Build H5P.Summary structure same as SummaryHandler
    - Use default labels and feedback (no custom options for AI version)
    - Call chapterBuilder.addCustomContent() with built structure
  - [ ] 2.6 Implement generateSummaryQuestions() private method
    - Use AIPromptBuilder.resolveConfig() for hierarchical config (item > chapter > book)
    - Use AIPromptBuilder.buildSystemPrompt() for reading level and tone
    - Build style-specific instructions based on style parameter
      - "true-false": Exactly 2 statements (1 correct, 1 incorrect)
      - "multiple-choice": 3-4 statements (1 correct, 2-3 incorrect)
      - "mixed": Vary statement count across questions
    - Build user prompt requesting JSON array of questions with correct statement first
    - Call quizGenerator.generateRawContent(systemPrompt, userPrompt)
    - Strip markdown code fences (```json blocks) from response
    - Parse JSON response into questions array
    - Strip HTML from each statement using stripHtml()
    - Validate structure (each question has statements array with correct statement first)
    - Return cleaned questions array
  - [ ] 2.7 Implement stripHtml() method
    - Remove `<p>` and `</p>` tags
    - Replace `<br>` tags with space
    - Remove all other HTML tags
    - Return cleaned text (will be wrapped in `<p>` tags in process())
  - [ ] 2.8 Implement getFallbackQuestions() method for AI failure
    - Return single question with 2 statements
    - First statement: "AI generation failed for prompt: [prompt]"
    - Second statement: "Please check your API key and try again."
    - Log warning about AI failure
  - [ ] 2.9 Ensure AISummaryHandler tests pass
    - Run ONLY the 2-8 tests written in 2.1
    - Verify AI integration logic is correct
    - Verify style parameter handling works
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.1 pass
- AISummaryHandler validates AI-specific fields correctly
- AIPromptBuilder integration works for config hierarchy
- Style parameter controls question structure correctly
- HTML is stripped from AI responses before wrapping in tags
- Fallback questions provided on AI generation failure
- Generated questions have correct statement first in array

### Phase 3: Type System Integration & Registration

#### Task Group 3: TypeScript Types and Handler Registration
**Dependencies:** Task Groups 1-2

- [ ] 3.0 Complete type system integration and registration
  - [ ] 3.1 Update ContentType union in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/YamlInputParser.ts`
    - Add "summary" to ContentType union
    - Add "ai-summary" to ContentType union
    - Update line ~9: `export type ContentType = "text" | "image" | "audio" | "ai-text" | "ai-quiz" | "flashcards" | "dialogcards" | "accordion" | "ai-accordion" | "summary" | "ai-summary";`
  - [ ] 3.2 Export handler interfaces in YamlInputParser.ts
    - Add after line ~140: `export { SummaryContent } from "../handlers/embedded/SummaryHandler";`
    - Add: `export { AISummaryContent } from "../handlers/ai/AISummaryHandler";`
  - [ ] 3.3 Add to AnyContentItem union in YamlInputParser.ts
    - Add to union around line ~153: `| import("../handlers/embedded/SummaryHandler").SummaryContent`
    - Add: `| import("../handlers/ai/AISummaryHandler").AISummaryContent`
  - [ ] 3.4 Add validation cases in validateContentItem() method
    - Update validTypes array around line ~421 to include "summary" and "ai-summary"
    - Add case in switch statement around line ~434:
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
  - [ ] 3.5 Register handlers in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts`
    - Add imports at top: `import { SummaryHandler } from "../../handlers/embedded/SummaryHandler";`
    - Add: `import { AISummaryHandler } from "../../handlers/ai/AISummaryHandler";`
    - Register SummaryHandler after other embedded handlers in runInteractiveBookAI method
    - Register AISummaryHandler after other AI handlers
    - Maintain registration order: core handlers, embedded handlers, AI handlers
  - [ ] 3.6 Verify type safety throughout compilation chain
    - Ensure TypeScript compiles without errors
    - Test that YamlInputParser validates both content types correctly
    - Test that handlers are discovered by HandlerRegistry

**Acceptance Criteria:**
- TypeScript compiles without type errors
- Both "summary" and "ai-summary" recognized as valid content types
- YamlInputParser validates both types with descriptive errors
- Handlers registered and discoverable in interactive-book-ai-module
- No type safety issues in handler processing chain

### Phase 4: Testing & Documentation

#### Task Group 4: Comprehensive Testing and Documentation
**Dependencies:** Task Groups 1-3

- [ ] 4.0 Complete testing and documentation
  - [ ] 4.1 Review existing tests from Task Groups 1-2
    - Review 2-8 SummaryHandler tests from Task 1.1
    - Review 2-8 AISummaryHandler tests from Task 2.1
    - Total existing tests: approximately 4-16 tests
  - [ ] 4.2 Analyze test coverage gaps for Summary handlers only
    - Identify critical workflows lacking coverage:
      - End-to-end: YAML parsing → handler processing → H5P package generation
      - Integration: Multiple summary questions in one chapter
      - Edge cases: Empty statements, special characters, long text
      - AI styles: Verify true-false, multiple-choice, mixed generate correctly
      - Fallback: Verify graceful degradation when AI fails
    - Focus ONLY on Summary feature requirements
    - Prioritize integration and end-to-end tests over unit test gaps
  - [ ] 4.3 Write up to 10 additional strategic tests maximum
    - Create `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/tests/integration/summary-handler.test.ts`
    - Test end-to-end: Parse YAML with summary → generate .h5p → verify structure
    - Test manual summary with custom labels and feedback
    - Test AI summary with "true-false" style (2 statements per question)
    - Test AI summary with "multiple-choice" style (3-4 statements)
    - Test AI summary with "mixed" style (varying statements)
    - Test AI configuration hierarchy (item > chapter > book defaults)
    - Test special characters in statements are escaped correctly
    - Test AI generation fallback on failure
    - Test multiple summary sections in single chapter
    - Test validation errors propagate correctly
    - Maximum 10 tests total - DO NOT exceed this limit
  - [ ] 4.4 Add Summary examples to `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/examples/comprehensive-demo.yaml`
    - Add new chapter titled "Summary Exercises"
    - Add manual summary example with 3 questions, custom labels, tips
    - Add AI summary with "multiple-choice" style, questionCount=5
    - Add AI summary with "true-false" style, questionCount=3
    - Add AI summary with "mixed" style demonstrating variety
    - Use diverse topics (science, history, math) to showcase versatility
  - [ ] 4.5 Create dedicated example file `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/examples/yaml/summary-example.yaml`
    - Complete Interactive Book focused on Summary demonstrations
    - Chapter 1: Manual summary examples (basic, custom labels, feedback ranges)
    - Chapter 2: AI summary examples (all three styles, varying configs)
    - Chapter 3: Mixed content showing summaries integrated with text/images
    - Include comprehensive comments explaining each feature
    - Demonstrate aiConfig at book, chapter, and item levels
  - [ ] 4.6 Update `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/README.md`
    - Add Summary to "Supported Content Types" section
    - Add table row with: Name="Summary", Type="Embedded", Manual="Yes", AI="Yes", Description="Statement selection exercises"
    - Add "Summary Content" subsection under Interactive Books
    - Include manual YAML example (2-3 questions with tips)
    - Include AI YAML example (showing style parameter and aiConfig)
    - Explain first-statement-is-correct requirement
    - Explain style parameter options (true-false, multiple-choice, mixed)
    - Add to table of contents
  - [ ] 4.7 Run feature-specific tests only
    - Run tests from tasks 1.1, 2.1, and 4.3
    - Expected total: approximately 14-34 tests maximum
    - Verify all critical Summary workflows pass
    - Do NOT run entire application test suite
    - Fix any failing tests before proceeding
  - [ ] 4.8 Manual integration testing
    - Build project: `npm run build`
    - Generate .h5p from comprehensive-demo.yaml: `node ./dist/modules/ai/interactive-book-ai-cli.js examples/comprehensive-demo.yaml output-summary-test.h5p`
    - Generate .h5p from summary-example.yaml: `node ./dist/modules/ai/interactive-book-ai-cli.js examples/yaml/summary-example.yaml output-summary-example.h5p`
    - Upload both .h5p files to h5p.com and verify they load without errors
    - Verify manual summary displays correctly with all questions
    - Verify AI summary generates appropriate questions for each style
    - Verify tips display when provided
    - Verify custom labels appear correctly
    - Verify feedback ranges work based on score
    - Test interaction: Select statements and verify correct/incorrect feedback
    - Verify first statement in each question is marked as correct by H5P.Summary

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 14-34 tests total)
- No more than 10 additional tests added in task 4.3
- comprehensive-demo.yaml includes Summary examples in new chapter
- summary-example.yaml created with comprehensive demonstrations
- README.md updated with Summary documentation and examples
- Generated .h5p packages upload successfully to h5p.com
- Summary content displays and functions correctly in Interactive Books
- Manual summaries work with custom labels and feedback
- AI summaries generate appropriate questions for each style
- Tips display correctly when provided
- First statement in each array functions as correct answer
- Special characters handled safely (no XSS vulnerabilities)

## Execution Order

Recommended implementation sequence:
1. Manual Summary Handler (Task Group 1) - Foundation for understanding H5P.Summary structure
2. AI Summary Handler (Task Group 2) - Builds on manual handler patterns with AI integration
3. Type System Integration (Task Group 3) - Makes both handlers available in compiler
4. Testing & Documentation (Task Group 4) - Validates implementation and provides user guidance

## Implementation Notes

### Critical H5P.Summary Requirements
- **First statement is ALWAYS correct**: This is a fundamental H5P.Summary requirement. The first element in each `summary` array is treated as the correct answer by the H5P.Summary library.
- **Statement structure**: Each statement must be wrapped in `<p>` tags after HTML escaping/stripping
- **SubContentId**: Each summary object needs a unique subContentId using timestamp-random pattern

### Default Values Reference
```typescript
// Default intro text
intro: "Choose the correct statement."

// Default UI labels
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

// Default feedback
[
  {
    from: 0,
    to: 100,
    feedback: "You got @score of @total statements (@percent %) correct."
  }
]

// Default AI parameters
questionCount: 5
statementsPerQuestion: 3
style: "multiple-choice"
```

### AI Style Parameter Behavior
- **"true-false"**: Generate questions with exactly 2 statements (1 correct, 1 incorrect) - ideal for binary choices
- **"multiple-choice"**: Generate questions with 3-4 statements (1 correct, 2-3 incorrect) - standard quiz format
- **"mixed"**: Vary number of statements across questions (2-4 statements) - creates variety and unpredictability

Style parameter controls **content structure** (number of statements), separate from `aiConfig` which controls **AI behavior** (reading level, tone, customization).

### HTML Safety Requirements
- **Manual handler**: Use `escapeHtml()` on all user-provided text to prevent XSS attacks
- **AI handler**: Use `stripHtml()` to remove AI-generated HTML before wrapping in `<p>` tags
- **Never trust AI output**: Always strip HTML from AI responses as safety net, then add our own controlled tags

### Testing Strategy
- **Focused unit tests**: Each task group writes 2-8 tests maximum covering critical behaviors
- **Integration tests**: Task 4.3 adds maximum 10 strategic tests for end-to-end workflows
- **Manual testing**: Essential for verifying .h5p packages work on actual H5P platforms
- **No exhaustive coverage**: Skip edge cases and minor variations unless business-critical

### Reference Files for Implementation
- **Pattern reference**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- **AI pattern reference**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`
- **Type system**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/YamlInputParser.ts`
- **Registration**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts`
- **H5P package**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/content-type-cache/H5P.Summary-1.10.h5p` (examine content.json structure)

## Dependencies & Libraries

Both handlers must declare `getRequiredLibraries()` returning `["H5P.Summary"]`. The LibraryRegistry will automatically resolve these H5P.Summary dependencies:
- H5P.Question 1.5
- H5P.JoubelUI 1.3
- H5P.Transition 1.0
- H5P.FontIcons 1.0
- FontAwesome 4.5
