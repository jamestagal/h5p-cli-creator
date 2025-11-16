# Requirements: Multi-Language AI Content Generation + Robust JSON Error Handling

## Overview

This specification addresses two critical enhancements to the h5p-cli-creator's AI content generation system:

1. **Multi-Language AI Content Generation**: Enable AI-generated content (quizzes, essays, activities) to be created in any target language (Vietnamese, French, German, etc.) while keeping developer-facing instructions and prompts in English.

2. **Robust JSON Error Handling**: Implement retry logic, validation, and better error recovery for AI-generated JSON responses to reduce failure rates from ~20% to <5%.

## Background

### Current State

The h5p-cli-creator generates Interactive Book H5P packages with AI-generated practice activities using either Gemini or Claude AI models. Current implementation has two significant limitations:

**Problem 1: Language Support**
- AI content defaults to English regardless of package language setting
- No mechanism to enforce target language in AI responses
- Users must manually include language instructions in every prompt
- No structured way to request bilingual content (e.g., Vietnamese with English translations)

**Example of Current Workaround:**
```yaml
# Current approach - fragile and inconsistent
- type: ai-text
  prompt: "Write in Vietnamese (with English translation below) a story about..."
  # Language specified in prompt text - not enforced
```

**Problem 2: JSON Parse Errors**
- Gemini API returns malformed JSON ~20% of the time
- No retry logic - single attempt then immediate fallback
- Causes include: truncation, markdown wrapping, mixed content, explanatory text
- Fallback content shows error messages instead of educational content
- No debugging visibility into raw AI responses

**Example Error:**
```
⚠ AI single choice set generation failed: Expected ',' or '}' after property value in JSON at position 79
Using fallback content
```

### User Impact

**Language Issue:**
- Vietnamese story package generates English quiz questions
- Language learners confused by mixed-language content
- Educators must manually verify/edit every AI-generated activity
- Limits international adoption of the tool

**JSON Error Issue:**
- 1 in 5 AI activities fail to generate properly
- Packages contain error message placeholders instead of educational content
- Users must regenerate multiple times to get complete packages
- No visibility into why generation failed

## Requirements

### Feature 1: Multi-Language AI Content Generation

#### FR1.1: Target Language Configuration

**Requirement:** Add `targetLanguage` field to `AIConfiguration` interface

```yaml
ai:
  enabled: true
  targetLanguage: "vi"  # ISO 639-1 code: en, vi, fr, de, es, etc.
  contentTypes:
    - type: "single-choice"
      count: 5
```

**Acceptance Criteria:**
- [ ] `AIConfiguration` interface includes optional `targetLanguage?: string` field
- [ ] Accepts ISO 639-1 language codes (2-letter: "en", "vi", "fr", "de", etc.)
- [ ] Auto-detects from `BookDefinition.language` if not explicitly specified
- [ ] Configuration cascades from book → chapter → item levels
- [ ] Invalid language codes trigger warning but don't block generation

#### FR1.2: Instructional Language Support (Scaffolding for Language Learners)

**Requirement:** Add `instructionalLanguage` field to support first-language scaffolding for beginner learners

```yaml
ai:
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English (first language)
```

**Use Case:** Beginner Vietnamese learners need task instructions in English to understand what to do, but practice content in Vietnamese.

**Example Output:**
- Task instruction: "Choose the correct answer" (English)
- Question: "Peter đi đâu?" (Vietnamese)
- Answers: "Quán cà phê", "Nhà hàng", "Siêu thị" (Vietnamese)

**Acceptance Criteria:**
- [ ] `AIConfiguration` interface includes optional `instructionalLanguage?: string` field
- [ ] When specified, AI generates instructions/directions in instructional language
- [ ] Content (questions, answers, explanations) remain in target language
- [ ] Defaults to `targetLanguage` when not specified (monolingual content)
- [ ] Works across all AI content types (quiz, essay, accordion, etc.)
- [ ] Clear separation between instructional text vs educational content

#### FR1.3: Translation Support

**Requirement:** Add `includeTranslations` field to support bilingual educational content

```yaml
ai:
  targetLanguage: "vi"
  includeTranslations: true  # Add English translations in parentheses
```

**Acceptance Criteria:**
- [ ] `AIConfiguration` interface includes optional `includeTranslations?: boolean` field
- [ ] When enabled, AI adds English translations after target language terms
- [ ] Format: "Xin chào (Hello)" for Vietnamese example
- [ ] Only applies when `targetLanguage` is not English
- [ ] Works across all AI content types (quiz, essay, accordion, etc.)
- [ ] Can be combined with `instructionalLanguage` for maximum scaffolding

#### FR1.4: System Prompt Language Injection

**Requirement:** `AIPromptBuilder` must inject language requirements into system prompts with clear distinction between content language and instructional language

**Implementation:**
```typescript
// Pseudocode for AIPromptBuilder.buildSystemPrompt()
if (config.targetLanguage) {
  // Content language requirement
  systemPrompt += `\n\nCONTENT LANGUAGE: Generate all educational content (questions, answers, explanations) in ${targetLanguageName} (${config.targetLanguage}).`;
  systemPrompt += ` Do not translate content to other languages unless explicitly instructed.`;

  // Instructional language requirement (if different from target)
  if (config.instructionalLanguage && config.instructionalLanguage !== config.targetLanguage) {
    systemPrompt += `\n\nINSTRUCTIONAL LANGUAGE: Generate all task instructions, directions, and scaffolding text in ${instructionalLanguageName} (${config.instructionalLanguage}).`;
    systemPrompt += ` This includes quiz instructions, activity directions, and any text that guides the learner through the task.`;
  }

  // Translation requirement
  if (config.includeTranslations) {
    systemPrompt += `\n\nTRANSLATIONS: Include English translations in parentheses after ${targetLanguageName} terms for language learners. Format: 'Term (translation)'.`;
  }
}
```

**Acceptance Criteria:**
- [ ] Language instructions injected at system level (not user prompt level)
- [ ] Works with both Gemini (combined prompt) and Claude (separate system prompt)
- [ ] Language names resolved from ISO 639-1 codes (vi → Vietnamese, fr → French, en → English)
- [ ] Clear separation between CONTENT LANGUAGE and INSTRUCTIONAL LANGUAGE directives
- [ ] When `instructionalLanguage` not specified, defaults to `targetLanguage` (monolingual)
- [ ] Instructions are clear and enforceable by AI models
- [ ] YAML developer prompts remain in English for consistency

#### FR1.4: Handler Updates

**Requirement:** All 7 AI handlers must pass language configuration to AIPromptBuilder

**Affected Files:**
- `src/handlers/ai/AIAccordionHandler.ts`
- `src/handlers/ai/AIEssayHandler.ts`
- `src/handlers/ai/AITrueFalseHandler.ts`
- `src/handlers/ai/AICrosswordHandler.ts`
- `src/handlers/ai/AIDragTextHandler.ts`
- `src/handlers/ai/AIBlanksHandler.ts`
- `src/handlers/ai/AISingleChoiceSetHandler.ts`

**Acceptance Criteria:**
- [ ] All handlers call `AIPromptBuilder.buildSystemPrompt(aiConfig)`
- [ ] Configuration cascade properly resolved before passing to prompt builder
- [ ] No handler defaults to English when target language specified
- [ ] Consistent behavior across all content types

### Feature 2: Robust JSON Error Handling

#### FR2.1: JSON Validation Utility

**Requirement:** Create `JSONValidator` utility class for pre-parse validation

**API Design:**
```typescript
class JSONValidator {
  static validateCompleteJSON(text: string): boolean;
  static extractJSON(text: string): string;
  static stripMarkdown(text: string): string;
  static isLikelyTruncated(text: string): boolean;
}
```

**Acceptance Criteria:**
- [ ] `validateCompleteJSON()` checks balanced braces/brackets before parsing
- [ ] `extractJSON()` extracts JSON from mixed content (both arrays and objects)
- [ ] `stripMarkdown()` removes code fences, explanations, and extra whitespace
- [ ] `isLikelyTruncated()` detects incomplete JSON (missing closing braces)
- [ ] Unit tests cover all edge cases

#### FR2.2: Retry Logic with Exponential Backoff

**Requirement:** Implement retry mechanism in `QuizGenerator.generateRawContent()`

**Implementation:**
```typescript
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000]; // 1s, 2s, 4s

for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    const response = await callAIProvider();
    const validated = JSONValidator.extractJSON(response);
    return validated;
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      // Retry with backoff
      await sleep(BACKOFF_MS[attempt]);
      logger.log(`⚠️ Retry ${attempt + 1}/${MAX_RETRIES}: ${error.message}`);
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Maximum 3 retry attempts before fallback
- [ ] Exponential backoff: 1s, 2s, 4s between retries
- [ ] On truncation error: increase `max_tokens` (2048 → 4096 → 8192)
- [ ] On malformed JSON: retry with same parameters (transient error)
- [ ] All retries logged in verbose mode
- [ ] Success rate improves from ~80% to >95%

#### FR2.3: Progressive Degradation

**Requirement:** On repeated failures, simplify prompt to increase success likelihood

**Strategy:**
- Attempt 1: Full prompt with all requirements
- Attempt 2: Same prompt, increased max_tokens if truncated
- Attempt 3: Simplified prompt (reduce question count by 50%)
- Final: Fallback content with helpful error message

**Acceptance Criteria:**
- [ ] Truncation detected via `JSONValidator.isLikelyTruncated()`
- [ ] `max_tokens` doubled on truncation (capped at 8192)
- [ ] Question count reduced by 50% on third attempt
- [ ] Fallback content provides actionable error message
- [ ] Logs show degradation strategy applied

#### FR2.4: Provider-Specific Error Handling

**Requirement:** Different error handling strategies for Gemini vs Claude

**Gemini-Specific Issues:**
- Markdown code fences with extra whitespace
- Explanatory text before/after JSON
- Unicode encoding issues

**Claude-Specific Issues:**
- More consistent formatting
- Rare truncation issues
- Different error message patterns

**Acceptance Criteria:**
- [ ] Gemini responses use aggressive markdown stripping
- [ ] Gemini responses checked for explanatory text patterns
- [ ] Claude responses use minimal cleaning (more reliable)
- [ ] Provider detected from `QuizGenerator.provider` field
- [ ] Different extraction strategies applied per provider

#### FR2.5: Verbose Logging and Debugging

**Requirement:** Log raw AI responses and processing steps in verbose mode

**Log Output Example:**
```
[VERBOSE] AI Provider: gemini-2.5-flash
[VERBOSE] Raw response (first 500 chars): Here's the JSON for your quiz:
```json
{
  "questions": [
    {"text": "What is...", ...}
[VERBOSE] After stripMarkdown: {"questions": [{"text": "What is...", ...}
[VERBOSE] Validation: Complete JSON ✓
[VERBOSE] Parse: Success ✓
```

**Acceptance Criteria:**
- [ ] Raw AI response logged (first 500 chars to avoid spam)
- [ ] Each processing step logged (strip, extract, validate)
- [ ] Retry attempts logged with attempt number
- [ ] Final decision logged (success/retry/fallback)
- [ ] Only appears when `--verbose` flag used

#### FR2.6: Handler Updates for Validation

**Requirement:** All AI handlers must use `JSONValidator` before parsing

**Pattern:**
```typescript
try {
  const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

  // NEW: Pre-parse validation
  const extracted = JSONValidator.extractJSON(response);
  if (!JSONValidator.validateCompleteJSON(extracted)) {
    throw new Error("Incomplete JSON structure");
  }

  const data = JSON.parse(extracted);
  // ... rest of handler logic
} catch (error) {
  logger.log(`⚠ AI generation failed: ${error.message}`);
  return getFallbackContent(prompt);
}
```

**Acceptance Criteria:**
- [ ] All 7 handlers use `JSONValidator.extractJSON()` before `JSON.parse()`
- [ ] All handlers check `validateCompleteJSON()` before parsing
- [ ] Error messages differentiate truncation vs malformed JSON
- [ ] Handlers don't duplicate retry logic (QuizGenerator handles it)

## Non-Functional Requirements

### NFR1: Performance

- AI generation latency: <5s for simple content, <15s for complex content
- Retry overhead: Max 11s additional time (1s + 2s + 4s backoff + API calls)
- Cache hit rate: >90% for repeated generations (existing cache mechanism)
- No performance regression for successful first-attempt generations

### NFR2: Backward Compatibility

- Existing YAML configs without `targetLanguage` continue working (default to English)
- Existing YAML configs without `includeTranslations` continue working (default false)
- All existing AI handlers maintain current API signatures
- Generated H5P packages remain compatible with H5P platforms

### NFR3: Developer Experience

- TypeScript interfaces fully documented with JSDoc
- YAML configuration schema updated with examples
- Error messages actionable and clear
- Verbose logging provides debugging visibility
- Code follows existing handler pattern (no architectural changes)

### NFR4: Reliability

- JSON parse success rate: >95% (up from ~80%)
- Maximum 3 retries before fallback (avoid infinite loops)
- Fallback content always valid H5P structure (no runtime errors)
- Graceful degradation on API key issues, network errors, quota limits

## Testing Requirements

### Test Case 1: Beginner Vietnamese Learners (English Instructions)

**Config:**
```yaml
title: "Peter learns Trời ơi!"
language: vi
ai:
  enabled: true
  targetLanguage: "vi"
  instructionalLanguage: "en"    # English instructions for beginners
  includeTranslations: true
  contentTypes:
    - type: "single-choice"
      count: 5
    - type: "ai-accordion"
      panelCount: 5
```

**Expected:**
- Task instructions in English: "Choose the correct answer", "Read the definitions"
- Quiz questions in Vietnamese: "Peter đi đâu?"
- Answers in Vietnamese: "Quán cà phê", "Nhà hàng"
- English translations in parentheses: "Trời ơi (Oh my goodness)"
- AI accordion panel titles in Vietnamese with translations
- Panel explanations scaffold with English when appropriate

### Test Case 2: Advanced Vietnamese Learners (Full Immersion)

**Config:**
```yaml
title: "Vietnamese Culture Story"
language: vi
ai:
  enabled: true
  targetLanguage: "vi"
  # No instructionalLanguage = defaults to Vietnamese
  includeTranslations: false
  contentTypes:
    - type: "ai-essay"
      prompt: "Create essay about Vietnamese culture"
```

**Expected:**
- All content in Vietnamese (monolingual)
- Task instructions in Vietnamese: "Viết một đoạn văn"
- No English translations
- Full immersion experience for advanced learners

### Test Case 2: French Story without Translations

**Config:**
```yaml
language: fr
ai:
  targetLanguage: "fr"
  includeTranslations: false
```

**Expected:**
- All AI content in French only
- No English translations
- Pure monolingual French educational content

### Test Case 3: JSON Error Recovery

**Simulate:**
- Truncated JSON response (mock response with incomplete structure)
- Malformed JSON (extra commas, missing braces)
- Mixed content (JSON wrapped in explanatory text)

**Expected:**
- Retry logic triggered (logged in verbose mode)
- Truncation increases max_tokens
- Malformed JSON retries with same parameters
- Success within 3 attempts for recoverable errors
- Fallback only on unrecoverable errors

### Test Case 4: Verbose Logging

**Command:**
```bash
node ./dist/index.js interactivebook-ai config.yaml output.h5p --verbose
```

**Expected:**
- Raw AI responses logged (truncated to 500 chars)
- Processing steps visible (strip → extract → validate → parse)
- Retry attempts logged with reasons
- Final decision logged (success/fallback)

### Test Case 5: Backward Compatibility

**Config (Legacy):**
```yaml
# No targetLanguage specified
ai:
  enabled: true
  contentTypes:
    - type: "single-choice"
      count: 3
```

**Expected:**
- Defaults to English (existing behavior)
- No errors or warnings
- Generated content identical to previous versions

## Success Criteria

### Feature 1: Multi-Language AI Content

✅ Vietnamese story generates Vietnamese quiz questions, essays, and activities
✅ French story generates French content (tested with multiple languages)
✅ English translations appear when `includeTranslations: true`
✅ Configuration cascade works (book → chapter → item)
✅ Auto-detection from `language` field works
✅ Developer prompts remain in English (no confusion)

### Feature 2: Robust JSON Error Handling

✅ JSON parse success rate >95% (measured over 50 generations)
✅ Retry logic reduces failures by >75%
✅ Verbose logging provides clear debugging info
✅ Fallback content only used for truly unrecoverable errors
✅ No performance regression for successful generations
✅ All handlers consistently use validation utilities

## Out of Scope

The following are explicitly **NOT** included in this specification:

- Translation of existing H5P library strings (separate localization concern)
- Support for right-to-left languages like Arabic/Hebrew (UI layout changes)
- Multi-language content in single package (e.g., English + Vietnamese side-by-side)
- Custom language models or fine-tuning (use existing Gemini/Claude APIs)
- Automatic language detection from source text (requires ML model)
- Support for languages not supported by Gemini/Claude APIs

## Dependencies

- **External**: Gemini API (`gemini-2.5-flash`), Claude API (`claude-sonnet-4`)
- **Internal**: AIPromptBuilder, QuizGenerator, all AI handlers
- **Configuration**: AIConfiguration interface, BookDefinition type
- **Testing**: Manual testing with Vietnamese and French stories

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI models ignore language instructions | High | Use system-level prompts (more authoritative), test with multiple providers |
| Retry logic increases latency | Medium | Cap at 3 retries, use exponential backoff, only retry on recoverable errors |
| JSONValidator false negatives | Medium | Extensive unit testing, validate against known good/bad responses |
| Language code validation overhead | Low | Use lightweight lookup table, warn but don't block invalid codes |
| Gemini API changes response format | High | Provider-specific handling, version pinning, monitoring |

## Future Enhancements

- Support for custom language instructions per content type
- AI-powered translation quality validation
- Automatic language detection from source material
- Multi-language glossary support (key terms in multiple languages)
- Language-specific pedagogical adaptations (cultural context)

## References

- Previous implementation: `agent-os/specs/2025-11-10-concept-extraction-language-aware-ai/spec.md` (partial planning)
- AI architecture research from conversation analysis
- ISO 639-1 language codes: https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
- H5P content type specifications: https://h5p.org/content-types-and-applications
