# Phase 3 pilot: BSBAUD412

This file records the phase-3 pilot. It holds numbers, verdicts and identifiers only, never source text: the packet
and every report extracted from it stay outside Git. The runbook (Task 16) and the sanitised pilot results follow.

## Checkpoint B: extraction inspection (approved 1 Oct 2026)

**Approved by:** Benjamin (owner), 1 Oct 2026, in the implementation conversation ("Checkpoint B approved").

**Pilot source:** the BSBAUD412 knowledge packet (DOCX), as repaired for this pilot:

- Repaired copy sha256: `f44081b5091254d81c07d1facde19a9243657ba6709c7934a3ef5cabb97c2b79`. The pilot runs on this file.
- The supplied original is unchanged and is not the pilot source.
- Reviewed with `leap extract` at `4007c4c` (extraction version `2026-10-01.1`). The review record, with verdicts and no packet text, is kept with the inspection files outside Git.

**What the inspection found, and what changed:**

| Run | Commit | Result |
|---|---|---|
| 1 | `e6a147c` | 56 tables, but 54 had no data rows: the packet marks almost every row `w:tblHeader w:val="false"`, and mammoth read each as a header row. Fixed in `16db2cb` (off-valued header flags are data rows; extraction version `2026-10-01.1`). |
| 2 | `16db2cb` | All 303 data rows across 56 tables present; no row-count mismatch or missing data-cell paragraph against the packet's XML. 26 warnings for numbering with no definition (the packet's own numbering IDs are invalid). |
| 3 | `16db2cb`, repaired copy | Two lists that the text refers to by step number were renumbered in a new copy of the packet. Warnings fell from 26 to 16. Tables and rows unchanged. |
| 4 | `4007c4c`, repaired copy | The label-reference detector, widened in `4007c4c` to catch list nouns with numbers written as words, reported 13 references. All 13 checked; the two repaired references resolve correctly, and none points into the 16 remaining unnumbered lists. |

**Verdicts:**

| Check | Verdict |
|---|---|
| Table 1 against the original | Pass |
| Table 5 against the original (spans rendered pages 3–4: the across-pages case) | Pass |
| Table 7 against the original | Pass |
| Table 15 against the original | Pass |
| Table 56 against the original | Pass |
| Structural audit of all 56 tables and 303 data rows against the packet's XML | Pass |
| Oversize atomic segments | None |
| Oversize extraction requests | None |
| Merged cells | Not present in the packet: synthetic test coverage only |
| Lists inside table cells | Not present in the packet: synthetic test coverage only |
| Numbering warnings | 16 accepted as plain paragraphs for this pilot: meaning and order are clear without numbers, and no reference depends on them |
| Label-like references | 13 checked; all resolve to the intended items |

**Accepted for the pilot:** the repaired copy above, with its 16 remaining numbering warnings read as plain paragraphs. The adapter keeps reporting invalid numbering IDs and never invents labels.

## S1 synthetic recording completed 2 Oct 2026

Benjamin authorised one local S1 recording run with a $1 estimated cap, with no automatic rerun after failure. The run used the reviewed Task 10 code at `ab1d252`, the current synthetic PDF and unit under `S1_SETTINGS`, and Sonnet 5 for planning and production. It ran on macOS arm64 with Node 20.20.1. No private packet content was submitted.

The run exited 0 with status `ready`: 9 of 9 planned activities were promoted (5 multiple-choice, 3 blanks and 1 flashcards package). All 13 provider attempts completed with known costs; there were no retries, reservation underestimates or spend over the cap. Total recorded cost, summed from the immutable attempt ledger, was **110,690 µUSD ($0.110690)**.

All 13 response recordings are in `packages/generator/test/fixtures/replay/synthetic/`. Offline replay passes the complete-import check, including every selected type, every promoted build and package hash/length. Replay also verifies all PC and KE alignment targets, the unit hash on alignment and activities, and the exclusion of the RTO-instruction concept from alignment and activities. `PC3.2` remains unsupported, and the parsed unit's conditions still allow a simulated environment.

The temporary expected-replay-miss script is removed. The historical recordings, source document, original synthetic unit and PDF remain byte-identical in their archive.

This is evidence that the pipeline, attribution, recording and metering work. It is not a human judgement of activity quality. The BSBAUD412 pilot and every further paid run still require separate authorisation. The completed run's output and attempt ledger remain outside Git in the local `leap-pilot/s1` directory.

## Checkpoint D: tooling complete (passed 9 Oct 2026)

**Passed:** 9 October 2026, by Benjamin (owner), reviewing the integration candidate `phase-3/checkpoint-d` at `26d36a1`. That candidate holds Tasks 11–16, follow-up F2 and the legacy test-isolation fix `beca6a8`.

- **Verification:** stock `pnpm verify` passed locally under Node 20 with API keys unset, including all 10 browser smoke tests.
- **Findings:** none remaining, on standards or spec.
- **Branches:** the phase branch and `main` were not updated; Checkpoint D authorises neither a branch update nor a paid run.

**Still pending before P1:**
- **Interactive Book scope:** how it is implemented, and whether a standalone baseline may run first (runbook step 3).
- **Unit text:** the prepared text is checked against the published unit and its hash recorded (runbook step 2).
- **Checkpoint E:** Benjamin writes the P1 ledger entry.

## Runbook (Task 16; reviewed at Checkpoint D)

**Status:** Checkpoint D (tooling complete) **passed** on 9 Oct 2026; see above. **Checkpoint E** (Benjamin authorises P1) is **pending**, as are the Interactive Book scope (step 3) and the unit-text check (step 2). Nothing below authorises a paid run.

**Conventions:**
- Every command runs from the repository root as `node apps/cli/dist/index.js …`, after `pnpm build`. There is no installed `leap` binary; "`leap generate`" in prose means that command.
- `<pilot>` is an absolute directory outside the repository, as `leap-pilot/` was for S1.
- `<packet>` and `<unit>` are file names under `docs/uoc/BSBAUD412/`, which is ignored by Git.

### 1. Preconditions

All must hold before step 4:
- **Checkpoints:** A, B and C passed (A and C reviewed, B recorded above). D passed after review of this runbook and the whole branch.
- **Verification:** `pnpm verify` green on the branch head being run, with Node 20.
- **F2 done (`f031a6d`):** `generate` prints each activity's real package path, its `BuildRecord.buildKey`. Package paths in this runbook mean those printed paths.
- **F3 deferred:** `plan` and `produce` run on `claude-sonnet-5`, as in S1. Any change is a recorded decision before the P1 entry.
- **Scope decided (step 3):** Benjamin's decision on the pilot scope is recorded in this file.
- **Unit prepared (step 2):** the unit text is prepared and checked, and its hash recorded here.
- **Checkpoint E:** Benjamin has written the P1 entry in `docs/uoc/pilot-ledger.json`:
  - `runId` `P1`;
  - `outDir` exactly `<pilot>/p1`;
  - `capUsd` at most the approved $3;
  - `authorisedBy` and `authorisedOn` filled in.

  The listed caps must not exceed `totalCapUsd` ($20), and no two entries may name the same `outDir`.
- **API key:** `ANTHROPIC_API_KEY` is set in the shell only; it is never written to a file in the repository.

### 2. Source and unit preparation (zero cost)

**The packet (Checkpoint B):** the pilot runs on the repaired packet copy (sha256 `f44081b5…7c2b79`), extraction version `2026-10-01.1`.
- **Tables:** five tables and the structural audit (56 tables, 303 data rows) pass.
- **Numbering warnings:** 16, accepted as plain paragraphs.
- **Label-like references:** all 13 checked and still pointing at their items, so the simplified-numbering deviation stands (R13).

Before P1, re-extract into a new directory and confirm that `extract.json` shows the inspection's `originalSha256`, `extractionVersion` and `textHash`. If any differs, stop.

```bash
node apps/cli/dist/index.js extract --source docs/uoc/BSBAUD412/<packet>.docx --out <pilot>/extract-p1
```

**The unit:** the supplied BSBAUD412 unit is a PDF, but `--unit` reads a UTF-8 text file. Prepare that file as follows.
1. **Extract the PDF's text.** `extract` is offline and reads PDFs:

   ```bash
   node apps/cli/dist/index.js extract --source docs/uoc/BSBAUD412/<unit>.pdf --out <pilot>/unit-extract
   ```

   A raw extraction prepared on 9 Oct (`leap-inspection/BSBAUD412/unit-extract-d75c4f6/extracted.txt`, outside Git) has not been checked yet.
2. **Make `docs/uoc/BSBAUD412/<unit>.txt`** from `extracted.txt`, and check it line by line against the published unit:
   - the code, title and **release**;
   - every element and **performance criterion**, with its number and wording;
   - every **Knowledge Evidence** item and sub-item, in order and nesting;
   - the **assessment conditions**, including that assessment may take place in the workplace or a simulated environment.

   Remove page furniture (running headers, footers, page numbers). Keep the published wording; do not paraphrase.
3. **Record the file's hash** here: `shasum -a 256 docs/uoc/BSBAUD412/<unit>.txt`. The import's fingerprint covers the unit text, so any later edit makes P1's directory refuse a resume.
4. **After P1 parses the unit,** check the parsed unit before any scoring. The unit is parsed by a model call during `generate`, and the result is stored as `<pilot>/p1/artifacts/unit.json`. Its release, PC IDs, KE tree and assessment conditions must match the checked text. A mismatch is a failure under step 8.

### 3. Pilot scope: Interactive Book intended, approach pending

Benjamin has said he intends the pilot to include Interactive Book. Two things are still undecided, and both are recorded here before Checkpoint E:
- **How it is implemented:** which composition approach is built, and how.
- **Ordering:** whether a standalone baseline may run first. That baseline is P1 as specified below, `generate`'s default `multiChoice`, `blanks` and `flashcards` packages.

Two features this touches are **not implemented**:
- **Selecting input source sections.** Generating from chosen sections of the packet, rather than the whole source, is not implemented. `generate` always reads the whole source; `--customisation` only steers the prompts.
- **Grouping output activities into chapters.** An Interactive Book composition (the parent design's §6.1 activity collection) is not implemented: no phase-3 command, schema or test exists for it, and the parent design places it in phase 4. This covers the author choices about how activities are grouped into chapters and ordered, and whether the source's reading is included as reading pages.

The legacy narrated-audio-book workflow (`interactivebook-ai`, `youtube-extract`) is unchanged and separate. The `interactiveBook` rows in `docs/testing/platform-checklist.md` remain `Pending`.

### 4. P1: the BSBAUD412 baseline

One run, with `generate`'s defaults for everything that shapes the activities (design §9: they are what users get; concurrency 3). Recorded responses are kept under `docs/uoc/BSBAUD412/replay-p1/`.

```bash
node apps/cli/dist/index.js generate \
  --source docs/uoc/BSBAUD412/<packet>.docx --unit docs/uoc/BSBAUD412/<unit>.txt \
  --out <pilot>/p1 --provider record --fixtures docs/uoc/BSBAUD412/replay-p1 \
  --ledger docs/uoc/pilot-ledger.json --run P1
```

**Retries inside the command:** they happen automatically, and every one is metered.
- **Content failures:** an activity gets up to 3 content attempts, each fed back with the reasons.
- **Transient provider errors:** up to 3 retries with backoff.

Each attempt is recorded in `attempts.jsonl` and counts against the budgets. No retry happens *across* commands without a person running one.

**Reading the result:** the exit code gives the import's status, not what this run achieved, so read the per-activity lines.

| Exit code | Import status | Note |
|---|---|---|
| 0 | `ready` | Every planned activity is promoted. |
| 2 | `ready_with_failures` | At least one activity was promoted at some point and some failed. A run can exit 2 having promoted nothing new, for example a rerun on an import whose failures were all content failures. |
| 1 | `failed`, or the run was refused | It can still leave promoted packages behind, for example after a system error later in the run. |

Failures are named with their reason: `content:`, `budget:`, `system:` or `skipped:`. The printed package paths, `mapping.csv` and `cost.json` are in `<pilot>/p1`. `cost.json` is derived; spend is read from `attempts.jsonl`.

**Interruption vs failure:**
- **Interrupted:** the process was killed, crashed or lost its connection before it finished. Resume it with **the same command** under the same entry. A resume is checked against the import's **fingerprint**, which covers the production inputs and settings:
  - the source's text and extraction version;
  - the unit text;
  - the selected types;
  - the language, reading level, tone and customisation;
  - the chunk size and plan rules.

  Budget options, `--provider`, `--fixtures`, `--ledger`, `--run`, `--concurrency` and `--libraries` are not part of it. Keep them unchanged anyway; a resume is still P1.
- **Terminal outcome:** the command finished with failures, or was refused. Refused includes refusal by a cap: the spend cap, `--max-requests`, `--max-tokens` or the cumulative `--max-seconds`. That attempt of P1 is over: **stop**, and follow step 8. Do not raise a cap and rerun in the same directory.

### 5. Scoring procedure

Repeat until `gate-report` says `complete`:

1. **Export:** `node apps/cli/dist/index.js review-sheet --out <pilot>/p1`. It writes a sheet bundle under `reviews/sheets/<sheetId>/` for every promoted build that has no scored review.
2. **Score** every activity and, for blanks and flashcards, every item, against its own cited passages. Use the rubric in design §5 (`docs/superpowers/specs/2026-09-28-phase-3-quality-gate-design.md`), with its dimensions, its scale and the derived decision; each sheet's `review-sheet.md` repeats the instructions. Use the unit's PC and KE text, never the packet's assessment arrangements.
   - In `scores.csv`, score each applicable dimension 0, 1 or 2 (`na` is filled in already), and record the minutes.
   - In `findings.csv`, add one row per failing item for every 0 or 1, with the reason.
   - **Negative check (design §4.4):** if an activity states or implies the packet's own RTO arrangements as a fact about BSBAUD412 (for example, that it cannot be assessed in a simulated environment), score correctness 0. Start the finding's reason with `rto-claim:`; the gate report counts these.
3. **Import:** `node apps/cli/dist/index.js review-import --out <pilot>/p1 --scores <bundle>/scores.csv --reviewer Benjamin`.
   - **Refused:** it lists every problem, and nothing is written. Fix the sheet and import again.
   - **Partly scored sheet:** it can be imported, and the rest imported later from the same sheet. Each row must be either **completely scored** (every applicable dimension and the minutes) or **wholly unscored** (left blank). A partly scored row is refused, and so is the whole import.
4. **Report:** `node apps/cli/dist/index.js gate-report <pilot>/p1`. While it says `incomplete`, it lists what is open.
5. **Regenerate** a `needs-revision` or `rejected` activity, at most **twice** per activity; failed requests count. Then return to step 1 for the new revision.

   ```bash
   node apps/cli/dist/index.js regenerate --out <pilot>/p1 --activity <id> --note "<what to change>" \
     --provider record --fixtures docs/uoc/BSBAUD412/replay-p1 --ledger docs/uoc/pilot-ledger.json --run P1
   ```

   - **Caps:** each request stores the caps it started under, the lowest of the import's, the ledger's and `--budget-usd`. A resume never runs above them, so raising the ledger cap later does not raise a stored request's cap.
   - **Interrupted:** the request is finished by the same command for that activity, with no `--note`. Making a new attempt after a terminal outcome follows step 8.

**Recovery after an interruption:**

| Interrupted command | What to do |
|---|---|
| `generate`, `regenerate` | Rerun as described above. |
| `review-import` | If the batch was committed, the next command on the directory completes it; otherwise import the sheet again. |
| `review-sheet`, `gate-report` | Rerun. |
| `extract` | Not resumable: use a new `--out`. |

### 6. Diagnosis (design §9 step 4)

Investigate code only where the scores show a failure:

| Failing dimension or symptom | Stage to look at first |
|---|---|
| Correctness 0 or 1 | Production (`produce`), then evidence checking |
| Support 0 or 1 (the cited passage does not support the answer) | Evidence checking and citation |
| Mapping 0 or 1 (wrong or missing PC or KE) | Unit parsing (check `artifacts/unit.json`), then alignment |
| Distractors 0 or 1 (multiChoice only) | Production prompt |
| Usefulness 0 or 1 | Planning (focus and concept choice), then production |
| Missing or wrong concepts; activities on trivial or off-topic text | Extraction and chunk boundaries |
| An `rto-claim` finding | Concept kinds (`rto-instruction` classification) and planning |
| Garbled text, broken tables or lists in cited passages | DOCX ingestion (would reopen Checkpoint B) |

### 7. Experiments (design §9 step 6)

Run them only where the baseline gives a reason.
- **Authorisation:** each experiment needs its own new ledger entry (`E1`, `E2`, …, at most $3 each).
- **Scope:** each changes one thing, and is a new import with a new `--out` and a new recordings directory (`docs/uoc/BSBAUD412/replay-e1/`, …).
- **Candidates:** `extract` on Sonnet 5 instead of Haiku 4.5; adaptive thinking with `effort` on `produce`; or a prompt revision.
- **Budget:** with S1 at $1 and P1 at $3, at most five experiments fit in the $20 total. More needs Benjamin to change a cap or the total.
- **Comparison:** compare first-pass results and cost per accepted activity against P1.

### 8. If a paid run fails or is refused by a cap

- **Keep evidence:** keep the directory and its records unchanged, including `attempts.jsonl` and the recordings directory.
- **Record:** write the failure into this file, with numbers and error categories only, never packet text.
- **Stop.** Nothing is retried automatically, and a ledger edit does not reopen the attempt. A cap raised for the same entry and directory would not reliably lift the stop either: the elapsed time is cumulative, and the request and token limits come from the command line.
- **New attempt:** it needs a **new ledger entry** written by Benjamin, for example `P1b`. It must have its own **new `--out`** (`<pilot>/p1b`; the ledger refuses two entries naming the same `outDir`) and its own **new recordings directory** (`docs/uoc/BSBAUD412/replay-p1b/`). Its preconditions are checked again.

### 9. Calibration

After the pilot, Benjamin sets the thresholds from what it shows. They are written into the design's §8.3 with a date and marked **frozen** before any further unit is scored.

Freezing them in the design does **not** change the CLI. The gate report's "not frozen" line comes from a hardcoded flag, `PROVISIONAL_TARGETS.frozen = false` in `packages/generator/src/report/gate.ts`, and no code evaluates pass or fail. Making the report reflect frozen thresholds is a separate, reviewed code change.

### 10. Recording

- **Sanitised summary:** write it with `node apps/cli/dist/index.js gate-report <pilot>/p1 --summary docs/testing/artifacts/phase-3-p1-gate-summary.json`. The summary must be outside every import directory. It holds numbers, IDs and versions only. Check it for any packet or activity text before committing it.
- **Completion line:** record "**BSBAUD412 pilot complete**" here with its date once steps 1–7 of design §9 are done, whatever the numbers were. **It is not a gate pass.**
- **Full gate:** "Full quality gate passed" needs at least five source-and-unit pairs, including trade units, scored against frozen thresholds. Results are pooled per type and broken down per unit and per item: at least 25 `multiChoice`, 15 `blanks` and 5 `flashcards` packages. The planned minimum is a sample size, not a confidence level.
