# Phase-3 environment readiness pilot (cloud container, 28 Sep 2026)

A bounded check of whether this environment can run the phase-3 offline tasks, done before Task 1 was
committed. It records what was compared and keeps demonstrated facts apart from hypotheses. The engine's
golden hash (`packages/engine/test/fixtures/golden-hashes.json`) is **unchanged**, and nothing here
re-records it.

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

## Demonstrated

1. The mismatch reproduces **at the golden's own recording commit** in this environment. So the code changes between `cafb3c5` and `c078580` (27 files) are not what makes the golden fail here: both revisions produce the same bytes.
2. The build is deterministic here: identical bytes across two Node versions and across repeated runs.
3. **Timezone does not change the bytes:** `TZ` = UTC, Australia/Brisbane, Australia/Sydney and America/Los_Angeles give the same package hash.
4. **The zlib build does not change the compressed streams on this machine:** re-deflating each entry's uncompressed bytes at level 6 gives streams byte-identical to the package's for all 91 entries, under zlib `1.3.1-e00f703` (Node 20 and 22) and zlib `1.3.0.1-motley-40e35a7` (Node 21).
5. All golden inputs were committed at `cafb3c5`: the 17-file library cache, the fixture spec and `card.jpg`. None of them changed afterwards. No `.gitattributes` applies to them.

## Not established (hypotheses)

- **Why the recording environment produced `071bcec…`.** Its uncompressed content hash was never recorded, so it cannot be said whether the difference lies in compressed streams, in the uncompressed content, or in zip metadata. Candidate explanations, none tested: CPU architecture or CPU-feature-dependent deflate paths (point 4 tested only zlib *version*, on one architecture); a different Node or zlib build on the recording machine; a working tree that differed from the commit when the hash was recorded.
- It is therefore **not** claimed that the mismatch is caused by architecture, or that it is unrelated to code in the recording environment.

## The discriminating comparison still needed

On the machine that recorded the golden, at `c078580`, run from `packages/engine` after `pnpm -r build`:

```bash
node --input-type=module -e '
import { resolve } from "node:path"; import { createHash } from "node:crypto"; import { readFileSync, createReadStream, statSync } from "node:fs";
import JSZip from "jszip"; import { ActivitySpec } from "@leaplearn/shared"; import { compileToBuffer, createRegistry } from "./dist/index.js";
const root = resolve("../.."); const fx = resolve("test/fixtures");
const registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
const p = resolve(fx, "assets/card.jpg");
const card = { assetId: "card", sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType: "image/jpeg", open: () => createReadStream(p) };
const buf = await compileToBuffer(ActivitySpec.parse(JSON.parse(readFileSync(resolve(fx, "specs/flashcards.json"), "utf8"))), new Map([["card", card]]), { registry, revision: 1 });
const zip = await JSZip.loadAsync(buf); const lines = [];
for (const n of Object.keys(zip.files).sort()) lines.push(n + " " + createHash("sha256").update(await zip.files[n].async("nodebuffer")).digest("hex"));
console.log(JSON.stringify({ node: process.versions.node, zlib: process.versions.zlib, arch: process.arch, platform: process.platform, package: createHash("sha256").update(buf).digest("hex"), content: createHash("sha256").update(lines.join("\n")).digest("hex"), entries: lines.length }));'
```

- If `content` is `eafdf494…11bc85b` and `package` is `071bcec…`, the uncompressed content matches and the difference is in compression or zip metadata between the two runtimes.
- If `content` differs, the two environments compile different content, and that is a code or input question, not a runtime one.
- If `package` is not `071bcec…`, the golden was not produced from the committed state on that machine either.

## Other environment findings

- **Player smoke tests:** `@playwright/test` 1.63 expects `chromium_headless_shell-1243`, which is not installed here. Pointed at the preinstalled `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` through an uncommitted local config, all 10 pass. With the full Chromium binary, 6 fail on a console `404` that the headless shell does not produce (not investigated further).
- **Baseline at `c078580`, apart from the golden:** `pnpm -r build`, `typecheck` and `lint` exit 0; shared 5, generator 20 and cli 9 test files pass; cli-legacy 68 suites pass (17 tests skipped by their own markers).

## Readiness verdict

- **Ready** for Task 1's named verification (generator and cli tests, typecheck, lint). None of it depends on the golden or the browser.
- **Blocked** for any verification that runs `pnpm verify` or the engine suite: Task 2 (`pnpm --filter @leaplearn/engine test`), Task 3 and Checkpoint A. In this environment the golden fails, and `test:smoke` fails without the local browser override. Resolving it needs the owner's decision on the golden's guarantee, informed by the comparison above, and on how smoke tests find a browser in environments that do not have Playwright's pinned build.
