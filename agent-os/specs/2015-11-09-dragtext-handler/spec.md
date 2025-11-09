# Specification: DragText (Drag the Words) Handler

## Goal

Implement handlers for H5P.DragText content type to enable fill-in-the-blank exercises where users drag words into blanks. Provide both manual and AI-generated content creation following the handler-enhanced compiler architecture.

## User Stories

- As a content creator, I want to create drag-the-words exercises with a simplified YAML format so that I can author fill-in-the-blank exercises without learning H5P's complex textField format
- As a teacher, I want AI to generate drag-the-words exercises from a topic prompt so that I can quickly create vocabulary and comprehension exercises
- As a developer, I want DragText handlers to follow established AccordionHandler patterns so that the codebase remains consistent and maintainable

## Specific Requirements

### DragTextHandler (Manual Content)

- Implements ContentHandler interface for "dragtext" and "drag-the-words" type identifiers
- Accepts simplified YAML format with sentences array containing text and blanks objects
- Accepts alternative H5P native textField format for advanced users
- Converts simplified format to H5P textField format with asterisk markers
- Supports multiple correct answers per blank using array notation
- Supports answer tips/hints attached to specific blanks
- Validates that either sentences or textField is provided but not both missing
- Validates blank answer arrays are non-empty
- Uses escapeHtml() for user-provided text to prevent XSS
- Generates unique subContentIds for H5P content structure

### AIDragTextHandler (AI-Generated Content)

- Implements ContentHandler interface for "ai-dragtext" and "ai-drag-the-words" type identifiers
- Uses AIPromptBuilder.resolveConfig() for hierarchical AI configuration merging
- Uses AIPromptBuilder.buildSystemPrompt() for reading level and formatting instructions
- Uses QuizGenerator.generateRawContent() for AI content generation
- Accepts difficulty parameter controlling vocabulary complexity and blank count
- Accepts sentenceCount and blanksPerSentence parameters for output control
- Accepts includeDistractors boolean and distractorCount parameter
- Strips HTML from AI responses before building H5P structure
- Provides fallback text page when AI generation fails
- Logs verbose output showing sentence count and generation status

### TextField Format Conversion

- Converts simplified YAML with {blank} markers to H5P asterisk format
- Single answer: {blank} with answer "word" becomes *word*
- Multiple answers: {blank} with answers ["word1", "word2"] becomes *word1/word2*
- Answer with tip: {blank} with answer "word" and tip "hint" becomes *word:hint*
- Processes distractors array into asterisk-wrapped format in separate field
- Preserves newlines and paragraph structure during conversion
- Handles special characters in answers and tips correctly

### Type System Integration

- Adds "dragtext" and "drag-the-words" to ContentType union in YamlInputParser
- Adds "ai-dragtext" and "ai-drag-the-words" to ContentType union
- Exports DragTextContent interface from DragTextHandler
- Exports AIDragTextContent interface from AIDragTextHandler
- Adds both content types to AnyContentItem union
- Validates sentences array structure if provided
- Validates textField string format if provided
- Validates prompt field required for AI handler
- Validates difficulty enum values if provided

### Handler Registration

- Registers DragTextHandler in InteractiveBookAIModule after SummaryHandler
- Registers AIDragTextHandler in InteractiveBookAIModule after AISummaryHandler
- Maintains consistent registration order with other handlers
- Both handlers return ["H5P.DragText"] from getRequiredLibraries()
- LibraryRegistry automatically resolves DragText dependencies

### Default Values and Labels

- Provides default UI labels for checkAnswer, tryAgain, showSolution, correctText, incorrectText
- Uses default behavior settings: enableRetry true, enableSolutionsButton true, instantFeedback false
- Provides default feedback range from 0-100 with score message
- Uses "h2" as default hTag if not specified
- Uses 5 sentences and 2 blanks per sentence as AI defaults
- Uses 3 distractors by default when includeDistractors is true

### Difficulty Level Implementation

- Easy difficulty: simple vocabulary, 1 blank per sentence, obvious answers, minimal distractors
- Medium difficulty: moderate vocabulary, 2 blanks per sentence, balanced challenge, some distractors
- Hard difficulty: advanced vocabulary, 3+ blanks per sentence, challenging answers, many distractors
- Difficulty parameter influences AI system prompt vocabulary guidance
- Difficulty parameter affects blanksPerSentence when not explicitly provided

### Testing Coverage

- Unit tests for DragTextHandler validate method covering all validation paths
- Unit tests for DragTextHandler process method covering format conversion
- Unit tests for AIDragTextHandler validate method covering prompt and parameter validation
- Unit tests for AIDragTextHandler process method covering AI generation and fallback
- Tests verify textField conversion from simplified format handles all edge cases
- Tests verify multiple answers and tips are correctly formatted
- Tests verify distractors are properly included in H5P structure
- Integration test in comprehensive-demo.yaml verifies end-to-end functionality

### Documentation Updates

- Updates README.md with DragText in supported content types table
- Adds manual DragText example showing simplified format
- Adds AI DragText example showing prompt and parameters
- Creates examples/yaml/dragtext-example.yaml with comprehensive examples
- Documents both simplified format and textField format options
- Explains difficulty levels and their effects on generated content

## Existing Code to Leverage

### AccordionHandler Pattern (src/handlers/embedded/AccordionHandler.ts)

- Use same escapeHtml() implementation for preventing XSS
- Use same generateSubContentId() implementation for unique IDs
- Use same validation pattern checking required fields and types
- Use same verbose logging pattern with options.verbose checks
- Use same H5P content structure with library, params, metadata, subContentId

### AIAccordionHandler Pattern (src/handlers/ai/AIAccordionHandler.ts)

- Use AIPromptBuilder.resolveConfig() for merging item, chapter, book config
- Use AIPromptBuilder.buildSystemPrompt() for reading level instructions
- Use QuizGenerator.generateRawContent() for AI content generation
- Use stripHtml() method to remove AI-generated HTML before wrapping
- Use try/catch with fallback content when AI generation fails
- Use style parameter pattern for content structure control separate from aiConfig

### AIPromptBuilder Static Methods (src/ai/AIPromptBuilder.ts)

- Call AIPromptBuilder.resolveConfig() as static method not instance method
- Pass item.aiConfig, context.chapterConfig, context.bookConfig to resolveConfig
- Call AIPromptBuilder.buildSystemPrompt() with resolved config
- Let system prompt handle reading level, tone, output format
- Keep user prompt focused on content requirements and structure

### QuizGenerator.generateRawContent (src/ai/QuizGenerator.ts)

- Use public generateRawContent(systemPrompt, userPrompt) method
- Parse JSON response stripping code fence markers
- Handle both Anthropic and Google AI providers automatically
- Returns raw string response for custom parsing

### YamlInputParser Type Pattern (src/compiler/YamlInputParser.ts)

- Add type aliases to ContentType union following existing pattern
- Export interfaces from handler files not inline
- Add to AnyContentItem union using import() syntax
- Add validation cases in validateContentItem switch statement
- Check required fields with clear error messages

## Out of Scope

- Standalone DragText handler for non-Interactive-Book packages
- CSV input format support for DragText
- Visual editor for creating DragText exercises
- Image-based blanks or drag-and-drop images
- Audio pronunciation hints for blanks
- Custom scoring algorithms beyond H5P defaults
- Advanced H5P.DragText features like casing sensitivity configuration
- Multi-language interface label customization
- Real-time collaboration on DragText authoring
- Analytics or learning management system integration

## Success Criteria

- DragTextHandler validates and processes manual content with 100% test coverage
- AIDragTextHandler generates appropriate exercises based on difficulty and parameters
- Simplified YAML format correctly converts to H5P textField asterisk format
- Multiple answers and tips format correctly in generated textField
- Both "dragtext" and "drag-the-words" type names are recognized
- Generated .h5p packages upload successfully to h5p.com without errors
- DragText exercises display and function correctly in Interactive Books
- Words are draggable and droppable into blanks
- AI-generated content matches requested difficulty level vocabulary
- Distractors appear when includeDistractors is true
- Fallback works gracefully when AI generation fails
- All validation provides clear, actionable error messages
- Comprehensive-demo.yaml includes working DragText examples
- Documentation clearly explains both simplified and textField formats
