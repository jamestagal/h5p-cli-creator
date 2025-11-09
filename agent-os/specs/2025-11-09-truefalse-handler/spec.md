# Specification: TrueFalse Handler Implementation

## Goal

Implement manual and AI-powered handlers for H5P.TrueFalse content type, following the standalone-first handler architecture. Enable teachers to create simple true/false questions either manually or via AI generation, with proper boolean-to-string conversion for H5P compatibility.

## User Stories

- As a teacher, I want to create manual true/false questions in YAML so that I can quickly add simple assessment questions to my Interactive Books
- As a teacher, I want to generate true/false questions using AI so that I can create diverse assessment content without manually writing each question

## Specific Requirements

**Handler Implementation Structure**
- Create `TrueFalseHandler.ts` in `src/handlers/embedded/` for manual true/false questions
- Create `AITrueFalseHandler.ts` in `src/handlers/ai/` for AI-generated true/false questions
- Both handlers must implement the `ContentHandler` interface with `getContentType()`, `validate()`, `process()`, and `getRequiredLibraries()` methods
- Follow exact patterns from AccordionHandler and AIAccordionHandler for consistency
- Support both "truefalse" and "true-false" type aliases for flexibility

**Content Type Interfaces**
- Define `TrueFalseContent` interface with fields: type, title (optional), question (required string), correct (required boolean), media (optional object), behaviour (optional object), labels (optional object)
- Define `AITrueFalseContent` interface with fields: type, title (optional), prompt (required string), questionCount (optional number, default 5), difficulty (optional enum), aiConfig (optional Universal AI Configuration)
- Export interfaces from handler files for use in YamlInputParser type unions
- Ensure interfaces match H5P.TrueFalse-1.8 semantic structure requirements

**Boolean-to-String Conversion (CRITICAL)**
- TrueFalseHandler must convert boolean `correct` field to string "true" or "false" for H5P structure
- Use explicit conversion: `correct: item.correct ? "true" : "false"`
- AITrueFalseHandler must also convert AI-generated boolean values to strings
- Add unit tests specifically validating this conversion behavior

**Question Text HTML Formatting**
- Wrap question text in `<p>` tags for H5P AdvancedText compatibility
- Escape HTML special characters using shared `escapeHtml()` method
- For AI-generated content, strip any HTML from AI responses before processing
- Use pattern: `question: "<p>${this.escapeHtml(item.question)}</p>"`

**Default Behaviour Configuration**
- Provide sensible defaults: enableRetry (true), enableSolutionsButton (true), enableCheckButton (true), confirmCheckDialog (false), confirmRetryDialog (false), autoCheck (false)
- Allow users to override defaults via optional `behaviour` object
- Include optional custom feedback: feedbackOnCorrect and feedbackOnWrong
- Map user-provided behaviour to H5P behaviour structure correctly

**Default Labels and Localization**
- Provide complete default labels: trueText ("True"), falseText ("False"), checkAnswer ("Check"), showSolutionButton ("Show solution"), tryAgain ("Retry"), wrongAnswerMessage ("Wrong answer"), correctAnswerMessage ("Correct answer")
- Include accessibility labels: a11yCheck, a11yShowSolution, a11yRetry with descriptive text
- Include confirmation dialog defaults for header, body, cancelLabel, confirmLabel
- Allow users to override any label via optional `labels` object

**Media Support**
- Support optional media object with fields: path (required), type (optional: "image" | "video" | "audio"), alt (optional for images), disableZooming (optional boolean for images)
- Resolve media file paths relative to YAML file using context.basePath
- Generate proper H5P.Image, H5P.Video, or H5P.Audio sub-content structures
- Include disableImageZooming parameter only for image media types

**AI Integration with AIPromptBuilder**
- Use `AIPromptBuilder.resolveConfig()` to merge aiConfig from item, chapter, and book levels
- Use `AIPromptBuilder.buildSystemPrompt()` to generate formatted system prompts with reading level and tone
- Build user prompts that request JSON array of question objects with "question" (string) and "correct" (boolean) fields
- Include difficulty parameter instructions: "easy" (simple, obvious statements), "medium" (moderate complexity), "hard" (complex, subtle distinctions)
- Use `quizGenerator.generateRawContent()` for AI calls with proper error handling

**AI Response Processing and Fallback**
- Strip markdown code blocks from AI responses: `replace(/^```json\n?/, "").replace(/\n?```$/, "")`
- Parse JSON array and validate structure (must have question and correct fields)
- Strip HTML tags from AI-generated question text before processing
- Provide fallback behavior on AI failure: create single true/false question with error message text
- Log AI failures clearly with verbose mode support

**Validation Requirements**
- TrueFalseHandler: validate question (required string), correct (required boolean), media.path (string if media provided), media.type (valid enum if provided), behaviour fields (boolean types), feedback strings (max 2048 chars)
- AITrueFalseHandler: validate prompt (required string), questionCount (positive integer if provided), difficulty (valid enum if provided: "easy" | "medium" | "hard")
- Return validation objects with `{ valid: boolean; error?: string }` structure
- Provide clear, actionable error messages for all validation failures

**Type System Integration**
- Add "truefalse", "true-false", "ai-truefalse", "ai-true-false" to ContentType union in YamlInputParser
- Add TrueFalseContent and AITrueFalseContent to AnyContentItem union using import() syntax
- Add validation cases in YamlInputParser.validateContentItem() for both manual and AI types
- Export interfaces from handlers for external use

**Handler Registration**
- Register TrueFalseHandler in `src/modules/ai/interactive-book-ai-module.ts` after SingleChoiceSetHandler
- Register AITrueFalseHandler after AISingleChoiceSetHandler
- Maintain registration order for consistency with other handlers
- Ensure handlers are registered before ChapterBuilder processes content

**Required Libraries Declaration**
- Both handlers must return `["H5P.TrueFalse"]` from `getRequiredLibraries()` method
- LibraryRegistry will automatically resolve dependencies: H5P.Question, H5P.JoubelUI, H5P.FontIcons, FontAwesome
- Follow exact pattern from Accordion handlers for library declaration

**Sub-Content ID Generation**
- Use shared pattern for generating unique sub-content IDs: `${Date.now()}-${Math.random().toString(36).substring(7)}`
- Generate unique IDs for TrueFalse content itself and any nested media content
- Ensure IDs are unique within the H5P package structure

## Existing Code to Leverage

**AccordionHandler Pattern**
- Use AccordionHandler.ts as template for TrueFalseHandler structure and validation logic
- Replicate escapeHtml() and generateSubContentId() helper methods exactly
- Follow validation pattern with clear error messages for each field
- Use same ChapterBuilder integration via chapterBuilder.addCustomContent()
- Copy verbose logging pattern for consistent user feedback

**AIAccordionHandler AI Integration**
- Use AIAccordionHandler.ts as template for AI prompt building and response parsing
- Replicate AIPromptBuilder.resolveConfig() and buildSystemPrompt() usage pattern
- Copy JSON response parsing with markdown strip and validation
- Use same fallback pattern when AI generation fails (getFallbackPanels equivalent)
- Follow error handling with try-catch and verbose logging

**Handler Registration Pattern**
- Follow exact registration pattern from interactive-book-ai-module.ts
- Import handlers at top of file with other handler imports
- Register in correct order relative to other question-type handlers
- Maintain consistent naming conventions for handler instances

**ContentHandler Interface Compliance**
- Implement all four required methods from ContentHandler interface
- Use HandlerContext parameter destructuring: `{ chapterBuilder, logger, options, quizGenerator }`
- Return proper types from each method (string, Promise<void>, validation object, string array)
- Follow async/await patterns for process() method

**ChapterBuilder Integration**
- Use chapterBuilder.addCustomContent() to add H5P content structures
- Build complete H5P content objects with library, params, metadata, subContentId
- Follow exact structure from existing handlers for consistency
- Ensure metadata includes title, license, contentType fields

## Out of Scope

- Support for multiple questions in a single TrueFalse content item (use multiple items instead)
- Advanced question features like hints, explanations, or scored feedback levels
- Custom styling or theming for TrueFalse UI elements
- Support for image-based true/false questions where the media IS the question (media is supplementary only)
- Standalone TrueFalse handler for generating .h5p packages (Interactive Book embedding only)
- CSV-based input format (YAML/JSON only per architecture decision)
- Migration of legacy true/false question formats from other systems
- Custom feedback templates or conditional feedback based on score
- Timer or time-limit features for true/false questions
- Randomization of true/false answer positions
