# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Essay Questions Handler (H5P.Essay-1.5)

**New Content Types:**
- `essay` - Manual essay questions with keyword-based automatic scoring
- `ai-essay` - AI-generated essay questions

**Key Features:**
- **Keyword-Based Automatic Scoring**: Score essays by checking for important keywords
- **Wildcard Matching**: Use `*` for partial matching (e.g., `*photo*` matches "photograph", "photosynthesis")
- **Regex Support**: Use `/pattern/` format for advanced keyword matching
- **Keyword Alternatives**: Accept synonyms for fair scoring (e.g., "rocky" or "terrestrial")
- **Per-Keyword Points and Occurrences**: Award different points per keyword, control how many times points are awarded
- **Per-Keyword Feedback**: Provide specific feedback when keywords are found or missed
- **Sample Solutions**: Include introduction and sample answer to help students learn
- **Character Length Constraints**: Set minimum and maximum essay lengths to enforce writing requirements
- **Media Support**: Add images, videos, or audio above essay questions for context
- **Overall Feedback Ranges**: Provide different feedback based on score percentage
- **AI Generation**: Automatically create essay questions with relevant keywords, alternatives, and sample solutions
  - Easy: 3-5 keywords, 50-200 chars, simple vocabulary
  - Medium: 5-7 keywords, 100-500 chars, moderate vocabulary
  - Hard: 7-10 keywords, 200-1000 chars, advanced vocabulary
- **Universal AI Configuration**: Use aiConfig to control reading level and tone across all AI-generated content

**Implementation Details:**
- Location: `src/handlers/embedded/EssayHandler.ts` (manual)
- Location: `src/handlers/ai/AIEssayHandler.ts` (AI-generated)
- H5P Library: H5P.Essay 1.5
- Dependencies: H5P.Question 1.5, H5P.JoubelUI 1.3, H5P.TextUtilities 1.3, H5P.FontIcons 1.0, FontAwesome 4.5, H5P.Transition 1.0
- Test Coverage: 14+ unit tests across both handlers
- Integration: Fully integrated with Interactive Book compiler

**Configuration Options:**
- `minimumLength` / `maximumLength` - Character count constraints
- `percentagePassing` / `percentageMastering` - Scoring thresholds (0-100)
- `enableRetry` - Allow retry after checking (default: true)
- `ignoreScoring` - Show only feedback, no score (default: false)
- Per-keyword: `caseSensitive`, `forgiveMistakes`, `points`, `occurrences`
- Custom UI labels and overall feedback ranges

**Documentation:**
- README.md: Complete usage guide with examples
- examples/yaml/essay-example.yaml: Comprehensive examples for all features
- examples/yaml/comprehensive-demo.yaml: Integration examples

**Example Usage:**
```yaml
# Manual essay with keywords and alternatives
- type: essay
  title: "Planet Classification"
  taskDescription: "Explain the difference between inner planets and outer planets."
  keywords:
    - keyword: "rocky"
      alternatives: ["terrestrial", "solid", "earth-like"]
      points: 10
      feedbackIncluded: "Excellent! You correctly identified the inner planets."
    - keyword: "gas"
      alternatives: ["gaseous", "gas giant"]
      points: 10
  behaviour:
    minimumLength: 100
    maximumLength: 400

# Essay with wildcards and sample solution
- type: essay
  title: "Describe Jupiter"
  taskDescription: "Write a description of Jupiter."
  keywords:
    - keyword: "largest"
      points: 10
    - keyword: "*Great Red Spot*"
      points: 20
    - keyword: "moon*"
      points: 10
  solution:
    introduction: "A strong answer should include Jupiter's size, composition, and features."
    sample: "Jupiter is the largest planet in our solar system..."
  behaviour:
    minimumLength: 80
    maximumLength: 500

# AI-generated essay
- type: ai-essay
  title: "Photosynthesis Process"
  prompt: "Create an essay question about photosynthesis, including inputs, outputs, and where it occurs"
  keywordCount: 7
  difficulty: "medium"
  includeAlternatives: true
  includeSampleSolution: true
  minimumLength: 150
  maximumLength: 500
```

**Critical Bug Fixes:**
- ✅ Wildcard `*` characters preserved without escaping in keyword strings
- ✅ Regex `/pattern/` format preserved without modification
- ✅ Keyword alternatives validated as array and passed correctly to H5P structure
- ✅ Character length validation includes cross-field check (maximumLength > minimumLength)
- ✅ HTML stripping applied to all AI-generated text content
- ✅ Per-keyword points and occurrences validated as positive number/integer
- ✅ AI response cleaning handles markdown code fences and whitespace
- ✅ SubContentId generated for Essay content AND nested media content
- ✅ Fallback content provides helpful troubleshooting guidance
- ✅ Feedback strings validated for maximum length (1000 chars per keyword)
- ✅ Task description validated for maximum length (10000 chars)

**Validation:**
- Generated .h5p packages tested on h5p.com
- User interaction verified: writing essays, checking answers, viewing scores, retry
- Keyword matching tested: wildcards (`*photo*`), alternatives, case sensitivity
- Per-keyword feedback displays correctly (included/missed)
- Sample solutions display with introduction and sample answer
- Character count indicator shows min/max limits
- AI-generated essays produce coherent, relevant content with appropriate keywords
- Difficulty levels produce appropriate complexity (easy vs hard)

**Related Files:**
- `src/handlers/embedded/EssayHandler.ts`
- `src/handlers/ai/AIEssayHandler.ts`
- `src/compiler/YamlInputParser.ts` (type system updates)
- `tests/unit/handlers/embedded/EssayHandler.test.ts`
- `tests/unit/handlers/ai/AIEssayHandler.test.ts`
- `examples/yaml/essay-example.yaml`
- `examples/yaml/comprehensive-demo.yaml`

---

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
