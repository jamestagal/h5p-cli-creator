# Spike result: preview sandbox (phase-1 Task 14)

**Question (spec §7):** can an iframe with `sandbox="allow-scripts"` alone (opaque origin) run
`h5p-standalone` loading a package from a separate, cookie-less preview origin under scoped,
expiring, revision-bound tokens? If not, `allow-scripts allow-same-origin` on the cookie-less
separate origin is the accepted fallback.

**Answer: no.** `allow-scripts` alone cannot run `h5p-standalone` at all, regardless of token
placement — the failure is structural (the library cannot reach its own nested iframe), not a
token problem. `allow-scripts allow-same-origin` on the separate, cookie-less origin is the
arrangement that works, and it only works end-to-end (package JSON, library JS/CSS, and media)
when the token rides as a **path segment**, not a query parameter.

## Setup

- `h5p-standalone` version: **3.8.2**
- Chromium version (`browser.version()`): **153.0.8010.12**
- App origin (opaque host, origin A): `http://127.0.0.1:4401`
- Preview origin (origin B, cookie-less): `http://localhost:4402`
- Golden packages: `multi-choice` (no media) and `flashcards` (one image,
  `content/images/fc-1-c2.jpg`, from asset `card` → `packages/engine/test/fixtures/assets/card.jpg`)
- Four variants, each an iframe on the app page pointed at the preview origin:
  - **A**: `sandbox="allow-scripts"`, package `multi-choice` (no media)
  - **B**: `sandbox="allow-scripts allow-same-origin"`, package `multi-choice` (no media)
  - **C**: `sandbox="allow-scripts"`, package `flashcards` (with media)
  - **D**: `sandbox="allow-scripts allow-same-origin"`, package `flashcards` (with media)
- Both token placements were run against the same extracted packages:
  - **Query**: `?t=<token>`, delivered via a `fetch` wrapper on the preview page that appends `?t=`
    to same-origin requests under `/p/`.
  - **Path segment**: `/p/<rev>/<token>/<pkg>/…`, with the preview server verifying the token as
    the path segment immediately after the revision.
- Tool: `tools/preview-spike/run.ts`, driven by Playwright (`chromium.launch()`), reproduced twice
  with byte-identical output (`pnpm --filter @leaplearn/preview-spike start` run back to back and
  diffed).

## Query token placement (`?t=`)

| variant | sandbox | package JSON | library JS+CSS | media | ready | nested iframe present | content visible | console errors |
|---|---|---|---|---|---|---|---|---|
| a | `allow-scripts` | 2 req, status 200, token yes | n/a | n/a | true | true | false | uncaught: Script error. |
| b | `allow-scripts allow-same-origin` | 2 req, status 200, token yes | 32 req, status 403, token no | n/a | true | true | false | none |
| c | `allow-scripts` | 2 req, status 200, token yes | n/a | n/a | true | true | false | uncaught: Script error. |
| d | `allow-scripts allow-same-origin` | 2 req, status 200, token yes | 28 req, status 403, token no | n/a | true | true | false | none |

Media (image) request evidence (variants C and D):

| variant | image request status | token present |
|---|---|---|
| c | no request observed | n/a |
| d | no request observed | n/a |

`c` never issues an image request because its library JS never loads in the first place
(opaque-origin failure below). `d`'s library JS/CSS all 403 (the `fetch` wrapper cannot see the
`<script>`/`<link>` tag requests h5p-standalone issues), so `H5P.Flashcards`'s constructor is
never registered and it never reaches the point of requesting the image either.

Rejections (query-placement server):

| check | status | body |
|---|---|---|
| expired token | 403 | expired |
| wrong-revision token | 403 | wrong-revision |
| missing token | 403 | missing |

Raw console/page errors, deduplicated with counts:

```
Cannot read properties of null (reading 'open') (x2)
Cannot read properties of undefined (reading 'on') (x2)
Failed to load resource: the server responded with a status of 403 (Forbidden) (x60)
Unable to find constructor for: H5P.Flashcards 1.5
Unable to find constructor for: H5P.MultiChoice 1.16
```

The 60 "403 (Forbidden)" lines and the two "Unable to find constructor" lines come from variants
**b** and **d** (32 + 28 library file requests, none carrying the query token). The two
"Cannot read properties of null (reading 'open')" and two "reading 'on'" lines come from variants
**a** and **c** — see the opaque-origin finding below, which is placement-independent.

## Path-segment token placement (`/p/<rev>/<token>/…`)

| variant | sandbox | package JSON | library JS+CSS | media | ready | nested iframe present | content visible | console errors |
|---|---|---|---|---|---|---|---|---|
| a | `allow-scripts` | 2 req, status 200, token yes | n/a | n/a | true | true | false | uncaught: Script error. |
| b | `allow-scripts allow-same-origin` | 2 req, status 200, token yes | 32 req, status 200, token yes | n/a | true | true | true | none |
| c | `allow-scripts` | 2 req, status 200, token yes | n/a | n/a | true | true | false | uncaught: Script error. |
| d | `allow-scripts allow-same-origin` | 2 req, status 200, token yes | 28 req, status 200, token yes | 1 req, status 200, token yes | true | true | true | none |

Media (image) request evidence (variants C and D):

| variant | image request status | token present |
|---|---|---|
| c | no request observed | n/a |
| d | 200 | true |

This is the direct evidence for the media finding: with the token baked into the path that
`h5pJsonPath` is built from, `d`'s `<img>`-tag request for `content/images/fc-1-c2.jpg` succeeds
with the token present, and `.h5p-content` becomes visible. `c` still never requests the image,
for the same opaque-origin reason as above (its library JS never runs, placement-independent).

Rejections (path-placement server):

| check | status | body |
|---|---|---|
| expired token | 403 | expired |
| wrong-revision token | 403 | wrong-revision |
| missing token | 403 | missing |

Raw console/page errors, deduplicated with counts:

```
Cannot read properties of null (reading 'open') (x2)
```

Only the opaque-origin failure remains (variants **a** and **c**); **b** and **d** log nothing.

## Nested iframe under `allow-scripts` alone

`h5p-standalone` always creates its nested content iframe (`iframe.h5p-iframe`) — it is present in
the DOM for all four variants in both placements (`nested iframe present: true` throughout). Under
`allow-scripts` alone (variants A and C), the *outer* iframe has an opaque origin, and the nested
`iframe.h5p-iframe` that h5p-standalone creates programmatically gets **its own, different**
opaque origin (sandboxed browsing contexts without `allow-same-origin` each get a fresh opaque
origin, so a parent frame and the child frame it creates are not "same-origin" to each other even
though both are opaque). The outer frame's script can no longer reach into the nested iframe's
`document` to write the H5P frame markup and load libraries — this is exactly the `Cannot read
properties of null (reading 'open')` error (the outer script's attempt to call
`nestedIframe.contentWindow.document.open()` fails because `contentWindow`/`contentDocument` is
null across that origin boundary) and the resulting `uncaught: Script error.` (the browser's
standard cross-origin obfuscation of the real exception). As a direct consequence, **zero**
library JS/CSS requests are ever issued for variants A/C — the failure happens before any library
file is requested, and it is identical in both token placements, confirming it is a sandbox
problem, not a token problem.

Under `allow-scripts allow-same-origin` (variants B and D), the outer iframe keeps its real
`http://localhost:4402` origin, and the nested `iframe.h5p-iframe` it creates inherits that same
origin (a sandboxed context's own scripts create same-origin children by default), so the parent
script can freely manipulate the nested frame's document. This is why B/D can load libraries and
render content at all — the sandbox value is a hard precondition, before token placement even
matters.

## Conclusion and recommendation

`allow-scripts` alone cannot run `h5p-standalone`: without `allow-same-origin`, the nested iframe
h5p-standalone creates for the actual H5P content gets its own separate opaque origin that the
outer script cannot reach, so no library ever loads and the content never renders, independent of
how tokens are delivered. The recommended production arrangement is `sandbox="allow-scripts
allow-same-origin"` on the iframe, on a **separate, cookie-less preview origin** (distinct
hostname, e.g. `preview.<host>`, receiving and setting no application cookies), with the
short-lived, revision-bound access token embedded as a **path segment**
(`/p/<org>/<revision>/<token>/<package-path>`) rather than a query parameter — because
`h5p-standalone` loads its own library JS/CSS via `<script>`/`<link>` tags and media via `<img>`
tags, none of which pass through a page-level `fetch` wrapper, so a query-string token never
reaches them (they 403) while a path-embedded token rides along automatically on every
`h5pJsonPath`-relative URL the library derives. CORS should mirror the preview server used here:
`Access-Control-Allow-Origin` echoing the app origin for real-origin requests (never `*`, since the
token must not be readable by other origins), and the preview origin must never issue
`Set-Cookie` and must reject any `Cookie` header it happens to receive as irrelevant to
authorization (only the token is checked).
