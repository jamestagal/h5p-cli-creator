# Phase 0: Minimal Housekeeping Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. The execution workflow is described below and needs no external tooling.

**Goal:** Put `main` back into a state that builds, passes its test suite, and has modern tooling, so phase 1 starts from solid ground.

**Architecture:** No design changes. Fast-forward `main` to the finished QuestionSet branch, repair the 23 failing tests (five distinct causes), remove committed junk, and modernise `tsconfig`, lint and dependencies. Strict mode is introduced as a second, growing `tsconfig.strict.json` so the build never breaks while files are migrated.

**Tech Stack:** Node 20, TypeScript 5, Jest 30 + ts-jest, ESLint 9 flat config with typescript-eslint, pnpm (from phase 1; npm is fine here).

**Spec:** `docs/superpowers/specs/2026-09-18-generator-service-design.md` §11 phase 0, and `docs/reviews/2026-09-18-codebase-review.md` §1, §6.

## Global Constraints

- Node `>=20.19.0` (matches the ClassroomIO toolchain on this machine; `~/.nvm/versions/node/v20.20.1` is installed).
- No behaviour changes to generation or compilation in this phase. Tests are fixed by correcting stale expectations or adding thin compatibility methods, never by deleting assertions.
- Every task ends with `npm run build` exit 0. Through Task 8 the suite may still carry baseline failures, but no task may add one; from Task 9 on `npx jest` must report 0 failed suites.
- Conventional Commits. Attribution reflects who actually wrote the change: a commit authored by a Claude agent ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; a commit written by a person carries no such trailer. The commit commands below show the trailer because the plan is written for agent execution; delete it when a person executes the task.
- Do not push and do not delete remote branches without the repository owner's explicit go-ahead (Task 1 step 6).
- **Exit codes:** every command that pipes into `tail` or `grep` runs with `set -o pipefail` in effect (run `set -o pipefail` once at the start of each shell session; zsh and bash both honour it). A "passes" claim is only valid when the command's exit status was 0.

## Execution workflow

The plan is self-contained. Execute tasks in order; each task ends with a commit. For each task: run the failing test first where one is given, implement, run the named verification command and confirm its exit status, then commit. The suite carries 23 baseline failures until they are repaired task by task, so the gate is: **through Task 8, a task may not introduce any new failure and must make the suites it names pass; from Task 9 onward the whole suite must be green** before the next task starts. Sequential execution by one agent or person per task, with a review of the diff and the verification output between tasks, is the intended mode.

Repository: `/Users/benjaminjameswaller/Projects/personal/h5p-cli-creator`. All paths below are relative to it.

---

### Task 1: Fast-forward `main` to the QuestionSet branch

**Files:**
- No source edits. Git only.

**Interfaces:**
- Produces: `main` at commit `3cf6f9a`, which builds with zero TypeScript errors.

- [ ] **Step 1: Confirm the working tree is clean and the branch fast-forwards**

Run:
```bash
git status --short
git merge-base --is-ancestor main origin/claude/review-questionset-spec-014JfduBP4E3A5pHAodfVNrt && echo FAST_FORWARD_OK
```
Expected: no output from `git status --short` (except untracked `docs/reviews/` and `docs/superpowers/`), then `FAST_FORWARD_OK`.

- [ ] **Step 2: Fast-forward**

Run:
```bash
git checkout main
git merge --ff-only origin/claude/review-questionset-spec-014JfduBP4E3A5pHAodfVNrt
git log -1 --format='%h %s'
```
Expected: `3cf6f9a fix(questionset): extract params from handler array format correctly`.

- [ ] **Step 3: Install and build**

Run:
```bash
npm install --no-audit --no-fund
npm run build
echo "exit=$?"
```
Expected: `exit=0` and no `error TS` lines.

- [ ] **Step 4: Record the baseline test result**

Run:
```bash
npx jest 2>&1 | tail -6
```
Expected: `Test Suites: 18 failed, 50 passed, 68 total` and `Tests: 23 failed, 13 skipped, 674 passed, 710 total`. If the numbers differ, stop and report them before continuing.

- [ ] **Step 5: Commit the review and spec documents that already exist untracked**

Run:
```bash
git add docs/reviews/2026-09-18-codebase-review.md docs/superpowers/specs/2026-09-18-generator-service-design.md docs/superpowers/plans/
git commit -m "docs: add codebase review, generator service design and phase plans

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ask before touching remotes**

Report to the repository owner: "`main` is fast-forwarded locally to `3cf6f9a`. The eleven `origin/claude/*` branches and `origin/feature/handler-enhanced-compiler` are all ancestors of `main` or superseded. Shall I push `main` and delete those remote branches?" Do not push or delete until told to.

If told yes, run:
```bash
git push origin main
for b in $(git branch -r --merged main | grep 'origin/claude/\|origin/feature/' | sed 's#origin/##'); do git push origin --delete "$b"; done
```

---

### Task 2: Remove committed junk and stop tracking caches

**Files:**
- Delete: `src/compiler/ChapterBuilder.ts.bak`, `src/compiler/ContentBuilder.ts.bak`, `src/modules/ai/interactive-book-ai-module.ts.bak`, `src/modules/ai/interactive-book-ai-module.ts.bak2`, `src/modules/ai/interactive-book-ai-module.ts.backup`, `tests/unit/AIConfiguration.test.ts.bak`, `tests/unit/AccordionHandler.test.ts.bak`, `tests/integration/backward-compatibility.test.ts.bak`, `tests/integration/handler-content-processing.test.ts.bak`, `tests/integration/truefalse-type-integration.test.ts.bak`, `tests/integration/yaml-ai-config.test.ts.bak`, every `agent-os/specs/**/tasks.md.bak`, `docs/user-guides/youtube-story-extraction.md.backup`
- Delete: `src/ai/QuizGenerator.retry-tests.ts` (prose with `console.log`, compiled into `dist/`; the real tests are `tests/ai/QuizGenerator.retry.test.ts`)
- Delete: `test-gemini.ts`, `test-custom-images.yaml`, `Gemini2.5Pro-transciption.md`
- Modify: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: a tree with no `.bak`/`.backup` files, `.youtube-cache/` untracked, `.env.example` documenting the three keys.

- [ ] **Step 1: List what will be deleted and confirm nothing else matches**

Run:
```bash
git ls-files | grep -E '\.(bak|bak2|backup)$'
git ls-files .youtube-cache | wc -l
```
Expected: exactly the files listed above (15 lines), and `65`.

- [ ] **Step 2: Delete the files**

Run:
```bash
git rm -q $(git ls-files | grep -E '\.(bak|bak2|backup)$')
git rm -q src/ai/QuizGenerator.retry-tests.ts test-gemini.ts test-custom-images.yaml Gemini2.5Pro-transciption.md
git rm -r -q --cached .youtube-cache
```

- [ ] **Step 3: Update `.gitignore`**

Append to `.gitignore`:
```gitignore

# Runtime caches (never committed)
.youtube-cache/

# Editor and OS
.DS_Store

# Backups and scratch
*.bak
*.bak2
*.backup
```

- [ ] **Step 4: Create `.env.example`**

Create `.env.example`:
```dotenv
# Content generation. At least one of the two is required for the ai-* content types.
# When both are set, GOOGLE_API_KEY takes precedence (see src/ai/QuizGenerator.ts).
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Whisper transcription and story translation (youtube-extract commands only).
OPENAI_API_KEY=
```

- [ ] **Step 5: Verify build and tests are unchanged**

Run:
```bash
npm run build && npx jest 2>&1 | tail -4
```
Expected: build exit 0; `Test Suites: 18 failed, 50 passed, 68 total`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove backup files and scratch scripts, stop tracking youtube cache, add .env.example

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Fix tests that import the renamed `QuizHandler`

Commit `6ba2903` renamed `QuizHandler` to `MultiChoiceHandler` (file `src/handlers/ai/MultiChoiceHandler.ts`, class `MultiChoiceHandler`, content type `ai-quiz`). Four test files still import the old path.

**Files:**
- Modify: `tests/unit/QuizHandler.test.ts`, `tests/unit/handler-integration.test.ts`, `tests/integration/library-resolution.test.ts`, `tests/integration/validation-error-reporting.test.ts`

**Interfaces:**
- Consumes: `export class MultiChoiceHandler implements ContentHandler` from `src/handlers/ai/MultiChoiceHandler.ts`.

- [ ] **Step 1: See the failure**

Run: `npx jest tests/unit/QuizHandler.test.ts 2>&1 | grep TS2307`
Expected: `Cannot find module '../../src/handlers/ai/QuizHandler'`.

- [ ] **Step 2: Rewrite the imports and class references in all four files**

Run:
```bash
for f in tests/unit/QuizHandler.test.ts tests/unit/handler-integration.test.ts tests/integration/library-resolution.test.ts tests/integration/validation-error-reporting.test.ts; do
  sed -i '' -e 's#handlers/ai/QuizHandler#handlers/ai/MultiChoiceHandler#g' -e 's/\bQuizHandler\b/MultiChoiceHandler/g' "$f"
done
git mv tests/unit/QuizHandler.test.ts tests/unit/MultiChoiceHandler.test.ts
grep -rn "QuizHandler" tests/ src/ || echo "no references left"
```
Expected: `no references left`.

- [ ] **Step 3: Run the four suites**

Run: `npx jest tests/unit/MultiChoiceHandler.test.ts tests/unit/handler-integration.test.ts tests/integration/library-resolution.test.ts tests/integration/validation-error-reporting.test.ts 2>&1 | tail -5`
Expected: `Test Suites: 4 passed`. If `handler-integration` or `validation-error-reporting` still fail, their remaining failures are the `escapeHtml` argument (Task 4) and are fixed there.

- [ ] **Step 4: Commit**

```bash
git add -A tests/
git commit -m "test: follow QuizHandler rename to MultiChoiceHandler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Fix expectations for `addTextPage`'s third argument

`TextHandler.process` calls `chapterBuilder.addTextPage(title, text, escapeHtml)` (`src/handlers/core/TextHandler.ts:38`); `ChapterBuilder.addTextPage(title, text, escapeHtml = true)` (`src/compiler/ChapterBuilder.ts:113`). Two test files assert the two-argument call.

**Files:**
- Modify: `tests/handlers/core/TextHandler.test.ts:48-51,62-65`, `tests/integration/handler-content-processing.test.ts` (the two `toHaveBeenCalledWith` assertions on `addTextPage`)

- [ ] **Step 1: See the failure**

Run: `npx jest tests/handlers/core/TextHandler.test.ts 2>&1 | grep -A2 "Expected:"`
Expected: `Received: "Test Page", "This is test content", true`.

- [ ] **Step 2: Add the third argument to every `addTextPage` expectation**

In `tests/handlers/core/TextHandler.test.ts` change:
```ts
      expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
        "Test Page",
        "This is test content"
      );
```
to:
```ts
      expect(mockChapterBuilder.addTextPage).toHaveBeenCalledWith(
        "Test Page",
        "This is test content",
        true
      );
```
and likewise `("", "Content without title")` → `("", "Content without title", true)`. In `tests/integration/handler-content-processing.test.ts` change `("Intro", "Hello world")` → `("Intro", "Hello world", true)` and `("Test Title", "Test content")` → `("Test Title", "Test content", true)`.

- [ ] **Step 3: Run**

Run: `npx jest tests/handlers/core/TextHandler.test.ts tests/integration/handler-content-processing.test.ts 2>&1 | tail -4`
Expected: `Test Suites: 2 passed`.

- [ ] **Step 4: Commit**

```bash
git add tests/handlers/core/TextHandler.test.ts tests/integration/handler-content-processing.test.ts
git commit -m "test: expect escapeHtml argument on addTextPage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Restore the `YamlInputParser` string and file entry points

`YamlInputParser` now has only `static parse(filePath)` (`src/compiler/YamlInputParser.ts:378`). Six test files call `YamlInputParser.parseYamlString(yaml)`, `YamlInputParser.parseYamlFile(path)` and `new YamlInputParser().parseYamlFile(path)`. Add thin methods; keep `parse` as is.

**Files:**
- Modify: `src/compiler/YamlInputParser.ts:377-391`
- Test: `tests/compiler/YamlInputParser.test.ts` (existing), plus a new case below

**Interfaces:**
- Produces: `static parseYamlString(yamlText: string): BookDefinition`, `static parseYamlFile(filePath: string): Promise<BookDefinition>`, instance `parseYamlFile(filePath: string): Promise<BookDefinition>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/compiler/YamlInputParser.test.ts` inside the top-level `describe`:
```ts
  describe("entry points", () => {
    const yaml = `
title: "Entry Points"
language: "en"
chapters:
  - title: "One"
    content:
      - type: text
        text: "hello"
`;

    it("parseYamlString and parseYamlFile agree", async () => {
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yip-"));
      const file = path.join(dir, "book.yaml");
      fs.writeFileSync(file, yaml);

      const fromString = YamlInputParser.parseYamlString(yaml);
      const fromStaticFile = await YamlInputParser.parseYamlFile(file);
      const fromInstance = await new YamlInputParser().parseYamlFile(file);

      expect(fromString).toEqual(fromStaticFile);
      expect(fromString).toEqual(fromInstance);
      expect(fromString.title).toBe("Entry Points");
    });

    it("parseYamlString rejects a book without chapters", () => {
      expect(() => YamlInputParser.parseYamlString('title: "x"\n')).toThrow(/at least one chapter/);
    });
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest tests/compiler/YamlInputParser.test.ts 2>&1 | grep -c "parseYamlString' does not exist"`
Expected: a number greater than 0.

- [ ] **Step 3: Implement**

Replace the class at the end of `src/compiler/YamlInputParser.ts` with:
```ts
/**
 * Parses YAML input into a BookDefinition.
 */
export class YamlInputParser {
  static parse(filePath: string): BookDefinition {
    const fileContent = fsExtra.readFileSync(filePath, "utf-8");
    return YamlInputParser.parseYamlString(fileContent);
  }

  static parseYamlString(yamlText: string): BookDefinition {
    const parsed = yaml.load(yamlText) as BookDefinition;

    if (!parsed || !parsed.title) {
      throw new Error(`Missing required field: title`);
    }
    if (!parsed.chapters || parsed.chapters.length === 0) {
      throw new Error(`Book must have at least one chapter`);
    }

    return parsed;
  }

  static async parseYamlFile(filePath: string): Promise<BookDefinition> {
    const fileContent = await fsExtra.readFile(filePath, "utf-8");
    return YamlInputParser.parseYamlString(fileContent);
  }

  parseYamlFile(filePath: string): Promise<BookDefinition> {
    return YamlInputParser.parseYamlFile(filePath);
  }
}
```

- [ ] **Step 4: Run the six suites**

Run: `npx jest tests/compiler/YamlInputParser.test.ts tests/compiler/YamlInputParser.essay.test.ts tests/integration/backward-compatibility.test.ts tests/integration/yaml-ai-config.test.ts tests/integration/truefalse-type-integration.test.ts tests/integration/multi-language-ai.test.ts 2>&1 | tail -4`
Expected: `Test Suites: 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/YamlInputParser.ts tests/compiler/YamlInputParser.test.ts
git commit -m "fix(yaml): restore parseYamlString and parseYamlFile entry points

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Point the AI Accordion tests at `AIAccordionHandler`

`tests/unit/AccordionHandler.test.ts` has `describe("validate - AI Accordion")` and `describe("process - AI Accordion")` blocks that exercise `ai-accordion` items against `AccordionHandler` (manual). The AI variant lives in `src/handlers/ai/AIAccordionHandler.ts` (`getContentType() === "ai-accordion"`). The manual handler correctly rejects `ai-accordion` input; the tests are aimed at the wrong class.

**Files:**
- Modify: `tests/unit/AccordionHandler.test.ts`

- [ ] **Step 1: Locate the two blocks**

Run: `grep -n "describe(\|new AccordionHandler\|new AIAccordionHandler\|import" tests/unit/AccordionHandler.test.ts | head -20`
Expected: an import of `AccordionHandler` only, and two `describe` titles containing "AI Accordion".

- [ ] **Step 2: Use the AI handler in those blocks**

Add the import at the top of the file:
```ts
import { AIAccordionHandler } from "../../src/handlers/ai/AIAccordionHandler";
```
Inside `describe("validate - AI Accordion", ...)` and `describe("process - AI Accordion", ...)`, add at the start of each block:
```ts
    let aiHandler: AIAccordionHandler;
    beforeEach(() => {
      aiHandler = new AIAccordionHandler();
    });
```
and change every `handler.validate(` / `handler.process(` inside those two blocks to `aiHandler.validate(` / `aiHandler.process(`. Leave the manual blocks untouched.

- [ ] **Step 3: Run**

Run: `npx jest tests/unit/AccordionHandler.test.ts 2>&1 | tail -4`
Expected: `Test Suites: 1 passed`. If a `process - AI Accordion` case still fails on a mock expectation, read the received call in the output and align the mock to `AIAccordionHandler`'s actual `quizGenerator.generateRawContent` usage (it calls `context.quizGenerator.generateRawContent(systemPrompt, userPrompt)` once per item).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/AccordionHandler.test.ts
git commit -m "test: exercise ai-accordion cases against AIAccordionHandler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Update stale expectations in the YouTube story suites

Three suites assert behaviour that changed deliberately in Nov 2025 commits and were never updated.

**Files:**
- Modify: `tests/unit/InteractiveBookYamlGenerator.test.ts`, `tests/unit/StoryTranslator.test.ts`, `tests/unit/YouTubeExtractor.test.ts`

- [ ] **Step 1: `StoryTranslator` model name**

The code calls OpenAI with `model: "gpt-4o-mini"` (`src/services/StoryTranslator.ts:210`). Run: `grep -n '"gpt-4"' tests/unit/StoryTranslator.test.ts`, and change the expected `model: "gpt-4"` to `model: "gpt-4o-mini"`.

- [ ] **Step 2: `YouTubeExtractor` Whisper call arity**

The extractor now passes a fourth argument (`undefined` when no options are given). Run: `grep -n 'toHaveBeenCalledWith(' tests/unit/YouTubeExtractor.test.ts | head`, find the assertion with `"/cache/Y8M9RJ_4C7E/audio.mp3", "vi", "Y8M9RJ_4C7E"` and append `, undefined` as a fourth argument.

- [ ] **Step 3: `InteractiveBookYamlGenerator` output shape**

Commit `20c7838` (add VideoHandler for proper YouTube video embedding in Interactive Books) changed the generator: story pages now carry a fourth item, an `accordion` with the English translation, and the intro page changed. Run:
```bash
npx jest tests/unit/InteractiveBookYamlGenerator.test.ts 2>&1 | grep -B2 -A12 "Received"
```
For each of the three failing cases, replace the expected value with the received value **after** confirming it is the behaviour `e12a86b` describes (open `src/services/InteractiveBookYamlGenerator.ts` and read `generateStoryPage` and `generateIntroPage`): the story page expectation becomes length 4 with the trailing `{ type: "accordion", panels: [{ title: "English Translation", content: <english> }] }`; the intro page expectation follows whatever `generateIntroPage` now returns for the YouTube embed (an `iframe` inside a `text` item or a `video` item; assert on the field the code sets).

- [ ] **Step 4: Run**

Run: `npx jest tests/unit/InteractiveBookYamlGenerator.test.ts tests/unit/StoryTranslator.test.ts tests/unit/YouTubeExtractor.test.ts 2>&1 | tail -4`
Expected: `Test Suites: 3 passed`.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/InteractiveBookYamlGenerator.test.ts tests/unit/StoryTranslator.test.ts tests/unit/YouTubeExtractor.test.ts
git commit -m "test: align story-pipeline expectations with current behaviour

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Resolve the segment-matching failures with an explicit, partition-level ownership rule

Five tests fail around transcript segment matching: three in `tests/unit/TranscriptMatcher.test.ts` (`findSegmentsInRange` boundary cases), one in `tests/unit/SegmentMatcher.test.ts` (repetition drills) and one in `tests/integration/text-based-page-breaks.test.ts` (same scenario). `findSegmentsInRange` (`src/services/TranscriptMatcher.ts:58-82`) decides page membership one range at a time with a ">50% of duration" test; commit `f2badf5` ("prevent duplicate text across page boundaries") introduced it. The invariant the feature needs is **every segment belongs to exactly one page**, and no single-range function can guarantee that: a segment spanning three pages of equal overlap has no page over 50%, and a zero-length segment on a boundary overlaps nothing. Ownership is a property of the whole page partition, so this task adds a partition-level assignment, uses it at the one call site, and turns `findSegmentsInRange` into what it can honestly be: an overlap filter.

**Ownership rule.** Given the ordered, non-overlapping pages of a story: a segment with positive duration is owned by the page with the **maximum overlap**; ties go to the **earliest** such page. A zero-length segment is owned by the page whose `[startTime, endTime)` contains its start; a zero-length segment sitting exactly on the final page's end belongs to that final page. A segment that overlaps no page is dropped (it lies outside the story's time range).

**Files:**
- Modify: `src/services/TranscriptMatcher.ts` (add `assignSegmentsToPages`, redefine `findSegmentsInRange`, change the call at `:166`), `tests/unit/TranscriptMatcher.test.ts`, and whichever of `tests/unit/SegmentMatcher.test.ts`, `src/services/transcription/SegmentMatcher.ts`, `tests/integration/text-based-page-breaks.test.ts` step 5 selects.

- [ ] **Step 1: Write the partition test first**

Append to `tests/unit/TranscriptMatcher.test.ts` a new top-level `describe`:
```ts
  describe("assignSegmentsToPages", () => {
    const pages = [
      { startTime: 0, endTime: 10 },
      { startTime: 10, endTime: 20 },
      { startTime: 20, endTime: 30 }
    ];
    const segs = [
      { startTime: 0, endTime: 4, text: "a" },     // inside page 0
      { startTime: 9, endTime: 13, text: "b" },    // 1s in page 0, 3s in page 1 -> page 1
      { startTime: 5, endTime: 15, text: "c" },    // 5s/5s tie -> earliest page (0)
      { startTime: 8, endTime: 10, text: "d" },    // ends exactly on a boundary -> page 0
      { startTime: 16, endTime: 19, text: "e" },   // inside page 1
      { startTime: 0, endTime: 30, text: "f" },    // spans all three equally -> earliest page (0)
      { startTime: 20, endTime: 20, text: "g" },   // zero-length on a boundary -> page containing its start (2)
      { startTime: 30, endTime: 30, text: "h" },   // zero-length on the final end -> last page (2)
      { startTime: 40, endTime: 45, text: "z" }    // outside every page -> dropped
    ];

    it("assigns every in-range segment to exactly one page by maximum overlap with earliest-page ties", () => {
      const owned = matcher.assignSegmentsToPages(segs, pages).map((list) => list.map((s) => s.text));
      expect(owned).toEqual([["a", "c", "d", "f"], ["b", "e"], ["g", "h"]]);
      expect(owned.flat().sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    });

    it("returns one empty list per page when there are no segments", () => {
      expect(matcher.assignSegmentsToPages([], pages)).toEqual([[], [], []]);
    });
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest tests/unit/TranscriptMatcher.test.ts -t "assignSegmentsToPages"`. Expected: FAIL with `assignSegmentsToPages is not a function`.

- [ ] **Step 3: Implement the partition assignment and redefine the range filter**

Add to `TranscriptMatcher` (next to `findSegmentsInRange`):
```ts
  /**
   * Assigns every segment to exactly one page of the given ordered, non-overlapping partition.
   * Positive-duration segments go to the page with the maximum overlap (earliest page on ties);
   * zero-length segments go to the page containing their start (the final page if the start is
   * exactly the final end); segments overlapping no page are dropped.
   * Returns one list per page, index-aligned with `pages`.
   */
  public assignSegmentsToPages(
    transcript: TranscriptSegment[],
    pages: Array<{ startTime: number; endTime: number }>
  ): TranscriptSegment[][] {
    const owned: TranscriptSegment[][] = pages.map(() => []);
    if (pages.length === 0) {
      return owned;
    }
    const last = pages.length - 1;

    for (const segment of transcript) {
      let owner = -1;

      if (segment.endTime <= segment.startTime) {
        owner = pages.findIndex((p) => segment.startTime >= p.startTime && segment.startTime < p.endTime);
        if (owner === -1 && segment.startTime === pages[last].endTime) {
          owner = last;
        }
      } else {
        let bestOverlap = 0;
        for (let i = 0; i < pages.length; i++) {
          const overlap = Math.min(segment.endTime, pages[i].endTime) - Math.max(segment.startTime, pages[i].startTime);
          if (overlap > bestOverlap) { // strict: the earliest page keeps a tie
            bestOverlap = overlap;
            owner = i;
          }
        }
      }

      if (owner >= 0) {
        owned[owner].push(segment);
      }
    }

    return owned;
  }
```

Replace the body of `findSegmentsInRange` with an honest overlap filter (it no longer claims ownership):
```ts
  /**
   * Segments that overlap the range at all (a zero-length segment counts if its start is inside).
   * This does not decide page ownership; use assignSegmentsToPages for that.
   */
  public findSegmentsInRange(
    transcript: TranscriptSegment[],
    rangeStart: number,
    rangeEnd: number
  ): TranscriptSegment[] {
    return transcript.filter((segment) => {
      if (segment.endTime <= segment.startTime) {
        return segment.startTime >= rangeStart && segment.startTime < rangeEnd;
      }
      return Math.min(segment.endTime, rangeEnd) - Math.max(segment.startTime, rangeStart) > 0;
    });
  }
```

- [ ] **Step 4: Use the partition at the call site, then reconcile the three boundary tests**

At `src/services/TranscriptMatcher.ts:166` the page loop calls `this.findSegmentsInRange(transcript, page.startTime, page.endTime)`. Before that loop add `const owned = this.assignSegmentsToPages(transcript, pages);` (where `pages` is the array the loop iterates), and inside the loop replace the call with `owned[index]`, converting the loop to `pages.forEach((page, index) => { ... })` or `for (const [index, page] of pages.entries())` if it does not already expose an index. `transcriptSegments: segments` and `concatenateSegments(segments)` keep working unchanged.

Then run `sed -n 1,36p tests/unit/TranscriptMatcher.test.ts` and, for each of `(5, 15)`, `(15, 25)` and `(0, 15)`, compute from the fixture which segments the **overlap filter** returns (any positive overlap). Update `toHaveLength` and the `text` assertions to those values; rename those three tests to say "overlaps" rather than "include", since ownership is now tested in step 1. If a hand computation disagrees with what the code returns, the code is wrong; fix the code, not the expectation.

- [ ] **Step 5: `SegmentMatcher` repetition drills**

Run: `npx jest tests/unit/SegmentMatcher.test.ts -t "repetition drills" 2>&1 | grep -A6 "Expected"`. The test expects four consecutive `matchPageToSegments("Bonjour")` calls in `strict` mode to return successive identical segments. Open `matchPageToSegments` (`src/services/transcription/SegmentMatcher.ts:73`) and check whether a successful match advances `this.currentSegmentIndex` past the last matched segment. If it does not, add `this.currentSegmentIndex = lastMatchedIndex + 1;` where the match result is built (`lastMatchedIndex` being the index of the last segment included). If it does, the integration test in `text-based-page-breaks.test.ts` that expects `2` but receives `4` for the same scenario encodes the pre-fix behaviour and is updated to `4`; state which in the commit body.

- [ ] **Step 6: Run all three suites**

Run: `npx jest tests/unit/TranscriptMatcher.test.ts tests/unit/SegmentMatcher.test.ts tests/integration/text-based-page-breaks.test.ts; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 7: Commit, naming the outcome**

```bash
git add -A src/services tests/unit tests/integration
git commit -m "fix(transcript): assign segments to pages by maximum overlap over the whole partition

Rule: max overlap wins, earliest page on ties; zero-length segments follow their start;
findSegmentsInRange is now a plain overlap filter and no longer decides ownership.
<one line stating which branch of step 5 applied>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Full suite green and coverage floor

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Run everything**

Run: `npx jest > /tmp/jest-phase0.log 2>&1; echo "exit=$?"; tail -5 /tmp/jest-phase0.log`
Expected: `exit=0`, `Test Suites: 0 failed`, `Tests: 0 failed`. If any suite still fails, fix it under the rule in Global Constraints before continuing.

- [ ] **Step 2: Record current coverage and set a floor just below it**

Run: `npx jest --coverage 2>&1 | grep -A4 "All files"`. Note the four percentages (statements, branches, functions, lines). Add to `jest.config.js`, with each threshold 2 points below the measured value (rounded down to a whole number):
```js
  coverageThreshold: {
    global: {
      statements: <measured - 2>,
      branches: <measured - 2>,
      functions: <measured - 2>,
      lines: <measured - 2>,
    },
  },
```

- [ ] **Step 3: Confirm the threshold passes**

Run: `npx jest --coverage 2>&1 | tail -3`
Expected: no "coverage threshold" failure.

- [ ] **Step 4: Commit**

```bash
git add jest.config.js
git commit -m "test: add coverage floor at current levels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Modern `tsconfig` with a staged strict configuration

**Files:**
- Modify: `tsconfig.json`
- Create: `tsconfig.strict.json`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run build` (non-strict, whole `src/`), `npm run typecheck:strict` (strict, an explicit `include` list that grows over time).

- [ ] **Step 1: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["es2022"],
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "outDir": "./dist",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 2: Build and fix what `es2022` + `esModuleInterop` surface**

Run: `npm run build 2>&1 | grep -c "error TS"`. The likely errors are `import * as JSZip from "jszip"` style namespace imports of CommonJS default exports (`H5pCompiler.ts:12`, `LibraryRegistry.ts:3`, `PackageAssembler.ts`) which under `esModuleInterop` must become `import JSZip from "jszip"`, and `chalk` (ESM-only v5) imported from CommonJS. For jszip: change to default imports. For chalk: pin `"chalk": "^4.1.2"` in `package.json` (the last CommonJS release) and run `npm install`. Repeat until the count is 0.

- [ ] **Step 3: Confirm tests still pass with the new target**

Run: `npx jest 2>&1 | tail -4`
Expected: 0 failed. (ts-jest reads `tsconfig.json`.)

- [ ] **Step 4: Create `tsconfig.strict.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true
  },
  "include": [
    "src/ai/JSONValidator.ts",
    "src/ai/LanguageUtils.ts",
    "src/helpers.ts",
    "src/utils/timeRangeValidation.ts"
  ]
}
```
These four are leaves: none of them imports the compiler, the handlers or the AI SDK wrappers. (`ContentHandler.ts` was deliberately left out: it imports `HandlerContext`, which imports `ChapterBuilder`, `LibraryRegistry`, `QuizGenerator` and `AIPromptBuilder`, and TypeScript follows imports, so listing it would pull most of the codebase into the strict check.)

- [ ] **Step 5: Add scripts, confirm the strict graph is small, and make the listed files strict-clean**

In `package.json` `scripts` add:
```json
    "typecheck:strict": "tsc -p tsconfig.strict.json",
    "typecheck": "tsc --noEmit"
```
Run: `npx tsc -p tsconfig.strict.json --listFilesOnly | grep '/src/' | sort`. Expected: exactly the four listed files (type-only imports of `@types/*` do not count). If any other `src/` file appears, one of the four imports it; remove that file from `include` and note it in the commit body. Then run `npm run typecheck:strict` and fix each reported error in the remaining files (typically: `any` parameters get explicit types, possibly-undefined values get guards). Do not change behaviour.

- [ ] **Step 6: Document the migration rule**

Append to `CONTRIBUTING.md`:
```markdown

## Strict TypeScript migration

`tsconfig.strict.json` lists the files that compile under `strict: true`. TypeScript follows
imports, so a file can only join the list once everything it imports is already strict-clean; check
with `npx tsc -p tsconfig.strict.json --listFilesOnly | grep /src/` that adding a file does not
drag others in. Every change to a file not yet in that list must add it (and make it strict-clean,
`npm run typecheck:strict`) if its imports allow; otherwise leave a one-line note in the PR naming
the blocking import. New leaf files are always added. The goal is for the list to become `src/**/*`,
at which point `strict: true` moves into `tsconfig.json` and the strict file is deleted.
```

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsconfig.strict.json package.json package-lock.json CONTRIBUTING.md src/
git commit -m "build: target es2022 with esModuleInterop and add staged strict typecheck

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Replace tslint with ESLint, fix dependency placement, declare engines

**Files:**
- Delete: `tslint.json`
- Create: `eslint.config.js`
- Modify: `package.json`

- [ ] **Step 1: Change dependencies**

Run:
```bash
npm uninstall tslint youtube-transcript @types/jszip
npm uninstall typescript ts-node && npm install -D typescript@~5.9.0 ts-node
npm install -D @types/node@^20 eslint@^9 typescript-eslint@^8 @eslint/js@^9
git rm -q tslint.json
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "content-type-cache/**", ".youtube-cache/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off"
    }
  }
);
```
`no-explicit-any` is off because the codebase has hundreds of `any`s; it is re-enabled per file as files enter `tsconfig.strict.json`.

- [ ] **Step 3: Add scripts and engines to `package.json`**

Add:
```json
  "engines": { "node": ">=20.19.0" },
```
and in `scripts`:
```json
    "lint": "eslint ."
```

- [ ] **Step 4: Run lint and fix only errors (not warnings)**

Run: `npm run lint 2>&1 | tail -3`. Fix every line reported as `error` (unused imports, `no-undef`, `prefer-const`); leave warnings. Rerun until the error count is 0.

- [ ] **Step 5: Full verification**

Run: `npm run build && npm run lint && npx jest 2>&1 | tail -3`
Expected: build exit 0, lint 0 errors, 0 failed tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: replace tslint with eslint, declare node engine, tidy dependencies

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Retire the stale roadmap

**Files:**
- Modify: `agent-os/product/roadmap.md`
- Modify: `README.md` (one paragraph near the top)

- [ ] **Step 1: Replace the roadmap body**

Overwrite `agent-os/product/roadmap.md` with:
```markdown
# Roadmap

Superseded on 18 Sep 2026. Planning now lives in:

- `docs/reviews/2026-09-18-codebase-review.md` — the state of the code
- `docs/superpowers/specs/2026-09-18-generator-service-design.md` — the design, with sequencing in §11
- `docs/superpowers/plans/` — implementation plans per phase

The Agent OS specs under `agent-os/specs/` remain as the record of what was built in Nov 2025.
```

- [ ] **Step 2: Point the README at the plan**

Insert after the first paragraph of `README.md`:
```markdown
> **Status (Sep 2026):** this CLI is being turned into a hosted generation service. The design and
> phase plans are in `docs/superpowers/`. The CLI keeps working throughout; see the compatibility
> boundary in the design's §2.1a.
```

- [ ] **Step 3: Commit**

```bash
git add agent-os/product/roadmap.md README.md
git commit -m "docs: retire stale roadmap in favour of the service design

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- `git log --oneline -1` on `main` is at or after the Task 12 commit and `main` fast-forwards from `3cf6f9a`.
- `npm run build && npm run lint && npm run typecheck:strict && npx jest --coverage; echo "exit=$?"` prints `exit=0` (each command is run in sequence and the composite status is checked, not a piped summary).
- `git ls-files | grep -cE '\.(bak|bak2|backup)$'` prints `0`; `git ls-files .youtube-cache | wc -l` prints `0`.
- `.env.example` exists and `.env` is untracked.
