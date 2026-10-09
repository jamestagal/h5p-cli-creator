# Generation scope: author selection of source sections (design and plan)

**Status:** revision 3, for review. The direction was approved on 9 Oct 2026. Revision 2 recorded Benjamin's decisions and clarifications. Revision 3 closes the review findings on origin metadata, binding and hashing, and chunk continuation (§7). Implementation is on hold until this document is reviewed. Nothing here authorises a paid run.

**Baseline:** `origin/phase-3/checkpoint-d` at `e6a0ead`. Revision 2 is `ec32660` on `phase-3/generation-scope-design`. Checkpoint D passed at `26d36a1`; Checkpoint E is pending.

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
  | Table rows | `[Table n, row r] `; `Column n` labels (tables with no marked header); `: ` after each label; `; ` between pairs; the `—` that stands for an empty cell |
  | Nested content in a cell | the ` ` joining parts; `[Table n.k ` … `]` with `row r: `, `, ` and `; `; ` [sub-list:` and `]`; `[Note n] ` inside a cell |
  | Lists | list labels rendered from numbering definitions (`1.`, `a)`, `•`), and the space after them |
  | Notes | `[Note n] ` and `[Note n, table k, row r] ` prefixes |

  **Source text** includes:
  - heading, paragraph, item and cell text;
  - header-cell labels taken from the document, even one that reads "Column 1";
  - a genuine `—`, `[1]` or `1.` typed by the author;
  - authored whitespace inside block text, including whitespace that normalisation collapsed.
- **How origin is carried.**
  - An adapter supplies block or cell text as runs, `{ text, generated?: true }`, only where it inserts markers.
  - `normaliseBlocks` normalises the joined runs exactly as `normaliseBlockText` does, carrying the origin per character. A space produced by collapsing whitespace is source if any character it replaced was source.
  - Generated runs use only non-composing starter characters (ASCII, `•`, `—`), so per-run NFC equals NFC of the whole and offsets survive.
  - The resulting `text` string is byte-identical to today's. The block gains an internal `generated` range list, and `linearize` composes these ranges with its own generated pieces.
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
- **How it is counted:** for each sentence in the resolved set (each counted once), count the code points of `text.slice(charStart, charEnd)` that lie outside every `generated` span.
- **What never counts:** context-only ancestor headings, request scaffolding (`[sN]`, `(list level n)`, gap markers, scope lines) and anything generated.
- **Lookalike text still counts:** an author's genuine `—`, `[1]`, `1.` or "Column 1" header counts. The empty-cell `—`, a note reference and a rendered list label do not.
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
  "exclude": [ { "section": "sec-s30", "title": "Assessment arrangements" } ]
}
```

- **Binding check.** All three binding values in the file must match the ones computed from the bytes. Otherwise the scope is refused with "re-run leap outline". `fileName` is informational and is never compared.
- **Unknown versions.** An unknown `scopeFormat` is refused.

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
- **Chunking** affects how requests are split. It is already in the run fingerprint as `chunkTokens`, and the request layout is pinned by `PROMPT_VERSION`.

**The stored `generationScope` artifact** contains the payload, `scopeHash`, the author's entries, counts and partial findings. It is a record, and it is never read back as trusted input (§2.9).

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
- **Same chunk size.** `leap scope` uses the same chunk size as `leap generate`, through one shared `effectiveChunkTokens()`. Today that is `DEFAULT_CHUNK_TOKENS`, because `generate` has no flag.
  - `scope` deliberately takes no `--chunk-tokens` of its own.
  - If `generate` ever gains the flag, `scope` gains the same flag in the same change.
  - The preview header prints the chunk size and chunk count.

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

- **The input.** `RunImportInput.scope?: { file: GenerationScopeFile; bytes: Buffer; ext: SourceExtension }`. `runImport` accepts no resolved ids, counts, analysis or hash: it recomputes them.
- **Validation under the lock, before any write:**
  1. Validate `file` with Zod.
  2. Compute sha256(`bytes`). For DOCX and ODT, require it to equal `input.original`'s hash.
  3. Re-ingest `bytes` with the generator's `ingestSource(bytes, ext)`; this also gives the `SourceAnalysis`. Require the re-ingested `textHash` and `extractionVersion` to equal `input.source`'s.
  4. Check the file's binding against these computed values.
  5. Resolve, check the minimum, detect partial structures, and compute the payload and `scopeHash`.
- **Fingerprint and storage.**
  - The fingerprint material gains `generationScope: scopeHash` only when a scope is given. Otherwise it is byte-identical, so existing directories and S1 still resume.
  - The artifact is written next to `source`, before `parseUnit`, the first model call.
  - On resume, the scope is recomputed again and checked against the fingerprint. A stored artifact whose hash differs from the recomputed one is refused as altered.
- **Extraction.** Extraction and the request-size checks use the original `Sentence` objects of the resolved passages and `renderScopedEvidence`. Nothing is renumbered.
- **The full document is kept.** The stored `source` and the DOCX/ODT original remain the full document. Every `ev-sN` resolves against the full text.
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
   - a header: binding, `scopeHash`, chunk size, chunk count, first and last selected sentence;
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
| Pipeline | `concepts/index.ts` and `concepts/extract.ts` (scoped rendering through `renderScopedEvidence`), `pipeline/fingerprint.ts`, `pipeline/run-import.ts` (recompute, bind, persist, guard), a shared `effectiveChunkTokens()` |
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
  - `[Table n, row r] `, `Column n`, `: `, `; `, the empty-cell `—`;
  - nested-table brackets, `row r: `, `, ` and `; `; ` [sub-list:` and `]`; the ` ` joining nested parts;
  - list labels and indentation; continuation hanging indents;
  - `[Note n] ` and `[Note n, table k, row r] `;
  - DOCX and ODT note references `[n]`;
  - the `\n` between lines.
- *Lookalikes count as source:* a genuine `—` in a cell (counts 1, while an empty cell counts 0), a typed `[1]`, a typed `1.`, a header cell reading "Column 1".
- *Collapsed whitespace* counts as source.
- *Padding cannot reach the minimum:* a document with a wide table of empty cells, without marked headers, gives a selection whose stored text exceeds 500 code points while its source text is under 500. It is refused. Adding 1 genuine character at the threshold makes it accepted.
- *Astral characters* count as one code point each.

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

**`runImport` recomputes.**
- A scope file with a wrong title or id, or below the minimum, is refused by `runImport` even when the CLI's checks are bypassed.
- A stored artifact edited on disk is refused on resume.
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
  - `scope` and `generate` use `effectiveChunkTokens()`.
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
