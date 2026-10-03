# Phase 3: Human Quality Gate Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. The execution workflow is the same as phases 1 and 2: one task per dispatch, a review of the diff and verification output between tasks, a commit at each checkpoint, and a whole-branch review at the end.

**Goal:** Make a trustworthy BSBAUD412 pilot possible and record it properly. By the end of this plan:
- builds record the engine that made them, and build history cannot be rewritten;
- DOCX and ODT sources arrive with their tables, lists and headings intact, checked by eye before any paid run;
- units keep their Knowledge Evidence as a tree and their assessment conditions, and the packet's RTO instructions never become claims about the unit;
- a reviewer scores activities against a fixed rubric through a sheet whose identity is persisted, and the import is checked, recoverable and idempotent;
- a defect is fixed only by regeneration and a fresh review;
- a gate report keeps first-pass results, after-revision results and every denominator apart;
- every paid run is authorised and capped in a pilot ledger.

**Revision 2 (28 Sep 2026):** Benjamin's review of `4200646` found six contract defects: pilot-total enforcement read derived reports and did not reserve centrally; score import contradicted itself on stale rows and had no deterministic recovery order; regeneration checked eligibility before recovering a running request; the gate report could not count failures that never produced a revision; structural offsets were created before normalisation; and the S1 recording did not match its replay consumers. This revision fixes each (R7–R12 below) and adds two conditions on recorded deviations (R13, R14).

**Design:** `docs/superpowers/specs/2026-09-28-phase-3-quality-gate-design.md`, revision 2 (`76cd223`), accepted for planning on 28 Sep 2026 with the contract clarifications below. Parent spec: `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§1 claims, §5 regenerate, §10 quality gate, §13 rulings).

**Architecture:** No new package.
- `packages/engine` gains a build-time identity file and a runtime `engineIdentity()`.
- `packages/generator` gains:
  - `ingest/structure/`: a block model, a linearizer, and DOCX and ODT readers;
  - `admitSource()`;
  - `review/`: rubric, decision derivation, sheet manifest, score validation, batch identity;
  - `report/gate.ts`: denominators, yields, distributions, cost allocation;
  - `pilot/ledger.ts`: run authorisation and caps;
  - new `ImportStore` records: builds, sheets, batches, scores, regeneration requests.
- `apps/cli` gains `leap extract`, `leap regenerate`, `leap review-sheet`, `leap review-import` and `leap gate-report`. `FileStore` moves to store version 2.
- `apps/cli-legacy` is untouched.

**Tech stack additions:** `mammoth` (DOCX → HTML), `htmlparser2` and `domhandler` (walking mammoth's HTML), `jszip` (already used by the engine) and `@xmldom/xmldom` (ODT `content.xml`), all in `packages/generator`. `yaml` is a dev dependency of `packages/engine`, for reading `pnpm-lock.yaml` at build time. Exact versions are pinned at install and recorded in the task's commit message.

**Contract rules:** This plan states contracts and tests exactly and leaves the implementations to each task. Phase 2's supplied implementations were where its review found defects, so a task here is done when its named tests pass and its contract holds, not when it matches a code listing.

## Contract clarifications from the review of design revision 2 (28 Sep 2026)

These rules override the design where the two differ.

| # | Clarification | Rule in this plan | Task |
|---|---|---|---|
| C1 | Shared cost by first-pass generation cost | This is an **accounting convention**, not a claim that more generated text consumes more source work. If the known and estimated first-pass direct cost totals zero, shared cost is allocated by planned activity count. An attempt with unavailable cost is never priced at zero: it is excluded from sums and counted, and every figure it touches is marked a lower bound. A type with 0 accepted activities shows `n/a (0 accepted)` with its spend | 14 |
| C2 | Two regenerations per activity | The allowance counts **logical regeneration requests**, including unsuccessful ones. A request is persisted before any dispatch. Re-running the command while a request is `running` resumes that request and does not consume allowance | 13 |
| C3 | Stale reviews | A review of a build that is no longer current does not count for **current acceptance**. It still counts in the clearly labelled **historical first-pass** results | 14 |
| C4 | Contradictory decision column | The row is rejected, and the error shows the derived decision | 12 |
| C5 | Acceptance only through score sheets | Historical acceptance records are preserved. Decisions without rubric scores are excluded from the gate and listed as such. `leap review --decision` is refused on store version 2 | 12 |
| C6 | 25 / 15 / 5 packages across five units | This is the **minimum planned sample**, not evidence of statistical confidence. Results are shown per unit and per item | 14, 16 |
| C7 | NFC and code-point counting | Limits count **Unicode code points of the NFC-normalised extracted text**. Provenance offsets stay **UTF-16 code units, half-open, into the stored normalised text**. The two conventions are never mixed, and a test pins both | 4 |
| R1 | Persist the exported sheet manifest | `review-sheet` writes an immutable manifest. Import checks each row against its manifest entry and the entry against current state, per row. Reviewing another activity never invalidates an unchanged row. A row already committed is recognised **before** any stale check. Row-level identity makes completing a half-imported sheet, and reimporting it, safe | 11, 12 |
| R2 | Failing items by dimension | Findings are records of `{ dimension, itemId, score, reason }` in a separate `findings.csv`. A dimension's activity score must equal the lowest score among its findings, or 2 when it has none | 10, 11, 12 |
| R3 | Acceptance denominators | Report planned, not attempted, generation-failed, promoted, reviewed, unreviewed and accepted counts. The first generated revision is marked `origin: "generate"`. Acceptance is reported among reviewed outputs and end to end among planned outputs. The gate status is `incomplete` while any required review is missing, and an incomplete gate cannot pass | 3, 14 |
| R4 | Table header rows | A first row becomes a header **only when the format marks it**: DOCX `w:tblHeader`, ODT `table:table-header-rows`. Otherwise the row is preserved as data and cells are labelled `Column 1`, `Column 2`, and so on. Fixtures include a two-column key/value table. An atomic row larger than the chunk budget is preserved whole and the run is refused before any model call, naming the table, row and size | 5, 6, 7 |
| R5 | Existing phase-2 imports | Store version 1 directories are **read-only**. Every write command refuses them, with instructions to use a new directory. Their packages, revisions, acceptances and alignment reviews are never modified or migrated. No build record or engine fingerprint is reconstructed for them; their recorded `engineFingerprint` string is shown as recorded at production, with phase-2 semantics. The gate report lists them as not eligible. New fingerprints include the dist bytes of workspace dependencies and the resolved identities (name, version, integrity) of the transitive runtime dependency closure | 1, 2 |
| R6 | Experiment budget | Every paid run needs an entry in a pilot ledger that Benjamin writes. The ledger gives a per-run cap and a pilot total. `generate` and `regenerate` refuse to dispatch without an authorising entry. **Approving this plan authorises no live run** | 9, and "Paid runs and authorisation" |
| R7 | Pilot-total enforcement (review of `4200646`) | **Static allocation.** The sum of all listed run caps must not exceed the pilot total; each cap stays reserved until Benjamin edits the ledger. No central spend reservation is needed, because a run can only spend against its own cap. Actual spend is read from each run's **attempt records**, never from `cost.json`. Caps are **estimated**, as in phase 2: an in-flight attempt whose real usage exceeds its reservation can exceed a run cap, and so the total, by that underestimate | 9 |
| R8 | Stale rows and recovery order | Import is **all-or-nothing**: any error or stale row means zero writes. Batches get a **sequence number** under the lock at commit. "Latest wins" is decided by `(sequence, row index)`, never by file enumeration or ledger append order, so replayed records cannot reorder history | 12 |
| R9 | Regeneration recovery before eligibility | A `running` request is inspected and reconciled **first**. If its target revision was already produced, built or promoted, the same request is finished without a model call. The reviewed-decision and two-request checks apply only when creating a new request | 13 |
| R10 | Failures without revisions | First-pass vs regeneration is recorded on the **operation and attempt-start records before dispatch**. Outcome counts and costs derive from the saved plan, activity records, operations and attempts, even when no revision exists. The reported categories **partition** the planned activities, and a test asserts the sum | 3, 13, 14 |
| R11 | Normalise before offsets | **Invariant:** structural segments and sentence offsets are built against the final stored normalised text, and nothing transforms that text afterwards without rebuilding its offsets. Adapters normalise block text before linearizing; `finaliseDocument` asserts the text is a fixed point of `normaliseSourceText` and never transforms it | 4, 5, 6, 7 |
| R12 | S1 matches every replay consumer | S1 records one named fixture pair (the PDF path) with pinned settings in a shared `S1_SETTINGS` constant, which both replay consumers import. DOCX and ODT pipeline paths run on FakeProvider. Tasks 1–9 keep every existing replay request byte-identical (heading context is emitted only when a chunk has headings, and PDF and text sources have none); Task 10 is the first task that changes requests. **Amended 30 Sep 2026** (see below): historical replay runs from a frozen source document; current PDF ingestion is tested offline until S1 | 4, 5, 10, 15 |
| R13 | Simplified DOCX numbering | Acceptable only with a warning. `leap extract` lists every list that uses a non-decimal, non-bullet format, and every text reference that looks like a list label (for example "item b)", "(ii)"). Checkpoint B confirms those references still make sense; if not, the adapter renders the real formats before P1 | 6, 8 |
| R14 | Oversize ordinary sentences | They may stay whole, but the complete provider request that carries them must fit the model's input limit. Otherwise the run is refused before dispatch, naming the sentence and the sizes | 5 |

## Amendment to R12 (30 Sep 2026): historical replay and current PDF ingestion are tested separately

Benjamin's review of Task 4 (`841bfd7`) found that the PDF adapter stored pdf-parse's page labels (`-- 1 of 2 --`) as source text, so they counted towards admission and became sentences. The fix stores the pages' own text. That changes the PDF path's stored text and therefore the recorded extraction request, which R12 required to stay byte-identical until Task 10. Resolution, approved on 30 Sep 2026:

1. Every recorded request and response in `packages/generator/test/fixtures/replay/synthetic/` stays unchanged. They are valid evidence of the pipeline as it was recorded.
2. The source document the pre-fix extractor at `841bfd7` produces from the synthetic PDF is frozen in `packages/generator/test/fixtures/historical/`. It was reconstructed from that revision and the PDF on 30 Sep 2026, not saved during the original paid run; its README records the provenance and hashes.
3. The replay test runs from that frozen document and is labelled **historical pipeline compatibility**. It is not coverage of current PDF ingestion. Its existing assertions are kept.
4. Current PDF ingestion is covered offline: the synthetic PDF → `ingestPdf` → `runImport` on FakeProvider → compiled activities, plus the PDF page-label regression tests.
5. `EXTRACTION_VERSION` becomes `2026-09-30.1`, so an import created from the pre-fix PDF text refuses to resume (tested).
6. The planned S1 run (Task 10, Checkpoint C) records the current PDF path and restores current-PDF replay coverage. There is no earlier paid run. Old responses are never re-keyed against new requests, their evidence ids are never adjusted, and production code has no compatibility switch.

Until S1, "replay requests stay byte-identical" (R12, Global constraints) means: the historical replay test passes unchanged from the frozen document at every commit.

## Amendment to R12 (1 Oct 2026): the historical replay is archived

Task 10 changes the parse, extract and align requests (and `PROMPT_VERSION`), so no later revision sends a request the phase-2 recordings answer, and old responses are never re-keyed. The historical replay therefore cannot pass after Task 10, not only until S1. Benjamin's ruling at Checkpoint C, 1 Oct 2026:

1. The 13 recordings move unchanged (same names, same bytes) from `packages/generator/test/fixtures/replay/synthetic/` to `packages/generator/test/fixtures/historical/replay/`. They are never deleted, edited or re-keyed.
2. The archive also keeps the frozen source document, the unit text the recordings were made from (`unit-synele001.txt.db6057a.txt`) and the synthetic PDF as it was before Task 10 (`source-electrical-safety.pdf.db6057a.pdf`, the bytes the frozen document's provenance names). `manifest.json` records every file's sha256, the recording revision `c8717eb` and the **last compatible code revision, `db6057a`**, where the historical replay test last passed.
3. The current-pipeline historical replay test is retired. `test/historical-archive.test.ts` replaces it: the archive holds exactly the manifest's files with their hashes; the 13 recordings are named by request key and readable; the frozen document is the pre-fix extraction; the archived unit text is what the recorded parse request was made from; and today's parse request for that unit text has no recording in the archive (it is not replayable, and nothing pretends otherwise).
4. `test/fixtures/replay/synthetic/` is empty until S1 records into it, so S1 removes no fixture files.
5. Item 1 of the 30 Sep amendment (every recording stays unchanged) still holds, at the recordings' new location. Item 3 (the replay test runs from the frozen document) held through `db6057a` and ends with Task 10.

## Paid runs and authorisation

**Approving this plan authorises no paid run.** Tasks 1–9, the offline part of Task 10, and Tasks 11–16 make no model calls. Task 10 ends with one small paid run on synthetic material (S1), and the pilot needs paid runs on BSBAUD412. Each requires Benjamin's ledger entry beforehand.

**Allocations approved on 28 Sep 2026** as provisional: S1 $1, P1 $3, each experiment $3, total $20. An approved allocation is not an authorised run: a run is authorised only by its ledger entry.

**The ledger** is `docs/uoc/pilot-ledger.json`, ignored by git and written by Benjamin:

```json
{
  "totalCapUsd": 20.00,
  "runs": [
    { "runId": "S1", "purpose": "re-record synthetic replay fixtures after the Task 10 prompt changes", "outDir": "/abs/path/to/s1", "capUsd": 1.00, "authorisedBy": "Benjamin", "authorisedOn": "YYYY-MM-DD" }
  ]
}
```

| Run | Purpose | Allocation |
|---|---|---|
| S1 | Re-record the synthetic PDF replay fixtures (Task 10) | $1 |
| P1 | BSBAUD412 baseline, including its regenerations | $3 |
| E1… | One experiment each (design §9 step 6), each a new import including its regenerations | $3 each |
| **Total** | Everything in phase 3, S1 included | **$20** |

With these allocations, at most five experiments fit (1 + 3 + 5 × 3 = 19). Listing more requires Benjamin to change a cap or the total.

**Enforcement (Task 9):**
- `generate` and `regenerate` take `--ledger <file> --run <runId>`.
- **Static allocation:** if the sum of all listed caps exceeds `totalCapUsd`, every paid run is refused until Benjamin edits the ledger. A cap stays allocated to its run whether or not the run has started. Two runs cannot contend for the same money, so concurrent starts need no shared reservation.
- **Per run:** the command refuses when the run is not listed, when `--out` differs from the entry, when another entry names the same `outDir`, or when `--budget-usd` exceeds the entry's cap. The import's own per-import budget, which is cumulative across resumes, is set to at most the cap, so a resumed run is bounded by what it has already spent.
- **Spend is read from attempt records** (`attempts.jsonl`): known and estimated costs, plus every attempt start without an outcome at its reservation. It is never read from `cost.json`, which is derived and may be missing or stale after a crash.
- Spend and token caps are **estimated**, exactly as in phase 2. Dispatch is refused when spent plus the new reservation would cross the cap, but an attempt whose real usage exceeds its reservation can take a run over its cap, and so the pilot over its total, by that underestimate. Every outcome records the underestimate, and the gate report totals it.
- The ledger is only read. A new experiment is a new entry, written by Benjamin.
- `--provider replay` and `--provider fake` need no ledger. `--provider anthropic` and `--provider record` always do.

**If a paid run fails**, its directory and records are kept as evidence, the failure is written into `docs/testing/phase-3-pilot.md` (numbers and error categories only for real material), and work stops. Another attempt is a new ledger entry (for example `S1b`) that Benjamin writes. Nothing assumes authorisation for a retry.

## Global constraints

Phase 2's global constraints continue to apply, unchanged: the engine boundary, one SDK call site, two-event attempt recording, budget semantics, stop signal, persisted results, derived provenance, pricing and model IDs in one file each, micro-dollar integers, the SSRF guard, Conventional Commits, `set -o pipefail`, and no real API calls in `pnpm verify`. In addition:

- **Real material never enters git.** Nothing under `docs/uoc/` is committed. Recorded responses, sheets, batches and reports from real material are written only under `docs/uoc/` or the import directory. Only numbers are copied into `docs/testing/`.
- **Build history is append-only.** Build records and build bytes are never overwritten or deleted. Revisions, score records, batches, sheet manifests and regeneration requests are append-only or immutable once written; "latest wins" is always a read rule, never an overwrite.
- **Store version 1 is read-only**, as in R5.
- **The decision is derived in code** (`deriveDecision`) and nowhere else. No command accepts a decision as input except to check it against the derived one.
- **Offsets vs counts**, as in C7. Every function that takes or returns an offset says so in its doc comment.
- **Normalise before offsets** (R11). Offsets are only ever computed on the final stored text, and no function transforms stored text after offsets exist.
- **Replay wire compatibility** (R12, amended 30 Sep and 1 Oct 2026). Until Task 10, every change keeps existing replay requests byte-identical; the historical replay test, run from the frozen pre-fix source document with unchanged recordings, passing at each commit is the check (it held through `db6057a`). From Task 10 the phase-2 recordings are an archive checked for integrity, not replayed (amendment of 1 Oct below). Current PDF ingestion is tested offline until S1 records it.
- **Every planned activity is accounted for** (R10). Any report that counts activities partitions the plan, and its tests assert the sum.
- **Claims:** unreviewed output is described as "source citations" and "suggested alignment". "Verified" and "reviewed" are used only for a revision whose current build has a counted, accepted scored review. Nothing claims competency or satisfaction of an RTO's assessment requirements.

## Execution workflow and checkpoints

Execute tasks in order. Each task writes its failing tests first, runs them and sees them fail, implements, runs the named verification and confirms `exit=0`, then commits. Do not start a task while the previous task's verification is red. Root verification stays `pnpm verify`. Repository: `/Users/benjaminjameswaller/Projects/personal/h5p-cli-creator`.

| Checkpoint | After task | Who | What |
|---|---|---|---|
| **A: engine and build identity** | 3 and follow-up F1 | Reviewer | Whole-diff review of Tasks 1–3 and F1; `pnpm verify` green |
| **B: extraction inspection** | 8 | Benjamin, zero cost | `leap extract` on the BSBAUD412 packet; compare at least five representative tables with the original (design §4.2). Any mismatch goes back to Tasks 5–7 before anything else proceeds |
| **C: authorise S1** | 10, offline part | Benjamin | Task 10's offline work is complete and green on its task branch, apart from the expected replay misses (see Task 10). Benjamin decides follow-up F3 (the plan/produce model), then writes the S1 ledger entry; S1 runs only after that. The phase branch waits here, and Tasks 11–16 depend on Task 10 |
| **D: tooling complete** | 16 and follow-up F2 | Reviewer | Whole-branch review; `pnpm verify` green; the pilot runbook reviewed; F2 done before the runbook names package paths |
| **E: authorise P1** | D | Benjamin | Ledger entry for P1. This is the first paid BSBAUD412 run; it comes after A and B by construction |

## File structure changes

```
packages/engine/
  scripts/write-identity.mjs         build step: dist/identity.json (runtime dependency closure from pnpm-lock.yaml)
  src/identity.ts                    engineIdentity(librariesDir) → { fingerprint, display, inputs, nodeVersion }
packages/shared/src/
  competency.ts                      KnowledgeEvidenceNode tree, assessmentConditions, targetsOf(unit)
  concepts.ts                        Concept.kind: "content" | "rto-instruction"
  generation.ts                      AcceptanceDecision + "needs-revision"; MappingStatus + "reviewed"; RevisionOrigin
  review.ts                          Dimension, Score, Finding, RUBRIC_VERSION
packages/generator/src/
  ingest/
    admit.ts                         admitSource(): NFC, code-point limits, SourceTooSmallError / SourceTooLargeError
    structure/blocks.ts              Block union
    structure/linearize.ts           blocks → { text, segments: { charStart, charEnd, atomic, headingPath }[] }
    docx.ts  odt.ts                  ingestDocx, ingestOdt
    pdf.ts                           page count checked before getText (≤ 100)
    source-document.ts               EXTRACTION_VERSION; segmentation honours atomic ranges; SourceDocument.metadata additions
  concepts/chunk.ts                  OversizeAtomicSegmentError
  review/
    rubric.ts                        applicability, deriveDecision, activityScores(findings)
    sheet.ts                         SheetManifest, sheetId, buildSheet
    import.ts                        parseScores, validateRows, rowKey, batchId
  report/gate.ts                     gateReport(imports) → GateReport; allocateShared
  pilot/ledger.ts                    readLedger, authoriseRun
  llm/spend.ts                       spendFromAttempts (never reads cost.json)
  pipeline/regenerate.ts             regenerateActivity with RegenerationRequest
  store/types.ts                     BuildRecord, SheetManifest, ReviewBatch, ScoreRecord, RegenerationRequest; ImportStore additions; STORE_VERSION = 2
apps/cli/src/
  extract.ts  regenerate.ts  review-sheet.ts  review-import.ts  gate-report.ts
  file-store.ts                      store version 2 layout; v1 read-only adapter
docs/testing/phase-3-pilot.md        runbook now; sanitised numbers after the pilot
```

**Store version 2 layout (FileStore)**, additions to phase 2's:

```
import.json                  + storeVersion: 2
builds/<activity>-r<n>-<fp12>.h5p      immutable
builds/records/<buildId>.json          BuildRecord, immutable
reviews/sheets/<sheetId>.json          SheetManifest, immutable
reviews/batches/<seq6>-<batchId>.json  ReviewBatch, immutable; the commit point; seq orders history
scores.jsonl                           ScoreRecord, append-only, derived from batches
acceptances.jsonl                      AcceptanceRecord (+ batchId, sequence, rowIndex, scoreRowKey), append-only
regenerations.jsonl                    RegenerationRequest events, append-only, latest per requestId wins
```

---

### Task 1: Store version 2 and read-only phase-2 imports

**Answers:** R5.

**Files:** `packages/generator/src/store/types.ts`, `packages/generator/src/store/memory-store.ts`, `apps/cli/src/file-store.ts`, `apps/cli/src/generate.ts`, `apps/cli/src/review.ts`, tests in both packages.

**Contract:**
- `STORE_VERSION = 2`. `ImportRecord.storeVersion: 2` is written when an import is created. A record without `storeVersion` is version 1.
- `FileStore.open(dir)` reports the version. `LegacyStoreError(dir)`: "`<dir>` was created by phase 2 (store version 1). It is kept unchanged and is read-only. Use a new output directory for phase-3 commands."
- Every write path checks the version under the lock and throws `LegacyStoreError` before any write: `generate` resume, `review` (both kinds), and later `regenerate`, `review-sheet` and `review-import`.
- `readLegacyImport(dir)` returns the phase-2 records as they are stored, typed `LegacyImportView`: import, activities, revisions with their recorded `engineFingerprint` string, acceptances and alignment reviews. It never writes, never computes a fingerprint and never builds a `BuildRecord`.
- `RevisionRecord` gains `origin: "generate" | "regenerate"` and `requestId: string | null`; `engineFingerprint` and `buildKey` move to `BuildRecord` (Task 3). In this task the fields are added and `origin: "generate"` is set by `runImport`.

**Tests (write first):**
- [ ] A phase-2 directory fixture (copied from the phase-2 FileStore test output shape: import without `storeVersion`, one promoted revision, one build, one acceptance). `generate` resume, `review --decision` and `review --criterion` each exit 1 with the `LegacyStoreError` message. A byte-for-byte hash of the directory tree is identical before and after.
- [ ] `readLegacyImport` returns the recorded `engineFingerprint` verbatim and makes no write (the tree hash is unchanged).
- [ ] A new import writes `storeVersion: 2`, and its first revision has `origin: "generate"` and `requestId: null`.

**Verification:** `set -o pipefail; pnpm --filter @leaplearn/generator test && pnpm --filter @leaplearn/cli test && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"` → `exit=0`.

**Commit:** `feat(store): store version 2; phase-2 import directories are read-only`

---

### Task 2: Engine identity

**Answers:** design §3.2, R5 (workspace code and transitive identities).

**Files:** `packages/engine/scripts/write-identity.mjs`, `packages/engine/package.json` (`build` becomes `tsc -p tsconfig.json && node scripts/write-identity.mjs`), `packages/engine/src/identity.ts`, `packages/engine/src/index.ts` (export), `apps/cli/src/generate.ts` (replace the phase-2 `engineFingerprint()`), `packages/engine/test/identity.test.ts`.

**Contract:**
- `write-identity.mjs` reads `pnpm-lock.yaml` and computes the runtime dependency closure of the importers `packages/engine` and `packages/shared`: `dependencies` only, recursively through `snapshots`, each package as `{ name, version, integrity }` from `packages[...].resolution`. Workspace links (`link:`) are recorded as `{ name, workspace: true }`, and their code is hashed at runtime. It writes `dist/identity.json` as canonical JSON (sorted keys, closure sorted by name then version, no timestamps).
- `engineIdentity(librariesDir)` returns `{ fingerprint, display, inputs, nodeVersion }`. `inputs` is the canonical document:
  - `engineDist`: sorted `[relativePath, sha256]` for every file under `packages/engine/dist`, paths `/`-normalised, `*.tsbuildinfo` excluded;
  - `workspaceDist`: the same for `@leaplearn/shared`'s `dist`, located from the engine's own module URL, never from `process.cwd()`;
  - `librariesLockSha256`;
  - `zlib`: `process.versions.zlib`.

  `fingerprint = sha256(canonical(inputs))`, `display = engine@<version>+<fingerprint[0..12]>`, and `nodeVersion = process.versions.node`, which is recorded but not hashed.
- The engine boundary holds: `identity.ts` reads files under the engine's own directory and the given `librariesDir` only.

**Tests (write first):**
- [ ] The closure fixture: a small `pnpm-lock.yaml` fixture with a transitive chain (a → b → c) and a workspace link gives the expected sorted closure. The integrity strings are carried through.
- [ ] Canonical output: the same input in a different key order gives byte-identical `identity.json`.
- [ ] Sensitivity: changing one byte of an engine dist file, one byte of a shared dist file, the libraries lock, or the zlib value (injected for the test) each changes `fingerprint`. Changing `nodeVersion` does not.
- [ ] Reproducibility (integration, in `pnpm verify`): two clean builds of the engine and shared packages into separate temporary copies give the same `fingerprint`.

**Verification:** `set -o pipefail; pnpm --filter @leaplearn/shared build && pnpm --filter @leaplearn/engine build && pnpm --filter @leaplearn/engine test && pnpm -r typecheck && pnpm -r lint; echo "exit=$?"` → `exit=0`.

**Commit:** `feat(engine): content-derived engine identity over dist bytes, workspace code, dependency closure, libraries and zlib`

---

### Task 3: Immutable build records, stamped at build time

**Answers:** design §3.3–3.4, R3 (first generated revision), R5, R10 (origin before dispatch).

**Files:** `packages/generator/src/store/types.ts`, `memory-store.ts`, `pipeline/run-import.ts`, `apps/cli/src/file-store.ts`, `apps/cli/src/report.ts` (mapping and cost read builds), tests.

**Contract:**
- `BuildRecord { importId; activityId; revision; buildId; buildKey; sha256; byteLength; engineFingerprint; engineDisplay; engineInputs; nodeVersion; builtAt }`, where `buildId = sha256(activityId, revision, engineFingerprint)[0..16]` and `buildKey = builds/<activity>-r<n>-<engineFingerprint[0..12]>.h5p`.
- `ImportStore` gains `putBuildRecord(record)`, `listBuilds(activityId)` and `getBuildRecord(buildId)`. `RevisionRecord` gains `currentBuildId: string | null` and loses `engineFingerprint` and `buildKey` for version-2 stores.
- `putBuild(key, bytes)`: if the key exists with identical bytes, it is a no-op; with different bytes it throws `BuildIntegrityError` naming the key and both hashes. It never overwrites.
- `runImport` stamps the engine identity from `deps.engineIdentity` when it **builds**, never when it produces. Resuming a saved candidate under a new engine builds under the new engine and records that. A promoted revision's `currentBuildId` names the build that was made.
- `RunImportDeps.engineFingerprint: string` is replaced by `engineIdentity: EngineIdentity`. The test constant becomes a fixed identity object.
- **Origin before dispatch (R10):** `OperationRecord` gains `origin: "generate" | "regenerate" | "shared"` and `requestId: string | null`, written when the operation starts. Every attempt-start record gains the same two fields, written before dispatch; `callModel` takes them from the stage runner's operation context and never infers them. Operations for parseUnit, extract, merge, align and plan are `shared`. The fields are local metadata: they are not part of the model request, so replay keys do not change.

**Tests (write first):**
- [ ] **Candidate under A, built under B:** a FakeProvider run stops after the produce operation persists the candidate (a fault injected at build). The resume uses identity B. The promoted revision's current build names B, the stored bytes' sha256 equals the build record's, and the resume makes zero provider calls.
- [ ] **Lockfile only:** the same case with only `librariesLockSha256` differing.
- [ ] **No rewriting history:** a revision promoted under A is built again under B through the store API directly (no command does this in phase 3). Two build records exist, A's bytes and record are unchanged, and `currentBuildId` names B. The corresponding review-side assertions come with score records: a review naming A's build is stale for current acceptance (Task 12) and historical in first-pass results (Task 14).
- [ ] **Overwrite refused:** `putBuild` with different bytes for an existing key throws `BuildIntegrityError`; with identical bytes it succeeds and writes nothing (the file mtime is unchanged).
- [ ] A produce operation that exhausts its content attempts, with no revision ever persisted, leaves operation and attempt-start records carrying `origin: "generate"`.
- [ ] The phase-2 replay test still passes with its requests unchanged. Build keys change, and its assertions on build paths are updated to read them from build records.

**Verification:** `set -o pipefail; pnpm verify; echo "exit=$?"` → `exit=0`.

**Commit:** `feat(pipeline): immutable build records stamped with the engine that built them`

### Follow-up F1: stop `FileStore` hiding directory-read errors (due before Checkpoint A)

**Origin:** the owner's review of Task 1 (`2174e06`, fixed in `fa28c18`) found `readLegacyImport` turning every `readdir` failure into an empty list. The same pattern exists in phase-2 code, outside Task 1's scope: `FileStore.listActivities` and `FileStore.listRevisions` in `apps/cli/src/file-store.ts` both call `readdir(dir).catch(() => [] as string[])`. A permission error, or a file where the `activities` or `revisions/<id>` directory belongs, therefore reads as "no activities" or "no revisions". A resume or report can then act on an import that looks empty.

**Scope (bounded):** those two calls only. Treat `ENOENT` as empty, because a new import has no `activities` directory yet and an activity may have no revisions. Propagate every other error. Reuse the `listIfPresent` pattern from `apps/cli/src/legacy-store.ts`, moving it to one shared helper that both files use. No other behaviour changes.

**Tests (write first):**
- [ ] `activities` present as a file: `listActivities` rejects with `ENOTDIR`, and `leap generate` resuming that directory exits non-zero without writing.
- [ ] `revisions/<id>` present as a file: `listRevisions` rejects with `ENOTDIR`.
- [ ] `EACCES` on each directory, injected at the `node:fs/promises` boundary as in `apps/cli/test/legacy-store-errors.test.ts` (tests run as root in the cloud container, so `chmod` cannot deny access).
- [ ] A missing `activities` or `revisions/<id>` directory still reads as empty, and every existing FileStore, pipeline and CLI test passes unchanged.

**Verification:** `pnpm verify` → `exit=0`, in an environment where the pinned Playwright browser is installed.

**Commit:** `fix(cli): FileStore propagates directory-read errors other than ENOENT`

**→ Checkpoint A.**

---

### Task 4: Source admission, NFC, the PDF page limit and the extraction version

**Answers:** design §4.1, C7.

**Files:** `packages/generator/src/ingest/admit.ts`, `source-document.ts`, `text.ts`, `pdf.ts`, `pipeline/fingerprint.ts`, tests; test fixtures under 500 characters are lengthened.

**Contract:**
- `normaliseSourceText(raw)`: CRLF → LF, trailing spaces before a newline removed, trim, then **NFC**. It is pure, enforces no limit, is idempotent (`normalise(normalise(x)) === normalise(x)`), and is used by every adapter. Plain-text, markdown and PDF paths normalise first and only then segment (R11).
- `countCodePoints(text) = [...text].length`.
- `admitSource(text)`: throws `EmptySourceError` for 0, `SourceTooSmallError(count)` for 1–499, and `SourceTooLargeError(count)` above 400,000; 500 and 400,000 are admitted. Messages name the count and the limit. `MIN_SOURCE_CODE_POINTS = 500`, `MAX_SOURCE_CODE_POINTS = 400_000`; `MAX_SOURCE_CHARACTERS` is removed.
- `buildDocument` no longer enforces limits. The `ingest*` entry points call `admitSource` exactly once, on the final normalised text. There is no bypass flag.
- `ingestPdf` reads the page count before `getText()` (via pdf-parse's document info; the task confirms the field against the synthetic PDF) and throws `PdfTooManyPagesError(pages)` above 100.
- `EXTRACTION_VERSION = "2026-09-28.1"` is recorded in `SourceDocument.metadata.extractionVersion` and included in `runFingerprint`.
- Offsets in `Sentence` and `Evidence` stay UTF-16 code units into the stored normalised text. Doc comments on both say so, and say that limits count code points.

**Tests (write first):**
- [ ] Boundaries: 499 code points rejected, 500 admitted, 400,000 admitted, 400,001 rejected. The same at 500 when the text contains astral characters (for example 250 × U+1F600, 500 UTF-16 units but 250 code points), which is rejected.
- [ ] NFC: a decomposed Vietnamese string (NFD) gives the NFC text and hash, and its code-point count is the NFC count.
- [ ] Offsets: for text with an astral character before a sentence, `text.slice(charStart, charEnd)` equals the sentence text (UTF-16 slicing).
- [ ] PDF: a 101-page synthetic PDF (generated in the test with `pdf-lib`) is rejected before text extraction, and the text extraction is spied to be uncalled. A 100-page PDF is admitted on page count.
- [ ] The limit applies only to the submitted source: `segmentSentences`, `chunkSentences` and `parseUnit` accept inputs under 500 (tested directly).
- [ ] The fingerprint changes when `EXTRACTION_VERSION` changes.
- [ ] `normaliseSourceText` is idempotent on a corpus of edge cases: NFD input, CRLF, trailing spaces, leading and trailing blank lines, and astral characters.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(ingest): 500–400,000 code-point admission on NFC text, a 100-page PDF limit and an extraction version`

---

### Task 5: Structured blocks, the linearizer and atomic segments

**Answers:** design §4.2, R4 (header rows, oversize rows), R11 (normalise before offsets), R12 (wire compatibility), R14 (oversize ordinary sentences).

**Files:** `packages/generator/src/ingest/structure/blocks.ts`, `structure/linearize.ts`, `source-document.ts` (`finaliseDocument`; segmentation honours atomic ranges; `Sentence.headingPath`), `concepts/chunk.ts`, `concepts/extract.ts` (heading context), `llm/models.ts` (`MAX_INPUT_TOKENS` per model), tests.

**Contract:**
- `Block = { kind: "heading"; level: 1..6; text } | { kind: "paragraph"; text } | { kind: "listItem"; depth; label; text } | { kind: "table"; index; headerRows: number; rows: Cell[][] } | { kind: "note"; n; text }`, where `Cell = { text; colSpan; rowSpan; blocks?: Block[] }` (a nested table sits in `blocks`).
- **Normalise before offsets (R11).** `normaliseBlockText(t)` applies NFC, turns internal newlines into spaces, collapses runs of spaces and tabs to one space, and trims. Adapters apply it to every block and cell text **before** linearizing. `linearize` builds the text so that it has no trailing spaces, no leading or trailing blank lines and no CR, making it a fixed point of `normaliseSourceText`.
- `linearize(blocks) → { text, segments: { charStart; charEnd; atomic: boolean; headingPath: string[] }[] }`. Offsets are UTF-16 code units into `text`.
  - Headings: their own line; they update the heading path.
  - List items: `"  ".repeat(depth) + label + " " + text`. *Amended 30 Sep 2026:* the indentation does not survive sentence trimming, so each list segment and sentence carries `listDepth` (0 = top level, null outside lists), and the extraction request prefixes a list sentence with `(list level n) ` (n = depth + 1). Plain sources have no list depth, so their requests are unchanged. Inside a table cell, a nested item's children follow it inside `[sub-list: …]` (`• Lock [sub-list: • Padlock • Hasp] • Tag`), so a nested child never reads as a sibling. *(Amended 30 Sep, Task 7 review.)* A list item's further paragraphs are `continuation` items: same depth and `listDepth`, no label (the number is not repeated), indented under the item's text (`1. Lock the isolator.` / `   Use your own padlock.`), so they read in requests exactly as the item's own later sentences do. In a cell they follow the item's text in place, inside its `[sub-list: …]` when nested.
  - Tables: spans are expanded first, repeating the value in every grid position it covers. If `headerRows > 0`, the last header row supplies labels (earlier header rows are joined per column with " / "). If `headerRows === 0`, **no row is consumed**, labels are `Column 1…n`, and row numbering starts at 1 with the first row. Each data row becomes one line: `[Table <index>, row <r>] <label>: <cell>; <label>: <cell>`. Empty cells are written `<label>: —`. A nested table is written inline as `[Table <index>.<k> …]` in the cell's place. Each row line is an **atomic** segment.
  - Notes: `[Note n] text`, placed after the block that cites them. *(Amended 30 Sep, Task 6 review.)* A note's structured content is kept in reading order: every line of it starts `[Note n]`; its list items are indented by depth with their labels and carry `listDepth`; each data row of a table in it is an atomic line `[Note n, table k, row r] …`. A note cited inside a table cell is written inline in that row, `[Note n] …`, with its lists and tables in the cell forms above.
- `finaliseDocument(kind, text, segments, opts, extra)` throws `NormalisationInvariantError` if `normaliseSourceText(text) !== text`, then segments, then calls `admitSource`, then builds the `SourceDocument`. It never transforms `text`. The plain-path entry points (`ingestText`, `ingestMarkdown`, `ingestPdf`) normalise and then call `finaliseDocument` with no segments, so every entry point admits exactly once. *Amended 30 Sep 2026:* `buildDocument` does **not** call `finaliseDocument`; it stays a limit-free helper that normalises and segments for lower-level tests (design §4.1, Task 4), and admits nothing.
- `segmentSentences(text, segments?)`: without segments it behaves as in phase 2. With segments, atomic ranges are one sentence each and are never split; non-atomic ranges are split by the phase-2 rules. Each sentence carries the `headingPath` of its range (empty for plain paths).
- **Wire compatibility (R12):** the extraction prompt adds a heading-context block only when at least one sentence in the chunk has a non-empty heading path. PDF, text and markdown sources have none, so their requests are byte-identical to phase 2.
- **Oversize atomic rows (R4):** `chunkSentences` throws `OversizeAtomicSegmentError { sentenceId, headingPath, label, estimatedTokens, budgetTokens }` for an **atomic** sentence whose estimate exceeds the chunk budget. The message names the table and row, its size and the budget, and suggests `--chunk-tokens` or splitting the table in the source.
- **Oversize ordinary sentences (R14):** a non-atomic sentence larger than the budget still becomes its own chunk, as in phase 2. `MAX_INPUT_TOKENS` is added to `models.ts`, keyed by model ID, with the limits confirmed by the phase-2 preflight (`claude-haiku-4-5-20251001`: 200,000; `claude-sonnet-5`: 1,000,000). Before dispatch, every chunk's complete extraction request (system, context, user, serialised output schema, overhead allowance), estimated as the budget reservation estimates it, plus `maxOutputTokens`, must fit the extract model's limit. Otherwise `RequestTooLargeError { sentenceId, estimatedInputTokens, maxOutputTokens, limit }` is thrown.
- `runImport` performs chunking and both size checks before any dispatch, so either error fails the import with zero model calls.

**Tests (write first):**
- [ ] Two-column key/value table with `headerRows: 0`: row 1 is preserved as `[Table 1, row 1] Column 1: Audit scope; Column 2: …`.
- [ ] Table with `headerRows: 1`: row 1 supplies labels and is not emitted as a data row.
- [ ] Horizontal and vertical spans are repeated into every covered position.
- [ ] A nested list keeps depth and labels, and a list inside a cell is kept in the cell text in order.
- [ ] A nested table is written inline.
- [ ] A row containing `". "` stays one sentence, and the `[Table …]` prefix is inside it.
- [ ] Heading paths: a sentence under H1 › H2 carries both, and a new H2 replaces the old one.
- [ ] **Normalisation invariant:** blocks containing NFD Vietnamese before and inside a table, cell text with leading and trailing spaces and internal newlines, and a document with leading and trailing blank paragraphs. `normaliseSourceText(text) === text`; for every segment and every sentence, `text.slice(charStart, charEnd)` is exactly its text; and the stored text contains only NFC forms.
- [ ] `finaliseDocument` given a non-normalised text throws `NormalisationInvariantError`.
- [ ] Oversize atomic row: with a budget of 50 tokens, `runImport` with FakeProvider fails with `OversizeAtomicSegmentError`, and FakeProvider records zero calls.
- [ ] Oversize ordinary sentence: with `MAX_INPUT_TOKENS` overridden to a small value for the test, a long non-atomic sentence gives `RequestTooLargeError` with zero calls, and at the real limit the same sentence is accepted.
- [ ] **Wire compatibility:** for the phase-2 synthetic PDF, the extraction requests' `requestKey`s equal those of the recorded phase-2 fixtures (the replay test passes unchanged).

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(ingest): structured blocks, a table-preserving linearizer on normalised text, atomic rows and request-size checks`

---

### Task 6: DOCX adapter

**Answers:** design §4.2, R4.

**Files:** `packages/generator/src/ingest/docx.ts`, `packages/generator/test/fixtures/structure/*.docx` (synthetic, generated by a checked-in script `test/fixtures/structure/make-docx.mjs` from `docx-builder.mjs` so the fixture is reproducible; a test regenerates it and compares bytes), tests.

**Contract:**
- `ingestDocx(bytes, opts)` runs mammoth (`convertToHtml`, default style map, images ignored) and walks the HTML with htmlparser2 into blocks:
  - `h1`–`h6` → heading, `p` → paragraph;
  - `ol`/`ul` → listItem with depth and a label (`ol`: `1.`, `2.`… by position; `ul`: `•`);
  - `table` → table: `thead`/`th` rows are counted as `headerRows` only when they come from `w:tblHeader`; `colspan`/`rowspan` are kept;
    *(Amended 1 Oct, Checkpoint B.)* Only a row whose `w:tblHeader` is on (bare, or `true`, `1`, `on`) is a header row. mammoth 1.13 treats any `w:tblHeader` element as a header whatever its `w:val`, and puts every leading header row in `thead`; the BSBAUD412 packet marks almost every row `w:val="false"`, so 54 of its 56 tables lost all their data rows. The adapter now removes off-valued `w:tblHeader` elements (`false`, `0`, `off`) from the parts mammoth reads, in document, footnotes and endnotes. A row marked on below a data row stays data, as Word repeats only leading header rows. `EXTRACTION_VERSION` becomes `2026-10-01.1`. Tested on synthetic tables with true, bare, `1`/`on`, false/`0`/`off` and absent flags, including tables with no header rows and a table in a footnote, with exact citation slicing.
  - footnote and endnote references → note blocks placed after the citing block, carrying the note's paragraphs, lists (with nesting) and tables;
  - block content inside a list item (a table or paragraph) follows the item as blocks; no content is dropped.
- The task first checks mammoth's behaviour against the fixture: `th` for `w:tblHeader` rows, `colspan` for `gridSpan`, `rowspan` for `vMerge`, deletions dropped, insertions kept. Wherever mammoth does not deliver one of these, the adapter reads that property from `word/document.xml` (via jszip and xmldom) for the affected tables. The commit message records which path each property uses.
- Custom numbering formats (`a)`, `i.`) are rendered as decimal or bullet labels (R13). The adapter reads `word/numbering.xml` and the paragraphs' `w:numPr` from `word/document.xml`, and returns `warnings.listNumberingSimplified: { listIndex, headingPath, originalFormats: string[] }[]` for every list that uses a format other than `decimal` or `bullet`. It also returns `warnings.labelLikeReferences`: every sentence containing a pattern that looks like a list-label reference (`item [a-z]\)`, `\([a-z]\)`, `\([ivx]+\)`, `[a-z]\) above/below`), with its sentence ID.
- *(Amended 1 Oct, Checkpoint B.)* `labelLikeReferences` also flags a list noun with a number: `step`, `question`, `item` or `point` (singular or plural) followed by digits or a number word up to ten ("step four", "Step 3", "questions 2 and 3"), and an ordinal up to tenth before one ("the fourth question"). Checkpoint B found references of that form, written in words, that pointed into lists the packet had left without numbers, and the earlier patterns missed them. A false positive costs one review check; a miss can cost a reference its meaning. Warnings only: the extracted text and `EXTRACTION_VERSION` are unchanged.
- *(Amended 30 Sep, Task 6 review.)* Numbering is resolved as Word resolves it before mammoth runs: the paragraph's own `w:numPr`, else its style's (following `w:basedOn`, with the paragraph's own `w:ilvl` applying and `numId 0` switching it off), else a list level linked to the style by `w:pStyle`; each `w:num`'s `w:lvlOverride` levels over its abstract definition; `w:numStyleLink` followed. The adapter writes the effective numbering back into the parts mammoth reads, so rendered lists and warnings use the same formats. Numbering it cannot render is reported, never silently read as ordinary paragraphs: `warnings.numberingUnsupported: { reason: "numbered-heading" | "missing-definition", headingPath, text, numId, ilvl }[]`.
- Block texts go through `normaliseBlockText` before linearizing (R11).
- The result goes through `linearize`, then `buildDocument("docx", …)` with segments, then `admitSource`. The metadata records `originalSha256`, `extractor: "docx"` and `extractionVersion`.

**Fixture contents (synthetic):** H1 › H2 headings; a nested numbered list; a list numbered `a)`, `b)`, and a later sentence "see item b) above"; a two-column key/value table without a header row; a table with a marked header row, a horizontal and a vertical merge, and a list inside a cell; a nested table; a footnote with a nested list; an endnote with a numbered list and a table; a footnote cited inside a table cell; a tracked insertion and a tracked deletion; **NFD Vietnamese text in a paragraph before a table and inside a table cell; cells and paragraphs with leading and trailing spaces; leading and trailing empty paragraphs**; more than 500 code points in total.

**Tests (write first):**
- [ ] A golden linearized text for the fixture, compared exactly.
- [ ] The tracked deletion's text is absent and the insertion's text is present.
- [ ] The metadata fields are set, and `originalSha256` equals the sha256 of the input bytes.
- [ ] **Citations slice back:** `normaliseSourceText(text) === text`, and for every sentence `text.slice(charStart, charEnd) === sentence.text`. The Vietnamese passages are NFC.
- [ ] **Numbering warning:** the `a)` list appears in `listNumberingSimplified` with `lowerLetter`, and the "see item b) above" sentence appears in `labelLikeReferences`.
- [ ] *(Added 30 Sep.)* **Note content:** the footnote's nested list, the endnote's list and table, and the in-cell note's list survive, in order and with their depth.
- [ ] *(Added 30 Sep.)* **Effective numbering:** a `lowerLetter` level supplied by `w:lvlOverride` is reported; a bullet override renders as bullets; numbering inherited through a paragraph style (and `w:basedOn`) renders with labels and is reported; `w:numStyleLink` is followed; numbered headings and missing definitions appear in `numberingUnsupported`.
- [ ] *(Added 30 Sep.)* **Reproducible fixture:** the fixture regenerated from `docx-builder.mjs` is byte-identical to the committed file.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(ingest): DOCX ingestion preserving tables, lists, headings and notes`

---

### Task 7: ODT adapter

**Answers:** design §4.2, R4.

**Files:** `packages/generator/src/ingest/odt.ts`, `test/fixtures/structure/make-odt.mjs` (from `odt-builder.mjs`, as for DOCX) and the generated `.odt`, tests.

**Contract:**
- `ingestOdt(bytes, opts)` opens the zip with jszip, parses `content.xml` with xmldom, and walks `office:body/office:text` in document order:
  - `text:h` (`text:outline-level`) → heading; `text:p` → paragraph;
  - `text:list` / `text:list-item` → nested listItem, with labels from the list style in `office:automatic-styles` or `styles.xml` (number format and suffix), falling back to decimal or bullet;
    *(Amended 30 Sep, Task 7.)* Labels use the level's `style:num-format` (`1`, `a`, `A`, `i`, `I`, or none), `style:num-prefix`/`num-suffix`, `text:start-value`, `text:display-levels` and `style:num-letter-sync`; items' `text:start-value`, `text:list-header` (no label), an item's further paragraphs as continuations of that item (see the linearizer's list items), `text:continue-numbering` and `text:continue-list` are followed; a list naming no style takes its first paragraph's style's list style. Every bullet reads `•` (bullet glyphs are font-specific, often private-use code points), as in DOCX. A number format outside that set is rendered decimal and reported in `listNumberingSimplified`; a list whose style or level is missing is labelled `•` and reported in `numberingUnsupported` (`missing-definition`), as are headings the outline style numbers (`numbered-heading`);
  - `table:table` → table: `table:table-header-rows` counts toward `headerRows`; `table:number-columns-spanned` and `table:number-rows-spanned` are kept; `table:covered-table-cell` is skipped because the span expansion fills it;
  - `text:note` → note block after its paragraph, with the note body's paragraphs, lists and tables (the Task 6 note form); footnotes and endnotes are numbered together in order of reference;
  - *(Amended 30 Sep, Task 7.)* repeated cells and rows (`table:number-columns-repeated`, `table:number-rows-repeated`) are expanded and row groups read; text-box content in `draw:frame`, `text:section` content and index bodies are kept; a rendered `text:number` is not read as text;
  - `text:s` (with `text:c`), `text:tab` and `text:line-break` → space, tab and newline;
  - `office:annotation` is skipped, and `text:tracked-changes` deletions are dropped.
- Then linearize and `finaliseDocument("odt", …)` (the single admission path, as amended for Task 5), with the same metadata as DOCX (`extractor: "odt"`). A file that is not an ODF text document is refused with `OdtFormatError`.

**Fixture contents:** the same structures as the DOCX fixture, expressed in ODF, including the NFD Vietnamese before and inside a table and the leading and trailing whitespace, so the linearized goldens can be compared structurally. Block texts go through `normaliseBlockText` before linearizing (R11). ODT list labels come from the list style, so the `a)` list keeps its real labels; `labelLikeReferences` is still reported.

**Tests (write first):**
- [ ] *(Added 30 Sep.)* The fixture regenerated from `odt-builder.mjs` is byte-identical to the committed file; list-label formats, continuation, repeated cells, unsupported formats and missing styles have variant tests.
- [ ] A golden linearized text for the ODT fixture.
- [ ] A cross-format test: the DOCX and ODT fixtures give the same table and list lines (headings and notes may differ in whitespace only, after normalisation).
- [ ] `text:s text:c="3"` inside a sentence gives one space after block normalisation, and an annotation's text is absent.
- [ ] **Citations slice back:** the same fixed-point and slicing assertions as the DOCX task.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(ingest): ODT ingestion with the same structural contract as DOCX`

---

### Task 8: `leap extract` and DOCX/ODT sources in `generate`

**Answers:** design §4.2 (inspection before any paid run).

**Files:** `apps/cli/src/extract.ts`, `apps/cli/src/index.ts`, `apps/cli/src/generate.ts` (dispatch by extension: `.txt`, `.md`, `.pdf`, `.docx`, `.odt`; anything else is refused with the list), tests.

**Contract:**
- `leap extract --source <file> --out <dir> [--chunk-tokens N]` makes no model call and needs no API key or ledger. It writes:
  - `extracted.txt`: the linearized text;
  - `tables.md`: per table, the index, heading path, row count, header labels or "no marked header row (Column n labels)", and the first two row lines;
  - `extract.json`: `{ originalSha256, extractor, extractionVersion, textHash, codePoints, pages?, sentenceCount, atomicSegmentCount, oversizeAtomicSegments: [...], oversizeRequests: [...], warnings: { listNumberingSimplified, numberingUnsupported, labelLikeReferences } }`, with oversize segments and requests computed against `--chunk-tokens` (default the pipeline default) and `MAX_INPUT_TOKENS`;
  - `warnings.md`: the simplified-numbering lists, unsupported numbering and label-like references, each with its heading path and the sentence text, for Checkpoint B.
- The command exits 1 if admission fails, printing the count and the limit.
- `--out` must not be inside the repository unless under `docs/uoc/`, so real material stays out of git. A test asserts the refusal.
- *(Amended 30 Sep, Task 8.)* Both commands read sources through one loader (`apps/cli/src/source.ts`) by extension; any other extension is refused with the list before the file is read (previously `generate` read unknown extensions as text). `generate` prints a one-line summary of a structured source's warnings to stderr and points to `leap extract`. `extract.json` also records `chunkTokens` and `chunkCount`; oversize segments are listed, not refused (each becomes its own chunk so requests can still be sized), and request sizes use the default prompt configuration. `tables.md` lists top-level tables and tables inside notes (`Note n, table k`); tables nested in cells are inline in their row. The `--out` check resolves symlinks on the existing part of the path, requires a directory *below* `docs/uoc/` (not the folder itself), and applies to the repository the CLI runs from (none when installed elsewhere).
- *(Amended 30 Sep, Task 8 review.)* **Reports are never overwritten.** Before anything is written, each report name in `--out` must be free: an existing file (the source included) or a symbolic link, even a dangling one, is refused with exit 1 and nothing written. Reports are written to a staging directory inside `--out` and hard-linked into place, which cannot replace a name that appears meanwhile; any failure removes what was published, so a run leaves all four reports or none. A rerun needs a new `--out`.
- *(Amended 30 Sep, Task 8 review.)* **The original structured source is stored unchanged** (design §4.2). `runImport` takes a DOCX or ODT source's original bytes (required for those kinds) and, under the lock, before the import record and any dispatch, checks them against the document's `originalSha256` and, on resume, against the hash recorded with the stored source and against the stored original; the first run stores them once as `source/original.docx` or `.odt` (`ImportStore.putOriginalSource`, never overwritten) and reads them back to verify. A changed original, even with unchanged text and fingerprint, or an altered stored original is refused with `OriginalSourceError` and no write or model call.
- *(Amended 30 Sep, Task 8 review.)* **Simplified-numbering locator:** each `listNumberingSimplified` entry also carries `itemCount`, `firstItemText` and `firstSentenceId` (the list sentence under the same headings that the first item became, else the atomic row containing it; null when none matches), and `warnings.md` prints them.
- *(Amended 30 Sep, Task 8.)* **Extraction version settled:** `EXTRACTION_VERSION` becomes `2026-09-30.2`, marking the DOCX and ODT adapters as enabled for persistent ingestion after the Task 6 and 7 corrections. Earlier DOCX or ODT output is development output: an import created under `2026-09-30.1` refuses to resume (tested). The DOCX and ODT paths run the whole pipeline on FakeProvider (the synthetic electrical-safety text rebuilt as DOCX and ODT with the fixture builders), so no replay recording is needed for them (R12).

**Tests (write first):**
- [ ] Running on the DOCX fixture writes the four files, `tables.md` lists the key/value table as having no marked header row, and `warnings.md` lists the `a)` list and the "see item b) above" reference.
- [ ] A source of 499 code points exits 1 with the admission message.
- [ ] An `--out` inside the repo and outside `docs/uoc/` exits 1.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(cli): leap extract for zero-cost inspection; generate accepts DOCX and ODT`

**→ Checkpoint B.** Benjamin runs `leap extract --source docs/uoc/BSBAUD412/<packet> --out docs/uoc/BSBAUD412/extract-1` and checks at least five tables against the original (merged cells, a table across pages, lists in cells, a key/value table, a table without headers), reviews `oversizeAtomicSegments` and `oversizeRequests`, and checks every entry in `warnings.md`: each label-like reference must still point unambiguously at the right item. If any does not, the DOCX adapter renders real numbering formats before P1 (a change to Task 6 with its own tests). The result, with table numbers and pass or fail but no content, goes into `docs/testing/phase-3-pilot.md`.

---

### Follow-up F2: `leap generate` prints the real package path (due before Task 16)

**Origin:** found during Task 8 (`ee3585e`) and recorded at the owner's request. After an import, `apps/cli/src/generate.ts` prints each activity's package as `builds/<activityId>-r<revision>.h5p`. Since Task 3, packages are stored under `BuildRecord.buildKey` = `builds/<activity>-r<n>-<fp12>.h5p`, so the printed path names a file that does not exist. The pilot runbook (Task 16) must not rely on these paths until this is fixed.

**Scope (bounded):** the summary line only. Print the promoted revision's actual `BuildRecord.buildKey` (revision → `currentBuildId` → `getBuildRecord`), and print no path when the revision has no build record. No other behaviour changes.

**Tests (write first):**
- [ ] After a replay run, every printed package path exists under the output directory and equals the activity's `BuildRecord.buildKey`.
- [ ] An activity without a build record prints no path.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `fix(cli): generate prints each activity's actual build key`

---

### Follow-up F3: decide the plan/produce model before S1 (Sonnet 5 → Sonnet 5.5)

**Origin:** the owner's decision of 1 Oct 2026: keep `claude-sonnet-5` for the `plan` and `produce` roles for now, revisit before S1, and update at some stage. Claude Sonnet 5.5 (`claude-sonnet-5-5`) is the current Sonnet. Its list price is the same as Sonnet 5 ($2 input / $10 output per MTok, $0.20 cache reads), with the same 1M context, 128K output and tokenizer, so any saving would come from tokens used per task, which only a measured run shows.

**When:** decided by the owner before the S1 ledger entry (Checkpoint C), so that S1 and the pilot record and measure the model the pilot will use. If the owner defers again, record the deferral here; S1 then runs on Sonnet 5.

**Decision (1 Oct 2026, Checkpoint C): deferred.** Benjamin keeps `claude-sonnet-5` for `plan` and `produce` in S1, to hold the model constant while the Task 10 pipeline changes are measured. S1 runs on Sonnet 5; F3 stays open, to be revisited after the pipeline changes are measured.

**Scope if adopted (bounded):**
- `MODEL_ROLES.plan` and `MODEL_ROLES.produce` → `claude-sonnet-5-5`; entries for it in `MAX_INPUT_TOKENS` (1,000,000), `REQUEST_PROFILES` and the pricing table.
- Request profile: Sonnet 5.5 rejects `thinking: {type: "disabled"}` (400). Use `thinking: {type: "between_tools"}` (accepted at effort `high` or below, no other thinking field), or adaptive thinking at a measured effort; no sampling parameters (non-default values are a 400).
- A `stop_reason: "refusal"` response becomes a content failure with its `stop_details` category recorded; whether to use server-side fallbacks is decided with it.
- Unaffected: structured output already uses `output_config.format`, not forced `tool_choice` (a 400 on Sonnet 5.5).
- The historical recordings were made with `claude-sonnet-5` and stay as they are in the archive (R12 amendment of 1 Oct 2026); they are not replayed by the current pipeline, so a model change does not touch them. Only S1 and later recordings use the new model.

**Tests (if adopted):** the request profile sent for each role (no `disabled` thinking, no sampling parameters); the refusal path as a content failure; the historical archive's integrity checks pass unchanged; pricing and input limits for the new ID.

**Commit (if adopted):** `feat(llm): plan and produce on Claude Sonnet 5.5`

---

### Task 9: Pilot ledger and paid-run authorisation

**Answers:** R6, R7.

**Files:** `packages/generator/src/pilot/ledger.ts`, `packages/generator/src/llm/spend.ts` (`spendFromAttempts`), `apps/cli/src/generate.ts`, `apps/cli/src/index.ts`, tests.

**Contract:**
- `readLedger(path)` validates with Zod: `totalCapUsd > 0`; runs with unique `runId`s and unique absolute `outDir`s, `capUsd > 0`, and non-empty `authorisedBy` and `authorisedOn`.
- `authoriseRun(ledger, { runId, outDir, budgetUsd })` is pure. It returns `ok` or a refusal naming the rule:
  - the listed caps sum to more than `totalCapUsd` (static allocation; every run is refused until the ledger is corrected);
  - the run is not listed;
  - `outDir` differs from the entry;
  - `budgetUsd` is above the run's cap.
- `spendFromAttempts(attempts)` sums known and estimated outcome costs. It keeps the **reservation** as spent in two cases: an attempt start with no outcome, and an outcome whose cost is unavailable. This is phase 2's accounting (`settle` in `llm/budget.ts` keeps the reservation when the actual cost is unknown, and resume reconciliation treats an orphan start the same way), and it is used for display and for the per-run check. It never reads `cost.json`.
- `generate` requires `--ledger` and `--run` when the provider is `anthropic` or `record`, and runs `authoriseRun` before creating or resuming anything. On resume, it also refuses if `spendFromAttempts` for the directory already meets the cap, with a message giving spend and cap. The import's per-import budget is set to `min(--budget-usd, cap)`; the phase-2 rule that a resume may raise the budget is bounded by the cap. Task 13 applies the same checks to `regenerate`. Replay and fake providers ignore the ledger.
- The documentation and messages call caps **estimated** and never say a run or the pilot "cannot" exceed them.

- *(Amended 1 Oct, Task 9.)* The ledger is a JSON file. `--budget-usd` has no fixed default any more: a paid run without it gets its run's cap, and a replay run gets $2 as before; `budgetFromLedger` now takes its spend from `spendFromAttempts`, so resume and the ledger check share one rule. The concurrency test runs the two `generate` calls in one process at once, with a provider injected through `generate`'s test-only `deps.provider` on the `record` code path; the authorisation is pure and each run reads only its own directory, so two processes would exercise the same code. The README's paid example names `--ledger` and `--run`.

- *(Amended 1 Oct, Task 9 review.)* Every cap and budget converts through one rule, `toUsdMicro`: a finite amount above zero whose µUSD value is a positive safe integer. Ledger caps that do not convert are refused by `readLedger`; a requested budget that does not convert is refused by `authoriseRun` (`invalid-budget`, checked first) and by `generate` on every provider path, before anything is written or dispatched, since a NaN would make every cap comparison false and disable enforcement. `generate` also refuses a NaN or non-positive `--max-requests`, `--max-tokens` or `--max-seconds`, for the same reason. An injected test provider is refused outside the ledger-checked paths (`anthropic`, `record`).

**Tests (write first):**
- [ ] Each refusal rule, with its message.
- [ ] `generate --provider record` without `--ledger` exits 1 before any directory is created.
- [ ] **Static allocation:** caps of 1 + 3 + 3 against a total of 5 refuse every run; against 7 they allow each.
- [ ] **Concurrent authorisations:** two `generate` processes (FakeProvider behind the `record` code path, injected for the test) for two listed runs start at the same moment. Both are authorised, each import's budget equals its own cap, and neither run's spend counts against the other.
- [ ] **Crash with no `cost.json`:** a run directory with attempt starts and outcomes but no `cost.json`, including one start without an outcome and one outcome with unavailable cost. `spendFromAttempts` counts both at their reservations, and resume authorisation uses that figure.
- [ ] **Matches phase-2 accounting:** for the same attempt records, `spendFromAttempts` equals the `budgetUsed.spentUsdMicro` that phase-2 resume reconciliation produces.
- [ ] **Resuming a partly spent run:** a directory with $0.60 spent against a $1 cap resumes with a per-import budget of $1, and a dispatch whose reservation would cross $1 is refused. A directory whose spend already meets the cap is refused before any dispatch.
- [ ] `--budget-usd` above the cap is refused, and at the cap it is allowed.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(cli): pilot ledger with static cap allocation; spend read from attempt records`

---

### Task 10: Knowledge Evidence tree, assessment conditions, source authority and KE alignment

**Answers:** design §4.3–4.4, R12. This is the first task that changes model requests, so the synthetic replay fixtures are re-recorded here (run S1). S1 records the **current** PDF ingestion path, restoring current-PDF replay coverage (R12 amendment, 30 Sep 2026); the historical replay and its frozen source document stay as they are.

**Branching:** the offline part (steps 1–3) is committed on a task branch, `phase-3/task-10`, so its intermediate state can be reviewed. After Checkpoint C and a successful S1 (step 4), the offline work and the recording are **squashed into one commit** and that commit is added to the phase branch. A fast-forward would keep only the head green and carry the temporarily failing checkpoint into history; squashing keeps every commit on the phase branch green. The task branch is kept until the squashed commit is reviewed.

**Files:** `packages/shared/src/competency.ts`, `packages/shared/src/concepts.ts`, `packages/generator/src/schemas/model-output.ts`, `competency/parse-unit.ts`, `concepts/extract.ts`, `concepts/align.ts`, `plan/planner.ts`, `prompts/system.ts` (`PROMPT_VERSION` bump), `packages/generator/test/helpers/s1-settings.ts`, the synthetic fixtures, `test/fixtures/replay/synthetic/` (re-recorded), tests.

**Contract:**
- `KnowledgeEvidenceNode = { id: string; text: string; children: KnowledgeEvidenceNode[] }`, with IDs `KE<n>` and `KE<n>.<m>`, assigned in code in document order, never by the model. The model returns the tree without IDs. `UnitOfCompetency` gains `knowledgeEvidence: KnowledgeEvidenceNode[]`, `assessmentConditions: string | null` (verbatim) and `release: string | null` (as printed). `targetsOf(unit)` returns PCs and every KE node as `{ id, kind: "pc" | "ke", text, path }`.
- **Wire schema (no recursion):** the structured-output API does not accept recursive schemas. The model returns Knowledge Evidence as a **flat list** `{ index, parentIndex: number | null, text }[]` in document order; code validates it (unique indices, parents earlier in the list, no cycles) and rebuilds the tree, then assigns IDs. The recursive `KnowledgeEvidenceNode` type exists only in `packages/shared` and never in a model-output schema. An invalid parent index is a content retry.
- The parse prompt requires verbatim wording and nesting. A check verifies that every KE `text` and the assessment conditions occur, after whitespace normalisation, in the pasted unit text; a failure is a content retry.
- `Concept.kind: "content" | "rto-instruction"`. The extract prompt defines an RTO instruction as a statement about how one provider organises, delivers, assesses or administers the unit (assessment arrangements, submission rules, simulated or workplace options, attempts, deadlines). The merge keeps kind, and `rto-instruction` wins on conflict.
- Alignment covers every target from `targetsOf(unit)` under the phase-2 evidence rule. Only `content` concepts are offered. `unsupportedCriteriaIds` includes unsupported KE nodes. Provenance `criteriaIds` holds PC and KE IDs; the field name is unchanged (a recorded deviation, accepted).
- The planner never allocates an `rto-instruction` concept. Assessment conditions are never taken from the source document.
- Records naming target IDs carry `unitTextHash`.
- *(Amended 1 Oct, Task 10 offline part.)* **Stored records from before KE IDs:** `Concept.kind` defaults to `content` when absent, and alignment and planning exclude only `rto-instruction` (so a concept without a kind counts as content, as the schema reads it). `Alignment.unitTextHash` is optional in the schema, because alignments stored earlier have none; every new alignment carries it. `ActivityRecord.unitTextHash` is `string | null` (null when the import has no unit) and is written for every new activity. `targetsOf` skips Knowledge Evidence stored as plain strings: those had no IDs and were never targets. Resuming an earlier import is still refused by the run fingerprint (`PROMPT_VERSION` is part of it).
- *(Amended 1 Oct, Task 10 offline part.)* **Other prompts that change with the contract:** the align request lists KE nodes in their own block, a nested node with its ancestors' text (`- KE2.1: … (under: …)`). The produce request's criteria block is headed `CRITERIA THIS ACTIVITY HELPS REVISE (PC: performance criterion; KE: knowledge evidence)` and resolves KE IDs too. `leap review` accepts KE IDs (it checks against `targetsOf`). `PROMPT_VERSION` becomes `2026-10-01.1`.
- *(Amended 1 Oct, Task 10 offline part.)* **The stage runner keeps the provider's error as `cause`** on the `InfrastructureFailure` it throws (the message is unchanged). Without it the replay-miss check could only read the message, not the throw site: Vitest's JSON report keeps the outer stack only, so `scripts/expect-replay-miss.mjs` runs the suite through Vitest's Node API, with the JSON reporter for the per-file census and a capture reporter for each failure's error chain.
- *(Amended 1 Oct, Task 10 offline part.)* **Request snapshots:** `test/request-shape.test.ts` snapshots the parse, extract and align requests for `S1_SETTINGS`. At S1's chunk budget the synthetic PDF is one chunk, so there is no merge request. The align request's concept list comes from the scripted extract reply, so the snapshot pins the align template and the unit's targets, not what S1's model will return.
- *(Amended 1 Oct, Checkpoint C ruling.)* **Historical replay after Task 10:** every recorded request changes in this task, so the historical replay is archived, not replayed: see the R12 amendment of 1 Oct 2026. The phase-2 recordings, frozen document, original unit text and pre-Task-10 PDF are kept byte for byte in `test/fixtures/historical/` with a hash manifest naming `db6057a` as the last compatible revision, and `test/historical-archive.test.ts` replaces the historical replay test. `replay.test.ts` holds only the S1 consumer.
- *(Amended 1 Oct, Checkpoint C ruling.)* **S1 out directory:** the ledger's S1 `outDir` ends in `/s1`, so `leap generate` gives the import ID `s1` that `S1_SETTINGS` pins. The import ID is not part of any request, so it does not affect replay keys.
- *(Amended 1 Oct, Checkpoint C review.)* **The S1 replay accepts only a complete run:** status `ready` (never `ready_with_failures`); at least one planned activity of every selected type; every planned activity promoted, its promoted revision pointing at the build record derived from activity, revision and engine fingerprint, whose stored package bytes match the record's sha256 and length and open as an H5P package. The check is `test/helpers/import-complete.ts`; offline tests in `pipeline.test.ts` show it passes a complete run and rejects a failed activity, a missing type, damaged package bytes and a build under another engine.
- *(Amended 1 Oct, Checkpoint C ruling.)* **S1 model:** F3 is deferred; S1 runs `plan` and `produce` on `claude-sonnet-5`.

**S1 fixture and settings (R12), pinned in `test/helpers/s1-settings.ts` as `S1_SETTINGS`:**
- Source: `packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf`, regenerated by its existing script from the source text. The text gains an "RTO instructions" section stating that assessment has no simulated option, and stays above 500 code points and ASCII-only.
- Unit: `packages/generator/test/fixtures/synthetic/unit-synele001.txt`, gaining nested Knowledge Evidence bullets and an Assessment Conditions section allowing a workplace or a simulated environment.
- Settings: types `multiChoice, blanks, flashcards`; language `en`; `DEFAULT_PROMPT_CONFIG`; customisation `null`; chunk budget `DEFAULT_CHUNK_TOKENS`; plan rules `DEFAULT_PLAN_RULES`; import ID `s1`; concurrency 1, so request order is deterministic.
- **Replay consumers:** `packages/generator/test/replay.test.ts` and `apps/cli/test/pilot-rehearsal.test.ts` (Task 15). Both import `S1_SETTINGS`, and a test asserts that each consumer's generate inputs deep-equal it. DOCX and ODT pipeline paths never replay S1; they run on FakeProvider.

**Steps:**
1. Write the FakeProvider tests below and see them fail.
2. Implement. Add request-shape tests: every new and changed model-output schema passes the phase-2 `toProviderSchema` contract test; **the actual outgoing `output_config.format.schema` for parse, extract and align, as sent by the Anthropic adapter, contains no `$ref`, `$defs` or `definitions` and no self-reference** (a test walks the serialised schema); and the parse, extract and align requests for `S1_SETTINGS` are snapshotted (system, user and the serialised schema), so any later unintended change shows in review.
3. **Offline verification:** build, typecheck, lint and every test file pass, except `replay.test.ts`. That file must fail **only** because a recorded response is missing. A script, `scripts/expect-replay-miss.mjs`, runs the whole generator suite with Vitest's JSON reporter and checks:
   - every failing test is in `replay.test.ts`, and no other file has a failure or an error;
   - every failure's error is a `ReplayMissError` thrown by `ReplayProvider.complete`, with a message naming a purpose and a request-key prefix;
   - for each such key prefix, no file in `test/fixtures/replay/synthetic/` starts with it (the recording is genuinely absent, not unreadable or malformed);
   - the purpose is one this task changes (`parseUnit` for the first stage to miss).
   Any other failure, including a malformed fixture, a schema error or an assertion failure, fails the script. Build, typecheck and lint run separately and must exit 0. Commit on `phase-3/task-10`.
4. **→ Checkpoint C**, then S1, only after Benjamin's ledger entry exists:
   `node --env-file=.env apps/cli/dist/index.js generate --source packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf --unit packages/generator/test/fixtures/synthetic/unit-synele001.txt --out <S1 outDir> --budget-usd 1 --provider record --fixtures packages/generator/test/fixtures/replay/synthetic --ledger docs/uoc/pilot-ledger.json --run S1 --concurrency 1`
   `<S1 outDir>` ends in `/s1`. *(Amended 1 Oct.)* There are no stale fixture files to remove: the phase-2 recordings were archived unchanged in `test/fixtures/historical/` before S1, and `test/fixtures/replay/synthetic/` holds only what S1 records. `replay.test.ts` is updated for the new counts and targets, and `scripts/expect-replay-miss.mjs` is deleted.
5. **If S1 fails** (a provider error, a content failure that leaves the replay set incomplete, or a cap refusal), keep its directory and recorded files, write the failure into `docs/testing/phase-3-pilot.md`, and stop. A retry needs a new ledger entry.

**Tests (write first, FakeProvider):**
- [ ] Nested KE bullets give `KE1`, `KE2`, `KE2.1`, `KE2.2` with the wording verbatim. Paraphrased KE text in a fake response triggers a content retry.
- [ ] Assessment conditions are parsed verbatim, and paraphrase is rejected.
- [ ] **Negative test:** with the synthetic packet and unit, the "no simulated option" statement's concept has kind `rto-instruction`, the plan targets no such concept, the alignment offers none, and the parsed unit's assessment conditions still allow a simulated environment.
- [ ] Alignment returns entries for every PC and KE node, and KE-only support appears in `unsupportedCriteriaIds` when absent.
- [ ] The same unit text gives the same IDs, and a changed unit text gives a different `unitTextHash`.
- [ ] Both replay consumers' inputs deep-equal `S1_SETTINGS`.

**Verification:** after step 4, `pnpm verify` → `exit=0` with no replay miss, and the S1 cost, from `spendFromAttempts`, is recorded in the commit message.

**Commit:** `feat(generator): Knowledge Evidence tree and alignment, assessment conditions, RTO-instruction classification; re-record synthetic fixtures`

---

### Task 11: Claims wording, mapping kinds and the review-sheet export

**Answers:** design §4.5, §7.1, R1, R2.

**Files:** `packages/shared/src/review.ts`, `packages/shared/src/generation.ts`, `packages/generator/src/review/sheet.ts`, `packages/generator/src/store/types.ts` (`SheetManifest`, `putSheet`, `getSheet`), `apps/cli/src/report.ts` (mapping), `apps/cli/src/review-sheet.ts`, `apps/cli/src/index.ts`, README and CLI help text, tests.

**Contract, claims:**
- `mapping.csv` starts with the notice line `# Suggested alignment of revision activities; not an assessment record. Rows marked reviewed were checked by a person against the cited passages and the unit.`
- Columns gain `kind` (`pc` or `ke`), `targetText` and `unitTextHash`. `MappingStatus` gains `reviewed`, set only when the activity's current build has a counted scored review with decision `accepted`; alignment-review statuses are unchanged.
- A test greps the CLI help, README, prompts and report headers for the words `competent`, `competency achieved`, `assessment evidence`, `meets RTO`, `verified` and `validated`. Any hit outside an allowed-phrases list fails the test.

**Contract, sheet:**
- `RUBRIC_VERSION = "r1"`. `Dimension = "correctness" | "support" | "distractors" | "mapping" | "usefulness"`. `applicable(dimension, type, hasUnit)` follows design §5.
- `SheetManifest { sheetId; importId; unitTextHash | null; rubricVersion; createdAt; entries: { activityId; revision; buildId; type; itemIds: string[] }[] }`, with `sheetId = sha256(canonical({ importId, unitTextHash, rubricVersion, entries sorted by activityId }))`. It is written once to `reviews/sheets/<sheetId>.json` and never changed. Writing the same `sheetId` again is a no-op.
- `review-sheet` includes every promoted, non-dropped activity whose current build has no counted scored review. It writes the manifest, then three files next to it under the import directory:
  - `review-sheet.md`, per activity: the content, keyed answers, item IDs and item count; (a) supporting passages in full with sentence IDs and heading paths; (b) targets with kind, path and text; (c) flagged RTO-instruction passages; the unit code, release and short hash; the `.h5p` path;
  - `scores.csv`: `sheetId, activityId, revision, buildId, correctness, support, distractors, mapping, usefulness, minutes, decision`, with `na` pre-filled where not applicable and other score cells blank;
  - `findings.csv`: the header `sheetId, activityId, dimension, itemId, score, reason` and no rows.
- It refuses store version 1 (Task 1).
- *(Amended 2 Oct, Task 11.)* **Score records come forward from Task 12, read-only.** The sheet and the mapping's `reviewed` status both ask whether a build has a counted scored review, so Task 11 adds the `ScoreRecord` type (Task 12's shape) and a plain `putScore` / `listScores` on both stores (`scores.jsonl`). Task 11 only reads them; Task 12 still writes them through committed batches and adds `ReviewBatch`, `commitBatch`, `listBatches` and replay.
- *(Amended 2 Oct, Task 11.)* **"Counted scored review" of a build** is the latest `ScoreRecord`, by `(sequence, rowIndex)`, for exactly that `(activityId, revision, buildId)` (`countedScore` in `review/scores.ts`). A review of another build of the same revision does not count (C3). Any counted review takes the activity off the sheet; only one whose decision is `accepted` makes its mapping rows `reviewed`.
- *(Amended 2 Oct, Task 11; bundle rule amended after review.)* **Sheet manifest and bundle:** the manifest is written once to `reviews/sheets/<sheetId>.json` (a different manifest under an existing `sheetId` throws `SheetIntegrityError`), and `listSheets` lists them. `review-sheet.md`, `scores.csv` and `findings.csv` form the sheet's **bundle** in `reviews/sheets/<sheetId>/`. A new bundle is assembled in a temporary directory and renamed into place, so it appears whole or not at all. Exporting the same sheet again reuses the bundle and never rewrites a file in it, so a reviewer's unfinished scores and findings survive; a missing file is recreated with an exclusive create. A changed sheet gets a new bundle, and earlier bundles are left as they are. A symbolic link at `reviews/`, `reviews/sheets/`, the bundle or any bundle file is refused before anything is written through it. (This replaces the first version, which wrote the three files in the import directory and replaced them on each export, losing filled-in scores.) Manifest entries are sorted by `activityId`; the sheet and `scores.csv` list activities in plan order. With nothing to review, the command says so, writes nothing and exits 0.
- *(Amended 2 Oct, Task 11 review.)* **Per-item citations:** each card and blank is shown with its own keyed answer, cited passages and targets, and the activity's own provenance is shown separately. Section (c) names who cited each flagged passage (`cited by the activity, c2`).
- *(Amended 2 Oct, Task 11 review.)* **Assessment conditions:** the sheet shows the published unit's assessment conditions verbatim with the unit's identity in its header, and again in each activity's section (c), where the reviewer checks for RTO-instruction claims. The packet's own arrangements are never shown as the unit's conditions.
- *(Amended 2 Oct, Task 11 review.)* **Inconsistent promoted state is refused:** a promoted, non-dropped activity with no current revision, a missing or non-promoted revision, no current build, a missing build record, or a build record belonging to another activity or revision throws `SheetStateError`, naming the activity and what is wrong; no manifest or bundle is written, and `leap review-sheet` exits 1. Such an activity is never skipped.
- *(Amended 2 Oct, Task 11.)* **Mapping columns:** `kind`, `targetText` and `unitTextHash` are appended after the existing columns, so existing positions are unchanged. A row with no criterion has an empty `kind` and `targetText`. `unitTextHash` is the activity record's, or the import's for records written before Task 10. An alignment review's own decision still takes precedence over `reviewed`.
- *(Amended 2 Oct, Task 11.)* **Claims grep surfaces:** `leap --help` and each command's help, the root README, every module under `packages/generator/src/{prompts,competency,concepts,plan,produce,review}`, `apps/cli/src/report.ts` and `apps/cli/src/review-sheet.ts`. Two allowed phrases, both in the README and neither a claim about activities: "pinned to the validated address" (network safety) and "validated on h5p.com" (the legacy CLI's platform check). The test fails if an allowed phrase is no longer used. Task 14 adds the gate report to the surfaces.

**Tests (write first):**
- [ ] The manifest is written once. Exporting again with nothing changed gives the same `sheetId` and no new file.
- [ ] `na` is pre-filled for distractors on flashcards and blanks, and for mapping without a unit.
- [ ] The sheet shows RTO-instruction passages in section (c) for the negative fixture.
- [ ] The mapping notice line and `kind` column are present. The claims grep passes on the tree and fails on a planted phrase.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(review): persisted sheet manifests, the review sheet, and claims wording`

---

### Task 12: Score import: validation, findings, row identity, batch commit and recovery

**Answers:** design §7.2–7.3, R1, R2, R8, C4, C5.

**Files:** `packages/generator/src/review/rubric.ts`, `review/import.ts`, `store/types.ts` (`ReviewBatch`, `ScoreRecord`, `commitBatch`, `listBatches`, `putScore`, `listScores`), `memory-store.ts`, `apps/cli/src/file-store.ts`, `apps/cli/src/review-import.ts`, `apps/cli/src/review.ts` (refuse `--decision` on v2), tests.

**Contract, rubric (pure):**
- `activityScores(rowScores, findings)`: for every applicable dimension, the activity score must equal `min(scores of that dimension's findings)`, or 2 when there are none. A row score of 0 or 1 with no finding, or a finding scored lower than the row, is an error naming the dimension.
- `deriveDecision(scores)`: any applicable 0 → `rejected`; otherwise any applicable 1 → `needs-revision`; otherwise `accepted`. It is exhaustive and total, and tested over all 3⁵ combinations with applicability masks.

**Contract, validation.** `validateImport(csvRows, findingRows, store)` reports every problem at once, each naming the row or finding line:
1. Each `sheetId` resolves to a stored manifest. An unknown sheet is an error.
2. Each row matches its manifest entry (`activityId`, `revision`, `buildId`). There are no duplicate `activityId` rows within a file, and no rows for activities outside the manifest.
3. A row with every score cell blank (or `na` only where pre-filled) is **not scored** and is skipped. A partly scored row is an error.
4. Scores are `0`, `1`, `2` or `na`, with `na` only where applicable is false.
5. Findings: the dimension must be applicable; the `itemId` must be in the entry's `itemIds` (for single-item types the item is the activity ID); the score must be 0 or 1; the reason must be non-empty; `activityScores` must hold.
6. `minutes` is a non-negative number, required on scored rows.
7. The `decision` column may be blank. If filled and different from the derived decision, the row is an error: `row <n> (<activityId>): decision "<given>" does not match the scores; the derived decision is "<derived>"`.
8. For each scored row, `rowKey = sha256(canonical({ sheetId, activityId, revision, buildId, scores, findings sorted, minutes, reviewer }))`. **If a score record with that `rowKey` exists, the row is already committed and is skipped before step 9.**
9. Current-state check, for scored rows not already committed: the entry's revision is still the activity's current revision; `buildId` is still its `currentBuildId`; the import's `unitTextHash` equals the manifest's; and `rubricVersion` equals `RUBRIC_VERSION`. A failure makes that row **stale**, naming what changed. Other rows are unaffected, and another activity having been reviewed never makes a row stale.

**Contract, commit and recovery:**
- If validation reports any error or stale row, nothing is written and the command exits 1 with the full list.
- Otherwise, the new rows form `ReviewBatch { batchId; sequence; sheetId; reviewer; importedAt; rows: ScoreRecord[] }`, with `batchId = sha256(sorted rowKeys)` and rows in CSV order. Under the import's lock, `sequence` = 1 + the highest sequence among committed batches (read from the batch files, not the ledgers). The batch is written to `reviews/batches/<sequence, zero-padded to 6>-<batchId>.json` by temporary file and atomic rename; the rename is the commit point. If a batch with the same `batchId` is already committed, nothing is written.
- After commit, one `ScoreRecord` per row is appended to `scores.jsonl`, and one `AcceptanceRecord { …, decision, batchId, sequence, rowIndex, scoreRowKey, buildId }` per row to `acceptances.jsonl`.
- **Recovery:** on every lock acquisition in a version-2 store, `replayCommittedBatches()` reads batch files in ascending `sequence` and appends any score or acceptance record whose `(batchId, rowKey)` is missing from the ledgers. It is idempotent.
- **Order (R8):** every `ScoreRecord` and acceptance record carries `sequence` and `rowIndex`. Every reader decides "latest" by `(sequence, rowIndex)`. No reader uses directory enumeration order or the order in which records were appended, so records replayed late cannot reorder history.
- With zero new rows, the command prints `nothing new to import (<n> rows already committed, <m> not scored)`, exits 0 and writes nothing.
- `ScoreRecord { rowKey; batchId; sequence; rowIndex; sheetId; importId; activityId; revision; buildId; unitTextHash; rubricVersion; reviewer; scores; findings; minutes; decision; decidedAt }`.
- `leap review --decision` on a version-2 store exits 1: `acceptance is recorded through leap review-sheet and leap review-import`. `review --criterion` continues, and accepts KE IDs.
- *(Amended 2 Oct, Task 12.)* **Where recovery runs:** `replayCommittedBatches` runs inside each store's `lock()`, straight after the lock is taken, so every command that takes the lock (`generate`, `review`, `review-sheet`, `review-import`, report writes) completes committed batches first without each caller remembering to. It skips an absent, phase-2 or malformed import, which the commands' own checks then refuse. If replay fails, the lock is released and the error raised.
- *(Amended 2 Oct, Task 12.)* **The commit point:** the batch file is written to a temporary file and hard-linked into `reviews/batches/<sequence>-<batchId>.json`, as builds are. Like a rename it appears whole or not at all, and unlike a rename it can never replace an existing file. `listBatches` reads every `*.json` there and orders by the recorded `sequence`, so file names and directory order never matter.
- *(Amended 2 Oct, Task 12.)* **Acceptance readers (R8):** `listAcceptances` returns, per activity revision, the record from a committed batch with the highest `(sequence, rowIndex)`; such records always beat unscored historical ones (phase-2 and `review --decision`), which among themselves keep append order. `listAcceptanceRecords` returns the raw ledger for replay and history. `ACCEPTANCE_DECISIONS` gains `needs-revision`, which is only ever derived.
- *(Amended 2 Oct, Task 12 review.)* **Strict input:** both files are parsed as strict RFC 4180 CSV. An unclosed quoted field, a quote inside an unquoted field, or text after a closing quote is reported as `<file>: malformed CSV at line <n>: …`, and nothing is imported; a field is never guessed at. `minutes` must be a decimal that is finite as a number, so a 400-digit value is refused instead of being stored as `Infinity` (written as `null`). Regression tests show each refusal leaves the batches and both ledgers unchanged, in memory and byte for byte on disk.
- *(Amended 2 Oct, Task 12.)* **Import details:** `--findings` defaults to `findings.csv` beside `--scores`. Rows are numbered from 1 after the header (`row 2`), findings likewise (`finding 1`). A non-applicable dimension may be `na` or blank. A file holds one sheet's rows, judged on every row (committed, unscored and new); rows from two sheets are an error. A finding with an error leaves its row unchecked against the rubric rule, so the report does not add a misleading "no finding". The stale check compares the import record's `unitTextHash` with the manifest's. After a commit, `review-import` rewrites `mapping.csv` and `cost.json` under the same lock.

**Tests (write first):**
- [ ] **R1 sequence:** export a sheet for four activities; score two; import (2 committed); complete the other two in the same files, leaving the first two unchanged; import (2 new, 2 recognised as already committed); import again (nothing new). Exactly four score and four acceptance records, and two batch files.
- [ ] **Unaffected rows:** after the first import, the remaining rows validate even though the reviewed set changed.
- [ ] **Stale, all-or-nothing:** regenerate one activity after export (fixture-level promotion of a new revision), then import a file in which that row and two others are scored. The command exits 1, reports the row as stale with "revision changed", and writes nothing: no batch file, and the score and acceptance ledgers are byte-identical. Blanking the stale row's scores (so it is not scored) and importing again commits the other two.
- [ ] **Committed before stale:** a row committed, then its activity regenerated, then the same file imported again: the row is reported as already committed, not stale.
- [ ] **Correction:** changing a committed row's score gives a new `rowKey`. If still current, it commits in a new batch with a higher `sequence`, and readers return it; if stale, the whole import is refused.
- [ ] **Recovery order:** batches 1 and 2 both score the same activity. The ledgers hold batch 2's records but are missing batch 1's (fixture). Recovery appends batch 1's records after batch 2's, and every reader still returns batch 2's score and decision. Renaming batch files so that directory order differs from sequence order changes nothing.
- [ ] Duplicate `activityId` rows, unknown `sheetId`, a partly scored row, `na` on an applicable dimension, an unknown `itemId`, a finding on a non-applicable dimension, and a score of 1 without a finding each produce their named error, and all appear in one run.
- [ ] A contradictory decision column shows the derived decision; a blank one is fine.
- [ ] **Crash recovery:** a fault is injected after the batch rename and before the ledger appends. The next command that takes the lock appends the missing records once. A second lock acquisition appends nothing.
- [ ] A crash before the rename leaves no batch and no records, and the import can be rerun.
- [ ] `review --decision` on a v2 store exits 1. On the v1 fixture it exits 1 with the legacy message (from Task 1).

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(review): checked, idempotent score import with per-dimension findings and a recoverable batch commit`

---

### Task 13: `leap regenerate` with logical requests and an allowance

**Answers:** design §6, C2, R6, R7, R9, R10.

**Files:** `packages/generator/src/pipeline/regenerate.ts`, `store/types.ts` (`RegenerationRequest`, `putRegeneration`, `listRegenerations`), `memory-store.ts`, `apps/cli/src/file-store.ts`, `apps/cli/src/regenerate.ts`, `apps/cli/src/index.ts`, tests.

**Contract:**
- `RegenerationRequest { requestId; importId; activityId; index; baseRevision; targetRevision; note; status: "running" | "succeeded" | "failed"; outcome: string | null; createdAt; completedAt: string | null }`, with `requestId = <activityId>:regen:<index>`. Events are appended; the latest per `requestId` wins.
- `leap regenerate --out <dir> --activity <id> [--note "<text>"] [--ledger --run]`, under the lock, in this order:
  1. Refuse store version 1. For paid providers, run the ledger checks (Task 9).
  2. **Reconcile first (R9).** If the activity's latest request is `running`, the command finishes **that** request. `--note` may be omitted; if given, it must equal the stored note, or the command exits 1 showing it. No eligibility or allowance check applies, and no allowance is consumed. Reconciliation looks at what already exists for `targetRevision`:
     - promoted revision with a current build → append `succeeded`; no model call and no build;
     - build record for the revision under the current engine, not yet promoted → promote, then append `succeeded`; no model call;
     - candidate revision persisted, no build under the current engine → build, validate, promote, append `succeeded`; no model call;
     - produce operation `succeeded` with a persisted result → as the candidate case;
     - otherwise → run the produce operation with its stable key, which reuses any recorded outcome under phase-2 operation semantics, then build and promote.
     A content or budget failure during reconciliation appends `failed` with its outcome.
  3. **Only when creating a new request:** refuse an activity without a promoted revision, an activity whose current build's counted decision is not `needs-revision` or `rejected`, and an activity that already has 2 requests of any status (`activity <id> has used its 2 regenerations in this pilot`). `--note` is required.
  4. Append request `index = count + 1`, `status: "running"`, `targetRevision = max(revision) + 1`, **before any dispatch**. From this point the request counts.
  5. Run the produce operation with key `<importId>:produce:<activityId>:r<targetRevision>`, `origin: "regenerate"` and the `requestId` on the operation and on every attempt start (R10). The prompt has the note appended, as in parent §5. The revision has `origin: "regenerate"` and the `requestId`. Build a new build record, validate, and promote only on success; the previous revision is superseded and keeps its builds and reviews.
  6. Append `succeeded` or `failed`, with the outcome (content, budget or system).
- Budget: the import's per-import budget applies, bounded by the ledger cap for paid providers.
- *(Amended 2 Oct, Task 13.)* **Stored production settings:** `runImport` now stores a `settings` artifact (prompt config, plan rules, language) on every run, including a rerun of a finished import, because regeneration must produce exactly as the import did and the import record holds neither. The fingerprint pins these values, so writing them late is safe. An import from before this change is refused by `regenerate`, before any request is appended (3 Oct), until `leap generate` is rerun once with its original arguments.
- *(Amended 2 Oct, Task 13.)* **One path for new and resumed requests:** after `reconcile()` marks any operation left running by a crash as failed and billing-uncertain, the produce operation's stable key reuses a persisted candidate with no model call, `buildRevision` reuses an existing build under the current engine (so there is never a second build record), and a promoted target is not rebuilt. This covers each reconcile case in step 2 without separate branches.
- *(Amended 2 Oct, Task 13.)* **The note in the request:** appended to the produce request only when present, so first-pass requests, and the S1 replay, are unchanged. The `existing` texts the producer must not repeat leave out the regenerated activity's own revisions.
- *(Amended 2 Oct, Task 13; superseded 3 Oct.)* ~~**Budget and outcomes:** elapsed time continued from the saved total with no run anchor; `--budget-usd` or a paid provider's ledger cap replaced the import's cap; any non-content, non-budget error was recorded `failed`.~~ Each part was a defect (review of `932ee25`), replaced by the three amendments below.
- *(Amended 3 Oct, Task 13.)* **Elapsed time uses the shared run anchor:** a regeneration does what `runImport` does. It reads the attempts and operations before any recovery write. If an earlier run of either command left `currentRun`, that run's time is charged by `reconcileElapsed`. The regeneration's own anchor is written before the first dispatch. Every exit (success, content or budget failure, or any other error) folds the run's time into `budgetUsed.elapsedMs` and clears the anchor. A crash leaves the anchor, and the next run of either command charges it.
- *(Amended 3 Oct, Task 13.)* **Caps only go down:** each limit a regeneration runs under is the lowest of the import's own limit, the limits stored on the request and the limits the command supplies. For `usdMicro`, the command's value is the lower of the ledger run's cap and `--budget-usd`. A new request stores its effective limits (`RegenerationRequest.budget`), so a resume never runs above them, even without `--budget-usd`. A ledger cap above the import's cap leaves the import's cap in force.
- *(Amended 3 Oct, Task 13; replaces step 6's "system" outcome.)* **Outcomes and recoverable publication:**
  - **Prerequisites before the request:** a new request's production inputs (the stored settings, the plan entry, the concept map and a producer for the type) are checked before it is appended. A missing input is refused without using an allowance.
  - **Recorded outcomes:** content and budget failures are recorded `failed`. Any other error, whether a storage write, a damaged build or an outage, leaves the request `running` and is raised. The CLI then exits 1 and says how to finish the request. The rerun reuses whatever was produced or built, with no further model call or allowance.
  - **Idempotent publication:** the run supersedes the earlier promoted revisions, promotes the target and points the activity at it. Each write is skipped if it is already done, so a rerun completes a publication interrupted at any write.
  - **Verification before success:** a target that is already promoted is never rebuilt or overwritten. Before `succeeded` is appended, its build record is checked: it must belong to this import, activity and revision under its own `buildId` and key, and its package must exist with the recorded size and sha256 (`verifyCurrentBuild`). A missing or altered package raises an error, and the request stays `running`.
  - **Exit codes:** the command exits 0 on success and 1 on refusal, failure or an unfinished request. Afterwards it rewrites `mapping.csv` and `cost.json`.

**Tests (write first, FakeProvider):**
- [ ] A `needs-revision` activity regenerates: revision 2 is promoted with `origin: "regenerate"`, and revision 1 and its review are unchanged.
- [ ] An `accepted` activity is refused, as is an activity with no scored review.
- [ ] **Interruptions (R9).** Each case injects a fault at the named point, then reruns `leap regenerate --activity <id>` with no note. It must finish the same `requestId` with the same `targetRevision`, append exactly one `succeeded`, consume no allowance, and make exactly the expected number of provider calls in total:
  - after the request is appended, before dispatch → one production;
  - after the candidate revision is persisted → one production in total (none on resume);
  - after the build bytes and build record are persisted, before promotion → one production, and no second build record;
  - after promotion, before the `succeeded` event (revision 2 is promoted and has no review, so the eligibility check would refuse it) → one production, and the resume only appends `succeeded`.
- [ ] A rerun with a different `--note` during a running request is refused and shows the stored note.
- [ ] **Allowance counts failures:** request 1 fails on content and request 2 succeeds; a third request is refused.
- [ ] A budget-refused request is recorded `failed` and counts.
- [ ] A paid provider without a ledger entry is refused before any request is appended.
- [ ] A regeneration whose produce operation exhausts its content attempts leaves no revision, and its operation and attempt starts carry `origin: "regenerate"` and the `requestId`.
- [ ] *(Added 3 Oct.)* A regeneration interrupted mid-run is charged its interrupted time on resume. The anchor is set before dispatch and cleared on clean exits, after success and after a content failure.
- [ ] *(Added 3 Oct.)* A ledger or `--budget-usd` cap above the import's never raises it. A request's lower cap is kept on resume.
- [ ] *(Added 3 Oct.)* An import without stored settings is refused before any request is appended (generator and CLI).
- [ ] *(Added 3 Oct.)* A storage write failure at each publication write leaves the request `running`. The rerun finishes it with no model call and no allowance.
- [ ] *(Added 3 Oct.)* A resume whose promoted target has a missing, altered or foreign build does not report success, and writes no build.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(cli): leap regenerate with persisted logical requests, recovery before eligibility, and a two-request allowance`

---

### Task 14: Gate report

**Answers:** design §8, C1, C3, C6, R3, R5, R10.

**Files:** `packages/generator/src/report/gate.ts`, `apps/cli/src/gate-report.ts`, `apps/cli/src/index.ts`, tests.

**Contract, per import:**
- **Unit identity:** the unit code, release and short hash, and the import's store version.
- **Legacy (v1) directories** are listed under "Not eligible (phase-2 store)", with historical acceptance counts labelled "no rubric scores; excluded from the gate". No other figure uses them.
- **Sources of truth (R10):** the saved plan, activity records, operation records and attempt records, then revisions, builds and score records. A count never depends on a revision existing. First-pass work is whatever carries `origin: "generate"` on its operation and attempt starts; regeneration work carries `origin: "regenerate"`.
- **First-pass partition per type.** Every planned activity falls into exactly one category, and the report prints the sum next to `planned`:
  - `dropped`: the activity is flagged dropped (no CLI command drops in phase 3; the category exists so the sum holds);
  - `notAttempted`: no `origin: "generate"` produce operation ever started (for example, skipped by a stop and never resumed);
  - `inProgress`: a `generate` produce operation is `running`, or a build operation for its candidate is `running`;
  - `buildPending`: a `generate` produce operation `succeeded` and its candidate revision is persisted, but no build exists and no build is running (for example, the process stopped between produce and build);
  - `generationFailed`: every `generate` produce operation for the activity ended `failed`, or a persisted candidate's build or validation failed (a `rejected` revision or a failed build operation), and no `generate` revision was promoted. This includes producers that exhausted their content attempts without persisting any revision;
  - `unreviewed`: the first generated revision (the lowest-numbered `origin: "generate"` revision that was promoted) has no scored review;
  - `accepted`, `needsRevision`, `rejected`: the decision of the first scored review of that revision, in `(sequence, rowIndex)` order, on whatever build it was made (C3: labelled `historical` when that build is no longer current).
- **First-pass rates:** `accepted / reviewed` among reviewed outputs, where `reviewed = accepted + needsRevision + rejected`; and `accepted / planned` end to end. Both are shown with raw counts.
- **After-revision partition per type**, over the same planned activities: `dropped`, `notAttempted`, `inProgress`, `buildPending`, `generationFailed` (no revision of any origin was ever promoted), `awaitingReview` (the latest promoted revision's current build has no counted, non-stale scored review), `accepted`, `needsRevision`, `rejected`. Each shows accepted after revision among reviewed and among planned, regenerations used and failed, their extra cost, and extra review minutes.
- **Gate status per import:** `incomplete` if any first-pass activity is `unreviewed`, `inProgress` or `buildPending`, or any after-revision activity is `awaitingReview`, `inProgress` or `buildPending`, with the activities listed; otherwise `complete`. **An incomplete import can never pass.** Thresholds are evaluated only on complete imports, and only once frozen (the runbook records them); before that the report shows the provisional targets and "not frozen".
- **Distributions** for each dimension of the 0/1/2/na counts, for first-pass and after-revision separately. Distractors and usefulness each have their own rows.
- **Items** (flashcards, blanks): items inspected, which is every item of every reviewed revision, and distinct failing items per dimension from findings.
- **Minutes:** median and total, per activity and per item, first-pass and revisions separately, with item count alongside.
- **Cost (C1, R10), from attempt records only:**
  - `firstPassDirect[type]`: attempts whose start carries `origin: "generate"` on a produce operation of that type's activities, including failed attempts, content retries and transient retries, whether or not a revision exists;
  - `regenerationDirect[type]`: the same for `origin: "regenerate"`;
  - `shared`: attempts on `shared` operations (parseUnit, extract, merge, align, plan);
  - `allocateShared(shared, firstPassDirect, planned)` is an **accounting convention**: shared cost split by each type's share of known and estimated `firstPassDirect`, or by planned count if that total is 0. It makes no claim about which type consumed the source work;
  - first-pass cost per accepted = (allocated + firstPassDirect) / first-pass `accepted`; after-revision = (allocated + firstPassDirect + regenerationDirect) / after-revision `accepted`;
  - a type with 0 accepted shows `n/a (0 accepted)` with its spend;
  - an attempt with unavailable cost is never priced at zero: it is excluded from the sums, counted per type, and every figure it would enter is marked `lower bound (<k> attempts without cost)`. Attempt starts without an outcome are listed as billing-uncertain, at their reservation, in a separate line.
- **Also:** unsupported and never-targeted PCs and KE nodes; the negative-check count (findings whose reason is tagged `rto-claim`, a reason prefix the sheet documents); stale reviews; and build engine displays, extraction version, prompt version, model roles and rubric version.

**Contract, across imports:** `leap gate-report <dir>...` shows each import as above, then a pooled table per type with a per-unit breakdown. It states the sample against the minimum planned sample of 25/15/5 packages as "planned minimum", with no confidence claim (C6). It writes `gate-report.md` in the first directory; `--summary <file>` writes a numbers-only copy containing no content strings, and a test asserts that no source sentence, no activity text and no target text appears in it.

**Follow-ups from the Task 12 review (2 Oct 2026), to be fixed in this task:**
- **Acceptance of an old build:** `listAcceptances` returns the latest decision per activity revision, whatever build it reviewed, so an `accepted` row for build A keeps counting after the same revision is rebuilt as build B. Current acceptance must come from the counted scored review of the **current** build (`countedScore` on `currentBuildId`), as `mapping.csv`'s `reviewed` already does; an acceptance of an earlier build counts only in the historical first-pass results (C3). The cost report's accepted count follows the same rule. Test: accept build A, rebuild the revision as build B, and the activity is no longer accepted until build B is reviewed.
- **Reports after recovery:** `replayCommittedBatches` completes the ledgers on the next lock, but `mapping.csv` and `cost.json` stay as they were written before the crash. Whenever replay appends a record, the command that took the lock must rewrite both reports under that lock before it returns, or the reports must be derived at read time. Test: crash after a batch commit, take the lock with another command, and both reports reflect the batch.

**Tests (write first, fixture-built stores):**
- [ ] **Partition:** a fixture with one skipped, one in progress, one content failure **that never persisted a revision**, one persisted candidate whose produce succeeded and whose build is pending, one persisted candidate whose build failed, one build rejection, one promoted-unreviewed, and accepted, needs-revision and rejected first-pass activities. Every category count is right, and the categories sum to `planned` for both partitions. A property test over randomly generated store states asserts the sums.
- [ ] The content failure without a revision contributes its attempts to `firstPassDirect` and counts in `generationFailed`.
- [ ] Incomplete status while one review is missing, and complete once it is imported.
- [ ] First pass vs after revision: needs-revision r1 → accepted r2 shows first-pass needs-revision and after-revision accepted, with the regeneration cost counted only after revision.
- [ ] A stale first-pass review is counted in first pass as `historical` and not in after-revision acceptance.
- [ ] Cost allocation by share, the zero-base fallback to planned count, a lower-bound label with an unavailable attempt, and `n/a (0 accepted)`.
- [ ] A v1 directory is listed as not eligible and changes no figure.
- [ ] The summary contains no content strings.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `feat(report): gate report with explicit denominators, first-pass and after-revision yields, and defined cost allocation`

---

### Task 15: CLI wiring, end-to-end offline pilot rehearsal

**Answers:** integration of Tasks 1–14, R12.

**Files:** `apps/cli/test/pilot-rehearsal.test.ts`, `apps/cli/src/index.ts` (help text), README (phase-3 commands).

**Contract:** two offline rehearsals, with no network, no ledger and no key.

- **Replay rehearsal (the S1 path):** `extract` on the S1 PDF → `generate` with the replay provider and exactly `S1_SETTINGS` → then the scoring loop below. `regenerate` uses FakeProvider with hand-authored responses labelled synthetic, because S1 records no regeneration.
- **Structured-source rehearsal:** the same loop from the DOCX fixture of Task 6, with FakeProvider throughout. It never touches the S1 fixtures, because DOCX text, sentence IDs and requests differ from the PDF's.

The scoring loop: `review-sheet` → fill `scores.csv` and `findings.csv` programmatically (one accepted, one needs-revision, one rejected, one left unscored) → `review-import` → `gate-report` (incomplete) → score the rest → `regenerate` the needs-revision activity, with a fault injected after promotion and a rerun to finish the request → new `review-sheet` → `review-import` → `gate-report` (complete).

**Tests:**
- [ ] Both rehearsals pass, and each final report's partitions sum to `planned`, and its yields and costs equal hand-computed expectations.
- [ ] The replay rehearsal's generate inputs deep-equal `S1_SETTINGS`.
- [ ] A second full rehearsal gives an identical `gate-report.md`, apart from timestamps, which are injected by the clock.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `test(cli): offline end-to-end pilot rehearsal`

---

### Task 16: Pilot runbook and recorded deviations

**Files:** `docs/testing/phase-3-pilot.md`, `docs/superpowers/specs/2026-09-28-phase-3-quality-gate-design.md` (status line only), this plan's "Deviations" section.

**Contents of the runbook:**
1. **Preconditions:** Checkpoints A–D passed; `pnpm verify` green on the branch head; the P1 ledger entry exists.
2. **Extraction check result** from Checkpoint B, including each label-like reference and whether it kept its meaning.
3. **P1 commands**, with `--ledger` and `--run P1`; recorded responses under `docs/uoc/BSBAUD412/replay-p1/`.
4. **Scoring procedure:**
   - export the sheet, score it, and import it;
   - use the `rto-claim` reason prefix for §4.4 violations;
   - regenerate at most twice per activity;
   - rescore until the gate report is `complete`.
5. **Diagnosis table**, from failing dimension to stage (design §9 step 4).
6. **Experiments:** each needs a new ledger entry and is one change at a time. The approved allocations fit at most five.
7. **Failure:** if any paid run fails, keep its directory, record the failure (numbers and categories only), and stop until Benjamin writes a new entry.
8. **Calibration:** Benjamin sets thresholds from the pilot; they are written into the design's §8.3 with a date and marked frozen before any further unit is scored.
9. **Recording:** a sanitised gate summary; the line "BSBAUD412 pilot complete" with its date, which is not a gate pass; and the statement that the full gate needs five pairs, including trade units, with results per unit and per item.

**Deviations section (in this plan):**
- Provenance field `criteriaIds` holds PC and KE IDs, unrenamed.
- DOCX custom list numbering is rendered as decimal or bullet, accepted only with the `listNumberingSimplified` and `labelLikeReferences` warnings and the Checkpoint B confirmation that references keep their meaning (R13). If Checkpoint B finds a reference that loses its meaning, this deviation is withdrawn and the adapter renders the real formats before P1.
- Non-atomic oversize sentences stay whole, as in phase 2, but only while the complete provider request fits the model's input limit; otherwise the run is refused (R14).
- Pilot-total enforcement is static cap allocation, not a durable pilot-wide reservation (R7).
- `review --decision` is refused on version-2 stores.
- The mammoth-vs-XML path per table property, as recorded in Task 6.

**Verification:** `pnpm verify` → `exit=0`.

**Commit:** `docs: phase-3 pilot runbook and recorded deviations`

**→ Checkpoint D**, then **Checkpoint E** (Benjamin authorises P1). The pilot itself follows the runbook and is not a task in this plan.

---

## Done when

- `pnpm verify` is green on the branch head, with no real API call, and the S1 re-record is the only paid call made by the tasks.
- Checkpoints A–D are signed off. Checkpoint B's table check is recorded, with no content, in `docs/testing/phase-3-pilot.md`.
- Every contract clarification C1–C7 and R1–R14 has at least one named test that fails without it, or, for R13, a recorded Checkpoint B confirmation.
- No file under `docs/uoc/` is tracked (`git ls-files docs/uoc` is empty).

## Acceptance checks for the owner's review

| Check | Where |
|---|---|
| A candidate built after an engine change records the new engine; old build records and reviews are untouched | Task 3 tests |
| Phase-2 directories are byte-identical after every phase-3 command is tried on them | Task 1 test |
| Key/value table first rows are preserved; header rows only when marked | Tasks 5–7 goldens |
| An oversize table row stops the run before any model call | Task 5 test |
| 500 and 400,000 admitted; 499 and 400,001 refused; offsets still UTF-16 | Task 4 tests |
| "No simulated option" in the packet never reaches a plan entry; the unit's conditions stand | Task 10 negative test |
| Half-scored sheet → complete → reimport gives no duplicates | Task 12 R1 sequence |
| Every 0/1 has a per-dimension finding with an item ID | Task 12 validation tests |
| Interrupted regeneration resumes without using allowance, at each of four interruption points, including after promotion; failed ones count | Task 13 tests |
| A stale row means zero writes; recovery keeps committed order | Task 12 tests |
| Every planned activity lands in exactly one outcome category, including failures with no revision | Task 14 partition and property tests |
| Citations slice back exactly after NFC and whitespace normalisation in DOCX and ODT | Tasks 5–7 tests |
| S1 is recorded from one named fixture with pinned settings, and every replay consumer uses them | Tasks 10 and 15 tests |
| Denominators, incomplete status, first-pass vs after-revision, cost convention | Task 14 tests |
| No paid run without a ledger entry; caps allocated statically; spend read from attempt records, including after a crash | Task 9 tests |

## Deviations from the design, recorded

Filled in by Task 16.
