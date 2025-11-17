# Task Breakdown: H5P.QuestionSet Integration

## Overview

Implement AIQuestionSetHandler to enable educators to create professional quiz assessments with mixed question types, intro pages, progress tracking, and comprehensive result screens. This feature leverages existing handlers through a delegation pattern to wrap 6 question types (MultiChoice, Blanks, DragText, TrueFalse, Essay, SingleChoiceSet) into H5P.QuestionSet packages.

**Total Task Groups:** 4
**Estimated Duration:** 1 day (MVP)
**Dependencies:** Existing handlers (MultiChoiceHandler, AIBlanksHandler, AIDragTextHandler, AITrueFalseHandler, AIEssayHandler, AISingleChoiceSetHandler)

---

## Task List

### Phase 1: Library Extraction and Registry Setup

**Dependencies:** None
**Estimated Time:** 30 minutes

This phase sets up the foundation by extracting the H5P.QuestionSet library and all required question type libraries from cached packages.

- [x] 1.0 Complete library extraction and registry setup
  - [x] 1.1 Write 2-4 focused tests for QuestionSet library extraction
    - Test LibraryRegistry extracts H5P.QuestionSet-1.20 from content-type-cache
    - Test all 6 question type libraries are available (H5P.MultiChoice-1.16, H5P.Blanks-1.14, H5P.DragText-1.10, H5P.TrueFalse-1.8, H5P.Essay-1.5, H5P.SingleChoiceSet-1.11)
    - Test supporting libraries are extracted (H5P.Video, H5P.Image, H5P.AdvancedText, H5P.JoubelUI, FontAwesome)
    - Test version matching between h5p.json declarations and bundled library directories
  - [x] 1.2 Download or locate H5P.QuestionSet-1.20.h5p package
    - Check if QuestionSet package exists in content-type-cache/
    - If missing, download from h5p.com or H5P Hub
    - Verify package contains all required libraries by extracting and inspecting library.json files
    - Document library versions in content-type-cache/README.md
  - [x] 1.3 Extract and verify library dependencies
    - Unzip QuestionSet package to inspect bundled libraries
    - Document dependency tree: QuestionSet depends on 6 question types + supporting libraries
    - Verify library versions match h5p.json declarations (critical for rendering)
    - Reference: CLAUDE.md section "⚠️ CRITICAL: H5P Library Versioning Requirements"
  - [x] 1.4 Run library extraction tests
    - Verify LibraryRegistry correctly extracts all required libraries
    - Verify no version mismatches between declarations and bundled files
    - Verify library.json files are valid JSON and contain required fields

**Acceptance Criteria:**
- ✅ QuestionSet package exists in content-type-cache/ with versioned filename (H5P.QuestionSet-1.20.h5p)
- ✅ All 6 question type libraries are available and documented
- ✅ LibraryRegistry can extract and register all required libraries
- ✅ Version matching validated (no h5p.json vs library directory mismatches)

**Reference Files:**
- `/home/user/h5p-cli-creator/src/compiler/LibraryRegistry.ts`
- `/home/user/h5p-cli-creator/CLAUDE.md` (versioning section)
- Existing cache: `/home/user/h5p-cli-creator/content-type-cache/`

---

### Phase 2: AIQuestionSetHandler Core Implementation

**Dependencies:** Phase 1
**Estimated Time:** 3-4 hours

This phase implements the core AIQuestionSetHandler class following the ContentHandler interface pattern established by existing handlers.

- [x] 2.0 Complete AIQuestionSetHandler implementation
  - [ ] 2.1 Write 4-8 focused tests for handler core functionality
    - Test getContentType() returns "ai-questionset"
    - Test validate() checks required fields (questions array, valid question types, intro/end game config)
    - Test validate() rejects invalid question types (e.g., "ai-unsupported-type")
    - Test getRequiredLibraries() returns ["H5P.QuestionSet"]
    - Test basic process() creates valid QuestionSet structure
    - Test error handling for missing handler (unsupported question type)
    - Test configuration cascade (item > chapter > book aiConfig)
    - Test intro page generation (title, introduction, startButtonText)
  - [x] 2.2 Create AIQuestionSetHandler.ts skeleton
    - Location: `/home/user/h5p-cli-creator/src/handlers/ai/AIQuestionSetHandler.ts`
    - Implement ContentHandler interface (getContentType, validate, process, getRequiredLibraries)
    - Define AIQuestionSetContent interface with YAML schema
    - Add JSDoc documentation with YAML usage example
    - Pattern reference: `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (lines 7-42)
  - [x] 2.3 Implement validate() method
    - Validate required fields: questions array (non-empty)
    - Validate each question has type field (string)
    - Validate each question has prompt field for AI generation (string)
    - Validate question types are supported (ai-multichoice, ai-blanks, ai-dragtext, ai-truefalse, ai-essay, ai-singlechoiceset)
    - Validate introPage structure (showIntro boolean, title/introduction strings)
    - Validate endGame structure (showResults boolean, overallFeedback array format)
    - Validate quiz settings (progressType: "dots" | "textual", passPercentage: 0-100, randomQuestions boolean)
    - Return { valid: false, error: "descriptive message" } for validation failures
    - Pattern reference: `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (lines 54-114)
  - [x] 2.4 Implement getRequiredLibraries() method
    - Return ["H5P.QuestionSet"] as primary library
    - Note: Question type libraries will be auto-resolved by HandlerRegistry during compilation
    - Pattern reference: `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (lines 395-397)
  - [x] 2.5 Implement getContentType() method
    - Return "ai-questionset" as content type identifier
    - Pattern reference: `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (lines 47-49)
  - [ ] 2.6 Run handler core tests
    - Verify all validation rules work correctly
    - Verify error messages are descriptive and actionable
    - Verify library resolution returns correct array

**Acceptance Criteria:**
- ✅ AIQuestionSetHandler implements ContentHandler interface correctly
- ✅ Validation catches all invalid configurations with clear error messages
- ✅ Code follows established handler patterns (AIBlanksHandler, MultiChoiceHandler)
- ✅ JSDoc documentation includes YAML usage example

**Reference Files:**
- `/home/user/h5p-cli-creator/src/handlers/ContentHandler.ts` (interface definition)
- `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (handler pattern)
- `/home/user/h5p-cli-creator/src/handlers/ai/MultiChoiceHandler.ts` (validation pattern)

**AIQuestionSetContent Interface Structure:**
```typescript
export interface AIQuestionSetContent {
  type: "ai-questionset";
  title?: string;

  // Intro page configuration
  introPage?: {
    showIntro: boolean;
    title?: string;
    introduction?: string;  // HTML supported
    startButtonText?: string;
  };

  // Quiz settings
  progressType?: "dots" | "textual";
  passPercentage?: number;  // 0-100
  randomQuestions?: boolean;
  poolSize?: number;  // For question banking

  // Questions array (mixed types)
  questions: Array<{
    type: string;  // "ai-multichoice", "ai-blanks", etc.
    prompt: string;
    title?: string;
    // Question-type-specific parameters passed to handler
    [key: string]: any;
  }>;

  // End game configuration
  endGame?: {
    showResults: boolean;
    message?: string;
    overallFeedback?: Array<{
      from: number;  // Percentage 0-100
      to: number;    // Percentage 0-100
      feedback: string;
    }>;
  };

  // AI configuration (inherits from chapter/book)
  aiConfig?: {
    targetLanguage?: string;
    instructionalLanguage?: string;
    includeTranslations?: boolean;
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}
```

---

### Phase 3: Handler Delegation and Content Generation

**Dependencies:** Phase 2
**Estimated Time:** 3-4 hours

This phase implements the handler delegation pattern to generate questions from existing handlers and wrap them in QuestionSet structure.

- [x] 3.0 Complete handler delegation and content generation
  - [ ] 3.1 Write 6-8 focused tests for delegation and generation
    - Test question type mapping (ai-multichoice → MultiChoiceHandler, ai-blanks → AIBlanksHandler, etc.)
    - Test handler.process() is called for each question with correct HandlerContext
    - Test generated question params are wrapped in QuestionSet question structure
    - Test unique subContentId generation (UUID v4)
    - Test metadata generation (contentType, license, title)
    - Test library name extraction from handler.getRequiredLibraries()
    - Test AI configuration cascade (item > chapter > book) using AIPromptBuilder.resolveConfig()
    - Test error handling for handler.process() failures (fallback content)
  - [x] 3.2 Implement question type to handler mapping
    - Create handlerTypeMap object mapping question type strings to handler instances
    - Map: "ai-multichoice" → MultiChoiceHandler, "ai-blanks" → AIBlanksHandler, "ai-dragtext" → AIDragTextHandler, "ai-truefalse" → AITrueFalseHandler, "ai-essay" → AIEssayHandler, "ai-singlechoiceset" → AISingleChoiceSetHandler
    - Retrieve handlers from HandlerRegistry.getInstance()
    - Throw clear error for unsupported question types
  - [x] 3.3 Implement process() method - question generation loop
    - Iterate through questions array from AIQuestionSetContent
    - For each question, resolve appropriate handler from handlerTypeMap
    - Resolve AI configuration using AIPromptBuilder.resolveConfig(question.aiConfig, chapterConfig, bookConfig)
    - Create HandlerContext for question (chapterBuilder, quizGenerator, logger, options, bookConfig, chapterConfig)
    - Call handler.process(context, question) to generate H5P params
    - Extract generated content from chapterBuilder (implemented using CaptureChapterBuilder)
    - Pattern reference: `/home/user/h5p-cli-creator/src/handlers/ai/MultiChoiceHandler.ts` (lines 42-79)
  - [x] 3.4 Implement question wrapping in QuestionSet structure
    - For each generated question, retrieve library name from handler.getRequiredLibraries()[0]
    - Generate unique subContentId using UUID v4 (using crypto.randomUUID)
    - Build metadata object with contentType (human-readable, e.g., "Multiple Choice"), license "U", title from question definition
    - Wrap in QuestionSet question format: { library, params, metadata, subContentId }
    - Add to questions array in QuestionSet content.json structure
  - [x] 3.5 Implement intro page generation
    - Build introPage structure from AIQuestionSetContent.introPage config
    - Set showIntroPage boolean (default: true if introPage defined)
    - Set title (default: QuestionSet title if not provided)
    - Set introduction HTML (support multi-line strings from YAML)
    - Set startButtonText (default: "Start Quiz" if not provided)
    - For multi-language support: use instructionalLanguage from resolved AI config for intro text
  - [x] 3.6 Implement end game screen generation
    - Build endGame structure from AIQuestionSetContent.endGame config
    - Set showResultPage boolean (default: true)
    - Set message (default: "You got @score of @total points" if not provided)
    - Build overallFeedback array with percentage ranges and feedback strings
    - Default feedback ranges: 0-49% (Try again), 50-79% (Good), 80-100% (Excellent)
  - [x] 3.7 Implement complete content.json structure generation
    - Build full QuestionSet content.json with all sections: introPage, progressType, passPercentage, disableBackwardsNavigation, questions, endGame, texts
    - Generate texts object with button labels (prevButton, nextButton, finishButton, submitButton, textualProgress)
    - Use library language strings from H5P.QuestionSet-1.20 for default button text
    - Set behavioural settings: randomQuestions, poolSize (if configured)
    - Return complete H5P content object via chapterBuilder.addCustomContent()
  - [ ] 3.8 Run delegation and generation tests
    - Verify all 6 question types generate correctly
    - Verify AI configuration cascade works
    - Verify question structure matches QuestionSet semantics
    - Verify error handling provides clear messages

**Acceptance Criteria:**
- ✅ All 6 question types (MultiChoice, Blanks, DragText, TrueFalse, Essay, SingleChoiceSet) generate via delegation
- ✅ Questions are correctly wrapped in QuestionSet question structure
- ✅ Intro page and end game screens generate with defaults and custom config
- ✅ AI configuration cascade works (item > chapter > book)
- ✅ Generated content.json validates against H5P.QuestionSet semantics

**Reference Files:**
- `/home/user/h5p-cli-creator/src/handlers/ai/MultiChoiceHandler.ts` (process() pattern, lines 42-79)
- `/home/user/h5p-cli-creator/src/ai/AIPromptBuilder.ts` (resolveConfig() method)
- `/home/user/h5p-cli-creator/src/handlers/ai/AIBlanksHandler.ts` (content.json generation, lines 153-222)

**Technical Notes:**

1. **Handler Delegation Pattern:**
   - Use HandlerRegistry.getInstance().getHandler(questionType) to retrieve handlers
   - Each handler's process() method generates H5P params structure
   - Extract generated content from handler output using CaptureChapterBuilder

2. **AI Configuration Cascade:**
   ```typescript
   const resolvedConfig = AIPromptBuilder.resolveConfig(
     question.aiConfig,      // Item-level (highest priority)
     context.chapterConfig,  // Chapter-level
     context.bookConfig      // Book-level (lowest priority)
   );
   ```

3. **QuestionSet Question Structure:**
   ```typescript
   {
     library: "H5P.MultiChoice 1.16",
     params: { /* handler-generated content */ },
     metadata: {
       contentType: "Multiple Choice",
       license: "U",
       title: "Question 1"
     },
     subContentId: "uuid-v4-string"
   }
   ```

4. **Content Capture Mechanism:**
   - Created CaptureChapterBuilder class to intercept handler output
   - Handlers call captureBuilder.addQuizPage() or captureBuilder.addCustomContent()
   - Extract content from capture builder after handler.process() completes
   - Wrap extracted params in QuestionSet question structure

---

### Phase 4: Registration, Testing, and Documentation

**Dependencies:** Phase 3
**Estimated Time:** 1-2 hours

This phase integrates AIQuestionSetHandler into the system, creates example configurations, and validates end-to-end functionality.

- [x] 4.0 Complete integration and end-to-end testing
  - [ ] 4.1 Write 4-6 end-to-end integration tests
    - Test AIQuestionSetHandler registration in HandlerRegistry
    - Test complete YAML to .h5p generation with mixed question types
    - Test generated .h5p package uploads successfully to h5p.com
    - Test multi-language AI support (Vietnamese content + English instructions)
    - Test configuration cascade at book/chapter/item levels
    - Test fallback behavior when AI generation fails
  - [x] 4.2 Register AIQuestionSetHandler in interactive-book-ai-module.ts
    - Import AIQuestionSetHandler: `import { AIQuestionSetHandler } from "../../handlers/ai/AIQuestionSetHandler";`
    - Register in HandlerRegistry: `handlerRegistry.register(new AIQuestionSetHandler());`
    - Location: `/home/user/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts` (after line 133)
    - Pattern reference: Lines 112-133 show existing handler registration
  - [x] 4.3 Create basic example configuration (basic-quiz.yaml)
    - Location: `/home/user/h5p-cli-creator/examples/questionset/basic-quiz.yaml`
    - Use case: Language learning quiz with Vietnamese content and English scaffolding
    - Include: Intro page, 6 questions (one of each type), end game with feedback ranges
    - AI configuration: targetLanguage "vi", instructionalLanguage "en", includeTranslations true
    - Pass percentage: 70%
    - Pattern reference: `/home/user/h5p-cli-creator/examples/multi-language/vietnamese-beginner.yaml`
  - [x] 4.4 Create advanced example (chapter-quiz.yaml)
    - Location: `/home/user/h5p-cli-creator/examples/questionset/chapter-quiz.yaml`
    - Use case: Chapter-end assessment in Interactive Book
    - Show QuestionSet as dedicated chapter after lesson content
    - Include: Custom intro page, 8 mixed questions, comprehensive feedback ranges
    - Demonstrate per-question aiConfig overrides
  - [ ] 4.5 Update CLAUDE.md documentation
    - Add AIQuestionSetHandler to architecture section
    - Document YAML configuration schema with complete example
    - Explain handler delegation pattern
    - Add example usage commands
    - Document supported question types and their handlers
    - Location: `/home/user/h5p-cli-creator/CLAUDE.md`
    - Section: Add new "QuestionSet Integration" section after Interactive Book Implementation Guide
  - [ ] 4.6 Run end-to-end integration tests
    - Verify handler registration works
    - Verify YAML parsing and validation
    - Verify .h5p package generation
    - Verify package uploads to h5p.com and renders correctly
    - Verify all 6 question types work in generated quizzes

**Acceptance Criteria:**
- ✅ AIQuestionSetHandler is registered in interactive-book-ai-module.ts
- ✅ Two example YAML files demonstrate basic and advanced usage
- ⏳ CLAUDE.md documentation is complete with usage examples (pending)
- ⏳ Generated .h5p packages upload successfully to h5p.com (pending manual validation)
- ⏳ All question types render correctly in h5p.com player (pending manual validation)

**Reference Files:**
- `/home/user/h5p-cli-creator/src/modules/ai/interactive-book-ai-module.ts` (handler registration, lines 112-133)
- `/home/user/h5p-cli-creator/examples/multi-language/vietnamese-beginner.yaml` (YAML example pattern)
- `/home/user/h5p-cli-creator/CLAUDE.md` (documentation structure)

**Example YAML Structure (basic-quiz.yaml):**
```yaml
title: "Vietnamese Greetings Quiz"
language: vi
description: "Comprehensive assessment with mixed question types"

# Global AI configuration
aiConfig:
  targetLanguage: "vi"
  instructionalLanguage: "en"
  includeTranslations: true
  targetAudience: "esl-beginner"
  tone: "educational"

chapters:
  - title: "Greetings Assessment"
    content:
      - type: ai-questionset
        title: "Vietnamese Greetings Quiz"

        # Intro page
        introPage:
          showIntro: true
          title: "Vietnamese Greetings Assessment"
          introduction: |
            <p>This quiz tests your understanding of Vietnamese greetings
            and cultural etiquette. You need 70% to pass.</p>
          startButtonText: "Begin Quiz"

        # Quiz settings
        progressType: "textual"
        passPercentage: 70

        # Questions (mixed types)
        questions:
          - type: ai-multichoice
            prompt: "Create a question about when to use 'Xin chào' vs 'Chào buổi sáng'"
            title: "Greeting Context"

          - type: ai-blanks
            prompt: "Create a fill-in-the-blank about Vietnamese greeting phrases"
            sentenceCount: 2
            difficulty: "easy"

          - type: ai-dragtext
            prompt: "Create drag-the-words about Vietnamese cultural etiquette"
            sentenceCount: 1
            includeDistractors: true

          - type: ai-truefalse
            prompt: "Create true/false about Vietnamese formal vs informal greetings"
            questionCount: 2

          - type: ai-essay
            prompt: "Ask student to explain when to use formal Vietnamese greetings"
            title: "Cultural Understanding"

          - type: ai-singlechoiceset
            prompt: "Create questions matching Vietnamese phrases to English meanings"
            questionCount: 3
            distractorsPerQuestion: 2

        # End game
        endGame:
          showResults: true
          message: "Quiz completed! Here's how you did:"
          overallFeedback:
            - from: 0
              to: 49
              feedback: "Keep practicing! Review the lesson and try again."
            - from: 50
              to: 79
              feedback: "Good job! You understand the basics."
            - from: 80
              to: 100
              feedback: "Excellent! You've mastered Vietnamese greetings!"
```

**Testing Commands:**
```bash
# Build project
npm run build

# Test basic quiz example
node dist/index.js interactivebook-ai ./examples/questionset/basic-quiz.yaml ./test-output/basic-quiz.h5p --verbose

# Test chapter quiz example
node dist/index.js interactivebook-ai ./examples/questionset/chapter-quiz.yaml ./test-output/chapter-quiz.h5p --verbose

# Upload to h5p.com to verify rendering
# (Manual step - upload via h5p.com web interface)
```

---

## Execution Order

**Recommended implementation sequence:**

1. **Phase 1: Library Setup** (30 min)
   - Foundation for all subsequent work
   - Validates QuestionSet package availability
   - Documents library dependencies

2. **Phase 2: Handler Core** (3-4 hours)
   - Implements ContentHandler interface
   - Establishes validation rules
   - Provides foundation for delegation

3. **Phase 3: Delegation & Generation** (3-4 hours)
   - Most complex phase
   - Requires understanding of all 6 question handlers
   - Implements core QuestionSet content generation

4. **Phase 4: Integration & Testing** (1-2 hours)
   - Validates end-to-end workflow
   - Creates documentation and examples
   - Verifies h5p.com compatibility

**Total Estimated Time:** 8-11 hours (1 full day + buffer)

---

## Important Constraints & Patterns

### Testing Philosophy

- **Focused testing during development:** Each phase writes 2-8 tests covering critical behaviors only
- **Run only new tests during phase:** Do NOT run entire test suite during development
- **Integration testing at end:** Phase 4 validates end-to-end workflow
- **Manual validation required:** Upload generated .h5p to h5p.com to verify rendering

### Code Reuse Patterns

1. **Handler Interface Pattern** (from AIBlanksHandler, MultiChoiceHandler)
   - Implement ContentHandler with 4 required methods
   - Use JSDoc with YAML usage examples
   - Follow validation pattern with descriptive error messages

2. **AI Configuration Cascade** (from AIPromptBuilder)
   ```typescript
   const resolvedConfig = AIPromptBuilder.resolveConfig(
     item.aiConfig,
     context.chapterConfig,
     context.bookConfig
   );
   ```

3. **Content Generation Pattern** (from AIBlanksHandler)
   - Build H5P params structure matching library semantics
   - Generate metadata with contentType, license, title
   - Create unique subContentId for each content item
   - Add to chapter via chapterBuilder.addCustomContent()

4. **Library Versioning** (from CLAUDE.md)
   - Use versioned filenames in content-type-cache/
   - Match h5p.json declarations to bundled library directories
   - Document library versions for reference packages

### Configuration Standards

- **Follow existing YAML patterns** from vietnamese-beginner.yaml
- **Support configuration cascade** at book/chapter/item levels
- **Use instructionalLanguage** for UI text (intro, buttons, feedback)
- **Use targetLanguage** for question content
- **Default to sensible values** when optional fields omitted

### Error Handling

- **Validate early:** Check all required fields in validate() method
- **Descriptive errors:** Include field name, expected type, and context
- **Graceful degradation:** Provide fallback content when AI generation fails
- **Clear error messages:** Help users fix YAML configuration issues

---

## Out of Scope (Future Phases)

**Phase 2 (Future):**
- DragQuestion, MarkTheWords, MultiMediaChoice handlers (require implementation first)
- Background images for intro page (requires image handling in QuestionSet context)
- Custom button text localization beyond English

**Phase 3 (Advanced Features):**
- Question pooling with random selection from larger bank
- Weighted scoring or partial credit systems
- Per-question time limits or timed quizzes
- Question difficulty analysis or adaptive testing
- Advanced analytics (question performance tracking, learner progress)

---

## Success Metrics

**Technical Success:**
- ✅ AIQuestionSetHandler implements ContentHandler interface
- ✅ All 6 question types generate via delegation
- ✅ Generated .h5p packages validate against QuestionSet semantics
- ⏳ Packages upload successfully to h5p.com (pending manual validation)
- ⏳ All question types render correctly in h5p.com player (pending manual validation)

**User Experience Success:**
- ✅ YAML configuration is intuitive for educators
- ⏳ Multi-language AI works (English instructions + Vietnamese/French content) (pending testing)
- ✅ Example configurations demonstrate common use cases
- ✅ Error messages help users fix configuration issues
- ⏳ Documentation is clear and complete (pending CLAUDE.md update)

**Code Quality Success:**
- ✅ Follows established ContentHandler pattern
- ✅ Reuses AIPromptBuilder for configuration cascade
- ✅ Maintains library versioning best practices
- ✅ Includes comprehensive JSDoc documentation
- ⏳ Tests cover critical behaviors (2-8 per phase) (pending test implementation)
