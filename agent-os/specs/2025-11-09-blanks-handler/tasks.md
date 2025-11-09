# Task Breakdown: Blanks (Fill in the Blanks) Handler Implementation

## Overview

Implement handlers for H5P.Blanks content type following the standalone-first architecture pattern. This enables both manual and AI-generated fill-in-the-blank exercises with dual format support (simplified YAML + native H5P syntax).

**Total Estimated Tasks:** 45+
**Expected Test Coverage:** 35+ unit tests across both handlers

## Key Implementation Requirements

- **Standalone-first architecture**: Blanks is runnable (supports standalone .h5p generation)
- **Two handlers**: BlanksHandler (manual) + AIBlanksHandler (AI-generated)
- **DUAL FORMAT SUPPORT**: Simplified `{blank}` format + Native H5P `*answer*` format
- **CRITICAL**: Simplified-to-native conversion logic
- **Syntax features**: Alternative answers (`/`), tips (`:`), combined
- **AIPromptBuilder integration** with Universal AI Configuration
- **Media support**: Optional image/video/audio above task
- **Behavior settings**: Case sensitivity, spelling errors, auto-check, etc.
- **Comprehensive validation** for both formats
- **Type system integration** in YamlInputParser

## Task List

### Phase 1: Manual Blanks Handler (Core Foundation)

**Dependencies:** None

- [ ] 1.0 Complete BlanksHandler implementation
  - [ ] 1.1 Write 6-8 focused tests for BlanksHandler
    - Test validation: sentences format, questions format, format conflicts, required fields
    - Test conversion: simplified-to-native, alternative answers, tips, combined features
    - Test H5P structure generation: default values, custom overrides
    - Skip exhaustive validation scenarios (focus on critical paths)
  - [ ] 1.2 Create BlanksHandler class in `src/handlers/embedded/BlanksHandler.ts`
    - Implement ContentHandler interface
    - Export BlanksContent interface with all fields (type, title, taskDescription, sentences, questions, media, behaviour, labels, feedback)
    - Follow AccordionHandler pattern for structure
  - [ ] 1.3 Implement getContentType() method
    - Return "blanks" as primary identifier
    - Handler will support both "blanks" and "fill-in-the-blanks" aliases via registry
  - [ ] 1.4 Implement validate() method
    - Validate EITHER sentences OR questions present (mutually exclusive)
    - Validate sentences format: array length >= 1, text field, blanks array structure
    - Validate questions format: array length >= 1, string with `*answer*` markers
    - Validate optional media object structure
    - Validate behaviour boolean fields
    - Validate feedback ranges (0-100)
    - Return clear, actionable error messages with field names and indices
  - [ ] 1.5 Implement convertSimplifiedToNative() helper method
    - Replace `{blank}` placeholders with `*answer*` markers in correct order
    - Join alternative answers with `/` separator: ["answer1", "answer2"] → `*answer1/answer2*`
    - Append tips with `:` separator: {answer: "blue", tip: "Think of sky"} → `*blue:Think of sky*`
    - Handle combined alternatives and tips: ["one", "1"] + tip → `*one/1:tip*`
    - Validate blank count matches blanks array length
    - Preserve sentence text exactly except for blank replacement
  - [ ] 1.6 Implement escapeHtml() helper method
    - Copy pattern from AccordionHandler
    - Escape HTML entities to prevent XSS vulnerabilities
    - Apply to all user-provided text (sentences, task descriptions, tips)
  - [ ] 1.7 Implement generateSubContentId() helper method
    - Copy pattern from AccordionHandler: `Date.now() + random string`
    - Generate unique IDs for H5P content and metadata
  - [ ] 1.8 Implement process() method for sentences format
    - Convert simplified format to native H5P format using convertSimplifiedToNative()
    - Build H5P.Blanks structure with questions array
    - Set default behaviour values
    - Set default labels (all required fields)
    - Set default feedback
    - Apply custom overrides from YAML
    - Escape HTML in all text fields
  - [ ] 1.9 Implement process() method for questions format
    - Build H5P.Blanks structure directly from questions array
    - Apply same defaults and overrides as sentences format
    - Validate `*answer*` marker syntax
  - [ ] 1.10 Implement media support
    - Handle optional media field with path, type, alt, disableZooming
    - Auto-detect media type from file extension if not specified
    - Build H5P.Image structure for images
    - Build H5P.Video structure for videos
    - Build H5P.Audio structure for audio
    - Include media in H5P structure's media field with type.library and type.params
  - [ ] 1.11 Implement getRequiredLibraries() method
    - Return ["H5P.Blanks"]
    - LibraryRegistry will auto-resolve dependencies (H5P.Question, H5P.JoubelUI, H5P.TextUtilities, FontAwesome)
  - [ ] 1.12 Add verbose logging
    - Log title and sentence count in verbose mode
    - Format: "    - Adding blanks: \"Norwegian Berries\" (3 sentences)"
    - Use context.logger.log() and check context.options.verbose
  - [ ] 1.13 Ensure BlanksHandler tests pass
    - Run ONLY the 6-8 tests written in 1.1
    - Verify validation logic works correctly
    - Verify conversion logic handles all syntax features
    - Verify H5P structure generation is correct
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 6-8 tests written in 1.1 pass
- BlanksHandler validates both formats correctly
- Simplified-to-native conversion handles alternative answers, tips, and combined features
- H5P.Blanks structure generates correctly with all defaults
- Media support works for images (videos/audio basic structure in place)
- HTML escaping prevents XSS vulnerabilities
- Verbose logging provides clear progress indicators

### Phase 2: AI Blanks Handler (AI Integration)

**Dependencies:** Phase 1

- [ ] 2.0 Complete AIBlanksHandler implementation
  - [ ] 2.1 Write 6-8 focused tests for AIBlanksHandler
    - Test validation: prompt required, sentenceCount/blanksPerSentence ranges, difficulty enum
    - Test AI integration: prompt building, response parsing, HTML stripping, fallback behavior
    - Test difficulty levels: easy, medium, hard content generation
    - Skip exhaustive AI response scenarios (focus on critical paths)
  - [ ] 2.2 Create AIBlanksHandler class in `src/handlers/ai/AIBlanksHandler.ts`
    - Implement ContentHandler interface
    - Export AIBlanksContent interface (type, title, prompt, sentenceCount, blanksPerSentence, difficulty, aiConfig)
    - Follow AIAccordionHandler pattern for AI integration
  - [ ] 2.3 Implement getContentType() method
    - Return "ai-blanks" as primary identifier
    - Handler will support both "ai-blanks" and "ai-fill-in-the-blanks" aliases
  - [ ] 2.4 Implement validate() method
    - Validate prompt is required and is string
    - Validate sentenceCount is positive integer if provided (default: 5)
    - Validate blanksPerSentence is 1-3 if provided (default: 1)
    - Validate difficulty is "easy", "medium", or "hard" if provided
    - Return clear, actionable error messages
  - [ ] 2.5 Implement generateBlanksSentences() private method
    - Use AIPromptBuilder.resolveConfig() to merge item.aiConfig, chapter config, book config
    - Use AIPromptBuilder.buildSystemPrompt() to format reading level and tone instructions
    - Build user prompt requesting JSON array: [{text: string, blanks: [{answer: string|string[], tip?: string}]}]
    - Include difficulty parameter in prompt to guide content generation
    - Include sentenceCount and blanksPerSentence parameters
    - Call context.quizGenerator.generateRawContent() with system and user prompts
  - [ ] 2.6 Implement AI response parsing
    - Strip markdown code fences from response
    - Parse JSON response
    - Validate structure: must be array, each item has text and blanks array
    - Strip HTML tags from AI-generated sentences using regex (remove <p>, </p>, <br>, all HTML)
    - Use stripHtml() method pattern from AIAccordionHandler
  - [ ] 2.7 Implement difficulty level logic
    - Easy: simple vocabulary, 1 blank per sentence, straightforward answers
    - Medium: moderate complexity, 1-2 blanks per sentence, require thinking
    - Hard: complex sentences, 2-3 blanks per sentence, academic/technical vocabulary
    - Pass difficulty to AI prompt with clear instructions
    - Default to medium if not specified
  - [ ] 2.8 Implement fallback behavior
    - Provide minimal blanks exercise on AI failure
    - Show error message in task description
    - Use simple placeholder sentence with one blank
    - Log warning in verbose mode
  - [ ] 2.9 Implement process() method
    - Generate sentences using AI
    - Convert AI output to H5P.Blanks format using convertSimplifiedToNative()
    - Build complete H5P structure with defaults and overrides
    - Apply HTML escaping to all fields
    - Log AI generation progress in verbose mode
  - [ ] 2.10 Copy helper methods from BlanksHandler
    - Copy convertSimplifiedToNative() method
    - Copy escapeHtml() method
    - Copy generateSubContentId() method
    - Reuse exact same logic for consistency
  - [ ] 2.11 Implement getRequiredLibraries() method
    - Return ["H5P.Blanks"]
  - [ ] 2.12 Add comprehensive verbose logging
    - Log title, prompt, sentence count, blanks per sentence
    - Log AI request sent, response received, response parsed
    - Log fallback usage if AI fails
    - Format: "    - Generating AI blanks: \"Solar System Quiz\" (prompt: \"Create fill-in-the-blank...\", 8 sentences)"
  - [ ] 2.13 Ensure AIBlanksHandler tests pass
    - Run ONLY the 6-8 tests written in 2.1
    - Verify AI integration works correctly
    - Verify HTML stripping prevents injection
    - Verify fallback provides valid content
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 6-8 tests written in 2.1 pass
- AIBlanksHandler generates valid blanks from prompts
- AIPromptBuilder integration works correctly
- Difficulty levels produce appropriate content complexity
- HTML stripping prevents injection attacks
- Fallback works gracefully when AI generation fails
- Verbose logging provides clear progress and debugging info

### Phase 3: Type System Integration

**Dependencies:** Phases 1-2

- [ ] 3.0 Complete type system integration
  - [ ] 3.1 Write 2-4 focused tests for type system integration
    - Test ContentType union accepts all four type aliases
    - Test AnyContentItem union includes both interfaces
    - Test type guards validate correctly
    - Skip exhaustive type scenarios
  - [ ] 3.2 Update ContentType union in `src/compiler/YamlInputParser.ts`
    - Add "blanks", "fill-in-the-blanks", "ai-blanks", "ai-fill-in-the-blanks"
    - Follow existing pattern for type aliases
  - [ ] 3.3 Export content interfaces
    - Add: `export { BlanksContent } from "../handlers/embedded/BlanksHandler";`
    - Add: `export { AIBlanksContent } from "../handlers/ai/AIBlanksHandler";`
    - Follow existing import/export pattern
  - [ ] 3.4 Update AnyContentItem union type
    - Add: `| import("../handlers/embedded/BlanksHandler").BlanksContent`
    - Add: `| import("../handlers/ai/AIBlanksHandler").AIBlanksContent`
    - Maintain alphabetical ordering
  - [ ] 3.5 Add validation cases in type guard
    - Add case for "blanks" and "fill-in-the-blanks"
    - Check for sentences OR questions (mutually exclusive)
    - Throw error if neither present or both present
    - Add case for "ai-blanks" and "ai-fill-in-the-blanks"
    - Check for prompt field (required)
    - Follow existing switch-case pattern
  - [ ] 3.6 Ensure TypeScript compiler catches type errors
    - Build project with `npm run build`
    - Verify no TypeScript errors
    - Verify type inference works in IDE
  - [ ] 3.7 Ensure type system tests pass
    - Run ONLY the 2-4 tests written in 3.1
    - Verify type guards work correctly
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-4 tests written in 3.1 pass
- All four type aliases work correctly
- Both content interfaces are properly exported and included in union type
- Type guards validate format conflicts (sentences vs questions)
- TypeScript compiler validates correctly with no errors
- IDE provides correct type inference and autocomplete

### Phase 4: Handler Registration & Integration

**Dependencies:** Phases 1-3

- [ ] 4.0 Complete handler registration
  - [ ] 4.1 Register BlanksHandler in `src/modules/ai/interactive-book-ai-module.ts`
    - Import BlanksHandler
    - Register instance after TrueFalseHandler (maintain logical ordering)
    - Ensure both type aliases route to same handler instance
  - [ ] 4.2 Register AIBlanksHandler
    - Import AIBlanksHandler
    - Register instance after AITrueFalseHandler (maintain AI handler grouping)
    - Ensure both AI type aliases route to same handler instance
  - [ ] 4.3 Verify handlers are discoverable
    - Test that HandlerRegistry finds both handlers
    - Test that all four type aliases resolve correctly
    - Verify no registration conflicts with existing handlers
  - [ ] 4.4 Test end-to-end integration
    - Create test YAML with manual blanks (simplified format)
    - Create test YAML with manual blanks (native format)
    - Create test YAML with AI blanks
    - Build .h5p package
    - Verify no runtime errors during compilation

**Acceptance Criteria:**
- Both handlers registered successfully
- HandlerRegistry discovers handlers correctly
- All type aliases ("blanks", "fill-in-the-blanks", "ai-blanks", "ai-fill-in-the-blanks") work
- No registration conflicts or duplicate handler errors
- Test YAML files compile to .h5p without errors

### Phase 5: Testing & Quality Assurance

**Dependencies:** Phases 1-4

- [ ] 5.0 Review existing tests and fill critical gaps
  - [ ] 5.1 Review tests from Phases 1-3
    - Review the 6-8 tests written by manual handler developer (Task 1.1)
    - Review the 6-8 tests written by AI handler developer (Task 2.1)
    - Review the 2-4 tests written by type system developer (Task 3.1)
    - Total existing tests: approximately 14-20 tests
  - [ ] 5.2 Analyze test coverage gaps for Blanks handlers only
    - Identify critical user workflows that lack test coverage
    - Focus ONLY on gaps related to Blanks handler requirements
    - Prioritize end-to-end workflows over unit test gaps
    - Do NOT assess entire application test coverage
  - [ ] 5.3 Write up to 10 additional strategic tests maximum
    - Integration tests: full YAML-to-H5P workflow for both formats
    - Media handling tests: image/video/audio support
    - Edge cases: multiple blanks per sentence, complex alternative answers, long tips
    - Cross-handler tests: verify no conflicts with existing handlers
    - Do NOT write comprehensive coverage for all scenarios
    - Skip performance tests and accessibility tests unless business-critical
  - [ ] 5.4 Add integration examples to comprehensive-demo.yaml
    - Add manual blanks example (simplified format) with media
    - Add manual blanks example (native format) with tips and alternatives
    - Add AI blanks example with difficulty setting
    - Test all examples compile successfully
  - [ ] 5.5 Create dedicated example file: `examples/yaml/blanks-example.yaml`
    - Include multiple use cases: basic, advanced, media, AI-generated
    - Include comments explaining dual format support
    - Include examples of alternative answers and tips
    - Include difficulty levels for AI generation
  - [ ] 5.6 Test .h5p package uploads to h5p.com
    - Generate standalone .h5p packages for manual and AI blanks
    - Upload to h5p.com and verify no errors
    - Test user interaction: typing answers, checking, showing solutions, retry
    - Verify alternative answers are accepted
    - Verify tips display correctly
    - Verify case sensitivity and spelling error tolerance settings work
  - [ ] 5.7 Test Interactive Book embedding
    - Generate Interactive Book with embedded blanks chapters
    - Upload to h5p.com and verify rendering
    - Test navigation between chapters with blanks content
    - Verify state persistence across chapters
  - [ ] 5.8 Run Blanks-specific tests only
    - Run ONLY tests related to Blanks handlers (tests from 1.1, 2.1, 3.1, and 5.3)
    - Expected total: approximately 24-30 tests maximum
    - Do NOT run the entire application test suite
    - Verify all critical workflows pass

**Acceptance Criteria:**
- All Blanks-specific tests pass (approximately 24-30 tests total)
- No more than 10 additional tests added when filling in testing gaps
- Integration examples in comprehensive-demo.yaml work correctly
- Standalone blanks-example.yaml file provides comprehensive examples
- Generated .h5p packages upload successfully to h5p.com
- User interaction works correctly (typing, checking, solutions, retry)
- Alternative answers and tips function as expected
- Behavior settings (case sensitivity, spelling errors) work correctly
- Media displays above task description when provided
- Interactive Book embedding works without errors

### Phase 6: Documentation & Release

**Dependencies:** Phases 1-5

- [ ] 6.0 Complete documentation updates
  - [ ] 6.1 Update README.md - Supported Content Types table
    - Add Blanks row with description: "Fill-in-the-blank exercises with typed answers"
    - Include icon or emoji indicator for runnable content type
    - Add link to blanks-example.yaml
  - [ ] 6.2 Update README.md - Content Type Examples section
    - Add "Fill in the Blanks" subsection
    - Include manual example (simplified format) with code snippet
    - Include manual example (native format) with code snippet
    - Include AI-generated example with code snippet
    - Explain dual format support and when to use each
    - Document media support capabilities
    - Document behavior settings (case sensitivity, spelling errors, etc.)
  - [ ] 6.3 Update README.md - AI Content Generation section
    - Add ai-blanks to list of AI-supported content types
    - Explain difficulty parameter (easy, medium, hard)
    - Explain sentenceCount and blanksPerSentence parameters
    - Include example with aiConfig customization
  - [ ] 6.4 Verify examples/yaml/blanks-example.yaml is complete
    - Ensure all use cases are covered
    - Ensure comments are clear and helpful
    - Ensure examples are tested and working
  - [ ] 6.5 Update Handler Development Guide (optional)
    - Optionally add Blanks as example handler implementation
    - Highlight dual format pattern (if not already documented)
    - Note similarities to DragText handler
  - [ ] 6.6 Create CHANGELOG entry
    - Document new Blanks and AI-Blanks handlers
    - List key features: dual format support, AI generation, media support, behavior settings
    - Note H5P library version (H5P.Blanks-1.14)
    - Reference example files and documentation updates

**Acceptance Criteria:**
- README.md updated with complete Blanks documentation
- All examples are tested and working
- Documentation clearly explains dual format support
- CHANGELOG entry documents new features
- Handler Development Guide updated if applicable
- Documentation is clear, accurate, and helpful for users

## Execution Order

Recommended implementation sequence:

1. **Phase 1: Manual Blanks Handler** - Build foundation with validation, conversion, and H5P structure generation
2. **Phase 2: AI Blanks Handler** - Add AI integration using established patterns
3. **Phase 3: Type System Integration** - Wire up TypeScript type system for both handlers
4. **Phase 4: Handler Registration** - Register handlers and verify end-to-end integration
5. **Phase 5: Testing & QA** - Fill test coverage gaps and validate production readiness
6. **Phase 6: Documentation** - Complete user-facing documentation and examples

## Important Constraints

- **Standalone-first architecture**: Build and test standalone .h5p generation first, then verify Interactive Book embedding
- **Dual format support**: Both simplified `{blank}` and native `*answer*` formats must work correctly
- **Conversion logic is critical**: The simplified-to-native conversion must handle alternative answers, tips, and combined features perfectly
- **HTML safety**: Always escape user-provided text and strip HTML from AI-generated content
- **Limited test writing**: Each phase writes 2-8 focused tests maximum during development
- **Test verification runs ONLY phase-specific tests**: Do not run entire test suite until final QA phase
- **Focused test-driven approach**: Start each phase with writing tests, end with running only those tests
- **Maximum 10 additional tests in QA phase**: Only add tests if critical gaps exist
- **Follow existing patterns**: Copy from AccordionHandler and AIAccordionHandler for consistency
- **Media support**: Implement basic structure for all media types, prioritize image support
- **Verbose logging**: Provide clear progress indicators for debugging and user feedback

## Reference Implementation Patterns

**Use these existing handlers as templates:**
- `src/handlers/embedded/AccordionHandler.ts` - Manual handler pattern (validation, escapeHtml, generateSubContentId)
- `src/handlers/ai/AIAccordionHandler.ts` - AI handler pattern (prompt building, response parsing, HTML stripping, fallback)
- `src/compiler/ChapterBuilder.ts` - Content wrapping and chapter building
- `src/ai/AIPromptBuilder.ts` - Universal AI configuration and prompt formatting
- `src/compiler/YamlInputParser.ts` - Type system integration patterns

**Key patterns to follow:**
- Validation: Clear, indexed error messages for nested structures
- Conversion: Systematic replacement with validation of blank counts
- HTML Safety: Escape all user input, strip HTML from AI responses
- AI Integration: Use AIPromptBuilder static methods, provide fallback
- Logging: Conditional verbose logging with consistent formatting
- Testing: Write minimal focused tests per phase, verify incrementally
