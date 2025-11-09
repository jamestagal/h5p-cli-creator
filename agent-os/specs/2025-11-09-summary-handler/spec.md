# Specification: H5P.Summary Handlers

## Goal

Implement manual and AI-generated handlers for H5P.Summary content type, enabling Interactive Books to include statement-selection exercises where learners choose correct statements from multiple options.

## User Stories

- As a content creator, I want to manually define summary questions with multiple choice statements so that I can create custom knowledge checks without using AI
- As a content creator, I want AI to generate summary questions from prompts so that I can quickly create assessment content with different styles (true-false, multiple-choice, mixed)

## Specific Requirements

**SummaryHandler (Manual Content)**
- Implement ContentHandler interface in `src/handlers/embedded/SummaryHandler.ts`
- Accept `questions` array where each question has `statements` array (first statement is always correct)
- Support optional `tip` field for each question to provide learner guidance
- Support optional UI label customization (solvedLabel, scoreLabel, resultLabel, etc.)
- Support optional feedback ranges with score-based messages
- Generate unique `subContentId` for each question using timestamp-random pattern
- Validate that questions array exists, is non-empty, and each question has at least 2 statements
- Default to standard H5P.Summary UI labels if not provided
- Default to standard feedback message if feedback array not provided

**AISummaryHandler (AI-Generated Content)**
- Implement ContentHandler interface in `src/handlers/ai/AISummaryHandler.ts`
- Generate summary questions from `prompt` field using AI
- Support `questionCount` parameter (default: 5) to control number of questions generated
- Support `statementsPerQuestion` parameter (default: 3, minimum: 2) to control answer options
- Support `style` parameter with values: "true-false", "multiple-choice", "mixed"
- Use AIPromptBuilder.resolveConfig() for hierarchical AI configuration (item > chapter > book > defaults)
- Use AIPromptBuilder.buildSystemPrompt() for reading level and tone formatting
- Call quizGenerator.generateRawContent() with system and user prompts
- Strip HTML from AI responses using stripHtml() before wrapping in H5P structure
- Provide text page fallback on AI generation failure with error details

**H5P.Summary Content Structure**
- Main library: `H5P.Summary 1.0`
- Content params include `intro` (instruction text), `summaries` array, UI labels, and feedback ranges
- Each summary object contains `summary` array (statements), optional `tip`, and unique `subContentId`
- First statement in each `summary` array is the correct answer (critical H5P.Summary requirement)
- Include all required UI labels: solvedLabel, scoreLabel, resultLabel, labelCorrect, labelIncorrect, labelCorrectAnswers, tipButtonLabel, scoreBarLabel, progressText, alternativeIncorrectLabel
- Include overallFeedback array with from/to/feedback objects for score-based messaging

**AI Style Parameter Behavior**
- "true-false": Generate questions with exactly 2 statements (1 correct, 1 incorrect)
- "multiple-choice": Generate questions with 3-4 statements (1 correct, 2-3 incorrect)
- "mixed": Vary number of statements across questions for diversity
- Style controls content structure, separate from aiConfig which controls AI behavior (reading level, tone)
- Style instructions added to user prompt, not system prompt

**Validation Requirements**
- Manual handler validates: questions array exists, is non-empty, each question has statements array with minimum 2 items, all statements are non-empty strings
- AI handler validates: prompt field required and is string, questionCount is positive integer if provided, statementsPerQuestion >= 2 if provided, style is valid enum value if provided
- Both handlers validate hTag/style enums with explicit checks returning descriptive error messages
- Validation occurs before process() via validate() method returning { valid: boolean; error?: string }

**Type System Integration**
- Add "summary" and "ai-summary" to ContentType union in YamlInputParser.ts
- Export SummaryContent and AISummaryContent interfaces from YamlInputParser
- Add both types to AnyContentItem union using import() syntax
- Add validation cases in validateContentItem() switch statement for both content types
- Ensure type safety throughout handler processing chain

**Handler Registration**
- Register SummaryHandler in interactive-book-ai-module.ts after embedded handlers
- Register AISummaryHandler in interactive-book-ai-module.ts after AI handlers
- Maintain consistent registration order: core handlers, AI handlers, embedded handlers
- Both handlers declare getRequiredLibraries() returning ["H5P.Summary"]

**Default Values**
- Default intro: "Choose the correct statement."
- Default UI labels: solvedLabel: "Progress:", scoreLabel: "Wrong answers:", resultLabel: "Your result", labelCorrect: "Correct.", labelIncorrect: "Incorrect! Please try again.", labelCorrectAnswers: "Correct answers.", tipButtonLabel: "Show tip", scoreBarLabel: "You got :num out of :total points", progressText: "Progress :num of :total", alternativeIncorrectLabel: "Incorrect"
- Default feedback: Single range 0-100 with message "You got @score of @total statements (@percent %) correct."
- Default questionCount: 5
- Default statementsPerQuestion: 3
- Default style: "multiple-choice"

**HTML Safety and Escaping**
- Use escapeHtml() method for all user-provided text in manual handler to prevent XSS
- Use stripHtml() in AI handler to remove AI-generated HTML tags before wrapping in proper tags
- Wrap cleaned content in `<p>` tags for H5P compatibility
- Never trust AI output to follow HTML formatting instructions without safety net

## Existing Code to Leverage

**AccordionHandler Pattern**
- Follow exact validation structure with comprehensive field checks and enum validation
- Use same H5P content structure pattern with library, params, metadata, subContentId
- Use escapeHtml() method for text sanitization
- Use generateSubContentId() method for unique IDs

**AIAccordionHandler Pattern**
- Use AIPromptBuilder.resolveConfig() static method for config hierarchy resolution
- Use AIPromptBuilder.buildSystemPrompt() for system prompt generation
- Use quizGenerator.generateRawContent() for AI content generation
- Implement stripHtml() method to remove unwanted HTML from AI responses
- Implement getFallbackPanels() pattern for AI failure graceful degradation
- Parse JSON responses with code fence stripping (```json blocks)

**QuizHandler AI Integration**
- Follow same AIPromptBuilder integration pattern for reading level configuration
- Use verbose logging for AI generation progress and results
- Wrap AI generation in try/catch with fallback to text page on failure
- Log resolved config details (reading level, question count) in verbose mode

**YamlInputParser Type System**
- Follow pattern of exporting handler interfaces and adding to union types
- Use import() syntax for handler types in AnyContentItem union
- Add validation cases in validateContentItem() with descriptive error messages
- Use validTypes array and switch statement for content type validation

**ChapterBuilder Integration**
- Use addCustomContent() method for complex H5P structures like Summary
- Ensure content structure matches H5P.Summary library expectations
- Include all required metadata fields (title, license, contentType)

## Out of Scope

- Creating standalone Summary handler (Summary is embedded-only for now, not runnable as separate H5P package)
- CSV input support for Summary content (YAML/JSON only per architectural decision)
- Image or audio support in summary statements (text-only statements for initial implementation)
- Rich HTML formatting in statements beyond basic `<p>` tags (keep statements simple)
- Custom scoring algorithms (use H5P.Summary default scoring)
- Integration with external quiz banks or question repositories
- Multilingual statement support beyond single language per book
- Statement randomization or shuffling (maintain order as defined/generated)
- Time limits or attempt restrictions (not supported by H5P.Summary 1.10)
- Export/import of summary questions to other formats (H5P package only)
