# Phase 3: human quality gate, design

Date: 28 Sep 2026. Status: **draft for Benjamin's review**. Parent: `2026-09-18-generator-service-design.md` (§10 human quality gate, §11 phase 3, §13 rulings of 28 Sep). Starting point: `main` at 0682f46, phase 2 approved 19 Sep.

## 1. What phase 3 is for

Phase 2 proved the machinery on synthetic fixtures: source → activities → playable `.h5p` → mapping → measured cost. Nobody has yet judged whether the activities are any good. Phase 3 is that judgement, run on real vocational material. Its result decides what changes (prompts, the concept layer, model roles, quality checks) before phase 4 adds nine more producers.

Phase 3 is a scoring workflow on top of existing machinery, not a new subsystem. `review` already writes acceptance and alignment records, and `cost.json` already reports cost per accepted activity. Phase 3 adds what is missing, in this order:

1. The engine-fingerprint fix (§3), so revisions record the engine that actually built them.
2. The parts of the 28 Sep ruling that change what the gate measures (§4): input limits, Knowledge Evidence alignment and the claims wording.
3. A rubric and a way to score against it quickly (§5, §6).
4. A gate report with pass criteria agreed before any scoring (§7).
5. Runs on the corpus, then changes where the results point (§8).

## 2. Decisions already made

| Question | Decision |
|---|---|
| Corpus | Starts with one source-and-unit pair, **BSBAUD412** (the unit PDF and a draft knowledge packet), and grows toward the five pairs across trades in parent §10 as material arrives |
| Reviewers | Benjamin only. The rubric has no checks for agreement between reviewers; §9 covers the bias this leaves |
| Where material lives | `docs/uoc/`, ignored by git. Nothing from it is committed: no source text, no unit text, no generated activities, no recorded model responses |
| Order of work | Engine fingerprint first, with a resume test. The gate plan (corpus, rubric, decisions, pass criteria) is reviewed before any scored run. Code is only investigated where real material exposes a failure, especially evidence alignment, chunk boundaries and language handling |
| Claims | Activities are for learning and revision. Answers are verified against cited passages; relevance against Knowledge Evidence and performance criteria. Nothing claims competency or that RTO assessment requirements are met (parent §1) |

## 3. Engine fingerprint

**The defect.** `runImport` stamps `engineFingerprint` on a revision when it is *produced*, not when it is *built*. A candidate saved before a crash keeps the old stamp. If the engine or `libraries.lock.json` changes before the resume, the candidate is compiled by the new engine, but the promoted revision still names the old one (`run-import.ts`, where the candidate is spread into the promoted record). The fingerprint also underreports engine changes: it is `engine@<package.json version>+lock:<hash>`. The version is still `0.1.0` and does not move when engine code changes, so two different engines can share a fingerprint.

**The fix.**
- Stamp `engineFingerprint` at build time, from the engine that compiled the bytes, together with the `buildKey`.
- Derive the engine half from the engine's built output (a hash of `packages/engine/dist`), not from the package version. The lockfile half stays.
- Keep the engine fingerprint out of `runFingerprint`. A changed engine must not block a resume, because rebuilding makes no model calls. What must not happen is a promoted revision that names an engine it was not built with.
- Record in `cost.json` and the gate report which engine fingerprints the promoted revisions of an import were built with. An import that spans two engines says so.

**The test.** Produce a candidate under engine fingerprint A, stop before build, then resume under fingerprint B. Assert that the promoted revision records B, that the build is B's bytes, and that no model call is made on resume. A second case changes only the lockfile hash.

## 4. The 28 Sep ruling: what phase 3 builds, and what waits

| Item | Phase 3? | Why |
|---|---|---|
| Text 500–400,000 characters after extraction, for every text source | Yes | Two constants and a new `SourceTooSmallError`. Any test with a source under 500 characters moves to a longer fixture or calls a test-only builder |
| PDF at most 100 pages, rejected on page count before text extraction | Yes | A PDF the corpus contains could exceed it; checking before extraction avoids parsing 400 pages to reject them |
| Knowledge Evidence alignment | Yes | The ruling makes relevance to Knowledge Evidence part of verification, and phase 2 parses Knowledge Evidence but never aligns it. Without this the gate cannot score the dimension |
| Claims wording audit | Yes | `mapping.csv`, `cost.json`, the CLI help, README and prompts are checked against the no-competency-claim rule. A test asserts the mapping header carries the revision-not-assessment notice |
| DOCX and ODT ingestion | **Recommended yes** | File-based, offline, testable, and vocational material commonly arrives as Word. DOCX via `mammoth`; ODT by reading `content.xml` from the zip (JSZip, which the engine already depends on) and keeping paragraph breaks |
| Web page and Wikipedia article | **Recommended: phase 5** | Both fetch over the network: `safeFetch` exists, but a readability extractor does not. They belong with the server, as phase 2 already recorded. Wikipedia could come earlier through its plain-text API if the corpus needs it |

**Knowledge Evidence alignment, in detail.** Knowledge Evidence items get stable IDs in order (`KE1`, `KE2`, …), assigned when the unit is parsed, so they can sit next to `PC1.1` in `criteriaIds`. The align call returns one entry per performance criterion and per Knowledge Evidence item, using the same evidence-quote rule. Knowledge Evidence items with no supporting concept are reported as unsupported alongside criteria. `mapping.csv` gains a `kind` column (`pc` or `ke`). `review --criterion` accepts either kind. The parse and align prompt versions change, so every import made before this change needs a new output directory; the fingerprint error already says so.

## 5. The rubric

One review per promoted revision of each activity. Each dimension is scored **0, 1 or 2**: 0 is wrong or missing, 1 is usable after an edit, 2 is good as it stands. A dimension that does not apply is `na` (for example, distractors on flashcards).

| Dimension | 2 means | Applies to |
|---|---|---|
| Answer correctness | Every keyed answer is right | All |
| Source support | Every answer is supported by the passage the activity cites, read on its own | All |
| Distractor quality | Every wrong option is plausible and clearly wrong on the source | `multiChoice` |
| Mapping accuracy | Every mapped performance criterion and Knowledge Evidence item is relevant, and no obvious one is missing | All, when a unit is present |
| Usefulness | A learner revising this unit would benefit from it | All |
| Review effort | Minutes spent, recorded rather than scored | All |

Multi-item activities (flashcards, blanks) are scored at activity level. The reviewer names any failing item IDs in the notes, so a pattern of bad items shows up without scoring each one.

**The decision** follows from the scores, so it cannot contradict them:
- Answer correctness 0, or source support 0 → **rejected**.
- Otherwise, any dimension at 1 → **accepted with edits**.
- Otherwise → **accepted**.

`AcceptanceDecision` gains `accepted-with-edits`. Cost per accepted activity counts both accepted outcomes, and the report shows each separately.

## 6. How scoring works

Scoring one activity at a time on the command line would make review effort measure the tool rather than the activity. Instead:

1. **`leap review-sheet --out <dir>`** writes `review-sheet.md` and `scores.csv` for an import. For each promoted activity, the sheet shows the question or cards, the keyed answers, each cited evidence quote in full with its sentence ID, and the mapped PCs and Knowledge Evidence items with their text. The `.h5p` path is included for playing it. `scores.csv` has one row per activity, with empty score columns, a decision column that the importer derives, a notes column and a minutes column.
2. The reviewer fills in `scores.csv` beside the sheet, in any spreadsheet program.
3. **`leap review-import --out <dir> --scores scores.csv --reviewer <name>`** validates every row before writing anything. It checks that the activity and revision exist, that scores are in range, that `na` is used only where allowed, and that the decision matches the rule. It then writes one `ScoreRecord` and one acceptance record per activity, under the import's lock, and rewrites the reports.

`ScoreRecord { importId; activityId; revision; reviewer; scores: { correctness; support; distractors; mapping; usefulness }; minutes; failingItemIds; notes; decidedAt }` is a new append-only record in `ImportStore`, as are the acceptance records. Rescoring a revision appends a new record; the latest one wins.

## 7. The gate report and pass criteria

**`leap gate-report <dir>...`** reads one or more import directories and writes `gate-report.md`. Per type and in total, it shows:
- the number of activities, and the rate of each decision (accepted, accepted with edits, rejected);
- the mean score for each dimension, and the count of 0s for each;
- content retries per activity and the retry share of cost;
- median and total review minutes;
- cost per accepted activity (both accepted outcomes);
- performance criteria and Knowledge Evidence items that are unsupported or never targeted;
- the engine fingerprints, prompt version and model roles used.

The report is written to the import directory, which is outside git. A sanitised summary with numbers only, no source text and no activity text, is copied into `docs/testing/phase-3-gate.md`.

**Proposed pass criteria, to be agreed before the first scored run:**

| Measure | Threshold, per type |
|---|---|
| Answer correctness | No 0 among activities accepted in either form |
| Source support at 2 | At least 90% of activities |
| Acceptance (either form) | At least 80% |
| Accepted without edits | At least 50% |
| Mapping accuracy at 2 | At least 75% of activities, when a unit is present |
| Median review time | At most 3 minutes per activity |
| Cost per accepted activity | At most $0.05 (the phase-2 synthetic run cost $0.11 for 9 activities, about $0.012 each) |

A type that misses a threshold gets a change (§8) and a rerun on the same pair before phase 4 starts. With one pair, a pass means "passes on BSBAUD412", and the report says exactly that. Every pair added later reruns the gate as a regression. A failure on a later pair reopens the phase-3 changes for that type; it does not block phase-4 producers that the pair does not use.

## 8. Runs and changes

- **Baseline run.** BSBAUD412 with the current prompts and model roles, all three types, recorded provider. Recorded responses stay in `docs/uoc/`, never in `packages/*/test/fixtures`. Then score it.
- **Diagnose from the scores.** The failing dimension points to the stage: a 0 on correctness or support points to production or evidence verification; wrong or missing mapping points to alignment; wrong or missed concepts point to extraction and chunk boundaries. Code is investigated only where the scores show a failure. The areas to watch are evidence alignment, chunk boundaries (a concept split across chunks) and language handling.
- **Experiments**, only where the baseline gives a reason, one change at a time on the same pair: `extract` on Sonnet 5 instead of Haiku 4.5; adaptive thinking with `effort` on `produce`; prompt revisions. Each gets a new prompt version or model profile, so each run is its own import directory and fingerprint. Cost per accepted activity is compared across runs.
- **Close-out.** Parent §8 and §13 record the chosen model roles. `PROMPT_VERSION` records the prompt version that passed. `docs/testing/phase-3-gate.md` records the numbers.

## 9. Risks

- **One reviewer.** No agreement check means one person's standards set the bar. Mitigations: the rubric is written out before scoring, the decision is derived from the scores, and notes are required on every 0. The single-reviewer limitation is stated in the gate report.
- **One unit.** BSBAUD412 is a business-services unit, not a trade. Results may not carry over to trade material with procedures, tools and numeric limits. The report says which pairs it covers, and the gate reruns as pairs arrive.
- **Material leaking into git.** `docs/uoc/` is ignored. Replay fixtures from real material are written only under it. The review sheet and gate report are written to the import directory. Only the sanitised summary is committed.
- **Knowledge Evidence alignment changes the align prompt.** Phase-2 replay fixtures for alignment must be re-recorded against the synthetic unit. The phase-2 demo document stays as a record of phase 2.

## 10. Not in phase 3

Web page and Wikipedia ingestion (recommended for phase 5, §4); audio, video and YouTube (phase 6); new producers (phase 4); any web UI for review (phase 5); agreement checks between reviewers (only if a second reviewer joins); OCR.

## 11. Questions for review

1. DOCX and ODT in phase 3, web page and Wikipedia in phase 5: agreed?
2. The 0/1/2 scale, the dimensions, and the rule that derives the decision from the scores: agreed?
3. The pass thresholds in §7: agreed, or which to change?
4. The pasted-text minimum: 500 or 550 characters? (The ruling gives both.)
