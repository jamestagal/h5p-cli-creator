# S1 synthetic response recordings

These 13 recordings were captured in one authorised run on 2 Oct 2026 from the current synthetic PDF and unit, using the reviewed Task 10 code at `ab1d252` and `S1_SETTINGS`. Planning and production used Sonnet 5. The run completed all nine activities without retries: five multiple-choice, three blanks and one flashcards package.

The request keys and raw responses are unchanged. The immutable attempt ledger reports 110,690 µUSD ($0.110690), using pricing version `2026-09-19`. Every attempt has known usage and cost; there were no reservation underestimates or spend over the $1 estimated cap. Cache reads were zero; cache writes totalled 12,927 tokens.

`test/replay.test.ts` replays these files without a key or network access and checks complete builds, all PC/KE targets, unit attribution and RTO-instruction exclusion. This is synthetic pipeline evidence, not a human quality assessment. The earlier recordings remain in `test/fixtures/historical/` with their original bytes, hashes, source and compatible revision.
