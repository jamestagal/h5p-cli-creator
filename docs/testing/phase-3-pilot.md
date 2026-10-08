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

## Runbook (Task 16; draft for Checkpoint D review)

**Status:** this is a draft for review. **Checkpoint D** (tooling complete) and **Checkpoint E** (Benjamin authorises P1) are both **pending**. Nothing below authorises a paid run. Commands are shown with placeholders: `<pilot>` is an absolute directory outside the repository, as `leap-pilot/` was for S1, and `<packet>` and `<unit>` are the files under `docs/uoc/BSBAUD412/`, which is ignored by Git.

### 1. Preconditions

All must hold before step 3:
- Checkpoints A, B and C passed (A and C reviewed, B recorded above). Checkpoint D passed after review of this runbook and the whole branch.
- `pnpm verify` green on the branch head being run, with Node 20.
- Follow-up F2 is done (`f031a6d`): `leap generate` prints each activity's real package path, `BuildRecord.buildKey`. The paths this runbook refers to are those printed paths.
- Follow-up F3 is deferred: `plan` and `produce` run on `claude-sonnet-5`, as in S1. Any change is a recorded decision before the P1 entry.
- **Checkpoint E:** Benjamin has written the P1 entry in `docs/uoc/pilot-ledger.json`:
  - `runId` `P1`;
  - `outDir` exactly `<pilot>/p1`;
  - `capUsd` at most the approved $3;
  - `authorisedBy` and `authorisedOn` filled in.

  The listed caps must not exceed `totalCapUsd` ($20).
- `ANTHROPIC_API_KEY` is set in the shell only; it is never written to a file in the repository.

### 2. Extraction check result (Checkpoint B)

Recorded above: the pilot runs on the repaired packet copy (sha256 `f44081b5…7c2b79`), extraction version `2026-10-01.1`.
- **Tables:** five tables and the structural audit (56 tables, 303 data rows) pass.
- **Numbering warnings:** 16, accepted as plain paragraphs.
- **Label-like references:** all 13 checked. Each still points at its intended item, so the simplified-numbering deviation stands (R13).

Before P1, rerun `leap extract` on the same copy into a new `--out`. Confirm that `extract.json` shows the same `originalSha256`, `extractionVersion` and `textHash` as the inspection. If any differs, stop: the inspection no longer covers the text being generated from.

### 3. P1: the BSBAUD412 baseline

One run, defaults for everything that shapes the activities (design §9: they are what users get), recorded responses kept under `docs/uoc/BSBAUD412/replay-p1/`:

```bash
node apps/cli/dist/index.js generate \
  --source docs/uoc/BSBAUD412/<packet>.docx --unit docs/uoc/BSBAUD412/<unit>.txt \
  --out <pilot>/p1 --provider record --fixtures docs/uoc/BSBAUD412/replay-p1 \
  --ledger docs/uoc/pilot-ledger.json --run P1
```

- **Exit codes:** 0 means every planned activity was promoted. 2 means some failed: each failure is named with its reason (`content:`, `budget:`, `system:` or `skipped:`). 1 means nothing was promoted, or the run was refused.
- **If it is interrupted:** resume it with the same command. That is still P1, bounded by P1's cap and the spend already recorded in its attempt records. Do not change any argument, or the fingerprint check refuses the resume.
- **If it stops on its budget:** it stays stopped. The spend is cumulative, so only a ledger change by Benjamin lets it continue.
- **Outputs:** the printed package paths, `mapping.csv` and `cost.json` are in `<pilot>/p1`. `cost.json` is derived; spend is read from `attempts.jsonl`.
- **Scope:** P1 covers the BSBAUD412 baseline and its regenerations (step 4). Nothing else may run under `--run P1`.

### 4. Scoring procedure

Repeat until `gate-report` says `complete`:

1. **Export:** `leap review-sheet --out <pilot>/p1` writes a sheet bundle under `reviews/sheets/<sheetId>/` for every promoted build that has no scored review.
2. **Score** every activity and, for blanks and flashcards, every item, against its own cited passages. Use the unit's PC and KE text, never the packet's assessment arrangements.
   - In `scores.csv`, score each applicable dimension 0, 1 or 2 (`na` is filled in already), and record the minutes.
   - In `findings.csv`, add one row per failing item for every 0 or 1, with the reason.
   - **Negative check (design §4.4):** if an activity states or implies the packet's own RTO arrangements as a fact about BSBAUD412 (for example, that it cannot be assessed in a simulated environment), score correctness 0. Start the finding's reason with `rto-claim:`; the gate report counts these.
3. **Import:** `leap review-import --out <pilot>/p1 --scores <bundle>/scores.csv --reviewer Benjamin`.
   - **Refused:** it lists every problem, and nothing is written. Fix the sheet and import again.
   - **Partly scored:** a partly scored sheet can be imported, and the rest imported later from the same sheet.
4. **Report:** `leap gate-report <pilot>/p1`. While it says `incomplete`, it lists what is open.
5. **Regenerate** a `needs-revision` or `rejected` activity, at most **twice** per activity; failed requests count. Then return to step 1 for the new revision.

   ```bash
   node apps/cli/dist/index.js regenerate --out <pilot>/p1 --activity <id> --note "<what to change>" \
     --provider record --fixtures docs/uoc/BSBAUD412/replay-p1 --ledger docs/uoc/pilot-ledger.json --run P1
   ```

   An interrupted request is finished by the same command for that activity, with no `--note`.

**Recovery:**

| Interrupted command | What to do |
|---|---|
| `generate`, `regenerate` | Rerun as described above. |
| `review-import` | If the batch was committed, the next `leap` command completes it. |
| `review-sheet`, `gate-report` | Rerun. |
| `extract` | Not resumable: use a new `--out`. |

### 5. Diagnosis (design §9 step 4)

Investigate code only where the scores show a failure:

| Failing dimension or symptom | Stage to look at first |
|---|---|
| Correctness 0 or 1 | Production (`produce`), then evidence verification |
| Support 0 or 1 (the cited passage does not support the answer) | Evidence verification and citation |
| Mapping 0 or 1 (wrong or missing PC or KE) | Alignment |
| Distractors 0 or 1 (multiChoice only) | Production prompt |
| Usefulness 0 or 1 | Planning (focus and concept choice), then production |
| Missing or wrong concepts; activities on trivial or off-topic text | Extraction and chunk boundaries |
| An `rto-claim` finding | Concept kinds (`rto-instruction` classification) and planning |
| Garbled text, broken tables or lists in cited passages | DOCX ingestion (would reopen Checkpoint B) |

### 6. Experiments (design §9 step 6)

Run them only where the baseline gives a reason.
- **Authorisation:** each experiment needs its own new ledger entry (`E1`, `E2`, …, at most $3 each).
- **Scope:** each is a new import into a new `--out`, and changes one thing.
- **Candidates:** `extract` on Sonnet 5 instead of Haiku 4.5; adaptive thinking with `effort` on `produce`; or a prompt revision.
- **Budget:** with S1 at $1 and P1 at $3, at most five experiments fit in the $20 total. More needs Benjamin to change a cap or the total.
- **Comparison:** compare first-pass results and cost per accepted activity against P1.

### 7. If a paid run fails

- **Keep evidence:** keep its directory and records unchanged.
- **Record:** write the failure into this file, with numbers and error categories only, never packet text.
- **Stop:** nothing is retried automatically. A further attempt needs a new ledger entry (for example `P1b`) written by Benjamin.

### 8. Calibration

After the pilot, Benjamin sets the thresholds from what it shows. They are written into the design's §8.3 with a date and marked **frozen** before any further unit is scored. Until then, the gate report shows the provisional targets as "not frozen" and evaluates no pass or fail.

### 9. Recording

- **Sanitised summary:** write it with `leap gate-report <pilot>/p1 --summary docs/testing/artifacts/phase-3-p1-gate-summary.json`. The summary must be outside every import directory. It holds numbers, IDs and versions only. Check it for any packet or activity text before committing it.
- **Completion line:** record "**BSBAUD412 pilot complete**" here with its date once steps 1–7 of design §9 are done, whatever the numbers were. **It is not a gate pass.**
- **Full gate:** "Full quality gate passed" needs at least five source-and-unit pairs, including trade units, scored against frozen thresholds. Results are pooled per type and broken down per unit and per item: at least 25 `multiChoice`, 15 `blanks` and 5 `flashcards` packages. The planned minimum is a sample size, not a confidence level.

### 10. Pending: not implemented, not part of P1

- **Interactive Book is not in the pilot.**
  - **What P1 makes:** only `multiChoice`, `blanks` and `flashcards` packages.
  - **What does not exist:** an Interactive Book **pilot composition**, meaning the parent design's §6.1 activity collection that assembles reviewed activity revisions into chapters. Phase 3 has no command, schema or test for it. The parent design places it in phase 4.
- **Author choices for a book are pending decisions:**
  - how revision activities are grouped into **sections** (chapters) and ordered;
  - whether and how the source's **reading** is included (introduction or reading pages beside the activities).

  No phase-3 command takes these choices, and nothing in this runbook implies otherwise.
- **The legacy narrated-audio-book workflow** (`interactivebook-ai`, `youtube-extract`) is unchanged and outside this pilot.
- **Platform checks:** the `interactiveBook` rows in `docs/testing/platform-checklist.md` remain `Pending`.
