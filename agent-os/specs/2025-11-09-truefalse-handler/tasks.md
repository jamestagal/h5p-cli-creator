# Task Breakdown: TrueFalse Handler Implementation

## Overview
Total Task Groups: 4
Estimated Total Tests: 31+ unit tests

## Task List

### Phase 1: Manual TrueFalse Handler (Embedded)

#### Task Group 1: Manual Handler Foundation
**Dependencies:** None
**Focus:** Implement TrueFalseHandler with proper boolean-to-string conversion

- [ ] 1.0 Complete manual TrueFalse handler implementation
  - [ ] 1.1 Write 6-8 focused tests for TrueFalseHandler
    - Test getContentType() returns "truefalse"
    - Test validate() accepts valid content (question + correct)
    - Test validate() rejects missing required fields
    - Test validate() rejects non-boolean correct field
    - Test process() converts boolean to string for correct field (CRITICAL)
    - Test process() wraps question text in `<p>` tags
    - Test process() escapes HTML in question text
    - Test getRequiredLibraries() returns ["H5P.TrueFalse"]
  - [ ] 1.2 Create TrueFalseContent interface in TrueFalseHandler.ts
    - Define type: "truefalse" | "true-false"
    - Define required fields: question (string), correct (boolean)
    - Define optional fields: title, media, behaviour, labels
    - Define media object structure: path, type, alt, disableZooming
    - Add JSDoc comments with YAML examples
    - Follow AccordionContent interface pattern exactly
  - [ ] 1.3 Implement TrueFalseHandler class skeleton
    - Create class in `src/handlers/embedded/TrueFalseHandler.ts`
    - Implement ContentHandler interface
    - Add getContentType() returning "truefalse"
    - Add getRequiredLibraries() returning ["H5P.TrueFalse"]
    - Add helper methods: escapeHtml(), generateSubContentId()
    - Copy exact pattern from AccordionHandler.ts
  - [ ] 1.4 Implement validate() method with comprehensive validation
    - Validate question field (required string)
    - Validate correct field (required boolean) - CRITICAL
    - Validate media.path (string if media provided)
    - Validate media.type enum ("image" | "video" | "audio")
    - Validate behaviour boolean fields
    - Validate feedback strings (max 2048 chars)
    - Return clear error messages for each failure
    - Follow AccordionHandler validation pattern
  - [ ] 1.5 Implement process() method with H5P structure generation
    - Extract question and correct from content item
    - Convert boolean correct to string "true" or "false" - CRITICAL
    - Wrap question text in `<p>` tags with HTML escaping
    - Build default behaviour object (enableRetry: true, etc.)
    - Merge user-provided behaviour with defaults
    - Build default labels (l10n) with complete set
    - Build default confirmation dialogs
    - Call chapterBuilder.addCustomContent() with H5P structure
    - Add verbose logging for debugging
  - [ ] 1.6 Ensure TrueFalseHandler tests pass
    - Run ONLY the 6-8 tests written in 1.1
    - Verify boolean-to-string conversion works correctly
    - Verify question wrapping and HTML escaping
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 6-8 tests written in 1.1 pass
- Boolean correct field converts to string "true"/"false"
- Question text wrapped in `<p>` tags and HTML-escaped
- Validation catches all required field violations
- Default behaviour and labels properly merged

---

### Phase 2: Media Support and Advanced Features

#### Task Group 2: Media Handling
**Dependencies:** Task Group 1
**Focus:** Add support for optional image/video/audio media above questions

- [ ] 2.0 Complete media support for TrueFalse
  - [ ] 2.1 Write 4-6 focused tests for media handling
    - Test validate() accepts valid media object
    - Test validate() rejects invalid media.type enum
    - Test process() handles image media correctly
    - Test process() handles video media correctly
    - Test process() handles audio media correctly
    - Test process() includes disableImageZooming only for images
  - [ ] 2.2 Extend validate() with media validation
    - Validate media.path is string if media provided
    - Validate media.type is valid enum if provided
    - Validate media.alt is string if provided
    - Validate media.disableZooming is boolean if provided
    - Add clear error messages for media validation failures
  - [ ] 2.3 Implement media processing in process() method
    - Resolve media file path using context.basePath
    - Determine media type from extension if not provided
    - Generate H5P.Image structure for image media
    - Generate H5P.Video structure for video media
    - Generate H5P.Audio structure for audio media
    - Include disableImageZooming only for H5P.Image
    - Generate unique subContentId for media
    - Add media object to H5P params structure
    - Follow media handling pattern from other handlers
  - [ ] 2.4 Ensure media tests pass
    - Run ONLY the 4-6 tests written in 2.1
    - Verify each media type generates correct H5P structure
    - Verify disableImageZooming only present for images
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 4-6 tests written in 2.1 pass
- Image, video, and audio media all generate correct H5P structures
- disableImageZooming parameter only included for images
- Media file paths resolved correctly relative to YAML file

---

### Phase 3: AI-Powered TrueFalse Handler

#### Task Group 3: AI Handler Implementation
**Dependencies:** Task Group 1, Task Group 2
**Focus:** Implement AITrueFalseHandler with AIPromptBuilder integration

- [ ] 3.0 Complete AI-powered TrueFalse handler
  - [ ] 3.1 Write 6-8 focused tests for AITrueFalseHandler
    - Test getContentType() returns "ai-truefalse"
    - Test validate() accepts valid AI content (prompt)
    - Test validate() rejects missing prompt field
    - Test validate() rejects invalid difficulty enum
    - Test validate() rejects invalid questionCount (non-positive)
    - Test process() generates questions with AI
    - Test process() converts AI boolean to string for H5P (CRITICAL)
    - Test getRequiredLibraries() returns ["H5P.TrueFalse"]
  - [ ] 3.2 Create AITrueFalseContent interface in AITrueFalseHandler.ts
    - Define type: "ai-truefalse" | "ai-true-false"
    - Define required field: prompt (string)
    - Define optional fields: title, questionCount, difficulty, aiConfig
    - Define difficulty enum: "easy" | "medium" | "hard"
    - Define aiConfig with Universal AI Configuration structure
    - Add JSDoc comments with YAML examples
    - Follow AIAccordionContent interface pattern
  - [ ] 3.3 Implement AITrueFalseHandler class skeleton
    - Create class in `src/handlers/ai/AITrueFalseHandler.ts`
    - Implement ContentHandler interface
    - Add getContentType() returning "ai-truefalse"
    - Add getRequiredLibraries() returning ["H5P.TrueFalse"]
    - Add helper methods: stripHtml(), escapeHtml(), generateSubContentId()
    - Copy exact pattern from AIAccordionHandler.ts
  - [ ] 3.4 Implement validate() method for AI content
    - Validate prompt field (required string)
    - Validate questionCount is positive integer if provided
    - Validate difficulty is valid enum if provided ("easy" | "medium" | "hard")
    - Validate aiConfig structure if provided
    - Return clear error messages for each failure
    - Follow AIAccordionHandler validation pattern
  - [ ] 3.5 Implement process() method with AI generation
    - Extract prompt, questionCount (default 5), difficulty from item
    - Use AIPromptBuilder.resolveConfig() to merge aiConfig hierarchy
    - Use AIPromptBuilder.buildSystemPrompt() for system prompt
    - Build user prompt requesting JSON array of questions
    - Include difficulty instructions in user prompt
    - Call quizGenerator.generateRawContent() with prompts
    - Log AI request in verbose mode
  - [ ] 3.6 Implement AI response processing
    - Strip markdown code blocks from AI response
    - Parse JSON array of question objects
    - Validate each question has "question" and "correct" fields
    - Strip HTML from AI-generated question text using stripHtml()
    - Convert boolean correct to string "true"/"false" - CRITICAL
    - Wrap question text in `<p>` tags with HTML escaping
    - Build complete H5P structure for each question
    - Call chapterBuilder.addCustomContent() for each question
  - [ ] 3.7 Implement fallback behavior for AI failures
    - Wrap AI generation in try-catch block
    - On failure, create single TrueFalse question with error text
    - Use question: "AI generation failed. Please check your configuration."
    - Use correct: "true" as safe default
    - Log error message clearly in verbose mode
    - Follow AIAccordionHandler fallback pattern
  - [ ] 3.8 Ensure AITrueFalseHandler tests pass
    - Run ONLY the 6-8 tests written in 3.1
    - Verify AI integration uses AIPromptBuilder correctly
    - Verify boolean-to-string conversion for AI responses
    - Verify fallback behavior on AI failure
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 6-8 tests written in 3.1 pass
- AI generates correct number of questions with proper structure
- AI responses properly converted to H5P format with string booleans
- Fallback creates valid TrueFalse content on AI failure
- AIPromptBuilder integration follows Universal AI Configuration

---

### Phase 4: Type System Integration and Registration

#### Task Group 4: TypeScript Integration and Handler Registration
**Dependencies:** Task Groups 1-3
**Focus:** Integrate with YamlInputParser type system and register handlers

- [ ] 4.0 Complete type system integration and registration
  - [ ] 4.1 Write 3-4 focused tests for type integration
    - Test YamlInputParser validates "truefalse" type
    - Test YamlInputParser validates "ai-truefalse" type
    - Test YamlInputParser rejects invalid TrueFalse content
    - Test YamlInputParser accepts both type aliases
  - [ ] 4.2 Update YamlInputParser ContentType union
    - Add "truefalse" to ContentType union in src/compiler/types.ts
    - Add "true-false" alias to ContentType union
    - Add "ai-truefalse" to ContentType union
    - Add "ai-true-false" alias to ContentType union
    - Maintain alphabetical ordering with other types
  - [ ] 4.3 Export interfaces from YamlInputParser
    - Add export statement: `export { TrueFalseContent } from "../handlers/embedded/TrueFalseHandler"`
    - Add export statement: `export { AITrueFalseContent } from "../handlers/ai/AITrueFalseHandler"`
    - Place exports with other handler interface exports
  - [ ] 4.4 Update AnyContentItem union in YamlInputParser
    - Add `| import("../handlers/embedded/TrueFalseHandler").TrueFalseContent`
    - Add `| import("../handlers/ai/AITrueFalseHandler").AITrueFalseContent`
    - Use import() syntax for proper type resolution
    - Maintain consistent ordering with other types
  - [ ] 4.5 Add validation cases in YamlInputParser.validateContentItem()
    - Add case for "truefalse" and "true-false"
    - Validate question field is required string
    - Validate correct field is required boolean
    - Add case for "ai-truefalse" and "ai-true-false"
    - Validate prompt field is required string
    - Provide clear error messages with item context
    - Follow existing validation case patterns
  - [ ] 4.6 Register handlers in InteractiveBookAIModule
    - Import TrueFalseHandler at top of interactive-book-ai-module.ts
    - Import AITrueFalseHandler at top of interactive-book-ai-module.ts
    - Register TrueFalseHandler after SingleChoiceSetHandler
    - Register AITrueFalseHandler after AISingleChoiceSetHandler
    - Maintain registration order consistency
  - [ ] 4.7 Ensure type integration tests pass
    - Run ONLY the 3-4 tests written in 4.1
    - Verify type validation works for both manual and AI types
    - Verify both type aliases are recognized
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 3-4 tests written in 4.1 pass
- ContentType union includes all four type aliases
- AnyContentItem union includes both interfaces
- Validation cases handle all required field checks
- Both handlers registered in correct order

---

### Phase 5: Testing and Documentation

#### Task Group 5: Comprehensive Testing and Documentation
**Dependencies:** Task Groups 1-4
**Focus:** Final test coverage review, integration testing, and documentation

- [ ] 5.0 Complete testing and documentation
  - [ ] 5.1 Review existing tests and fill critical gaps
    - Review 6-8 tests from Task 1.1 (TrueFalseHandler)
    - Review 4-6 tests from Task 2.1 (Media handling)
    - Review 6-8 tests from Task 3.1 (AITrueFalseHandler)
    - Review 3-4 tests from Task 4.1 (Type integration)
    - Total existing: approximately 19-26 tests
    - Identify any critical workflow gaps
  - [ ] 5.2 Write up to 8 additional strategic tests if needed
    - Focus on integration points between handlers
    - Test behaviour override functionality
    - Test label customization
    - Test confirmation dialog configuration
    - Test HTML escape edge cases
    - Test fallback behavior comprehensively
    - Do NOT exceed 8 additional tests total
    - Skip edge cases unless business-critical
  - [ ] 5.3 Create integration test examples in comprehensive-demo.yaml
    - Add chapter titled "True/False Questions"
    - Add manual TrueFalse example with basic question
    - Add manual TrueFalse with media (image)
    - Add manual TrueFalse with custom behaviour and feedback
    - Add AI TrueFalse example with medium difficulty
    - Add example using "true-false" alias
    - Test generation of complete .h5p package
  - [ ] 5.4 Create dedicated example file: truefalse-example.yaml
    - Include comprehensive manual TrueFalse examples
    - Include examples of all media types (image, video, audio)
    - Include behaviour customization examples
    - Include label customization examples
    - Include AI generation examples with all difficulty levels
    - Include comments explaining each feature
    - Place in examples/yaml/ directory
  - [ ] 5.5 Update README.md documentation
    - Add TrueFalse to "Supported Content Types" table
    - Add description: "Simple true/false questions with optional media"
    - Add manual TrueFalse YAML example to documentation
    - Add AI TrueFalse YAML example to documentation
    - Include notes about boolean-to-string conversion
    - Include notes about media support
  - [ ] 5.6 Run feature-specific tests and validate
    - Run all TrueFalseHandler tests (from tasks 1.1, 2.1)
    - Run all AITrueFalseHandler tests (from task 3.1)
    - Run all type integration tests (from task 4.1)
    - Run any additional strategic tests (from task 5.2)
    - Expected total: approximately 27-34 tests
    - Verify all tests pass
    - Do NOT run entire application test suite
  - [ ] 5.7 Manual integration testing with H5P platform
    - Build project: `npm run build`
    - Generate .h5p from comprehensive-demo.yaml
    - Generate .h5p from truefalse-example.yaml
    - Upload packages to h5p.com or H5P platform
    - Verify TrueFalse content displays correctly
    - Verify questions are clickable
    - Verify correct/incorrect feedback works
    - Verify "Check" and "Retry" buttons work
    - Verify media displays correctly
    - Verify AI-generated questions work

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 27-34 tests total)
- No more than 8 additional tests added beyond original test tasks
- Integration examples work in comprehensive-demo.yaml
- truefalse-example.yaml created with comprehensive examples
- README.md updated with TrueFalse documentation
- Generated .h5p packages upload successfully to H5P platform
- TrueFalse content works correctly in Interactive Books
- Both manual and AI-generated questions display and function properly
- Media support works for images, videos, and audio

---

## Execution Order

Recommended implementation sequence:
1. **Phase 1**: Manual TrueFalse Handler (Task Group 1) - Foundation with boolean-to-string conversion
2. **Phase 2**: Media Support (Task Group 2) - Optional media handling
3. **Phase 3**: AI Handler (Task Group 3) - AI generation with AIPromptBuilder
4. **Phase 4**: Type Integration (Task Group 4) - TypeScript types and registration
5. **Phase 5**: Testing & Documentation (Task Group 5) - Final validation and docs

## Critical Implementation Notes

### Boolean-to-String Conversion (CRITICAL)
The H5P.TrueFalse content type requires the `correct` field to be a STRING "true" or "false", NOT a boolean. This is the most critical technical requirement:

```typescript
// In process() method for both handlers:
const h5pContent = {
  question: `<p>${this.escapeHtml(item.question)}</p>`,
  correct: item.correct ? "true" : "false"  // CRITICAL: Convert boolean to string
};
```

### HTML Safety Pattern
Always strip HTML from AI responses and escape HTML in question text:

```typescript
// For AI responses:
const cleanQuestion = this.stripHtml(aiQuestion);

// For all question text:
question: `<p>${this.escapeHtml(cleanQuestion)}</p>`
```

### Default Behaviour Object
Provide complete defaults that can be overridden:

```typescript
const defaultBehaviour = {
  enableRetry: true,
  enableSolutionsButton: true,
  enableCheckButton: true,
  confirmCheckDialog: false,
  confirmRetryDialog: false,
  autoCheck: false
};

const behaviour = { ...defaultBehaviour, ...(item.behaviour || {}) };
```

### AIPromptBuilder Integration
Use static methods for Universal AI Configuration support:

```typescript
const resolvedConfig = AIPromptBuilder.resolveConfig(
  item.aiConfig,
  chapterAiConfig,
  bookAiConfig
);

const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);
```

### Difficulty Parameter Instructions
Include clear difficulty guidance in AI prompts:

```typescript
const difficultyInstructions = {
  easy: "Create simple, obvious statements that are clearly true or false",
  medium: "Create moderately complex statements requiring thought",
  hard: "Create complex statements with subtle distinctions"
};

const userPrompt = `${item.prompt}\n\nDifficulty: ${difficultyInstructions[difficulty]}`;
```

## Testing Focus Areas

### Unit Testing Priorities (Total: 31+ tests)
1. **Boolean-to-string conversion** (highest priority)
2. **HTML escaping and wrapping**
3. **Validation of required fields**
4. **Media type handling**
5. **AI integration with AIPromptBuilder**
6. **Fallback behavior**
7. **Type system integration**

### Integration Testing Priorities
1. **Generated .h5p packages upload successfully**
2. **TrueFalse content displays in Interactive Books**
3. **Questions are interactive and provide feedback**
4. **Media displays correctly**
5. **AI generation produces valid questions**
6. **Both type aliases work ("truefalse" and "true-false")**

## Reference Patterns

### Handler Template Files
- **Manual Handler Pattern**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/embedded/AccordionHandler.ts`
- **AI Handler Pattern**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`
- **Development Guide**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/docs/developer-guides/Handler_Development_Guide.md`

### Type System Integration
- **Type Definitions**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/types.ts`
- **Validation Logic**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/YamlInputParser.ts`

### Handler Registration
- **Registration File**: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts`

## Standards Compliance

This tasks breakdown aligns with:
- **Testing Standards**: Minimal focused tests during development (6-8 per task group), strategic gap filling (max 8 additional tests)
- **Type Safety**: Full TypeScript integration with proper interface definitions
- **Code Reuse**: Leverages existing patterns from Accordion and Summary handlers
- **Error Handling**: Clear validation messages and fallback behavior
- **Documentation**: Comprehensive examples and README updates
