# Specification: SingleChoiceSet Handler Implementation

## Goal

Implement handlers for H5P.SingleChoiceSet content type that enable content creators to add single-choice quiz questions to Interactive Books, with support for both manually-defined questions and AI-generated questions.

## User Stories

- As a content creator, I want to add single-choice quiz questions to my Interactive Book by defining questions and answers in YAML, so that I can create assessment content without using the H5P editor.
- As an educator, I want to generate single-choice quiz questions using AI prompts, so that I can quickly create educational assessments without manually writing each question and distractor.
- As a developer, I want to follow the established handler architecture patterns, so that SingleChoiceSet integrates seamlessly with the existing codebase and is maintainable.

## Specific Requirements

**1. SingleChoiceSetHandler (Manual Content)**
- Location: `src/handlers/embedded/SingleChoiceSetHandler.ts`
- Supports type aliases: `"singlechoiceset"` and `"single-choice-set"`
- Accepts simplified YAML format with `questions` array containing `question`, `correctAnswer`, and `distractors` fields
- Transforms simplified format to H5P structure where first answer in array is ALWAYS correct
- Validates minimum 1 distractor per question, enforces non-empty strings for all fields
- Supports optional `behaviour` settings (timeouts, sound effects, retry, pass percentage, auto-continue)
- Supports optional UI `labels` customization for buttons and feedback text
- Provides sensible defaults for all optional fields matching H5P.SingleChoiceSet conventions

**2. AISingleChoiceSetHandler (AI-Generated Content)**
- Location: `src/handlers/ai/AISingleChoiceSetHandler.ts`
- Supports type aliases: `"ai-singlechoiceset"` and `"ai-single-choice-set"`
- Requires `prompt` field describing the topic for quiz generation
- Optional `questionCount` parameter (default: 5) controls number of questions generated
- Optional `distractorsPerQuestion` parameter (default: 2) controls number of wrong answers
- Optional `difficulty` parameter (`"easy" | "medium" | "hard"`) affects question complexity and distractor count
- Integrates with Universal AI Configuration (`aiConfig.targetAudience`, `aiConfig.tone`, `aiConfig.customization`)
- Uses AIPromptBuilder.resolveConfig() and buildSystemPrompt() for prompt construction
- Uses QuizGenerator.generateRawContent() for AI generation

**3. H5P Structure Generation**
- Correct answer MUST always be placed at index 0 of the `answers` array (critical H5P requirement)
- Distractors follow after correct answer in the array
- Each question includes `subContentId` generated uniquely
- Default behaviour values: timeoutCorrect=1000, timeoutWrong=1000, soundEffectsEnabled=true, enableRetry=true, enableSolutionsButton=true, passPercentage=100, autoContinue=true
- Default l10n labels for all UI elements (show solution, retry, correct/incorrect text, etc.)
- Default feedback range: 0-100 with message "You got :numcorrect of :maxscore correct"

**4. AI Generation Logic**
- System prompt built using AIPromptBuilder with reading level and tone guidance
- User prompt specifies question count, distractors per question, and topic from `prompt` field
- Difficulty levels map to distractor counts: easy=2, medium=3, hard=4+
- AI response parsed as JSON array with structure: `[{ question, correctAnswer, distractors }]`
- Strip HTML from AI responses using stripHtml() before wrapping in H5P structure
- Fallback to text page with error message if AI generation fails
- Generate exactly the requested number of questions by slicing AI response

**5. Validation Logic**
- Manual handler validates: questions array exists and non-empty, each question has question/correctAnswer/distractors, distractors array has minimum 1 element, all string fields non-empty
- AI handler validates: prompt field exists and is string, questionCount is positive integer if provided, distractorsPerQuestion is 1+ if provided, difficulty is valid enum value if provided
- Validate optional behaviour fields: passPercentage (0-100), timeout values (positive integers), boolean fields have correct type
- Validate optional hTag enum if present in AccordionHandler (not applicable to SingleChoiceSet)

**6. Type System Integration**
- Add to ContentType union: `"singlechoiceset" | "single-choice-set" | "ai-singlechoiceset" | "ai-single-choice-set"`
- Export SingleChoiceSetContent interface from SingleChoiceSetHandler
- Export AISingleChoiceSetContent interface from AISingleChoiceSetHandler
- Add both interfaces to AnyContentItem union type
- Add validation cases in validateContentItem() for both content types
- Add to validTypes array in YamlInputParser

**7. Handler Registration**
- Register SingleChoiceSetHandler after DialogCardsHandler in InteractiveBookAIModule
- Register AISingleChoiceSetHandler after AIAccordionHandler in InteractiveBookAIModule
- Maintain consistent registration order: core handlers, AI handlers, embedded handlers

**8. Library Dependencies**
- Both handlers return `["H5P.SingleChoiceSet"]` from getRequiredLibraries()
- LibraryRegistry automatically resolves transitive dependencies (H5P.Question, H5P.JoubelUI, H5P.Transition, FontAwesome)

**9. Documentation Updates**
- Add SingleChoiceSet to README.md "Supported Content Types" table with description and examples
- Create `examples/yaml/singlechoiceset-example.yaml` with comprehensive manual and AI examples
- Add entries to comprehensive-demo.yaml for integration testing
- Update Handler Development Guide with SingleChoiceSet as optional example

**10. Testing Coverage**
- Unit tests for SingleChoiceSetHandler: getContentType, validate (valid/invalid cases), process, correct answer placement at index 0, default behaviour usage, getRequiredLibraries
- Unit tests for AISingleChoiceSetHandler: getContentType, validate (valid/invalid cases), process with AI generation, fallback behavior, difficulty level handling, getRequiredLibraries
- Integration test in comprehensive-demo.yaml verifying manual and AI-generated SingleChoiceSet render correctly
- Manual testing: upload generated .h5p to h5p.com, verify questions display, verify single-choice selection works, verify feedback display

## Existing Code to Leverage

**AccordionHandler Pattern (Manual Content)**
- Follow validation pattern for array fields: check exists, is array, has length > 0
- Follow validation pattern for nested objects: iterate and validate each element
- Follow escapeHtml() implementation for XSS protection
- Follow generateSubContentId() implementation for unique IDs
- Follow H5P structure building with library, params, metadata, subContentId

**AIAccordionHandler Pattern (AI Generation)**
- Use AIPromptBuilder.resolveConfig() for hierarchical config merging (item > chapter > book)
- Use AIPromptBuilder.buildSystemPrompt() for reading level and tone instructions
- Use QuizGenerator.generateRawContent() for AI content generation
- Follow stripHtml() implementation to remove AI-generated HTML before wrapping
- Follow try-catch pattern with fallback content on AI failure
- Follow JSON parsing pattern: strip code fences, parse, validate structure

**QuizGenerator Integration**
- generateRawContent(systemPrompt, userPrompt) method is public and designed for custom AI content
- Supports both Anthropic and Google providers automatically
- Returns raw string response that handlers must parse
- Follow difficulty parameter pattern from existing quiz generation logic

**ChapterBuilder Methods**
- Use addCustomContent() for complex H5P structures (SingleChoiceSet is complex)
- Generate unique subContentId for each piece of content
- Follow metadata structure: contentType, license, title

**YamlInputParser Type System**
- Export interfaces from handler files for type safety
- Add to ContentType union for compile-time validation
- Add to AnyContentItem union for comprehensive type coverage
- Add validation cases with clear error messages following existing patterns

## Out of Scope

- Standalone SingleChoiceSet handler (not needed for Interactive Book embedding; can be added later if needed)
- CSV input format (project uses YAML/JSON for new content types)
- Image support in questions or answers (H5P.SingleChoiceSet supports this but adds complexity; defer to future enhancement)
- Audio support in questions or answers (defer to future enhancement)
- Custom question feedback per answer (use default feedback for simplicity)
- Score tracking across multiple SingleChoiceSet instances (H5P framework handles this)
- Custom scoring algorithms beyond pass percentage
- Multi-select questions (that's H5P.MultiChoice, not SingleChoiceSet)
- Question pools or random question selection
- Timer or time limits for questions
- Question shuffling (questions appear in order defined in YAML)

## Testing Strategy

**Unit Tests (28+ tests total):**
- SingleChoiceSetHandler: 14 tests covering getContentType, validate success/failures for all required fields, validate distractor array constraints, process builds correct H5P structure, correct answer at index 0, default behaviour application, custom behaviour preservation, getRequiredLibraries
- AISingleChoiceSetHandler: 14 tests covering getContentType, validate success/failures for all fields, validate enum constraints, process with AI, AIPromptBuilder integration, stripHtml safety, fallback on failure, difficulty levels, question count respect, distractor count respect, getRequiredLibraries

**Integration Tests:**
- Add manual SingleChoiceSet example to comprehensive-demo.yaml
- Add AI-generated SingleChoiceSet example to comprehensive-demo.yaml
- Verify .h5p package builds without errors
- Verify package uploads to h5p.com successfully
- Verify questions render correctly in Interactive Book viewer

**Manual Validation:**
- Build .h5p package containing both manual and AI SingleChoiceSet content
- Upload to h5p.com or local H5P platform
- Click through Interactive Book to SingleChoiceSet pages
- Verify single-choice selection (only one option selectable)
- Verify correct/incorrect feedback displays
- Verify retry and show solution buttons work
- Verify autoContinue advances to next question
- Verify pass/fail messaging based on passPercentage

## Success Criteria

- SingleChoiceSetHandler validates and processes manual YAML questions correctly
- AISingleChoiceSetHandler generates questions using AI with appropriate difficulty
- Correct answer consistently placed at index 0 in answers array (verified in tests)
- All unit tests pass (28+ tests)
- comprehensive-demo.yaml includes working examples of both handlers
- Generated .h5p packages upload to h5p.com without errors
- SingleChoiceSet questions display and function correctly in Interactive Book
- Single-choice selection works (radio button behavior)
- Correct/incorrect feedback displays appropriately
- Both type aliases ("singlechoiceset" and "single-choice-set") work correctly
- AI generation respects difficulty and produces appropriate distractor counts
- Fallback mechanism activates when AI generation fails
- README.md updated with clear examples and documentation
- singlechoiceset-example.yaml created with comprehensive examples
- TypeScript compiler reports no type errors related to new handlers
