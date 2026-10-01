# Historical replay archive (frozen; not replayed by the current pipeline)

This directory keeps the evidence of the phase-2 recorded demo exactly as it was: the recorded requests and
responses, the source document they were made from, and the unit text and PDF that source came from. Nothing here is
edited, re-keyed or replayed. `test/historical-archive.test.ts` checks every file against `manifest.json`
(plan R12, amended 1 Oct 2026).

| File | What it is |
|---|---|
| `replay/*.json` | The 13 responses recorded on 19 Sep 2026 at `c8717eb` (`leap generate --provider record`). Each file is named by its request key. Moved here unchanged from `test/fixtures/replay/synthetic/` in Task 10. |
| `source-electrical-safety.pdf.841bfd7.source.json` | The `SourceDocument` the recordings were made from (provenance below). |
| `source-electrical-safety.pdf.db6057a.pdf` | The synthetic PDF as it was until Task 10 regenerated it (sha256 `a7cb99c3…0882ebc`). |
| `unit-synele001.txt.db6057a.txt` | The unit text the recordings were made from, unchanged from `84abb84` to `db6057a`. |
| `manifest.json` | sha256 of every file above, and the last compatible revision. |

**Last compatible revision: `db6057a`.** The historical replay test passed there, replaying these recordings from the
frozen document and this unit text. Task 10 changed the parse, extract and align requests (and `PROMPT_VERSION`), so
no later revision sends a request these responses answer. Old responses are never re-keyed and production code has no
compatibility switch; to replay them, check out `db6057a` with these files in their original places.

## Provenance of the frozen source document

`source-electrical-safety.pdf.841bfd7.source.json` is the `SourceDocument` that the pre-fix PDF extractor at
commit `841bfd7` produces from the PDF archived here, with the replay test's options
(`sourceId: "src-source-electrical-safety.pdf"`, `fileName: "source-electrical-safety.pdf"`). That extractor
stored pdf-parse's joined text, including the parser's page labels (`-- 1 of 2 --`, `-- 2 of 2 --`), which the
recorded requests were made from.

- It was **reconstructed on 30 Sep 2026** by running `ingestPdf` from a clean build of `841bfd7` (Node 20.20.2,
  `pnpm install --frozen-lockfile`) on the same PDF bytes (sha256 `a7cb99c3…0882ebc`). It was **not saved during
  the original paid recording run**; the recordings keep only a 200-character preview of each request.
- Before it was committed, `841bfd7`'s own replay test passed against the same recordings, and the replay test
  passed when given this file as its source, which is what "the recorded requests were made from this text" means.
- Document: 2 pages, 3,558 code points, 78 sentences, `textHash` `99fe17fc5d2ef510a1622fac5fb7682702ea69b4ebbbd306e9e0d473e627520f`,
  `extractionVersion` `2026-09-28.1`. File sha256 `a6f189a750508d2fbaa67bb919e9acc8c307a12d7bb9fcf58e7768aa8e55176c`.

Current PDF ingestion is tested offline from the current PDF, and current-PDF replay coverage returns with S1, whose
recordings go to `test/fixtures/replay/synthetic/`.
