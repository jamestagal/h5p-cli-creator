# Synthetic fixtures (not a real corpus)

Everything in this directory is invented for pipeline tests: the "unit of competency" is not a
training.gov.au unit and the safety text is not authoritative guidance. The fixtures exist to prove
that ingestion, evidence verification, chunk merging, alignment and generation work mechanically.
They say nothing about educational quality; that is the phase-3 gate, which uses a real corpus kept
outside this directory.

Designed properties:
- `source-electrical-safety.md`: about 40 sentences. The concept "lockout and tagout" appears in
  section 2 and again in section 5 (a repeated concept the merge pass must unify). With the test
  chunk budget of 330 estimated tokens, the sentence about "test for dead" at the end of section 3
  and its follow-up at the start of section 4 fall in different chunks (evidence for one concept
  spanning a chunk boundary).
- `unit-synele001.txt`: three elements, seven performance criteria. PC3.2 ("Complete an incident
  report") has no support anywhere in the source and must be reported as unsupported.
- `source-electrical-safety.pdf`: generated from the markdown by `scripts/make-synthetic-pdf.ts`
  (pdf-lib), so the PDF ingestion test can check the same sentences survive the text layer.
- Fake model responses for the pipeline tests are built *in test code* from the ingested
  document (sentence ids are looked up by their text), so they never drift from the fixture. They
  are synthetic; recorded real responses live in `../replay/`.
