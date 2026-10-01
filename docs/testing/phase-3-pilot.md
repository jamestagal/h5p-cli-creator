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
