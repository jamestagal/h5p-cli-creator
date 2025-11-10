# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Fill in the Blanks Handler (H5P.Blanks-1.14)

**New Content Types:**
- `blanks` (alias: `fill-in-the-blanks`) - Manual fill-in-the-blank exercises with typed answers
- `ai-blanks` (alias: `ai-fill-in-the-blanks`) - AI-generated fill-in-the-blank exercises

**Key Features:**
- **Dual Format Support**: Choose between simplified `{blank}` placeholders or native H5P `*answer*` syntax
  - Simplified format: Easy-to-read YAML with structured blanks array
  - Native format: Use H5P's `*answer*` syntax for advanced control
- **Alternative Answers**: Accept multiple correct answers per blank (e.g., "one", "1", "first")
- **Tips and Hints**: Provide optional hints that appear when students click the hint icon
- **Multiple Blanks Per Sentence**: Support for sentences with multiple blanks
- **Behavior Customization**: Control case sensitivity, spelling error tolerance, retry options, and more
- **Media Support**: Add images, videos, or audio above exercises for visual learning context
- **AI Generation**: Generate exercises from prompts with configurable difficulty levels
  - Easy: Simple vocabulary, 1 blank per sentence
  - Medium: Moderate complexity, 1-2 blanks per sentence
  - Hard: Academic terminology, 2-3 blanks per sentence
- **Universal AI Configuration**: Use aiConfig to control reading level and tone across all AI-generated content

**Implementation Details:**
- Location: `src/handlers/embedded/BlanksHandler.ts` (manual)
- Location: `src/handlers/ai/AIBlanksHandler.ts` (AI-generated)
- H5P Library: H5P.Blanks 1.14
- Dependencies: H5P.Question 1.5, H5P.JoubelUI 1.3, H5P.TextUtilities 1.3, FontAwesome 4.5
- Test Coverage: 25+ unit tests across both handlers
- Integration: Fully integrated with Interactive Book compiler

**Configuration Options:**
- `caseSensitive` - Control case matching (default: true)
- `acceptSpellingErrors` - Allow minor typos (default: false)
- `enableRetry` - Allow retry after checking (default: true)
- `enableSolutionsButton` - Show solution button (default: true)
- `autoCheck` - Check answers automatically (default: false)
- Custom UI labels and feedback ranges

**Documentation:**
- README.md: Complete usage guide with examples
- examples/yaml/blanks-example.yaml: Comprehensive examples for all features
- examples/yaml/comprehensive-demo.yaml: Integration examples

**Example Usage:**
```yaml
# Simplified format (recommended)
- type: blanks
  title: "Solar System Facts"
  sentences:
    - text: "The Sun is a {blank}."
      blanks:
        - answer: "star"
          tip: "Not a planet!"

# Native H5P format
- type: blanks
  title: "Solar System Facts"
  questions:
    - "The Sun is a *star:Not a planet!*."

# AI-generated
- type: ai-blanks
  title: "Solar System Quiz"
  prompt: "Create fill-in-the-blank sentences about planets"
  sentenceCount: 8
  difficulty: "medium"
  aiConfig:
    targetAudience: "grade-6"
```

**Validation:**
- Generated .h5p packages tested on h5p.com
- User interaction verified: typing answers, checking, showing solutions, retry
- Alternative answers tested and working
- Tips display correctly on hint icon hover/click
- Case sensitivity and spelling error tolerance settings functional
- Media displays above task description as expected

**Related Files:**
- `src/handlers/embedded/BlanksHandler.ts`
- `src/handlers/ai/AIBlanksHandler.ts`
- `src/compiler/YamlInputParser.ts` (type system updates)
- `tests/unit/handlers/embedded/BlanksHandler.test.ts`
- `tests/unit/handlers/ai/AIBlanksHandler.test.ts`
- `examples/yaml/blanks-example.yaml`

---

## [Previous Releases]

(This is the first CHANGELOG entry for the project. Previous changes were not documented in this format.)
