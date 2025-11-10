# H5P Crossword Handler - Requirements

## Overview

Implement both manual and AI-generated handlers for H5P.Crossword content type (version 0.5.13). The Crossword content type creates interactive crossword puzzles with automatic grid generation, making it ideal for vocabulary building, educational review, and language learning.

## Key Advantage

**H5P.Crossword automatically generates the puzzle grid layout from a word list.** Our handlers only need to provide word/clue pairs - the complex crossword placement algorithms are handled entirely by the H5P library client-side.

## Core Requirements

### 1. Manual Handler (CrosswordHandler)

**Purpose:** Allow users to create crosswords by directly specifying word/clue pairs in YAML.

**Required Features:**
- Accept array of word/clue pairs
- Support optional task description
- Support optional extra clues (text, image, audio, video)
- Configure behaviour settings (instant feedback, scoring, penalties, retry)
- Support theme customization (colors, backgrounds)
- Overall feedback ranges (score-based messages)
- Full label customization (UI strings)

**YAML Interface:**
```yaml
- type: crossword
  title: "Geography Quiz"
  taskDescription: "Famous landmarks around the world"
  words:
    - clue: "Statue of liberty is located in?"
      answer: "New York"
      extraClue:  # Optional
        type: text
        content: "The city in US, over 8 mil. inhabitants"

    - clue: "Taj Mahal is located in which city?"
      answer: "Agra"

    - clue: "Eiffel Tower is located in?"
      answer: "Paris"

  behaviour:
    enableInstantFeedback: false
    scoreWords: true
    applyPenalties: false
    enableRetry: true
    enableSolutionsButton: true

  theme:
    backgroundColor: "#173354"
    gridColor: "#000000"
    cellBackgroundColor: "#ffffff"
    cellColor: "#000000"

  overallFeedback:
    - from: 0
      to: 49
      feedback: "Keep practicing!"
    - from: 50
      to: 100
      feedback: "Great job!"
```

### 2. AI Handler (AICrosswordHandler)

**Purpose:** Generate complete crossword puzzles from a single topic prompt using AI.

**Required Features:**
- Generate word/clue pairs from topic prompt
- Control number of words generated
- Support difficulty levels (easy, medium, hard)
- Optionally generate extra clue text (hints)
- Ensure AI generates valid single-word answers
- Fallback content if AI generation fails
- Universal AI configuration support

**YAML Interface:**
```yaml
- type: ai-crossword
  title: "Solar System Crossword"
  prompt: "Create a crossword puzzle about planets in our solar system"
  wordCount: 10
  difficulty: "medium"
  includeExtraClues: true  # Generate hint text as extraClue

  aiConfig:
    targetAudience: "grade-6"
    tone: "educational"
    customization: "Focus on planet names, moons, and key features"
```

## Content Validation Requirements

### Word Validation
1. **Minimum 2 words** required for crossword generation
2. **Answer must be single word** (no spaces allowed)
3. Letters, numbers, and hyphens allowed in answers
4. Recommended word length: 3-15 characters
5. Non-empty clue text required
6. Extra clue validation (if provided):
   - Valid type: text, image, audio, video
   - Valid file paths or URLs for media
   - Alternative text required for images

### Behaviour Validation
- `enableInstantFeedback`: boolean (default: false)
- `scoreWords`: boolean (default: true) - score by words vs characters
- `applyPenalties`: boolean (default: false) - -1 for wrong answers
- `enableRetry`: boolean (default: true)
- `enableSolutionsButton`: boolean (default: true)
- `poolSize`: number (optional) - randomize subset of words
- `keepCorrectAnswers`: boolean (default: false) - keep correct on retry

### Theme Validation
All color values must be valid hex colors (e.g., "#173354")

## AI Generation Requirements

### Difficulty Levels

**Easy:**
- Word length: 5-8 letters
- Common vocabulary
- Obvious clues
- Simple concepts

**Medium:**
- Word length: 6-12 letters
- Mix of common and technical terms
- Moderate clues requiring some thinking
- Standard educational level

**Hard:**
- Word length: 8-15 letters
- Academic/technical vocabulary
- Cryptic or challenging clues
- Advanced concepts

### AI Prompt Strategy

The AI must generate word/clue pairs that:
1. Are **single words only** (critical for crossword format)
2. Have enough **common letters** to allow grid placement
3. Match the **difficulty level** requested
4. Are **factually correct** and educational
5. Include optional **extra clue text** for hints

**Example AI Prompt Template:**
```
Generate exactly {wordCount} crossword puzzle clues and answers about {topic}.

Requirements:
- Each answer must be a SINGLE WORD (no spaces, hyphens allowed)
- Word length: {minLength}-{maxLength} letters
- Clues should be {difficulty} difficulty
- Educational and factually correct
- {difficultyInstructions}

{if includeExtraClues}
- Include an "extraClue" field with additional hint text (1-2 sentences)
{endif}

Format as JSON array:
[
  {
    "clue": "The red planet",
    "answer": "Mars",
    "extraClue": "Fourth planet from the Sun, known for its rusty color"
  }
]

Return ONLY the JSON array with no markdown or additional text.
```

### AI Fallback Behavior

If AI generation fails:
1. Log warning message
2. Generate fallback crossword with 5 generic words
3. Fallback clues indicate AI generation failed
4. Package still generates (degraded but functional)

## H5P Library Requirements

### Required Libraries
- **H5P.Crossword 0.5** (main library)
- H5P.Question 1.5
- H5P.JoubelUI 1.3
- H5P.Image 1.1 (for extra clues)
- H5P.AdvancedText 1.1 (for extra clues)
- H5P.Audio 1.5 (optional, for audio extra clues)
- H5P.Video 1.6 (optional, for video extra clues)
- H5P.MaterialDesignIcons 1.0

### Content Structure

The H5P content.json must follow this structure:

```json
{
  "taskDescription": "<p>HTML task description</p>",
  "words": [
    {
      "clue": "Clue text",
      "answer": "Answer",
      "orientation": "across",  // Auto-determined by H5P
      "fixWord": false,         // Don't manually position
      "extraClue": {            // Optional
        "library": "H5P.AdvancedText 1.1",
        "params": {
          "text": "<p>Extra hint text</p>"
        },
        "metadata": {
          "contentType": "Text",
          "license": "U",
          "title": "Untitled Text"
        },
        "subContentId": "generated-uuid"
      }
    }
  ],
  "behaviour": { ... },
  "theme": { ... },
  "overallFeedback": [ ... ],
  "l10n": { ... },
  "a11y": { ... }
}
```

## Testing Requirements

### Unit Tests (Manual Handler)
1. Valid crossword with 5 words
2. Minimum word count validation (< 2 words = error)
3. Single-word answer validation (spaces rejected)
4. Empty clue validation
5. Extra clue (text) generation
6. Extra clue (image) with file path
7. Theme customization
8. Behaviour settings
9. Overall feedback ranges
10. Label customization

### Unit Tests (AI Handler)
1. Generate crossword from prompt
2. Word count control (5, 10, 15 words)
3. Difficulty levels (easy, medium, hard)
4. Include extra clues option
5. AI response parsing (valid JSON)
6. AI response parsing (markdown code fence stripping)
7. Single-word validation (reject multi-word)
8. Fallback on AI failure
9. Universal AI config (targetAudience, tone)
10. Empty prompt validation

### Integration Tests
1. YAML parsing for manual crossword
2. YAML parsing for AI crossword
3. Package generation with H5P.Crossword library
4. Extra clue media file handling
5. H5P.com upload and playback test

### Strategic Tests
1. Crossword with 15+ words (stress test)
2. Mixed extra clue types (text, image, audio)
3. AI generation with custom prompts
4. Theme with custom colors
5. Behaviour with all options enabled
6. Backward compatibility (existing YAML files unaffected)

## Example Files Required

### 1. Manual Example (crossword-example.yaml)
Comprehensive example demonstrating:
- 10+ word crossword
- Extra clues (text, image)
- Theme customization
- Behaviour settings
- Overall feedback
- Multiple chapters

### 2. AI Example (crossword-ai-example.yaml)
AI-generated examples:
- Basic AI crossword (5 words)
- AI with difficulty levels
- AI with extra clues
- AI with custom prompts
- Multiple topics (science, history, geography)

### 3. Production Demo (crossword-production-demo.yaml)
Ready-to-use example for H5P.com testing:
- 8-10 words
- Mixed difficulty
- Educational content
- Clear instructions
- No AI (avoid API key requirement)

## Error Messages

### Validation Errors
- `"Crossword requires at least 2 words for grid generation"`
- `"Answer must be a single word (no spaces allowed): '{answer}'"`
- `"Field 'clue' is required for each word"`
- `"Field 'answer' is required for each word"`
- `"Extra clue type must be one of: text, image, audio, video"`
- `"Extra clue file not found: {path}"`

### AI Generation Errors
- `"AI crossword generation failed: {error}. Using fallback content."`
- `"AI generated multi-word answer '{answer}' which was skipped. Only single words are allowed."`
- `"AI response could not be parsed as JSON"`
- `"Field 'prompt' is required for ai-crossword type"`

### H5P Library Errors
- `"H5P.Crossword library version 0.5 is required but not found in cache"`

## Success Criteria

✅ **Manual Handler:**
- Generate valid H5P.Crossword package from YAML
- Support 2-50 words per crossword
- Extra clues (text) working
- Theme customization working
- All 10 unit tests passing

✅ **AI Handler:**
- Generate crossword from single prompt
- Respect word count parameter (5-20 words)
- Apply difficulty levels correctly
- Generate valid single-word answers (no spaces)
- Fallback on AI failure
- All 10 unit tests passing

✅ **Integration:**
- YAML → H5P package generation successful
- Upload to H5P.com and verify playback
- Grid auto-generation working
- Extra clues (text) displaying correctly
- Scoring and retry working
- All 5 integration tests passing

✅ **Documentation:**
- crossword-example.yaml with 10+ examples
- crossword-ai-example.yaml with AI demos
- crossword-production-demo.yaml tested on H5P.com
- README updated with Crossword examples
- CHANGELOG updated

## Performance Targets

- **Manual Handler Processing:** < 500ms for 20-word crossword
- **AI Handler Generation:** < 10s for 10-word crossword (depends on AI API)
- **Package Size:** 200-500KB (typical crossword package)

## Backward Compatibility

- No breaking changes to existing handlers
- Existing YAML files continue to work
- New crossword type is additive only
- All existing tests remain passing

## Future Enhancements (Out of Scope)

The following are NOT required for initial implementation:
- ❌ CSV input format for crosswords
- ❌ Fixed word positioning (manual grid placement)
- ❌ Solution word feature (overall solution from specific letters)
- ❌ Background image support
- ❌ Extra clues with audio/video (text and image only for v1)
- ❌ Pool size (randomize subset of words)

These can be added in future iterations based on user feedback.

## Reference Implementation

See existing handlers for patterns:
- [src/handlers/embedded/BlanksHandler.ts](../../src/handlers/embedded/BlanksHandler.ts) - Manual handler pattern
- [src/handlers/ai/AIBlanksHandler.ts](../../src/handlers/ai/AIBlanksHandler.ts) - AI handler pattern
- [src/handlers/embedded/EssayHandler.ts](../../src/handlers/embedded/EssayHandler.ts) - Validation examples
- [src/handlers/ai/AIEssayHandler.ts](../../src/handlers/ai/AIEssayHandler.ts) - AI prompt building

## Implementation Timeline Estimate

- **Manual Handler:** 2-3 hours
- **AI Handler:** 3-4 hours
- **Unit Tests:** 2 hours (20 tests)
- **Integration Tests:** 1 hour (5 tests)
- **Example Files:** 1 hour
- **Documentation:** 1 hour

**Total Estimate:** 10-12 hours

## Technical Notes

### Grid Generation
- **Automatic:** H5P.Crossword generates grid layout client-side using word-fitting algorithms
- **No server-side generation required:** Our handler just provides word list
- **Failure cases:** H5P displays error if words can't fit (not enough common letters)

### Extra Clues
Extra clues are displayed in a modal overlay when user clicks the info icon:
- **H5P.AdvancedText:** Formatted text with HTML support
- **H5P.Image:** Images with alt text and zoom support
- **H5P.Audio:** Audio clips (future)
- **H5P.Video:** Video clips (future)

### Theme System
H5P.Crossword supports extensive theming:
- Background color/image
- Grid border color
- Cell background (normal and highlighted)
- Cell text color (normal and highlighted)
- Clue ID color (normal and highlighted)

All theme properties are optional with sensible defaults.
