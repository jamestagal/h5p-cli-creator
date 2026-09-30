# Historical replay input (frozen; not current PDF ingestion)

`source-electrical-safety.pdf.841bfd7.source.json` is the `SourceDocument` that the pre-fix PDF extractor at
commit `841bfd7` produces from `../synthetic/source-electrical-safety.pdf` with the replay test's options
(`sourceId: "src-source-electrical-safety.pdf"`, `fileName: "source-electrical-safety.pdf"`). That extractor
stored pdf-parse's joined text, including the parser's page labels (`-- 1 of 2 --`, `-- 2 of 2 --`), which the
recorded replay requests in `../replay/synthetic/` were made from.

Provenance:
- It was **reconstructed on 30 Sep 2026** by running `ingestPdf` from a clean build of `841bfd7` (Node 20.20.2,
  `pnpm install --frozen-lockfile`) on the same PDF bytes (sha256 `a7cb99c3…0882ebc`). It was **not saved during
  the original paid recording run**; the recordings keep only a 200-character preview of each request.
- Before it was committed, `841bfd7`'s own replay test passed against the same recordings, and the replay test
  passes when given this file as its source, which is what "the recorded requests were made from this text" means.
- Document: 2 pages, 3,558 code points, 78 sentences, `textHash` `99fe17fc5d2ef510a1622fac5fb7682702ea69b4ebbbd306e9e0d473e627520f`,
  `extractionVersion` `2026-09-28.1`. File sha256 `a6f189a750508d2fbaa67bb919e9acc8c307a12d7bb9fcf58e7768aa8e55176c`.

Use: only the historical replay test reads it, as **historical pipeline compatibility** evidence. It is not
coverage of current PDF ingestion, which is tested offline from the PDF itself. It is never edited; the planned
S1 run records the current PDF path and restores current-PDF replay coverage (plan R12, amended 30 Sep 2026).
