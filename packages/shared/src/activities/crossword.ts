import { z } from "zod";
import { ActivityBase, ItemBase, rejectDuplicateIds } from "./base.js";
export const CrosswordWord = ItemBase.extend({ answer: z.string().regex(/^[\p{L}\p{N}]+$/u), clue: z.string().min(1) });
export const CrosswordSpec = ActivityBase.extend({ type: z.literal("crossword"), taskDescription: z.string().optional(), words: z.array(CrosswordWord).min(2).max(40) }).superRefine((s, ctx) => rejectDuplicateIds(s.words, ["words"], ctx));
export type CrosswordSpec = z.infer<typeof CrosswordSpec>;
