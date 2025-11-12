# Standalone Content Support - Implementation Tasks

**Branch**: `feature/standalone-content-support`
**Spec**: See `SPEC.md`
**Status**: Phase 1 Complete, Phase 2 In Progress

## ✅ Phase 1: YAML Parsing & Type System (COMPLETED)

### Task 1.1: Add StandaloneDefinition Type ✅
**File**: `src/compiler/YamlInputParser.ts`
**Status**: COMPLETED
**Commit**: `0833fc6`

**Changes Made**:
- Added `StandaloneDefinition` interface (lines 319-346)
- Added `H5PDefinition` union type (line 351)
- Added type guards: `isStandaloneDefinition()`, `isBookDefinition()` (lines 356-365)

### Task 1.2: Update YAML Parser Detection Logic ✅
**File**: `src/compiler/YamlInputParser.ts`
**Status**: COMPLETED
**Commit**: `0833fc6`

**Changes Made**:
- Updated `parseYamlString()` to detect chapters vs content (lines 425-450)
- Added `validateAndBuildStandaloneDefinition()` method (lines 512-531)
- Added `validateStandaloneContentItem()` helper (lines 537-559)
- Refactored `resolveContentPaths()` to handle both formats (lines 798-820)
- Added `resolveItemPaths()` helper (lines 827-866)

### Task 1.3: Update CLI Module ✅
**File**: `src/modules/ai/interactive-book-ai-module.ts`
**Status**: COMPLETED
**Commit**: `0833fc6`

**Changes Made**:
- Changed `bookDef` to `definition` (H5PDefinition type)
- Added conditional logging based on content type (lines 157-163)
- Updated success message to show standalone vs book (lines 197-201)

---

## 🚧 Phase 2: Compilation Pipeline (IN PROGRESS)

### Task 2.1: Update H5pCompiler for Standalone Content
**File**: `src/compiler/H5pCompiler.ts`
**Priority**: HIGH
**Estimated Lines**: ~150
**Status**: NOT STARTED

**Current Issue**:
```typescript
// Line 68-71: Currently only accepts BookDefinition
public async compile(
  bookDef: BookDefinition,  // ❌ Needs to be H5PDefinition
  options: CompilerOptions = {}
): Promise<Buffer>
```

**Required Changes**:

1. **Update compile() signature**:
```typescript
// Line 68
public async compile(
  definition: H5PDefinition,  // ✅ Accept both types
  options: CompilerOptions = {}
): Promise<Buffer> {
  // Detect format and route to appropriate method
  if (isStandaloneDefinition(definition)) {
    return this.compileStandalone(definition, options);
  }
  return this.compileBook(definition, options);
}
```

2. **Rename existing logic** to `compileBook()`:
```typescript
// Move lines 72-213 into new method
private async compileBook(
  bookDef: BookDefinition,
  options: CompilerOptions
): Promise<Buffer> {
  // All existing Interactive Book compilation logic
  // No changes to the actual logic, just wrapped in new method
}
```

3. **Add new compileStandalone() method**:
```typescript
private async compileStandalone(
  standaloneDef: StandaloneDefinition,
  options: CompilerOptions
): Promise<Buffer> {
  const { verbose = false, basePath = process.cwd() } = options;

  // Step 1: Get required library for this content type
  const contentType = standaloneDef.content.type;
  const mainLibrary = this.getMainLibraryForContentType(contentType);
  const requiredLibraries = [mainLibrary];

  if (verbose) {
    console.log(`Standalone ${contentType} → ${mainLibrary}`);
  }

  // Step 2: Fetch library and dependencies
  for (const lib of requiredLibraries) {
    await this.libraryRegistry.fetchLibrary(lib);
  }

  const allDeps = new Map<string, any>();
  for (const lib of requiredLibraries) {
    const deps = await this.libraryRegistry.resolveDependencies(lib);
    deps.forEach(dep => {
      const key = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`;
      allDeps.set(key, dep);
    });
  }
  const dependencies = Array.from(allDeps.values());

  // Step 3: Build content with handler
  const handler = this.handlerRegistry.getHandler(contentType);
  if (!handler) {
    throw new Error(`No handler registered for content type: ${contentType}`);
  }

  // Create context (no chapter context for standalone)
  const context = {
    libraryRegistry: this.libraryRegistry,
    quizGenerator: this.quizGenerator,
    aiPromptBuilder: this.aiPromptBuilder,
    logger: { log: console.log, warn: console.warn, error: console.error },
    mediaFiles: [],
    basePath,
    options: { verbose, aiProvider: options.aiProvider },
    bookConfig: standaloneDef.aiConfig  // Use standalone aiConfig
  };

  // Generate content params
  const contentParams = await handler.generate(standaloneDef.content, context);

  // Step 4: Assemble standalone package
  const assembler = new PackageAssembler();
  const packageZip = await assembler.assembleStandalone(
    contentParams,
    mainLibrary,
    dependencies,
    context.mediaFiles,
    standaloneDef.title,
    standaloneDef.language || "en",
    this.libraryRegistry
  );

  // Generate Buffer
  return await packageZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });
}
```

4. **Add helper method**:
```typescript
private getMainLibraryForContentType(contentType: ContentType): string {
  // Map content types to H5P library names
  const libraryMap: Record<string, string> = {
    "crossword": "H5P.Crossword",
    "ai-crossword": "H5P.Crossword",
    "essay": "H5P.Essay",
    "ai-essay": "H5P.Essay",
    "blanks": "H5P.Blanks",
    "fill-in-the-blanks": "H5P.Blanks",
    "ai-blanks": "H5P.Blanks",
    "ai-fill-in-the-blanks": "H5P.Blanks",
    "dragtext": "H5P.DragText",
    "drag-the-words": "H5P.DragText",
    "ai-dragtext": "H5P.DragText",
    "ai-drag-the-words": "H5P.DragText",
    "truefalse": "H5P.TrueFalse",
    "true-false": "H5P.TrueFalse",
    "ai-truefalse": "H5P.TrueFalse",
    "ai-true-false": "H5P.TrueFalse",
    "singlechoiceset": "H5P.SingleChoiceSet",
    "single-choice-set": "H5P.SingleChoiceSet",
    "ai-singlechoiceset": "H5P.SingleChoiceSet",
    "ai-single-choice-set": "H5P.SingleChoiceSet",
    "dialogcards": "H5P.DialogCards",
    "flashcards": "H5P.Flashcards"
  };

  const library = libraryMap[contentType];
  if (!library) {
    throw new Error(`Unknown content type for standalone generation: ${contentType}`);
  }
  return library;
}
```

5. **Add imports**:
```typescript
// Line 10: Add type guard imports
import { BookDefinition, AnyContentItem, H5PDefinition, isStandaloneDefinition, StandaloneDefinition } from "./YamlInputParser";
```

**Testing**:
- Verify TypeScript compilation passes
- Test with standalone crossword YAML
- Verify error handling for unsupported types

---

### Task 2.2: Update PackageAssembler for Standalone
**File**: `src/compiler/PackageAssembler.ts`
**Priority**: HIGH
**Estimated Lines**: ~100
**Status**: NOT STARTED

**Required Changes**:

1. **Add assembleStandalone() method**:
```typescript
/**
 * Assembles a standalone H5P package (not Interactive Book).
 *
 * @param contentParams Content parameters from handler
 * @param mainLibrary Main library name (e.g., "H5P.Crossword")
 * @param dependencies All library dependencies
 * @param mediaFiles Media files to include
 * @param title Package title
 * @param language Package language
 * @param libraryRegistry Library registry for fetching libraries
 * @returns JSZip package ready for generation
 */
public async assembleStandalone(
  contentParams: any,
  mainLibrary: string,
  dependencies: any[],
  mediaFiles: Array<{ path: string; buffer: Buffer }>,
  title: string,
  language: string,
  libraryRegistry: LibraryRegistry
): Promise<JSZip> {
  const zip = new JSZip();

  // 1. Create h5p.json (different from Interactive Book)
  const [libraryName, version] = mainLibrary.split(" ");
  const [major, minor] = version.split(".");

  const h5pJson = {
    title,
    language,
    mainLibrary: libraryName,
    embedTypes: ["div"],
    license: "U",
    defaultLanguage: language,
    preloadedDependencies: dependencies.map(dep => ({
      machineName: dep.machineName,
      majorVersion: dep.majorVersion,
      minorVersion: dep.minorVersion
    }))
  };

  zip.file("h5p.json", JSON.stringify(h5pJson, null, 2));

  // 2. Create content/content.json (direct content params, no chapters)
  zip.file("content/content.json", JSON.stringify(contentParams, null, 2));

  // 3. Add media files
  for (const mediaFile of mediaFiles) {
    zip.file(`content/${mediaFile.path}`, mediaFile.buffer);
  }

  // 4. Add library files (same as Interactive Book)
  for (const dep of dependencies) {
    const libraryPath = libraryRegistry.getLibraryPath(
      `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`
    );

    // Copy library directory contents
    await this.addLibraryToZip(zip, libraryPath, dep);
  }

  return zip;
}
```

2. **Extract shared logic** (optional refactoring):
```typescript
// Helper to add library files (used by both assemble() and assembleStandalone())
private async addLibraryToZip(
  zip: JSZip,
  libraryPath: string,
  dependency: any
): Promise<void> {
  // Shared library file copying logic
}
```

**Testing**:
- Verify h5p.json has correct mainLibrary
- Verify content.json is direct params (not wrapped in chapters)
- Test media file inclusion

---

### Task 2.3: Update ContentBuilder (Optional)
**File**: `src/compiler/ContentBuilder.ts`
**Priority**: MEDIUM
**Estimated Lines**: ~30
**Status**: NOT STARTED
**Note**: This may not be needed if we bypass ContentBuilder for standalone content

**Analysis Needed**:
- Current H5pCompiler uses ContentBuilder for Interactive Books
- For standalone, we might not need ContentBuilder at all
- Decision: Skip ContentBuilder for standalone, use handler directly

**Result**: NO CHANGES NEEDED (bypassed in compileStandalone())

---

### Task 2.4: Update HandlerRegistry (Optional)
**File**: `src/handlers/HandlerRegistry.ts`
**Priority**: LOW
**Estimated Lines**: ~20
**Status**: NOT STARTED

**Potential Addition** (if needed):
```typescript
/**
 * Get required libraries for a standalone content definition
 */
public getRequiredLibrariesForStandalone(
  standaloneDef: StandaloneDefinition
): string[] {
  const handler = this.getHandler(standaloneDef.content.type);
  if (!handler) {
    throw new Error(`No handler for type: ${standaloneDef.content.type}`);
  }
  return handler.getRequiredLibraries();
}
```

**Decision**: May not be needed - H5pCompiler can call handler directly.

---

## 📋 Phase 3: Testing (PENDING)

### Task 3.1: Unit Tests for YamlInputParser
**File**: `tests/unit/YamlInputParser-standalone.test.ts` (new)
**Priority**: HIGH
**Estimated Lines**: ~200
**Status**: NOT STARTED

**Test Cases**:
1. ✅ Parse standalone crossword YAML
2. ✅ Parse standalone essay YAML
3. ✅ Detect standalone vs book correctly
4. ✅ Error on both `chapters` and `content`
5. ✅ Error on neither `chapters` nor `content`
6. ✅ Validate standalone content item
7. ✅ Resolve file paths in standalone content
8. ✅ Type guards work correctly

### Task 3.2: Integration Tests for Standalone Compilation
**File**: `tests/integration/standalone-content.test.ts` (new)
**Priority**: HIGH
**Estimated Lines**: ~300
**Status**: NOT STARTED

**Test Cases**:
1. ✅ Compile standalone crossword to Buffer
2. ✅ Verify h5p.json has correct mainLibrary
3. ✅ Verify content.json structure
4. ✅ Verify package contains all dependencies
5. ✅ Test with AI-generated standalone content
6. ✅ Test media file inclusion
7. ✅ Error handling for unsupported types

### Task 3.3: End-to-End Crossword Test
**File**: `tests/integration/crossword-standalone.test.ts` (new)
**Priority**: HIGH
**Estimated Lines**: ~150
**Status**: NOT STARTED

**Test Cases**:
1. ✅ Generate standalone crossword from YAML
2. ✅ Verify package structure matches H5P.com example
3. ✅ Extract and compare content.json
4. ✅ Verify all required libraries present
5. ✅ Test with crossword-standalone-demo.yaml

### Task 3.4: Verify All Existing Tests Pass
**Status**: NOT STARTED

**Command**: `npm test`

**Expected Result**: All 266+ tests should still pass (no regressions)

---

## 📝 Phase 4: Documentation (PENDING)

### Task 4.1: User Guide for Standalone Content
**File**: `docs/STANDALONE_CONTENT.md` (new)
**Priority**: HIGH
**Estimated Lines**: ~200
**Status**: NOT STARTED

**Sections**:
1. What is standalone content?
2. When to use standalone vs Interactive Book
3. YAML format reference
4. Examples for each content type
5. Troubleshooting

### Task 4.2: Update README
**File**: `README.md`
**Priority**: MEDIUM
**Status**: NOT STARTED

**Changes**:
- Add standalone content section
- Add YAML format comparison table
- Update command examples
- Link to STANDALONE_CONTENT.md

### Task 4.3: Update CHANGELOG
**File**: `CHANGELOG.md`
**Priority**: MEDIUM
**Status**: NOT STARTED

**Entry**:
```markdown
## [Unreleased]

### Added
- Standalone content support: Generate H5P packages without Interactive Book wrapper
- New YAML format with `content` field for standalone content
- Support for standalone H5P.Crossword packages
- Auto-detection of YAML format (chapters vs content)
- Type guards: isStandaloneDefinition(), isBookDefinition()

### Fixed
- H5P.Crossword now works on H5P.com as standalone package
```

---

## 🧪 Phase 5: Validation & Deployment (PENDING)

### Task 5.1: Manual Testing Checklist
**Priority**: HIGH
**Status**: NOT STARTED

**Steps**:
1. [ ] Build: `npm run build`
2. [ ] Generate standalone crossword: `node dist/index.js interactivebook-ai examples/crossword-standalone-demo.yaml test-output.h5p --verbose`
3. [ ] Verify package created
4. [ ] Upload to H5P.com
5. [ ] Verify crossword renders correctly
6. [ ] Test with AI-generated crossword
7. [ ] Test with other standalone types (essay, blanks)

### Task 5.2: Update Example Files
**Priority**: MEDIUM
**Status**: NOT STARTED

**Files to Update**:
- `examples/crossword-standalone-demo.yaml` - Ensure works with new implementation
- Create `examples/yaml/essay-standalone-example.yaml`
- Create `examples/yaml/blanks-standalone-example.yaml`

### Task 5.3: Create Pull Request
**Priority**: HIGH
**Status**: NOT STARTED

**Checklist**:
- [ ] All tasks completed
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Manual testing complete
- [ ] Clean commit history
- [ ] Descriptive PR description

**PR Template**:
```markdown
## Summary
Adds standalone content support to enable generating H5P packages without Interactive Book wrapper.

## Motivation
H5P.Crossword (and potentially other content types) cannot be embedded in Interactive Books. This PR enables generating them as standalone packages.

## Changes
- Added StandaloneDefinition type and detection logic
- Updated H5pCompiler to handle standalone compilation
- Added PackageAssembler.assembleStandalone() method
- Added comprehensive tests
- Added user documentation

## Testing
- [x] All existing tests pass
- [x] New unit tests for standalone parsing
- [x] Integration tests for standalone compilation
- [x] Manual testing on H5P.com

## Breaking Changes
None - fully backward compatible

## Screenshots
[Add screenshot of crossword working on H5P.com]
```

---

## 🎯 Implementation Strategy

### Recommended Order
1. **Task 2.1** (H5pCompiler) - Critical path
2. **Task 2.2** (PackageAssembler) - Depends on 2.1
3. **Task 3.4** (Run tests) - Verify no regressions
4. **Task 3.3** (E2E test) - Verify crossword works
5. **Task 5.1** (Manual test) - Verify on H5P.com
6. **Task 3.1, 3.2** (Unit/integration tests) - Fill in test coverage
7. **Task 4.1-4.3** (Documentation) - Complete docs
8. **Task 5.2** (Examples) - Polish
9. **Task 5.3** (PR) - Deploy

### Estimated Timeline
- **Phase 2** (Compilation): 2-3 hours
- **Phase 3** (Testing): 2 hours
- **Phase 4** (Documentation): 1 hour
- **Phase 5** (Validation): 1 hour
- **Total**: 6-7 hours

### Key Decision Points
1. **ContentBuilder**: Confirmed - bypass for standalone ✅
2. **HandlerRegistry**: Tentative - may not need changes ⏸️
3. **Library mapping**: Hardcoded in H5pCompiler ✅

---

## 📚 Reference Implementation

### H5P.com Standalone Crossword
Location: `/Users/benjaminwaller/Projects/H5P-LMS/h5p-cli-creator/crossword-1291734445894486139.h5p`

**Extracted h5p.json**:
```json
{
  "title": "Foundation Skills Crossword",
  "language": "en",
  "mainLibrary": "H5P.Crossword",
  "embedTypes": ["div"],
  "license": "U",
  "defaultLanguage": "en",
  "preloadedDependencies": [
    {"machineName": "H5P.AdvancedText", "majorVersion": 1, "minorVersion": 1},
    {"machineName": "H5P.Crossword", "majorVersion": 0, "minorVersion": 5}
  ]
}
```

**Target**: Our implementation should produce identical structure.

---

## ✅ Completion Criteria

### Definition of Done
- [ ] All Phase 2 tasks complete
- [ ] All tests passing (existing + new)
- [ ] Crossword renders on H5P.com
- [ ] Documentation complete
- [ ] PR approved and merged

### Success Metrics
- TypeScript compilation: 0 errors
- Test coverage: >90% for new code
- H5P.com validation: Package uploads successfully
- Crossword functionality: Fully interactive on H5P.com

---

**Last Updated**: 2025-11-12
**Next Steps**: Begin Task 2.1 (Update H5pCompiler)
