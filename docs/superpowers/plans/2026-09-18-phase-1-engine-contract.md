# Phase 1: Engine Contract Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. The execution workflow is described below and needs no external tooling.

**Goal:** A monorepo with a typed activity contract (`@leaplearn/shared`) and a deterministic, validating, network-free H5P engine (`@leaplearn/engine`) that compiles `multiChoice`, `blanks`, `flashcards`, a nested `questionSet` and an `interactiveBook` into byte-identical `.h5p` packages, proven by golden, validator and headless-player tests; the existing CLI kept working (manual `flashcards` on the new engine, everything else frozen in `apps/cli-legacy`); and the preview-sandbox question answered by a spike.

**Architecture:** Generation and compilation are split by a Zod-defined `ActivitySpec` (spec §2). The engine takes a spec plus an asset manifest and emits a package; it reads H5P libraries only from a checksummed lockfile-driven cache and never touches the network (spec §3). Handlers are one-per-type pure functions from spec to params; a semantics validator checks params recursively, including nested library params, allowed library options, dependency closure and media references. Packaging uses sorted entries, fixed timestamps and UUIDv5 sub-content IDs so the same inputs give the same bytes.

**Tech Stack:** pnpm workspaces; TypeScript 5.9 (`strict: true`, ESM, `module: nodenext`) for new packages; Vitest 3 for new packages, Jest kept for `apps/cli-legacy`; Zod 4; `yazl` 3 (streaming zip writer); `jszip` 3 (reading cached library packages); `uuid` 13 (v5); `@playwright/test` 1.63 + `h5p-standalone` 3.8 for player smoke tests; `sanitize-html` 2 for allow-listed HTML inside params; `papaparse` for the CSV shim.

**Spec:** `docs/superpowers/specs/2026-09-18-generator-service-design.md` (§2, §2.1, §2.1a, §2.2, §3 engine, §7 preview, §10 engine tests, §11 phase 1).

## Global Constraints

- Node `>=20.19.0`. pnpm `>=10` (`/opt/homebrew/bin/pnpm` is 10.10).
- Package scope `@leaplearn` (provisional per spec §1). Workspace packages: `packages/shared`, `packages/engine`, `apps/cli`, `apps/cli-legacy`, `tools/fetch-libraries`, `tools/preview-spike`.
- New packages compile under `strict: true` from their first commit. `apps/cli-legacy` keeps the phase-0 `tsconfig.json` and `tsconfig.strict.json` unchanged.
- The engine has **no** imports of `axios`, `node-fetch`, `http`, `https`, `process.env`, `process.cwd`, `process.exit` or `console`. A test enforces this (Task 12).
- Determinism claim (spec §3): same spec + same asset manifest (by hash) + same engine version + same lockfile → identical bytes.
- Lockfile `libraries/libraries.lock.json` is the only source of library versions. No version strings are typed into params by hand.
- Conventional Commits. Attribution reflects who actually wrote the change: a commit authored by a Claude agent ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; a commit written by a person carries no trailer. The commands below show the trailer because the plan is written for agent execution; delete it when a person executes the task.
- **Exit codes:** run `set -o pipefail` at the start of every shell session; a "passes" claim is valid only when the command's exit status was 0. Verification commands that need a summary write output to a file and print `exit=$?` before tailing it.
- **Text handling contract (spec §9):** schema fields that hold HTML (`question`, `html`, `taskDescription`, `introduction`, `prompt`, `coverDescription`, `panels[].html`) are passed through `sanitizeHtml` (allow-list) before they reach params; every other string field is plain text and is passed through `escapeHtml` wherever a handler embeds it in HTML. Task 9 defines both functions; no handler concatenates a raw string into HTML.
- Phase 0 must be complete (`main` builds, Jest green) before Task 1.

## Execution workflow

The plan is self-contained. Execute tasks in order; each task ends with a commit. For each task: write the failing test where one is given, run it and see it fail, implement, run the named verification and confirm `exit=0`, then commit. Do not start a task while the previous task's verification is red. Sequential execution by one agent or person per task, with a review of the diff and the verification output between tasks, is the intended mode.

**Clean-checkout verification** (the order matters because workspace `exports` point at `dist/`): `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm --filter @leaplearn/engine test:smoke`. Task 16 wires this as `pnpm verify`.

Repository: `/Users/benjaminjameswaller/Projects/personal/h5p-cli-creator`. Paths are relative to it.

## File structure after this phase

```
package.json                     workspace root (private), scripts fan out with pnpm -r
pnpm-workspace.yaml
tsconfig.base.json               strict ESM base for new packages
libraries/
  libraries.lock.json            key -> { package, dir, version, sha256 }
  cache/*.h5p                    checksummed Hub packages (tracked, replaces root content-type-cache)
packages/shared/src/
  index.ts                       re-exports
  provenance.ts                  Provenance schema
  pages.ts                       text/image/audio/video page schemas
  activities/
    base.ts                      ActivityBase, SCHEMA_VERSION
    multi-choice.ts  true-false.ts  blanks.ts  drag-text.ts  single-choice-set.ts
    essay.ts  crossword.ts  accordion.ts  flashcards.ts  dialog-cards.ts  summary.ts
    question-set.ts              closed child union
    interactive-book.ts          closed child union
    index.ts                     ActivitySpec discriminated union + type guards
  assets.ts                      AssetManifest types
packages/engine/src/
  index.ts                       compile, compileToBuffer, validate, createRegistry
  lock.ts                        lockfile schema + loader
  registry.ts                    LibraryRegistry (read-only, checksummed)
  ids.ts                         deterministic sub-content IDs
  params.ts                      H5PParams types + libraryString helper
  handlers/
    handler.ts                   ActivityHandler interface + BuildContext
    multi-choice.ts  blanks.ts  flashcards.ts  question-set.ts  interactive-book.ts
    index.ts                     createHandlerRegistry
  validator/
    semantics.ts                 recursive semantics validation
    closure.ts                   dependency closure + media reference checks
  assembler.ts                   h5p.json/content.json + deterministic zip via yazl
  errors.ts                      EngineError, ValidationError
packages/engine/test/
  fixtures/specs/*.json          golden inputs
  __snapshots__/                 params snapshots
  golden.test.ts  validator.test.ts  determinism.test.ts  registry.test.ts  boundary.test.ts
  smoke/player.spec.ts           Playwright, h5p-standalone
tools/fetch-libraries/src/index.ts   builds libraries/ from a directory of .h5p packages
tools/preview-spike/                  Task 13, throwaway
apps/cli/src/index.ts            new `leap` command: flashcards (new engine)
apps/cli-legacy/                 the entire previous repo contents (src, tests, jest config, content-type-cache)
```

---

### Task 1: Workspace scaffold and freezing the legacy CLI

**Files:**
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, new root `package.json`
- Move (git mv): `src`, `tests`, `jest.config.js`, `tsconfig.json`, `tsconfig.strict.json`, `eslint.config.js`, `examples`, `schemas`, `content-type-cache`, `docs/user-guides`, `docs/developer-guides`, `package.json` → `apps/cli-legacy/`
- Create: `apps/cli-legacy/README.md`

**Interfaces:**
- Produces: `pnpm -r build` and `pnpm -r test` run across the workspace; `pnpm --filter cli-legacy test` runs the phase-0 Jest suite unchanged.

- [ ] **Step 1: Move the existing project into `apps/cli-legacy`**

```bash
mkdir -p apps/cli-legacy
git mv src tests jest.config.js tsconfig.json tsconfig.strict.json eslint.config.js examples schemas content-type-cache package.json package-lock.json apps/cli-legacy/
git mv docs/user-guides docs/developer-guides apps/cli-legacy/
rm -rf node_modules dist
```

- [ ] **Step 2: Rename the legacy package and remove its lockfile**

In `apps/cli-legacy/package.json` set `"name": "cli-legacy"` and `"private": true`. Delete `apps/cli-legacy/package-lock.json` (pnpm owns the lockfile from now on):
```bash
git rm -q apps/cli-legacy/package-lock.json
```

- [ ] **Step 3: Create the workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
  - tools/*
```

Root `package.json`:
```json
{
  "name": "leaplearn-monorepo",
  "private": true,
  "engines": { "node": ">=20.19.0", "pnpm": ">=10" },
  "packageManager": "pnpm@10.10.0",
  "scripts": {
    "build": "pnpm -r --filter './packages/*' --filter './apps/cli' --filter './tools/*' build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "fetch-libraries": "pnpm --filter @leaplearn/fetch-libraries start --"
  },
  "devDependencies": {
    "typescript": "~5.9.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["es2022"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Freeze notice for the legacy app**

Create `apps/cli-legacy/README.md`:
```markdown
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
```

- [ ] **Step 5: Install and run the legacy suite through pnpm**

```bash
pnpm install
pnpm --filter cli-legacy build
pnpm --filter cli-legacy test 2>&1 | tail -4
```
Expected: build exit 0; `Test Suites: 0 failed`. If Jest reports `Cannot find module`, the cause is `moduleResolution`; confirm `apps/cli-legacy/tsconfig.json` still says `"moduleResolution": "node"` and that `jest.config.js` `rootDir` is the package directory.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: convert to pnpm workspace and freeze the existing CLI as apps/cli-legacy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `@leaplearn/shared` package scaffold, base types, provenance and pages

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/activities/base.ts`, `packages/shared/src/provenance.ts`, `packages/shared/src/pages.ts`, `packages/shared/src/assets.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/base.test.ts`

**Interfaces:**
- Produces: `SCHEMA_VERSION = 1`; `Provenance` schema; `ActivityBase` (Zod object with `id`, `title`, `language`, `instructionalLanguage?`, `provenance?`, `schemaVersion`); `ItemBase` (`id`, `provenance?`) that every nested item (card, panel, question, group, blank, draggable, word) extends so per-item evidence and review decisions have something to attach to; page schemas `TextPage`, `ImagePage`, `AudioPage`, `VideoPage`, `Page`; `AssetManifest`, `AssetEntry` types.

- [ ] **Step 1: Package files**

`packages/shared/package.json`:
```json
{
  "name": "@leaplearn/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test"
  },
  "dependencies": { "zod": "^4.1.0" },
  "devDependencies": { "vitest": "^3.2.0", "typescript": "~5.9.0", "eslint": "^9", "typescript-eslint": "^8", "@eslint/js": "^9" }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "outDir": "dist" }, "include": ["src"] }
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

`packages/shared/eslint.config.js` (ESM, because the package is `"type": "module"`; the legacy CommonJS config cannot be copied):
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["src/**/*.ts", "test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } }
);
```
Every later new package (`engine`, `cli`, `fetch-libraries`) copies this file unchanged.

- [ ] **Step 2: Write the failing test**

`packages/shared/test/base.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ActivityBase, ItemBase, Provenance, TextPage, ImagePage, SCHEMA_VERSION } from "../src/index.js";

describe("base schemas", () => {
  it("fills defaults for language, schemaVersion and provenance arrays", () => {
    const parsed = ActivityBase.parse({ id: "a1", title: "T" });
    expect(parsed.language).toBe("en");
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.provenance).toBeUndefined();
  });

  it("provenance defaults empty id arrays", () => {
    expect(Provenance.parse({})).toEqual({ conceptIds: [], evidenceIds: [], criteriaIds: [] });
  });

  it("rejects an empty id", () => {
    expect(() => ActivityBase.parse({ id: "", title: "T" })).toThrow();
  });

  it("ItemBase keeps provenance through parsing and requires an id", () => {
    const item = ItemBase.parse({ id: "c1", provenance: { conceptIds: ["k1"], evidenceIds: ["e1"] } });
    expect(item.provenance).toEqual({ conceptIds: ["k1"], evidenceIds: ["e1"], criteriaIds: [] });
    expect(() => ItemBase.parse({ provenance: {} })).toThrow();
  });

  it("pages: text requires html, image requires assetId and alt", () => {
    expect(TextPage.parse({ type: "text", title: "Intro", html: "<p>hi</p>" }).type).toBe("text");
    expect(() => ImagePage.parse({ type: "image", title: "Pic" })).toThrow();
    expect(ImagePage.parse({ type: "image", title: "Pic", assetId: "img-1", alt: "A pic" }).alt).toBe("A pic");
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd packages/shared && pnpm install && pnpm test`
Expected: FAIL, cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement**

`packages/shared/src/provenance.ts`:
```ts
import { z } from "zod";

export const Provenance = z.object({
  conceptIds: z.array(z.string().min(1)).default([]),
  evidenceIds: z.array(z.string().min(1)).default([]),
  criteriaIds: z.array(z.string().min(1)).default([])
});
export type Provenance = z.infer<typeof Provenance>;
```

`packages/shared/src/activities/base.ts`:
```ts
import { z } from "zod";
import { Provenance } from "../provenance.js";

export const SCHEMA_VERSION = 1 as const;

export const ActivityBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  language: z.string().min(2).max(10).default("en"),
  instructionalLanguage: z.string().min(2).max(10).optional(),
  provenance: Provenance.optional(),
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION)
});
export type ActivityBase = z.infer<typeof ActivityBase>;

/** Every nested item (card, panel, question, group, blank, draggable, word) carries a stable id and optional provenance. */
export const ItemBase = z.object({
  id: z.string().min(1),
  provenance: Provenance.optional()
});
export type ItemBase = z.infer<typeof ItemBase>;
```

`packages/shared/src/pages.ts`:
```ts
import { z } from "zod";

const PageBase = z.object({ title: z.string().min(1).max(200) });

export const TextPage = PageBase.extend({ type: z.literal("text"), html: z.string().min(1) });
export const ImagePage = PageBase.extend({ type: z.literal("image"), assetId: z.string().min(1), alt: z.string().min(1), caption: z.string().optional() });
export const AudioPage = PageBase.extend({ type: z.literal("audio"), assetId: z.string().min(1), autoplay: z.boolean().default(false) });
export const VideoPage = PageBase.extend({
  type: z.literal("video"),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("asset"), assetId: z.string().min(1) }),
    z.object({ kind: z.literal("url"), url: z.string().url() })
  ])
});

export const Page = z.discriminatedUnion("type", [TextPage, ImagePage, AudioPage, VideoPage]);
export type Page = z.infer<typeof Page>;
export type TextPage = z.infer<typeof TextPage>;
export type ImagePage = z.infer<typeof ImagePage>;
export type AudioPage = z.infer<typeof AudioPage>;
export type VideoPage = z.infer<typeof VideoPage>;
```

`packages/shared/src/assets.ts`:
```ts
import type { Readable } from "node:stream";

export interface AssetEntry {
  assetId: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  open(): Readable;
}

export type AssetManifest = ReadonlyMap<string, AssetEntry>;

export function emptyAssetManifest(): AssetManifest {
  return new Map();
}
```

`packages/shared/src/index.ts` (grown in later tasks):
```ts
export * from "./provenance.js";
export * from "./pages.js";
export * from "./assets.js";
export * from "./activities/base.js";
```

- [ ] **Step 5: Run to see it pass**

Run: `pnpm test` (in `packages/shared`)
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): scaffold package with activity base, provenance, page and asset types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The three phase-1 activity schemas: `multiChoice`, `blanks`, `flashcards`

**Files:**
- Create: `packages/shared/src/activities/multi-choice.ts`, `blanks.ts`, `flashcards.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/activities-phase1.test.ts`

**Interfaces:**
- Produces: `MultiChoiceSpec`, `BlanksSpec`, `FlashcardsSpec` (Zod objects, refined) and their inferred types; `BLANK_TOKEN = /\{\{(b[0-9]+)\}\}/g`.

- [ ] **Step 1: Write the failing test**

`packages/shared/test/activities-phase1.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MultiChoiceSpec, BlanksSpec, FlashcardsSpec } from "../src/index.js";

const base = { id: "x", title: "Title" };

describe("MultiChoiceSpec", () => {
  it("accepts one question with at least one correct answer", () => {
    const s = MultiChoiceSpec.parse({
      ...base, type: "multiChoice", question: "<p>2+2?</p>",
      answers: [{ text: "4", correct: true }, { text: "5", correct: false }]
    });
    expect(s.answers).toHaveLength(2);
  });
  it("rejects when no answer is correct", () => {
    expect(() => MultiChoiceSpec.parse({
      ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: false }, { text: "b", correct: false }]
    })).toThrow(/at least one correct/);
  });
  it("rejects fewer than two answers", () => {
    expect(() => MultiChoiceSpec.parse({ ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }] })).toThrow();
  });
});

describe("BlanksSpec", () => {
  it("accepts a passage whose tokens match the blanks exactly once each", () => {
    const s = BlanksSpec.parse({
      ...base, type: "blanks", passage: "The sky is {{b1}} and grass is {{b2}}.",
      blanks: [{ id: "b1", answers: ["blue"] }, { id: "b2", answers: ["green"], tip: "colour of leaves" }]
    });
    expect(s.blanks[1]?.tip).toBe("colour of leaves");
  });
  it("rejects answers or tips containing the H5P.Blanks delimiter characters, naming the blank", () => {
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "Half is {{b1}}", blanks: [{ id: "b1", answers: ["1/2"] }] })).toThrow(/b1.*"\/"/);
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "Start at {{b1}}", blanks: [{ id: "b1", answers: ["10:30"] }] })).toThrow(/b1.*":"/);
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "x {{b1}}", blanks: [{ id: "b1", answers: ["a"], tip: "one*two" }] })).toThrow(/b1.*"\*"/);
  });
  it("rejects a token without a blank", () => {
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "x {{b9}}", blanks: [{ id: "b1", answers: ["a"] }] })).toThrow(/b9/);
  });
  it("rejects a blank used twice", () => {
    expect(() => BlanksSpec.parse({ ...base, type: "blanks", passage: "{{b1}} {{b1}}", blanks: [{ id: "b1", answers: ["a"] }] })).toThrow(/exactly once/);
  });
});

describe("FlashcardsSpec", () => {
  it("requires at least one card with front and back", () => {
    expect(() => FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [] })).toThrow();
    const s = FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [{ id: "c1", front: "Bonjour", back: "Hello", provenance: { evidenceIds: ["e7"] } }] });
    expect(s.cards[0]?.back).toBe("Hello");
    expect(s.cards[0]?.provenance?.evidenceIds).toEqual(["e7"]);
    expect(() => FlashcardsSpec.parse({ ...base, type: "flashcards", cards: [{ front: "no id", back: "x" }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test` in `packages/shared`. Expected: FAIL, `MultiChoiceSpec` not exported.

- [ ] **Step 3: Implement**

`packages/shared/src/activities/multi-choice.ts`:
```ts
import { z } from "zod";
import { ActivityBase } from "./base.js";

export const MultiChoiceAnswer = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  feedbackChosen: z.string().optional(),
  feedbackNotChosen: z.string().optional()
});

export const MultiChoiceSpec = ActivityBase.extend({
  type: z.literal("multiChoice"),
  question: z.string().min(1),
  answers: z.array(MultiChoiceAnswer).min(2).max(8),
  randomAnswers: z.boolean().default(true)
}).refine((s) => s.answers.some((a) => a.correct), { message: "at least one correct answer", path: ["answers"] });
export type MultiChoiceSpec = z.infer<typeof MultiChoiceSpec>;
```

`packages/shared/src/activities/blanks.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";

export const BLANK_TOKEN = /\{\{(b[0-9]+)\}\}/g;
/** H5P.Blanks has no escaping for its delimiters, so these characters cannot appear in answers or tips. */
export const BLANKS_FORBIDDEN = ["*", "/", ":"] as const;

export const Blank = ItemBase.extend({
  id: z.string().regex(/^b[0-9]+$/),
  answers: z.array(z.string().min(1)).min(1),
  tip: z.string().optional()
}).superRefine((b, ctx) => {
  for (const [i, a] of b.answers.entries()) for (const ch of BLANKS_FORBIDDEN) if (a.includes(ch)) ctx.addIssue({ code: "custom", path: ["answers", i], message: `blank ${b.id}: answer contains "${ch}", which H5P.Blanks cannot represent` });
  if (b.tip) for (const ch of BLANKS_FORBIDDEN) if (b.tip.includes(ch)) ctx.addIssue({ code: "custom", path: ["tip"], message: `blank ${b.id}: tip contains "${ch}", which H5P.Blanks cannot represent` });
});

export const BlanksSpec = ActivityBase.extend({
  type: z.literal("blanks"),
  taskDescription: z.string().optional(),
  passage: z.string().min(1),
  blanks: z.array(Blank).min(1),
  caseSensitive: z.boolean().default(false)
}).superRefine((s, ctx) => {
  const counts = new Map<string, number>();
  for (const m of s.passage.matchAll(BLANK_TOKEN)) {
    const id = m[1]!;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const declared = new Set(s.blanks.map((b) => b.id));
  for (const [id, n] of counts) {
    if (!declared.has(id)) ctx.addIssue({ code: "custom", path: ["passage"], message: `token ${id} has no blank` });
    if (n !== 1) ctx.addIssue({ code: "custom", path: ["passage"], message: `token ${id} must appear exactly once` });
  }
  for (const id of declared) {
    if (!counts.has(id)) ctx.addIssue({ code: "custom", path: ["blanks"], message: `blank ${id} must appear exactly once in the passage` });
  }
});
export type BlanksSpec = z.infer<typeof BlanksSpec>;
```

`packages/shared/src/activities/flashcards.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";

export const Flashcard = ItemBase.extend({
  front: z.string().min(1),
  back: z.string().min(1),
  tip: z.string().optional(),
  imageAssetId: z.string().min(1).optional(),
  imageAlt: z.string().optional()
});

export const FlashcardsSpec = ActivityBase.extend({
  type: z.literal("flashcards"),
  description: z.string().optional(),
  cards: z.array(Flashcard).min(1).max(100)
});
export type FlashcardsSpec = z.infer<typeof FlashcardsSpec>;
```

Append to `packages/shared/src/index.ts`:
```ts
export * from "./activities/multi-choice.js";
export * from "./activities/blanks.js";
export * from "./activities/flashcards.js";
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test`. Expected: all tests in both files pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add multiChoice, blanks and flashcards activity schemas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The remaining nine activity schemas and the closed containers

Spec §2.1 fixes all twelve types now so later phases add producers without changing the contract.

**Files:**
- Create: `packages/shared/src/activities/true-false.ts`, `drag-text.ts`, `single-choice-set.ts`, `essay.ts`, `crossword.ts`, `accordion.ts`, `dialog-cards.ts`, `summary.ts`, `question-set.ts`, `interactive-book.ts`, `index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/activities-rest.test.ts`

**Interfaces:**
- Produces: `TrueFalseSpec`, `DragTextSpec` (tokens `{{d1}}`), `SingleChoiceSetSpec`, `EssaySpec`, `CrosswordSpec`, `AccordionSpec`, `DialogCardsSpec`, `SummarySpec`, `QuestionSetSpec`, `InteractiveBookSpec`, `ActivitySpec` (discriminated union), `StandaloneActivitySpec` (union without `interactiveBook`), `QuestionSetChild`, `BookItem`, `ACTIVITY_TYPES`; every nested item type (`Draggable`, `SingleChoiceQuestion`, `CrosswordWord`, `AccordionPanel`, `DialogCard`, `SummaryGroup`) extends `ItemBase`; `assertGeneratedProvenance(spec): void` throws naming the first activity or item that lacks provenance with at least one `evidenceId` (the generator calls it in phase 2; manual CLI content never does).

- [ ] **Step 1: Write the failing test**

`packages/shared/test/activities-rest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ActivitySpec, QuestionSetSpec, InteractiveBookSpec, ACTIVITY_TYPES, assertGeneratedProvenance } from "../src/index.js";

const base = { id: "x", title: "T" };
const mc = { ...base, type: "multiChoice", question: "q", answers: [{ text: "a", correct: true }, { text: "b", correct: false }] };
const cards = { ...base, type: "flashcards", cards: [{ id: "c1", front: "f", back: "b" }] };

describe("containers", () => {
  it("questionSet accepts multiChoice children and rejects flashcards", () => {
    expect(QuestionSetSpec.parse({ ...base, type: "questionSet", children: [mc] }).children).toHaveLength(1);
    expect(() => QuestionSetSpec.parse({ ...base, type: "questionSet", children: [cards] })).toThrow();
  });
  it("interactiveBook accepts pages and activities but not another book", () => {
    const book = InteractiveBookSpec.parse({
      ...base, type: "interactiveBook",
      chapters: [{ title: "C1", items: [{ type: "text", title: "Intro", html: "<p>x</p>" }, mc, cards] }]
    });
    expect(book.chapters[0]?.items).toHaveLength(3);
    expect(() => InteractiveBookSpec.parse({ ...base, type: "interactiveBook", chapters: [{ title: "C", items: [book] }] })).toThrow();
  });
  it("ActivitySpec discriminates on type", () => {
    expect(ActivitySpec.parse(mc).type).toBe("multiChoice");
    expect(ACTIVITY_TYPES).toHaveLength(13);
  });
  it("singleChoiceSet requires one correct and at least one distractor per question", () => {
    expect(() => ActivitySpec.parse({ ...base, type: "singleChoiceSet", questions: [{ id: "q1", question: "q", correct: "a", distractors: [] }] })).toThrow();
  });
  it("summary requires one correct and distractors per group, and items keep provenance", () => {
    const s = ActivitySpec.parse({ ...base, type: "summary", groups: [{ id: "g1", correct: "c", distractors: ["d"], provenance: { evidenceIds: ["e1"] } }] });
    expect(s.type).toBe("summary");
    if (s.type === "summary") expect(s.groups[0]?.provenance?.evidenceIds).toEqual(["e1"]);
  });
  it("assertGeneratedProvenance names the first unsupported activity or item", () => {
    expect(() => assertGeneratedProvenance(ActivitySpec.parse(mc))).toThrow(/activity x/);
    const withRoot = ActivitySpec.parse({ ...cards, provenance: { evidenceIds: ["e1"] } });
    expect(() => assertGeneratedProvenance(withRoot)).toThrow(/item c1/);
    const full = ActivitySpec.parse({ ...cards, provenance: { evidenceIds: ["e1"] }, cards: [{ id: "c1", front: "f", back: "b", provenance: { evidenceIds: ["e2"] } }] });
    expect(() => assertGeneratedProvenance(full)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test`. Expected: FAIL on missing exports.

- [ ] **Step 3: Implement the nine simple types**

`true-false.ts`:
```ts
import { z } from "zod";
import { ActivityBase } from "./base.js";
export const TrueFalseSpec = ActivityBase.extend({
  type: z.literal("trueFalse"),
  statement: z.string().min(1),
  correct: z.boolean(),
  feedbackCorrect: z.string().optional(),
  feedbackIncorrect: z.string().optional()
});
export type TrueFalseSpec = z.infer<typeof TrueFalseSpec>;
```

`drag-text.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const DRAG_TOKEN = /\{\{(d[0-9]+)\}\}/g;
export const Draggable = ItemBase.extend({ id: z.string().regex(/^d[0-9]+$/), text: z.string().min(1), tip: z.string().optional() });
export const DragTextSpec = ActivityBase.extend({
  type: z.literal("dragText"),
  taskDescription: z.string().optional(),
  passage: z.string().min(1),
  draggables: z.array(Draggable).min(1)
}).superRefine((s, ctx) => {
  const seen = new Set<string>();
  for (const m of s.passage.matchAll(DRAG_TOKEN)) {
    const id = m[1]!;
    if (seen.has(id)) ctx.addIssue({ code: "custom", path: ["passage"], message: `token ${id} must appear exactly once` });
    seen.add(id);
  }
  for (const d of s.draggables) if (!seen.has(d.id)) ctx.addIssue({ code: "custom", path: ["draggables"], message: `draggable ${d.id} not in passage` });
  for (const id of seen) if (!s.draggables.some((d) => d.id === id)) ctx.addIssue({ code: "custom", path: ["passage"], message: `token ${id} has no draggable` });
});
export type DragTextSpec = z.infer<typeof DragTextSpec>;
```

`single-choice-set.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const SingleChoiceQuestion = ItemBase.extend({ question: z.string().min(1), correct: z.string().min(1), distractors: z.array(z.string().min(1)).min(1).max(7) });
export const SingleChoiceSetSpec = ActivityBase.extend({ type: z.literal("singleChoiceSet"), questions: z.array(SingleChoiceQuestion).min(1).max(50) });
export type SingleChoiceSetSpec = z.infer<typeof SingleChoiceSetSpec>;
```

`essay.ts`:
```ts
import { z } from "zod";
import { ActivityBase } from "./base.js";
export const EssayKeyword = z.object({ keyword: z.string().min(1), alternatives: z.array(z.string().min(1)).default([]), points: z.number().int().min(1).default(1) });
export const EssaySpec = ActivityBase.extend({
  type: z.literal("essay"),
  prompt: z.string().min(1),
  keywords: z.array(EssayKeyword).min(1),
  sampleSolution: z.string().min(1),
  minimumWords: z.number().int().min(0).default(0)
});
export type EssaySpec = z.infer<typeof EssaySpec>;
```

`crossword.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const CrosswordWord = ItemBase.extend({ answer: z.string().regex(/^[\p{L}\p{N}]+$/u), clue: z.string().min(1) });
export const CrosswordSpec = ActivityBase.extend({ type: z.literal("crossword"), taskDescription: z.string().optional(), words: z.array(CrosswordWord).min(2).max(40) });
export type CrosswordSpec = z.infer<typeof CrosswordSpec>;
```

`accordion.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const AccordionPanel = ItemBase.extend({ title: z.string().min(1), html: z.string().min(1) });
export const AccordionSpec = ActivityBase.extend({ type: z.literal("accordion"), panels: z.array(AccordionPanel).min(1).max(30) });
export type AccordionSpec = z.infer<typeof AccordionSpec>;
```

`dialog-cards.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const DialogCard = ItemBase.extend({ front: z.string().min(1), back: z.string().min(1), tip: z.string().optional(), audioAssetId: z.string().min(1).optional(), imageAssetId: z.string().min(1).optional() });
export const DialogCardsSpec = ActivityBase.extend({ type: z.literal("dialogCards"), description: z.string().optional(), mode: z.enum(["normal", "repetition"]).default("normal"), cards: z.array(DialogCard).min(1).max(100) });
export type DialogCardsSpec = z.infer<typeof DialogCardsSpec>;
```

`summary.ts`:
```ts
import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const SummaryGroup = ItemBase.extend({ correct: z.string().min(1), distractors: z.array(z.string().min(1)).min(1).max(5), tip: z.string().optional() });
export const SummarySpec = ActivityBase.extend({ type: z.literal("summary"), intro: z.string().optional(), groups: z.array(SummaryGroup).min(1).max(20) });
export type SummarySpec = z.infer<typeof SummarySpec>;
```

- [ ] **Step 4: Implement the containers and the union**

`question-set.ts`:
```ts
import { z } from "zod";
import { ActivityBase } from "./base.js";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { EssaySpec } from "./essay.js";

export const QuestionSetChild = z.discriminatedUnion("type", [MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, EssaySpec]);
export type QuestionSetChild = z.infer<typeof QuestionSetChild>;

export const QuestionSetSpec = ActivityBase.extend({
  type: z.literal("questionSet"),
  introduction: z.string().optional(),
  passPercentage: z.number().int().min(0).max(100).default(50),
  randomQuestions: z.boolean().default(false),
  children: z.array(QuestionSetChild).min(1).max(50)
});
export type QuestionSetSpec = z.infer<typeof QuestionSetSpec>;
```

`interactive-book.ts`:
```ts
import { z } from "zod";
import { ActivityBase } from "./base.js";
import { TextPage, ImagePage, AudioPage, VideoPage } from "../pages.js";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { SingleChoiceSetSpec } from "./single-choice-set.js";
import { EssaySpec } from "./essay.js";
import { CrosswordSpec } from "./crossword.js";
import { AccordionSpec } from "./accordion.js";
import { FlashcardsSpec } from "./flashcards.js";
import { DialogCardsSpec } from "./dialog-cards.js";
import { SummarySpec } from "./summary.js";
import { QuestionSetSpec } from "./question-set.js";

export const BookItem = z.discriminatedUnion("type", [
  TextPage, ImagePage, AudioPage, VideoPage,
  MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, SingleChoiceSetSpec, EssaySpec,
  CrosswordSpec, AccordionSpec, FlashcardsSpec, DialogCardsSpec, SummarySpec, QuestionSetSpec
]);
export type BookItem = z.infer<typeof BookItem>;

export const BookChapter = z.object({ title: z.string().min(1).max(200), items: z.array(BookItem).min(1) });

export const InteractiveBookSpec = ActivityBase.extend({
  type: z.literal("interactiveBook"),
  coverDescription: z.string().optional(),
  coverImageAssetId: z.string().min(1).optional(),
  chapters: z.array(BookChapter).min(1).max(50)
});
export type InteractiveBookSpec = z.infer<typeof InteractiveBookSpec>;
```

`activities/index.ts`:
```ts
import { z } from "zod";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { SingleChoiceSetSpec } from "./single-choice-set.js";
import { EssaySpec } from "./essay.js";
import { CrosswordSpec } from "./crossword.js";
import { AccordionSpec } from "./accordion.js";
import { FlashcardsSpec } from "./flashcards.js";
import { DialogCardsSpec } from "./dialog-cards.js";
import { SummarySpec } from "./summary.js";
import { QuestionSetSpec } from "./question-set.js";
import { InteractiveBookSpec } from "./interactive-book.js";

export const StandaloneActivitySpec = z.discriminatedUnion("type", [
  MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, SingleChoiceSetSpec, EssaySpec,
  CrosswordSpec, AccordionSpec, FlashcardsSpec, DialogCardsSpec, SummarySpec, QuestionSetSpec
]);
export type StandaloneActivitySpec = z.infer<typeof StandaloneActivitySpec>;

export const ActivitySpec = z.discriminatedUnion("type", [...StandaloneActivitySpec.options, InteractiveBookSpec]);
export type ActivitySpec = z.infer<typeof ActivitySpec>;

export const ACTIVITY_TYPES = ActivitySpec.options.map((o) => o.shape.type.value) as ActivitySpec["type"][];

function hasEvidence(p: { evidenceIds: string[] } | undefined): boolean {
  return Boolean(p && p.evidenceIds.length > 0);
}

/** Items are the nested arrays whose members extend ItemBase; pages and answers are not items. */
function items(spec: ActivitySpec): Array<{ id: string; provenance?: { evidenceIds: string[] } }> {
  switch (spec.type) {
    case "flashcards": return spec.cards;
    case "dialogCards": return spec.cards;
    case "accordion": return spec.panels;
    case "crossword": return spec.words;
    case "summary": return spec.groups;
    case "singleChoiceSet": return spec.questions;
    case "blanks": return spec.blanks;
    case "dragText": return spec.draggables;
    default: return [];
  }
}

/**
 * Generated content must be traceable: the activity and every item carry provenance with at least
 * one evidenceId. Throws naming the first offender. Never called for manually authored content.
 */
export function assertGeneratedProvenance(spec: ActivitySpec): void {
  if (!hasEvidence(spec.provenance)) throw new Error(`activity ${spec.id} has no evidence provenance`);
  for (const item of items(spec)) if (!hasEvidence(item.provenance)) throw new Error(`item ${item.id} in activity ${spec.id} has no evidence provenance`);
  if (spec.type === "questionSet") spec.children.forEach(assertGeneratedProvenance);
  if (spec.type === "interactiveBook") for (const ch of spec.chapters) for (const it of ch.items) if (it.type !== "text" && it.type !== "image" && it.type !== "audio" && it.type !== "video") assertGeneratedProvenance(it);
}
```

Replace the activity exports in `packages/shared/src/index.ts` with:
```ts
export * from "./provenance.js";
export * from "./pages.js";
export * from "./assets.js";
export * from "./activities/base.js";
export * from "./activities/multi-choice.js";
export * from "./activities/true-false.js";
export * from "./activities/blanks.js";
export * from "./activities/drag-text.js";
export * from "./activities/single-choice-set.js";
export * from "./activities/essay.js";
export * from "./activities/crossword.js";
export * from "./activities/accordion.js";
export * from "./activities/flashcards.js";
export * from "./activities/dialog-cards.js";
export * from "./activities/summary.js";
export * from "./activities/question-set.js";
export * from "./activities/interactive-book.js";
export * from "./activities/index.js";
```

- [ ] **Step 5: Run, typecheck, lint**

Run: `pnpm test && pnpm typecheck && pnpm lint` in `packages/shared`. Expected: all pass. If `discriminatedUnion` complains that a refined member is not an object, you are on Zod 3; confirm `pnpm ls zod` shows 4.x (refinements stay on the object in Zod 4).

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): complete the twelve activity schemas and closed containers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Library lockfile and the `fetch-libraries` tool

The engine never downloads. This tool builds `libraries/` from a directory of `.h5p` packages (phase 1: the legacy cache; later: Hub downloads added to the tool, never the engine).

**Files:**
- Create: `packages/engine/package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js` (same shape as shared)
- Create: `packages/engine/src/lock.ts`, `packages/engine/src/errors.ts`
- Create: `tools/fetch-libraries/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `libraries/libraries.lock.json`, `libraries/cache/*.h5p` (generated)
- Test: `packages/engine/test/lock.test.ts`

**Interfaces:**
- Produces: `LibraryLock` type and `LibraryLockSchema` (Zod): `{ schemaVersion: 1, generatedAt: string, libraries: Record<LibraryKey, LockedLibrary> }` with `LibraryKey = "H5P.MultiChoice-1.16"` and `LockedLibrary = { machineName, majorVersion, minorVersion, patchVersion, package: "H5P.MultiChoice-1.16.h5p", dir: "H5P.MultiChoice-1.16", sha256 }`; `loadLock(path): Promise<LibraryLock>`; `libraryKey(name, major, minor): LibraryKey`.

- [ ] **Step 1: Engine package files**

`packages/engine/package.json`:
```json
{
  "name": "@leaplearn/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:smoke": "playwright test -c test/smoke/playwright.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@leaplearn/shared": "workspace:*",
    "jszip": "^3.10.1",
    "sanitize-html": "^2.17.0",
    "uuid": "^13.0.0",
    "yazl": "^3.3.1",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@types/node": "^20",
    "@types/sanitize-html": "^2.16.0",
    "@types/yazl": "^2.4.5",
    "h5p-standalone": "^3.8.2",
    "typescript": "~5.9.0",
    "vitest": "^3.2.0",
    "eslint": "^9", "typescript-eslint": "^8", "@eslint/js": "^9"
  }
}
```
`tsconfig.json`, `vitest.config.ts`, `eslint.config.js` as in Task 2 (vitest `include: ["test/**/*.test.ts"]`, exclude `test/smoke/**`).

- [ ] **Step 2: Write the failing lock test**

`packages/engine/test/lock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { LibraryLockSchema, libraryKey } from "../src/lock.js";

describe("library lock", () => {
  it("builds keys as name-major.minor", () => {
    expect(libraryKey("H5P.MultiChoice", 1, 16)).toBe("H5P.MultiChoice-1.16");
  });
  it("validates a lock document", () => {
    const lock = LibraryLockSchema.parse({
      schemaVersion: 1, generatedAt: "2026-09-18T00:00:00.000Z",
      libraries: { "H5P.MultiChoice-1.16": { machineName: "H5P.MultiChoice", majorVersion: 1, minorVersion: 16, patchVersion: 14, package: "H5P.MultiChoice-1.16.h5p", dir: "H5P.MultiChoice-1.16", sha256: "a".repeat(64) } }
    });
    expect(lock.libraries["H5P.MultiChoice-1.16"]?.patchVersion).toBe(14);
  });
  it("rejects a key that disagrees with its entry", () => {
    expect(() => LibraryLockSchema.parse({
      schemaVersion: 1, generatedAt: "x",
      libraries: { "H5P.Wrong-1.0": { machineName: "H5P.MultiChoice", majorVersion: 1, minorVersion: 16, patchVersion: 14, package: "p.h5p", dir: "d", sha256: "a".repeat(64) } }
    })).toThrow(/key/);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd packages/engine && pnpm install && pnpm test`. Expected: FAIL, cannot resolve `../src/lock.js`.

- [ ] **Step 4: Implement `errors.ts` and `lock.ts`**

`packages/engine/src/errors.ts`:
```ts
export class EngineError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = "EngineError"; }
}

export interface ValidationIssue { path: string; message: string; }

export class ValidationError extends EngineError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`, "VALIDATION");
    this.name = "ValidationError";
  }
}
```

`packages/engine/src/lock.ts`:
```ts
import { readFile } from "node:fs/promises";
import { z } from "zod";

export type LibraryKey = `${string}-${number}.${number}`;

export function libraryKey(machineName: string, major: number, minor: number): LibraryKey {
  return `${machineName}-${major}.${minor}`;
}

export const LockedLibrarySchema = z.object({
  machineName: z.string().min(1),
  majorVersion: z.number().int().min(0),
  minorVersion: z.number().int().min(0),
  patchVersion: z.number().int().min(0),
  package: z.string().regex(/\.h5p$/),
  dir: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
});
export type LockedLibrary = z.infer<typeof LockedLibrarySchema>;

export const LibraryLockSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  libraries: z.record(z.string(), LockedLibrarySchema)
}).superRefine((lock, ctx) => {
  for (const [key, lib] of Object.entries(lock.libraries)) {
    if (key !== libraryKey(lib.machineName, lib.majorVersion, lib.minorVersion)) {
      ctx.addIssue({ code: "custom", path: ["libraries", key], message: `key ${key} does not match entry` });
    }
  }
});
export type LibraryLock = z.infer<typeof LibraryLockSchema>;

export async function loadLock(path: string): Promise<LibraryLock> {
  return LibraryLockSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
```

`packages/engine/src/index.ts` (minimal so the tool in step 6 can import the engine; Task 11 replaces this file with the full public API):
```ts
export { libraryKey, loadLock, LibraryLockSchema, LockedLibrarySchema, type LibraryKey, type LibraryLock, type LockedLibrary } from "./lock.js";
export { EngineError, ValidationError, type ValidationIssue } from "./errors.js";
```

- [ ] **Step 5: Run to see it pass**

Run: `pnpm test`. Expected: 3 passed.

- [ ] **Step 6: Create the tool**

`tools/fetch-libraries/package.json`:
```json
{
  "name": "@leaplearn/fetch-libraries",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "tsc -p tsconfig.json", "start": "node dist/index.js", "test": "echo no tests", "typecheck": "tsc -p tsconfig.json --noEmit", "lint": "eslint src" },
  "dependencies": { "@leaplearn/engine": "workspace:*", "jszip": "^3.10.1" },
  "devDependencies": { "@types/node": "^20", "typescript": "~5.9.0", "eslint": "^9", "typescript-eslint": "^8", "@eslint/js": "^9" }
}
```
`tsconfig.json` as in Task 2.

`tools/fetch-libraries/src/index.ts`:
```ts
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { libraryKey, type LibraryLock, type LockedLibrary } from "@leaplearn/engine";

/**
 * Usage: fetch-libraries --from <dir-of-h5p-packages> --out <libraries-dir>
 * Scans every .h5p in --from, records every library directory it contains, copies the packages
 * into <out>/cache and writes <out>/libraries.lock.json. When two packages contain the same
 * library key, the higher patch version wins; ties go to the alphabetically first package.
 */
async function main(): Promise<void> {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!, process.argv[i + 1]!);
  const from = resolve(args.get("--from") ?? "apps/cli-legacy/content-type-cache");
  const out = resolve(args.get("--out") ?? "libraries");
  await mkdir(join(out, "cache"), { recursive: true });

  const chosen = new Map<string, LockedLibrary>();
  const packages = (await readdir(from)).filter((f) => f.endsWith(".h5p")).sort();

  for (const pkgName of packages) {
    const bytes = await readFile(join(from, pkgName));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const zip = await JSZip.loadAsync(bytes);
    const libraryJsonPaths = Object.keys(zip.files).filter((p) => /^[^/]+\/library\.json$/.test(p));

    for (const p of libraryJsonPaths) {
      const dir = p.slice(0, -"/library.json".length);
      const lib = JSON.parse(await zip.file(p)!.async("text")) as { machineName: string; majorVersion: number; minorVersion: number; patchVersion: number };
      const key = libraryKey(lib.machineName, lib.majorVersion, lib.minorVersion);
      const candidate: LockedLibrary = { machineName: lib.machineName, majorVersion: lib.majorVersion, minorVersion: lib.minorVersion, patchVersion: lib.patchVersion, package: pkgName, dir, sha256 };
      const existing = chosen.get(key);
      if (!existing || candidate.patchVersion > existing.patchVersion) chosen.set(key, candidate);
    }
    await copyFile(join(from, pkgName), join(out, "cache", pkgName));
  }

  const lock: LibraryLock = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    libraries: Object.fromEntries([...chosen.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
  await writeFile(join(out, "libraries.lock.json"), JSON.stringify(lock, null, 2) + "\n");
  process.stdout.write(`wrote ${chosen.size} libraries from ${packages.length} packages to ${out}\n`);
}

main().catch((err) => { process.stderr.write(String(err) + "\n"); process.exit(1); });
```

- [ ] **Step 7: Generate `libraries/` from the legacy cache**

```bash
pnpm install
pnpm --filter @leaplearn/engine build
pnpm --filter @leaplearn/fetch-libraries build
pnpm fetch-libraries --from apps/cli-legacy/content-type-cache --out libraries
ls libraries/cache | wc -l
python3 -c "import json; d=json.load(open('libraries/libraries.lock.json'))['libraries']; print(len(d)); print(sorted(k for k in d if k.startswith('H5P.MultiChoice') or k.startswith('H5P.Blanks') or k.startswith('H5P.Flashcards') or k.startswith('H5P.QuestionSet') or k.startswith('H5P.InteractiveBook') or k.startswith('H5P.Column') or k.startswith('H5P.Row')))"
```
Expected: `17` packages; the printed list includes `H5P.Blanks-1.14`, `H5P.Column-1.18`, `H5P.Flashcards-1.5`, `H5P.InteractiveBook-1.11`, `H5P.MultiChoice-1.16`, `H5P.QuestionSet-1.20`, `H5P.Row-1.0`, `H5P.RowColumn-1.0`.

- [ ] **Step 8: Commit (the cache is tracked deliberately; it is the reproducible input)**

```bash
git add packages/engine tools/fetch-libraries libraries pnpm-lock.yaml
git commit -m "feat(engine): add library lockfile schema and fetch-libraries tool; generate libraries/

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Read-only, checksummed `LibraryRegistry`

**Files:**
- Create: `packages/engine/src/registry.ts`
- Test: `packages/engine/test/registry.test.ts`

**Interfaces:**
- Produces: `createRegistry({ lockPath, cacheDir }): Promise<LibraryRegistry>`; `LibraryRegistry` with `get(key): LockedLibrary` (throws `EngineError("LIBRARY_NOT_LOCKED")`), `resolve(machineName): LockedLibrary` (highest locked major.minor for that name), `libraryJson(key): Promise<LibraryJson>`, `semantics(key): Promise<SemanticField[] | null>`, `closure(rootKeys: LibraryKey[]): Promise<LockedLibrary[]>` (transitive `preloadedDependencies` + `dynamicDependencies`, sorted by key), `files(key): Promise<Array<{ path: string; data: () => Promise<Buffer> }>>` (all files under `dir/`), `libraryString(key): string` (`"H5P.MultiChoice 1.16"`).

- [ ] **Step 1: Write the failing test**

`packages/engine/test/registry.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";

const root = resolve(import.meta.dirname, "../../..");

describe("LibraryRegistry", () => {
  let reg: LibraryRegistry;
  beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

  it("resolves a machine name to its locked version and formats the library string", () => {
    const lib = reg.resolve("H5P.MultiChoice");
    expect(`${lib.majorVersion}.${lib.minorVersion}`).toBe("1.16");
    expect(reg.libraryString("H5P.MultiChoice-1.16")).toBe("H5P.MultiChoice 1.16");
  });

  it("reads library.json and semantics from the checksummed package", async () => {
    const lj = await reg.libraryJson("H5P.MultiChoice-1.16");
    expect(lj.machineName).toBe("H5P.MultiChoice");
    const sem = await reg.semantics("H5P.MultiChoice-1.16");
    expect(sem?.map((f) => f.name)).toContain("answers");
  });

  it("computes the transitive closure over preloaded dependencies", async () => {
    const keys = (await reg.closure(["H5P.MultiChoice-1.16"])).map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
    expect(keys).toEqual(expect.arrayContaining(["H5P.MultiChoice-1.16", "H5P.JoubelUI-1.3", "H5P.Question-1.5", "FontAwesome-4.5"]));
    expect(keys).toEqual([...keys].sort());
  });

  it("throws for a library that is not locked", () => {
    expect(() => reg.get("H5P.Nope-1.0")).toThrow(/LIBRARY_NOT_LOCKED|not locked/);
  });

  it("refuses a package whose checksum does not match", async () => {
    const { mkdtemp, cp, writeFile, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(resolve(tmpdir(), "lock-"));
    await cp(resolve(root, "libraries"), dir, { recursive: true });
    const lock = JSON.parse(await readFile(resolve(dir, "libraries.lock.json"), "utf8"));
    lock.libraries["H5P.MultiChoice-1.16"].sha256 = "0".repeat(64);
    await writeFile(resolve(dir, "libraries.lock.json"), JSON.stringify(lock));
    const bad = await createRegistry({ lockPath: resolve(dir, "libraries.lock.json"), cacheDir: resolve(dir, "cache") });
    await expect(bad.libraryJson("H5P.MultiChoice-1.16")).rejects.toThrow(/checksum/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test`. Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

`packages/engine/src/registry.ts`:
```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { EngineError } from "./errors.js";
import { libraryKey, loadLock, type LibraryKey, type LibraryLock, type LockedLibrary } from "./lock.js";

export interface LibraryDependencyRef { machineName: string; majorVersion: number; minorVersion: number; }
export interface LibraryJson {
  machineName: string; majorVersion: number; minorVersion: number; patchVersion: number;
  title?: string; runnable?: number; embedTypes?: string[];
  preloadedDependencies?: LibraryDependencyRef[]; dynamicDependencies?: LibraryDependencyRef[]; editorDependencies?: LibraryDependencyRef[];
}
export interface SemanticField { name: string; type: string; [k: string]: unknown; }
export interface LibraryFile { path: string; data: () => Promise<Buffer>; }

export interface RegistryOptions { lockPath: string; cacheDir: string; }

export class LibraryRegistry {
  private readonly zips = new Map<string, Promise<JSZip>>();

  constructor(private readonly lock: LibraryLock, private readonly cacheDir: string) {}

  get(key: string): LockedLibrary {
    const lib = this.lock.libraries[key];
    if (!lib) throw new EngineError(`library ${key} is not locked`, "LIBRARY_NOT_LOCKED");
    return lib;
  }

  resolve(machineName: string): LockedLibrary {
    const candidates = Object.values(this.lock.libraries).filter((l) => l.machineName === machineName);
    if (candidates.length === 0) throw new EngineError(`library ${machineName} is not locked`, "LIBRARY_NOT_LOCKED");
    candidates.sort((a, b) => b.majorVersion - a.majorVersion || b.minorVersion - a.minorVersion);
    return candidates[0]!;
  }

  libraryString(key: LibraryKey | string): string {
    const lib = this.get(key);
    return `${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}`;
  }

  async libraryJson(key: string): Promise<LibraryJson> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const file = zip.file(`${lib.dir}/library.json`);
    if (!file) throw new EngineError(`${lib.package} has no ${lib.dir}/library.json`, "PACKAGE_CORRUPT");
    return JSON.parse(await file.async("text")) as LibraryJson;
  }

  async semantics(key: string): Promise<SemanticField[] | null> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const file = zip.file(`${lib.dir}/semantics.json`);
    return file ? (JSON.parse(await file.async("text")) as SemanticField[]) : null;
  }

  async closure(rootKeys: string[]): Promise<LockedLibrary[]> {
    const seen = new Map<string, LockedLibrary>();
    const visit = async (key: string): Promise<void> => {
      if (seen.has(key)) return;
      const lib = this.get(key);
      seen.set(key, lib);
      const lj = await this.libraryJson(key);
      for (const dep of [...(lj.preloadedDependencies ?? []), ...(lj.dynamicDependencies ?? [])]) {
        await visit(libraryKey(dep.machineName, dep.majorVersion, dep.minorVersion));
      }
    };
    for (const k of rootKeys) await visit(k);
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, l]) => l);
  }

  async files(key: string): Promise<LibraryFile[]> {
    const lib = this.get(key);
    const zip = await this.openPackage(lib);
    const prefix = `${lib.dir}/`;
    return Object.values(zip.files)
      .filter((f) => !f.dir && f.name.startsWith(prefix))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ path: f.name, data: () => f.async("nodebuffer") }));
  }

  private openPackage(lib: LockedLibrary): Promise<JSZip> {
    let p = this.zips.get(lib.package);
    if (!p) {
      p = (async () => {
        const bytes = await readFile(join(this.cacheDir, lib.package));
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== lib.sha256) throw new EngineError(`checksum mismatch for ${lib.package}: expected ${lib.sha256}, got ${actual}`, "PACKAGE_CHECKSUM");
        return JSZip.loadAsync(bytes);
      })();
      this.zips.set(lib.package, p);
    }
    return p;
  }
}

export async function createRegistry(options: RegistryOptions): Promise<LibraryRegistry> {
  return new LibraryRegistry(await loadLock(options.lockPath), options.cacheDir);
}
```

Note the checksum is verified against the lock entry of whichever library first opens a package; every entry for one package carries the same hash by construction (Task 5).

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test`. Expected: all pass. If the closure test fails on `FontAwesome-4.5`, print `await reg.libraryJson("H5P.MultiChoice-1.16")` and align the expected list with the actual `preloadedDependencies`; the assertion must reflect the real `library.json`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): read-only checksummed library registry with dependency closure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Deterministic IDs, params types and the handler interface

**Files:**
- Create: `packages/engine/src/ids.ts`, `packages/engine/src/params.ts`, `packages/engine/src/handlers/handler.ts`
- Test: `packages/engine/test/ids.test.ts`

**Interfaces:**
- Produces: `IdFactory` with `subContentId(path: string): string` (UUIDv5 of `${rootActivityId}/${revision}/${scope}/${path}` in a fixed namespace) and `scope(prefix: string): IdFactory` (a child factory that keeps the root activity id and revision and prepends `prefix/` to every path, so nested content never repeats across books and always changes with the containing revision); `createIdFactory(activityId: string, revision: number): IdFactory`; `H5PParams = Record<string, unknown>`; `H5PContent = { library: string; params: H5PParams; metadata: { contentType: string; license: "U"; title: string }; subContentId?: string }`; `BuildContext = { registry: LibraryRegistry; ids: IdFactory; assets: AssetManifest; mediaPaths: Map<string, string> }` where `mediaPaths` maps a `content/`-relative path to the `assetId` that fills it; `ActivityHandler<S> = { type: S["type"]; mainLibrary: string; requiredLibraries(spec: S): string[]; build(spec: S, ctx: BuildContext): H5PContent }`.

- [ ] **Step 1: Write the failing test**

`packages/engine/test/ids.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createIdFactory } from "../src/ids.js";

describe("deterministic ids", () => {
  it("is stable for the same activity, revision and path", () => {
    const a = createIdFactory("act-1", 3).subContentId("answers/0");
    const b = createIdFactory("act-1", 3).subContentId("answers/0");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("changes with revision and with path", () => {
    expect(createIdFactory("act-1", 3).subContentId("x")).not.toBe(createIdFactory("act-1", 4).subContentId("x"));
    expect(createIdFactory("act-1", 3).subContentId("x")).not.toBe(createIdFactory("act-1", 3).subContentId("y"));
  });
  it("scoped factories keep the root id and revision", () => {
    const root = createIdFactory("book-1", 2);
    const child = root.scope("chapters/0/items/1");
    expect(child.subContentId("questions/0")).toBe(root.subContentId("chapters/0/items/1/questions/0"));
    expect(child.subContentId("questions/0")).not.toBe(createIdFactory("book-2", 2).scope("chapters/0/items/1").subContentId("questions/0"));
    expect(child.subContentId("questions/0")).not.toBe(createIdFactory("book-1", 3).scope("chapters/0/items/1").subContentId("questions/0"));
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/engine/src/ids.ts`:
```ts
import { v5 as uuidv5 } from "uuid";

const NAMESPACE = "6f1c2a0e-9d4b-4c7e-8a3f-2b1d5e7c9a10";

export interface IdFactory {
  subContentId(path: string): string;
  scope(prefix: string): IdFactory;
}

function factory(rootId: string, revision: number, prefix: string): IdFactory {
  return {
    subContentId: (path) => uuidv5(`${rootId}/${revision}/${prefix}${path}`, NAMESPACE),
    scope: (p) => factory(rootId, revision, `${prefix}${p}/`)
  };
}

export function createIdFactory(activityId: string, revision: number): IdFactory {
  return factory(activityId, revision, "");
}
```

`packages/engine/src/params.ts`:
```ts
export type H5PParams = Record<string, unknown>;

export interface H5PContent {
  library: string;
  params: H5PParams;
  metadata: { contentType: string; license: "U"; title: string };
  subContentId?: string;
}
```

`packages/engine/src/handlers/handler.ts`:
```ts
import type { ActivitySpec, AssetManifest } from "@leaplearn/shared";
import type { IdFactory } from "../ids.js";
import type { H5PContent } from "../params.js";
import type { LibraryRegistry } from "../registry.js";

export interface BuildContext {
  registry: LibraryRegistry;
  ids: IdFactory;
  assets: AssetManifest;
  /** content/-relative media path -> assetId. The assembler copies exactly these and nothing else. */
  mediaPaths: Map<string, string>;
}

export interface ActivityHandler<S extends ActivitySpec = ActivitySpec> {
  readonly type: S["type"];
  readonly mainLibrary: string;
  requiredLibraries(spec: S): string[];
  build(spec: S, ctx: BuildContext): H5PContent;
}
```

- [ ] **Step 3: Run, commit**

```bash
pnpm test
git add packages/engine
git commit -m "feat(engine): deterministic sub-content ids, params types and handler interface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Recursive semantics validator with library options, closure and media checks

**Files:**
- Create: `packages/engine/src/validator/semantics.ts`, `packages/engine/src/validator/closure.ts`
- Test: `packages/engine/test/validator.test.ts`

**Interfaces:**
- Produces: `validateParams(content: H5PContent, registry: LibraryRegistry, mediaPaths: ReadonlyMap<string, string>): Promise<ValidationIssue[]>` (empty array means valid; only the map's keys are consulted) and `collectLibraries(content): string[]` (every `library` string found, as lock keys) plus `checkClosure(content, registry, closureKeys: string[]): Promise<ValidationIssue[]>`.
- **Missing-value rule, decided against the locked semantics:** a missing value is acceptable when the field is `optional`, has a `default`, or is a `group` (H5P content routinely omits groups such as MultiChoice `media`, and the player fills defaults); a missing `list` or scalar (`text`, `number`, `boolean`, `select`, `library`, media) without `optional` or `default` is an error. Lists enforce `min` and `max`. A `group` or `library` value must be a non-array object.

- [ ] **Step 1: Write the failing test**

`packages/engine/test/validator.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";
import { validateParams } from "../src/validator/semantics.js";
import { checkClosure } from "../src/validator/closure.js";

const root = resolve(import.meta.dirname, "../../..");
let reg: LibraryRegistry;
beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const goodMc = () => ({
  library: "H5P.MultiChoice 1.16",
  params: {
    question: "<p>q</p>",
    answers: [{ text: "a", correct: true }, { text: "b", correct: false }],
    behaviour: { enableRetry: true, type: "auto", singlePoint: false, randomAnswers: true, passPercentage: 100 }
  },
  metadata: { contentType: "Multiple Choice", license: "U" as const, title: "t" }
});

const noMedia = () => new Map<string, string>();

describe("semantics validator", () => {
  it("accepts well-formed MultiChoice params", async () => {
    expect(await validateParams(goodMc(), reg, noMedia())).toEqual([]);
  });
  it("reports a wrong type at a nested path", async () => {
    const bad = goodMc(); (bad.params.answers as Array<Record<string, unknown>>)[0]!["correct"] = "yes";
    const issues = await validateParams(bad, reg, noMedia());
    expect(issues.map((i) => i.path)).toContain("answers[0].correct");
  });
  it("rejects a select value outside its options", async () => {
    const bad = goodMc(); (bad.params.behaviour as Record<string, unknown>)["type"] = "banana";
    expect((await validateParams(bad, reg, noMedia())).some((i) => i.path === "behaviour.type")).toBe(true);
  });
  it("applies the missing-value rule: required list and scalar are errors, group and defaulted text are not", async () => {
    const noAnswers = goodMc(); delete (noAnswers.params as Record<string, unknown>)["answers"];
    expect((await validateParams(noAnswers, reg, noMedia())).map((i) => i.path)).toContain("answers");
    const noQuestion = goodMc(); delete (noQuestion.params as Record<string, unknown>)["question"];
    expect((await validateParams(noQuestion, reg, noMedia())).map((i) => i.path)).toContain("question");
    expect(await validateParams(goodMc(), reg, noMedia())).toEqual([]); // `media` group and `overallFeedback` absent: fine
    const blanksNoText = { library: "H5P.Blanks 1.14", params: { questions: ["<p>*a*</p>"] }, metadata: { contentType: "Fill in the Blanks", license: "U" as const, title: "t" } };
    expect((await validateParams(blanksNoText, reg, noMedia())).map((i) => i.path)).not.toContain("text"); // has a default
  });
  it("enforces list bounds and object shape", async () => {
    const empty = goodMc(); (empty.params as Record<string, unknown>)["answers"] = [];
    expect((await validateParams(empty, reg, noMedia())).some((i) => i.path === "answers" && /min 1/.test(i.message))).toBe(true);
    const arrGroup = goodMc(); (arrGroup.params as Record<string, unknown>)["behaviour"] = [];
    expect((await validateParams(arrGroup, reg, noMedia())).some((i) => i.path === "behaviour" && /object/.test(i.message))).toBe(true);
    const tooMany = { library: "H5P.Blanks 1.14", params: { text: "x", questions: Array.from({ length: 32 }, () => "<p>*a*</p>") }, metadata: { contentType: "Fill in the Blanks", license: "U" as const, title: "t" } };
    expect((await validateParams(tooMany, reg, noMedia())).some((i) => i.path === "questions" && /max 31/.test(i.message))).toBe(true);
  });
  it("validates nested library params recursively and enforces the options list", async () => {
    const qs = {
      library: "H5P.QuestionSet 1.20",
      params: { questions: [{ library: "H5P.Flashcards 1.5", params: { cards: [] }, metadata: { contentType: "x", license: "U", title: "t" }, subContentId: "00000000-0000-4000-8000-000000000000" }] },
      metadata: { contentType: "Question Set", license: "U" as const, title: "t" }
    };
    const issues = await validateParams(qs, reg, noMedia());
    expect(issues.some((i) => i.path === "questions[0].library" && /not allowed/.test(i.message))).toBe(true);

    const nested = {
      library: "H5P.QuestionSet 1.20",
      params: { questions: [{ ...goodMc(), params: { ...goodMc().params, answers: "nope" }, subContentId: "00000000-0000-4000-8000-000000000000" }] },
      metadata: { contentType: "Question Set", license: "U" as const, title: "t" }
    };
    expect((await validateParams(nested, reg, noMedia())).map((i) => i.path)).toContain("questions[0].params.answers");
  });
  it("reports a media path that is not in the package", async () => {
    const withMedia = goodMc(); (withMedia.params as Record<string, unknown>)["media"] = { type: { library: "H5P.Image 1.1", params: { file: { path: "images/1.png", mime: "image/png", width: 10, height: 10 } }, metadata: { contentType: "Image", license: "U", title: "i" }, subContentId: "00000000-0000-4000-8000-000000000001" } };
    const issues = await validateParams(withMedia, reg, noMedia());
    expect(issues.some((i) => /media path images\/1\.png/.test(i.message))).toBe(true);
    expect(await validateParams(withMedia, reg, new Map([["images/1.png", "asset-1"]]))).toEqual([]);
  });
  it("closure check flags a referenced library missing from the closure", async () => {
    const issues = await checkClosure(goodMc(), reg, ["H5P.Flashcards-1.5"]);
    expect(issues.some((i) => /H5P.MultiChoice-1.16/.test(i.message))).toBe(true);
    expect(await checkClosure(goodMc(), reg, ["H5P.MultiChoice-1.16"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/engine/src/validator/semantics.ts`:
```ts
import type { ValidationIssue } from "../errors.js";
import type { H5PContent, H5PParams } from "../params.js";
import { libraryKey } from "../lock.js";
import type { LibraryRegistry, SemanticField } from "../registry.js";

/** "H5P.MultiChoice 1.16" -> "H5P.MultiChoice-1.16" */
export function libraryStringToKey(s: string): string {
  const m = /^(\S+)\s+(\d+)\.(\d+)$/.exec(s);
  if (!m) throw new Error(`bad library string: ${s}`);
  return libraryKey(m[1]!, Number(m[2]), Number(m[3]));
}

export async function validateParams(content: H5PContent, registry: LibraryRegistry, mediaPaths: ReadonlyMap<string, string>): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  await validateContent(content, "", registry, mediaPaths, issues);
  return issues;
}

async function validateContent(content: H5PContent, base: string, registry: LibraryRegistry, media: ReadonlyMap<string, string>, issues: ValidationIssue[]): Promise<void> {
  const key = libraryStringToKey(content.library);
  const fields = await registry.semantics(key);
  if (!fields) return;
  const prefix = base ? `${base}.` : "";
  for (const field of fields) {
    await validateField(content.params[field.name], field, `${prefix}${field.name}`, registry, media, issues);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function validateField(value: unknown, field: SemanticField, path: string, registry: LibraryRegistry, media: ReadonlyMap<string, string>, issues: ValidationIssue[]): Promise<void> {
  if (value === undefined || value === null) {
    const acceptable = Boolean(field["optional"]) || field["default"] !== undefined || field.type === "group";
    if (!acceptable) issues.push({ path, message: `missing required ${field.type}` });
    return;
  }
  switch (field.type) {
    case "text":
      if (typeof value !== "string") issues.push({ path, message: "expected string" });
      return;
    case "number":
      if (typeof value !== "number") { issues.push({ path, message: "expected number" }); return; }
      if (typeof field["min"] === "number" && value < (field["min"] as number)) issues.push({ path, message: `below min ${field["min"]}` });
      if (typeof field["max"] === "number" && value > (field["max"] as number)) issues.push({ path, message: `above max ${field["max"]}` });
      return;
    case "boolean":
      if (typeof value !== "boolean") issues.push({ path, message: "expected boolean" });
      return;
    case "select": {
      const options = (field["options"] as Array<{ value: string }> | undefined)?.map((o) => o.value) ?? [];
      if (typeof value !== "string" || !options.includes(value)) issues.push({ path, message: `value ${JSON.stringify(value)} not in options [${options.join(", ")}]` });
      return;
    }
    case "list": {
      if (!Array.isArray(value)) { issues.push({ path, message: "expected array" }); return; }
      const min = field["min"]; const max = field["max"];
      if (typeof min === "number" && value.length < min) issues.push({ path, message: `list has ${value.length} items, below min ${min}` });
      if (typeof max === "number" && value.length > max) issues.push({ path, message: `list has ${value.length} items, above max ${max}` });
      const itemField = field["field"] as SemanticField;
      for (let i = 0; i < value.length; i++) await validateField(value[i], itemField, `${path}[${i}]`, registry, media, issues);
      return;
    }
    case "group": {
      if (!isPlainObject(value)) { issues.push({ path, message: "expected object for group" }); return; }
      const sub = field["fields"] as SemanticField[];
      for (const f of sub) await validateField((value as H5PParams)[f.name], f, `${path}.${f.name}`, registry, media, issues);
      return;
    }
    case "library": {
      if (!isPlainObject(value)) { issues.push({ path, message: "expected library content object" }); return; }
      const c = value as Partial<H5PContent>;
      if (typeof c.library !== "string") { issues.push({ path, message: "expected library content object with a library string" }); return; }
      const allowed = (field["options"] as string[] | undefined) ?? [];
      if (allowed.length > 0 && !allowed.includes(c.library)) { issues.push({ path: `${path}.library`, message: `library ${c.library} not allowed here (allowed: ${allowed.join(", ")})` }); return; }
      if (!isPlainObject(c.params)) { issues.push({ path: `${path}.params`, message: "expected params object" }); return; }
      await validateContent(c as H5PContent, `${path}.params`, registry, media, issues);
      return;
    }
    case "image": case "video": case "audio": case "file": {
      const entries = Array.isArray(value) ? value : [value];
      for (const e of entries) {
        const p = (e as { path?: unknown }).path;
        if (typeof p !== "string") { issues.push({ path, message: `${field.type} needs a path` }); continue; }
        if (/^https?:\/\//.test(p)) continue;
        if (!media.has(p)) issues.push({ path, message: `media path ${p} is not in the package` });
      }
      return;
    }
    default:
      return;
  }
}
```

`packages/engine/src/validator/closure.ts`:
```ts
import type { ValidationIssue } from "../errors.js";
import type { H5PContent } from "../params.js";
import type { LibraryRegistry } from "../registry.js";
import { libraryStringToKey } from "./semantics.js";

/** Every `library` string reachable in the content tree, as lock keys, deduplicated. */
export function collectLibraries(content: H5PContent): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o["library"] === "string" && o["params"] && typeof o["params"] === "object") out.add(libraryStringToKey(o["library"]));
      Object.values(o).forEach(walk);
    }
  };
  walk(content);
  return [...out].sort();
}

export async function checkClosure(content: H5PContent, registry: LibraryRegistry, closureKeys: string[]): Promise<ValidationIssue[]> {
  const have = new Set(closureKeys);
  const issues: ValidationIssue[] = [];
  for (const key of collectLibraries(content)) {
    registry.get(key);
    if (!have.has(key)) issues.push({ path: "", message: `library ${key} is referenced in params but not in the package dependency closure` });
  }
  return issues;
}
```

- [ ] **Step 3: Run to see it pass**

Run: `pnpm test`. If the `select` test does not fail on `behaviour.type`, print the `behaviour` group from `await reg.semantics("H5P.MultiChoice-1.16")` and use a field that is really a `select` in that group; adjust the test's field name, not the validator.

- [ ] **Step 4: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): recursive semantics validation with library options, media and closure checks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: HTML contract, then handlers for `multiChoice`, `blanks`, `flashcards` with golden and validator tests

**Files:**
- Create: `packages/engine/src/html.ts`, `packages/engine/test/html.test.ts`
- Create: `packages/engine/src/handlers/multi-choice.ts`, `blanks.ts`, `flashcards.ts`, `index.ts`
- Create: `packages/engine/test/fixtures/specs/multi-choice.json`, `blanks.json`, `flashcards.json`, `packages/engine/test/fixtures/assets/card.png` (any small PNG; generate with `python3 -c "import zlib,struct;..."` or copy `apps/cli-legacy/tests/test-image.jpg` as `card.jpg` and use that)
- Test: `packages/engine/test/golden.test.ts`

**Interfaces:**
- Produces: `sanitizeHtml(html: string): string` (allow-list: `p, br, strong, em, b, i, u, ul, ol, li, h2, h3, h4, code, pre, blockquote, sub, sup, span, a[href=http|https|mailto]`, no styles, no event attributes) and `escapeHtml(text: string): string`; `createHandlerRegistry(): Map<ActivitySpec["type"], ActivityHandler>`; each handler's `build` returns an `H5PContent` that passes `validateParams` against the locked semantics and applies the text-handling contract from Global Constraints.

- [ ] **Step 0: HTML contract**

`packages/engine/test/html.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sanitizeHtml, escapeHtml } from "../src/html.js";

describe("html contract", () => {
  it("keeps allowed formatting and strips scripts, styles and handlers", () => {
    expect(sanitizeHtml('<p onclick="x()">Hi <strong>there</strong><script>alert(1)</script></p><style>p{}</style>')).toBe("<p>Hi <strong>there</strong></p>");
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="https://example.com">y</a>')).toBe('<a>x</a><a href="https://example.com">y</a>');
  });
  it("escapes plain text", () => {
    expect(escapeHtml('1 < 2 & "q" *a/b:c*')).toBe("1 &lt; 2 &amp; &quot;q&quot; *a/b:c*");
  });
});
```

`packages/engine/src/html.ts`:
```ts
import sanitize from "sanitize-html";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "code", "pre", "blockquote", "sub", "sup", "span", "a"];

export function sanitizeHtml(html: string): string {
  return sanitize(html, { allowedTags: ALLOWED_TAGS, allowedAttributes: { a: ["href"] }, allowedSchemes: ["http", "https", "mailto"], disallowedTagsMode: "discard" });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```
Run `pnpm test -- html`; expected pass. (`sanitize-html` drops the `javascript:` href but keeps the anchor text, matching the assertion.)

- [ ] **Step 1: Fixtures**

`test/fixtures/specs/multi-choice.json`:
```json
{ "id": "mc-1", "title": "Safety signs", "type": "multiChoice",
  "question": "<p>Which sign means <em>mandatory</em> action?</p>",
  "answers": [
    { "text": "Blue circle", "correct": true, "feedbackChosen": "Correct: blue circles are mandatory." },
    { "text": "Red circle with a bar", "correct": false, "feedbackChosen": "That is a prohibition sign." },
    { "text": "Yellow triangle", "correct": false }
  ],
  "provenance": { "conceptIds": ["c-signs"], "evidenceIds": ["e-12"], "criteriaIds": ["PC1.2"] } }
```
`test/fixtures/specs/blanks.json`:
```json
{ "id": "bl-1", "title": "PPE", "type": "blanks", "taskDescription": "Fill the gaps.",
  "passage": "Before entering the site, put on your {{b1}} and {{b2}}.",
  "blanks": [ { "id": "b1", "answers": ["hard hat", "helmet"] }, { "id": "b2", "answers": ["boots"], "tip": "Protects your feet" } ] }
```
`test/fixtures/specs/flashcards.json`:
```json
{ "id": "fc-1", "title": "Tools", "type": "flashcards", "description": "Name the tool.",
  "cards": [ { "id": "c1", "front": "Used to tighten hex nuts", "back": "Spanner", "tip": "Not a wrench" }, { "id": "c2", "front": "Cuts timber", "back": "Saw", "imageAssetId": "card", "imageAlt": "A hand saw" } ] }
```

- [ ] **Step 2: Write the failing golden test**

`packages/engine/test/golden.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";
import { createHandlerRegistry } from "../src/handlers/index.js";
import { createIdFactory } from "../src/ids.js";
import { validateParams } from "../src/validator/semantics.js";
import { checkClosure } from "../src/validator/closure.js";
import type { BuildContext } from "../src/handlers/handler.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
let reg: LibraryRegistry;
beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

function asset(id: string, file: string, mimeType: string): AssetEntry {
  const p = resolve(fixtures, "assets", file);
  return { assetId: id, sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType, open: () => createReadStream(p) };
}

const cases = ["multi-choice", "blanks", "flashcards"] as const;

describe.each(cases)("golden: %s", (name) => {
  it("builds params that validate, reference only locked libraries, and match the snapshot", async () => {
    const spec = ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${name}.json`), "utf8")));
    const handlers = createHandlerRegistry();
    const handler = handlers.get(spec.type)!;
    const ctx: BuildContext = { registry: reg, ids: createIdFactory(spec.id, 1), assets: new Map([["card", asset("card", "card.jpg", "image/jpeg")]]), mediaPaths: new Map() };
    const content = handler.build(spec as never, ctx);
    const main = reg.resolve(handler.mainLibrary);
    expect(content.library).toBe(`${main.machineName} ${main.majorVersion}.${main.minorVersion}`);
    expect(await validateParams(content, reg, ctx.mediaPaths)).toEqual([]);
    const closure = (await reg.closure(handler.requiredLibraries(spec as never).map((n) => { const l = reg.resolve(n); return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`; }))).map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
    expect(await checkClosure(content, reg, closure)).toEqual([]);
    expect(content).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Run to see it fail**, then implement the three handlers.

`packages/engine/src/handlers/multi-choice.ts`:
```ts
import type { MultiChoiceSpec } from "@leaplearn/shared";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

function key(ctx: BuildContext, name: string): string {
  const l = ctx.registry.resolve(name);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

export const multiChoiceHandler: ActivityHandler<MultiChoiceSpec> = {
  type: "multiChoice",
  mainLibrary: "H5P.MultiChoice",
  requiredLibraries: () => ["H5P.MultiChoice"],
  build(spec, ctx): H5PContent {
    return {
      library: ctx.registry.libraryString(key(ctx, "H5P.MultiChoice")),
      params: {
        question: sanitizeHtml(spec.question),
        answers: spec.answers.map((a) => ({
          text: `<div>${escapeHtml(a.text)}</div>`,
          correct: a.correct,
          tipsAndFeedback: { tip: "", chosenFeedback: escapeHtml(a.feedbackChosen ?? ""), notChosenFeedback: escapeHtml(a.feedbackNotChosen ?? "") }
        })),
        overallFeedback: [{ from: 0, to: 100 }],
        behaviour: {
          enableRetry: true, enableSolutionsButton: true, enableCheckButton: true,
          type: "auto", singlePoint: false, randomAnswers: spec.randomAnswers,
          showSolutionsRequiresInput: true, confirmCheckDialog: false, confirmRetryDialog: false,
          autoCheck: false, passPercentage: 100, showScorePoints: true
        },
        UI: {
          checkAnswerButton: "Check", submitAnswerButton: "Submit", showSolutionButton: "Show solution", tryAgainButton: "Retry",
          tipsLabel: "Show tip", scoreBarLabel: "You got :num out of :total points",
          tipAvailable: "Tip available", feedbackAvailable: "Feedback available", readFeedback: "Read feedback",
          wrongAnswer: "Wrong answer", correctAnswer: "Correct answer", shouldCheck: "Should have been checked", shouldNotCheck: "Should not have been checked",
          noInput: "Please answer before viewing the solution",
          a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
          a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
          a11yRetry: "Retry the task. Reset all responses and start the task over again."
        },
        confirmCheck: { header: "Finish ?", body: "Are you sure you wish to finish ?", cancelLabel: "Cancel", confirmLabel: "Finish" },
        confirmRetry: { header: "Retry ?", body: "Are you sure you wish to retry ?", cancelLabel: "Cancel", confirmLabel: "Confirm" }
      },
      metadata: { contentType: "Multiple Choice", license: "U", title: spec.title }
    };
  }
};
```

`packages/engine/src/handlers/blanks.ts`:
```ts
import { BLANK_TOKEN, type BlanksSpec } from "@leaplearn/shared";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

function key(ctx: BuildContext, name: string): string {
  const l = ctx.registry.resolve(name);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

/**
 * Turns "{{b1}}" tokens into H5P.Blanks "*answer1/answer2:tip*" markers. The passage is plain text
 * and is HTML-escaped; the schema has already rejected answers or tips containing "*", "/" or ":",
 * so nothing is altered here. Escaping happens before substitution so the markers stay intact.
 */
export function toBlanksMarkup(passage: string, blanks: BlanksSpec["blanks"]): string {
  const byId = new Map(blanks.map((b) => [b.id, b]));
  const escapedPassage = escapeHtml(passage);
  return escapedPassage.replace(BLANK_TOKEN, (_m, id: string) => {
    const b = byId.get(id)!;
    const answers = b.answers.map(escapeHtml).join("/");
    return `*${answers}${b.tip ? `:${escapeHtml(b.tip)}` : ""}*`;
  });
}

export const blanksHandler: ActivityHandler<BlanksSpec> = {
  type: "blanks",
  mainLibrary: "H5P.Blanks",
  requiredLibraries: () => ["H5P.Blanks"],
  build(spec, ctx): H5PContent {
    return {
      library: ctx.registry.libraryString(key(ctx, "H5P.Blanks")),
      params: {
        text: spec.taskDescription ? sanitizeHtml(`<p>${spec.taskDescription}</p>`) : "",
        questions: [`<p>${toBlanksMarkup(spec.passage, spec.blanks)}</p>`],
        overallFeedback: [{ from: 0, to: 100, feedback: "You got @score of @total blanks correct." }],
        showSolutions: "Show solutions", tryAgain: "Try again", checkAnswer: "Check", submitAnswer: "Submit",
        notFilledOut: "Please fill in all blanks", answerIsCorrect: "':ans' is correct", answerIsWrong: "':ans' is wrong",
        answeredCorrectly: "Answered correctly", answeredIncorrectly: "Answered incorrectly", solutionLabel: "Correct answer:",
        inputLabel: "Blank input @num of @total", inputHasTipLabel: "Tip available", tipLabel: "Tip",
        behaviour: {
          enableRetry: true, enableSolutionsButton: true, enableCheckButton: true, autoCheck: false,
          caseSensitive: spec.caseSensitive, showSolutionsRequiresInput: true, separateLines: false,
          confirmCheckDialog: false, confirmRetryDialog: false, acceptSpellingErrors: false
        },
        confirmCheck: { header: "Finish ?", body: "Are you sure?", cancelLabel: "Cancel", confirmLabel: "Finish" },
        confirmRetry: { header: "Retry ?", body: "Are you sure?", cancelLabel: "Cancel", confirmLabel: "Confirm" },
        scoreBarLabel: "You got :num out of :total points",
        a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
        a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
        a11yRetry: "Retry the task. Reset all responses and start the task over again.",
        a11yCheckingModeHeader: "Checking mode"
      },
      metadata: { contentType: "Fill in the Blanks", license: "U", title: spec.title }
    };
  }
};
```

`packages/engine/src/handlers/flashcards.ts`:
```ts
import type { FlashcardsSpec } from "@leaplearn/shared";
import { EngineError } from "../errors.js";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { escapeHtml } from "../html.js";

function key(ctx: BuildContext, name: string): string {
  const l = ctx.registry.resolve(name);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

export const flashcardsHandler: ActivityHandler<FlashcardsSpec> = {
  type: "flashcards",
  mainLibrary: "H5P.Flashcards",
  requiredLibraries: () => ["H5P.Flashcards"],
  build(spec, ctx): H5PContent {
    const cards = spec.cards.map((c) => {
      const card: Record<string, unknown> = { text: escapeHtml(c.front), answer: c.back };
      if (c.tip) card["tip"] = escapeHtml(c.tip);
      if (c.imageAssetId) {
        const a = ctx.assets.get(c.imageAssetId);
        if (!a) throw new EngineError(`asset ${c.imageAssetId} is not in the manifest`, "ASSET_MISSING");
        const ext = EXT[a.mimeType];
        if (!ext) throw new EngineError(`unsupported image type ${a.mimeType}`, "ASSET_TYPE");
        const path = `images/${spec.id}-${c.id}.${ext}`;
        ctx.mediaPaths.set(path, c.imageAssetId);
        card["image"] = { path, mime: a.mimeType, copyright: { license: "U" }, alt: escapeHtml(c.imageAlt ?? "") };
      }
      return card;
    });
    return {
      library: ctx.registry.libraryString(key(ctx, "H5P.Flashcards")),
      params: {
        description: escapeHtml(spec.description ?? ""),
        cards,
        progressText: "Card @card of @total", next: "Next", previous: "Previous", checkAnswerText: "Check",
        showSolutionsRequiresInput: true, defaultAnswerText: "Your answer", correctAnswerText: "Correct",
        incorrectAnswerText: "Incorrect", showSolutionText: "Correct answer", results: "Results",
        ofCorrect: "@score of @total correct", showResults: "Show results", answerShortText: "A:", retry: "Retry",
        caseSensitive: false, cardAnnouncement: "Incorrect answer. Correct answer was @answer",
        pageAnnouncement: "Page @current of @total"
      },
      metadata: { contentType: "Flashcards", license: "U", title: spec.title }
    };
  }
};
```

`packages/engine/src/handlers/index.ts`:
```ts
import type { ActivitySpec } from "@leaplearn/shared";
import type { ActivityHandler } from "./handler.js";
import { multiChoiceHandler } from "./multi-choice.js";
import { blanksHandler } from "./blanks.js";
import { flashcardsHandler } from "./flashcards.js";

export function createHandlerRegistry(): Map<ActivitySpec["type"], ActivityHandler> {
  const list: ActivityHandler[] = [multiChoiceHandler as ActivityHandler, blanksHandler as ActivityHandler, flashcardsHandler as ActivityHandler];
  return new Map(list.map((h) => [h.type, h]));
}
```

- [ ] **Step 4: Run; iterate on params until the validator passes**

Run: `pnpm test -- golden`. The validator will report any label or behaviour field whose name or type differs from the locked `semantics.json`. For each issue, open the semantics (`unzip -p libraries/cache/H5P.Blanks-1.14.h5p H5P.Blanks-1.14/semantics.json | python3 -m json.tool | less`) and correct the param name or type in the handler. Do not weaken the validator. When green, the first run writes `test/__snapshots__/golden.test.ts.snap`; inspect it once, then commit it.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): multiChoice, blanks and flashcards handlers with golden and validator tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Containers: `questionSet` and `interactiveBook`, plus the nested fixture

**Files:**
- Create: `packages/engine/src/handlers/question-set.ts`, `packages/engine/src/handlers/interactive-book.ts`
- Modify: `packages/engine/src/handlers/index.ts`
- Create: `packages/engine/test/fixtures/specs/question-set-nested.json`, `interactive-book.json`, `interactive-book-nested.json` (a book containing a question set: the combination that exercises two levels of scoped ids)
- Modify: `packages/engine/test/golden.test.ts` (`cases` gains the three names)

**Interfaces:**
- Produces: handlers whose `build` recursively calls child handlers with `ctx.ids.scope("questions/0")` so every nested id derives from the root activity id and revision, and whose `requiredLibraries` union the children's; the book handler adds `H5P.InteractiveBook`, `H5P.Column`, `H5P.Row`, `H5P.RowColumn`, `H5P.AdvancedText`, and `H5P.Image` when image pages exist.

- [ ] **Step 1: Fixtures**

`question-set-nested.json`:
```json
{ "id": "qs-1", "title": "Site induction check", "type": "questionSet", "introduction": "<p>Three quick questions.</p>", "passPercentage": 66,
  "children": [
    { "id": "qs-1-q1", "title": "Signs", "type": "multiChoice", "question": "<p>Blue circle means?</p>", "answers": [ { "text": "Mandatory", "correct": true }, { "text": "Prohibited", "correct": false } ] },
    { "id": "qs-1-q2", "title": "PPE", "type": "blanks", "passage": "Wear your {{b1}}.", "blanks": [ { "id": "b1", "answers": ["hard hat"] } ] }
  ] }
```
`interactive-book.json`:
```json
{ "id": "bk-1", "title": "Induction", "type": "interactiveBook",
  "chapters": [
    { "title": "Welcome", "items": [ { "type": "text", "title": "Intro", "html": "<p>Welcome to site.</p>" } ] },
    { "title": "Check", "items": [
      { "id": "bk-1-mc", "title": "Signs", "type": "multiChoice", "question": "<p>Blue circle means?</p>", "answers": [ { "text": "Mandatory", "correct": true }, { "text": "Prohibited", "correct": false } ] },
      { "id": "bk-1-fc", "title": "Tools", "type": "flashcards", "cards": [ { "id": "c1", "front": "f", "back": "b" } ] } ] } ] }
```
`interactive-book-nested.json`:
```json
{ "id": "bk-2", "title": "Induction with quiz", "type": "interactiveBook",
  "chapters": [
    { "title": "Welcome", "items": [ { "type": "text", "title": "Intro", "html": "<p>Welcome.</p>" } ] },
    { "title": "Quiz", "items": [
      { "id": "bk-2-qs", "title": "Check", "type": "questionSet", "passPercentage": 50,
        "children": [
          { "id": "bk-2-qs-q1", "title": "Signs", "type": "multiChoice", "question": "<p>Blue circle means?</p>", "answers": [ { "text": "Mandatory", "correct": true }, { "text": "Prohibited", "correct": false } ] },
          { "id": "bk-2-qs-q2", "title": "PPE", "type": "blanks", "passage": "Wear your {{b1}}.", "blanks": [ { "id": "b1", "answers": ["hard hat"] } ] } ] } ] } ] }
```

- [ ] **Step 2: Extend the golden test**

Change `const cases = ["multi-choice", "blanks", "flashcards"] as const;` to include `"question-set-nested", "interactive-book", "interactive-book-nested"`. Add one more assertion to the golden test body, after the snapshot:
```ts
    const ids = JSON.stringify(content).match(/"subContentId":"([^"]+)"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length); // no duplicate sub-content ids anywhere in the tree
```
Run: `pnpm test -- golden`. Expected: the three new cases fail with `handlers.get(...)` undefined.

- [ ] **Step 3: Implement `question-set.ts`**

```ts
import type { QuestionSetSpec } from "@leaplearn/shared";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

export function createQuestionSetHandler(children: Map<string, ActivityHandler>): ActivityHandler<QuestionSetSpec> {
  const key = (ctx: BuildContext, name: string): string => { const l = ctx.registry.resolve(name); return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`; };
  return {
    type: "questionSet",
    mainLibrary: "H5P.QuestionSet",
    requiredLibraries: (spec) => ["H5P.QuestionSet", ...new Set(spec.children.flatMap((c) => children.get(c.type)!.requiredLibraries(c as never)))],
    build(spec, ctx): H5PContent {
      const questions = spec.children.map((child, i) => {
        const h = children.get(child.type)!;
        const childCtx: BuildContext = { ...ctx, ids: ctx.ids.scope(`questions/${i}`) };
        return { ...h.build(child as never, childCtx), subContentId: ctx.ids.subContentId(`questions/${i}`) };
      });
      return {
        library: ctx.registry.libraryString(key(ctx, "H5P.QuestionSet")),
        params: {
          introPage: { showIntroPage: Boolean(spec.introduction), title: escapeHtml(spec.title), introduction: sanitizeHtml(spec.introduction ?? ""), startButtonText: "Start Quiz" },
          progressType: "dots", passPercentage: spec.passPercentage, disableBackwardsNavigation: false, randomQuestions: spec.randomQuestions,
          questions,
          texts: { prevButton: "Previous question", nextButton: "Next question", finishButton: "Finish", submitButton: "Submit", textualProgress: "Question: @current of @total questions", jumpToQuestion: "Question %d of %total", questionLabel: "Question", readSpeakerProgress: "Question @current of @total", unansweredText: "Unanswered", answeredText: "Answered", currentQuestionText: "Current question", navigationLabel: "Questions" },
          endGame: { showResultPage: true, showSolutionButton: true, showRetryButton: true, noResultMessage: "Finished", message: "Your result:", scoreBarLabel: "You got @finals out of @totals points", overallFeedback: [{ from: 0, to: 100 }], solutionButtonText: "Show solution", retryButtonText: "Retry", finishButtonText: "Finish", submitButtonText: "Submit", showAnimations: false, skippable: false, skipButtonText: "Skip video" },
          override: { checkButton: true }
        },
        metadata: { contentType: "Question Set", license: "U", title: spec.title }
      };
    }
  };
}
```

- [ ] **Step 4: Implement `interactive-book.ts`** (the Column/Row/RowColumn wrapping ported from `apps/cli-legacy/src/compiler/ChapterBuilder.ts:56-108`)

```ts
import type { InteractiveBookSpec, BookItem } from "@leaplearn/shared";
import { EngineError } from "../errors.js";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

export function createInteractiveBookHandler(children: Map<string, ActivityHandler>): ActivityHandler<InteractiveBookSpec> {
  const key = (ctx: BuildContext, name: string): string => { const l = ctx.registry.resolve(name); return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`; };
  const lib = (ctx: BuildContext, name: string): string => ctx.registry.libraryString(key(ctx, name));

  function pageContent(item: BookItem, ctx: BuildContext, path: string): H5PContent {
    switch (item.type) {
      case "text":
        return { library: lib(ctx, "H5P.AdvancedText"), params: { text: `<h2>${escapeHtml(item.title)}</h2>${sanitizeHtml(item.html)}` }, metadata: { contentType: "Text", license: "U", title: item.title } };
      case "image": {
        const a = ctx.assets.get(item.assetId);
        if (!a) throw new EngineError(`asset ${item.assetId} is not in the manifest`, "ASSET_MISSING");
        const ext = a.mimeType === "image/png" ? "png" : a.mimeType === "image/jpeg" ? "jpg" : null;
        if (!ext) throw new EngineError(`unsupported image type ${a.mimeType}`, "ASSET_TYPE");
        const p = `images/${path.replace(/\//g, "-")}.${ext}`;
        ctx.mediaPaths.set(p, item.assetId);
        return { library: lib(ctx, "H5P.Image"), params: { contentName: "Image", file: { path: p, mime: a.mimeType, copyright: { license: "U" } }, alt: escapeHtml(item.alt), title: escapeHtml(item.title) }, metadata: { contentType: "Image", license: "U", title: item.title } };
      }
      case "audio": case "video":
        throw new EngineError(`${item.type} pages are not implemented in phase 1`, "NOT_IMPLEMENTED");
      default: {
        const h = children.get(item.type);
        if (!h) throw new EngineError(`no handler for ${item.type}`, "HANDLER_MISSING");
        return h.build(item as never, { ...ctx, ids: ctx.ids.scope(path) });
      }
    }
  }

  function wrap(content: H5PContent, ctx: BuildContext, path: string): unknown {
    const inner = { ...content, subContentId: ctx.ids.subContentId(`${path}/content`) };
    const rowColumn = { params: { content: [inner] }, library: lib(ctx, "H5P.RowColumn"), subContentId: ctx.ids.subContentId(`${path}/rowColumn`), metadata: { contentType: "Column", license: "U", title: "Untitled Column" } };
    const row = { params: { columns: [{ width: 100, content: rowColumn }] }, library: lib(ctx, "H5P.Row"), subContentId: ctx.ids.subContentId(`${path}/row`), metadata: { contentType: "Row", license: "U", title: "Untitled Row" } };
    return { content: row, useSeparator: "auto" };
  }

  return {
    type: "interactiveBook",
    mainLibrary: "H5P.InteractiveBook",
    requiredLibraries: (spec) => {
      const libs = new Set(["H5P.InteractiveBook", "H5P.Column", "H5P.Row", "H5P.RowColumn"]);
      for (const ch of spec.chapters) for (const it of ch.items) {
        if (it.type === "text") libs.add("H5P.AdvancedText");
        else if (it.type === "image") libs.add("H5P.Image");
        else if (it.type === "audio" || it.type === "video") continue;
        else children.get(it.type)!.requiredLibraries(it as never).forEach((l) => libs.add(l));
      }
      return [...libs];
    },
    build(spec, ctx): H5PContent {
      const chapters = spec.chapters.map((ch, ci) => ({
        params: { content: ch.items.map((it, ii) => wrap(pageContent(it, ctx, `chapters/${ci}/items/${ii}`), ctx, `chapters/${ci}/items/${ii}`)) },
        library: lib(ctx, "H5P.Column"),
        subContentId: ctx.ids.subContentId(`chapters/${ci}`),
        metadata: { contentType: "Column", license: "U", title: ch.title }
      }));
      return {
        library: lib(ctx, "H5P.InteractiveBook"),
        params: {
          showCoverPage: Boolean(spec.coverDescription),
          bookCover: { coverDescription: spec.coverDescription ? sanitizeHtml(`<p>${spec.coverDescription}</p>`) : "" },
          chapters,
          behaviour: { defaultTableOfContents: true, progressIndicators: true, progressAuto: true, displaySummary: true, enableRetry: true },
          read: "Read", displayTOC: "Display 'Table of contents'", hideTOC: "Hide 'Table of contents'", nextPage: "Next page", previousPage: "Previous page", chapterCompleted: "Page completed!", partCompleted: "@pages of @total completed", incompleteChapter: "Incomplete page", navigateToTop: "Go to the top", markAsFinished: "I have finished this page", fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen", bookProgressSubtext: "@count of @total pages", interactionsProgressSubtext: "@count of @total interactions", submitReport: "Submit Report", restartLabel: "Restart", summaryHeader: "Summary", allInteractions: "All interactions", unansweredInteractions: "Unanswered interactions", scoreText: "@score / @maxscore", leftOutOfTotalCompleted: "@left of @max interactions completed", noInteractions: "No interactions", score: "Score", summaryAndSubmit: "Summary & submit", noChapterInteractionBoldText: "You have not interacted with any pages.", noChapterInteractionText: "You have to interact with at least one page before you can see the summary.", yourAnswersAreSubmittedForReview: "Your answers are submitted for review!", bookProgress: "Book progress", interactionsProgress: "Interactions progress", totalScoreLabel: "Total score"
        },
        metadata: { contentType: "Interactive Book", license: "U", title: spec.title }
      };
    }
  };
}
```

Update `handlers/index.ts`:
```ts
import { createQuestionSetHandler } from "./question-set.js";
import { createInteractiveBookHandler } from "./interactive-book.js";

export function createHandlerRegistry(): Map<ActivitySpec["type"], ActivityHandler> {
  const map = new Map<ActivitySpec["type"], ActivityHandler>();
  for (const h of [multiChoiceHandler, blanksHandler, flashcardsHandler]) map.set(h.type, h as ActivityHandler);
  map.set("questionSet", createQuestionSetHandler(map) as ActivityHandler);
  map.set("interactiveBook", createInteractiveBookHandler(map) as ActivityHandler);
  return map;
}
```

- [ ] **Step 5: Run the golden suite; fix params against semantics as in Task 9 step 4**

The nested case is the one that proves recursive validation: if you deliberately change the child `multiChoice`'s `answers` to a string in the fixture, `validateParams` must report `questions[0].params.answers`; try it once, then revert. Confirm `checkClosure` passes for both books: the closure must contain `H5P.Column-1.18`, `H5P.Row-1.0`, `H5P.RowColumn-1.0`, `H5P.AdvancedText-1.1`, and for `interactive-book-nested` also `H5P.QuestionSet-1.20`. The duplicate-id assertion added in step 2 must hold for `interactive-book-nested`, which is the case where two containers nest.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): questionSet and interactiveBook containers with nested validation fixture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Deterministic assembler and the public `compile` API

**Files:**
- Create: `packages/engine/src/assembler.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/determinism.test.ts`

**Interfaces:**
- Produces: `compile(spec: ActivitySpec, assets: AssetManifest, output: NodeJS.WritableStream, options: CompileOptions): Promise<CompileResult>` (the caller owns the stream and its cleanup; on any error the promise rejects and the stream is destroyed); `compileToFile(spec, assets, path: string, options): Promise<CompileResult>` (writes `${path}.tmp-<random>` and renames onto `path` only after success, deleting the temp file on failure, so a failed build never leaves a partial `.h5p` at the target); `compileToBuffer(spec, assets, options): Promise<Buffer>`; `validate(spec, assets: AssetManifest, options): Promise<ValidationIssue[]>` (takes the manifest so an image-bearing activity can be validated before compilation); `CompileOptions = { registry: LibraryRegistry; revision?: number; logger?: Logger }`; `CompileResult = { mainLibrary: string; libraries: string[]; entries: string[]; contentJson: H5PParams }`; `Logger = { info(msg: string): void; warn(msg: string): void }`. Re-exports: `createRegistry`, `LibraryRegistry`, `libraryKey`, `LibraryLock`, `LockedLibrary`, `EngineError`, `ValidationError`, `createHandlerRegistry`, `sanitizeHtml`, `escapeHtml`.
- **Failure propagation in the assembler:** errors from an asset source stream, the hashing transform, the `ZipFile` emitter, `zip.outputStream` and the destination all reject the same promise; a hash or length mismatch rejects as soon as the asset stream ends (not after the destination finishes); on rejection every stream is destroyed. Tests cover a source error, a destination error, a length mismatch and a hash mismatch.

- [ ] **Step 1: Write the failing test**

`packages/engine/test/determinism.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, createReadStream, statSync } from "node:fs";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compile, compileToBuffer, compileToFile, createRegistry, validate, type LibraryRegistry } from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const card = (): AssetEntry => { const p = resolve(fixtures, "assets/card.jpg"); return { assetId: "card", sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType: "image/jpeg", open: () => createReadStream(p) }; };
const load = (n: string) => ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${n}.json`), "utf8")));

describe("compile", () => {
  it("produces byte-identical packages for identical inputs", async () => {
    const a = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const b = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    expect(createHash("sha256").update(a).digest("hex")).toBe(createHash("sha256").update(b).digest("hex"));
  });

  it("writes h5p.json, content/content.json, media and every closure library, with no directory entries and sorted names", async () => {
    const buf = await compileToBuffer(load("flashcards"), new Map([["card", card()]]), { registry, revision: 1 });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.some((n) => zip.files[n]!.dir)).toBe(false);
    expect(names).toEqual([...names].sort());
    const h5p = JSON.parse(await zip.file("h5p.json")!.async("text"));
    expect(h5p.mainLibrary).toBe("H5P.Flashcards");
    expect(h5p.preloadedDependencies.map((d: { machineName: string }) => d.machineName)).toContain("H5P.Flashcards");
    expect(zip.file("content/content.json")).not.toBeNull();
    expect(zip.file("content/images/fc-1-c2.jpg")).not.toBeNull();
    expect(names.some((n) => n.startsWith("H5P.Flashcards-1.5/"))).toBe(true);
    for (const d of h5p.preloadedDependencies) expect(names.some((n) => n.startsWith(`${d.machineName}-${d.majorVersion}.${d.minorVersion}/library.json`))).toBe(true);
  });

  it("rejects when an asset's bytes do not match its declared hash", async () => {
    const bad = card(); bad.sha256 = "0".repeat(64);
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/hash/);
  });

  it("rejects when an asset's length does not match its declared byteLength", async () => {
    const bad = card(); bad.byteLength = bad.byteLength + 1;
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/byteLength|length/);
  });

  it("rejects when an asset source stream errors", async () => {
    const { Readable } = await import("node:stream");
    const bad = card(); bad.open = () => { const r = new Readable({ read() { this.destroy(new Error("disk gone")); } }); return r; };
    await expect(compileToBuffer(load("flashcards"), new Map([["card", bad]]), { registry })).rejects.toThrow(/disk gone/);
  });

  it("rejects when the destination errors, and compileToFile leaves no partial output", async () => {
    const { Writable } = await import("node:stream");
    const failing = new Writable({ write(_c, _e, cb) { cb(new Error("destination full")); } });
    await expect(compile(load("multi-choice"), new Map(), failing, { registry })).rejects.toThrow(/destination full/);

    const { mkdtemp, readdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(resolve(tmpdir(), "h5p-out-"));
    const bad = card(); bad.sha256 = "0".repeat(64);
    await expect(compileToFile(load("flashcards"), new Map([["card", bad]]), resolve(dir, "out.h5p"), { registry })).rejects.toThrow(/hash/);
    expect(await readdir(dir)).toEqual([]);

    const invalid = load("multi-choice"); (invalid as { answers: unknown }).answers = "nope";
    await expect(compileToFile(invalid, new Map(), resolve(dir, "out.h5p"), { registry })).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]); // validation failed before any file was opened

    await expect(compileToFile(load("multi-choice"), new Map(), resolve(dir, "missing-dir", "out.h5p"), { registry })).rejects.toThrow(/ENOENT/);
    expect(await readdir(dir)).toEqual([]); // unwritable destination leaves nothing behind

    await compileToFile(load("flashcards"), new Map([["card", card()]]), resolve(dir, "out.h5p"), { registry });
    expect(await readdir(dir)).toEqual(["out.h5p"]);
  });

  it("validate accepts an image-bearing spec when the manifest has the asset, and reports the missing asset otherwise", async () => {
    expect(await validate(load("multi-choice"), new Map(), { registry })).toEqual([]);
    expect(await validate(load("flashcards"), new Map([["card", card()]]), { registry })).toEqual([]);
    await expect(validate(load("flashcards"), new Map(), { registry })).rejects.toThrow(/asset card is not in the manifest/);
  });

  it("changes bytes when the revision changes (sub-content ids differ)", async () => {
    const a = await compileToBuffer(load("question-set-nested"), new Map(), { registry, revision: 1 });
    const b = await compileToBuffer(load("question-set-nested"), new Map(), { registry, revision: 2 });
    expect(a.equals(b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**, then implement.

`packages/engine/src/assembler.ts`:
```ts
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { ZipFile } from "yazl";
import type { AssetEntry, AssetManifest } from "@leaplearn/shared";
import { EngineError } from "./errors.js";
import type { H5PContent } from "./params.js";
import type { LibraryRegistry } from "./registry.js";
import type { LockedLibrary } from "./lock.js";

const FIXED_MTIME = new Date("2000-01-01T00:00:00Z");
const FILE_MODE = 0o100644;

export interface PackageInput {
  title: string;
  language: string;
  mainLibrary: LockedLibrary;
  closure: LockedLibrary[];
  content: H5PContent;
  /** content/-relative media path -> assetId */
  media: Map<string, string>;
  assets: AssetManifest;
}

export function buildH5pJson(input: PackageInput): Record<string, unknown> {
  return {
    title: input.title,
    language: input.language,
    mainLibrary: input.mainLibrary.machineName,
    embedTypes: ["div"],
    license: "U",
    defaultLanguage: input.language,
    preloadedDependencies: input.closure.map((l) => ({ machineName: l.machineName, majorVersion: l.majorVersion, minorVersion: l.minorVersion }))
  };
}

interface Entry { name: string; add: (zip: ZipFile) => Promise<void>; }

/**
 * Verifies length and sha256 while streaming. Calls `fail` as soon as the source ends with the
 * wrong length or hash (or errors), so a bad asset rejects the build before the archive finishes.
 */
function verifying(asset: AssetEntry, fail: (err: Error) => void): Transform {
  const hash = createHash("sha256");
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) { hash.update(chunk); seen += chunk.length; cb(null, chunk); },
    flush(cb) {
      const actual = hash.digest("hex");
      if (seen !== asset.byteLength) fail(new EngineError(`asset ${asset.assetId} length mismatch: declared byteLength ${asset.byteLength}, streamed ${seen}`, "ASSET_LENGTH"));
      else if (actual !== asset.sha256) fail(new EngineError(`asset ${asset.assetId} hash mismatch: expected ${asset.sha256}, got ${actual}`, "ASSET_HASH"));
      cb();
    }
  });
}

export async function writePackage(input: PackageInput, registry: LibraryRegistry, output: NodeJS.WritableStream): Promise<string[]> {
  const entries: Entry[] = [];
  const opts = { mtime: FIXED_MTIME, mode: FILE_MODE, compress: true };
  const zip = new ZipFile();
  const sources: NodeJS.ReadableStream[] = [];

  let settled = false;
  let rejectAll: (err: Error) => void = () => {};
  let resolveAll: () => void = () => {};
  const done = new Promise<void>((res, rej) => {
    resolveAll = () => { if (!settled) { settled = true; res(); } };
    rejectAll = (err) => {
      if (settled) return;
      settled = true;
      for (const s of sources) (s as { destroy?: (e?: Error) => void }).destroy?.();
      zip.outputStream.unpipe(output);
      (zip.outputStream as { destroy?: (e?: Error) => void }).destroy?.();
      (output as { destroy?: (e?: Error) => void }).destroy?.(err);
      rej(err);
    };
  });

  entries.push({ name: "h5p.json", add: async (z) => z.addBuffer(Buffer.from(JSON.stringify(buildH5pJson(input))), "h5p.json", opts) });
  entries.push({ name: "content/content.json", add: async (z) => z.addBuffer(Buffer.from(JSON.stringify(input.content.params)), "content/content.json", opts) });

  for (const [path, assetId] of input.media) {
    const asset = input.assets.get(assetId);
    if (!asset) throw new EngineError(`asset ${assetId} is not in the manifest`, "ASSET_MISSING");
    entries.push({ name: `content/${path}`, add: async (z) => {
      const source = asset.open();
      const check = verifying(asset, rejectAll);
      source.on("error", rejectAll);
      check.on("error", rejectAll);
      sources.push(source, check);
      z.addReadStream(source.pipe(check), `content/${path}`, { ...opts, size: asset.byteLength });
    } });
  }

  for (const lib of input.closure) {
    for (const f of await registry.files(`${lib.machineName}-${lib.majorVersion}.${lib.minorVersion}`)) {
      entries.push({ name: f.path, add: async (z) => z.addBuffer(await f.data(), f.path, opts) });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const seenNames = new Set<string>();
  for (const e of entries) { if (seenNames.has(e.name)) throw new EngineError(`duplicate entry ${e.name}`, "DUPLICATE_ENTRY"); seenNames.add(e.name); }

  zip.on("error", rejectAll);
  zip.outputStream.on("error", rejectAll);
  output.on("error", rejectAll);
  output.on("finish", resolveAll);
  zip.outputStream.pipe(output);
  try {
    for (const e of entries) await e.add(zip);
    zip.end();
  } catch (err) {
    rejectAll(err instanceof Error ? err : new Error(String(err)));
  }
  await done;
  return entries.map((e) => e.name);
}
```
`AssetEntry` is imported from `@leaplearn/shared` at the top of the file alongside `AssetManifest`.

`packages/engine/src/index.ts` (replaces the minimal file from Task 5):
```ts
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { ActivitySpec, type AssetManifest } from "@leaplearn/shared";
import { createHandlerRegistry } from "./handlers/index.js";
import type { BuildContext } from "./handlers/handler.js";
import { createIdFactory } from "./ids.js";
import { ValidationError, type ValidationIssue } from "./errors.js";
import { validateParams } from "./validator/semantics.js";
import { checkClosure } from "./validator/closure.js";
import { writePackage } from "./assembler.js";
import type { LibraryRegistry } from "./registry.js";
import type { H5PParams } from "./params.js";

export interface Logger { info(msg: string): void; warn(msg: string): void; }
export interface CompileOptions { registry: LibraryRegistry; revision?: number; logger?: Logger; }
export interface CompileResult { mainLibrary: string; libraries: string[]; entries: string[]; contentJson: H5PParams; }

const keyOf = (registry: LibraryRegistry, name: string): string => { const l = registry.resolve(name); return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`; };

async function prepare(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions) {
  const parsed = ActivitySpec.parse(spec);
  const handlers = createHandlerRegistry();
  const handler = handlers.get(parsed.type);
  if (!handler) throw new ValidationError([{ path: "type", message: `no handler for ${parsed.type}` }]);
  const ctx: BuildContext = { registry: options.registry, ids: createIdFactory(parsed.id, options.revision ?? 1), assets, mediaPaths: new Map() };
  const content = handler.build(parsed as never, ctx);
  const closure = await options.registry.closure(handler.requiredLibraries(parsed as never).map((n) => keyOf(options.registry, n)));
  const closureKeys = closure.map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
  const issues: ValidationIssue[] = [...(await validateParams(content, options.registry, ctx.mediaPaths)), ...(await checkClosure(content, options.registry, closureKeys))];
  return { parsed, handler, content, closure, closureKeys, issues, ctx };
}

export async function validate(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions): Promise<ValidationIssue[]> {
  return (await prepare(spec, assets, options)).issues;
}

export async function compile(spec: ActivitySpec, assets: AssetManifest, output: NodeJS.WritableStream, options: CompileOptions): Promise<CompileResult> {
  const { parsed, handler, content, closure, closureKeys, issues, ctx } = await prepare(spec, assets, options);
  if (issues.length > 0) throw new ValidationError(issues);
  const entries = await writePackage({ title: parsed.title, language: parsed.language, mainLibrary: options.registry.get(keyOf(options.registry, handler.mainLibrary)), closure, content, media: ctx.mediaPaths, assets }, options.registry, output);
  return { mainLibrary: handler.mainLibrary, libraries: closureKeys, entries, contentJson: content.params };
}

/**
 * Validates first (no file is touched for an invalid spec), then writes to a sibling temp file and
 * renames onto `path` only on success. On any failure the stream is destroyed, its closure awaited,
 * and the temp file removed, so nothing partial is left behind.
 */
export async function compileToFile(spec: ActivitySpec, assets: AssetManifest, path: string, options: CompileOptions): Promise<CompileResult> {
  const prepared = await prepare(spec, assets, options);
  if (prepared.issues.length > 0) throw new ValidationError(prepared.issues);

  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  const out = createWriteStream(tmp);
  const closed = new Promise<void>((res) => out.once("close", () => res()));
  try {
    const { parsed, handler, content, closure, closureKeys, ctx } = prepared;
    const entries = await writePackage({ title: parsed.title, language: parsed.language, mainLibrary: options.registry.get(keyOf(options.registry, handler.mainLibrary)), closure, content, media: ctx.mediaPaths, assets }, options.registry, out);
    await closed;
    await rename(tmp, path);
    return { mainLibrary: handler.mainLibrary, libraries: closureKeys, entries, contentJson: content.params };
  } catch (err) {
    out.destroy();
    await closed;
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function compileToBuffer(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on("data", (c: Buffer) => chunks.push(c));
  await compile(spec, assets, sink, options);
  return Buffer.concat(chunks);
}

export { sanitizeHtml, escapeHtml } from "./html.js";
export { createRegistry, LibraryRegistry } from "./registry.js";
export { libraryKey, type LibraryLock, type LockedLibrary } from "./lock.js";
export { EngineError, ValidationError, type ValidationIssue } from "./errors.js";
export { createHandlerRegistry } from "./handlers/index.js";
export type { ActivityHandler, BuildContext } from "./handlers/handler.js";
export type { H5PContent, H5PParams } from "./params.js";
```

`validate` takes the same asset manifest as `compile`, so an image-bearing activity validates cleanly before compilation; a handler that needs an asset the caller did not supply throws `EngineError("ASSET_MISSING")`, which is the correct signal at validation time too.

- [ ] **Step 3: Run to see it pass**

Run: `pnpm test`. All suites (lock, registry, ids, validator, golden, determinism) pass. If the byte-identical test fails, dump both buffers with `unzip -l` on temp files and compare entry order and sizes; the usual cause is an unsorted entry or a non-fixed mtime.

- [ ] **Step 4: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): deterministic streaming assembler and public compile/validate API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Boundary test: the engine has no network, env, cwd or console access

**Files:**
- Test: `packages/engine/test/boundary.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const src = resolve(import.meta.dirname, "../src");
const forbidden = [/from\s+["'](axios|node-fetch|undici|https?|node:https?|child_process|node:child_process)["']/, /\bprocess\.(env|cwd|exit)\b/, /\bconsole\./, /\bfetch\s*\(/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
}

describe("engine boundary", () => {
  it("never imports network, shell, env, cwd, exit or console", () => {
    const offenders: string[] = [];
    for (const f of files(src)) {
      const text = readFileSync(f, "utf8");
      for (const re of forbidden) if (re.test(text)) offenders.push(`${f}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run; fix any offender by injection (never by exempting the test)**

Run: `pnpm test -- boundary`. Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/test/boundary.test.ts
git commit -m "test(engine): enforce the no-network, no-env, no-console boundary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Player smoke tests with Playwright and h5p-standalone

**Files:**
- Create: `packages/engine/test/smoke/playwright.config.ts`, `packages/engine/test/smoke/serve.ts`, `packages/engine/test/smoke/player.spec.ts`, `packages/engine/test/smoke/site/index.html`

**Interfaces:**
- Produces: `pnpm --filter @leaplearn/engine test:smoke` builds every golden fixture, extracts it, serves it with `h5p-standalone`, loads it in headless Chromium, asserts it renders with no console errors, and for every scored fixture answers it once correctly and once incorrectly and checks the reported score (including the question set nested inside a book).

- [ ] **Step 1: Install browsers**

```bash
cd packages/engine && pnpm exec playwright install chromium
```

- [ ] **Step 2: Static server and page**

`test/smoke/serve.ts`:
```ts
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".mp3": "audio/mpeg" };

export function serve(root: string, port: number, headers: Record<string, string> = {}): Promise<Server> {
  const server = createServer(async (req, res) => {
    const path = join(root, normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^(\.\.[/\\])+/, ""));
    try {
      const s = await stat(path);
      const file = s.isDirectory() ? join(path, "index.html") : path;
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", ...headers });
      res.end(await readFile(file));
    } catch { res.writeHead(404, headers); res.end("not found"); }
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
```

`test/smoke/site/index.html`:
```html
<!doctype html>
<meta charset="utf-8">
<title>smoke</title>
<div id="h5p-container"></div>
<script src="/h5p-standalone/main.bundle.js"></script>
<script>
  const pkg = new URLSearchParams(location.search).get("pkg");
  new H5PStandalone.H5P(document.getElementById("h5p-container"), {
    h5pJsonPath: "/packages/" + pkg,
    frameJs: "/h5p-standalone/frame.bundle.js",
    frameCss: "/h5p-standalone/styles/h5p.css"
  }).then(() => { document.body.dataset.ready = "1"; }).catch((e) => { document.body.dataset.error = String(e); });
</script>
```

`test/smoke/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "*.spec.ts", timeout: 60_000, use: { headless: true }, workers: 1 });
```

- [ ] **Step 3: The spec**

`test/smoke/player.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import type { Page, FrameLocator } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { readFileSync, createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compileToBuffer, createRegistry } from "../../src/index.js";
import { serve } from "./serve.js";

const here = import.meta.dirname;
const root = resolve(here, "../../../..");
const fixtures = resolve(here, "../fixtures");
const cases = ["multi-choice", "blanks", "flashcards", "question-set-nested", "interactive-book", "interactive-book-nested"];
const standaloneDist = resolve(dirname(createRequire(import.meta.url).resolve("h5p-standalone/package.json")), "dist");

let site: string; let server: Awaited<ReturnType<typeof serve>>;

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "smoke-"));
  await cp(resolve(here, "site"), site, { recursive: true });
  await cp(standaloneDist, join(site, "h5p-standalone"), { recursive: true });
  const registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
  const p = resolve(fixtures, "assets/card.jpg");
  const card: AssetEntry = { assetId: "card", sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType: "image/jpeg", open: () => createReadStream(p) };
  for (const name of cases) {
    const spec = ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${name}.json`), "utf8")));
    const buf = await compileToBuffer(spec, new Map([["card", card]]), { registry, revision: 1 });
    const zip = await JSZip.loadAsync(buf);
    for (const [entry, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const out = join(site, "packages", name, entry);
      await mkdir(resolve(out, ".."), { recursive: true });
      await writeFile(out, await file.async("nodebuffer"));
    }
  }
  server = await serve(site, 4321);
});
test.afterAll(async () => { server.close(); });

async function open(page: Page, name: string): Promise<{ frame: FrameLocator; errors: string[] }> {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:4321/?pkg=${name}`);
  await expect(page.locator("body[data-ready='1']")).toBeAttached({ timeout: 30_000 });
  const frame = page.frameLocator("iframe.h5p-iframe");
  await expect(frame.locator(".h5p-content")).toBeVisible({ timeout: 30_000 });
  return { frame, errors };
}

for (const name of cases) {
  test(`renders ${name} without console errors`, async ({ page }) => {
    const { errors } = await open(page, name);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

/** Scoring interactions. Selectors are H5P's own class names (H5P.Question and the libraries), verified against the rendered DOM in step 4. */
/** The score bar's accessible label is "You got :num out of :total points" for H5P.Question-based content; assert earned and max exactly. */
const score = (earned: number, max: number) => new RegExp(`\\b${earned}\\s+out of\\s+${max}\\b`);

test("multi-choice: correct answer scores 1 of 1, wrong answer scores 0 of 1", async ({ page }) => {
  const { frame } = await open(page, "multi-choice");
  await frame.locator(".h5p-answer", { hasText: "Blue circle" }).click();
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-answer.h5p-correct")).toHaveCount(1);
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(1, 1));
  await frame.locator("button.h5p-question-try-again").click();
  await frame.locator(".h5p-answer", { hasText: "Yellow triangle" }).click();
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-answer.h5p-wrong")).toHaveCount(1);
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(0, 1));
});

test("blanks: both correct scores 2 of 2, one wrong scores 1 of 2", async ({ page }) => {
  const { frame } = await open(page, "blanks");
  const inputs = frame.locator("input.h5p-text-input");
  await inputs.nth(0).fill("hard hat");
  await inputs.nth(1).fill("boots");
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(2, 2));
  await frame.locator("button.h5p-question-try-again").click();
  await inputs.nth(0).fill("hard hat");
  await inputs.nth(1).fill("sandals");
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(1, 2));
});

async function runNestedQuiz(frame: FrameLocator, answers: { choice: string; blank: string }): Promise<void> {
  await frame.locator(".h5p-interactive-book-navigation-chapter-title", { hasText: "Quiz" }).click();
  await frame.locator(".qs-startbutton, .h5p-joubelui-button.qs-startbutton").first().click().catch(() => undefined);
  await frame.locator(".h5p-answer", { hasText: answers.choice }).click();
  await frame.locator("button.h5p-question-check-answer").click();
  await frame.locator("button.h5p-question-next, .qs-footer .h5p-joubelui-button", { hasText: /next/i }).first().click();
  await frame.locator("input.h5p-text-input").fill(answers.blank);
  await frame.locator("button.h5p-question-check-answer").click();
  await frame.locator("button.h5p-question-finish, .qs-footer .h5p-joubelui-button", { hasText: /finish/i }).first().click();
}

test("nested question set: all correct reports 2 of 2", async ({ page }) => {
  const { frame } = await open(page, "interactive-book-nested");
  await runNestedQuiz(frame, { choice: "Mandatory", blank: "hard hat" });
  await expect(frame.locator(".questionset-results")).toContainText(score(2, 2));
});

test("nested question set: all wrong reports 0 of 2", async ({ page }) => {
  const { frame } = await open(page, "interactive-book-nested");
  await runNestedQuiz(frame, { choice: "Prohibited", blank: "sandals" });
  await expect(frame.locator(".questionset-results")).toContainText(score(0, 2));
});
```

- [ ] **Step 4 (before running): confirm the selectors against the rendered DOM**

Run `pnpm exec playwright test -c test/smoke/playwright.config.ts --headed --debug -g "multi-choice"` once, open the inspector, and check each class name above against the live DOM (`.h5p-answer`, `.h5p-question-check-answer`, `.h5p-joubelui-score-bar`, `.qs-startbutton`, `.questionset-results`) and the exact wording of the score text (the `score()` regex expects "N out of M"; if the library renders "N/M" adjust the regex to match both forms, never to match a bare number). Replace any selector that does not match with the real one; do not weaken the assertions on earned or maximum score.

If `h5p-standalone`'s dist layout differs from `main.bundle.js` / `frame.bundle.js` / `styles/h5p.css` (verified for 3.8.2), list the `dist` directory resolved by `standaloneDist` and use the actual names in both `index.html` and the copy step.

- [ ] **Step 5: Run**

Run: `pnpm --filter @leaplearn/engine test:smoke; echo "exit=$?"`. Expected: `exit=0`, 10 passed (6 render + 4 scoring). A failure here with a green validator means a params problem the semantics cannot express (for example a label the library reads but doesn't declare); fix the handler and re-run both suites.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/test/smoke
git commit -m "test(engine): headless player smoke and scoring tests for every golden package

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Preview sandbox spike

Answers spec §7: can `sandbox="allow-scripts"` alone (opaque origin) run h5p-standalone loading a package from a separate, cookie-less preview origin, **under the design's scoped-token arrangement** (package JSON, libraries and media all token-gated, tokens bound to a revision and expiring)?

**Files:**
- Create: `tools/preview-spike/package.json`, `tools/preview-spike/app/index.html`, `tools/preview-spike/preview/index.html`, `tools/preview-spike/preview-server.ts`, `tools/preview-spike/run.ts`
- Create: `docs/superpowers/specs/spike-results/2026-09-preview-sandbox.md`
- Modify: `docs/superpowers/specs/2026-09-18-generator-service-design.md` §7 (record the decision)

- [ ] **Step 1: Two origins, and a token-gated preview server**

`tools/preview-spike/package.json`:
```json
{ "name": "@leaplearn/preview-spike", "private": true, "type": "module", "scripts": { "start": "tsx run.ts", "test": "echo spike", "build": "echo spike", "typecheck": "echo spike", "lint": "echo spike" }, "devDependencies": { "@playwright/test": "^1.63.0", "tsx": "^4.19.0", "@leaplearn/engine": "workspace:*", "@leaplearn/shared": "workspace:*", "jszip": "^3.10.1" } }
```

`preview-server.ts` (origin B, `localhost:4402`): serves `/h5p-standalone/*` publicly and everything under `/p/<revisionId>/*` only with a valid token. A token is `base64url(JSON{ rev, exp })` + `.` + HMAC-SHA256 of that payload under a server secret; the server rejects with 403 when the signature fails, `exp` is in the past, or `rev` differs from the path's `<revisionId>`. The token travels as a query parameter (`?t=`) and, because h5p-standalone issues its own relative fetches for `h5p.json`, `content/content.json`, library files and media, the page rewrites those by registering a `fetch` wrapper that appends the same `?t=` to any same-origin URL under `/p/`. Responses carry `Access-Control-Allow-Origin: null` when the request `Origin` is `null` (the opaque-origin case), otherwise the app origin, never `*`; no `Set-Cookie` is ever sent.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const SECRET = "spike-secret";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };

export function mintToken(rev: string, expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ rev, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token: string | null, rev: string): "ok" | "bad-signature" | "expired" | "wrong-revision" | "missing" {
  if (!token) return "missing";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return "bad-signature";
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return "bad-signature";
  const { rev: r, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { rev: string; exp: number };
  if (exp < Math.floor(Date.now() / 1000)) return "expired";
  if (r !== rev) return "wrong-revision";
  return "ok";
}

export function startPreviewServer(root: string, port: number) {
  return new Promise<ReturnType<typeof createServer>>((res) => {
    const server = createServer(async (req, resp) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const origin = req.headers.origin;
      const cors = { "access-control-allow-origin": origin === "null" ? "null" : "http://127.0.0.1:4401", vary: "Origin" };
      const m = /^\/p\/([^/]+)\/(.*)$/.exec(url.pathname);
      if (m) {
        const v = verify(url.searchParams.get("t"), m[1]!);
        if (v !== "ok") { resp.writeHead(403, { ...cors, "content-type": "text/plain" }); resp.end(v); return; }
      }
      const file = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
      try {
        const s = await stat(file);
        const target = s.isDirectory() ? join(file, "index.html") : file;
        resp.writeHead(200, { ...cors, "content-type": MIME[extname(target)] ?? "application/octet-stream" });
        resp.end(await readFile(target));
      } catch { resp.writeHead(404, cors); resp.end("not found"); }
    });
    server.listen(port, "localhost", () => res(server));
  });
}
```

`preview/index.html` (served by the preview server): the smoke page with the fetch wrapper and the postMessage report:
```html
<!doctype html><meta charset="utf-8"><title>preview</title>
<div id="h5p-container"></div>
<script src="/h5p-standalone/main.bundle.js"></script>
<script>
  const q = new URLSearchParams(location.search);
  const rev = q.get("rev"), t = q.get("t");
  const base = `/p/${rev}`;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    if (u.origin === location.origin && u.pathname.startsWith("/p/") && !u.searchParams.has("t")) u.searchParams.set("t", t);
    return origFetch(u.toString(), init);
  };
  const report = (extra) => window.parent.postMessage({ variant: q.get("variant"), ...extra }, "*");
  new H5PStandalone.H5P(document.getElementById("h5p-container"), { h5pJsonPath: `${base}/${q.get("pkg")}`, frameJs: "/h5p-standalone/frame.bundle.js", frameCss: "/h5p-standalone/styles/h5p.css" })
    .then(() => report({ ready: true })).catch((e) => report({ ready: false, error: String(e) }));
</script>
```
The `pkg` query parameter selects the package: the spike runs both `multi-choice` (no media) and `flashcards` (one image under `content/images/`), so that a media request is observed under the token arrangement.
Note for the result: library JS/CSS and media inside the H5P frame are loaded by `<script>`/`<link>`/`<img>` tags, not `fetch`, so the wrapper does not cover them; the spike records whether those requests carried the token (they will not) and therefore whether path-embedded tokens (`/p/<rev>/<token>/…`) are required instead of query tokens. Try both: run once with `?t=` and once with the token as a path segment (`/p/<rev>/<token>/multi-choice`, server verifying the second segment).

`app/index.html` (origin A, `127.0.0.1:4401`), one iframe per sandbox variant, both pointing at the tokened preview URL that `run.ts` substitutes for `__URL__`:
```html
<!doctype html><meta charset="utf-8"><title>app</title>
<h1>Preview sandbox spike</h1>
<p>A: allow-scripts only, no media</p>
<iframe id="a" sandbox="allow-scripts" src="__URL__&pkg=multi-choice&variant=a" width="800" height="500"></iframe>
<p>B: allow-scripts allow-same-origin, no media</p>
<iframe id="b" sandbox="allow-scripts allow-same-origin" src="__URL__&pkg=multi-choice&variant=b" width="800" height="500"></iframe>
<p>C: allow-scripts only, with an image</p>
<iframe id="c" sandbox="allow-scripts" src="__URL__&pkg=flashcards&variant=c" width="800" height="500"></iframe>
<p>D: allow-scripts allow-same-origin, with an image</p>
<iframe id="d" sandbox="allow-scripts allow-same-origin" src="__URL__&pkg=flashcards&variant=d" width="800" height="500"></iframe>
<script>window.results = {}; addEventListener("message", (e) => { window.results[e.data.variant] = e.data; });</script>
```

- [ ] **Step 2: The runner**

`run.ts`: serve `app/` on 4401 with the static server from `packages/engine/test/smoke/serve.ts` (imported by relative path) after substituting `__URL__` with `http://localhost:4402/?rev=r1&t=<mintToken("r1", 300)>`; start `startPreviewServer(previewRoot, 4402)`; build and extract the `multi-choice` and `flashcards` golden packages (the latter with the `card` asset, as the smoke test does) into `<previewRoot>/p/r1/multi-choice` and `<previewRoot>/p/r1/flashcards`, and copy the h5p-standalone dist into `<previewRoot>/h5p-standalone`. Then with Playwright: open `http://127.0.0.1:4401/`, and record for each of `#a`–`#d` (a) `window.results[variant]`, (b) whether `.h5p-content` became visible inside the nested `iframe.h5p-iframe`, (c) every request to `localhost:4402` with its status and whether it carried a token (`page.on("response")`), grouped as package JSON / library JS+CSS / media, (d) console errors. For `#c` and `#d`, additionally assert that the request for `content/images/fc-1-c2.jpg` occurred and report its status and token presence; that row is the media finding. Then three negative checks straight against the preview server with `fetch` from Node: an expired token (`mintToken("r1", -10)`) → 403 `expired`; a token for `r2` on `/p/r1/…` → 403 `wrong-revision`; no token → 403 `missing`. Print one Markdown table for the four variants (rows per request group) and one for the three rejections.

- [ ] **Step 3: Run and record**

```bash
pnpm install && pnpm --filter @leaplearn/preview-spike start
```
Write both tables and the conclusion into `docs/superpowers/specs/spike-results/2026-09-preview-sandbox.md`, with the h5p-standalone version, Chromium version, the exact `sandbox` value that worked, and whether the token must be a path segment for library and media requests (the `#c`/`#d` image row is the evidence for media).

- [ ] **Step 4: Update the design's §7**

Replace the sentence beginning "The application embeds it in an iframe whose `sandbox` value is decided by the **phase-1 preview spike**" with the decided value, the token placement (query or path segment) that the spike showed is required for library and media requests, and a link to the spike result, keeping the separate-origin and no-cookie requirements.

- [ ] **Step 5: Commit**

```bash
git add tools/preview-spike docs/superpowers/specs
git commit -m "spike(preview): test h5p-standalone under iframe sandbox variants and record the decision

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: `apps/cli`: the `flashcards` command on the new engine, with the legacy command kept callable

**Files:**
- Create: `apps/cli/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/csv-to-flashcards.ts`, `src/image-resolver.ts`
- Create: `apps/cli/test/fixtures/flash-local.csv`, `apps/cli/test/fixtures/card.jpg` (copy of `packages/engine/test/fixtures/assets/card.jpg`)
- Test: `apps/cli/test/csv-to-flashcards.test.ts`, `apps/cli/test/image-resolver.test.ts`
- Modify: `apps/cli-legacy/package.json` (add a `bin`), `apps/cli-legacy/README.md`

**Interfaces:**
- Produces: `leap flashcards <input.csv> <output.h5p> [--title T] [--language L] [--libraries <dir>]`; `csvToFlashcardsSpec(csvText, opts: { id; title; language; baseDir; resolveImage: ImageResolver })` accepting the legacy columns `question`, `answer`, `tip`, `image` (semicolon or comma delimited, auto-detected by papaparse), where each card gets `id: card-<row>`; `ImageResolver = (ref: string, baseDir: string) => Promise<AssetEntry>` with two implementations: `localImageResolver` (paths only) and `networkImageResolver` (paths plus `http(s)` URLs, fetched by the application; the engine never fetches). The legacy `h5p-cli-creator` command stays installable from `apps/cli-legacy` via its `bin`.

- [ ] **Step 1: Fixtures and the failing tests**

`apps/cli/test/fixtures/flash-local.csv` (fully local, deterministic):
```csv
question;answer;tip;image
Used to tighten hex nuts;Spanner;Not a wrench;card.jpg
Cuts timber;Saw;;
```

`apps/cli/test/csv-to-flashcards.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { csvToFlashcardsSpec } from "../src/csv-to-flashcards.js";
import { localImageResolver } from "../src/image-resolver.js";

const fixtures = resolve(import.meta.dirname, "fixtures");

describe("csvToFlashcardsSpec", () => {
  it("maps question/answer/tip/image columns, assigns card ids and resolves local images to assets", async () => {
    const csv = readFileSync(resolve(fixtures, "flash-local.csv"), "utf8");
    const { spec, assets } = await csvToFlashcardsSpec(csv, { id: "flash", title: "Tools", language: "en", baseDir: fixtures, resolveImage: localImageResolver });
    expect(spec.cards.map((c) => c.id)).toEqual(["card-1", "card-2"]);
    expect(spec.cards[0]).toMatchObject({ front: "Used to tighten hex nuts", back: "Spanner", tip: "Not a wrench" });
    expect(spec.cards[0]?.imageAssetId).toBe("img-1");
    expect(assets.get("img-1")?.mimeType).toBe("image/jpeg");
    expect(spec.cards[1]?.imageAssetId).toBeUndefined();
  });
  it("rejects a URL with the local resolver, naming the row", async () => {
    const csv = "question;answer;tip;image\nq;a;;https://example.com/x.jpg\n";
    await expect(csvToFlashcardsSpec(csv, { id: "f", title: "T", language: "en", baseDir: fixtures, resolveImage: localImageResolver })).rejects.toThrow(/row 1.*URL/);
  });
});
```

`apps/cli/test/image-resolver.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { networkImageResolver } from "../src/image-resolver.js";

describe("networkImageResolver", () => {
  it("fetches an http image into an AssetEntry with the right hash and type", async () => {
    const bytes = readFileSync(resolve(import.meta.dirname, "fixtures/card.jpg"));
    const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(bytes); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    const asset = await networkImageResolver(`http://127.0.0.1:${port}/card.jpg`, "/unused");
    expect(asset.mimeType).toBe("image/jpeg");
    expect(asset.byteLength).toBe(bytes.length);
    server.close();
  });
});
```

- [ ] **Step 2: Implement**

`apps/cli/package.json`:
```json
{
  "name": "@leaplearn/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "leap": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run", "typecheck": "tsc -p tsconfig.json --noEmit", "lint": "eslint src test" },
  "dependencies": { "@leaplearn/engine": "workspace:*", "@leaplearn/shared": "workspace:*", "papaparse": "^5.5.0", "yargs": "^17.7.0" },
  "devDependencies": { "@types/node": "^20", "@types/papaparse": "^5.3.0", "@types/yargs": "^17.0.0", "typescript": "~5.9.0", "vitest": "^3.2.0", "eslint": "^9", "typescript-eslint": "^8", "@eslint/js": "^9" }
}
```

`src/image-resolver.ts`:
```ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import type { AssetEntry } from "@leaplearn/shared";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
const isUrl = (ref: string): boolean => /^https?:\/\//i.test(ref);

export type ImageResolver = (ref: string, baseDir: string) => Promise<AssetEntry>;

export const localImageResolver: ImageResolver = async (ref, baseDir) => {
  if (isUrl(ref)) throw new Error(`image is a URL (${ref}); use --allow-network to fetch remote images`);
  const path = isAbsolute(ref) ? ref : join(baseDir, ref);
  const mimeType = MIME[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`unsupported image type: ${ref}`);
  const bytes = await readFile(path);
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: (await stat(path)).size, mimeType, open: () => createReadStream(path) };
};

/** Application-side network access; the engine never fetches. */
export const networkImageResolver: ImageResolver = async (ref, baseDir) => {
  if (!isUrl(ref)) return localImageResolver(ref, baseDir);
  const res = await fetch(ref);
  if (!res.ok) throw new Error(`image ${ref}: HTTP ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!Object.values(MIME).includes(mimeType)) throw new Error(`image ${ref}: unsupported content-type ${mimeType || "(none)"}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { assetId: "", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, mimeType, open: () => Readable.from([bytes]) };
};
```

`src/csv-to-flashcards.ts`:
```ts
import Papa from "papaparse";
import { FlashcardsSpec, type AssetEntry, type AssetManifest } from "@leaplearn/shared";
import type { ImageResolver } from "./image-resolver.js";

interface Row { question?: string; answer?: string; tip?: string; image?: string; }

export async function csvToFlashcardsSpec(csvText: string, opts: { id: string; title: string; language: string; baseDir: string; resolveImage: ImageResolver }): Promise<{ spec: FlashcardsSpec; assets: AssetManifest }> {
  const parsed = Papa.parse<Row>(csvText.trim(), { header: true, skipEmptyLines: true, delimiter: "" });
  const assets = new Map<string, AssetEntry>();
  const cards = [];
  for (const [i, row] of parsed.data.entries()) {
    const rowNumber = i + 1;
    if (!row.question || !row.answer) throw new Error(`row ${rowNumber}: question and answer are required`);
    const card: Record<string, unknown> = { id: `card-${rowNumber}`, front: row.question, back: row.answer };
    if (row.tip) card["tip"] = row.tip;
    if (row.image) {
      let resolved: AssetEntry;
      try { resolved = await opts.resolveImage(row.image, opts.baseDir); }
      catch (err) { throw new Error(`row ${rowNumber}: ${err instanceof Error ? err.message : String(err)}`); }
      const assetId = `img-${rowNumber}`;
      assets.set(assetId, { ...resolved, assetId });
      card["imageAssetId"] = assetId;
      card["imageAlt"] = row.question;
    }
    cards.push(card);
  }
  return { spec: FlashcardsSpec.parse({ id: opts.id, title: opts.title, language: opts.language, type: "flashcards", cards }), assets };
}
```

`src/index.ts`:
```ts
#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compileToFile, createRegistry } from "@leaplearn/engine";
import { csvToFlashcardsSpec } from "./csv-to-flashcards.js";
import { localImageResolver, networkImageResolver } from "./image-resolver.js";

await yargs(hideBin(process.argv))
  .scriptName("leap")
  .command("flashcards <input> <output>", "Build an H5P.Flashcards package from a CSV (columns: question, answer, tip, image)", (y) => y
    .positional("input", { type: "string", demandOption: true })
    .positional("output", { type: "string", demandOption: true })
    .option("title", { type: "string", default: "Flashcards" })
    .option("language", { type: "string", default: "en" })
    .option("allow-network", { type: "boolean", default: false, describe: "fetch http(s) image URLs referenced in the CSV" })
    .option("libraries", { type: "string", default: resolve(process.cwd(), "libraries"), describe: "directory containing libraries.lock.json and cache/" }),
    async (argv) => {
      const csv = await readFile(argv.input, "utf8");
      const resolveImage = argv["allow-network"] ? networkImageResolver : localImageResolver;
      const { spec, assets } = await csvToFlashcardsSpec(csv, { id: basename(argv.input, ".csv"), title: argv.title, language: argv.language, baseDir: dirname(resolve(argv.input)), resolveImage });
      const registry = await createRegistry({ lockPath: resolve(argv.libraries, "libraries.lock.json"), cacheDir: resolve(argv.libraries, "cache") });
      const result = await compileToFile(spec, assets, argv.output, { registry });
      process.stdout.write(`wrote ${argv.output} (${result.entries.length} entries, ${result.libraries.length} libraries)\n`);
    })
  .demandCommand(1)
  .strict()
  .parse();
```
`createWriteStream` is no longer imported; `compileToFile` owns the temp-file-and-rename.

- [ ] **Step 3: Run the tests, then the command end to end on the local fixture and on the legacy fixture**

```bash
pnpm install && pnpm --filter @leaplearn/cli test && pnpm --filter @leaplearn/cli build; echo "exit=$?"
node apps/cli/dist/index.js flashcards apps/cli/test/fixtures/flash-local.csv /tmp/flash-local.h5p --title "Tools"
unzip -l /tmp/flash-local.h5p | head
node apps/cli/dist/index.js flashcards apps/cli-legacy/tests/flash1.csv /tmp/flash1.h5p --title "Flash 1" --language de; echo "exit=$?"
node apps/cli/dist/index.js flashcards apps/cli-legacy/tests/flash1.csv /tmp/flash1.h5p --title "Flash 1" --language de --allow-network; echo "exit=$?"
```
Expected: `exit=0` for the tests; the local fixture builds (listing shows `h5p.json`, `content/content.json`, `content/images/flash-local-card-1.jpg`, `H5P.Flashcards-1.5/...`); the legacy fixture **fails** without `--allow-network` with `row 2: image is a URL` (its second row references `https://cdn.pixabay.com/...`), and succeeds with `--allow-network` when the network is available. Upload `/tmp/flash-local.h5p` to h5p.com once by hand (the manual gate) and note the result in the commit body.

- [ ] **Step 4: Keep the legacy command callable under its old name**

In `apps/cli-legacy/package.json` add:
```json
  "bin": { "h5p-cli-creator": "./dist/index.js" },
```
and ensure `apps/cli-legacy/src/index.ts` begins with `#!/usr/bin/env node` (add it if absent). After `pnpm install`, `pnpm exec h5p-cli-creator --help` from the repo root must print the legacy command list. Append to `apps/cli-legacy/README.md`:
```markdown
- The manual `flashcards` command has a replacement in `apps/cli` (`leap flashcards`). The legacy
  command remains installed as `h5p-cli-creator` (this package's `bin`) until phase 4.
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli apps/cli-legacy/package.json apps/cli-legacy/src/index.ts apps/cli-legacy/README.md pnpm-lock.yaml
git commit -m "feat(cli): add leap flashcards command on the new engine with a CSV shim

Manual gate: /tmp/flash-local.h5p uploaded to h5p.com and <renders correctly | see note>.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Root verification, CI script and the phase-1 demo

**Files:**
- Modify: root `package.json` (add `verify`)
- Create: `docs/testing/platform-checklist.md`

- [ ] **Step 1: One command that runs everything, in dependency order**

Add to root `package.json` scripts:
```json
    "verify": "pnpm -r build && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm --filter @leaplearn/engine test:smoke"
```
`build` comes first because every workspace `exports` entry points at `dist/`; pnpm builds packages in topological order (`shared` → `engine` → `cli`, `fetch-libraries`). Run the clean-checkout path once to prove it:
```bash
git stash -u 2>/dev/null; rm -rf node_modules packages/*/node_modules apps/*/node_modules tools/*/node_modules packages/*/dist apps/*/dist tools/*/dist
pnpm install --frozen-lockfile && pnpm verify; echo "exit=$?"
git stash pop 2>/dev/null
```
Expected: `exit=0`. This includes the legacy Jest suite, which is the bilingual compatibility fixture (`apps/cli-legacy/tests/integration/multi-language-ai.test.ts`).

- [ ] **Step 2: Platform checklist**

Create `docs/testing/platform-checklist.md`:
```markdown
# Platform checklist

Run for every content type when its handler changes or when `libraries/libraries.lock.json` changes.
Build the golden fixture with `compileToBuffer` (or `leap flashcards` for CSV), then:

| Type | Package | h5p.com renders | h5p.com scores | Moodle (<version, H5P integration>) renders | Moodle scores | Date | By |
|---|---|---|---|---|---|---|---|
| multiChoice | test/fixtures/specs/multi-choice.json | | | | | | |
| blanks | test/fixtures/specs/blanks.json | | | | | | |
| flashcards | test/fixtures/specs/flashcards.json | | | | | | |
| questionSet (nested) | test/fixtures/specs/question-set-nested.json | | | | | | |
| interactiveBook | test/fixtures/specs/interactive-book.json | | | | | | |
| interactiveBook with questionSet | test/fixtures/specs/interactive-book-nested.json | | | | | | |

The Moodle version and H5P integration are those of the first pilot customer (design §13); fill
the column header when known.
```

- [ ] **Step 3: The phase-1 demo (design §11)**

```bash
node -e '
const { compileToBuffer, createRegistry, validate } = await import("./packages/engine/dist/index.js");
const { ActivitySpec } = await import("./packages/shared/dist/index.js");
const fs = await import("node:fs");
const registry = await createRegistry({ lockPath: "libraries/libraries.lock.json", cacheDir: "libraries/cache" });
const spec = ActivitySpec.parse(JSON.parse(fs.readFileSync("packages/engine/test/fixtures/specs/question-set-nested.json","utf8")));
const a = await compileToBuffer(spec, new Map(), { registry, revision: 1 });
const b = await compileToBuffer(spec, new Map(), { registry, revision: 1 });
console.log("byte-identical:", a.equals(b));
spec.children[0].answers = "broken";
try { await validate(spec, new Map(), { registry }); } catch (e) { console.log("rejected:", e.message); }
' --input-type=module
```
Expected: `byte-identical: true` and a Zod rejection naming `children[0].answers` (the nested bad param is caught at the schema before the semantics validator; to see the semantics validator's own rejection, keep the spec valid and instead corrupt `content.params.questions[0].params.answers` through the validator test from Task 8, which already does this).

- [ ] **Step 4: Commit**

```bash
git add package.json docs/testing/platform-checklist.md
git commit -m "build: add pnpm verify and the platform checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- The clean-checkout path in Task 16 step 1 prints `exit=0` (install, build, typecheck, lint, unit tests for shared, engine, cli, fetch-libraries and the legacy Jest suite, then the smoke and scoring suite).
- `libraries/libraries.lock.json` exists with checksums; `packages/engine/src` has no forbidden imports (Task 12 passes).
- Two compiles of any golden fixture with the same revision are byte-identical, and the nested fixture is rejected by the validator when a child param is corrupted.
- `leap flashcards apps/cli-legacy/tests/flash1.csv out.h5p` produces a package that renders on h5p.com (recorded in the checklist).
- `docs/superpowers/specs/spike-results/2026-09-preview-sandbox.md` exists and §7 of the design names the chosen `sandbox` value.
- `apps/cli-legacy` is unchanged except its README, and its Jest suite still passes.

## Deviations from the spec, recorded

- **Manual CLI commands on the new engine:** only `flashcards` moves in this phase. `dialogcards` and the CSV `interactivebook` need `dialogCards`, `audio` and `video` page handlers, which arrive with the remaining producers in phase 4; until then they run from `apps/cli-legacy`. Spec §2.1a's "manual commands switch to the new engine in phase 1" is therefore partial, by the same reasoning the spec applies to `ai-*` types.
- **Audio and video pages** in `interactiveBook` are schema-complete but the handler throws `NOT_IMPLEMENTED` until phase 4. Packaging an existing audio or video asset needs only the asset manifest, which exists from this phase; the `H5P.Audio` and `H5P.Video` param builders are simply deferred to phase 4 alongside the other remaining producers. They do not depend on the transcription pipeline of phase 6.
- **Book children narrowed:** `flashcards` and `crossword` are excluded from `interactiveBook` items because the locked H5P.Column 1.18 content allowlist omits them; found by the validator in Task 10, the spec §2.1 row is corrected.
