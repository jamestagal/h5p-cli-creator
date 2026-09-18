# Codebase review, 18 Sep 2026

Reviewed `main` at `4c4294d` (17 Nov 2025) and the unmerged branch `origin/claude/review-questionset-spec-014JfduBP4E3A5pHAodfVNrt` at `3cf6f9a` (18 Nov 2025). Purpose: establish the real state of the project before planning the hosted AI generator. Line numbers are as of those commits.

## Summary

1. **`main` does not build** (15 TypeScript errors) and hasn't since commit `29fa094` on 16 Nov 2025, which rewrote `src/compiler/types.ts` and dropped seven compiler interfaces. The build was clean at `29fa094~1`.
2. **The unmerged QuestionSet branch is the real latest state.** Four commits (17–18 Nov 2025) finish `AIQuestionSetHandler`, restore the missing types, build with zero errors, and were tested on h5p.com. `main` is an ancestor, so it fast-forwards cleanly. Do this first.
3. **On that branch, 674 of 710 tests pass; 23 fail across 18 suites.** Not one shared cause: about nine are a real regression (the AI Accordion variant no longer passes `validate`), the rest are drifted assertions and mocks (TextHandler argument count, YAML generator output, transcript-matcher boundary cases, a Whisper mock).
4. **What's done and verified** (don't re-plan): handler architecture and registry, AI configuration cascade (item > chapter > book), Interactive Book compiler, YouTube → Whisper → paged story pipeline, text-based page breaks, multi-language generation, and handlers for MultiChoice, TrueFalse, Blanks, DragText, SingleChoiceSet, Essay, Crossword, Accordion, Flashcards, DialogCards, Summary (manual), QuestionSet (branch).
5. **What's missing for a hosted generator**, in order of severity:
   - No cost capture on the generation path. Token usage from Anthropic and Gemini responses is discarded.
   - Failed generations ship silently as placeholder content inside the package.
   - Generated params are never validated against `semantics.json`, so bad output fails only in the player.
   - Generation is one sequential API call per item; no concurrency, no result caching.
   - Only the MultiChoice handler takes real source text; the others take a short prompt. No concept-extraction layer, no chunking.
   - No review step: generate and package is one atomic command.
   - No HTTP server exists. The 778-line "API Integration Guide" describes an endpoint that was never written.
   - Nothing for Interactive Video, Course Presentation or Branching Scenario beyond type stubs. Nothing vocational anywhere (zero hits for "vocational", "unit of competency", "training package", "RTO").
6. **Server-hostility**: cwd-relative cache paths, `process.env` mutation for API keys, a process-wide handler registry that throws on re-registration, `process.exit` in CLI modules, shell-string interpolation of user input into `yt-dlp`/`ffmpeg`, Hub downloads written into the repo tree at runtime, all media buffered in memory.
7. **Hygiene**: 47 MB of binaries committed (`.youtube-cache` 65 files incl. mp3s; `content-type-cache` 17 packages), 15 `.bak` files (4 in `src/`), `tsconfig` with `target: es5` and no `strict`, tslint (dead since 2019) with no lint script, a dead `youtube-transcript` dependency, no `.env.example`, stale roadmap.

## 1. Build and branches

- `npm run build` on `main`: 15 errors, all in `src/compiler/*` and `src/modules/ai/interactive-book-ai-module.ts:154`. Missing exports: `LibraryMetadata`, `LibraryJson`, `LibraryDependency`, `SemanticSchema`, `FieldDefinition`, `ValidationResult`, `ValidationError` (from `types.ts`); `H5PDefinition`, `StandaloneDefinition`, `isStandaloneDefinition`, `parseYamlFile` (from `YamlInputParser.ts`); `AIQuestionSetHandler` (file absent). `types.ts:350` also has a conflicting `ContentType` re-export.
- Those seven interfaces exist at `29fa094~1:src/compiler/types.ts:4-105`. Commit `29fa094` replaced the file (229 insertions, 149 deletions).
- Branch `origin/claude/review-questionset-spec-014JfduBP4E3A5pHAodfVNrt`: commits `573ffca`, `b5306ea`, `ed739a2`, `3cf6f9a`. Diff vs main: 10 files, +1124/−88, including `src/handlers/ai/AIQuestionSetHandler.ts` (698 lines), `examples/questionset/*.yaml`, and the type restorations. `tsc` clean. Commit `b5306ea` records h5p.com verification of all six question types.
- Other remote branches are older spec-review branches already merged in substance.

## 2. Architecture (non-AI core)

- **Entry points**: `src/index.ts:12-21`, seven yargs commands. Only `interactivebook-ai` uses `H5pCompiler`; `flashcards` and `dialogcards` re-implement the compile pipeline inline (~90 duplicated lines each, `flashcards-module.ts:100-193`); the CSV `interactivebook` command uses a legacy template-mutation path (`src/creators/*`, `src/utils/h5p-package.ts`) reachable from nowhere else.
- **Handler registration** is 22 hand-written `register()` calls inside CLI code (`interactive-book-ai-module.ts:112-133`). `HandlerRegistry` is a process-wide singleton that throws on duplicate registration (`HandlerRegistry.ts:10,22,43`). No `createDefaultRegistry()` exists.
- **Compiler** is Interactive Book–centric: `PackageAssembler.generateH5pJson` hard-codes `mainLibrary: "H5P.InteractiveBook"` (`PackageAssembler.ts:135`), `getParentLibraries` always adds it (`:280`), `ChapterBuilder.wrapInRowColumn` wraps everything (`ChapterBuilder.ts:56`). `compileStandalone` (`H5pCompiler.ts:295-433`) uses a mock ChapterBuilder to capture params and a hard-coded contentType→library map (`:444-467`). On the branch it compiles; its spec (`agent-os/specs/standalone-content-support`) is still "IN PROGRESS", phase 2 of 3.
- **Handlers**: `ContentHandler` interface (`ContentHandler.ts:13-36`) is `getContentType / validate(item: any) / process(ctx, item: any) / getRequiredLibraries(): string[]`. Params are hand-written JSON literals with library versions embedded in strings (`ChapterBuilder.ts:170` `"H5P.Image 1.1"`, `TrueFalseHandler.ts:348` `"H5P.TrueFalse 1.8"`) while `getRequiredLibraries` returns unversioned names, so a cache refresh can silently mismatch. `embedded/*` and `ai/*` handlers are near-total copies with no shared code (Essay 797 differing lines, Crossword 708, TrueFalse 649, Blanks 599, DragText 561); `l10n`/`behaviour` blocks are duplicated verbatim.
- **Libraries**: `LibraryRegistry.fetchLibrary` (`LibraryRegistry.ts:30-72`) is cache-first, then Hub download (`POST https://api.h5p.org/v1/content-types/<name>`, `:219-226`) written back into `content-type-cache/`. Dependency resolution is recursive over `library.json` with a cycle guard (`:352-385`). Version selection is highest cached version by filename (`:100-112`). `cacheDir = path.resolve("content-type-cache")` is duplicated in three classes and cwd-relative.
- **Packaging**: media buffered fully in memory (`ChapterBuilder.ts:141-241`, `addMediaFiles:208-212`); the zip is built then rebuilt to strip directory entries, with the dedup routine copied three times (`H5pCompiler.ts:218-239`, `:411-432`, `PackageAssembler.ts:220-247`).
- **Validation**: `SemanticValidator` (352 lines) is implemented and `ContentBuilder.validate()` wires it (`ContentBuilder.ts:114-133`), but nothing calls it, and it hard-codes `"H5P.InteractiveBook-1.8"` while the cache has 1.11. `schemas/BookDefinition.json` and `schemas/AIConfiguration.json` are used only by one test. Real validation is per-handler presence checks on YAML, not on emitted params.

## 3. AI layer

- **Providers**: Anthropic and Gemini for generation, OpenAI for Whisper (`whisper-1`) and translation (`gpt-4o-mini`). Model IDs are hard-coded literals: `claude-sonnet-4-20250514` and `gemini-2.5-flash` at `QuizGenerator.ts:134,150,391,413` and duplicated in `AITextHandler.ts:70,78`. Selection is by env-key detection with Gemini winning whenever `GOOGLE_API_KEY` is set (`QuizGenerator.ts:44-55`). The `--ai-provider` CLI flag only chooses which env var to write and is otherwise ignored (`interactive-book-ai-module.ts:63-68,136-142,169`).
- **Call paths**: three. `QuizGenerator.generateRawContent` (`:369`) serves most AI handlers; `QuizGenerator.generateQuiz` (`:132-155`) has its own duplicate path; `AITextHandler` (`:66-91`) imports both SDKs itself. Merging these into one `callModel()` is the precondition for metering.
- **Cost**: no token capture on generation. `message.usage` / `usageMetadata` discarded at `QuizGenerator.ts:145,152,403,415`. Translator tracks tokens but `StoryTranslator.ts:235` assigns instead of accumulating. Whisper cost is a duration heuristic; `youtube-extract-module.ts:512` hard-codes `pages * 0.001`. Retries (3×, backoff 1/2/4 s) are invisible to any cost figure.
- **Prompting**: `AIPromptBuilder` (static; 20 reading levels, 5 tones, language injection, 3-level config cascade) is sound. Per-type prompts are hand-written inside each handler; difficulty strings duplicated per handler; `QuizGenerator.generateQuiz` carries a second, contradicting 8-level reading table (`:183-196`). No few-shot examples. Only `ai-quiz` receives `sourceText` (`YamlInputParser.ts:98`); no chunking or input caps.
- **Output**: `JSONValidator` extracts and detects truncation; it does not repair. On persistent failure every AI handler writes placeholder content into the package (`AITrueFalseHandler.ts:315`, `AICrosswordHandler.ts:595` answer `"Fallback"`, `AIEssayHandler.ts:548`, `AIDragTextHandler.ts:439`, `AIBlanksHandler.ts:371`, `AIAccordionHandler.ts:258`, `AITextHandler.ts:97-104`). No per-type output schema.
- **Pipeline**: one call per item, sequential (`H5pCompiler.ts:161,187-188`). No concept extraction (`agent-os/specs/2025-11-10-concept-extraction-language-aware-ai/tasks.md`, 0/111). No caching of generated results. No quality checks (distractors, duplicates, answer verification, Bloom levels). No review step.
- **YouTube path**: `yt-dlp` + `ffmpeg` via shell string interpolation (`YouTubeExtractor.ts:158`, `AudioSplitter.ts:271`), Whisper `verbose_json` for segment timestamps, `.youtube-cache/{id}/` rooted at cwd (constructor-injectable). Produces narrated pages, not questions. `youtube-transcript` dependency is unused.
- **Interactive Video**: nothing built; no library in cache. Raw materials exist: per-segment timestamps from Whisper (`YouTubeExtractorTypes.ts:80-88`), `TimestampDeriver.ts`, `SegmentMatcher.ts`.

## 4. Product and planning state

- `agent-os/product/roadmap.md` is stale (all 12 items unchecked though 1–9 shipped; no mention of AI, YAML, YouTube or standalone). `mission.md` is CSV-era.
- Specs with final verification: template-free compiler POC, interactive-book-feature, ai-configuration-system, youtube-transcription-alternatives, dragtext, blanks, truefalse, essay, crossword, singlechoiceset, youtube-story-extraction, text-based-page-breaks, youtube-extraction-improvements, multi-language-ai. Unfinished: standalone-content-support (phase 2), handler-enhanced-compiler (acceptance criteria incl. "SvelteKit API endpoint"), summary-handler (0/33), concept-extraction (0/111), questionset (done on branch, tasks not ticked). Rejected on purpose: documentationtool-handler ("DO NOT IMPLEMENT").
- Manual platform testing is a documented gate (`agent-os/specs/2025-11-10-essay-handler/verification/H5P_PLATFORM_TESTING.md`), always on h5p.com; never Moodle or Lumi.
- Input formats: CSV (legacy), YAML (primary, `docs/user-guides/yaml-format.md`), JSON (`schemas/BookDefinition.json`, draft-07). `test-custom-images.yaml` at repo root has absolute paths to another machine.
- `content-type-cache/`: 17 packages, acquired 7–17 Nov 2025 (mtimes are a bulk copy, useless). Versions: Accordion 1.0, AudioRecorder 1.0, Blanks 1.14, Column 1.18, Crossword 0.5, Dialogcards 1.9, DocumentationTool 1.8, DragText 1.10, Essay 1.5, Flashcards 1.5, InteractiveBook 1.11, MultiChoice 1.16, QuestionSet 1.20, SingleChoiceSet 1.11, Summary 1.10, Timeline 1.1, TrueFalse 1.8.
- Env vars: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`. No `.env.example`. `.env` is gitignored and untracked. A deep-history secret scan has not been run.

## 5. Blockers for running inside a server

1. Doesn't build on `main` (fix: fast-forward to the branch).
2. `process.exit(1)` in four CLI modules, including `runInteractiveBookAI` where the orchestration lives (`interactive-book-ai-module.ts:215`).
3. Process-wide `HandlerRegistry`; unbounded `LibraryRegistry.packageCache` retaining every loaded zip (`LibraryRegistry.ts:17,248`).
4. `process.env` mutation for keys at request time (`interactive-book-ai-module.ts:138-141`).
5. cwd-relative paths: `content-type-cache` ×3, `process.cwd()` defaults ×6, `placeholder.png` (`youtube-extract-module.ts:758`).
6. 446 `console.*` calls, no injectable logger.
7. Shell injection surface in `yt-dlp`/`ffmpeg` calls.
8. Runtime writes into the repo tree (Hub downloads, YouTube artefacts).
9. All media in memory.

## 6. Immediate housekeeping (independent of the plan)

- Fast-forward `main` to `3cf6f9a`; delete the merged `claude/*` remote branches.
- Fix or quarantine the 23 failing tests; add coverage thresholds.
- Remove `.bak` files, `src/ai/QuizGenerator.retry-tests.ts` (prose, compiled into `dist/`), `test-gemini.ts`, `test-custom-images.yaml`, `Gemini2.5Pro-transciption.md`.
- Stop tracking `.youtube-cache/` (and consider `content-type-cache/`, replacing it with a fetch script + lockfile of versions). Purge from history if the audio is third-party material.
- `tsconfig`: `target: es2022`, `module: nodenext` or `commonjs` explicitly, `strict: true` (expect a large error count; stage it), `@types/node` 20, drop `tslint`, add eslint, add `engines`.
- Add `.env.example`; move `typescript`/`ts-node` to devDependencies; drop `youtube-transcript`, `@types/jszip`.
- Rewrite `agent-os/product/roadmap.md` or retire it.
