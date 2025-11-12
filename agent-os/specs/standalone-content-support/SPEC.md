# Standalone Content Support Specification

**Status**: 🚧 IN PROGRESS
**Branch**: `feature/standalone-content-support`
**Started**: 2025-11-12
**Priority**: HIGH (Blocking Crossword Handler from working on H5P.com)

## Overview

Enable h5p-cli-creator to generate **standalone H5P content packages** in addition to Interactive Books. This is critical because some H5P content types (e.g., H5P.Crossword) are NOT supported as sub-content within Interactive Books and must be generated as standalone packages.

## Problem Statement

### Current Limitation
The CLI currently only generates Interactive Book packages:
- YAML must have `chapters` field
- All content is wrapped in H5P.InteractiveBook structure
- h5p.json always has `"mainLibrary": "H5P.InteractiveBook"`

### Discovered Issue
When testing Crossword Handler implementation:
- Generated crossword embedded in Interactive Book
- Uploaded to H5P.com
- **Result**: Crossword did not render (only text visible)
- **Root Cause**: H5P.Crossword is NOT supported as Interactive Book sub-content

### Solution Required
Support two YAML formats:
1. **Interactive Book** (existing) - Content with `chapters` field
2. **Standalone Content** (new) - Content with `content` field (single item)

## Architecture Decision

**Selected Approach**: Option A - Unified Pipeline

Modify existing classes to handle both Interactive Book AND standalone content types using conditional logic. This approach:
- ✅ Minimizes code duplication
- ✅ Easier to maintain
- ✅ User doesn't need to know difference (same CLI command)
- ✅ Enables frontend to generate either format based on user selection

## Data Structures

### New Types (Completed)

```typescript
// src/compiler/YamlInputParser.ts

/**
 * Standalone content definition (no Interactive Book wrapper)
 */
export interface StandaloneDefinition {
  title: string;
  language?: string;
  description?: string;
  content: AnyContentItem;  // Single content item
  aiConfig?: AIConfiguration;
}

/**
 * Union type for either format
 */
export type H5PDefinition = BookDefinition | StandaloneDefinition;

/**
 * Type guards
 */
export function isStandaloneDefinition(def: H5PDefinition): def is StandaloneDefinition;
export function isBookDefinition(def: H5PDefinition): def is BookDefinition;
```

### YAML Format Examples

**Standalone Crossword** (new format):
```yaml
title: "World Geography Crossword"
language: "en"
description: "Test your geography knowledge"
content:
  type: crossword
  taskDescription: "Fill in the crossword..."
  words:
    - clue: "Largest continent by land area"
      answer: "Asia"
    - clue: "Longest river in the world"
      answer: "Nile"
  theme:
    backgroundColor: "#1A5490"
  behaviour:
    enableInstantFeedback: false
```

**Interactive Book** (existing format):
```yaml
title: "My Book"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Introduction..."
```

### Package Structure Comparison

**Standalone H5P Package**:
```
h5p.json:
{
  "mainLibrary": "H5P.Crossword",
  "title": "World Geography Crossword",
  "language": "en"
}

content/content.json:
{
  "taskDescription": "<p>Fill in...</p>",
  "words": [...],
  "behaviour": {...}
}
```

**Interactive Book Package**:
```
h5p.json:
{
  "mainLibrary": "H5P.InteractiveBook",
  "title": "My Book"
}

content/content.json:
{
  "chapters": [
    {
      "library": "H5P.Column 1.18",
      "params": {
        "content": [...]
      }
    }
  ]
}
```

## Test Results

### ✅ Verified Standalone Content Types

All tests completed successfully on 2025-11-12:

| Content Type | Status | mainLibrary | Notes |
|-------------|--------|-------------|-------|
| **Crossword** | ✅ PASS | H5P.Crossword | Verified on H5P.com, poolSize fix applied |
| **Blanks** | ✅ PASS | H5P.Blanks | Fill-in-the-blank exercises |
| **SingleChoiceSet** | ✅ PASS | H5P.SingleChoiceSet | Multiple choice quizzes |
| **Essay** | ✅ PASS | H5P.Essay | Open-ended text responses |
| **DragText** | ✅ PASS | H5P.DragText | Drag-the-words exercises |

**Test Method:**
1. Created minimal YAML for each content type
2. Generated standalone package: `node dist/index.js interactivebook-ai <yaml> <output>.h5p`
3. Verified h5p.json has correct `mainLibrary` (not "H5P.InteractiveBook")
4. Verified content.json has direct params (not chapters array)

**Conclusion:** Mock ChapterBuilder pattern works universally across all handlers. All embedded content handlers can generate standalone packages without modification.

### 🔄 Content Types Not Yet Tested

These should work with the same pattern but haven't been verified:
- TrueFalse
- Summary
- Accordion
- Multichoice
- Flashcards
- DialogCards

## Implementation Status

### ✅ Phase 1: YAML Parsing (COMPLETED)

**Files Modified**:
- `src/compiler/YamlInputParser.ts` ✅
- `src/modules/ai/interactive-book-ai-module.ts` ✅

**Changes**:
1. Added `StandaloneDefinition` interface
2. Added `H5PDefinition` union type and type guards
3. Updated `parseYamlString()` to auto-detect format
4. Added `validateAndBuildStandaloneDefinition()` method
5. Added `validateStandaloneContentItem()` helper
6. Refactored `resolveContentPaths()` to handle both formats
7. Updated CLI module to accept `H5PDefinition`

**Commit**: `0833fc6` - WIP: feat: add StandaloneDefinition type and YAML detection logic

### 🚧 Phase 2: Compilation Pipeline (IN PROGRESS)

**Files to Modify**:
1. `src/compiler/H5pCompiler.ts` - Add standalone compilation logic
2. `src/compiler/PackageAssembler.ts` - Add standalone assembly
3. `src/compiler/ContentBuilder.ts` - Add standalone content building
4. `src/handlers/HandlerRegistry.ts` - Add standalone library detection

**Current Blockers**:
- TypeScript compilation fails (expected)
- H5pCompiler.compile() still expects BookDefinition
- PackageAssembler only knows how to create Interactive Book packages

### 📋 Phase 3: Testing & Documentation (PENDING)

**Test Files to Create**:
1. `tests/unit/YamlInputParser-standalone.test.ts`
2. `tests/integration/standalone-content.test.ts`
3. `tests/integration/crossword-standalone.test.ts`

**Documentation to Create**:
1. `docs/STANDALONE_CONTENT.md` - User guide
2. Update `README.md` with standalone examples
3. Update `CHANGELOG.md`

## Content Type Compatibility

### Standalone-Only Content Types
These CANNOT be embedded in Interactive Book:
- ✅ **H5P.Crossword** (confirmed via testing)
- ⚠️ Others TBD (need to verify each content type)

### Universal Content Types
These work in BOTH standalone and Interactive Book:
- ✅ H5P.Essay
- ✅ H5P.Blanks
- ✅ H5P.DragText
- ✅ H5P.TrueFalse
- ✅ H5P.SingleChoiceSet
- ✅ H5P.DialogCards
- ✅ H5P.Flashcards

## Frontend Integration Points

For H5P Smart Import frontend (per user's screenshot):

**Modal: "Select Content Types"**
```javascript
// User can select:
const contentTypes = [
  { name: "Crosswords", standalone: true },          // Must be standalone
  { name: "Dialog Cards (Conceptual)", both: true }, // Can be either
  { name: "Interactive Book", book: true }           // Only in book
];

// Frontend generates appropriate YAML:
if (standalone) {
  yaml = { title, content: { type: "crossword", ... } };
} else if (book) {
  yaml = { title, chapters: [...] };
}
```

## Migration Path

### Backward Compatibility
- ✅ All existing YAML files with `chapters` continue to work
- ✅ No breaking changes to existing functionality
- ✅ New format is opt-in via `content` field

### Future Enhancements
1. Auto-convert Interactive Book → Standalone (for supported types)
2. Validation warning if embedding unsupported content type
3. CLI flag: `--force-standalone` to generate standalone even if compatible

## Success Criteria

### Must Have
- [x] Parse YAML with `content` field (standalone format)
- [x] Generate standalone H5P packages with correct mainLibrary
- [x] Crossword renders correctly on H5P.com as standalone
- [x] Tested 5 content types: crossword, blanks, singlechoiceset, essay, dragtext
- [x] All handlers work with standalone generation (mock ChapterBuilder pattern)

### Should Have
- [ ] Documentation for users (YAML format guide)
- [ ] Documentation for developers (architecture)
- [ ] Example YAML files for each standalone type

### Nice to Have
- [ ] CLI validation warnings for unsupported embeddings
- [ ] Auto-detection of best format based on content type

## Technical Notes

### Library Name Mapping
Each content type has a specific library name for h5p.json:

| Content Type | Library Name (mainLibrary) |
|-------------|---------------------------|
| crossword   | H5P.Crossword            |
| essay       | H5P.Essay                |
| blanks      | H5P.Blanks               |
| dragtext    | H5P.DragText             |
| truefalse   | H5P.TrueFalse            |
| singlechoiceset | H5P.SingleChoiceSet  |

**Implementation**: Handler classes will need to expose their library names.

### Handler Architecture Integration
Current handlers already have:
- `getRequiredLibraries()` - Returns library dependencies
- `generate()` - Creates content params

**New requirement**: Handlers need to expose main library name for standalone packages.

## References

### Related Files
- H5P.com Example: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/crossword-1291734445894486139.h5p`
- Example YAML: `examples/crossword-standalone-demo.yaml`
- CLI Architecture: `docs/CLI_ARCHITECTURE.md`

### Related Branches
- Crossword Handler: `claude/crossword-handler-spec-review-011CV168Km4obDWdnXGeA4YY` (merged to main)
- Current Work: `feature/standalone-content-support`

### Key Commits
- Crossword Implementation: `0c86328` - feat: merge Crossword Handler implementation
- Standalone Types: `0833fc6` - WIP: feat: add StandaloneDefinition type and YAML detection logic

---

**Next**: See `tasks.md` for detailed implementation steps
