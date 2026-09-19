# Phase 2: First Generation Pipeline Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. The execution workflow is the same as phase 1: one task per dispatch, a review of the diff and verification output between tasks, a commit at each checkpoint, and a whole-branch review at the end. No external tooling is required.

**Goal:** From the command line, turn a PDF (or text) plus a pasted unit of competency into `multiChoice`, `blanks` and `flashcards` activities that are grounded in verified source evidence, aligned (as *suggested*) to performance criteria, compiled through the phase-1 engine into playable `.h5p` files, with a mapping table and a measured, per-attempt cost — all recorded so that every model call is traceable.

**Architecture:** A new `packages/generator` holds the pipeline: `ingest/` (text, markdown, PDF → `SourceDocument` with a text hash and numbered sentence spans), `competency/` (unit text → `UnitOfCompetency`), `concepts/` (chunked extraction with evidence chosen from numbered sentences, quote verification, a merge pass, alignment to criteria), `plan/` (counts by rule, allocation by one model call), `produce/` (one producer per type, prompt → model output schema → `ActivitySpec` with provenance), `quality/` (reference validity, duplicates, per-type answer checks), `llm/` (one `callModel` behind a `ModelProvider` interface, a two-event `AttemptRecorder`, budget reservation, a versioned pricing table, the Anthropic adapter, and replay/recording providers for offline tests) and `pipeline/` (persisted, resumable orchestration over an `ImportStore`). The engine is unchanged except for its opening error-classification task. `apps/cli` gains `leap generate` with a file-based store, `mapping.csv` and a cost report. Storage is a directory of JSON and JSONL files written atomically (temp + rename), because the current `better-sqlite3` requires Node 22 and phase 5 moves the same record shapes to Postgres.

**Tech Stack:** pnpm workspace as in phase 1; TypeScript 5.9 strict ESM; Vitest 3; Zod 4 (`z.toJSONSchema`); `@anthropic-ai/sdk` 0.127 (Messages API, native structured outputs via `output_config.format`, prompt caching, SDK retries disabled); `pdf-parse` 2.4 (`PDFParse` class); `pdf-lib` (dev only, to generate the synthetic PDF fixture); `yargs` 17; `undici` 6 (`Agent` with a pinned `connect.lookup` and `fetch({ dispatcher })`) plus Node 20 `dns` for the SSRF guard.

**Revision 2 (2026-09-19):** the owner's review of revision 1 found nine defects in the supplied implementations (sampling parameters Sonnet 5 rejects, SDK retries outside metering, a reservation that was not a ceiling, unrecoverable success states, resume without input identity or a lock, an SSRF guard that let mapped IPv6 and rebinding through, concurrent failure and duplicate handling, per-item mappings that overstated alignment, and a retry share that counted first attempts). This revision changes the behavioural contracts and adds the failure tests for each; the decisions table and the Global Constraints below carry the corrected rules, and each affected task names the finding it answers.

**Spec:** `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§2.2 identity and provenance, §3 packages/generator, §4 data model record shapes, §5 pipeline, §8 cost and metering, §9 security, §10 testing, §11 phase 2). Research the plan relies on: `.superpowers/sdd/phase-2-research-code.md` (legacy prompt material, engine and shared surface) and `.superpowers/sdd/phase-2-research-web.md` (SDK, pricing, pdf-parse, Zod, Node facts with URLs).

**Later UI reference:** [Smart Import screenshots, interaction patterns and proposed design tokens](references/2026-09-19-smart-import-ui-reference.md). Reference for phase-5 design only; no UI implementation is added to this plan.

## Decisions the spec leaves open for a CLI-first phase 2 (for the owner's review)

| Question | Decision | Why |
|---|---|---|
| Persistence without Postgres | `ImportStore` interface in the generator; `MemoryStore` for tests; `FileStore` in `apps/cli` writing JSON (state) and JSONL (append-only operations and attempts) under the output directory, atomically | `better-sqlite3` 13 requires Node ≥22 (engines gate); JSON files are dependency-free; phase 5 maps the same record shapes to the §4 tables |
| Structured output mechanism | `output_config.format = { type: "json_schema", schema }` (native structured outputs). The wire schema is a **provider-compatible projection** of the Zod schema: `toStrictJsonSchema` closes every object and requires every property, then `toProviderSchema` removes what the API rejects (numeric, string and array constraints, `minItems` above 1, unsupported `format`s, `$schema`), recording each removed constraint in the property's `description`. Full Zod validation runs on the parsed response, so nothing is lost | The API returns 400 for unsupported keywords, and Zod 4 emits `minimum`/`maximum` for `.int()`; the SDK's `zodOutputFormat` (which targets `zod/v4`) is the fallback if the projection is ever rejected in the demo. A contract test walks all eight real model-output schemas (Task 7) |
| Model request settings | Per-model request profiles in `models.ts`: `claude-sonnet-5` sends **no** sampling parameter and `thinking: { type: "disabled" }`; `claude-haiku-4-5-20251001` sends `temperature: 0` and no `thinking` field. No stage sets a temperature | Sonnet 5 returns 400 for non-default `temperature`/`top_p`/`top_k` and runs adaptive thinking by default, billing thinking tokens against `max_tokens`; disabling it keeps the output allowance and the cost predictable for structured extraction. Haiku 4.5 rejects adaptive thinking and accepts `temperature`. The profile is recorded in every revision's `modelConfig`, so phase 3 can trial adaptive thinking + `effort` as a measured change |
| Provider retries | SDK `maxRetries: 0`; the stage runner owns every retry and each retry is its own recorded attempt with its own reservation | Retries inside the SDK would be HTTP attempts with no start/outcome record and no reservation |
| Model output schemas vs activity schemas | Separate "model output" Zod schemas with no optionals/defaults/refinements (nullable where needed); code converts them to `ActivitySpec`, assigns ids, attaches provenance, then the full spec parse and the engine validator run | JSON Schema cannot carry refinements; ids are assigned in code (spec §2.2); keeps prompts and cache prefixes stable |
| Web-page ingestion | Deferred to phase 5 (where the server exists); phase 2 ingests text, markdown and PDF text layers | Owner scope for phase 2; the SSRF guard is built now and wired into the only fetch that exists (`apps/cli` image resolver) |
| Prompt caching | 5-minute ephemeral caching on the system block and the concept-map context block; cache writes priced at the 5-minute rate | Sonnet 5 needs ≥1,024 tokens in the cached prefix, Haiku 4.5 ≥4,096; below that the API silently does not cache, and `cache_read_input_tokens` shows whether it did |
| Budget: what is hard and what is estimated | **Requests and elapsed time are hard limits:** the request count is exact, and the elapsed limit is a per-import deadline (accumulated across runs in `budgetUsed.elapsedMs`) that is checked before every dispatch and every backoff wait and passed to the adapter as the SDK timeout, so no attempt can outlive it. **Spend and tokens are estimated caps:** the reservation counts input tokens as `ceil(0.5 × characters)` of system + cached context + user + the serialised output schema plus a fixed overhead allowance, prices them at the 5-minute cache-write rate and output at `max_tokens`; dispatch is refused once spent + reserved would cross the cap, but an attempt whose real token count exceeds its estimate is charged by the provider before the ledger can know, so the cap can be overshot by at most the underestimate of the attempts in flight. Every outcome records `reservationExceeded` and `overshootUsdMicro`; the report and the demo total them | The honest description the review asked for. No local tokenizer for Sonnet 5 exists; the `count_tokens` endpoint would give exact counts at the price of one extra request per attempt and is the phase-5 upgrade path if the recorded overshoot is ever material. The pricing-split test proves the rate arithmetic never under-reserves for a given count; it does not, and cannot, prove the count |
| Resume identity and exclusivity | Every import record stores an immutable `fingerprint` (source text hash, unit text hash, selected types, language, prompt config, chunk budget, plan rules, prompt version, model roles, schema version); the lock is taken first, the import is read and its fingerprint checked **under the lock**, and a mismatch is refused before any write. The lock is a directory lock (`lock/` created with an atomic `mkdir`, an `owner.json` with a random token, an mtime heartbeat); a stale lock (old mtime, or a dead owner pid on this host) is reclaimed by renaming it away first, so two reclaimers can never both win and nobody can delete a live lock; release removes the directory only while it still carries the holder's token. `leap generate` and `leap review` both hold it | Reusing an output directory with a different source, unit, language or chunking would mix old artefacts with new input; two writers would corrupt the JSONL ledgers; read-check-unlink reclamation was racy |
| Concurrency | Activities run in **one serial lane per type**; lanes run concurrently up to `--concurrency` (default 3). Within a lane the near-duplicate check sees every earlier promotion, so the check is exact; a budget refusal or infrastructure failure sets a shared stop flag, in-flight attempts settle, and every undispatched activity gets an explicit outcome (`failed` with `skipped: <reason>`, re-dispatched on resume) | The earlier `Promise.all` let workers keep spending after the import was marked failed and let same-type activities pass the duplicate check against one stale snapshot |
| Model roles (provisional, §13) | `parseUnit`, `extract`, `merge`, `align`: `claude-haiku-4-5-20251001`; `plan`, `produce`: `claude-sonnet-5` | Spec §8; confirmed by the phase-3 gate, not assumed |
| Review and acceptance | Minimal **revision-bound** records now: `AcceptanceRecord` (spec §4 `acceptance_decisions`) and `AlignmentReviewRecord` (`alignment_reviews`) in the store, written by `leap review` from the CLI; `mapping.csv` status becomes `suggested | confirmed | rejected | added`; the cost report gains accepted count and cost per accepted activity | The owner's ruling: the UI can wait, the quality gate and cost-per-accepted-activity measurement cannot. Phase 3 records its judgements with the same records |
| Synthetic fixtures | A labelled synthetic source (workplace electrical safety), a synthetic unit, a generated PDF of the same text, and hand-authored model responses shaped like the API | Establish pipeline correctness; the real vocational corpus and quality judgement belong to phase 3 and are kept apart |

## Global Constraints

- Node `>=20.19.0 <21` on every new package (`packages/generator`, matching the engine's pin); pnpm 10.33.2; `strict: true` from the first commit under `tsconfig.base.json`; `tsconfig.test.json` type-checks tests as in phase 1.
- Package scope `@leaplearn`; new workspace package `packages/generator`; `apps/cli` extended. `apps/cli-legacy` is frozen and untouched.
- The engine keeps its boundary (no network, `process.env|cwd|exit`, `console`); the **generator** may read `process.env` only in one file (`llm/anthropic-provider.ts` reads `ANTHROPIC_API_KEY` when no key is injected) and never calls `console`; the CLI is the only place that prints.
- **Exactly one call site talks to the Anthropic SDK** (`llm/anthropic-provider.ts`), with `maxRetries: 0`. Every model call goes through `callModel`, which reserves budget, writes an attempt-start record before dispatch and an attempt-outcome record after completion through the injected `AttemptRecorder`, and never retries. Every retry (content, transient or resumed) is a new attempt with its own start, outcome and reservation, and carries the logical call's stable `callKey` and a `retryIndex`. No placeholder content is ever written into a spec or a package.
- **Model request settings come only from `REQUEST_PROFILES` in `models.ts`**; no stage or producer sets `temperature`, `top_p`, `top_k` or `thinking`. Response content blocks are selected by `type`, never by position.
- **Four budget limits, two of them hard.** Requests and elapsed time are hard: the count is exact and the per-import deadline is checked before every dispatch and every backoff wait and bounds the adapter's timeout. Spend and tokens are **estimated caps**: a reservation covers the whole request (system, cached context, user text, serialised output schema, overhead allowance) at the cache-write input rate and `max_tokens` at the output rate; a dispatch whose reservation would cross a cap is refused before any record is written; an attempt whose real usage exceeds its reservation overshoots the cap by that difference, and every outcome records `reservationExceeded` and `overshootUsdMicro` so the overshoot is visible, never silent. No document, test or message calls the spend or token cap a ceiling.
- **Every dispatch and every retry wait checks the shared stop signal.** Once any lane has stopped the import (budget refusal, infrastructure failure, or a storage failure while recording an outcome), no further provider call is made anywhere; in-flight attempts settle; every lane finishes; only then is the import finalised and the directory lock released.
- **Every operation persists its result before it is marked succeeded**, through `runOperation`'s `persist` step; a persisted result is reused on resume even when the operation record was interrupted. Activity records are reconciled from the saved plan; a saved candidate revision resumes at compilation; promotion is idempotent and repairable. Resume refuses a changed `fingerprint` and requires the store's exclusive lock.
- **Provenance is derived, not copied:** an item's `conceptIds` are the concepts whose evidence it cites, its `criteriaIds` are the plan's criteria that those concepts support (per the alignment), and an activity's evidence is the union of its items' evidence.
- **Pricing lives in one file**, `packages/generator/src/llm/pricing.ts`, with `version`, `source` (URL) and `effectiveDate`; every cost row records `pricingVersion`. No rate appears anywhere else in code, tests or this plan except that file and the test that pins it.
- Model IDs live in one file, `packages/generator/src/llm/models.ts`, keyed by role.
- Costs are integers in USD micro-units (`costUsdMicro`); `costStatus` is `known` | `estimated` | `unavailable`; a missing usage never becomes zero cost.
- Provenance: every generated activity and every item carries `provenance` with at least one `evidenceId`; evidence quotes are verified as substrings of the stored text at their offsets (UTF-16 code units, half-open); `assertGeneratedProvenance` from `@leaplearn/shared` runs on every produced spec.
- Text handling (spec §9): HTML-bearing fields (`question`, `taskDescription`) may contain only what `sanitizeHtml` allows; producers are told to emit plain text and the converter wraps it in `<p>` after `escapeHtml`; every other string is plain text.
- Blanks: answers and tips never contain `*`, `/`, `:`; the passage never contains `*`; every answer occurs (case-insensitively, as a whole-word phrase) in the evidence text **that blank** cites.
- **SSRF guard:** `safeFetch` is the only outbound HTTP path in application code. Every hop resolves the host itself, classifies every address after IPv6 normalisation (mapped, compatible, NAT64 and 6to4 embedded IPv4 included), and connects through an undici `Agent` whose `connect.lookup` returns only the validated address, so the name is never resolved a second time. DNS resolution counts against the one total deadline.
- Conventional Commits. Attribution reflects who actually wrote the change: a commit authored by a Claude agent ends with the trailer naming that model (`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` etc.); a commit written by a person carries no trailer.
- **Exit codes:** `set -o pipefail` at the start of every shell session; a "passes" claim is valid only when the command's exit status was 0.
- **No real API calls in `pnpm verify`.** Unit and pipeline tests use `FakeProvider` (hand-authored responses, labelled synthetic) or `ReplayProvider` (fixtures recorded from real responses in Task 17). The real API is used only by the demo/record command with `--provider record` and an API key.
- Platform compatibility claims (h5p.com, Moodle) come only from `docs/testing/platform-checklist.md`, filled by hand; generation-quality claims come only from the phase-3 gate. Neither is asserted by any test in this phase.

## Execution workflow

Execute tasks in order; each ends with a commit. For each task: write the failing test where one is given, run it and see it fail, implement, run the named verification and confirm `exit=0`, then commit. Do not start a task while the previous task's verification is red. Sequential execution by one agent or person per task, with a review of the diff and the verification output between tasks, is the intended mode. Root verification stays `pnpm verify` (build → typecheck → lint → test → engine smoke); Task 17 adds the generator's replay test to it.

Repository: `/Users/benjaminjameswaller/Projects/personal/h5p-cli-creator`. Paths are relative to it.

## File structure after this phase

```
packages/shared/src/
  competency.ts                  UnitOfCompetency, PerformanceCriterion, Element
  concepts.ts                    Evidence, Concept, ConceptMap, Alignment
  generation.ts                  GenerationUsage, ImportStatus, ActivityStatus, RevisionState
packages/engine/src/
  errors.ts                      EngineErrorCode union; ValidationIssue gains optional `code`
  index.ts                       validate() classifies spec-attributable failures as issues
packages/generator/src/
  index.ts
  ingest/
    source-document.ts           SourceDocument, textHash, sentence segmentation with offsets
    text.ts  pdf.ts              ingestText, ingestMarkdown, ingestPdf
  llm/
    models.ts                    model ids by role; REQUEST_PROFILES (sampling and thinking per model)
    pricing.ts                   versioned pricing table (the only place rates live)
    cost.ts                      computeCost(usage, model); reserveInputTokens, reservationCost (the reservation estimate)
    types.ts                     ModelRequest, ModelResponse, Usage, AttemptStart (callKey, retryIndex), AttemptOutcome (reservationExceeded)
    schema.ts                    toStrictJsonSchema(zodSchema); toProviderSchema(zodSchema) (API-compatible projection)
    provider.ts                  ModelProvider interface; ProviderError (kind, status, requestId, retryAfterMs)
    anthropic-provider.ts        the only SDK call site (maxRetries 0)
    fake-provider.ts             scripted responses for tests
    replay-provider.ts           ReplayProvider + RecordingProvider (fixtures keyed by request hash)
    budget.ts                    Budget with four limits; reserve/settle
    call-model.ts                callModel(request, ctx): reserve -> start record -> dispatch -> outcome record -> settle
    runner.ts                    StageRunner: content-attempt feedback, transient retries, stable call keys
  net/safe-fetch.ts              SSRF-guarded fetch (pinned connection via undici Agent)
  prompts/
    system.ts                    reading levels, tones, grounding rules (from legacy tables)
  schemas/model-output.ts        UnitOut, ConceptsOut, MergeOut, AlignmentOut, PlanOut, MultiChoiceOut, BlanksOut, FlashcardsOut
  competency/parse-unit.ts
  concepts/
    chunk.ts  extract.ts  verify.ts  merge.ts  align.ts
  plan/planner.ts
  quality/checks.ts
  produce/
    producer.ts                  Producer interface + shared conversion helpers
    multi-choice.ts  blanks.ts  flashcards.ts  index.ts
  store/
    types.ts                     ImportStore interface (lock, acceptance and alignment-review records) + record types
    memory-store.ts
  pipeline/
    fingerprint.ts               runFingerprint(input, deps); IncompatibleResumeError
    run-import.ts                the steps of §5, resumable with crash-safe boundaries and per-type lanes
    operations.ts                runOperation (load/work/persist), reconcile, budgetFromLedger, lanes
packages/generator/test/
  fixtures/synthetic/            SYNTHETIC source, unit, PDF, model responses (see Task 3)
  fixtures/replay/               recorded real responses (Task 17)
  *.test.ts
apps/cli/src/
  generate.ts                    leap generate
  review.ts                      leap review (acceptance and alignment-review records)
  lock.ts                        acquireDirectoryLock (atomic mkdir, token, heartbeat, rename-then-remove reclaim)
  file-store.ts                  FileStore (atomic JSON, JSONL ledgers repaired before append, the directory lock)
  report.ts                      mapping.csv (review-aware status) + cost report (retry share by retryIndex, cost per accepted activity)
  image-resolver.ts              networkImageResolver uses safeFetch
docs/superpowers/specs/2026-09-18-generator-service-design.md   §3 amended (structured outputs, file store)
```

---

### Task 1: Engine error classification, and the layout docs

The final phase-1 review deferred this to phase 2's opening task (ledger Ruling 24). Spec-attributable failures raised while building a spec — a missing asset, an unsupported image type, a not-yet-implemented page kind, a schema-valid child with no handler, and Zod parse failures of the spec itself — become `ValidationIssue` rows with a path and a code, so a caller can map them to a 400 with a location. Engine integrity failures (lockfile, checksum, package corruption, assembler stream errors) stay exceptions.

**Files:**
- Modify: `packages/engine/src/errors.ts`, `packages/engine/src/index.ts`, `packages/engine/src/handlers/handler.ts`, `packages/engine/src/handlers/question-set.ts`, `packages/engine/src/handlers/interactive-book.ts`, `packages/engine/src/handlers/flashcards.ts`
- Modify: `packages/engine/test/determinism.test.ts`, `packages/engine/test/containers.test.ts`
- Modify: `README.md`, `CONTRIBUTING.md`

**Interfaces:**
- Produces: `export type EngineErrorCode = "VALIDATION" | "LIBRARY_NOT_LOCKED" | "PACKAGE_CORRUPT" | "PACKAGE_CHECKSUM" | "ASSET_LENGTH" | "ASSET_HASH" | "ASSET_MISSING" | "ASSET_TYPE" | "DUPLICATE_ENTRY" | "NOT_IMPLEMENTED" | "HANDLER_MISSING"`; `EngineError.code: EngineErrorCode`; `ValidationIssue = { path: string; message: string; code?: "SCHEMA" | "SEMANTICS" | "CLOSURE" | "ASSET_MISSING" | "ASSET_TYPE" | "NOT_IMPLEMENTED" | "HANDLER_MISSING" }`; `SPEC_ATTRIBUTABLE: ReadonlySet<EngineErrorCode>`; `validate()` returns issues (never throws) for schema failures and for `EngineError`s whose code is in `SPEC_ATTRIBUTABLE`; `compile*` throw `ValidationError(issues)` in the same cases.

- [ ] **Step 1: Replace the assertions that expect thrown validation failures, then add the new cases**

The owner's review requires this task to **replace** the existing assertions that expect `ZodError` or a thrown validation failure, not only append new tests. Assertions that expect exceptions for engine-integrity failures (bad asset hash, `disk gone`, `destination full`, `ENOENT`, checksum) stay exactly as they are.

In `packages/engine/test/determinism.test.ts`:

1. In "writes h5p.json, content/content.json, media and every closure library…", replace
```ts
    await expect(compileToFile(invalid, new Map(), resolve(dir, "out.h5p"), { registry })).rejects.toThrow();
```
with
```ts
    await expect(compileToFile(invalid, new Map(), resolve(dir, "out.h5p"), { registry })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [expect.objectContaining({ path: "answers", code: "SCHEMA" })] });
```
2. In "validate accepts an image-bearing spec when the manifest has the asset, and reports the missing asset otherwise", replace
```ts
    await expect(validate(load("flashcards"), new Map(), { registry })).rejects.toThrow(/asset card is not in the manifest/);
```
with
```ts
    expect(await validate(load("flashcards"), new Map(), { registry })).toEqual([{ path: "cards[1].imageAssetId", message: "asset card is not in the manifest", code: "ASSET_MISSING" }]);
    await expect(compileToBuffer(load("flashcards"), new Map(), { registry })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [{ path: "cards[1].imageAssetId", message: "asset card is not in the manifest", code: "ASSET_MISSING" }] });
```
3. In "rejects a flashcards spec whose two cards share an id…", replace the block from `const validationError: unknown = await validate(` through `rejects.toBeInstanceOf(ZodError);` with
```ts
    expect(await validate(duplicateFlashcards, assets, { registry })).toEqual([{ path: "cards[1].id", message: 'duplicate id "c1" in cards', code: "SCHEMA" }]);
    await expect(compileToBuffer(duplicateFlashcards, assets, { registry, revision: 1 })).rejects.toMatchObject({ name: "ValidationError", code: "VALIDATION", issues: [expect.objectContaining({ path: "cards[1].id", code: "SCHEMA" })] });
```
and delete the now-unused `import { ZodError } from "zod";` line (lint would fail on it).

4. Add inside `describe("compile")`:
```ts
  it("validate returns coded schema issues with a path instead of throwing", async () => {
    const badShape = { ...load("multi-choice"), answers: "nope" } as unknown as ActivitySpec;
    const issues = await validate(badShape, new Map(), { registry });
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue).toMatchObject({ code: "SCHEMA", path: expect.stringMatching(/^answers/) });
  });
```

Append to `packages/engine/test/containers.test.ts`:
```ts
  it("validate reports a child without a handler as an issue with the child's path", async () => {
    const spec = ActivitySpec.parse({ id: "qs-x", title: "T", type: "questionSet", children: [{ id: "t1", title: "T", type: "trueFalse", statement: "s", correct: true }] });
    const issues = await validate(spec, new Map(), { registry });
    expect(issues).toEqual([{ path: "children[0]", message: "no handler for trueFalse", code: "HANDLER_MISSING" }]);
  });
```
(`validate` and `registry` are already imported/created in those files; add the imports if not.)

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @leaplearn/engine exec vitest run test/determinism.test.ts test/containers.test.ts`. Expected: the replaced and the new cases fail (`validate` currently rejects and `compile*` throw `ZodError`).

- [ ] **Step 3: Implement**

`packages/engine/src/errors.ts` (replace):
```ts
export type EngineErrorCode =
  | "VALIDATION" | "LIBRARY_NOT_LOCKED" | "PACKAGE_CORRUPT" | "PACKAGE_CHECKSUM"
  | "ASSET_LENGTH" | "ASSET_HASH" | "ASSET_MISSING" | "ASSET_TYPE"
  | "DUPLICATE_ENTRY" | "NOT_IMPLEMENTED" | "HANDLER_MISSING";

export type IssueCode = "SCHEMA" | "SEMANTICS" | "CLOSURE" | "ASSET_MISSING" | "ASSET_TYPE" | "NOT_IMPLEMENTED" | "HANDLER_MISSING";

/** Failures the caller's spec caused, reported as issues by validate(); everything else is an engine or registry failure and stays an exception. */
export const SPEC_ATTRIBUTABLE: ReadonlySet<EngineErrorCode> = new Set(["ASSET_MISSING", "ASSET_TYPE", "NOT_IMPLEMENTED", "HANDLER_MISSING"]);

export class EngineError extends Error {
  constructor(message: string, public readonly code: EngineErrorCode, public readonly path?: string) {
    super(message);
    this.name = "EngineError";
  }
}

export interface ValidationIssue { path: string; message: string; code?: IssueCode; }

export class ValidationError extends EngineError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`, "VALIDATION");
    this.name = "ValidationError";
  }
}
```

Handlers gain paths on their spec-attributable throws (each is a one-line change):
- `packages/engine/src/handlers/flashcards.ts`: `new EngineError(\`asset ${c.imageAssetId} is not in the manifest\`, "ASSET_MISSING", \`cards[${index}].imageAssetId\`)` and `"ASSET_TYPE"` with the same path (use `spec.cards.map((c, index) => …)`).
- `packages/engine/src/handlers/interactive-book.ts`: image page asset errors carry `\`${path}.assetId\`` where `path` is the `chapters/ci/items/ii` path converted to `chapters[ci].items[ii]`; `NOT_IMPLEMENTED` for audio/video carries that item path; the cover image carries `coverImageAssetId`.
- `packages/engine/src/handlers/handler.ts` `requireHandler(children, type, path?)`: a third optional `path` argument forwarded to the `EngineError`; `question-set.ts` passes `\`children[${i}]\`` at both call sites (`requiredLibraries` becomes `spec.children.flatMap((c, i) => requireHandler(children, c.type, \`children[${i}]\`).requiredLibraries(c as never))`) and `interactive-book.ts` passes the item path. `index.ts`'s top-level `requireHandler(handlers, parsed.type)` passes `"type"`.

`packages/engine/src/index.ts`: replace `prepare()`'s head and add the classification:
```ts
import { ZodError } from "zod";
import { EngineError, SPEC_ATTRIBUTABLE, ValidationError, type ValidationIssue } from "./errors.js";

function zodIssues(err: ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({ path: i.path.map((p, n) => (typeof p === "number" ? `[${p}]` : n === 0 ? String(p) : `.${String(p)}`)).join(""), message: i.message, code: "SCHEMA" as const }));
}

/** Runs the spec through parse → build → semantics/closure; spec-attributable failures come back as issues. */
async function prepare(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions): Promise<Prepared> {
  const parsedResult = ActivitySpec.safeParse(spec);
  if (!parsedResult.success) return { issues: zodIssues(parsedResult.error) };
  const parsed = parsedResult.data;
  const handlers = createHandlerRegistry();
  try {
    const handler = requireHandler(handlers, parsed.type, "type");
    const ctx: BuildContext = { registry: options.registry, ids: createIdFactory(parsed.id, options.revision ?? 1), assets, mediaPaths: new Map() };
    const content = handler.build(parsed as never, ctx);
    const closure = await options.registry.closure(handler.requiredLibraries(parsed as never).map((n) => resolveLibraryKey(options.registry, n)));
    const closureKeys = closure.map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
    const issues: ValidationIssue[] = [
      ...(await validateParams(content, options.registry, ctx.mediaPaths)).map((i) => ({ ...i, code: "SEMANTICS" as const })),
      ...(await checkClosure(content, options.registry, closureKeys)).map((i) => ({ ...i, code: "CLOSURE" as const }))
    ];
    return { parsed, handler, content, closure, closureKeys, issues, ctx };
  } catch (err) {
    if (err instanceof EngineError && SPEC_ATTRIBUTABLE.has(err.code)) {
      return { issues: [{ path: err.path ?? "", message: err.message, code: err.code as ValidationIssue["code"] }] };
    }
    throw err;
  }
}
```
with
```ts
type Prepared =
  | { issues: ValidationIssue[]; parsed?: undefined }
  | { parsed: ActivitySpec; handler: ActivityHandler; content: H5PContent; closure: LockedLibrary[]; closureKeys: string[]; issues: ValidationIssue[]; ctx: BuildContext };
```
The assembler's own `ASSET_MISSING` (raised while writing) is unreachable in practice because every handler checks the manifest first; it stays an exception, which the doc comment on `SPEC_ATTRIBUTABLE` notes.

`validate` returns `prepared.issues`; `compile` and `compileToFile` throw `new ValidationError(prepared.issues)` when `prepared.parsed === undefined || prepared.issues.length > 0`, then proceed with the narrowed branch. Export `type EngineErrorCode, type IssueCode, SPEC_ATTRIBUTABLE` from `index.ts`.

- [ ] **Step 4: Docs**

`README.md` "Repository layout" section: replace `apps/cli-legacy/docs` with `apps/cli-legacy/developer-guides/` and `apps/cli-legacy/user-guides/`; fix the link `docs/developer-guides/api-integration.md` → `apps/cli-legacy/developer-guides/api-integration.md`. `CONTRIBUTING.md`: every command that must reach the legacy app becomes `pnpm --filter cli-legacy <script>` (`build`, `test -- <path>`, `test -- --watch`, `test -- --coverage`); the sentence "Build the project" gets "(the root `pnpm build` filters out `apps/cli-legacy`; use the filter form for the legacy CLI)".

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @leaplearn/engine test && pnpm --filter @leaplearn/engine typecheck && pnpm --filter @leaplearn/engine lint && pnpm --filter @leaplearn/engine build; echo "exit=$?"`. Expected `exit=0`; the golden snapshot and golden hash unchanged (`git status --short packages/engine/test` shows only the two test files).

```bash
git add packages/engine README.md CONTRIBUTING.md
git commit -m "feat(engine): report spec-attributable failures as validation issues; fix layout docs

validate() now returns issues with a path and a code for schema failures,
missing or unsupported assets, unimplemented page kinds and children
without a handler; compile() throws ValidationError for the same cases.
Engine and registry integrity failures remain exceptions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared contract additions, the generator package, model roles, pricing and cost

**Files:**
- Create: `packages/shared/src/competency.ts`, `packages/shared/src/concepts.ts`, `packages/shared/src/generation.ts`; modify `packages/shared/src/index.ts`
- Create: `packages/generator/package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `eslint.config.js` (copies of the engine's, name changed)
- Create: `packages/generator/src/index.ts`, `src/llm/models.ts`, `src/llm/pricing.ts`, `src/llm/types.ts`, `src/llm/cost.ts`
- Test: `packages/shared/test/generation-contract.test.ts`, `packages/generator/test/cost.test.ts`

**Interfaces:**
- Produces (shared): `PerformanceCriterion { id, number, text }`, `Element { id, number, text, performanceCriteria[] }`, `UnitOfCompetency { code, title, elements[], knowledgeEvidence: string[], performanceEvidence: string[], textHash }`; `Evidence { evidenceId, sentenceId, charStart, charEnd, quote }`, `Concept { conceptId, name, summary, evidence: Evidence[] }`, `ConceptMap { sourceId, textHash, concepts[], alignment?: Alignment }`, `Alignment { criteria: Array<{ criterionId, conceptIds: string[] }>, unsupportedCriteriaIds: string[] }`; `ImportStatus`, `ActivityStatus`, `RevisionState`, `CostStatus`, `GenerationUsage { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`.
- Produces (generator): `MODEL_ROLES`, `modelForRole(role)`, `REQUEST_PROFILES`, `requestProfile(model): { temperature: number | null; thinking: { type: "disabled" } | null }`; `PRICING` (version, source, effectiveDate, per-model rates in USD per million tokens); `computeCost(usage: GenerationUsage | null, model: string): { costUsdMicro: number | null; costStatus: CostStatus; pricingVersion: string }`; `estimateInputTokens(text)` (chunk sizing only), `reserveInputTokens(request)` and `reservationCost(model, inputTokens, outputTokens)` (the reservation estimate for the spend and token caps); the `llm/types.ts` record shapes used by every later task (`ModelRequest` has no sampling field; `AttemptStart` carries `callKey`, `retryIndex`, `retryReason`; `AttemptOutcome` carries `reservationExceeded`).
- Produces (shared, for the review records): `ACCEPTANCE_DECISIONS`, `ALIGNMENT_DECISIONS`, `MAPPING_STATUSES` and their Zod enums.

- [ ] **Step 1: Failing tests**

`packages/shared/test/generation-contract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { UnitOfCompetency, ConceptMap, Evidence, IMPORT_STATUSES } from "../src/index.js";

describe("generation contract", () => {
  it("parses a unit with ids assigned in code", () => {
    const u = UnitOfCompetency.parse({
      code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "a".repeat(64),
      elements: [{ id: "E1", number: "1", text: "Prepare to isolate", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Identify hazards" }] }],
      knowledgeEvidence: ["types of hazards"], performanceEvidence: []
    });
    expect(u.elements[0]?.performanceCriteria[0]?.id).toBe("PC1.1");
  });
  it("evidence requires a half-open span and a quote", () => {
    expect(() => Evidence.parse({ evidenceId: "e1", sentenceId: "s1", charStart: 5, charEnd: 5, quote: "" })).toThrow();
    expect(Evidence.parse({ evidenceId: "e1", sentenceId: "s1", charStart: 0, charEnd: 4, quote: "Lock" }).charEnd).toBe(4);
  });
  it("concept map alignment lists unsupported criteria", () => {
    const m = ConceptMap.parse({ sourceId: "src-1", textHash: "b".repeat(64), concepts: [], alignment: { criteria: [{ criterionId: "PC1.1", conceptIds: [] }], unsupportedCriteriaIds: ["PC1.1"] } });
    expect(m.alignment?.unsupportedCriteriaIds).toEqual(["PC1.1"]);
  });
  it("status enums are closed", () => {
    expect(IMPORT_STATUSES).toEqual(["queued", "ingesting", "extracting", "planning", "generating", "ready", "ready_with_failures", "failed"]);
  });
});
```

`packages/generator/test/cost.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeCost, estimateInputTokens, reservationCost, reserveInputTokens, RESERVATION_TOKENS_PER_CHAR, STRUCTURED_OUTPUT_OVERHEAD_TOKENS } from "../src/llm/cost.js";
import { PRICING } from "../src/llm/pricing.js";
import { MODEL_ROLES, modelForRole, requestProfile } from "../src/llm/models.js";

describe("cost", () => {
  it("prices every token class from the versioned table, in USD micro-units", () => {
    const model = modelForRole("produce");
    const rates = PRICING.models[model]!;
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    const cost = computeCost(usage, model);
    const expected = Math.round((rates.inputPerMTok + rates.outputPerMTok + rates.cacheReadPerMTok + rates.cacheWrite5mPerMTok) * 1_000_000);
    expect(cost).toEqual({ costUsdMicro: expected, costStatus: "known", pricingVersion: PRICING.version });
  });
  it("rounds to the nearest micro-dollar for small usage", () => {
    const model = modelForRole("extract");
    const cost = computeCost({ inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model);
    expect(cost.costUsdMicro).toBe(Math.round(PRICING.models[model]!.inputPerMTok));
  });
  it("prices reserved token counts at the dearest input class, so a correct count can never under-reserve", () => {
    const model = modelForRole("produce");
    const reserved = reservationCost(model, 10_000, 100);
    const splits = [
      { inputTokens: 10_000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { inputTokens: 0, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 10_000 },
      { inputTokens: 0, outputTokens: 100, cacheReadTokens: 10_000, cacheWriteTokens: 0 },
      { inputTokens: 4_000, outputTokens: 100, cacheReadTokens: 3_000, cacheWriteTokens: 3_000 }
    ];
    for (const usage of splits) expect(computeCost(usage, model).costUsdMicro!).toBeLessThanOrEqual(reserved);
    expect(reserved).toBe(computeCost(splits[1]!, model).costUsdMicro); // the cache-write split is the ceiling, exactly
  });
  it("reserves input tokens for the whole request, schema included, above the sizing estimate", () => {
    const request = { system: "s".repeat(1000), cachedContext: "c".repeat(1000), user: "u".repeat(1000), outputSchema: { type: "object", properties: { a: { type: "string" } } } };
    const schemaChars = JSON.stringify(request.outputSchema).length;
    expect(reserveInputTokens(request)).toBe(Math.ceil((3000 + schemaChars) * RESERVATION_TOKENS_PER_CHAR) + STRUCTURED_OUTPUT_OVERHEAD_TOKENS);
    expect(reserveInputTokens(request)).toBeGreaterThan(estimateInputTokens(request.system + request.cachedContext + request.user));
  });
  it("has a request profile for every model a role names", () => {
    for (const model of new Set(Object.values(MODEL_ROLES))) expect(requestProfile(model)).toBeDefined();
    expect(requestProfile("claude-sonnet-5")).toEqual({ temperature: null, thinking: { type: "disabled" } });
    expect(requestProfile("claude-haiku-4-5-20251001")).toEqual({ temperature: 0, thinking: null });
    expect(() => requestProfile("claude-unknown")).toThrow(/no request profile/);
  });
  it("never records zero for missing usage", () => {
    expect(computeCost(null, modelForRole("produce"))).toEqual({ costUsdMicro: null, costStatus: "unavailable", pricingVersion: PRICING.version });
  });
  it("refuses an unpriced model", () => {
    expect(() => computeCost({ inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, "claude-unknown")).toThrow(/no pricing/);
  });
  it("pricing table carries provenance", () => {
    expect(PRICING.source).toMatch(/^https:\/\/platform\.claude\.com\//);
    expect(PRICING.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const role of ["parseUnit", "extract", "merge", "align", "plan", "produce"] as const) expect(PRICING.models[modelForRole(role)]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to see them fail** (`pnpm --filter @leaplearn/shared test`, then `cd packages/generator && pnpm install && pnpm test` after creating the package files below).

- [ ] **Step 3: Shared contract**

`packages/shared/src/competency.ts`:
```ts
import { z } from "zod";

export const PerformanceCriterion = z.object({ id: z.string().regex(/^PC\d+\.\d+$/), number: z.string().min(1), text: z.string().min(1) });
export const Element = z.object({ id: z.string().regex(/^E\d+$/), number: z.string().min(1), text: z.string().min(1), performanceCriteria: z.array(PerformanceCriterion).min(1) });
export const UnitOfCompetency = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  elements: z.array(Element).min(1),
  knowledgeEvidence: z.array(z.string().min(1)).default([]),
  performanceEvidence: z.array(z.string().min(1)).default([]),
  textHash: z.string().regex(/^[0-9a-f]{64}$/)
});
export type PerformanceCriterion = z.infer<typeof PerformanceCriterion>;
export type Element = z.infer<typeof Element>;
export type UnitOfCompetency = z.infer<typeof UnitOfCompetency>;

export function criteriaOf(unit: UnitOfCompetency): PerformanceCriterion[] {
  return unit.elements.flatMap((e) => e.performanceCriteria);
}
```

`packages/shared/src/concepts.ts`:
```ts
import { z } from "zod";

/** Offsets are UTF-16 code units into the stored extracted text, half-open [charStart, charEnd). */
export const Evidence = z.object({
  evidenceId: z.string().min(1),
  sentenceId: z.string().min(1),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(1),
  quote: z.string().min(1)
}).refine((e) => e.charEnd > e.charStart, { message: "charEnd must be greater than charStart", path: ["charEnd"] });

export const Concept = z.object({
  conceptId: z.string().min(1),
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  evidence: z.array(Evidence).min(1)
});

export const Alignment = z.object({
  criteria: z.array(z.object({ criterionId: z.string().min(1), conceptIds: z.array(z.string().min(1)) })),
  unsupportedCriteriaIds: z.array(z.string().min(1))
});

export const ConceptMap = z.object({
  sourceId: z.string().min(1),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  concepts: z.array(Concept),
  alignment: Alignment.optional()
});
export type Evidence = z.infer<typeof Evidence>;
export type Concept = z.infer<typeof Concept>;
export type Alignment = z.infer<typeof Alignment>;
export type ConceptMap = z.infer<typeof ConceptMap>;
```

`packages/shared/src/generation.ts`:
```ts
import { z } from "zod";

export const IMPORT_STATUSES = ["queued", "ingesting", "extracting", "planning", "generating", "ready", "ready_with_failures", "failed"] as const;
export const ACTIVITY_STATUSES = ["planned", "generating", "generated", "built", "promoted", "failed", "dropped"] as const;
export const REVISION_STATES = ["candidate", "promoted", "superseded", "rejected"] as const;
export const COST_STATUSES = ["known", "estimated", "unavailable"] as const;
/** Spec §4 acceptance_decisions.decision: a human judged the promoted revision good or not. */
export const ACCEPTANCE_DECISIONS = ["accepted", "rejected"] as const;
/** Spec §4 alignment_reviews.decision, bound to one revision (and one item when the criterion is on an item). */
export const ALIGNMENT_DECISIONS = ["confirmed", "rejected", "added"] as const;
/** The status column of mapping.csv: `suggested` until a review exists for that row. */
export const MAPPING_STATUSES = ["suggested", "confirmed", "rejected", "added"] as const;

export const ImportStatus = z.enum(IMPORT_STATUSES);
export const ActivityStatus = z.enum(ACTIVITY_STATUSES);
export const RevisionState = z.enum(REVISION_STATES);
export const CostStatus = z.enum(COST_STATUSES);
export const AcceptanceDecision = z.enum(ACCEPTANCE_DECISIONS);
export const AlignmentDecision = z.enum(ALIGNMENT_DECISIONS);
export const MappingStatus = z.enum(MAPPING_STATUSES);
export type ImportStatus = z.infer<typeof ImportStatus>;
export type ActivityStatus = z.infer<typeof ActivityStatus>;
export type RevisionState = z.infer<typeof RevisionState>;
export type CostStatus = z.infer<typeof CostStatus>;
export type AcceptanceDecision = z.infer<typeof AcceptanceDecision>;
export type AlignmentDecision = z.infer<typeof AlignmentDecision>;
export type MappingStatus = z.infer<typeof MappingStatus>;

export const GenerationUsage = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0),
  cacheWriteTokens: z.number().int().min(0)
});
export type GenerationUsage = z.infer<typeof GenerationUsage>;
```
Append to `packages/shared/src/index.ts`:
```ts
export * from "./competency.js";
export * from "./concepts.js";
export * from "./generation.js";
```

- [ ] **Step 4: Generator package files**

`packages/generator/package.json`:
```json
{
  "name": "@leaplearn/generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.19.0 <21" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.127.0",
    "@leaplearn/engine": "workspace:*",
    "@leaplearn/shared": "workspace:*",
    "pdf-parse": "^2.4.5",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "pdf-lib": "^1.17.1",
    "typescript": "~5.9.0",
    "vitest": "^3.2.0",
    "eslint": "^9", "typescript-eslint": "^8", "@eslint/js": "^9"
  }
}
```
`tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts` (`include: ["test/**/*.test.ts"]`), `eslint.config.js`: copies of `packages/engine`'s (no smoke exclusion needed).

`packages/generator/src/llm/models.ts`:
```ts
/** Model IDs by role (spec §8, §13). Provisional until the phase-3 quality gate; nothing else names a model. */
export const MODEL_ROLES = {
  parseUnit: "claude-haiku-4-5-20251001",
  extract: "claude-haiku-4-5-20251001",
  merge: "claude-haiku-4-5-20251001",
  align: "claude-haiku-4-5-20251001",
  plan: "claude-sonnet-5",
  produce: "claude-sonnet-5"
} as const;
export type ModelRole = keyof typeof MODEL_ROLES;
export type ModelId = (typeof MODEL_ROLES)[ModelRole];

export function modelForRole(role: ModelRole): ModelId {
  return MODEL_ROLES[role];
}

/**
 * Request settings the adapter applies per model; no stage sets them. Sonnet 5 returns 400 for a
 * non-default temperature/top_p/top_k and runs adaptive thinking unless told not to (thinking tokens
 * bill against max_tokens), so it gets no sampling parameter and thinking disabled. Haiku 4.5 rejects
 * adaptive thinking and accepts temperature.
 */
export interface RequestProfile {
  temperature: number | null;
  thinking: { type: "disabled" } | null;
}

export const REQUEST_PROFILES: Record<ModelId, RequestProfile> = {
  "claude-sonnet-5": { temperature: null, thinking: { type: "disabled" } },
  "claude-haiku-4-5-20251001": { temperature: 0, thinking: null }
};

export function requestProfile(model: string): RequestProfile {
  const profile = (REQUEST_PROFILES as Record<string, RequestProfile | undefined>)[model];
  if (!profile) throw new Error(`no request profile for model ${model}; add it to REQUEST_PROFILES`);
  return profile;
}
```

`packages/generator/src/llm/pricing.ts` — the only place rates live:
```ts
export interface ModelRates {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
}

/**
 * USD per million tokens. Update `version` and `effectiveDate` together whenever a rate changes;
 * every cost row records the version it was computed with.
 */
export const PRICING = {
  version: "2026-09-19",
  effectiveDate: "2026-09-19",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  models: {
    "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10, cacheWrite5mPerMTok: 2.5, cacheWrite1hPerMTok: 4, cacheReadPerMTok: 0.2 },
    "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5, cacheWrite5mPerMTok: 1.25, cacheWrite1hPerMTok: 2, cacheReadPerMTok: 0.1 }
  } as Record<string, ModelRates>
} as const;
```

`packages/generator/src/llm/cost.ts`:
```ts
import type { CostStatus, GenerationUsage } from "@leaplearn/shared";
import { PRICING } from "./pricing.js";

export interface CostResult { costUsdMicro: number | null; costStatus: CostStatus; pricingVersion: string; }

/** Cache writes are priced at the 5-minute rate: the adapter only ever requests 5-minute caching. */
export function computeCost(usage: GenerationUsage | null, model: string): CostResult {
  const rates = PRICING.models[model];
  if (!rates) throw new Error(`no pricing for model ${model} (pricing version ${PRICING.version})`);
  if (!usage) return { costUsdMicro: null, costStatus: "unavailable", pricingVersion: PRICING.version };

  const usd = (usage.inputTokens * rates.inputPerMTok + usage.outputTokens * rates.outputPerMTok + usage.cacheReadTokens * rates.cacheReadPerMTok + usage.cacheWriteTokens * rates.cacheWrite5mPerMTok) / 1_000_000;
  return { costUsdMicro: Math.round(usd * 1_000_000), costStatus: "known", pricingVersion: PRICING.version };
}

/** Sizing estimate for chunking prompts to a working size; never used for a reservation. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Reservation estimate for the spend and token caps. 0.5 tokens per character and the overhead
 * allowance are calibration constants, not a proven bound: no local tokenizer exists for Sonnet 5,
 * and uploaded text, other languages or code may tokenise more densely. Every outcome records
 * whether and by how much the actual usage exceeded the reservation (Task 4) and the report and
 * demo total the overshoot (Tasks 15, 17); the count_tokens endpoint is the exact alternative
 * when that overshoot matters (one extra request per attempt).
 */
export const RESERVATION_TOKENS_PER_CHAR = 0.5;
export const STRUCTURED_OUTPUT_OVERHEAD_TOKENS = 500;

export interface ReservableRequest { system: string; cachedContext?: string; user: string; outputSchema: Record<string, unknown>; }

export function reserveInputTokens(request: ReservableRequest): number {
  const characters = request.system.length + (request.cachedContext?.length ?? 0) + request.user.length + JSON.stringify(request.outputSchema).length;
  return Math.ceil(characters * RESERVATION_TOKENS_PER_CHAR) + STRUCTURED_OUTPUT_OVERHEAD_TOKENS;
}

/** The most the attempt can cost for the reserved token counts: every input token at the 5-minute cache-write rate (the dearest input category the adapter can incur), every output token at the output rate. USD/MTok × tokens is exactly µUSD. The counts themselves are estimates (see above). */
export function reservationCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING.models[model];
  if (!rates) throw new Error(`no pricing for model ${model} (pricing version ${PRICING.version})`);
  return Math.ceil(inputTokens * rates.cacheWrite5mPerMTok + outputTokens * rates.outputPerMTok);
}
```

`packages/generator/src/llm/types.ts` (record shapes for the whole phase):
```ts
import type { CostStatus, GenerationUsage } from "@leaplearn/shared";
import type { ModelId, ModelRole } from "./models.js";

export type Purpose = ModelRole;

export interface ModelRequest {
  purpose: Purpose;
  model: ModelId;
  system: string;
  /** Stable context that should be cached (concept map, unit); cached with a 5-minute breakpoint when present. */
  cachedContext?: string;
  user: string;
  maxOutputTokens: number;
  /** Provider-compatible JSON Schema (from toProviderSchema) the response must satisfy; the provider enforces it natively. */
  outputSchema: Record<string, unknown>;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal" | "model_context_window_exceeded";

export interface ModelResponse {
  providerRequestId: string | null;
  model: string;
  stopReason: StopReason;
  /** Raw JSON text of the structured output (undefined when the model refused or was cut off). */
  outputText: string | undefined;
  rawUsage: Record<string, unknown> | null;
  usage: GenerationUsage | null;
  latencyMs: number;
}

export type AttemptStatus = "ok" | "content_error" | "transient_error" | "provider_error";
/** Why this attempt exists beyond the first for its call key: a content rejection, a transient provider failure, or a resumed operation. */
export type RetryReason = "content" | "transient" | "resume";

export interface AttemptStart {
  event: "start";
  attemptId: string;
  operationId: string;
  /** Stable identity of the logical call within the import (e.g. `extract:chunk-2`, `merge`, `produce:act-3`); retries share it. */
  callKey: string;
  /** 0 for the first attempt of a call key in the import; counts every earlier attempt with the same key, across operations and resumptions. */
  retryIndex: number;
  retryReason: RetryReason | null;
  /** 1-based content attempt within the operation (transient retries do not advance it). */
  attempt: number;
  purpose: Purpose;
  provider: "anthropic" | "fake" | "replay";
  model: string;
  credentialOwner: "org" | "server";
  reservedInputTokens: number;
  reservedOutputTokens: number;
  reservedUsdMicro: number;
  startedAt: string;
}

export interface AttemptOutcome {
  event: "outcome";
  attemptId: string;
  operationId: string;
  providerRequestId: string | null;
  rawUsage: Record<string, unknown> | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  latencyMs: number;
  pricingVersion: string;
  costUsdMicro: number | null;
  costStatus: CostStatus;
  stopReason: StopReason | null;
  status: AttemptStatus;
  error: string | null;
  /** True when input + cache-read + cache-write tokens exceeded reservedInputTokens: the estimate under-counted this attempt. */
  reservationExceeded: boolean;
  /** max(0, costUsdMicro − reservedUsdMicro): what this attempt cost beyond its reservation; null when the cost is unknown. */
  overshootUsdMicro: number | null;
  completedAt: string;
}

export type AttemptEvent = AttemptStart | AttemptOutcome;

export interface AttemptRecorder {
  recordStart(start: AttemptStart): Promise<void>;
  recordOutcome(outcome: AttemptOutcome): Promise<void>;
}
```

`packages/generator/src/index.ts` (grown in later tasks):
```ts
export * from "./llm/models.js";
export * from "./llm/pricing.js";
export * from "./llm/cost.js";
export * from "./llm/types.js";
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm install && pnpm --filter @leaplearn/shared build && pnpm --filter @leaplearn/shared test && pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/shared packages/generator pnpm-lock.yaml
git commit -m "feat(generator): scaffold package with model roles, versioned pricing and cost; add competency and concept contracts to shared

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Ingestion (text, markdown, PDF), sentence spans, and the synthetic fixture set

**Files:**
- Create: `packages/generator/src/ingest/source-document.ts`, `src/ingest/text.ts`, `src/ingest/pdf.ts`, `src/ingest/index.ts`
- Create: `packages/generator/test/fixtures/synthetic/README.md`, `source-electrical-safety.md`, `unit-synele001.txt`, `source-electrical-safety.pdf` (generated), `packages/generator/scripts/make-synthetic-pdf.ts`
- Test: `packages/generator/test/ingest.test.ts`

**Interfaces:**
- Produces: `Sentence { sentenceId: string; charStart: number; charEnd: number; text: string }`; `SourceDocument { sourceId, kind: "text" | "markdown" | "pdf", text, textHash, sentences: Sentence[], metadata: { fileName?: string; pages?: number; characters: number } }`; `segmentSentences(text): Sentence[]` (ids `s1…`, offsets into `text`, half-open, `text.slice(charStart, charEnd) === sentence.text`); `textHash(text): string` (SHA-256 hex); `ingestText(text, opts)`, `ingestMarkdown(md, opts)` (strips `#` heading markers, list bullets and emphasis markers, keeps the words), `ingestPdf(bytes, opts)` (pdf-parse 2.4 `PDFParse`, text layer only); `MAX_SOURCE_CHARACTERS = 300_000` (spec §5: reject, never truncate); `SourceTooLargeError`, `EmptySourceError`.

- [ ] **Step 1: The synthetic fixtures (labelled)**

`packages/generator/test/fixtures/synthetic/README.md`:
```markdown
# Synthetic fixtures (not a real corpus)

Everything in this directory is invented for pipeline tests: the "unit of competency" is not a
training.gov.au unit and the safety text is not authoritative guidance. The fixtures exist to prove
that ingestion, evidence verification, chunk merging, alignment and generation work mechanically.
They say nothing about educational quality; that is the phase-3 gate, which uses a real corpus kept
outside this directory.

Designed properties:
- `source-electrical-safety.md`: about 40 sentences. The concept "lockout and tagout" appears in
  section 2 and again in section 5 (a repeated concept the merge pass must unify). With the test
  chunk budget of 330 estimated tokens, the sentence about "test for dead" at the end of section 3
  and its follow-up at the start of section 4 fall in different chunks (evidence for one concept
  spanning a chunk boundary).
- `unit-synele001.txt`: three elements, seven performance criteria. PC3.2 ("Complete an incident
  report") has no support anywhere in the source and must be reported as unsupported.
- `source-electrical-safety.pdf`: generated from the markdown by `scripts/make-synthetic-pdf.ts`
  (pdf-lib), so the PDF ingestion test can check the same sentences survive the text layer.
- Fake model responses for the pipeline tests are built *in test code* from the ingested
  document (sentence ids are looked up by their text), so they never drift from the fixture. They
  are synthetic; recorded real responses live in `../replay/`.
```

`packages/generator/test/fixtures/synthetic/source-electrical-safety.md`:
```markdown
# Working safely around electrical equipment (synthetic training text)

## 1. Why electrical isolation matters

Electricity can injure or kill a worker in less than a second. Most serious electrical injuries at work happen when someone touches a part that they believed was de-energised. Isolation is the process of disconnecting equipment from every source of electrical energy before work begins. A worker who isolates correctly removes the hazard instead of managing it. Every site procedure in this text assumes that isolation comes first and that nobody relies on a switch position alone.

## 2. Lockout and tagout

Lockout and tagout is the method used to keep isolated equipment isolated. A lockout device is a padlock or hasp that physically prevents an isolator from being closed. A tag is a warning label attached to the lockout device that names the worker, the date and the reason for the isolation. Only the worker who applied a lock may remove it. If several workers are involved, each worker applies their own lock to a multi-lock hasp so that the equipment cannot be re-energised until the last lock is removed. A tag without a lock is a warning, not a control, and must never be used on its own where a lock can be fitted.

## 3. Identifying hazards before work starts

Before isolating, the worker inspects the work area and the equipment. Typical hazards are damaged insulation, exposed conductors, moisture near live parts, stored energy in capacitors, and equipment fed from more than one supply. Equipment with two supplies is dangerous because isolating one supply leaves the other live. The worker records the hazards found and the controls chosen on the isolation permit. A permit is signed by the worker and by a supervisor before any conductor is touched. After the isolator is opened and locked, the worker must test for dead at the point of work using a voltage tester rated for the circuit.

## 4. Testing for dead

Testing for dead confirms that the conductors to be worked on carry no voltage. The tester is proved on a known live source immediately before the test and again immediately after it. If the tester fails either proving check, the test result is discarded and the tester is replaced. The worker tests between every pair of conductors and between each conductor and earth. A reading of zero on an unproved tester proves nothing. The result of the test is written on the permit before work begins.

## 5. Working and restoring supply

Work proceeds only inside the boundary described on the permit. When the work is complete, the worker removes tools and materials, checks that guards and covers are refitted, and confirms that everyone has left the isolated zone. Each worker then removes only their own lock from the hasp. The last lock removed is the lock of the worker who holds the permit, and only after the supervisor has countersigned the completion section. Lockout and tagout ends when the permit is closed, never before. Restoring supply while a tag is still fitted is a serious breach because it means a lock has been removed without authority.

## 6. Personal protective equipment

Insulated gloves are inspected for pinholes by rolling them to trap air before each use. Safety glasses protect against arc flash particles. Non-conductive footwear is worn whenever a floor may be damp. Personal protective equipment reduces the severity of an injury; it does not replace isolation. Rings, watches and metal jewellery are removed before electrical work because they conduct current and can cause deep burns.
```

`packages/generator/test/fixtures/synthetic/unit-synele001.txt`:
```
SYNELE001 Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)

Application
This synthetic unit describes the skills required to isolate electrical equipment, confirm isolation by testing, and restore supply safely.

Elements and Performance Criteria
1. Prepare to isolate equipment
1.1 Identify electrical hazards in the work area and record them on the isolation permit
1.2 Confirm every supply to the equipment, including secondary supplies
2. Isolate and secure equipment
2.1 Apply lockout devices and tags in accordance with site procedure
2.2 Test for dead using a proved voltage tester
3. Restore supply
3.1 Remove locks and tags in the correct sequence after work is complete
3.2 Complete an incident report for any breach of isolation
3.3 Confirm guards and covers are refitted before supply is restored

Knowledge Evidence
- types of electrical hazards including stored energy and multiple supplies
- purpose of lockout devices and tags

Performance Evidence
- isolate and test at least one item of equipment fed from two supplies
```

`packages/generator/scripts/make-synthetic-pdf.ts` (run once; the PDF is committed):
```ts
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const dir = resolve(import.meta.dirname, "../test/fixtures/synthetic");
const md = await readFile(resolve(dir, "source-electrical-safety.md"), "utf8");
const paragraphs = md.split(/\n{2,}/).map((p) => p.replace(/^#+\s*/, "").replace(/\n/g, " ").trim()).filter(Boolean);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const size = 11; const lineHeight = 14; const margin = 56; const width = 595; const height = 842;
let page = doc.addPage([width, height]); let y = height - margin;
const wrap = (text: string): string[] => {
  const words = text.split(" "); const lines: string[] = []; let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > width - 2 * margin) { lines.push(line); line = w; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
};
for (const p of paragraphs) {
  for (const line of wrap(p)) {
    if (y < margin) { page = doc.addPage([width, height]); y = height - margin; }
    page.drawText(line, { x: margin, y, size, font }); y -= lineHeight;
  }
  y -= lineHeight;
}
await writeFile(resolve(dir, "source-electrical-safety.pdf"), await doc.save());
process.stdout.write(`wrote ${doc.getPageCount()} page(s)\n`);
```
Run: `pnpm --filter @leaplearn/generator exec node --experimental-strip-types scripts/make-synthetic-pdf.ts` fails on Node 20 (no type stripping); use `pnpm --filter @leaplearn/generator exec tsc -p tsconfig.scripts.json && node scripts/dist/make-synthetic-pdf.js` with a two-line `tsconfig.scripts.json` (`extends ../../tsconfig.base.json`, `include: ["scripts"]`, `outDir: "scripts/dist"`, `rootDir: "scripts"`); add `scripts/dist/` to `.gitignore`, and append `&& tsc -p tsconfig.scripts.json --noEmit` to the package's `typecheck` script so the generator script stays type-checked. Expected: `wrote 2 page(s)` (or 3); commit the PDF.

- [ ] **Step 2: Failing tests**

`packages/generator/test/ingest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestMarkdown, ingestPdf, ingestText, segmentSentences, textHash, MAX_SOURCE_CHARACTERS } from "../src/ingest/index.js";

const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");

describe("sentence segmentation", () => {
  it("assigns ids and half-open offsets that slice back to the sentence", () => {
    const text = "Lock it out. Then test for dead!  Finally, restore supply?\nNew paragraph here.";
    const s = segmentSentences(text);
    expect(s.map((x) => x.text)).toEqual(["Lock it out.", "Then test for dead!", "Finally, restore supply?", "New paragraph here."]);
    expect(s.map((x) => x.sentenceId)).toEqual(["s1", "s2", "s3", "s4"]);
    for (const x of s) expect(text.slice(x.charStart, x.charEnd)).toBe(x.text);
  });
  it("does not split on decimals or common abbreviations", () => {
    const s = segmentSentences("Clause 1.2 applies e.g. to gloves. Next sentence.");
    expect(s).toHaveLength(2);
  });
});

describe("ingest", () => {
  it("text: hashes the stored text and counts characters", async () => {
    const doc = await ingestText("Alpha. Beta.", { sourceId: "src-1" });
    expect(doc.textHash).toBe(textHash("Alpha. Beta."));
    expect(doc.sentences).toHaveLength(2);
    expect(doc.metadata.characters).toBe(12);
  });
  it("markdown: strips heading and list markers but keeps the words and offsets consistent", async () => {
    const md = await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8");
    const doc = await ingestMarkdown(md, { sourceId: "src-md" });
    expect(doc.text).not.toMatch(/^#/m);
    expect(doc.text).toContain("Lockout and tagout is the method used to keep isolated equipment isolated.");
    expect(doc.sentences.length).toBeGreaterThan(35);
    for (const s of doc.sentences) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
  it("pdf: extracts the text layer and the same key sentences", async () => {
    const bytes = await readFile(resolve(fixtures, "source-electrical-safety.pdf"));
    const doc = await ingestPdf(bytes, { sourceId: "src-pdf", fileName: "source-electrical-safety.pdf" });
    expect(doc.kind).toBe("pdf");
    expect(doc.metadata.pages).toBeGreaterThanOrEqual(2);
    const flat = doc.text.replace(/\s+/g, " ");
    expect(flat).toContain("Only the worker who applied a lock may remove it.");
    expect(flat).toContain("A reading of zero on an unproved tester proves nothing.");
    expect(doc.sentences.some((s) => s.text.includes("test for dead"))).toBe(true);
  });
  it("rejects empty and oversized input with a message, never truncating", async () => {
    await expect(ingestText("   ", { sourceId: "x" })).rejects.toThrow(/empty/);
    await expect(ingestText("a".repeat(MAX_SOURCE_CHARACTERS + 1), { sourceId: "x" })).rejects.toThrow(/300,000/);
  });
});
```

- [ ] **Step 3: Run to see them fail**, then implement.

`packages/generator/src/ingest/source-document.ts`:
```ts
import { createHash } from "node:crypto";

export interface Sentence { sentenceId: string; charStart: number; charEnd: number; text: string; }
export type SourceKind = "text" | "markdown" | "pdf";
export interface SourceDocument {
  sourceId: string;
  kind: SourceKind;
  text: string;
  textHash: string;
  sentences: Sentence[];
  metadata: { fileName?: string; pages?: number; characters: number };
}
export interface IngestOptions { sourceId: string; fileName?: string; }

export const MAX_SOURCE_CHARACTERS = 300_000;

export class EmptySourceError extends Error { constructor() { super("source is empty after extraction"); this.name = "EmptySourceError"; } }
export class SourceTooLargeError extends Error {
  constructor(characters: number) { super(`source has ${characters.toLocaleString("en-US")} characters, above the limit of ${MAX_SOURCE_CHARACTERS.toLocaleString("en-US")}; split it rather than truncating`); this.name = "SourceTooLargeError"; }
}

export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf", "no", "fig", "mr", "mrs", "ms", "dr"]);
const TERMINATOR = /[.!?]+["')\]]?/g;

/** Splits on sentence terminators followed by whitespace (or end), skipping decimals and common abbreviations; also splits on newlines. Offsets index the original text. */
export function segmentSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) sentences.push({ sentenceId: `s${sentences.length + 1}`, charStart: start + leading, charEnd: start + leading + trimmed.length, text: trimmed });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") { push(i); start = i + 1; continue; }
    if (ch === "." || ch === "!" || ch === "?") {
      TERMINATOR.lastIndex = i;
      const m = TERMINATOR.exec(text);
      if (!m || m.index !== i) continue;
      const end = i + m[0].length;
      const next = text[end];
      const atEnd = end >= text.length;
      if (!atEnd && next !== undefined && !/\s/.test(next)) continue;
      const before = text.slice(Math.max(start, i - 6), i);
      const word = before.split(/\s+/).pop()?.toLowerCase() ?? "";
      if (ch === "." && /\d$/.test(before) && next !== undefined && /\d/.test(text[end + 1] ?? "")) continue;
      if (ch === "." && ABBREVIATIONS.has(word)) continue;
      push(end);
      i = end - 1;
    }
  }
  push(text.length);
  return sentences;
}

export function buildDocument(kind: SourceKind, text: string, opts: IngestOptions, extra: { pages?: number } = {}): SourceDocument {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (normalised.length === 0) throw new EmptySourceError();
  if (normalised.length > MAX_SOURCE_CHARACTERS) throw new SourceTooLargeError(normalised.length);
  const metadata: SourceDocument["metadata"] = { characters: normalised.length };
  if (opts.fileName !== undefined) metadata.fileName = opts.fileName;
  if (extra.pages !== undefined) metadata.pages = extra.pages;
  return { sourceId: opts.sourceId, kind, text: normalised, textHash: textHash(normalised), sentences: segmentSentences(normalised), metadata };
}
```
Note on the decimal rule: `"1.2 applies"` — the character after the `.` is `2`, not whitespace, so the terminator check already skips it; the explicit decimal branch covers `"1. 2"`-style spacing. The abbreviation set is small on purpose; it is a synthetic-text baseline, not a linguistic segmenter.

`packages/generator/src/ingest/text.ts`:
```ts
import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

export async function ingestText(text: string, opts: IngestOptions): Promise<SourceDocument> {
  return buildDocument("text", text, opts);
}

/** Keeps the words, drops markdown syntax: ATX headings, list bullets, emphasis markers, inline code ticks, links keep their text. */
export function markdownToText(md: string): string {
  return md
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1");
}

export async function ingestMarkdown(md: string, opts: IngestOptions): Promise<SourceDocument> {
  return buildDocument("markdown", markdownToText(md), opts);
}
```

`packages/generator/src/ingest/pdf.ts` (pdf-parse 2.4 API: `new PDFParse({ data })`, `getText()` → `{ text, pages }`, `destroy()`):
```ts
import { PDFParse } from "pdf-parse";
import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

/** Text layer only (spec: no OCR). Scanned PDFs come back empty and are rejected as empty sources. */
export async function ingestPdf(bytes: Buffer, opts: IngestOptions): Promise<SourceDocument> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const pages = Array.isArray(result.pages) ? result.pages.length : undefined;
    return buildDocument("pdf", result.text, opts, pages === undefined ? {} : { pages });
  } finally {
    await parser.destroy();
  }
}
```
If `result.pages` is not an array in 2.4.5's `TextResult` type, read the page count from `result.total` or the type's documented field and adjust the one line; the test asserts `pages >= 2`, so the field must be real.

`packages/generator/src/ingest/index.ts`:
```ts
export * from "./source-document.js";
export * from "./text.js";
export * from "./pdf.js";
```
Append `export * from "./ingest/index.js";` to `src/index.ts`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`; the PDF test proves the committed fixture round-trips.

```bash
git add packages/generator .gitignore
git commit -m "feat(generator): ingest text, markdown and PDF text layers into sentence-indexed source documents; add the synthetic fixture set

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: LLM core — providers, provider-compatible output schemas, the four-limit budget, and `callModel` with two-event recording

Answers review findings 1 (the wire schema is a tested projection of the Zod schema), 2 (`callModel` never retries; every attempt is metered), 3 (four limits: requests and a per-import deadline are hard, spend and tokens are estimated caps whose overshoot is recorded) and 9 (every attempt record carries a stable call key and a retry index).

**Files:**
- Create: `packages/generator/src/llm/schema.ts`, `src/llm/provider.ts`, `src/llm/fake-provider.ts`, `src/llm/replay-provider.ts`, `src/llm/budget.ts`, `src/llm/call-model.ts`
- Test: `packages/generator/test/schema.test.ts`, `test/budget.test.ts`, `test/call-model.test.ts`, `test/replay-provider.test.ts`

**Interfaces:**
- Produces (schema): `toStrictJsonSchema(schema: z.ZodType): Record<string, unknown>` (draft 2020-12; every object closed and every property required; throws if a property is optional, has a default, or is unrepresentable); `toProviderSchema(schema: z.ZodType): Record<string, unknown>` (the strict schema projected to what the API accepts: `$schema` removed; `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `maxItems`, `uniqueItems` removed, `minItems` above 1 removed, `format` kept only when in `SUPPORTED_FORMATS`; every removed constraint appended to the node's `description` as `Constraint: …`); `UNSUPPORTED_SCHEMA_KEYWORDS`, `SUPPORTED_FORMATS`; `assertProviderCompatible(schema): void` (throws naming the path of any remaining unsupported keyword, any object without `additionalProperties: false`, any non-local `$ref`).
- Produces (provider): `CallOptions { deadlineMs?: number }` (absolute epoch ms by which the call must be over); `ModelProvider { readonly name: "anthropic" | "fake" | "replay"; complete(req: ModelRequest, options?: CallOptions): Promise<ModelResponse> }`; `ProviderError(message, kind: "transient" | "permanent", status?: number, details?: { requestId?: string | null; retryAfterMs?: number | null })` exposing `requestId: string | null` and `retryAfterMs: number | null`; `FakeProvider(script)` and `fakeResponse(partial)` (test-only); `ReplayProvider(dir)`, `RecordingProvider(inner, dir)`, `requestKey(request)`, `ReplayMissError`.
- Produces (budget): `BudgetLimits { usdMicro; requests; tokens; elapsedMs }`; `DEFAULT_BUDGET_LIMITS = { requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 }` (spend has no default; the caller always names it); `Budget { limits; startedAtMs; elapsedBeforeMs; deadlineMs; reservedUsdMicro; spentUsdMicro; reservedTokens; spentTokens; requests }`; `createBudget(limits: { usdMicro: number } & Partial<BudgetLimits>, startedAtMs?, elapsedBeforeMs?): Budget` (`deadlineMs = startedAtMs + max(0, limits.elapsedMs − elapsedBeforeMs)`: the per-import limit minus the time earlier runs already used); `remainingMs(budget, nowMs): number`; `reserve(budget, request, nowMs?): Reservation` with `Reservation = { ok: true; reservedUsdMicro; reservedInputTokens; reservedOutputTokens } | { ok: false; limit: BudgetLimitName; reason }`, `BudgetLimitName = "spend" | "requests" | "tokens" | "elapsed"` — synchronous, so concurrent callers cannot interleave between check and update; `settle(budget, reservation, actual: { costUsdMicro: number | null; tokens: number | null })` (an unknown cost or token count keeps the reservation as spent); `budgetSnapshot(budget, nowMs): { spentUsdMicro; reservedUsdMicro; spentTokens; requests; elapsedMs }` (`elapsedMs` = earlier runs plus this one).
- Produces (call): `callModel(req, ctx: CallContext): Promise<CallResult>` with `CallContext = { provider; recorder; budget; operationId; callKey; retryIndex; retryReason; attempt; clock?; ids? }` and `CallResult = { kind: "ok"; json; response; attemptId } | { kind: "content_error"; reason; response; attemptId } | { kind: "transient_error" | "provider_error"; error; attemptId; providerRequestId: string | null; retryAfterMs: number | null } | { kind: "budget_refused"; limit: BudgetLimitName; reason }`.
- Rules: reserve → start record → dispatch with `{ deadlineMs: budget.deadlineMs }` → outcome record (always, also on throw) → settle. `callModel` retries **nothing**; the SDK retries nothing (Task 5); the stage runner (Task 7) owns retries and each retry is a new `callModel` with its own reservation and records. `stop_reason` `max_tokens`, `refusal` and `model_context_window_exceeded` are `content_error`s with a reason; unparsable JSON is a `content_error`; a transient `ProviderError` is `transient_error`; anything else is `provider_error`. The outcome's `providerRequestId` comes from the response, or from the `ProviderError` when the call failed. `reservationExceeded = inputTokens + cacheReadTokens + cacheWriteTokens > reservedInputTokens`; `overshootUsdMicro = max(0, costUsdMicro − reservedUsdMicro)`, null when the cost is unknown. Tests that use a fake clock create their budget from that clock's time so the elapsed deadline is measured on one clock (review finding 7).

- [ ] **Step 1: Failing tests**

`packages/generator/test/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assertProviderCompatible, toProviderSchema, toStrictJsonSchema, UNSUPPORTED_SCHEMA_KEYWORDS } from "../src/llm/schema.js";

describe("toStrictJsonSchema", () => {
  it("emits draft 2020-12 with closed objects and every property required", () => {
    const s = toStrictJsonSchema(z.object({ title: z.string(), items: z.array(z.object({ text: z.string(), tip: z.string().nullable() })) }));
    expect(s["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(s["additionalProperties"]).toBe(false);
    expect(s["required"]).toEqual(["title", "items"]);
    const item = (s["properties"] as Record<string, { items: Record<string, unknown> }>)["items"]!.items;
    expect(item["additionalProperties"]).toBe(false);
    expect(item["required"]).toEqual(["text", "tip"]);
  });
  it("refuses optional properties and defaults (model output schemas are strict by construction)", () => {
    expect(() => toStrictJsonSchema(z.object({ a: z.string().optional() }))).toThrow(/optional/);
    expect(() => toStrictJsonSchema(z.object({ a: z.string().default("x") }))).toThrow(/default/);
  });
});

describe("toProviderSchema", () => {
  it("removes the constraints the API rejects, records them in descriptions, and drops $schema", () => {
    const s = toProviderSchema(z.object({ slot: z.number().int(), name: z.string().min(1).max(80).regex(/^[A-Z]/), ids: z.array(z.string()).min(2).max(10), mail: z.email(), one: z.array(z.string()).min(1) }));
    const props = s["properties"] as Record<string, Record<string, unknown>>;
    expect(s).not.toHaveProperty("$schema");
    expect(props["slot"]!["type"]).toBe("integer");
    for (const k of ["minimum", "maximum"]) expect(props["slot"]).not.toHaveProperty(k);
    for (const k of ["minLength", "maxLength", "pattern"]) expect(props["name"]).not.toHaveProperty(k);
    expect(String(props["name"]!["description"])).toMatch(/Constraint: .*minLength 1/);
    for (const k of ["minItems", "maxItems"]) expect(props["ids"]).not.toHaveProperty(k);
    expect(props["one"]!["minItems"]).toBe(1); // 0 and 1 are supported and kept
    expect(props["mail"]!["format"]).toBe("email"); // supported format kept
    expect(() => assertProviderCompatible(s)).not.toThrow();
  });
  it("assertProviderCompatible names the path of an unsupported keyword or an open object", () => {
    expect(() => assertProviderCompatible({ type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "number", minimum: 1 } } })).toThrow(/properties\.n: unsupported keyword minimum/);
    expect(() => assertProviderCompatible({ type: "object", required: [], properties: {} })).toThrow(/additionalProperties/);
    expect(() => assertProviderCompatible({ type: "object", additionalProperties: false, required: ["x"], properties: { x: { $ref: "https://example.test/x.json" } } })).toThrow(/external \$ref/);
    expect(UNSUPPORTED_SCHEMA_KEYWORDS.has("multipleOf")).toBe(true);
  });
  it("does not carry refinements (they are enforced in code after parsing)", () => {
    const s = toProviderSchema(z.object({ n: z.number() }).refine((o) => o.n > 1));
    expect(JSON.stringify(s)).not.toMatch(/refine/);
  });
});
```
If Zod 4 spells a constraint differently from the test's expectation (for example `.int()` emitting only `type: "integer"` with no bounds), keep the assertions that hold and note the observed output in the ledger; the rule — nothing in `UNSUPPORTED_SCHEMA_KEYWORDS` reaches the wire — is the requirement, and Task 7's contract test over the real schemas is the gate.

`packages/generator/test/budget.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { budgetSnapshot, createBudget, DEFAULT_BUDGET_LIMITS, remainingMs, reserve, settle } from "../src/llm/budget.js";
import { reservationCost, reserveInputTokens } from "../src/llm/cost.js";
import { modelForRole } from "../src/llm/models.js";
import { toProviderSchema } from "../src/llm/schema.js";
import type { ModelRequest } from "../src/llm/types.js";

const req = (): ModelRequest => ({ purpose: "produce", model: modelForRole("produce"), system: "s".repeat(2000), user: "u".repeat(2000), maxOutputTokens: 1000, outputSchema: toProviderSchema(z.object({ ok: z.boolean() })) });

describe("budget", () => {
  it("reserves the estimate for the whole request and settles to the actual cost and tokens", () => {
    const b = createBudget({ usdMicro: 100_000_000 }, 0);
    const r = reserve(b, req(), 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.reservedInputTokens).toBe(reserveInputTokens(req()));
    expect(r.reservedOutputTokens).toBe(1000);
    expect(r.reservedUsdMicro).toBe(reservationCost(modelForRole("produce"), r.reservedInputTokens, 1000));
    expect(b).toMatchObject({ requests: 1, reservedUsdMicro: r.reservedUsdMicro, reservedTokens: r.reservedInputTokens + 1000, spentUsdMicro: 0 });
    settle(b, r, { costUsdMicro: 123, tokens: 456 });
    expect(budgetSnapshot(b, 500)).toEqual({ spentUsdMicro: 123, reservedUsdMicro: 0, spentTokens: 456, requests: 1, elapsedMs: 500 });
    expect(b.limits).toEqual({ usdMicro: 100_000_000, ...DEFAULT_BUDGET_LIMITS });
    expect(b.deadlineMs).toBe(DEFAULT_BUDGET_LIMITS.elapsedMs);
  });
  it("treats elapsed time as a per-import deadline that carries over from earlier runs", () => {
    const resumed = createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 5000, 800); // 800 ms already used by earlier runs
    expect(resumed.deadlineMs).toBe(5200);
    expect(remainingMs(resumed, 5150)).toBe(50);
    expect(reserve(resumed, req(), 5150).ok).toBe(true);
    expect(reserve(resumed, req(), 5200)).toMatchObject({ ok: false, limit: "elapsed" });
    expect(budgetSnapshot(resumed, 5100).elapsedMs).toBe(900);
    expect(remainingMs(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0, 1000), 0)).toBe(0);
  });
  it("refuses each of the four limits by name, changing nothing", () => {
    const spend = createBudget({ usdMicro: 1 }, 0);
    expect(reserve(spend, req(), 0)).toMatchObject({ ok: false, limit: "spend", reason: expect.stringMatching(/spend/) });
    expect(spend).toMatchObject({ requests: 0, reservedUsdMicro: 0, reservedTokens: 0 });
    expect(reserve(createBudget({ usdMicro: 1e9, requests: 0 }, 0), req(), 0)).toMatchObject({ ok: false, limit: "requests" });
    expect(reserve(createBudget({ usdMicro: 1e9, tokens: 10 }, 0), req(), 0)).toMatchObject({ ok: false, limit: "tokens" });
    expect(reserve(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0), req(), 5000)).toMatchObject({ ok: false, limit: "elapsed" });
    expect(reserve(createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, 0), req(), 999).ok).toBe(true);
  });
  it("counts an unknown cost or token count at the reservation and never frees it", () => {
    const b = createBudget({ usdMicro: 1e9 }, 0);
    const r = reserve(b, req(), 0);
    if (!r.ok) throw new Error(r.reason);
    settle(b, r, { costUsdMicro: null, tokens: null });
    expect(b).toMatchObject({ reservedUsdMicro: 0, spentUsdMicro: r.reservedUsdMicro, reservedTokens: 0, spentTokens: r.reservedInputTokens + r.reservedOutputTokens });
  });
  it("refuses a second in-flight reservation that would cross the cap, so concurrent callers cannot both squeeze in", () => {
    const probe = reserve(createBudget({ usdMicro: 1e12 }, 0), req(), 0);
    if (!probe.ok) throw new Error(probe.reason);
    const b = createBudget({ usdMicro: Math.floor(probe.reservedUsdMicro * 1.5) }, 0);
    expect(reserve(b, req(), 0).ok).toBe(true);
    expect(reserve(b, req(), 0)).toMatchObject({ ok: false, limit: "spend" });
    expect(b.requests).toBe(1);
  });
});
```

`packages/generator/test/call-model.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { callModel, type CallContext } from "../src/llm/call-model.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget, DEFAULT_BUDGET_LIMITS, reserve } from "../src/llm/budget.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import { computeCost } from "../src/llm/cost.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart, ModelRequest } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder {
  events: AttemptEvent[] = [];
  startedBeforeDispatch = false;
  constructor(private readonly provider?: FakeProvider) {}
  async recordStart(s: AttemptStart) { this.startedBeforeDispatch = (this.provider?.requests.length ?? 0) === 0; this.events.push(s); }
  async recordOutcome(o: AttemptOutcome) { this.events.push(o); }
}

const CLOCK = new Date("2026-09-19T00:00:00Z");
const req = (): ModelRequest => ({ purpose: "produce", model: modelForRole("produce"), system: "sys", user: "make one", maxOutputTokens: 500, outputSchema: toProviderSchema(z.object({ ok: z.boolean() })) });
/** Budget and clock share one time base, so the elapsed deadline is not already past when the test starts. */
const ctx = (provider: FakeProvider, recorder = new MemoryRecorder(), limitUsdMicro = 10_000_000): CallContext => ({ provider, recorder, budget: createBudget({ usdMicro: limitUsdMicro }, CLOCK.getTime()), operationId: "op-1", callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, clock: () => CLOCK, ids: () => "att-1" });
const outcomes = (r: MemoryRecorder) => r.events.filter((e): e is AttemptOutcome => e.event === "outcome");

describe("callModel", () => {
  it("records start before dispatch and outcome after, with the call key, retry index and cost from the pricing table", async () => {
    const usage = { inputTokens: 120, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify({ ok: true }), usage, providerRequestId: "req_1" })]);
    const recorder = new MemoryRecorder(provider);
    const result = await callModel(req(), ctx(provider, recorder));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.json).toEqual({ ok: true });
    expect(recorder.events.map((e) => e.event)).toEqual(["start", "outcome"]);
    const start = recorder.events[0] as AttemptStart;
    expect(start).toMatchObject({ callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, reservedOutputTokens: 500 });
    expect(start.reservedUsdMicro).toBeGreaterThan(0);
    const outcome = outcomes(recorder)[0]!;
    expect(outcome).toMatchObject({ status: "ok", providerRequestId: "req_1", inputTokens: 120, outputTokens: 30, costStatus: "known", pricingVersion: expect.any(String), reservationExceeded: false, overshootUsdMicro: 0 });
    expect(outcome.costUsdMicro).toBe(computeCost(usage, modelForRole("produce")).costUsdMicro);
    expect(recorder.startedBeforeDispatch).toBe(true);
    expect(provider.options[0]).toEqual({ deadlineMs: CLOCK.getTime() + DEFAULT_BUDGET_LIMITS.elapsedMs }); // the provider is told the deadline
  });
  it("flags an attempt whose actual usage exceeds the reservation and records the overshoot", async () => {
    const usage = { inputTokens: 5_000_000, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}", usage })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder, 1e12);
    await callModel(req(), c);
    const start = recorder.events[0] as AttemptStart;
    const outcome = outcomes(recorder)[0]!;
    expect(outcome.reservationExceeded).toBe(true);
    expect(outcome.overshootUsdMicro).toBe(computeCost(usage, modelForRole("produce")).costUsdMicro! - start.reservedUsdMicro);
    expect(c.budget.spentUsdMicro).toBe(outcome.costUsdMicro); // the cap was overshot; the ledger says so rather than hiding it
  });
  it("refuses a dispatch once the per-import deadline has passed", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" })]);
    const recorder = new MemoryRecorder();
    const late = { ...ctx(provider, recorder), budget: createBudget({ usdMicro: 1e9, elapsedMs: 1000 }, CLOCK.getTime() - 1000) };
    expect(await callModel(req(), late)).toMatchObject({ kind: "budget_refused", limit: "elapsed" });
    expect(recorder.events).toEqual([]);
  });
  it("classifies max_tokens, refusal and context overflow as content errors and still records the outcome", async () => {
    const provider = new FakeProvider([fakeResponse({ stopReason: "max_tokens", outputText: "{\"ok\":" }), fakeResponse({ stopReason: "refusal", outputText: undefined }), fakeResponse({ stopReason: "model_context_window_exceeded", outputText: undefined })]);
    const recorder = new MemoryRecorder();
    const a = await callModel(req(), ctx(provider, recorder));
    expect(a).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/truncated/) });
    const b = await callModel(req(), ctx(provider, recorder));
    expect(b).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/refus/) });
    const c = await callModel(req(), ctx(provider, recorder));
    expect(c).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/context window/) });
    expect(outcomes(recorder).map((o) => o.status)).toEqual(["content_error", "content_error", "content_error"]);
  });
  it("records a missing usage as unavailable, never zero, and keeps the reservation as spent", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}", usage: null, rawUsage: null })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder);
    await callModel(req(), c);
    expect(outcomes(recorder)[0]).toMatchObject({ costUsdMicro: null, costStatus: "unavailable", inputTokens: null, reservationExceeded: false, overshootUsdMicro: null });
    expect(c.budget.reservedUsdMicro).toBe(0);
    expect(c.budget.spentUsdMicro).toBe((recorder.events[0] as AttemptStart).reservedUsdMicro);
  });
  it("turns a transient provider error into transient_error carrying the provider's request id and retry-after, with an outcome record", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529, { requestId: "req_err", retryAfterMs: 2500 })]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder);
    const r = await callModel(req(), c);
    expect(r).toMatchObject({ kind: "transient_error", providerRequestId: "req_err", retryAfterMs: 2500 });
    expect(outcomes(recorder)[0]).toMatchObject({ status: "transient_error", providerRequestId: "req_err", costStatus: "unavailable" });
    expect(c.budget.reservedUsdMicro).toBe(0);
  });
  it("refuses to dispatch when the reservation would exceed the budget, recording nothing and naming the limit", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" })]);
    const recorder = new MemoryRecorder();
    const r = await callModel(req(), ctx(provider, recorder, 10));
    expect(r).toMatchObject({ kind: "budget_refused", limit: "spend" });
    expect(recorder.events).toEqual([]);
    expect(provider.requests).toEqual([]);
  });
  it("accounts reservations across concurrent in-flight attempts", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" }), fakeResponse({ outputText: "{\"ok\":true}" })]);
    const perCall = reserve(createBudget({ usdMicro: 1e12 }, 0), req(), 0);
    if (!perCall.ok) throw new Error("unexpected");
    const c = ctx(provider, new MemoryRecorder(), Math.floor(perCall.reservedUsdMicro * 1.5));
    const [a, b] = await Promise.all([callModel(req(), { ...c, ids: () => "att-a" }), callModel(req(), { ...c, ids: () => "att-b" })]);
    expect([a.kind, b.kind].sort()).toEqual(["budget_refused", "ok"]);
  });
});
```

`packages/generator/test/replay-provider.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { RecordingProvider, ReplayProvider, ReplayMissError } from "../src/llm/replay-provider.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";

const req = { purpose: "extract" as const, model: modelForRole("extract"), system: "s", user: "u", maxOutputTokens: 10, outputSchema: toProviderSchema(z.object({ a: z.number() })) };

describe("replay", () => {
  it("records a response and replays it for the identical request; misses name the purpose", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    const recording = new RecordingProvider(new FakeProvider([fakeResponse({ outputText: "{\"a\":1}", providerRequestId: "req_x" })]), dir);
    const first = await recording.complete(req);
    const replay = new ReplayProvider(dir);
    const second = await replay.complete(req);
    expect(second).toEqual({ ...first, latencyMs: 0 });
    await expect(replay.complete({ ...req, user: "different" })).rejects.toThrow(ReplayMissError);
    await expect(replay.complete({ ...req, user: "different" })).rejects.toThrow(/extract/);
  });
});
```

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/llm/schema.ts`:
```ts
import { z } from "zod";

const REMOVED_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "maxItems", "uniqueItems"] as const;
/** Keywords the structured-outputs grammar rejects (docs: "Structured outputs" → JSON Schema limitations). */
export const UNSUPPORTED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([...REMOVED_KEYWORDS, "$schema", "patternProperties", "propertyNames", "if", "then", "else", "not", "dependentRequired", "dependentSchemas", "contains", "minContains", "maxContains", "minProperties", "maxProperties"]);
export const SUPPORTED_FORMATS: ReadonlySet<string> = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

function children(node: Node, path: string): Array<[Node, string]> {
  const out: Array<[Node, string]> = [];
  if (isNode(node["properties"])) for (const [k, v] of Object.entries(node["properties"])) if (isNode(v)) out.push([v, `${path}properties.${k}.`]);
  if (isNode(node["$defs"])) for (const [k, v] of Object.entries(node["$defs"])) if (isNode(v)) out.push([v, `${path}$defs.${k}.`]);
  for (const key of ["items", "anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((x, i) => { if (isNode(x)) out.push([x, `${path}${key}[${i}].`]); });
    else if (isNode(v)) out.push([v, `${path}${key}.`]);
  }
  return out;
}

function tighten(node: Node, path: string): void {
  if (node["type"] === "object" && isNode(node["properties"])) {
    const props = node["properties"];
    const names = Object.keys(props);
    const required = new Set((node["required"] as string[] | undefined) ?? []);
    for (const name of names) {
      if (!required.has(name)) throw new Error(`model output schema property ${path}${name} is optional; model output schemas must have every property required (use a nullable type instead)`);
      const p = props[name];
      if (isNode(p) && "default" in p) throw new Error(`model output schema property ${path}${name} has a default; defaults belong to the activity schema, not the model output`);
    }
    node["additionalProperties"] = false;
    node["required"] = names;
  }
  for (const [child, childPath] of children(node, path)) tighten(child, childPath);
}

function project(node: Node): void {
  const notes: string[] = [];
  for (const keyword of REMOVED_KEYWORDS) if (keyword in node) { notes.push(`${keyword} ${JSON.stringify(node[keyword])}`); delete node[keyword]; }
  if (typeof node["minItems"] === "number" && node["minItems"] > 1) { notes.push(`minItems ${node["minItems"]}`); delete node["minItems"]; }
  if (typeof node["format"] === "string" && !SUPPORTED_FORMATS.has(node["format"])) { notes.push(`format ${node["format"]}`); delete node["format"]; }
  if (notes.length > 0) node["description"] = [node["description"], `Constraint: ${notes.join("; ")}`].filter((s) => typeof s === "string" && s.length > 0).join(" ");
  for (const [child] of children(node, "")) project(child);
}

/** Draft 2020-12 JSON Schema with closed objects, all properties required, no defaults. Refinements are not represented and are enforced by parsing the response in code. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "throw", io: "output" }) as Node;
  tighten(json, "");
  return json;
}

/** Throws when anything the API rejects is still present. Used on every schema before it is sent and by the Task 7 contract test. */
export function assertProviderCompatible(schema: Record<string, unknown>): void {
  const problems: string[] = [];
  const walk = (node: Node, path: string): void => {
    const where = path.replace(/\.$/, "") || "(root)";
    for (const key of Object.keys(node)) if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) problems.push(`${where}: unsupported keyword ${key}`);
    if (node["type"] === "object" && node["additionalProperties"] !== false) problems.push(`${where}: object must set additionalProperties: false`);
    if (typeof node["$ref"] === "string" && !node["$ref"].startsWith("#/")) problems.push(`${where}: external $ref ${node["$ref"]}`);
    if (typeof node["minItems"] === "number" && node["minItems"] > 1) problems.push(`${where}: minItems above 1`);
    if (typeof node["format"] === "string" && !SUPPORTED_FORMATS.has(node["format"])) problems.push(`${where}: unsupported format ${node["format"]}`);
    for (const [child, childPath] of children(node, path)) walk(child, childPath);
  };
  walk(schema as Node, "");
  if (problems.length > 0) throw new Error(`schema is not provider-compatible:\n${problems.join("\n")}`);
}

/** The strict schema projected to the subset native structured outputs accept; the full Zod schema still validates the parsed response. */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = toStrictJsonSchema(schema);
  delete json["$schema"];
  project(json);
  assertProviderCompatible(json);
  return json;
}
```
If Zod 4 emits `default` for `.default()` fields under `io: "output"` or marks optionals differently, adjust the two detection lines so the two "refuses" tests pass; the rule (no optionals, no defaults) is the requirement, the detection is the implementation.

`packages/generator/src/llm/provider.ts`:
```ts
import type { ModelRequest, ModelResponse } from "./types.js";

/** Per-call limits the caller imposes; the adapter turns the deadline into its request timeout. */
export interface CallOptions { deadlineMs?: number; }

export interface ModelProvider {
  readonly name: "anthropic" | "fake" | "replay";
  complete(request: ModelRequest, options?: CallOptions): Promise<ModelResponse>;
}

export class ProviderError extends Error {
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;
  constructor(message: string, public readonly kind: "transient" | "permanent", public readonly status?: number, details: { requestId?: string | null; retryAfterMs?: number | null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.requestId = details.requestId ?? null;
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}
```

`packages/generator/src/llm/fake-provider.ts`:
```ts
import type { CallOptions, ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse } from "./types.js";

/** Builds a response shaped like the Messages API mapping; the content is synthetic test data. */
export function fakeResponse(partial: Partial<ModelResponse> = {}): ModelResponse {
  const usage = partial.usage === undefined ? { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } : partial.usage;
  return {
    providerRequestId: partial.providerRequestId === undefined ? "req_fake" : partial.providerRequestId,
    model: partial.model ?? "fake-model",
    stopReason: partial.stopReason ?? "end_turn",
    outputText: partial.outputText,
    rawUsage: partial.rawUsage === undefined ? (usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : null) : partial.rawUsage,
    usage,
    latencyMs: partial.latencyMs ?? 5
  };
}

export class FakeProvider implements ModelProvider {
  readonly name = "fake" as const;
  readonly requests: ModelRequest[] = [];
  readonly options: CallOptions[] = [];

  constructor(private readonly script: Array<ModelResponse | Error>) {}

  async complete(request: ModelRequest, options: CallOptions = {}): Promise<ModelResponse> {
    this.requests.push(request);
    this.options.push(options);
    const next = this.script.shift();
    if (next === undefined) throw new Error(`FakeProvider script exhausted for purpose ${request.purpose}`);
    if (next instanceof Error) throw next;
    return { ...next, model: request.model };
  }
}
```

`packages/generator/src/llm/replay-provider.ts`:
```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallOptions, ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse } from "./types.js";

export function requestKey(request: ModelRequest): string {
  const { model, system, cachedContext, user, outputSchema, maxOutputTokens } = request;
  return createHash("sha256").update(JSON.stringify({ model, system, cachedContext: cachedContext ?? null, user, outputSchema, maxOutputTokens })).digest("hex");
}

export class ReplayMissError extends Error {
  constructor(request: ModelRequest, key: string) {
    super(`no recorded response for purpose ${request.purpose} (model ${request.model}, key ${key.slice(0, 12)}); run with --provider record to capture it`);
    this.name = "ReplayMissError";
  }
}

export class ReplayProvider implements ModelProvider {
  readonly name = "replay" as const;
  constructor(private readonly dir: string) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const key = requestKey(request);
    let text: string;
    try { text = await readFile(join(this.dir, `${key}.json`), "utf8"); } catch { throw new ReplayMissError(request, key); }
    const stored = JSON.parse(text) as { request: { purpose: string; model: string }; response: ModelResponse };
    return { ...stored.response, latencyMs: 0 };
  }
}

export class RecordingProvider implements ModelProvider {
  readonly name: "anthropic" | "fake" | "replay";
  constructor(private readonly inner: ModelProvider, private readonly dir: string) { this.name = inner.name; }
  async complete(request: ModelRequest, options?: CallOptions): Promise<ModelResponse> {
    const response = await this.inner.complete(request, options);
    await mkdir(this.dir, { recursive: true });
    const key = requestKey(request);
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), request: { purpose: request.purpose, model: request.model, maxOutputTokens: request.maxOutputTokens, userPreview: request.user.slice(0, 200) }, response }, null, 2) + "\n");
    return response;
  }
}
```

`packages/generator/src/llm/budget.ts`:
```ts
import { reservationCost, reserveInputTokens } from "./cost.js";
import type { ModelRequest } from "./types.js";

/** Spec §4 imports.budget: requests, tokens, seconds, spend. Spend is USD micro; time is milliseconds. */
export interface BudgetLimits { usdMicro: number; requests: number; tokens: number; elapsedMs: number; }
export const DEFAULT_BUDGET_LIMITS: Omit<BudgetLimits, "usdMicro"> = { requests: 200, tokens: 2_000_000, elapsedMs: 1_800_000 };
export type BudgetLimitName = "spend" | "requests" | "tokens" | "elapsed";

export interface Budget {
  limits: BudgetLimits;
  /** Epoch ms this run started. */
  startedAtMs: number;
  /** Elapsed time earlier runs of the same import already used (from the import record). */
  elapsedBeforeMs: number;
  /** Absolute epoch ms after which nothing may be dispatched or waited for: startedAtMs + (limit − elapsedBeforeMs). */
  deadlineMs: number;
  reservedUsdMicro: number;
  spentUsdMicro: number;
  reservedTokens: number;
  spentTokens: number;
  /** Attempts reserved so far, never decremented: a refused attempt is not counted, a failed one is. */
  requests: number;
}

export function createBudget(limits: { usdMicro: number } & Partial<BudgetLimits>, startedAtMs = Date.now(), elapsedBeforeMs = 0): Budget {
  const full = { ...DEFAULT_BUDGET_LIMITS, ...limits };
  return { limits: full, startedAtMs, elapsedBeforeMs, deadlineMs: startedAtMs + Math.max(0, full.elapsedMs - elapsedBeforeMs), reservedUsdMicro: 0, spentUsdMicro: 0, reservedTokens: 0, spentTokens: 0, requests: 0 };
}

export function remainingMs(budget: Budget, nowMs = Date.now()): number {
  return Math.max(0, budget.deadlineMs - nowMs);
}

export type Reservation =
  | { ok: true; reservedUsdMicro: number; reservedInputTokens: number; reservedOutputTokens: number }
  | { ok: false; limit: BudgetLimitName; reason: string };

/** Reserves the attempt's estimated spend and tokens against the caps and checks the hard request and deadline limits, in one synchronous step (no await between check and update). */
export function reserve(budget: Budget, request: ModelRequest, nowMs = Date.now()): Reservation {
  const reservedInputTokens = reserveInputTokens(request);
  const reservedOutputTokens = request.maxOutputTokens;
  const reservedUsdMicro = reservationCost(request.model, reservedInputTokens, reservedOutputTokens);
  const tokens = reservedInputTokens + reservedOutputTokens;
  if (nowMs >= budget.deadlineMs) return { ok: false, limit: "elapsed", reason: `budget: the elapsed-time limit of ${budget.limits.elapsedMs} ms for this import has passed (${budget.elapsedBeforeMs} ms used by earlier runs)` };
  if (budget.requests + 1 > budget.limits.requests) return { ok: false, limit: "requests", reason: `budget: request ${budget.requests + 1} would exceed the limit of ${budget.limits.requests} requests` };
  const projectedTokens = budget.spentTokens + budget.reservedTokens + tokens;
  if (projectedTokens > budget.limits.tokens) return { ok: false, limit: "tokens", reason: `budget: reserving ${tokens} tokens would bring the import to ${projectedTokens} tokens, above the limit of ${budget.limits.tokens}` };
  const projectedUsd = budget.spentUsdMicro + budget.reservedUsdMicro + reservedUsdMicro;
  if (projectedUsd > budget.limits.usdMicro) return { ok: false, limit: "spend", reason: `budget: reserving ${reservedUsdMicro} µUSD would bring the import to ${projectedUsd} µUSD of spend, above the limit of ${budget.limits.usdMicro} µUSD` };
  budget.requests += 1;
  budget.reservedUsdMicro += reservedUsdMicro;
  budget.reservedTokens += tokens;
  return { ok: true, reservedUsdMicro, reservedInputTokens, reservedOutputTokens };
}

/** Replaces a reservation with the actual cost and tokens; an unknown value keeps the reservation as spent so an unbilled-looking attempt never frees budget. */
export function settle(budget: Budget, reservation: { reservedUsdMicro: number; reservedInputTokens: number; reservedOutputTokens: number }, actual: { costUsdMicro: number | null; tokens: number | null }): void {
  const reservedTokens = reservation.reservedInputTokens + reservation.reservedOutputTokens;
  budget.reservedUsdMicro -= reservation.reservedUsdMicro;
  budget.spentUsdMicro += actual.costUsdMicro ?? reservation.reservedUsdMicro;
  budget.reservedTokens -= reservedTokens;
  budget.spentTokens += actual.tokens ?? reservedTokens;
}

export function budgetSnapshot(budget: Budget, nowMs = Date.now()): { spentUsdMicro: number; reservedUsdMicro: number; spentTokens: number; requests: number; elapsedMs: number } {
  return { spentUsdMicro: budget.spentUsdMicro, reservedUsdMicro: budget.reservedUsdMicro, spentTokens: budget.spentTokens, requests: budget.requests, elapsedMs: budget.elapsedBeforeMs + Math.max(0, nowMs - budget.startedAtMs) };
}
```

`packages/generator/src/llm/call-model.ts`:
```ts
import { randomUUID } from "node:crypto";
import { computeCost } from "./cost.js";
import { reserve, settle, type Budget, type BudgetLimitName } from "./budget.js";
import { ProviderError, type ModelProvider } from "./provider.js";
import type { AttemptOutcome, AttemptRecorder, AttemptStatus, ModelRequest, ModelResponse, RetryReason } from "./types.js";

export interface CallContext {
  provider: ModelProvider;
  recorder: AttemptRecorder;
  budget: Budget;
  operationId: string;
  callKey: string;
  retryIndex: number;
  retryReason: RetryReason | null;
  attempt: number;
  clock?: () => Date;
  ids?: () => string;
}

export type CallResult =
  | { kind: "ok"; json: unknown; response: ModelResponse; attemptId: string }
  | { kind: "content_error"; reason: string; response: ModelResponse; attemptId: string }
  | { kind: "transient_error" | "provider_error"; error: string; attemptId: string; providerRequestId: string | null; retryAfterMs: number | null }
  | { kind: "budget_refused"; limit: BudgetLimitName; reason: string };

function interpret(response: ModelResponse): { status: AttemptStatus; json?: unknown; reason?: string } {
  if (response.stopReason === "refusal") return { status: "content_error", reason: "the model refused the request" };
  if (response.stopReason === "max_tokens") return { status: "content_error", reason: "output truncated at the max_tokens limit; the request needs a smaller task or a larger limit" };
  if (response.stopReason === "model_context_window_exceeded") return { status: "content_error", reason: "the request exceeded the model's context window; the input must be smaller" };
  if (response.outputText === undefined) return { status: "content_error", reason: "the response carried no structured output" };
  try {
    return { status: "ok", json: JSON.parse(response.outputText) };
  } catch (err) {
    return { status: "content_error", reason: `structured output is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The only path to a model: reserve budget, record the start, dispatch once, record the outcome (always), settle the budget. Never retries. */
export async function callModel(request: ModelRequest, ctx: CallContext): Promise<CallResult> {
  const now = ctx.clock ?? (() => new Date());
  const reservation = reserve(ctx.budget, request, now().getTime());
  if (!reservation.ok) return { kind: "budget_refused", limit: reservation.limit, reason: reservation.reason };

  const attemptId = (ctx.ids ?? randomUUID)();
  await ctx.recorder.recordStart({
    event: "start", attemptId, operationId: ctx.operationId, callKey: ctx.callKey, retryIndex: ctx.retryIndex, retryReason: ctx.retryReason, attempt: ctx.attempt,
    purpose: request.purpose, provider: ctx.provider.name, model: request.model, credentialOwner: "server",
    reservedInputTokens: reservation.reservedInputTokens, reservedOutputTokens: reservation.reservedOutputTokens, reservedUsdMicro: reservation.reservedUsdMicro, startedAt: now().toISOString()
  });
  const started = Date.now();
  let response: ModelResponse | undefined;
  let failure: { status: AttemptStatus; error: string; providerRequestId: string | null; retryAfterMs: number | null } | undefined;
  try {
    response = await ctx.provider.complete(request, { deadlineMs: ctx.budget.deadlineMs });
  } catch (err) {
    const provider = err instanceof ProviderError ? err : undefined;
    failure = { status: provider?.kind === "transient" ? "transient_error" : "provider_error", error: err instanceof Error ? err.message : String(err), providerRequestId: provider?.requestId ?? null, retryAfterMs: provider?.retryAfterMs ?? null };
  }

  const usage = response?.usage ?? null;
  const cost = computeCost(usage, request.model);
  const actualInputTokens = usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : null;
  const interpreted = response ? interpret(response) : undefined;
  const status: AttemptStatus = failure ? failure.status : interpreted!.status;
  const outcome: AttemptOutcome = {
    event: "outcome", attemptId, operationId: ctx.operationId,
    providerRequestId: response?.providerRequestId ?? failure?.providerRequestId ?? null,
    rawUsage: response?.rawUsage ?? null,
    inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, cacheReadTokens: usage?.cacheReadTokens ?? null, cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    latencyMs: response?.latencyMs ?? Date.now() - started,
    pricingVersion: cost.pricingVersion, costUsdMicro: cost.costUsdMicro, costStatus: cost.costStatus,
    stopReason: response?.stopReason ?? null,
    status, error: failure?.error ?? interpreted?.reason ?? null,
    reservationExceeded: actualInputTokens !== null && actualInputTokens > reservation.reservedInputTokens,
    overshootUsdMicro: cost.costUsdMicro === null ? null : Math.max(0, cost.costUsdMicro - reservation.reservedUsdMicro),
    completedAt: now().toISOString()
  };
  await ctx.recorder.recordOutcome(outcome);
  settle(ctx.budget, reservation, { costUsdMicro: cost.costUsdMicro, tokens: usage && actualInputTokens !== null ? actualInputTokens + usage.outputTokens : null });

  if (failure) return { kind: failure.status === "transient_error" ? "transient_error" : "provider_error", error: failure.error, attemptId, providerRequestId: failure.providerRequestId, retryAfterMs: failure.retryAfterMs };
  if (interpreted!.status === "ok") return { kind: "ok", json: interpreted!.json, response: response!, attemptId };
  return { kind: "content_error", reason: interpreted!.reason ?? "content error", response: response!, attemptId };
}
```
Append to `src/index.ts`: `export * from "./llm/schema.js"; export * from "./llm/provider.js"; export * from "./llm/replay-provider.js"; export * from "./llm/budget.js"; export * from "./llm/call-model.js";` (`fake-provider.ts` stays test-only: tests import it by relative path and it is not part of the package's public surface).

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): callModel with two-event attempt records, a four-limit budget (hard requests and deadline, estimated spend and tokens), provider-compatible output schemas, fake and replay providers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: The Anthropic adapter, with contract tests derived from the verified SDK facts

Answers review findings 1 (model-specific request settings) and 2 (SDK retries set to zero so the recorded dispatch loop owns every retry). The only file that imports `@anthropic-ai/sdk`. Contract tests inject a fake client and assert the exact request the adapter builds and the exact mapping of the response, so the verified facts are pinned in code: `system` and cached context blocks carry `cache_control: { type: "ephemeral" }`; structured output is requested with `output_config.format = { type: "json_schema", schema }`; the request profile from `models.ts` decides sampling and thinking (Sonnet 5: no sampling parameter, `thinking: { type: "disabled" }`; Haiku 4.5: `temperature: 0`, no `thinking`); the text block is selected by `type` because thinking blocks can precede it; `usage.input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens` map to `GenerationUsage`; `_request_id` is the provider request id; `stop_reason` passes through; the client is called with `maxRetries: 0` and a timeout that is the configured timeout or the time left to the caller's deadline, whichever is shorter (so an attempt can never outlive the import's elapsed limit); `APIError` statuses classify as transient (408, 409, 429, ≥500) or permanent (400, 401, 403, 404, 422) and carry `requestID` and any `retry-after` header; `APIConnectionError` is transient.

**Files:**
- Create: `packages/generator/src/llm/anthropic-provider.ts`
- Test: `packages/generator/test/anthropic-provider.test.ts`

**Interfaces:**
- Produces: `createAnthropicProvider(options?: { apiKey?: string; client?: MessagesClient; timeoutMs?: number }): ModelProvider` where `MessagesClient = { messages: { create(params: Record<string, unknown>, requestOptions?: { maxRetries?: number; timeout?: number }): Promise<unknown> } }`; `buildMessageParams(request): Record<string, unknown>`; `mapMessage(message: unknown, latencyMs: number): ModelResponse`; `classifyProviderError(err): ProviderError`. With no `apiKey` and no `client`, the provider reads `process.env["ANTHROPIC_API_KEY"]` (the one permitted `process.env` read in the package) and throws a permanent `ProviderError` if it is unset.

- [ ] **Step 1: Failing contract tests**

`packages/generator/test/anthropic-provider.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildMessageParams, classifyProviderError, createAnthropicProvider, mapMessage } from "../src/llm/anthropic-provider.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { MODEL_ROLES, modelForRole } from "../src/llm/models.js";
import type { ModelRequest } from "../src/llm/types.js";

const schema = toProviderSchema(z.object({ ok: z.boolean() }));
const haikuRequest: ModelRequest = { purpose: "extract", model: modelForRole("extract"), system: "SYSTEM", cachedContext: "CONTEXT", user: "USER", maxOutputTokens: 321, outputSchema: schema };
const sonnetRequest: ModelRequest = { purpose: "produce", model: modelForRole("produce"), system: "SYSTEM", cachedContext: "CONTEXT", user: "USER", maxOutputTokens: 321, outputSchema: schema };

describe("anthropic adapter contract", () => {
  it("builds a Sonnet 5 request with no sampling parameter and thinking disabled", () => {
    expect(MODEL_ROLES.produce).toBe("claude-sonnet-5");
    const params = buildMessageParams(sonnetRequest);
    expect(params).toEqual({
      model: "claude-sonnet-5",
      max_tokens: 321,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [
        { type: "text", text: "CONTEXT", cache_control: { type: "ephemeral" } },
        { type: "text", text: "USER" }
      ] }],
      output_config: { format: { type: "json_schema", schema } }
    });
    for (const key of ["temperature", "top_p", "top_k"]) expect(params).not.toHaveProperty(key);
  });

  it("builds a Haiku 4.5 request with temperature 0 and no thinking field", () => {
    expect(MODEL_ROLES.extract).toBe("claude-haiku-4-5-20251001");
    const params = buildMessageParams(haikuRequest);
    expect(params["temperature"]).toBe(0);
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("top_p");
    const noContext = buildMessageParams({ ...haikuRequest, cachedContext: undefined });
    expect((noContext["messages"] as Array<{ content: unknown[] }>)[0]!.content).toHaveLength(1);
  });

  it("refuses a model with no request profile instead of guessing settings", () => {
    expect(() => buildMessageParams({ ...haikuRequest, model: "claude-unknown" as ModelRequest["model"] })).toThrow(/no request profile/);
  });

  it("maps usage, request id, stop reason and the JSON text block, selecting the text block by type", () => {
    const message = {
      id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "{\"ok\":true}" }],
      usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
      _request_id: "req_abc"
    };
    expect(mapMessage(message, 87)).toEqual({
      providerRequestId: "req_abc", model: "claude-sonnet-5", stopReason: "end_turn", outputText: "{\"ok\":true}",
      rawUsage: message.usage, usage: { inputTokens: 1200, outputTokens: 40, cacheReadTokens: 1000, cacheWriteTokens: 0 }, latencyMs: 87
    });
  });

  it("treats absent cache fields as zero and absent usage as null, and a refusal as no output", () => {
    const minimal = { model: "m", stop_reason: "refusal", content: [], usage: { input_tokens: 5, output_tokens: 0 }, _request_id: null, stop_details: { category: "cyber", explanation: "x" } };
    const mapped = mapMessage(minimal, 1);
    expect(mapped.usage).toEqual({ inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(mapped.outputText).toBeUndefined();
    expect(mapped.providerRequestId).toBeNull();
    expect(mapMessage({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }, 1).usage).toBeNull();
  });

  it("calls the client with maxRetries 0 and the configured timeout, shortened to the caller's deadline when one is closer", async () => {
    const create = vi.fn().mockResolvedValue({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }], usage: { input_tokens: 1, output_tokens: 1 }, _request_id: "req_1" });
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    const response = await provider.complete(sonnetRequest);
    expect(create).toHaveBeenCalledWith(buildMessageParams(sonnetRequest), { maxRetries: 0, timeout: 120_000 });
    expect(response.providerRequestId).toBe("req_1");
    expect(provider.name).toBe("anthropic");
    await provider.complete(sonnetRequest, { deadlineMs: Date.now() + 5000 });
    const bounded = (create.mock.calls[1] as [unknown, { maxRetries: number; timeout: number }])[1];
    expect(bounded.maxRetries).toBe(0);
    expect(bounded.timeout).toBeGreaterThan(0);
    expect(bounded.timeout).toBeLessThanOrEqual(5000);
  });

  it("classifies SDK errors by status and carries the request id and retry-after", () => {
    const apiError = (status: number, headers = new Headers()) => new Anthropic.APIError(status, { error: { type: "x", message: "m" } }, "m", headers);
    expect(classifyProviderError(apiError(429)).kind).toBe("transient");
    expect(classifyProviderError(apiError(529)).kind).toBe("transient");
    expect(classifyProviderError(apiError(408)).kind).toBe("transient");
    expect(classifyProviderError(apiError(400)).kind).toBe("permanent");
    expect(classifyProviderError(apiError(401)).kind).toBe("permanent");
    const limited = classifyProviderError(apiError(429, new Headers({ "retry-after": "7", "request-id": "req_429" })));
    expect(limited.retryAfterMs).toBe(7000);
    expect(limited.requestId).toBe("req_429");
    expect(classifyProviderError(new Anthropic.APIConnectionError({ message: "socket hang up" }))).toMatchObject({ kind: "transient", requestId: null, retryAfterMs: null });
    expect(classifyProviderError(new Error("weird")).kind).toBe("permanent");
  });

  it("wraps client failures as ProviderError so callModel can classify them", async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIError(500, { error: { type: "api_error", message: "boom" } }, "boom", new Headers({ "request-id": "req_500" })));
    const provider = createAnthropicProvider({ client: { messages: { create } } });
    await expect(provider.complete(sonnetRequest)).rejects.toMatchObject({ name: "ProviderError", kind: "transient", status: 500, requestId: "req_500" });
  });

  it("requires an api key when no client is injected", () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try { expect(() => createAnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/); } finally { if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved; }
  });
});
```
`Anthropic.APIError`'s constructor in 0.127 is `(status, error, message, headers, type?)` and the instance exposes `requestID` (verified against the published `core/error.d.ts`); if the SDK derives `requestID` from the headers differently from the test's `request-id` header, construct the error the way `index.d.ts` declares and keep the assertions — the classification and the carried ids are the requirement.

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/llm/anthropic-provider.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { GenerationUsage } from "@leaplearn/shared";
import { requestProfile } from "./models.js";
import { ProviderError, type CallOptions, type ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse, StopReason } from "./types.js";

export interface MessagesClient {
  messages: { create(params: Record<string, unknown>, requestOptions?: { maxRetries?: number; timeout?: number }): Promise<unknown> };
}

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function buildMessageParams(request: ModelRequest): Record<string, unknown> {
  const profile = requestProfile(request.model);
  const content: Array<Record<string, unknown>> = [];
  if (request.cachedContext !== undefined) content.push({ type: "text", text: request.cachedContext, cache_control: { type: "ephemeral" } });
  content.push({ type: "text", text: request.user });
  const params: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: request.outputSchema } }
  };
  if (profile.temperature !== null) params["temperature"] = profile.temperature;
  if (profile.thinking !== null) params["thinking"] = profile.thinking;
  return params;
}

interface RawUsage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; [k: string]: unknown; }
interface RawMessage { model?: string; stop_reason?: string | null; content?: Array<{ type: string; text?: string }>; usage?: RawUsage; _request_id?: string | null; }

function toUsage(raw: RawUsage | undefined): GenerationUsage | null {
  if (!raw || typeof raw.input_tokens !== "number" || typeof raw.output_tokens !== "number") return null;
  return { inputTokens: raw.input_tokens, outputTokens: raw.output_tokens, cacheReadTokens: raw.cache_read_input_tokens ?? 0, cacheWriteTokens: raw.cache_creation_input_tokens ?? 0 };
}

/** Content blocks are selected by type: with thinking on, thinking blocks precede the text block. */
export function mapMessage(message: unknown, latencyMs: number): ModelResponse {
  const m = message as RawMessage;
  const text = m.content?.find((c) => c.type === "text" && typeof c.text === "string")?.text;
  return {
    providerRequestId: m._request_id ?? null,
    model: m.model ?? "",
    stopReason: (m.stop_reason ?? "end_turn") as StopReason,
    outputText: text,
    rawUsage: m.usage ? { ...m.usage } : null,
    usage: toUsage(m.usage),
    latencyMs
  };
}

function headerValue(headers: unknown, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (headers && typeof headers === "object") { const v = (headers as Record<string, unknown>)[name]; return typeof v === "string" ? v : null; }
  return null;
}

function retryAfterMs(headers: unknown): number | null {
  const raw = headerValue(headers, "retry-after");
  if (raw === null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

export function classifyProviderError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(err.message, "transient");
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    const transient = status !== undefined && (TRANSIENT_STATUSES.has(status) || status >= 500);
    const requestId = typeof err.requestID === "string" ? err.requestID : headerValue(err.headers, "request-id");
    return new ProviderError(err.message, transient ? "transient" : "permanent", status, { requestId, retryAfterMs: retryAfterMs(err.headers) });
  }
  return new ProviderError(err instanceof Error ? err.message : String(err), "permanent");
}

/** The only place the Anthropic SDK is called. SDK retries are off (maxRetries 0): the stage runner retries, and every retry is its own recorded attempt. */
export function createAnthropicProvider(options: { apiKey?: string; client?: MessagesClient; timeoutMs?: number } = {}): ModelProvider {
  let client = options.client;
  if (!client) {
    const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not set and no api key was injected", "permanent");
    client = new Anthropic({ apiKey, maxRetries: 0 }) as unknown as MessagesClient;
  }
  const configuredTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "anthropic",
    async complete(request, callOptions: CallOptions = {}) {
      const started = Date.now();
      const timeout = callOptions.deadlineMs === undefined ? configuredTimeout : Math.max(1, Math.min(configuredTimeout, callOptions.deadlineMs - started));
      let message: unknown;
      try {
        message = await client!.messages.create(buildMessageParams(request), { maxRetries: 0, timeout });
      } catch (err) {
        throw classifyProviderError(err);
      }
      return mapMessage(message, Date.now() - started);
    }
  };
}
```
Append `export * from "./llm/anthropic-provider.js";` to `src/index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`. Also confirm the boundaries: `grep -rn "@anthropic-ai/sdk" packages/generator/src | grep -v anthropic-provider.ts` prints nothing; `grep -rn "process\.env" packages/generator/src` prints only the one line in `anthropic-provider.ts`; `grep -rn "temperature\|top_p\|top_k\|thinking" packages/generator/src | grep -v "llm/models.ts\|llm/anthropic-provider.ts"` prints nothing.

```bash
git add packages/generator
git commit -m "feat(generator): Anthropic adapter with per-model request profiles, no SDK retries, and contract tests for request shape, usage mapping and error classification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: SSRF-guarded fetch, wired into the only network fetch that exists

Answers review finding 6. The owner's rule: SSRF protection is implemented and tested before any server-side URL fetching, and it is not called a reusable guard while its essential protection is deferred. So this task closes both gaps the review found: addresses are classified after IPv6 normalisation (Node turns `http://[::ffff:127.0.0.1]` into `[::ffff:7f00:1]`; IPv4-compatible, NAT64 and 6to4 embeddings and IPv6 multicast are covered too), and the connection is **pinned** to the validated address through an undici `Agent` whose `connect.lookup` never resolves the name again, which closes the rebinding gap. DNS resolution counts against one total deadline. Phase 2 has no server, but `apps/cli`'s `networkImageResolver` fetches arbitrary URLs behind `--allow-network`, so it switches to `safeFetch` now, and the phase-5 web ingestion and preview origin reuse the same guard.

**Files:**
- Create: `packages/generator/src/net/safe-fetch.ts`
- Modify: `packages/generator/package.json` (add `undici` `^6.21.0`), `apps/cli/src/image-resolver.ts`, `apps/cli/package.json` (add `@leaplearn/generator` dependency)
- Test: `packages/generator/test/safe-fetch.test.ts`, `apps/cli/test/image-resolver.test.ts` (adjust)

**Interfaces:**
- Produces: `safeFetch(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult>` with `SafeFetchOptions = { maxRedirects?: number (5); maxBytes?: number (10 MiB); timeoutMs?: number (15 000, one total deadline covering DNS, every hop and the body); allowedContentTypes?: string[]; lookup?: (hostname) => Promise<string[]>; unsafeAllowPrivateNetworks?: boolean (false; test-only) }`, `SafeFetchResult = { status: number; contentType: string | null; body: Buffer; finalUrl: string; connectedAddress: string }`; `parseIPv6(ip): number[] | null` (eight 16-bit groups; accepts an embedded dotted IPv4 tail and surrounding brackets); `embeddedIPv4(groups): string | null` (mapped `::ffff:0:0/96`, compatible `::/96`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`); `isBlockedAddress(ip: string): boolean` (IPv4: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `224/4`, `240/4`; IPv6: unspecified, loopback, `fc00::/7`, `fe80::/10`, `ff00::/8`, any embedded IPv4 checked as IPv4; anything unparsable is blocked); `SafeFetchError` with `reason: "scheme" | "blocked_address" | "dns" | "too_many_redirects" | "redirect_target" | "timeout" | "too_large" | "content_type" | "http"`.
- Rules: only `http:` and `https:`; the hostname is resolved by the injected `lookup` or `dns.promises.lookup(host, { all: true })` within the deadline; every address must pass (an IP-literal host is checked directly; the metadata address is blocked even under `unsafeAllowPrivateNetworks`); the request is sent through an undici `Agent` whose `connect.lookup` returns the first validated address, so the socket can only reach that address; `redirect: "manual"`; each `Location` is resolved against the current URL, re-validated and counted; the body is read incrementally and aborted past `maxBytes`; the agent is closed after the hop.

- [ ] **Step 1: Failing tests**

`packages/generator/test/safe-fetch.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { embeddedIPv4, isBlockedAddress, parseIPv6, safeFetch, SafeFetchError } from "../src/net/safe-fetch.js";

let server: Server; let base: string; let port: number; const timers: NodeJS.Timeout[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/ok") { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(Buffer.alloc(1024, 1)); return; }
    if (url.pathname === "/host") { res.writeHead(200, { "content-type": "text/plain" }); res.end(req.headers.host ?? ""); return; }
    if (url.pathname === "/big") { res.writeHead(200, { "content-type": "application/octet-stream" }); res.end(Buffer.alloc(200_000, 2)); return; }
    if (url.pathname === "/hop") { res.writeHead(302, { location: "/ok" }); res.end(); return; }
    if (url.pathname === "/loop") { res.writeHead(302, { location: "/loop" }); res.end(); return; }
    if (url.pathname === "/metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
    if (url.pathname === "/mapped") { res.writeHead(302, { location: "http://[::ffff:127.0.0.1]/ok" }); res.end(); return; }
    if (url.pathname === "/slow") { timers.push(setTimeout(() => { res.writeHead(200); res.end("late"); }, 2000)); return; }
    if (url.pathname === "/html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<p>"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => { for (const t of timers) clearTimeout(t); server.close(); });

describe("address classification", () => {
  it("parses IPv6 in every notation Node may hand back", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("[::ffff:7f00:1]")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6("2606:4700::1111")).toEqual([0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111]);
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIPv6("::g")).toBeNull();
  });
  it("extracts embedded IPv4 from mapped, compatible, NAT64 and 6to4 forms", () => {
    expect(embeddedIPv4(parseIPv6("::ffff:7f00:1")!)).toBe("127.0.0.1");
    expect(embeddedIPv4(parseIPv6("::a9fe:a9fe")!)).toBe("169.254.169.254");
    expect(embeddedIPv4(parseIPv6("64:ff9b::7f00:1")!)).toBe("127.0.0.1");
    expect(embeddedIPv4(parseIPv6("2002:c0a8:101::")!)).toBe("192.168.1.1");
    expect(embeddedIPv4(parseIPv6("2606:4700::1111")!)).toBeNull();
  });
  it("blocks private, loopback, link-local, metadata, multicast, unspecified and every embedded form", () => {
    const blocked = ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
      "::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "ff0e::1",
      "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:a9fe:a9fe", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2002:a9fe:a9fe::",
      "not-an-ip", "1.2.3", "::ffff:999.1.1.1"];
    for (const ip of blocked) expect(isBlockedAddress(ip), ip).toBe(true);
  });
  it("allows public addresses in both families", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111", "203.0.113.5", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
});

describe("safeFetch", () => {
  const allow = { unsafeAllowPrivateNetworks: true };
  it("rejects non-http schemes and loopback targets by default", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toMatchObject({ reason: "scheme" });
    await expect(safeFetch(`${base}/ok`)).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://localhost/ok")).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch(`http://[::ffff:127.0.0.1]:${port}/ok`)).rejects.toMatchObject({ reason: "blocked_address" });
  });
  it("fetches, follows a relative redirect, and reports the final url and connected address (private networks allowed for the test server only)", async () => {
    const r = await safeFetch(`${base}/hop`, { ...allow, allowedContentTypes: ["image/jpeg"] });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1024);
    expect(r.finalUrl).toBe(`${base}/ok`);
    expect(r.connectedAddress).toBe("127.0.0.1");
  });
  it("pins the connection to the validated address: a name only the injected lookup can resolve is reached, and the Host header keeps the name", async () => {
    let lookups = 0;
    const r = await safeFetch(`http://pinned.test:${port}/host`, { ...allow, lookup: async (hostname) => { lookups += 1; expect(hostname).toBe("pinned.test"); return ["127.0.0.1"]; } });
    expect(r.body.toString()).toBe(`pinned.test:${port}`);
    expect(r.connectedAddress).toBe("127.0.0.1");
    expect(lookups).toBe(1);
  });
  it("re-validates every redirect target, after normalisation", async () => {
    await expect(safeFetch(`${base}/metadata`, allow)).rejects.toMatchObject({ reason: "redirect_target" });
    await expect(safeFetch(`${base}/mapped`)).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch(`${base}/loop`, { ...allow, maxRedirects: 3 })).rejects.toMatchObject({ reason: "too_many_redirects" });
  });
  it("caps the body size, the total time (DNS included), and the content type", async () => {
    await expect(safeFetch(`${base}/big`, { ...allow, maxBytes: 100_000 })).rejects.toMatchObject({ reason: "too_large" });
    await expect(safeFetch(`${base}/slow`, { ...allow, timeoutMs: 200 })).rejects.toMatchObject({ reason: "timeout" });
    await expect(safeFetch(`http://slow-dns.test:${port}/ok`, { ...allow, timeoutMs: 200, lookup: () => new Promise((resolve) => timers.push(setTimeout(() => resolve(["127.0.0.1"]), 2000))) })).rejects.toMatchObject({ reason: "timeout" });
    await expect(safeFetch(`${base}/html`, { ...allow, allowedContentTypes: ["image/jpeg", "image/png"] })).rejects.toMatchObject({ reason: "content_type" });
    await expect(safeFetch(`${base}/missing`, allow)).rejects.toMatchObject({ reason: "http", status: 404 });
  });
  it("blocks a public name that resolves privately, and a name with no address", async () => {
    await expect(safeFetch("http://example.test/ok", { lookup: async () => ["10.0.0.5"] })).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://example.test/ok", { lookup: async () => ["8.8.8.8", "::ffff:7f00:1"] })).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://example.test/ok", { lookup: async () => [] })).rejects.toMatchObject({ reason: "dns" });
  });
});
```
`/mapped` proves normalisation: the redirect target `http://[::ffff:127.0.0.1]/ok` becomes `[::ffff:7f00:1]` inside `URL`, and the guard must still see loopback (the earlier dotted-only regex did not). The metadata redirect relies on `169.254.169.254` being blocked even when `unsafeAllowPrivateNetworks` is true (a separate rule, implemented below).

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/net/safe-fetch.ts`:
```ts
import { promises as dns } from "node:dns";
import { isIPv4 } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

export type SafeFetchReason = "scheme" | "blocked_address" | "dns" | "too_many_redirects" | "redirect_target" | "timeout" | "too_large" | "content_type" | "http";

export class SafeFetchError extends Error {
  constructor(message: string, public readonly reason: SafeFetchReason, public readonly status?: number) { super(message); this.name = "SafeFetchError"; }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  /** One total deadline: DNS, every hop and the body read all count against it. */
  timeoutMs?: number;
  allowedContentTypes?: string[];
  lookup?: (hostname: string) => Promise<string[]>;
  /** Test-only escape hatch (a loopback test server); never set it in application code. The metadata address stays blocked. */
  unsafeAllowPrivateNetworks?: boolean;
}
export interface SafeFetchResult { status: number; contentType: string | null; body: Buffer; finalUrl: string; connectedAddress: string; }

const METADATA_V4 = "169.254.169.254";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const BLOCKED_V4: Array<[string, number]> = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]];

/** Eight 16-bit groups, or null when the text is not an IPv6 address. Brackets and an embedded dotted IPv4 tail are accepted. */
export function parseIPv6(input: string): number[] | null {
  let ip = input.trim();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (ip.split("::").length > 2) return null;
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    ip = `${ip.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", rest] = ip.split("::");
  const parse = (s: string): number[] | null => {
    if (s === "") return [];
    const groups = s.split(":").map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const h = parse(head); const t = rest === undefined ? [] : parse(rest);
  if (h === null || t === null) return null;
  if (rest === undefined) return h.length === 8 ? h : null;
  const zeros = 8 - h.length - t.length;
  return zeros < 1 ? null : [...h, ...Array<number>(zeros).fill(0), ...t];
}

function dotted(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/** The IPv4 address an IPv6 address carries, if any: mapped ::ffff:0:0/96, compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16. */
export function embeddedIPv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const leadingZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (leadingZero && g5 === 0xffff) return dotted(g6, g7);
  if (leadingZero && g5 === 0 && (g6 !== 0 || g7 > 1)) return dotted(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return dotted(g6, g7);
  if (g0 === 0x2002) return dotted(g1, g2);
  return null;
}

function isBlockedV4(ip: string): boolean {
  return !isIPv4(ip) || BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedV4(ip);
  const groups = parseIPv6(ip);
  if (!groups) return true;
  const embedded = embeddedIPv4(groups);
  if (embedded !== null) return isBlockedV4(embedded);
  const first = groups[0]!;
  if (groups.every((g) => g === 0)) return true;                                   // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;   // ::1
  if ((first & 0xfe00) === 0xfc00) return true;                                    // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true;                                    // fe80::/10
  if ((first & 0xff00) === 0xff00) return true;                                    // ff00::/8 multicast
  return false;
}

function isMetadata(ip: string): boolean {
  if (ip === METADATA_V4) return true;
  const groups = parseIPv6(ip);
  return groups !== null && embeddedIPv4(groups) === METADATA_V4;
}

function familyOf(ip: string): 4 | 6 {
  return isIPv4(ip) ? 4 : 6;
}

class Deadline {
  private readonly endsAt: number;
  constructor(timeoutMs: number) { this.endsAt = Date.now() + timeoutMs; }
  remaining(): number { return this.endsAt - Date.now(); }
  signal(): AbortSignal { return AbortSignal.timeout(Math.max(1, this.remaining())); }
  async race<T>(work: Promise<T>, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SafeFetchError(`timed out while ${what}`, "timeout")), Math.max(1, this.remaining())); });
    try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
  }
}

/** Resolves and validates every address for the URL's host; returns the address the connection will be pinned to. */
async function resolveAllowed(url: URL, options: SafeFetchOptions, deadline: Deadline, reason: "blocked_address" | "redirect_target"): Promise<string> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError(`unsupported scheme ${url.protocol}`, reason === "redirect_target" ? "redirect_target" : "scheme");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIPv4(host) || parseIPv6(host)) addresses = [host];
  else {
    try {
      const resolved = options.lookup ? options.lookup(host) : dns.lookup(host, { all: true }).then((rows) => rows.map((r) => r.address));
      addresses = await deadline.race(resolved, `resolving ${host}`);
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError(`cannot resolve ${host}: ${err instanceof Error ? err.message : String(err)}`, "dns");
    }
    if (addresses.length === 0) throw new SafeFetchError(`no addresses for ${host}`, "dns");
  }
  for (const a of addresses) {
    if (isMetadata(a)) throw new SafeFetchError(`${host} resolves to the metadata address`, reason);
    if (!options.unsafeAllowPrivateNetworks && isBlockedAddress(a)) throw new SafeFetchError(`${host} resolves to a blocked address ${a}`, reason);
    if (options.unsafeAllowPrivateNetworks && !isIPv4(a) && !parseIPv6(a)) throw new SafeFetchError(`${host} resolves to an unparsable address ${a}`, reason);
  }
  return addresses[0]!;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;

/**
 * An agent that can only ever connect to `address`: the name is never resolved again after validation.
 * Node's automatic family selection (on by default since Node 20) calls lookup with `{ all: true }` and
 * expects an array; a plain lookup expects (address, family). Both forms are honoured, because returning
 * the wrong shape makes the connection fail with ERR_INVALID_IP_ADDRESS (review finding 2).
 */
function pinnedAgent(address: string): Dispatcher {
  const family = familyOf(address);
  return new Agent({
    connect: {
      lookup: (_hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback) => {
        if (typeof options === "object" && options !== null && options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      }
    }
  });
}

async function readCapped(res: Response, maxBytes: number, deadline: Deadline): Promise<Buffer> {
  const chunks: Buffer[] = []; let total = 0;
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    if (deadline.remaining() <= 0) { await reader.cancel(); throw new SafeFetchError("timed out while reading the body", "timeout"); }
    const { done, value } = await deadline.race(reader.read(), "reading the body");
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new SafeFetchError(`body exceeds ${maxBytes} bytes`, "too_large"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches a URL for application code with SSRF controls: http(s) only; every hostname resolved and
 * every address classified (after IPv6 normalisation) against private, loopback, link-local, metadata
 * and multicast ranges; the connection pinned to the validated address so the name is never resolved
 * again; redirects followed manually and re-checked; one total deadline; capped body.
 */
export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const deadline = new Deadline(options.timeoutMs ?? 15_000);
  let url: URL;
  try { url = new URL(input); } catch { throw new SafeFetchError(`invalid url ${input}`, "scheme"); }
  let address = await resolveAllowed(url, options, deadline, "blocked_address");

  for (let hop = 0; ; hop++) {
    const agent = pinnedAgent(address);
    let res: Response;
    try {
      res = (await undiciFetch(url.href, { redirect: "manual", signal: deadline.signal(), dispatcher: agent, headers: { accept: options.allowedContentTypes?.join(", ") ?? "*/*" } })) as unknown as Response;
    } catch (err) {
      await agent.close();
      if (deadline.remaining() <= 0 || (err instanceof Error && err.name === "TimeoutError")) throw new SafeFetchError(`timed out fetching ${url.href}`, "timeout");
      throw new SafeFetchError(`fetch failed for ${url.href}: ${err instanceof Error ? err.message : String(err)}`, "http");
    }
    try {
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) throw new SafeFetchError(`redirect without location from ${url.href}`, "http", res.status);
        if (hop + 1 > maxRedirects) throw new SafeFetchError(`more than ${maxRedirects} redirects from ${input}`, "too_many_redirects");
        const next = new URL(location, url);
        address = await resolveAllowed(next, options, deadline, "redirect_target");
        url = next;
        continue;
      }
      if (!res.ok) { await res.body?.cancel(); throw new SafeFetchError(`HTTP ${res.status} from ${url.href}`, "http", res.status); }
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim() || null;
      if (options.allowedContentTypes && (!contentType || !options.allowedContentTypes.includes(contentType))) {
        await res.body?.cancel();
        throw new SafeFetchError(`content-type ${contentType ?? "(none)"} not allowed for ${url.href}`, "content_type", res.status);
      }
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes) { await res.body?.cancel(); throw new SafeFetchError(`body of ${declared} bytes exceeds ${maxBytes}`, "too_large"); }
      const body = await readCapped(res, maxBytes, deadline);
      return { status: res.status, contentType, body, finalUrl: url.href, connectedAddress: address };
    } finally {
      await agent.close();
    }
  }
}
```
Append `export * from "./net/safe-fetch.js";` to `src/index.ts`. `packages/generator/package.json` adds `"undici": "^6.21.0"` (the major Node 20.19 bundles; `fetch` and `Agent` are imported from the package so the dispatcher and the fetch implementation are the same version). The pinning test (`pinned.test`) must run under the pinned Node (`>=20.19.0 <21`), where automatic family selection is on and the array form is the one exercised; do not weaken it to an IP-literal URL. If undici's `connect.lookup` typing in the installed version differs, follow the installed `types/connector.d.ts` and keep both callback forms.

`apps/cli/src/image-resolver.ts` — `networkImageResolver` becomes:
```ts
import { safeFetch, SafeFetchError } from "@leaplearn/generator";
// …
export const networkImageResolver: ImageResolver = async (ref, baseDir) => {
  if (!isUrl(ref)) return localImageResolver(ref, baseDir);
  let fetched;
  try {
    fetched = await safeFetch(ref, { allowedContentTypes: Object.values(MIME), maxBytes: 20 * 1024 * 1024, timeoutMs: 20_000 });
  } catch (err) {
    if (err instanceof SafeFetchError) throw new Error(`image ${ref}: ${err.message} (${err.reason})`);
    throw err;
  }
  const bytes = fetched.body;
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, mimeType: fetched.contentType!, open: () => Readable.from([bytes]) };
};
```
`apps/cli/package.json` adds `"@leaplearn/generator": "workspace:*"`. The existing `apps/cli/test/image-resolver.test.ts` fetches from a `127.0.0.1` test server, which the guard now blocks: change that test to assert the loopback fetch is rejected with `/blocked address/`. The CLI test proves the wiring; the generator test proves the behaviour.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator build && pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/cli test && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"`. Expected `exit=0`. Also confirm the boundary: `grep -rn "fetch(" apps/cli/src packages/generator/src | grep -v "safe-fetch.ts"` prints nothing. Manual check: `node apps/cli/dist/index.js flashcards apps/cli-legacy/tests/flash1.csv /tmp/flash1.h5p --allow-network; echo "exit=$?"` still builds when the network is available (pixabay is public), and `leap flashcards` with an image URL pointing at `http://127.0.0.1/…` or `http://[::ffff:127.0.0.1]/…` now fails with `blocked address`.

```bash
git add packages/generator apps/cli pnpm-lock.yaml
git commit -m "feat(generator): SSRF-guarded safeFetch with normalised address checks and a pinned connection; route the CLI image resolver through it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Stage runner with content-attempt feedback, the system prompt tables, model-output schemas, and unit parsing

Every later stage calls the model through one `StageRunner.run({ key, request, schema, verify })`: it dispatches through `callModel`, parses the JSON with the stage's Zod schema, runs the stage's `verify` (reference validity, answer checks), and on a **content failure** feeds the reasons back into the next attempt, up to three attempts; a **transient** provider failure is retried without consuming a content attempt (at most three in a row, waiting the larger of 1 s / 2 s / 4 s and the provider's `retry-after`, injectable); a **permanent** provider failure or a budget refusal ends the operation without regeneration (spec §5). The runner is the **only** retry loop in the system (review finding 2): every retry is a fresh `callModel`, so it has its own reservation, start and outcome records. Every attempt carries the call's stable `key` and a `retryIndex` that counts earlier attempts for that key, including attempts recorded before a resumption (review finding 9). This task also adds the contract test that every real model-output schema reaches the wire in the provider-compatible projection (review finding 1).

**Files:**
- Create: `packages/generator/src/llm/runner.ts`, `src/prompts/system.ts`, `src/schemas/model-output.ts`, `src/competency/parse-unit.ts`
- Test: `packages/generator/test/runner.test.ts`, `test/system-prompt.test.ts`, `test/model-output.test.ts`, `test/parse-unit.test.ts`

**Interfaces:**
- Produces: `StageCall<T> = { key: string; request: ModelRequest; schema: z.ZodType<T>; verify?: (value: T) => string[] | Promise<string[]> }`; `StageRunner { run<T>(call: StageCall<T>): Promise<StageResult<T>> }` with `StageResult<T> = { value: T; attempts: number; attemptIds: string[] }`; `ContentFailure` (`reasons: string[]`, `attempts`), `BudgetRefused` (`limit: BudgetLimitName`), `InfrastructureFailure`, `RunStopped` (`reason`) (all `Error` subclasses with `name`); `createRunner(options: { provider; recorder; budget; operationId; maxContentAttempts?: 3; maxTransientRetries?: 3; sleep?: (ms) => Promise<void>; ids?; clock?; priorAttempts?: (key: string) => number; stop?: () => string | null }): StageRunner`; `FEEDBACK_HEADER = "YOUR PREVIOUS ATTEMPT WAS REJECTED FOR THESE REASONS:"`. The runner consults `stop()` before **every** dispatch, including the one after a backoff wait, and throws `RunStopped` when the import has been stopped by another lane (review finding 5); a backoff wait that would run past the budget deadline is refused as `BudgetRefused("elapsed")` instead of slept.
- Produces (prompts): `READING_LEVELS`, `TONES` (the legacy tables verbatim), `GROUNDING_RULES`, `buildSystemPrompt(config: PromptConfig): string` where `PromptConfig = { readingLevel: ReadingLevel; tone: Tone; language: string; instructionalLanguage?: string; customisation?: string }`; defaults for generation: `readingLevel: "high-school"`, `tone: "educational"`, `language: "en"`.
- Produces (schemas): strict Zod objects (no optionals, no defaults) `UnitOut`, `ConceptsOut`, `MergeOut`, `AlignmentOut`, `PlanOut`, `MultiChoiceOut`, `BlanksOut`, `FlashcardsOut`, each with a `…Schema` JSON export produced once by `toProviderSchema`. `BlanksOut` and `FlashcardsOut` carry evidence ids **per item only**; the activity's evidence is derived as the union in the producers (review finding 8).
- Produces (competency): `parseUnit(unitText: string, runner: StageRunner): Promise<UnitOfCompetency>`; ids assigned in code from the numbers the model returns (`E1`, `PC1.1`), by position when a number is not numeric; `textHash` of the trimmed unit text.

- [ ] **Step 1: Failing tests**

`packages/generator/test/runner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createRunner, ContentFailure, BudgetRefused, InfrastructureFailure, RunStopped, FEEDBACK_HEADER } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget } from "../src/llm/budget.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptStart) { this.events.push(e); } async recordOutcome(e: AttemptOutcome) { this.events.push(e); } }
const starts = (r: MemoryRecorder) => r.events.filter((e): e is AttemptStart => e.event === "start");
const outcomes = (r: MemoryRecorder) => r.events.filter((e): e is AttemptOutcome => e.event === "outcome");
const Out = z.object({ n: z.number() });
const call = (verify?: (v: { n: number }) => string[]) => ({ key: "produce:act-1", request: { purpose: "produce" as const, model: modelForRole("produce"), system: "s", user: "u", maxOutputTokens: 100, outputSchema: toProviderSchema(Out) }, schema: Out, ...(verify ? { verify } : {}) });
type RunnerOptions = Parameters<typeof createRunner>[0];
/** Budgets start now (the real clock the runner uses), so the elapsed deadline is ahead of every test. */
const mk = (provider: FakeProvider, recorder = new MemoryRecorder(), extra: Partial<RunnerOptions> = {}) => createRunner({ provider, recorder, budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op", sleep: async () => undefined, ...extra });

describe("stage runner", () => {
  it("feeds schema and verify failures back and succeeds within three content attempts, numbering the retries", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":\"x\"}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":3}" })]);
    const recorder = new MemoryRecorder();
    const result = await mk(provider, recorder).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])));
    expect(result).toMatchObject({ value: { n: 3 }, attempts: 3 });
    expect(provider.requests[1]?.user).toContain(FEEDBACK_HEADER);
    expect(provider.requests[2]?.user).toContain("n must be positive");
    expect(provider.requests[2]?.user).not.toContain("Invalid input"); // only the latest reasons are fed back
    expect(outcomes(recorder)).toHaveLength(3);
    expect(starts(recorder).map((s) => [s.callKey, s.retryIndex, s.retryReason, s.attempt])).toEqual([["produce:act-1", 0, null, 1], ["produce:act-1", 1, "content", 2], ["produce:act-1", 2, "content", 3]]);
  });
  it("fails as ContentFailure after the third rejected attempt, carrying every reason", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":9}" })]);
    await expect(mk(provider).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])))).rejects.toMatchObject({ name: "ContentFailure", attempts: 3 });
    expect(provider.requests).toHaveLength(3);
  });
  it("retries a transient failure as a new metered attempt: two starts, two outcomes, two reservations, one content attempt", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const recorder = new MemoryRecorder();
    const budget = createBudget({ usdMicro: 10_000_000 });
    const result = await mk(provider, recorder, { budget }).run(call());
    expect(result.attempts).toBe(1);
    expect(starts(recorder)).toHaveLength(2);
    expect(outcomes(recorder).map((o) => o.status)).toEqual(["transient_error", "ok"]);
    expect(starts(recorder).map((s) => [s.retryIndex, s.retryReason, s.attempt])).toEqual([[0, null, 1], [1, "transient", 1]]);
    for (const s of starts(recorder)) expect(s.reservedUsdMicro).toBeGreaterThan(0);
    expect(budget.requests).toBe(2);
    expect(budget.reservedUsdMicro).toBe(0);
    expect(budget.spentUsdMicro).toBeGreaterThanOrEqual(starts(recorder)[0]!.reservedUsdMicro); // the failed attempt keeps its reservation as spent
  });
  it("waits with backoff, honouring the provider's retry-after when it is longer, and gives up after three transient failures in a row", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const provider = new FakeProvider([new ProviderError("busy", "transient", 429, { retryAfterMs: 2500 }), new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    await mk(provider, new MemoryRecorder(), { sleep }).run(call());
    expect(waits).toEqual([2500, 2000]);
    const dead = new FakeProvider(Array.from({ length: 4 }, () => new ProviderError("down", "transient", 503)));
    await expect(mk(dead).run(call())).rejects.toBeInstanceOf(InfrastructureFailure);
    expect(dead.requests).toHaveLength(4);
  });
  it("does not dispatch a retry once the import has been stopped, and does not sleep past the deadline", async () => {
    let stopped: string | null = null;
    const provider = new FakeProvider([new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const sleep = async () => { stopped = "budget: another lane hit the request limit"; };
    await expect(mk(provider, new MemoryRecorder(), { sleep, stop: () => stopped }).run(call())).rejects.toMatchObject({ name: "RunStopped", message: expect.stringMatching(/another lane/) });
    expect(provider.requests).toHaveLength(1); // the retry after the wait was not dispatched
    await expect(mk(new FakeProvider([]), new MemoryRecorder(), { stop: () => "system: storage failed" }).run(call())).rejects.toBeInstanceOf(RunStopped);
    const nearDeadline = createBudget({ usdMicro: 10_000_000, elapsedMs: 500 });
    const slow = new FakeProvider([new ProviderError("busy", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    await expect(mk(slow, new MemoryRecorder(), { budget: nearDeadline }).run(call())).rejects.toMatchObject({ name: "BudgetRefused", limit: "elapsed" }); // a 1 s backoff would pass the 500 ms deadline
    expect(slow.requests).toHaveLength(1);
  });
  it("numbers a resumed call's first attempt after the attempts already in the ledger", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]);
    const recorder = new MemoryRecorder();
    await mk(provider, recorder, { priorAttempts: (key) => (key === "produce:act-1" ? 2 : 0) }).run(call());
    expect(starts(recorder)[0]).toMatchObject({ retryIndex: 2, retryReason: "resume", attempt: 1 });
  });
  it("stops on a permanent provider failure and on a budget refusal without regeneration", async () => {
    await expect(mk(new FakeProvider([new ProviderError("bad key", "permanent", 401, { requestId: "req_401" })])).run(call())).rejects.toMatchObject({ name: "InfrastructureFailure", message: expect.stringMatching(/req_401/) });
    const runner = createRunner({ provider: new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]), recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 1 }), operationId: "op", sleep: async () => undefined });
    await expect(runner.run(call())).rejects.toMatchObject({ name: "BudgetRefused", limit: "spend" });
  });
});
```

`packages/generator/test/model-output.test.ts` (the contract test over the real schemas):
```ts
import { describe, it, expect } from "vitest";
import { assertProviderCompatible, UNSUPPORTED_SCHEMA_KEYWORDS } from "../src/llm/schema.js";
import * as out from "../src/schemas/model-output.js";

const SCHEMAS: Record<string, Record<string, unknown>> = {
  UnitOutSchema: out.UnitOutSchema, ConceptsOutSchema: out.ConceptsOutSchema, MergeOutSchema: out.MergeOutSchema, AlignmentOutSchema: out.AlignmentOutSchema,
  PlanOutSchema: out.PlanOutSchema, MultiChoiceOutSchema: out.MultiChoiceOutSchema, BlanksOutSchema: out.BlanksOutSchema, FlashcardsOutSchema: out.FlashcardsOutSchema
};

describe("model-output schemas on the wire", () => {
  it("every real schema is provider-compatible: closed objects, every property required, no unsupported keyword anywhere, no $schema", () => {
    expect(Object.keys(SCHEMAS)).toHaveLength(8);
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      expect(() => assertProviderCompatible(schema), name).not.toThrow();
      const text = JSON.stringify(schema);
      for (const keyword of UNSUPPORTED_SCHEMA_KEYWORDS) expect(text, `${name} carries ${keyword}`).not.toContain(`"${keyword}":`);
    }
  });
  it("PlanOut's integer slot reaches the wire as a plain integer while the Zod schema still rejects non-integers", () => {
    const activities = (out.PlanOutSchema["properties"] as Record<string, Record<string, unknown>>)["activities"]!;
    const slot = ((activities["items"] as Record<string, unknown>)["properties"] as Record<string, Record<string, unknown>>)["slot"]!;
    expect(slot["type"]).toBe("integer");
    expect(slot).not.toHaveProperty("minimum");
    expect(slot).not.toHaveProperty("maximum");
    expect(out.PlanOut.safeParse({ activities: [{ slot: 1.5, type: "blanks", conceptIds: ["c1"], criteriaIds: [], focus: "f" }] }).success).toBe(false);
  });
  it("item schemas carry evidence per item only", () => {
    expect(Object.keys(out.BlanksOutSchema["properties"] as object)).not.toContain("evidenceIds");
    expect(Object.keys(out.FlashcardsOutSchema["properties"] as object)).not.toContain("evidenceIds");
    expect(Object.keys(out.MultiChoiceOutSchema["properties"] as object)).toContain("evidenceIds");
  });
});
```

`packages/generator/test/system-prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt, READING_LEVELS, TONES, GROUNDING_RULES } from "../src/prompts/system.js";

describe("system prompt", () => {
  it("carries the reading level, tone, language and grounding rules", () => {
    const p = buildSystemPrompt({ readingLevel: "professional", tone: "educational", language: "en" });
    expect(p).toContain("READING LEVEL: PROFESSIONAL");
    expect(p).toContain(READING_LEVELS.professional.vocabulary);
    expect(p).toContain(TONES.educational);
    expect(p).toContain(GROUNDING_RULES);
    expect(p).toContain("CONTENT LANGUAGE: English (en)");
    expect(p).not.toContain("INSTRUCTIONAL LANGUAGE");
  });
  it("adds instructional language and customisation only when given", () => {
    const p = buildSystemPrompt({ readingLevel: "esl-intermediate", tone: "casual", language: "vi", instructionalLanguage: "en", customisation: "Use construction-site examples." });
    expect(p).toContain("INSTRUCTIONAL LANGUAGE: English (en)");
    expect(p).toContain("ADDITIONAL CUSTOMISATION:\nUse construction-site examples.");
  });
  it("is stable for identical config (cache prefix)", () => {
    const a = buildSystemPrompt({ readingLevel: "grade-9", tone: "academic", language: "en" });
    const b = buildSystemPrompt({ readingLevel: "grade-9", tone: "academic", language: "en" });
    expect(a).toBe(b);
  });
});
```

`packages/generator/test/parse-unit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseUnit } from "../src/competency/parse-unit.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { criteriaOf } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");

/** Synthetic model output for unit-synele001.txt, authored by hand. */
const unitOut = {
  code: "SYNELE001", title: "Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)",
  elements: [
    { number: "1", text: "Prepare to isolate equipment", performanceCriteria: [{ number: "1.1", text: "Identify electrical hazards in the work area and record them on the isolation permit" }, { number: "1.2", text: "Confirm every supply to the equipment, including secondary supplies" }] },
    { number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ number: "2.1", text: "Apply lockout devices and tags in accordance with site procedure" }, { number: "2.2", text: "Test for dead using a proved voltage tester" }] },
    { number: "3", text: "Restore supply", performanceCriteria: [{ number: "3.1", text: "Remove locks and tags in the correct sequence after work is complete" }, { number: "3.2", text: "Complete an incident report for any breach of isolation" }, { number: "3.3", text: "Confirm guards and covers are refitted before supply is restored" }] }
  ],
  knowledgeEvidence: ["types of electrical hazards including stored energy and multiple supplies", "purpose of lockout devices and tags"],
  performanceEvidence: ["isolate and test at least one item of equipment fed from two supplies"]
};

describe("parseUnit", () => {
  it("assigns element and criterion ids in code and hashes the unit text", async () => {
    const text = await readFile(resolve(fixtures, "unit-synele001.txt"), "utf8");
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(unitOut) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-unit", sleep: async () => undefined });
    const unit = await parseUnit(text, runner);
    expect(unit.code).toBe("SYNELE001");
    expect(unit.elements.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
    expect(criteriaOf(unit).map((c) => c.id)).toEqual(["PC1.1", "PC1.2", "PC2.1", "PC2.2", "PC3.1", "PC3.2", "PC3.3"]);
    expect(unit.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(provider.requests[0]?.purpose).toBe("parseUnit");
    expect(provider.requests[0]?.user).toContain("SYNELE001");
  });
  it("rejects an element without criteria as a content failure", async () => {
    const provider = new FakeProvider(Array.from({ length: 3 }, () => fakeResponse({ outputText: JSON.stringify({ ...unitOut, elements: [{ number: "1", text: "x", performanceCriteria: [] }] }) })));
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-unit", sleep: async () => undefined });
    await expect(parseUnit("SYNELE001 …", runner)).rejects.toMatchObject({ name: "ContentFailure" });
  });
});
```

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/llm/runner.ts`:
```ts
import type { z } from "zod";
import { callModel, type CallContext } from "./call-model.js";
import { remainingMs, type Budget, type BudgetLimitName } from "./budget.js";
import type { ModelProvider } from "./provider.js";
import type { AttemptRecorder, ModelRequest, RetryReason } from "./types.js";

export interface StageCall<T> { key: string; request: ModelRequest; schema: z.ZodType<T>; verify?: (value: T) => string[] | Promise<string[]>; }
export interface StageResult<T> { value: T; attempts: number; attemptIds: string[]; }
export interface StageRunner { run<T>(call: StageCall<T>): Promise<StageResult<T>>; }

export class ContentFailure extends Error {
  constructor(public readonly reasons: string[], public readonly attempts: number) { super(`content rejected after ${attempts} attempt(s): ${reasons.join("; ")}`); this.name = "ContentFailure"; }
}
export class BudgetRefused extends Error { constructor(reason: string, public readonly limit: BudgetLimitName) { super(reason); this.name = "BudgetRefused"; } }
export class InfrastructureFailure extends Error { constructor(message: string) { super(message); this.name = "InfrastructureFailure"; } }
/** Thrown instead of dispatching when another lane has stopped the import; the activity is recorded as skipped and re-dispatched on resume. */
export class RunStopped extends Error { constructor(public readonly reason: string) { super(reason); this.name = "RunStopped"; } }

export const FEEDBACK_HEADER = "YOUR PREVIOUS ATTEMPT WAS REJECTED FOR THESE REASONS:";
const TRANSIENT_WAITS_MS = [1000, 2000, 4000];

export interface RunnerOptions {
  provider: ModelProvider;
  recorder: AttemptRecorder;
  budget: Budget;
  operationId: string;
  maxContentAttempts?: number;
  maxTransientRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  ids?: () => string;
  clock?: () => Date;
  /** Attempts already recorded for a call key earlier in the import (the pipeline reads them from the ledger); a resumed call's first attempt starts its retryIndex there. */
  priorAttempts?: (key: string) => number;
  /** The import's shared stop signal: a reason once any lane has stopped it, null otherwise. Consulted before every dispatch. */
  stop?: () => string | null;
}

function withFeedback(request: ModelRequest, reasons: string[]): ModelRequest {
  const base = request.user.split(`\n\n${FEEDBACK_HEADER}`)[0]!;
  return { ...request, user: `${base}\n\n${FEEDBACK_HEADER}\n${reasons.map((r) => `- ${r}`).join("\n")}\nReturn a corrected, complete response.` };
}

function zodReasons(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** The only retry loop (spec §5 step 5): content failures feed back, transient failures retry as new metered attempts, everything else stops. */
export function createRunner(options: RunnerOptions): StageRunner {
  const maxContent = options.maxContentAttempts ?? 3;
  const maxTransient = options.maxTransientRetries ?? 3;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const priorAttempts = options.priorAttempts ?? (() => 0);
  const stop = options.stop ?? (() => null);
  const now = options.clock ?? (() => new Date());
  return {
    async run<T>(call: StageCall<T>): Promise<StageResult<T>> {
      let request = call.request;
      let attempt = 0;
      let transientInARow = 0;
      let retryIndex = priorAttempts(call.key);
      let retryReason: RetryReason | null = retryIndex > 0 ? "resume" : null;
      const attemptIds: string[] = [];
      let lastReasons: string[] = [];
      while (attempt < maxContent) {
        const stopReason = stop();
        if (stopReason !== null) throw new RunStopped(stopReason);
        const ctx: CallContext = { provider: options.provider, recorder: options.recorder, budget: options.budget, operationId: options.operationId, callKey: call.key, retryIndex, retryReason, attempt: attempt + 1 };
        if (options.ids) ctx.ids = options.ids;
        if (options.clock) ctx.clock = options.clock;
        const result = await callModel(request, ctx);
        if (result.kind === "budget_refused") throw new BudgetRefused(result.reason, result.limit);
        if (result.kind === "provider_error") throw new InfrastructureFailure(`${result.error}${result.providerRequestId ? ` (request ${result.providerRequestId})` : ""}`);
        if (result.kind === "transient_error") {
          attemptIds.push(result.attemptId);
          retryIndex += 1;
          retryReason = "transient";
          if (++transientInARow > maxTransient) throw new InfrastructureFailure(`provider unavailable after ${maxTransient} transient failures: ${result.error}${result.providerRequestId ? ` (request ${result.providerRequestId})` : ""}`);
          const wait = Math.max(TRANSIENT_WAITS_MS[Math.min(transientInARow - 1, TRANSIENT_WAITS_MS.length - 1)]!, result.retryAfterMs ?? 0);
          if (remainingMs(options.budget, now().getTime()) <= wait) throw new BudgetRefused(`budget: a ${wait} ms backoff would pass the import's elapsed-time limit`, "elapsed");
          await sleep(wait);
          continue;
        }
        transientInARow = 0;
        attempt += 1;
        attemptIds.push(result.attemptId);
        const reject = (reasons: string[]): void => { lastReasons = reasons; request = withFeedback(request, reasons); retryIndex += 1; retryReason = "content"; };
        if (result.kind === "content_error") { reject([result.reason]); continue; }
        const parsed = call.schema.safeParse(result.json);
        if (!parsed.success) { reject(zodReasons(parsed.error)); continue; }
        const issues = call.verify ? await call.verify(parsed.data) : [];
        if (issues.length > 0) { reject(issues); continue; }
        return { value: parsed.data, attempts: attempt, attemptIds };
      }
      throw new ContentFailure(lastReasons, attempt);
    }
  };
}
```

`packages/generator/src/prompts/system.ts` — the legacy tables carried over verbatim, plus grounding rules:
```ts
export const READING_LEVEL_IDS = ["kindergarten", "elementary", "grade-1", "grade-2", "grade-3", "grade-4", "grade-5", "grade-6", "grade-7", "grade-8", "grade-9", "grade-10", "grade-11", "grade-12", "high-school", "college", "professional", "esl-beginner", "esl-intermediate"] as const;
export type ReadingLevel = (typeof READING_LEVEL_IDS)[number];
export const TONE_IDS = ["educational", "professional", "casual", "academic", "creative"] as const;
export type Tone = (typeof TONE_IDS)[number];

export interface ReadingLevelPreset { sentenceLength: string; vocabulary: string; style: string; examples: string; }

export const READING_LEVELS: Record<ReadingLevel, ReadingLevelPreset> = {
  kindergarten: { sentenceLength: "Use very simple sentences (3-5 words). Keep structure basic.", vocabulary: "Use concrete nouns and basic verbs only. Avoid abstract concepts completely.", style: "Use a warm, supportive tone. Use repetition for learning.", examples: "Use simple, tangible examples: colors, animals, family members, basic actions." },
  elementary: { sentenceLength: "Use very short sentences (8-12 words). Avoid complex sentence structures.", vocabulary: "Use simple, everyday vocabulary. Avoid technical terms. If a technical term is necessary, explain it in very simple words.", style: "Use a friendly, encouraging tone. Break concepts into very small steps.", examples: "Use concrete, tangible examples from everyday life. Avoid abstract concepts." },
  "grade-1": { sentenceLength: "Use simple sentences (5-7 words). Keep subject-verb-object order.", vocabulary: "Use common words and simple adjectives. Build basic vocabulary (100-300 words).", style: "Use a patient, encouraging tone. Use lots of repetition.", examples: "Use family, school, and playground examples. Keep very concrete." },
  "grade-2": { sentenceLength: "Use short sentences (7-10 words). Introduce basic compound sentences.", vocabulary: "Expand vocabulary to 300-500 words. Introduce simple descriptive language.", style: "Use a friendly, supportive tone. Build on known concepts.", examples: "Use examples from school, home, and neighborhood. Introduce simple cause-effect." },
  "grade-3": { sentenceLength: "Use medium sentences (8-12 words). Introduce conjunctions (and, but, so).", vocabulary: "Build vocabulary to 500-800 words. Introduce basic academic terms with definitions.", style: "Use an encouraging, instructional tone. Promote curiosity.", examples: "Use school subjects, hobbies, and community examples. Begin abstract thinking." },
  "grade-4": { sentenceLength: "Use varied sentences (10-15 words). Mix simple and compound sentences.", vocabulary: "Expand vocabulary to 800-1200 words. Introduce subject-specific terminology.", style: "Use a clear, engaging tone. Encourage independent thinking.", examples: "Use real-world applications from science, history, and current events." },
  "grade-5": { sentenceLength: "Use complex sentences (12-18 words). Introduce subordinate clauses.", vocabulary: "Build vocabulary to 1200-1500 words. Use more sophisticated academic language.", style: "Use an instructional, analytical tone. Promote critical thinking.", examples: "Use examples requiring analysis and comparison. Connect multiple concepts." },
  "grade-6": { sentenceLength: "Use medium-length sentences (12-15 words). Keep structure clear and direct.", vocabulary: "Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.", style: "Use a clear, instructional tone. Make concepts relatable to students' lives.", examples: "Use relatable examples from school, home, and popular culture. Include analogies when helpful." },
  "grade-7": { sentenceLength: "Use longer sentences (15-20 words). Vary structure with sophisticated transitions.", vocabulary: "Expand vocabulary to 2000-3000 words. Use discipline-specific terminology.", style: "Use an engaging, analytical tone. Promote deeper analysis.", examples: "Use current events, literature, and cross-disciplinary connections." },
  "grade-8": { sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of nuanced arguments.", vocabulary: "Build vocabulary to 3000-4000 words. Introduce abstract concepts.", style: "Use a sophisticated, thought-provoking tone. Encourage debate and evaluation.", examples: "Use examples requiring synthesis of multiple sources and perspectives." },
  "grade-9": { sentenceLength: "Use longer sentences (15-20 words) with some complexity. Vary sentence structure for engagement.", vocabulary: "Use broader vocabulary. Introduce technical terms with brief definitions. Expect increasing subject knowledge.", style: "Use an engaging, analytical tone. Encourage critical thinking.", examples: "Use real-world applications and current events. Connect to broader themes." },
  "grade-10": { sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of layered ideas.", vocabulary: "Use advanced vocabulary (5000-6000 words). Employ discipline-specific terminology.", style: "Use a challenging, analytical tone. Promote evaluation and synthesis.", examples: "Use college-prep examples, research concepts, and theoretical frameworks." },
  "grade-11": { sentenceLength: "Use sophisticated sentences (20-30 words). Vary structure for rhetorical effect.", vocabulary: "Use college-level vocabulary (6000-7000 words). Assume strong content knowledge.", style: "Use an academic, challenging tone. Encourage original analysis.", examples: "Use college-level analysis, research methods, and theoretical debates." },
  "grade-12": { sentenceLength: "Use advanced academic sentences (20-35 words). Expect mature comprehension.", vocabulary: "Use advanced vocabulary (7000-8000 words). Employ sophisticated academic language.", style: "Use a scholarly, rigorous tone. Promote independent scholarship.", examples: "Use advanced examples requiring synthesis, evaluation, and original thought." },
  "high-school": { sentenceLength: "Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.", vocabulary: "Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.", style: "Use a sophisticated, academic tone. Promote analysis and evaluation.", examples: "Use college-level examples, research references, and interdisciplinary connections." },
  college: { sentenceLength: "Use academic sentence structures of varying complexity. Expect comprehension of dense text.", vocabulary: "Use discipline-specific language freely. Assume foundational knowledge in the subject area.", style: "Use a scholarly, precise tone. Encourage synthesis and original thought.", examples: "Reference research, theories, and debates in the field. Assume intellectual maturity." },
  professional: { sentenceLength: "Use concise, efficient sentences. Get to the point quickly.", vocabulary: "Use industry-standard terminology. Assume professional expertise.", style: "Use a professional, actionable tone. Focus on practical application.", examples: "Use industry case studies, best practices, and real-world scenarios. Emphasize ROI and outcomes." },
  "esl-beginner": { sentenceLength: "Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.", vocabulary: "Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.", style: "Use a patient, supportive tone. Repeat key concepts. Use explicit context.", examples: "Use universal concepts (food, family, weather, time). Avoid culturally specific references." },
  "esl-intermediate": { sentenceLength: "Use medium sentences (10-15 words). Introduce varied sentence patterns gradually.", vocabulary: "Expand vocabulary to everyday situations. Introduce common idioms with explanations. Use multiple tenses.", style: "Use a clear, encouraging tone. Build confidence with scaffolded complexity.", examples: "Include cultural context when introducing idioms. Use travel, work, and education scenarios." }
};

export const TONES: Record<Tone, string> = {
  educational: "Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.",
  professional: "Use a formal, business-like tone. Be concise and action-oriented. Focus on practical outcomes.",
  casual: "Use a conversational, friendly tone. Write as if talking to a peer. Be relatable and warm.",
  academic: "Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence.",
  creative: "Use an imaginative, expressive tone. Employ narrative techniques and vivid language. Engage emotions and creativity."
};

export const GROUNDING_RULES = `GROUNDING RULES (NON-NEGOTIABLE):
- Use only the numbered EVIDENCE sentences you are given. Do not add facts, figures, names or procedures that are not in the evidence.
- Every activity and every item must cite the evidence sentence ids it is based on, in the evidenceIds fields. Cite only ids that appear in the evidence you were given.
- Write plain text. No markdown, no HTML tags, no bullet characters, no emoji.
- Never use the characters * / : inside fill-in-the-blank answers or tips, and never put * in a passage.
- If the evidence does not support the task, return fewer items rather than inventing content.`;

const LANGUAGE_NAMES: Record<string, string> = { en: "English", vi: "Vietnamese", fr: "French", de: "German", es: "Spanish", zh: "Chinese", ar: "Arabic", hi: "Hindi", id: "Indonesian", ja: "Japanese", ko: "Korean", pt: "Portuguese", th: "Thai", it: "Italian" };
export function languageName(code: string): string { return LANGUAGE_NAMES[code.toLowerCase()] ?? code; }

export interface PromptConfig { readingLevel: ReadingLevel; tone: Tone; language: string; instructionalLanguage?: string; customisation?: string; }
export const DEFAULT_PROMPT_CONFIG: PromptConfig = { readingLevel: "high-school", tone: "educational", language: "en" };

/** Deterministic for identical config, so it forms a stable cached prefix. */
export function buildSystemPrompt(config: PromptConfig): string {
  const level = READING_LEVELS[config.readingLevel];
  const parts = [
    "You are an expert vocational-education content generator. You turn source evidence into H5P revision activities that help learners check their understanding. The activities are for revision, not assessment.",
    GROUNDING_RULES,
    `READING LEVEL: ${config.readingLevel.toUpperCase()}\n${level.sentenceLength}\n${level.vocabulary}\n${level.style}\n${level.examples}`,
    `TONE: ${config.tone.toUpperCase()}\n${TONES[config.tone]}`,
    `CONTENT LANGUAGE: ${languageName(config.language)} (${config.language})\nGenerate all educational content (questions, answers, explanations) in ${languageName(config.language)} (${config.language}). Do not translate content to other languages unless explicitly instructed.`
  ];
  if (config.instructionalLanguage && config.instructionalLanguage !== config.language) {
    parts.push(`INSTRUCTIONAL LANGUAGE: ${languageName(config.instructionalLanguage)} (${config.instructionalLanguage})\nGenerate all task instructions, directions, and scaffolding text in ${languageName(config.instructionalLanguage)} (${config.instructionalLanguage}). This includes quiz instructions, activity directions, and any text that guides the learner through the task.`);
  }
  if (config.customisation?.trim()) parts.push(`ADDITIONAL CUSTOMISATION:\n${config.customisation.trim()}`);
  return parts.join("\n\n");
}
```

`packages/generator/src/schemas/model-output.ts` (strict: every property required, nullable instead of optional, no defaults; refinements live in each stage's `verify`):
```ts
import { z } from "zod";
import { toProviderSchema } from "../llm/schema.js";

export const UnitOut = z.object({
  code: z.string(), title: z.string(),
  elements: z.array(z.object({ number: z.string(), text: z.string(), performanceCriteria: z.array(z.object({ number: z.string(), text: z.string() })) })),
  knowledgeEvidence: z.array(z.string()), performanceEvidence: z.array(z.string())
});
export const ConceptsOut = z.object({ concepts: z.array(z.object({ name: z.string(), summary: z.string(), sentenceIds: z.array(z.string()) })) });
export const MergeOut = z.object({ concepts: z.array(z.object({ name: z.string(), summary: z.string(), memberIds: z.array(z.string()) })) });
export const AlignmentOut = z.object({ criteria: z.array(z.object({ criterionId: z.string(), conceptIds: z.array(z.string()) })) });
export const PlanOut = z.object({ activities: z.array(z.object({ slot: z.number().int(), type: z.enum(["multiChoice", "blanks", "flashcards"]), conceptIds: z.array(z.string()), criteriaIds: z.array(z.string()), focus: z.string() })) });
export const MultiChoiceOut = z.object({
  title: z.string(), question: z.string(),
  answers: z.array(z.object({ text: z.string(), correct: z.boolean(), feedback: z.string() })),
  evidenceIds: z.array(z.string())
});
export const BlanksOut = z.object({
  title: z.string(), taskDescription: z.string(), passage: z.string(),
  blanks: z.array(z.object({ answers: z.array(z.string()), tip: z.string().nullable(), evidenceIds: z.array(z.string()) }))
});
export const FlashcardsOut = z.object({
  title: z.string(), description: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string(), tip: z.string().nullable(), evidenceIds: z.array(z.string()) }))
});
export type UnitOut = z.infer<typeof UnitOut>; export type ConceptsOut = z.infer<typeof ConceptsOut>; export type MergeOut = z.infer<typeof MergeOut>; export type AlignmentOut = z.infer<typeof AlignmentOut>; export type PlanOut = z.infer<typeof PlanOut>; export type MultiChoiceOut = z.infer<typeof MultiChoiceOut>; export type BlanksOut = z.infer<typeof BlanksOut>; export type FlashcardsOut = z.infer<typeof FlashcardsOut>;

export const UnitOutSchema = toProviderSchema(UnitOut);
export const ConceptsOutSchema = toProviderSchema(ConceptsOut);
export const MergeOutSchema = toProviderSchema(MergeOut);
export const AlignmentOutSchema = toProviderSchema(AlignmentOut);
export const PlanOutSchema = toProviderSchema(PlanOut);
export const MultiChoiceOutSchema = toProviderSchema(MultiChoiceOut);
export const BlanksOutSchema = toProviderSchema(BlanksOut);
export const FlashcardsOutSchema = toProviderSchema(FlashcardsOut);
```
`toProviderSchema` throws at module load if any schema still carries an unsupported keyword, so a schema change that breaks the projection fails every test, not just the contract test.

`packages/generator/src/competency/parse-unit.ts`:
```ts
import { UnitOfCompetency, type Element, type PerformanceCriterion } from "@leaplearn/shared";
import { textHash } from "../ingest/source-document.js";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { UnitOut, UnitOutSchema } from "../schemas/model-output.js";

const SYSTEM = `You read an Australian-style unit of competency pasted as plain text and return its structure exactly as written: the unit code, the title, each element with its number and text, and each performance criterion under its element with its number and text. Copy wording verbatim; do not summarise, reorder or invent. Knowledge evidence and performance evidence are lists of the bullet points under those headings, or empty lists if absent.`;

function elementId(index: number, number: string): string {
  return /^\d+$/.test(number) ? `E${number}` : `E${index + 1}`;
}
function criterionId(elementIndex: number, elementNumber: string, index: number, number: string): string {
  const el = /^\d+$/.test(elementNumber) ? elementNumber : String(elementIndex + 1);
  return /^\d+\.\d+$/.test(number) ? `PC${number}` : `PC${el}.${index + 1}`;
}

export async function parseUnit(unitText: string, runner: StageRunner): Promise<UnitOfCompetency> {
  const trimmed = unitText.trim();
  const { value } = await runner.run({
    key: "parseUnit",
    request: { purpose: "parseUnit", model: modelForRole("parseUnit"), system: SYSTEM, user: `UNIT TEXT:\n${trimmed}`, maxOutputTokens: 4000, outputSchema: UnitOutSchema },
    schema: UnitOut,
    verify: (u) => {
      const issues: string[] = [];
      if (!u.code.trim()) issues.push("code is empty");
      if (u.elements.length === 0) issues.push("no elements were returned");
      u.elements.forEach((e, i) => { if (e.performanceCriteria.length === 0) issues.push(`element ${e.number || i + 1} has no performance criteria`); });
      return issues;
    }
  });
  const elements: Element[] = value.elements.map((e, ei) => {
    const performanceCriteria: PerformanceCriterion[] = e.performanceCriteria.map((c, ci) => ({ id: criterionId(ei, e.number, ci, c.number), number: c.number, text: c.text }));
    return { id: elementId(ei, e.number), number: e.number, text: e.text, performanceCriteria };
  });
  return UnitOfCompetency.parse({ code: value.code.trim(), title: value.title.trim(), elements, knowledgeEvidence: value.knowledgeEvidence, performanceEvidence: value.performanceEvidence, textHash: textHash(trimmed) });
}
```
Append the new modules to `src/index.ts` (`llm/runner`, `prompts/system`, `schemas/model-output`, `competency/parse-unit`).

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): stage runner with metered retries and call keys, system prompt tables, provider-compatible model-output schemas and unit parsing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Concept extraction with verified evidence, merging across chunks, and alignment

**Files:**
- Create: `packages/generator/src/concepts/chunk.ts`, `src/concepts/verify.ts`, `src/concepts/extract.ts`, `src/concepts/merge.ts`, `src/concepts/align.ts`, `src/concepts/index.ts`
- Test: `packages/generator/test/concepts.test.ts`

**Interfaces:**
- Produces: `Chunk { chunkIndex; sentences: Sentence[]; estimatedTokens }`; `chunkSentences(sentences, budgetTokens): Chunk[]` (greedy, sentence boundaries, a sentence above the budget gets its own chunk); `evidenceForSentence(doc, sentenceId): Evidence` (`evidenceId = "ev-" + sentenceId`, quote = sentence text, offsets = sentence span); `verifyEvidence(text, evidence): string | null` (null when `text.slice(charStart, charEnd) === quote`); `ChunkConcept { tempId; name; summary; evidence: Evidence[] }`; `extractChunkConcepts(doc, chunk, runner, opts): Promise<ChunkConcept[]>`; `mergeConcepts(chunkConcepts, runner): Promise<Concept[]>` (ids `c1…` in merged order; a single chunk skips the model call); `alignConcepts(concepts, unit, runner): Promise<Alignment>`; `extractConceptMap(doc, unit | null, runner, opts: { chunkTokens?: number (6000); promptConfig? }): Promise<ConceptMap>`.
- Rules: the model chooses sentence ids from a numbered list; every returned id must be in the chunk (verify issue otherwise); evidence is rebuilt in code from the sentence and verified against the stored text; merging requires every temp id assigned exactly once; alignment requires every criterion exactly once; unsupported criteria are those with no concepts. The alignment prompt shows each concept's **evidence quotes** (up to `MAX_ALIGN_QUOTES = 8` per concept, with a count of any more), because the model is asked to judge evidential support and cannot do so from names and summaries alone (review finding 8). Call keys: `extract:chunk-<index>`, `merge`, `align`.

- [ ] **Step 1: Failing tests**

`packages/generator/test/concepts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestMarkdown } from "../src/ingest/index.js";
import { chunkSentences, extractConceptMap, verifyEvidence, evidenceForSentence } from "../src/concepts/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { criteriaOf, type UnitOfCompetency } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";
import type { SourceDocument } from "../src/ingest/index.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const fixtures = resolve(import.meta.dirname, "fixtures/synthetic");
const sid = (doc: SourceDocument, startsWith: string): string => { const s = doc.sentences.find((x) => x.text.startsWith(startsWith)); if (!s) throw new Error(`no sentence starting "${startsWith}"`); return s.sentenceId; };
const unit: UnitOfCompetency = {
  code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "0".repeat(64), knowledgeEvidence: [], performanceEvidence: [],
  elements: [
    { id: "E1", number: "1", text: "Prepare", performanceCriteria: [{ id: "PC1.1", number: "1.1", text: "Identify hazards" }, { id: "PC1.2", number: "1.2", text: "Confirm every supply" }] },
    { id: "E2", number: "2", text: "Isolate", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout" }, { id: "PC2.2", number: "2.2", text: "Test for dead" }] },
    { id: "E3", number: "3", text: "Restore", performanceCriteria: [{ id: "PC3.1", number: "3.1", text: "Remove locks in sequence" }, { id: "PC3.2", number: "3.2", text: "Complete an incident report" }, { id: "PC3.3", number: "3.3", text: "Confirm guards refitted" }] }
  ]
};

describe("chunking and evidence", () => {
  it("chunks on sentence boundaries within the token budget and puts the boundary between 'test for dead' sentences", async () => {
    const doc = await ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src" });
    const chunks = chunkSentences(doc.sentences, 330);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.estimatedTokens).toBeLessThanOrEqual(330 + 200);
    const a = sid(doc, "After the isolator is opened and locked");
    const b = sid(doc, "Testing for dead confirms");
    const chunkOf = (id: string) => chunks.findIndex((c) => c.sentences.some((s) => s.sentenceId === id));
    expect(chunkOf(a)).not.toBe(chunkOf(b));
    expect(chunkOf(b)).toBe(chunkOf(a) + 1);
  });
  it("builds evidence from a sentence and verifies quotes against offsets", async () => {
    const doc = await ingestMarkdown("Lock it out. Test for dead.", { sourceId: "src" });
    const ev = evidenceForSentence(doc, "s2");
    expect(ev).toEqual({ evidenceId: "ev-s2", sentenceId: "s2", charStart: 13, charEnd: 27, quote: "Test for dead." });
    expect(verifyEvidence(doc.text, ev)).toBeNull();
    expect(verifyEvidence(doc.text, { ...ev, quote: "Test for dead!" })).toMatch(/quote does not match/);
  });
});

describe("extractConceptMap", () => {
  it("extracts per chunk, merges the repeated concept, keeps cross-chunk evidence, and aligns with unsupported criteria", async () => {
    const doc = await ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src" });
    const chunks = chunkSentences(doc.sentences, 330);
    const lotoEarly = sid(doc, "Lockout and tagout is the method");
    const lotoTag = sid(doc, "A tag is a warning label");
    const lotoRemove = sid(doc, "Only the worker who applied a lock may remove it");
    const lotoLate = sid(doc, "Lockout and tagout ends when the permit is closed");
    const tfdA = sid(doc, "After the isolator is opened and locked");
    const tfdB = sid(doc, "Testing for dead confirms");
    const hazards = sid(doc, "Typical hazards are damaged insulation");
    const inChunk = (i: number, ids: string[]) => ids.filter((id) => chunks[i]!.sentences.some((s) => s.sentenceId === id));
    // one ConceptsOut per chunk, built from the real sentence ids so the fixture never drifts
    const perChunk = chunks.map((_, i) => {
      const concepts: Array<{ name: string; summary: string; sentenceIds: string[] }> = [];
      const loto = inChunk(i, [lotoEarly, lotoTag, lotoRemove, lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", sentenceIds: loto });
      const tfd = inChunk(i, [tfdA, tfdB]); if (tfd.length) concepts.push({ name: "Testing for dead", summary: "Prove the tester, test every pair, record the result.", sentenceIds: tfd });
      const hz = inChunk(i, [hazards]); if (hz.length) concepts.push({ name: "Hazard identification", summary: "Inspect for damaged insulation, moisture, stored energy, multiple supplies.", sentenceIds: hz });
      if (concepts.length === 0) concepts.push({ name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", sentenceIds: [chunks[i]!.sentences[0]!.sentenceId] });
      return concepts;
    });
    const tempIds = perChunk.flatMap((cs, i) => cs.map((_, j) => `k${i}-${j}`));
    const byName = (name: string) => perChunk.flatMap((cs, i) => cs.map((c, j) => ({ c, id: `k${i}-${j}` }))).filter((x) => x.c.name === name).map((x) => x.id);
    const mergeOut = { concepts: [
      { name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated until the permit closes.", memberIds: byName("Lockout and tagout") },
      { name: "Testing for dead", summary: "Prove the tester before and after; test every pair; record it.", memberIds: byName("Testing for dead") },
      { name: "Hazard identification", summary: "Inspect and record hazards on the permit.", memberIds: byName("Hazard identification") },
      { name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", memberIds: byName("Personal protective equipment") }
    ].filter((c) => c.memberIds.length > 0) };
    expect(new Set(mergeOut.concepts.flatMap((c) => c.memberIds)).size).toBe(tempIds.length);
    const alignOut = { criteria: [
      { criterionId: "PC1.1", conceptIds: ["c3"] }, { criterionId: "PC1.2", conceptIds: ["c3"] }, { criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] },
      { criterionId: "PC3.1", conceptIds: ["c1"] }, { criterionId: "PC3.2", conceptIds: [] }, { criterionId: "PC3.3", conceptIds: ["c1"] }
    ] };
    const script = [...perChunk.map((c) => fakeResponse({ outputText: JSON.stringify({ concepts: c }) })), fakeResponse({ outputText: JSON.stringify(mergeOut) }), fakeResponse({ outputText: JSON.stringify(alignOut) })];
    const provider = new FakeProvider(script);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op-concepts", sleep: async () => undefined });

    const map = await extractConceptMap(doc, unit, runner, { chunkTokens: 330 });
    expect(map.textHash).toBe(doc.textHash);
    expect(map.concepts.map((c) => c.conceptId)).toEqual(["c1", "c2", "c3", "c4"].slice(0, map.concepts.length));
    const loto = map.concepts.find((c) => c.name === "Lockout and tagout")!;
    expect(loto.evidence.map((e) => e.sentenceId).sort()).toEqual([lotoEarly, lotoTag, lotoRemove, lotoLate].sort());
    const tfd = map.concepts.find((c) => c.name === "Testing for dead")!;
    expect(tfd.evidence.map((e) => e.sentenceId).sort()).toEqual([tfdA, tfdB].sort());
    for (const c of map.concepts) for (const e of c.evidence) expect(doc.text.slice(e.charStart, e.charEnd)).toBe(e.quote);
    expect(map.alignment?.unsupportedCriteriaIds).toEqual(["PC3.2"]);
    expect(map.alignment?.criteria.map((c) => c.criterionId)).toEqual(criteriaOf(unit).map((c) => c.id));
    expect(provider.requests.map((r) => r.purpose)).toEqual([...chunks.map(() => "extract"), "merge", "align"]);
    expect(provider.requests[0]?.user).toMatch(/\[s\d+\] /);
    const alignRequest = provider.requests.at(-1)!;
    expect(alignRequest.user).toContain(doc.sentences.find((s) => s.sentenceId === lotoEarly)!.text); // the alignment judges support from the evidence itself
    expect(alignRequest.user).toContain(`[ev-${tfdB}]`);
  });
  it("rejects sentence ids outside the chunk as a content failure with feedback", async () => {
    const doc = await ingestMarkdown("One sentence here. Second sentence here.", { sourceId: "src" });
    const bad = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "x", summary: "y", sentenceIds: ["s99"] }] }) });
    const provider = new FakeProvider([bad, bad, bad]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 50_000_000 }), operationId: "op", sleep: async () => undefined });
    await expect(extractConceptMap(doc, null, runner, { chunkTokens: 6000 })).rejects.toMatchObject({ name: "ContentFailure" });
    expect(provider.requests[1]?.user).toContain("s99");
  });
});
```
The test's chunk-boundary expectation depends on the fixture text and the 330-token budget (verified against the plan's own segmenter: 4 chunks, the boundary between the two "test for dead" sentences, the repeated lockout concept in the first and last chunk); the fixture README documents this. If the boundary does not fall between those two sentences with `estimateInputTokens = ceil(chars / 3.5)`, adjust the *budget constant in the test and README* (not the fixture text) until it does, and record the value.

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/concepts/chunk.ts`:
```ts
import type { Sentence } from "../ingest/source-document.js";
import { estimateInputTokens } from "../llm/cost.js";

export interface Chunk { chunkIndex: number; sentences: Sentence[]; estimatedTokens: number; }

/** Greedy packing on sentence boundaries; a sentence longer than the budget becomes its own chunk. */
export function chunkSentences(sentences: Sentence[], budgetTokens: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Sentence[] = []; let tokens = 0;
  const flush = (): void => { if (current.length) { chunks.push({ chunkIndex: chunks.length, sentences: current, estimatedTokens: tokens }); current = []; tokens = 0; } };
  for (const s of sentences) {
    const t = estimateInputTokens(s.text) + 4;
    if (current.length > 0 && tokens + t > budgetTokens) flush();
    current.push(s); tokens += t;
  }
  flush();
  return chunks;
}
```

`packages/generator/src/concepts/verify.ts`:
```ts
import type { Evidence } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";

export function evidenceForSentence(doc: SourceDocument, sentenceId: string): Evidence {
  const s = doc.sentences.find((x) => x.sentenceId === sentenceId);
  if (!s) throw new Error(`sentence ${sentenceId} is not in source ${doc.sourceId}`);
  return { evidenceId: `ev-${s.sentenceId}`, sentenceId: s.sentenceId, charStart: s.charStart, charEnd: s.charEnd, quote: s.text };
}

/** Returns null when the quote is exactly the stored text at its offsets; otherwise the reason. */
export function verifyEvidence(text: string, evidence: Evidence): string | null {
  const actual = text.slice(evidence.charStart, evidence.charEnd);
  return actual === evidence.quote ? null : `evidence ${evidence.evidenceId}: quote does not match the stored text at [${evidence.charStart}, ${evidence.charEnd})`;
}

export class EvidenceMismatchError extends Error { constructor(reason: string) { super(reason); this.name = "EvidenceMismatchError"; } }
```

`packages/generator/src/concepts/extract.ts`:
```ts
import type { Evidence } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt, DEFAULT_PROMPT_CONFIG, type PromptConfig } from "../prompts/system.js";
import { ConceptsOut, ConceptsOutSchema } from "../schemas/model-output.js";
import type { Chunk } from "./chunk.js";
import { evidenceForSentence, EvidenceMismatchError, verifyEvidence } from "./verify.js";

export interface ChunkConcept { tempId: string; name: string; summary: string; evidence: Evidence[]; }
export interface ExtractOptions { promptConfig?: PromptConfig; maxConceptsPerChunk?: number; }

const TASK = (max: number) => `Read the numbered EVIDENCE sentences. Identify the distinct concepts a learner must understand (at most ${max}). For each concept give a short name, a one-sentence summary in your own words, and the ids of the sentences that state or explain it. Choose only ids from the list. A sentence may support more than one concept.`;

export function numberedSentences(chunk: Chunk): string {
  return chunk.sentences.map((s) => `[${s.sentenceId}] ${s.text}`).join("\n");
}

export async function extractChunkConcepts(doc: SourceDocument, chunk: Chunk, runner: StageRunner, options: ExtractOptions = {}): Promise<ChunkConcept[]> {
  const max = options.maxConceptsPerChunk ?? 8;
  const allowed = new Set(chunk.sentences.map((s) => s.sentenceId));
  const { value } = await runner.run({
    key: `extract:chunk-${chunk.chunkIndex}`,
    request: { purpose: "extract", model: modelForRole("extract"), system: buildSystemPrompt(options.promptConfig ?? DEFAULT_PROMPT_CONFIG), user: `${TASK(max)}\n\nEVIDENCE:\n${numberedSentences(chunk)}`, maxOutputTokens: 3000, outputSchema: ConceptsOutSchema },
    schema: ConceptsOut,
    verify: (out) => {
      const issues: string[] = [];
      if (out.concepts.length === 0) issues.push("no concepts were returned; return at least one concept supported by the evidence");
      if (out.concepts.length > max) issues.push(`${out.concepts.length} concepts returned; at most ${max}`);
      out.concepts.forEach((c, i) => {
        if (!c.name.trim()) issues.push(`concept ${i + 1} has an empty name`);
        if (c.sentenceIds.length === 0) issues.push(`concept "${c.name}" cites no sentences`);
        for (const id of c.sentenceIds) if (!allowed.has(id)) issues.push(`concept "${c.name}" cites ${id}, which is not in the evidence list`);
      });
      return issues;
    }
  });
  return value.concepts.map((c, i) => {
    const evidence = [...new Set(c.sentenceIds)].map((id) => evidenceForSentence(doc, id));
    for (const e of evidence) { const bad = verifyEvidence(doc.text, e); if (bad) throw new EvidenceMismatchError(bad); }
    return { tempId: `k${chunk.chunkIndex}-${i}`, name: c.name.trim(), summary: c.summary.trim(), evidence };
  });
}
```

`packages/generator/src/concepts/merge.ts`:
```ts
import type { Concept, Evidence } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { MergeOut, MergeOutSchema } from "../schemas/model-output.js";
import type { ChunkConcept } from "./extract.js";

const SYSTEM = "You consolidate concept lists extracted from consecutive parts of one document. Concepts that describe the same idea are merged into one; concepts that are distinct stay separate. Every input id is assigned to exactly one output concept. Keep names short and summaries to one sentence.";

function unionEvidence(groups: Evidence[][]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const g of groups) for (const e of g) byId.set(e.evidenceId, e);
  return [...byId.values()].sort((a, b) => a.charStart - b.charStart);
}

export async function mergeConcepts(chunkConcepts: ChunkConcept[][], runner: StageRunner): Promise<Concept[]> {
  const all = chunkConcepts.flat();
  if (chunkConcepts.length <= 1) return all.map((c, i) => ({ conceptId: `c${i + 1}`, name: c.name, summary: c.summary, evidence: c.evidence }));
  const ids = new Set(all.map((c) => c.tempId));
  const listing = chunkConcepts.map((cs, i) => `PART ${i + 1}:\n${cs.map((c) => `- ${c.tempId}: ${c.name} — ${c.summary}`).join("\n")}`).join("\n\n");
  const { value } = await runner.run({
    key: "merge",
    request: { purpose: "merge", model: modelForRole("merge"), system: SYSTEM, user: `CONCEPTS BY PART:\n${listing}\n\nReturn the consolidated concept list; each input id appears in exactly one memberIds list.`, maxOutputTokens: 3000, outputSchema: MergeOutSchema },
    schema: MergeOut,
    verify: (out) => {
      const issues: string[] = []; const seen = new Set<string>();
      for (const c of out.concepts) for (const id of c.memberIds) {
        if (!ids.has(id)) issues.push(`memberIds contains unknown id ${id}`);
        else if (seen.has(id)) issues.push(`id ${id} is assigned to more than one concept`);
        seen.add(id);
      }
      for (const id of ids) if (!seen.has(id)) issues.push(`id ${id} was not assigned to any concept`);
      return issues;
    }
  });
  const byId = new Map(all.map((c) => [c.tempId, c]));
  return value.concepts.map((c, i) => ({ conceptId: `c${i + 1}`, name: c.name.trim(), summary: c.summary.trim(), evidence: unionEvidence(c.memberIds.map((id) => byId.get(id)!.evidence)) }));
}
```

`packages/generator/src/concepts/align.ts`:
```ts
import { criteriaOf, type Alignment, type Concept, type UnitOfCompetency } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { AlignmentOut, AlignmentOutSchema } from "../schemas/model-output.js";

const SYSTEM = "You map performance criteria from a unit of competency to concepts extracted from a source document. Each concept is shown with the evidence sentences it was extracted from. A criterion is supported by a concept only when that evidence itself would help a learner meet the criterion; judge from the quoted sentences, not from the concept's name. Return every criterion exactly once; an empty conceptIds list means the source does not support that criterion. This is a suggested alignment for revision activities, not an assessment judgement.";

export const MAX_ALIGN_QUOTES = 8;

function conceptWithEvidence(c: Concept): string {
  const shown = c.evidence.slice(0, MAX_ALIGN_QUOTES).map((e) => `    [${e.evidenceId}] ${e.quote}`);
  const more = c.evidence.length > MAX_ALIGN_QUOTES ? [`    (${c.evidence.length - MAX_ALIGN_QUOTES} more sentences not shown)`] : [];
  return [`- ${c.conceptId}: ${c.name} — ${c.summary}`, ...shown, ...more].join("\n");
}

export async function alignConcepts(concepts: Concept[], unit: UnitOfCompetency, runner: StageRunner): Promise<Alignment> {
  const criteria = criteriaOf(unit);
  const criterionIds = new Set(criteria.map((c) => c.id));
  const conceptIds = new Set(concepts.map((c) => c.conceptId));
  const user = `UNIT ${unit.code} ${unit.title}\nCRITERIA:\n${criteria.map((c) => `- ${c.id}: ${c.text}`).join("\n")}\n\nCONCEPTS WITH THEIR EVIDENCE:\n${concepts.map(conceptWithEvidence).join("\n")}\n\nReturn one entry per criterion id, with the concept ids whose evidence supports it (possibly none).`;
  const { value } = await runner.run({
    key: "align",
    request: { purpose: "align", model: modelForRole("align"), system: SYSTEM, user, maxOutputTokens: 2000, outputSchema: AlignmentOutSchema },
    schema: AlignmentOut,
    verify: (out) => {
      const issues: string[] = []; const seen = new Set<string>();
      for (const c of out.criteria) {
        if (!criterionIds.has(c.criterionId)) issues.push(`unknown criterion ${c.criterionId}`);
        if (seen.has(c.criterionId)) issues.push(`criterion ${c.criterionId} appears twice`);
        seen.add(c.criterionId);
        for (const id of c.conceptIds) if (!conceptIds.has(id)) issues.push(`criterion ${c.criterionId} cites unknown concept ${id}`);
      }
      for (const id of criterionIds) if (!seen.has(id)) issues.push(`criterion ${id} is missing`);
      return issues;
    }
  });
  const ordered = criteria.map((c) => value.criteria.find((x) => x.criterionId === c.id)!).map((x) => ({ criterionId: x.criterionId, conceptIds: [...new Set(x.conceptIds)] }));
  return { criteria: ordered, unsupportedCriteriaIds: ordered.filter((c) => c.conceptIds.length === 0).map((c) => c.criterionId) };
}
```

`packages/generator/src/concepts/index.ts`:
```ts
import { ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import type { StageRunner } from "../llm/runner.js";
import type { PromptConfig } from "../prompts/system.js";
import { alignConcepts } from "./align.js";
import { chunkSentences } from "./chunk.js";
import { extractChunkConcepts } from "./extract.js";
import { mergeConcepts } from "./merge.js";

export * from "./chunk.js"; export * from "./verify.js"; export * from "./extract.js"; export * from "./merge.js"; export * from "./align.js";

export interface ConceptMapOptions { chunkTokens?: number; promptConfig?: PromptConfig; }

/** Chunks → per-chunk extraction (sequential; the pipeline persists progress per chunk) → merge → align. */
export async function extractConceptMap(doc: SourceDocument, unit: UnitOfCompetency | null, runner: StageRunner, options: ConceptMapOptions = {}): Promise<ConceptMap> {
  const chunks = chunkSentences(doc.sentences, options.chunkTokens ?? 6000);
  const perChunk = [];
  for (const chunk of chunks) perChunk.push(await extractChunkConcepts(doc, chunk, runner, options.promptConfig ? { promptConfig: options.promptConfig } : {}));
  const concepts = await mergeConcepts(perChunk, runner);
  const map: ConceptMap = { sourceId: doc.sourceId, textHash: doc.textHash, concepts };
  if (unit) map.alignment = await alignConcepts(concepts, unit, runner);
  return ConceptMap.parse(map);
}
```
Append `export * from "./concepts/index.js";` to `src/index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): concept extraction with verified evidence, cross-chunk merging and criterion alignment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: The planner — counts by rule, allocation by one model call

**Files:**
- Create: `packages/generator/src/plan/planner.ts`
- Test: `packages/generator/test/planner.test.ts`

**Interfaces:**
- Produces: `PlanRules = { multiChoice: { perImport: 5 }, blanks: { perImport: 3 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } }` (exported as `DEFAULT_PLAN_RULES`); `planSlots(selectedTypes, conceptCount, rules): Slot[]` where `Slot = { slot: number; type }` (`multiChoice` and `blanks` counts are `min(perImport, conceptCount)`; `flashcards` one slot when selected); `ActivityPlan = { activityId: string; slot: number; type; conceptIds: string[]; criteriaIds: string[]; focus: string }`; `planActivities(map: ConceptMap, selectedTypes, runner, rules?): Promise<ActivityPlan[]>` (one `plan` call; verify: exactly the requested slots, each with ≥1 known concept id, criteria ids known and consistent with the alignment; activity ids `act-<slot>`).

- [ ] **Step 1: Failing test**

`packages/generator/test/planner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planSlots, planActivities, DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import type { ConceptMap } from "@leaplearn/shared";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const ev = (id: string) => ({ evidenceId: `ev-${id}`, sentenceId: id, charStart: 0, charEnd: 5, quote: "Hello" });
const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [
  { conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [ev("s1")] }, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [ev("s2")] }, { conceptId: "c3", name: "Hazards", summary: "s", evidence: [ev("s3")] }
], alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }, { criterionId: "PC3.2", conceptIds: [] }], unsupportedCriteriaIds: ["PC3.2"] } };

describe("planner", () => {
  it("derives slots from rules and concept count", () => {
    expect(planSlots(["multiChoice", "blanks", "flashcards"], 3, DEFAULT_PLAN_RULES).map((s) => s.type)).toEqual(["multiChoice", "multiChoice", "multiChoice", "blanks", "blanks", "blanks", "flashcards"]);
    expect(planSlots(["multiChoice"], 10, DEFAULT_PLAN_RULES)).toHaveLength(5);
  });
  it("allocates concepts and criteria per slot through one model call and assigns activity ids", async () => {
    const out = { activities: [
      { slot: 1, type: "multiChoice", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who may remove a lock" },
      { slot: 2, type: "multiChoice", conceptIds: ["c2"], criteriaIds: ["PC2.2"], focus: "proving the tester" },
      { slot: 3, type: "multiChoice", conceptIds: ["c3"], criteriaIds: [], focus: "hazards" },
      { slot: 4, type: "blanks", conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "lock and tag" },
      { slot: 5, type: "blanks", conceptIds: ["c2"], criteriaIds: ["PC2.2"], focus: "test sequence" },
      { slot: 6, type: "blanks", conceptIds: ["c3"], criteriaIds: [], focus: "hazards" },
      { slot: 7, type: "flashcards", conceptIds: ["c1", "c2", "c3"], criteriaIds: ["PC2.1", "PC2.2"], focus: "key terms" }
    ] };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(out) })]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-plan", sleep: async () => undefined });
    const plan = await planActivities(map, ["multiChoice", "blanks", "flashcards"], runner);
    expect(plan.map((p) => p.activityId)).toEqual(["act-1", "act-2", "act-3", "act-4", "act-5", "act-6", "act-7"]);
    expect(plan[6]).toMatchObject({ type: "flashcards", conceptIds: ["c1", "c2", "c3"] });
    expect(provider.requests[0]?.user).toContain("PC3.2 (unsupported by the source)");
  });
  it("rejects a plan whose slots or ids do not match", async () => {
    const bad = { activities: [{ slot: 1, type: "multiChoice", conceptIds: ["c9"], criteriaIds: ["PC2.1"], focus: "x" }] };
    const provider = new FakeProvider(Array.from({ length: 3 }, () => fakeResponse({ outputText: JSON.stringify(bad) })));
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-plan", sleep: async () => undefined });
    await expect(planActivities(map, ["multiChoice"], runner)).rejects.toMatchObject({ name: "ContentFailure" });
    expect(provider.requests[1]?.user).toMatch(/unknown concept c9|slot/);
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/generator/src/plan/planner.ts`:
```ts
import type { ConceptMap } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { PlanOut, PlanOutSchema } from "../schemas/model-output.js";

export type PlannedType = "multiChoice" | "blanks" | "flashcards";
export interface PlanRules { multiChoice: { perImport: number }; blanks: { perImport: number }; flashcards: { specs: number; cardsMin: number; cardsMax: number }; }
export const DEFAULT_PLAN_RULES: PlanRules = { multiChoice: { perImport: 5 }, blanks: { perImport: 3 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };

export interface Slot { slot: number; type: PlannedType; }
export interface ActivityPlan { activityId: string; slot: number; type: PlannedType; conceptIds: string[]; criteriaIds: string[]; focus: string; }

export function planSlots(selectedTypes: PlannedType[], conceptCount: number, rules: PlanRules): Slot[] {
  const slots: Slot[] = [];
  const add = (type: PlannedType, n: number): void => { for (let i = 0; i < n; i++) slots.push({ slot: slots.length + 1, type }); };
  if (selectedTypes.includes("multiChoice")) add("multiChoice", Math.min(rules.multiChoice.perImport, conceptCount));
  if (selectedTypes.includes("blanks")) add("blanks", Math.min(rules.blanks.perImport, conceptCount));
  if (selectedTypes.includes("flashcards")) add("flashcards", rules.flashcards.specs);
  return slots;
}

const SYSTEM = "You allocate extracted concepts to a fixed list of activity slots so that the set of activities covers the important concepts without repeating the same idea in the same activity type. Each multiChoice or blanks slot targets one or two concepts; a flashcards slot may cover many. Where criteria are listed, attach the criteria each activity helps a learner revise. Use only the given concept and criterion ids.";

export async function planActivities(map: ConceptMap, selectedTypes: PlannedType[], runner: StageRunner, rules: PlanRules = DEFAULT_PLAN_RULES): Promise<ActivityPlan[]> {
  const slots = planSlots(selectedTypes, map.concepts.length, rules);
  if (slots.length === 0) return [];
  const conceptIds = new Set(map.concepts.map((c) => c.conceptId));
  const supported = new Map(map.alignment?.criteria.map((c) => [c.criterionId, c.conceptIds]) ?? []);
  const criteriaText = map.alignment
    ? `\nCRITERIA:\n${map.alignment.criteria.map((c) => `- ${c.criterionId}${c.conceptIds.length ? ` supported by ${c.conceptIds.join(", ")}` : " (unsupported by the source)"}`).join("\n")}`
    : "";
  const user = `CONCEPTS:\n${map.concepts.map((c) => `- ${c.conceptId}: ${c.name} — ${c.summary} (evidence: ${c.evidence.length} sentence${c.evidence.length === 1 ? "" : "s"})`).join("\n")}${criteriaText}\n\nSLOTS (return exactly these, in order):\n${slots.map((s) => `- slot ${s.slot}: ${s.type}`).join("\n")}\n\nFor each slot give conceptIds (at least one), criteriaIds (only criteria supported by those concepts; empty when none) and a one-line focus.`;
  const { value } = await runner.run({
    key: "plan",
    request: { purpose: "plan", model: modelForRole("plan"), system: SYSTEM, user, maxOutputTokens: 3000, outputSchema: PlanOutSchema },
    schema: PlanOut,
    verify: (out) => {
      const issues: string[] = [];
      if (out.activities.length !== slots.length) issues.push(`expected ${slots.length} slots, got ${out.activities.length}`);
      slots.forEach((s, i) => {
        const a = out.activities[i];
        if (!a) return;
        if (a.slot !== s.slot || a.type !== s.type) issues.push(`entry ${i + 1} must be slot ${s.slot} of type ${s.type}`);
        if (a.conceptIds.length === 0) issues.push(`slot ${s.slot} has no concepts`);
        for (const id of a.conceptIds) if (!conceptIds.has(id)) issues.push(`slot ${s.slot} cites unknown concept ${id}`);
        for (const id of a.criteriaIds) {
          const sup = supported.get(id);
          if (!sup) issues.push(`slot ${s.slot} cites unknown criterion ${id}`);
          else if (!sup.some((c) => a.conceptIds.includes(c))) issues.push(`slot ${s.slot} cites criterion ${id}, which none of its concepts support`);
        }
      });
      return issues;
    }
  });
  return value.activities.map((a) => ({ activityId: `act-${a.slot}`, slot: a.slot, type: a.type, conceptIds: [...new Set(a.conceptIds)], criteriaIds: [...new Set(a.criteriaIds)], focus: a.focus.trim() }));
}
```
Append `export * from "./plan/planner.js";` to `src/index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): planner with rule-based slot counts and model-allocated concepts and criteria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Quality checks

Pure functions the producers and the pipeline call (spec §3 `quality/`): reference validity, markup, exact/near-duplicate detection, and the per-type answer checks for the three phase-2 types. Answers review finding 8 for blanks: each answer is checked against the evidence **that blank** cites, not the whole context's combined evidence.

**Files:**
- Create: `packages/generator/src/quality/checks.ts`
- Test: `packages/generator/test/quality.test.ts`

**Interfaces:**
- Produces: `normaliseText(s): string` (lowercase, letters/digits/spaces only, collapsed whitespace); `wordSet(s): Set<string>`; `jaccard(a, b): number`; `isNearDuplicate(a, b, threshold = 0.8): boolean` (exact normalised match or Jaccard ≥ threshold); `AllowedRefs { evidence: Set<string>; concepts: Set<string>; criteria: Set<string> | null }`; `checkReferences(ids: { evidenceIds: string[]; conceptIds: string[]; criteriaIds: string[] }, allowed: AllowedRefs, where: string): string[]`; `checkPlainText(value: string, where: string): string[]` (rejects `<…>` tags, markdown emphasis/heading markers, and empty strings); `checkMultiChoice(out: MultiChoiceOut): string[]` (2–8 answers; exactly one correct; distinct normalised answer texts; non-empty question; every string plain text); `checkBlanks(out: BlanksOut, evidenceTextFor: (evidenceIds: string[]) => string): string[]` (1–5 blanks; the passage contains `{{b1}}…{{bN}}` each exactly once and no other `{{…}}`; ≥ 8 words outside tokens; no `*` in the passage; no `*`, `/`, `:` in answers or tips; every answer occurs in `normaliseText(evidenceTextFor(blank.evidenceIds))` as a whole-word phrase; a blank citing no evidence is reported); `checkFlashcards(out: FlashcardsOut, min, max): string[]` (card count within bounds; distinct normalised fronts; back ≠ front; plain text); `checkAgainstExisting(kind: "question" | "passage" | "front", candidate: string, existing: string[]): string[]` (near-duplicate across the import).

- [ ] **Step 1: Failing tests**

`packages/generator/test/quality.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { checkBlanks, checkFlashcards, checkMultiChoice, checkPlainText, checkReferences, checkAgainstExisting, isNearDuplicate, normaliseText } from "../src/quality/checks.js";

describe("quality checks", () => {
  it("normalises and detects near duplicates", () => {
    expect(normaliseText("  Lock-out, TAGOUT!  ")).toBe("lock out tagout");
    expect(isNearDuplicate("Who may remove a lock?", "who may remove a lock")).toBe(true);
    expect(isNearDuplicate("Who may remove a lock from the hasp?", "Who may remove a lock from the hasp today?")).toBe(true);
    expect(isNearDuplicate("Who may remove a lock?", "What does a tag record?")).toBe(false);
    expect(checkAgainstExisting("question", "Who may remove a lock?", ["who may remove a lock"])).toEqual(["question is a near-duplicate of an existing question in this import"]);
  });
  it("rejects unknown references and markup", () => {
    const allowed = { evidence: new Set(["ev-s1"]), concepts: new Set(["c1"]), criteria: new Set(["PC1.1"]) };
    expect(checkReferences({ evidenceIds: ["ev-s1", "ev-s9"], conceptIds: ["c2"], criteriaIds: [] }, allowed, "activity")).toEqual(["activity cites unknown evidence ev-s9", "activity cites unknown concept c2"]);
    expect(checkReferences({ evidenceIds: [], conceptIds: ["c1"], criteriaIds: [] }, allowed, "activity")).toEqual(["activity cites no evidence"]);
    expect(checkReferences({ evidenceIds: ["ev-s1"], conceptIds: [], criteriaIds: ["PC9.9"] }, { ...allowed, criteria: null }, "activity")).toEqual([]);
    expect(checkPlainText("<p>hi</p>", "question")).toEqual(["question contains HTML tags"]);
    expect(checkPlainText("**bold**", "question")).toEqual(["question contains markdown markers"]);
    expect(checkPlainText("", "question")).toEqual(["question is empty"]);
  });
  it("multiChoice: exactly one correct, distinct answers, 2-8 options", () => {
    const ok = { title: "T", question: "Who may remove a lock?", answers: [{ text: "The worker who applied it", correct: true, feedback: "" }, { text: "Any supervisor", correct: false, feedback: "" }], evidenceIds: ["ev-s1"] };
    expect(checkMultiChoice(ok)).toEqual([]);
    expect(checkMultiChoice({ ...ok, answers: [{ ...ok.answers[0]!, correct: true }, { ...ok.answers[1]!, correct: true }] })).toContain("exactly one answer must be correct");
    expect(checkMultiChoice({ ...ok, answers: [ok.answers[0]!, { text: "the worker who applied it", correct: false, feedback: "" }] })).toContain("answer 2 duplicates another answer");
    expect(checkMultiChoice({ ...ok, answers: [ok.answers[0]!] })).toContain("between 2 and 8 answers are required");
  });
  it("blanks: tokens, delimiters, and answers grounded in the evidence each blank cites", () => {
    const texts: Record<string, string> = { "ev-s1": "Only the worker who applied a lock may remove it.", "ev-s2": "A tag names the worker, the date and the reason." };
    const evidenceTextFor = (ids: string[]) => ids.map((id) => texts[id] ?? "").join(" ");
    const ok = { title: "T", taskDescription: "Fill the gaps.", passage: "Only the {{b1}} who applied a lock may remove it, and the tag names the {{b2}}.", blanks: [{ answers: ["worker"], tip: null, evidenceIds: ["ev-s1"] }, { answers: ["date", "reason"], tip: "on the tag", evidenceIds: ["ev-s2"] }] };
    expect(checkBlanks(ok, evidenceTextFor)).toEqual([]);
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} and {{b1}}." }, evidenceTextFor)).toContain("token {{b1}} must appear exactly once");
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} 5* rated {{b2}}." }, evidenceTextFor)).toContain("passage must not contain *");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["1/2"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain("blank 1 answer contains a forbidden character (* / :)");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["electrician"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain('blank 1 answer "electrician" does not occur in the evidence it cites');
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["date"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidenceTextFor)).toContain('blank 1 answer "date" does not occur in the evidence it cites'); // present in ev-s2, but the blank cites ev-s1
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["worker"], tip: null, evidenceIds: [] }, ok.blanks[1]!] }, evidenceTextFor)).toContain("blank 1 cites no evidence");
    expect(checkBlanks({ ...ok, passage: "{{b1}} {{b2}}" }, evidenceTextFor)).toContain("passage needs at least 8 words around the blanks");
  });
  it("flashcards: bounds, distinct fronts, back differs from front", () => {
    const card = (front: string, back: string) => ({ front, back, tip: null, evidenceIds: ["ev-s1"] });
    const ok = { title: "T", description: "d", cards: [card("Spanner", "Tightens hex nuts"), card("Saw", "Cuts timber"), card("Tag", "Names the worker"), card("Lock", "Prevents closing an isolator")] };
    expect(checkFlashcards(ok, 4, 12)).toEqual([]);
    expect(checkFlashcards({ ...ok, cards: ok.cards.slice(0, 3) }, 4, 12)).toContain("between 4 and 12 cards are required");
    expect(checkFlashcards({ ...ok, cards: [...ok.cards.slice(0, 3), card("spanner", "x")] }, 4, 12)).toContain("card 4 duplicates another card's front");
    expect(checkFlashcards({ ...ok, cards: [...ok.cards.slice(0, 3), card("Same", "same")] }, 4, 12)).toContain("card 4 back must differ from its front");
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/generator/src/quality/checks.ts`:
```ts
import type { BlanksOut, FlashcardsOut, MultiChoiceOut } from "../schemas/model-output.js";

export function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
export function wordSet(s: string): Set<string> { return new Set(normaliseText(s).split(" ").filter(Boolean)); }
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export function isNearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  const na = normaliseText(a); const nb = normaliseText(b);
  return na === nb || jaccard(wordSet(na), wordSet(nb)) >= threshold;
}
export function checkAgainstExisting(kind: "question" | "passage" | "front", candidate: string, existing: string[]): string[] {
  return existing.some((e) => isNearDuplicate(candidate, e)) ? [`${kind} is a near-duplicate of an existing ${kind} in this import`] : [];
}

/** `criteria` is null when the import has no unit (no alignment), in which case criterion ids are not checked. */
export interface AllowedRefs { evidence: Set<string>; concepts: Set<string>; criteria: Set<string> | null; }
export function checkReferences(ids: { evidenceIds: string[]; conceptIds: string[]; criteriaIds: string[] }, allowed: AllowedRefs, where: string): string[] {
  const issues: string[] = [];
  if (ids.evidenceIds.length === 0) issues.push(`${where} cites no evidence`);
  for (const id of ids.evidenceIds) if (!allowed.evidence.has(id)) issues.push(`${where} cites unknown evidence ${id}`);
  for (const id of ids.conceptIds) if (!allowed.concepts.has(id)) issues.push(`${where} cites unknown concept ${id}`);
  if (allowed.criteria) for (const id of ids.criteriaIds) if (!allowed.criteria.has(id)) issues.push(`${where} cites unknown criterion ${id}`);
  return issues;
}

export function checkPlainText(value: string, where: string): string[] {
  if (value.trim().length === 0) return [`${where} is empty`];
  const issues: string[] = [];
  if (/<[a-z/][^>]*>/i.test(value)) issues.push(`${where} contains HTML tags`);
  if (/(\*\*|__|^#{1,6}\s|^\s*[-*]\s)/m.test(value)) issues.push(`${where} contains markdown markers`);
  return issues;
}

export function checkMultiChoice(out: MultiChoiceOut): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.question, "question")];
  if (out.answers.length < 2 || out.answers.length > 8) issues.push("between 2 and 8 answers are required");
  if (out.answers.filter((a) => a.correct).length !== 1) issues.push("exactly one answer must be correct");
  const seen = new Set<string>();
  out.answers.forEach((a, i) => {
    issues.push(...checkPlainText(a.text, `answer ${i + 1}`));
    const n = normaliseText(a.text);
    if (seen.has(n)) issues.push(`answer ${i + 1} duplicates another answer`);
    seen.add(n);
  });
  return issues;
}

const TOKEN = /\{\{([^}]*)\}\}/g;
const FORBIDDEN = ["*", "/", ":"];

/** Each blank's answers must occur in the evidence that blank cites; the whole context's evidence is not enough. */
export function checkBlanks(out: BlanksOut, evidenceTextFor: (evidenceIds: string[]) => string): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.taskDescription, "taskDescription")];
  if (out.blanks.length < 1 || out.blanks.length > 5) issues.push("between 1 and 5 blanks are required");
  if (out.passage.includes("*")) issues.push("passage must not contain *");
  const counts = new Map<string, number>();
  for (const m of out.passage.matchAll(TOKEN)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  out.blanks.forEach((_, i) => { const id = `b${i + 1}`; const n = counts.get(id) ?? 0; if (n !== 1) issues.push(`token {{${id}}} must appear exactly once`); });
  for (const id of counts.keys()) if (!/^b\d+$/.test(id) || Number(id.slice(1)) > out.blanks.length) issues.push(`unexpected token {{${id}}}`);
  const words = out.passage.replace(TOKEN, " ").split(/\s+/).filter(Boolean);
  if (words.length < 8) issues.push("passage needs at least 8 words around the blanks");
  out.blanks.forEach((b, i) => {
    if (b.answers.length === 0) issues.push(`blank ${i + 1} has no answers`);
    if (b.evidenceIds.length === 0) { issues.push(`blank ${i + 1} cites no evidence`); return; }
    const haystack = ` ${normaliseText(evidenceTextFor(b.evidenceIds))} `;
    for (const a of b.answers) {
      if (FORBIDDEN.some((ch) => a.includes(ch))) issues.push(`blank ${i + 1} answer contains a forbidden character (* / :)`);
      else if (!haystack.includes(` ${normaliseText(a)} `)) issues.push(`blank ${i + 1} answer "${a}" does not occur in the evidence it cites`);
    }
    if (b.tip !== null && FORBIDDEN.some((ch) => b.tip!.includes(ch))) issues.push(`blank ${i + 1} tip contains a forbidden character (* / :)`);
  });
  return issues;
}

export function checkFlashcards(out: FlashcardsOut, min: number, max: number): string[] {
  const issues = [...checkPlainText(out.title, "title")];
  if (out.cards.length < min || out.cards.length > max) issues.push(`between ${min} and ${max} cards are required`);
  const fronts = new Set<string>();
  out.cards.forEach((c, i) => {
    issues.push(...checkPlainText(c.front, `card ${i + 1} front`), ...checkPlainText(c.back, `card ${i + 1} back`));
    const f = normaliseText(c.front);
    if (fronts.has(f)) issues.push(`card ${i + 1} duplicates another card's front`);
    fronts.add(f);
    if (f === normaliseText(c.back)) issues.push(`card ${i + 1} back must differ from its front`);
  });
  return issues;
}
```
Append `export * from "./quality/checks.js";` to `src/index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): quality checks for references, markup, near-duplicates and the three phase-2 types, with per-blank evidence grounding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Producer contract and the `multiChoice` producer

A producer takes one `ActivityPlan` entry, the concept map and the source document, prompts the model with the cited evidence, converts the model output into an `ActivitySpec` with ids and provenance assigned in code, runs the quality checks and the engine's `validate()` inside the runner's `verify` (so failures feed back), and returns the spec. New prompts are written against the shared schemas with evidence-id grounding required; the legacy multiple-choice prompt is not reused (it has no grounding rule and asks for a bare JSON array). Provenance is **derived from the cited evidence** (review finding 8): `deriveProvenance` maps the cited evidence ids to the planned concepts that own them and keeps only the plan's criteria that those concepts support in the alignment; with no unit (no alignment) the plan's criteria are kept as they are. Items get their own derived provenance; an activity with items gets the union of its items' evidence.

**Files:**
- Create: `packages/generator/src/produce/producer.ts`, `src/produce/multi-choice.ts`, `src/produce/index.ts`
- Test: `packages/generator/test/produce-multi-choice.test.ts`

**Interfaces:**
- Produces: `ProduceInput { plan: ActivityPlan; map: ConceptMap; unit: UnitOfCompetency | null; promptConfig: PromptConfig; language: string; existing: { questions: string[]; passages: string[]; fronts: string[] }; rules: PlanRules }`; `EngineHandle { registry: LibraryRegistry }`; `Producer { type; produce(input, runner, engine): Promise<Produced> }` with `Produced = { spec: ActivitySpec; attempts: number; attemptIds: string[] }`; helpers `evidenceBlock(map, conceptIds): EvidenceBlock` with `EvidenceBlock = { text: string; allowed: AllowedRefs; byId: Map<string, { quote: string; conceptIds: string[] }> }` (lists `[ev-s12] quote` under each planned concept; `allowed.criteria` is the alignment's criterion ids, or null without a unit), `evidenceTextFor(block, evidenceIds): string` (the cited quotes joined), `deriveProvenance(input, block, evidenceIds): Provenance` (`evidenceIds` deduplicated in cited order; `conceptIds` = the planned concepts, in plan order, whose evidence includes any cited id; `criteriaIds` = `plan.criteriaIds` filtered to those the alignment lists as supported by at least one of those concepts, or `plan.criteriaIds` unchanged when the map has no alignment), `paragraph(text)` (= `<p>${escapeHtml(text)}</p>`), `engineIssues(spec, registry): Promise<string[]>` (calls `validate` from `@leaplearn/engine` with an empty asset manifest and formats issues as `path: message`), `createProducers(): Map<PlannedType, Producer>`; `PROMPT_VERSION = "2026-09-19.2"` exported from `prompts/system.ts` (bump when any prompt text changes). Call key: `produce:<activityId>`.
- MultiChoice conversion: `id = plan.activityId`, `title`, `question = paragraph(out.question)`, `answers[].text` plain, `feedbackChosen = out.answers[].feedback` when non-empty, `randomAnswers: true`, `language`, `provenance = deriveProvenance(input, block, out.evidenceIds)`.

- [ ] **Step 1: Failing test**

`packages/generator/test/produce-multi-choice.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, type ConceptMap } from "@leaplearn/shared";
import { createProducers } from "../src/produce/index.js";
import { createRunner } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { createBudget } from "../src/llm/budget.js";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { DEFAULT_PROMPT_CONFIG, PROMPT_VERSION } from "../src/prompts/system.js";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [
  { evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 50, quote: "Only the worker who applied a lock may remove it." },
  { evidenceId: "ev-s2", sentenceId: "s2", charStart: 51, charEnd: 101, quote: "A tag names the worker, the date and the reason." }
] }] };
const input = { plan: { activityId: "act-1", slot: 1, type: "multiChoice" as const, conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who removes a lock" }, map, unit: null, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", existing: { questions: [], passages: [], fronts: [] }, rules: DEFAULT_PLAN_RULES };
const good = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The last person to leave", correct: false, feedback: "" }], evidenceIds: ["ev-s1"] };
const mk = (script: ReturnType<typeof fakeResponse>[]) => { const provider = new FakeProvider(script); return { provider, runner: createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op-act-1", sleep: async () => undefined }) }; };

describe("multiChoice producer", () => {
  it("prompts with the cited evidence, converts to a spec with ids and provenance, and passes engine validation", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("multiChoice")!.produce(input, runner, { registry });
    expect(produced.spec).toMatchObject({ id: "act-1", type: "multiChoice", title: "Removing a lock", question: "<p>Who may remove a lockout device from an isolator?</p>", randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    if (produced.spec.type === "multiChoice") { expect(produced.spec.answers[0]).toEqual({ text: "The worker who applied it", correct: true, feedbackChosen: "Only the worker who applied a lock may remove it." }); expect(produced.spec.answers[1]).toEqual({ text: "Any supervisor", correct: false }); }
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    const req = provider.requests[0]!;
    expect(req.purpose).toBe("produce");
    expect(req).not.toHaveProperty("temperature");
    expect(req.cachedContext).toContain("[ev-s1] Only the worker who applied a lock may remove it.");
    expect(req.user).toContain("who removes a lock");
    expect(req.system).toContain("GROUNDING RULES");
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
  it("feeds quality and reference failures back and escapes the question", async () => {
    const twoCorrect = { ...good, answers: good.answers.map((a) => ({ ...a, correct: true })) };
    const unknownEvidence = { ...good, evidenceIds: ["ev-s9"] };
    const withAmp = { ...good, question: "Which rule applies to locks & tags?" };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(twoCorrect) }), fakeResponse({ outputText: JSON.stringify(unknownEvidence) }), fakeResponse({ outputText: JSON.stringify(withAmp) })]);
    const produced = await createProducers().get("multiChoice")!.produce(input, runner, { registry });
    expect(produced.attempts).toBe(3);
    expect(provider.requests[1]?.user).toContain("exactly one answer must be correct");
    expect(provider.requests[2]?.user).toContain("unknown evidence ev-s9");
    if (produced.spec.type === "multiChoice") expect(produced.spec.question).toBe("<p>Which rule applies to locks &amp; tags?</p>");
  });
  it("derives criteria from the alignment: a question citing only one concept's evidence keeps only that concept's criteria", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 120, quote: "Test for dead now." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("multiChoice")!.produce({ ...input, map: aligned, plan: { ...input.plan, conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
  });
  it("rejects a near-duplicate of an existing question in the import", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) }), fakeResponse({ outputText: JSON.stringify({ ...good, question: "What does a tag record?" }) })]);
    const produced = await createProducers().get("multiChoice")!.produce({ ...input, existing: { questions: ["who may remove a lockout device from an isolator"], passages: [], fronts: [] } }, runner, { registry });
    expect(provider.requests[1]?.user).toContain("near-duplicate");
    if (produced.spec.type === "multiChoice") expect(produced.spec.question).toContain("What does a tag record?");
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/generator/src/produce/producer.ts`:
```ts
import { escapeHtml, validate, type LibraryRegistry } from "@leaplearn/engine";
import type { ActivitySpec, ConceptMap, UnitOfCompetency } from "@leaplearn/shared";
import { ZodError } from "zod";
import type { StageRunner } from "../llm/runner.js";
import type { ActivityPlan, PlannedType, PlanRules } from "../plan/planner.js";
import type { PromptConfig } from "../prompts/system.js";
import type { AllowedRefs } from "../quality/checks.js";

export interface ProduceInput {
  plan: ActivityPlan;
  map: ConceptMap;
  unit: UnitOfCompetency | null;
  promptConfig: PromptConfig;
  language: string;
  existing: { questions: string[]; passages: string[]; fronts: string[] };
  rules: PlanRules;
}
export interface EngineHandle { registry: LibraryRegistry; }
export interface Produced { spec: ActivitySpec; attempts: number; attemptIds: string[]; }
export interface Producer { readonly type: PlannedType; produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced>; }

export function paragraph(text: string): string {
  return `<p>${escapeHtml(text.trim())}</p>`;
}

export interface EvidenceBlock { text: string; allowed: AllowedRefs; byId: Map<string, { quote: string; conceptIds: string[] }>; }
export interface Provenance { conceptIds: string[]; evidenceIds: string[]; criteriaIds: string[]; }

/** The evidence the model may cite: every sentence of every planned concept, listed under its concept. A sentence shared by two concepts is listed under both and owned by both. */
export function evidenceBlock(map: ConceptMap, conceptIds: string[]): EvidenceBlock {
  const concepts = conceptIds.map((id) => map.concepts.find((c) => c.conceptId === id)).filter((c): c is ConceptMap["concepts"][number] => c !== undefined);
  const byId = new Map<string, { quote: string; conceptIds: string[] }>();
  const lines = concepts.map((c) => {
    const rows = c.evidence.map((e) => {
      const entry = byId.get(e.evidenceId) ?? { quote: e.quote, conceptIds: [] };
      entry.conceptIds.push(c.conceptId);
      byId.set(e.evidenceId, entry);
      return `[${e.evidenceId}] ${e.quote}`;
    });
    return `CONCEPT ${c.conceptId}: ${c.name}\n${c.summary}\n${rows.join("\n")}`;
  });
  const criteria = map.alignment ? new Set(map.alignment.criteria.map((c) => c.criterionId)) : null;
  return { text: `EVIDENCE (cite these ids):\n${lines.join("\n\n")}`, allowed: { evidence: new Set(byId.keys()), concepts: new Set(concepts.map((c) => c.conceptId)), criteria }, byId };
}

export function evidenceTextFor(block: EvidenceBlock, evidenceIds: string[]): string {
  return evidenceIds.map((id) => block.byId.get(id)?.quote ?? "").filter(Boolean).join(" ");
}

/** Provenance from what was actually cited: the concepts that own the cited evidence, and the plan's criteria those concepts support. */
export function deriveProvenance(input: ProduceInput, block: EvidenceBlock, evidenceIds: string[]): Provenance {
  const cited = [...new Set(evidenceIds)];
  const owners = new Set(cited.flatMap((id) => block.byId.get(id)?.conceptIds ?? []));
  const conceptIds = input.plan.conceptIds.filter((id) => owners.has(id));
  const alignment = input.map.alignment;
  const criteriaIds = alignment
    ? input.plan.criteriaIds.filter((id) => alignment.criteria.find((c) => c.criterionId === id)?.conceptIds.some((c) => conceptIds.includes(c)) ?? false)
    : [...input.plan.criteriaIds];
  return { conceptIds, evidenceIds: cited, criteriaIds };
}

export function criteriaBlock(input: ProduceInput): string {
  if (!input.unit || input.plan.criteriaIds.length === 0) return "";
  const byId = new Map(input.unit.elements.flatMap((e) => e.performanceCriteria).map((c) => [c.id, c.text]));
  return `\nPERFORMANCE CRITERIA THIS ACTIVITY HELPS REVISE:\n${input.plan.criteriaIds.map((id) => `- ${id}: ${byId.get(id) ?? ""}`).join("\n")}`;
}

/** Converts model output to a spec; a schema failure becomes verify reasons (a content failure) instead of an exception. */
export function tryConvert<T>(convert: () => T): { spec: T } | { issues: string[] } {
  try {
    return { spec: convert() };
  } catch (err) {
    if (err instanceof ZodError) return { issues: err.issues.map((i) => `spec ${i.path.join(".") || "(root)"}: ${i.message}`) };
    throw err;
  }
}

export async function engineIssues(spec: ActivitySpec, registry: LibraryRegistry): Promise<string[]> {
  const issues = await validate(spec, new Map(), { registry });
  return issues.map((i) => `engine rejected ${i.path || "(root)"}: ${i.message}`);
}
```

`packages/generator/src/produce/multi-choice.ts`:
```ts
import { ActivitySpec, type MultiChoiceSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkMultiChoice, checkReferences } from "../quality/checks.js";
import { MultiChoiceOut, MultiChoiceOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, paragraph, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE multiple-choice revision question from the evidence.
- The question tests understanding of the focus, not recall of exact wording.
- Give 3 or 4 answer options; exactly one is correct; the others are plausible misconceptions a learner might hold.
- feedback for the correct answer restates the evidence in one sentence; feedback for a wrong answer explains briefly why it is wrong (may be empty).
- Plain text only. Cite in evidenceIds the evidence sentence ids the question and correct answer rely on.`;

export function toMultiChoiceSpec(out: MultiChoiceOut, input: ProduceInput, block: EvidenceBlock): MultiChoiceSpec {
  const answers = out.answers.map((a) => (a.feedback.trim() ? { text: a.text.trim(), correct: a.correct, feedbackChosen: a.feedback.trim() } : { text: a.text.trim(), correct: a.correct }));
  return ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "multiChoice", language: input.language,
    question: paragraph(out.question), answers, randomAnswers: true,
    provenance: deriveProvenance(input, block, out.evidenceIds)
  }) as MultiChoiceSpec;
}

export const multiChoiceProducer: Producer = {
  type: "multiChoice",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: {
        purpose: "produce", model: modelForRole("produce"),
        system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text,
        user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`,
        maxOutputTokens: 1500, outputSchema: MultiChoiceOutSchema
      },
      schema: MultiChoiceOut,
      verify: async (out) => {
        const issues = [
          ...checkMultiChoice(out),
          ...checkReferences({ evidenceIds: out.evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the question"),
          ...checkAgainstExisting("question", out.question, input.existing.questions)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toMultiChoiceSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toMultiChoiceSpec(value, input, evidence), attempts, attemptIds };
  }
};
```

`packages/generator/src/produce/index.ts`:
```ts
import type { PlannedType } from "../plan/planner.js";
import { multiChoiceProducer } from "./multi-choice.js";
import type { Producer } from "./producer.js";

export * from "./producer.js";
export * from "./multi-choice.js";

export function createProducers(): Map<PlannedType, Producer> {
  return new Map<PlannedType, Producer>([[multiChoiceProducer.type, multiChoiceProducer]]);
}
```
Add to `prompts/system.ts`: `export const PROMPT_VERSION = "2026-09-19.2";` (`.2` because the alignment prompt and the producers' prompts differ from revision 1 of this plan) and append `export * from "./produce/index.js";` to `src/index.ts`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0` (the engine validation inside `verify` reads the real lockfile).

```bash
git add packages/generator
git commit -m "feat(generator): producer contract and the grounded multiChoice producer with engine validation in the loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: The `blanks` producer (passage-grounded)

**Files:**
- Create: `packages/generator/src/produce/blanks.ts`; modify `src/produce/index.ts`
- Test: `packages/generator/test/produce-blanks.test.ts`

**Interfaces:**
- Produces: `blanksProducer: Producer` and `toBlanksSpec(out, input, block): BlanksSpec` (`id = plan.activityId`; `taskDescription = escapeHtml(out.taskDescription)` — the engine's blanks handler adds the `<p>` wrapper; `passage` plain text with `{{bN}}`; blanks `id: b<N>` by position with `answers`, `tip` (omitted when null) and item provenance `deriveProvenance(input, block, blank.evidenceIds)`; `caseSensitive: false`; activity provenance `deriveProvenance(input, block, union of the blanks' evidence ids)`). Each blank's answers are checked against the evidence **that blank** cites (`checkBlanks(out, (ids) => evidenceTextFor(block, ids))`).

- [ ] **Step 1: Failing test**

`packages/generator/test/produce-blanks.test.ts` (same harness as Task 11's test: `map`, `mk`, `registry`, `input` with `type: "blanks"`, `activityId: "act-4"`):
```ts
const good = {
  title: "Locks and tags", taskDescription: "Complete the sentences about lockout and tagout.",
  passage: "Only the {{b1}} who applied a lock may remove it. A tag names the worker, the {{b2}} and the reason for the isolation.",
  blanks: [{ answers: ["worker"], tip: "the person, not the role", evidenceIds: ["ev-s1"] }, { answers: ["date"], tip: null, evidenceIds: ["ev-s2"] }]
};
describe("blanks producer", () => {
  it("converts to a BlanksSpec with positional blank ids, derived item provenance, the evidence union on the activity, and an escaped task description", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry });
    expect(produced.spec.type).toBe("blanks");
    if (produced.spec.type !== "blanks") return;
    expect(produced.spec.taskDescription).toBe("Complete the sentences about lockout and tagout."); // the engine's blanks handler wraps it in <p>
    expect(produced.spec.blanks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(produced.spec.blanks[0]).toEqual({ id: "b1", answers: ["worker"], tip: "the person, not the role", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.blanks[1]).not.toHaveProperty("tip");
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] });
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    expect(provider.requests[0]).not.toHaveProperty("temperature");
  });
  it("rejects an answer that is not in the evidence its own blank cites, and a passage with *", async () => {
    const ungrounded = { ...good, blanks: [{ ...good.blanks[0]!, answers: ["electrician"] }, good.blanks[1]!] };
    const wrongSentence = { ...good, blanks: [{ ...good.blanks[0]!, answers: ["date"] }, good.blanks[1]!] }; // "date" is in ev-s2, but blank 1 cites ev-s1
    const star = { ...good, passage: good.passage.replace("A tag", "A 5* tag") };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(ungrounded) }), fakeResponse({ outputText: JSON.stringify(wrongSentence) }), fakeResponse({ outputText: JSON.stringify(star) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    await expect(createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry })).rejects.toMatchObject({ name: "ContentFailure", attempts: 3 });
    expect(provider.requests[1]?.user).toContain('blank 1 answer "electrician" does not occur in the evidence it cites');
    expect(provider.requests[2]?.user).toContain('blank 1 answer "date" does not occur in the evidence it cites');
    expect(provider.requests).toHaveLength(3);
  });
  it("derives each blank's criteria from the concept its evidence belongs to", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 145, quote: "Test for dead at the point of work every time." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const twoConcepts = { ...good, passage: "Only the {{b1}} who applied a lock may remove it. Test for dead at the {{b2}} of work every time.", blanks: [good.blanks[0]!, { answers: ["point"], tip: null, evidenceIds: ["ev-s3"] }] };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(twoConcepts) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, map: aligned, plan: { ...input.plan, activityId: "act-4", type: "blanks", conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    if (produced.spec.type !== "blanks") throw new Error("type");
    expect(produced.spec.blanks[0]!.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.blanks[1]!.provenance).toEqual({ conceptIds: ["c2"], evidenceIds: ["ev-s3"], criteriaIds: ["PC2.2"] });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1", "c2"], evidenceIds: ["ev-s1", "ev-s3"], criteriaIds: ["PC2.1", "PC2.2"] });
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/generator/src/produce/blanks.ts`:
```ts
import { escapeHtml } from "@leaplearn/engine";
import { ActivitySpec, type BlanksSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkBlanks, checkReferences } from "../quality/checks.js";
import { BlanksOut, BlanksOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, evidenceTextFor, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE fill-in-the-blanks revision passage from the evidence.
- The passage is 2 to 4 sentences of plain text that closely follows the evidence, with 2 to 4 blanks written as {{b1}}, {{b2}}, ... in order of appearance, each exactly once.
- Each blank removes a key term or value that appears word-for-word in the evidence sentence that blank cites; list that exact wording in answers (add a second accepted spelling only if it also appears in that sentence).
- Never use the characters * / : in answers or tips, and never put * in the passage.
- tip is a short hint or null. Cite in each blank's evidenceIds the sentence its answer comes from.`;

export function toBlanksSpec(out: BlanksOut, input: ProduceInput, block: EvidenceBlock): BlanksSpec {
  const blanks = out.blanks.map((b, i) => {
    const item: Record<string, unknown> = { id: `b${i + 1}`, answers: b.answers.map((a) => a.trim()), provenance: deriveProvenance(input, block, b.evidenceIds) };
    if (b.tip !== null && b.tip.trim()) item["tip"] = b.tip.trim();
    return item;
  });
  return ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "blanks", language: input.language,
    taskDescription: escapeHtml(out.taskDescription.trim()), passage: out.passage.trim(), blanks, caseSensitive: false,
    provenance: deriveProvenance(input, block, out.blanks.flatMap((b) => b.evidenceIds))
  }) as BlanksSpec;
}

export const blanksProducer: Producer = {
  type: "blanks",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: { purpose: "produce", model: modelForRole("produce"), system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text, user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`, maxOutputTokens: 1500, outputSchema: BlanksOutSchema },
      schema: BlanksOut,
      verify: async (out) => {
        const issues = [
          ...checkBlanks(out, (ids) => evidenceTextFor(evidence, ids)),
          ...out.blanks.flatMap((b, i) => checkReferences({ evidenceIds: b.evidenceIds, conceptIds: [], criteriaIds: [] }, evidence.allowed, `blank ${i + 1}`)),
          ...checkAgainstExisting("passage", out.passage, input.existing.passages)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toBlanksSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toBlanksSpec(value, input, evidence), attempts, attemptIds };
  }
};
```
Register it in `createProducers()`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): passage-grounded blanks producer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: The `flashcards` producer

**Files:**
- Create: `packages/generator/src/produce/flashcards.ts`; modify `src/produce/index.ts`
- Test: `packages/generator/test/produce-flashcards.test.ts`

**Interfaces:**
- Produces: `flashcardsProducer: Producer` and `toFlashcardsSpec(out, input, block): FlashcardsSpec` (`id = plan.activityId`; `description` plain (omitted when empty); cards `id: c<N>` by position with `front`, `back`, `tip` (omitted when null) and item provenance `deriveProvenance(input, block, card.evidenceIds)`; activity provenance from the union of the cards' evidence; card count bounds from `input.rules.flashcards`).

- [ ] **Step 1: Failing test**

`packages/generator/test/produce-flashcards.test.ts` (same harness as Task 11 — one concept `c1` with two evidence sentences, which the four cards cite between them; `activityId: "act-7"`, `type: "flashcards"`):
```ts
const card = (front: string, back: string, ev: string) => ({ front, back, tip: null, evidenceIds: [ev] });
const good = { title: "Key terms", description: "Isolation vocabulary.", cards: [card("Lockout device", "A padlock or hasp that physically prevents an isolator from being closed", "ev-s1"), card("Tag", "A warning label naming the worker, the date and the reason", "ev-s2"), card("Who may remove a lock", "Only the worker who applied it", "ev-s1"), card("Tag without a lock", "A warning, not a control", "ev-s2")] };
describe("flashcards producer", () => {
  it("converts to a FlashcardsSpec with positional card ids, per-card derived provenance and the evidence union on the set", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, plan: { ...input.plan, activityId: "act-7", type: "flashcards" } }, runner, { registry });
    if (produced.spec.type !== "flashcards") throw new Error("type");
    expect(produced.spec.cards.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(produced.spec.cards[1]).toEqual({ id: "c2", front: "Tag", back: "A warning label naming the worker, the date and the reason", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s2"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.description).toBe("Isolation vocabulary.");
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    expect(provider.requests[0]).not.toHaveProperty("temperature");
  });
  it("a card citing only concept B's evidence is mapped only to concept B's criteria, never to concept A's", async () => {
    const aligned: ConceptMap = { ...map, concepts: [map.concepts[0]!, { conceptId: "c2", name: "Testing for dead", summary: "s", evidence: [{ evidenceId: "ev-s3", sentenceId: "s3", charStart: 102, charEnd: 145, quote: "Test for dead at the point of work every time." }] }],
      alignment: { criteria: [{ criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] }], unsupportedCriteriaIds: [] } };
    const mixed = { ...good, cards: [...good.cards.slice(0, 3), card("When to test for dead", "At the point of work, every time", "ev-s3")] };
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(mixed) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, map: aligned, plan: { ...input.plan, activityId: "act-7", type: "flashcards", conceptIds: ["c1", "c2"], criteriaIds: ["PC2.1", "PC2.2"] } }, runner, { registry });
    if (produced.spec.type !== "flashcards") throw new Error("type");
    expect(produced.spec.cards[0]!.provenance).toEqual({ conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] });
    expect(produced.spec.cards[3]!.provenance).toEqual({ conceptIds: ["c2"], evidenceIds: ["ev-s3"], criteriaIds: ["PC2.2"] });
    expect(produced.spec.provenance).toEqual({ conceptIds: ["c1", "c2"], evidenceIds: ["ev-s1", "ev-s2", "ev-s3"], criteriaIds: ["PC2.1", "PC2.2"] });
  });
  it("enforces the card bounds from the plan rules and distinct fronts", async () => {
    const few = { ...good, cards: good.cards.slice(0, 2) };
    const dup = { ...good, cards: [...good.cards.slice(0, 3), card("tag", "x", "ev-s2")] };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(few) }), fakeResponse({ outputText: JSON.stringify(dup) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, plan: { ...input.plan, activityId: "act-7", type: "flashcards" } }, runner, { registry });
    expect(produced.attempts).toBe(3);
    expect(provider.requests[1]?.user).toContain("between 4 and 12 cards are required");
    expect(provider.requests[2]?.user).toContain("duplicates another card's front");
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/generator/src/produce/flashcards.ts`:
```ts
import { ActivitySpec, type FlashcardsSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkFlashcards, checkReferences } from "../quality/checks.js";
import { FlashcardsOut, FlashcardsOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = (min: number, max: number) => `Write a set of ${min} to ${max} revision flashcards from the evidence.
- front is a term, question or prompt (short); back is the answer or definition in one or two sentences drawn from the evidence; tip is an optional hint or null.
- Fronts are distinct; no two cards test the same idea.
- Plain text only. Cite in each card's evidenceIds the sentence(s) that card is based on.`;

export function toFlashcardsSpec(out: FlashcardsOut, input: ProduceInput, block: EvidenceBlock): FlashcardsSpec {
  const cards = out.cards.map((c, i) => {
    const item: Record<string, unknown> = { id: `c${i + 1}`, front: c.front.trim(), back: c.back.trim(), provenance: deriveProvenance(input, block, c.evidenceIds) };
    if (c.tip !== null && c.tip.trim()) item["tip"] = c.tip.trim();
    return item;
  });
  const spec: Record<string, unknown> = { id: input.plan.activityId, title: out.title.trim(), type: "flashcards", language: input.language, cards, provenance: deriveProvenance(input, block, out.cards.flatMap((c) => c.evidenceIds)) };
  if (out.description.trim()) spec["description"] = out.description.trim();
  return ActivitySpec.parse(spec) as FlashcardsSpec;
}

export const flashcardsProducer: Producer = {
  type: "flashcards",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const { cardsMin, cardsMax } = input.rules.flashcards;
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: { purpose: "produce", model: modelForRole("produce"), system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text, user: `${TASK(cardsMin, cardsMax)}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`, maxOutputTokens: 3000, outputSchema: FlashcardsOutSchema },
      schema: FlashcardsOut,
      verify: async (out) => {
        const issues = [
          ...checkFlashcards(out, cardsMin, cardsMax),
          ...out.cards.flatMap((c, i) => checkReferences({ evidenceIds: c.evidenceIds, conceptIds: [], criteriaIds: [] }, evidence.allowed, `card ${i + 1}`)),
          ...out.cards.flatMap((c) => checkAgainstExisting("front", c.front, input.existing.fronts))
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toFlashcardsSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toFlashcardsSpec(value, input, evidence), attempts, attemptIds };
  }
};
```
Register it in `createProducers()`; the map now holds all three phase-2 producers.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): flashcards producer with per-card derived provenance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: The import store, the resumable pipeline, and operations with failure categories

The orchestration of spec §5 for the CLI, rebuilt around the review's recovery findings (4, 5, 7): every operation persists its result **before** it is marked succeeded and a persisted result is reused on resume even when the operation record was interrupted; activity records are reconciled from the saved plan; a saved candidate revision resumes at compilation; promotion is idempotent and repairable; the import stores an immutable `fingerprint` and refuses a resume whose inputs differ; the store grants one exclusive lock per import; activities run in one serial lane per type (exact near-duplicate checks) with lanes concurrent; a budget refusal or infrastructure failure sets a shared stop, in-flight attempts settle, and every undispatched activity gets an explicit outcome. Attempt starts without outcomes are reconciled as billing-uncertain on restart. Acceptance and alignment-review records (spec §4) are part of the store from this task so Task 15's `FileStore` and Task 16's `leap review` share one interface.

**Files:**
- Create: `packages/generator/src/store/types.ts`, `src/store/memory-store.ts`, `src/pipeline/fingerprint.ts`, `src/pipeline/operations.ts`, `src/pipeline/run-import.ts`, `src/pipeline/index.ts`
- Modify: `packages/generator/src/concepts/index.ts` (per-chunk persistence hook)
- Test: `packages/generator/test/helpers/synthetic.ts`, `test/helpers/crashing-store.ts`, `test/helpers/routed-provider.ts`, `packages/generator/test/pipeline.test.ts`

**Interfaces:**
- Records (spec §4, tenancy fields kept): `ImportRecord { importId; orgId; name; sourceType; status: ImportStatus; customisation: string | null; language; unitTextHash: string | null; selectedTypes: PlannedType[]; fingerprint: string; budget: BudgetLimits; budgetUsed: { spentUsdMicro; reservedUsdMicro; spentTokens; requests; elapsedMs }; error: string | null; idempotencyKey; createdAt; updatedAt }` (`budgetUsed.elapsedMs` accumulates across runs and is what makes the elapsed limit per-import); `ActivityRecord { activityId; importId; type; order; status: ActivityStatus; currentRevision: number | null; conceptIds; criteriaIds; error: string | null; dropped: boolean }`; `RevisionRecord { activityId; revision; state: RevisionState; spec: ActivitySpec; schemaVersion; promptVersion; modelConfig: { provider; models: Record<string, string>; profiles: Record<string, RequestProfile> }; engineFingerprint; note: string | null; buildKey: string | null; attemptIds: string[]; createdAt }`; `OperationRecord { operationId; importId; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed"; idempotencyKey; contentAttempts; outcome: string | null; billingUncertain: boolean; startedAt; completedAt: string | null }`; `AcceptanceRecord { importId; activityId; revision; decision: AcceptanceDecision; reviewer; notes: string | null; decidedAt }`; `AlignmentReviewRecord { importId; activityId; revision; itemId: string | null; unitTextHash: string | null; criterionId; decision: AlignmentDecision; reviewer; decidedAt }`.
- `ImportStore`: `lock(importId): Promise<StoreLock>` (rejects with `StoreLockedError` while another holder has it; `StoreLock = { release(): Promise<void> }`); `getImport`, `putImport`; `getArtifact<T>(importId, name)`, `putArtifact(importId, name, value)` with `ArtifactName = "source" | "unit" | "conceptMap" | "plan" | \`chunk-${number}\``; `listActivities`, `putActivity`; `getRevision`, `listRevisions`, `putRevision`; `listOperations`, `putOperation`; `recorderFor(importId)`, `listAttempts(importId)`; `putBuild(importId, activityId, revision, bytes): Promise<string>`, `getBuild(buildKey)`; `listAcceptances(importId)`, `putAcceptance(record)` (latest per activity + revision wins); `listAlignmentReviews(importId)`, `putAlignmentReview(record)` (latest per activity + revision + item + criterion wins).
- `MemoryStore implements ImportStore` (maps; builds kept as Buffers; locks in a `Set`).
- `runFingerprint(input: FingerprintInput): string` over `{ sourceTextHash, unitTextHash, selectedTypes (sorted), language, promptConfig, customisation, chunkTokens, rules, promptVersion, schemaVersion, models, profiles }` — budget limits are deliberately **not** part of it (a resume may raise them); `IncompatibleResumeError`; `DEFAULT_CHUNK_TOKENS = 6000`.
- `extractConceptMap(doc, unit, runner, options)` gains `options.chunkCache?: { get(index): Promise<ChunkConcept[] | null>; put(index, concepts): Promise<void> }`; finished chunks are reused on rerun.
- `budgetFromLedger(limits, events, startedAtMs, elapsedBeforeMs): Budget` (known costs and tokens are spent; a start with no outcome is spent at its reservation; every start counts as a request; the deadline is what is left of the per-import elapsed limit); `attemptsByKey(events): Map<string, number>`; `reconcile(store, importId, clock)`; `OperationContext.stop?: () => string | null` is handed to every runner so no dispatch or retry happens after the import has stopped; `runOperation<T>(ctx, { purpose; activityId; key; load; work; persist }): Promise<{ result: T; operation: OperationRecord; reused: boolean }>` — order: `load()` first (a persisted result is reused even if the operation record says running or failed, and that record is corrected to succeeded with a note, keeping `billingUncertain`); otherwise a new operation id (`key`, then `key#2`, …), `work`, **`persist`, then** the succeeded record; `runLanes(lanes, concurrency, worker)`.
- `runImport(input: RunImportInput, deps: RunImportDeps): Promise<ImportRecord>` — takes the store lock **first**, then reads the import record and checks its fingerprint under the lock (a pre-lock read could be stale), and canonicalises `selectedTypes` (duplicates removed, first occurrence order kept) before anything else so `--types multiChoice,multiChoice` cannot create two lanes over the same activities; with `RunImportInput = { importId; name; source: SourceDocument; unitText: string | null; selectedTypes; budget: { usdMicro: number } & Partial<BudgetLimits>; promptConfig; language; customisation: string | null; orgId?: string }` and `RunImportDeps = { store; provider; registry; engineFingerprint; concurrency?: 3; chunkTokens?; rules?; clock?; sleep?; onProgress?: (event: ProgressEvent) => void }`; `ProgressEvent = { kind: "status"; status } | { kind: "activity"; activityId; status; error?: string } | { kind: "attempt"; purpose; status; costUsdMicro: number | null }`; `SKIPPED_PREFIX = "skipped: "`; `isPending(activity)`.
- `engineFingerprint` = `\`engine@${engineVersion}+lock:${sha256(libraries.lock.json).slice(0, 12)}\`` computed by the caller (CLI); tests pass a constant.
- Failure categories: `ContentFailure` → activity `failed`, `error: "content: …"` (terminal for the activity; regeneration is a human action); `BudgetRefused` → activity `failed`, `error: "budget: …"`, the stop flag is set, every activity not yet dispatched becomes `failed` with `error: "skipped: budget: …"`; `RunStopped` (a lane's runner found the stop flag before a dispatch or a retry) → `failed` with `error: "skipped: …"`; `InfrastructureFailure` (or any other error) → the activity `failed` with `error: "system: …"`, the stop flag is set, lanes settle, the import is marked `failed` and the error is rethrown. A **storage failure while recording an outcome or persisting the budget** never escapes a lane worker: it sets the stop flag, every other lane settles, the import is marked `failed` with `system: …`, the error is rethrown after all lanes have finished, and only then does `runImport`'s `finally` release the lock. On resume, activities whose error starts with `skipped:`, `budget:` or `system:` are re-dispatched; `content:` failures are not.
- Terminal rules: zero promoted → `failed` (`error` = the stop reason, or `"no activity was promoted"`); some failed → `ready_with_failures`; all promoted → `ready`. Rerunning `runImport` with the same `importId`, the same inputs and the same store makes no model call for finished steps and returns the same terminal record; a `ready_with_failures` import with re-dispatchable activities resumes them.

- [ ] **Step 1: Shared test helpers**

`packages/generator/test/helpers/synthetic.ts` (Tasks 7 and 8's tests are refactored to import `MemoryRecorder`, `fixtures`, `sid`, `unitOut` and `conceptResponses` from here instead of defining them inline — a mechanical move, no assertion changes):
```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceDocument } from "../../src/ingest/index.js";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { chunkSentences } from "../../src/concepts/chunk.js";
import { fakeResponse } from "../../src/llm/fake-provider.js";
import type { AttemptEvent, AttemptOutcome, AttemptRecorder, AttemptStart } from "../../src/llm/types.js";

export const fixtures = resolve(import.meta.dirname, "../fixtures/synthetic");
export const CHUNK_TOKENS = 330;

export class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptStart) { this.events.push(e); } async recordOutcome(e: AttemptOutcome) { this.events.push(e); } }

export async function syntheticDoc(): Promise<SourceDocument> {
  return ingestMarkdown(await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8"), { sourceId: "src-synthetic" });
}
export async function syntheticUnitText(): Promise<string> { return readFile(resolve(fixtures, "unit-synele001.txt"), "utf8"); }

export function sid(doc: SourceDocument, startsWith: string): string {
  const s = doc.sentences.find((x) => x.text.startsWith(startsWith));
  if (!s) throw new Error(`no sentence starting "${startsWith}"`);
  return s.sentenceId;
}

/** Synthetic model output for unit-synele001.txt, authored by hand (Task 7). */
export const unitOut = {
  code: "SYNELE001", title: "Isolate and test electrical equipment (SYNTHETIC UNIT FOR TESTS)",
  elements: [
    { number: "1", text: "Prepare to isolate equipment", performanceCriteria: [{ number: "1.1", text: "Identify electrical hazards in the work area and record them on the isolation permit" }, { number: "1.2", text: "Confirm every supply to the equipment, including secondary supplies" }] },
    { number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ number: "2.1", text: "Apply lockout devices and tags in accordance with site procedure" }, { number: "2.2", text: "Test for dead using a proved voltage tester" }] },
    { number: "3", text: "Restore supply", performanceCriteria: [{ number: "3.1", text: "Remove locks and tags in the correct sequence after work is complete" }, { number: "3.2", text: "Complete an incident report for any breach of isolation" }, { number: "3.3", text: "Confirm guards and covers are refitted before supply is restored" }] }
  ],
  knowledgeEvidence: ["types of electrical hazards including stored energy and multiple supplies", "purpose of lockout devices and tags"],
  performanceEvidence: ["isolate and test at least one item of equipment fed from two supplies"]
};

/** One extract response per chunk plus merge and align responses, built from the real sentence ids so the fixture never drifts (Task 8). */
export function conceptResponses(doc: SourceDocument): { perChunk: Array<Array<{ name: string; summary: string; sentenceIds: string[] }>>; mergeOut: { concepts: Array<{ name: string; summary: string; memberIds: string[] }> }; alignOut: { criteria: Array<{ criterionId: string; conceptIds: string[] }> }; script: ReturnType<typeof fakeResponse>[] } {
  const chunks = chunkSentences(doc.sentences, CHUNK_TOKENS);
  const lotoEarly = sid(doc, "Lockout and tagout is the method");
  const lotoTag = sid(doc, "A tag is a warning label");
  const lotoRemove = sid(doc, "Only the worker who applied a lock may remove it");
  const lotoLate = sid(doc, "Lockout and tagout ends when the permit is closed");
  const tfdA = sid(doc, "After the isolator is opened and locked");
  const tfdB = sid(doc, "Testing for dead confirms");
  const hazards = sid(doc, "Typical hazards are damaged insulation");
  const inChunk = (i: number, ids: string[]) => ids.filter((id) => chunks[i]!.sentences.some((s) => s.sentenceId === id));
  const perChunk = chunks.map((_, i) => {
    const concepts: Array<{ name: string; summary: string; sentenceIds: string[] }> = [];
    const loto = inChunk(i, [lotoEarly, lotoTag, lotoRemove, lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", sentenceIds: loto });
    const tfd = inChunk(i, [tfdA, tfdB]); if (tfd.length) concepts.push({ name: "Testing for dead", summary: "Prove the tester, test every pair, record the result.", sentenceIds: tfd });
    const hz = inChunk(i, [hazards]); if (hz.length) concepts.push({ name: "Hazard identification", summary: "Inspect for damaged insulation, moisture, stored energy, multiple supplies.", sentenceIds: hz });
    if (concepts.length === 0) concepts.push({ name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", sentenceIds: [chunks[i]!.sentences[0]!.sentenceId] });
    return concepts;
  });
  const byName = (name: string) => perChunk.flatMap((cs, i) => cs.map((c, j) => ({ c, id: `k${i}-${j}` }))).filter((x) => x.c.name === name).map((x) => x.id);
  const mergeOut = { concepts: [
    { name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated until the permit closes.", memberIds: byName("Lockout and tagout") },
    { name: "Testing for dead", summary: "Prove the tester before and after; test every pair; record it.", memberIds: byName("Testing for dead") },
    { name: "Hazard identification", summary: "Inspect and record hazards on the permit.", memberIds: byName("Hazard identification") },
    { name: "Personal protective equipment", summary: "PPE reduces severity but does not replace isolation.", memberIds: byName("Personal protective equipment") }
  ].filter((c) => c.memberIds.length > 0) };
  const alignOut = { criteria: [
    { criterionId: "PC1.1", conceptIds: ["c3"] }, { criterionId: "PC1.2", conceptIds: ["c3"] }, { criterionId: "PC2.1", conceptIds: ["c1"] }, { criterionId: "PC2.2", conceptIds: ["c2"] },
    { criterionId: "PC3.1", conceptIds: ["c1"] }, { criterionId: "PC3.2", conceptIds: [] }, { criterionId: "PC3.3", conceptIds: ["c1"] }
  ] };
  const script = [...perChunk.map((c) => fakeResponse({ outputText: JSON.stringify({ concepts: c }) })), fakeResponse({ outputText: JSON.stringify(mergeOut) }), fakeResponse({ outputText: JSON.stringify(alignOut) })];
  return { perChunk, mergeOut, alignOut, script };
}

/** One plan entry per requested slot; multiChoice/blanks alternate between c1 and c2, flashcards take both. Focus strings are distinct so routed providers can tell activities apart. */
export const planOutFor = (types: Array<"multiChoice" | "blanks" | "flashcards">) => ({ activities: types.map((type, i) => ({ slot: i + 1, type, conceptIds: type === "flashcards" ? ["c1", "c2"] : [i % 2 === 0 ? "c1" : "c2"], criteriaIds: type === "flashcards" ? ["PC2.1", "PC2.2"] : [i % 2 === 0 ? "PC2.1" : "PC2.2"], focus: `${type} focus ${i + 1}` })) });
```
The `alignOut` ids assume the merge order above (`c1` lockout, `c2` testing for dead, `c3` hazards); `mergeConcepts` assigns ids in the model's returned order, which this helper fixes.

`packages/generator/test/helpers/crashing-store.ts`:
```ts
import type { ImportStore } from "../../src/store/types.js";

export class CrashError extends Error { constructor(method: string, nth: number) { super(`simulated crash before ${method} call ${nth}`); this.name = "CrashError"; } }

type Method = { [K in keyof ImportStore]: ImportStore[K] extends (...args: never[]) => unknown ? K : never }[keyof ImportStore];

/**
 * Wraps a store so that the nth matching call of `method` never runs and the process is "dead" from then on:
 * that call and every later store call throw CrashError. Resume tests then reopen the inner store.
 */
export function crashBefore<K extends Method>(inner: ImportStore, method: K, nth: number, matches: (args: Parameters<ImportStore[K]>) => boolean = () => true): ImportStore {
  let seen = 0; let dead = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (dead) throw new CrashError(String(prop), nth);
        if (prop === method && matches(args as Parameters<ImportStore[K]>)) { seen += 1; if (seen === nth) { dead = true; throw new CrashError(String(prop), nth); } }
        return fn.apply(target, args);
      };
    }
  });
}

export class StorageError extends Error { constructor(method: string) { super(`simulated storage failure in ${method}`); this.name = "StorageError"; } }

/** Wraps a store so the first matching call of `method` fails (the write does not happen) while the process stays alive and every later call works: a transient storage failure, not a crash. */
export function failOnce<K extends Method>(inner: ImportStore, method: K, matches: (args: Parameters<ImportStore[K]>) => boolean = () => true): ImportStore {
  let failed = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (!failed && prop === method && matches(args as Parameters<ImportStore[K]>)) { failed = true; throw new StorageError(String(prop)); }
        return fn.apply(target, args);
      };
    }
  });
}
```
These proxies throw through a live process: `catch` and `finally` blocks still run, so they test the recovery *logic*, not abrupt termination. Task 15 adds a real child-process kill over `FileStore` for that.

`packages/generator/test/helpers/routed-provider.ts`:
```ts
import type { ModelProvider } from "../../src/llm/provider.js";
import type { ModelRequest, ModelResponse } from "../../src/llm/types.js";

export interface Route { match: (request: ModelRequest) => boolean; script: Array<ModelResponse | Error>; }

/** A fake provider whose responses are chosen by request content, so concurrent lanes cannot swap each other's responses. */
export class RoutedProvider implements ModelProvider {
  readonly name = "fake" as const;
  readonly requests: ModelRequest[] = [];
  constructor(private readonly routes: Route[]) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const route = this.routes.find((r) => r.match(request));
    const next = route?.script.shift();
    if (next === undefined) throw new Error(`RoutedProvider has no response for purpose ${request.purpose} (user starts "${request.user.slice(0, 60)}")`);
    if (next instanceof Error) throw next;
    return { ...next, model: request.model };
  }
}
```

- [ ] **Step 2: Failing pipeline test**

`packages/generator/test/pipeline.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { MemoryStore } from "../src/store/memory-store.js";
import { StoreLockedError } from "../src/store/types.js";
import { runImport, SKIPPED_PREFIX, type RunImportDeps, type RunImportInput } from "../src/pipeline/run-import.js";
import { IncompatibleResumeError, runFingerprint } from "../src/pipeline/fingerprint.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_BUDGET_LIMITS } from "../src/llm/budget.js";
import { chunkSentences } from "../src/concepts/chunk.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptStart } from "../src/llm/types.js";
import type { PlanRules } from "../src/plan/planner.js";
import { ProviderError } from "../src/llm/provider.js";
import { conceptResponses, syntheticDoc, syntheticUnitText, unitOut, planOutFor, CHUNK_TOKENS, sid } from "./helpers/synthetic.js";
import { crashBefore, CrashError, failOnce } from "./helpers/crashing-store.js";
import { RoutedProvider } from "./helpers/routed-provider.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
type Doc = Awaited<ReturnType<typeof syntheticDoc>>;

/** Produce fixtures cite only evidence that belongs to the concept each plan slot targets (planOutFor: multiChoice → c1, blanks → c2, flashcards → c1 + c2). */
function produceResponses(doc: Doc) {
  const remove = `ev-${sid(doc, "Only the worker who applied a lock may remove it")}`;   // concept c1 (lockout and tagout)
  const tag = `ev-${sid(doc, "A tag is a warning label")}`;                               // concept c1
  const tfdA = `ev-${sid(doc, "After the isolator is opened and locked")}`;              // concept c2 (testing for dead)
  const tfdB = `ev-${sid(doc, "Testing for dead confirms")}`;                            // concept c2
  const mc = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The site electrician", correct: false, feedback: "" }], evidenceIds: [remove] };
  const mc2 = { title: "Testing for dead", question: "What does testing for dead confirm before work starts?", answers: [{ text: "That the conductors carry no voltage", correct: true, feedback: "Testing for dead confirms that the conductors to be worked on carry no voltage." }, { text: "That the permit is closed", correct: false, feedback: "" }, { text: "That the tag has been removed", correct: false, feedback: "" }], evidenceIds: [tfdB] };
  const bl = { title: "Testing for dead", taskDescription: "Complete the sentences about testing for dead.", passage: "After the isolator is opened and locked, the worker must test for {{b1}} at the point of work using a voltage tester rated for the circuit. Testing for dead confirms that the conductors to be worked on carry no {{b2}}.", blanks: [{ answers: ["dead"], tip: null, evidenceIds: [tfdA] }, { answers: ["voltage"], tip: null, evidenceIds: [tfdB] }] };
  const fc = { title: "Key terms", description: "Isolation vocabulary.", cards: [{ front: "Who may remove a lock", back: "Only the worker who applied it", tip: null, evidenceIds: [remove] }, { front: "Tag", back: "A warning label attached to the lockout device naming the worker, the date and the reason", tip: null, evidenceIds: [tag] }, { front: "When to test for dead", back: "After the isolator is opened and locked, at the point of work, with a tester rated for the circuit", tip: null, evidenceIds: [tfdA] }, { front: "What testing for dead confirms", back: "That the conductors to be worked on carry no voltage", tip: null, evidenceIds: [tfdB] }] };
  return { mc, mc2, bl, fc };
}

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
async function fullScript(doc: Doc) {
  const { script } = conceptResponses(doc);
  const { mc, bl, fc } = produceResponses(doc);
  return [r(unitOut), ...script, r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)];
}
const callsThroughPlan = (doc: Doc) => 1 + chunkSentences(doc.sentences, CHUNK_TOKENS).length + 2 + 1; // parseUnit, extract per chunk, merge, align, plan

const input = async (importId: string, overrides: Partial<RunImportInput> = {}): Promise<RunImportInput> => ({ importId, name: "Synthetic import", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"] as const, budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, ...overrides });
const deps = (store: RunImportDeps["store"], provider: RunImportDeps["provider"], overrides: Partial<RunImportDeps> = {}): RunImportDeps => ({ store, provider, registry, engineFingerprint: "engine@0.1.0+lock:test", concurrency: 1, chunkTokens: CHUNK_TOKENS, rules, sleep: async () => undefined, ...overrides });
const purposes = (p: { requests: Array<{ purpose: string }> }) => p.requests.map((x) => x.purpose);

describe("runImport", () => {
  it("runs source → unit → concepts → plan → three activities → built packages, recording every attempt, its call key and cost", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-1"), deps(store, provider));
    expect(record.status).toBe("ready");
    expect(record.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(record.budget).toEqual({ usdMicro: 5_000_000, ...DEFAULT_BUDGET_LIMITS });
    const activities = await store.listActivities("imp-1");
    expect(activities.map((a) => [a.type, a.status])).toEqual([["multiChoice", "promoted"], ["blanks", "promoted"], ["flashcards", "promoted"]]);
    for (const a of activities) {
      const rev = await store.getRevision(a.activityId, 1);
      expect(rev?.state).toBe("promoted");
      expect(rev?.promptVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(rev?.engineFingerprint).toBe("engine@0.1.0+lock:test");
      expect(rev?.modelConfig.profiles["claude-sonnet-5"]).toEqual({ temperature: null, thinking: { type: "disabled" } });
      const build = await store.getBuild(rev!.buildKey!);
      expect(build?.subarray(0, 2).toString("latin1")).toBe("PK");
    }
    const attempts = await store.listAttempts("imp-1");
    const starts = attempts.filter((e): e is AttemptStart => e.event === "start"); const outcomes = attempts.filter((e) => e.event === "outcome");
    expect(starts).toHaveLength(provider.requests.length);
    expect(outcomes).toHaveLength(starts.length);
    expect(starts.every((s) => s.retryIndex === 0 && s.retryReason === null)).toBe(true);
    expect(new Set(starts.map((s) => s.callKey)).size).toBe(starts.length); // every call key distinct: no retries happened
    expect(starts.map((s) => s.callKey)).toEqual(expect.arrayContaining(["parseUnit", "extract:chunk-0", "merge", "align", "plan", "produce:act-1", "produce:act-2", "produce:act-3"]));
    expect(record.budgetUsed).toMatchObject({ reservedUsdMicro: 0, requests: provider.requests.length });
    expect(record.budgetUsed.spentUsdMicro).toBeGreaterThan(0);
    expect(record.budgetUsed.spentTokens).toBeGreaterThan(0);
    expect(record.budgetUsed.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(provider.options.every((o) => o.deadlineMs !== undefined)).toBe(true); // every dispatch carried the deadline
    const ops = await store.listOperations("imp-1");
    expect(ops.filter((o) => o.purpose === "produce" && o.status === "succeeded")).toHaveLength(3);
    expect(await store.getArtifact("imp-1", "conceptMap")).not.toBeNull();
  });

  it("is idempotent: a second run over the same store makes no model calls, and a finished import returns at once", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    await runImport(await input("imp-2"), deps(store, new FakeProvider(await fullScript(doc))));
    const finished = (await store.getImport("imp-2"))!;
    await store.putImport({ ...finished, status: "generating" }); // simulate a crash after every step persisted its artefact
    const empty = new FakeProvider([]);
    const again = await runImport(await input("imp-2"), deps(store, empty));
    expect(empty.requests).toHaveLength(0);
    expect(again.status).toBe("ready");
    expect((await store.listOperations("imp-2")).filter((o) => o.purpose === "produce")).toHaveLength(3); // no new operations were created
    const third = await runImport(await input("imp-2"), deps(store, empty));
    expect(third.status).toBe("ready");
  });

  it("refuses to resume with different inputs or configuration, before any write", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    await runImport(await input("imp-fp"), deps(store, new FakeProvider(await fullScript(doc))));
    const before = await store.getImport("imp-fp");
    const empty = new FakeProvider([]);
    await expect(runImport(await input("imp-fp", { language: "vi" }), deps(store, empty))).rejects.toBeInstanceOf(IncompatibleResumeError);
    await expect(runImport(await input("imp-fp", { unitText: null }), deps(store, empty))).rejects.toBeInstanceOf(IncompatibleResumeError);
    await expect(runImport(await input("imp-fp"), deps(store, empty, { chunkTokens: CHUNK_TOKENS + 10 }))).rejects.toBeInstanceOf(IncompatibleResumeError);
    expect(await store.getImport("imp-fp")).toEqual(before);
    expect(empty.requests).toHaveLength(0);
    const raised = await runImport(await input("imp-fp", { budget: { usdMicro: 9_000_000 } }), deps(store, empty)); // budget limits are not part of the identity
    expect(raised.budget.usdMicro).toBe(9_000_000);
  });

  it("refuses a second writer while the import is locked", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const held = await store.lock("imp-lock");
    await expect(runImport(await input("imp-lock"), deps(store, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(StoreLockedError);
    await held.release();
    expect((await runImport(await input("imp-lock"), deps(store, new FakeProvider(await fullScript(doc))))).status).toBe("ready");
  });

  it("recovers when the process dies after extraction finished but before the concept map was stored: chunks are reused, only merge and align run again", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putArtifact", 1, (args) => args[1] === "conceptMap");
    await expect(runImport(await input("imp-c1"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([...script.slice(-2), r(planOutFor(["multiChoice", "blanks", "flashcards"])), r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c1"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["merge", "align", "plan", "produce", "produce", "produce"]);
    const conceptOps = (await store.listOperations("imp-c1")).filter((o) => o.idempotencyKey === "imp-c1:concepts");
    expect(conceptOps.map((o) => [o.operationId, o.status, o.billingUncertain])).toEqual([["imp-c1:concepts", "failed", true], ["imp-c1:concepts#2", "succeeded", false]]);
    const resumedMerge = (await store.listAttempts("imp-c1")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "merge");
    expect(resumedMerge.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "resume"]]);
  });

  it("recovers when the process dies after the plan was stored but before its operation record: no planning call is repeated and activities come from the stored plan", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putOperation", 1, (args) => args[0].idempotencyKey === "imp-c2:plan" && args[0].status === "succeeded");
    await expect(runImport(await input("imp-c2"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect(await store.getArtifact("imp-c2", "plan")).not.toBeNull();
    expect(await store.listActivities("imp-c2")).toHaveLength(0);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c2"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce", "produce"]);
    expect((await store.listOperations("imp-c2")).find((o) => o.idempotencyKey === "imp-c2:plan")).toMatchObject({ status: "succeeded", outcome: expect.stringMatching(/reused on resume/) });
  });

  it("recovers when the process dies half-way through writing the activity records", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putActivity", 2);
    await expect(runImport(await input("imp-c3"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect(await store.listActivities("imp-c3")).toHaveLength(1);
    const { mc, bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(mc), r(bl), r(fc)]);
    const record = await runImport(await input("imp-c3"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce", "produce"]);
    expect((await store.listActivities("imp-c3")).map((a) => a.activityId)).toEqual(["act-1", "act-2", "act-3"]);
  });

  it("resumes a saved candidate at compilation instead of regenerating it", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putBuild", 1);
    await expect(runImport(await input("imp-c4"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    const candidate = await store.getRevision("act-1", 1);
    expect(candidate?.state).toBe("candidate");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c4"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    const promoted = await store.getRevision("act-1", 1);
    expect(promoted).toMatchObject({ state: "promoted", attemptIds: candidate!.attemptIds });
    expect((await store.listOperations("imp-c4")).filter((o) => o.idempotencyKey === "imp-c4:produce:act-1:r1")).toEqual([expect.objectContaining({ status: "succeeded", billingUncertain: false, outcome: "ok" })]);
  });

  it("reuses a candidate that was persisted before its operation record was completed, correcting the record and keeping billing-uncertain", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putOperation", 1, (args) => args[0].idempotencyKey === "imp-c6:produce:act-1:r1" && args[0].status === "succeeded");
    await expect(runImport(await input("imp-c6"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect((await store.getRevision("act-1", 1))?.state).toBe("candidate");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c6"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    expect((await store.listOperations("imp-c6")).filter((o) => o.idempotencyKey === "imp-c6:produce:act-1:r1")).toEqual([expect.objectContaining({ status: "succeeded", billingUncertain: true, outcome: expect.stringMatching(/reused on resume/) })]);
    expect((await store.getRevision("act-1", 1))?.state).toBe("promoted");
  });

  it("repairs an activity whose revision was promoted before the activity record was updated", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const crashing = crashBefore(store, "putActivity", 1, (args) => args[0].status === "promoted");
    await expect(runImport(await input("imp-c5"), deps(crashing, new FakeProvider(await fullScript(doc))))).rejects.toBeInstanceOf(CrashError);
    expect((await store.getRevision("act-1", 1))?.state).toBe("promoted");
    expect((await store.listActivities("imp-c5")).find((a) => a.activityId === "act-1")?.status).not.toBe("promoted");
    const { bl, fc } = produceResponses(doc);
    const resume = new FakeProvider([r(bl), r(fc)]);
    const record = await runImport(await input("imp-c5"), deps(store, resume));
    expect(record.status).toBe("ready");
    expect(purposes(resume)).toEqual(["produce", "produce"]);
    expect((await store.listActivities("imp-c5")).find((a) => a.activityId === "act-1")).toMatchObject({ status: "promoted", currentRevision: 1, error: null });
  });

  it("stops dispatch on a budget refusal, settles in-flight work, gives every undispatched activity an explicit outcome, and re-dispatches them when the budget is raised", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const limit = callsThroughPlan(doc) + 1; // enough for the multiChoice produce, not for the blanks produce
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-b", { budget: { usdMicro: 5_000_000, requests: limit } }), deps(store, provider));
    expect(record.status).toBe("ready_with_failures");
    expect(provider.requests).toHaveLength(limit);
    const byId = new Map((await store.listActivities("imp-b")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")).toMatchObject({ status: "promoted" });
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^budget: .*requests/) });
    expect(byId.get("act-3")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}budget:`)) });
    const attempts = await store.listAttempts("imp-b");
    expect(attempts.filter((e) => e.event === "start")).toHaveLength(limit);
    expect(attempts.filter((e) => e.event === "outcome")).toHaveLength(limit);
    expect(record.budgetUsed.reservedUsdMicro).toBe(0);
    const { bl, fc } = produceResponses(doc);
    const resumed = await runImport(await input("imp-b", { budget: { usdMicro: 5_000_000, requests: limit + 2 } }), deps(store, new FakeProvider([r(bl), r(fc)])));
    expect(resumed.status).toBe("ready");
    expect((await store.listActivities("imp-b")).map((a) => a.status)).toEqual(["promoted", "promoted", "promoted"]);
  });

  it("marks the import failed and rethrows on an infrastructure failure after in-flight lanes settle; the failed activity is re-dispatched on resume", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const script = await fullScript(doc);
    const { mc, bl, fc } = produceResponses(doc);
    script.splice(script.length - 3, 3, r(mc), new ProviderError("bad key", "permanent", 401), r(fc));
    await expect(runImport(await input("imp-i"), deps(store, new FakeProvider(script)))).rejects.toMatchObject({ name: "InfrastructureFailure" });
    const record = (await store.getImport("imp-i"))!;
    expect(record).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    const byId = new Map((await store.listActivities("imp-i")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")?.status).toBe("promoted");
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    expect(byId.get("act-3")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    const resumed = await runImport(await input("imp-i"), deps(store, new FakeProvider([r(bl), r(fc)])));
    expect(resumed.status).toBe("ready");
  });

  it("marks an activity failed after three content failures and finishes ready_with_failures; content failures are not re-dispatched", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const script = await fullScript(doc);
    const bad = r({ title: "x", question: "y", answers: [], evidenceIds: [] });
    script.splice(script.length - 3, 1, bad, bad, bad); // replace the multiChoice response with three rejected attempts
    const record = await runImport(await input("imp-3"), deps(store, new FakeProvider(script)));
    expect(record.status).toBe("ready_with_failures");
    const mc = (await store.listActivities("imp-3")).find((a) => a.type === "multiChoice")!;
    expect(mc).toMatchObject({ status: "failed", error: expect.stringMatching(/^content:/) });
    const op = (await store.listOperations("imp-3")).find((o) => o.activityId === mc.activityId)!;
    expect(op).toMatchObject({ status: "failed", contentAttempts: 3 });
    const starts = (await store.listAttempts("imp-3")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "produce:act-1");
    expect(starts.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "content"], [2, "content"]]);
    const empty = new FakeProvider([]);
    expect((await runImport(await input("imp-3"), deps(store, empty))).status).toBe("ready_with_failures");
    expect(empty.requests).toHaveLength(0);
  });

  it("serialises same-type activities so the near-duplicate check sees the earlier promotion while other types run concurrently", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, mc2, bl, fc } = produceResponses(doc);
    const twoMc: PlanRules = { ...rules, multiChoice: { perImport: 2 } };
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 1"), script: [r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 2"), script: [r({ ...mc2, question: mc.question, evidenceIds: mc2.evidenceIds }), r(mc2)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [r(bl)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const record = await runImport(await input("imp-d"), deps(store, provider, { concurrency: 3, rules: twoMc }));
    expect(record.status).toBe("ready");
    const secondMc = provider.requests.filter((q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice focus 2"));
    expect(secondMc).toHaveLength(2);
    expect(secondMc[1]?.user).toContain("near-duplicate of an existing question");
    expect((await store.listActivities("imp-d")).map((a) => a.status)).toEqual(["promoted", "promoted", "promoted", "promoted"]);
  });

  it("reconciles a start without an outcome as billing-uncertain on restart", async () => {
    const store = new MemoryStore();
    const base = await input("imp-5", { unitText: null, selectedTypes: ["multiChoice"] });
    const fingerprint = runFingerprint({ sourceTextHash: base.source.textHash, unitText: null, selectedTypes: base.selectedTypes, language: base.language, promptConfig: base.promptConfig, customisation: null, chunkTokens: CHUNK_TOKENS, rules });
    await store.putImport({ importId: "imp-5", orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { usdMicro: 5_000_000, ...DEFAULT_BUDGET_LIMITS }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, error: null, idempotencyKey: "imp-5", createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z" });
    await store.putOperation({ operationId: "imp-5:produce:act-1:r1", importId: "imp-5", activityId: "act-1", purpose: "produce", status: "running", idempotencyKey: "imp-5:produce:act-1:r1", contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: "2026-09-19T00:00:00Z", completedAt: null });
    await store.recorderFor("imp-5").recordStart({ event: "start", attemptId: "att-1", operationId: "imp-5:produce:act-1:r1", callKey: "produce:act-1", retryIndex: 0, retryReason: null, attempt: 1, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 10, reservedOutputTokens: 10, reservedUsdMicro: 777, startedAt: "2026-09-19T00:00:00Z" });
    await runImport(base, deps(store, new FakeProvider([]))).catch(() => undefined);
    const op = (await store.listOperations("imp-5")).find((o) => o.operationId === "imp-5:produce:act-1:r1")!;
    expect(op.billingUncertain).toBe(true);
    expect(op.status).toBe("failed");
    const after = (await store.getImport("imp-5"))!;
    expect(after.budgetUsed.spentUsdMicro).toBeGreaterThanOrEqual(777); // the interrupted reservation counts as spent
    expect(after.budgetUsed.requests).toBeGreaterThanOrEqual(1);
  });

  it("treats the elapsed limit as per-import: a resume with the limit already used up refuses the first dispatch", async () => {
    const store = new MemoryStore();
    const base = await input("imp-e", { unitText: null, selectedTypes: ["multiChoice"], budget: { usdMicro: 5_000_000, elapsedMs: 60_000 } });
    const fingerprint = runFingerprint({ sourceTextHash: base.source.textHash, unitText: null, selectedTypes: base.selectedTypes, language: base.language, promptConfig: base.promptConfig, customisation: null, chunkTokens: CHUNK_TOKENS, rules });
    await store.putImport({ importId: "imp-e", orgId: "local", name: "n", sourceType: "markdown", status: "extracting", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], fingerprint, budget: { ...DEFAULT_BUDGET_LIMITS, usdMicro: 5_000_000, elapsedMs: 60_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 60_000 }, error: null, idempotencyKey: "imp-e", createdAt: "t", updatedAt: "t" });
    const provider = new FakeProvider([]);
    const record = await runImport(base, deps(store, provider));
    expect(record).toMatchObject({ status: "failed", error: expect.stringMatching(/^budget: .*elapsed/) });
    expect(provider.requests).toHaveLength(0);
    expect(await store.listAttempts("imp-e")).toEqual([]);
  });

  it("canonicalises duplicate selected types: one lane and one set of plan slots per type", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-t", { selectedTypes: ["multiChoice", "multiChoice", "blanks", "flashcards", "blanks"] }), deps(store, provider));
    expect(record.status).toBe("ready");
    expect(record.selectedTypes).toEqual(["multiChoice", "blanks", "flashcards"]);
    expect((await store.listActivities("imp-t")).map((a) => a.type)).toEqual(["multiChoice", "blanks", "flashcards"]);
    expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(3);
    const same = await runImport(await input("imp-t", { selectedTypes: ["blanks", "multiChoice", "flashcards"] }), deps(store, new FakeProvider([]))); // order does not change the identity
    expect(same.status).toBe("ready");
  });

  it("a stop raised by one lane prevents another lane's pending retry from dispatching, and in-flight lanes settle first", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice"), script: [new ProviderError("overloaded", "transient", 529), r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [new ProviderError("bad key", "permanent", 401)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 30)); // the multiChoice lane is mid-backoff when the blanks lane fails
    await expect(runImport(await input("imp-s"), deps(store, provider, { concurrency: 3, sleep }))).rejects.toMatchObject({ name: "InfrastructureFailure" });
    expect(provider.requests.filter((q) => q.purpose === "produce")).toHaveLength(3); // multiChoice's retry was never dispatched
    const byId = new Map((await store.listActivities("imp-s")).map((a) => [a.activityId, a]));
    expect(byId.get("act-1")).toMatchObject({ status: "failed", error: expect.stringMatching(new RegExp(`^${SKIPPED_PREFIX}system:`)) });
    expect(byId.get("act-2")).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: /) });
    expect(byId.get("act-3")?.status).toBe("promoted"); // already in flight; it settled
    expect((await store.getImport("imp-s"))?.status).toBe("failed");
    const held = await store.lock("imp-s"); await held.release(); // the lock was released only after every lane settled
    const resumed = await runImport(await input("imp-s"), deps(store, new FakeProvider([r(mc), r(bl)])));
    expect(resumed.status).toBe("ready");
  });

  it("a storage failure while recording an outcome stops the import, lets the other lanes settle, releases the lock, and is recoverable", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const { script } = conceptResponses(doc);
    const { mc, bl, fc } = produceResponses(doc);
    const provider = new RoutedProvider([
      { match: (q) => q.purpose === "parseUnit", script: [r(unitOut)] },
      { match: (q) => q.purpose === "extract" || q.purpose === "merge" || q.purpose === "align", script: [...script] },
      { match: (q) => q.purpose === "plan", script: [r(planOutFor(["multiChoice", "blanks", "flashcards"]))] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: multiChoice"), script: [r(mc)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: blanks"), script: [r(bl)] },
      { match: (q) => q.purpose === "produce" && q.user.includes("FOCUS: flashcards"), script: [r(fc)] }
    ]);
    const flaky = failOnce(store, "putImport", (args) => args[0].status === "generating" && args[0].budgetUsed.spentUsdMicro > 0); // the first budget persistence after a lane finishes
    await expect(runImport(await input("imp-f"), deps(flaky, provider, { concurrency: 3 }))).rejects.toMatchObject({ name: "StorageError" });
    expect((await store.getImport("imp-f"))).toMatchObject({ status: "failed", error: expect.stringMatching(/^system: .*storage failure/) });
    for (const a of await store.listActivities("imp-f")) expect(["promoted", "failed"]).toContain(a.status); // every lane reached an explicit end state
    const held = await store.lock("imp-f"); await held.release();
    const resume = new FakeProvider([]);
    const resumed = await runImport(await input("imp-f"), deps(store, resume));
    expect(resumed.status).toBe("ready");
    expect(resume.requests).toHaveLength(0); // every activity had persisted its candidate or promotion before the failure
  });
});
```

- [ ] **Step 3: Run to see it fail**, then implement.

`packages/generator/src/store/types.ts`:
```ts
import type { AcceptanceDecision, ActivitySpec, ActivityStatus, AlignmentDecision, ImportStatus, RevisionState } from "@leaplearn/shared";
import type { SourceKind } from "../ingest/source-document.js";
import type { BudgetLimits } from "../llm/budget.js";
import type { RequestProfile } from "../llm/models.js";
import type { AttemptEvent, AttemptRecorder, Purpose } from "../llm/types.js";
import type { PlannedType } from "../plan/planner.js";

export interface ImportRecord {
  importId: string; orgId: string; name: string; sourceType: SourceKind; status: ImportStatus;
  customisation: string | null; language: string; unitTextHash: string | null; selectedTypes: PlannedType[];
  /** Identity of the inputs and configuration the import was created with (fingerprint.ts); a rerun must match it. Budget limits are not part of it. */
  fingerprint: string;
  budget: BudgetLimits;
  budgetUsed: { spentUsdMicro: number; reservedUsdMicro: number; spentTokens: number; requests: number };
  error: string | null; idempotencyKey: string; createdAt: string; updatedAt: string;
}
export interface ActivityRecord {
  activityId: string; importId: string; type: PlannedType; order: number; status: ActivityStatus;
  currentRevision: number | null; conceptIds: string[]; criteriaIds: string[]; error: string | null; dropped: boolean;
}
export interface RevisionRecord {
  activityId: string; revision: number; state: RevisionState; spec: ActivitySpec; schemaVersion: number; promptVersion: string;
  modelConfig: { provider: string; models: Record<string, string>; profiles: Record<string, RequestProfile> }; engineFingerprint: string; note: string | null; buildKey: string | null; attemptIds: string[]; createdAt: string;
}
export interface OperationRecord {
  operationId: string; importId: string; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed";
  idempotencyKey: string; contentAttempts: number; outcome: string | null; billingUncertain: boolean; startedAt: string; completedAt: string | null;
}
/** Spec §4 acceptance_decisions: a human judged the promoted revision good or not. Distinct from promotion. */
export interface AcceptanceRecord { importId: string; activityId: string; revision: number; decision: AcceptanceDecision; reviewer: string; notes: string | null; decidedAt: string; }
/** Spec §4 alignment_reviews, bound to the exact revision (and item). A new revision starts with no reviews. */
export interface AlignmentReviewRecord { importId: string; activityId: string; revision: number; itemId: string | null; unitTextHash: string | null; criterionId: string; decision: AlignmentDecision; reviewer: string; decidedAt: string; }
export type ArtifactName = "source" | "unit" | "conceptMap" | "plan" | `chunk-${number}`;

export interface StoreLock { release(): Promise<void>; }
export class StoreLockedError extends Error {
  constructor(importId: string, holder: string) { super(`import ${importId} is locked by ${holder}; another leap process is using this output directory`); this.name = "StoreLockedError"; }
}

export interface ImportStore {
  lock(importId: string): Promise<StoreLock>;
  getImport(importId: string): Promise<ImportRecord | null>;
  putImport(record: ImportRecord): Promise<void>;
  getArtifact<T>(importId: string, name: ArtifactName): Promise<T | null>;
  putArtifact(importId: string, name: ArtifactName, value: unknown): Promise<void>;
  listActivities(importId: string): Promise<ActivityRecord[]>;
  putActivity(record: ActivityRecord): Promise<void>;
  getRevision(activityId: string, revision: number): Promise<RevisionRecord | null>;
  listRevisions(activityId: string): Promise<RevisionRecord[]>;
  putRevision(record: RevisionRecord): Promise<void>;
  listOperations(importId: string): Promise<OperationRecord[]>;
  putOperation(record: OperationRecord): Promise<void>;
  recorderFor(importId: string): AttemptRecorder;
  listAttempts(importId: string): Promise<AttemptEvent[]>;
  putBuild(importId: string, activityId: string, revision: number, bytes: Buffer): Promise<string>;
  getBuild(buildKey: string): Promise<Buffer | null>;
  listAcceptances(importId: string): Promise<AcceptanceRecord[]>;
  putAcceptance(record: AcceptanceRecord): Promise<void>;
  listAlignmentReviews(importId: string): Promise<AlignmentReviewRecord[]>;
  putAlignmentReview(record: AlignmentReviewRecord): Promise<void>;
}
```

`packages/generator/src/store/memory-store.ts`:
```ts
import type { AttemptEvent, AttemptRecorder } from "../llm/types.js";
import { StoreLockedError, type AcceptanceRecord, type ActivityRecord, type AlignmentReviewRecord, type ArtifactName, type ImportRecord, type ImportStore, type OperationRecord, type RevisionRecord, type StoreLock } from "./types.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const reviewKey = (r: AlignmentReviewRecord): string => `${r.activityId}/${r.revision}/${r.itemId ?? ""}/${r.criterionId}`;

export class MemoryStore implements ImportStore {
  private imports = new Map<string, ImportRecord>();
  private artifacts = new Map<string, unknown>();
  private activities = new Map<string, ActivityRecord>();
  private revisions = new Map<string, RevisionRecord>();
  private operations = new Map<string, OperationRecord>();
  private attempts = new Map<string, AttemptEvent[]>();
  private builds = new Map<string, Buffer>();
  private acceptances = new Map<string, AcceptanceRecord>();
  private alignmentReviews = new Map<string, AlignmentReviewRecord>();
  private locks = new Set<string>();

  async lock(importId: string): Promise<StoreLock> {
    if (this.locks.has(importId)) throw new StoreLockedError(importId, "this process");
    this.locks.add(importId);
    return { release: async () => { this.locks.delete(importId); } };
  }
  async getImport(importId: string) { const r = this.imports.get(importId); return r ? clone(r) : null; }
  async putImport(record: ImportRecord) { this.imports.set(record.importId, clone(record)); }
  async getArtifact<T>(importId: string, name: ArtifactName) { const v = this.artifacts.get(`${importId}/${name}`); return v === undefined ? null : clone(v as T); }
  async putArtifact(importId: string, name: ArtifactName, value: unknown) { this.artifacts.set(`${importId}/${name}`, clone(value)); }
  async listActivities(importId: string) { return [...this.activities.values()].filter((a) => a.importId === importId).sort((a, b) => a.order - b.order).map(clone); }
  async putActivity(record: ActivityRecord) { this.activities.set(record.activityId, clone(record)); }
  async getRevision(activityId: string, revision: number) { const r = this.revisions.get(`${activityId}/${revision}`); return r ? clone(r) : null; }
  async listRevisions(activityId: string) { return [...this.revisions.values()].filter((r) => r.activityId === activityId).sort((a, b) => a.revision - b.revision).map(clone); }
  async putRevision(record: RevisionRecord) { this.revisions.set(`${record.activityId}/${record.revision}`, clone(record)); }
  async listOperations(importId: string) { return [...this.operations.values()].filter((o) => o.importId === importId).map(clone); }
  async putOperation(record: OperationRecord) { this.operations.set(record.operationId, clone(record)); }
  recorderFor(importId: string): AttemptRecorder {
    const list = this.attempts.get(importId) ?? []; this.attempts.set(importId, list);
    return { recordStart: async (s) => { list.push(clone(s)); }, recordOutcome: async (o) => { list.push(clone(o)); } };
  }
  async listAttempts(importId: string) { return clone(this.attempts.get(importId) ?? []); }
  async putBuild(importId: string, activityId: string, revision: number, bytes: Buffer) { const key = `${importId}/${activityId}/r${revision}.h5p`; this.builds.set(key, Buffer.from(bytes)); return key; }
  async getBuild(buildKey: string) { const b = this.builds.get(buildKey); return b ? Buffer.from(b) : null; }
  async listAcceptances(importId: string) { return [...this.acceptances.values()].filter((a) => a.importId === importId).map(clone); }
  async putAcceptance(record: AcceptanceRecord) { this.acceptances.set(`${record.activityId}/${record.revision}`, clone(record)); }
  async listAlignmentReviews(importId: string) { return [...this.alignmentReviews.values()].filter((a) => a.importId === importId).map(clone); }
  async putAlignmentReview(record: AlignmentReviewRecord) { this.alignmentReviews.set(reviewKey(record), clone(record)); }
}
```

`packages/generator/src/concepts/index.ts` — add the chunk cache to `ConceptMapOptions` and use it:
```ts
export interface ChunkCache { get(index: number): Promise<ChunkConcept[] | null>; put(index: number, concepts: ChunkConcept[]): Promise<void>; }
export interface ConceptMapOptions { chunkTokens?: number; promptConfig?: PromptConfig; chunkCache?: ChunkCache; }
// inside extractConceptMap:
  for (const chunk of chunks) {
    const cached = options.chunkCache ? await options.chunkCache.get(chunk.chunkIndex) : null;
    if (cached) { perChunk.push(cached); continue; }
    const concepts = await extractChunkConcepts(doc, chunk, runner, options.promptConfig ? { promptConfig: options.promptConfig } : {});
    if (options.chunkCache) await options.chunkCache.put(chunk.chunkIndex, concepts);
    perChunk.push(concepts);
  }
```

`packages/generator/src/pipeline/fingerprint.ts`:
```ts
import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "@leaplearn/shared";
import { textHash } from "../ingest/source-document.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { PlanRules } from "../plan/planner.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";

export const DEFAULT_CHUNK_TOKENS = 6000;

export interface FingerprintInput {
  sourceTextHash: string; unitText: string | null; selectedTypes: readonly string[]; language: string;
  promptConfig: PromptConfig; customisation: string | null; chunkTokens: number; rules: PlanRules;
}

/** Everything that changes what the pipeline would produce for the same import id. Budget limits are excluded on purpose: a resume may raise them. */
export function runFingerprint(input: FingerprintInput): string {
  const material = {
    v: 1,
    sourceTextHash: input.sourceTextHash,
    unitTextHash: input.unitText === null ? null : textHash(input.unitText.trim()),
    selectedTypes: [...input.selectedTypes].sort(),
    language: input.language,
    promptConfig: { readingLevel: input.promptConfig.readingLevel, tone: input.promptConfig.tone, language: input.promptConfig.language, instructionalLanguage: input.promptConfig.instructionalLanguage ?? null, customisation: input.promptConfig.customisation ?? null },
    customisation: input.customisation,
    chunkTokens: input.chunkTokens,
    rules: input.rules,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    models: MODEL_ROLES,
    profiles: REQUEST_PROFILES
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export class IncompatibleResumeError extends Error {
  constructor(importId: string, stored: string, current: string) {
    super(`import ${importId} was created with different inputs or configuration (fingerprint ${stored.slice(0, 12)}, now ${current.slice(0, 12)}); use a new output directory, or rerun with the original source, unit, types, language, prompt settings, chunking and plan rules`);
    this.name = "IncompatibleResumeError";
  }
}
```

`packages/generator/src/pipeline/operations.ts`:
```ts
import { createBudget, type Budget, type BudgetLimits } from "../llm/budget.js";
import type { ModelProvider } from "../llm/provider.js";
import { createRunner, type RunnerOptions, type StageRunner } from "../llm/runner.js";
import type { AttemptEvent, AttemptOutcome, AttemptStart, Purpose } from "../llm/types.js";
import type { ImportStore, OperationRecord } from "../store/types.js";

export interface OperationContext {
  store: ImportStore; provider: ModelProvider; budget: Budget; importId: string; clock: () => Date; sleep?: (ms: number) => Promise<void>;
  /** Attempts recorded per call key so far (ledger plus this run), for retryIndex numbering across resumptions. */
  attemptsByKey: Map<string, number>;
  onAttempt?: (event: { purpose: Purpose; status: AttemptOutcome["status"]; costUsdMicro: number | null }) => void;
  /** The import's shared stop signal, consulted by every runner before every dispatch. */
  stop?: () => string | null;
}

/** Rebuilds the import's budget from the attempt ledger: known costs and tokens are spent; a start with no outcome is spent at its reservation (it may have been billed); every start is a request; the deadline is what remains of the per-import elapsed limit. */
export function budgetFromLedger(limits: BudgetLimits, events: AttemptEvent[], startedAtMs: number, elapsedBeforeMs: number): Budget {
  const budget = createBudget(limits, startedAtMs, elapsedBeforeMs);
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  for (const e of events) {
    if (e.event !== "start") continue;
    const o = outcomes.get(e.attemptId);
    const reservedTokens = e.reservedInputTokens + e.reservedOutputTokens;
    const actualTokens = o && o.inputTokens !== null ? o.inputTokens + (o.cacheReadTokens ?? 0) + (o.cacheWriteTokens ?? 0) + (o.outputTokens ?? 0) : null;
    budget.requests += 1;
    budget.spentUsdMicro += o?.costUsdMicro ?? e.reservedUsdMicro;
    budget.spentTokens += actualTokens ?? reservedTokens;
  }
  return budget;
}

export function attemptsByKey(events: AttemptEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) if (e.event === "start") counts.set(e.callKey, (counts.get(e.callKey) ?? 0) + 1);
  return counts;
}

/** Marks every operation still "running" as failed and billing-uncertain (spec §5). */
export async function reconcile(store: ImportStore, importId: string, clock: () => Date): Promise<void> {
  for (const op of await store.listOperations(importId)) {
    if (op.status !== "running") continue;
    await store.putOperation({ ...op, status: "failed", billingUncertain: true, outcome: "interrupted before an outcome was recorded; the provider may have billed the attempt", completedAt: clock().toISOString() });
  }
}

export interface RunOperation<T> {
  purpose: Purpose;
  activityId: string | null;
  key: string;
  /** A result persisted by an earlier run, or null. Checked first: a persisted result is the source of truth even when the operation record was interrupted. */
  load: () => Promise<T | null>;
  work: (runner: StageRunner, op: OperationRecord) => Promise<T>;
  /** Persists the result. Runs before the operation is marked succeeded, so a crash between the two leaves a reusable result rather than a succeeded operation with nothing stored. */
  persist: (result: T) => Promise<void>;
}
export interface OperationOutcome<T> { result: T; operation: OperationRecord; reused: boolean; }

export async function runOperation<T>(ctx: OperationContext, spec: RunOperation<T>): Promise<OperationOutcome<T>> {
  const existing = (await ctx.store.listOperations(ctx.importId)).filter((o) => o.idempotencyKey === spec.key).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.operationId.localeCompare(b.operationId));
  const latest = existing.at(-1);
  const stored = await spec.load();
  if (stored !== null) {
    if (latest && latest.status === "succeeded") return { result: stored, operation: latest, reused: true };
    const corrected: OperationRecord = latest
      ? { ...latest, status: "succeeded", outcome: `${latest.outcome ?? "interrupted"}; the result had been persisted and was reused on resume`, completedAt: ctx.clock().toISOString() }
      : { operationId: spec.key, importId: ctx.importId, activityId: spec.activityId, purpose: spec.purpose, status: "succeeded", idempotencyKey: spec.key, contentAttempts: 0, outcome: "result found in the store without an operation record; reused on resume", billingUncertain: false, startedAt: ctx.clock().toISOString(), completedAt: ctx.clock().toISOString() };
    await ctx.store.putOperation(corrected);
    return { result: stored, operation: corrected, reused: true };
  }
  const operationId = existing.length === 0 ? spec.key : `${spec.key}#${existing.length + 1}`;
  const note = latest?.status === "succeeded" ? "re-run: the earlier operation succeeded but its result is missing from the store" : null;
  const op: OperationRecord = { operationId, importId: ctx.importId, activityId: spec.activityId, purpose: spec.purpose, status: "running", idempotencyKey: spec.key, contentAttempts: 0, outcome: note, billingUncertain: false, startedAt: ctx.clock().toISOString(), completedAt: null };
  await ctx.store.putOperation(op);
  const recorder = ctx.store.recorderFor(ctx.importId);
  const counting = {
    recordStart: async (s: AttemptStart) => { op.contentAttempts = Math.max(op.contentAttempts, s.attempt); ctx.attemptsByKey.set(s.callKey, (ctx.attemptsByKey.get(s.callKey) ?? 0) + 1); await recorder.recordStart(s); },
    recordOutcome: async (o: AttemptOutcome) => { await recorder.recordOutcome(o); ctx.onAttempt?.({ purpose: spec.purpose, status: o.status, costUsdMicro: o.costUsdMicro }); }
  };
  const runnerOptions: RunnerOptions = { provider: ctx.provider, recorder: counting, budget: ctx.budget, operationId, clock: ctx.clock, priorAttempts: (key) => ctx.attemptsByKey.get(key) ?? 0 };
  if (ctx.sleep) runnerOptions.sleep = ctx.sleep;
  if (ctx.stop) runnerOptions.stop = ctx.stop;
  const runner = createRunner(runnerOptions);
  try {
    const result = await spec.work(runner, op);
    await spec.persist(result);
    await ctx.store.putOperation({ ...op, status: "succeeded", outcome: "ok", completedAt: ctx.clock().toISOString() });
    return { result, operation: op, reused: false };
  } catch (err) {
    await ctx.store.putOperation({ ...op, status: "failed", outcome: err instanceof Error ? `${err.name}: ${err.message}` : String(err), completedAt: ctx.clock().toISOString() });
    throw err;
  }
}

/** Runs each lane's items strictly in order; up to `concurrency` lanes run at once. Workers must not throw (the caller records outcomes and stop flags). */
export async function runLanes<T>(lanes: T[][], concurrency: number, worker: (item: T, laneIndex: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runLane = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= lanes.length) return;
      for (const item of lanes[i]!) await worker(item, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, lanes.length)) }, runLane));
}
```
`RunnerOptions` is exported from `runner.ts` (Task 7 declares it with `export interface`).

`packages/generator/src/pipeline/run-import.ts`:
```ts
import { compileToBuffer, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type ImportStatus, type UnitOfCompetency } from "@leaplearn/shared";
import { parseUnit } from "../competency/parse-unit.js";
import { extractConceptMap, type ChunkConcept } from "../concepts/index.js";
import type { SourceDocument } from "../ingest/source-document.js";
import { budgetSnapshot, DEFAULT_BUDGET_LIMITS, type BudgetLimits } from "../llm/budget.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure, RunStopped } from "../llm/runner.js";
import { planActivities, DEFAULT_PLAN_RULES, type ActivityPlan, type PlannedType, type PlanRules } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";
import type { ActivityRecord, ImportRecord, ImportStore, RevisionRecord } from "../store/types.js";
import { DEFAULT_CHUNK_TOKENS, IncompatibleResumeError, runFingerprint } from "./fingerprint.js";
import { attemptsByKey, budgetFromLedger, reconcile, runLanes, runOperation, type OperationContext } from "./operations.js";

export interface RunImportInput {
  importId: string; name: string; source: SourceDocument; unitText: string | null; selectedTypes: readonly PlannedType[];
  budget: { usdMicro: number } & Partial<BudgetLimits>; promptConfig: PromptConfig; language: string; customisation: string | null; orgId?: string;
}
export type ProgressEvent = { kind: "status"; status: ImportStatus } | { kind: "activity"; activityId: string; status: ActivityRecord["status"]; error?: string } | { kind: "attempt"; purpose: string; status: string; costUsdMicro: number | null };
export interface RunImportDeps {
  store: ImportStore; provider: ModelProvider; registry: LibraryRegistry; engineFingerprint: string;
  concurrency?: number; chunkTokens?: number; rules?: PlanRules; clock?: () => Date; sleep?: (ms: number) => Promise<void>; onProgress?: (event: ProgressEvent) => void;
}

export const SKIPPED_PREFIX = "skipped: ";
const RETRIABLE_PREFIXES = [SKIPPED_PREFIX, "budget: ", "system: "];

/** Activities never attempted (skipped by a stop) or stopped by budget or infrastructure are re-dispatched on resume; content failures stay failed until a person asks for regeneration (spec §5). */
export function isPending(activity: ActivityRecord): boolean {
  if (activity.status === "promoted") return false;
  if (activity.status === "failed") return RETRIABLE_PREFIXES.some((p) => activity.error?.startsWith(p));
  return true;
}

function existingTexts(revisions: RevisionRecord[]): { questions: string[]; passages: string[]; fronts: string[] } {
  const out = { questions: [] as string[], passages: [] as string[], fronts: [] as string[] };
  for (const r of revisions) {
    const s = r.spec;
    if (s.type === "multiChoice") out.questions.push(s.question.replace(/<[^>]+>/g, ""));
    if (s.type === "blanks") out.passages.push(s.passage);
    if (s.type === "flashcards") out.fronts.push(...s.cards.map((c) => c.front));
  }
  return out;
}

/** Duplicates removed, first occurrence kept: the plan, the lanes and the fingerprint all see one entry per type. */
export function canonicalTypes(types: readonly PlannedType[]): PlannedType[] {
  return [...new Set(types)];
}

export async function runImport(rawInput: RunImportInput, deps: RunImportDeps): Promise<ImportRecord> {
  const input: RunImportInput = { ...rawInput, selectedTypes: canonicalTypes(rawInput.selectedTypes) };
  const chunkTokens = deps.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const rules = deps.rules ?? DEFAULT_PLAN_RULES;
  const fingerprint = runFingerprint({ sourceTextHash: input.source.textHash, unitText: input.unitText, selectedTypes: input.selectedTypes, language: input.language, promptConfig: input.promptConfig, customisation: input.customisation, chunkTokens, rules });
  const lock = await deps.store.lock(input.importId);
  try {
    const existing = await deps.store.getImport(input.importId); // read under the lock: a pre-lock read could be stale
    if (existing && existing.fingerprint !== fingerprint) throw new IncompatibleResumeError(input.importId, existing.fingerprint, fingerprint);
    return await runLocked(input, deps, existing, fingerprint, chunkTokens, rules);
  } finally {
    await lock.release();
  }
}

async function runLocked(input: RunImportInput, deps: RunImportDeps, existing: ImportRecord | null, fingerprint: string, chunkTokens: number, rules: PlanRules): Promise<ImportRecord> {
  const clock = deps.clock ?? (() => new Date());
  const store = deps.store;
  const now = () => clock().toISOString();
  const emit = deps.onProgress ?? (() => undefined);
  const limits: BudgetLimits = { ...DEFAULT_BUDGET_LIMITS, ...input.budget };

  let record: ImportRecord = existing
    ? { ...existing, budget: limits, updatedAt: now() }
    : { importId: input.importId, orgId: input.orgId ?? "local", name: input.name, sourceType: input.source.kind, status: "queued", customisation: input.customisation, language: input.language, unitTextHash: null, selectedTypes: [...input.selectedTypes], fingerprint, budget: limits, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, error: null, idempotencyKey: input.importId, createdAt: now(), updatedAt: now() };
  await store.putImport(record);
  if (record.status === "ready") return record;
  if (record.status === "ready_with_failures" && !(await store.listActivities(input.importId)).some(isPending)) return record;
  const setStatus = async (status: ImportStatus, error: string | null = record.error): Promise<void> => { record = { ...record, status, error, updatedAt: now() }; await store.putImport(record); emit({ kind: "status", status }); };

  await reconcile(store, input.importId, clock);
  const events = await store.listAttempts(input.importId);
  const budget = budgetFromLedger(limits, events, clock().getTime(), record.budgetUsed.elapsedMs);
  const halt: { stop: { kind: "budget" | "system"; reason: string } | null; error: unknown } = { stop: null, error: undefined };
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId: input.importId, clock, attemptsByKey: attemptsByKey(events), onAttempt: (a) => emit({ kind: "attempt", ...a }), stop: () => halt.stop?.reason ?? null };
  if (deps.sleep) ctx.sleep = deps.sleep;
  const persistBudget = async (): Promise<void> => { record = { ...record, budgetUsed: budgetSnapshot(budget, clock().getTime()), updatedAt: now() }; await store.putImport(record); };

  try {
    await setStatus("ingesting");
    if (!(await store.getArtifact(input.importId, "source"))) await store.putArtifact(input.importId, "source", input.source);

    let unit: UnitOfCompetency | null = null;
    if (input.unitText !== null) {
      const unitText = input.unitText;
      const r = await runOperation<UnitOfCompetency>(ctx, {
        purpose: "parseUnit", activityId: null, key: `${input.importId}:parseUnit`,
        load: () => store.getArtifact<UnitOfCompetency>(input.importId, "unit"),
        work: (runner) => parseUnit(unitText, runner),
        persist: (u) => store.putArtifact(input.importId, "unit", u)
      });
      unit = r.result;
      if (record.unitTextHash !== unit.textHash) { record = { ...record, unitTextHash: unit.textHash, updatedAt: now() }; await store.putImport(record); }
    }

    await setStatus("extracting");
    const chunkCache = { get: (i: number) => store.getArtifact<ChunkConcept[]>(input.importId, `chunk-${i}`), put: (i: number, c: ChunkConcept[]) => store.putArtifact(input.importId, `chunk-${i}`, c) };
    const concepts = await runOperation<ConceptMap>(ctx, {
      purpose: "extract", activityId: null, key: `${input.importId}:concepts`,
      load: () => store.getArtifact<ConceptMap>(input.importId, "conceptMap"),
      work: (runner) => extractConceptMap(input.source, unit, runner, { chunkTokens, promptConfig: input.promptConfig, chunkCache }),
      persist: (m) => store.putArtifact(input.importId, "conceptMap", m)
    });
    const map = concepts.result;

    await setStatus("planning");
    const planned = await runOperation<ActivityPlan[]>(ctx, {
      purpose: "plan", activityId: null, key: `${input.importId}:plan`,
      load: () => store.getArtifact<ActivityPlan[]>(input.importId, "plan"),
      work: (runner) => planActivities(map, [...input.selectedTypes], runner, rules),
      persist: (p) => store.putArtifact(input.importId, "plan", p)
    });
    const plan = planned.result;
    const known = new Set((await store.listActivities(input.importId)).map((a) => a.activityId));
    for (const [i, p] of plan.entries()) {
      if (known.has(p.activityId)) continue;
      await store.putActivity({ activityId: p.activityId, importId: input.importId, type: p.type, order: i, status: "planned", currentRevision: null, conceptIds: p.conceptIds, criteriaIds: p.criteriaIds, error: null, dropped: false });
    }

    await setStatus("generating");
    const producers = createProducers();
    const pending = (await store.listActivities(input.importId)).filter(isPending);
    const lanes = input.selectedTypes.map((type) => pending.filter((a) => a.type === type)).filter((lane) => lane.length > 0);

    const promotedOfType = async (type: PlannedType): Promise<RevisionRecord[]> => {
      const same = (await store.listActivities(input.importId)).filter((a) => a.type === type && a.currentRevision !== null);
      const revisions = await Promise.all(same.map((a) => store.getRevision(a.activityId, a.currentRevision!)));
      return revisions.filter((r): r is RevisionRecord => r !== null && r.state === "promoted");
    };

    const generateActivity = async (initial: ActivityRecord): Promise<void> => {
      let activity = initial;
      const setActivity = async (patch: Partial<ActivityRecord>): Promise<void> => { activity = { ...activity, ...patch }; await store.putActivity(activity); emit({ kind: "activity", activityId: activity.activityId, status: activity.status, ...(activity.error ? { error: activity.error } : {}) }); };
      const entry = plan.find((p) => p.activityId === activity.activityId);
      if (!entry) throw new Error(`activity ${activity.activityId} is not in the stored plan`);
      const revisions = await store.listRevisions(activity.activityId);
      const promotedRevision = revisions.find((r) => r.state === "promoted");
      if (promotedRevision) {
        await setActivity({ status: "promoted", currentRevision: promotedRevision.revision, error: null }); // promotion finished before the activity record was written
        return;
      }
      const saved = revisions.find((r) => r.state === "candidate");
      const revision = saved ? saved.revision : revisions.length + 1;
      if (!saved) await setActivity({ status: "generating", error: null });
      const produced = await runOperation<RevisionRecord>(ctx, {
        purpose: "produce", activityId: activity.activityId, key: `${input.importId}:produce:${activity.activityId}:r${revision}`,
        load: () => store.getRevision(activity.activityId, revision),
        work: async (runner) => {
          const producer = producers.get(entry.type);
          if (!producer) throw new Error(`no producer for ${entry.type}`);
          const priorTexts = existingTexts(await promotedOfType(activity.type));
          const result = await producer.produce({ plan: entry, map, unit, promptConfig: input.promptConfig, language: input.language, existing: priorTexts, rules }, runner, { registry: deps.registry });
          assertGeneratedProvenance(result.spec);
          return { activityId: activity.activityId, revision, state: "candidate", spec: result.spec, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, modelConfig: { provider: deps.provider.name, models: { ...MODEL_ROLES }, profiles: { ...REQUEST_PROFILES } }, engineFingerprint: deps.engineFingerprint, note: null, buildKey: null, attemptIds: result.attemptIds, createdAt: now() };
        },
        persist: (rev) => store.putRevision(rev)
      });
      const candidate = produced.result;
      if (!produced.reused) await setActivity({ status: "generated" });
      const bytes = await compileToBuffer(candidate.spec, new Map(), { registry: deps.registry, revision: candidate.revision });
      const buildKey = await store.putBuild(input.importId, activity.activityId, candidate.revision, bytes);
      await setActivity({ status: "built" });
      for (const prev of await store.listRevisions(activity.activityId)) if (prev.state === "promoted" && prev.revision !== candidate.revision) await store.putRevision({ ...prev, state: "superseded" });
      await store.putRevision({ ...candidate, state: "promoted", buildKey });
      await setActivity({ status: "promoted", currentRevision: candidate.revision, error: null });
    };

    // A lane worker never throws: every outcome, including a storage failure while recording one, is folded into `halt`,
    // so runLanes waits for every lane to settle before the import is finalised and the lock released.
    await runLanes(lanes, deps.concurrency ?? 3, async (activity) => {
      const mark = async (error: string): Promise<void> => { await store.putActivity({ ...activity, status: "failed", error }); emit({ kind: "activity", activityId: activity.activityId, status: "failed", error }); };
      try {
        if (halt.stop) { await mark(`${SKIPPED_PREFIX}${halt.stop.reason}`); return; }
        try {
          await generateActivity(activity);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof ContentFailure) await mark(`content: ${message}`);
          else if (err instanceof BudgetRefused) { halt.stop = { kind: "budget", reason: message }; await mark(message); }
          else if (err instanceof RunStopped) await mark(`${SKIPPED_PREFIX}${message}`);
          else { halt.stop = { kind: "system", reason: `system: ${message}` }; halt.error = err; await mark(`system: ${message}`); }
        }
        await persistBudget();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        halt.stop ??= { kind: "system", reason: `system: ${message}` };
        halt.error ??= err;
      }
    });

    const finalActivities = await store.listActivities(input.importId);
    const promotedCount = finalActivities.filter((a) => a.status === "promoted").length;
    const failedCount = finalActivities.filter((a) => a.status === "failed").length;
    await persistBudget();
    if (halt.error !== undefined) { await setStatus("failed", halt.stop?.reason ?? `system: ${halt.error instanceof Error ? halt.error.message : String(halt.error)}`); throw halt.error; }
    if (promotedCount === 0) await setStatus("failed", halt.stop ? halt.stop.reason : "no activity was promoted");
    else if (failedCount > 0) await setStatus("ready_with_failures", null);
    else await setStatus("ready", null);
    return record;
  } catch (err) {
    if (record.status === "failed" && stopMarked(record)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    await persistBudget();
    if (err instanceof BudgetRefused) { await setStatus("failed", message); return record; }
    if (err instanceof ContentFailure) { await setStatus("failed", `content: ${message}`); return record; }
    await setStatus("failed", `system: ${message}`);
    throw err;
  }
}

function stopMarked(record: ImportRecord): boolean {
  return record.error !== null && record.error.startsWith("system: ");
}
```
`BudgetRefused.message` already begins with `budget: ` (Task 4's reasons), so budget failures read `budget: …` on both the activity and the import. A `ContentFailure` from `parseUnit`, `extractConceptMap` or `planActivities` ends the import (`failed`, `content: …`) because nothing downstream can run; a `ContentFailure` inside a producer fails only that activity.

`packages/generator/src/pipeline/index.ts`: `export * from "./fingerprint.js"; export * from "./operations.js"; export * from "./run-import.js";` and add `export * from "./store/types.js"; export * from "./store/memory-store.js"; export * from "./pipeline/index.js";` to `src/index.ts`.

Notes on the tests: in the stop test the multiChoice lane is sleeping out its backoff when the blanks lane's permanent failure sets the stop; the runner consults the stop before the retry dispatch and throws `RunStopped`, so the provider sees three produce calls, not four; the flashcards lane was already in flight and settles as promoted. In the storage-failure test the failing write is the first `persistBudget` after a lane finishes; the outer catch in that lane folds the error into `halt`, the other lanes settle, the import is marked failed and the error rethrown after `runLanes` returns, and the lock is released by `runImport`'s `finally`; a resume then reuses every persisted candidate or promotion. in the budget-stop test the request limit lands exactly on the `blanks` reservation, which the runner turns into `BudgetRefused` with a `requests` reason; the flashcards lane never dispatches and is marked `skipped: budget: …`; the second run raises the limit and the two lanes re-dispatch. In the infrastructure test the permanent 401 makes `blanks` fail with `system:` and the import `failed`; on resume both `system:` and `skipped:` activities are re-dispatched. The reconciliation test drives the restart path: the interrupted operation becomes failed/billing-uncertain, its reservation counts as spent, and the run then fails on the empty provider script (which the test swallows) — its assertions are about the reconciliation, not the rerun.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): resumable import pipeline with persisted operation results, run fingerprints taken under the store lock, per-type lanes, a shared stop checked before every dispatch, and a per-import elapsed deadline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: `FileStore`, `leap generate`, the mapping table and the cost report

Answers review findings 5 (an ownership-safe directory lock; a crash-truncated JSONL tail repaired before the next append), 3 (the four budget limits reach the command line, described as what they are) and 9 (retry share counts attempts with `retryIndex > 0`, never a stage's first call), and adds the real interruption test the review asked for: a child process is SIGKILLed mid-dispatch over a `FileStore`, and the next run reclaims the lock, reconciles and resumes. The mapping table and cost report are review-aware from the start so Task 16's `leap review` only adds records.

**Files:**
- Create: `apps/cli/src/lock.ts`, `apps/cli/src/file-store.ts`, `apps/cli/src/report.ts`, `apps/cli/src/generate.ts`; modify `apps/cli/src/index.ts`, `apps/cli/package.json`
- Test: `apps/cli/test/lock.test.ts`, `apps/cli/test/file-store.test.ts`, `apps/cli/test/interrupt.test.ts`, `apps/cli/test/report.test.ts`

**Interfaces:**
- `acquireDirectoryLock(dir, importId, options?: { staleMs?: 10_000; updateMs?: 2_500 }): Promise<StoreLock>` in `lock.ts`: the lock is the directory `dir/lock/`, created with an atomic `mkdir`; it holds `owner.json` `{ importId, token, pid, hostname, startedAt }`; the holder refreshes the directory's mtime every `updateMs`. A lock is stale when its mtime is older than `staleMs` or its owner pid is dead on this host. A stale lock is reclaimed by **renaming it away first** (atomic; only one reclaimer can succeed, and a fresh lock is never the thing renamed), removing the renamed directory, then creating a new lock; a live lock raises `StoreLockedError` naming the holder. `release()` removes the directory only while `owner.json` still carries this holder's token, by the same rename-then-remove path, so a holder that was reclaimed from never deletes someone else's lock.
- `FileStore(dir, options?: { lock?: LockOptions }) implements ImportStore`: layout under `dir/` — `lock/`, `import.json`, `artifacts/<name>.json`, `activities/<activityId>.json`, `revisions/<activityId>/r<N>.json`, `operations.jsonl`, `attempts.jsonl`, `acceptances.jsonl`, `alignment-reviews.jsonl` (all JSONL append-only; for `operations`, `acceptances` and `alignment-reviews` the latest line per key wins), `builds/<activityId>-r<N>.h5p`; every JSON write goes to `<file>.tmp-<random>` then `rename`; JSONL appends are one JSON object per line. `readJsonl` ignores a final line that has no trailing newline and does not parse (a crash-truncated tail, reported as `truncatedTail: true`) and throws `StoreCorruptError(path, line)` for any other malformed line. Before the first append to a ledger in a process, `FileStore` **repairs the tail** under the lock: a final complete record that only lacks its newline gets one, a truncated fragment is cut off (`truncate` to the byte length of the last complete line); every earlier record is preserved. Appends are only ever made while the directory lock is held (`runImport` and `leap review` both hold it).
- `writeMappingCsv(store, importId, path)` — columns `activityId,type,title,revision,itemId,criterionId,status,conceptIds,evidenceIds,firstQuote`; one row per (activity or item) × criterion in the promoted revision's provenance (`itemId` empty for the activity row; `criterionId` empty when there are none); `status` is `suggested` unless an alignment review for that exact revision, item and criterion says `confirmed` or `rejected`; a review with decision `added` produces an extra row with status `added`; RFC 4180 quoting.
- `costReport(store, importId): Promise<CostReport>` with `CostReport = { pricingVersion; totals: { attempts; costUsdMicro; costStatusCounts: Record<CostStatus, number>; reservationExceeded: number }; shared; direct; byPurpose; byType; perActivity; retryShare; accepted; costPerAcceptedActivityUsdMicro: number | null }` — `shared` = purposes other than `produce`; `direct` = `produce`; `retryShare` = starts with `retryIndex > 0` ÷ all starts; `accepted` = activities whose current revision has an `accepted` acceptance record; `costPerAcceptedActivityUsdMicro` = `totals.costUsdMicro / accepted` rounded, or `null` when nothing is accepted; `formatCostReport(report): string`.
- `leap generate --source <file> --out <dir> [--unit <file>] [--types multiChoice,blanks,flashcards] [--budget-usd 2] [--max-requests 200] [--max-tokens 2000000] [--max-seconds 1800] [--language en] [--reading-level high-school] [--tone educational] [--customisation "…"] [--name …] [--libraries <dir>] [--provider anthropic|replay|record] [--fixtures <dir>] [--concurrency 3]`; `--source` accepts `.pdf`, `.md`, `.txt`; a `--types` list with a repeated type is rejected with a message (the pipeline also canonicalises); `--budget-usd` and `--max-tokens` are described in the help text as estimated caps, `--max-requests` and `--max-seconds` (per import, across runs) as hard limits; `--provider record` wraps the Anthropic provider in `RecordingProvider(fixtures)`; `replay` uses `ReplayProvider(fixtures)` and needs no key; exit 0 when the import ends `ready`, 2 when `ready_with_failures`, 1 on `failed`, on `IncompatibleResumeError` and on `StoreLockedError` (each with a `leap: …` line on stderr); prints the activity table, the mapping path, and the cost report; `importId` defaults to a slug of the output directory name so reruns resume.

- [ ] **Step 1: Failing tests**

`apps/cli/test/file-store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { appendFile, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, readJsonl, StoreCorruptError } from "../src/file-store.js";

const importRecord = { importId: "imp", orgId: "local", name: "n", sourceType: "markdown" as const, status: "queued" as const, customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice" as const], fingerprint: "f".repeat(64), budget: { usdMicro: 10, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" };
const start = { event: "start" as const, attemptId: "a1", operationId: "imp:plan", callKey: "plan", retryIndex: 0, retryReason: null, attempt: 1, purpose: "plan" as const, provider: "fake" as const, model: "m", credentialOwner: "server" as const, reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" };

describe("FileStore", () => {
  it("round-trips records, appends ledgers, keeps the latest review per key, and leaves no temp files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-store-"));
    const store = new FileStore(dir);
    await store.putImport(importRecord);
    expect(await store.getImport("imp")).toEqual(importRecord);
    await store.putArtifact("imp", "chunk-3", [{ tempId: "k3-0" }]);
    expect(await store.getArtifact("imp", "chunk-3")).toEqual([{ tempId: "k3-0" }]);
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await store.putOperation(op);
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    expect((await store.listOperations("imp")).map((o) => o.status)).toEqual(["succeeded"]);
    await store.recorderFor("imp").recordStart(start);
    expect((await store.listAttempts("imp")).map((e) => e.event)).toEqual(["start"]);
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "rejected", reviewer: "r", notes: null, decidedAt: "t1" });
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "r", notes: "fine", decidedAt: "t2" });
    expect((await store.listAcceptances("imp")).map((a) => a.decision)).toEqual(["accepted"]);
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC1.1", decision: "confirmed", reviewer: "r", decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: "b1", unitTextHash: null, criterionId: "PC1.1", decision: "rejected", reviewer: "r", decidedAt: "t" });
    expect((await store.listAlignmentReviews("imp")).map((r) => [r.itemId, r.decision])).toEqual([[null, "confirmed"], ["b1", "rejected"]]);
    const key = await store.putBuild("imp", "act-1", 1, Buffer.from("PK.."));
    expect((await store.getBuild(key))?.toString()).toBe("PK..");
    const files = await readdir(dir, { recursive: true });
    expect(files.some((f) => /\.tmp-/.test(f))).toBe(false);
    expect((await readFile(join(dir, "operations.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
  });
  it("tolerates a crash-truncated final line and rejects any other malformed line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-jsonl-"));
    const path = join(dir, "attempts.jsonl");
    await writeFile(path, `${JSON.stringify(start)}\n${JSON.stringify({ ...start, attemptId: "a2" })}\n{"event":"outcome","attemptId":"a2","opera`);
    const read = await readJsonl<{ attemptId: string }>(path);
    expect(read.records.map((r) => r.attemptId)).toEqual(["a1", "a2"]);
    expect(read.truncatedTail).toBe(true);
    expect((await new FileStore(dir).listAttempts("imp")).map((e) => e.attemptId)).toEqual(["a1", "a2"]);
    await writeFile(path, `${JSON.stringify(start)}\nnot json\n${JSON.stringify({ ...start, attemptId: "a3" })}\n`);
    await expect(readJsonl(path)).rejects.toMatchObject({ name: "StoreCorruptError", line: 2 });
    await expect(new FileStore(dir).listAttempts("imp")).rejects.toBeInstanceOf(StoreCorruptError);
    const clean = join(dir, "clean.jsonl");
    await appendFile(clean, `${JSON.stringify(start)}\n`);
    expect((await readJsonl(clean)).truncatedTail).toBe(false);
  });
  it("repairs a damaged tail before appending, so the next record never merges into a broken line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-repair-"));
    const path = join(dir, "attempts.jsonl");
    await writeFile(path, `${JSON.stringify(start)}\n{"event":"outcome","attemptId":"a1","opera`); // crash-truncated record
    const store = new FileStore(dir);
    await store.recorderFor("imp").recordStart({ ...start, attemptId: "a2" });
    const afterTruncated = await readJsonl<{ attemptId: string }>(path);
    expect(afterTruncated.records.map((r) => r.attemptId)).toEqual(["a1", "a2"]);
    expect(afterTruncated.truncatedTail).toBe(false);
    expect((await new FileStore(dir).listAttempts("imp")).map((e) => e.attemptId)).toEqual(["a1", "a2"]); // a fresh reopen sees a clean ledger
    const path2 = join(dir, "operations.jsonl");
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await writeFile(path2, JSON.stringify(op)); // a complete final record that lost only its newline
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    const ops = await readJsonl<{ status: string }>(path2);
    expect(ops.records.map((o) => o.status)).toEqual(["running", "succeeded"]);
    expect((await readFile(path2, "utf8")).endsWith("\n")).toBe(true);
    await writeFile(path2, `${JSON.stringify(op)}\nnot json\n`);
    await expect(store.putOperation(op)).rejects.toBeInstanceOf(StoreCorruptError); // corruption elsewhere is still refused
  });
});
```

`apps/cli/test/lock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { StoreLockedError } from "@leaplearn/generator";
import { acquireDirectoryLock } from "../src/lock.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function staleLock(dir: string): Promise<void> {
  await mkdir(join(dir, "lock"), { recursive: true });
  await writeFile(join(dir, "lock", "owner.json"), JSON.stringify({ importId: "imp", token: "old", pid: 2 ** 22 - 1, hostname: hostname(), startedAt: "t" }));
  const old = new Date(Date.now() - 60_000);
  await utimes(join(dir, "lock"), old, old);
}

describe("directory lock", () => {
  it("grants one lock, refuses a second holder while it is fresh, and reacquires after release", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-lock-"));
    const lock = await acquireDirectoryLock(dir, "imp");
    await expect(acquireDirectoryLock(dir, "imp")).rejects.toMatchObject({ name: "StoreLockedError", message: expect.stringMatching(new RegExp(`pid ${process.pid}`)) });
    await lock.release();
    expect(await stat(join(dir, "lock")).catch(() => null)).toBeNull();
    const again = await acquireDirectoryLock(dir, "imp");
    await again.release();
  });
  it("exactly one of two concurrent reclaimers wins a stale lock; the loser can lock once the winner releases", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-reclaim-"));
    await staleLock(dir);
    const results = await Promise.allSettled([acquireDirectoryLock(dir, "imp"), acquireDirectoryLock(dir, "imp")]);
    const winners = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireDirectoryLock>>> => r.status === "fulfilled");
    const losers = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]!.reason).toBeInstanceOf(StoreLockedError);
    expect((await stat(join(dir, "lock"))).isDirectory()).toBe(true); // the winner's live lock was not deleted by the loser
    await winners[0]!.value.release();
    const later = await acquireDirectoryLock(dir, "imp");
    await later.release();
  });
  it("release never removes a lock that was reclaimed from the releasing holder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-owner-"));
    const first = await acquireDirectoryLock(dir, "imp", { staleMs: 100, updateMs: 10_000 }); // never refreshes in time
    await sleep(150);
    const second = await acquireDirectoryLock(dir, "imp", { staleMs: 100, updateMs: 10_000 }); // reclaims the stale lock
    await first.release(); // not ours any more: must be a no-op
    expect((await stat(join(dir, "lock"))).isDirectory()).toBe(true);
    await second.release();
    expect(await stat(join(dir, "lock")).catch(() => null)).toBeNull();
  });
  it("a holder's heartbeat keeps its lock fresh", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-heartbeat-"));
    const lock = await acquireDirectoryLock(dir, "imp", { staleMs: 300, updateMs: 50 });
    await sleep(450);
    await expect(acquireDirectoryLock(dir, "imp", { staleMs: 300, updateMs: 50 })).rejects.toBeInstanceOf(StoreLockedError);
    await lock.release();
  });
});
```

`apps/cli/test/interrupt.test.ts` (a real process is killed; this needs the built `dist` of the engine, the generator and the CLI):
```ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { ingestText, runImport, DEFAULT_PROMPT_CONFIG, type AttemptStart, type ModelProvider } from "@leaplearn/generator";
import { FileStore, readJsonl } from "../src/file-store.js";

const root = resolve(import.meta.dirname, "../../..");
const engineDist = resolve(root, "packages/engine/dist/index.js");
const generatorDist = resolve(root, "packages/generator/dist/index.js");
const fileStoreDist = resolve(root, "apps/cli/dist/file-store.js");
const lockPath = resolve(root, "libraries/libraries.lock.json");
const cacheDir = resolve(root, "libraries/cache");
const SOURCE = "Lock it out before work starts. Test for dead at the point of work. Restore supply only after guards are refitted.";
const UNIT = "SYNELE001 Isolate and test electrical equipment";
const importInput = (source: Awaited<ReturnType<typeof ingestText>>) => ({ importId: "child", name: "child", source, unitText: UNIT, selectedTypes: ["multiChoice"] as const, budget: { usdMicro: 1_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null });

const childScript = `
import { createRegistry } from ${JSON.stringify(engineDist)};
import { ingestText, runImport, DEFAULT_PROMPT_CONFIG } from ${JSON.stringify(generatorDist)};
import { FileStore } from ${JSON.stringify(fileStoreDist)};
const registry = await createRegistry({ lockPath: ${JSON.stringify(lockPath)}, cacheDir: ${JSON.stringify(cacheDir)} });
const provider = { name: "fake", async complete() { process.stdout.write("dispatched\\n"); await new Promise((r) => setTimeout(r, 60_000)); throw new Error("unreachable"); } };
const source = await ingestText(${JSON.stringify(SOURCE)}, { sourceId: "src-child" });
await runImport({ importId: "child", name: "child", source, unitText: ${JSON.stringify(UNIT)}, selectedTypes: ["multiChoice"], budget: { usdMicro: 1_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null }, { store: new FileStore(process.env.LEAP_TEST_DIR), provider, registry, engineFingerprint: "child" });
`;

describe("abrupt termination", () => {
  it("a SIGKILLed run leaves a start without an outcome and a held lock; the next run reclaims the lock, reconciles, and numbers the resumed attempt", async () => {
    for (const p of [engineDist, generatorDist, fileStoreDist]) expect(existsSync(p), `${p} must be built before this test`).toBe(true);
    const dir = await mkdtemp(join(tmpdir(), "leap-kill-"));
    const child = spawn(process.execPath, ["--input-type=module", "-e", childScript], { env: { ...process.env, LEAP_TEST_DIR: dir }, stdio: ["ignore", "pipe", "inherit"] });
    await new Promise<void>((dispatched, reject) => {
      child.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("dispatched")) dispatched(); });
      child.on("exit", (code) => reject(new Error(`child exited before dispatching (code ${code})`)));
    });
    child.kill("SIGKILL");
    await new Promise<void>((exited) => child.on("exit", () => exited()));
    expect((await stat(join(dir, "lock"))).isDirectory()).toBe(true); // no finally ran
    expect((await readJsonl<AttemptStart>(join(dir, "attempts.jsonl"))).records.map((e) => e.event)).toEqual(["start"]);

    const registry = await createRegistry({ lockPath, cacheDir });
    const empty: ModelProvider = { name: "fake", async complete() { throw new Error("no scripted response"); } };
    const store = new FileStore(dir);
    const source = await ingestText(SOURCE, { sourceId: "src-child" });
    await runImport(importInput(source), { store, provider: empty, registry, engineFingerprint: "child" }).catch(() => undefined);
    expect((await store.listOperations("child")).find((o) => o.operationId === "child:parseUnit")).toMatchObject({ status: "failed", billingUncertain: true });
    const starts = (await store.listAttempts("child")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "parseUnit");
    expect(starts.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "resume"]]);
    expect(existsSync(join(dir, "lock"))).toBe(false); // the second run reclaimed the dead holder's lock and released it
  }, 30_000);
});
```

`apps/cli/test/report.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MemoryStore, type AttemptStart } from "@leaplearn/generator";
import { costReport, formatCostReport, mappingRows } from "../src/report.js";

describe("reports", () => {
  it("splits shared and direct cost, counts retries by retryIndex, computes cost per accepted activity, and lists mapping rows with review-aware status", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    const start = (id: string, op: string, purpose: AttemptStart["purpose"], callKey: string, retryIndex: number) => rec.recordStart({ event: "start", attemptId: id, operationId: op, callKey, retryIndex, retryReason: retryIndex > 0 ? "content" : null, attempt: retryIndex + 1, purpose, provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    const outcome = (id: string, op: string, cost: number | null, exceeded = false) => rec.recordOutcome({ event: "outcome", attemptId: id, operationId: op, providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: cost, costStatus: cost === null ? "unavailable" : "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: exceeded, overshootUsdMicro: exceeded ? 40 : cost === null ? null : 0, completedAt: "t" });
    const op = (operationId: string, activityId: string | null, purpose: AttemptStart["purpose"]) => store.putOperation({ operationId, importId: "imp", activityId, purpose, status: "succeeded", idempotencyKey: operationId, contentAttempts: 1, outcome: "ok", billingUncertain: false, startedAt: "t", completedAt: "t" });
    await op("imp:concepts", null, "extract"); await op("imp:produce:act-1:r1", "act-1", "produce");
    // two chunks, a merge and an alignment share one operation; all are first attempts of their own call keys, so none is a retry
    await start("a1", "imp:concepts", "extract", "extract:chunk-0", 0); await outcome("a1", "imp:concepts", 100);
    await start("a2", "imp:concepts", "extract", "extract:chunk-1", 0); await outcome("a2", "imp:concepts", 100);
    await start("a3", "imp:concepts", "merge", "merge", 0); await outcome("a3", "imp:concepts", 50);
    await start("a4", "imp:concepts", "align", "align", 0); await outcome("a4", "imp:concepts", 50);
    await start("a5", "imp:produce:act-1:r1", "produce", "produce:act-1", 0); await outcome("a5", "imp:produce:act-1:r1", 500, true);
    await start("a6", "imp:produce:act-1:r1", "produce", "produce:act-1", 1); await outcome("a6", "imp:produce:act-1:r1", null);
    await store.putActivity({ activityId: "act-1", importId: "imp", type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC1.1", "PC1.2"], error: null, dropped: false });
    await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "T", type: "multiChoice", language: "en", schemaVersion: 1, question: "<p>q</p>", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC1.1", "PC1.2"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: ["a5", "a6"], createdAt: "t" });
    await store.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "n", summary: "s", evidence: [{ evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 3, quote: "Hi." }] }] });

    const before = await costReport(store, "imp");
    expect(before.totals).toEqual({ attempts: 6, costUsdMicro: 800, costStatusCounts: { known: 5, estimated: 0, unavailable: 1 }, reservationExceeded: 1, overshootUsdMicro: 40 });
    expect(before.shared).toBe(300); expect(before.direct).toBe(500);
    expect(before.retryShare).toBeCloseTo(1 / 6);
    expect(before.perActivity).toEqual([{ activityId: "act-1", type: "multiChoice", status: "promoted", attempts: 2, costUsdMicro: 500 }]);
    expect(before.accepted).toBe(0); expect(before.costPerAcceptedActivityUsdMicro).toBeNull();
    expect(formatCostReport(before)).toContain("| produce |");
    expect((await mappingRows(store, "imp")).map((r) => [r.activityId, r.criterionId, r.status, r.firstQuote])).toEqual([["act-1", "PC1.1", "suggested", "Hi."], ["act-1", "PC1.2", "suggested", "Hi."]]);

    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 1, decision: "accepted", reviewer: "owner", notes: null, decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC1.2", decision: "rejected", reviewer: "owner", decidedAt: "t" });
    await store.putAlignmentReview({ importId: "imp", activityId: "act-1", revision: 1, itemId: null, unitTextHash: null, criterionId: "PC2.1", decision: "added", reviewer: "owner", decidedAt: "t" });
    const after = await costReport(store, "imp");
    expect(after.accepted).toBe(1); expect(after.costPerAcceptedActivityUsdMicro).toBe(800);
    expect((await mappingRows(store, "imp")).map((r) => [r.criterionId, r.status])).toEqual([["PC1.1", "suggested"], ["PC1.2", "rejected"], ["PC2.1", "added"]]);
    await store.putAcceptance({ importId: "imp", activityId: "act-1", revision: 2, decision: "accepted", reviewer: "owner", notes: null, decidedAt: "t" }); // a decision on another revision does not count
    expect((await costReport(store, "imp")).accepted).toBe(1);
  });
  it("reports a zero retry share when every call is a first attempt", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    for (const [id, key] of [["a1", "extract:chunk-0"], ["a2", "extract:chunk-1"], ["a3", "merge"], ["a4", "align"]] as const) {
      await rec.recordStart({ event: "start", attemptId: id, operationId: "imp:concepts", callKey: key, retryIndex: 0, retryReason: null, attempt: 1, purpose: "extract", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    }
    expect((await costReport(store, "imp")).retryShare).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see them fail**, then implement.

`apps/cli/src/lock.ts`:
```ts
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { StoreLockedError, type StoreLock } from "@leaplearn/generator";

export interface LockOptions { staleMs?: number; updateMs?: number; }
export const DEFAULT_LOCK_OPTIONS = { staleMs: 10_000, updateMs: 2_500 };
interface LockOwner { importId: string; token: string; pid: number; hostname: string; startedAt: string; }

const isCode = (err: unknown, code: string): boolean => (err as { code?: string }).code === code;
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (err) { return isCode(err, "EPERM"); } }
async function readOwner(path: string): Promise<LockOwner | null> { try { return JSON.parse(await readFile(path, "utf8")) as LockOwner; } catch { return null; } }
async function discard(lockDir: string, tag: string): Promise<boolean> {
  const tombstone = `${lockDir}.${tag}-${randomBytes(4).toString("hex")}`;
  try { await rename(lockDir, tombstone); } catch (err) { if (isCode(err, "ENOENT")) return false; throw err; }
  await rm(tombstone, { recursive: true, force: true });
  return true;
}

/**
 * Directory lock. `mkdir` is atomic, so only one process ever creates `lock/`. The holder refreshes the
 * directory's mtime every updateMs. A lock is stale when its mtime is older than staleMs or its owner pid
 * is dead on this host. A stale lock is reclaimed by renaming it away first (atomic: exactly one reclaimer
 * can succeed, and a lock created after the staleness check has a different inode and mtime and is never
 * the one renamed), then removed, then a fresh lock is created. Release removes the directory only while
 * owner.json still carries this holder's token, by the same rename-then-remove path.
 */
export async function acquireDirectoryLock(dir: string, importId: string, options: LockOptions = {}): Promise<StoreLock> {
  const staleMs = options.staleMs ?? DEFAULT_LOCK_OPTIONS.staleMs;
  const updateMs = options.updateMs ?? DEFAULT_LOCK_OPTIONS.updateMs;
  const lockDir = join(dir, "lock");
  const ownerPath = join(lockDir, "owner.json");
  const me: LockOwner = { importId, token: randomBytes(8).toString("hex"), pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
  await mkdir(dir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await mkdir(lockDir);
    } catch (err) {
      if (!isCode(err, "EEXIST")) throw err;
      const info = await stat(lockDir).catch(() => null);
      if (!info) continue; // released or reclaimed between our mkdir and stat
      const owner = await readOwner(ownerPath);
      const stale = Date.now() - info.mtimeMs > staleMs || (owner !== null && owner.hostname === me.hostname && !pidAlive(owner.pid));
      if (!stale) throw new StoreLockedError(importId, owner ? `pid ${owner.pid} on ${owner.hostname} since ${owner.startedAt}` : "a lock without an owner record");
      await discard(lockDir, "stale"); // false means another reclaimer renamed it first; either way, try mkdir again
      continue;
    }
    await writeFile(ownerPath, JSON.stringify(me, null, 2) + "\n");
    const heartbeat = setInterval(() => { const now = new Date(); utimes(lockDir, now, now).catch(() => undefined); }, updateMs);
    heartbeat.unref();
    return {
      release: async () => {
        clearInterval(heartbeat);
        const current = await readOwner(ownerPath);
        if (current?.token !== me.token) return; // reclaimed from us: not ours to remove
        await discard(lockDir, "released");
      }
    };
  }
  throw new StoreLockedError(importId, "a lock that other processes kept reclaiming");
}
```
Between `mkdir` and `writeFile(owner.json)` the directory is fresh, so no other process treats it as stale; the heartbeat keeps a live holder fresh even during a long provider call. A lock that a dead process left behind is reclaimed at once on the same host (dead pid) and after `staleMs` from another host.

`apps/cli/src/file-store.ts`:
```ts
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, truncate, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AcceptanceRecord, ActivityRecord, AlignmentReviewRecord, ArtifactName, AttemptEvent, AttemptRecorder, ImportRecord, ImportStore, OperationRecord, RevisionRecord, StoreLock } from "@leaplearn/generator";
import { acquireDirectoryLock, type LockOptions } from "./lock.js";

export class StoreCorruptError extends Error {
  constructor(public readonly path: string, public readonly line: number, cause: string) { super(`${path}:${line} is not a JSON record (${cause}); the store is corrupt`); this.name = "StoreCorruptError"; }
}

const isEnoent = (err: unknown): boolean => (err as { code?: string }).code === "ENOENT";

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, path);
}
async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (err) { if (isEnoent(err)) return null; throw err; }
}

/** Reads a JSONL ledger. A final line without a trailing newline that does not parse is a crash-truncated tail and is ignored; any other malformed line means corruption. */
export async function readJsonl<T>(path: string): Promise<{ records: T[]; truncatedTail: boolean }> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch (err) { if (isEnoent(err)) return { records: [], truncatedTail: false }; throw err; }
  const lines = text.split("\n");
  const endedCleanly = text.endsWith("\n") || text.length === 0;
  const records: T[] = [];
  let truncatedTail = false;
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    try { records.push(JSON.parse(line) as T); } catch (err) {
      if (index === lines.length - 1 && !endedCleanly) { truncatedTail = true; return; }
      throw new StoreCorruptError(path, index + 1, err instanceof Error ? err.message : String(err));
    }
  });
  return { records, truncatedTail };
}

/** Directory-backed ImportStore: JSON files written atomically, JSONL ledgers repaired then appended, one directory lock. Ledger appends assume the caller holds the lock. */
export class FileStore implements ImportStore {
  private readonly repaired = new Set<string>();
  constructor(private readonly dir: string, private readonly options: { lock?: LockOptions } = {}) {}
  private p(...parts: string[]): string { return join(this.dir, ...parts); }

  lock(importId: string): Promise<StoreLock> { return acquireDirectoryLock(this.dir, importId, this.options.lock ?? {}); }

  /** Once per ledger per process: a complete final record that lost its newline gets one; a truncated fragment is cut off. Earlier records are untouched; corruption elsewhere still throws on read. */
  private async repairTail(path: string): Promise<void> {
    if (this.repaired.has(path)) return;
    this.repaired.add(path);
    let text: string;
    try { text = await readFile(path, "utf8"); } catch (err) { if (isEnoent(err)) return; throw err; }
    if (text.length === 0 || text.endsWith("\n")) return;
    const cut = text.lastIndexOf("\n") + 1;
    try { JSON.parse(text.slice(cut)); await appendFile(path, "\n"); }
    catch { await truncate(path, Buffer.byteLength(text.slice(0, cut))); }
  }
  getImport(importId: string) { return readJson<ImportRecord>(this.p("import.json")).then((r) => (r && r.importId === importId ? r : null)); }
  putImport(record: ImportRecord) { return writeJsonAtomic(this.p("import.json"), record); }
  getArtifact<T>(_importId: string, name: ArtifactName) { return readJson<T>(this.p("artifacts", `${name}.json`)); }
  putArtifact(_importId: string, name: ArtifactName, value: unknown) { return writeJsonAtomic(this.p("artifacts", `${name}.json`), value); }
  async listActivities(importId: string) {
    const dir = this.p("activities");
    const names = await readdir(dir).catch(() => [] as string[]);
    const all = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => readJson<ActivityRecord>(join(dir, n))));
    return all.filter((a): a is ActivityRecord => a !== null && a.importId === importId).sort((a, b) => a.order - b.order);
  }
  putActivity(record: ActivityRecord) { return writeJsonAtomic(this.p("activities", `${record.activityId}.json`), record); }
  getRevision(activityId: string, revision: number) { return readJson<RevisionRecord>(this.p("revisions", activityId, `r${revision}.json`)); }
  async listRevisions(activityId: string) {
    const dir = this.p("revisions", activityId);
    const names = await readdir(dir).catch(() => [] as string[]);
    const all = await Promise.all(names.filter((n) => /^r\d+\.json$/.test(n)).map((n) => readJson<RevisionRecord>(join(dir, n))));
    return all.filter((r): r is RevisionRecord => r !== null).sort((a, b) => a.revision - b.revision);
  }
  putRevision(record: RevisionRecord) { return writeJsonAtomic(this.p("revisions", record.activityId, `r${record.revision}.json`), record); }
  private async append(file: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = this.p(file);
    await this.repairTail(path);
    await readJsonl(path); // a malformed line elsewhere is corruption: refuse to append to it
    await appendFile(path, JSON.stringify(value) + "\n");
  }
  async listOperations(importId: string) {
    const latest = new Map<string, OperationRecord>();
    for (const o of (await readJsonl<OperationRecord>(this.p("operations.jsonl"))).records) if (o.importId === importId) latest.set(o.operationId, o);
    return [...latest.values()];
  }
  putOperation(record: OperationRecord) { return this.append("operations.jsonl", record); }
  recorderFor(_importId: string): AttemptRecorder {
    const append = (e: AttemptEvent): Promise<void> => this.append("attempts.jsonl", e);
    return { recordStart: append, recordOutcome: append };
  }
  async listAttempts(_importId: string) { return (await readJsonl<AttemptEvent>(this.p("attempts.jsonl"))).records; }
  async putBuild(_importId: string, activityId: string, revision: number, bytes: Buffer) {
    const key = `builds/${activityId}-r${revision}.h5p`;
    await mkdir(this.p("builds"), { recursive: true });
    const tmp = this.p(`${key}.tmp-${randomBytes(4).toString("hex")}`);
    await writeFile(tmp, bytes); await rename(tmp, this.p(key));
    return key;
  }
  async getBuild(buildKey: string) { try { return await readFile(this.p(buildKey)); } catch { return null; } }
  async listAcceptances(importId: string) {
    const latest = new Map<string, AcceptanceRecord>();
    for (const a of (await readJsonl<AcceptanceRecord>(this.p("acceptances.jsonl"))).records) if (a.importId === importId) latest.set(`${a.activityId}/${a.revision}`, a);
    return [...latest.values()];
  }
  putAcceptance(record: AcceptanceRecord) { return this.append("acceptances.jsonl", record); }
  async listAlignmentReviews(importId: string) {
    const latest = new Map<string, AlignmentReviewRecord>();
    for (const r of (await readJsonl<AlignmentReviewRecord>(this.p("alignment-reviews.jsonl"))).records) if (r.importId === importId) latest.set(`${r.activityId}/${r.revision}/${r.itemId ?? ""}/${r.criterionId}`, r);
    return [...latest.values()];
  }
  putAlignmentReview(record: AlignmentReviewRecord) { return this.append("alignment-reviews.jsonl", record); }
}
```
Atomic renames make each file consistent on its own; the pipeline's recovery rules (Task 14) are what make the whole import resumable, the lock is what keeps a second writer out, and the tail repair is what keeps a damaged ledger appendable. (`readJsonl` before each append re-reads the ledger; the ledgers are small in phase 2, and phase 5's Postgres store has no such step.)

`apps/cli/src/report.ts`:
```ts
import { writeFile } from "node:fs/promises";
import type { ConceptMap, CostStatus, MappingStatus } from "@leaplearn/shared";
import { PRICING, type AttemptOutcome, type AttemptStart, type ImportStore, type PlannedType } from "@leaplearn/generator";

export interface CostReport {
  pricingVersion: string;
  totals: { attempts: number; costUsdMicro: number; costStatusCounts: Record<CostStatus, number>; reservationExceeded: number; overshootUsdMicro: number };
  shared: number; direct: number;
  byPurpose: Record<string, { attempts: number; costUsdMicro: number }>;
  byType: Record<string, { activities: number; promoted: number; costUsdMicro: number }>;
  perActivity: Array<{ activityId: string; type: PlannedType; status: string; attempts: number; costUsdMicro: number }>;
  retryShare: number;
  accepted: number;
  costPerAcceptedActivityUsdMicro: number | null;
}

export async function acceptedActivityIds(store: ImportStore, importId: string): Promise<Set<string>> {
  const activities = await store.listActivities(importId);
  const accepted = new Set<string>();
  for (const a of await store.listAcceptances(importId)) {
    const activity = activities.find((x) => x.activityId === a.activityId);
    if (activity && activity.currentRevision === a.revision && a.decision === "accepted") accepted.add(a.activityId);
  }
  return accepted;
}

export async function costReport(store: ImportStore, importId: string): Promise<CostReport> {
  const events = await store.listAttempts(importId);
  const starts = events.filter((e): e is AttemptStart => e.event === "start");
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  const activities = await store.listActivities(importId);
  const opActivity = new Map((await store.listOperations(importId)).map((o) => [o.operationId, o.activityId]));
  const costStatusCounts: Record<CostStatus, number> = { known: 0, estimated: 0, unavailable: 0 };
  const byPurpose: CostReport["byPurpose"] = {}; const perActivityMap = new Map<string, { attempts: number; costUsdMicro: number }>();
  let total = 0; let shared = 0; let direct = 0; let retries = 0; let reservationExceeded = 0; let overshoot = 0;
  for (const s of starts) {
    const o = outcomes.get(s.attemptId);
    const cost = o?.costUsdMicro ?? 0; // rows without a cost are counted in costStatusCounts.unavailable and excluded from every sum; they never appear as zero-cost successes
    costStatusCounts[o?.costStatus ?? "unavailable"] += 1;
    if (o?.reservationExceeded) reservationExceeded += 1;
    overshoot += o?.overshootUsdMicro ?? 0;
    total += cost;
    if (s.purpose === "produce") direct += cost; else shared += cost;
    const bp = (byPurpose[s.purpose] ??= { attempts: 0, costUsdMicro: 0 }); bp.attempts += 1; bp.costUsdMicro += cost;
    if (s.retryIndex > 0) retries += 1;
    const activityId = opActivity.get(s.operationId);
    if (activityId) { const pa = perActivityMap.get(activityId) ?? { attempts: 0, costUsdMicro: 0 }; pa.attempts += 1; pa.costUsdMicro += cost; perActivityMap.set(activityId, pa); }
  }
  const byType: CostReport["byType"] = {};
  const perActivity = activities.map((a) => {
    const pa = perActivityMap.get(a.activityId) ?? { attempts: 0, costUsdMicro: 0 };
    const bt = (byType[a.type] ??= { activities: 0, promoted: 0, costUsdMicro: 0 }); bt.activities += 1; if (a.status === "promoted") bt.promoted += 1; bt.costUsdMicro += pa.costUsdMicro;
    return { activityId: a.activityId, type: a.type, status: a.status, attempts: pa.attempts, costUsdMicro: pa.costUsdMicro };
  });
  const accepted = (await acceptedActivityIds(store, importId)).size;
  return {
    pricingVersion: PRICING.version, totals: { attempts: starts.length, costUsdMicro: total, costStatusCounts, reservationExceeded, overshootUsdMicro: overshoot }, shared, direct, byPurpose, byType, perActivity,
    retryShare: starts.length === 0 ? 0 : retries / starts.length,
    accepted, costPerAcceptedActivityUsdMicro: accepted === 0 ? null : Math.round(total / accepted)
  };
}

const usd = (micro: number): string => `$${(micro / 1_000_000).toFixed(4)}`;

export function formatCostReport(r: CostReport): string {
  const lines = [
    `Cost (pricing ${r.pricingVersion}): ${usd(r.totals.costUsdMicro)} over ${r.totals.attempts} attempts (known ${r.totals.costStatusCounts.known}, estimated ${r.totals.costStatusCounts.estimated}, unavailable ${r.totals.costStatusCounts.unavailable} — excluded from the sums; the ledger's budget spend counts them at their reservation); shared ${usd(r.shared)}, direct ${usd(r.direct)}; retry share ${(r.retryShare * 100).toFixed(0)}%; estimate exceeded on ${r.totals.reservationExceeded} attempt(s), overshooting the caps by ${usd(r.totals.overshootUsdMicro)} in total`,
    `Accepted activities: ${r.accepted}; cost per accepted activity: ${r.costPerAcceptedActivityUsdMicro === null ? "n/a (none accepted yet; record decisions with leap review)" : usd(r.costPerAcceptedActivityUsdMicro)}`,
    "", "| purpose | attempts | cost |", "|---|---|---|"
  ];
  for (const [p, v] of Object.entries(r.byPurpose)) lines.push(`| ${p} | ${v.attempts} | ${usd(v.costUsdMicro)} |`);
  lines.push("", "| activity | type | status | attempts | cost |", "|---|---|---|---|---|");
  for (const a of r.perActivity) lines.push(`| ${a.activityId} | ${a.type} | ${a.status} | ${a.attempts} | ${usd(a.costUsdMicro)} |`);
  return lines.join("\n");
}

export interface MappingRow { activityId: string; type: string; title: string; revision: number; itemId: string; criterionId: string; status: MappingStatus; conceptIds: string; evidenceIds: string; firstQuote: string; }

export async function mappingRows(store: ImportStore, importId: string): Promise<MappingRow[]> {
  const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
  const quoteOf = new Map(map?.concepts.flatMap((c) => c.evidence.map((e) => [e.evidenceId, e.quote] as const)) ?? []);
  const reviews = await store.listAlignmentReviews(importId);
  const rows: MappingRow[] = [];
  for (const a of await store.listActivities(importId)) {
    if (a.currentRevision === null) continue;
    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev) continue;
    const spec = rev.spec;
    const reviewFor = (itemId: string | null, criterionId: string) => reviews.find((r) => r.activityId === a.activityId && r.revision === rev.revision && (r.itemId ?? null) === itemId && r.criterionId === criterionId);
    const push = (itemId: string, prov: { conceptIds: string[]; evidenceIds: string[]; criteriaIds: string[] } | undefined): void => {
      const base = { activityId: a.activityId, type: a.type, title: spec.title, revision: rev.revision, itemId, conceptIds: (prov?.conceptIds ?? []).join(" "), evidenceIds: (prov?.evidenceIds ?? []).join(" "), firstQuote: quoteOf.get(prov?.evidenceIds[0] ?? "") ?? "" };
      const criteria = prov?.criteriaIds.length ? prov.criteriaIds : [""];
      for (const criterionId of criteria) {
        const review = criterionId ? reviewFor(itemId || null, criterionId) : undefined;
        const status: MappingStatus = review && review.decision !== "added" ? review.decision : "suggested";
        rows.push({ ...base, criterionId, status });
      }
      // criteria a reviewer attached: any review for a criterion outside the original provenance means it was added; a later confirmed/rejected decision on it shows as that decision
      for (const extra of reviews.filter((r) => r.activityId === a.activityId && r.revision === rev.revision && (r.itemId ?? null) === (itemId || null) && !(prov?.criteriaIds.includes(r.criterionId) ?? false))) rows.push({ ...base, criterionId: extra.criterionId, status: extra.decision });
    };
    push("", spec.provenance);
    if (spec.type === "blanks") for (const b of spec.blanks) push(b.id, b.provenance);
    if (spec.type === "flashcards") for (const c of spec.cards) push(c.id, c.provenance);
  }
  return rows;
}

const csvCell = (v: string | number): string => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function writeMappingCsv(store: ImportStore, importId: string, path: string): Promise<number> {
  const rows = await mappingRows(store, importId);
  const header = ["activityId", "type", "title", "revision", "itemId", "criterionId", "status", "conceptIds", "evidenceIds", "firstQuote"] as const;
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
  await writeFile(path, lines.join("\n") + "\n");
  return rows.length;
}

/** Rewrites mapping.csv and cost.json for an import; used after generation and after every review. */
export async function writeReports(store: ImportStore, importId: string, outDir: string): Promise<{ rows: number; report: CostReport }> {
  const { resolve } = await import("node:path");
  const rows = await writeMappingCsv(store, importId, resolve(outDir, "mapping.csv"));
  const report = await costReport(store, importId);
  await writeFile(resolve(outDir, "cost.json"), JSON.stringify(report, null, 2) + "\n");
  return { rows, report };
}
```
(The test's `mappingRows` for a multiChoice activity produces one row per criterion because the activity row is pushed once per criterion and multiChoice has no items.)

`apps/cli/src/generate.ts`:
```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { createAnthropicProvider, IncompatibleResumeError, ingestMarkdown, ingestPdf, ingestText, ReplayProvider, RecordingProvider, runImport, READING_LEVEL_IDS, StoreLockedError, TONE_IDS, type ModelProvider, type PlannedType, type ReadingLevel, type Tone } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { formatCostReport, writeReports } from "./report.js";

export interface GenerateArgs {
  source: string; out: string; unit?: string; types: string; budgetUsd: number; maxRequests: number; maxTokens: number; maxSeconds: number;
  language: string; readingLevel: string; tone: string; customisation?: string; name?: string; libraries: string;
  provider: "anthropic" | "replay" | "record"; fixtures?: string; concurrency: number;
}

export function importIdFor(outDir: string): string {
  return basename(resolve(outDir)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
}

export async function engineFingerprint(librariesDir: string): Promise<string> {
  const lock = await readFile(resolve(librariesDir, "libraries.lock.json"));
  const enginePkg = JSON.parse(await readFile(new URL("../../../packages/engine/package.json", import.meta.url), "utf8")) as { version: string };
  return `engine@${enginePkg.version}+lock:${createHash("sha256").update(lock).digest("hex").slice(0, 12)}`;
}

function providerFor(args: GenerateArgs): ModelProvider {
  if (args.provider === "replay") { if (!args.fixtures) throw new Error("--fixtures is required with --provider replay"); return new ReplayProvider(resolve(args.fixtures)); }
  const live = createAnthropicProvider();
  if (args.provider === "record") { if (!args.fixtures) throw new Error("--fixtures is required with --provider record"); return new RecordingProvider(live, resolve(args.fixtures)); }
  return live;
}

export async function generate(args: GenerateArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const types = args.types.split(",").map((t) => t.trim()).filter(Boolean) as PlannedType[];
  for (const t of types) if (!["multiChoice", "blanks", "flashcards"].includes(t)) throw new Error(`unsupported type ${t}; phase 2 supports multiChoice, blanks, flashcards`);
  if (new Set(types).size !== types.length) throw new Error(`--types lists a type more than once (${args.types}); name each type once`);
  if (!(READING_LEVEL_IDS as readonly string[]).includes(args.readingLevel)) throw new Error(`unknown reading level ${args.readingLevel}`);
  if (!(TONE_IDS as readonly string[]).includes(args.tone)) throw new Error(`unknown tone ${args.tone}`);
  const sourcePath = resolve(args.source);
  const sourceId = `src-${basename(sourcePath)}`;
  const ext = extname(sourcePath).toLowerCase();
  const source = ext === ".pdf" ? await ingestPdf(await readFile(sourcePath), { sourceId, fileName: basename(sourcePath) })
    : ext === ".md" ? await ingestMarkdown(await readFile(sourcePath, "utf8"), { sourceId, fileName: basename(sourcePath) })
    : await ingestText(await readFile(sourcePath, "utf8"), { sourceId, fileName: basename(sourcePath) });
  const unitText = args.unit ? await readFile(resolve(args.unit), "utf8") : null;
  const registry = await createRegistry({ lockPath: resolve(args.libraries, "libraries.lock.json"), cacheDir: resolve(args.libraries, "cache") });
  const outDir = resolve(args.out);
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const promptConfig = { readingLevel: args.readingLevel as ReadingLevel, tone: args.tone as Tone, language: args.language, ...(args.customisation ? { customisation: args.customisation } : {}) };
  const budget = { usdMicro: Math.round(args.budgetUsd * 1_000_000), requests: args.maxRequests, tokens: args.maxTokens, elapsedMs: Math.round(args.maxSeconds * 1000) };
  let record;
  try {
    record = await runImport(
      { importId, name: args.name ?? basename(sourcePath), source, unitText, selectedTypes: types, budget, promptConfig, language: args.language, customisation: args.customisation ?? null },
      { store, provider: providerFor(args), registry, engineFingerprint: await engineFingerprint(args.libraries), concurrency: args.concurrency, onProgress: (e) => io.err(`${e.kind === "status" ? `status: ${e.status}` : e.kind === "activity" ? `${e.activityId}: ${e.status}${e.error ? ` (${e.error})` : ""}` : `${e.purpose}: ${e.status}${e.costUsdMicro === null ? "" : ` ($${(e.costUsdMicro / 1_000_000).toFixed(4)})`}`}\n`) }
    );
  } catch (err) {
    if (err instanceof IncompatibleResumeError || err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  }
  const activities = await store.listActivities(importId);
  io.out(`import ${importId}: ${record.status}${record.error ? ` — ${record.error}` : ""}\n`);
  for (const a of activities) io.out(`  ${a.activityId}  ${a.type.padEnd(12)}  ${a.status}${a.currentRevision ? `  builds/${a.activityId}-r${a.currentRevision}.h5p` : ""}${a.error ? `  ${a.error}` : ""}\n`);
  const { rows, report } = await writeReports(store, importId, outDir);
  io.out(`mapping: ${rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
  io.out(formatCostReport(report) + "\n");
  return record.status === "ready" ? 0 : record.status === "ready_with_failures" ? 2 : 1;
}
```

`apps/cli/src/index.ts` — add the command after `flashcards`:
```ts
    .command("generate", "Generate multiChoice, blanks and flashcards activities from a source (and optional unit of competency), compile them, and report cost", (y) => y
      .option("source", { type: "string", demandOption: true, describe: ".pdf, .md or .txt" })
      .option("out", { type: "string", demandOption: true, describe: "output directory (the import store; rerun to resume)" })
      .option("unit", { type: "string", describe: "unit of competency text file" })
      .option("types", { type: "string", default: "multiChoice,blanks,flashcards" })
      .option("budget-usd", { type: "number", default: 2, describe: "estimated spend cap in USD (reservations are estimates; the report shows any overshoot)" })
      .option("max-requests", { type: "number", default: 200, describe: "hard limit on model requests" })
      .option("max-tokens", { type: "number", default: 2_000_000, describe: "estimated cap on reserved input + output tokens" })
      .option("max-seconds", { type: "number", default: 1800, describe: "hard limit on elapsed time for this import, counted across runs" })
      .option("language", { type: "string", default: "en" })
      .option("reading-level", { type: "string", default: "high-school" })
      .option("tone", { type: "string", default: "educational" })
      .option("customisation", { type: "string" })
      .option("name", { type: "string" })
      .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries") })
      .option("provider", { choices: ["anthropic", "replay", "record"] as const, default: "anthropic" as const })
      .option("fixtures", { type: "string", describe: "fixture directory for --provider replay|record" })
      .option("concurrency", { type: "number", default: 3, describe: "activity types generated at once (each type is one serial lane)" }),
      async (argv) => {
        const code = await generate({ source: argv.source, out: argv.out, ...(argv.unit ? { unit: argv.unit } : {}), types: argv.types, budgetUsd: argv["budget-usd"], maxRequests: argv["max-requests"], maxTokens: argv["max-tokens"], maxSeconds: argv["max-seconds"], language: argv.language, readingLevel: argv["reading-level"], tone: argv.tone, ...(argv.customisation ? { customisation: argv.customisation } : {}), ...(argv.name ? { name: argv.name } : {}), libraries: argv.libraries, provider: argv.provider, ...(argv.fixtures ? { fixtures: argv.fixtures } : {}), concurrency: argv.concurrency }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
```
`apps/cli/package.json`: no new dependencies beyond `@leaplearn/generator` (added in Task 6).

- [ ] **Step 3: Verify, run the replay path against the synthetic fixtures with no key, and commit**

Run: `pnpm --filter @leaplearn/generator build && pnpm --filter @leaplearn/cli build && pnpm --filter @leaplearn/cli test && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"` (the CLI is built before its tests because `interrupt.test.ts` spawns a real process over the built `dist`). Expected `exit=0`. Smoke the command without an API key: `node apps/cli/dist/index.js generate --source packages/generator/test/fixtures/synthetic/source-electrical-safety.md --out /tmp/leap-imp --provider replay --fixtures /tmp/empty; echo "exit=$?"` → `exit=1` with `leap: no recorded response for purpose parseUnit …` on stderr, and `ls /tmp/leap-imp` shows no `lock/` directory left behind (proves the CLI wiring, the store creation, the lock release and the error path before Task 17 records real fixtures). Then run the same command again with a second copy started in parallel (`… & …; wait`) and confirm exactly one of them printed `leap: import leap-imp is locked`.

```bash
git add apps/cli
git commit -m "feat(cli): leap generate with an ownership-safe directory lock, tail-repairing JSONL ledgers, a real interruption test, four budget limits, mapping.csv and a review-aware cost report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: `leap review` — revision-bound acceptance and alignment-review records

The owner's ruling on the review/acceptance decision: keep a minimal revision-bound record available by phase 3 so the quality gate and the cost-per-accepted-activity measurement do not wait for the phase-5 UI. Spec §4's `acceptance_decisions` and `alignment_reviews` are the records (store methods from Task 14, `FileStore` from Task 15); this task adds the command that writes them and rewrites the reports. Nothing here judges quality: the command records a person's judgement.

**Files:**
- Create: `apps/cli/src/review.ts`; modify `apps/cli/src/index.ts`
- Test: `apps/cli/test/review.test.ts`

**Interfaces:**
- `ReviewInput = { activityId: string; reviewer: string } & ({ kind: "acceptance"; decision: AcceptanceDecision; notes: string | null } | { kind: "alignment"; criterionId: string; decision: AlignmentDecision; itemId: string | null })`; `recordReview(store, importId, input, clock?): Promise<AcceptanceRecord | AlignmentReviewRecord>` — the activity must exist and be promoted (`currentRevision` set); the record binds to that revision; an `itemId` must name an item of the promoted spec. Alignment decisions need the import's stored unit (an import without one refuses them) and the criterion must be in that **immutable unit**; the transition is then judged against the **effective mapping** = the original provenance plus every criterion an earlier review attached to the same revision and item (any review record for a criterion outside the original provenance means it was added): `added` requires the criterion to be outside the effective mapping, `confirmed`/`rejected` require it to be inside, so add → reject → confirm works. Every violation is a `ReviewError` naming the id. `review(args, io): Promise<number>` opens the `FileStore` under `--out`, **takes the directory lock**, calls `recordReview`, rewrites `mapping.csv` and `cost.json` through `writeReports`, releases the lock, prints the cost report, and exits 0 (1 on `ReviewError` or `StoreLockedError`).
- `leap review --out <dir> --activity <id> --reviewer <name> (--decision accepted|rejected [--notes "…"] | --criterion <id> --alignment confirmed|rejected|added [--item <itemId>])`.

- [ ] **Step 1: Failing test**

`apps/cli/test/review.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MemoryStore } from "@leaplearn/generator";
import { recordReview, ReviewError } from "../src/review.js";
import { costReport, mappingRows } from "../src/report.js";

async function seeded(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.putImport({ importId: "imp", orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: "u".repeat(64), selectedTypes: ["blanks"], fingerprint: "f".repeat(64), budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" });
  await store.putArtifact("imp", "unit", { code: "SYNELE001", title: "Isolate and test electrical equipment", textHash: "u".repeat(64), knowledgeEvidence: [], performanceEvidence: [], elements: [{ id: "E2", number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout devices and tags" }, { id: "PC2.2", number: "2.2", text: "Test for dead" }] }] });
  await store.putActivity({ activityId: "act-4", importId: "imp", type: "blanks", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false });
  await store.putActivity({ activityId: "act-5", importId: "imp", type: "blanks", order: 1, status: "failed", currentRevision: null, conceptIds: ["c1"], criteriaIds: [], error: "content: x", dropped: false });
  await store.putRevision({ activityId: "act-4", revision: 1, state: "promoted", spec: { id: "act-4", title: "T", type: "blanks", language: "en", schemaVersion: 1, taskDescription: "d", passage: "Only the {{b1}} may remove it and it takes {{b2}} people.", blanks: [{ id: "b1", answers: ["worker"], provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } }, { id: "b2", answers: ["two"], provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s2"], criteriaIds: [] } }], caseSensitive: false, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1", "ev-s2"], criteriaIds: ["PC2.1"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {}, profiles: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: [], createdAt: "t" });
  const rec = store.recorderFor("imp");
  await rec.recordStart({ event: "start", attemptId: "a1", operationId: "imp:produce:act-4:r1", callKey: "produce:act-4", retryIndex: 0, retryReason: null, attempt: 1, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
  await rec.recordOutcome({ event: "outcome", attemptId: "a1", operationId: "imp:produce:act-4:r1", providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: 900, costStatus: "known", stopReason: "end_turn", status: "ok", error: null, reservationExceeded: false, completedAt: "t" });
  return store;
}

describe("leap review", () => {
  it("records an acceptance bound to the promoted revision and changes cost per accepted activity", async () => {
    const store = await seeded();
    const record = await recordReview(store, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "owner", decision: "accepted", notes: "plumbing check" }, () => new Date("2026-09-19T00:00:00Z"));
    expect(record).toEqual({ importId: "imp", activityId: "act-4", revision: 1, decision: "accepted", reviewer: "owner", notes: "plumbing check", decidedAt: "2026-09-19T00:00:00.000Z" });
    const report = await costReport(store, "imp");
    expect(report.accepted).toBe(1);
    expect(report.costPerAcceptedActivityUsdMicro).toBe(900);
    await recordReview(store, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "owner", decision: "rejected", notes: null });
    expect((await costReport(store, "imp")).accepted).toBe(0);
  });
  it("records alignment decisions per item and criterion, and the mapping status follows them", async () => {
    const store = await seeded();
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.1", decision: "confirmed", itemId: "b1" });
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.1", decision: "rejected", itemId: null });
    await recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.2", decision: "added", itemId: "b2" });
    const rows = (await mappingRows(store, "imp")).map((r) => [r.itemId, r.criterionId, r.status]);
    expect(rows).toEqual([["", "PC2.1", "rejected"], ["b1", "PC2.1", "confirmed"], ["b2", "", "suggested"], ["b2", "PC2.2", "added"]]);
    expect((await store.listAlignmentReviews("imp"))[0]?.unitTextHash).toBe("u".repeat(64));
  });
  it("manages a criterion a reviewer attached: add → reject → confirm, and no second add", async () => {
    const store = await seeded();
    const on = (decision: "added" | "rejected" | "confirmed") => recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "owner", criterionId: "PC2.2", decision, itemId: "b2" });
    await on("added");
    await expect(on("added")).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.2.*already/) });
    await on("rejected");
    expect((await mappingRows(store, "imp")).find((r) => r.itemId === "b2" && r.criterionId === "PC2.2")?.status).toBe("rejected");
    await on("confirmed");
    expect((await mappingRows(store, "imp")).find((r) => r.itemId === "b2" && r.criterionId === "PC2.2")?.status).toBe("confirmed");
  });
  it("refuses decisions that do not bind to a real promoted revision, item, unit criterion or mapping state", async () => {
    const store = await seeded();
    await expect(recordReview(store, "imp", { kind: "acceptance", activityId: "act-5", reviewer: "o", decision: "accepted", notes: null })).rejects.toMatchObject({ name: "ReviewError", message: expect.stringMatching(/act-5.*promoted/) });
    await expect(recordReview(store, "imp", { kind: "acceptance", activityId: "act-9", reviewer: "o", decision: "accepted", notes: null })).rejects.toBeInstanceOf(ReviewError);
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "confirmed", itemId: "b9" })).rejects.toMatchObject({ message: expect.stringMatching(/b9/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC9.9", decision: "added", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC9\.9.*not in unit SYNELE001/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.2", decision: "confirmed", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.2.*not in/) });
    await expect(recordReview(store, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "added", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/PC2\.1.*already/) });
    const noUnit = await seeded();
    await noUnit.putArtifact("imp", "unit", null);
    await expect(recordReview(noUnit, "imp", { kind: "alignment", activityId: "act-4", reviewer: "o", criterionId: "PC2.1", decision: "confirmed", itemId: null })).rejects.toMatchObject({ message: expect.stringMatching(/no unit/) });
    await expect(recordReview(noUnit, "imp", { kind: "acceptance", activityId: "act-4", reviewer: "o", decision: "accepted", notes: null })).resolves.toMatchObject({ decision: "accepted" }); // acceptance needs no unit
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`apps/cli/src/review.ts`:
```ts
import { resolve } from "node:path";
import { criteriaOf, type AcceptanceDecision, type AlignmentDecision, type UnitOfCompetency } from "@leaplearn/shared";
import { StoreLockedError, type AcceptanceRecord, type AlignmentReviewRecord, type ImportStore } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";
import { formatCostReport, writeReports } from "./report.js";

export class ReviewError extends Error { constructor(message: string) { super(message); this.name = "ReviewError"; } }

export type ReviewInput = { activityId: string; reviewer: string } & (
  | { kind: "acceptance"; decision: AcceptanceDecision; notes: string | null }
  | { kind: "alignment"; criterionId: string; decision: AlignmentDecision; itemId: string | null }
);

function itemProvenance(spec: { type: string; blanks?: Array<{ id: string; provenance: { criteriaIds: string[] } }>; cards?: Array<{ id: string; provenance: { criteriaIds: string[] } }>; provenance: { criteriaIds: string[] } }, itemId: string | null): { criteriaIds: string[] } {
  if (itemId === null) return spec.provenance;
  const item = [...(spec.blanks ?? []), ...(spec.cards ?? [])].find((i) => i.id === itemId);
  if (!item) throw new ReviewError(`item ${itemId} is not in the promoted revision of this activity`);
  return item.provenance;
}

/** Records a human decision against the activity's promoted revision. Every check names the id it failed on. */
export async function recordReview(store: ImportStore, importId: string, input: ReviewInput, clock: () => Date = () => new Date()): Promise<AcceptanceRecord | AlignmentReviewRecord> {
  const importRecord = await store.getImport(importId);
  if (!importRecord) throw new ReviewError(`import ${importId} is not in this directory`);
  const activity = (await store.listActivities(importId)).find((a) => a.activityId === input.activityId);
  if (!activity) throw new ReviewError(`activity ${input.activityId} is not in import ${importId}`);
  if (activity.currentRevision === null) throw new ReviewError(`activity ${input.activityId} has no promoted revision (status ${activity.status}); only promoted activities can be reviewed`);
  const revision = await store.getRevision(activity.activityId, activity.currentRevision);
  if (!revision) throw new ReviewError(`revision ${activity.currentRevision} of ${input.activityId} is missing from the store`);
  const decidedAt = clock().toISOString();
  if (input.kind === "acceptance") {
    const record: AcceptanceRecord = { importId, activityId: activity.activityId, revision: revision.revision, decision: input.decision, reviewer: input.reviewer, notes: input.notes, decidedAt };
    await store.putAcceptance(record);
    return record;
  }
  const unit = await store.getArtifact<UnitOfCompetency>(importId, "unit");
  if (!unit) throw new ReviewError(`import ${importId} has no unit of competency, so there is no alignment to review`);
  if (!criteriaOf(unit).some((c) => c.id === input.criterionId)) throw new ReviewError(`criterion ${input.criterionId} is not in unit ${unit.code}`);
  const provenance = itemProvenance(revision.spec as Parameters<typeof itemProvenance>[0], input.itemId);
  const earlier = (await store.listAlignmentReviews(importId)).filter((r) => r.activityId === activity.activityId && r.revision === revision.revision && (r.itemId ?? null) === input.itemId);
  const present = provenance.criteriaIds.includes(input.criterionId) || earlier.some((r) => r.criterionId === input.criterionId);
  if (input.decision === "added" && present) throw new ReviewError(`criterion ${input.criterionId} is already mapped on ${input.itemId ?? input.activityId}; use confirmed or rejected`);
  if (input.decision !== "added" && !present) throw new ReviewError(`criterion ${input.criterionId} is not in the mapping of ${input.itemId ?? input.activityId}; use added to attach it`);
  const record: AlignmentReviewRecord = { importId, activityId: activity.activityId, revision: revision.revision, itemId: input.itemId, unitTextHash: importRecord.unitTextHash, criterionId: input.criterionId, decision: input.decision, reviewer: input.reviewer, decidedAt };
  await store.putAlignmentReview(record);
  return record;
}

export interface ReviewArgs { out: string; activity: string; reviewer: string; decision?: AcceptanceDecision; notes?: string; criterion?: string; alignment?: AlignmentDecision; item?: string; }

export async function review(args: ReviewArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const outDir = resolve(args.out);
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const base = { activityId: args.activity, reviewer: args.reviewer };
  const input: ReviewInput = args.decision
    ? { ...base, kind: "acceptance", decision: args.decision, notes: args.notes ?? null }
    : args.criterion && args.alignment
      ? { ...base, kind: "alignment", criterionId: args.criterion, decision: args.alignment, itemId: args.item ?? null }
      : (() => { throw new ReviewError("give either --decision accepted|rejected, or --criterion <id> with --alignment confirmed|rejected|added"); })();
  let lock;
  try { lock = await store.lock(importId); } catch (err) { if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  try {
    const record = await recordReview(store, importId, input);
    io.out(`recorded ${input.kind} for ${record.activityId} r${record.revision}: ${record.decision}\n`);
    const { rows, report } = await writeReports(store, importId, outDir);
    io.out(`mapping: ${rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
    io.out(formatCostReport(report) + "\n");
    return 0;
  } catch (err) {
    if (err instanceof ReviewError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  } finally {
    await lock.release();
  }
}
```

`apps/cli/src/index.ts` — add after `generate`:
```ts
    .command("review", "Record a human acceptance or alignment decision against a promoted activity and refresh mapping.csv and cost.json", (y) => y
      .option("out", { type: "string", demandOption: true, describe: "the import directory" })
      .option("activity", { type: "string", demandOption: true })
      .option("reviewer", { type: "string", demandOption: true })
      .option("decision", { choices: ["accepted", "rejected"] as const })
      .option("notes", { type: "string" })
      .option("criterion", { type: "string" })
      .option("alignment", { choices: ["confirmed", "rejected", "added"] as const })
      .option("item", { type: "string" }),
      async (argv) => {
        const code = await review({ out: argv.out, activity: argv.activity, reviewer: argv.reviewer, ...(argv.decision ? { decision: argv.decision } : {}), ...(argv.notes ? { notes: argv.notes } : {}), ...(argv.criterion ? { criterion: argv.criterion } : {}), ...(argv.alignment ? { alignment: argv.alignment } : {}), ...(argv.item ? { item: argv.item } : {}) }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/cli test && pnpm --filter @leaplearn/cli build && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"`. Expected `exit=0`. Smoke: on the `/tmp/leap-imp` directory from Task 15 (an import with no promoted activity), `node apps/cli/dist/index.js review --out /tmp/leap-imp --activity act-1 --reviewer me --decision accepted; echo "exit=$?"` → `exit=1` with `leap: activity act-1 is not in import leap-imp` on stderr and no `lock/` left behind; with a `leap generate` still running on the same directory the review exits 1 with `leap: import leap-imp is locked by pid …`.

```bash
git add apps/cli
git commit -m "feat(cli): leap review records revision-bound acceptance and alignment decisions and refreshes the reports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: The phase-2 demo, recorded fixtures, the replay test, docs and verification

**Files:**
- Create: `packages/generator/test/fixtures/replay/synthetic/*.json` (recorded), `packages/generator/test/replay.test.ts`, `docs/testing/phase-2-demo.md`
- Modify: `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§3, §4, §9), `README.md`

- [ ] **Step 1: The demo run (owner's API key; the only real calls in this phase)**

```bash
export ANTHROPIC_API_KEY=…   # owner-provided; never committed
rm -rf /tmp/leap-demo
node apps/cli/dist/index.js generate \
  --source packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf \
  --unit packages/generator/test/fixtures/synthetic/unit-synele001.txt \
  --out /tmp/leap-demo --budget-usd 2 \
  --provider record --fixtures packages/generator/test/fixtures/replay/synthetic; echo "exit=$?"
```
Expected: `exit=0` (or `2` with a named failed activity, which is also a valid outcome to record — do not re-run until it is 0; record what happened). A `400` naming a schema keyword, a sampling parameter or `thinking` is a finding against Tasks 4, 5 or 7, not something to work around in the demo: record it, fix the contract test that should have caught it, and re-run. Then:
```bash
ls /tmp/leap-demo/builds; head /tmp/leap-demo/mapping.csv; head -60 /tmp/leap-demo/cost.json
grep -c '"event":"start"' /tmp/leap-demo/attempts.jsonl; grep -c '"event":"outcome"' /tmp/leap-demo/attempts.jsonl
python3 - <<'EOF'
import json
rows = [json.loads(l) for l in open('/tmp/leap-demo/attempts.jsonl')]
starts = {r['attemptId']: r for r in rows if r['event'] == 'start'}
outs = [r for r in rows if r['event'] == 'outcome']
print('costStatus:', sorted({o['costStatus'] for o in outs}))
print('reservationExceeded:', sum(1 for o in outs if o['reservationExceeded']), 'overshoot µUSD:', sum(o['overshootUsdMicro'] or 0 for o in outs))
ratios = [(o['inputTokens'] + (o['cacheReadTokens'] or 0) + (o['cacheWriteTokens'] or 0)) / max(1, starts[o['attemptId']]['reservedInputTokens']) for o in outs if o['inputTokens'] is not None]
print('max actual/reserved input ratio: %.3f' % max(ratios))
print('retries:', sum(1 for s in starts.values() if s['retryIndex'] > 0), 'of', len(starts))
print('cache reads on produce:', [o['cacheReadTokens'] for o in outs if starts[o['attemptId']]['purpose'] == 'produce'])
EOF
test -d /tmp/leap-demo/lock && echo "LOCK LEFT BEHIND" || echo "lock released"
```
Expected: one `.h5p` per promoted activity; `mapping.csv` rows with `PC…` ids and `suggested`; starts equal outcomes; `costStatus` all `known`; the `reservationExceeded` count, the max actual/reserved ratio and the total overshoot are **recorded as calibration data**, whatever they are (a non-zero overshoot is not a failure of the demo, it is the measurement the estimated cap exists to make visible; the doc states how far the cap was overshot in µUSD); cache reads visible on the later `produce` calls (the system + evidence prefix exceeds 1,024 tokens for Sonnet 5; if they are 0 everywhere, record that as a finding — the cached prefix was below the minimum or not identical between calls); no lock file left.

Then record one acceptance so the cost-per-accepted-activity measurement is exercised end to end:
```bash
node apps/cli/dist/index.js review --out /tmp/leap-demo --activity act-1 --reviewer "$USER" --decision accepted --notes "phase-2 plumbing check, not a quality judgement"; echo "exit=$?"
grep -c accepted /tmp/leap-demo/acceptances.jsonl; python3 -c "import json;print(json.load(open('/tmp/leap-demo/cost.json'))['costPerAcceptedActivityUsdMicro'])"
```
This acceptance is a plumbing check by the person running the demo. It is **not** the phase-3 quality gate and the demo document says so in those words.

Open every built `.h5p` in the phase-1 smoke harness by copying them into a temporary site (`packages/engine/test/smoke/serve.ts` + `site/index.html`) or upload one by hand to h5p.com and record it in `docs/testing/platform-checklist.md` under a new "generated" row set — this is the owner's platform gate and stays separate from quality judgement.

Write `docs/testing/phase-2-demo.md`: the exact commands, the run date, the model IDs, the request profiles and `PRICING.version`, the cost report table verbatim, the number of attempts and the retry share, the `reservationExceeded` count, the total overshoot in µUSD and the observed maximum actual/reserved input ratio (this is the calibration record for the estimated caps), the cache-read observation, the unsupported criteria list (`PC3.2` expected), the acceptance record with its "plumbing check" note, and any activity that failed with its reason. This is the "measured cost" deliverable; no quality claim is made.

- [ ] **Step 2: Replay test over the recorded fixtures**

`packages/generator/test/replay.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { ingestPdf } from "../src/ingest/index.js";
import { ReplayProvider } from "../src/llm/replay-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { AttemptOutcome } from "../src/llm/types.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
const replayDir = resolve(fixtures, "replay/synthetic");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

describe("end to end over recorded responses", () => {
  it("replays the demo import from the synthetic PDF and unit without network access", async () => {
    expect(existsSync(replayDir), "record the fixtures with `leap generate --provider record` first (Task 17 step 1)").toBe(true);
    const source = await ingestPdf(await readFile(resolve(fixtures, "synthetic/source-electrical-safety.pdf")), { sourceId: "src-source-electrical-safety.pdf", fileName: "source-electrical-safety.pdf" });
    const unitText = await readFile(resolve(fixtures, "synthetic/unit-synele001.txt"), "utf8");
    const store = new MemoryStore();
    const record = await runImport(
      { importId: "leap-demo", name: "source-electrical-safety.pdf", source, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 2_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null },
      { store, provider: new ReplayProvider(replayDir), registry, engineFingerprint: "replay" }
    );
    expect(["ready", "ready_with_failures"]).toContain(record.status);
    const activities = await store.listActivities("leap-demo");
    expect(activities.filter((a) => a.status === "promoted").length).toBeGreaterThanOrEqual(3);
    const map = await store.getArtifact<{ alignment?: { unsupportedCriteriaIds: string[] } }>("leap-demo", "conceptMap");
    expect(map?.alignment?.unsupportedCriteriaIds).toContain("PC3.2");
    const outcomes = (await store.listAttempts("leap-demo")).filter((e): e is AttemptOutcome => e.event === "outcome");
    expect(outcomes.every((o) => o.costStatus === "known")).toBe(true);
    expect(outcomes.every((o) => typeof o.reservationExceeded === "boolean" && o.overshootUsdMicro !== null)).toBe(true); // recorded on every attempt; the demo doc reports the totals
  });
});
```
The replay is byte-exact only if the prompts are identical to the recorded run: the same fixture bytes, the same `PROMPT_VERSION`, the same model ids and request profiles. Concurrency does **not** affect the prompts any more: each type is a serial lane and the near-duplicate context comes only from that lane's earlier promotions, so the default concurrency replays exactly. Any later prompt change re-records the fixtures (the `ReplayMissError` names the purpose).

- [ ] **Step 3: Spec and docs**

`docs/superpowers/specs/2026-09-18-generator-service-design.md`: §3 `packages/generator` → `llm/`: append "Structured output is requested natively (`output_config.format`, JSON Schema projected from the model-output Zod schemas to the subset the API accepts, every property required); the full Zod schema validates the parsed response. Request settings (sampling, thinking) come from per-model profiles. SDK retries are off; the stage runner owns retries and every retry is a recorded, reserved attempt. Of the four budget limits, requests and elapsed time (per import, across runs) are hard; spend and tokens are estimated caps whose overshoot is recorded per attempt. Phase 2 stores imports as a directory of JSON and JSONL files through an `ImportStore` interface with an ownership-safe directory lock and an input fingerprint; phase 5 implements the same interface over Postgres." §4: after the `acceptance_decisions` row add "Both review tables are implemented from phase 2 as revision-bound records in the `ImportStore`, written by `leap review`; the web UI arrives in phase 5." §9 URL fetching: "Implemented as `safeFetch` in `packages/generator` (phase 2): addresses are classified after IPv6 normalisation and the connection is pinned to the validated address; used by every application-side fetch." `README.md`: a "Generate activities" section with the demo command, the output directory layout (including `lock/` and the four ledgers), the four budget flags with which two are hard and which two are estimates, `--provider replay|record`, `leap review`, and the exit codes.

- [ ] **Step 4: Root verification and commit**

Run the clean-checkout path: `rm -rf node_modules packages/*/node_modules apps/*/node_modules tools/*/node_modules packages/*/dist apps/*/dist tools/*/dist && pnpm install --frozen-lockfile && env -u ANTHROPIC_API_KEY pnpm verify; echo "exit=$?"`. Expected `exit=0`; the generator's suites (including `replay.test.ts`) run inside `pnpm -r test`; no test contacts the network.

```bash
git add packages/generator/test/fixtures/replay packages/generator/test/replay.test.ts docs README.md
git commit -m "test(generator): replay the recorded phase-2 demo end to end; record the demo and amend the spec

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Done when

- **Opening task landed first:** `validate()` returns coded issues for spec-attributable failures (schema, missing/unsupported asset, not-implemented page kinds, missing handler) and `compile*` throw `ValidationError` for the same; the earlier assertions that expected `ZodError` or thrown validation are replaced, not merely supplemented; engine/registry integrity failures remain exceptions; README and CONTRIBUTING describe the workspace correctly (Task 1).
- **SSRF protection exists and is tested before any server-side fetching:** `safeFetch` classifies every address after IPv6 normalisation (mapped in both notations, compatible, NAT64, 6to4, multicast), pins the connection to the validated address, re-checks every redirect, applies one total deadline including DNS, caps size, and is the only fetch the CLI's image resolver uses (Task 6). Text and PDF ingestion never fetch.
- **Requests are ones Sonnet 5 accepts:** no sampling parameter, thinking disabled, and the wire schema is the provider-compatible projection; contract tests pin both against the real model-output schemas (Tasks 4, 5, 7).
- **Every retry is metered:** SDK retries are zero; a transient failure followed by success produces two starts, two outcomes and two reservations (Tasks 5, 7).
- **The budget's four limits are described as what they are:** requests and elapsed time are hard (the count is exact; the per-import deadline is checked before every dispatch and every backoff and bounds the SDK timeout); spend and tokens are estimated caps reserved before dispatch for the whole request at the cache-write rate; every outcome records `reservationExceeded` and `overshootUsdMicro`, the report totals them, and the demo records them as calibration data (Tasks 2, 4, 5, 7, 15, 17).
- **Recovery is proven by crash tests and one real kill:** a simulated failure before the concept map, plan, activity records, build or the final activity write is followed by a resume that repeats no finished model call; a candidate revision resumes at compilation; a changed input is refused under the lock; a second writer is refused; a SIGKILLed child process over `FileStore` leaves a held lock and an outcome-less start, and the next run reclaims the lock, reconciles and resumes (Tasks 14, 15).
- **The lock is ownership-safe and the ledgers stay appendable:** atomic `mkdir`, token, heartbeat, rename-then-remove reclamation with a two-reclaimer test; a damaged JSONL tail is repaired before the next append (Task 15).
- **Concurrency cannot violate the rules:** one serial lane per type, a shared stop consulted before every dispatch and every retry, in-flight work settled even when recording an outcome fails, the lock released only after every lane has finished, every undispatched activity given an explicit outcome and re-dispatched on resume, duplicate selected types canonicalised (Tasks 7, 14).
- **Mappings do not overstate alignment:** item and activity provenance are derived from the cited evidence and the alignment; each blank's answer is checked against that blank's evidence; the alignment prompt sees evidence quotes (Tasks 8, 10–13).
- **Retry share means retries:** every attempt carries a call key and a retry index; the report counts `retryIndex > 0` (Tasks 4, 7, 15).
- **Review records exist by phase 3:** `leap review` writes revision-bound acceptance and alignment decisions; `mapping.csv` reflects them; the cost report gives cost per accepted activity (Tasks 14–16).
- **The demo runs from the CLI:** `leap generate --source <synthetic PDF> --unit <synthetic unit> --out <dir>` produces at least one promoted `multiChoice`, one `blanks` and one `flashcards` activity as `.h5p` files built by the phase-1 engine, `mapping.csv` with suggested criteria (and `PC3.2` reported unsupported), and a cost report whose attempts have `costStatus: known` (Task 17, recorded in `docs/testing/phase-2-demo.md`).
- **Every model call is traceable:** one start and one outcome row per attempt in `attempts.jsonl`, with call key, retry index, provider request id (also on failures), raw usage, pricing version and cost; a restart reconciles interrupted attempts as billing-uncertain (Tasks 4, 14).
- **Cost accounting rules hold:** pricing lives only in `pricing.ts` with version, source and effective date; a missing usage is `unavailable`, never zero; reservations are made before dispatch and replaced by actual usage (Tasks 2, 4).
- **Provenance is verified:** every produced activity and item cites evidence ids that resolve to sentences whose quotes match the stored text at their offsets; `assertGeneratedProvenance` passes for every promoted spec (Tasks 8, 11–14).
- **Offline verification:** `env -u ANTHROPIC_API_KEY pnpm verify` exits 0 from a clean checkout, including the recorded-replay end-to-end test; no test contacts the network.
- **Separation of claims:** platform compatibility rows in `docs/testing/platform-checklist.md` are filled only by hand (the generated packages get their own rows); generation quality is judged only in phase 3; the demo's single acceptance record is labelled a plumbing check; the synthetic fixtures are labelled and stay out of the phase-3 corpus.

## Acceptance checks for the owner's review

| Check | Where |
|---|---|
| Error classification is the first commit of the phase, and the old thrown-validation assertions are gone | `git log --reverse` shows Task 1's commit before any `packages/generator` commit; `grep -n "ZodError" packages/engine/test/determinism.test.ts` prints nothing |
| SSRF guard tested and wired before any fetch | Task 6's commit precedes Task 15's CLI; `grep -rn "fetch(" apps/cli/src packages/generator/src` shows only `safe-fetch.ts`; the pinning test reaches `pinned.test` only through the injected lookup |
| Review finding 1 (Sonnet 5 request shape, schema projection) | `test/anthropic-provider.test.ts` (no sampling key, `thinking: disabled`), `test/model-output.test.ts` (all eight real schemas) |
| Review finding 2 (SDK retries) | `test/anthropic-provider.test.ts` asserts `maxRetries: 0`; `test/runner.test.ts` asserts two starts, two outcomes, two reservations |
| Review finding 3 (four limits reserved before dispatch) | `test/cost.test.ts` (no split of the same totals costs more than the reservation for a given count), `test/budget.test.ts` (each limit refused by name); the caps' estimated nature is stated where they are defined and their overshoot is recorded (see the revision-2 rows below) |
| Review findings 4 and 5 (recovery, identity, lock) | `test/pipeline.test.ts` crash cases `imp-c1` … `imp-c6`, `imp-fp`, `imp-lock`; `apps/cli/test/file-store.test.ts` tail-repair cases |
| Revision-2 finding 1 (budget honesty, elapsed deadline) | Decisions table and Global Constraints name the hard limits and the estimated caps; `test/budget.test.ts` deadline case; `test/call-model.test.ts` overshoot and deadline cases; `test/runner.test.ts` backoff-past-deadline case; `test/anthropic-provider.test.ts` bounded timeout; `test/pipeline.test.ts` `imp-e` |
| Revision-2 finding 2 (DNS callback shape) | `test/safe-fetch.test.ts` `pinned.test` under the pinned Node 20, where automatic family selection uses the array form |
| Revision-2 finding 3 (JSONL tail) | `apps/cli/test/file-store.test.ts` read → repair → append → reopen for a truncated record and for a record missing its newline |
| Revision-2 finding 4 (lock races, read under lock, review lock) | `apps/cli/test/lock.test.ts` two-reclaimer and reclaimed-release cases; `runImport` reads the record after `lock()`; `review()` holds the lock |
| Revision-2 finding 5 (stop before every dispatch, settle on persistence failure, duplicate types) | `test/runner.test.ts` stop case; `test/pipeline.test.ts` `imp-s`, `imp-f`, `imp-t` |
| Revision-2 finding 6 (added criteria) | `apps/cli/test/review.test.ts` add → reject → confirm, unknown criterion, no-unit import |
| Revision-2 finding 7 (test clocks) | every budget in a test is created from the clock the runner uses; `test/call-model.test.ts` `CLOCK` |
| Real interruption | `apps/cli/test/interrupt.test.ts` (SIGKILL over `FileStore`) |
| Review finding 6 (SSRF normalisation and pinning) | `test/safe-fetch.test.ts`: `::ffff:7f00:1`, `/mapped` redirect, `pinned.test`, DNS inside the deadline |
| Review finding 7 (concurrent stop and duplicates) | `test/pipeline.test.ts` `imp-b` (budget stop, explicit skips, re-dispatch), `imp-i` (infrastructure stop), `imp-d` (per-type lanes with a routed provider) |
| Review finding 8 (derived provenance, per-blank grounding, evidence in alignment) | `test/produce-*.test.ts` derived-criteria cases, `test/quality.test.ts` "present in ev-s2 but the blank cites ev-s1", `test/concepts.test.ts` alignment prompt quote |
| Review finding 9 (retry share) | `apps/cli/test/report.test.ts`: four first-attempt shared calls report 0%; one retry in six reports 1/6 |
| Review/acceptance ruling | `apps/cli/test/review.test.ts`; demo `costPerAcceptedActivityUsdMicro` after one labelled plumbing acceptance |
| Demo deliverables | `/tmp/leap-demo/builds/*.h5p`, `mapping.csv`, `cost.json`, `acceptances.jsonl`, `docs/testing/phase-2-demo.md` |
| Cost per import, shared vs direct, per type, per purpose, retry share, cost per accepted activity | `cost.json` and the printed report (Task 15) |
| Pricing provenance | `packages/generator/src/llm/pricing.ts` (`version`, `effectiveDate`, `source`) and the test that pins them (Task 2) |
| Platform gate separate from quality | New rows for generated packages in `docs/testing/platform-checklist.md` (owner-filled); no test asserts either |

## Deviations from the spec, recorded

- **Storage:** phase 2 persists imports as files through `ImportStore` rather than the §4 Postgres tables; record shapes and statuses follow §4 so phase 5 maps them one to one. `import_cap` consumption (§5 step 7) is not implemented in the CLI (no org accounts yet). An ownership-safe directory lock, ledger tail repair and an input fingerprint checked under the lock stand in for the database's transaction and uniqueness guarantees; atomic renames make single files consistent, not the whole workflow.
- **Sources:** text, markdown and PDF text layers only; web-page ingestion (§11 phase 2) moves to phase 5 with the server; the SSRF guard it needs is built and complete now (normalised classification and a pinned connection).
- **Structured output:** native `output_config.format` instead of the tool-use projection described in §2.2; the JSON Schema is derived from Zod and projected to the API's subset, and the full Zod schema plus refinements are enforced in code as §2.2 requires.
- **Model request settings:** phase 2 disables thinking on Sonnet 5 and sends no sampling parameter (the API rejects them); Haiku 4.5 runs at `temperature: 0`. Adaptive thinking with `effort` is a phase-3 experiment, recorded per revision in `modelConfig.profiles`.
- **Undispatched activities:** an activity skipped by a stop is recorded as `failed` with `error: "skipped: …"` rather than a new status value, so the §4 status set is unchanged; `budget:`, `system:` and `skipped:` failures are re-dispatched on resume, `content:` failures are not.
- **Budget semantics:** spec §4 lists four budget quantities without saying which can be enforced exactly. In phase 2 the request count and the elapsed time (per import, accumulated across runs) are hard limits; spend and tokens are estimated caps, because no local tokenizer for Sonnet 5 exists and the provider charges before the ledger can know the real count. The reservation uses 0.5 tokens per character plus a fixed overhead allowance as calibration constants; every attempt records its overshoot and the demo reports the totals. The `count_tokens` endpoint (one extra request per attempt) is the phase-5 route to exact reservations if the recorded overshoot is material.
- **Review and acceptance:** the records exist from phase 2 and are written from the CLI; the review screen arrives in phase 5. `mapping.csv` says `suggested` until a review exists for the row. The demo's single acceptance is a plumbing check, not the phase-3 gate.
- **Credential owner:** every attempt records `credentialOwner: "server"`; per-org keys (§9) arrive with accounts in phase 5.
