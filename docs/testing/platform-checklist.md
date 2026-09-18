# Platform checklist

Run for every content type when its handler changes or when `libraries/libraries.lock.json` changes.
Build the golden fixture with `compileToBuffer` (or `leap flashcards` for CSV), then:

| Type | Package | h5p.com renders | h5p.com scores | Moodle (<version, H5P integration>) renders | Moodle scores | Date | By |
|---|---|---|---|---|---|---|---|
| multiChoice | test/fixtures/specs/multi-choice.json | Pending | Pending | Pending | Pending | — | — |
| blanks | test/fixtures/specs/blanks.json | Pending | Pending | Pending | Pending | — | — |
| flashcards | `/tmp/flash-local.h5p` — Tools | Pass: uploaded, saved and rendered | Pass: 1/2 mixed answers; Retry then 2/2 correct | Pending | Pending | 2026-09-19 | Codex via Chrome UI; Benjamin signed in |
| questionSet (nested) | test/fixtures/specs/question-set-nested.json | Pending | Pending | Pending | Pending | — | — |
| interactiveBook | test/fixtures/specs/interactive-book.json | Pending | Pending | Pending | Pending | — | — |
| interactiveBook with questionSet | test/fixtures/specs/interactive-book-nested.json | Pending | Pending | Pending | Pending | — | — |

The Moodle version and H5P integration are those of the first pilot customer (design §13); fill
the column header when known.

## Flashcards hosted-platform check — 2026-09-19

- Reviewed code head: `82afd58`. Uploaded the supplied `/tmp/flash-local.h5p` without modifying its content fields.
- Package SHA-256: `c66c9c7705247677bae649bba03224a29222c626e4783df1e5bce2cd5515766c`.
- Package main library: `H5P.Flashcards 1.5`; title: `Tools`; two cards.
- H5P.com reported **“Flashcards was successfully uploaded!”**. Saved as **Unpublished** at [Tools](https://edtechdesigner.h5p.com/content/1293012109484042179).
- Rendering: the player displayed both question texts, the first card's image area and tip, answer fields, Check, Next and results controls. No content fields were repaired in the editor.
- Attempt 1: `Hammer` for “Used to tighten hex nuts” was marked incorrect and revealed `Spanner`; `Saw` for “Cuts timber” was marked correct. Results displayed **1 of 2 correct**, and the attempt summary displayed **50%**.
- Retry reset the activity. Attempt 2: `Spanner` and `Saw` were both marked correct. Results displayed **2 of 2 correct**, and the attempt summary displayed **2 attempts / 100% on the last attempt**.
- This verifies H5P.com upload, rendering and in-player answer/scoring behaviour. Moodle, LMS grade passback and all other content types remain **Pending**.
