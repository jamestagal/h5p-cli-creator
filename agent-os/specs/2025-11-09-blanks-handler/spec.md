# Specification: Blanks (Fill in the Blanks) Handler Implementation

## Goal

Implement handlers for H5P.Blanks content type following the standalone-first architecture pattern, enabling both manual and AI-generated fill-in-the-blank exercises with dual format support (simplified YAML + native H5P syntax).

## User Stories

- As a content author, I want to create fill-in-the-blank exercises using simplified `{blank}` placeholders so that I can quickly build interactive assessments without learning H5P's native syntax
- As an advanced user, I want to use the native H5P `*answer*` syntax with alternatives and tips so that I have full control over the exercise behavior
- As a teacher, I want to generate fill-in-the-blank exercises from an AI prompt so that I can create assessment content quickly without manually writing questions

## Specific Requirements

**BlanksHandler (Manual Content)**
- Implement `ContentHandler` interface in `src/handlers/embedded/BlanksHandler.ts`
- Support content type identifiers: `"blanks"` and `"fill-in-the-blanks"` (both should work)
- Export `BlanksContent` interface with fields: `type`, `title?`, `taskDescription?`, `sentences?`, `questions?`, `media?`, `behaviour?`, `labels?`, `feedback?`
- Validate that EITHER `sentences` OR `questions` is present, but never both (mutually exclusive formats)
- If using `sentences` format: validate array length >= 1, each sentence has `text` and `blanks` array, each blank has `answer` field (string or string[])
- If using `questions` format: validate array length >= 1, each question is string with at least one `*answer*` marker
- Return `["H5P.Blanks"]` from `getRequiredLibraries()`
- Use `escapeHtml()` for all user-provided text to prevent XSS vulnerabilities

**Simplified to Native Conversion Logic**
- Implement `convertSimplifiedToNative()` method that replaces `{blank}` placeholders with `*answer*` markers in correct order
- Join alternative answers (string arrays) with `/` separator: `["answer1", "answer2"]` becomes `*answer1/answer2*`
- Append tips with `:` separator: `{answer: "blue", tip: "Think of the sky"}` becomes `*blue:Think of the sky*`
- Handle combined alternatives and tips: `{answer: ["one", "1"], tip: "Not two"}` becomes `*one/1:Not two*`
- Ensure blank count in text matches blanks array length (validation error if mismatch)
- Preserve sentence text exactly except for blank replacement
- Strip HTML tags from AI-generated content before processing to ensure clean output

**AIBlanksHandler (AI-Generated Content)**
- Implement `ContentHandler` interface in `src/handlers/ai/AIBlanksHandler.ts`
- Support content type identifiers: `"ai-blanks"` and `"ai-fill-in-the-blanks"`
- Export `AIBlanksContent` interface with fields: `type`, `title?`, `prompt` (required), `sentenceCount?`, `blanksPerSentence?`, `difficulty?`, `aiConfig?`
- Validate `prompt` is required and is a string
- Validate `sentenceCount` is positive integer if provided (default: 5)
- Validate `blanksPerSentence` is 1-3 if provided (default: 1)
- Validate `difficulty` is one of: `"easy"`, `"medium"`, `"hard"` if provided
- Return `["H5P.Blanks"]` from `getRequiredLibraries()`

**AI Integration with Universal Configuration**
- Use `AIPromptBuilder.resolveConfig()` to merge item.aiConfig, chapter config, and book config (cascade hierarchy)
- Use `AIPromptBuilder.buildSystemPrompt()` to format reading level and tone instructions
- Build user prompt requesting JSON array of sentence objects: `[{text: string, blanks: [{answer: string|string[], tip?: string}]}]`
- Call `quizGenerator.generateRawContent()` with system and user prompts
- Parse JSON response, stripping markdown code fences and HTML tags from content
- Validate AI response structure: must be array, each item must have `text` and `blanks` array
- Strip HTML from AI-generated sentences using regex: remove `<p>`, `</p>`, `<br>` tags and all other HTML
- Provide fallback behavior on AI failure: create minimal blanks exercise with error message

**Difficulty Level Implementation**
- Easy difficulty: generate simple vocabulary, 1 blank per sentence, straightforward answers
- Medium difficulty: moderate complexity, 1-2 blanks per sentence, require some thinking
- Hard difficulty: complex sentences, 2-3 blanks per sentence, academic/technical vocabulary
- Pass difficulty parameter to AI prompt to guide content generation
- Default to medium difficulty if not specified

**H5P Structure Generation**
- Build H5P.Blanks structure with fields: `text` (task description), `questions` (array of sentences with `*answer*` markers), `media?`, `behaviour`, `overallFeedback`, and all label fields
- Wrap content in Interactive Book's Row/RowColumn structure using `chapterBuilder.addCustomContent()`
- Generate unique `subContentId` for content and metadata using `Date.now() + random` pattern
- Set default behaviour: `{enableRetry: true, enableSolutionsButton: true, enableCheckButton: true, autoCheck: false, caseSensitive: true, showSolutionsRequiresInput: true, separateLines: false, confirmCheckDialog: false, confirmRetryDialog: false, acceptSpellingErrors: false}`
- Set default labels including all required fields: `showSolutions`, `tryAgain`, `checkAnswer`, `submitAnswer`, `notFilledOut`, `answerIsCorrect`, `answerIsWrong`, `answeredCorrectly`, `answeredIncorrectly`, `solutionLabel`, `inputLabel`, `inputHasTipLabel`, `tipLabel`, `scoreBarLabel`, accessibility labels
- Set default feedback: `[{from: 0, to: 100, feedback: "You got @score of @total blanks correct."}]`
- Allow override of defaults via `behaviour`, `labels`, and `feedback` fields in YAML

**Media Support**
- Support optional `media` field with `path`, `type?` ("image"|"video"|"audio"), `alt?`, `disableZooming?` (images only)
- Auto-detect media type from file extension if not specified
- For images: build H5P.Image structure with params: `{file: {path, mime, copyright}, alt, decorative: false}`
- For videos: build H5P.Video structure (implementation to follow H5P.Video patterns)
- For audio: build H5P.Audio structure (implementation to follow H5P.Audio patterns)
- Include media in H5P structure's `media` field with `type.library` and `type.params`
- Media appears above the task description in the rendered content

**Type System Integration**
- Add `"blanks"`, `"fill-in-the-blanks"`, `"ai-blanks"`, `"ai-fill-in-the-blanks"` to `ContentType` union in `src/compiler/YamlInputParser.ts`
- Export `BlanksContent` and `AIBlanksContent` interfaces from their respective handler files
- Add both content types to `AnyContentItem` union type
- Add validation cases to type guard: check for `sentences` OR `questions` (blanks), check for `prompt` (ai-blanks)
- Ensure TypeScript compiler catches type errors for both handler implementations

**Handler Registration**
- Register `BlanksHandler` instance in `src/modules/ai/interactive-book-ai-module.ts` after TrueFalseHandler
- Register `AIBlanksHandler` instance after AITrueFalseHandler (maintain logical ordering)
- Handlers will be auto-discovered by HandlerRegistry and available for content processing
- Both type aliases (`"blanks"` and `"fill-in-the-blanks"`) will route to the same handler instance

**Validation Error Messages**
- Provide clear, actionable error messages for all validation failures
- Include field names and expected types/values in error messages
- For nested structures (panels, sentences), include index numbers in error messages
- Example: `"Sentence 3 missing 'text' field"` or `"Panel 2 'title' must be a string"`
- For format conflicts: `"Cannot have both 'sentences' and 'questions' - use one format only"`
- For missing required fields: `"Must have either 'sentences' or 'questions' array"`

**Logging and Progress Tracking**
- Log progress in verbose mode using `context.logger.log()`
- For manual blanks: log title and sentence count
- For AI blanks: log title, prompt, sentence count, blanks per sentence
- Log AI generation progress: request sent, response received, response parsed
- Log fallback usage if AI generation fails
- Sample log format: `"    - Adding blanks: \"Norwegian Berries\" (3 sentences)"` or `"    - Generating AI blanks: \"Solar System Quiz\" (prompt: \"Create fill-in-the-blank...\", 8 sentences)"`

**HTML Escaping and Security**
- Always escape HTML in user-provided text using `escapeHtml()` helper method
- Strip HTML tags from AI-generated content before processing
- Prevent XSS vulnerabilities by sanitizing all external input
- Apply escaping to: sentence text, task descriptions, tips, alternative answers
- Do NOT escape the final H5P structure's `*answer*` markers (they are H5P syntax, not HTML)

**Testing Coverage Requirements**
- Create unit test file: `tests/unit/handlers/embedded/BlanksHandler.test.ts` with 20+ test cases
- Create unit test file: `tests/unit/handlers/ai/AIBlanksHandler.test.ts` with 15+ test cases
- Test all validation rules: required fields, type checking, array validation, enum validation, format conflicts
- Test conversion logic: simplified to native format, alternative answers, tips, combined features
- Test AI integration: prompt building, response parsing, HTML stripping, fallback behavior
- Test H5P structure generation: default values, custom overrides, media support
- Add integration test to `examples/yaml/comprehensive-demo.yaml` with both manual (simplified + native) and AI examples

**Documentation Updates**
- Add Blanks to README.md "Supported Content Types" table with description: "Fill-in-the-blank exercises with typed answers"
- Include YAML examples for both simplified format and native format in README.md
- Include AI-generated example with `prompt`, `sentenceCount`, `difficulty` parameters
- Create comprehensive example file: `examples/yaml/blanks-example.yaml` with multiple use cases
- Explain dual format support and when to use each format
- Document media support capabilities
- Update Handler Development Guide if needed (optional)

**Success Validation Criteria**
- Generated .h5p packages upload successfully to h5p.com without errors
- Blanks content displays correctly in Interactive Book chapters
- Users can type answers into input fields and receive immediate feedback
- Alternative answers are accepted (case sensitivity respects settings)
- Tips display correctly when hovering over/clicking hint icon
- "Show solutions" and "Retry" buttons work as expected
- Case sensitivity toggle works correctly (`caseSensitive: true` vs `false`)
- Spelling error tolerance works (`acceptSpellingErrors: true` allows minor typos)
- Media (image/video/audio) displays above task description when provided
- AI generation produces valid, educational fill-in-the-blank content matching difficulty level
- Fallback works gracefully when AI generation fails (shows error message but doesn't crash)

## Existing Code to Leverage

**AccordionHandler pattern (src/handlers/embedded/AccordionHandler.ts)**
- Copy validation structure: check required fields, validate types, validate nested arrays with indexed error messages
- Copy `escapeHtml()` helper method exactly as implemented
- Copy `generateSubContentId()` helper method: `Date.now() + random string`
- Copy pattern for building H5P structure with `library`, `params`, `metadata`, `subContentId`
- Copy pattern for wrapping content: `chapterBuilder.addCustomContent(h5pContent)`

**AIAccordionHandler pattern (src/handlers/ai/AIAccordionHandler.ts)**
- Copy AI prompt building pattern: use `AIPromptBuilder.resolveConfig()` and `AIPromptBuilder.buildSystemPrompt()`
- Copy JSON response parsing logic: strip markdown code fences, parse JSON, validate structure
- Copy HTML stripping pattern: regex to remove `<p>`, `<br>`, and other HTML tags from AI responses
- Copy fallback pattern: return minimal valid content on AI failure with error message
- Copy verbose logging pattern: log prompts, response lengths, parsed item counts
- Copy user prompt template structure: clear instructions + JSON format example + "Return ONLY JSON" directive

**ChapterBuilder interface (src/compiler/ChapterBuilder.ts)**
- Use `chapterBuilder.addCustomContent()` method to add H5P structures to chapter
- Reference `wrapInRowColumn()` pattern for understanding how content gets wrapped for Interactive Book
- Use `context.logger.log()` for verbose mode logging
- Use `context.options.verbose` to conditionally enable detailed logging

**AIPromptBuilder service (src/ai/AIPromptBuilder.ts)**
- Use `AIPromptBuilder.resolveConfig(item.aiConfig, chapterConfig, bookConfig)` to merge AI configuration hierarchy
- Use `AIPromptBuilder.buildSystemPrompt(resolvedConfig)` to generate reading level and tone instructions
- Pass resulting system prompt to `quizGenerator.generateRawContent()` along with user prompt
- Understand reading level presets: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate
- Understand tone presets: educational, conversational, formal, playful, encouraging, technical

**YamlInputParser type system (src/compiler/YamlInputParser.ts)**
- Add new content type strings to `ContentType` union (follow existing pattern)
- Export content interfaces from handler files and add to `AnyContentItem` union
- Add validation cases in type guard (follow switch-case pattern from existing types)
- Reference how other handlers' interfaces are imported and exported

## In Scope: Standalone Support

**IMPORTANT:** H5P.Blanks is a **runnable content type** (`"runnable": 1` in library.json). Following the **standalone-first architecture** from the Handler Development Guide, this implementation MUST support:

- ✅ **Standalone .h5p package generation** - Users can create standalone Blanks packages that work independently
- ✅ **Embedded in Interactive Book** - Blanks content can be embedded in Interactive Book chapters
- ✅ **Build standalone FIRST, then adapt for embedding** - Following the architectural pattern

This ensures Blanks packages can be:
- Used standalone on h5p.com or any H5P platform
- Embedded in Interactive Books
- Tested independently before Interactive Book integration
- Shared and reused across different contexts

## Out of Scope

- CSV input format for Blanks content (YAML/JSON only per architectural decision)
- Support for rich text formatting within blanks (answer values are plain text only)
- Support for regex-based answer matching (only exact match and alternative answers)
- Scoring customization (uses default H5P.Blanks scoring: 1 point per correct blank)
- Custom feedback per blank (only overall feedback ranges supported)
- Image/audio/video inside answer options (answers are text-only)
- Drag-and-drop functionality (that's H5P.DragText, not H5P.Blanks)
- Multiple blanks in a single word position (each `{blank}` or `*answer*` is one distinct input field)
- Automatic blank generation from text (user must specify which words are blanks)
