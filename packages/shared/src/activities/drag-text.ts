import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const DRAG_TOKEN = /\{\{(d[0-9]+)\}\}/g;
/** H5P.DragText uses `*text:tip*` markup with no escaping, so these characters cannot appear in draggable text or tips. */
export const DRAG_TEXT_FORBIDDEN = ["*", "/", ":"] as const;

export const Draggable = ItemBase.extend({ id: z.string().regex(/^d[0-9]+$/), text: z.string().min(1), tip: z.string().optional() }).superRefine((d, ctx) => {
  for (const ch of DRAG_TEXT_FORBIDDEN) if (d.text.includes(ch)) ctx.addIssue({ code: "custom", path: ["text"], message: `draggable ${d.id}: text contains "${ch}", which H5P.DragText cannot represent` });
  if (d.tip) for (const ch of DRAG_TEXT_FORBIDDEN) if (d.tip.includes(ch)) ctx.addIssue({ code: "custom", path: ["tip"], message: `draggable ${d.id}: tip contains "${ch}", which H5P.DragText cannot represent` });
});
export const DragTextSpec = ActivityBase.extend({
  type: z.literal("dragText"),
  taskDescription: z.string().optional(),
  passage: z.string().min(1),
  draggables: z.array(Draggable).min(1)
}).superRefine((s, ctx) => {
  if (s.passage.includes("*")) ctx.addIssue({ code: "custom", path: ["passage"], message: `passage contains "*", which H5P.DragText cannot represent` });
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
