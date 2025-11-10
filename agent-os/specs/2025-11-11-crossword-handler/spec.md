# Specification: H5P Crossword Handler

## Goal

Implement manual and AI-generated handlers for H5P.Crossword content type to enable educators to create interactive crossword puzzles for vocabulary building, educational review, and language learning through simple YAML configuration.

## User Stories

- As an educator, I want to create crossword puzzles by specifying word/clue pairs in YAML so that I can quickly generate vocabulary exercises without manual grid layout
- As a content creator, I want to generate crossword puzzles from a single topic prompt using AI so that I can rapidly create educational content without thinking of individual clues

## Specific Requirements

**Manual Handler (CrosswordHandler)**
- Accepts array of word/clue pairs with optional extra clues (text, image, audio, video)
- Validates minimum 2 words required for crossword generation
- Validates single-word answers (no spaces allowed, hyphens permitted)
- Supports behaviour settings (instant feedback, scoring, penalties, retry)
- Supports theme customization (colors for grid, cells, backgrounds)
- Supports overall feedback ranges based on score percentages
- Provides sensible defaults for all optional configuration fields

**AI Handler (AICrosswordHandler)**
- Generates word/clue pairs from single topic prompt using AI
- Controls word count (5-20 words recommended)
- Applies difficulty levels (easy, medium, hard) affecting word length and complexity
- Optionally generates extra clue text for hints
- Validates AI-generated answers are single words (rejects multi-word responses)
- Provides fallback content if AI generation fails
- Supports universal AI configuration (targetAudience, tone, customization)

**Validation Rules**
- Minimum 2 words required for crossword generation
- Answer field must be single word (spaces rejected, hyphens allowed)
- Clue field must be non-empty string
- Extra clue types must be valid (text, image, audio, video)
- Theme colors must be valid hex format (#RRGGBB)
- Behaviour boolean fields validated as boolean types
- Feedback ranges must be 0-100 percentages

**H5P Content Generation**
- Builds H5P.Crossword 0.5 library structure
- Creates words array with clue, answer, orientation (automatic), fixWord (false)
- Generates extra clue sub-content (H5P.AdvancedText for text hints)
- Applies behaviour settings with proper defaults
- Applies theme customization if provided
- Generates unique subContentId for each extra clue
- Includes complete l10n and a11y label sets

**Error Handling**
- Clear validation error messages identifying missing/invalid fields
- AI generation errors logged with fallback to generic content
- Multi-word answers from AI skipped with warning logged
- JSON parsing errors caught and reported clearly

**Testing Coverage**
- Unit tests for manual handler (10 tests minimum)
- Unit tests for AI handler (10 tests minimum)
- Integration tests for YAML parsing and package generation (5 tests minimum)
- Strategic tests for stress cases and backward compatibility

## Visual Design

No visual design assets provided. Content generates H5P.Crossword interactive grid which is automatically laid out by the H5P library client-side.

## Existing Code to Leverage

**BlanksHandler.ts (Manual Handler Pattern)**
- TypeScript interface defining content structure with optional fields
- Comprehensive validation method checking required fields and types
- Process method building H5P library structure with params and metadata
- Helper methods: escapeHtml, generateSubContentId
- Behaviour settings with sensible defaults

**AIBlanksHandler.ts (AI Handler Pattern)**
- AI content generation using quizGenerator with system and user prompts
- AIPromptBuilder.resolveConfig for configuration hierarchy
- AIPromptBuilder.buildSystemPrompt for reading level and tone
- Difficulty-specific instructions embedded in AI prompts
- JSON parsing with markdown code fence stripping
- Fallback content generation on AI failure
- stripHtml method to sanitize AI responses

**EssayHandler.ts (Validation Patterns)**
- Detailed field validation with specific error messages
- Cross-field validation (e.g., maximumLength > minimumLength)
- Array validation with per-item error messages
- Type checking with typeof and Array.isArray
- String length constraints with MAX_LENGTH constants

**AIEssayHandler.ts (AI Prompt Building)**
- getDifficultyGuidance method building difficulty-specific instructions
- Structured AI prompt templates with clear formatting requirements
- parseAIResponse method with strict validation
- getDefaultKeywordCount based on difficulty level
- Character limit determination based on difficulty

**ContentHandler Interface**
- getContentType() returns string identifier
- validate(item) returns {valid: boolean, error?: string}
- process(context, item) async method for H5P generation
- getRequiredLibraries() returns array of library names

## Out of Scope

- CSV input format for crosswords (YAML only for initial release)
- Fixed word positioning/manual grid placement (auto-placement only)
- Solution word feature (overall solution from specific letters)
- Background image support for crossword grid
- Pool size randomization (use all words provided)
- Extra clues with audio/video (text and image only for v1)
- Media files in taskDescription (plain text/HTML only)
- Custom label overrides (use H5P defaults)
