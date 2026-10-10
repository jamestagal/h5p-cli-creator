import { z } from "zod";

/** A scope cannot be used: every problem found, in order. Nothing is written when a scope is refused. */
export class ScopeRefusedError extends Error {
  constructor(readonly problems: string[]) {
    super(`the generation scope is refused: ${problems.join("; ")}`);
    this.name = "ScopeRefusedError";
  }
}

const SentenceId = z.string().regex(/^s[1-9]\d*$/, "a sentence id such as s12");
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, "a sha256 in lowercase hex");

/** A section (selected with its subsections), named by its outline id and checked against its title; or a range of sentences. */
export const ScopeEntry = z.union([
  z.object({ section: z.string().regex(/^sec-s[1-9]\d*$/, "a section id such as sec-s12"), title: z.string() }).strict(),
  z.object({ sentences: z.object({ from: SentenceId, to: SentenceId }).strict() }).strict()
]);
export type ScopeEntry = z.infer<typeof ScopeEntry>;

/** The request configuration a preview is made with, and scoped generation must use (design §2.6). */
export const PreviewConfig = z.object({ chunkTokens: z.number().int().positive(), scopedLayoutVersion: z.number().int() }).strict();
export type PreviewConfig = z.infer<typeof PreviewConfig>;

/** generation-scope.json (design §2.5). Version fields are checked by resolveScope, which names an unsupported value. */
export const GenerationScopeFile = z.object({
  kind: z.literal("leap.generationScope"),
  scopeFormat: z.number().int(),
  source: z.object({ fileName: z.string().optional(), originalSha256: Hex64, textHash: Hex64, extractionVersion: z.string().min(1) }).strict(),
  include: z.array(ScopeEntry),
  exclude: z.array(ScopeEntry),
  previewConfig: PreviewConfig
}).strict();
export type GenerationScopeFile = z.infer<typeof GenerationScopeFile>;

/** Validates a parsed scope file; every schema problem is listed with its path. */
export function parseScopeFile(value: unknown): GenerationScopeFile {
  const parsed = GenerationScopeFile.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ScopeRefusedError(parsed.error.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "the file"}: ${i.message}`));
}
