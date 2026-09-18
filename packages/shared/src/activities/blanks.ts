import { z } from "zod";
import { ActivityBase, ItemBase, rejectDuplicateIds } from "./base.js";

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
  rejectDuplicateIds(s.blanks, ["blanks"], ctx);
  if (s.passage.includes("*")) ctx.addIssue({ code: "custom", path: ["passage"], message: `passage contains "*", which H5P.Blanks cannot represent` });
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
