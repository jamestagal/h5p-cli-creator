# Generation scope: author selection of source sections (design and plan)

**Status:** design approved in direction on 9 Oct 2026, revised with Benjamin's decisions and clarifications. Implementation is on hold until the full document has been reviewed. Nothing here authorises a paid run.

**Baseline:** `origin/phase-3/checkpoint-d` at `e6a0ead`. Checkpoint D passed at `26d36a1`; Checkpoint E is pending.

**Context:** this is the first part of the bounded Interactive Book workflow: authors choose which source sections generation reads. Composing the book is a later step (parent design §6.1) and is out of scope here: its chapters, their order and the reading pages.

## 1. What exists today (grounding)

- **Ingestion.** DOCX and ODT are read into `Block`s (`ingest/structure/blocks.ts`). `linearize` then turns them into one normalised text plus `Segment`s:
  - a heading line or a list item is an ordinary segment;
  - each table data row is one atomic segment, `[Table n, row r] label: value; …`;
  - a note is a set of `[Note n]` lines placed after the paragraph that cites it.
- **Sentences.** `segmentSentences` numbers sentences `s1…sN` in document order and gives each one:
  - UTF-16 offsets into the stored text;
  - a `headingPath` (a heading line's own path includes the heading);
  - `atomic` and `listDepth`.

  TXT, Markdown and PDF sources have empty heading paths: `markdownToText` drops `#`.
- **What models receive.** Source text reaches a model only through concept extraction: `chunkSentences(doc.sentences)` → `extractionRequest`, which carries the numbered `[sN]` lines and `HEADING CONTEXT`.
  - Merge, align, plan, produce and regenerate see only the concept map: names, summaries, and evidence quotes cited by sentence id.
  - Producers list each cited quote on its own line.
- **Citations.** `evidenceForSentence` builds `ev-sN` from the stored document's offsets. `verifyEvidence` checks it against `doc.text`. The review sheet resolves quotes from the stored `source` artifact.
- **Resume.** `runFingerprint` hashes the source text hash, extraction version, unit text, types, language, prompt settings, chunking and rules. A mismatch raises `IncompatibleResumeError` before any write.
- **S1 and the DOCX rehearsal.** S1 is a PDF replay keyed by `requestKey`, the sha256 of a request. The DOCX rehearsal runs on FakeProvider. Neither uses a scope.

## 2. Design

### 2.1 Outline and stable section identifiers

- **Headings from `linearize`.** `linearize` also returns `headings: { level, text, charStart }[]`, one per heading line it writes. Empty headings, and headings inside cells or notes (which adapters already read as paragraphs), are not headings. Text, segments and sentences are unchanged, so `EXTRACTION_VERSION` and stored `source` artifacts are unchanged.
- **The outline tree.** `buildOutline(document, headings, structures)` is pure.
  - A heading at level L opens a section that runs to the next heading at level ≤ L.
  - Skipped levels nest under the nearest shallower heading.
  - A sentence belongs to the innermost section whose range contains its `charStart`.
- **Section id = the id of its first sentence**, for example `sec-s12`.
  - It stays unique when titles repeat.
  - It is readable beside `extracted.txt`.
  - It is stable for a given source text and extraction version, which the scope binds (§2.4).
  - When a heading splits into several sentences, the section starts at the first of them.
  - Text before the first heading is `sec-s1`, titled "(before the first heading)".
- **Structures.** `linearize` also reports, for the outline only (nothing new is stored in `source`), the line ranges of each:
  - table, by its name (`3`, `Note 2, table 1`);
  - list, as a run of consecutive list-item blocks;
  - list item, as its labelled line plus its continuation lines;
  - note, as its `[Note n]` lines.

  `buildOutline` maps these to sentence ids. Content nested inside a cell is part of that row's single atomic sentence, so it is never a structure of its own.
- **Counts per section.** Each section reports both its own text and its subtree:
  - sentences;
  - counted code points (§2.3);
  - tables and table rows;
  - lists, list items, and sentences within list items, so a two-sentence item counts as 1 item and 2 sentences;
  - notes and note lines;
  - first and last sentence id.

### 2.2 Selection semantics (no duplicate text)

A scope has `include` and `exclude` entries. An entry is either a section, `{ "section": "sec-s12", "title": "…" }`, or a sentence range, `{ "sentences": { "from": "s40", "to": "s85" } }`.

- **Selecting a section selects its subtree:** its own text and every subsection's text.
- **Selecting a subsection alone selects only that subsection.** No body text of its parent is included.
- **Parent without a subsection:** include the parent and exclude the subsection. To take a parent's own introduction only, exclude each of its subsections.
- **Resolution** is set arithmetic over sentence ids: `(∪ include) − (∪ exclude)`.
  - The result is grouped into **passages**: maximal runs of sentences that are adjacent in the document, in document order.
  - Overlapping includes (a parent plus its child) cannot duplicate text; the preview lists such redundant entries.
- **Refused before anything is written:**
  - an empty result;
  - an unknown section or sentence id;
  - a `title` that does not match the outline (it is a checked echo against a mistyped id);
  - an `exclude` that removes nothing;
  - a range whose `from` comes after its `to`;
  - selected text below the minimum (§2.3).
- **Ancestor headings are context only.**
  - For a selected subsection, the titles of its ancestors (the heading path above it) appear in the request's `HEADING CONTEXT`, labelled as context.
  - The ancestors' body text never appears.
  - An ancestor heading line is not evidence and cannot be cited unless its own section, or a range covering that line, is included.
  - This is enforced: extraction verification accepts only the chunk's `[sN]` ids, and an ancestor heading not in the scope is never one of them.

### 2.3 Minimum selection

- **The minimum:** the selected source text must reach **500 Unicode code points**, the same as the source minimum.
- **Counted once.** The count runs over the resolved set: each selected sentence counts once, however many entries cover it.
- **What is excluded** (only source text counts):
  - text the linearizer generated: the row and note prefixes (`[Table n, row r] `, `[Note n] `, `[Note n, table k, row r] `), `Column n: ` labels on tables without a marked header, and the `—` empty-cell marker;
  - ancestor headings that are context only;
  - `[sN]` ids, `(list level n)` tags and passage-gap markers (§2.5).
- **What counts:**
  - table header labels taken from the document, because they are source text;
  - the heading line of a selected section.
- **Unchanged:** admission of the whole document (500–400,000 code points).

### 2.4 Source binding and the scope file

- **The file is `generation-scope.json`, written for the author.**

  ```json
  {
    "kind": "leap.generationScope", "scopeFormat": 1,
    "source": { "fileName": "unit.docx", "originalSha256": "…", "textHash": "…", "extractionVersion": "2026-10-01.1" },
    "include": [ { "section": "sec-s12", "title": "Isolation procedures" }, { "sentences": { "from": "s200", "to": "s240" } } ],
    "exclude": [ { "section": "sec-s30", "title": "Assessment arrangements" } ]
  }
  ```

  It is validated with Zod.
- **Binding.** A scope is bound to its source's `originalSha256` and `textHash`, its `extractionVersion` and its `scopeFormat`. Any mismatch is refused with "re-run leap outline". A different file, or a changed extractor, never reinterprets old ids.
- **The resolved scope** is computed from the file and the source, and it is what is used and stored:
  - `scopeFormat`, `textHash`, `extractionVersion`;
  - `passages: [{ sentenceIds: [...] }]`, ordered;
  - `context`: for every chunk run, the heading path shown as context, as the request will show it;
  - `counts`: counted code points, sentences, items, rows;
  - `partial`: the partial-structure findings (§2.6);
  - `entries`: the author's own include and exclude entries, for the record.
- **`scopeHash`** = sha256 of the canonical JSON of the resolved scope without `entries` and `counts`: the binding, the ordered passages with their sentence ids, and the heading context.
  - It identifies what models are given, not how the author spelt it.
  - Two spellings that resolve to the same passages and context have the same hash.
  - A change to any of them changes the hash.
- **Privacy.** Heading titles are real material. The scope file, `outline.md`, `outline.json`, `sentences.md` and `scope-preview.md` therefore stay outside the repository or under the gitignored `docs/uoc/`, as `extract`'s output does.

### 2.5 Disjoint passages are never shown as continuous text

- **In requests.** In a scoped extraction request, when the next sentence is not adjacent in the document to the previous one, the evidence list carries a marker line: `[gap: sentences sA–sB are not in the generation scope]`.
  - The marker has no `[sN]` id, so it cannot be cited.
  - Verification rejects any id that is not in the chunk.
- **Heading context and chunks.** `HEADING CONTEXT` runs also break at a gap, so it never prints "s10 to s30" across omitted sentences. A chunk that begins mid-scope begins with its passage's first sentence, and a gap marker is shown when the previous chunk ended elsewhere.
- **Labels in scoped requests.** A scoped request adds two fixed lines:
  - "Passages are separate parts of the document; do not treat text across a gap as continuous."
  - "Headings in HEADING CONTEXT are context only and cannot be cited."
- **Whole-document requests are unchanged.** They have one passage, no gaps and none of these lines, so they are byte-identical to today.
- **In the preview.** The preview shows the same markers, and each passage is headed `Passage k (sA–sB)`.
- **Producers.** Producers already list each quote on its own cited line, so separated sentences are never joined into one passage there either.

### 2.6 Partial structures: detection and reporting

A structure is **partial** when the resolved scope contains some, but not all, of its sentences. Detection uses the structure ranges from §2.1 and runs on every resolution.

| Structure | Unit | Reported as |
|---|---|---|
| Table (incl. a table in a note) | data row (one atomic sentence; never split) | `Table 3 under A › B: 4 of 12 rows (rows 1–4)` |
| List | list item | `List 2 under A: 3 of 7 items (items 1–3)` |
| List item | sentence within the item (label line and continuation lines) | `List 2, item 5: 1 of 2 sentences` |
| Note | note line | `Note 2: 1 of 3 lines` |
| Paragraph (any line of the stored text, every source kind) | sentence | `Paragraph at s40–s43: 2 of 4 sentences` |

- **When it can happen.** Section entries can never produce a partial structure, because a table, list or note always lies inside one section. Only sentence ranges can produce one.
- **Partial structures are allowed but always reported:**
  - in `scope-preview.md`;
  - in `leap scope`'s and `leap generate`'s output;
  - in the stored resolved scope (`partial`);
  - in the count line of the import report.
- **A partial table stays intelligible.** Every row line repeats its column labels, so a partial table still makes sense to the model.

### 2.7 Output safety for `outline` and `scope`

Both commands follow `leap extract`'s established rules and reuse its code (`outDirRefusal`, `assertReportNamesFree`, `publishReports`):

- **Where `--out` may be:** outside the repository or under `docs/uoc/`, resolved through symbolic links. It is refused anywhere else in the repository.
- **Every output name is checked first.** An existing file, a symbolic link (even a dangling one), the source file or, for `scope`, the `--scope` file itself is refused with "nothing was written".
- **Publishing is all or nothing:** staged, then hard-linked into place. No file is ever overwritten.
- **Outputs:**
  - `outline` writes `outline.md`, `outline.json`, `sentences.md` and the `generation-scope.json` template;
  - `scope` writes `scope-preview.md` only, and never changes the scope file it reads.
- **Reading inputs.** `leap generate --scope` reads the scope file and stores the resolved scope in the import. It never writes to the file.

### 2.8 Generation, persistence and resume

- **Validation first.** `leap generate --scope <file>` resolves and validates the scope against the loaded source before any write or dispatch. An invalid scope exits 1 and writes nothing.
- **Inside `runImport`** (`RunImportInput.scope?: ResolvedScope`):
  - It checks the binding against `input.source`.
  - The fingerprint material gains `generationScope: scopeHash` **only when a scope is given**. Without one the material is byte-identical, so existing directories and S1 still resume.
  - Under the lock, the resolved scope is stored as the `generationScope` artifact, next to `source` and before `parseUnit` (the first model call).
- **Extraction and size checks use only the scope.** Extraction, and the request-size checks, use the original `Sentence` objects of the resolved passages, filtered but never modified. `extractConceptMap` gains an optional `sentences` argument and the passage information.
- **The full document is kept.** The stored `source` artifact and the original DOCX/ODT bytes remain the full document. Ids and offsets are never renumbered, so every `ev-sN` resolves against the full text.
- **Evidence guard.** Before the concept map is persisted, every evidence sentence id must be in the scope; anything else is a system error.
- **Resume.** A resume with another scope, or none, fails the fingerprint check, and `IncompatibleResumeError` names the generation scope. `regenerate` reads only the stored concept map, so it inherits the scope.
- **Reports.**
  - The cost report and `report.md` state the scope: "Generation scope: whole document", or "Generation scope 1a2b3c…: M of T sentences, P passages, partial structures k".
  - Unsupported criteria are labelled as possibly outside the scope.
  - The gate report shows the same per import; its numbers-only summary carries counts and the hash, never heading text.
- **Default.** Whole-document generation stays the default: no flag means no artifact, no fingerprint change and no request change.

### 2.9 What a scope guarantees, and what it does not

- **What a scope guarantees:** filtering limits the source material supplied to models, and the sentences they may cite, to the selection. The tests in §4 enforce this.
- **What it cannot guarantee:** that generated names, summaries, questions or feedback contain no claim the selection does not support. A model can still draw on general knowledge or overreach.
- **Human review still applies.** The existing grounding checks and the rubric review (correctness, mapping, the `rto-claim` tag) remain the safeguard, and the scope does not relax them.

### 2.10 Documents without usable headings

- **Which documents have none:**
  - TXT, Markdown and PDF always have none in this increment. Heading support for Markdown would change its sentences and needs an extraction-version change, so it is deferred.
  - A DOCX or ODT whose apparent headings are only bold paragraphs has none either.
- **What the outline does.** It shows a single section, `sec-s1` (the whole document), and says "no usable headings: select sentence ranges".
- **The explicit fallback is sentence ranges.**
  - `sentences.md` lists every sentence as `[sN]`, with its heading path (if any), its structure (table, list item, note) and its text.
  - The author writes `{ "sentences": { "from", "to" } }` entries.
  - Passages, gap markers, partial-structure reports and the minimum apply exactly as for sections.
- **Headings are never inferred from formatting.** If a file lacks heading styles, the fix is to apply them in a copy. That copy is a new source and a new import; the original is never altered.
- **Before P1, with no model call or key:** Benjamin can run `leap outline` on his Mac against the BSBAUD412 packet to see which case applies.

### 2.11 Generation scope is not book reading

- **What a scope decides.** The scope decides what models may read, not what learners read.
- **What the later book decides.** A later book composition gets its own `reading` choice: the sections published as reading pages. That choice is stored on the composition (§6.1) and rendered from the structured blocks, so tables and lists display properly.
- **The two stay separate.** The book may offer the generation scope as a starting suggestion, but the two are stored and changed separately.
- **Out of this slice:** no book code is added. The legacy narrated Story Book workflow (`apps/cli-legacy`: `interactivebook-ai`, `youtube-extract`) is untouched.

### 2.12 CLI author flow (this increment)

1. `leap outline <source> --out <dir>`: writes the outline, the sentence list and the scope template (§2.7). No model call, no key.
2. The author edits `generation-scope.json`.
3. `leap scope <source> --scope <file> --out <dir>`: validates the scope and writes `scope-preview.md`. The preview contains:
   - chunk by chunk, **exactly the `HEADING CONTEXT`, scope lines, passage markers and `[sN]` lines the extraction requests will contain**, with tables as row lines and list items with their labels and levels;
   - counts, partial structures, redundant entries and the `scopeHash`.

   No model call.
4. `leap generate … --scope <file>`: resolves the scope again, prints the hash, counts and partial structures, and refuses on any binding mismatch.

### 2.13 Later visual interface (outline only, not built)

- **Layout:** a two-pane page.
  - The left pane is the outline tree. Each node has a tri-state checkbox (all, part or none of its subtree), its counts, and a running total of counted code points against the 500 minimum.
  - The right pane is the exact preview: tables and lists rendered, gaps shown, partial structures highlighted.
- **Without usable headings:** the interface offers sentence-range selection.
- **Shared code:** it saves the same `generation-scope.json` and calls the same generator functions (`buildOutline`, `resolveScope`, `scopePreview`), so its meaning cannot drift from the CLI's.

## 3. Files

| Area | Files |
|---|---|
| Headings, structures, outline | `packages/generator/src/ingest/structure/linearize.ts` (heading and structure ranges), `ingest/docx.ts` and `ingest/odt.ts` (return them), new `ingest/outline.ts` |
| Scope core | new `packages/generator/src/scope/{schema,resolve,partial,count,preview,index}.ts`; export from `src/index.ts` |
| Pipeline | `concepts/index.ts` (`sentences` and passage option), `concepts/extract.ts` (scoped lines, gap markers, gap-aware heading context), `pipeline/fingerprint.ts`, `pipeline/run-import.ts` (binding, persistence, filtering, evidence guard) |
| Reports | `packages/generator/src/report/gate.ts`, `apps/cli/src/report.ts` |
| CLI | `apps/cli/src/source.ts` (outline and structures in `LoadedSource`), new `apps/cli/src/scope.ts` (`outline`, `scope`, reusing `extract.ts`'s output safety), `apps/cli/src/generate.ts` (`--scope`), `apps/cli/src/index.ts` |
| Docs | `README.md`, `docs/testing/phase-3-pilot.md` step 3, this design, a plan amendment |

## 4. Tests (synthetic fixtures only; private material stays on Benjamin's Mac)

**Outline and structures** (`structure.docx`/`.odt` and small builder documents):
- ids, levels and heading paths;
- duplicate titles give distinct ids; skipped levels; text before the first heading; a heading split into two sentences;
- headings inside cells and notes are not sections;
- own and subtree counts: rows, lists, items, sentences within items (a two-sentence item counts 1 item and 2 sentences), notes and note lines;
- TXT, Markdown and PDF each give one section with "no usable headings";
- the extracted text and sentences are unchanged: the golden texts pass, and documents ingested before and after are deep-equal.

**Resolution:**
- parent; child alone; parent minus child; parent plus child with no duplicates;
- every refusal in §2.2.

**Binding:** each of the following is refused:
- a changed `originalSha256`;
- a changed `textHash`;
- a changed `extractionVersion`;
- an unknown `scopeFormat`.

**Minimum:**
- 499 counted code points is refused, 500 is accepted, measured with astral characters;
- generated prefixes, `Column n:` labels, `—`, context-only ancestor headings and markers are not counted;
- a sentence covered by two entries counts once.

**Passages and gaps:**
- disjoint ranges give separate passages;
- a gap marker sits at each gap in the request, the preview and across chunk boundaries;
- heading context breaks at gaps;
- a model citing a marker or an ancestor heading id is rejected by verification.

**Partial structures:** each row of the §2.6 table is detected and reported in the preview, the CLI output and the stored scope. Section-only scopes report none.

**Property test:**
- resolved ids are unique, in document order, a subset of the document, and grouped into maximal adjacent passages;
- each resolved sentence's text equals `doc.text.slice(charStart, charEnd)`.

**Preview exactness:** for each chunk, the preview's lines equal the request's EVIDENCE and context lines from `extractionRequest(chunk).user`.

**Fingerprint:**
- with no scope it equals a value pinned at `e6a0ead`;
- two spellings of the same resolved scope give the same `scopeHash`;
- changing the passages or the heading context changes it.

**Output safety (`outline` and `scope`):**
- `--out` inside the repository (outside `docs/uoc/`), or reached through a symbolic link into it, is refused;
- an existing output, a dangling link, the source file or the scope file as an output name is refused, with nothing written;
- a name that appears during publishing leaves no partial output.

**Pipeline (FakeProvider):**
- no text unique to an unselected sentence appears in any request of any purpose;
- every evidence id is in scope;
- the stored `source` is the full document;
- `generationScope` is stored before the first call;
- a resume with the same scope succeeds; another scope, or none, is refused;
- the evidence guard throws on an injected out-of-scope id.

**Unchanged whole-document behaviour:**
- the rehearsal replays S1 with no recording miss and the same fingerprint;
- a whole-document DOCX run's extraction requests are byte-identical to those before the change, compared by `requestKey`;
- no `generationScope` artifact is written;
- the `apps/cli-legacy` suites pass unchanged.

**CLI:**
- an invalid `--scope` leaves `--out` unwritten;
- the report and gate lines appear;
- the gate summary and `gate-report.md` contain no heading text.

## 5. Order of work (each step verified, committed locally and reviewed)

1. Heading and structure ranges, outline, counts and `leap outline` with output safety.
2. Scope schema, binding, resolution, minimum, partial structures, preview and `leap scope`.
3. Pipeline: scoped requests with gap markers, fingerprint, persistence, evidence guard and `generate --scope`.
4. Reports, gate report and documentation.

## 6. Decisions (Benjamin, 9 Oct 2026)

1. **Minimum:** 500 Unicode code points of selected source text, counted once, excluding generated labels and context-only ancestor headings (§2.3).
2. **Parent headings:** kept as clearly labelled context without their body text; not evidence unless included (§2.2, §2.5).
3. **Names:** `outline`, `scope`, `--scope` and `generation-scope.json`.
4. **Markdown headings:** deferred; sentence ranges are the explicit fallback (§2.10).
