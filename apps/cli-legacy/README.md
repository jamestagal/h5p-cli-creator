# cli-legacy (frozen)

The h5p-cli-creator code as of phase 0, retained as the compatibility path for existing manual,
`ai-*`, YouTube story and bilingual narrated audio-book workflows (design §2.1a and §6.2). Rules:

- No refactoring and no new features here. Bug fixes only, with a test.
- `tests/integration/multi-language-ai.test.ts` is the bilingual compatibility fixture and must
  keep passing.
- Run from this directory (`pnpm --filter cli-legacy <script>`); the library cache is
  `./content-type-cache` and is resolved relative to the working directory.
- **Do not delete this folder.** Owner decision, 19 Sep 2026: phase completion, replacement
  producers and passing parity tests do not authorize removal. Any future deletion requires a
  separate explicit instruction from Benjamin.
- The manual `flashcards` command has a replacement in `apps/cli` (`leap flashcards`). The legacy
  command remains installed as `h5p-cli-creator` (this package's `bin`).

## Narrated audio books are a distinct composition mode

Keep the existing source-video introduction and transcript, ordered story pages, page-matched audio,
configured images/alt text, original text and optional translations working. This workflow is
distinct from a book collecting generated quiz activities; supporting one does not replace the other.
Keep `interactivebook-ai`, `youtube-extract`, `youtube-extract-transcript` and
`youtube-validate-transcript`, with their configurations, examples and regression tests.

Before switching this workflow to a new implementation, demonstrate page, media, timing and
language parity under the [narrated audio-book preservation contract](../../docs/superpowers/specs/2026-09-18-generator-service-design.md#62-narrated-audio-book-preservation).
Passing that gate permits considering the replacement; it does not permit deleting this folder.
