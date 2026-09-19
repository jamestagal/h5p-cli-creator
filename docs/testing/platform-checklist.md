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

## Generated packages (phase-2 demo)

Separate rows for the packages the generator produced, so a platform result is never confused with a
generation-quality claim. These come from the 2026-09-19 demo run recorded in
[`phase-2-demo.md`](phase-2-demo.md); the packages are at `/tmp/leap-demo/builds/` and are rebuilt
byte-identically by rerunning that import. **The h5p.com and Moodle cells are filled in by hand by
the owner** — nothing here is asserted by a test.

| Type | Package | h5p.com renders | h5p.com scores | Moodle (<version, H5P integration>) renders | Moodle scores | Date | By |
|---|---|---|---|---|---|---|---|
| multiChoice (generated) | `builds/act-1-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| multiChoice (generated) | `builds/act-2-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| multiChoice (generated) | `builds/act-3-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| multiChoice (generated) | `builds/act-4-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| multiChoice (generated) | `builds/act-5-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| blanks (generated) | `builds/act-6-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| blanks (generated) | `builds/act-7-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| blanks (generated) | `builds/act-8-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |
| flashcards (generated) | `builds/act-9-r1.h5p` | pending (owner) | pending (owner) | pending (owner) | pending (owner) | — | — |

**Local playability check, 2026-09-19 — not a platform result.** All nine packages were unzipped into
a copy of the phase-1 smoke site (`packages/engine/test/smoke/site` plus `h5p-standalone`), served
from `127.0.0.1` and opened in headless Chromium: 9/9 reached `body[data-ready='1']` with a visible
`.h5p-content` frame and zero console errors. That says the packages are well-formed enough to render
in `h5p-standalone` offline. It says nothing about h5p.com or Moodle, which is what the rows above are
for, and nothing about whether the content is any good, which is the phase-3 gate.

## Flashcards hosted-platform check — 2026-09-19

- Reviewed code head: `82afd58`. Uploaded the supplied `/tmp/flash-local.h5p` without modifying its content fields.
- Package SHA-256: `c66c9c7705247677bae649bba03224a29222c626e4783df1e5bce2cd5515766c`.
- Package main library: `H5P.Flashcards 1.5`; title: `Tools`; two cards.
- H5P.com reported **“Flashcards was successfully uploaded!”**. Saved as **Unpublished** at [Tools](https://edtechdesigner.h5p.com/content/1293012109484042179).
- Rendering: the player displayed both question texts, the first card's image area and tip, answer fields, Check, Next and results controls. No content fields were repaired in the editor.
- Attempt 1: `Hammer` for “Used to tighten hex nuts” was marked incorrect and revealed `Spanner`; `Saw` for “Cuts timber” was marked correct. Results displayed **1 of 2 correct**, and the attempt summary displayed **50%**.
- Retry reset the activity. Attempt 2: `Spanner` and `Saw` were both marked correct. Results displayed **2 of 2 correct**, and the attempt summary displayed **2 attempts / 100% on the last attempt**.
- This verifies H5P.com upload, rendering and in-player answer/scoring behaviour. Moodle, LMS grade passback and all other content types remain **Pending**.
