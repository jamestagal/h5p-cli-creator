# Phase 2: First Generation Pipeline Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. The execution workflow is the same as phase 1: one task per dispatch, a review of the diff and verification output between tasks, a commit at each checkpoint, and a whole-branch review at the end. No external tooling is required.

**Goal:** From the command line, turn a PDF (or text) plus a pasted unit of competency into `multiChoice`, `blanks` and `flashcards` activities that are grounded in verified source evidence, aligned (as *suggested*) to performance criteria, compiled through the phase-1 engine into playable `.h5p` files, with a mapping table and a measured, per-attempt cost — all recorded so that every model call is traceable.

**Architecture:** A new `packages/generator` holds the pipeline: `ingest/` (text, markdown, PDF → `SourceDocument` with a text hash and numbered sentence spans), `competency/` (unit text → `UnitOfCompetency`), `concepts/` (chunked extraction with evidence chosen from numbered sentences, quote verification, a merge pass, alignment to criteria), `plan/` (counts by rule, allocation by one model call), `produce/` (one producer per type, prompt → model output schema → `ActivitySpec` with provenance), `quality/` (reference validity, duplicates, per-type answer checks), `llm/` (one `callModel` behind a `ModelProvider` interface, a two-event `AttemptRecorder`, budget reservation, a versioned pricing table, the Anthropic adapter, and replay/recording providers for offline tests) and `pipeline/` (persisted, resumable orchestration over an `ImportStore`). The engine is unchanged except for its opening error-classification task. `apps/cli` gains `leap generate` with a file-based store, `mapping.csv` and a cost report. Storage is a directory of JSON and JSONL files written atomically (temp + rename), because the current `better-sqlite3` requires Node 22 and phase 5 moves the same record shapes to Postgres.

**Tech Stack:** pnpm workspace as in phase 1; TypeScript 5.9 strict ESM; Vitest 3; Zod 4 (`z.toJSONSchema`); `@anthropic-ai/sdk` 0.127 (Messages API, native structured outputs via `output_config.format`, prompt caching); `pdf-parse` 2.4 (`PDFParse` class); `pdf-lib` (dev only, to generate the synthetic PDF fixture); `yargs` 17; Node 20 `fetch`/`dns` for the SSRF guard.

**Spec:** `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§2.2 identity and provenance, §3 packages/generator, §4 data model record shapes, §5 pipeline, §8 cost and metering, §9 security, §10 testing, §11 phase 2). Research the plan relies on: `.superpowers/sdd/phase-2-research-code.md` (legacy prompt material, engine and shared surface) and `.superpowers/sdd/phase-2-research-web.md` (SDK, pricing, pdf-parse, Zod, Node facts with URLs).

## Decisions the spec leaves open for a CLI-first phase 2 (for the owner's review)

| Question | Decision | Why |
|---|---|---|
| Persistence without Postgres | `ImportStore` interface in the generator; `MemoryStore` for tests; `FileStore` in `apps/cli` writing JSON (state) and JSONL (append-only operations and attempts) under the output directory, atomically | `better-sqlite3` 13 requires Node ≥22 (engines gate); JSON files are dependency-free; phase 5 maps the same record shapes to the §4 tables |
| Structured output mechanism | `output_config.format = { type: "json_schema", schema }` (native structured outputs), schema derived from Zod with `additionalProperties: false` and every property required | The docs now frame this as the mechanism for "what Claude says"; forced tool use stays available as a fallback behind the same `ModelProvider` interface |
| Model output schemas vs activity schemas | Separate "model output" Zod schemas with no optionals/defaults/refinements (nullable where needed); code converts them to `ActivitySpec`, assigns ids, attaches provenance, then the full spec parse and the engine validator run | JSON Schema cannot carry refinements; ids are assigned in code (spec §2.2); keeps prompts and cache prefixes stable |
| Web-page ingestion | Deferred to phase 5 (where the server exists); phase 2 ingests text, markdown and PDF text layers | Owner scope for phase 2; the SSRF guard is built now and wired into the only fetch that exists (`apps/cli` image resolver) |
| Prompt caching | 5-minute ephemeral caching on the system block and the concept-map context block; cache writes priced at the 5-minute rate | Sonnet 5 needs ≥1,024 tokens in the cached prefix, Haiku 4.5 ≥4,096; below that the API silently does not cache, and `cache_read_input_tokens` shows whether it did |
| Budget reservation input estimate | `ceil(chars / 3.5)` of the outgoing prompt, marked `estimated`; output reserved at `max_tokens`; reservation replaced by actual usage on completion | A `count_tokens` call per attempt would double the request count; the estimate is conservative |
| Model roles (provisional, §13) | `parseUnit`, `extract`, `merge`, `align`: `claude-haiku-4-5-20251001`; `plan`, `produce`: `claude-sonnet-5` | Spec §8; confirmed by the phase-3 gate, not assumed |
| Synthetic fixtures | A labelled synthetic source (workplace electrical safety), a synthetic unit, a generated PDF of the same text, and hand-authored model responses shaped like the API | Establish pipeline correctness; the real vocational corpus and quality judgement belong to phase 3 and are kept apart |

## Global Constraints

- Node `>=20.19.0 <21` on every new package (`packages/generator`, matching the engine's pin); pnpm 10.33.2; `strict: true` from the first commit under `tsconfig.base.json`; `tsconfig.test.json` type-checks tests as in phase 1.
- Package scope `@leaplearn`; new workspace package `packages/generator`; `apps/cli` extended. `apps/cli-legacy` is frozen and untouched.
- The engine keeps its boundary (no network, `process.env|cwd|exit`, `console`); the **generator** may read `process.env` only in one file (`llm/anthropic-provider.ts` reads `ANTHROPIC_API_KEY` when no key is injected) and never calls `console`; the CLI is the only place that prints.
- **Exactly one call site talks to the Anthropic SDK** (`llm/anthropic-provider.ts`). Every model call goes through `callModel`, which writes an attempt-start record before dispatch and an attempt-outcome record after completion through the injected `AttemptRecorder`. No placeholder content is ever written into a spec or a package.
- **Pricing lives in one file**, `packages/generator/src/llm/pricing.ts`, with `version`, `source` (URL) and `effectiveDate`; every cost row records `pricingVersion`. No rate appears anywhere else in code, tests or this plan except that file and the test that pins it.
- Model IDs live in one file, `packages/generator/src/llm/models.ts`, keyed by role.
- Costs are integers in USD micro-units (`costUsdMicro`); `costStatus` is `known` | `estimated` | `unavailable`; a missing usage never becomes zero cost.
- Provenance: every generated activity and every item carries `provenance` with at least one `evidenceId`; evidence quotes are verified as substrings of the stored text at their offsets (UTF-16 code units, half-open); `assertGeneratedProvenance` from `@leaplearn/shared` runs on every produced spec.
- Text handling (spec §9): HTML-bearing fields (`question`, `taskDescription`) may contain only what `sanitizeHtml` allows; producers are told to emit plain text and the converter wraps it in `<p>` after `escapeHtml`; every other string is plain text.
- Blanks: answers and tips never contain `*`, `/`, `:`; the passage never contains `*`; every answer occurs (case-insensitively) in the evidence text the activity cites.
- Conventional Commits. Attribution reflects who actually wrote the change: a commit authored by a Claude agent ends with the trailer naming that model (`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` etc.); a commit written by a person carries no trailer.
- **Exit codes:** `set -o pipefail` at the start of every shell session; a "passes" claim is valid only when the command's exit status was 0.
- **No real API calls in `pnpm verify`.** Unit and pipeline tests use `FakeProvider` (hand-authored responses, labelled synthetic) or `ReplayProvider` (fixtures recorded from real responses in Task 16). The real API is used only by the demo/record command with an explicit `--record` flag and an API key.
- Platform compatibility claims (h5p.com, Moodle) come only from `docs/testing/platform-checklist.md`, filled by hand; generation-quality claims come only from the phase-3 gate. Neither is asserted by any test in this phase.

## Execution workflow

Execute tasks in order; each ends with a commit. For each task: write the failing test where one is given, run it and see it fail, implement, run the named verification and confirm `exit=0`, then commit. Do not start a task while the previous task's verification is red. Sequential execution by one agent or person per task, with a review of the diff and the verification output between tasks, is the intended mode. Root verification stays `pnpm verify` (build → typecheck → lint → test → engine smoke); Task 16 adds the generator's replay test to it.

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
    models.ts                    model ids by role
    pricing.ts                   versioned pricing table (the only place rates live)
    cost.ts                      computeCost(usage, model) -> { costUsdMicro, costStatus }
    types.ts                     ModelRequest, ModelResponse, Usage, AttemptStart, AttemptOutcome
    schema.ts                    toStrictJsonSchema(zodSchema)
    provider.ts                  ModelProvider interface; ProviderError classification
    anthropic-provider.ts        the only SDK call site
    fake-provider.ts             scripted responses for tests
    replay-provider.ts           ReplayProvider + RecordingProvider (fixtures keyed by request hash)
    budget.ts                    Budget, reservation arithmetic
    call-model.ts                callModel(request, ctx): start record -> dispatch -> outcome record
  net/safe-fetch.ts              SSRF-guarded fetch
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
    types.ts                     ImportStore interface + record types
    memory-store.ts
  pipeline/
    run-import.ts                the steps of §5, resumable
    operations.ts                operation + content-attempt loop + failure categories
packages/generator/test/
  fixtures/synthetic/            SYNTHETIC source, unit, PDF, model responses (see Task 3)
  fixtures/replay/               recorded real responses (Task 16)
  *.test.ts
apps/cli/src/
  generate.ts                    leap generate
  file-store.ts                  FileStore
  report.ts                      mapping.csv + cost report
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

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/test/determinism.test.ts` inside `describe("compile")`:
```ts
  it("validate returns issues (not exceptions) for spec-attributable failures", async () => {
    const missingAsset = await validate(load("flashcards"), new Map(), { registry });
    expect(missingAsset).toEqual([{ path: "cards[1].imageAssetId", message: "asset card is not in the manifest", code: "ASSET_MISSING" }]);

    const badShape = { ...load("multi-choice"), answers: "nope" } as unknown as ActivitySpec;
    const issues = await validate(badShape, new Map(), { registry });
    expect(issues.some((i) => i.code === "SCHEMA" && i.path === "answers")).toBe(true);

    await expect(compileToBuffer(load("flashcards"), new Map(), { registry })).rejects.toMatchObject({ code: "VALIDATION", issues: [{ code: "ASSET_MISSING" }] });
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

Run: `pnpm --filter @leaplearn/engine exec vitest run test/determinism.test.ts test/containers.test.ts`. Expected: the new cases fail (`validate` currently rejects).

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
- Produces (generator): `MODEL_ROLES`, `modelForRole(role)`; `PRICING` (version, source, effectiveDate, per-model rates in USD per million tokens); `computeCost(usage: GenerationUsage | null, model: string): { costUsdMicro: number | null; costStatus: CostStatus; pricingVersion: string }`; the `llm/types.ts` record shapes used by every later task.

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
import { computeCost } from "../src/llm/cost.js";
import { PRICING } from "../src/llm/pricing.js";
import { modelForRole } from "../src/llm/models.js";

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

export const ImportStatus = z.enum(IMPORT_STATUSES);
export const ActivityStatus = z.enum(ACTIVITY_STATUSES);
export const RevisionState = z.enum(REVISION_STATES);
export const CostStatus = z.enum(COST_STATUSES);
export type ImportStatus = z.infer<typeof ImportStatus>;
export type ActivityStatus = z.infer<typeof ActivityStatus>;
export type RevisionState = z.infer<typeof RevisionState>;
export type CostStatus = z.infer<typeof CostStatus>;

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

export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
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
  /** JSON Schema (draft 2020-12) the response must satisfy; the provider enforces it natively. */
  outputSchema: Record<string, unknown>;
  temperature?: number;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal";

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

export interface AttemptStart {
  event: "start";
  attemptId: string;
  operationId: string;
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

### Task 4: LLM core — providers, structured-output schemas, budget, and `callModel` with two-event recording

**Files:**
- Create: `packages/generator/src/llm/schema.ts`, `src/llm/provider.ts`, `src/llm/fake-provider.ts`, `src/llm/replay-provider.ts`, `src/llm/budget.ts`, `src/llm/call-model.ts`
- Test: `packages/generator/test/schema.test.ts`, `test/call-model.test.ts`, `test/replay-provider.test.ts`

**Interfaces:**
- Produces: `toStrictJsonSchema(schema: z.ZodType): Record<string, unknown>` (draft 2020-12; every object gets `additionalProperties: false` and `required` = all properties; throws if a property is optional, has a default, or is unrepresentable — model output schemas must be strict by construction); `ModelProvider { readonly name: "anthropic" | "fake" | "replay"; complete(req: ModelRequest): Promise<ModelResponse> }`; `ProviderError` with `kind: "transient" | "permanent"` and `status?`; `classifyProviderError(err): "transient" | "permanent"`; `FakeProvider(script: Array<ModelResponse | Error>)` (responses consumed in order; records every request in `.requests`); `ReplayProvider(dir)` (looks up `sha256(JSON.stringify({ model, system, cachedContext, user, outputSchema }))` → `<dir>/<hash>.json`; throws `ReplayMissError` naming the purpose when absent); `RecordingProvider(inner, dir)` (delegates and writes the fixture); `Budget { limitUsdMicro, reservedUsdMicro, spentUsdMicro }`, `reserve(budget, req): { ok: true; reservedUsdMicro; reservedInputTokens; reservedOutputTokens } | { ok: false; reason }` (max output tokens × output rate + estimated input × input rate; refuses when reserved+spent+new > limit), `settle(budget, reservedUsdMicro, actualUsdMicro | null)`; `callModel(req, ctx: { provider; recorder; budget; operationId; attempt; clock?; ids? }): Promise<CallResult>` where `CallResult = { kind: "ok"; json: unknown; response; attemptId } | { kind: "content_error"; reason; response; attemptId } | { kind: "transient_error" | "provider_error"; error; attemptId } | { kind: "budget_refused"; reason }`.
- Rules: start record before dispatch; outcome record after completion, always (also on throw); SDK-level retries are the provider's business (Task 5 configures `maxRetries: 2`) — `callModel` retries **nothing** itself; `stop_reason: "max_tokens"` is a `content_error` ("output truncated at N tokens"); `"refusal"` is a `content_error` carrying the explanation; JSON that fails `JSON.parse` is a `content_error`; a `ProviderError` of kind `transient` after the SDK's own retries is `transient_error` (the operation loop in Task 14 decides whether to retry the attempt); everything else is `provider_error`.

- [ ] **Step 1: Failing tests**

`packages/generator/test/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toStrictJsonSchema } from "../src/llm/schema.js";

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
  it("does not carry refinements (they are enforced in code after parsing)", () => {
    const s = toStrictJsonSchema(z.object({ n: z.number() }).refine((o) => o.n > 1));
    expect(JSON.stringify(s)).not.toMatch(/refine/);
  });
});
```

`packages/generator/test/call-model.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { callModel } from "../src/llm/call-model.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget } from "../src/llm/budget.js";
import { toStrictJsonSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import { computeCost } from "../src/llm/cost.js";
import type { AttemptEvent, AttemptRecorder, ModelRequest } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder {
  events: AttemptEvent[] = [];
  startedBeforeDispatch = false;
  constructor(private readonly provider?: FakeProvider) {}
  async recordStart(s: AttemptEvent & { event: "start" }) { this.startedBeforeDispatch = (this.provider?.requests.length ?? 0) === 0; this.events.push(s); }
  async recordOutcome(o: AttemptEvent & { event: "outcome" }) { this.events.push(o); }
}

const req = (): ModelRequest => ({ purpose: "produce", model: modelForRole("produce"), system: "sys", user: "make one", maxOutputTokens: 500, outputSchema: toStrictJsonSchema(z.object({ ok: z.boolean() })) });
const ctx = (provider: FakeProvider, recorder = new MemoryRecorder(), limitUsdMicro = 10_000_000) => ({ provider, recorder, budget: createBudget(limitUsdMicro), operationId: "op-1", attempt: 1, clock: () => new Date("2026-09-19T00:00:00Z"), ids: () => "att-1" });

describe("callModel", () => {
  it("records start before dispatch and outcome after, with cost from the pricing table", async () => {
    const usage = { inputTokens: 120, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify({ ok: true }), usage, providerRequestId: "req_1" })]);
    const recorder = new MemoryRecorder(provider);
    const result = await callModel(req(), ctx(provider, recorder));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.json).toEqual({ ok: true });
    expect(recorder.events.map((e) => e.event)).toEqual(["start", "outcome"]);
    const start = recorder.events[0] as AttemptEvent & { event: "start" };
    expect(start.reservedOutputTokens).toBe(500);
    expect(start.reservedUsdMicro).toBeGreaterThan(0);
    const outcome = recorder.events[1] as AttemptEvent & { event: "outcome" };
    expect(outcome).toMatchObject({ status: "ok", providerRequestId: "req_1", inputTokens: 120, outputTokens: 30, costStatus: "known", pricingVersion: expect.any(String) });
    expect(outcome.costUsdMicro).toBe(computeCost(usage, modelForRole("produce")).costUsdMicro);
    expect(recorder.startedBeforeDispatch).toBe(true);
  });
  it("classifies max_tokens and refusal as content errors and still records the outcome", async () => {
    const provider = new FakeProvider([fakeResponse({ stopReason: "max_tokens", outputText: "{\"ok\":" }), fakeResponse({ stopReason: "refusal", outputText: undefined })]);
    const recorder = new MemoryRecorder();
    const a = await callModel(req(), ctx(provider, recorder));
    expect(a).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/truncated/) });
    const b = await callModel(req(), ctx(provider, recorder));
    expect(b).toMatchObject({ kind: "content_error", reason: expect.stringMatching(/refus/) });
    expect(recorder.events.filter((e) => e.event === "outcome").map((e) => (e as AttemptEvent & { event: "outcome" }).status)).toEqual(["content_error", "content_error"]);
  });
  it("records a missing usage as unavailable, never zero", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}", usage: null, rawUsage: null })]);
    const recorder = new MemoryRecorder();
    await callModel(req(), ctx(provider, recorder));
    const outcome = recorder.events[1] as AttemptEvent & { event: "outcome" };
    expect(outcome).toMatchObject({ costUsdMicro: null, costStatus: "unavailable", inputTokens: null });
  });
  it("turns a transient provider error into transient_error with an outcome record, and keeps the reservation released", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529)]);
    const recorder = new MemoryRecorder();
    const c = ctx(provider, recorder);
    const r = await callModel(req(), c);
    expect(r.kind).toBe("transient_error");
    expect((recorder.events[1] as AttemptEvent & { event: "outcome" }).status).toBe("transient_error");
    expect(c.budget.reservedUsdMicro).toBe(0);
  });
  it("refuses to dispatch when the reservation would exceed the budget, recording nothing", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" })]);
    const recorder = new MemoryRecorder();
    const r = await callModel(req(), ctx(provider, recorder, 10));
    expect(r).toMatchObject({ kind: "budget_refused" });
    expect(recorder.events).toEqual([]);
    expect(provider.requests).toEqual([]);
  });
  it("accounts reservations across concurrent in-flight attempts", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"ok\":true}" }), fakeResponse({ outputText: "{\"ok\":true}" })]);
    const c = ctx(provider, new MemoryRecorder(), 0);
    const one = c.budget;
    const perCall = (await import("../src/llm/budget.js")).reserve(createBudget(1e12), req());
    if (!perCall.ok) throw new Error("unexpected");
    one.limitUsdMicro = perCall.reservedUsdMicro * 1.5;
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
import { toStrictJsonSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";

const req = { purpose: "extract" as const, model: modelForRole("extract"), system: "s", user: "u", maxOutputTokens: 10, outputSchema: toStrictJsonSchema(z.object({ a: z.number() })) };

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

function tighten(node: unknown, path: string): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;
  if (obj["type"] === "object" && obj["properties"] && typeof obj["properties"] === "object") {
    const props = obj["properties"] as Record<string, unknown>;
    const names = Object.keys(props);
    const required = new Set((obj["required"] as string[] | undefined) ?? []);
    for (const name of names) {
      if (!required.has(name)) throw new Error(`model output schema property ${path}${name} is optional; model output schemas must have every property required (use a nullable type instead)`);
      const p = props[name] as Record<string, unknown>;
      if ("default" in p) throw new Error(`model output schema property ${path}${name} has a default; defaults belong to the activity schema, not the model output`);
    }
    obj["additionalProperties"] = false;
    obj["required"] = names;
    for (const name of names) tighten(props[name], `${path}${name}.`);
  }
  for (const key of ["items", "anyOf", "oneOf", "allOf"] as const) {
    const v = obj[key];
    if (Array.isArray(v)) v.forEach((x, i) => tighten(x, `${path}${key}[${i}].`));
    else if (v) tighten(v, `${path}${key}.`);
  }
  if (obj["$defs"] && typeof obj["$defs"] === "object") for (const [k, v] of Object.entries(obj["$defs"] as Record<string, unknown>)) tighten(v, `${path}$defs.${k}.`);
}

/** Draft 2020-12 JSON Schema for native structured outputs: closed objects, all properties required, no defaults. Refinements are not represented and are enforced by parsing the response in code. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "throw", io: "output" }) as Record<string, unknown>;
  tighten(json, "");
  return json;
}
```
If Zod 4 emits `default` for `.default()` fields under `io: "output"` or marks optionals differently, adjust the two detection lines so the two "refuses" tests pass; the rule (no optionals, no defaults) is the requirement, the detection is the implementation.

`packages/generator/src/llm/provider.ts`:
```ts
import type { ModelRequest, ModelResponse } from "./types.js";

export interface ModelProvider {
  readonly name: "anthropic" | "fake" | "replay";
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly kind: "transient" | "permanent", public readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}
```

`packages/generator/src/llm/fake-provider.ts`:
```ts
import type { ModelProvider } from "./provider.js";
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

  constructor(private readonly script: Array<ModelResponse | Error>) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
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
import type { ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse } from "./types.js";

export function requestKey(request: ModelRequest): string {
  const { model, system, cachedContext, user, outputSchema, maxOutputTokens } = request;
  return createHash("sha256").update(JSON.stringify({ model, system, cachedContext: cachedContext ?? null, user, outputSchema, maxOutputTokens })).digest("hex");
}

export class ReplayMissError extends Error {
  constructor(request: ModelRequest, key: string) {
    super(`no recorded response for purpose ${request.purpose} (model ${request.model}, key ${key.slice(0, 12)}); run with --record to capture it`);
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
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.inner.complete(request);
    await mkdir(this.dir, { recursive: true });
    const key = requestKey(request);
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), request: { purpose: request.purpose, model: request.model, maxOutputTokens: request.maxOutputTokens, userPreview: request.user.slice(0, 200) }, response }, null, 2) + "\n");
    return response;
  }
}
```

`packages/generator/src/llm/budget.ts`:
```ts
import { estimateInputTokens } from "./cost.js";
import { PRICING } from "./pricing.js";
import type { ModelRequest } from "./types.js";

export interface Budget { limitUsdMicro: number; reservedUsdMicro: number; spentUsdMicro: number; }

export function createBudget(limitUsdMicro: number): Budget {
  return { limitUsdMicro, reservedUsdMicro: 0, spentUsdMicro: 0 };
}

export type Reservation = { ok: true; reservedUsdMicro: number; reservedInputTokens: number; reservedOutputTokens: number } | { ok: false; reason: string };

/** Reserves the attempt's maximum possible spend against the budget in one synchronous step (no await between check and update). */
export function reserve(budget: Budget, request: ModelRequest): Reservation {
  const rates = PRICING.models[request.model];
  if (!rates) throw new Error(`no pricing for model ${request.model} (pricing version ${PRICING.version})`); // configuration error, not a budget refusal
  const reservedInputTokens = estimateInputTokens(request.system + (request.cachedContext ?? "") + request.user);
  const reservedOutputTokens = request.maxOutputTokens;
  const reservedUsdMicro = Math.ceil((reservedInputTokens * rates.inputPerMTok + reservedOutputTokens * rates.outputPerMTok) / 1_000_000 * 1_000_000);
  const projected = budget.spentUsdMicro + budget.reservedUsdMicro + reservedUsdMicro;
  if (projected > budget.limitUsdMicro) {
    return { ok: false, reason: `budget: reserving ${reservedUsdMicro} µUSD would bring the import to ${projected} µUSD, above the limit of ${budget.limitUsdMicro} µUSD` };
  }
  budget.reservedUsdMicro += reservedUsdMicro;
  return { ok: true, reservedUsdMicro, reservedInputTokens, reservedOutputTokens };
}

/** Replaces a reservation with the actual cost; an unknown cost keeps the reservation as spent so an unbilled-looking attempt never frees budget. */
export function settle(budget: Budget, reservedUsdMicro: number, actualUsdMicro: number | null): void {
  budget.reservedUsdMicro -= reservedUsdMicro;
  budget.spentUsdMicro += actualUsdMicro ?? reservedUsdMicro;
}
```
The transient-error test expects `reservedUsdMicro` back to 0 — `settle` is called on every path, with `null` on a failure without usage (the reservation becomes spent, which is the conservative reading of "may have been billed").

`packages/generator/src/llm/call-model.ts`:
```ts
import { randomUUID } from "node:crypto";
import { computeCost } from "./cost.js";
import { reserve, settle, type Budget } from "./budget.js";
import { ProviderError, type ModelProvider } from "./provider.js";
import type { AttemptOutcome, AttemptRecorder, AttemptStatus, ModelRequest, ModelResponse } from "./types.js";

export interface CallContext {
  provider: ModelProvider;
  recorder: AttemptRecorder;
  budget: Budget;
  operationId: string;
  attempt: number;
  clock?: () => Date;
  ids?: () => string;
}

export type CallResult =
  | { kind: "ok"; json: unknown; response: ModelResponse; attemptId: string }
  | { kind: "content_error"; reason: string; response: ModelResponse; attemptId: string }
  | { kind: "transient_error" | "provider_error"; error: string; attemptId: string }
  | { kind: "budget_refused"; reason: string };

function interpret(response: ModelResponse): { status: AttemptStatus; json?: unknown; reason?: string } {
  if (response.stopReason === "refusal") return { status: "content_error", reason: "the model refused the request" };
  if (response.stopReason === "max_tokens") return { status: "content_error", reason: "output truncated at the max_tokens limit; the request needs a smaller task or a larger limit" };
  if (response.outputText === undefined) return { status: "content_error", reason: "the response carried no structured output" };
  try {
    return { status: "ok", json: JSON.parse(response.outputText) };
  } catch (err) {
    return { status: "content_error", reason: `structured output is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The only path to a model: reserve budget, record the start, dispatch, record the outcome (always), settle the budget. Never retries. */
export async function callModel(request: ModelRequest, ctx: CallContext): Promise<CallResult> {
  const now = ctx.clock ?? (() => new Date());
  const reservation = reserve(ctx.budget, request);
  if (!reservation.ok) return { kind: "budget_refused", reason: reservation.reason };

  const attemptId = (ctx.ids ?? randomUUID)();
  await ctx.recorder.recordStart({
    event: "start", attemptId, operationId: ctx.operationId, attempt: ctx.attempt, purpose: request.purpose, provider: ctx.provider.name, model: request.model,
    credentialOwner: "server", reservedInputTokens: reservation.reservedInputTokens, reservedOutputTokens: reservation.reservedOutputTokens, reservedUsdMicro: reservation.reservedUsdMicro, startedAt: now().toISOString()
  });
  const started = Date.now();
  let response: ModelResponse | undefined;
  let failure: { status: AttemptStatus; error: string } | undefined;
  try {
    response = await ctx.provider.complete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failure = { status: err instanceof ProviderError && err.kind === "transient" ? "transient_error" : "provider_error", error: message };
  }

  const usage = response?.usage ?? null;
  const cost = computeCost(usage, request.model);
  const interpreted = response ? interpret(response) : undefined;
  const status: AttemptStatus = failure ? failure.status : interpreted!.status;
  const outcome: AttemptOutcome = {
    event: "outcome", attemptId, operationId: ctx.operationId,
    providerRequestId: response?.providerRequestId ?? null,
    rawUsage: response?.rawUsage ?? null,
    inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, cacheReadTokens: usage?.cacheReadTokens ?? null, cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    latencyMs: response?.latencyMs ?? Date.now() - started,
    pricingVersion: cost.pricingVersion, costUsdMicro: cost.costUsdMicro, costStatus: cost.costStatus,
    stopReason: response?.stopReason ?? null,
    status, error: failure?.error ?? interpreted?.reason ?? null,
    completedAt: now().toISOString()
  };
  await ctx.recorder.recordOutcome(outcome);
  settle(ctx.budget, reservation.reservedUsdMicro, cost.costUsdMicro);

  if (failure) return { kind: failure.status === "transient_error" ? "transient_error" : "provider_error", error: failure.error, attemptId };
  if (interpreted!.status === "ok") return { kind: "ok", json: interpreted!.json, response: response!, attemptId };
  return { kind: "content_error", reason: interpreted!.reason ?? "content error", response: response!, attemptId };
}
```
Append to `src/index.ts`: `export * from "./llm/schema.js"; export * from "./llm/provider.js"; export * from "./llm/replay-provider.js"; export * from "./llm/budget.js"; export * from "./llm/call-model.js";` (`fake-provider.ts` stays test-only: tests import it by relative path and it is not part of the package's public surface).

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): callModel with two-event attempt records, budget reservation, strict output schemas, fake and replay providers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: The Anthropic adapter, with contract tests derived from the verified SDK facts

The only file that imports `@anthropic-ai/sdk`. Contract tests inject a fake client and assert the exact request the adapter builds and the exact mapping of the response, so the facts from `.superpowers/sdd/phase-2-research-web.md` §1 are pinned in code: `system` and cached context blocks carry `cache_control: { type: "ephemeral" }`; structured output is requested with `output_config.format = { type: "json_schema", schema }`; `usage.input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens` map to `GenerationUsage`; `_request_id` is the provider request id; `stop_reason` passes through; SDK retries are left at 2 (408, 409, 429, ≥500 and connection errors) and a timeout is set; `APIError` statuses classify as transient (408, 409, 429, ≥500) or permanent (400, 401, 403, 404, 422), `APIConnectionError` as transient.

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
import { toStrictJsonSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import type { ModelRequest } from "../src/llm/types.js";

const schema = toStrictJsonSchema(z.object({ ok: z.boolean() }));
const request: ModelRequest = { purpose: "extract", model: modelForRole("extract"), system: "SYSTEM", cachedContext: "CONTEXT", user: "USER", maxOutputTokens: 321, outputSchema: schema, temperature: 0.2 };

describe("anthropic adapter contract", () => {
  it("builds a Messages request with cached system and context blocks and native structured output", () => {
    const params = buildMessageParams(request);
    expect(params).toEqual({
      model: modelForRole("extract"),
      max_tokens: 321,
      temperature: 0.2,
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [
        { type: "text", text: "CONTEXT", cache_control: { type: "ephemeral" } },
        { type: "text", text: "USER" }
      ] }],
      output_config: { format: { type: "json_schema", schema } }
    });
    const noContext = buildMessageParams({ ...request, cachedContext: undefined, temperature: undefined });
    expect((noContext["messages"] as Array<{ content: unknown[] }>)[0]!.content).toHaveLength(1);
    expect(noContext).not.toHaveProperty("temperature");
  });

  it("maps usage, request id, stop reason and the JSON text block", () => {
    const message = {
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-4-5-20251001", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: "{\"ok\":true}" }],
      usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
      _request_id: "req_abc"
    };
    expect(mapMessage(message, 87)).toEqual({
      providerRequestId: "req_abc", model: "claude-haiku-4-5-20251001", stopReason: "end_turn", outputText: "{\"ok\":true}",
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

  it("calls the client with maxRetries 2 and the configured timeout", async () => {
    const create = vi.fn().mockResolvedValue({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }], usage: { input_tokens: 1, output_tokens: 1 }, _request_id: "req_1" });
    const provider = createAnthropicProvider({ client: { messages: { create } }, timeoutMs: 120_000 });
    const response = await provider.complete(request);
    expect(create).toHaveBeenCalledWith(buildMessageParams(request), { maxRetries: 2, timeout: 120_000 });
    expect(response.providerRequestId).toBe("req_1");
    expect(provider.name).toBe("anthropic");
  });

  it("classifies SDK errors by status", () => {
    const apiError = (status: number) => new Anthropic.APIError(status, { error: { type: "x", message: "m" } }, "m", new Headers());
    expect(classifyProviderError(apiError(429)).kind).toBe("transient");
    expect(classifyProviderError(apiError(529)).kind).toBe("transient");
    expect(classifyProviderError(apiError(408)).kind).toBe("transient");
    expect(classifyProviderError(apiError(400)).kind).toBe("permanent");
    expect(classifyProviderError(apiError(401)).kind).toBe("permanent");
    expect(classifyProviderError(new Anthropic.APIConnectionError({ message: "socket hang up" })).kind).toBe("transient");
    expect(classifyProviderError(new Error("weird")).kind).toBe("permanent");
  });

  it("wraps client failures as ProviderError so callModel can classify them", async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIError(500, { error: { type: "api_error", message: "boom" } }, "boom", new Headers()));
    const provider = createAnthropicProvider({ client: { messages: { create } } });
    await expect(provider.complete(request)).rejects.toMatchObject({ name: "ProviderError", kind: "transient", status: 500 });
  });

  it("requires an api key when no client is injected", () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try { expect(() => createAnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/); } finally { if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved; }
  });
});
```
If `Anthropic.APIError`'s constructor signature in 0.127 differs from `(status, error, message, headers)`, construct the errors the way the installed `index.d.ts` declares and keep the assertions; the classification rule is the requirement.

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/llm/anthropic-provider.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { GenerationUsage } from "@leaplearn/shared";
import { ProviderError, type ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse, StopReason } from "./types.js";

export interface MessagesClient {
  messages: { create(params: Record<string, unknown>, requestOptions?: { maxRetries?: number; timeout?: number }): Promise<unknown> };
}

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function buildMessageParams(request: ModelRequest): Record<string, unknown> {
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
  if (request.temperature !== undefined) params["temperature"] = request.temperature;
  return params;
}

interface RawUsage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; [k: string]: unknown; }
interface RawMessage { model?: string; stop_reason?: string | null; content?: Array<{ type: string; text?: string }>; usage?: RawUsage; _request_id?: string | null; }

function toUsage(raw: RawUsage | undefined): GenerationUsage | null {
  if (!raw || typeof raw.input_tokens !== "number" || typeof raw.output_tokens !== "number") return null;
  return { inputTokens: raw.input_tokens, outputTokens: raw.output_tokens, cacheReadTokens: raw.cache_read_input_tokens ?? 0, cacheWriteTokens: raw.cache_creation_input_tokens ?? 0 };
}

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

export function classifyProviderError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(err.message, "transient");
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    const transient = status !== undefined && (TRANSIENT_STATUSES.has(status) || status >= 500);
    return new ProviderError(err.message, transient ? "transient" : "permanent", status);
  }
  return new ProviderError(err instanceof Error ? err.message : String(err), "permanent");
}

/** The only place the Anthropic SDK is called. SDK retries stay at their default of 2 (408/409/429/5xx/connection errors); callModel never retries. */
export function createAnthropicProvider(options: { apiKey?: string; client?: MessagesClient; timeoutMs?: number } = {}): ModelProvider {
  let client = options.client;
  if (!client) {
    const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new ProviderError("ANTHROPIC_API_KEY is not set and no api key was injected", "permanent");
    client = new Anthropic({ apiKey }) as unknown as MessagesClient;
  }
  const requestOptions = { maxRetries: 2, timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  return {
    name: "anthropic",
    async complete(request) {
      const started = Date.now();
      let message: unknown;
      try {
        message = await client!.messages.create(buildMessageParams(request), requestOptions);
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

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`. Also confirm the boundary: `grep -rn "@anthropic-ai/sdk" packages/generator/src | grep -v anthropic-provider.ts` prints nothing, and `grep -rn "process\.env" packages/generator/src` prints only the one line in `anthropic-provider.ts`.

```bash
git add packages/generator
git commit -m "feat(generator): Anthropic adapter with contract tests for request shape, usage mapping and error classification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: SSRF-guarded fetch, wired into the only network fetch that exists

The owner's rule: SSRF protection is implemented and tested before any server-side URL fetching. Phase 2 has no server, but `apps/cli`'s `networkImageResolver` fetches arbitrary URLs behind `--allow-network`, so it switches to `safeFetch` now, and the phase-5 web ingestion and preview origin will reuse the same guard.

**Files:**
- Create: `packages/generator/src/net/safe-fetch.ts`
- Modify: `apps/cli/src/image-resolver.ts`, `apps/cli/package.json` (add `@leaplearn/generator` dependency)
- Test: `packages/generator/test/safe-fetch.test.ts`, `apps/cli/test/image-resolver.test.ts` (adjust)

**Interfaces:**
- Produces: `safeFetch(url: string, options?: SafeFetchOptions): Promise<SafeFetchResult>` with `SafeFetchOptions = { maxRedirects?: number (5); maxBytes?: number (10 MiB); timeoutMs?: number (15 000); allowedContentTypes?: string[]; lookup?: (hostname) => Promise<string[]>; unsafeAllowPrivateNetworks?: boolean (false; test-only) }`, `SafeFetchResult = { status: number; contentType: string | null; body: Buffer; finalUrl: string }`; `isBlockedAddress(ip: string): boolean` (IPv4: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `224/4`, `240/4`; IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:` mapped IPv4 checked as IPv4); `SafeFetchError` with `reason: "scheme" | "blocked_address" | "dns" | "too_many_redirects" | "redirect_target" | "timeout" | "too_large" | "content_type" | "http"`.
- Rules: only `http:` and `https:`; the hostname is resolved with `dns.promises.lookup(host, { all: true })` and every address must pass `isBlockedAddress` (an IP-literal host is checked directly); `redirect: "manual"`; each `Location` is resolved against the current URL, re-validated (scheme, address) and counted; the body is read incrementally and aborted past `maxBytes`; `AbortSignal.timeout(timeoutMs)` bounds each hop. Residual risk recorded in a comment: the connection made by `fetch` resolves the name again, so a DNS answer that changes between the check and the connect (rebinding) is not caught; phase 5 pins the connection to the checked address with an undici `Agent` when the server exists.

- [ ] **Step 1: Failing tests**

`packages/generator/test/safe-fetch.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { isBlockedAddress, safeFetch, SafeFetchError } from "../src/net/safe-fetch.js";

let server: Server; let base: string; const timers: NodeJS.Timeout[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/ok") { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(Buffer.alloc(1024, 1)); return; }
    if (url.pathname === "/big") { res.writeHead(200, { "content-type": "application/octet-stream" }); res.end(Buffer.alloc(200_000, 2)); return; }
    if (url.pathname === "/hop") { res.writeHead(302, { location: "/ok" }); res.end(); return; }
    if (url.pathname === "/loop") { res.writeHead(302, { location: "/loop" }); res.end(); return; }
    if (url.pathname === "/metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
    if (url.pathname === "/slow") { timers.push(setTimeout(() => { res.writeHead(200); res.end("late"); }, 2000)); return; }
    if (url.pathname === "/html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<p>"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { for (const t of timers) clearTimeout(t); server.close(); });

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, metadata, multicast and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"]) expect(isBlockedAddress(ip), ip).toBe(true);
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111", "203.0.113.5"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
});

describe("safeFetch", () => {
  const allow = { unsafeAllowPrivateNetworks: true };
  it("rejects non-http schemes and loopback targets by default", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toMatchObject({ reason: "scheme" });
    await expect(safeFetch(`${base}/ok`)).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://localhost/ok")).rejects.toMatchObject({ reason: "blocked_address" });
  });
  it("fetches, follows a relative redirect, and reports the final url (private networks allowed for the test server only)", async () => {
    const r = await safeFetch(`${base}/hop`, { ...allow, allowedContentTypes: ["image/jpeg"] });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1024);
    expect(r.finalUrl).toBe(`${base}/ok`);
  });
  it("re-validates every redirect target", async () => {
    await expect(safeFetch(`${base}/metadata`, allow)).rejects.toMatchObject({ reason: "redirect_target" });
    await expect(safeFetch(`${base}/loop`, { ...allow, maxRedirects: 3 })).rejects.toMatchObject({ reason: "too_many_redirects" });
  });
  it("caps the body size, the time, and the content type", async () => {
    await expect(safeFetch(`${base}/big`, { ...allow, maxBytes: 100_000 })).rejects.toMatchObject({ reason: "too_large" });
    await expect(safeFetch(`${base}/slow`, { ...allow, timeoutMs: 200 })).rejects.toMatchObject({ reason: "timeout" });
    await expect(safeFetch(`${base}/html`, { ...allow, allowedContentTypes: ["image/jpeg", "image/png"] })).rejects.toMatchObject({ reason: "content_type" });
    await expect(safeFetch(`${base}/missing`, allow)).rejects.toMatchObject({ reason: "http", status: 404 });
  });
  it("uses the injected lookup and blocks a public name that resolves privately", async () => {
    await expect(safeFetch("http://example.test/ok", { lookup: async () => ["10.0.0.5"] })).rejects.toMatchObject({ reason: "blocked_address" });
  });
});
```
The metadata redirect test relies on `169.254.169.254` being blocked even when `unsafeAllowPrivateNetworks` is true — the metadata address is always blocked (a separate rule), which is also the behaviour the code below implements.

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/net/safe-fetch.ts`:
```ts
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export type SafeFetchReason = "scheme" | "blocked_address" | "dns" | "too_many_redirects" | "redirect_target" | "timeout" | "too_large" | "content_type" | "http";

export class SafeFetchError extends Error {
  constructor(message: string, public readonly reason: SafeFetchReason, public readonly status?: number) { super(message); this.name = "SafeFetchError"; }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
  lookup?: (hostname: string) => Promise<string[]>;
  /** Test-only escape hatch (a loopback test server); never set it in application code. The metadata address stays blocked. */
  unsafeAllowPrivateNetworks?: boolean;
}
export interface SafeFetchResult { status: number; contentType: string | null; body: Buffer; finalUrl: string; }

const METADATA_V4 = "169.254.169.254";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const BLOCKED_V4: Array<[string, number]> = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]];

function expandV6(ip: string): number[] | null {
  const [head, tail] = ip.split("::");
  const parse = (s: string | undefined): number[] => (s ? s.split(":").filter(Boolean).map((h) => parseInt(h, 16)) : []);
  const h = parse(head); const t = parse(tail);
  const zeros = 8 - h.length - t.length;
  return zeros < 0 ? null : [...h, ...Array<number>(zeros).fill(0), ...t];
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
  if (family !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isBlockedAddress(mapped[1]!);
  const groups = expandV6(ip);
  if (!groups) return true;
  const first = groups[0]!;
  if (groups.every((g) => g === 0)) return true;                         // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((first & 0xfe00) === 0xfc00) return true;                          // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true;                          // fe80::/10
  return false;
}

async function assertAllowedHost(url: URL, options: SafeFetchOptions, reason: "blocked_address" | "redirect_target"): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError(`unsupported scheme ${url.protocol}`, reason === "redirect_target" ? "redirect_target" : "scheme");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = options.lookup ? await options.lookup(host) : (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch (err) {
      throw new SafeFetchError(`cannot resolve ${host}: ${err instanceof Error ? err.message : String(err)}`, "dns");
    }
    if (addresses.length === 0) throw new SafeFetchError(`no addresses for ${host}`, "dns");
  }
  for (const a of addresses) {
    if (a === METADATA_V4 || a === `::ffff:${METADATA_V4}`) throw new SafeFetchError(`${host} resolves to the metadata address`, reason);
    if (!options.unsafeAllowPrivateNetworks && isBlockedAddress(a)) throw new SafeFetchError(`${host} resolves to a blocked address ${a}`, reason);
  }
}

async function readCapped(res: Response, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const chunks: Buffer[] = []; let total = 0;
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    if (signal.aborted) throw new SafeFetchError("timed out while reading the body", "timeout");
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new SafeFetchError(`body exceeds ${maxBytes} bytes`, "too_large"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches a URL for application code with SSRF controls: http(s) only; every hostname resolved and
 * checked against private, loopback, link-local, metadata and multicast ranges before connecting;
 * redirects followed manually and re-checked; per-hop timeout; capped body. Residual risk: the
 * connection resolves the name again, so an answer that changes between check and connect is not
 * caught here; the phase-5 server pins the connection to the checked address.
 */
export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let url: URL;
  try { url = new URL(input); } catch { throw new SafeFetchError(`invalid url ${input}`, "scheme"); }
  await assertAllowedHost(url, options, "blocked_address");

  for (let hop = 0; ; hop++) {
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal, headers: { accept: options.allowedContentTypes?.join(", ") ?? "*/*" } });
    } catch (err) {
      if (signal.aborted) throw new SafeFetchError(`timed out after ${timeoutMs} ms fetching ${url.href}`, "timeout");
      throw new SafeFetchError(`fetch failed for ${url.href}: ${err instanceof Error ? err.message : String(err)}`, "http");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new SafeFetchError(`redirect without location from ${url.href}`, "http", res.status);
      if (hop + 1 > maxRedirects) throw new SafeFetchError(`more than ${maxRedirects} redirects from ${input}`, "too_many_redirects");
      const next = new URL(location, url);
      await assertAllowedHost(next, options, "redirect_target");
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
    const body = await readCapped(res, maxBytes, signal);
    return { status: res.status, contentType, body, finalUrl: url.href };
  }
}
```
Append `export * from "./net/safe-fetch.js";` to `src/index.ts`.

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
`apps/cli/package.json` adds `"@leaplearn/generator": "workspace:*"`. The existing `apps/cli/test/image-resolver.test.ts` fetches from a `127.0.0.1` test server, which the guard now blocks: change that test to assert the loopback fetch is rejected with `/blocked address/`, and add a second case that passes an injected-lookup-free public-looking URL only through the `generator`'s own tests (already covered above). The CLI test therefore proves the wiring, the generator test proves the behaviour.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator build && pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/cli test && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"`. Expected `exit=0`. Manual check: `node apps/cli/dist/index.js flashcards apps/cli-legacy/tests/flash1.csv /tmp/flash1.h5p --allow-network; echo "exit=$?"` still builds when the network is available (pixabay is public), and `leap flashcards` with an image URL pointing at `http://127.0.0.1/…` now fails with `blocked address`.

```bash
git add packages/generator apps/cli pnpm-lock.yaml
git commit -m "feat(generator): SSRF-guarded safeFetch; route the CLI image resolver through it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Stage runner with content-attempt feedback, the system prompt tables, model-output schemas, and unit parsing

Every later stage calls the model through one `StageRunner.run({ request, schema, verify })`: it dispatches through `callModel`, parses the JSON with the stage's Zod schema, runs the stage's `verify` (reference validity, answer checks), and on a **content failure** feeds the reasons back into the next attempt, up to three attempts; a **transient** provider failure is retried without consuming a content attempt (at most three in a row, with 1 s / 2 s / 4 s waits, injectable); a **permanent** provider failure or a budget refusal ends the operation without regeneration (spec §5).

**Files:**
- Create: `packages/generator/src/llm/runner.ts`, `src/prompts/system.ts`, `src/schemas/model-output.ts`, `src/competency/parse-unit.ts`
- Test: `packages/generator/test/runner.test.ts`, `test/system-prompt.test.ts`, `test/parse-unit.test.ts`

**Interfaces:**
- Produces: `StageCall<T> = { request: ModelRequest; schema: z.ZodType<T>; verify?: (value: T) => string[] | Promise<string[]> }`; `StageRunner { run<T>(call: StageCall<T>): Promise<StageResult<T>> }` with `StageResult<T> = { value: T; attempts: number; attemptIds: string[] }`; `ContentFailure` (`reasons: string[]`, `attempts`), `BudgetRefused`, `InfrastructureFailure` (all `Error` subclasses with `name`); `createRunner(options: { provider; recorder; budget; operationId; maxContentAttempts?: 3; maxTransientRetries?: 3; sleep?: (ms) => Promise<void>; ids?; clock? }): StageRunner`; `FEEDBACK_HEADER = "YOUR PREVIOUS ATTEMPT WAS REJECTED FOR THESE REASONS:"`.
- Produces (prompts): `READING_LEVELS`, `TONES` (the legacy tables verbatim), `GROUNDING_RULES`, `buildSystemPrompt(config: PromptConfig): string` where `PromptConfig = { readingLevel: ReadingLevel; tone: Tone; language: string; instructionalLanguage?: string; customisation?: string }`; defaults for generation: `readingLevel: "high-school"`, `tone: "educational"`, `language: "en"`.
- Produces (schemas): strict Zod objects (no optionals, no defaults) `UnitOut`, `ConceptsOut`, `MergeOut`, `AlignmentOut`, `PlanOut`, `MultiChoiceOut`, `BlanksOut`, `FlashcardsOut`, each with a `…Schema` JSON export produced once by `toStrictJsonSchema`.
- Produces (competency): `parseUnit(unitText: string, runner: StageRunner): Promise<UnitOfCompetency>`; ids assigned in code from the numbers the model returns (`E1`, `PC1.1`), by position when a number is not numeric; `textHash` of the trimmed unit text.

- [ ] **Step 1: Failing tests**

`packages/generator/test/runner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createRunner, ContentFailure, BudgetRefused, InfrastructureFailure, FEEDBACK_HEADER } from "../src/llm/runner.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { ProviderError } from "../src/llm/provider.js";
import { createBudget } from "../src/llm/budget.js";
import { toStrictJsonSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";
import type { AttemptEvent, AttemptRecorder } from "../src/llm/types.js";

class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }
const Out = z.object({ n: z.number() });
const call = (verify?: (v: { n: number }) => string[]) => ({ request: { purpose: "produce" as const, model: modelForRole("produce"), system: "s", user: "u", maxOutputTokens: 100, outputSchema: toStrictJsonSchema(Out) }, schema: Out, verify });
const mk = (provider: FakeProvider, recorder = new MemoryRecorder()) => createRunner({ provider, recorder, budget: createBudget(10_000_000), operationId: "op", sleep: async () => undefined });

describe("stage runner", () => {
  it("feeds schema and verify failures back and succeeds within three content attempts", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":\"x\"}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":3}" })]);
    const recorder = new MemoryRecorder();
    const result = await mk(provider, recorder).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])));
    expect(result).toMatchObject({ value: { n: 3 }, attempts: 3 });
    expect(provider.requests[1]?.user).toContain(FEEDBACK_HEADER);
    expect(provider.requests[2]?.user).toContain("n must be positive");
    expect(provider.requests[2]?.user).not.toContain("Invalid input"); // only the latest reasons are fed back
    expect(recorder.events.filter((e) => e.event === "outcome")).toHaveLength(3);
  });
  it("fails as ContentFailure after the third rejected attempt, carrying every reason", async () => {
    const provider = new FakeProvider([fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":0}" }), fakeResponse({ outputText: "{\"n\":9}" })]);
    await expect(mk(provider).run(call((v) => (v.n > 0 ? [] : ["n must be positive"])))).rejects.toMatchObject({ name: "ContentFailure", attempts: 3 });
    expect(provider.requests).toHaveLength(3);
  });
  it("retries transient provider failures without consuming a content attempt", async () => {
    const provider = new FakeProvider([new ProviderError("overloaded", "transient", 529), new ProviderError("overloaded", "transient", 529), fakeResponse({ outputText: "{\"n\":1}" })]);
    const recorder = new MemoryRecorder();
    const result = await mk(provider, recorder).run(call());
    expect(result.attempts).toBe(1);
    expect(recorder.events.filter((e) => e.event === "outcome").map((e) => (e as AttemptEvent & { event: "outcome" }).status)).toEqual(["transient_error", "transient_error", "ok"]);
  });
  it("stops on a permanent provider failure and on a budget refusal without regeneration", async () => {
    await expect(mk(new FakeProvider([new ProviderError("bad key", "permanent", 401)])).run(call())).rejects.toBeInstanceOf(InfrastructureFailure);
    const runner = createRunner({ provider: new FakeProvider([fakeResponse({ outputText: "{\"n\":1}" })]), recorder: new MemoryRecorder(), budget: createBudget(1), operationId: "op", sleep: async () => undefined });
    await expect(runner.run(call())).rejects.toBeInstanceOf(BudgetRefused);
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
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(10_000_000), operationId: "op-unit", sleep: async () => undefined });
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
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(10_000_000), operationId: "op-unit", sleep: async () => undefined });
    await expect(parseUnit("SYNELE001 …", runner)).rejects.toMatchObject({ name: "ContentFailure" });
  });
});
```

- [ ] **Step 2: Run to see them fail**, then implement.

`packages/generator/src/llm/runner.ts`:
```ts
import type { z } from "zod";
import { callModel, type CallContext } from "./call-model.js";
import type { Budget } from "./budget.js";
import type { ModelProvider } from "./provider.js";
import type { AttemptRecorder, ModelRequest } from "./types.js";

export interface StageCall<T> { request: ModelRequest; schema: z.ZodType<T>; verify?: (value: T) => string[] | Promise<string[]>; }
export interface StageResult<T> { value: T; attempts: number; attemptIds: string[]; }
export interface StageRunner { run<T>(call: StageCall<T>): Promise<StageResult<T>>; }

export class ContentFailure extends Error {
  constructor(public readonly reasons: string[], public readonly attempts: number) { super(`content rejected after ${attempts} attempt(s): ${reasons.join("; ")}`); this.name = "ContentFailure"; }
}
export class BudgetRefused extends Error { constructor(reason: string) { super(reason); this.name = "BudgetRefused"; } }
export class InfrastructureFailure extends Error { constructor(message: string) { super(message); this.name = "InfrastructureFailure"; } }

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
}

function withFeedback(request: ModelRequest, reasons: string[]): ModelRequest {
  const base = request.user.split(`\n\n${FEEDBACK_HEADER}`)[0]!;
  return { ...request, user: `${base}\n\n${FEEDBACK_HEADER}\n${reasons.map((r) => `- ${r}`).join("\n")}\nReturn a corrected, complete response.` };
}

function zodReasons(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** One operation's dispatch loop (spec §5 step 5): content failures feed back, transient failures retry, everything else stops. */
export function createRunner(options: RunnerOptions): StageRunner {
  const maxContent = options.maxContentAttempts ?? 3;
  const maxTransient = options.maxTransientRetries ?? 3;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  return {
    async run<T>(call: StageCall<T>): Promise<StageResult<T>> {
      let request = call.request;
      let attempt = 0;
      let transientInARow = 0;
      const attemptIds: string[] = [];
      let lastReasons: string[] = [];
      while (attempt < maxContent) {
        const ctx: CallContext = { provider: options.provider, recorder: options.recorder, budget: options.budget, operationId: options.operationId, attempt: attempt + 1 };
        if (options.ids) ctx.ids = options.ids;
        if (options.clock) ctx.clock = options.clock;
        const result = await callModel(request, ctx);
        if (result.kind === "budget_refused") throw new BudgetRefused(result.reason);
        if (result.kind === "provider_error") throw new InfrastructureFailure(result.error);
        if (result.kind === "transient_error") {
          attemptIds.push(result.attemptId);
          if (++transientInARow > maxTransient) throw new InfrastructureFailure(`provider unavailable after ${maxTransient} transient failures: ${result.error}`);
          await sleep(TRANSIENT_WAITS_MS[Math.min(transientInARow - 1, TRANSIENT_WAITS_MS.length - 1)]!);
          continue;
        }
        transientInARow = 0;
        attempt += 1;
        attemptIds.push(result.attemptId);
        if (result.kind === "content_error") { lastReasons = [result.reason]; request = withFeedback(request, lastReasons); continue; }
        const parsed = call.schema.safeParse(result.json);
        if (!parsed.success) { lastReasons = zodReasons(parsed.error); request = withFeedback(request, lastReasons); continue; }
        const issues = call.verify ? await call.verify(parsed.data) : [];
        if (issues.length > 0) { lastReasons = issues; request = withFeedback(request, lastReasons); continue; }
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
import { toStrictJsonSchema } from "../llm/schema.js";

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
  blanks: z.array(z.object({ answers: z.array(z.string()), tip: z.string().nullable(), evidenceIds: z.array(z.string()) })),
  evidenceIds: z.array(z.string())
});
export const FlashcardsOut = z.object({
  title: z.string(), description: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string(), tip: z.string().nullable(), evidenceIds: z.array(z.string()) })),
  evidenceIds: z.array(z.string())
});
export type UnitOut = z.infer<typeof UnitOut>; export type ConceptsOut = z.infer<typeof ConceptsOut>; export type MergeOut = z.infer<typeof MergeOut>; export type AlignmentOut = z.infer<typeof AlignmentOut>; export type PlanOut = z.infer<typeof PlanOut>; export type MultiChoiceOut = z.infer<typeof MultiChoiceOut>; export type BlanksOut = z.infer<typeof BlanksOut>; export type FlashcardsOut = z.infer<typeof FlashcardsOut>;

export const UnitOutSchema = toStrictJsonSchema(UnitOut);
export const ConceptsOutSchema = toStrictJsonSchema(ConceptsOut);
export const MergeOutSchema = toStrictJsonSchema(MergeOut);
export const AlignmentOutSchema = toStrictJsonSchema(AlignmentOut);
export const PlanOutSchema = toStrictJsonSchema(PlanOut);
export const MultiChoiceOutSchema = toStrictJsonSchema(MultiChoiceOut);
export const BlanksOutSchema = toStrictJsonSchema(BlanksOut);
export const FlashcardsOutSchema = toStrictJsonSchema(FlashcardsOut);
```

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
    request: { purpose: "parseUnit", model: modelForRole("parseUnit"), system: SYSTEM, user: `UNIT TEXT:\n${trimmed}`, maxOutputTokens: 4000, outputSchema: UnitOutSchema, temperature: 0 },
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
git commit -m "feat(generator): stage runner with content-attempt feedback, system prompt tables, strict model-output schemas and unit parsing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Concept extraction with verified evidence, merging across chunks, and alignment

**Files:**
- Create: `packages/generator/src/concepts/chunk.ts`, `src/concepts/verify.ts`, `src/concepts/extract.ts`, `src/concepts/merge.ts`, `src/concepts/align.ts`, `src/concepts/index.ts`
- Test: `packages/generator/test/concepts.test.ts`

**Interfaces:**
- Produces: `Chunk { chunkIndex; sentences: Sentence[]; estimatedTokens }`; `chunkSentences(sentences, budgetTokens): Chunk[]` (greedy, sentence boundaries, a sentence above the budget gets its own chunk); `evidenceForSentence(doc, sentenceId): Evidence` (`evidenceId = "ev-" + sentenceId`, quote = sentence text, offsets = sentence span); `verifyEvidence(text, evidence): string | null` (null when `text.slice(charStart, charEnd) === quote`); `ChunkConcept { tempId; name; summary; evidence: Evidence[] }`; `extractChunkConcepts(doc, chunk, runner, opts): Promise<ChunkConcept[]>`; `mergeConcepts(chunkConcepts, runner): Promise<Concept[]>` (ids `c1…` in merged order; a single chunk skips the model call); `alignConcepts(concepts, unit, runner): Promise<Alignment>`; `extractConceptMap(doc, unit | null, runner, opts: { chunkTokens?: number (6000); promptConfig? }): Promise<ConceptMap>`.
- Rules: the model chooses sentence ids from a numbered list; every returned id must be in the chunk (verify issue otherwise); evidence is rebuilt in code from the sentence and verified against the stored text; merging requires every temp id assigned exactly once; alignment requires every criterion exactly once; unsupported criteria are those with no concepts.

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
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(50_000_000), operationId: "op-concepts", sleep: async () => undefined });

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
  });
  it("rejects sentence ids outside the chunk as a content failure with feedback", async () => {
    const doc = await ingestMarkdown("One sentence here. Second sentence here.", { sourceId: "src" });
    const bad = fakeResponse({ outputText: JSON.stringify({ concepts: [{ name: "x", summary: "y", sentenceIds: ["s99"] }] }) });
    const provider = new FakeProvider([bad, bad, bad]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(50_000_000), operationId: "op", sleep: async () => undefined });
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
    request: { purpose: "extract", model: modelForRole("extract"), system: buildSystemPrompt(options.promptConfig ?? DEFAULT_PROMPT_CONFIG), user: `${TASK(max)}\n\nEVIDENCE:\n${numberedSentences(chunk)}`, maxOutputTokens: 3000, outputSchema: ConceptsOutSchema, temperature: 0 },
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
    request: { purpose: "merge", model: modelForRole("merge"), system: SYSTEM, user: `CONCEPTS BY PART:\n${listing}\n\nReturn the consolidated concept list; each input id appears in exactly one memberIds list.`, maxOutputTokens: 3000, outputSchema: MergeOutSchema, temperature: 0 },
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

const SYSTEM = "You map performance criteria from a unit of competency to concepts extracted from a source document. A criterion is supported by a concept only when the concept's evidence would help a learner meet that criterion. Return every criterion exactly once; an empty conceptIds list means the source does not support that criterion. This is a suggested alignment for revision activities, not an assessment judgement.";

export async function alignConcepts(concepts: Concept[], unit: UnitOfCompetency, runner: StageRunner): Promise<Alignment> {
  const criteria = criteriaOf(unit);
  const criterionIds = new Set(criteria.map((c) => c.id));
  const conceptIds = new Set(concepts.map((c) => c.conceptId));
  const user = `UNIT ${unit.code} ${unit.title}\nCRITERIA:\n${criteria.map((c) => `- ${c.id}: ${c.text}`).join("\n")}\n\nCONCEPTS:\n${concepts.map((c) => `- ${c.conceptId}: ${c.name} — ${c.summary}`).join("\n")}\n\nReturn one entry per criterion id, with the concept ids that support it (possibly none).`;
  const { value } = await runner.run({
    request: { purpose: "align", model: modelForRole("align"), system: SYSTEM, user, maxOutputTokens: 2000, outputSchema: AlignmentOutSchema, temperature: 0 },
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
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(10_000_000), operationId: "op-plan", sleep: async () => undefined });
    const plan = await planActivities(map, ["multiChoice", "blanks", "flashcards"], runner);
    expect(plan.map((p) => p.activityId)).toEqual(["act-1", "act-2", "act-3", "act-4", "act-5", "act-6", "act-7"]);
    expect(plan[6]).toMatchObject({ type: "flashcards", conceptIds: ["c1", "c2", "c3"] });
    expect(provider.requests[0]?.user).toContain("PC3.2 (unsupported by the source)");
  });
  it("rejects a plan whose slots or ids do not match", async () => {
    const bad = { activities: [{ slot: 1, type: "multiChoice", conceptIds: ["c9"], criteriaIds: ["PC2.1"], focus: "x" }] };
    const provider = new FakeProvider(Array.from({ length: 3 }, () => fakeResponse({ outputText: JSON.stringify(bad) })));
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(10_000_000), operationId: "op-plan", sleep: async () => undefined });
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
    request: { purpose: "plan", model: modelForRole("plan"), system: SYSTEM, user, maxOutputTokens: 3000, outputSchema: PlanOutSchema, temperature: 0 },
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

Pure functions the producers and the pipeline call (spec §3 `quality/`): reference validity, markup, exact/near-duplicate detection, and the per-type answer checks for the three phase-2 types.

**Files:**
- Create: `packages/generator/src/quality/checks.ts`
- Test: `packages/generator/test/quality.test.ts`

**Interfaces:**
- Produces: `normaliseText(s): string` (lowercase, letters/digits/spaces only, collapsed whitespace); `wordSet(s): Set<string>`; `jaccard(a, b): number`; `isNearDuplicate(a, b, threshold = 0.8): boolean` (exact normalised match or Jaccard ≥ threshold); `checkReferences(ids: { evidenceIds: string[]; conceptIds: string[]; criteriaIds: string[] }, allowed: { evidence: Set<string>; concepts: Set<string>; criteria: Set<string> }, where: string): string[]`; `checkPlainText(value: string, where: string): string[]` (rejects `<…>` tags, markdown emphasis/heading markers, and empty strings); `checkMultiChoice(out: MultiChoiceOut): string[]` (2–8 answers; exactly one correct; distinct normalised answer texts; non-empty question; every string plain text); `checkBlanks(out: BlanksOut, evidenceText: string): string[]` (1–5 blanks; the passage contains `{{b1}}…{{bN}}` each exactly once and no other `{{…}}`; ≥ 8 words outside tokens; no `*` in the passage; no `*`, `/`, `:` in answers or tips; every answer occurs in `normaliseText(evidenceText)` as a whole-word phrase); `checkFlashcards(out: FlashcardsOut, min, max): string[]` (card count within bounds; distinct normalised fronts; back ≠ front; plain text); `checkAgainstExisting(kind: "question" | "passage" | "front", candidate: string, existing: string[]): string[]` (near-duplicate across the import).

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
  it("blanks: tokens, delimiters, and passage-grounded answers", () => {
    const evidence = "Only the worker who applied a lock may remove it. A tag names the worker, the date and the reason.";
    const ok = { title: "T", taskDescription: "Fill the gaps.", passage: "Only the {{b1}} who applied a lock may remove it, and the tag names the {{b2}}.", blanks: [{ answers: ["worker"], tip: null, evidenceIds: ["ev-s1"] }, { answers: ["date", "reason"], tip: "on the tag", evidenceIds: ["ev-s2"] }], evidenceIds: ["ev-s1", "ev-s2"] };
    expect(checkBlanks(ok, evidence)).toEqual([]);
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} and {{b1}}." }, evidence)).toContain("token {{b1}} must appear exactly once");
    expect(checkBlanks({ ...ok, passage: "Only the {{b1}} 5* rated {{b2}}." }, evidence)).toContain("passage must not contain *");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["1/2"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidence)).toContain("blank 1 answer contains a forbidden character (* / :)");
    expect(checkBlanks({ ...ok, blanks: [{ answers: ["electrician"], tip: null, evidenceIds: ["ev-s1"] }, ok.blanks[1]!] }, evidence)).toContain('blank 1 answer "electrician" does not occur in the cited evidence');
    expect(checkBlanks({ ...ok, passage: "{{b1}} {{b2}}" }, evidence)).toContain("passage needs at least 8 words around the blanks");
  });
  it("flashcards: bounds, distinct fronts, back differs from front", () => {
    const card = (front: string, back: string) => ({ front, back, tip: null, evidenceIds: ["ev-s1"] });
    const ok = { title: "T", description: "d", cards: [card("Spanner", "Tightens hex nuts"), card("Saw", "Cuts timber"), card("Tag", "Names the worker"), card("Lock", "Prevents closing an isolator")], evidenceIds: ["ev-s1"] };
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

export function checkBlanks(out: BlanksOut, evidenceText: string): string[] {
  const issues = [...checkPlainText(out.title, "title"), ...checkPlainText(out.taskDescription, "taskDescription")];
  if (out.blanks.length < 1 || out.blanks.length > 5) issues.push("between 1 and 5 blanks are required");
  if (out.passage.includes("*")) issues.push("passage must not contain *");
  const counts = new Map<string, number>();
  for (const m of out.passage.matchAll(TOKEN)) counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  out.blanks.forEach((_, i) => { const id = `b${i + 1}`; const n = counts.get(id) ?? 0; if (n !== 1) issues.push(`token {{${id}}} must appear exactly once`); });
  for (const id of counts.keys()) if (!/^b\d+$/.test(id) || Number(id.slice(1)) > out.blanks.length) issues.push(`unexpected token {{${id}}}`);
  const words = out.passage.replace(TOKEN, " ").split(/\s+/).filter(Boolean);
  if (words.length < 8) issues.push("passage needs at least 8 words around the blanks");
  const haystack = ` ${normaliseText(evidenceText)} `;
  out.blanks.forEach((b, i) => {
    if (b.answers.length === 0) issues.push(`blank ${i + 1} has no answers`);
    for (const a of b.answers) {
      if (FORBIDDEN.some((ch) => a.includes(ch))) issues.push(`blank ${i + 1} answer contains a forbidden character (* / :)`);
      else if (!haystack.includes(` ${normaliseText(a)} `)) issues.push(`blank ${i + 1} answer "${a}" does not occur in the cited evidence`);
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
git commit -m "feat(generator): quality checks for references, markup, near-duplicates and the three phase-2 types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Producer contract and the `multiChoice` producer

A producer takes one `ActivityPlan` entry, the concept map and the source document, prompts the model with the cited evidence, converts the model output into an `ActivitySpec` with ids and provenance assigned in code, runs the quality checks and the engine's `validate()` inside the runner's `verify` (so failures feed back), and returns the spec. New prompts are written against the shared schemas with evidence-id grounding required; the legacy multiple-choice prompt is not reused (it has no grounding rule and asks for a bare JSON array).

**Files:**
- Create: `packages/generator/src/produce/producer.ts`, `src/produce/multi-choice.ts`, `src/produce/index.ts`
- Test: `packages/generator/test/produce-multi-choice.test.ts`

**Interfaces:**
- Produces: `ProduceInput { plan: ActivityPlan; map: ConceptMap; unit: UnitOfCompetency | null; promptConfig: PromptConfig; language: string; existing: { questions: string[]; passages: string[]; fronts: string[] }; rules: PlanRules }`; `EngineHandle { registry: LibraryRegistry }`; `Producer { type; produce(input, runner, engine): Promise<Produced> }` with `Produced = { spec: ActivitySpec; attempts: number; attemptIds: string[] }`; helpers `evidenceBlock(map, conceptIds): { text: string; allowed: AllowedRefs; evidenceText: string }` (lists `[ev-s12] quote` per concept; `evidenceText` is the concatenated quotes; `allowed.criteria` is the alignment's criterion ids, or null without a unit), `paragraph(text)` (= `<p>${escapeHtml(text)}</p>`), `engineIssues(spec, registry): Promise<string[]>` (calls `validate` from `@leaplearn/engine` with an empty asset manifest and formats issues as `path: message`), `createProducers(): Map<PlannedType, Producer>`; `PROMPT_VERSION = "2026-09-19.1"` exported from `prompts/system.ts` (bump when any prompt text changes).
- MultiChoice conversion: `id = plan.activityId`, `title`, `question = paragraph(out.question)`, `answers[].text` plain, `feedbackChosen = out.answers[].feedback` when non-empty, `randomAnswers: true`, `language`, `provenance = { conceptIds: plan.conceptIds, evidenceIds: out.evidenceIds, criteriaIds: plan.criteriaIds }`.

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

const text = "Only the worker who applied a lock may remove it. A tag names the worker, the date and the reason.";
const map: ConceptMap = { sourceId: "src", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "Lockout and tagout", summary: "s", evidence: [
  { evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 50, quote: "Only the worker who applied a lock may remove it." },
  { evidenceId: "ev-s2", sentenceId: "s2", charStart: 51, charEnd: 101, quote: "A tag names the worker, the date and the reason." }
] }] };
const input = { plan: { activityId: "act-1", slot: 1, type: "multiChoice" as const, conceptIds: ["c1"], criteriaIds: ["PC2.1"], focus: "who removes a lock" }, map, unit: null, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", existing: { questions: [], passages: [], fronts: [] }, rules: DEFAULT_PLAN_RULES };
const good = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The last person to leave", correct: false, feedback: "" }], evidenceIds: ["ev-s1"] };
const mk = (script: ReturnType<typeof fakeResponse>[]) => { const provider = new FakeProvider(script); return { provider, runner: createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget(10_000_000), operationId: "op-act-1", sleep: async () => undefined }) }; };

describe("multiChoice producer", () => {
  it("prompts with the cited evidence, converts to a spec with ids and provenance, and passes engine validation", async () => {
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("multiChoice")!.produce(input, runner, { registry });
    expect(produced.spec).toMatchObject({ id: "act-1", type: "multiChoice", title: "Removing a lock", question: "<p>Who may remove a lockout device from an isolator?</p>", randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    if (produced.spec.type === "multiChoice") { expect(produced.spec.answers[0]).toEqual({ text: "The worker who applied it", correct: true, feedbackChosen: "Only the worker who applied a lock may remove it." }); expect(produced.spec.answers[1]).toEqual({ text: "Any supervisor", correct: false }); }
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
    const req = provider.requests[0]!;
    expect(req.purpose).toBe("produce");
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

/** The evidence the model may cite: every sentence of every planned concept, listed under its concept. */
export function evidenceBlock(map: ConceptMap, conceptIds: string[]): { text: string; allowed: AllowedRefs; evidenceText: string } {
  const concepts = map.concepts.filter((c) => conceptIds.includes(c.conceptId));
  const evidence = new Set<string>(); const quotes: string[] = [];
  const lines = concepts.map((c) => {
    const rows = c.evidence.map((e) => { evidence.add(e.evidenceId); quotes.push(e.quote); return `[${e.evidenceId}] ${e.quote}`; });
    return `CONCEPT ${c.conceptId}: ${c.name}\n${c.summary}\n${rows.join("\n")}`;
  });
  const criteria = map.alignment ? new Set(map.alignment.criteria.map((c) => c.criterionId)) : null;
  return { text: `EVIDENCE (cite these ids):\n${lines.join("\n\n")}`, allowed: { evidence, concepts: new Set(concepts.map((c) => c.conceptId)), criteria }, evidenceText: quotes.join(" ") };
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
import { criteriaBlock, engineIssues, evidenceBlock, paragraph, tryConvert, type EngineHandle, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE multiple-choice revision question from the evidence.
- The question tests understanding of the focus, not recall of exact wording.
- Give 3 or 4 answer options; exactly one is correct; the others are plausible misconceptions a learner might hold.
- feedback for the correct answer restates the evidence in one sentence; feedback for a wrong answer explains briefly why it is wrong (may be empty).
- Plain text only. Cite in evidenceIds the evidence sentence ids the question and correct answer rely on.`;

export function toMultiChoiceSpec(out: MultiChoiceOut, input: ProduceInput): MultiChoiceSpec {
  const answers = out.answers.map((a) => (a.feedback.trim() ? { text: a.text.trim(), correct: a.correct, feedbackChosen: a.feedback.trim() } : { text: a.text.trim(), correct: a.correct }));
  return ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "multiChoice", language: input.language,
    question: paragraph(out.question), answers, randomAnswers: true,
    provenance: { conceptIds: input.plan.conceptIds, evidenceIds: [...new Set(out.evidenceIds)], criteriaIds: input.plan.criteriaIds }
  }) as MultiChoiceSpec;
}

export const multiChoiceProducer: Producer = {
  type: "multiChoice",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      request: {
        purpose: "produce", model: modelForRole("produce"),
        system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text,
        user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`,
        maxOutputTokens: 1500, outputSchema: MultiChoiceOutSchema, temperature: 0.4
      },
      schema: MultiChoiceOut,
      verify: async (out) => {
        const issues = [
          ...checkMultiChoice(out),
          ...checkReferences({ evidenceIds: out.evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the question"),
          ...checkAgainstExisting("question", out.question, input.existing.questions)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toMultiChoiceSpec(out, input));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toMultiChoiceSpec(value, input), attempts, attemptIds };
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
Add to `prompts/system.ts`: `export const PROMPT_VERSION = "2026-09-19.1";` and append `export * from "./produce/index.js";` to `src/index.ts`.

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
- Produces: `blanksProducer: Producer` and `toBlanksSpec(out, input): BlanksSpec` (`id = plan.activityId`; `taskDescription = escapeHtml(out.taskDescription)` — the engine's blanks handler adds the `<p>` wrapper; `passage` plain text with `{{bN}}`; blanks `id: b<N>` by position with `answers`, `tip` (omitted when null) and item provenance `{ conceptIds: plan.conceptIds, evidenceIds: blank.evidenceIds, criteriaIds: plan.criteriaIds }`; `caseSensitive: false`; activity provenance from `out.evidenceIds`).

- [ ] **Step 1: Failing test**

`packages/generator/test/produce-blanks.test.ts` (same harness as Task 11's test: `map`, `mk`, `registry`, `input` with `type: "blanks"`, `activityId: "act-4"`):
```ts
const good = {
  title: "Locks and tags", taskDescription: "Complete the sentences about lockout and tagout.",
  passage: "Only the {{b1}} who applied a lock may remove it. A tag names the worker, the {{b2}} and the reason for the isolation.",
  blanks: [{ answers: ["worker"], tip: "the person, not the role", evidenceIds: ["ev-s1"] }, { answers: ["date"], tip: null, evidenceIds: ["ev-s2"] }],
  evidenceIds: ["ev-s1", "ev-s2"]
};
describe("blanks producer", () => {
  it("converts to a BlanksSpec with positional blank ids, item provenance and escaped task description", async () => {
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry });
    expect(produced.spec.type).toBe("blanks");
    if (produced.spec.type !== "blanks") return;
    expect(produced.spec.taskDescription).toBe("Complete the sentences about lockout and tagout."); // the engine's blanks handler wraps it in <p>
    expect(produced.spec.blanks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(produced.spec.blanks[0]).toEqual({ id: "b1", answers: ["worker"], tip: "the person, not the role", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.blanks[1]).not.toHaveProperty("tip");
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
  });
  it("rejects an answer that is not in the cited evidence and a passage with *", async () => {
    const ungrounded = { ...good, blanks: [{ ...good.blanks[0]!, answers: ["electrician"] }, good.blanks[1]!] };
    const star = { ...good, passage: good.passage.replace("A tag", "A 5* tag") };
    const { provider, runner } = mk([fakeResponse({ outputText: JSON.stringify(ungrounded) }), fakeResponse({ outputText: JSON.stringify(star) }), fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("blanks")!.produce({ ...input, plan: { ...input.plan, activityId: "act-4", type: "blanks" } }, runner, { registry });
    expect(produced.attempts).toBe(3);
    expect(provider.requests[1]?.user).toContain('answer "electrician" does not occur in the cited evidence');
    expect(provider.requests[2]?.user).toContain("passage must not contain *");
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
import { criteriaBlock, engineIssues, evidenceBlock, tryConvert, type EngineHandle, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE fill-in-the-blanks revision passage from the evidence.
- The passage is 2 to 4 sentences of plain text that closely follows the evidence, with 2 to 4 blanks written as {{b1}}, {{b2}}, ... in order of appearance, each exactly once.
- Each blank removes a key term or value that appears word-for-word in the evidence; list that exact wording in answers (add a second accepted spelling only if it also appears in the evidence).
- Never use the characters * / : in answers or tips, and never put * in the passage.
- tip is a short hint or null. Cite in each blank's evidenceIds the sentence the answer comes from, and in the top-level evidenceIds every sentence the passage relies on.`;

export function toBlanksSpec(out: BlanksOut, input: ProduceInput): BlanksSpec {
  const blanks = out.blanks.map((b, i) => {
    const item: Record<string, unknown> = { id: `b${i + 1}`, answers: b.answers.map((a) => a.trim()), provenance: { conceptIds: input.plan.conceptIds, evidenceIds: [...new Set(b.evidenceIds)], criteriaIds: input.plan.criteriaIds } };
    if (b.tip !== null && b.tip.trim()) item["tip"] = b.tip.trim();
    return item;
  });
  return ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "blanks", language: input.language,
    taskDescription: escapeHtml(out.taskDescription.trim()), passage: out.passage.trim(), blanks, caseSensitive: false,
    provenance: { conceptIds: input.plan.conceptIds, evidenceIds: [...new Set(out.evidenceIds)], criteriaIds: input.plan.criteriaIds }
  }) as BlanksSpec;
}

export const blanksProducer: Producer = {
  type: "blanks",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      request: { purpose: "produce", model: modelForRole("produce"), system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text, user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`, maxOutputTokens: 1500, outputSchema: BlanksOutSchema, temperature: 0.3 },
      schema: BlanksOut,
      verify: async (out) => {
        const issues = [
          ...checkBlanks(out, evidence.evidenceText),
          ...checkReferences({ evidenceIds: out.evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the passage"),
          ...out.blanks.flatMap((b, i) => checkReferences({ evidenceIds: b.evidenceIds, conceptIds: [], criteriaIds: [] }, evidence.allowed, `blank ${i + 1}`)),
          ...checkAgainstExisting("passage", out.passage, input.existing.passages)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toBlanksSpec(out, input));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toBlanksSpec(value, input), attempts, attemptIds };
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
- Produces: `flashcardsProducer: Producer` and `toFlashcardsSpec(out, input): FlashcardsSpec` (`id = plan.activityId`; `description` plain (omitted when empty); cards `id: c<N>` by position with `front`, `back`, `tip` (omitted when null) and item provenance from each card's `evidenceIds`; card count bounds from `input.rules.flashcards`).

- [ ] **Step 1: Failing test**

`packages/generator/test/produce-flashcards.test.ts` (same harness as Task 11 — one concept `c1` with two evidence sentences, which the four cards cite between them; `activityId: "act-7"`, `type: "flashcards"`):
```ts
const card = (front: string, back: string, ev: string) => ({ front, back, tip: null, evidenceIds: [ev] });
const good = { title: "Key terms", description: "Isolation vocabulary.", cards: [card("Lockout device", "A padlock or hasp that physically prevents an isolator from being closed", "ev-s1"), card("Tag", "A warning label naming the worker, the date and the reason", "ev-s2"), card("Who may remove a lock", "Only the worker who applied it", "ev-s1"), card("Tag without a lock", "A warning, not a control", "ev-s2")], evidenceIds: ["ev-s1", "ev-s2"] };
describe("flashcards producer", () => {
  it("converts to a FlashcardsSpec with positional card ids and per-card provenance", async () => {
    const { runner } = mk([fakeResponse({ outputText: JSON.stringify(good) })]);
    const produced = await createProducers().get("flashcards")!.produce({ ...input, plan: { ...input.plan, activityId: "act-7", type: "flashcards" } }, runner, { registry });
    if (produced.spec.type !== "flashcards") throw new Error("type");
    expect(produced.spec.cards.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(produced.spec.cards[1]).toEqual({ id: "c2", front: "Tag", back: "A warning label naming the worker, the date and the reason", provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s2"], criteriaIds: ["PC2.1"] } });
    expect(produced.spec.description).toBe("Isolation vocabulary.");
    expect(() => assertGeneratedProvenance(produced.spec)).not.toThrow();
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
import { criteriaBlock, engineIssues, evidenceBlock, tryConvert, type EngineHandle, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = (min: number, max: number) => `Write a set of ${min} to ${max} revision flashcards from the evidence.
- front is a term, question or prompt (short); back is the answer or definition in one or two sentences drawn from the evidence; tip is an optional hint or null.
- Fronts are distinct; no two cards test the same idea.
- Plain text only. Cite in each card's evidenceIds the sentence(s) the card is based on, and in the top-level evidenceIds every sentence used.`;

export function toFlashcardsSpec(out: FlashcardsOut, input: ProduceInput): FlashcardsSpec {
  const cards = out.cards.map((c, i) => {
    const item: Record<string, unknown> = { id: `c${i + 1}`, front: c.front.trim(), back: c.back.trim(), provenance: { conceptIds: input.plan.conceptIds, evidenceIds: [...new Set(c.evidenceIds)], criteriaIds: input.plan.criteriaIds } };
    if (c.tip !== null && c.tip.trim()) item["tip"] = c.tip.trim();
    return item;
  });
  const spec: Record<string, unknown> = { id: input.plan.activityId, title: out.title.trim(), type: "flashcards", language: input.language, cards, provenance: { conceptIds: input.plan.conceptIds, evidenceIds: [...new Set(out.evidenceIds)], criteriaIds: input.plan.criteriaIds } };
  if (out.description.trim()) spec["description"] = out.description.trim();
  return ActivitySpec.parse(spec) as FlashcardsSpec;
}

export const flashcardsProducer: Producer = {
  type: "flashcards",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const { cardsMin, cardsMax } = input.rules.flashcards;
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      request: { purpose: "produce", model: modelForRole("produce"), system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text, user: `${TASK(cardsMin, cardsMax)}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`, maxOutputTokens: 3000, outputSchema: FlashcardsOutSchema, temperature: 0.4 },
      schema: FlashcardsOut,
      verify: async (out) => {
        const issues = [
          ...checkFlashcards(out, cardsMin, cardsMax),
          ...checkReferences({ evidenceIds: out.evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the card set"),
          ...out.cards.flatMap((c, i) => checkReferences({ evidenceIds: c.evidenceIds, conceptIds: [], criteriaIds: [] }, evidence.allowed, `card ${i + 1}`)),
          ...out.cards.flatMap((c) => checkAgainstExisting("front", c.front, input.existing.fronts))
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toFlashcardsSpec(out, input));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toFlashcardsSpec(value, input), attempts, attemptIds };
  }
};
```
Register it in `createProducers()`; the map now holds all three phase-2 producers.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): flashcards producer with per-card provenance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: The import store, the resumable pipeline, and operations with failure categories

The orchestration of spec §5 for the CLI: every step persists its artefact so a rerun skips finished work; every activity is one operation with an idempotency key; content failures regenerate (inside the runner), transient failures retry, infrastructure failures stop the import; the terminal status follows the §4 rules; attempt starts without outcomes are reconciled as billing-uncertain on restart.

**Files:**
- Create: `packages/generator/src/store/types.ts`, `src/store/memory-store.ts`, `src/pipeline/operations.ts`, `src/pipeline/run-import.ts`, `src/pipeline/index.ts`
- Modify: `packages/generator/src/concepts/index.ts` (per-chunk persistence hook)
- Test: `packages/generator/test/helpers/synthetic.ts`, `packages/generator/test/pipeline.test.ts`

**Interfaces:**
- Records (spec §4, tenancy fields kept): `ImportRecord { importId; orgId; name; sourceType; status: ImportStatus; customisation: string | null; language; unitTextHash: string | null; selectedTypes: PlannedType[]; budget: { limitUsdMicro }; budgetUsed: { spentUsdMicro; reservedUsdMicro }; error: string | null; idempotencyKey; createdAt; updatedAt }`; `ActivityRecord { activityId; importId; type; order; status: ActivityStatus; currentRevision: number | null; conceptIds; criteriaIds; error: string | null; dropped: boolean }`; `RevisionRecord { activityId; revision; state: RevisionState; spec: ActivitySpec; schemaVersion; promptVersion; modelConfig: { provider; models: Record<string, string> }; engineFingerprint; note: string | null; buildKey: string | null; attemptIds: string[]; createdAt }`; `OperationRecord { operationId; importId; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed"; idempotencyKey; contentAttempts; outcome: string | null; billingUncertain: boolean; startedAt; completedAt: string | null }`.
- `ImportStore`: `getImport(importId)`, `putImport(record)`; `getArtifact<T>(importId, name: ArtifactName)`, `putArtifact(importId, name, value)` with `ArtifactName = "source" | "unit" | "conceptMap" | "plan" | \`chunk-${number}\``; `listActivities(importId)`, `putActivity(record)`; `getRevision(activityId, revision)`, `listRevisions(activityId)`, `putRevision(record)`; `listOperations(importId)`, `putOperation(record)`; `recorderFor(importId): AttemptRecorder`; `listAttempts(importId): Promise<AttemptEvent[]>`; `putBuild(importId, activityId, revision, bytes): Promise<string>` (returns the build key), `getBuild(buildKey): Promise<Buffer | null>`.
- `MemoryStore implements ImportStore` (maps; builds kept as Buffers).
- `extractConceptMap(doc, unit, runner, options)` gains `options.chunkCache?: { get(index): Promise<ChunkConcept[] | null>; put(index, concepts): Promise<void> }`; when present, finished chunks are reused on rerun.
- `runImport(input: RunImportInput, deps: RunImportDeps): Promise<ImportRecord>` with `RunImportInput = { importId; name; source: SourceDocument; unitText: string | null; selectedTypes; budgetUsdMicro; promptConfig; language; customisation: string | null; orgId?: string }` and `RunImportDeps = { store; provider; registry; engineFingerprint; concurrency?: 4; chunkTokens?; rules?; clock?; sleep?; onProgress?: (event: ProgressEvent) => void }`; `ProgressEvent = { kind: "status"; status } | { kind: "activity"; activityId; status; error?: string } | { kind: "attempt"; purpose; status; costUsdMicro: number | null }`.
- `engineFingerprint` = `\`engine@${engineVersion}+lock:${sha256(libraries.lock.json).slice(0, 12)}\`` computed by the caller (CLI); tests pass a constant.
- Failure categories: `ContentFailure` → activity `failed`, `error: "content: …"`; `BudgetRefused` → activity `failed`, `error: "budget: …"` and no further activities are dispatched; `InfrastructureFailure` (or any `EngineError` from compile) → the import is marked `failed` with the message and the error is rethrown after persisting.
- Terminal rules: zero promoted → `failed` (`error: "no activity was promoted"` unless already set); some failed → `ready_with_failures`; all promoted → `ready`. Idempotency: rerunning `runImport` with the same `importId` and the same store makes no model call for finished steps and returns the same terminal record.

- [ ] **Step 1: Shared test helpers**

`packages/generator/test/helpers/synthetic.ts` (Tasks 7 and 8's tests are refactored to import `MemoryRecorder`, `fixtures`, `sid`, `unitOut` and `conceptResponses` from here instead of defining them inline — a mechanical move, no assertion changes):
```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceDocument } from "../../src/ingest/index.js";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { chunkSentences } from "../../src/concepts/chunk.js";
import { fakeResponse } from "../../src/llm/fake-provider.js";
import type { AttemptEvent, AttemptRecorder } from "../../src/llm/types.js";

export const fixtures = resolve(import.meta.dirname, "../fixtures/synthetic");
export const CHUNK_TOKENS = 330;

export class MemoryRecorder implements AttemptRecorder { events: AttemptEvent[] = []; async recordStart(e: AttemptEvent) { this.events.push(e); } async recordOutcome(e: AttemptEvent) { this.events.push(e); } }

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
    const loto = inChunk(i, [lotoEarly, lotoLate]); if (loto.length) concepts.push({ name: "Lockout and tagout", summary: "Locks and tags keep isolated equipment isolated.", sentenceIds: loto });
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

export const planOutFor = (types: Array<"multiChoice" | "blanks" | "flashcards">) => ({ activities: types.map((type, i) => ({ slot: i + 1, type, conceptIds: type === "flashcards" ? ["c1", "c2"] : [i % 2 === 0 ? "c1" : "c2"], criteriaIds: type === "flashcards" ? ["PC2.1", "PC2.2"] : [i % 2 === 0 ? "PC2.1" : "PC2.2"], focus: `${type} focus` })) });
```
The `alignOut` ids assume the merge order above (`c1` lockout, `c2` testing for dead, `c3` hazards); `mergeConcepts` assigns ids in the model's returned order, which this helper fixes.

- [ ] **Step 2: Failing pipeline test**

`packages/generator/test/pipeline.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import { conceptResponses, syntheticDoc, syntheticUnitText, unitOut, planOutFor, CHUNK_TOKENS, sid } from "./helpers/synthetic.js";
import type { PlanRules } from "../src/plan/planner.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });
const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };

/** Produce fixtures cite only evidence that belongs to the concept each plan slot targets (planOutFor: multiChoice → c1, blanks → c2, flashcards → c1 + c2). */
function produceResponses(doc: Awaited<ReturnType<typeof syntheticDoc>>) {
  const remove = `ev-${sid(doc, "Only the worker who applied a lock may remove it")}`;   // concept c1 (lockout and tagout)
  const tag = `ev-${sid(doc, "A tag is a warning label")}`;                               // concept c1
  const tfdA = `ev-${sid(doc, "After the isolator is opened and locked")}`;              // concept c2 (testing for dead)
  const tfdB = `ev-${sid(doc, "Testing for dead confirms")}`;                            // concept c2
  const mc = { title: "Removing a lock", question: "Who may remove a lockout device from an isolator?", answers: [{ text: "The worker who applied it", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Any supervisor", correct: false, feedback: "" }, { text: "The site electrician", correct: false, feedback: "" }], evidenceIds: [remove] };
  const bl = { title: "Testing for dead", taskDescription: "Complete the sentences about testing for dead.", passage: "After the isolator is opened and locked, the worker must test for {{b1}} at the point of work using a voltage tester rated for the circuit. Testing for dead confirms that the conductors to be worked on carry no {{b2}}.", blanks: [{ answers: ["dead"], tip: null, evidenceIds: [tfdA] }, { answers: ["voltage"], tip: null, evidenceIds: [tfdB] }], evidenceIds: [tfdA, tfdB] };
  const fc = { title: "Key terms", description: "Isolation vocabulary.", cards: [{ front: "Who may remove a lock", back: "Only the worker who applied it", tip: null, evidenceIds: [remove] }, { front: "Tag", back: "A warning label attached to the lockout device naming the worker, the date and the reason", tip: null, evidenceIds: [tag] }, { front: "When to test for dead", back: "After the isolator is opened and locked, at the point of work, with a tester rated for the circuit", tip: null, evidenceIds: [tfdA] }, { front: "What testing for dead confirms", back: "That the conductors to be worked on carry no voltage", tip: null, evidenceIds: [tfdB] }], evidenceIds: [remove, tag, tfdA, tfdB] };
  return { mc, bl, fc };
}

async function fullScript(doc: Awaited<ReturnType<typeof syntheticDoc>>) {
  const { script } = conceptResponses(doc);
  const { mc, bl, fc } = produceResponses(doc);
  return [fakeResponse({ outputText: JSON.stringify(unitOut) }), ...script, fakeResponse({ outputText: JSON.stringify(planOutFor(["multiChoice", "blanks", "flashcards"])) }), fakeResponse({ outputText: JSON.stringify(mc) }), fakeResponse({ outputText: JSON.stringify(bl) }), fakeResponse({ outputText: JSON.stringify(fc) })];
}

const input = async (importId: string) => ({ importId, name: "Synthetic import", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"] as const, budgetUsdMicro: 5_000_000, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null });
const deps = (store: MemoryStore, provider: FakeProvider) => ({ store, provider, registry, engineFingerprint: "engine@0.1.0+lock:test", concurrency: 1, chunkTokens: CHUNK_TOKENS, rules, sleep: async () => undefined });

describe("runImport", () => {
  it("runs source → unit → concepts → plan → three activities → built packages, recording every attempt and cost", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const provider = new FakeProvider(await fullScript(doc));
    const record = await runImport(await input("imp-1"), deps(store, provider));
    expect(record.status).toBe("ready");
    const activities = await store.listActivities("imp-1");
    expect(activities.map((a) => [a.type, a.status])).toEqual([["multiChoice", "promoted"], ["blanks", "promoted"], ["flashcards", "promoted"]]);
    for (const a of activities) {
      const rev = await store.getRevision(a.activityId, 1);
      expect(rev?.state).toBe("promoted");
      expect(rev?.promptVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(rev?.engineFingerprint).toBe("engine@0.1.0+lock:test");
      const build = await store.getBuild(rev!.buildKey!);
      expect(build?.subarray(0, 2).toString("latin1")).toBe("PK");
    }
    const attempts = await store.listAttempts("imp-1");
    const starts = attempts.filter((e) => e.event === "start"); const outcomes = attempts.filter((e) => e.event === "outcome");
    expect(starts).toHaveLength(provider.requests.length);
    expect(outcomes).toHaveLength(starts.length);
    expect(record.budgetUsed.spentUsdMicro).toBeGreaterThan(0);
    expect(record.budgetUsed.reservedUsdMicro).toBe(0);
    const ops = await store.listOperations("imp-1");
    expect(ops.filter((o) => o.purpose === "produce" && o.status === "succeeded")).toHaveLength(3);
    const map = await store.getArtifact("imp-1", "conceptMap");
    expect(map).not.toBeNull();
  });
  it("is idempotent: a second run over the same store makes no model calls", async () => {
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
  });
  it("marks an activity failed after three content failures and finishes ready_with_failures", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const script = await fullScript(doc);
    const bad = fakeResponse({ outputText: JSON.stringify({ title: "x", question: "y", answers: [], evidenceIds: [] }) });
    script.splice(script.length - 3, 1, bad, bad, bad); // replace the multiChoice response with three rejected attempts
    const record = await runImport(await input("imp-3"), deps(store, new FakeProvider(script)));
    expect(record.status).toBe("ready_with_failures");
    const mc = (await store.listActivities("imp-3")).find((a) => a.type === "multiChoice")!;
    expect(mc.status).toBe("failed");
    expect(mc.error).toMatch(/^content:/);
    const op = (await store.listOperations("imp-3")).find((o) => o.activityId === mc.activityId)!;
    expect(op).toMatchObject({ status: "failed", contentAttempts: 3 });
  });
  it("stops with a budget failure before dispatching when the reservation would exceed the limit", async () => {
    const store = new MemoryStore();
    const doc = await syntheticDoc();
    const record = await runImport({ ...(await input("imp-4")), budgetUsdMicro: 1 }, deps(store, new FakeProvider(await fullScript(doc))));
    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/budget/);
    expect(await store.listAttempts("imp-4")).toEqual([]);
  });
  it("reconciles a start without an outcome as billing-uncertain on restart", async () => {
    const store = new MemoryStore();
    await store.putImport({ importId: "imp-5", orgId: "local", name: "n", sourceType: "markdown", status: "generating", customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice"], budget: { limitUsdMicro: 5_000_000 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0 }, error: null, idempotencyKey: "imp-5", createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z" });
    await store.putOperation({ operationId: "imp-5:produce:act-1:r1", importId: "imp-5", activityId: "act-1", purpose: "produce", status: "running", idempotencyKey: "imp-5:produce:act-1:r1", contentAttempts: 1, outcome: null, billingUncertain: false, startedAt: "2026-09-19T00:00:00Z", completedAt: null });
    await store.recorderFor("imp-5").recordStart({ event: "start", attemptId: "att-1", operationId: "imp-5:produce:act-1:r1", attempt: 1, purpose: "produce", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 10, reservedOutputTokens: 10, reservedUsdMicro: 777, startedAt: "2026-09-19T00:00:00Z" });
    const doc = await syntheticDoc();
    await runImport({ ...(await input("imp-5")), unitText: null, selectedTypes: ["multiChoice"] }, deps(store, new FakeProvider([]))).catch(() => undefined);
    const op = (await store.listOperations("imp-5")).find((o) => o.operationId === "imp-5:produce:act-1:r1")!;
    expect(op.billingUncertain).toBe(true);
    expect(op.status).toBe("failed");
    expect((await store.getImport("imp-5"))!.budgetUsed.spentUsdMicro).toBeGreaterThanOrEqual(777); // the interrupted reservation counts as spent; the rerun's own refused attempt adds nothing
  });
});
```

- [ ] **Step 3: Run to see it fail**, then implement.

`packages/generator/src/store/types.ts`:
```ts
import type { ActivitySpec, ActivityStatus, ImportStatus, RevisionState } from "@leaplearn/shared";
import type { SourceKind } from "../ingest/source-document.js";
import type { AttemptEvent, AttemptRecorder, Purpose } from "../llm/types.js";
import type { PlannedType } from "../plan/planner.js";

export interface ImportRecord {
  importId: string; orgId: string; name: string; sourceType: SourceKind; status: ImportStatus;
  customisation: string | null; language: string; unitTextHash: string | null; selectedTypes: PlannedType[];
  budget: { limitUsdMicro: number }; budgetUsed: { spentUsdMicro: number; reservedUsdMicro: number };
  error: string | null; idempotencyKey: string; createdAt: string; updatedAt: string;
}
export interface ActivityRecord {
  activityId: string; importId: string; type: PlannedType; order: number; status: ActivityStatus;
  currentRevision: number | null; conceptIds: string[]; criteriaIds: string[]; error: string | null; dropped: boolean;
}
export interface RevisionRecord {
  activityId: string; revision: number; state: RevisionState; spec: ActivitySpec; schemaVersion: number; promptVersion: string;
  modelConfig: { provider: string; models: Record<string, string> }; engineFingerprint: string; note: string | null; buildKey: string | null; attemptIds: string[]; createdAt: string;
}
export interface OperationRecord {
  operationId: string; importId: string; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed";
  idempotencyKey: string; contentAttempts: number; outcome: string | null; billingUncertain: boolean; startedAt: string; completedAt: string | null;
}
export type ArtifactName = "source" | "unit" | "conceptMap" | "plan" | `chunk-${number}`;

export interface ImportStore {
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
}
```

`packages/generator/src/store/memory-store.ts`:
```ts
import type { AttemptEvent, AttemptRecorder } from "../llm/types.js";
import type { ActivityRecord, ArtifactName, ImportRecord, ImportStore, OperationRecord, RevisionRecord } from "./types.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryStore implements ImportStore {
  private imports = new Map<string, ImportRecord>();
  private artifacts = new Map<string, unknown>();
  private activities = new Map<string, ActivityRecord>();
  private revisions = new Map<string, RevisionRecord>();
  private operations = new Map<string, OperationRecord>();
  private attempts = new Map<string, AttemptEvent[]>();
  private builds = new Map<string, Buffer>();

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

`packages/generator/src/pipeline/operations.ts`:
```ts
import { createBudget, type Budget } from "../llm/budget.js";
import type { ModelProvider } from "../llm/provider.js";
import { createRunner, type StageRunner } from "../llm/runner.js";
import type { AttemptEvent, AttemptOutcome, AttemptStart, Purpose } from "../llm/types.js";
import type { ImportStore, OperationRecord } from "../store/types.js";

export interface OperationContext { store: ImportStore; provider: ModelProvider; budget: Budget; importId: string; clock: () => Date; sleep?: (ms: number) => Promise<void>; }

/** Rebuilds the import's budget from the attempt ledger: known costs are spent; a start with no outcome is treated as spent at its reservation (it may have been billed). */
export function budgetFromLedger(limitUsdMicro: number, events: AttemptEvent[]): Budget {
  const budget = createBudget(limitUsdMicro);
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  for (const e of events) {
    if (e.event !== "start") continue;
    const o = outcomes.get(e.attemptId);
    budget.spentUsdMicro += o ? (o.costUsdMicro ?? e.reservedUsdMicro) : e.reservedUsdMicro;
  }
  return budget;
}

/** Marks every operation still "running" as failed and billing-uncertain (spec §5). */
export async function reconcile(store: ImportStore, importId: string, clock: () => Date): Promise<void> {
  for (const op of await store.listOperations(importId)) {
    if (op.status !== "running") continue;
    await store.putOperation({ ...op, status: "failed", billingUncertain: true, outcome: "interrupted before an outcome was recorded; the provider may have billed the attempt", completedAt: clock().toISOString() });
  }
}

export interface RunOperation<T> { purpose: Purpose; activityId: string | null; key: string; work: (runner: StageRunner, op: OperationRecord) => Promise<T>; }

/** One logical operation: idempotent by key; a succeeded operation is not re-run; a running/failed one is re-created as a new operation id with a suffix. */
export async function runOperation<T>(ctx: OperationContext, spec: RunOperation<T>): Promise<{ result: T; operation: OperationRecord } | { skipped: true; operation: OperationRecord }> {
  const existing = (await ctx.store.listOperations(ctx.importId)).filter((o) => o.idempotencyKey === spec.key);
  const done = existing.find((o) => o.status === "succeeded");
  if (done) return { skipped: true, operation: done };
  const operationId = existing.length === 0 ? spec.key : `${spec.key}#${existing.length + 1}`;
  const op: OperationRecord = { operationId, importId: ctx.importId, activityId: spec.activityId, purpose: spec.purpose, status: "running", idempotencyKey: spec.key, contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: ctx.clock().toISOString(), completedAt: null };
  await ctx.store.putOperation(op);
  const recorder = ctx.store.recorderFor(ctx.importId);
  const counting = { recordStart: async (s: AttemptStart) => { op.contentAttempts = Math.max(op.contentAttempts, s.attempt); await recorder.recordStart(s); }, recordOutcome: (o: AttemptOutcome) => recorder.recordOutcome(o) };
  const runnerOptions: Parameters<typeof createRunner>[0] = { provider: ctx.provider, recorder: counting, budget: ctx.budget, operationId, clock: ctx.clock };
  if (ctx.sleep) runnerOptions.sleep = ctx.sleep;
  const runner = createRunner(runnerOptions);
  try {
    const result = await spec.work(runner, op);
    await ctx.store.putOperation({ ...op, status: "succeeded", outcome: "ok", completedAt: ctx.clock().toISOString() });
    return { result, operation: op };
  } catch (err) {
    await ctx.store.putOperation({ ...op, status: "failed", outcome: err instanceof Error ? `${err.name}: ${err.message}` : String(err), completedAt: ctx.clock().toISOString() });
    throw err;
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; results[i] = await fn(items[i]!, i); }
  });
  await Promise.all(workers);
  return results;
}
```

`packages/generator/src/pipeline/run-import.ts`:
```ts
import { compileToBuffer, type LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type ImportStatus, type UnitOfCompetency } from "@leaplearn/shared";
import { parseUnit } from "../competency/parse-unit.js";
import { extractConceptMap, type ChunkConcept } from "../concepts/index.js";
import type { SourceDocument } from "../ingest/source-document.js";
import { MODEL_ROLES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure, InfrastructureFailure } from "../llm/runner.js";
import { planActivities, DEFAULT_PLAN_RULES, type ActivityPlan, type PlannedType, type PlanRules } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";
import type { ActivityRecord, ImportRecord, ImportStore, RevisionRecord } from "../store/types.js";
import { budgetFromLedger, mapLimit, reconcile, runOperation, type OperationContext } from "./operations.js";

export interface RunImportInput {
  importId: string; name: string; source: SourceDocument; unitText: string | null; selectedTypes: readonly PlannedType[];
  budgetUsdMicro: number; promptConfig: PromptConfig; language: string; customisation: string | null; orgId?: string;
}
export type ProgressEvent = { kind: "status"; status: ImportStatus } | { kind: "activity"; activityId: string; status: ActivityRecord["status"]; error?: string } | { kind: "attempt"; purpose: string; status: string; costUsdMicro: number | null };
export interface RunImportDeps {
  store: ImportStore; provider: ModelProvider; registry: LibraryRegistry; engineFingerprint: string;
  concurrency?: number; chunkTokens?: number; rules?: PlanRules; clock?: () => Date; sleep?: (ms: number) => Promise<void>; onProgress?: (event: ProgressEvent) => void;
}

function existingTexts(specs: RevisionRecord[]): { questions: string[]; passages: string[]; fronts: string[] } {
  const out = { questions: [] as string[], passages: [] as string[], fronts: [] as string[] };
  for (const r of specs) {
    const s = r.spec;
    if (s.type === "multiChoice") out.questions.push(s.question.replace(/<[^>]+>/g, ""));
    if (s.type === "blanks") out.passages.push(s.passage);
    if (s.type === "flashcards") out.fronts.push(...s.cards.map((c) => c.front));
  }
  return out;
}

export async function runImport(input: RunImportInput, deps: RunImportDeps): Promise<ImportRecord> {
  const clock = deps.clock ?? (() => new Date());
  const store = deps.store;
  const now = () => clock().toISOString();
  const emit = deps.onProgress ?? (() => undefined);

  const existing = await store.getImport(input.importId);
  let record: ImportRecord = existing ?? { importId: input.importId, orgId: input.orgId ?? "local", name: input.name, sourceType: input.source.kind, status: "queued", customisation: input.customisation, language: input.language, unitTextHash: null, selectedTypes: [...input.selectedTypes], budget: { limitUsdMicro: input.budgetUsdMicro }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0 }, error: null, idempotencyKey: input.importId, createdAt: now(), updatedAt: now() };
  if (!existing) await store.putImport(record);
  if (record.status === "ready" || record.status === "ready_with_failures") return record;
  const setStatus = async (status: ImportStatus, error: string | null = record.error): Promise<void> => { record = { ...record, status, error, updatedAt: now() }; await store.putImport(record); emit({ kind: "status", status }); };

  await reconcile(store, input.importId, clock);
  const budget = budgetFromLedger(input.budgetUsdMicro, await store.listAttempts(input.importId));
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId: input.importId, clock };
  if (deps.sleep) ctx.sleep = deps.sleep;
  const persistBudget = async (): Promise<void> => { record = { ...record, budgetUsed: { spentUsdMicro: budget.spentUsdMicro, reservedUsdMicro: budget.reservedUsdMicro }, updatedAt: now() }; await store.putImport(record); };

  try {
    await setStatus("ingesting");
    if (!(await store.getArtifact(input.importId, "source"))) await store.putArtifact(input.importId, "source", input.source);

    let unit: UnitOfCompetency | null = await store.getArtifact<UnitOfCompetency>(input.importId, "unit");
    if (!unit && input.unitText) {
      const r = await runOperation(ctx, { purpose: "parseUnit", activityId: null, key: `${input.importId}:parseUnit`, work: (runner) => parseUnit(input.unitText!, runner) });
      if (!("skipped" in r)) { unit = r.result; await store.putArtifact(input.importId, "unit", unit); record = { ...record, unitTextHash: unit.textHash }; await store.putImport(record); }
    }

    await setStatus("extracting");
    let map = await store.getArtifact<ConceptMap>(input.importId, "conceptMap");
    if (!map) {
      const chunkCache = { get: (i: number) => store.getArtifact<ChunkConcept[]>(input.importId, `chunk-${i}`), put: (i: number, c: ChunkConcept[]) => store.putArtifact(input.importId, `chunk-${i}`, c) };
      const r = await runOperation(ctx, { purpose: "extract", activityId: null, key: `${input.importId}:concepts`, work: (runner) => extractConceptMap(input.source, unit, runner, { chunkTokens: deps.chunkTokens ?? 6000, promptConfig: input.promptConfig, chunkCache }) });
      if ("skipped" in r) throw new InfrastructureFailure("concept operation recorded as succeeded but no concept map is stored");
      map = r.result; await store.putArtifact(input.importId, "conceptMap", map);
    }

    await setStatus("planning");
    let plan = await store.getArtifact<ActivityPlan[]>(input.importId, "plan");
    if (!plan) {
      const r = await runOperation(ctx, { purpose: "plan", activityId: null, key: `${input.importId}:plan`, work: (runner) => planActivities(map!, [...input.selectedTypes], runner, deps.rules ?? DEFAULT_PLAN_RULES) });
      if ("skipped" in r) throw new InfrastructureFailure("plan operation recorded as succeeded but no plan is stored");
      plan = r.result; await store.putArtifact(input.importId, "plan", plan);
      for (const [i, p] of plan.entries()) await store.putActivity({ activityId: p.activityId, importId: input.importId, type: p.type, order: i, status: "planned", currentRevision: null, conceptIds: p.conceptIds, criteriaIds: p.criteriaIds, error: null, dropped: false });
    }

    await setStatus("generating");
    const producers = createProducers();
    const activities = await store.listActivities(input.importId);
    const pending = activities.filter((a) => a.status !== "promoted" && a.status !== "failed");
    let budgetStopped = false;
    await mapLimit(pending, deps.concurrency ?? 4, async (activity) => {
      if (budgetStopped) return;
      const entry = plan!.find((p) => p.activityId === activity.activityId)!;
      const revision = (await store.listRevisions(activity.activityId)).length + 1;
      const promoted = (await Promise.all(activities.map((a) => store.listRevisions(a.activityId)))).flat().filter((r) => r.state === "promoted");
      const setActivity = async (patch: Partial<ActivityRecord>): Promise<void> => { const next = { ...activity, ...patch }; await store.putActivity(next); emit({ kind: "activity", activityId: activity.activityId, status: next.status, ...(next.error ? { error: next.error } : {}) }); };
      await setActivity({ status: "generating" });
      try {
        const r = await runOperation(ctx, {
          purpose: "produce", activityId: activity.activityId, key: `${input.importId}:produce:${activity.activityId}:r${revision}`,
          work: async (runner) => {
            const producer = producers.get(entry.type);
            if (!producer) throw new InfrastructureFailure(`no producer for ${entry.type}`);
            const produced = await producer.produce({ plan: entry, map: map!, unit, promptConfig: input.promptConfig, language: input.language, existing: existingTexts(promoted), rules: deps.rules ?? DEFAULT_PLAN_RULES }, runner, { registry: deps.registry });
            assertGeneratedProvenance(produced.spec);
            return produced;
          }
        });
        if ("skipped" in r) return;
        const rev: RevisionRecord = { activityId: activity.activityId, revision, state: "candidate", spec: r.result.spec, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, modelConfig: { provider: deps.provider.name, models: { ...MODEL_ROLES } }, engineFingerprint: deps.engineFingerprint, note: null, buildKey: null, attemptIds: r.result.attemptIds, createdAt: now() };
        await store.putRevision(rev);
        await setActivity({ status: "generated" });
        const bytes = await compileToBuffer(rev.spec, new Map(), { registry: deps.registry, revision });
        const buildKey = await store.putBuild(input.importId, activity.activityId, revision, bytes);
        for (const prev of await store.listRevisions(activity.activityId)) if (prev.state === "promoted") await store.putRevision({ ...prev, state: "superseded" });
        await store.putRevision({ ...rev, state: "promoted", buildKey });
        await setActivity({ status: "promoted", currentRevision: revision, error: null });
      } catch (err) {
        if (err instanceof ContentFailure) { await setActivity({ status: "failed", error: `content: ${err.message}` }); return; }
        if (err instanceof BudgetRefused) { budgetStopped = true; await setActivity({ status: "failed", error: `budget: ${err.message}` }); return; }
        throw err;
      } finally {
        await persistBudget();
      }
    });

    const finalActivities = await store.listActivities(input.importId);
    const promotedCount = finalActivities.filter((a) => a.status === "promoted").length;
    const failedCount = finalActivities.filter((a) => a.status === "failed").length;
    await persistBudget();
    if (promotedCount === 0) await setStatus("failed", budgetStopped ? "budget exhausted before any activity was promoted" : "no activity was promoted");
    else if (failedCount > 0) await setStatus("ready_with_failures");
    else await setStatus("ready");
    return record;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof BudgetRefused) { await persistBudget(); await setStatus("failed", `budget: ${message}`); return record; }
    if (err instanceof ContentFailure) { await persistBudget(); await setStatus("failed", `content: ${message}`); return record; }
    await persistBudget();
    await setStatus("failed", `system: ${message}`);
    throw err;
  }
}
```
`packages/generator/src/pipeline/index.ts`: `export * from "./operations.js"; export * from "./run-import.js";` and add `export * from "./store/types.js"; export * from "./store/memory-store.js"; export * from "./pipeline/index.js";` to `src/index.ts`.

Note on the budget-refusal test: the first model call (`parseUnit`) is refused at reservation time, `BudgetRefused` propagates out of `runOperation`, and the outer catch marks the import `failed` with a `budget:` error and no attempt recorded — that is the expected path for test 4. The reconciliation test drives the restart path: the interrupted operation becomes failed/billing-uncertain, its reservation counts as spent, and the run then fails on the empty provider script (which the test swallows) — its assertions are about the reconciliation, not the rerun.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/generator typecheck && pnpm --filter @leaplearn/generator lint; echo "exit=$?"`. Expected `exit=0`.

```bash
git add packages/generator
git commit -m "feat(generator): resumable import pipeline with idempotent operations, failure categories and budget reconciliation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: `FileStore`, `leap generate`, the mapping table and the cost report

**Files:**
- Create: `apps/cli/src/file-store.ts`, `apps/cli/src/report.ts`, `apps/cli/src/generate.ts`; modify `apps/cli/src/index.ts`, `apps/cli/package.json`
- Test: `apps/cli/test/file-store.test.ts`, `apps/cli/test/report.test.ts`

**Interfaces:**
- `FileStore(dir) implements ImportStore`: layout under `dir/` — `import.json`, `artifacts/<name>.json`, `activities/<activityId>.json`, `revisions/<activityId>/r<N>.json`, `operations.jsonl` (append-only; the latest line per `operationId` wins), `attempts.jsonl` (append-only), `builds/<activityId>-r<N>.h5p`; every JSON write goes to `<file>.tmp-<random>` then `rename`; JSONL appends use `appendFile` with one JSON object per line.
- `writeMappingCsv(store, importId, path)` — columns `activityId,type,title,revision,itemId,criterionId,status,conceptIds,evidenceIds,firstQuote`; one row per (activity or item) × criterion (`itemId` empty for the activity row; `criterionId` empty when the activity has none); `status` is always `suggested` in phase 2 (reviewed alignment arrives with phase 5's review screen); RFC 4180 quoting.
- `costReport(store, importId): Promise<CostReport>` with `CostReport = { pricingVersion; totals: { attempts; costUsdMicro; costStatusCounts: Record<CostStatus, number> }; shared: number; direct: number; byPurpose: Record<string, { attempts; costUsdMicro }>; byType: Record<string, { activities; promoted; costUsdMicro }>; perActivity: Array<{ activityId; type; status; attempts; costUsdMicro }>; retryShare: number }` — `shared` = purposes other than `produce`; `direct` = `produce`; `retryShare` = attempts beyond the first per operation ÷ total attempts; `formatCostReport(report): string` (a Markdown table for the terminal).
- `leap generate --source <file> --out <dir> [--unit <file>] [--types multiChoice,blanks,flashcards] [--budget-usd 2] [--language en] [--reading-level high-school] [--tone educational] [--customisation "…"] [--name …] [--libraries <dir>] [--provider anthropic|replay|record] [--fixtures <dir>] [--concurrency 4]`; `--source` accepts `.pdf`, `.md`, `.txt`; `--provider record` wraps the Anthropic provider in `RecordingProvider(fixtures)`; `replay` uses `ReplayProvider(fixtures)` and needs no key; exit 0 when the import ends `ready`, 2 when `ready_with_failures`, 1 on `failed` (with the error on stderr); prints the activity table, the mapping path, and the cost report; `importId` defaults to a slug of the output directory name so reruns resume.

- [ ] **Step 1: Failing tests**

`apps/cli/test/file-store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../src/file-store.js";

describe("FileStore", () => {
  it("round-trips records, appends ledgers, and leaves no temp files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-store-"));
    const store = new FileStore(dir);
    const record = { importId: "imp", orgId: "local", name: "n", sourceType: "markdown" as const, status: "queued" as const, customisation: null, language: "en", unitTextHash: null, selectedTypes: ["multiChoice" as const], budget: { limitUsdMicro: 10 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0 }, error: null, idempotencyKey: "imp", createdAt: "t", updatedAt: "t" };
    await store.putImport(record);
    expect(await store.getImport("imp")).toEqual(record);
    await store.putArtifact("imp", "chunk-3", [{ tempId: "k3-0" }]);
    expect(await store.getArtifact("imp", "chunk-3")).toEqual([{ tempId: "k3-0" }]);
    const op = { operationId: "imp:plan", importId: "imp", activityId: null, purpose: "plan" as const, status: "running" as const, idempotencyKey: "imp:plan", contentAttempts: 0, outcome: null, billingUncertain: false, startedAt: "t", completedAt: null };
    await store.putOperation(op);
    await store.putOperation({ ...op, status: "succeeded", outcome: "ok" });
    expect((await store.listOperations("imp")).map((o) => o.status)).toEqual(["succeeded"]);
    const rec = store.recorderFor("imp");
    await rec.recordStart({ event: "start", attemptId: "a1", operationId: "imp:plan", attempt: 1, purpose: "plan", provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    expect((await store.listAttempts("imp")).map((e) => e.event)).toEqual(["start"]);
    const key = await store.putBuild("imp", "act-1", 1, Buffer.from("PK.."));
    expect((await store.getBuild(key))?.toString()).toBe("PK..");
    const files = await readdir(dir, { recursive: true });
    expect(files.some((f) => /\.tmp-/.test(f))).toBe(false);
    expect((await readFile(join(dir, "operations.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
  });
});
```

`apps/cli/test/report.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MemoryStore } from "@leaplearn/generator";
import { costReport, formatCostReport, mappingRows } from "../src/report.js";

describe("reports", () => {
  it("splits shared and direct cost, counts retries, and lists mapping rows per criterion", async () => {
    const store = new MemoryStore();
    const rec = store.recorderFor("imp");
    const start = (id: string, op: string, purpose: "extract" | "produce", attempt: number) => rec.recordStart({ event: "start", attemptId: id, operationId: op, attempt, purpose, provider: "fake", model: "m", credentialOwner: "server", reservedInputTokens: 1, reservedOutputTokens: 1, reservedUsdMicro: 1, startedAt: "t" });
    const outcome = (id: string, op: string, cost: number | null) => rec.recordOutcome({ event: "outcome", attemptId: id, operationId: op, providerRequestId: null, rawUsage: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, latencyMs: 1, pricingVersion: "v", costUsdMicro: cost, costStatus: cost === null ? "unavailable" : "known", stopReason: "end_turn", status: "ok", error: null, completedAt: "t" });
    const op = (operationId: string, activityId: string | null, purpose: "extract" | "produce") => store.putOperation({ operationId, importId: "imp", activityId, purpose, status: "succeeded", idempotencyKey: operationId, contentAttempts: 1, outcome: "ok", billingUncertain: false, startedAt: "t", completedAt: "t" });
    await op("imp:concepts", null, "extract"); await op("imp:produce:act-1:r1", "act-1", "produce");
    await start("a1", "imp:concepts", "extract", 1); await outcome("a1", "imp:concepts", 300);
    await start("a2", "imp:produce:act-1:r1", "produce", 1); await outcome("a2", "imp:produce:act-1:r1", 500);
    await start("a3", "imp:produce:act-1:r1", "produce", 2); await outcome("a3", "imp:produce:act-1:r1", null);
    await store.putActivity({ activityId: "act-1", importId: "imp", type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC1.1", "PC1.2"], error: null, dropped: false });
    await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "T", type: "multiChoice", language: "en", schemaVersion: 1, question: "<p>q</p>", answers: [{ text: "a", correct: true }, { text: "b", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC1.1", "PC1.2"] } }, schemaVersion: 1, promptVersion: "p", modelConfig: { provider: "fake", models: {} }, engineFingerprint: "f", note: null, buildKey: "k", attemptIds: ["a2", "a3"], createdAt: "t" });
    await store.putArtifact("imp", "conceptMap", { sourceId: "s", textHash: "0".repeat(64), concepts: [{ conceptId: "c1", name: "n", summary: "s", evidence: [{ evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 3, quote: "Hi." }] }] });
    const report = await costReport(store, "imp");
    expect(report.totals).toEqual({ attempts: 3, costUsdMicro: 800, costStatusCounts: { known: 2, estimated: 0, unavailable: 1 } });
    expect(report.shared).toBe(300); expect(report.direct).toBe(500);
    expect(report.retryShare).toBeCloseTo(1 / 3);
    expect(report.perActivity).toEqual([{ activityId: "act-1", type: "multiChoice", status: "promoted", attempts: 2, costUsdMicro: 500 }]);
    expect(formatCostReport(report)).toContain("| produce |");
    const rows = await mappingRows(store, "imp");
    expect(rows.map((r) => [r.activityId, r.criterionId, r.status, r.firstQuote])).toEqual([["act-1", "PC1.1", "suggested", "Hi."], ["act-1", "PC1.2", "suggested", "Hi."]]);
  });
});
```

- [ ] **Step 2: Run to see them fail**, then implement.

`apps/cli/src/file-store.ts`:
```ts
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ActivityRecord, ArtifactName, AttemptEvent, AttemptRecorder, ImportRecord, ImportStore, OperationRecord, RevisionRecord } from "@leaplearn/generator";

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, path);
}
async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (err) { if ((err as { code?: string }).code === "ENOENT") return null; throw err; }
}
async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8").catch((err: { code?: string }) => { if (err.code === "ENOENT") return ""; throw err; });
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

/** Directory-backed ImportStore: JSON files written atomically, JSONL ledgers appended. */
export class FileStore implements ImportStore {
  constructor(private readonly dir: string) {}
  private p(...parts: string[]): string { return join(this.dir, ...parts); }

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
  async listOperations(importId: string) {
    const latest = new Map<string, OperationRecord>();
    for (const o of await readJsonl<OperationRecord>(this.p("operations.jsonl"))) if (o.importId === importId) latest.set(o.operationId, o);
    return [...latest.values()];
  }
  async putOperation(record: OperationRecord) { await mkdir(this.dir, { recursive: true }); await appendFile(this.p("operations.jsonl"), JSON.stringify(record) + "\n"); }
  recorderFor(_importId: string): AttemptRecorder {
    const append = async (e: AttemptEvent): Promise<void> => { await mkdir(this.dir, { recursive: true }); await appendFile(this.p("attempts.jsonl"), JSON.stringify(e) + "\n"); };
    return { recordStart: append, recordOutcome: append };
  }
  listAttempts(_importId: string) { return readJsonl<AttemptEvent>(this.p("attempts.jsonl")); }
  async putBuild(_importId: string, activityId: string, revision: number, bytes: Buffer) {
    const key = `builds/${activityId}-r${revision}.h5p`;
    await mkdir(this.p("builds"), { recursive: true });
    const tmp = this.p(`${key}.tmp-${randomBytes(4).toString("hex")}`);
    await writeFile(tmp, bytes); await rename(tmp, this.p(key));
    return key;
  }
  async getBuild(buildKey: string) { try { return await readFile(this.p(buildKey)); } catch { return null; } }
}
```

`apps/cli/src/report.ts`:
```ts
import type { CostStatus } from "@leaplearn/shared";
import { PRICING, type AttemptOutcome, type AttemptStart, type ImportStore, type PlannedType } from "@leaplearn/generator";
import type { ConceptMap } from "@leaplearn/shared";
import { writeFile } from "node:fs/promises";

export interface CostReport {
  pricingVersion: string;
  totals: { attempts: number; costUsdMicro: number; costStatusCounts: Record<CostStatus, number> };
  shared: number; direct: number;
  byPurpose: Record<string, { attempts: number; costUsdMicro: number }>;
  byType: Record<string, { activities: number; promoted: number; costUsdMicro: number }>;
  perActivity: Array<{ activityId: string; type: PlannedType; status: string; attempts: number; costUsdMicro: number }>;
  retryShare: number;
}

export async function costReport(store: ImportStore, importId: string): Promise<CostReport> {
  const events = await store.listAttempts(importId);
  const starts = events.filter((e): e is AttemptStart => e.event === "start");
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  const activities = await store.listActivities(importId);
  const opActivity = new Map((await store.listOperations(importId)).map((o) => [o.operationId, o.activityId]));
  const costStatusCounts: Record<CostStatus, number> = { known: 0, estimated: 0, unavailable: 0 };
  const byPurpose: CostReport["byPurpose"] = {}; const perActivityMap = new Map<string, { attempts: number; costUsdMicro: number }>();
  let total = 0; let shared = 0; let direct = 0; let retries = 0;
  const attemptsPerOp = new Map<string, number>();
  for (const s of starts) {
    const o = outcomes.get(s.attemptId);
    const cost = o?.costUsdMicro ?? 0; // rows without a cost are counted in costStatusCounts.unavailable and excluded from every sum; they never appear as zero-cost successes
    costStatusCounts[o?.costStatus ?? "unavailable"] += 1;
    total += cost;
    if (s.purpose === "produce") direct += cost; else shared += cost;
    const bp = (byPurpose[s.purpose] ??= { attempts: 0, costUsdMicro: 0 }); bp.attempts += 1; bp.costUsdMicro += cost;
    const n = (attemptsPerOp.get(s.operationId) ?? 0) + 1; attemptsPerOp.set(s.operationId, n); if (n > 1) retries += 1;
    const activityId = opActivity.get(s.operationId);
    if (activityId) { const pa = perActivityMap.get(activityId) ?? { attempts: 0, costUsdMicro: 0 }; pa.attempts += 1; pa.costUsdMicro += cost; perActivityMap.set(activityId, pa); }
  }
  const byType: CostReport["byType"] = {};
  const perActivity = activities.map((a) => {
    const pa = perActivityMap.get(a.activityId) ?? { attempts: 0, costUsdMicro: 0 };
    const bt = (byType[a.type] ??= { activities: 0, promoted: 0, costUsdMicro: 0 }); bt.activities += 1; if (a.status === "promoted") bt.promoted += 1; bt.costUsdMicro += pa.costUsdMicro;
    return { activityId: a.activityId, type: a.type, status: a.status, attempts: pa.attempts, costUsdMicro: pa.costUsdMicro };
  });
  return { pricingVersion: PRICING.version, totals: { attempts: starts.length, costUsdMicro: total, costStatusCounts }, shared, direct, byPurpose, byType, perActivity, retryShare: starts.length === 0 ? 0 : retries / starts.length };
}

const usd = (micro: number): string => `$${(micro / 1_000_000).toFixed(4)}`;

export function formatCostReport(r: CostReport): string {
  const lines = [`Cost (pricing ${r.pricingVersion}): ${usd(r.totals.costUsdMicro)} over ${r.totals.attempts} attempts (known ${r.totals.costStatusCounts.known}, estimated ${r.totals.costStatusCounts.estimated}, unavailable ${r.totals.costStatusCounts.unavailable} — excluded from the sums; the ledger's budget spend counts them at their reservation); shared ${usd(r.shared)}, direct ${usd(r.direct)}; retry share ${(r.retryShare * 100).toFixed(0)}%`, "", "| purpose | attempts | cost |", "|---|---|---|"];
  for (const [p, v] of Object.entries(r.byPurpose)) lines.push(`| ${p} | ${v.attempts} | ${usd(v.costUsdMicro)} |`);
  lines.push("", "| activity | type | status | attempts | cost |", "|---|---|---|---|---|");
  for (const a of r.perActivity) lines.push(`| ${a.activityId} | ${a.type} | ${a.status} | ${a.attempts} | ${usd(a.costUsdMicro)} |`);
  return lines.join("\n");
}

export interface MappingRow { activityId: string; type: string; title: string; revision: number; itemId: string; criterionId: string; status: "suggested"; conceptIds: string; evidenceIds: string; firstQuote: string; }

export async function mappingRows(store: ImportStore, importId: string): Promise<MappingRow[]> {
  const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
  const quoteOf = new Map(map?.concepts.flatMap((c) => c.evidence.map((e) => [e.evidenceId, e.quote] as const)) ?? []);
  const rows: MappingRow[] = [];
  for (const a of await store.listActivities(importId)) {
    if (a.currentRevision === null) continue;
    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev) continue;
    const spec = rev.spec;
    const push = (itemId: string, prov: { conceptIds: string[]; evidenceIds: string[]; criteriaIds: string[] } | undefined): void => {
      const criteria = prov?.criteriaIds.length ? prov.criteriaIds : [""];
      for (const criterionId of criteria) rows.push({ activityId: a.activityId, type: a.type, title: spec.title, revision: rev.revision, itemId, criterionId, status: "suggested", conceptIds: (prov?.conceptIds ?? []).join(" "), evidenceIds: (prov?.evidenceIds ?? []).join(" "), firstQuote: quoteOf.get(prov?.evidenceIds[0] ?? "") ?? "" });
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
```
(The test's `mappingRows` for a multiChoice activity produces one row per criterion because the activity row is pushed once per criterion and multiChoice has no items.)

`apps/cli/src/generate.ts`:
```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { createAnthropicProvider, ingestMarkdown, ingestPdf, ingestText, ReplayProvider, RecordingProvider, runImport, READING_LEVEL_IDS, TONE_IDS, type ModelProvider, type PlannedType, type ReadingLevel, type Tone } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { costReport, formatCostReport, writeMappingCsv } from "./report.js";

export interface GenerateArgs {
  source: string; out: string; unit?: string; types: string; budgetUsd: number; language: string; readingLevel: string; tone: string;
  customisation?: string; name?: string; libraries: string; provider: "anthropic" | "replay" | "record"; fixtures?: string; concurrency: number;
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
  const store = new FileStore(resolve(args.out));
  const importId = basename(resolve(args.out)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
  const promptConfig = { readingLevel: args.readingLevel as ReadingLevel, tone: args.tone as Tone, language: args.language, ...(args.customisation ? { customisation: args.customisation } : {}) };
  const record = await runImport(
    { importId, name: args.name ?? basename(sourcePath), source, unitText, selectedTypes: types, budgetUsdMicro: Math.round(args.budgetUsd * 1_000_000), promptConfig, language: args.language, customisation: args.customisation ?? null },
    { store, provider: providerFor(args), registry, engineFingerprint: await engineFingerprint(args.libraries), concurrency: args.concurrency, onProgress: (e) => io.err(`${e.kind === "status" ? `status: ${e.status}` : e.kind === "activity" ? `${e.activityId}: ${e.status}${e.error ? ` (${e.error})` : ""}` : `${e.purpose}: ${e.status}`}\n`) }
  );
  const activities = await store.listActivities(importId);
  io.out(`import ${importId}: ${record.status}${record.error ? ` — ${record.error}` : ""}\n`);
  for (const a of activities) io.out(`  ${a.activityId}  ${a.type.padEnd(12)}  ${a.status}${a.currentRevision ? `  builds/${a.activityId}-r${a.currentRevision}.h5p` : ""}${a.error ? `  ${a.error}` : ""}\n`);
  const rows = await writeMappingCsv(store, importId, resolve(args.out, "mapping.csv"));
  io.out(`mapping: ${rows} rows → ${resolve(args.out, "mapping.csv")}\n`);
  const report = await costReport(store, importId);
  await (await import("node:fs/promises")).writeFile(resolve(args.out, "cost.json"), JSON.stringify(report, null, 2) + "\n");
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
      .option("budget-usd", { type: "number", default: 2 })
      .option("language", { type: "string", default: "en" })
      .option("reading-level", { type: "string", default: "high-school" })
      .option("tone", { type: "string", default: "educational" })
      .option("customisation", { type: "string" })
      .option("name", { type: "string" })
      .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries") })
      .option("provider", { choices: ["anthropic", "replay", "record"] as const, default: "anthropic" as const })
      .option("fixtures", { type: "string", describe: "fixture directory for --provider replay|record" })
      .option("concurrency", { type: "number", default: 4 }),
      async (argv) => {
        const code = await generate({ source: argv.source, out: argv.out, ...(argv.unit ? { unit: argv.unit } : {}), types: argv.types, budgetUsd: argv["budget-usd"], language: argv.language, readingLevel: argv["reading-level"], tone: argv.tone, ...(argv.customisation ? { customisation: argv.customisation } : {}), ...(argv.name ? { name: argv.name } : {}), libraries: argv.libraries, provider: argv.provider, ...(argv.fixtures ? { fixtures: argv.fixtures } : {}), concurrency: argv.concurrency }, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) });
        process.exitCode = code;
      })
```
`apps/cli/package.json`: no new dependencies beyond `@leaplearn/generator` (added in Task 6).

- [ ] **Step 3: Verify, run the replay path against the synthetic fixtures with no key, and commit**

Run: `pnpm --filter @leaplearn/generator build && pnpm --filter @leaplearn/cli test && pnpm --filter @leaplearn/cli build && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"`. Expected `exit=0`. Smoke the command without an API key: `node apps/cli/dist/index.js generate --source packages/generator/test/fixtures/synthetic/source-electrical-safety.md --out /tmp/leap-imp --provider replay --fixtures /tmp/empty; echo "exit=$?"` → `exit=1` with `leap: no recorded response for purpose parseUnit …` on stderr (proves the CLI wiring, the store creation and the error path before Task 16 records real fixtures).

```bash
git add apps/cli
git commit -m "feat(cli): leap generate with a file-backed import store, mapping.csv and a cost report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: The phase-2 demo, recorded fixtures, the replay test, docs and verification

**Files:**
- Create: `packages/generator/test/fixtures/replay/synthetic/*.json` (recorded), `packages/generator/test/replay.test.ts`, `docs/testing/phase-2-demo.md`
- Modify: `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§3), `README.md`

- [ ] **Step 1: The demo run (owner's API key; the only real calls in this phase)**

```bash
export ANTHROPIC_API_KEY=…   # owner-provided; never committed
rm -rf /tmp/leap-demo
node apps/cli/dist/index.js generate \
  --source packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf \
  --unit packages/generator/test/fixtures/synthetic/unit-synele001.txt \
  --out /tmp/leap-demo --budget-usd 2 --concurrency 1 \
  --provider record --fixtures packages/generator/test/fixtures/replay/synthetic; echo "exit=$?"
```
Expected: `exit=0` (or `2` with a named failed activity, which is also a valid outcome to record — do not re-run until it is 0; record what happened). Then:
```bash
ls /tmp/leap-demo/builds; cat /tmp/leap-demo/mapping.csv | head; cat /tmp/leap-demo/cost.json | head -40
grep -c '"event":"start"' /tmp/leap-demo/attempts.jsonl; grep -c '"event":"outcome"' /tmp/leap-demo/attempts.jsonl
python3 -c "import json;print(sorted({json.loads(l)['costStatus'] for l in open('/tmp/leap-demo/attempts.jsonl') if json.loads(l)['event']=='outcome'}))"
```
Expected: one `.h5p` per promoted activity; `mapping.csv` rows with `PC…` ids and `suggested`; starts equal outcomes; `costStatus` all `known` (cache reads visible in `rawUsage.cache_read_input_tokens` on the later `produce` calls, since the system + evidence prefix exceeds 1,024 tokens for Sonnet 5; if it is 0 everywhere, record that as a finding — it means the cached prefix was below the model's minimum or not identical between calls). Open every built `.h5p` in the phase-1 smoke harness by copying them into a temporary site (`packages/engine/test/smoke/serve.ts` + `site/index.html`) or upload one by hand to h5p.com and record it in `docs/testing/platform-checklist.md` under a new "generated" row set — this is the owner's platform gate and stays separate from quality judgement.

Write `docs/testing/phase-2-demo.md`: the exact command, the run date, the model IDs and `PRICING.version`, the cost report table verbatim, the number of attempts and the retry share, the unsupported criteria list (`PC3.2` expected), and any activity that failed with its reason. This is the "measured cost" deliverable; no quality claim is made.

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

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
const replayDir = resolve(fixtures, "replay/synthetic");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

describe("end to end over recorded responses", () => {
  it("replays the demo import from the synthetic PDF and unit without network access", async () => {
    expect(existsSync(replayDir), "record the fixtures with `leap generate --provider record` first (Task 16 step 1)").toBe(true);
    const source = await ingestPdf(await readFile(resolve(fixtures, "synthetic/source-electrical-safety.pdf")), { sourceId: "src-source-electrical-safety.pdf", fileName: "source-electrical-safety.pdf" });
    const unitText = await readFile(resolve(fixtures, "synthetic/unit-synele001.txt"), "utf8");
    const store = new MemoryStore();
    const record = await runImport(
      { importId: "leap-demo", name: "source-electrical-safety.pdf", source, unitText, selectedTypes: ["multiChoice", "blanks", "flashcards"], budgetUsdMicro: 2_000_000, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null },
      { store, provider: new ReplayProvider(replayDir), registry, engineFingerprint: "replay", concurrency: 1 }
    );
    expect(["ready", "ready_with_failures"]).toContain(record.status);
    const activities = await store.listActivities("leap-demo");
    expect(activities.filter((a) => a.status === "promoted").length).toBeGreaterThanOrEqual(3);
    const map = await store.getArtifact<{ alignment?: { unsupportedCriteriaIds: string[] } }>("leap-demo", "conceptMap");
    expect(map?.alignment?.unsupportedCriteriaIds).toContain("PC3.2");
    const outcomes = (await store.listAttempts("leap-demo")).filter((e) => e.event === "outcome");
    expect(outcomes.every((o) => (o as { costStatus: string }).costStatus === "known")).toBe(true);
  });
});
```
The replay is byte-exact only if the prompts are identical to the recorded run: the same fixture bytes, the same `PROMPT_VERSION`, the same model ids, and the same `concurrency: 1` — concurrency changes which promoted activities the near-duplicate check sees, and therefore which feedback prompts exist. The `importId` must match the recorded run's (`leap-demo` = slug of `/tmp/leap-demo`) only for readability; prompts do not include it. Any later prompt change re-records the fixtures (the `ReplayMissError` names the purpose).

- [ ] **Step 3: Spec and docs**

`docs/superpowers/specs/2026-09-18-generator-service-design.md` §3 `packages/generator` → `llm/`: append "Structured output is requested natively (`output_config.format`, JSON Schema derived from the model-output Zod schemas with every property required); refinements are re-checked in code. Phase 2 stores imports as a directory of JSON and JSONL files through an `ImportStore` interface; phase 5 implements the same interface over Postgres." Under §9 URL fetching: "Implemented as `safeFetch` in `packages/generator` (phase 2) and used by every application-side fetch." `README.md`: a "Generate activities" section with the demo command, the output directory layout, `--provider replay|record`, and the two exit codes.

- [ ] **Step 4: Root verification and commit**

Run the clean-checkout path: `rm -rf node_modules packages/*/node_modules apps/*/node_modules tools/*/node_modules packages/*/dist apps/*/dist tools/*/dist && pnpm install --frozen-lockfile && pnpm verify; echo "exit=$?"`. Expected `exit=0`; the generator's suites (including `replay.test.ts`) run inside `pnpm -r test`; no test contacts the network (`ANTHROPIC_API_KEY` unset during verify: `env -u ANTHROPIC_API_KEY pnpm verify`).

```bash
git add packages/generator/test/fixtures/replay packages/generator/test/replay.test.ts docs README.md
git commit -m "test(generator): replay the recorded phase-2 demo end to end; record the demo and amend the spec

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Done when

- **Opening task landed first:** `validate()` returns coded issues for spec-attributable failures (schema, missing/unsupported asset, not-implemented page kinds, missing handler) and `compile*` throw `ValidationError` for the same; engine/registry integrity failures remain exceptions; README and CONTRIBUTING describe the workspace correctly (Task 1).
- **SSRF protection exists and is tested before any server-side fetching:** `safeFetch` blocks private, loopback, link-local, metadata and multicast targets, re-checks every redirect, caps size and time, and is the only fetch the CLI's image resolver uses (Task 6). Text and PDF ingestion never fetch.
- **The demo runs from the CLI:** `leap generate --source <synthetic PDF> --unit <synthetic unit> --out <dir>` produces at least one promoted `multiChoice`, one `blanks` and one `flashcards` activity as `.h5p` files built by the phase-1 engine, `mapping.csv` with suggested criteria (and `PC3.2` reported unsupported), and a cost report whose attempts have `costStatus: known` (Task 16, recorded in `docs/testing/phase-2-demo.md`).
- **Every model call is traceable:** one start and one outcome row per attempt in `attempts.jsonl`, with provider request id, raw usage, pricing version and cost; a restart reconciles interrupted attempts as billing-uncertain (Tasks 4, 14).
- **Cost accounting rules hold:** pricing lives only in `pricing.ts` with version, source and effective date; a missing usage is `unavailable`, never zero; reservations are made before dispatch and replaced by actual usage (Tasks 2, 4).
- **Provenance is verified:** every produced activity and item cites evidence ids that resolve to sentences whose quotes match the stored text at their offsets; `assertGeneratedProvenance` passes for every promoted spec (Tasks 8, 11–14).
- **Blanks are passage-grounded:** every answer occurs in the cited evidence; delimiter characters are rejected before the engine sees them (Tasks 10, 12).
- **Contract tests pin the SDK facts** (request shape, cache control, native structured output, usage mapping, request id, error classification) and `toStrictJsonSchema` refuses optionals and defaults (Tasks 4, 5).
- **Offline verification:** `env -u ANTHROPIC_API_KEY pnpm verify` exits 0 from a clean checkout, including the recorded-replay end-to-end test; no test contacts the network.
- **Separation of claims:** platform compatibility rows in `docs/testing/platform-checklist.md` are filled only by hand (the generated packages get their own rows); generation quality is judged only in phase 3; the synthetic fixtures are labelled and stay out of the phase-3 corpus.

## Acceptance checks for the owner's review

| Check | Where |
|---|---|
| Error classification is the first commit of the phase | `git log --reverse` shows Task 1's commit before any `packages/generator` commit |
| SSRF guard tested and wired before any fetch | Task 6's commit precedes Task 15's CLI; `grep -rn "fetch(" apps/cli/src packages/generator/src` shows only `safe-fetch.ts` |
| Demo deliverables | `/tmp/leap-demo/builds/*.h5p`, `mapping.csv`, `cost.json`, `docs/testing/phase-2-demo.md` |
| Cost per import, shared vs direct, per type, per purpose, retry share | `cost.json` and the printed report (Task 15) |
| Pricing provenance | `packages/generator/src/llm/pricing.ts` (`version`, `effectiveDate`, `source`) and the test that pins them (Task 2) |
| Platform gate separate from quality | New rows for generated packages in `docs/testing/platform-checklist.md` (owner-filled); no test asserts either |

## Deviations from the spec, recorded

- **Storage:** phase 2 persists imports as files through `ImportStore` rather than the §4 Postgres tables; record shapes and statuses follow §4 so phase 5 maps them one to one. `import_cap` consumption (§5 step 7) is not implemented in the CLI (no org accounts yet).
- **Sources:** text, markdown and PDF text layers only; web-page ingestion (§11 phase 2) moves to phase 5 with the server; the SSRF guard it needs is built now.
- **Structured output:** native `output_config.format` instead of the tool-use projection described in §2.2; the JSON Schema is still derived from Zod, and refinements are enforced in code as §2.2 requires.
- **Concurrency:** producers run with a concurrency limit (default 4), but the near-duplicate check compares against activities promoted before the batch started; the phase-5 worker can serialise per type if duplicates appear in practice.
- **Budget input estimate:** `ceil(chars / 3.5)` rather than a `count_tokens` call; the reservation is conservative and replaced by actual usage.
- **Review and acceptance:** the demo delivers *generated* activities with suggested alignment; `acceptance_decisions` and `alignment_reviews` (§4) and the "reviewed activity" of the §11 demo line arrive with the phase-5 review screen, so "cost per accepted activity" (§8) cannot be computed until then. `mapping.csv` therefore always says `suggested`.
- **Credential owner:** every attempt records `credentialOwner: "server"`; per-org keys (§9) arrive with accounts in phase 5.
- **DNS rebinding:** `safeFetch` re-checks each hop but cannot pin the connection to the checked address with Node's built-in `fetch`; the phase-5 server uses an undici `Agent` with a pinned lookup.
