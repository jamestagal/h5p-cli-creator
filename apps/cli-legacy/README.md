# cli-legacy (frozen)

The h5p-cli-creator code as of phase 0, moved here unchanged. It is the compatibility path for
the `ai-*` YAML content types and the bilingual mode until every type has a producer in
`packages/generator` (design §2.1a). Rules:

- No refactoring and no new features here. Bug fixes only, with a test.
- `tests/integration/multi-language-ai.test.ts` is the bilingual compatibility fixture and must
  keep passing.
- Run from this directory (`pnpm --filter cli-legacy <script>`); the library cache is
  `./content-type-cache` and is resolved relative to the working directory.
- Scheduled for deletion in phase 4.
