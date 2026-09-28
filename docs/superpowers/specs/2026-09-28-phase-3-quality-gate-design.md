# Phase 3: human quality gate, design

Date: 28 Sep 2026, revision 2, after Benjamin's review of revision 1 (`1171a8b`). Status: **accepted for planning** (28 Sep 2026). The contract clarifications from the two plan reviews (C1–C7, R1–R14) are in `docs/superpowers/plans/2026-09-28-phase-3-quality-gate.md` and take precedence where they differ from this document. Parent: `2026-09-18-generator-service-design.md` (§1 claims, §10 human quality gate, §11 phase 3, §13 rulings of 28 Sep). Starting point: `main` at 0682f46, phase 2 approved 19 Sep.

## 1. What phase 3 is for

Phase 2 proved the machinery on synthetic fixtures: source → activities → playable `.h5p` → mapping → measured cost. Nobody has yet judged whether the activities are any good. Phase 3 does that on real vocational material, and records the judgement so it can be trusted later. The results decide what changes (prompts, the concept layer, model roles, quality checks) before phase 4 adds nine more producers.

The priority is a trustworthy pilot and review record, not a large scoring subsystem. Phase 3 adds, in this order:

1. **Engine and build identity** (§3): a build records the engine that actually made its bytes, and build history is never rewritten.
2. **The parts of the 28 Sep ruling that change what the gate measures** (§4): input limits, DOCX and ODT ingestion that keeps tables and lists intact, Knowledge Evidence alignment, source authority and the claims wording.
3. **A rubric with an exhaustive decision rule** (§5), and a revision loop that never counts a promised edit as done (§6).
4. **Scoring through a sheet and a checked, recoverable import** (§7).
5. **A gate report** that keeps first-pass and after-revision results apart and shows raw counts (§8).
6. **The BSBAUD412 pilot**, recorded separately from the full gate (§9).

## 2. Decisions already made

| Question | Decision |
|---|---|
| Corpus | Starts with one source-and-unit pair, **BSBAUD412** (the unit PDF and a draft knowledge packet with 56 tables), and grows toward the five pairs across trades in parent §10 |
| Reviewers | Benjamin only. No checks for agreement between reviewers; §11 covers the bias this leaves |
| Where material lives | `docs/uoc/`, ignored by git. Nothing from it is committed: no source text, no unit text, no generated activities, no recorded model responses |
| Order of work | Engine and build identity first, with resume tests. The gate plan is reviewed before any scored run. Code is investigated only where real material exposes a failure |
| Sources in phase 3 | DOCX and ODT join text, markdown and PDF. Web page and Wikipedia stay with the server in phase 5 |
| Text limits | **500 to 400,000 characters inclusive**, a product decision (not a copy of another product's limit), applied to the submitted learning source after extraction (§4.1). PDFs at most 100 pages |
| Pilot vs gate | "BSBAUD412 pilot complete" and "full quality gate passed" are separate results. Phase 4 before the full gate needs an explicit, limited-scope decision (§9) |
| Thresholds | Provisional pilot targets, calibrated on the pilot, then frozen before any further unit is scored (§8.3) |

## 3. Engine and build identity

### 3.1 The defects

- `runImport` stamps `engineFingerprint` on a revision when it is **produced**, not when it is built. A candidate saved before a crash keeps the old stamp. If the engine or `libraries.lock.json` changes before the resume, the new engine compiles it, but the promoted revision still names the old one.
- The fingerprint is `engine@<package.json version>+lock:<hash>`. The version is still `0.1.0` and does not move when engine code changes, so two different engines share a fingerprint.
- `putBuild` writes `builds/<activity>-r<n>.h5p`. Building the same revision again would overwrite bytes that may already have been reviewed.

### 3.2 The engine fingerprint

`engineFingerprint = sha256` over a canonical JSON document of:
- **Engine output:** every file under `packages/engine/dist`, as sorted, `/`-normalised relative paths, each with the sha256 of its bytes. `*.tsbuildinfo` files are excluded; `.js`, `.d.ts` and source maps are included.
- **Byte-affecting dependencies:** the resolved versions, from `pnpm-lock.yaml`, of the packages the engine uses to write archives and content (`jszip`, `yazl`, and any other runtime dependency of `packages/engine`), listed from its `package.json` rather than by hand.
- **The H5P libraries:** the sha256 of `libraries.lock.json`.
- **The compression runtime:** `process.versions.zlib`, because deflate output can change with zlib.

The Node version (`process.versions.node`) is recorded next to the fingerprint on every build, not inside it. It is diagnostic: the golden tests already show whether bytes changed. The display form stays readable: `engine@0.1.0+<first 12 hex characters>`.

Two clean builds of the same commit must produce the same fingerprint. A test does two clean builds into separate directories and compares them.

### 3.3 Build records

A build is its own immutable record: `BuildRecord { importId; activityId; revision; buildId; buildKey; sha256; byteLength; engineFingerprint; engineInputs; nodeVersion; builtAt }`. Here `buildId` is derived from the revision and the engine fingerprint, `buildKey` becomes `builds/<activity>-r<n>-<fingerprint12>.h5p`, and `engineInputs` is the canonical document the fingerprint hashes. The engine fingerprint moves from `RevisionRecord` to the build record; a revision points to its **current build** by `buildId`.

Rules:
- `putBuild` never overwrites. Writing an existing `buildKey` with different bytes is an integrity error; writing identical bytes again is a no-op.
- Building a revision under a new engine creates a new build record. Earlier build records and their bytes stay, and so does every review that names them.
- Reviews bind to a `buildId` (§7). A review of a build that is no longer the revision's current build is **stale**: kept, shown in the report, and not counted until the activity is reviewed again.
- Phase 3 adds no rebuild command. These rules are what any later rebuild must obey.

### 3.4 Tests

- **Candidate under A, built under B.** Produce under fingerprint A, stop before build, resume under B. The promoted revision's current build names B, the bytes are B's, and the resume makes no model call.
- **Lockfile only.** The same case, with only the `libraries.lock.json` hash changed.
- **No rewriting history.** A revision promoted and reviewed under A, then built under B, has two build records. A's bytes and record are unchanged, the review still names A's build, and the report lists that review as stale.
- **Overwrite refused.** `putBuild` with different bytes for an existing key throws; with identical bytes it is a no-op.
- **Reproducible fingerprint.** Two clean builds give the same fingerprint, and changing one engine source file changes it.

## 4. The 28 Sep ruling in phase 3

### 4.1 Input limits

- The limit applies to the **submitted learning source**: its extracted, normalised text, counted in Unicode code points after NFC normalisation. From 500 to 400,000 inclusive is admitted; 499 and 400,001 are rejected with a message naming the count and the limit. The limit never applies to chunks, evidence excerpts, units of competency or criteria.
- One function, `admitSource()`, enforces the limits at the ingest entry points (`ingestText`, `ingestMarkdown`, `ingestPdf`, `ingestDocx`, `ingestOdt`). Lower-level functions (normalisation, segmentation, chunking, extraction) enforce nothing. Their tests call them directly, and tests that go through ingest use fixtures of 500 characters or more. There is no test-only bypass in production code.
- A PDF over 100 pages is rejected on its page count, read before the text is extracted.
- The NFC step changes `textHash` for some existing text. That is covered by the extraction version (§4.2), which is part of the run fingerprint.

### 4.2 DOCX and ODT: structure, not just paragraphs

Both formats are read into one intermediate block list, and one linearizer turns that into source text. The adapters differ; the output contract does not.

**Blocks:** `heading { level, text }`, `paragraph { text }`, `listItem { depth, label, text }`, `table { index, rows: cell[][] }`, where a cell holds its text and its row and column spans.

**Reading order:** the body in document order. Text boxes appear where they are anchored. Footnotes and endnotes follow the paragraph that cites them, marked `[Note n]`. Running headers, footers, comments and deleted tracked changes are excluded; inserted tracked changes are kept. This matches what a reader sees with changes accepted.

**Linearized text:**
- Headings stay as lines of their own. Every segment records its **heading path** (for example `Topic 2 › Audit evidence › Sampling`).
- List items keep their rendered label (`1.`, `a)`, `•`) and are indented by depth, so nesting survives.
- A table becomes one line per row, and every cell is labelled with its column header: `[Table 12, row 3] Risk: Missing records; Likelihood: Medium; Control: Monthly reconciliation`. The header row is the table's first row, or its marked header rows where the format marks them. A cell that spans columns or rows is repeated in each position it covers, so no row loses a value. A table inside a cell is linearized inline as `[Table 12.1 …]`. A table with no usable header row labels cells `Column 1`, `Column 2`, and so on.
- **A table row is an atomic segment.** The sentence splitter does not split it, so evidence quotes a whole row with its headers, and a chunk boundary never falls inside a row.

**Libraries:** DOCX through `mammoth`'s HTML output, which keeps tables, spans and lists, walked into blocks. ODT by parsing `content.xml` from the zip with an XML parser: `text:h` (outline level), `text:p`, `text:list` (nesting), `table:table-row`, `table:table-cell` (`number-columns-spanned`, `number-rows-spanned`) and `table:covered-table-cell`, `text:note`, `text:s`, `text:tab` and `text:line-break`. List labels in ODT come from the list style, with a numbered fallback.

**Provenance:** the original file is stored unchanged. `SourceDocument.metadata` gains `originalSha256`, `extractor` (`docx` or `odt`) and `extractionVersion`. The run fingerprint includes `extractionVersion`, so changing the extractor can never silently alter a resumed import.

**Inspection:** `leap extract --source <file> --out <dir>` writes the linearized text and a table index (table number, heading path, row count, column headers), with no model calls. The pilot procedure (§9) checks at least five representative tables from the packet against the original by eye: merged cells, a table spanning pages, lists inside cells, and a table without headers if the packet has one.

**Tests:** synthetic DOCX and ODT fixtures, made for the purpose, with merged cells in both directions, a nested list, a list inside a cell, a nested table, a footnote and a tracked change. Golden tests on the linearized text for each.

### 4.3 Knowledge Evidence: identity and structure

- The unit parser keeps Knowledge Evidence **as a tree**, with wording copied verbatim: `{ id, text, children[] }`.
- IDs are **local**: `KE1`, `KE2`, and `KE2.1` for a nested bullet, assigned in document order. They are bound to the unit's text hash and are not official identifiers: a different release or different text gives a different ID space. Every record that names a KE or PC ID already carries, or gains, the `unitTextHash`, and the review sheet shows the unit code, the release if printed, and the short hash.
- Alignment returns one entry per performance criterion and per Knowledge Evidence node, under the same evidence-quote rule as today. Unsupported KE nodes are reported with unsupported criteria. `mapping.csv` gains `kind` (`pc` or `ke`) and the full KE path wording.
- The parser also keeps the unit's **Assessment Conditions** verbatim. They are shown on the review sheet and used by the negative test in §4.4.

### 4.4 Source authority

A knowledge packet mixes the content a learner should know with one RTO's own instructions: how it assesses, what it allows, its administration. The second kind must never become a general claim about the unit.

- Concept extraction classifies each concept as `content` or `rto-instruction`. The planner does not target `rto-instruction` concepts. Nothing states, as a fact about the unit, what the packet says about assessment arrangements.
- Assessment conditions come only from the published unit text, never from the packet.
- The review sheet separates, for every activity: **(a)** the packet passages that support the answer, **(b)** the published PC and KE text that establishes relevance, and **(c)** any cited passage the extractor classed as an RTO instruction, flagged.
- **Negative test (synthetic, in the repo):** a packet fixture that says assessment has no simulated option, and a unit fixture whose assessment conditions allow a workplace or a simulated environment. Assert that the packet statement is classified `rto-instruction`, that no plan entry targets it, and that the unit's assessment conditions stay as parsed.
- **Negative check (BSBAUD412 pilot):** the same test on the real packet. No generated activity may state or imply that BSBAUD412 cannot be assessed in a simulated environment. The reviewer checks this for every activity; any occurrence is a 0 on correctness.

### 4.5 Claims wording

The wording says what has actually been done:
- **Unreviewed output** has *source citations* and a *suggested alignment*. An evidence ID that resolves proves only that the quoted sentence exists in the source, not that it supports the answer.
- **Reviewed output**: "verified against the cited passage" and "relevance reviewed against the unit" are used only for a revision whose current build was reviewed and accepted.
- Nothing claims that completing the activities demonstrates competency or satisfies an RTO's assessment requirements.

The `mapping.csv` notice line, the `cost.json` and gate-report headers, CLI help, README and prompts are all checked against these rules. A test pins the mapping notice and the per-row status (`suggested`, `reviewed`).

## 5. The rubric

Rubric version `r1`, recorded on every score. One review per activity revision and build. Each applicable dimension is scored 0, 1 or 2. A dimension that does not apply is `na`: distractors on anything but `multiChoice`, and mapping when there is no unit.

| Dimension | 2 | 1 | 0 |
|---|---|---|---|
| **Correctness** | Every keyed answer is right, and nothing states something false | An answer is right but ambiguous, incomplete or badly worded, so a careful learner could argue it | A keyed answer is wrong; a false statement is presented as true; or the activity turns an RTO instruction into a claim about the unit (§4.4) |
| **Source support** | Every answer is supported by the passage it cites, read on its own | The answer is in the source, but the cited passage is only partial, or the right passage is not the one cited | The answer is not in the source, or the cited passage contradicts it |
| **Distractors** (`multiChoice`) | Every wrong option is plausible, and clearly wrong on the source | An option is implausible, or two options overlap | A distractor is also correct on the source, or the correct option is guessable from its form alone |
| **Mapping** | Every mapped PC and KE target is relevant, and no obvious target is missing | A mapped target is only loosely relevant, or an obvious target is missing | A mapped target is irrelevant, or the activity maps to nothing it plainly covers |
| **Usefulness** | A learner revising this unit benefits from it as written | Trivial, repetitive, or pitched at the wrong level, though not wrong | No revision value: off-topic, trivia, or about the document rather than the subject |

**Any 0 or 1 requires a reason and the affected item IDs.** For single-item types, the item is the activity itself. For flashcards and blanks, **every card and blank is inspected**. The reviewer lists each failing item, and the activity's score for a dimension is the lowest score among its items.

**The decision is derived, and exhaustive:**
- Any applicable dimension at 0 → **rejected**.
- Otherwise, any applicable dimension at 1 → **needs revision**.
- Otherwise, all applicable dimensions at 2 → **accepted**.

`AcceptanceDecision` becomes `accepted | needs-revision | rejected`. Only `accepted` counts as accepted, anywhere.

The reviewer also records **review minutes** for each review. The report takes the item count from the spec.

## 6. Revision loop

There is no field editing in v1, so a defect is fixed by regeneration, and the result is reviewed again from scratch.

- **`leap regenerate --out <dir> --activity <id> --note "<text>"`** (parent §5 "Regenerate", brought to the CLI). It runs production for one activity with the reviewer's note appended, as a new revision. The new revision is built, validated and promoted only on success, and then needs its own review. The previous revision and its review stay in the record. It works on `needs-revision` and `rejected` activities.
- During the pilot, at most **two** regenerations per activity. Beyond that the activity stays at its last decision.
- History reads as *needs revision (r1) → accepted (r2)*. That is "accepted after revision". An unchanged revision can never become accepted by promising an edit.
- The time spent writing the note counts toward that review's minutes. Regeneration cost is recorded against the activity like any other attempt.

## 7. Scoring: sheet and import

### 7.1 The sheet

`leap review-sheet --out <dir>` writes `review-sheet.md` and `scores.csv` for every promoted, non-dropped activity that has no current, non-stale review.

- The **sheet identity** is `sheetId = sha256(importId, unitTextHash, rubricVersion, sorted [activityId, revision, buildId])`. It is printed on the sheet and written into every CSV row.
- For each activity the sheet shows the content (question and options, passage with blanks, or cards), the keyed answers, and the §4.4 split: (a) supporting passages in full with their sentence IDs and heading paths, (b) the published PC/KE targets with their text, (c) flagged RTO-instruction passages. It also shows the item IDs, the item count and the `.h5p` path for playing it.
- `scores.csv` has one row per activity: `sheetId, activityId, revision, buildId, correctness, support, distractors, mapping, usefulness, failingItemIds, reasons, minutes, decision`. The `decision` column is optional.

### 7.2 The import

`leap review-import --out <dir> --scores scores.csv --reviewer <name>` checks the whole file before writing anything, and reports every problem, not just the first:
- Every row carries the current `sheetId`. Rows from a sheet whose activity, revision or build set has since changed are **stale**, and each one is named.
- There are no duplicate rows, and no rows for activities outside the sheet. A row with every score cell blank is "not scored yet" and is skipped. A partly scored row is an error.
- Scores are 0, 1, 2 or `na`, and `na` appears only where §5 allows it.
- Every 0 or 1 has a reason, and every failing item ID exists in that revision's spec.
- The decision is derived in code. A blank `decision` column is fine. A filled one that disagrees with the derived decision is an error that shows the derived value, because a disagreement means the rubric was misread.

### 7.3 Commit and recovery

- The scored rows, canonicalised, plus the `sheetId` and reviewer, hash to a `batchId`. The whole batch, with every score and its derived decision, is written as **one file**, `reviews/<batchId>.json`, by temporary file and atomic rename, under the import's lock. That rename is the commit point.
- After commit, the import appends the derived `ScoreRecord` and acceptance records to their ledgers, each tagged with the `batchId`.
- **Recovery:** every command that takes the lock first replays committed batches whose ledger records are missing, keyed by `batchId` and `activityId`. A crash therefore leaves either no batch or a complete one, never a score without its decision.
- **Idempotence:** importing the same sheet again gives the same `batchId`, and the command reports "already imported" and changes nothing. A corrected sheet for the same revisions is a new batch, and the latest batch per `(activityId, revision, buildId)` wins. Earlier batches stay as history.
- `ScoreRecord { batchId; importId; activityId; revision; buildId; unitTextHash; rubricVersion; reviewer; scores; failingItemIds; reasons; minutes; decision; decidedAt }`.
- The existing `review --decision` path is kept for alignment decisions. For acceptance it is superseded by the sheet, because a decision without scores cannot be counted by the gate.

## 8. The gate report

`leap gate-report <dir>...` reads one or more import directories and writes `gate-report.md` to the first. A sanitised copy, with numbers only and no source or activity text, goes to `docs/testing/`.

### 8.1 What it shows

For each type and in total, each figure given as **raw counts with the percentage**, for example `4/5 (80%)`:
- **First-pass results:** decisions on each activity's first reviewed revision. This measures the generator's original output.
- **After-revision results:** decisions on each activity's latest reviewed revision, with the number of regenerations, the extra cost and the extra review minutes they took.
- **Every dimension as a distribution** of 0, 1, 2 and `na` counts, never only an average. Distractors and usefulness get their own rows, so weak results cannot hide.
- **Item level** for flashcards and blanks: items inspected, and items failing for each dimension.
- Review minutes (median and total) per activity and per item, split into first pass and revisions.
- Cost, as defined in §8.2.
- Unsupported and never-targeted PCs and KE nodes, and the negative-check result from §4.4.
- Stale reviews, and the builds, engine fingerprints, extraction version, prompt version, model roles and rubric version in use.

### 8.2 Cost, defined once

- **Direct cost** of a type: every produce attempt for its activities, including failed attempts, content retries, transient retries and regenerations.
- **Shared cost:** parseUnit, extract, merge, align and plan. It is allocated to types in proportion to their share of the **first-pass direct cost**. A type that generates more text uses more of the source work, and the split does not move when some activities are regenerated.
- **First-pass cost per accepted activity** = (allocated shared cost + first-pass direct cost) ÷ activities accepted on first pass.
- **After-revision cost per accepted activity** = (allocated shared cost + all direct cost, including regenerations) ÷ activities accepted after revision.
- Attempts whose cost is unavailable are counted and shown, not silently priced at zero.

### 8.3 Targets

Provisional targets for the pilot. They are **not** pass or fail until frozen:

| Measure | Provisional target | Use |
|---|---|---|
| First-pass acceptance | ≥ 80% per type | Quality target. After-revision acceptance is reported next to it, never in its place |
| Source support at 2 | ≥ 90% | Diagnostic |
| Mapping at 2 | ≥ 75% (with a unit) | Diagnostic |
| Distractors, usefulness | Distribution reported | Diagnostic; a cluster of 0s or 1s triggers investigation |
| Review minutes | ≤ 3 per activity | Monitoring only. Compared with item count and correction time, because a ten-card package is not one question |
| Cost per accepted activity | ≤ $0.05 USD | Provisional target, not a failure threshold. The phase-2 figure (about $0.012 per *generated* package, synthetic material, nothing human-accepted) is not a baseline for accepted activities on real material |

After the pilot, Benjamin sets the thresholds from what it shows. They are recorded in this spec with a date and are **frozen** before any further unit is scored. Changing them afterwards is a recorded decision, not an edit.

## 9. The BSBAUD412 pilot

**Sample size.** The default plan gives five `multiChoice` packages, three `blanks` packages and one `flashcards` package (4–12 cards) per import. The pilot uses the defaults, because they are what users get. At activity level these numbers are coarse: one flashcards decision is either 0% or 100%. So the report always shows raw counts next to percentages, and every card and blank is inspected (§5). Item-level counts give the larger sample.

**Procedure:**
1. Check the extraction: run `leap extract` on the packet and compare at least five representative tables with the original (§4.2). Fix the extractor before any model call if they differ.
2. Baseline run: current prompts and model roles, all three types, recorded provider. The recorded responses stay under `docs/uoc/`.
3. Score the first pass through the sheet, including the §4.4 negative check.
4. Diagnose from the scores, stage by stage. A 0 on correctness or support points to production or evidence verification; a mapping failure to alignment; missing or wrong concepts to extraction and chunk boundaries. Investigate code only where the scores show a failure; the areas to watch are evidence alignment, chunk boundaries and language handling.
5. Regenerate `needs-revision` and `rejected` activities (§6), and score the new revisions.
6. Experiments, only where the baseline gives a reason, one change at a time, each as a new import: `extract` on Sonnet 5 instead of Haiku 4.5; adaptive thinking with `effort` on `produce`; prompt revisions. Compare first-pass results and cost per accepted activity.
7. Calibrate and freeze thresholds (§8.3).

**Recording results.** "**BSBAUD412 pilot complete**" is recorded in `docs/testing/phase-3-pilot.md` once steps 1–7 are done, whatever the numbers were. It is not a pass. "**Full quality gate passed**" requires at least five source-and-unit pairs, including trade units, scored against the frozen thresholds, with results pooled per type and broken down per pair. Across the corpus that means at least 25 `multiChoice`, 15 `blanks` and 5 `flashcards` packages at defaults.

**Phase 4 before the full gate** is allowed only by an explicit, limited-scope decision from Benjamin, recorded in the parent spec's §13. It names which producers may start and on what evidence, and says that the pilot does not establish performance across units or trades.

## 10. Not in phase 3

Web page and Wikipedia ingestion (phase 5); audio, video and YouTube (phase 6); new producers (phase 4, subject to §9); field editing or a correction editor; any web UI for review (phase 5); agreement checks between reviewers (only if a second reviewer joins); a rebuild command (§3.3 sets its rules); OCR.

## 11. Risks

- **One reviewer.** One person's standards set the bar. Mitigations: concrete 0/1/2 descriptions, decisions derived in code, a reason and item IDs on every 0 and 1, and a statement of the limitation in the report.
- **One unit, not a trade.** BSBAUD412 is a business-services unit. Results may not carry over to trade material with procedures, tools and numeric limits. The pilot and the full gate are kept apart for this reason (§9).
- **Table-heavy source.** With 56 tables in the packet, table extraction is where grounding can fail before any model runs. The extraction check comes first (§9 step 1), and table rows are atomic evidence (§4.2).
- **Material leaking into git.** `docs/uoc/` is ignored. Real replay fixtures, sheets, score batches and reports are written only under it or under the import directory. Only sanitised numbers are committed.
- **Prompt and schema churn.** The KE tree, RTO-instruction classification and extraction version change the parse, extract and align prompts and the run fingerprint. Phase-2 replay fixtures are re-recorded on the synthetic material. The phase-2 demo document stays as the record of phase 2.
