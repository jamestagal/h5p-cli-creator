# Evidence for `docs/testing/phase-3-environment-readiness.md`

Saved so the comparisons stay inspectable after the cloud container is gone. `SHA256SUMS` covers every
file here. Nothing in this directory comes from real course material; the package is the engine's own
synthetic `flashcards@1` fixture.

| Path | What it is |
|---|---|
| `linux-x64-node20-c078580/` | `diagnose-package.mjs` run at `c078580` under Node 20.20.2: the `.h5p`, `diagnosis.json` (runtime, hashes, every ZIP header field per entry), `SHA256SUMS` |
| `linux-x64-node22-c078580/` | the same under Node 22.22.2 |
| `linux-x64-node20-cafb3c5/` | the same at `cafb3c5` (the golden's recording commit), with the type-only devDependency of `logs/cafb3c5-type-dependency.log` |
| `logs/fresh-install-*.log`, `logs/shared-build-*.log` | fresh `pnpm install --frozen-lockfile` and the `@leaplearn/shared` build per revision |
| `logs/golden-test-*.log` | the unchanged golden test at `c078580` and `cafb3c5` |
| `logs/timezones-c078580.log` | the diagnostic under four `TZ` values |
| `logs/redeflate-zlib-builds.log` | each entry's uncompressed bytes re-deflated under three zlib builds (`tools/redeflate.mjs`) |
| `logs/compare-*.log` | `compare-diagnoses.mjs` output |
| `logs/playwright-install-default-path.log` | the pinned browser install attempt (blocked by the network policy) |
| `logs/smoke-pinned-browser-missing.log` | `test:smoke` as declared: the pinned browser is absent |
| `logs/smoke-DIAGNOSTIC-*.log` | diagnostic runs against a substitute browser through an uncommitted override. They do **not** qualify the declared Playwright environment |
| `logs/baseline-tests-*.log` | `pnpm -r --no-bail test` in the main checkout at the start of the pilot |
| `tools/` | the one-off scripts that produced the aggregate hashes and the re-deflate log |

The owner-machine results quoted in the readiness record (macOS arm64) were reported by the owner, not
captured here; no artifact from that machine is stored yet.
