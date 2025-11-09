# Task Breakdown: SingleChoiceSet Handler Implementation

## Overview

Implement handlers for H5P.SingleChoiceSet content type following the established handler architecture patterns. This feature enables content creators to add single-choice quiz questions to Interactive Books using both manually-defined questions and AI-generated questions.

**Total Estimated Tasks:** 34 focused tasks organized into 4 phases

**Critical Requirements:**
- First answer in answers array MUST be correct (index 0)
- Support both "singlechoiceset" and "single-choice-set" type aliases
- Follow AccordionHandler validation patterns
- Follow AIAccordionHandler AI integration patterns
- Integrate with Universal AI Configuration system

## Task List

---

### Phase 1: Manual SingleChoiceSet Handler (Foundation)

**Dependencies:** None

**Purpose:** Build the foundation handler for manually-defined single-choice questions. This establishes the core validation, H5P structure generation, and correct answer placement logic that the AI handler will leverage.

#### Task Group 1.1: Handler Implementation

- [x] 1.0 Implement SingleChoiceSetHandler foundation
  - [x] 1.1 Write 2-8 focused tests for SingleChoiceSetHandler
    - Test getContentType() returns "singlechoiceset"
    - Test validate() accepts valid content structure
    - Test validate() rejects missing/empty questions array
    - Test validate() rejects questions missing correctAnswer
    - Test validate() rejects questions with empty distractors
    - Test process() places correct answer at index 0
    - Test getRequiredLibraries() returns ["H5P.SingleChoiceSet"]
    - **LIMIT: Maximum 8 tests for core functionality only**

  - [x] 1.2 Create SingleChoiceSetHandler file
    - Location: `/home/user/h5p-cli-creator/src/handlers/embedded/SingleChoiceSetHandler.ts`
    - Export SingleChoiceSetContent interface with questions array structure
    - Export SingleChoiceSetHandler class implementing ContentHandler
    - Reference pattern: `/home/user/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`

  - [x] 1.3 Implement getContentType() method
    - Return "singlechoiceset" as primary type identifier
    - Follow exact pattern from AccordionHandler

  - [x] 1.4 Implement validate() method
    - Validate questions array exists, is array, has length > 0
    - Validate each question has: question (string), correctAnswer (string), distractors (array)
    - Validate distractors array has minimum 1 element
    - Validate all string fields are non-empty
    - Validate optional behaviour fields: passPercentage (0-100), timeout values (positive integers)
    - Return {valid: true} or {valid: false, error: "message"}
    - Follow AccordionHandler validation pattern for array iteration

  - [x] 1.5 Implement process() method
    - Build H5P choices array with correct answer ALWAYS at index 0
    - Map simplified format {question, correctAnswer, distractors} to H5P format
    - Generate unique subContentId for each question using generateSubContentId()
    - Apply default behaviour values (timeoutCorrect=1000, soundEffectsEnabled=true, etc.)
    - Apply default l10n labels (showSolutionButtonLabel, retryButtonLabel, etc.)
    - Apply default overallFeedback array
    - Call chapterBuilder.addCustomContent() with H5P structure
    - Follow AccordionHandler pattern for escapeHtml() usage

  - [x] 1.6 Implement getRequiredLibraries() method
    - Return ["H5P.SingleChoiceSet"]
    - LibraryRegistry will auto-resolve dependencies (H5P.Question, H5P.JoubelUI, etc.)

  - [x] 1.7 Add helper method: generateSubContentId()
    - Generate unique UUID for each question's subContentId
    - Reuse pattern from AccordionHandler if available

  - [x] 1.8 Ensure SingleChoiceSetHandler tests pass
    - Run ONLY the 2-8 tests written in task 1.1
    - Verify correct answer placement at index 0
    - Verify default behaviour and labels applied
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 1.1 pass
- SingleChoiceSetHandler validates questions structure correctly
- Correct answer consistently placed at index 0 of answers array
- Default behaviour and labels applied when not provided in YAML
- getRequiredLibraries() returns correct library dependency

---

### Phase 2: AI SingleChoiceSet Handler (AI Integration)

**Dependencies:** Phase 1 (Task Group 1.1)

**Purpose:** Implement AI-generated single-choice questions using QuizGenerator and AIPromptBuilder. This builds on the foundation handler's H5P structure generation.

#### Task Group 2.1: AI Handler Implementation

- [x] 2.0 Implement AISingleChoiceSetHandler with AI integration
  - [x] 2.1 Write 2-8 focused tests for AISingleChoiceSetHandler
    - Test getContentType() returns "ai-singlechoiceset"
    - Test validate() accepts valid AI content with prompt
    - Test validate() rejects missing prompt field
    - Test validate() rejects invalid difficulty enum
    - Test process() calls QuizGenerator.generateRawContent()
    - Test process() strips HTML from AI responses
    - Test process() provides fallback on AI failure
    - **LIMIT: Maximum 8 tests for core AI functionality only**

  - [x] 2.2 Create AISingleChoiceSetHandler file
    - Location: `/home/user/h5p-cli-creator/src/handlers/ai/AISingleChoiceSetHandler.ts`
    - Export AISingleChoiceSetContent interface with prompt and AI config
    - Export AISingleChoiceSetHandler class implementing ContentHandler
    - Import AIPromptBuilder and QuizGenerator
    - Reference pattern: `/home/user/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`

  - [x] 2.3 Implement getContentType() method
    - Return "ai-singlechoiceset" as primary type identifier

  - [x] 2.4 Implement validate() method
    - Validate prompt field exists and is string
    - Validate questionCount is positive integer if provided
    - Validate distractorsPerQuestion is 1+ if provided
    - Validate difficulty enum ("easy" | "medium" | "hard") if provided
    - Follow AIAccordionHandler validation pattern

  - [x] 2.5 Implement process() method with AI generation
    - Use AIPromptBuilder.resolveConfig() for hierarchical config merging
    - Use AIPromptBuilder.buildSystemPrompt() for reading level instructions
    - Build user prompt specifying questionCount, distractorsPerQuestion, topic
    - Call QuizGenerator.generateRawContent(systemPrompt, userPrompt)
    - Parse AI response as JSON array: [{question, correctAnswer, distractors}]
    - Strip HTML from AI responses using stripHtml() before processing
    - Transform to H5P structure with correct answer at index 0
    - Wrap in try-catch with fallback to text page on AI failure
    - Follow AIAccordionHandler pattern for error handling

  - [x] 2.6 Implement difficulty level mapping
    - Map difficulty to distractor count hints in user prompt:
      - "easy": Request 2 distractors (3 total options)
      - "medium": Request 3 distractors (4 total options)
      - "hard": Request 4+ distractors (5+ total options)
    - Override distractorsPerQuestion parameter if difficulty provided

  - [x] 2.7 Implement getRequiredLibraries() method
    - Return ["H5P.SingleChoiceSet"]

  - [x] 2.8 Add helper method: stripHtml()
    - Strip HTML tags from AI-generated text before wrapping in H5P structure
    - Reuse pattern from AIAccordionHandler

  - [x] 2.9 Ensure AISingleChoiceSetHandler tests pass
    - Run ONLY the 2-8 tests written in task 2.1
    - Verify AI integration calls QuizGenerator correctly
    - Verify HTML stripping safety net works
    - Verify fallback behavior on AI failure
    - Do NOT run entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.1 pass
- AISingleChoiceSetHandler generates questions using AI
- AIPromptBuilder integration works correctly
- Difficulty levels affect distractor count appropriately
- HTML stripping safety net prevents XSS
- Fallback to text page works on AI generation failure

---

### Phase 3: Type System Integration

**Dependencies:** Phase 1 and Phase 2

**Purpose:** Integrate both handlers into the type system, YAML parser, and handler registry to enable end-to-end usage.

#### Task Group 3.1: YamlInputParser Type Updates

- [x] 3.0 Update type system for SingleChoiceSet support
  - [x] 3.1 Update ContentType union in YamlInputParser
    - File: `/home/user/h5p-cli-creator/src/compiler/YamlInputParser.ts`
    - Add to ContentType union: `"singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set"`
    - Follow exact pattern from existing content types

  - [x] 3.2 Export SingleChoiceSet interfaces
    - Add: `export { SingleChoiceSetContent } from "../handlers/embedded/SingleChoiceSetHandler";`
    - Add: `export { AISingleChoiceSetContent } from "../handlers/ai/AISingleChoiceSetHandler";`

  - [x] 3.3 Update AnyContentItem union
    - Add: `| import("../handlers/embedded/SingleChoiceSetHandler").SingleChoiceSetContent`
    - Add: `| import("../handlers/ai/AISingleChoiceSetHandler").AISingleChoiceSetContent`

  - [x] 3.4 Add validation cases in validateContentItem()
    - Add case for "singlechoiceset" and "single-choice-set":
      - Validate questions array exists and non-empty
      - Validate each question has required fields
    - Add case for "ai-singlechoiceset" and "ai-single-choice-set":
      - Validate prompt field exists and is string
    - Follow validation pattern from accordion cases

  - [x] 3.5 Add to validTypes array
    - Add "singlechoiceset", "single-choice-set", "ai-singlechoiceset", "ai-single-choice-set" to validTypes

#### Task Group 3.2: Handler Registration

- [x] 3.6 Register handlers in InteractiveBookAIModule
  - File: `/home/user/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts`
  - Import SingleChoiceSetHandler from handlers/embedded
  - Import AISingleChoiceSetHandler from handlers/ai
  - Register SingleChoiceSetHandler after DialogCardsHandler
  - Register AISingleChoiceSetHandler after AIAccordionHandler
  - Maintain consistent registration order: core, embedded, AI handlers

**Acceptance Criteria:**
- TypeScript compiler reports no type errors
- Both "singlechoiceset" and "single-choice-set" type aliases work
- Both "ai-singlechoiceset" and "ai-single-choice-set" type aliases work
- YAML validation catches missing required fields
- Handlers are properly registered and discoverable

---

### Phase 4: Testing, Integration & Documentation

**Dependencies:** Phases 1, 2, and 3

**Purpose:** Fill critical testing gaps, create integration examples, update documentation, and verify end-to-end functionality.

#### Task Group 4.1: Test Coverage Review & Gap Analysis

- [x] 4.0 Review test coverage and fill critical gaps
  - [x] 4.1 Review existing tests from previous phases
    - Review 2-8 tests from SingleChoiceSetHandler (Task 1.1)
    - Review 2-8 tests from AISingleChoiceSetHandler (Task 2.1)
    - Total existing: approximately 4-16 tests

  - [x] 4.2 Analyze test coverage gaps for SingleChoiceSet feature ONLY
    - Identify critical gaps in handler integration
    - Identify critical gaps in type alias handling
    - Identify critical gaps in YAML validation
    - Focus ONLY on SingleChoiceSet feature workflows
    - Do NOT assess entire application test coverage

  - [ ] 4.3 Write up to 10 additional strategic tests maximum
    - Test both type aliases work for manual handler ("singlechoiceset" and "single-choice-set")
    - Test both type aliases work for AI handler ("ai-singlechoiceset" and "ai-single-choice-set")
    - Test custom behaviour settings are preserved
    - Test custom labels are preserved
    - Test questionCount parameter controls number of questions generated
    - Test distractorsPerQuestion parameter controls distractor count
    - Test end-to-end integration with ChapterBuilder
    - **LIMIT: Maximum 10 additional tests to fill critical gaps only**
    - **DO NOT write comprehensive coverage for all scenarios**

  - [x] 4.4 Run feature-specific tests only
    - Run ONLY tests related to SingleChoiceSet handlers
    - Expected total: approximately 14-26 tests maximum
    - Do NOT run entire application test suite
    - Verify all SingleChoiceSet tests pass

#### Task Group 4.2: Integration Examples

- [x] 4.5 Add SingleChoiceSet to comprehensive-demo.yaml
  - File: `/home/user/h5p-cli-creator/examples/yaml/comprehensive-demo.yaml`
  - Add new chapter: "Single Choice Questions"
  - Add manual SingleChoiceSet example with 3-4 questions
  - Add AI-generated SingleChoiceSet example with prompt and parameters
  - Include both behaviour customization and default usage
  - Follow existing chapter patterns in comprehensive-demo.yaml

  - [x] 4.6 Create standalone singlechoiceset-example.yaml
    - File: `/home/user/h5p-cli-creator/examples/yaml/singlechoiceset-example.yaml`
    - Include comprehensive manual SingleChoiceSet example
    - Include comprehensive AI-generated SingleChoiceSet example
    - Show all optional parameters (behaviour, labels, feedback)
    - Show difficulty levels (easy, medium, hard)
    - Include aiConfig override examples
    - Add inline comments explaining each parameter

  - [ ] 4.7 Test .h5p package generation
    - Build .h5p from comprehensive-demo.yaml
    - Verify package builds without errors
    - Verify SingleChoiceSet content is included
    - Check content.json structure for correct answer at index 0

#### Task Group 4.3: Documentation Updates

- [x] 4.8 Update README.md
  - File: `/home/user/h5p-cli-creator/README.md`
  - Add SingleChoiceSet to "Supported Content Types" table
  - Description: "Single-choice quiz questions with multiple answers (only one correct)"
  - Add manual YAML example in appropriate section
  - Add AI-generated YAML example in AI content section
  - Explain correct answer placement requirement
  - Mention support for both type aliases

  - [x] 4.9 Create inline code documentation
    - Add comprehensive JSDoc comments to SingleChoiceSetHandler class
    - Add comprehensive JSDoc comments to AISingleChoiceSetHandler class
    - Document SingleChoiceSetContent interface fields
    - Document AISingleChoiceSetContent interface fields
    - Include YAML usage examples in JSDoc
    - Follow documentation style from AccordionHandler

#### Task Group 4.4: Manual Validation Testing

- [ ] 4.10 Perform manual validation on h5p.com
  - Build .h5p package from comprehensive-demo.yaml
  - Upload to h5p.com platform
  - Navigate to "Single Choice Questions" chapter
  - Click through single-choice quiz questions
  - Verify single-choice selection works (radio button behavior)
  - Verify correct/incorrect feedback displays
  - Verify retry button functionality
  - Verify show solution button functionality
  - Verify autoContinue advances to next question
  - Verify pass/fail messaging based on passPercentage
  - Verify sound effects (if enabled)
  - Test both manual and AI-generated SingleChoiceSet instances

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 14-26 tests total)
- No more than 10 additional tests added beyond phases 1-2
- comprehensive-demo.yaml includes working SingleChoiceSet examples
- singlechoiceset-example.yaml created with comprehensive examples
- README.md updated with clear documentation and examples
- Generated .h5p packages upload to h5p.com without errors
- SingleChoiceSet questions display and function correctly in Interactive Book viewer
- Single-choice selection works with radio button behavior
- Correct/incorrect feedback displays appropriately
- All interactive features work (retry, show solution, autoContinue)

---

## Execution Order

Recommended implementation sequence:

1. **Phase 1: Manual SingleChoiceSet Handler (Foundation)** - Establish core validation and H5P structure generation
2. **Phase 2: AI SingleChoiceSet Handler (AI Integration)** - Add AI generation capability
3. **Phase 3: Type System Integration** - Wire up handlers to parser and registry
4. **Phase 4: Testing, Integration & Documentation** - Fill testing gaps, create examples, document

**Why this order?**
- Manual handler first establishes the H5P structure generation patterns
- AI handler reuses the structure generation from manual handler
- Type system integration enables both handlers to work end-to-end
- Testing phase verifies complete integration and fills any coverage gaps

---

## Key Implementation Notes

### Critical Requirements

1. **Correct Answer Placement (CRITICAL)**
   - The first element (index 0) in the answers array MUST be the correct answer
   - This is a fundamental H5P.SingleChoiceSet requirement
   - Distractors follow after the correct answer
   - Test this explicitly in validation tests

2. **Type Alias Support**
   - Support both "singlechoiceset" and "single-choice-set" for manual handler
   - Support both "ai-singlechoiceset" and "ai-single-choice-set" for AI handler
   - Both aliases must work identically in YAML validation and handler registration

3. **Default Values**
   - Provide sensible defaults for all optional fields
   - behaviour: timeoutCorrect=1000, timeoutWrong=1000, soundEffectsEnabled=true, etc.
   - l10n labels: showSolutionButtonLabel, retryButtonLabel, correctText, incorrectText
   - overallFeedback: Default range 0-100 with message template

4. **AI Integration Pattern**
   - Use AIPromptBuilder.resolveConfig() for config hierarchy
   - Use AIPromptBuilder.buildSystemPrompt() for system prompt
   - Use QuizGenerator.generateRawContent() for AI generation
   - Strip HTML from AI responses before processing
   - Provide fallback content on AI failure

5. **Testing Constraints**
   - Each development phase writes 2-8 focused tests maximum
   - Test ONLY critical behaviors, not exhaustive coverage
   - Testing gap analysis phase adds maximum 10 additional tests
   - Total expected: 14-26 tests for entire feature

### Reference Patterns

**Validation Pattern:**
```typescript
// From AccordionHandler - array validation
if (!item.panels || !Array.isArray(item.panels)) {
  return { valid: false, error: "requires 'panels' array" };
}

// Iterate and validate each element
for (let i = 0; i < item.panels.length; i++) {
  const panel = item.panels[i];
  if (!panel.title) {
    return { valid: false, error: `Panel ${i + 1} missing 'title'` };
  }
}
```

**AI Integration Pattern:**
```typescript
// From AIAccordionHandler - AI generation
const resolvedConfig = AIPromptBuilder.resolveConfig(
  item.aiConfig,
  context.chapterAIConfig,
  context.bookAIConfig
);

const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);
const userPrompt = `Generate ${panelCount} accordion panels about ${item.prompt}`;

const rawResponse = await context.quizGenerator.generateRawContent(
  systemPrompt,
  userPrompt
);
```

**H5P Structure Pattern:**
```typescript
// Transform simplified format to H5P structure
const choices = item.questions.map((q) => ({
  question: escapeHtml(q.question),
  answers: [
    escapeHtml(q.correctAnswer),  // Index 0 is ALWAYS correct
    ...q.distractors.map(d => escapeHtml(d))
  ],
  subContentId: generateSubContentId()
}));
```

---

## Success Metrics

- [x] SingleChoiceSetHandler validates and processes manual questions correctly
- [x] AISingleChoiceSetHandler generates questions using AI with appropriate difficulty
- [x] Correct answer consistently placed at index 0 in answers array (verified in tests)
- [ ] All feature-specific tests pass (14-26 tests total)
- [ ] comprehensive-demo.yaml includes working examples of both handlers
- [ ] singlechoiceset-example.yaml created with comprehensive examples
- [ ] Generated .h5p packages upload to h5p.com without errors
- [ ] SingleChoiceSet questions display and function correctly in Interactive Book
- [ ] Single-choice selection works (radio button behavior)
- [ ] Correct/incorrect feedback displays appropriately
- [ ] Both type aliases ("singlechoiceset" and "single-choice-set") work correctly
- [ ] AI generation respects difficulty and produces appropriate distractor counts
- [ ] Fallback mechanism activates when AI generation fails
- [ ] README.md updated with clear examples and documentation
- [ ] TypeScript compiler reports no type errors related to new handlers
