# AI activity generator: service design

Date: 18 Sep 2026, revision 2 (after review, amended). Status: approved for planning phases 0–1. Companion: `docs/reviews/2026-09-18-codebase-review.md` (the state of the code this design starts from).

## 1. What we're building

A hosted service that takes source material (text, files, web pages, audio/video, YouTube) and produces a set of interactive H5P activities the user can preview, regenerate or drop, then export as standard `.h5p` packages. Vocational education is the first market: the user can supply a unit of competency, generated activities are aligned to its performance criteria, and the export includes a mapping table.

**Scope statement on alignment.** The activities are for understanding and revision. They are not assessment tasks, and the mapping is a *suggested* alignment of revision activities to performance criteria, distinguished from human-reviewed alignment in the export. Any wording elsewhere (including the positioning document) that calls this "assessment-mapping evidence" should be read as this narrower claim.

Version 1 is used internally (Benjamin and the agency) but modelled for tenancy from the start, so opening it to outside users adds accounts and billing rather than a rewrite.

### Decisions already made

| Question | Decision |
|---|---|
| Who uses v1 | Internal first, tenancy in the data model (org on every row, keys per org, usage per job) |
| Output unit | One `ActivitySpec` per exportable `.h5p` package. Generation may return several specs of the same type for one import. Interactive Book is a versioned composition of other activities |
| Editing in v1 | Preview, regenerate (optionally with a note), drop, restore. No field editing, no H5P editor |
| Vocational | Unit of competency as a structured input; activities tagged to performance criteria; mapping table exported with suggested vs reviewed status. Revision, not assessment |
| Sources | Pasted text, text files (txt, md, docx, PDF text layer), web page, audio/video upload, YouTube |
| Runtime | One Node service in a container: SvelteKit + API + job worker, Postgres, R2 |
| Interactive Video | Next spec, not this one |
| Code structure | Split generation from compilation, in a monorepo |
| Generation provider | One adapter first (Anthropic). OpenAI stays for Whisper. Other adapters later behind the same interface |
| Naming | Not a dependency of any phase. Packages are private `@leaplearn/*` provisionally; the existing CLI command stays as a compatibility alias |

### Not in v1

Field-level editing or the full H5P editor; Interactive Video, Course Presentation, Branching Scenario; payments and plans (an operational cap on imports exists, entitlements and billing do not); LTI; ClassroomIO integration; OCR for scanned PDFs; training.gov.au lookup (units are pasted as text); the existing bilingual/translation mode (kept working in the CLI with a compatibility fixture, not exposed in the web UI); SCORM; drag-and-drop ordering of book chapters (order is persisted, defaulting to picker order).

## 2. The central idea: generation and compilation are separate

Today an "AI handler" asks the model for content *and* builds H5P params in one call. This design puts a typed **activity spec** between them:

```
source ──► generator ──► ActivitySpec (JSON, typed) ──► engine ──► .h5p
                              ▲                          │
                        review loop ◄── preview ◄────────┘
```

- The **generator** knows about sources, concepts, units of competency and language models. It produces specs. It never builds packages.
- The **engine** knows about H5P: libraries, `semantics.json`, params, packaging. It turns a spec into a package. It never calls a model and never touches the network.
- The **review loop** operates on specs. Regenerating an activity produces a candidate revision; building is deterministic and makes no model calls, so it can run on every change.

### 2.1 The activity contract

One `ActivitySpec` is one exportable package. The table below fixes, per type, what one spec contains, what the engine emits as `mainLibrary`, and which child types a container may hold. Child lists are closed: the compiler supports exactly these combinations, and the Zod schemas enforce them (no unrestricted recursive `ActivitySpec[]`).

| Spec type | One spec contains | `mainLibrary` | Container children |
|---|---|---|---|
| `multiChoice` | One question, 2–8 answers, feedback | H5P.MultiChoice | — |
| `trueFalse` | One statement, correct value, feedback | H5P.TrueFalse | — |
| `blanks` | One passage with N blanks (alternatives per blank) | H5P.Blanks | — |
| `dragText` | One passage with N draggable words | H5P.DragText | — |
| `singleChoiceSet` | N questions, each with one correct answer | H5P.SingleChoiceSet | — |
| `essay` | One prompt, keyword list, sample solution | H5P.Essay | — |
| `crossword` | N words with clues | H5P.Crossword | — |
| `accordion` | N titled panels | H5P.Accordion | — |
| `flashcards` | N cards (front, back, optional tip) | H5P.Flashcards | — |
| `dialogCards` | N cards (front, back, optional audio) | H5P.Dialogcards | — |
| `summary` | N statement groups (one correct per group) | H5P.Summary | — |
| `questionSet` | Ordered children, pass percentage, intro | H5P.QuestionSet | `multiChoice`, `trueFalse`, `blanks`, `dragText`, `essay` (subset of the library's permitted list; DragQuestion, MarkTheWords and MultiMediaChoice have no producer) |
| `interactiveBook` | Ordered chapters of pages | H5P.InteractiveBook | Page types `text`, `image`, `audio`, `video` (embed URL or asset), and any type above except `interactiveBook`, `flashcards` and `crossword` (H5P.Column 1.18, the chapter container, does not accept H5P.Flashcards or H5P.Crossword) |

Because MultiChoice, TrueFalse and Essay hold one item each, the planner decides how many *specs* of those types to request, not how many items per spec. A "set of five multiple-choice questions" is five `multiChoice` specs, or one `questionSet` with five children, and the picker offers both. `singleChoiceSet` is offered only in its native multi-question form; internally its questions reuse the same question schema as `multiChoice` where that helps, but the picker has no second container concept.

### 2.1a CLI compatibility boundary

The existing YAML contract has page items (`text`, `image`, `audio`, `video`, `ai-text`) and activity items, some manual and some `ai-*`. How each survives:

- **Manual page and activity items** map to the new specs through the shim from phase 1 onward and compile on the new engine. Page types are part of the Book contract above, so nothing manual is lost.
- **`ai-*` items and `ai-text`** are generation, not compilation. Their replacements arrive in phases 2 and 4. Until then the existing AI path is kept **frozen** as `apps/cli-legacy`: the current code moved as-is (import paths only), no refactoring, no new features, deleted in phase 4 when every `ai-*` type has a producer. The bilingual fixture runs against the legacy path until phase 4 migrates language support into the generator.
- The `interactivebook-ai` command therefore keeps working throughout; the manual commands switch to the new engine in phase 1.

### 2.2 Identity, provenance and versioning

Every entity the model refers to has a stable ID assigned in code, and the model **selects** IDs from its context rather than inventing references.

- **Source**: `sourceId`; `textHash` (SHA-256 of the extracted text, immutable; a re-extraction is a new source); for audio/video, `segments[]` each `{ segmentId, startMs, endMs, charStart, charEnd }` linking transcript text offsets to media time.
- **Offsets**: character offsets into the stored extracted text, half-open `[charStart, charEnd)`, UTF-16 code units (JavaScript string indexing). Media timestamps are separate fields, always derived from segments in code.
- **Concept**: `conceptId`; `evidence[]` each `{ evidenceId, charStart, charEnd, quote }`. Quotes are verified against the stored text at extraction time; a quote that isn't a substring at its offsets is rejected.
- **Item provenance**: `{ conceptIds[], evidenceIds[], criteriaIds[] }`. Spans and timestamps are resolved from those IDs in code when displaying or exporting. Support (evidence in the source) and alignment (performance criteria) are recorded as separate claims.
- **Activity revision**: each stored spec has `schemaVersion` (the contract version) and `revision` (a monotonically increasing content revision per activity). A revision also records `promptVersion`, `modelConfig` (provider, exact model ID, parameters), and `engineFingerprint` (engine package version plus the library-lock hash). Together these explain why any two revisions differ.

The Zod schema per type is the single authoritative definition. Provider structured-output schemas (Anthropic tool schemas, JSON Schema) are derived projections generated from it; refinements that JSON Schema can't express (reference validity, answer sanity) are checked in application code after the model returns.

## 3. Packages

pnpm workspace. Package scope `@leaplearn` provisionally.

### `packages/shared`
Zod schemas and TypeScript types only: `ActivitySpec` per type with closed container children, `UnitOfCompetency`, `ConceptMap`, `Provenance`, `GenerationUsage`, status enums. Language metadata is part of every spec (`language`, optional `instructionalLanguage`) so the CLI's bilingual mode keeps a home in the contract.

### `packages/engine` (from the existing compiler)

Contract: `validate(spec) → ValidationResult`, `compile(spec, assets, output) → CompileResult` where `output` is a writable stream or file path, plus `compileToBuffer(spec, assets)` as a convenience for small CLI builds. `createRegistry({ lockfile, cacheDir })`.

- **Media boundary.** The engine never fetches. The application passes an **asset manifest**: for every media reference in the spec, `{ assetId, sha256, byteLength, mimeType, open(): ReadableStream }`. The engine streams from `open()` into the archive and verifies the hash as it writes. It never receives R2 credentials or URLs; resolving R2 keys to streams is the application's job (`apps/web` and `apps/cli` each provide their own resolver).
- **Determinism**, qualified: same spec, same asset manifest (by hash), same engine version and same lockfile → identical bytes.

- **Libraries** are locked in `libraries.lock.json` by machine name, exact version, and SHA-256 checksum, including transitive dependencies. A script (`fetch-libraries`) resolves and downloads into the cache and updates the lock; it lives outside the engine and is the only code that talks to the Hub. The service image bakes the cache at build time; the engine opens it read-only and refuses to run if a checksum mismatches.
- **Handlers**: one per content type, `(spec, ctx) → H5PParams`, declaring `requiredLibraries(): VersionedLibrary[]` resolved from the lockfile. Library version strings inside params are produced from the same source. The existing `embedded/*` handlers become these; the `ai/*` twins are deleted.
- **Validation** (a rewrite of the current `SemanticValidator`, whose `library` branch only checks the property exists): recursive validation of nested params against each child library's `semantics.json`; enforcement of the `options` list on library fields; a dependency-closure check that every library referenced anywhere in params is in the package's dependency set; and media-reference checks that every `path` in image/audio/video fields points to a file the package will contain. Failures are structured `{ path, message }`.
- **Determinism**: sub-content IDs are UUIDv5 derived from `(activityId, revision, path)` rather than `randomUUID()`; zip entries are written in sorted order with fixed timestamps; no directory entries. Two compiles of the same revision are byte-identical.
- **Media** is streamed into the archive from the asset manifest, never held in arrays.
- **Producers**: `standalone(spec)` and `interactiveBook(bookSpec)`, where the book producer wraps child params in Column/Row exactly as `ChapterBuilder` does today.
- No `console`, `process.exit`, `process.cwd()`, `process.env`, or network. A `Logger` is injected.

### `packages/generator` (new)

- `ingest/`: one adapter per source type returning `SourceDocument { text, textHash, segments?, metadata }`. Text and pasted text are trivial; docx via `mammoth`; PDF via `pdf-parse` (text layer only); web via a guarded fetch plus a readability extractor; audio/video via ffmpeg audio extraction then Whisper with `verbose_json`; YouTube via `yt-dlp` then the same audio path. External binaries run with `execFile` and argument arrays under time and memory limits.
- `competency/`: parses pasted unit text into `UnitOfCompetency { code, title, elements[]: { elementId, text, performanceCriteria[]: { criterionId, text } }, knowledgeEvidence[], performanceEvidence[] }` with one structured-output call. Cached by `textHash` within the org.
- `concepts/`: chunks the source by token budget on segment boundaries; extracts concepts per chunk with evidence IDs chosen from numbered candidate sentences supplied in the prompt; verifies quotes; one merge pass across chunks. If a unit is present, one alignment call maps concepts to `criterionId`s and marks criteria with no supporting concept as *unsupported*. Progress is persisted per chunk.
- `plan/`: from selected types, concept map, unit and customisation → `ActivityPlan[]`: how many specs of each type, and per spec which concepts and criteria it targets. Counts are configurable rules; allocation is one structured-output call.
- `produce/`: one module per content type: prompt template (system rules from the existing `AIPromptBuilder`, kept), plan entry, concept excerpts with evidence, output schema. Returns an `ActivitySpec` with provenance. Runs with a concurrency limit (default 4).
- `llm/`: `callModel(request, recorder) → { output }`. The injected `AttemptRecorder` persists an **attempt-start** record before each dispatch and an **attempt-outcome** record immediately after each completion, as immutable events; nothing about an attempt is held only in memory. A start with no outcome (a crash mid-call) is reconciled on restart as `billing_uncertain`. Model IDs live in one config file keyed by role (`extract`, `produce`, `parseUnit`); nothing else names a model.
- `quality/` (v1 minimum): Zod validation; reference validity (every `conceptId`, `evidenceId`, `criterionId` exists); exact and near-duplicate detection within an import; **per-type answer checks**: option-based types (`multiChoice`, `singleChoiceSet`, `summary`, `questionSet` children of those types) have at least one correct answer among their options; `trueFalse` has a boolean; `blanks` and `dragText` answers occur in the passage; `crossword` answers are single words that fit the grid; `essay` has at least one keyword and a sample solution; `flashcards`, `dialogCards`, `accordion` have non-empty, non-duplicate fronts or titles.

### `apps/web`
SvelteKit (Svelte 5, Tailwind), server routes for the API, Drizzle for Postgres, the S3 SDK for R2. The worker is a second process in the same image using `pg-boss`, so the queue lives in Postgres.

### `apps/cli`
The existing commands, now thin. A shim maps the old YAML `BookDefinition` to specs; a compatibility fixture asserts the bilingual path still builds.

## 4. Data model

Every table except `users` has `org_id`. Foreign keys are tenant-consistent (a child's `org_id` must equal its parent's; enforced by composite keys `(org_id, id)` on the referenced tables). Timestamps everywhere.

| Table | Purpose | Key columns |
|---|---|---|
| `orgs` | Tenant | `name`, `import_cap` (operational cap, not an entitlement), `settings` |
| `users`, `memberships` | Minimal auth (one user in v1) | role |
| `org_credentials` | Provider keys per org, encrypted; null means server defaults | `provider`, `encrypted_key`, `key_version` |
| `units_of_competency` | Parsed units, reusable | `code`, `title`, `raw_text`, `text_hash`, `parsed` |
| `imports` | One job from one source | `name`, `source_type`, `status`, `customisation`, `language`, `unit_id`, `selected_types[]`, `budget` (requests, tokens, seconds, spend), `budget_used`, `error`, `idempotency_key` (unique) |
| `sources` | Material behind an import | `import_id`, `raw_key`, `text_key`, `text_hash`, `segments_key`, `metadata` |
| `extraction_chunks` | Per-chunk progress for concept extraction | `import_id`, `chunk_index`, `status`, `result_key`; unique `(import_id, chunk_index)` |
| `concept_maps` | Extracted concepts with IDs and verified evidence | `import_id`, `map`, `alignment` (criterion → conceptIds, plus unsupported criteria) |
| `activity_plans` | The planner's output | `import_id`, `plan` |
| `activities` | One exportable activity | `import_id`, `type`, `order`, `status`, `current_revision_id`, `criteria_ids[]`, `error` |
| `activity_revisions` | Every spec ever produced, immutable | `activity_id`, `revision`, `state` (`candidate`, `promoted`, `superseded`, `rejected`), `spec`, `schema_version`, `prompt_version`, `model_config`, `engine_fingerprint`, `note`, `build_key`, `preview_key`; unique `(activity_id, revision)` |
| `book_compositions` | Ordered references to child revisions | `activity_id` (the book), `revision`, `children[]: { activityId, revisionId }`, `intro` |
| `operations` | One logical generation operation | `import_id`, `activity_id?`, `purpose`, `status`, `idempotency_key` (unique), `content_attempts`, `outcome` |
| `generation_attempts` | One immutable row per provider call, written in two events: start (before dispatch) and outcome (after completion) | start: `operation_id`, `attempt`, `provider`, `model`, `credential_owner` (`org` or `server`), `reserved_budget`, `started_at`; outcome: `provider_request_id`, `raw_usage`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `latency_ms`, `pricing_version`, `cost_usd_micro`, `cost_status` (`known`, `estimated`, `unavailable`), `status`, `error`, `completed_at`; `billing_uncertain` set by reconciliation when a start has no outcome |
| `transcription_attempts` | Same two-event shape for Whisper (minutes instead of tokens) | `operation_id`, `audio_seconds`, `cost_usd_micro`, `cost_status` |
| `exports` | Built downloads | `import_id`, `kind` (`activity`, `bundle_zip`, `interactive_book`, `mapping_csv`), `key`, `revision_ids[]` |
| `alignment_reviews` | Human-reviewed alignment decisions, bound to the exact revision | `activity_revision_id`, `item_id`, `unit_id`, `unit_text_hash`, `criterion_id`, `decision` (`confirmed`, `rejected`, `added`), `reviewer_id`. A new revision starts with no reviews |
| `acceptance_decisions` | Human acceptance of a revision, distinct from promotion | `activity_revision_id`, `decision` (`accepted`, `rejected`), `reviewer_id`, `notes`. Promotion means technically usable; acceptance means a human judged it good |

Statuses. `imports`: `queued → ingesting → extracting → planning → generating → ready | ready_with_failures | failed`. Terminal rules: zero promoted activities → `failed`; some failed → `ready_with_failures`; all promoted → `ready`. `activities`: `planned → generating → generated → built → promoted | failed | dropped`; `dropped` and `restored` only change a flag and never touch revisions.

## 5. The pipeline

A worker job per import. Progress is persisted per activity and per extraction chunk, every operation carries an idempotency key, and a restarted job skips operations whose outcome is already recorded. A provider call interrupted by a crash **may have been billed**; on restart the operation is marked `billing_uncertain` and re-run rather than assumed unbilled. Exactly-once model execution is not promised.

1. **Ingest.** Store the raw upload or fetched page in R2. Extract text and, for audio/video, segments. Compute `textHash`. Reject empty input, and reject oversized input with a message (no automatic truncation). Provisional ceilings: 200 MB per file, 90 minutes of audio, 300,000 characters of text; the file-size limit will usually bind before the duration limit for video.
2. **Parse the unit** if supplied and not cached.
3. **Extract concepts.** Chunk, extract per chunk (persisted), verify evidence, merge, align to criteria if a unit exists. Persist the concept map with the unsupported-criteria list.
4. **Plan.** Persist `ActivityPlan[]`; create `activities` rows in planner order.
5. **Produce**, concurrently. Each activity is one operation:
   - prompt → `callModel` → Zod → quality checks → `engine.validate`;
   - a **content failure** (invalid or rejected output) feeds the reason back into the next content attempt, up to three;
   - a **transient provider failure** (rate limit, 5xx, network) is retried inside `callModel` with backoff, and does not consume a content attempt;
   - an **infrastructure or compiler failure** (R2 unavailable, library missing, checksum mismatch) fails the operation without regeneration and is surfaced as a system error;
   - every attempt is recorded (start before dispatch, outcome after) before the next begins. No placeholder content is ever written.
   - **Budgets** are checked and **reserved before dispatch**: each attempt reserves its maximum possible tokens and spend against the import's budget in one atomic update, accounting for concurrent in-flight attempts; the reservation is replaced by actual usage on completion. A dispatch whose reservation would exceed the budget is not made, and the activity is marked `failed` with reason `budget`.
6. **Build.** For each generated revision, `engine.compile` to R2, extract to a preview prefix, then **promote** the revision in one transaction: `activity_revisions.state = promoted`, previous promoted revision → `superseded`, `activities.current_revision_id` updated. A revision that fails validation, compilation or storage is `rejected` and the previous promoted revision remains downloadable.
7. **Finish.** Set the terminal import status by the rules above. Consume one unit of the org's `import_cap` in the same transaction, keyed on the import ID so it can never be consumed twice.

**Regenerate** creates a new operation for one activity with the user's note appended, runs steps 5–6, and promotes only on success. Concurrent regenerations of the same activity are prevented by an atomic conditional update (`UPDATE activities SET status = 'generating' WHERE id = $1 AND status <> 'generating'`, or `SELECT … FOR UPDATE` in the transaction that creates the operation); a request that finds the row already locked is rejected with a clear message. Regeneration incurs metered generation and retry costs; rebuilding makes no model calls.

**Drop** and **restore** flip the activity flag; the book recomposes (see §6).

**Export**: a single `.h5p` from the promoted revision; a zip of all promoted, non-dropped activities; the Interactive Book (its latest composition); and `mapping.csv` whenever a unit was supplied. Every export records the revision IDs it was built from.

## 6. Interactive Book as a versioned composition

A book activity stores an ordered list of `(activityId, revisionId)` references, not copies. The introduction page is generated once, during the import's produce step, and stored on the composition; recomposition never calls a model.

Rules:
- The composition is **recomputed automatically** whenever a child is promoted, dropped or restored: current promoted revision of every non-dropped child, in the persisted order (default: picker order). Each recomputation is a new book revision, built and promoted like any other.
- An export of the book always uses the latest composition; an outdated book is never silently exported.
- **Book-only selection is disabled in v1**: the picker requires at least one constituent type, and the planner creates the constituents the book will contain.
- Regenerating the book itself regenerates only the introduction.

## 7. The web app

Screens mirror H5P.com's Smart Import, which users already understand:

- **Imports list**: name, source type, status, cost, created; the org's remaining cap.
- **New import**, two steps. Step 1: source tile, customisation text, language of generated content, and an **Alignment** section to paste a unit or pick a parsed one. Step 2: the activity picker, grouped as H5P.com does (*Test knowledge*: multiple choice, true/false, fill in the blanks, drag the words, single choice set, question set, crossword, summary; *Present content*: accordion, flashcards, dialog cards, essay prompts, interactive book), with a default selection and per-type counts where the type is single-item.
- **Import detail**: progress per step and per activity while running; then one card per activity with its preview, criteria tags marked *suggested* or *reviewed*, evidence links back to the source, and buttons for Regenerate (with a note), Drop or Restore, Download. Failed activities show the reason and a Retry button. Page level: Download all, Download mapping, the book when selected, and the list of unsupported criteria.
- **Alignment review**: on a card, a reviewer can confirm, reject or add criteria; decisions are recorded in `alignment_reviews` and change the mapping's status column.
- **Usage**: attempts by day, model, purpose and cost; per-import cost split into shared cost (ingestion, extraction, planning) and direct cost (per activity); cost per **accepted** activity (an `acceptance_decisions` row of `accepted` on the promoted revision); retry share.

**Preview** uses `h5p-standalone` on a **separate preview origin** (a distinct hostname, e.g. `preview.<host>`), which serves extracted packages from R2 under a narrowly scoped, short-lived access token bound to `(org, activity revision)`. The preview origin sets no application cookies and receives none. The application embeds it in an iframe with `sandbox="allow-scripts allow-same-origin"`: the **phase-1 preview spike** found that `allow-scripts` alone cannot run `h5p-standalone` at all, because the opaque-origin outer frame cannot reach into the nested `iframe.h5p-iframe` the library creates for the actual content, so no library ever loads. The token must travel as a **path segment** (`/p/<org>/<revision>/<token>/<package-path>`), not a query parameter, because `h5p-standalone` loads library JS/CSS and media through `<script>`/`<link>`/`<img>` tags that never pass through a page-level `fetch` wrapper; see [`spike-results/2026-09-preview-sandbox.md`](spike-results/2026-09-preview-sandbox.md) for the full evidence.

## 8. Cost and metering

- `callModel` is the only place a generation SDK is called; Whisper has its own adapter but writes to the same ledger shape. Every provider attempt writes an immutable start event before dispatch and an outcome event after completion, through the injected recorder, so a crash can lose at most the outcome, never the fact that a call was made.
- Raw provider usage is stored as returned. Cost is computed at write time from a pricing table versioned in config (`pricing_version` recorded on the row), with separate rates for input, output, cache reads and cache writes. If usage is missing, `cost_status = unavailable` and the row carries no cost; it is never recorded as zero. If usage is estimated (e.g. Whisper minutes from probed duration), `cost_status = estimated`.
- Prompt caching is used for the shared system prompt and concept-map context, with the caveat that reuse requires an identical prefix and that concurrent first requests may each write the cache. Cache writes and reads are reported separately so the actual saving is visible rather than assumed.
- Reports: cost per import, split shared vs direct; per activity type; per purpose; retry share; **cost per accepted activity**. This is the measurement the pricing decision waits on.
- Model choice by role in config, recording exact API IDs. Candidates: Claude Sonnet 5 (`claude-sonnet-5`) for production and Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for extraction and unit parsing; the extraction choice is confirmed by the quality gate (§10, phase 3), not assumed. The existing hard-coded IDs are removed.

## 9. Security and isolation

- **Tenancy**: the org is resolved from the authenticated session only, never from a client-supplied ID; all queries are scoped by that org; foreign keys are tenant-consistent (§4). Two-org isolation tests cover jobs, previews and exports before any outside user is admitted.
- **Preview**: separate origin, scoped tokens, no session cookies, sandbox value per the phase-1 spike (§7). Only libraries from the checksummed lockfile are ever served; user-authored HTML inside specs is sanitised (allow-list of tags and attributes) before it reaches params.
- **URL fetching**: DNS resolution is checked against private, loopback, link-local and metadata address ranges before connecting and again on every redirect; redirects are capped; response size, content type and time are limited.
- **Extraction limits**: time and memory ceilings on PDF, docx and readability parsing; ffmpeg and yt-dlp run with `execFile`, argument arrays, timeouts and output-size limits.
- **Uploads**: type-sniffed, size-limited, stored under server-chosen keys.
- **Credentials**: per-org provider keys encrypted at rest with a server-side key, decrypted inside the worker for the duration of an operation, never written to `process.env`; `credential_owner` recorded on every attempt.
- **Failure categories** (§5) ensure infrastructure errors are surfaced, not masked by regeneration.

## 10. Testing

- **Engine**: golden tests per type (spec fixture → params snapshot, byte-identical package hash); the validator runs in every golden test; package tests assert `h5p.json`, lockfile-matching versions, dependency closure, media references, sorted entries and no directory entries. **Player smoke tests**: a headless browser loads each golden package in `h5p-standalone` and asserts it renders without console errors and can be answered. The existing compilation tests are migrated; tests of AI handlers are replaced by generator tests.
- **Generator**: `callModel` behind an interface with a recording provider (fixtures of real responses including usage and request IDs), so pipeline and cost tests run offline and assert exact figures, including cache read/write accounting and `cost_status` handling. Quality checks have unit tests with deliberately bad specs. Provenance tests assert every evidence quote verifies against the stored text.
- **Service**: end-to-end import from pasted text through the worker with the recorded provider and real compilation; crash-recovery test (kill the worker mid-produce, restart, assert no duplicate promotion and `billing_uncertain` set); concurrent-regeneration test; two-org isolation tests.
- **Human quality gate** (phase 3): a corpus of at least five representative source-and-unit pairs across trades. For each generated activity, a reviewer scores answer correctness, source support, distractor quality, mapping accuracy and usefulness, and records an `acceptance_decisions` row. Metrics tracked per type: acceptance rate, retries, review time, cost per accepted activity. The gate decides whether the prompts, the concept layer or the model choices change before more types are added.
- **Manual platform gate**: for each type, upload a built package to h5p.com and to the Moodle version and H5P integration used by the first pilot customer (recorded in `docs/testing/platform-checklist.md`).

## 11. Sequencing

Each phase ends with something demonstrable. The detailed task plan follows from this spec.

0. **Minimal housekeeping**: fast-forward `main` to the QuestionSet branch; make the 23 failing tests pass or quarantine with reasons; delete `.bak` and stray files; stop tracking `.youtube-cache`; add `.env.example`; modern `tsconfig` with `strict` staged file by file; eslint; `engines`. No rename.
1. **Engine contract**: `packages/shared` schemas for all twelve types with the container rules of §2.1; `packages/engine` with the validator rewrite, lockfile with checksums and transitive deps, deterministic IDs and zip, stream output over an asset manifest, injectable config; golden tests for `multiChoice`, `blanks`, `flashcards` plus a **nested-container fixture** (a `questionSet` holding a `multiChoice`, hand-written, no producer) to exercise recursive validation; player smoke tests; the **preview spike** (§7); manual CLI commands on the new engine via the shim; `apps/cli-legacy` frozen for the `ai-*` path with the bilingual fixture. Demo: byte-identical rebuilds and a validator that rejects a nested bad param.
2. **Three representative types end to end**: `callModel` with the two-event attempt recorder and budget reservation; text, file and **web-page** ingestion; concept extraction with verified evidence; thin unit parsing and alignment; plan; produce for `multiChoice` (scored, single item), `blanks` (passage-grounded) and `flashcards` (present content, multi-item); per-type quality checks; a script that runs a PDF plus a unit through all of it. Demo: **source → reviewed activity → playable `.h5p` → traceable mapping → measured cost**, on the command line.
3. **Human quality gate** on the corpus, with the metrics of §10. Revise prompts, concept layer and model roles as the results dictate.
4. **Remaining producers and the book**: the remaining nine activity producers, including `questionSet`, plus the book composition rules of §6; golden and smoke tests for all; language support migrated into the generator; `apps/cli-legacy` deleted.
5. **Web workflow**: Postgres schema, worker, wizard, import detail with preview on the separate origin, regenerate, drop, restore, alignment review, export, usage page; isolation and crash-recovery tests.
6. **Audio, video and YouTube ingestion**, with the transcription ledger, and a cost report across all source types.

## 12. Risks

- **Generated quality is the product.** The design makes it measurable and correctable; the gate in phase 3 is where it gets judged. Expect prompts, the concept layer and the quality checks to change more than once.
- **Hand-written param builders remain the fragile part of the engine.** The validator rewrite and player smoke tests narrow the gap, but the platform gate stays.
- **`yt-dlp` breaks when YouTube changes**, and its use in a hosted commercial service is a grey area. File upload is the path to rely on.
- **Library versions move.** The lockfile makes upgrades deliberate; every bump reruns golden, smoke and platform tests.
- **The strict-mode migration** surfaces many errors; staging it keeps phase 0 short.
- **Prompt-cache savings are not guaranteed** (prefix identity, concurrent first requests); reporting them separately prevents optimistic cost assumptions.

## 13. Decisions from the review

| Item | Decision |
|---|---|
| Input limits | Provisional ceilings kept; oversized input is rejected with a message, never truncated; per-import budgets added |
| Models | Exact API IDs recorded in config; Haiku 4.5 for extraction is provisional pending the phase-3 gate; one generation adapter first |
| Bilingual mode | CLI-only; language fields kept in the contract; compatibility fixture |
| Rename | Not a phase dependency; provisional `@leaplearn/*`; CLI alias retained |
| Book ordering | Persisted; defaults to picker order; no reordering UI in v1 |
| Moodle | The first pilot customer's version and H5P integration, recorded in the checklist |
| Allowance | An operational `import_cap` only; entitlement semantics deferred and kept separate from cost accounting |

## 14. Open questions

- Which five source-and-unit pairs form the phase-3 corpus, and who reviews them besides Benjamin.
- The production preview hostname and TLS arrangement on the demo VPS.

Closed: `singleChoiceSet` stays in its native multi-question form (§2.1).
