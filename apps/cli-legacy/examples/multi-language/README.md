# Multi-Language AI Content Examples

This directory contains example configurations demonstrating the multi-language AI content generation features of h5p-cli-creator.

## Overview

The multi-language AI feature allows you to create educational H5P packages in any target language (Vietnamese, French, German, Spanish, etc.) with optional scaffolding for language learners.

## Key Features

### 1. Target Language Configuration

Specify the language for educational content (questions, answers, explanations):

```yaml
aiConfig:
  targetLanguage: "vi"  # ISO 639-1 code (vi, fr, de, es, ja, etc.)
```

### 2. Instructional Language (Scaffolding)

Provide task instructions in a different language to support beginner learners:

```yaml
aiConfig:
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English
```

**Use Case:** Lower beginner students need instructions in their first language to understand what to do, but practice content in the target language.

### 3. Translation Support

Add English translations for vocabulary support:

```yaml
aiConfig:
  targetLanguage: "vi"
  includeTranslations: true      # Add English translations in parentheses
```

**Output Example:** "Xin chào (Hello)", "Cảm ơn (Thank you)"

## Configuration Patterns

### Pattern 1: Beginner Scaffolding

**File:** `vietnamese-beginner.yaml`

**Use Case:** Vietnamese language learning for English-speaking beginners

**Configuration:**
```yaml
aiConfig:
  targetLanguage: "vi"           # Content in Vietnamese
  instructionalLanguage: "en"    # Instructions in English (scaffolding)
  includeTranslations: true      # Add English translations
  targetAudience: "esl-beginner"
```

**Generated Output:**
- Task instructions: "Choose the correct answer" (English)
- Questions: "Peter đi đâu?" (Vietnamese)
- Answers: "Quán cà phê (Cafe)", "Nhà hàng (Restaurant)" (Vietnamese with translations)
- Accordion panels: Vietnamese terms with English explanations

**When to Use:**
- Lower beginner language learners
- Students need first-language instructions to avoid cognitive overload
- Vocabulary building with translation support

### Pattern 2: Full Immersion

**File:** `french-immersion.yaml`

**Use Case:** Advanced French learners ready for monolingual content

**Configuration:**
```yaml
aiConfig:
  targetLanguage: "fr"           # All content in French
  includeTranslations: false     # No translations (immersion)
  targetAudience: "high-school"
```

**Note:** When `instructionalLanguage` is not specified, it defaults to `targetLanguage` (monolingual mode).

**Generated Output:**
- Task instructions: "Choisissez la bonne réponse" (French)
- Questions: "Quelle est la capitale de la France?" (French)
- Answers: "Paris", "Lyon", "Marseille" (French only)
- No English translations anywhere (pure immersion)

**When to Use:**
- Advanced language learners
- Full immersion learning approach
- Natural language acquisition context

### Pattern 3: Bilingual Content

**Configuration:**
```yaml
aiConfig:
  targetLanguage: "vi"
  instructionalLanguage: "vi"    # Same as target (monolingual instructions)
  includeTranslations: true      # But add translations for vocabulary
```

**Generated Output:**
- Task instructions: "Chọn câu trả lời đúng" (Vietnamese)
- Questions: "Peter đi đâu?" (Vietnamese)
- Answers: "Quán cà phê (Cafe)", "Nhà hàng (Restaurant)" (Vietnamese with English translations)

**When to Use:**
- Intermediate learners comfortable with target language instructions
- Vocabulary learning with translation support
- Gradual reduction of scaffolding

### Pattern 4: Backward Compatible (Legacy)

**Configuration:**
```yaml
# No aiConfig specified, or aiConfig without language fields
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
```

**Generated Output:**
- All content defaults to English
- Existing behavior maintained (100% backward compatible)

**When to Use:**
- Existing YAML configs without language fields
- English-only educational content
- No language learning focus

## Configuration Cascade

Language settings cascade from book → chapter → item levels:

```yaml
# Book level (applies to all content)
aiConfig:
  targetLanguage: "vi"

chapters:
  # Chapter level (overrides book for this chapter)
  - title: "Chapter 1"
    aiConfig:
      targetLanguage: "fr"    # This chapter in French
    content:
      # Item level (overrides chapter and book)
      - type: ai-text
        aiConfig:
          targetLanguage: "de"  # This item in German
        prompt: "Write a story"
```

**Resolution Order (highest to lowest priority):**
1. Item-level `aiConfig`
2. Chapter-level `aiConfig`
3. Book-level `aiConfig`
4. Auto-detected from `language` field
5. Default to English

## Auto-Detection from Book Language

When `targetLanguage` is not specified, it auto-detects from the book's `language` field:

```yaml
title: "Vietnamese Story"
language: vi  # Auto-detected as targetLanguage

# No aiConfig needed - will default to Vietnamese content
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Write a story"  # Generated in Vietnamese
```

## Supported Languages

Common ISO 639-1 language codes:

| Code | Language   | Example Usage                          |
|------|------------|----------------------------------------|
| `vi` | Vietnamese | Language learning, cultural content    |
| `fr` | French     | Literature, culture, language courses  |
| `de` | German     | Language learning, technical content   |
| `es` | Spanish    | Language courses, cultural studies     |
| `ja` | Japanese   | Language learning, cultural content    |
| `ko` | Korean     | Language courses, K-pop culture        |
| `zh` | Chinese    | Language learning, history             |
| `ar` | Arabic     | Language courses, cultural studies     |
| `pt` | Portuguese | Language learning, Brazilian culture   |
| `en` | English    | Default (no special configuration)     |

**Note:** The system accepts any ISO 639-1 code. Unknown codes are passed through with a warning but do not block generation.

## Building Examples

### Build Vietnamese Beginner Example

```bash
npm run build
node dist/index.js interactivebook-ai \
  ./examples/multi-language/vietnamese-beginner.yaml \
  ./vietnamese-beginner.h5p
```

### Build French Immersion Example

```bash
npm run build
node dist/index.js interactivebook-ai \
  ./examples/multi-language/french-immersion.yaml \
  ./french-immersion.h5p
```

### Build with Verbose Logging

See detailed AI generation and JSON processing logs:

```bash
node dist/index.js interactivebook-ai \
  ./examples/multi-language/vietnamese-beginner.yaml \
  ./vietnamese-beginner.h5p \
  --verbose
```

## Best Practices

### For Beginner Learners

✓ **Use English instructions** (`instructionalLanguage: "en"`) to reduce cognitive load
✓ **Enable translations** (`includeTranslations: true`) for vocabulary support
✓ **Start with `esl-beginner` audience** for appropriate difficulty
✓ **Provide cultural context** in accordion panels and explanatory text

### For Intermediate Learners

✓ **Use target language instructions** (no `instructionalLanguage` specified)
✓ **Optionally include translations** for new vocabulary
✓ **Mix scaffolding approaches** across different chapters
✓ **Gradually reduce translation support** as learners progress

### For Advanced Learners

✓ **Full immersion mode** (`includeTranslations: false`)
✓ **No instructional scaffolding** (monolingual)
✓ **Use `high-school` or `college` audience** for complexity
✓ **Focus on cultural and contextual understanding**

### For Mixed-Level Content

✓ **Use chapter-level overrides** for different difficulty levels
✓ **Provide scaffolded introduction** with gradual progression
✓ **Offer both beginner and advanced paths** in different chapters
✓ **Document learning progression** clearly for users

## Troubleshooting

### AI Generates Wrong Language

**Symptom:** Content appears in English despite `targetLanguage: "vi"`

**Solutions:**
1. Verify configuration cascade (check item/chapter/book levels)
2. Run with `--verbose` to see system prompt injection
3. Check if `targetLanguage` is misspelled or invalid
4. Ensure AI provider (Gemini/Claude) supports target language

### Translations Not Appearing

**Symptom:** `includeTranslations: true` but no English translations in output

**Solutions:**
1. Verify `targetLanguage` is NOT "en" (translations only for non-English)
2. Check if AI provider followed instructions (use `--verbose`)
3. Verify configuration cascade didn't override at item level

### Instructions Still in Target Language

**Symptom:** Task instructions appear in Vietnamese instead of English

**Solutions:**
1. Set `instructionalLanguage: "en"` explicitly
2. Verify configuration cascade (item override may be missing field)
3. Check system prompt injection with `--verbose` flag

### JSON Parse Errors

**Symptom:** "AI generation failed" errors frequently

**Solutions:**
1. Run with `--verbose` to see retry attempts and raw responses
2. Check API key and quota status
3. Verify network connectivity to AI provider
4. Review logs for truncation or malformed JSON patterns
5. Consider reducing `questionCount` or content complexity

## Further Reading

- [CLAUDE.md](/CLAUDE.md) - Complete multi-language workflow documentation
- [Specification](/agent-os/specs/2025-11-16-multi-language-ai-robust-json/spec.md) - Technical specification
- [Requirements](/agent-os/specs/2025-11-16-multi-language-ai-robust-json/planning/requirements.md) - Detailed requirements

## Contributing

When adding new language examples:

1. Use clear, descriptive filenames (e.g., `spanish-beginner.yaml`)
2. Document the use case and target audience in YAML comments
3. Include build instructions in comments
4. Test with both Gemini and Claude providers
5. Verify JSON parse success rate >95% over multiple runs
6. Add language-specific cultural context where appropriate
