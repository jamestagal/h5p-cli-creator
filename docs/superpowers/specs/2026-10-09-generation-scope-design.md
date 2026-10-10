# Generation scope: author selection of source sections (design and plan)

**Status:** revision 4 with the r4 review clarifications (§7), approved for Step 1 on 9 Oct 2026; Steps 2–4 await review of Step 1. The direction was approved on 9 Oct 2026, and §7 records each revision. Revision 4 settles four contract corrections:
- re-ingestion is authoritative;
- origin is carried through normalisation of the joined text;
- the scope file carries its preview configuration;
- every `Column n` fallback is excluded from the count.

Implementation is on hold until this revision is reviewed. Nothing here authorises a paid run.

**Baseline:** `origin/phase-3/checkpoint-d` at `e6a0ead`. Earlier revisions on `phase-3/generation-scope-design`: r2 `ec32660`, r3 `1284d52`. Checkpoint D passed at `26d36a1`; Checkpoint E is pending.

**Context:** this is the first part of the bounded Interactive Book workflow: authors choose which source sections generation reads. Composing the book (its chapters, their order and its reading pages, parent design §6.1) comes later and is out of scope here.

## 1. What exists today (grounding)

- **Ingestion.** DOCX and ODT are read into `Block`s (`ingest/structure/blocks.ts`), normalised with `normaliseBlocks`, and linearized into one text plus `Segment`s.
  - A heading line or a list item is an ordinary segment.
  - Each table data row is one atomic segment: `[Table n, row r] label: value; …`.
  - A note becomes `[Note n]` lines, placed after the paragraph that cites it.
- **Inserted text.** Adapters insert note references (`[n]`) into paragraph text before linearizing. The linearizer itself adds row and note prefixes, `Column n` labels, the `—` empty-cell marker, separators, list labels, sub-list brackets and indentation.
  - None of this is distinguishable from authored text today. An empty cell and a cell containing a genuine `—` produce identical output.
- **Sentences.** `segmentSentences` numbers sentences `s1…sN` in document order. Each sentence has:
  - UTF-16 offsets into the stored text;
  - a `headingPath`, which for a heading line includes the heading itself;
  - `atomic` and `listDepth`.
  - TXT, Markdown and PDF sources have empty heading paths.
- **What models see.** Source text reaches a model only through concept extraction: `chunkSentences(doc.sentences, chunkTokens)` → `extractionRequest`, which sends numbered `[sN]` lines and `HEADING CONTEXT`.
  - Merge, align, plan, produce and regenerate see only the concept map, whose evidence quotes are cited by sentence id. Producers list each quote on its own line.
  - `leap generate` has no chunk-size flag; `runImport` uses `DEFAULT_CHUNK_TOKENS` (6000).
- **Hashes and binding.** A `SourceDocument` carries `textHash` and `extractionVersion` for every format, but `originalSha256` only for DOCX and ODT.
  - `LoadedSource` (CLI) has the bytes and their sha256 for every format.
  - `runImport` receives the original bytes only for DOCX and ODT, and verifies and stores them there.
- **Resume.** `runFingerprint` hashes the source text hash, extraction version, unit text, types, language, prompt settings, chunking and plan rules. A mismatch raises `IncompatibleResumeError` before any write.
- **S1 and the DOCX rehearsal.** S1 is a PDF replay keyed by `requestKey`. The DOCX rehearsal uses FakeProvider. Neither has a scope.

## 2. Design

### 2.1 Source analysis: headings, structures and character origin

Ingestion returns a `SourceAnalysis` alongside the document. Nothing new is added to the stored `source` artifact. Text, segments, sentences and `EXTRACTION_VERSION` are unchanged.

```ts
interface SourceAnalysis {
  textHash: string; extractionVersion: string;               // must equal the document's
  headings: Array<{ level: 1|2|3|4|5|6; text: string; charStart: number; charEnd: number }>;
  structures: Structure[];                                     // tables, lists, list items, notes (below)
  generated: Array<[charStart: number, charEnd: number]>;      // generated character spans; everything else is source
}
```

- **Headings.** `linearize` records each heading line it writes. Empty headings, and headings in cells or notes (which adapters read as paragraphs), are not headings.
- **Structures.** For each structure, `linearize` records its line range; `buildOutline` maps the ranges to sentence ids. The structures are:
  - each table, by its name (`3`, `Note 2, table 1`);
  - each list: a run of consecutive list-item blocks;
  - each list item: its labelled line plus its continuation lines;
  - each note: its `[Note n]` lines.

  A table, list or note nested inside a cell is part of that row's single atomic sentence. It is never a separate structure.
- **Character origin.** Every character of the stored text is either *source* (authored in the document) or *generated* (written by an adapter or the linearizer). `generated` lists the generated spans in final-text UTF-16 coordinates. The spans are sorted, merged, non-overlapping and within bounds.

  **Generated text** is exactly:

  | Origin | Generated text |
  |---|---|
  | Adapters (DOCX, ODT) | note references `[n]` inserted into block text |
  | Line structure | the `\n` between lines; list indentation and hanging-indent spaces |
  | Table rows | `[Table n, row r] `; every `Column n` label `labelsFor` falls back to, whether the table has no marked header row or has marked header rows whose cells in that column are empty; the ` / ` joining values from several header rows; `: ` after each label; `; ` between pairs; the `—` that stands for an empty cell |
  | Nested content in a cell | the ` ` joining parts; `[Table n.k ` … `]` with `row r: `, `, ` and `; `; ` [sub-list:` and `]`; `[Note n] ` inside a cell |
  | Lists | list labels rendered from numbering definitions (`1.`, `a)`, `•`), and the space after them |
  | Notes | `[Note n] ` and `[Note n, table k, row r] ` prefixes |
  | ODT containers | the space joining text nodes directly inside a container |

  **Source text** includes:
  - heading, paragraph, item and cell text;
  - header-cell labels taken from the document, even one that reads "Column 1";
  - a genuine `—`, `[1]` or `1.` typed by the author;
  - authored whitespace inside block text, including whitespace that normalisation collapsed.
- **How origin is carried: the joined text is authoritative.**
  - An adapter supplies block or cell text as runs, `{ text, generated?: true }`, only where it inserts markers. Their concatenation is the raw text it passes today.
  - **The text** is exactly `normaliseBlockText(joined)`, as today. Runs are never normalised independently. That would be wrong: NFC of `"e"` followed separately by NFC of a combining acute (U+0301) is `"é"`, but NFC of the joined pair is `"é"`.
  - **The origin** is computed by a separate mapping that follows the same three steps in the same order:
    1. **NFC.** The joined raw text is split into extended grapheme clusters (`Intl.Segmenter`, granularity `grapheme`). Each output cluster takes its origin from its input cluster:
       - **source** if every input code point was source;
       - **generated** if every input code point was generated;
       - **mixed:** where NFC leaves the cluster unchanged, origin is kept per code point; where it changes the cluster, the whole cluster is **generated**. Treating it as generated can only lower the source count; it can never count generated text as source.

       After this step, the clusters' NFC forms joined together must equal NFC of the whole text. If they ever differ, which Unicode does not guarantee against, the whole block's origin is marked generated and an `originFallback` warning is recorded, naming the block's position and its source and generated code-point counts. The text itself is still the joined NFC. The fallback preserves the text exactly and cannot raise the source count.
    2. **Whitespace collapse.** Newlines become spaces and runs of spaces and tabs become one space. A collapsed space is source if any character it replaced was source.
    3. **Trim.** Trimmed characters are dropped together with their origin.
  - **Code points, not code units.** Origin is held per code point, so an astral character (a surrogate pair) is never split between origins. The resulting spans are converted to UTF-16 offsets at the end.
  - **Counting unit.** Counting is always by Unicode code point (§2.4). Grapheme clusters are used only to map origin through NFC. They are never a counting unit, and UTF-16 code units are never one either. For example, `👩‍🔧` (woman, zero-width joiner, wrench) is 3 code points, 1 grapheme and 5 UTF-16 code units, and as source text it counts 3.
  - **Unchanged text.** The resulting `text` is byte-identical to today's, and `assertNormalised` still applies.
  - **Into `linearize`.** The block gains an internal `generated` range list. `linearize` adds these ranges to its own generated pieces, which are inserted between already-normalised texts and need no further normalisation.
- **Plain sources.** For TXT, Markdown and PDF, `generated` is empty and `headings` and `structures` are empty. Markdown syntax is removed, not added. PDF page joins are newlines, which no sentence contains.

### 2.2 Outline and stable section identifiers

- **Sections.** `buildOutline(document, analysis)` is pure and builds a tree.
  - A heading at level L opens a section that runs to the next heading at level ≤ L.
  - Skipped levels nest under the nearest shallower heading.
  - A sentence belongs to the innermost section whose range contains its `charStart`.
- **Section id = the id of its first sentence**, for example `sec-s12`.
  - It is unique when titles repeat, and readable beside `extracted.txt`.
  - It is stable for a given binding (§2.5).
  - A heading split into several sentences starts at the first of them.
  - Text before the first heading is `sec-s1`, "(before the first heading)".
- **Counts per section,** own and subtree:
  - sentences;
  - source code points (§2.4);
  - tables and rows;
  - lists, list items, and sentences within items, so a two-sentence item counts as 1 item and 2 sentences;
  - notes and note lines;
  - the first and last sentence id.

### 2.3 Selection semantics (no duplicate text)

A scope has `include` and `exclude` entries. Each entry is either a section, `{ "section": "sec-s12", "title": "…" }`, or a sentence range, `{ "sentences": { "from": "s40", "to": "s85" } }`.

- **Selecting a section selects its subtree.**
- **Selecting a subsection selects only that subsection,** with no body text from its parent.
- **Parent without a child:** include the parent and exclude the child.
- **Resolution** is `(∪ include) − (∪ exclude)` over sentence ids. The result is grouped into **passages**: maximal runs of document-adjacent sentences, in document order.
  - Overlapping entries cannot duplicate text; redundant entries are listed in the preview.
- **Refused before anything is written:**
  - an empty result, or an unknown id;
  - a `title` that does not match the outline;
  - an `exclude` that removes nothing;
  - a range whose `from` comes after its `to`;
  - a selection below the minimum (§2.4).
- **Ancestor headings are context only.**
  - A selected subsection's ancestor titles appear in `HEADING CONTEXT`, labelled as context.
  - Their body text never appears.
  - An ancestor heading line is not citable unless its own section, or a range covering it, is included. Extraction verification accepts only the chunk's `[sN]` ids.

### 2.4 Minimum: source code points, counted once

- **Rule:** the selection must contain at least **500 Unicode code points of source text** (§2.1).
- **How it is counted:** for each sentence in the resolved set (each counted once), count the code points of `text.slice(charStart, charEnd)` that lie outside every `generated` span and every repeated-unit occurrence. Then add, once for each repeated unit with at least one occurrence in the selected sentences, that unit's own source count.
- **Repeated units** (amended after the Step 1 review). The linearizer writes some authored text more than once:
  - a marked header label part, on every data row;
  - the value of a cell that spans several positions, at every position it covers.

  Every rendered occurrence keeps the identity of the cell it came from: its table plus the row and column where the cell was written. That identity is the unit, and the analysis lists each occurrence as `repeats`.
  - **Once per selection:** a selection counts each unit once, whichever occurrences it holds. Later table rows selected alone still count their header labels once, even when the first row is excluded; a span copy selected without its original counts too.
  - **Copies add nothing:** several occurrences of one unit together still count once.
  - **Independent text stays distinct:** separately authored cells are different units even when their text is equal. Two "High" cells, two "Risk" header cells, and equal headers in two tables each count.
  - **Nested repeats:** a unit's own count applies the same rule to any units inside it.
- **What never counts:** context-only ancestor headings, request scaffolding (`[sN]`, `(list level n)`, gap markers, scope lines) and anything generated.
- **Lookalike text still counts:** an author's genuine `—`, `[1]`, `1.` or "Column 1" header counts. The empty-cell `—`, any `Column n` fallback label, a note reference and a rendered list label do not.
- **Whole-document admission** (500–400,000 code points of stored text) is unchanged.

### 2.5 Binding, the scope file and the canonical `scopeHash`

**The binding** is three values: `originalSha256` (the sha256 of the file's bytes), `textHash` and `extractionVersion`. Together with `scopeFormat`, they bind the scope for every format:

- **TXT, Markdown and PDF:** the document does not carry `originalSha256`. The bytes reach `runImport` through the scope input (§2.9), and `runImport` hashes them itself. They are not stored; the hash is persisted in the `generationScope` artifact.
- **DOCX and ODT:** as today, the bytes reach `runImport` as `input.original`, which is verified against `metadata.originalSha256` and stored. The scope input's bytes must hash to the same value.

**The author's file, `generation-scope.json`** (validated with Zod):

```json
{
  "kind": "leap.generationScope", "scopeFormat": 1,
  "source": { "fileName": "unit.docx", "originalSha256": "…", "textHash": "…", "extractionVersion": "2026-10-01.1" },
  "include": [ { "section": "sec-s12", "title": "Isolation procedures" }, { "sentences": { "from": "s200", "to": "s240" } } ],
  "exclude": [ { "section": "sec-s30", "title": "Assessment arrangements" } ],
  "previewConfig": { "chunkTokens": 6000, "scopedLayoutVersion": 1 }
}
```

- **Binding check.** All three binding values in the file must match the ones computed from the bytes. Otherwise the scope is refused with "re-run leap outline". `fileName` is informational and is never compared.
- **Unknown versions.** An unknown `scopeFormat` or `scopedLayoutVersion` is refused.
- **`previewConfig`.** `previewConfig` holds the request configuration that the preview was made with and that scoped generation must use (§2.6):
  - `chunkTokens` is a positive integer;
  - `scopedLayoutVersion` versions the scoped rendering layout: gap-marker wording, scope lines and gap-aware heading context.

  `leap outline` writes the template with `chunkTokens` set to `DEFAULT_CHUNK_TOKENS` and the current `SCOPED_LAYOUT_VERSION`. The author may change `chunkTokens` before previewing.

**The `scopeHash` payload** is canonical, with exactly these keys in this order:

```json
{
  "scopeHashVersion": 1,
  "scopeFormat": 1,
  "binding": { "originalSha256": "<hex>", "textHash": "<hex>", "extractionVersion": "<string>" },
  "passages": [ { "sentenceIds": ["s12", "s13", "s14"] }, { "sentenceIds": ["s40", "s41"] } ],
  "context": [ { "passage": 0, "from": "s12", "to": "s14", "headingPath": ["Safety", "Isolation"] }, { "passage": 1, "from": "s40", "to": "s41", "headingPath": ["Testing"] } ]
}
```

- **`passages`:** the resolved sentence ids, grouped and ordered as in §2.3.
- **`context`:** the heading context models are given, independent of chunking. These are runs within each passage, broken wherever the heading path changes, in order.
- **Serialisation:** the payload object is built field by field in the order shown, so JSON key order is fixed. It is serialised with `JSON.stringify` (no whitespace), encoded as UTF-8 and hashed with sha256 (hex).

**What the hash covers.** Everything in the payload, and nothing else.

- **Changes the hash:** a different binding, a different passage or sentence, or a different heading path.
- **Does not change the hash:**
  - the author's entries, or a different spelling of the same selection;
  - `fileName`;
  - counts, partial-structure findings, redundant-entry notes and warnings.

  These are derived or presentational. The partial findings, for example, follow from the passages and the analysis, both already bound.
- **`previewConfig` is configuration, not meaning.** It is not in `scopeHash`: changing the chunk size changes how the same selection is split, not what is selected. It is bound in the scoped run fingerprint instead (§2.9).

**Stored scope records.**
- **`generationScope` artifact:** the payload, `scopeHash`, `previewConfig`, and every derived field that reports use (counts, partial findings, redundant-entry notes, warnings). It is a record and is never read back as trusted input (§2.9).
- **Author entries:** kept separately, as the `generationScopeEntries` artifact. This is an append-only history of the include and exclude entries each run was given, with the time each spelling was first used.
- **Why they are separate:** a resume with a different spelling that resolves to the same payload is accepted, and its entries are appended. Entries are never compared, because equivalent spellings must stay able to resume.

**Privacy.** Heading titles are real material. The scope file, `outline.md`, `outline.json`, `sentences.md` and `scope-preview.md` stay outside the repository or under the gitignored `docs/uoc/`.

### 2.6 Passages, gaps and chunk continuation: one rendering contract

`renderScopedEvidence(chunks, scope)` produces the evidence and context lines for each chunk. Both `extractionRequest` and the preview call it, so the preview *is* the request text.

- **Packing.** Chunks are packed over the scope's sentences in document order, exactly as `chunkSentences` packs today. A gap marker's tokens are charged to the sentence that follows it.
- **Gap rule.** A gap marker precedes a selected sentence `s` exactly when:
  - `s` is not the first sentence of the scope, and
  - the previously selected sentence is not `s`'s immediate predecessor in the document.

  The marker reads `[gap: sentences sA–sB are not in the generation scope]` and names the omitted range. It has no `[sN]` id and cannot be cited.
- **The rule is per sentence, so chunk boundaries are irrelevant to it:**
  - A **passage continuing into the next chunk** resumes at its next sentence. There is no marker, no passage restart and no false gap.
  - An **omission that coincides with a chunk boundary** gets its marker as the first evidence line of the next chunk.
  - Text before the first passage, and after the last, is not between presented passages, so it gets no marker. The preview header names the first and last selected sentence.
- **Heading context** runs (the `context` of §2.5, cut at chunk boundaries) also break at every gap. They never print "s10 to s30" across omitted sentences.
- **Scope lines.** A scoped request adds two fixed lines:
  - "Passages are separate parts of the document; do not treat text across a gap as continuous."
  - "Headings in HEADING CONTEXT are context only and cannot be cited."
- **Whole-document requests are unchanged.** A whole-document run takes the existing path: no scope, one passage, no markers, no scope lines. Its requests are byte-identical.
- **Preview and generation use one configuration: the scope file's `previewConfig`.**
  - `leap scope` renders with `previewConfig.chunkTokens` and `previewConfig.scopedLayoutVersion`. The preview header prints both, with the chunk count.
  - Scoped generation (`leap generate --scope`, and `runImport` with a scope) chunks with `previewConfig.chunkTokens` and renders with that layout version.
  - An explicit programmatic chunk setting that disagrees is refused before any write or model call: `RunImportDeps.chunkTokens` set to a different value. The refusal names both values.
  - A `scopedLayoutVersion` other than the code's current version is refused, so the preview's layout always matches what will be sent.
- **Unscoped runs are unchanged.** They keep today's behaviour, including a custom `RunImportDeps.chunkTokens`, and their fingerprints are unchanged.

### 2.7 Partial structures: detection and reporting

A structure is partial when the resolved scope holds some, but not all, of its sentences. Detection uses `analysis.structures` and runs on every resolution.

| Structure | Unit | Reported as |
|---|---|---|
| Table (including one in a note) | data row (one atomic sentence) | `Table 3 under A › B: 4 of 12 rows (rows 1–4)` |
| List | list item | `List 2 under A: 3 of 7 items (items 1–3)` |
| List item | sentence within the item | `List 2, item 5: 1 of 2 sentences` |
| Note | note line | `Note 2: 1 of 3 lines` |
| Paragraph (any stored line, every format) | sentence | `Paragraph at s40–s43: 2 of 4 sentences` |

- **Section entries never produce a partial structure,** because each structure lies within one section. Only sentence ranges can.
- **Partial structures are allowed, and always reported:**
  - in the preview;
  - in `scope`'s and `generate`'s output;
  - in the stored artifact;
  - in the import report.
- **A partial table stays readable,** because every row line repeats its column labels.

### 2.8 Output safety for `outline` and `scope`

Both commands reuse `leap extract`'s rules and code (`outDirRefusal`, `assertReportNamesFree`, `publishReports`).

- **Where `--out` may be:** outside the repository or under `docs/uoc/`, resolved through symbolic links.
- **What an output name may not be:** an existing file, a symbolic link (even a dangling one), the source, or (for `scope`) the `--scope` file. Any of these is refused, with nothing written.
- **Publishing:** outputs are staged, then hard-linked into place, all or nothing. Nothing is overwritten.
- **What each command writes:**
  - `outline` writes `outline.md`, `outline.json`, `sentences.md` and a `generation-scope.json` template, with the binding filled in and `include: []`.
  - `scope` writes only `scope-preview.md`.
  - `generate --scope` only reads the scope file.

### 2.9 Generation, persistence and resume: `runImport` trusts nothing supplied

- **The input.** `RunImportInput.scope?: { file: GenerationScopeFile; bytes: Buffer; ext: SourceExtension }`. `runImport` accepts no resolved ids, counts, analysis or hash; it recomputes them.
- **Re-ingestion is authoritative.** In a scoped run, the document `runImport` uses is the one it re-ingests from `bytes`, never the caller's.
  - The caller's `input.source` is accepted only when it agrees **completely** with the re-ingested document:
    - a canonical deep comparison of `kind`, `text`, `textHash`, `sourceId`, every sentence (id, offsets, text, `headingPath`, `atomic`, `listDepth`) and every metadata field;
    - a mismatch anywhere is refused before any write, naming the first differing field.
  - Re-ingestion uses the caller's `sourceId` and `fileName`. Agreement is therefore exact, not approximate.
  - From then on, scoped resolution, the request-size checks, extraction, evidence building and the stored `source` artifact all use the re-ingested document object.
- **Validation under the lock, before any write:**
  1. Validate `file` with Zod, including `previewConfig`.
  2. Compute sha256(`bytes`). For DOCX and ODT, require it to equal `input.original`'s hash.
  3. Re-ingest `bytes` with the generator's `ingestSource(bytes, ext, { sourceId, fileName })`. This gives the authoritative document and its `SourceAnalysis`.
  4. Require complete agreement of `input.source` with the re-ingested document.
  5. Check the file's binding against the computed `originalSha256`, `textHash` and `extractionVersion`.
  6. Check `previewConfig`: a known layout version, and no conflicting explicit `RunImportDeps.chunkTokens`.
  7. Resolve, check the minimum, detect partial structures, and compute the payload and `scopeHash`.
- **On resume (scoped):** all the steps above run again. In addition:
  - the stored `source` artifact must deep-equal the re-ingested document, or it is refused as altered;
  - the stored `generationScope` must deep-equal the record recomputed from the bytes and the scope file. The comparison covers the payload, `previewConfig` and every derived field that reports use. A mismatch is refused as altered. Checking only the declared `scopeHash` is not enough, because an edit to a derived field or `previewConfig` leaves that hash unchanged. This check is required before Step 3 is complete;
  - the stored `generationScopeEntries` history is not compared. The run's entries are appended to it.

  (Checking stored sources of *unscoped* imports on resume is not part of this increment, so unscoped behaviour stays unchanged.)
- **Fingerprint and storage.**
  - For a scoped run, the fingerprint material gains `generationScope: { scopeHash, chunkTokens, scopedLayoutVersion }`, and the material's `chunkTokens` is `previewConfig.chunkTokens`.
  - Without a scope the material is byte-identical, so existing directories, custom unscoped chunk sizes and S1 still resume.
  - The `source` and `generationScope` artifacts are written before `parseUnit`, the first model call.
- **Extraction.** Extraction uses the re-ingested document's `Sentence` objects for the resolved passages, rendered by `renderScopedEvidence` with `previewConfig`. Nothing is renumbered.
- **The full document is kept.** The stored `source` (the re-ingested document) and the DOCX/ODT original remain the full document. Every `ev-sN` resolves against the full text.
- **Evidence guard.** Before the concept map is persisted, every evidence sentence id must be in scope; anything else is a system error. `regenerate` reads only the concept map and so inherits the scope.
- **The CLI.** `leap generate --scope` and `leap scope` call the same generator functions. They resolve the scope early only to refuse quickly and to print the hash, counts and partial findings; `runImport` does not rely on that.
- **Reports.**
  - The cost report and `report.md` state the scope:
    - "Generation scope: whole document", or
    - "Generation scope 1a2b3c…: M of T sentences, P passages, k partial structures".
  - Unsupported criteria are labelled as possibly outside the scope.
  - The gate report shows the same line. Its summary has counts and the hash, and never heading text.
- **Default.** Whole-document generation stays the default: no flag means no artifact, no fingerprint change and no request change.

### 2.10 What a scope guarantees, and what it does not

- **What a scope guarantees:** filtering limits the source material supplied to models, and the sentences they may cite, to the selection plus labelled ancestor-heading context.
- **What it cannot guarantee:** that generated names, summaries, questions or feedback contain no unsupported claim.
- **Review still applies:** the grounding checks and the rubric review (correctness, mapping, `rto-claim`) remain the safeguard, and the scope does not relax them.

### 2.11 Documents without usable headings

- **Which documents have none:**
  - TXT, Markdown and PDF, always, in this increment. Markdown headings are deferred, because adding them would change sentences and need an extraction-version change.
  - A DOCX or ODT whose apparent headings are only bold paragraphs.
- **What the outline shows:** a single section, `sec-s1` (the whole document), with the note "no usable headings: select sentence ranges".
- **The explicit fallback: sentence ranges.**
  - `sentences.md` lists each `[sN]` with its heading path (if any), its structure and its text.
  - The author writes `{ "sentences": { "from", "to" } }` entries.
  - Passages, gaps, partial structures, the minimum and binding apply unchanged.
- **Headings are never inferred from formatting.** To get headings, style a copy of the file. That copy is a new source and a new import; the original is never altered.
- **Before P1, with no model call:** Benjamin can run `leap outline` on his Mac against BSBAUD412 to see which case applies.

### 2.12 Generation scope is not book reading

- **The scope** decides what models read, not what learners read.
- **A later book composition** will have its own `reading` choice: the sections published as reading pages. That choice is stored on the composition (§6.1) and rendered from the structured blocks. The book may suggest the generation scope as a starting point, but the two are stored and changed separately.
- **In this increment:** no book code. The legacy narrated Story Book workflow (`apps/cli-legacy`: `interactivebook-ai`, `youtube-extract`) is untouched.

### 2.13 CLI author flow (this increment)

1. `leap outline <source> --out <dir>` writes the outline, the sentence list and the template. No model call, no key.
2. The author edits `generation-scope.json`.
3. `leap scope <source> --scope <file> --out <dir>` validates the scope and writes `scope-preview.md`. The preview has:
   - a header: binding, `scopeHash`, `previewConfig` (chunk size and layout version), chunk count, first and last selected sentence;
   - counts, partial structures and redundant entries;
   - for each chunk, exactly the `renderScopedEvidence` output its extraction request will contain.

   No model call.
4. `leap generate … --scope <file>` runs with the scope. `runImport` recomputes and checks everything.

### 2.14 Later visual interface (outline only, not built)

- **Layout:** two panes.
  - The left pane is the outline tree, with tri-state checkboxes, counts, and a running total of source code points against 500.
  - The right pane is the exact preview (`renderScopedEvidence`), with tables and lists rendered, gaps shown and partial structures highlighted.
- **Without usable headings,** it offers range selection.
- **Same code as the CLI.** It saves the same file and calls the same generator functions, so its meaning cannot drift from the CLI's.

## 3. Files

| Area | Files |
|---|---|
| Analysis | `ingest/structure/blocks.ts` (runs, origin through `normaliseBlocks`), `ingest/structure/linearize.ts` (headings, structures, generated spans), `ingest/docx.ts` and `ingest/odt.ts` (note references as generated runs; return the analysis), `ingest/text.ts` and `ingest/pdf.ts` (empty analysis), new `ingest/ingest-source.ts` (`ingestSource(bytes, ext)` with sha256, moved from the CLI's `loadSource` dispatch), new `ingest/outline.ts` |
| Scope core | new `packages/generator/src/scope/{schema,resolve,count,partial,hash,render,preview,index}.ts`; exported from `src/index.ts` |
| Pipeline | `concepts/index.ts` and `concepts/extract.ts` (scoped rendering through `renderScopedEvidence`), `pipeline/fingerprint.ts`, `pipeline/run-import.ts` (authoritative re-ingestion, binding, `previewConfig`, persistence, guard), a `SCOPED_LAYOUT_VERSION` constant |
| Reports | `packages/generator/src/report/gate.ts`, `apps/cli/src/report.ts` |
| CLI | `apps/cli/src/source.ts` (uses `ingestSource`), new `apps/cli/src/scope.ts` (`outline`, `scope`), `apps/cli/src/generate.ts` (`--scope`), `apps/cli/src/index.ts` |
| Docs | `README.md`, `docs/testing/phase-3-pilot.md` step 3, this design, a plan amendment |

## 4. Tests (synthetic fixtures only; private material stays on Benjamin's Mac)

**Unchanged extraction.**
- The existing golden texts pass unchanged.
- For every fixture, the document from `ingestSource` deep-equals today's.
- `textHash` and every sentence are identical.

**Origin metadata.**
- *Span invariants:* sorted, merged, in bounds.
- *Generated spans:* each one's text is one of the §2.1 generated forms.
- *Every generated form is covered,* each in its own fixture:
  - `[Table n, row r] `, `Column n` (with no marked header and as a fallback in marked header rows), ` / `, `: `, `; `, the empty-cell `—`;
  - nested-table brackets, `row r: `, `, ` and `; `; ` [sub-list:` and `]`; the ` ` joining nested parts;
  - list labels and indentation; continuation hanging indents;
  - `[Note n] ` and `[Note n, table k, row r] `;
  - DOCX and ODT note references `[n]`;
  - the `\n` between lines.
- *Lookalikes count as source:* a genuine `—` in a cell (counts 1, while an empty cell counts 0), a typed `[1]`, a typed `1.`, a header cell reading "Column 1".
- *Collapsed whitespace* counts as source.
- *Origin through joined-text normalisation:* for each case below, the text equals `normaliseBlockText` of the joined runs, byte for byte, and the origin is as stated.
  - `"e"` and a combining acute (U+0301) in two authored runs become a single source `é`.
  - A generated marker followed by an authored combining mark: the marker stays generated, and the mark stays source where NFC leaves the cluster unchanged.
  - An authored base followed by a generated marker: both keep their origin.
  - A composing cluster that mixes origins is entirely generated, and the count can only go down.
  - Hangul jamo (L, V, T) split across authored runs compose to one source syllable.
  - Astral characters, including a surrogate pair next to a marker and an emoji ZWJ sequence split across authored runs, are never split between origins.
  - *Exact Unicode counts:* `👩‍🔧` is 3 code points, 1 grapheme cluster and 5 UTF-16 units, and as source text it counts 3. `é` precomposed counts 1, and `e` plus U+0301 normalises to `é` and counts 1. `𝒜` counts 1 and is 2 UTF-16 units.
  - *Fallback warning:* when the cluster-wise NFC check fails (forced in a test through an injected normaliser), the block's text is still exactly `normaliseBlockText(joined)`, its origin is entirely generated, its source count is 0, and exactly one `originFallback` warning names the block.
  - Whitespace collapsed across a run boundary is source if any collapsed character was source.
- *Padding cannot reach the minimum, table without a marked header:* a document with a wide table of empty cells gives a selection whose stored text exceeds 500 code points while its source text is under 500. It is refused. Adding 1 genuine character at the threshold makes it accepted.
- *Padding cannot reach the minimum, table with a marked header:* a table with a marked header row whose cells are empty in most columns, and with empty data cells, is refused the same way. Each fallback `Column n`, its `: `, separators and `—` are all generated; only the non-empty header labels count. The threshold check is the same.
- *Counting unit:* counts are code points; a grapheme-based or UTF-16-based count would fail the exact-count test above.

**Outline.**
- ids, levels, paths;
- duplicate titles; skipped levels; text before the first heading; a split heading;
- headings in cells and notes are not sections;
- own and subtree counts, including items versus sentences within items;
- TXT, Markdown and PDF give one section with "no usable headings".

**Resolution.**
- parent; child alone; parent minus child; parent plus child with no duplicates;
- every refusal in §2.3.
- *Property test:* unique ids, in document order, a subset of the document, grouped into maximal adjacent passages; `text === doc.text.slice(charStart, charEnd)`.

**Binding and hash.**
- *Binding, per format:* for each of TXT, Markdown, PDF, DOCX and ODT, a scope bound to other bytes, another `textHash`, another `extractionVersion` or an unknown `scopeFormat` is refused. For DOCX and ODT, scope bytes that differ from `input.original` are refused.
- *Exact payload:* the canonical payload for a fixture equals a golden JSON string, and its hash equals a golden hex value.
- *What changes the hash:* changing passages, a sentence, or a heading path.
- *What does not:* different spellings of the same selection, a different `fileName`, or different counts or partial findings.

**`runImport` recomputes, and re-ingestion is authoritative.**
- A scope file with a wrong title or id, or below the minimum, is refused by `runImport` even when the CLI's checks are bypassed.
- A caller's `input.source` that keeps the right `textHash` and `extractionVersion` but has one changed sentence offset, `headingPath`, `listDepth`, sentence text or metadata field is refused before any write, naming the field.
- A matching `input.source` is replaced by the re-ingested document: the stored `source` and every evidence offset come from re-ingestion. This is checked by identity, not just equality.
- On resume, a stored `source` edited on disk is refused as altered.
- On resume, a stored `generationScope` is refused when any of these is edited while its `scopeHash` is left unchanged: a count, a partial finding, `previewConfig`, or one passage.
- A resume with an equivalent but differently spelt scope file is accepted, and its entries are appended to `generationScopeEntries`.
- The API takes no resolved data: a type-level test, plus a runtime test that extra fields are rejected by Zod.

**Rendering, chunks and preview.**
- *A long passage across three chunks:* no marker at either boundary, and the next chunk starts at the next sentence.
- *A gap exactly at a chunk boundary:* the marker is the first evidence line of the next chunk.
- *A gap inside a chunk:* the marker is placed there.
- *Leading and trailing omissions:* no marker.
- *Heading context* breaks at gaps.
- *Preview parity:* each preview chunk equals the scoped part of `extractionRequest(chunk).user`.
- *Chunk-size parity:*
  - under FakeProvider, `generate --scope` dispatches exactly as many extraction requests as the preview's chunk count;
  - each dispatched request's evidence section equals the corresponding preview chunk;
  - both use `previewConfig`, and a non-default `previewConfig.chunkTokens` changes the preview and the requests alike.
- *Conflicting chunk setting:* `runImport` with a scope and an explicit `RunImportDeps.chunkTokens` different from `previewConfig.chunkTokens` is refused before any write or call. An equal value is accepted.
- *Unknown layout:* a `scopedLayoutVersion` other than the current one is refused, by both `scope` and `runImport`.
- *Fingerprint binding:*
  - changing `previewConfig.chunkTokens` changes the scoped fingerprint but not `scopeHash`;
  - changing `scopedLayoutVersion` likewise;
  - unscoped runs with a custom `RunImportDeps.chunkTokens` keep their current fingerprint and behaviour.
- *Citing markers or headings:* a model citing a marker or an ancestor heading id is rejected.

**Partial structures.** Each row of the §2.7 table is detected and reported. Section-only scopes report none.

**Output safety (`outline` and `scope`).**
- `--out` in the repository outside `docs/uoc/`, or reached through a link into it, is refused.
- An existing output, a dangling link, the source, or the scope file as an output name is refused, with nothing written.
- A concurrent appearance during publishing leaves nothing behind.

**Pipeline (FakeProvider).**
- *No unselected material in any request of any purpose:*
  - no text unique to an unselected *non-heading* sentence appears anywhere;
  - an unselected *ancestor heading* appears only inside labelled `HEADING CONTEXT` lines, never as an `[sN]` evidence line;
  - no unselected sentence id is ever accepted as a citation.
- Every evidence id is in scope.
- The stored `source` is the full document.
- `generationScope` is stored before the first call.
- A resume with the same scope succeeds; with another scope, or none, it is refused.
- The evidence guard throws on an injected out-of-scope id.

**Unchanged whole-document behaviour.**
- The rehearsal replays S1 with no miss and the same fingerprint.
- The fingerprint for a fixed unscoped input equals a value pinned at `e6a0ead`.
- A whole-document DOCX run's extraction requests are byte-identical to those before the change, compared by `requestKey`.
- No `generationScope` artifact is written.
- `apps/cli-legacy` passes unchanged.

**CLI.**
- An invalid `--scope` leaves `--out` unwritten.
- The report and gate lines appear.
- The gate summary and `gate-report.md` contain no heading text.

## 5. Order of work (each step verified, committed locally and reviewed)

1. Source analysis: origin runs and spans, headings, structures. Also `ingestSource`, the outline, counts, and `leap outline` with output safety.
2. Scope schema, binding, resolution, source-only minimum, partial structures, the canonical hash, `renderScopedEvidence`, the preview, and `leap scope`.
3. Pipeline: recompute-and-bind in `runImport`, fingerprint, persistence, scoped requests, the evidence guard, and `generate --scope`.
4. Reports, gate report and documentation.

## 6. Decisions (Benjamin, 9 Oct 2026)

1. **Minimum:** 500 Unicode code points of selected source text, counted once, excluding generated text and context-only ancestor headings (§2.4).
2. **Parent headings:** kept as clearly labelled context without their body text; not evidence unless included (§2.3, §2.6).
3. **Names:** `outline`, `scope`, `--scope`, `generation-scope.json`.
4. **Markdown headings:** deferred; sentence ranges are the explicit fallback (§2.11).

## 7. Revision history

- **r1:** first draft.
- **r2 (`ec32660`):** decisions; source binding; visible gaps; partial structures; output safety; the scope guarantee.
- **r3:** closes the review of r2.
  1. **Origin metadata:** source and generated character spans from adapters and the linearizer, covering nested tables, list labels, separators and note markers, with padding and lookalike tests (§2.1, §2.4).
  2. **Binding and hashing:**
     - `originalSha256` reaches `runImport` for every format;
     - one explicit canonical `scopeHash` payload, which excludes partial findings, counts and entries (§2.5);
     - `runImport` recomputes everything from the bytes and the scope file, and trusts no supplied resolved data (§2.9).
  3. **One rendering contract:**
     - shared by request and preview, with passage continuation across chunks and gap markers at chunk boundaries;
     - `scope` uses `generate`'s effective chunk size (§2.6).
  4. **The "no unselected text" test** allows labelled ancestor-heading context and still excludes ancestor body text and citations (§4).
- **r4:** contract corrections from the review of r3.
  1. **Re-ingestion is authoritative.**
     - A scoped run uses the document it re-ingests, and requires complete agreement from the caller's document before any write.
     - Resolution, extraction, evidence and the stored `source` all use the re-ingested document.
     - Stored `source` and `generationScope` are checked on resume (§2.9).
  2. **Per-run NFC claim removed.**
     - Joined-text normalisation is authoritative.
     - Origin is carried through NFC (by grapheme cluster, with mixed composing clusters treated as generated), whitespace collapse and trim, held per code point.
     - Tests cover split combining sequences, marker boundaries, Hangul and astral characters (§2.1, §4).
  3. **`previewConfig: { chunkTokens, scopedLayoutVersion }`.**
     - It lives in the scope file, the preview header and the stored artifact, and is used by both preview and scoped generation.
     - A conflicting explicit chunk setting is refused before writes or calls.
     - It is kept out of `scopeHash` but bound in the scoped fingerprint. Unscoped custom chunk sizes and fingerprints are unchanged (§2.5, §2.6, §2.9).
     - It replaces r3's `effectiveChunkTokens()`.
  4. **Every `Column n` fallback is generated,** including fallbacks for empty columns in marked header rows, as is the ` / ` header separator. This comes with a marked-header padding test (§2.1, §4).
- **r4 review clarifications (approval for Step 1):**
  1. **Unicode counts:**
     - counting is by code point;
     - grapheme clusters serve only origin mapping and are never the counting unit;
     - exact-count tests include `👩‍🔧`: 3 code points, 1 grapheme, 5 UTF-16 units (§2.1, §4).
  2. **Stored-scope integrity:**
     - on resume, the stored payload, `previewConfig` and every report-used derived field are compared with recomputed values, not just the declared hash; this is required before Step 3;
     - author entries are kept as a separate append-only history, so equivalent spellings still resume (§2.5, §2.9, §4).
  3. **Normalisation fallback:** it preserves text, cannot inflate the minimum, and raises an explicit `originFallback` warning, which is tested (§2.1, §4).

## 8. Implementation notes

**Step 1** (source analysis, origin, headings, structures, `ingestSource`, outline, `leap outline`):
- **Authored text counts once per selection.** Linearizing repeats some authored text: a marked header label on every data row, and a spanned cell's value at every position the span covers. Counting each copy would let a short label repeated over many empty rows reach the minimum.
  - *Before the review (`1643d7e`):* copies were marked generated after the first occurrence. That lost their identity, so a selection of later rows alone did not count its header labels.
  - *Now:* every occurrence keeps its unit, and a count takes each unit once within the counted sentences (§2.4).
  - *Tests:*
    - a later row alone with a 16-code-point header and 484 authored code points counts 500;
    - a span-copy-only selection; several copies together;
    - separately authored equal cells, equal header cells and equal headers in two tables, each counted;
    - a long label over 20 empty rows counted once.
  - *The outline* counts own and subtree text the same way, over their sentences.
- **Lists inside body notes are list structures** (also after the Step 1 review). Each note's list items, nested items and continuation paragraphs are recorded as lists, numbered with the body's lists in document order, without changing the note's lines. The structure fixtures' five note-list sentences, and every other list sentence, now belong to exactly one list item.
- **Text of a single origin skips the cluster mapping.** For text that is entirely source or entirely generated, the origin is uniform whatever NFC does, so no mapping is needed and the fallback cannot arise. Only mixed text is mapped cluster by cluster and can fall back.
- **List labels are always generated.** This includes ODT `text:number`, which is the editor's rendering of the numbering rather than text the author wrote.
- **Unchanged output.** Extracted text, sentences, offsets and metadata are byte-identical: every fixture's document hash is pinned at `e6a0ead` (`packages/generator/test/ingest-stability.test.ts`). `leap extract`'s outputs are unchanged.
- **Shared output safety.** `leap outline` uses `leap extract`'s output safety through shared `assertNamesFree` and `publishFiles`. `extract` keeps its own messages and staging prefix.


**Step 2** (scope schema, binding, resolution, minimum, partial structures, canonical hash, scoped rendering, preview, `leap scope`):
- **Modules.** The scope core is `packages/generator/src/scope/`:
  - `schema.ts`: strict Zod, every schema problem listed;
  - `resolve.ts`;
  - `partial.ts`;
  - `hash.ts`;
  - `render.ts`;
  - `preview.ts`.

  Scoped chunks are ordinary `Chunk`s that carry `gapsBefore`. A chunk without it renders exactly as before.
- **One rendering function.** `renderEvidence(chunk)` is the single rendering of a chunk's evidence, and `extractionRequest` is the task text, a blank line, then `renderEvidence(chunk)`. The preview prints the same function's output, so preview and request cannot differ. Whole-document requests are pinned by requestKey at `481c2d7` for the DOCX, ODT, Markdown and PDF fixtures, at both chunk sizes (`packages/generator/test/unscoped-requests.test.ts`), alongside the existing S1 request snapshots.
- **Scoped layout, version 1:**
  - a `GENERATION SCOPE:` block with the two fixed lines;
  - the heading context headed "(the section each sentence is in; context only, not evidence)", with runs that also break at gaps;
  - a gap marker line before each sentence that follows an omission: `[gap: sentences sA–sB are not in the generation scope]`, or `[gap: sentence sA is not in the generation scope]` for one sentence.

  A marker's tokens are charged to the sentence after it when packing.
- **Refusal order:**
  1. schema;
  2. versions;
  3. binding (when it fails, nothing else is checked);
  4. every entry problem together, including an exclude that removes nothing from the valid includes;
  5. an empty result;
  6. the minimum.

  Each refusal lists all of its problems.
- **Redundant entries.** An include whose sentences are all selected by the other includes is reported as redundant in the preview and on stdout, and is still allowed.
- **Partial structures.** A unit (row, item, note line) counts as held when any of its sentences is selected. The paragraph rule covers every stored line with two or more sentences that is not a list-item line, since list items report their own sentences. Findings are listed in structure order, then by paragraph.
- **What is not built yet.** `leap generate --scope`, persistence, the run fingerprint and the evidence guard are Step 3.

**Step 3** (authoritative validation in `runImport`, `generate --scope`, persistence, scoped fingerprints, resume integrity, evidence guard):
- **Order of checks:**
  1. **Before the lock (no write or model call), via `authoritativeScope`:**
     - the scope's extension must match the source's kind;
     - for DOCX and ODT, the scope's bytes must hash to the same value as `original`;
     - the bytes are re-read with the caller's own `sourceId` and `fileName` (`ingestAs`);
     - the caller's document must agree with the re-read one in every field, and a refusal names the first differing path;
     - the scope is resolved against the re-read document;
     - an explicit `RunImportDeps.chunkTokens` must equal `previewConfig.chunkTokens`.

     Lock acquisition can run recovery writes (the committed-batch replay), so every check that needs no stored state happens before it. A refusal there leaves every record, and the lock, untouched.
  2. **Under the lock, before any write:**
     - the existing store-version, layout and fingerprint checks;
     - for a scoped resume, `assertScopeIntegrity`: the stored `source` must deep-equal the re-read document, and the stored `generationScope` record must deep-equal the recomputed one. That covers the payload, `previewConfig`, counts, partial findings and redundant entries, not just the declared hash. A mismatch raises `ScopeIntegrityError`. Entries are history and are not compared.
- **Authoritative document.** After validation, the run's source is the re-read document: the stored source, chunks, evidence and size checks all come from it.
- **Stored before the first model call:** `generationScope`, written with `source`; then `generationScopeEntries`, where a new spelling is appended with `firstUsedAt` and an already-recorded spelling is not repeated.
- **Fingerprint.** For a scoped run the fingerprint material gains `generationScope: { scopeHash, chunkTokens, scopedLayoutVersion }`, and the material's `chunkTokens` is `previewConfig.chunkTokens`. Unscoped fingerprints are pinned at `4aca7d0`, for S1 and for a custom chunk size (`packages/generator/test/fingerprint-pin.test.ts`). `IncompatibleResumeError` now names the generation scope among the inputs to keep.
- **Extraction and the evidence guard.** Extraction uses `chunkScope(scope)` through `extractConceptMap`'s new `chunks` option. The guard (`assertEvidenceInScope`) runs on a freshly extracted map before it is stored, and on a map loaded from the store. Its test edits a stored chunk so that it cites an excluded sentence.
- **`leap generate --scope`:**
  - it resolves the scope after loading the source and before anything is written, so a refusal leaves no directory;
  - it prints the scope hash, counts and partial structures;
  - it passes the file and bytes to `runImport`, which validates them again itself;
  - it reports `ScopeRefusedError` and `ScopeIntegrityError` with exit 1.
- **Not built yet.** Reports (cost report, `report.md`, the gate report) are Step 4.
