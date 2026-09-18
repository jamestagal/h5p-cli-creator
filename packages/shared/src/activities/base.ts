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

/**
 * Reports every repeated id in `items` as an issue on `ctx`, one per occurrence after the first.
 * `path` locates the collection (e.g. `["cards"]`); the issue path appends the offending item's
 * index and `"id"` (e.g. `["cards", 1, "id"]`).
 */
export function rejectDuplicateIds(items: ReadonlyArray<{ id: string }>, path: (string | number)[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: "custom", path: [...path, index, "id"], message: `duplicate id "${item.id}" in ${path.join(".")}` });
    } else {
      seen.add(item.id);
    }
  });
}
