# Specification: H5P.QuestionSet Integration

## Goal

Enable educators to create professional quiz assessments with mixed question types by integrating H5P.QuestionSet support into h5p-cli-creator, leveraging existing handlers through a delegation pattern to provide intro pages, progress tracking, and comprehensive result screens.

## User Stories

- As a language learning instructor, I want to create comprehensive chapter-end quizzes with mixed question types (multiple choice, fill-in-blanks, true/false, essay) so that I can assess different learning objectives in a single professional assessment experience
- As a corporate trainer, I want to create certification exams with intro screens, pass/fail thresholds, and result feedback so that learners receive a formal assessment experience similar to LMS platforms
- As an educator using YouTube story extraction, I want to automatically generate comprehensive story quizzes with multiple question types so that I can assess comprehension, vocabulary, and cultural understanding without manually creating each question

## Specific Requirements

### AIQuestionSetHandler Implementation

- Create AIQuestionSetHandler class implementing ContentHandler interface with getContentType() returning "ai-questionset"
- Implement validate() method to check required fields (questions array, valid question types, intro/end game configuration)
- Implement process() method using handler delegation pattern to generate complete QuestionSet structure
- Support 6 question types initially via existing handlers: ai-multichoice (MultiChoiceHandler), ai-blanks (AIBlanksHandler), ai-dragtext (AIDragTextHandler), ai-truefalse (AITrueFalseHandler), ai-essay (AIEssayHandler), ai-singlechoiceset (AISingleChoiceSetHandler)
- Iterate through questions array, resolve appropriate handler for each type, call handler.process() to generate params
- Wrap handler output in QuestionSet question structure with library name, params, metadata (contentType, license, title), and unique subContentId (UUID)
- Handle errors gracefully with fallback content and clear error messages for unsupported question types
- Generate intro page structure with showIntroPage boolean, title, introduction HTML, startButtonText, and optional backgroundImage

### YAML Configuration Schema

- Support type field with value "ai-questionset" to identify QuestionSet content
- Accept title field for QuestionSet display name shown in chapter navigation
- Define introPage object with showIntro boolean, title string, introduction string (HTML supported), startButtonText string
- Define quiz settings including progressType ("dots" or "textual"), passPercentage (0-100 integer), randomQuestions boolean, poolSize integer for question bank selection
- Accept questions array where each item contains type field, prompt field for AI generation, and question-type-specific parameters
- Define endGame object with showResults boolean, message string, overallFeedback array with from/to percentage ranges and feedback strings
- Support aiConfig at QuestionSet level with targetLanguage, instructionalLanguage, includeTranslations, targetAudience, tone following existing multi-language AI patterns
- Allow aiConfig to be inherited from chapter or book level following established configuration cascade

### Handler Delegation Architecture

- Map YAML question type strings to handler instances (ai-blanks maps to AIBlanksHandler, ai-dragtext maps to AIDragTextHandler, etc.)
- Call handler.process() for each question passing HandlerContext and question definition
- Extract generated H5P content from handler and wrap in QuestionSet question structure
- Retrieve library name from handler using getRequiredLibraries() method (e.g., "H5P.Blanks 1.14")
- Apply resolved AI configuration to all questions using AIPromptBuilder.resolveConfig() following item-chapter-book cascade
- Validate each generated question using handler.validate() before adding to questions array
- Provide clear error messages identifying which question failed and why (e.g., "Question 3 (ai-blanks) failed validation: Missing prompt field")
- Support future extensibility by checking handler registry for new question types without code changes

### Library Registry Integration

- Extract H5P.QuestionSet-1.20 library from content-type-cache using LibraryRegistry
- Auto-extract 6 question type libraries bundled in QuestionSet package: H5P.MultiChoice-1.16, H5P.Blanks-1.14, H5P.DragText-1.10, H5P.TrueFalse-1.8, H5P.Essay-1.5, H5P.SingleChoiceSet-1.11
- Extract supporting libraries: H5P.Video-1.6, H5P.Image-1.1, H5P.AdvancedText-1.1, H5P.JoubelUI-1.3, FontAwesome-4.5
- Register all required libraries before package assembly to prevent version mismatch errors
- Return "H5P.QuestionSet" from getRequiredLibraries() method

### Smart Import Integration

- Support ai-questionset as chapter content type in YouTube story workflow
- Apply book-level aiConfig to all questions automatically (targetLanguage, instructionalLanguage, includeTranslations)
- Generate mixed question types from story content using AI when questionTypes array specified
- Position QuestionSet as dedicated quiz chapter after story pages for comprehensive assessment
- Use same AIQuizGenerator infrastructure for consistent question generation

### Multi-Language AI Support

- Inherit targetLanguage from book/chapter aiConfig for question content generation
- Inherit instructionalLanguage from book/chapter aiConfig for UI text (intro page, button labels, feedback)
- Support includeTranslations flag to add bilingual content in questions (e.g., Vietnamese questions with English translations in parentheses)
- Apply targetAudience and tone configuration to all questions for consistent difficulty and style
- Generate intro page title and introduction in instructionalLanguage for beginner scaffolding
- Generate question prompts and answers in targetLanguage for language learning contexts

### Content Structure Generation

- Build H5P.QuestionSet content.json with introPage, progressType, passPercentage, questions array, endGame, texts object
- Generate texts object with button labels (prevButton, nextButton, finishButton, submitButton) using library language strings
- Create metadata for each question with contentType matching handler type (e.g., "Fill in the Blanks"), license "U", title from question definition
- Generate unique subContentId for each question using UUID v4
- Set disableBackwardsNavigation false by default to allow question review
- Apply randomQuestions and poolSize if configured for question bank functionality
- Build overallFeedback array with percentage ranges and localized feedback strings

### Configuration Examples

- Provide beginner language learning example with Vietnamese content, English instructions, 70% pass threshold, mixed ai-blanks and ai-singlechoiceset questions
- Provide professional training example with formal tone, 80% certification threshold, random question selection from pool, ai-multichoice and ai-truefalse questions
- Provide chapter quiz example showing QuestionSet as dedicated chapter after lesson content with comprehensive assessment using all 6 question types

## Visual Design

No visual assets provided for this specification.

## Existing Code to Leverage

### MultiChoiceHandler (src/handlers/ai/MultiChoiceHandler.ts)

- Implements ContentHandler interface with process(), validate(), getRequiredLibraries() pattern
- Uses AIPromptBuilder.resolveConfig() for configuration cascade (item > chapter > book)
- Calls quizGenerator.generateH5pQuiz() with sourceText, questionCount, and resolved AI config
- Returns "H5P.MultiChoice" from getRequiredLibraries() showing library dependency pattern
- Validates sourceText field and optional aiConfig fields (targetAudience, tone)

### AIBlanksHandler (src/handlers/ai/AIBlanksHandler.ts)

- Defines AIBlanksContent interface showing prompt-based configuration pattern
- Validates prompt, sentenceCount, blanksPerSentence, difficulty fields
- Uses JSONValidator for AI response parsing and validation
- Applies aiConfig cascade for targetAudience, tone, customization
- Shows YAML documentation pattern in interface comments with example

### AIDragTextHandler (src/handlers/ai/AIDragTextHandler.ts)

- Implements similar prompt-based AI generation pattern as AIBlanksHandler
- Validates sentenceCount, blanksPerSentence, includeDistractors, distractorCount parameters
- Uses AIPromptBuilder for multi-language content generation
- Returns "H5P.DragText" from getRequiredLibraries() for library registry

### AIPromptBuilder (src/ai/AIPromptBuilder.ts)

- Provides static resolveConfig() method for configuration cascade merging
- Defines ReadingLevel and Tone types with comprehensive presets (kindergarten through professional, esl-beginner through esl-advanced)
- Contains READING_LEVELS map with vocabulary, sentenceLength, style, examples guidance for each level
- Supports multi-language content generation with targetLanguage and instructionalLanguage separation
- Used universally across all AI handlers for consistent configuration

### Vietnamese Beginner Example (examples/multi-language/vietnamese-beginner.yaml)

- Shows global aiConfig pattern with targetLanguage "vi", instructionalLanguage "en", includeTranslations true
- Demonstrates chapter structure with mixed content types (ai-text, ai-accordion, ai-singlechoiceset)
- Shows how English instructions scaffold Vietnamese learning content
- Uses difficulty levels (easy, medium) and question count parameters
- Illustrates configuration cascade where chapter items inherit book aiConfig

## Out of Scope

- DragQuestion handler implementation (H5P.DragQuestion) - defer to Phase 2 as analysis shows handler does not exist yet
- MarkTheWords handler implementation (H5P.MarkTheWords) - defer to Phase 2 as analysis shows handler does not exist yet
- MultiMediaChoice handler implementation (H5P.MultiMediaChoice) - rarely used, defer to Phase 2 or later
- Question pooling with random selection from larger bank - defer to Phase 3 advanced features
- Weighted scoring or partial credit systems - defer to Phase 3 advanced features
- Per-question time limits or timed quizzes - defer to Phase 3 advanced features
- Question difficulty analysis or adaptive testing - defer to Phase 3 advanced features
- Advanced analytics (question performance tracking, learner progress) - defer to Phase 3 or separate feature
- Background images for intro page - defer to Phase 2 as requires image handling in QuestionSet context
- Custom button text localization beyond English - defer to Phase 3 multi-language enhancement
