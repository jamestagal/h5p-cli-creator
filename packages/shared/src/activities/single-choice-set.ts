import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const SingleChoiceQuestion = ItemBase.extend({ question: z.string().min(1), correct: z.string().min(1), distractors: z.array(z.string().min(1)).min(1).max(7) });
export const SingleChoiceSetSpec = ActivityBase.extend({ type: z.literal("singleChoiceSet"), questions: z.array(SingleChoiceQuestion).min(1).max(50) });
export type SingleChoiceSetSpec = z.infer<typeof SingleChoiceSetSpec>;
