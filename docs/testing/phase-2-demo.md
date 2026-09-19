# Phase-2 demo: measured cost of one import

**Run date:** 2026-09-19. **Pricing version:** `2026-09-19` (`packages/generator/src/llm/pricing.ts`).
**Prompt version:** `2026-09-19.2`. **Engine fingerprint:** `engine@0.1.0+lock:<libraries.lock.json hash>`.

This document is the **measured cost** deliverable for phase 2. It records what one import of the
synthetic fixtures cost, how far the budget estimates were from the real usage, and what the run
produced. **It makes no claim about generation quality.** Quality is judged only by the phase-3 human
gate, against a real vocational corpus kept outside this repository.

Two labels that are load-bearing, and mean exactly what they say:

- **The fixtures are synthetic.** `source-electrical-safety.pdf` and `unit-synele001.txt` are
  invented for pipeline tests (see `packages/generator/test/fixtures/synthetic/README.md`). The unit
  is not a training.gov.au unit and the safety text is not authoritative guidance. They exist to
  prove the machinery works, and they stay out of the phase-3 corpus.
- **The single acceptance recorded below is a plumbing check, not the phase-3 quality gate.** It
  exists so the cost-per-accepted-activity measurement is exercised end to end. Nobody judged whether
  the activity is any good.

## Preflight: the pinned model ids are served

Two zero-token `GET /v1/models/{id}` requests before the run, confirming both ids in
`packages/generator/src/llm/models.ts` resolve:

| Model id | Role(s) | HTTP | `max_input_tokens` | `max_tokens` | `structured_outputs` |
|---|---|---|---|---|---|
| `claude-haiku-4-5-20251001` | `parseUnit`, `extract`, `merge`, `align` | 200 | 200,000 | 64,000 | supported |
| `claude-sonnet-5` | `plan`, `produce` | 200 | 1,000,000 | 128,000 | supported |

The capability payloads also confirm the request profiles in `models.ts` are the right shape:
Sonnet 5 reports `thinking.types.adaptive: supported` and `enabled: not supported`, and Haiku 4.5
reports the reverse. Phase 2 sends **no sampling parameter and `thinking: {type: "disabled"}`** to
Sonnet 5, and **`temperature: 0` with no `thinking` field** to Haiku 4.5. Both were accepted: the run
below has no 400.

## The commands

```bash
rm -rf /tmp/leap-demo
node --env-file=.env apps/cli/dist/index.js generate \
  --source packages/generator/test/fixtures/synthetic/source-electrical-safety.pdf \
  --unit packages/generator/test/fixtures/synthetic/unit-synele001.txt \
  --out /tmp/leap-demo --budget-usd 2 \
  --provider record --fixtures packages/generator/test/fixtures/replay/synthetic
# exit=0

node apps/cli/dist/index.js review --out /tmp/leap-demo \
  --activity act-1 --reviewer "$USER" --decision accepted \
  --notes "phase-2 plumbing check, not a quality judgement"
# exit=0
```

`ANTHROPIC_API_KEY` is read from the gitignored root `.env` by `node --env-file`; it is never passed
on a command line, exported, or written to any file. `--provider record` wrote the 13 responses to
`packages/generator/test/fixtures/replay/synthetic/`, which `packages/generator/test/replay.test.ts`
replays offline.

## What the run produced

`exit=0`, import status `ready` — **every planned activity was promoted and none failed.**

| Activity | Type | Status | Package |
|---|---|---|---|
| act-1 … act-5 | `multiChoice` | promoted | `builds/act-{1..5}-r1.h5p` |
| act-6 … act-8 | `blanks` | promoted | `builds/act-{6..8}-r1.h5p` |
| act-9 | `flashcards` | promoted | `builds/act-9-r1.h5p` |

Nine `.h5p` packages, 5 / 3 / 1 by type. `mapping.csv` has 46 rows, every one `suggested` before the
review. The lock was released (`/tmp/leap-demo/lock` absent after the run).

**Alignment:** `PC3.2` ("Complete an incident report for any breach of isolation") is reported as
unsupported — `conceptMap.alignment.unsupportedCriteriaIds == ["PC3.2"]`, which is the fixture's
designed property: nothing in the source supports it. Eight concepts were extracted.

## The cost report, verbatim

Printed by `leap review` after the acceptance (`/tmp/leap-demo/cost.json`):

```
Cost (pricing 2026-09-19): $0.1089 over 13 attempts (known 13, estimated 0, unavailable 0 — excluded from the sums; the ledger's budget spend counts them at their reservation); shared $0.0198, direct $0.0891; retry share 0%; reservations under-estimated on 0 attempt(s) by $0.0000 in total; spend over the import's cap, from the ledger's spent figure (which counts unknown-cost attempts at their reservation): $0.0000
Accepted activities: 1; cost per accepted activity: $0.1089

| purpose | attempts | cost |
|---|---|---|
| parseUnit | 1 | $0.0023 |
| extract | 1 | $0.0050 |
| align | 1 | $0.0026 |
| plan | 1 | $0.0099 |
| produce | 9 | $0.0891 |

| activity | type | status | attempts | cost |
|---|---|---|---|---|
| act-1 | multiChoice | promoted | 1 | $0.0074 |
| act-2 | multiChoice | promoted | 1 | $0.0073 |
| act-3 | multiChoice | promoted | 1 | $0.0093 |
| act-4 | multiChoice | promoted | 1 | $0.0092 |
| act-5 | multiChoice | promoted | 1 | $0.0087 |
| act-6 | blanks | promoted | 1 | $0.0080 |
| act-7 | blanks | promoted | 1 | $0.0078 |
| act-8 | blanks | promoted | 1 | $0.0065 |
| act-9 | flashcards | promoted | 1 | $0.0249 |
```

Cost per type: `multiChoice` $0.0418 over 5, `blanks` $0.0224 over 3, `flashcards` $0.0249 over 1.
Shared work (unit parsing, extraction, alignment, planning) is $0.0198 — 18% of the import; the other
82% is the nine produce calls. There is no `merge` row: the source is one chunk at the default 6,000
token chunk budget, so nothing needed merging.

## Traceability

| Measure | Value |
|---|---|
| Attempts (starts) | 13 |
| Outcomes | 13 |
| `costStatus` values seen | `known` only (13/13) |
| Retries (`retryIndex > 0`) | 0 of 13 — **retry share 0%** |
| Lock left behind | no |

One start and one outcome per attempt, every one with a provider request id, raw usage, pricing
version and a computed cost.

## Budget calibration — this is the point of the exercise

Of the four budget limits, **requests and elapsed time are hard limits** (the request count is exact;
the per-import deadline is checked before every dispatch and every backoff wait and bounds the
adapter's timeout). **Spend and tokens are estimated caps**: each attempt reserves
`ceil(0.5 × characters) + 500` input tokens priced at the 5-minute cache-write rate, plus
`max_tokens` at the output rate, and a dispatch is refused once the reservation would cross the cap.
Because the estimate is not a proven bound, an attempt can exceed its own reservation and push the
import past its cap by that difference — so every outcome records `reservationExceeded` and
`underestimateUsdMicro`, and the report states spend over the cap separately.

What this run measured:

| Calibration measure | Value |
|---|---|
| Attempts whose usage exceeded their reservation (`reservationExceeded`) | **0 of 13** |
| Total reservation underestimate | **0 µUSD** |
| Spend over the import's cap | **0 µUSD** (cap 2,000,000 µUSD; spend 108,899 µUSD) |
| Maximum observed actual/reserved input-token ratio | **0.700** |
| Minimum observed ratio | 0.479 |
| Total reserved vs total actual spend | 298,251 µUSD reserved → 108,899 µUSD actual (**0.365×**) |
| Budget used | 13 requests of 200; 28,190 tokens of 2,000,000; 56,225 ms of 1,800,000 |

**Reading:** the estimate never under-counted. The worst case still left 30% headroom on input
tokens, and the reservation reserved about 2.7× the money actually spent. The 0.5-tokens-per-character
constant is conservative for English prose of this kind; the cost is that a run reserves — and so can
be refused — well before it would really have spent the cap. For this import the effective usable
budget was roughly a third of the nominal one. If that ever binds in practice, the `count_tokens`
endpoint (one extra request per attempt) is the phase-5 route to exact reservations.

Per-attempt detail:

| Purpose | Model | Reserved in | Actual in | Ratio | Reserved µUSD | Actual µUSD |
|---|---|---|---|---|---|---|
| parseUnit | haiku-4-5 | 1,606 | 822 | 0.512 | 22,008 | 2,322 |
| extract | haiku-4-5 | 3,606 | 1,828 | 0.507 | 19,508 | 5,003 |
| align | haiku-4-5 | 3,844 | 1,842 | 0.479 | 14,805 | 2,587 |
| plan | sonnet-5 | 2,178 | 1,495 | 0.686 | 35,445 | 9,890 |
| produce ×9 | sonnet-5 | 1,915–4,643 | 1,238–3,251 | 0.641–0.700 | 19,788–41,608 | 6,514–24,948 |

"Actual in" is `inputTokens + cacheReadTokens + cacheWriteTokens`.

## Cache reads: zero everywhere — a finding, with its cause

**No attempt in this run read from the prompt cache.** `cacheReadTokens` is 0 on all nine produce
calls and on every shared call. This is recorded as a finding, as the task brief requires.

The cause is measurable, and it is not "caching is broken":

| Purpose | input | cache **write** | cache **read** | output |
|---|---|---|---|---|
| parseUnit / extract / align (haiku) | 822 / 1,828 / 1,842 | 0 | 0 | 300 / 635 / 149 |
| plan (sonnet) | 1,495 | 0 | 0 | 690 |
| produce ×9 (sonnet) | 201–360 | 1,035–2,891 | **0** | 298–1,700 |

Every produce call **wrote** to the cache, so its cached prefix did clear Sonnet 5's 1,024-token
minimum — but no call ever read one back. The reason is where the breakpoints fall. The adapter marks
two: the system block, and the `cachedContext` block. For a produce call:

- the **system prompt is identical across all nine calls** but measures only **1,531 characters
  ≈ 438 tokens** — far below Sonnet 5's 1,024-token minimum, so it cannot be cached on its own;
- the **`cachedContext` is that activity's evidence text**, which is different for every activity, so
  the combined system+evidence prefix is above the minimum (hence the writes) but never repeats
  (hence no reads).

The shared Haiku calls show neither write nor read: each is a single call with a prefix below Haiku
4.5's higher 4,096-token minimum.

So this run paid the cache-write premium nine times and collected nothing back. The fix is a
prompt-layout change, not a flag: the stable prefix has to exceed 1,024 tokens on its own before the
per-activity evidence — for example by moving the shared concept map ahead of the per-activity
evidence, or by lengthening the shared system block. That is a phase-3 prompt change to measure, not
a phase-2 correction, and it is recorded here so the phase-3 gate starts from a number rather than an
assumption. Note the run's concurrency (three type lanes at once) means the first three produce calls
would have missed regardless; the layout issue is the one that makes *every* call miss.

## The acceptance record — a plumbing check

```
$ node apps/cli/dist/index.js review --out /tmp/leap-demo --activity act-1 --reviewer "$USER" \
    --decision accepted --notes "phase-2 plumbing check, not a quality judgement"
recorded acceptance for act-1 r1: accepted
$ grep -c accepted /tmp/leap-demo/acceptances.jsonl
1
$ python3 -c "import json;print(json.load(open('/tmp/leap-demo/cost.json'))['costPerAcceptedActivityUsdMicro'])"
108899
```

One acceptance against `act-1` revision 1. `cost per accepted activity` is therefore the whole
import's cost, $0.1089 — with one accepted activity out of nine promoted, that figure is the import
cost divided by one, not a per-activity production cost. It will only mean something once a real
review pass accepts a real proportion.

**To say it once more: this acceptance is a plumbing check by the person who ran the demo, exercising
the record and the measurement. It is not the phase-3 quality gate and implies nothing about whether
the activity is good.**

## Failures

None. No activity failed, so there is no `content:`, `budget:`, `system:` or `skipped:` reason to
report, and the import reached `ready` rather than `ready_with_failures`.

## Local playability check (not a platform claim)

The nine generated packages were unzipped into a copy of the phase-1 smoke site
(`packages/engine/test/smoke/site` + `h5p-standalone`), served from `127.0.0.1`, and opened in
headless Chromium. All nine reached `body[data-ready='1']` with a visible `.h5p-content` frame and
**zero console errors**: 9/9.

This is a local rendering check only. **It is not a platform compatibility result.** h5p.com and
Moodle results are filled in by hand by the owner in `platform-checklist.md`, where the generated
packages now have their own rows marked `pending (owner)`.

## Reproducing this offline

```bash
pnpm --filter @leaplearn/generator exec vitest run test/replay.test.ts
```

Replays all 13 recorded responses through the whole pipeline with no network access, and asserts the
exact recorded token counts, cache accounting and per-attempt cost. The replay is byte-exact only
while the prompts are identical to this run: same fixture bytes, same `PROMPT_VERSION`, same model
ids, same request profiles. Any prompt change requires re-recording, and `ReplayMissError` names the
purpose that missed.
