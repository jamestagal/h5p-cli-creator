# Spec Review: Concept Extraction Pipeline and Language-Aware AI Configuration

**Review Date:** 2025-11-11
**Reviewer:** Claude Code Analysis
**Spec Version:** 2025-11-10
**Overall Assessment:** ⚠️ **NEEDS REFINEMENT** - Good vision but scope concerns

---

## Executive Summary

This spec tackles an important problem (multilingual content generation and concept-based learning) with a comprehensive 4-step workflow. However, it suffers from **scope creep** and **complexity overload** that could significantly delay implementation and increase risk.

**Key Concerns:**
1. 🔴 **Massive Scope** - 47 tasks implementing 3 major systems simultaneously
2. 🔴 **Mixed Concerns** - Conflates source extraction with language awareness
3. 🟡 **External Dependencies** - Heavy reliance on Whisper API, FFmpeg, pdf-parse
4. 🟡 **Testing Overhead** - 40+ tests required across multiple integration points
5. 🟢 **Good Design** - Language-aware AI configuration is well-designed

**Recommendation:** **SPLIT INTO PHASES** - Separate language-aware AI from source extraction

---

## Detailed Analysis

### 1. Scope and Complexity Assessment

#### **Current Scope: TOO LARGE** 🔴

The spec attempts to implement **three major systems** in one phase:

**System 1: Source Extraction** (Step 1)
- PDF text extraction (pdf-parse)
- Audio transcription (Whisper API)
- Video processing (FFmpeg + Whisper)
- URL scraping (cheerio)
- Text file handling

**System 2: Concept Extraction** (Step 3)
- AI-based concept extraction
- Language detection
- Importance classification
- Category assignment

**System 3: Language-Aware AI** (Throughout)
- AIConfiguration enhancement
- AIPromptBuilder updates
- Handler integration
- Translation support

**Problem:** These systems have different dependencies, risk profiles, and can be delivered independently.

#### **Recommended Phasing:**

**Phase 6A (IMMEDIATE VALUE):** Language-Aware AI Configuration
- AIConfiguration language fields
- AIPromptBuilder enhancements
- Handler integration
- **Delivery:** 2-3 weeks
- **Risk:** Low
- **Value:** HIGH - Solves Vietnamese content issue immediately

**Phase 6B (FOUNDATIONAL):** Concept Extraction Service
- ConceptExtractor implementation
- Basic text input (no source extraction)
- Concept JSON format
- Handler context integration
- **Delivery:** 2-3 weeks
- **Risk:** Medium
- **Value:** HIGH - Enables concept-based learning

**Phase 6C (ADVANCED):** Source Extraction Pipeline
- SourceExtractor service
- PDF, audio, video, URL support
- CLI commands (extract-text, extract-concepts)
- **Delivery:** 3-4 weeks
- **Risk:** HIGH (external API dependencies)
- **Value:** MEDIUM - Nice to have but not critical

---

### 2. Design Quality Analysis

#### ✅ **STRENGTHS**

**1. Language-Aware AI Configuration (EXCELLENT)**
```typescript
// Well-designed interface
interface AIConfiguration {
  targetLanguage?: string;      // ISO 639-1 codes
  includeTranslations?: boolean; // Optional translations
  // ... existing fields
}
```

**Why This Works:**
- Simple, focused enhancement
- Backward compatible (all fields optional)
- Clear cascade pattern (item > chapter > book)
- Solves real user problem (Vietnamese content staying Vietnamese)
- Minimal external dependencies

**2. Type System Design (GOOD)**
```typescript
interface ExtractedConcept {
  term: string;
  definition: string;
  importance: "high" | "medium" | "low";
  category?: string;
  language: string; // ISO 639-1
}
```

**Why This Works:**
- Clear data model
- Importance levels guide content generation
- Language field enables multilingual support
- Optional category for flexibility

**3. Cascade Pattern Consistency (EXCELLENT)**
The spec follows existing AIPromptBuilder patterns:
- `resolveConfig()` cascade for all AI fields
- Stateless service methods
- Integration with existing QuizGenerator

#### ⚠️ **CONCERNS**

**1. Source Extraction Complexity (HIGH RISK)**

**Problem:** Multiple external dependencies with different failure modes

**Dependencies:**
- `pdf-parse` - Mature, low risk
- `openai` (Whisper API) - **HIGH RISK**
  - API costs per minute of audio
  - Network latency and timeouts
  - Rate limiting
  - Requires API key configuration
- `ffmpeg` - **MEDIUM RISK**
  - Binary installation complexity
  - Cross-platform issues (Mac/Linux/Windows)
  - Video codec compatibility
- `cheerio` (web scraping) - **MEDIUM RISK**
  - Website structure varies wildly
  - Dynamic content not captured
  - Anti-scraping measures

**Recommendation:**
- **Defer to Phase 6C** - Not needed for core value delivery
- Start with manual text input (users paste/upload text files)
- Add source extraction later once concept extraction proven

**2. CLI Command Proliferation**

**New Commands Introduced:**
- `extract-text` (Step 1)
- `extract-concepts` (Step 3)
- `generate-from-concepts` (Step 4)

**Problem:** Each CLI command adds:
- Argument parsing and validation
- Error handling and logging
- Documentation and examples
- Integration tests
- User support burden

**Recommendation:**
- **Start with YAML-first approach:**
  ```yaml
  title: "Vietnamese Vocabulary"
  language: vi
  concepts:
    - term: "xin chào"
      definition: "hello"
      importance: high
  chapters:
    - content:
        - type: ai-flashcards
          useConceptsFromBook: true
          aiConfig:
            targetLanguage: vi
            includeTranslations: true
  ```
- CLI commands can come later for advanced workflows

**3. Testing Strategy Complexity**

**Current:** 40+ tests across 6 phases
- 21+ unit tests
- 20+ integration tests
- Manual validation steps

**Problem:** High testing overhead before any value delivery

**Recommendation:**
- **Focus on critical path tests:**
  - 10 tests for AIConfiguration language enhancement
  - 10 tests for ConceptExtractor core functionality
  - 5 integration tests for Vietnamese content generation
  - **Total: 25 tests** (down from 40+)

---

### 3. Architecture and Integration

#### ✅ **WELL DESIGNED**

**1. HandlerContext Integration**
```typescript
interface HandlerContext {
  // ... existing fields
  concepts?: ExtractedConcept[]; // NEW - optional for backward compat
}
```

**Why This Works:**
- Non-breaking change (optional field)
- Available to all handlers via context
- Clear fallback chain: concepts → sourceText → prompt

**2. AIPromptBuilder Enhancement**
```typescript
// Follows existing patterns
private static readonly LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  fr: "French",
  // ...
};
```

**Why This Works:**
- Matches READING_LEVELS pattern
- Stateless service methods
- Clear injection points in system prompt

#### ⚠️ **POTENTIAL ISSUES**

**1. Concept-to-Content Mapping Ambiguity**

**Question:** How do handlers map concepts to content types?

**Example:**
- **Flashcards:** `term` → front, `definition` → back ✅ Clear
- **Quiz:** How to generate distractors from concepts? ⚠️ Unclear
- **Accordion:** How to structure panels from concepts? ⚠️ Unclear
- **Dialog Cards:** Two-sided dialog from single term/definition? ⚠️ Unclear

**Recommendation:**
- **Start with simple mapping** (Flashcards, DialogCards only)
- **Document concept transformation patterns** for each content type
- Add complexity incrementally

**2. Language Detection Reliability**

**Spec says:** "Support language detection by including detected language in extraction result"

**Problem:** Language detection libraries are:
- Unreliable for short text (< 100 words)
- Confused by mixed-language content
- May conflict with user-specified targetLanguage

**Recommendation:**
- **Prefer user-specified language** over auto-detection
- Auto-detection as fallback only
- Clear priority: explicit targetLanguage > BookDefinition.language > detected language

---

### 4. User Experience Considerations

#### ✅ **GOOD UX DECISIONS**

**1. 4-Step Workflow Clarity**
The step-by-step breakdown is excellent:
1. Upload Content → Extract Text
2. Review Text → Manual Editing
3. Review Concepts → AI Extraction
4. Select Content Types → Generate H5P

**Why This Works:**
- Clear progression
- User control at each step
- Opportunity to correct AI errors

**2. Folder Structure**
```
/sources/
  files/    - PDFs, audio, video
  links/    - URL lists
  text/     - Plain text files

/extracted/
  {source-name}/
    full-text.txt
    metadata.json
    concepts.json
```

**Why This Works:**
- Clear organization
- Traceability (full extraction history)
- Easy to re-extract or re-process

#### ⚠️ **UX CONCERNS**

**1. Multi-Step Workflow Friction**

**Problem:** 4-step workflow requires multiple command invocations:
```bash
# Step 1
node dist/index.js extract-text ./sources/lecture.pdf

# Step 2 (manual)
nano ./extracted/lecture/full-text.txt

# Step 3
node dist/index.js extract-concepts ./extracted/lecture/full-text.txt ./extracted/lecture/concepts.json

# Step 4
node dist/index.js generate-from-concepts ./extracted/lecture/concepts.json ./output.h5p --content-type quiz
```

**Recommendation:**
- **Provide single-command workflow option:**
  ```bash
  node dist/index.js smart-import ./sources/lecture.pdf ./output.h5p --content-type quiz --language vi
  ```
- Keep step-by-step commands for advanced users
- Default to streamlined workflow

**2. Concept Review UX**

**Spec says:** "Review and edit extracted concepts as needed"

**Problem:** Editing JSON files is not user-friendly:
```json
{
  "concepts": [
    {"term": "xin chào", "definition": "hello", "importance": "high"},
    {"term": "cảm ơn", "definition": "thank you", "importance": "high"}
  ]
}
```

**Recommendation:**
- **Phase 6A:** JSON file editing (CLI-only)
- **Phase 6C:** Web UI for concept review (SvelteKit integration)
- Provide CSV format as intermediate option:
  ```csv
  term,definition,importance
  xin chào,hello,high
  cảm ơn,thank you,high
  ```

---

### 5. Specific Recommendations

#### **CRITICAL: Split the Spec** 🔴

**Create Three Separate Specs:**

**Spec 6A: Language-Aware AI Configuration**
- **Scope:** AIConfiguration enhancement, AIPromptBuilder updates, handler integration
- **Dependencies:** None (builds on existing Phase 5)
- **Delivery:** 2-3 weeks
- **Tasks:** ~15 tasks
- **Tests:** ~15 tests
- **Value:** HIGH - Solves immediate Vietnamese content problem

**Spec 6B: Concept-Based Content Generation**
- **Scope:** ExtractedConcept types, ConceptExtractor service, HandlerContext integration
- **Dependencies:** Spec 6A (language awareness)
- **Delivery:** 2-3 weeks
- **Tasks:** ~20 tasks
- **Tests:** ~15 tests
- **Value:** HIGH - Enables concept-based learning
- **Input:** Manual concepts in YAML or JSON (no source extraction)

**Spec 6C: Source Extraction Pipeline**
- **Scope:** SourceExtractor service, PDF/audio/video/URL support, CLI commands
- **Dependencies:** Spec 6B (concepts system)
- **Delivery:** 3-4 weeks
- **Tasks:** ~25 tasks
- **Tests:** ~20 tests
- **Value:** MEDIUM - Advanced workflow automation
- **Risk:** HIGH - External API dependencies

#### **IMMEDIATE: Simplify Phase 6A** 🟡

**Remove from current spec:**
- ❌ SourceExtractor service (move to Spec 6C)
- ❌ extract-text CLI command (move to Spec 6C)
- ❌ PDF/audio/video support (move to Spec 6C)
- ❌ Whisper API integration (move to Spec 6C)
- ❌ FFmpeg dependency (move to Spec 6C)

**Keep in current spec:**
- ✅ AIConfiguration language fields (targetLanguage, includeTranslations)
- ✅ AIPromptBuilder enhancements (language instructions, cascade)
- ✅ ConceptExtractor service (text input only)
- ✅ ExtractedConcept types
- ✅ HandlerContext concepts field
- ✅ Basic handler integration (Flashcards, DialogCards)

**Result:** Spec 6A becomes **15-20 tasks** instead of 47 tasks

#### **YAML-First Approach** 🟢

**Start with YAML configuration instead of CLI commands:**

```yaml
title: "Vietnamese Vocabulary Lesson"
language: vi

# OPTION 1: Inline concepts (manual entry)
concepts:
  - term: "xin chào"
    definition: "hello, greeting"
    importance: high
    category: vocabulary

  - term: "cảm ơn"
    definition: "thank you, thanks"
    importance: high
    category: vocabulary

  - term: "tạm biệt"
    definition: "goodbye, farewell"
    importance: medium
    category: vocabulary

# OPTION 2: Reference external concepts file
conceptsFile: "./extracted/vietnamese-lesson/concepts.json"

chapters:
  - title: "Greetings"
    content:
      - type: ai-flashcards
        useConceptsFromBook: true  # Uses concepts array above
        filterByCategory: "vocabulary"
        filterByImportance: ["high", "medium"]
        aiConfig:
          targetLanguage: vi
          includeTranslations: true
          tone: educational

      - type: ai-quiz
        useConceptsFromBook: true
        questionCount: 5
        aiConfig:
          targetLanguage: vi
          includeTranslations: true
```

**Why This Works:**
- No new CLI commands needed initially
- Leverages existing YAML parser
- Clear, documented format
- Easy to version control
- Supports both inline and file-reference concepts

---

### 6. Technical Soundness

#### ✅ **SOLID FOUNDATIONS**

**1. Type System**
- ExtractedConcept interface is well-defined
- ConceptExtractionResult includes metadata and error handling
- Language field enables multilingual support

**2. Integration Patterns**
- Follows existing AIPromptBuilder patterns
- HandlerContext extension is non-breaking
- Cascade resolution matches Phase 5 design

**3. Backward Compatibility**
- All new fields optional
- Existing YAML files continue working
- Graceful degradation when concepts not available

#### ⚠️ **TECHNICAL RISKS**

**1. Whisper API Dependency**

**Costs:**
- $0.006 per minute of audio (cheaper than most transcription services)
- 1-hour audio = $0.36
- Not expensive, but adds up with heavy use

**Reliability:**
- Network latency (audio uploads can be large)
- Rate limiting on free tier
- Requires OpenAI API key setup

**Recommendation:**
- **Defer to Phase 6C**
- Document API key requirements clearly
- Provide cost calculator in docs

**2. FFmpeg Complexity**

**Platform Issues:**
- Mac: `brew install ffmpeg`
- Linux: `apt-get install ffmpeg`
- Windows: Binary download and PATH setup

**Docker Consideration:**
- If targeting Docker deployment, FFmpeg must be in container

**Recommendation:**
- **Defer to Phase 6C**
- When implemented, provide clear installation guide
- Consider optional dependency (video support only if FFmpeg detected)

**3. ConceptExtractor AI Prompt Quality**

**Challenge:** Extracting structured concepts requires careful prompt engineering

**Example Failure Modes:**
- AI generates English definitions for Vietnamese terms
- Importance levels inconsistent
- Category assignment arbitrary
- Language detection wrong for short text

**Recommendation:**
- **Start with extensive prompt testing**
- Provide few-shot examples in prompt
- Include validation step (reject concepts without required fields)
- Log AI responses for debugging

---

### 7. Missing Considerations

#### 🔴 **CRITICAL GAPS**

**1. Concept Deduplication**

**Problem:** What if AI extracts duplicate concepts with slight variations?
- "xin chào" vs "Xin chào" (capitalization)
- "hello" vs "hello, greeting" (definition variations)

**Recommendation:**
- Add deduplication logic to ConceptExtractor
- Case-insensitive term matching
- Warn user about duplicates
- Provide merge strategy (prefer first, last, or manual review)

**2. Concept Quality Validation**

**Problem:** How do we ensure extracted concepts are educational?

**Bad Concept Examples:**
- Term: "the" → Definition: "article"
- Term: "is" → Definition: "verb"
- Term: "and" → Definition: "conjunction"

**Recommendation:**
- Add minimum term length (e.g., 2+ characters)
- Add minimum definition length (e.g., 10+ characters)
- Filter out stop words (the, is, and, etc.)
- Importance scoring should penalize trivial concepts

**3. Error Recovery UX**

**Spec mentions:** "Handle extraction failures gracefully with error messages and empty text fallback"

**Problem:** Empty fallback is not helpful for users

**Better Approach:**
```json
{
  "concepts": [],
  "metadata": {
    "error": "AI extraction failed: Timeout after 30s",
    "sourceLength": 5234,
    "extractionDate": "2025-11-11T10:30:00Z",
    "suggestedAction": "Try again with shorter text or check API key"
  }
}
```

**Recommendation:**
- Provide actionable error messages
- Suggest remediation steps
- Log detailed errors for debugging
- Don't silent-fail with empty array

#### 🟡 **NICE TO HAVE**

**1. Concept Export Formats**

Users might want to use concepts outside H5P:
- Anki flashcard format (.apkg)
- Quizlet import format
- CSV for spreadsheet editing

**Recommendation:**
- **Phase 6D** - Export plugins
- Start with JSON and CSV only
- Add formats based on user demand

**2. Concept Merging**

Users might want to combine concepts from multiple sources:
- Lecture 1 concepts + Lecture 2 concepts
- Textbook Chapter 1 + Chapter 2
- Manual concepts + AI-extracted concepts

**Recommendation:**
- **Phase 6D** - Advanced concept management
- Simple concatenation sufficient for MVP
- Add merge strategies later (dedupe, importance weighting, category merging)

**3. Concept Analytics**

Useful metrics:
- Total concepts extracted per source
- Importance distribution (% high/medium/low)
- Category breakdown
- Language distribution (for multilingual content)

**Recommendation:**
- **Phase 6D** - Analytics and reporting
- Log basic metrics in metadata.json
- Full analytics dashboard later (SvelteKit integration)

---

### 8. Implementation Risk Assessment

#### **Risk Matrix**

| Component | Complexity | External Deps | Risk Level | Recommendation |
|-----------|-----------|---------------|------------|----------------|
| **AIConfiguration Language** | Low | None | 🟢 LOW | Implement in Phase 6A |
| **AIPromptBuilder Enhancement** | Low | None | 🟢 LOW | Implement in Phase 6A |
| **ExtractedConcept Types** | Low | None | 🟢 LOW | Implement in Phase 6A |
| **ConceptExtractor (text input)** | Medium | AI API | 🟡 MEDIUM | Implement in Phase 6A |
| **Handler Integration** | Medium | None | 🟡 MEDIUM | Implement in Phase 6A |
| **PDF Extraction** | Low | pdf-parse | 🟢 LOW | Defer to Phase 6C |
| **Audio Transcription** | High | Whisper API | 🔴 HIGH | Defer to Phase 6C |
| **Video Processing** | High | FFmpeg + Whisper | 🔴 HIGH | Defer to Phase 6C |
| **URL Scraping** | Medium | cheerio | 🟡 MEDIUM | Defer to Phase 6C |
| **CLI Commands (3x)** | Medium | None | 🟡 MEDIUM | Defer to Phase 6C |

#### **Critical Path Analysis**

**To solve the Vietnamese content problem (primary user story):**
1. ✅ AIConfiguration language fields (2-3 days)
2. ✅ AIPromptBuilder enhancement (2-3 days)
3. ✅ Handler integration (3-4 days)
4. ✅ Testing and validation (2-3 days)

**Total Critical Path: 9-13 days (2 weeks)**

**Everything else is enhancement:**
- ❌ Source extraction: Nice to have, not critical
- ❌ Concept extraction: Valuable but can start with manual concepts
- ❌ CLI commands: Advanced workflow, not essential

---

### 9. Recommended Changes to Spec

#### **PHASE 6A: Language-Aware AI & Basic Concepts** (THIS SPEC)

**Reduce to Core Value:**

**In Scope:**
- ✅ AIConfiguration language fields (targetLanguage, includeTranslations)
- ✅ AIPromptBuilder language instructions
- ✅ ExtractedConcept type definition
- ✅ ConceptExtractor service (text input via YAML)
- ✅ HandlerContext concepts field
- ✅ Handler integration (Flashcards, DialogCards, Quiz)
- ✅ YAML-based concept definition
- ✅ Vietnamese content validation

**Out of Scope (move to Phase 6C):**
- ❌ SourceExtractor service
- ❌ PDF extraction (pdf-parse)
- ❌ Audio transcription (Whisper API)
- ❌ Video processing (FFmpeg)
- ❌ URL scraping (cheerio)
- ❌ extract-text CLI command
- ❌ extract-concepts CLI command
- ❌ generate-from-concepts CLI command

**Estimated Tasks:** 20-25 (down from 47)
**Estimated Tests:** 20-25 (down from 40+)
**Delivery Timeline:** 2-3 weeks (down from 6-8 weeks)

**Revised User Stories:**

**US1:** As an educator, I want to specify Vietnamese as my target language in YAML so that all AI-generated content (quiz, flashcards, accordion) stays in Vietnamese without automatic translation.

**US2:** As a language teacher, I want to manually define Vietnamese vocabulary concepts in YAML and generate flashcards that include English translations for learners.

**US3:** As a content creator, I want to use concept-based generation so that quiz questions are derived from actual course material, not AI hallucinations.

#### **PHASE 6C: Source Extraction Pipeline** (NEW SPEC)

**Defer Advanced Features:**

**In Scope:**
- ✅ SourceExtractor service
- ✅ PDF text extraction
- ✅ Audio transcription (Whisper API)
- ✅ Video processing (FFmpeg + Whisper)
- ✅ URL scraping
- ✅ extract-text CLI command
- ✅ extract-concepts CLI command
- ✅ generate-from-concepts CLI command
- ✅ Automated workflow

**Dependencies:**
- Requires Phase 6A (language awareness) completed
- Requires Phase 6B (concept extraction) proven

**Estimated Tasks:** 25-30
**Estimated Tests:** 20-25
**Delivery Timeline:** 3-4 weeks
**Risk:** HIGH (external APIs, FFmpeg)

---

### 10. Final Assessment

#### **Overall Spec Quality: 6/10** ⚠️

**Strengths:**
- ✅ Identifies important user problems (multilingual content, concept-based learning)
- ✅ Comprehensive 4-step workflow vision
- ✅ Well-designed type system and interfaces
- ✅ Follows existing architectural patterns
- ✅ Backward compatibility maintained

**Weaknesses:**
- 🔴 Scope too large (47 tasks, 3 major systems)
- 🔴 Mixes concerns (source extraction + language + concepts)
- 🔴 High-risk dependencies (Whisper API, FFmpeg)
- 🔴 CLI command proliferation without YAML alternative
- 🔴 Testing overhead (40+ tests before value delivery)

#### **Recommendation: SPLIT AND REFOCUS** 🔄

**Immediate Action:**
1. **Create Phase 6A Spec (Language-Aware AI & Basic Concepts)**
   - 20-25 tasks, 20-25 tests, 2-3 weeks
   - Low risk, high value
   - Solves Vietnamese content problem immediately
   - Enables manual concept-based generation

2. **Defer Phase 6C Spec (Source Extraction Pipeline)**
   - 25-30 tasks, 20-25 tests, 3-4 weeks
   - High risk, medium value
   - Nice to have but not critical
   - Can be implemented after 6A proven

3. **Prioritize YAML-First Approach**
   - Embed concepts in YAML
   - Reference external concepts.json
   - CLI commands as optional advanced workflow

---

## Action Items

### For Product Owner / Spec Author:

- [ ] **Decision:** Split spec into Phase 6A and Phase 6C?
- [ ] **Revise Spec 6A:** Remove source extraction, focus on language + concepts
- [ ] **Create Spec 6C:** Source extraction pipeline as separate deliverable
- [ ] **Update User Stories:** Focus on immediate value (language awareness)
- [ ] **Add YAML Examples:** Show concept definition in YAML format
- [ ] **Clarify Concept Mapping:** Document term/definition → content type transformations

### For Implementation Team:

- [ ] **Provide Feedback:** Does 2-3 week Phase 6A timeline seem realistic?
- [ ] **Risk Assessment:** Any additional technical risks not identified?
- [ ] **Dependency Check:** Are there blockers for Phase 6A implementation?
- [ ] **Testing Strategy:** Agree on 20-25 test approach vs 40+ tests?

### For Documentation:

- [ ] **YAML Schema:** Document concept structure in YAML
- [ ] **Language Codes:** List supported ISO 639-1 codes
- [ ] **Examples:** Vietnamese, French, German, Spanish, Chinese, Japanese
- [ ] **Migration Guide:** How to update existing YAML for language awareness

---

## Conclusion

This spec has **good bones** but is trying to do too much at once. The language-aware AI configuration is **excellent** and should be prioritized. The concept extraction system is **valuable** but can start simple (manual YAML input). The source extraction pipeline is **nice to have** but high-risk and should be deferred.

**Primary Recommendation:** Split into **Phase 6A (Language + Concepts)** and **Phase 6C (Source Extraction)**. Ship Phase 6A in 2-3 weeks to solve the immediate Vietnamese content problem, then tackle source extraction separately.

**Secondary Recommendation:** Adopt **YAML-first approach** for concepts. CLI commands can come later once the concept system is proven and users request automation.

---

**Reviewed by:** Claude Code
**Review Confidence:** High
**Next Step:** Discuss split with product owner and revise spec
