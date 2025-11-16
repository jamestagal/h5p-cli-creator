# Task Breakdown: Multi-Language AI Content Generation and Robust JSON Error Handling

## Overview

This specification implements TWO major features for h5p-cli-creator's AI content generation system:

1. **Multi-Language AI Content Generation**: Enable AI-generated content in any target language (Vietnamese, French, German, etc.) with optional English scaffolding for language learners
2. **Robust JSON Error Handling**: Reduce AI-generated JSON parsing failures from ~20% to <5% through validation utilities, retry logic, and progressive degradation

**Total Task Groups:** 6
**Estimated Implementation Time:** 8-12 hours
**Testing Approach:** Focused unit tests (2-8 per group) + end-to-end validation with Vietnamese and French stories

## Task List

### Phase 1: Type Definitions and Language Infrastructure

#### Task Group 1: TypeScript Type Definitions and Language Utilities
**Dependencies:** None

- [ ] 1.0 Complete type definitions and language utilities
  - [ ] 1.1 Write 2-8 focused tests for language name resolution
    - Test ISO 639-1 code mapping (vi → Vietnamese, fr → French, de → German, es → Spanish)
    - Test invalid code handling (returns code as-is, logs warning)
    - Test case insensitivity (VI → Vietnamese, Fr → French)
    - Limit to 2-8 tests maximum (core mapping scenarios only)
  - [ ] 1.2 Update AIConfiguration interface in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/types.ts` (lines 185-241)
    - Add `targetLanguage?: string` field (ISO 639-1 code)
    - Add `instructionalLanguage?: string` field (ISO 639-1 code for scaffolding)
    - Add `includeTranslations?: boolean` field (bilingual content flag)
    - Update JSDoc comments with usage examples
  - [ ] 1.3 Create language name resolution utility in new file `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/LanguageUtils.ts`
    - Implement `getLanguageName(isoCode: string): string` function
    - Map common ISO 639-1 codes to full names: en→English, vi→Vietnamese, fr→French, de→German, es→Spanish, ja→Japanese, ko→Korean, zh→Chinese, ar→Arabic, pt→Portuguese
    - Return code as-is for unrecognized codes (with warning log)
    - Export as static utility class
  - [ ] 1.4 Update AIConfiguration export in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/types.ts`
    - Ensure new fields are included in type exports
    - Verify backward compatibility (all new fields optional)
  - [ ] 1.5 Add audioAutoplay field to BookDefinition interface (Bonus Feature)
    - Add `audioAutoplay?: boolean` to BookDefinition in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/YamlInputParser.ts` (around line 260)
    - Update JSDoc comment: "Enable automatic audio playback for all audio content (default: false)"
    - Update ChapterBuilder to read audioAutoplay from book config in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/ChapterBuilder.ts` (line 224)
    - Change `autoplay: false,` to `autoplay: this.book.audioAutoplay ?? false,`
    - Test with Vietnamese audiobook example
  - [ ] 1.6 Ensure type definition tests pass
    - Run ONLY the 2-8 tests written in 1.1
    - Verify language mapping accuracy
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 1.1 pass
- AIConfiguration interface includes three new optional fields (targetLanguage, instructionalLanguage, includeTranslations)
- BookDefinition interface includes audioAutoplay field (bonus feature)
- LanguageUtils.getLanguageName() correctly maps common language codes
- Invalid codes return code as-is with warning
- Audio autoplay works when enabled in book config
- Backward compatible (existing configs work without changes)

### Phase 2: JSON Validation Infrastructure

#### Task Group 2: JSONValidator Utility Class
**Dependencies:** None (can run in parallel with Task Group 1)

- [ ] 2.0 Complete JSON validation utility
  - [ ] 2.1 Write 2-8 focused tests for JSONValidator
    - Test truncated JSON detection (missing closing braces)
    - Test markdown code fence stripping (```json, ```)
    - Test JSON extraction from mixed content (text before/after JSON)
    - Test complete JSON validation (balanced braces/brackets)
    - Limit to 2-8 tests maximum (critical validation scenarios only)
  - [ ] 2.2 Create JSONValidator class in new file `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/JSONValidator.ts`
    - Implement as static utility class (no instance state)
    - Method signatures:
      - `validateCompleteJSON(text: string): boolean`
      - `extractJSON(text: string): string`
      - `stripMarkdown(text: string): string`
      - `isLikelyTruncated(text: string): boolean`
  - [ ] 2.3 Implement `stripMarkdown()` method
    - Remove markdown code fences: ```json, ```javascript, ```
    - Remove extra whitespace (leading/trailing)
    - Handle both ```json\n and ``` patterns
    - Aggressive cleaning for Gemini provider (more markdown noise)
  - [ ] 2.4 Implement `extractJSON()` method
    - Find first `{` or `[` character (start of JSON)
    - Find matching closing `}` or `]` (balanced bracket counting)
    - Extract substring between start and end
    - Handle nested objects and arrays correctly
    - Support both JSON objects and arrays
  - [ ] 2.5 Implement `validateCompleteJSON()` method
    - Count opening braces/brackets: `{`, `[`
    - Count closing braces/brackets: `}`, `]`
    - Return true if counts match (balanced structure)
    - Handle strings with escaped braces correctly
  - [ ] 2.6 Implement `isLikelyTruncated()` method
    - Check if text ends mid-property (e.g., `"text": "Hello`)
    - Check for unbalanced braces (more `{` than `}`)
    - Check for sudden end without closing brackets
    - Return true if truncation indicators detected
  - [ ] 2.7 Ensure JSONValidator tests pass
    - Run ONLY the 2-8 tests written in 2.1
    - Verify truncation detection accuracy
    - Verify markdown stripping completeness
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 2.1 pass
- `stripMarkdown()` removes all code fences and explanatory text
- `extractJSON()` correctly isolates JSON from mixed content
- `validateCompleteJSON()` detects incomplete JSON structures
- `isLikelyTruncated()` identifies truncated responses with >90% accuracy
- All methods are static (no instance state)

### Phase 3: Language Injection in AIPromptBuilder

#### Task Group 3: System Prompt Language Configuration
**Dependencies:** Task Group 1 (requires LanguageUtils and updated types)

- [ ] 3.0 Complete language injection in AIPromptBuilder
  - [ ] 3.1 Write 2-8 focused tests for language prompt injection
    - Test CONTENT LANGUAGE injection (targetLanguage specified)
    - Test INSTRUCTIONAL LANGUAGE injection (differs from target)
    - Test TRANSLATIONS instruction injection (includeTranslations=true)
    - Test monolingual mode (no instructionalLanguage specified)
    - Limit to 2-8 tests maximum (key language scenarios only)
  - [ ] 3.2 Update `buildSystemPrompt()` in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/AIPromptBuilder.ts` (lines 146-168)
    - Import LanguageUtils from `./LanguageUtils`
    - Inject CONTENT LANGUAGE instruction when `config.targetLanguage` specified
    - Format: "CONTENT LANGUAGE: Generate all educational content (questions, answers, explanations) in [LanguageName] ([code]). Do not translate content to other languages unless explicitly instructed."
    - Inject after TONE section, before customization
  - [ ] 3.3 Add INSTRUCTIONAL LANGUAGE injection to `buildSystemPrompt()`
    - Only inject when `config.instructionalLanguage` differs from `config.targetLanguage`
    - Format: "INSTRUCTIONAL LANGUAGE: Generate all task instructions, directions, and scaffolding text in [LanguageName] ([code]). This includes quiz instructions, activity directions, and any text that guides the learner through the task."
    - Inject after CONTENT LANGUAGE, before customization
  - [ ] 3.4 Add TRANSLATIONS instruction injection to `buildSystemPrompt()`
    - Only inject when `config.includeTranslations === true`
    - Format: "TRANSLATIONS: Include English translations in parentheses after [LanguageName] terms for language learners. Format: 'Term (translation)'."
    - Inject after INSTRUCTIONAL LANGUAGE (if present) or CONTENT LANGUAGE, before customization
  - [ ] 3.5 Update `resolveConfig()` in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/AIPromptBuilder.ts` (lines 226-253)
    - Add targetLanguage cascade: item > chapter > book > undefined
    - Add instructionalLanguage cascade: item > chapter > book > undefined (defaults to targetLanguage when not specified)
    - Add includeTranslations cascade: item > chapter > book > false (default)
    - Maintain existing cascade for targetAudience, tone, outputStyle, customization
  - [ ] 3.6 Add auto-detection from BookDefinition.language
    - When `targetLanguage` not specified in aiConfig hierarchy, fall back to `bookDefinition.language`
    - Implement in handlers (Task Group 5) by passing book language to resolveConfig
  - [ ] 3.7 Ensure language injection tests pass
    - Run ONLY the 2-8 tests written in 3.1
    - Verify correct language instructions appear in system prompt
    - Verify instructional language only appears when different from target
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 3.1 pass
- CONTENT LANGUAGE instruction appears when targetLanguage specified
- INSTRUCTIONAL LANGUAGE instruction appears only when different from target language
- TRANSLATIONS instruction appears when includeTranslations=true
- Language names resolved from ISO codes (vi → Vietnamese)
- Configuration cascade works correctly (item > chapter > book)
- System prompt remains valid for both Gemini and Claude providers

### Phase 4: Retry Logic and Error Handling in QuizGenerator

#### Task Group 4: Robust JSON Parsing with Retry Logic
**Dependencies:** Task Group 2 (requires JSONValidator)

- [ ] 4.0 Complete retry logic and error handling
  - [ ] 4.1 Write 2-8 focused tests for retry logic
    - Test retry on malformed JSON (transient error)
    - Test progressive degradation on truncation (increase max_tokens)
    - Test exponential backoff timing (1s, 2s, 4s)
    - Test final fallback after 3 failed retries
    - Limit to 2-8 tests maximum (critical retry scenarios only)
  - [ ] 4.2 Update `generateRawContent()` in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/QuizGenerator.ts` (lines 345-383)
    - Import JSONValidator from `./JSONValidator`
    - Wrap existing API call in retry loop (max 3 attempts)
    - Implement exponential backoff: 1000ms, 2000ms, 4000ms between retries
    - Use `await new Promise(resolve => setTimeout(resolve, backoffMs))` for delays
  - [ ] 4.3 Implement truncation detection and progressive degradation
    - After each failed attempt, check `JSONValidator.isLikelyTruncated(responseText)`
    - If truncated: double `max_tokens` for next retry (2048 → 4096 → 8192, capped at 8192)
    - If malformed (not truncated): retry with same `max_tokens` (transient error)
    - Track `max_tokens` as mutable variable in retry loop
  - [ ] 4.4 Add provider-specific error handling
    - Detect provider from `this.provider` field ("anthropic" or "google")
    - Gemini responses: use aggressive `JSONValidator.stripMarkdown()` before extraction
    - Claude responses: use minimal cleaning (more reliable, less noise)
    - Apply provider-specific extraction in JSONValidator.extractJSON()
  - [ ] 4.5 Add verbose logging throughout retry process
    - Log raw AI response (first 500 chars): `[VERBOSE] Raw response (first 500 chars): ...`
    - Log each processing step: `[VERBOSE] After stripMarkdown: ...`, `[VERBOSE] After extractJSON: ...`
    - Log retry attempts: `[VERBOSE] Retry attempt ${attempt}/${MAX_RETRIES} (reason: ${reason})`
    - Log backoff delays: `[VERBOSE] Waiting ${backoffMs}ms before retry...`
    - Log final decision: `[VERBOSE] Success on attempt ${attempt}` or `[VERBOSE] All retries failed, using fallback`
    - Only log when verbose mode enabled (check via context or global flag)
  - [ ] 4.6 Implement validation pipeline in retry loop
    - Step 1: Strip markdown using `JSONValidator.stripMarkdown(responseText)`
    - Step 2: Extract JSON using `JSONValidator.extractJSON(strippedText)`
    - Step 3: Validate completeness using `JSONValidator.validateCompleteJSON(extractedJSON)`
    - Step 4: Parse using `JSON.parse(extractedJSON)`
    - Catch errors at each step, log reason, and retry if attempts remaining
  - [ ] 4.7 Ensure retry logic tests pass
    - Run ONLY the 2-8 tests written in 4.1
    - Verify retry attempts work correctly
    - Verify progressive degradation increases max_tokens
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 4.1 pass
- Maximum 3 retry attempts before fallback
- Exponential backoff timing: 1s, 2s, 4s
- Truncation detection triggers max_tokens increase (2048 → 4096 → 8192)
- Malformed JSON (non-truncated) retries with same parameters
- Provider-specific cleaning applied (Gemini aggressive, Claude minimal)
- Verbose logging provides complete debugging visibility
- All processing steps logged when verbose mode enabled

### Phase 5: Handler Updates for Language and Validation

#### Task Group 5: Update All 7 AI Handlers
**Dependencies:** Task Groups 3 and 4 (requires language injection and JSONValidator)

- [ ] 5.0 Complete handler updates for language support and JSON validation
  - [ ] 5.1 Write 2-8 focused tests for handler integration
    - Test handler with Vietnamese targetLanguage (content in Vietnamese)
    - Test handler with instructionalLanguage=en + targetLanguage=vi (English instructions, Vietnamese content)
    - Test handler with includeTranslations=true (bilingual content)
    - Test handler JSON parsing with JSONValidator (malformed response recovery)
    - Limit to 2-8 tests maximum (integration scenarios only)
  - [ ] 5.2 Update AIAccordionHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Update line 199: Replace manual markdown stripping with `JSONValidator.stripMarkdown(response)`
    - Add validation before parse (line 200): Check `JSONValidator.validateCompleteJSON(cleaned)`
    - Update error messages to differentiate truncation vs malformed JSON
    - Ensure configuration cascade passes book.language as fallback targetLanguage
  - [ ] 5.3 Update AIEssayHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIEssayHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Replace manual JSON extraction with `JSONValidator.extractJSON(response)`
    - Add validation before parse: Check `JSONValidator.validateCompleteJSON(extracted)`
    - Update error handling to distinguish truncation errors
    - Pass language configuration to AIPromptBuilder
  - [ ] 5.4 Update AITrueFalseHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AITrueFalseHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Replace manual markdown stripping with `JSONValidator.stripMarkdown(response)`
    - Add complete JSON validation before parsing
    - Update error messages for better debugging
    - Ensure language configuration cascades correctly
  - [ ] 5.5 Update AICrosswordHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AICrosswordHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Use `JSONValidator.extractJSON()` and `validateCompleteJSON()`
    - Handle truncation errors appropriately
    - Pass targetLanguage to ensure crossword clues in correct language
  - [ ] 5.6 Update AIDragTextHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIDragTextHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Replace manual JSON parsing with validation pipeline
    - Ensure language configuration used for generating drag-text content
    - Update error handling pattern
  - [ ] 5.7 Update AIBlanksHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts`
    - Import JSONValidator from `../../ai/JSONValidator`
    - Use `JSONValidator.stripMarkdown()` and `extractJSON()`
    - Add validation before parsing
    - Ensure fill-in-the-blanks questions generated in target language
  - [ ] 5.8 Update AISingleChoiceSetHandler in `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AISingleChoiceSetHandler.ts`
    - Already reviewed - update line 273: Use `JSONValidator.stripMarkdown(response)`
    - Add validation check at line 274: `JSONValidator.validateCompleteJSON(cleaned)`
    - Update error messages to show truncation vs malformed distinction
    - Verify language configuration cascade working (line 238-244)
  - [ ] 5.9 Ensure handler integration tests pass
    - Run ONLY the 2-8 tests written in 5.1
    - Verify language configuration works end-to-end
    - Verify JSONValidator integration improves parse success rate
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- The 2-8 tests written in 5.1 pass
- All 7 handlers use JSONValidator for pre-parse validation
- All handlers use `stripMarkdown()` and `extractJSON()` before `JSON.parse()`
- All handlers check `validateCompleteJSON()` before parsing
- All handlers pass language configuration to AIPromptBuilder
- Error messages differentiate truncation, malformed JSON, and other errors
- Handlers don't duplicate retry logic (QuizGenerator handles retries)
- Consistent pattern across all handlers

### Phase 6: End-to-End Testing and Documentation

#### Task Group 6: Integration Testing and Configuration Examples
**Dependencies:** Task Groups 1-5 (requires complete implementation)

- [ ] 6.0 Complete end-to-end testing and validation
  - [ ] 6.1 Write up to 10 additional integration tests (MAXIMUM)
    - Test Vietnamese story with English instructions (beginner scaffolding)
    - Test French story with full immersion (no instructional language)
    - Test bilingual content with translations (Vietnamese with English)
    - Test JSON error recovery across multiple handlers
    - Test backward compatibility (configs without new fields)
    - Test configuration cascade (book > chapter > item)
    - Test auto-detection from BookDefinition.language
    - Test invalid language codes (warnings but no errors)
    - Maximum 10 tests total - focus on critical user workflows only
  - [ ] 6.2 Test Vietnamese story with beginner scaffolding
    - Create test YAML config: `examples/multi-language/vietnamese-beginner.yaml`
    - Set targetLanguage=vi, instructionalLanguage=en, includeTranslations=true
    - Generate H5P package and verify:
      - Task instructions in English ("Choose the correct answer")
      - Quiz questions in Vietnamese ("Peter đi đâu?")
      - Answers in Vietnamese with translations ("Quán cà phê (Cafe)")
      - Accordion panels in Vietnamese with English scaffolding
  - [ ] 6.3 Test French story with full immersion
    - Create test YAML config: `examples/multi-language/french-immersion.yaml`
    - Set targetLanguage=fr (no instructionalLanguage specified)
    - Set includeTranslations=false
    - Generate H5P package and verify:
      - All content in French (monolingual)
      - Task instructions in French ("Choisissez la bonne réponse")
      - No English translations anywhere
  - [ ] 6.4 Test JSON error recovery with intentional failures
    - Mock truncated JSON responses from AI provider
    - Mock malformed JSON with syntax errors
    - Verify retry logic triggers (logged in verbose mode)
    - Verify progressive degradation increases max_tokens
    - Verify fallback content generated after 3 failed retries
    - Verify error messages actionable and clear
  - [ ] 6.5 Test backward compatibility
    - Test existing YAML configs without new language fields
    - Verify default behavior (English content)
    - Verify no errors or warnings for legacy configs
    - Verify generated packages identical to previous versions
  - [ ] 6.6 Create configuration examples
    - Document beginner scaffolding pattern in `examples/multi-language/README.md`
    - Document full immersion pattern
    - Document bilingual content pattern
    - Document configuration cascade behavior
    - Include Vietnamese, French, German, Spanish examples
  - [ ] 6.7 Update CLAUDE.md documentation
    - Document new AIConfiguration fields (targetLanguage, instructionalLanguage, includeTranslations)
    - Add multi-language workflow section
    - Document JSON error handling improvements
    - Add verbose logging usage examples
    - Update configuration cascade documentation
  - [ ] 6.8 Run feature-specific integration tests
    - Run ONLY integration tests from 6.1 (maximum 10 tests)
    - Run ONLY unit tests from Task Groups 1-5 (approximately 10-40 tests total)
    - Expected total: approximately 20-50 tests maximum
    - Do NOT run the entire application test suite
    - Verify critical workflows pass end-to-end

**Acceptance Criteria:**
- All feature-specific integration tests pass (maximum 10 tests)
- Vietnamese story generates Vietnamese content with English instructions
- French story generates monolingual French content
- JSON parse success rate >95% (measured over 20+ test generations)
- Backward compatibility maintained (legacy configs work unchanged)
- Configuration cascade works correctly (item > chapter > book > auto-detect)
- Verbose logging provides actionable debugging information
- Documentation updated with examples and usage patterns
- No more than 10 additional integration tests added

## Testing Summary

**Total Tests Expected:**
- Task Group 1: 2-8 tests (language utilities)
- Task Group 2: 2-8 tests (JSON validation)
- Task Group 3: 2-8 tests (language injection)
- Task Group 4: 2-8 tests (retry logic)
- Task Group 5: 2-8 tests (handler integration)
- Task Group 6: Maximum 10 tests (end-to-end integration)

**Grand Total: Approximately 20-50 tests maximum**

**Testing Philosophy:**
- Each task group writes 2-8 HIGHLY FOCUSED tests for critical behaviors only
- Integration testing (Task Group 6) adds maximum 10 tests for end-to-end workflows
- No exhaustive coverage of all edge cases and scenarios
- Focus on business-critical user workflows
- Test ONLY features introduced in this spec

## Execution Order

Recommended implementation sequence:

1. **Phase 1: Type Definitions** (Task Group 1) - Foundation for all other work
2. **Phase 2: JSON Validation** (Task Group 2) - Can run in parallel with Phase 1
3. **Phase 3: Language Injection** (Task Group 3) - Depends on Phase 1
4. **Phase 4: Retry Logic** (Task Group 4) - Depends on Phase 2
5. **Phase 5: Handler Updates** (Task Group 5) - Depends on Phases 3 and 4
6. **Phase 6: Integration Testing** (Task Group 6) - Depends on all previous phases

## Key Implementation Notes

### Language Configuration Cascade

Configuration resolution order (highest to lowest priority):
1. Item-level `aiConfig.targetLanguage`
2. Chapter-level `aiConfig.targetLanguage`
3. Book-level `aiConfig.targetLanguage`
4. Auto-detected from `BookDefinition.language`
5. Default to English (if nothing specified)

### JSON Validation Pipeline

Every AI handler must use this pattern:
```typescript
const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);
const cleaned = JSONValidator.stripMarkdown(response);
const extracted = JSONValidator.extractJSON(cleaned);
if (!JSONValidator.validateCompleteJSON(extracted)) {
  throw new Error("Incomplete JSON structure");
}
const data = JSON.parse(extracted);
```

### Retry Logic Configuration

```typescript
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000]; // 1s, 2s, 4s
let maxTokens = 2048;

for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    // API call with current maxTokens
    const response = await callAI();
    const validated = JSONValidator.extractJSON(response);
    return validated; // Success
  } catch (error) {
    if (JSONValidator.isLikelyTruncated(response)) {
      maxTokens = Math.min(maxTokens * 2, 8192); // Double, cap at 8192
    }
    if (attempt < MAX_RETRIES - 1) {
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
// Fallback after 3 failed attempts
```

### Verbose Logging Format

```typescript
if (verbose) {
  logger.log(`[VERBOSE] AI Provider: ${provider}`);
  logger.log(`[VERBOSE] Raw response (first 500 chars): ${response.substring(0, 500)}...`);
  logger.log(`[VERBOSE] After stripMarkdown: ${cleaned.substring(0, 200)}...`);
  logger.log(`[VERBOSE] Validation: Complete JSON ${isComplete ? '✓' : '✗'}`);
  logger.log(`[VERBOSE] Retry attempt ${attempt}/${MAX_RETRIES} (reason: ${reason})`);
}
```

## Success Metrics

### Feature 1: Multi-Language AI Content

- Vietnamese story generates Vietnamese quiz questions ✓
- French story generates French content ✓
- English translations appear when `includeTranslations: true` ✓
- Instructional language scaffolding works (English instructions + Vietnamese content) ✓
- Configuration cascade functions correctly (book → chapter → item) ✓
- Auto-detection from `language` field works ✓

### Feature 2: Robust JSON Error Handling

- JSON parse success rate >95% (measured over 50 generations) ✓
- Retry logic reduces failures by >75% ✓
- Verbose logging provides clear debugging visibility ✓
- Fallback content only used for truly unrecoverable errors ✓
- No performance regression for successful first-attempt generations ✓
- All handlers consistently use validation utilities ✓

## File Locations Reference

### New Files
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/LanguageUtils.ts` - Language name resolution
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/JSONValidator.ts` - JSON validation utilities

### Modified Files
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/compiler/types.ts` - AIConfiguration interface (lines 185-241)
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/AIPromptBuilder.ts` - Language injection (lines 146-253)
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/ai/QuizGenerator.ts` - Retry logic (lines 345-383)
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIAccordionHandler.ts` - Validation (line 199-200)
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIEssayHandler.ts` - Validation
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AITrueFalseHandler.ts` - Validation
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AICrosswordHandler.ts` - Validation
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIDragTextHandler.ts` - Validation
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` - Validation
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/src/handlers/ai/AISingleChoiceSetHandler.ts` - Validation (lines 273-274)

### Documentation Files
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/CLAUDE.md` - Update with multi-language workflow
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/examples/multi-language/README.md` - Configuration examples
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/examples/multi-language/vietnamese-beginner.yaml` - Test config
- `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/examples/multi-language/french-immersion.yaml` - Test config

## Common Pitfalls & Gotchas

### 1. Language Configuration Cascade Order
**Pitfall:** Forgetting the configuration cascade priority, leading to unexpected language defaults or overrides not taking effect.

**Solution:** Remember the cascade order: `item.aiConfig > chapter.aiConfig > book.aiConfig > auto-detect from book.language > default to English`.

```typescript
// ❌ WRONG - expecting book-level to override item-level
aiConfig: {
  targetLanguage: "vi"  // Book level
}
chapters:
  - content:
    - type: ai-quiz
      aiConfig:
        targetLanguage: "en"  // Item level - THIS WINS!

// ✅ CORRECT - remove item override to use book setting
aiConfig: {
  targetLanguage: "vi"  // Book level
}
chapters:
  - content:
    - type: ai-quiz
      # No aiConfig here - inherits Vietnamese from book
```

### 2. Mixing targetLanguage and instructionalLanguage
**Pitfall:** Setting `instructionalLanguage` without `targetLanguage`, or confusing which language applies to which content type.

**Solution:** Always set `targetLanguage` first. `instructionalLanguage` is optional and defaults to `targetLanguage`.

```typescript
// ❌ WRONG - instructionalLanguage without targetLanguage
ai:
  instructionalLanguage: "en"  // What's the content language?

// ✅ CORRECT - explicit targetLanguage + optional instructionalLanguage
ai:
  targetLanguage: "vi"           // Content in Vietnamese
  instructionalLanguage: "en"    // Instructions in English (scaffolding)

// ✅ ALSO CORRECT - monolingual (advanced learners)
ai:
  targetLanguage: "vi"
  # No instructionalLanguage = defaults to Vietnamese
```

**Remember:**
- `targetLanguage` = Educational content (questions, answers, explanations)
- `instructionalLanguage` = Task directions (what to do)
- `includeTranslations` = Add English in parentheses

### 3. JSON Validation Order
**Pitfall:** Parsing JSON before validation, causing cryptic error messages instead of actionable ones.

**Solution:** Always validate BEFORE parsing: extract → validate → parse.

```typescript
// ❌ WRONG - parse before validation
try {
  const data = JSON.parse(response);  // Throws cryptic "Unexpected token" error
} catch (error) {
  logger.log(`Parse failed: ${error.message}`);  // Not helpful!
}

// ✅ CORRECT - validate before parsing
const extracted = JSONValidator.extractJSON(response);  // Strip markdown, extra text

if (!JSONValidator.validateCompleteJSON(extracted)) {
  // Actionable error message
  throw new Error("Incomplete JSON structure (likely truncated response)");
}

const data = JSON.parse(extracted);  // Only parse validated JSON
```

### 4. Retry Logic Infinite Loops
**Pitfall:** Retrying non-transient errors (API key errors, network errors) wastes time and API quota.

**Solution:** Differentiate transient vs permanent errors. Only retry transient errors.

```typescript
// ❌ WRONG - retrying API key errors forever
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    return await callAIProvider();
  } catch (error) {
    // Retries even for "Invalid API key" - will never succeed!
    await sleep(BACKOFF_MS[attempt]);
  }
}

// ✅ CORRECT - fail fast for permanent errors
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    return await callAIProvider();
  } catch (error) {
    // Check for permanent errors
    if (error.message.includes("API key") ||
        error.message.includes("quota exceeded") ||
        error.code === 401 || error.code === 403) {
      throw error;  // Don't retry permanent errors
    }

    // Only retry transient errors (JSON parse, truncation, 5xx)
    if (attempt < MAX_RETRIES - 1) {
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
```

### 5. Provider-Specific Markdown Patterns
**Pitfall:** Using same markdown stripping logic for Gemini and Claude, when they have different output patterns.

**Solution:** Detect provider and apply appropriate extraction strategy.

```typescript
// ❌ WRONG - one-size-fits-all approach
const cleaned = response.replace(/^```json\n?/, "").replace(/\n?```$/, "");

// ✅ CORRECT - provider-specific extraction
extractJSON(response: string, provider: "google" | "anthropic"): string {
  let cleaned = response.trim();

  if (provider === "google") {
    // Gemini often adds explanatory text before/after JSON
    cleaned = cleaned.replace(/^.*?(\{|\[)/s, '$1');  // Remove text before JSON
    cleaned = cleaned.replace(/(\}|\]).*?$/s, '$1');  // Remove text after JSON
    cleaned = cleaned.replace(/```json\n?/g, "");     // Strip markdown
    cleaned = cleaned.replace(/```/g, "");            // Strip closing fences
  } else {
    // Claude is more reliable, minimal cleaning
    cleaned = cleaned.replace(/^```json\n?/, "");
    cleaned = cleaned.replace(/\n?```$/, "");
  }

  return cleaned.trim();
}
```

### 6. Exponential Backoff Timing Misunderstanding
**Pitfall:** Assuming backoff happens BEFORE first attempt, or miscalculating total retry time.

**Solution:** Backoff happens BETWEEN attempts. First attempt is immediate.

```typescript
// Timing breakdown for 3 attempts with [1s, 2s, 4s] backoff:
// - Attempt 1: Immediate (0s)
// - Wait 1s
// - Attempt 2: At 1s
// - Wait 2s
// - Attempt 3: At 3s
// - Wait 4s (only if there's a 4th attempt)
// Total time: 3s + API call durations

const BACKOFF_MS = [1000, 2000, 4000];  // Delays BETWEEN attempts
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    return await callAI();  // First attempt is immediate
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {  // Don't wait after last attempt
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
```

### 7. Verbose Logging Privacy Leaks
**Pitfall:** Logging full AI responses could leak sensitive content or user data in production logs.

**Solution:** Always truncate responses to first 500 characters in verbose mode.

```typescript
// ❌ WRONG - logging full response (could be 10,000+ chars)
logger.log(`[VERBOSE] AI response: ${response}`);  // Privacy risk!

// ✅ CORRECT - truncate to safe length
logger.log(`[VERBOSE] Raw response (first 500 chars): ${response.substring(0, 500)}...`);

// ✅ ALSO GOOD - log length instead of content for very long responses
if (response.length > 500) {
  logger.log(`[VERBOSE] Raw response length: ${response.length} chars (truncated)`);
  logger.log(`[VERBOSE] First 500 chars: ${response.substring(0, 500)}...`);
} else {
  logger.log(`[VERBOSE] Raw response: ${response}`);
}
```

### 8. ISO 639-1 Language Code Validation
**Pitfall:** Accepting any string as language code, leading to confusing AI behavior or failed translations.

**Solution:** Validate against known ISO 639-1 codes, but DON'T block invalid codes (just warn).

```typescript
// ❌ WRONG - accepting any string
if (config.targetLanguage) {
  // What if user types "vietnamese" instead of "vi"?
  systemPrompt += `Generate content in ${config.targetLanguage}`;
}

// ✅ CORRECT - validate and provide helpful feedback
const LANGUAGE_NAMES: Record<string, string> = {
  "en": "English",
  "vi": "Vietnamese",
  "fr": "French",
  "de": "German",
  "es": "Spanish",
  "zh": "Chinese",
  "ja": "Japanese",
  "ko": "Korean",
  // ... etc
};

function getLanguageName(code: string): string {
  if (!LANGUAGE_NAMES[code]) {
    logger.warn(`Unknown language code: ${code}. Using as-is. See ISO 639-1 codes.`);
    return code;  // Use raw code as fallback
  }
  return LANGUAGE_NAMES[code];
}

// Now inject validated language name
const languageName = getLanguageName(config.targetLanguage);
systemPrompt += `Generate content in ${languageName} (${config.targetLanguage})`;
```

### 9. Truncation Detection False Positives
**Pitfall:** Treating all incomplete JSON as truncation, when it could be malformed JSON from AI.

**Solution:** Use multiple signals to detect truncation vs malformation.

```typescript
// ❌ WRONG - assuming all incomplete JSON is truncated
if (!validateCompleteJSON(response)) {
  maxTokens *= 2;  // Might not help if JSON is just malformed!
}

// ✅ CORRECT - differentiate truncation from malformation
function isLikelyTruncated(text: string): boolean {
  // Multiple signals for truncation:
  const endsAbruptly = !text.trim().endsWith('}') && !text.trim().endsWith(']');
  const hasUnclosedBraces = (text.match(/\{/g) || []).length > (text.match(/\}/g) || []).length;
  const hasUnclosedBrackets = (text.match(/\[/g) || []).length > (text.match(/\]/g) || []).length;
  const endsWithComma = text.trim().endsWith(',');  // Mid-array/object

  return endsAbruptly && (hasUnclosedBraces || hasUnclosedBrackets || endsWithComma);
}

// Use differentiated retry strategy
if (isLikelyTruncated(response)) {
  maxTokens *= 2;  // Increase token limit for truncation
} else {
  // Malformed JSON - retry with same params (transient error)
}
```

### 10. Configuration Auto-Detection Edge Cases
**Pitfall:** Auto-detecting `targetLanguage` from `book.language` when user explicitly set `targetLanguage: "en"` for English content, causing confusion.

**Solution:** Only auto-detect when `targetLanguage` is UNDEFINED, not when explicitly set.

```typescript
// ❌ WRONG - overriding explicit English setting
if (book.language === "vi" || config.targetLanguage === "vi") {
  // BUG: This triggers even when user WANTS English content!
}

// ✅ CORRECT - only auto-detect when not explicitly set
function resolveTargetLanguage(config: AIConfiguration, book: BookDefinition): string {
  // 1. Explicit config wins
  if (config.targetLanguage !== undefined) {
    return config.targetLanguage;  // User explicitly set, use it
  }

  // 2. Auto-detect from book language
  if (book.language && book.language !== "en") {
    return book.language;  // Inherit from book
  }

  // 3. Default to English
  return "en";
}
```

### 11. Translation Instruction Placement
**Pitfall:** Adding translation instructions when `targetLanguage === "en"`, causing redundant "(English)" annotations.

**Solution:** Only enable translations when target language is NOT English.

```typescript
// ❌ WRONG - translating English to English
if (config.includeTranslations) {
  systemPrompt += "Include English translations in parentheses";
  // Result: "Hello (Hello)" - redundant!
}

// ✅ CORRECT - only translate non-English content
if (config.includeTranslations && config.targetLanguage !== "en") {
  const targetLang = getLanguageName(config.targetLanguage);
  systemPrompt += `Include English translations in parentheses after ${targetLang} terms.`;
  // Result: "Xin chào (Hello)" - useful!
}
```

### 12. Handler Retry Logic Duplication
**Pitfall:** Implementing retry logic in BOTH QuizGenerator AND individual handlers, causing 3×3=9 total attempts.

**Solution:** Retry logic belongs ONLY in QuizGenerator. Handlers should NOT retry.

```typescript
// ❌ WRONG - handler retrying on top of QuizGenerator retries
async generateQuestions() {
  for (let attempt = 0; attempt < 3; attempt++) {  // Handler retry
    try {
      const response = await quizGenerator.generateRawContent();  // Also retries 3x!
      // This creates 9 total attempts (3 × 3)
    } catch (error) { ... }
  }
}

// ✅ CORRECT - single retry layer in QuizGenerator only
async generateQuestions() {
  try {
    // QuizGenerator handles retries internally (3 attempts max)
    const response = await quizGenerator.generateRawContent();
    const data = JSONValidator.extractJSON(response);
    return data;
  } catch (error) {
    // Handler returns fallback, does NOT retry
    return getFallbackContent();
  }
}
```
