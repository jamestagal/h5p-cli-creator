# Platform checklist

Run for every content type when its handler changes or when `libraries/libraries.lock.json` changes.
Build the golden fixture with `compileToBuffer` (or `leap flashcards` for CSV), then:

| Type | Package | h5p.com renders | h5p.com scores | Moodle (<version, H5P integration>) renders | Moodle scores | Date | By |
|---|---|---|---|---|---|---|---|
| multiChoice | test/fixtures/specs/multi-choice.json | | | | | | |
| blanks | test/fixtures/specs/blanks.json | | | | | | |
| flashcards | test/fixtures/specs/flashcards.json | | | | | | |
| questionSet (nested) | test/fixtures/specs/question-set-nested.json | | | | | | |
| interactiveBook | test/fixtures/specs/interactive-book.json | | | | | | |
| interactiveBook with questionSet | test/fixtures/specs/interactive-book-nested.json | | | | | | |

The Moodle version and H5P integration are those of the first pilot customer (design §13); fill
the column header when known.
