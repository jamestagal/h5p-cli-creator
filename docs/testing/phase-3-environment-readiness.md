# Phase-3 environment readiness pilot (cloud container, 28 Sep 2026)

A bounded check of whether this environment can run the phase-3 offline tasks, started before Task 1 was
committed and revised on 28 Sep after the owner's review and the owner-machine comparison. It records what was compared and keeps demonstrated facts apart from hypotheses. The engine's
golden hash (`packages/engine/test/fixtures/golden-hashes.json`) is **unchanged**, and nothing here
re-records it.

**Evidence:** every log and generated package cited here is saved, with checksums, in
[`artifacts/2026-09-28-env-readiness/`](artifacts/2026-09-28-env-readiness/README.md) (`SHA256SUMS` covers each file).

## Environment

| Item | Value |
|---|---|
| Source revisions | `0682f46` (`main`, phase 2 approved); `c078580` (branch head after the dependency repair); `cafb3c5` (the commit that recorded the golden) |
| Lockfile sha256 | `0682f46`: `ffef1f3b…4f526911a`; `c078580`: `fdf559da…9598f6022ef` (adds only `@types/node` 20.19.43 under `packages/shared`) |
| Install command | `pnpm install --frozen-lockfile` in a fresh `git worktree` per revision (no `node_modules` before install) |
| Node | 20.20.2, zlib `1.3.1-e00f703` (inside `engines.node` `>=20.19.0 <21`) |
| Package manager | pnpm 10.33.2 (the `packageManager` pin), run by Node 20.20.2 |
| Platform | Linux 6.18.44, Ubuntu 24.04.4 LTS, `x86_64` (`process.arch` `x64`), `TZ` unset (UTC), `LANG` unset |
| Diagnostic runtimes | Node 22.22.2 (zlib `1.3.1-e00f703`); Node 21.7.3 (zlib `1.3.0.1-motley-40e35a7`), used only to deflate buffers, because it cannot load the engine (`ERR_REQUIRE_ESM` from `sanitize-html`) |

## Dependency repair (`c078580`)

`packages/shared/src/assets.ts` has contained `import type { Readable } from "node:stream"` since `edc2e32`, but the package did not declare `@types/node`.

| Fresh install at | `pnpm install --frozen-lockfile` | `pnpm --filter @leaplearn/shared build` |
|---|---|---|
| `0682f46` | exit 0 | **exit 2**: `src/assets.ts(1,31): error TS2307: Cannot find module 'node:stream'` |
| `c078580` | exit 0 | exit 0 |

**Demonstrated:** a clean install of `main` cannot build `@leaplearn/shared`; the one-line devDependency fixes it. **Hypothesis, untested:** the owner's machine builds because a copy of `@types/node` is reachable there from an earlier install.

## Golden hash: what was compared

The golden test compiles the `flashcards@1` fixture with `compileToBuffer` and compares the **sha256 of the compressed package bytes** with the committed value. Its guarantee, as recorded in `cafb3c5` and design §3 ("Determinism, qualified"): identical spec, asset manifest, engine version, lockfile **and Node/zlib runtime** give identical bytes, and "a committed golden hash detects a runtime change". The commit pinned only the `engines.node` range. It did not record the Node patch version, the zlib build, the platform or the architecture it was produced on.

| Build | Package sha256 (compressed) | Content sha256 (sorted `name + sha256(uncompressed bytes)`, 91 entries) |
|---|---|---|
| Committed golden | `071bceccffd5869068a717a726835c69f7bf3aa6b1751c723be847a0a328f55a` | not recorded |
| `c078580` here, Node 20.20.2 | `5be1d3918b8eaaedaeb5538ea54bb304484aed7f605a39ac02706421071e3eb1` | `eafdf494d6ade7525d7fa3a32059a707d71a7ba9cb16a7733c6b39dac11bc85b` |
| `c078580` here, Node 22.22.2 | `5be1d391…071e3eb1` | `eafdf494…11bc85b` |
| `cafb3c5` here, Node 20.20.2 (the recording commit, with the same type-only devDependency added so it builds) | `5be1d391…071e3eb1` | `eafdf494…11bc85b` |

Package structure here: all 91 entries deflated (level 6, yazl's default), 634,665 compressed bytes from 1,249,871; every entry has host system 3, mode `0o100644` and DOS time 2000-01-01 00:00:00.

## Owner-machine result (reported by the owner, 28 Sep)

The comparison below was run on the machine that recorded the golden, at `c078580`, and reported as aggregate hashes; no artifact from that machine is stored yet.

| Machine | Runtime | Package sha256 (compressed) | Content sha256 (uncompressed) |
|---|---|---|---|
| Owner | Node 20.20.1, zlib 1.2.12, macOS (`darwin`), `arm64` | `071bceccffd5869068a717a726835c69f7bf3aa6b1751c723be847a0a328f55a` (equals the golden) | `eafdf494d6ade7525d7fa3a32059a707d71a7ba9cb16a7733c6b39dac11bc85b` |
| This container | Node 20.20.2, zlib 1.3.1-e00f703, Linux, `x64` | `5be1d3918b8eaaedaeb5538ea54bb304484aed7f605a39ac02706421071e3eb1` | `eafdf494d6ade7525d7fa3a32059a707d71a7ba9cb16a7733c6b39dac11bc85b` |

**What that shows, taking the reported hashes as given:** both machines compile the same uncompressed content for all 91 entries, and the owner's machine still reproduces the golden today. The compressed packages differ, so the difference lies in the compressed streams or in ZIP metadata, or both. Which of those, and which runtime property causes it (zlib version, architecture, platform or Node build), is **not** established: the two runtimes differ in all four at once, and the aggregate hashes do not separate compressed streams from metadata. The per-entry diagnostic below does.

### Owner-machine diagnostic and suite run (reported by the owner, 29 Sep)

The owner ran `diagnose-package.mjs` and the corrected engine suite at `febbc08` on the macOS arm64 machine. The report is at a path on that machine (`/tmp/leap-mac-readiness-2026-09-29/diagnosis.json`) and is not stored in this repository.

- **Engine suite:** 51 of 51 passed, none skipped. That includes the compressed-bytes golden on its recorded runtime, the ZIP-metadata assertions and the level-6 compression check.
- **Diagnostic compared with this container's:** all 91 compressed streams differ. Uncompressed content, entry order and the fixed metadata match. Size-dependent fields (compressed sizes, local-header and central-directory offsets) differ accordingly.
- **What this settles:** the golden mismatch is in the deflate output alone. Which runtime property produces the different deflate output is still not isolated, because zlib version, architecture, platform and Node build all differ between the two machines.
- **Decision:** the golden-test correction (`9f36c5e`) is approved. Skipping only the runtime-specific compressed golden elsewhere is accepted.

## Demonstrated in this container

1. The mismatch reproduces **at the golden's own recording commit** in this environment. So the code changes between `cafb3c5` and `c078580` (27 files) are not what makes the golden fail here: both revisions produce the same bytes.
2. The build is deterministic here: identical bytes across two Node versions and across repeated runs.
3. **Timezone does not change the bytes:** `TZ` = UTC, Australia/Brisbane, Australia/Sydney and America/Los_Angeles give the same package hash.
4. **The zlib build does not change the compressed streams on this machine:** re-deflating each entry's uncompressed bytes at level 6 gives streams byte-identical to the package's for all 91 entries, under zlib `1.3.1-e00f703` (Node 20 and 22) and zlib `1.3.0.1-motley-40e35a7` (Node 21).
5. All golden inputs were committed at `cafb3c5`: the 17-file library cache, the fixture spec and `card.jpg`. None of them changed afterwards. No `.gitattributes` applies to them.

## Not established (hypotheses)

- **Which runtime property changes the compressed bytes.** The owner's result narrows the difference to compressed streams or ZIP metadata (see above), but the candidate properties (zlib 1.2.12 vs 1.3.1, `arm64` vs `x64`, macOS vs Linux, Node 20.20.1 vs 20.20.2) all differ at once. Point 4 tested zlib versions on one architecture only; it does not show that zlib is irrelevant on another architecture.
- It is therefore **not** claimed that the mismatch is caused by architecture or by zlib specifically.

## The next owner-machine diagnostic

`docs/testing/diagnostics/diagnose-package.mjs` saves the actual `.h5p`, a hash of every entry's uncompressed and compressed bytes, and every ZIP header field (central directory, local header, data descriptor), with a `SHA256SUMS`. `compare-diagnoses.mjs` compares two such reports field by field and says only which fields differ, in which entries.

On the owner's machine, at `c078580`, after `pnpm install --frozen-lockfile && pnpm -r build`:

```bash
node docs/testing/diagnostics/diagnose-package.mjs --out ~/leap-diagnostics/darwin-arm64-c078580
# if an original golden package from 19 Sep still exists, examine it as it is, without compiling:
node docs/testing/diagnostics/diagnose-package.mjs --from <original-golden.h5p> --out ~/leap-diagnostics/original-golden
node docs/testing/diagnostics/compare-diagnoses.mjs docs/testing/artifacts/2026-09-28-env-readiness/linux-x64-node20-c078580/diagnosis.json ~/leap-diagnostics/darwin-arm64-c078580/diagnosis.json
```

How to read the result, without over-reading it:

- **Only `compressedSha256`, compressed sizes and the related header fields differ, and the uncompressed hashes and CRCs match:** the difference lies in the deflate output. That identifies the layer, not the runtime property that causes it.
- **Other header fields differ** (flags, versions, attributes, times, extra fields): the difference is at least partly ZIP metadata written differently by the two runtimes or builds.
- **Uncompressed hashes differ:** the two machines compiled different content. This does not by itself exclude runtime-dependent behaviour, because the engine or a dependency could produce different content under different runtimes. It would open a content investigation, not decide one.
- **An original 19 Sep package, examined with `--from`, differing from today's owner-machine build:** the owner's environment or the inputs have changed since the recording. It would not show that the golden was never produced from the committed state.
- **Today's owner-machine build not reproducing `071bcec…`:** that would not prove the golden was never produced there, because the environment may have changed since 19 Sep.

Copying `~/leap-diagnostics/` back (it contains only the synthetic fixture package and its report) lets both reports be kept side by side with checksums.

## Other environment findings

- **Player smoke tests, declared environment:** `@playwright/test` 1.63 expects `chromium_headless_shell-1243`, which is not installed here, so `test:smoke` fails before any test runs (`logs/smoke-pinned-browser-missing.log`).
- **Installing the pinned browser is blocked** (retried 28 Sep 22:48 UTC with the same result): `pnpm exec playwright install chromium-headless-shell` failed five times with `Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'` for `https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`; nothing was written to `/opt/pw-browsers` (`logs/playwright-install-default-path.log`). The host must be allowed in the environment's network settings before the declared environment can be qualified here.
- **Diagnostic only, not qualification:** pointed at the preinstalled, older `chromium_headless_shell-1194` through an uncommitted override, all 10 smoke tests pass; with the full Chromium 1194 binary, 6 fail on a console `404` (not investigated). This shows the tests can run in principle. It does not qualify the declared Playwright environment, and the override is not adopted.
- **Baseline at `c078580`, apart from the golden:** `pnpm -r build`, `typecheck` and `lint` exit 0; shared 5, generator 20 and cli 9 test files pass; cli-legacy 68 suites pass (17 tests skipped by their own markers).

## Readiness verdict

- **Accepted by the owner for Task 1's named checks only** (generator and cli tests, typecheck, lint). This is not general environment readiness.
- **Blocking Task 2, Task 3 and Checkpoint A:**
  - the engine golden: **resolved.** The correction in `9f36c5e` is approved after the owner's 51-of-51 run on the recorded runtime. On every runtime it adds a portable uncompressed-content golden, structural ZIP-metadata assertions and a level-6 compression check; the compressed-bytes golden, unchanged, runs only on its recorded runtime. The repeated-build and cross-timezone byte-equality tests are unchanged.
  - browser qualification (**unresolved**): the pinned browser cannot be installed until `cdn.playwright.dev` is allowed in the cloud environment's network settings. The substitute browser is not adopted.
  - Task 1 review: the owner's review of `2174e06` asked for two fixes (malformed store versions, suppressed filesystem errors), made in the following commit and awaiting review.

## Task 1, reported separately from baseline readiness

- The baseline at `c078580` lint-passes. Task 1's first verification run was **lint-red** because of two unused variables introduced by Task 1's own new tests (`_dropped` in `packages/generator/test/pipeline.test.ts`, `_v` in `apps/cli/test/review.test.ts`), not because of the baseline.
- They were fixed and Task 1 was committed as `2174e06` after its named checks passed (build, generator 132 tests, cli 33 tests, typecheck, lint). That commit was pushed in response to a stop hook, before the owner's review. It is **not** accepted as Task 1 completion until the owner reviews it.
