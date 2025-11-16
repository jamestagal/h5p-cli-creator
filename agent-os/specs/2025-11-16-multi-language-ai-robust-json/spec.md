# Specification: Multi-Language AI Content Generation and Robust JSON Error Handling

## Goal

Enhance h5p-cli-creator's AI content generation system to support multi-language educational content (Vietnamese, French, German, etc.) while maintaining developer-facing instructions in English, and reduce AI-generated JSON parsing failures from ~20% to <5% through robust error handling and retry logic.

## User Stories

- As an educator creating Vietnamese language learning materials, I want AI-generated quiz questions and activities to be created in Vietnamese (with optional English translations) so that my students can learn in their native language without manual translation work.

- As a language teacher working with beginner-level students, I want quiz instructions and task directions in English (their first language) while the content (questions, answers) is in the target language (Vietnamese, French, etc.) so that students understand what they need to do without cognitive overload from instructions in the target language.

- As a developer using h5p-cli-creator, I want clear visibility into AI generation failures and automatic retry logic so that I can reliably generate H5P packages without manual regeneration attempts.

- As a content creator, I want to specify target language once at the book level and have it cascade to all AI-generated content so that I don't need to repeat language instructions in every prompt.

## Specific Requirements

### Multi-Language AI Content Configuration

- Add `targetLanguage` field (ISO 639-1 code) to `AIConfiguration` interface for explicit language specification
- Add `instructionalLanguage` field (ISO 639-1 code) to `AIConfiguration` for scaffolding language learners with first-language instructions
- Add `includeTranslations` boolean field to `AIConfiguration` for bilingual educational content (target language with English translations in parentheses)
- Auto-detect target language from `BookDefinition.language` field when `targetLanguage` not explicitly specified
- Default `instructionalLanguage` to target language when not specified (monolingual approach)
- Configuration cascade: item-level aiConfig > chapter-level aiConfig > book-level aiConfig > auto-detected from book.language > default to English
- Language validation: Accept ISO 639-1 codes (en, vi, fr, de, es, etc.), log warning for invalid codes but don't block generation
- Language name resolution: Map ISO codes to full language names (vi → Vietnamese, fr → French) for prompt injection

### System Prompt Language Injection

- Modify `AIPromptBuilder.buildSystemPrompt()` to inject language requirements at system level (not user prompt level)
- Gemini provider: Combine system prompt with language requirements in combined prompt
- Claude provider: Use separate system prompt parameter with language requirements
- Content language instruction format: "CONTENT LANGUAGE: Generate all educational content (questions, answers, explanations) in [TargetLanguageName] ([targetLanguage code]). Do not translate content to other languages unless explicitly instructed."
- Instructional language format (when instructionalLanguage differs from targetLanguage): "INSTRUCTIONAL LANGUAGE: Generate all task instructions, directions, and scaffolding text in [InstructionalLanguageName] ([instructionalLanguage code]). This includes quiz instructions, activity directions, and any text that guides the learner through the task."
- Translation instruction format (when includeTranslations=true): "Include English translations in parentheses after [TargetLanguageName] terms for language learners. Format: 'Term (translation)'."
- YAML prompt text (developer-facing) remains in English for consistency and clarity
- When instructionalLanguage NOT specified: default to targetLanguage (monolingual content)

### AI Handler Updates for Language Support

- Update all 7 AI handlers to pass language configuration to `AIPromptBuilder`
- Handlers affected: AIAccordionHandler, AIEssayHandler, AITrueFalseHandler, AICrosswordHandler, AIDragTextHandler, AIBlanksHandler, AISingleChoiceSetHandler
- Handlers must call `AIPromptBuilder.resolveConfig()` to cascade configuration from book/chapter/item levels
- Resolved configuration passed to `AIPromptBuilder.buildSystemPrompt()` and `AIPromptBuilder.buildCompletePrompt()`
- No handler should default to English when target language is specified
- Configuration resolution happens before AI API call to ensure language is properly injected

### JSON Validation Utility

- Create `JSONValidator` utility class in `src/ai/JSONValidator.ts` with static methods
- `validateCompleteJSON(text: string): boolean` - Check balanced braces/brackets before parsing attempt
- `extractJSON(text: string): string` - Extract JSON from mixed content (handles both JSON objects and arrays)
- `stripMarkdown(text: string): string` - Remove code fences (```json, ```), extra whitespace, explanatory text patterns
- `isLikelyTruncated(text: string): boolean` - Detect incomplete JSON by checking for missing closing braces/brackets
- Provider-specific cleaning: Aggressive markdown stripping for Gemini (common issue), minimal cleaning for Claude (more reliable)
- Unit test coverage for all edge cases: truncated responses, markdown-wrapped JSON, mixed content, explanatory text before/after JSON

### Retry Logic with Exponential Backoff

- Implement retry mechanism in `QuizGenerator.generateRawContent()` method
- Maximum 3 retry attempts before falling back to error content
- Exponential backoff timing: 1000ms, 2000ms, 4000ms between attempts
- Maximum retry overhead: 11 seconds (1s + 2s + 4s + API call times)
- Retry conditions: JSON parse errors, truncation errors, malformed JSON errors
- No retry for: API authentication errors, network errors, quota exceeded errors (fail immediately)
- Each retry logged in verbose mode with attempt number and error reason

### Progressive Degradation Strategy

- Truncation detection: Use `JSONValidator.isLikelyTruncated()` to identify incomplete responses
- On truncation error: Double `max_tokens` parameter for next retry (2048 → 4096 → 8192, capped at 8192)
- On malformed JSON: Retry with same parameters (transient error, don't change request)
- On third retry failure: Reduce content complexity (reduce question count by 50%, simplify prompt)
- Final fallback: Generate error message content in valid H5P structure with actionable guidance
- Fallback content format: Valid H5P.AdvancedText or placeholder question with error details

### Provider-Specific Error Handling

- Detect provider from `QuizGenerator.provider` field ("anthropic" or "google")
- Gemini-specific issues: Markdown code fences with extra whitespace, explanatory text before/after JSON, Unicode encoding variations
- Claude-specific issues: More consistent formatting, rare truncation, different error message patterns
- Gemini responses: Use aggressive `stripMarkdown()` to remove all code fences and explanatory text
- Claude responses: Use minimal cleaning (more reliable, less noise)
- Different extraction strategies per provider applied in `JSONValidator.extractJSON()`

### Verbose Logging and Debugging

- Log raw AI responses in verbose mode (first 500 characters to avoid spam)
- Log each processing step: stripMarkdown → extractJSON → validateCompleteJSON → JSON.parse
- Log retry attempts with attempt number, error reason, and backoff delay
- Log final decision: success (first attempt), success (retry N), or fallback used
- Verbose mode activated via `--verbose` CLI flag
- Log format: `[VERBOSE] AI Provider: gemini-2.5-flash`, `[VERBOSE] Raw response (first 500 chars): ...`
- Privacy protection: Truncate responses to 500 characters to avoid logging sensitive content

### Handler Validation Pattern

- All AI handlers must use `JSONValidator.extractJSON()` before `JSON.parse()`
- All handlers must check `JSONValidator.validateCompleteJSON()` before parsing
- Error messages differentiate between truncation errors, malformed JSON, and other failures
- Handlers do NOT duplicate retry logic (QuizGenerator handles retries at API level)
- Consistent error handling pattern across all 7 handlers
- Fallback content always returns valid H5P structure (never undefined or null)

## Configuration Examples

### Example 1: Beginner Vietnamese Learners (English Instructions + Vietnamese Content)

**Use Case:** Lower beginner students need task instructions in their first language (English) to understand what to do, but practice content in Vietnamese.

```yaml
title: "Vietnamese Vocabulary Practice"
language: vi

ai:
  enabled: true
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English
  includeTranslations: true      # Add translations for learning

  contentTypes:
    - type: "single-choice"
      count: 5
      instruction: "Create vocabulary questions about food"
```

**Generated Output Example:**
```
Task Description: Choose the correct answer (English instruction)

Question 1: Peter ăn gì? (What does Peter eat?) (Vietnamese + translation)
A) Phở (Pho)
B) Bánh mì (Bread)
C) Cơm (Rice)
D) Bún (Noodles)
```

### Example 2: Advanced Vietnamese Learners (Full Vietnamese Immersion)

**Use Case:** Advanced students are ready for full Vietnamese immersion without English scaffolding.

```yaml
title: "Advanced Vietnamese Reading"
language: vi

ai:
  enabled: true
  targetLanguage: "vi"
  # No instructionalLanguage specified = defaults to Vietnamese
  includeTranslations: false

  contentTypes:
    - type: "ai-essay"
      prompt: "Create an essay about Vietnamese culture"
```

**Generated Output Example:**
```
Nhiệm vụ: Viết một đoạn văn về văn hóa Việt Nam (All Vietnamese)

Prompt: Hãy viết về...
```

### Example 3: Mixed Approach (Accordion with English Instructions)

**Use Case:** Vocabulary glossary with English instructions but Vietnamese terms.

```yaml
ai:
  targetLanguage: "vi"
  instructionalLanguage: "en"
  includeTranslations: true

  contentTypes:
    - type: "ai-accordion"
      title: "Key Vietnamese Phrases"
      prompt: "Create a glossary of common phrases"
      panelCount: 8
      style: "glossary"
```

**Generated Output Example:**
```
Glossary: Common Vietnamese Phrases (English heading)

Panel 1: Xin chào (Hello)
Meaning: A polite greeting used in formal and informal situations...

Panel 2: Cảm ơn (Thank you)
Meaning: Expression of gratitude...
```

## Visual Design

No visual mockups provided for this specification (backend/API feature).

## Existing Code to Leverage

**AIPromptBuilder.buildSystemPrompt() (src/ai/AIPromptBuilder.ts)**
- Existing system prompt construction with formatting rules and reading level guidance
- Can be extended to inject language requirements after formatting rules section
- Already supports configuration resolution and cascading via `resolveConfig()` method
- Proven pattern for appending customization instructions to system prompt

**QuizGenerator.generateRawContent() (src/ai/QuizGenerator.ts)**
- Existing method for raw AI content generation across both Gemini and Claude providers
- Returns raw text response before JSON parsing
- Ideal place to implement retry logic without affecting handler code
- Already handles provider detection and API call differences

**AIConfiguration Interface (src/compiler/types.ts)**
- Existing configuration structure with `targetAudience`, `tone`, `outputStyle`, `customization` fields
- Well-documented with JSDoc comments and configuration cascade support
- Can be extended with `targetLanguage` and `includeTranslations` fields
- Already supports item/chapter/book-level overrides via `resolveConfig()`

**Handler Pattern (all AI handlers)**
- Consistent pattern: validate → resolve config → build prompts → call QuizGenerator → parse response → build H5P structure
- All handlers already call `AIPromptBuilder.resolveConfig()` for configuration cascade
- All handlers use `quizGenerator.generateRawContent()` for AI API calls
- JSON parsing pattern: strip markdown code fences → parse → validate structure → clean and return

**BookDefinition.language Field (src/compiler/YamlInputParser.ts)**
- Existing field for specifying book language (ISO 639-1 code)
- Used for H5P package language metadata
- Can be leveraged as default target language when `aiConfig.targetLanguage` not specified
- Already validated and stored in book definition structure

## Bonus Feature: Audio Autoplay Configuration

### Requirement

Add optional `audioAutoplay` field to `BookDefinition` interface to enable automatic playback of audio content, particularly useful for digital audiobooks and language learning materials.

### Configuration

```yaml
title: "Vietnamese Audio Story"
language: vi
audioAutoplay: true  # Enable automatic audio playback

chapters:
  - title: "Chapter 1"
    content:
      - type: audio
        title: "Listen to the story"
        path: audio/chapter1.mp3
        # Audio will autoplay when page loads
```

### Implementation

**File:** `src/compiler/YamlInputParser.ts` (BookDefinition interface)
```typescript
export interface BookDefinition {
  title: string;
  language?: string;
  audioAutoplay?: boolean;  // NEW: Enable audio autoplay (default: false)
  coverImage?: string;
  chapters: ChapterDefinition[];
  aiConfig?: AIConfiguration;
}
```

**File:** `src/compiler/ChapterBuilder.ts` (line 224)
```typescript
// Before:
autoplay: false,

// After:
autoplay: this.book.audioAutoplay ?? false,  // Use book setting, default false
```

### Benefits

- **Language Learning**: Audio plays automatically for listening comprehension
- **Audiobooks**: Seamless playback for digital story experiences
- **Accessibility**: Reduces clicks for users with motor impairments
- **User Control**: Optional (defaults to false for standard behavior)

### Acceptance Criteria

- [ ] `BookDefinition` interface includes optional `audioAutoplay?: boolean` field
- [ ] ChapterBuilder reads `audioAutoplay` from book configuration
- [ ] Defaults to `false` when not specified (backward compatible)
- [ ] Works for all audio content types (audio, video with audio track)
- [ ] Applies to all chapters in the book uniformly

## Out of Scope

- Translation of existing H5P library UI strings (separate localization system)
- Support for right-to-left languages like Arabic/Hebrew (requires UI layout changes)
- Multi-language content in single package (e.g., English + Vietnamese side-by-side pages)
- Custom language models or AI fine-tuning (use existing Gemini/Claude APIs as-is)
- Automatic language detection from source text (would require separate ML model)
- Support for languages not supported by Gemini/Claude APIs (API provider limitation)
- Language-specific pedagogical adaptations beyond vocabulary/tone (future enhancement)
- AI-powered translation quality validation (future enhancement)
- Custom language instructions per content type (future enhancement)
- Streaming AI responses (use existing batch response pattern)
- Per-chapter or per-audio autoplay control (use book-level only for simplicity)
