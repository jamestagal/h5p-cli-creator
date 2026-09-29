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
- **Installing the pinned browser is blocked** (retried 28 Sep 22:48 UTC with the same result): `pnpm exec playwright install chromium-headless-shell` failed five times with `Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'` for `https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`; nothing was written to `/opt/pw-browsers` (`logs/playwright-install-default-path.log`). The host must be allowed in the environment's network settings before the declared environment can be qualified here. *Update 29 Sep:* with full network access the pinned browser installs and the smoke suite passes (see the last entry below).
- **Diagnostic only, not qualification:** pointed at the preinstalled, older `chromium_headless_shell-1194` through an uncommitted override, all 10 smoke tests pass; with the full Chromium 1194 binary, 6 fail on a console `404` (not investigated). This shows the tests can run in principle. It does not qualify the declared Playwright environment, and the override is not adopted.
- **Baseline at `c078580`, apart from the golden:** `pnpm -r build`, `typecheck` and `lint` exit 0; shared 5, generator 20 and cli 9 test files pass; cli-legacy 68 suites pass (17 tests skipped by their own markers).

## Readiness verdict

- **Accepted by the owner for Task 1's named checks only** (generator and cli tests, typecheck, lint). This is not general environment readiness.
- **Blocking Task 2, Task 3 and Checkpoint A:**
  - the engine golden: **resolved.** The correction in `9f36c5e` is approved after the owner's 51-of-51 run on the recorded runtime. On every runtime it adds a portable uncompressed-content golden, structural ZIP-metadata assertions and a level-6 compression check; the compressed-bytes golden, unchanged, runs only on its recorded runtime. The repeated-build and cross-timezone byte-equality tests are unchanged.
  - browser qualification: **resolved on 29 Sep** (see the "full network access" entry below). The pinned `chromium_headless_shell-1243` now installs, and all 10 smoke tests pass against it under Node 20.20.2 after `pnpm -r build`. The substitute browser is not adopted and is no longer needed.
  - Task 1 review: the owner's review of `2174e06` asked for two fixes (malformed store versions, suppressed filesystem errors), made in the following commit and awaiting review.

## Task 1, reported separately from baseline readiness

- The baseline at `c078580` lint-passes. Task 1's first verification run was **lint-red** because of two unused variables introduced by Task 1's own new tests (`_dropped` in `packages/generator/test/pipeline.test.ts`, `_v` in `apps/cli/test/review.test.ts`), not because of the baseline.
- They were fixed and Task 1 was committed as `2174e06` after its named checks passed (build, generator 132 tests, cli 33 tests, typecheck, lint). That commit was pushed in response to a stop hook, before the owner's review. It is **not** accepted as Task 1 completion until the owner reviews it.

---

## 2026-09-29: install and player smoke run (cloud container)

A re-run of the three setup steps at `66154d8` on branch `claude/upbeat-wozniak-wb3s61`, starting from a fresh checkout with no `node_modules`. The lockfile is unchanged (sha256 `fdf559da…9598f6022ef`, the same as `c078580`). Nothing in the repository was changed to make any step pass.

### Environment

| Item | Value |
|---|---|
| Node | 20.20.2 (`/opt/node20`, put first on `PATH` to satisfy `engines.node` `>=20.19.0 <21`); the container's default `node` is 22.22.2 |
| pnpm | `packageManager` pins 10.33.2. The installed pnpm is **10.33.0** (`/opt/node22/bin/pnpm`). It tries to download 10.33.2 before every command, and that download fails (see step 1) |
| Playwright | `@playwright/test` `^1.63.0` declared in `packages/engine` but **not installed** (no `node_modules`). A global Playwright **1.56.1** (`/opt/node22/bin/playwright`) is on `PATH`, with `chromium-1194`, `chromium_headless_shell-1194` and `ffmpeg-1011` in `/opt/pw-browsers` |
| OS | Ubuntu 24.04.4 LTS, Linux 6.18.44, `x86_64` |

### Steps

| # | Command | Result | Duration |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` (repo root) | **Fail, exit 1** | 1.7 s |
| 2 | `cd packages/engine && pnpm exec playwright install chromium-headless-shell` | **Fail, exit 1** | < 2 s |
| 3 | `pnpm --filter @leaplearn/engine test:smoke` (repo root) | **Fail, exit 1**. No test ran | < 2 s |

**Step 1.** pnpm fails before installing anything. It first tries to fetch the pinned pnpm 10.33.2 from the npm registry, and the environment's egress policy denies that host:

```
 ERR_PNPM_FETCH_403  GET https://registry.npmjs.org/pnpm: Forbidden - 403
This error happened while installing a direct dependency of /root/.local/share/pnpm/.tools/pnpm/10.33.2_tmp_675_0
 ERROR  Command failed with exit code 1: pnpm add pnpm@10.33.2 --loglevel=error --ignore-scripts ...
```

A direct request shows the reason: `curl https://registry.npmjs.org/zod` returns `403` with header `x-deny-reason: host_not_allowed` and body `Host not in allowlist: registry.npmjs.org. Add this host to your network egress settings to allow access.` The agent proxy reports no relay failures, and `registry.npmjs.org` is on its `NO_PROXY` list, so the denial comes from the egress policy, not from the proxy or from TLS. On 28 Sep the same install succeeded in this kind of environment, so the policy has changed since then.

**Step 2.** The first attempt fails with the same pnpm 10.33.2 self-download error. Without step 1 there is no `node_modules/.bin/playwright`, so the pinned Playwright 1.63 cannot run in any case.

**Step 3.** The first attempt fails with the same self-download error. With the workaround below it gets as far as running the script, then fails with `WARN Local package.json exists, but node_modules missing` and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @leaplearn/engine@0.1.0 test:smoke: playwright test -c test/smoke/playwright.config.ts, Exit status 1`.

### Smoke test summary

0 passed, 0 failed, 0 skipped: **no test ran.** The runner could not start because the dependencies were not installed.

### Workarounds tried (none adopted)

- **Skip pnpm's self-download** (`npm_config_manage_package_manager_versions=false`) and **install offline from the local store** (`pnpm install --frozen-lockfile --offline`). pnpm reads the lockfile (528 packages), then exits 1 with `ERR_PNPM_NO_OFFLINE_TARBALL` for `papaparse-5.7.0.tgz`. The local store (`~/.local/share/pnpm/store`, 2.1 MB) does not hold the dependencies, so an offline install is not possible.
- **Step 2 with the self-download skipped** exits 0, but only because `pnpm exec` found the **global Playwright 1.56.1**. That version's `chromium_headless_shell-1194` is already in `/opt/pw-browsers`, so the command did nothing. It does not install the pinned Playwright 1.63's `chromium_headless_shell-1243`, and it is **not** counted as a pass.
- **Step 3 with the self-download skipped:** exit 1, as described above.

### Change since 28 Sep

- **`cdn.playwright.dev` now appears reachable.** On 28 Sep it returned `403 ... no rule or allowlist entry allows host "cdn.playwright.dev"`. Today a `HEAD` request for the pinned build (`https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`) returns `307`, a redirect rather than a denial. The download itself was not attempted, because Playwright 1.63 could not be installed. Whether the pinned browser now installs is **untested**.
- **`registry.npmjs.org` is now denied** (`host_not_allowed`). On 28 Sep `pnpm install --frozen-lockfile` exited 0 here.

### Open issues and blockers

1. **Blocker:** `registry.npmjs.org` must be allowed in the cloud environment's network settings (Network access: a broader access level, or the host added to the allowed domains). Nothing that needs dependencies can run until it is.
2. **Unverified:** once dependencies install, re-run step 2 to confirm that `chromium_headless_shell-1243` downloads from `cdn.playwright.dev` (and any redirect target), then run step 3.
3. **Minor:** the preinstalled pnpm is 10.33.0 rather than the pinned 10.33.2. That only matters while the registry is blocked, because pnpm otherwise downloads the pinned version itself.

### Verdict (29 Sep)

**Not ready.** The npm registry is blocked by the environment's egress policy, so dependencies cannot be installed and no smoke test can run.

## 2026-09-29 (retry): install and player smoke run after the registry was allowlisted

A fresh cloud container, after the owner added `registry.npmjs.org` to the environment's network allowlist. Source revision `30dca41` (branch `claude/upbeat-wozniak-wb3s61`), lockfile sha256 `fdf559da…9598f6022ef`. Nothing in the repository was changed to run these steps, and the lockfile was not touched.

### Environment

| Item | Value |
|---|---|
| Node | **22.22.2** is the default `node` on `PATH` (`/opt/node22/bin`), outside `engines.node` `>=20.19.0 <21`. Node **20.20.2** is present at `/opt/node20/bin` and was put first on `PATH` for the workaround runs below |
| pnpm | **10.33.2** (`/opt/node22/bin/pnpm`), matching the `packageManager` pin, so no self-download was needed |
| Playwright | `@playwright/test` **1.63.0** (from the lockfile), which wants `chromium_headless_shell-1243` (Chrome Headless Shell 153.0.8010.12). Preinstalled in `/opt/pw-browsers`: `chromium-1194`, `chromium_headless_shell-1194` (Chromium 141.0.7390.37), `ffmpeg-1011` |
| OS | Ubuntu 24.04.4 LTS, Linux 6.18.44, `x86_64` |
| Registry check | `curl -sS -o /dev/null -w "%{http_code}" https://registry.npmjs.org/pnpm` → **200** (was 403 in the earlier attempt) |

### Steps

| # | Command | Result | Duration |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` (repo root) | **Pass, exit 0** | 11 s |
| 2 | `cd packages/engine && pnpm exec playwright install chromium-headless-shell` | **Fail, exit 1** | 6 s |
| 3 | `pnpm --filter @leaplearn/engine test:smoke` (repo root) | **Fail, exit 1**. No test ran | 2 s |

**Step 1.** `Lockfile is up to date, resolution step is skipped`; 529 packages downloaded and added; `Done in 10.4s using pnpm v10.33.2`. Warnings only, none fatal:

- `WARN Unsupported engine: wanted: {"node":">=20.19.0 <21"} (current: {"node":"v22.22.2",...})` for `packages/engine` and `packages/generator`.
- `WARN Failed to create bin at .../node_modules/.bin/h5p-cli-creator. ENOENT ... apps/cli-legacy/dist/index.js` (the legacy CLI is not built yet; harmless for the smoke test).
- `Ignored build scripts: @parcel/watcher@2.6.0, esbuild@0.28.2, h5p-standalone@3.8.2, unrs-resolver@1.12.2` (pnpm 10 default; the smoke test passed without them, see below).
- One slow-tarball warning for `magic-string-0.30.21.tgz` (14 KiB/s).

**Step 2.** Playwright requests `https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`. That host now answers (`307`), but it redirects to `https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip`, and the egress policy denies that host. Playwright retries 4 times, each with:

```
Error: Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "storage.googleapis.com"'. URL: https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip
...
Failed to install browsers
Error: Failed to download Chrome Headless Shell 153.0.8010.12 (playwright chromium-headless-shell v1243), caused by
Error: Download failure, code=1
```

The agent proxy's status (`$HTTPS_PROXY/__agentproxy/status`) lists the same denials as `connect_rejected` for `storage.googleapis.com:443` ("gateway answered 403 to CONNECT"). `registry.npmjs.org` is on the proxy's `NO_PROXY` list, `storage.googleapis.com` is not.

**Step 3.** Fails at test collection, before any browser is needed:

```
Error: Cannot find module '/home/user/h5p-cli-creator/packages/engine/node_modules/@leaplearn/shared/dist/index.js' imported from .../packages/engine/test/smoke/player.spec.ts
Error: No tests found
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @leaplearn/engine@0.1.0 test:smoke: `playwright test -c test/smoke/playwright.config.ts`
```

`@leaplearn/shared` exports only `./dist/index.js`, and a fresh install has no `dist/`. The root `verify` script runs `pnpm -r build` before `test:smoke`, so this is a missing prerequisite in the requested sequence, not an environment fault.

### Diagnosis and workaround runs (recorded separately from the steps above)

Each row adds one change to the previous one. None of them edits a tracked file.

| # | Change | Command | Result |
|---|---|---|---|
| 3a | Build the shared package first | `pnpm --filter @leaplearn/shared build` then step 3, Node 22.22.2 | build exit 0 (2 s); smoke **exit 1**: `Error: request for './Parser.js' is from a module not been linked at .../sanitize-html@2.17.7/.../index.js:1:20`, then `No tests found` |
| 3b | Put Node 20.20.2 first on `PATH` (in the `engines` range) | `PATH=/opt/node20/bin:$PATH pnpm --filter @leaplearn/engine test:smoke` | **exit 1**, 31 s. All 10 tests collected, all 10 fail at launch: `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` |
| 3c | Point Playwright at the preinstalled headless shell | from `packages/engine`, Node 20: `pnpm exec playwright test -c <scratch>/smoke-prebuilt.config.ts` | **exit 0**, 16 s, **10 passed** (13.1 s) |

The scratch config in 3c is a copy of `packages/engine/test/smoke/playwright.config.ts` (same `testMatch`, `timeout` 60 s, `workers: 1`, `headless: true`) with three differences: an absolute `testDir` pointing at `packages/engine/test/smoke`, `outputDir` in the scratch directory, and `use.launchOptions.executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"` (Chromium 141.0.7390.37). It lived outside the repository and was not committed.

The Node 22 failure in 3a matches the 28 Sep note that newer runtimes cannot load the engine through `sanitize-html` (there as `ERR_REQUIRE_ESM` on Node 21), and it is why the engine pins `<21`.

### Smoke test summary

- **Step 3 as requested:** 0 passed, 0 failed, 0 skipped. No test ran (`@leaplearn/shared` not built).
- **Workaround 3b** (shared built, Node 20): 0 passed, **10 failed**, 0 skipped. Every failure is the missing `chromium_headless_shell-1243` executable; no test body ran.
- **Workaround 3c** (shared built, Node 20, preinstalled Chromium 141 headless shell): **10 passed**, 0 failed, 0 skipped:

```
  ✓   1 renders multi-choice without console errors (1.1s)
  ✓   2 renders blanks without console errors (602ms)
  ✓   3 renders flashcards without console errors (332ms)
  ✓   4 renders question-set-nested without console errors (570ms)
  ✓   5 renders interactive-book without console errors (303ms)
  ✓   6 renders interactive-book-nested without console errors (499ms)
  ✓   7 multi-choice: wrong answer scores 0 of 1, then retry and correct answer scores 1 of 1 (802ms)
  ✓   8 blanks: one wrong scores 1 of 2, then retry and both correct scores 2 of 2 (1.3s)
  ✓   9 nested question set: all correct reports 2 of 2 (1.4s)
  ✓  10 nested question set: all wrong reports 0 of 2 (1.4s)
  10 passed (13.1s)
```

The 3c pass shows the engine output renders and scores correctly in a real browser here. It does **not** show that it does so in the pinned browser: Chromium 141 is the build that ships with Playwright 1.56, not the Chrome Headless Shell 153 that Playwright 1.63 expects, so the pinned browser configuration remains untested in this container.

### Open issues and blockers

1. **Blocker (network):** allow **`storage.googleapis.com`** in the cloud environment's network settings. `cdn.playwright.dev` redirects the pinned browser download there. Until it is allowed, step 2 cannot install `chromium_headless_shell-1243`, and step 3 cannot run against the pinned browser.
2. **Environment:** the container's default `node` is 22.22.2, outside `engines.node` `>=20.19.0 <21`, and the smoke suite cannot load the engine under it. `/opt/node20/bin` must be first on `PATH` (for example in the environment's setup script) for these commands to run as written.
3. **Sequence:** `test:smoke` needs the workspace built first (at least `@leaplearn/shared`; the root `verify` script uses `pnpm -r build`). The requested three-step sequence omits that step.
4. **Resolved since the earlier attempt:** `registry.npmjs.org` is reachable, and `pnpm install --frozen-lockfile` succeeds with the pinned pnpm 10.33.2.

### Verdict (29 Sep, retry)

**Not ready.** Dependencies now install, but the pinned Playwright browser cannot be downloaded (`storage.googleapis.com` is blocked), so the smoke suite runs green (10/10) only with a workaround browser, Node 20 on `PATH` and a manual build step.

## 2026-09-29 (full network access): install, pinned browser and player smoke run

A fresh cloud container after the owner switched the environment to **full network access**. Source revision `2015094` (branch `claude/upbeat-wozniak-wb3s61`), no `node_modules` before install, lockfile sha256 `fdf559da…9598f6022ef` (unchanged; `git status` clean after every step). No tracked file was changed to run these steps.

### Network check

| Request | HTTP status | Meaning |
|---|---|---|
| `https://registry.npmjs.org/pnpm` | 200 | reachable |
| `https://storage.googleapis.com/` (`HEAD`) | 400 | reachable (a bucket-less request, not a denial) |
| `https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip` (`HEAD`) | 307 | reachable, redirects to Google Storage |
| `https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip` (`HEAD`) | 200 | reachable (was `403 request blocked` in the previous attempt) |

No host was blocked in this run.

### Environment

| Item | Value |
|---|---|
| Node | Default `node` on `PATH` is still **22.22.2** (`/opt/node22/bin`), outside `engines.node` `>=20.19.0 <21`. Taking the previous entry into account, every step below was run with **`/opt/node20/bin` first on `PATH`** (Node **20.20.2**) |
| pnpm | **10.33.2** (`/opt/node22/bin/pnpm`), matching the `packageManager` pin; no self-download |
| Playwright | `@playwright/test` **1.63.0** (`pnpm exec playwright --version`), browser `chromium_headless_shell-1243` (Chrome Headless Shell 153.0.8010.12) |
| OS | Ubuntu 24.04.4 LTS, Linux 6.18.44, `x86_64` |

### Steps

| # | Command (Node 20.20.2 first on `PATH`) | Result | Duration |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` (repo root) | **Pass, exit 0** | 6.1 s |
| 2 | `cd packages/engine && pnpm exec playwright install chromium-headless-shell` | **Pass, exit 0** | 6.8 s |
| 3 | `pnpm --filter @leaplearn/engine test:smoke` (repo root) | **Fail, exit 1**. No test ran | 2.1 s |
| 3′ | `pnpm -r build`, then step 3 again unchanged | build exit 0 (11.0 s); smoke **Pass, exit 0**, **10 passed** | 14.4 s |

**Step 1.** `Lockfile is up to date, resolution step is skipped`, `Packages: +528`, `Done in 4.5s using pnpm v10.33.2`. With Node 20 on `PATH` the `Unsupported engine` warnings from the previous entry are gone. Remaining warnings, none fatal: `Failed to create bin at .../node_modules/.bin/h5p-cli-creator. ENOENT ... apps/cli-legacy/dist/index.js` (legacy CLI not built yet) and `Ignored build scripts: @parcel/watcher@2.6.0, esbuild@0.28.2, ...` (pnpm 10 default).

**Step 2.**

```
Downloading Chrome Headless Shell 153.0.8010.12 (playwright chromium-headless-shell v1243) from https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip
Chrome Headless Shell 153.0.8010.12 (playwright chromium-headless-shell v1243) downloaded to /opt/pw-browsers/chromium_headless_shell-1243
```

**Step 3.** Fails at test collection for the reason already recorded in the previous entry: the workspace is not built, and `@leaplearn/shared` exports only `./dist/index.js`.

```
Error: Cannot find module '/home/user/h5p-cli-creator/packages/engine/node_modules/@leaplearn/shared/dist/index.js' imported from .../packages/engine/test/smoke/player.spec.ts
Error: No tests found
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @leaplearn/engine@0.1.0 test:smoke: `playwright test -c test/smoke/playwright.config.ts`
```

**Step 3′ (workaround, recorded next to the failure above).** Run the build step that the root `verify` script runs before `test:smoke` (`pnpm -r build`, exit 0), then step 3 exactly as written. The committed Playwright config and the pinned browser are used; no override.

```
Running 10 tests using 1 worker
  ✓   1 test/smoke/player.spec.ts:68:3 › renders multi-choice without console errors (377ms)
  ✓   2 test/smoke/player.spec.ts:68:3 › renders blanks without console errors (299ms)
  ✓   3 test/smoke/player.spec.ts:68:3 › renders flashcards without console errors (267ms)
  ✓   4 test/smoke/player.spec.ts:68:3 › renders question-set-nested without console errors (322ms)
  ✓   5 test/smoke/player.spec.ts:68:3 › renders interactive-book without console errors (366ms)
  ✓   6 test/smoke/player.spec.ts:68:3 › renders interactive-book-nested without console errors (333ms)
  ✓   7 test/smoke/player.spec.ts:92:1 › multi-choice: wrong answer scores 0 of 1, then retry and correct answer scores 1 of 1 (758ms)
  ✓   8 test/smoke/player.spec.ts:105:1 › blanks: one wrong scores 1 of 2, then retry and both correct scores 2 of 2 (1.1s)
  ✓   9 test/smoke/player.spec.ts:129:1 › nested question set: all correct reports 2 of 2 (1.3s)
  ✓  10 test/smoke/player.spec.ts:135:1 › nested question set: all wrong reports 0 of 2 (1.4s)
  10 passed (12.5s)
```

**Check under the default runtime.** With the workspace built, `pnpm --filter @leaplearn/engine test:smoke` under the default Node 22.22.2 still exits 1 at collection: `Error: request for './Parser.js' is from a module not been linked` (from `sanitize-html`), then `No tests found`. Unchanged from the previous entry.

### Smoke test summary

- **Step 3 as written, fresh install:** 0 passed, 0 failed, 0 skipped. No test ran (`@leaplearn/shared` not built).
- **Step 3′ after `pnpm -r build`, Node 20.20.2, pinned Chrome Headless Shell 153 (`chromium_headless_shell-1243`):** **10 passed, 0 failed, 0 skipped.** This is the first run in this container against the declared browser, with no substitute browser and no config override.

### Workarounds and open issues

1. **Resolved:** `storage.googleapis.com` (the redirect target of `cdn.playwright.dev`) is reachable; the pinned browser installs. No host is blocked.
2. **Workaround in use, environment:** the container's default `node` is 22.22.2, which cannot load the engine. `/opt/node20/bin` was put first on `PATH` for every step. To make this permanent, set it in the environment's setup script (for example `export PATH=/opt/node20/bin:$PATH`).
3. **Workaround in use, sequence:** `test:smoke` needs `pnpm -r build` first (as `verify` already does). The three-step sequence should include it, or be replaced by the relevant part of `pnpm verify`.
4. **Not repeated here:** golden-hash, typecheck, lint and unit suites were outside this run's scope.

### Verdict (29 Sep, full network access)

**Ready** for the player smoke suite: with full network access the pinned browser installs and all 10 smoke tests pass against it, given two recorded, non-network prerequisites (Node 20 first on `PATH`, `pnpm -r build` before `test:smoke`).
