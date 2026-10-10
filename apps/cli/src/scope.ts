import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkScope, OversizeAtomicSegmentError, resolveScope, ScopeRefusedError, scopePreviewMarkdown, type ResolvedScope } from "@leaplearn/generator";
import { assertNamesFree, findRepoRoot, isAdmissionOrFormatError, outDirRefusal, publishFiles, ReportPublicationError } from "./extract.js";
import { loadSource, type LoadedSource } from "./source.js";

export interface ScopeArgs {
  source: string; scope: string; out: string;
  /** The repository that real material must stay out of; defaults to the one this CLI runs from (none when installed elsewhere). */
  repoRoot?: string | null;
}

/** The one file `leap scope` writes. */
export const SCOPE_PREVIEW = "scope-preview.md";

/**
 * `leap scope`: validates generation-scope.json against the source (binding, versions, entries, the 500 code-point
 * minimum) and writes scope-preview.md: the scope hash, the preview configuration, counts, partial structures,
 * redundant entries and each chunk's evidence exactly as its extraction request will carry it. No model call, API key
 * or ledger. Never writes the scope file. Output follows `leap extract`'s rules. Exits 1, writing nothing, when the
 * source, the scope or --out is refused.
 */
export async function scope(args: ScopeArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const repoRoot = args.repoRoot === undefined ? findRepoRoot(dirname(fileURLToPath(import.meta.url))) : args.repoRoot;
  const refusal = outDirRefusal(args.out, repoRoot);
  if (refusal) { io.err(`leap: ${refusal}\n`); return 1; }

  let file: unknown;
  try { file = JSON.parse(await readFile(resolve(args.scope), "utf8")); } catch (err) {
    if (err instanceof SyntaxError) { io.err(`leap: ${basename(args.scope)} is not valid JSON: ${err.message}; nothing was written\n`); return 1; }
    throw err;
  }
  let loaded: LoadedSource;
  try { loaded = await loadSource(args.source); } catch (err) { if (isAdmissionOrFormatError(err)) { io.err(`leap: ${basename(args.source)}: ${err.message}\n`); return 1; } throw err; }
  let resolved: ResolvedScope;
  let chunkCount: number;
  try {
    resolved = resolveScope(file, loaded);
    chunkCount = chunkScope(resolved).length;
  } catch (err) {
    if (err instanceof ScopeRefusedError) { for (const p of err.problems) io.err(`leap: ${p}\n`); io.err("leap: the generation scope is refused; nothing was written\n"); return 1; }
    if (err instanceof OversizeAtomicSegmentError) { io.err(`leap: ${err.message}; nothing was written\n`); return 1; }
    throw err;
  }
  const outDir = resolve(args.out);
  try {
    await assertNamesFree(outDir, [SCOPE_PREVIEW], [args.source, args.scope], "leap scope never overwrites a file");
    await mkdir(outDir, { recursive: true });
    await publishFiles(outDir, [SCOPE_PREVIEW] as const, { [SCOPE_PREVIEW]: scopePreviewMarkdown(basename(args.source), resolved) }, ".scope-staging-");
  } catch (err) {
    if (err instanceof ReportPublicationError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  }
  const c = resolved.counts;
  io.out(`scope ${resolved.scopeHash.slice(0, 12)}: ${c.sentences} sentences in ${c.passages} passage(s), ${c.sourceCodePoints} code points of source text; ${chunkCount} chunk(s) at ${resolved.previewConfig.chunkTokens} tokens\n`);
  for (const p of resolved.partial) io.out(`partial: ${p.message}\n`);
  for (const r of resolved.redundant) io.out(`redundant: ${r}\n`);
  io.out(`wrote ${SCOPE_PREVIEW} to ${outDir}\n`);
  return 0;
}
