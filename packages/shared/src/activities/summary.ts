import { z } from "zod";
import { ActivityBase, ItemBase, rejectDuplicateIds } from "./base.js";
export const SummaryGroup = ItemBase.extend({ correct: z.string().min(1), distractors: z.array(z.string().min(1)).min(1).max(5), tip: z.string().optional() });
export const SummarySpec = ActivityBase.extend({ type: z.literal("summary"), intro: z.string().optional(), groups: z.array(SummaryGroup).min(1).max(20) }).superRefine((s, ctx) => rejectDuplicateIds(s.groups, ["groups"], ctx));
export type SummarySpec = z.infer<typeof SummarySpec>;
