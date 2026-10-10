import { oversizeExtractionRequests } from "../concepts/extract.js";
import { DEFAULT_PROMPT_CONFIG } from "../prompts/system.js";
import { chunkScope } from "./render.js";
import { renderEvidence } from "../concepts/extract.js";
import type { ResolvedScope } from "./resolve.js";

/** A code fence longer than any run of backticks in `body`, so evidence text can never close it. */
function fenced(body: string): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${body}\n${fence}`;
}

/**
 * scope-preview.md (design §2.13): the binding, the scope hash, the preview configuration, the counts, partial
 * structures and redundant entries, then each chunk's evidence exactly as its extraction request will carry it.
 * Request sizes use the default prompt configuration, as `leap extract` does.
 */
export function scopePreviewMarkdown(fileName: string, scope: ResolvedScope): string {
  const chunks = chunkScope(scope);
  const { binding } = scope.payload;
  const c = scope.counts;
  const oversize = oversizeExtractionRequests(chunks, { promptConfig: DEFAULT_PROMPT_CONFIG });
  const list = (items: string[]) => (items.length === 0 ? "None." : items.map((x) => `- ${x}`).join("\n"));
  return [
    `# Generation scope preview for ${fileName}`, "",
    `- Scope hash: ${scope.scopeHash}`,
    `- Bound to: original sha256 ${binding.originalSha256}; text hash ${binding.textHash}; extraction version ${binding.extractionVersion}`,
    `- Preview configuration: chunk size ${scope.previewConfig.chunkTokens} tokens, scoped layout version ${scope.previewConfig.scopedLayoutVersion}; ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`,
    `- Selected: ${c.sentences} of ${c.documentSentences} sentences in ${c.passages} passage(s), ${c.sourceCodePoints} code points of source text`,
    `- First and last selected sentence: ${scope.sentences[0]!.sentenceId}, ${scope.sentences.at(-1)!.sentenceId}`, "",
    "Each chunk below is exactly the text its extraction request will carry after the task instructions. Gap markers show omitted sentences; headings in HEADING CONTEXT are context only.", "",
    `## Partial structures (${scope.partial.length})`, "", list(scope.partial.map((p) => p.message)), "",
    `## Redundant entries (${scope.redundant.length})`, "", list(scope.redundant), "",
    `## Oversize requests (${oversize.length})`, "", list(oversize.map((o) => `chunk ${o.chunkIndex + 1}, holding ${o.sentenceId}: about ${o.estimatedInputTokens} input tokens plus ${o.maxOutputTokens} output tokens, above the limit of ${o.limit}`)), "",
    ...chunks.flatMap((chunk, k) => [`## Chunk ${k + 1} of ${chunks.length} (about ${chunk.estimatedTokens} tokens of evidence)`, "", fenced(renderEvidence(chunk)), ""])
  ].join("\n");
}
