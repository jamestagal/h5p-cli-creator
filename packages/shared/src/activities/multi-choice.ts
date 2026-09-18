import { z } from "zod";
import { ActivityBase } from "./base.js";

export const MultiChoiceAnswer = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  feedbackChosen: z.string().optional(),
  feedbackNotChosen: z.string().optional()
});

export const MultiChoiceSpec = ActivityBase.extend({
  type: z.literal("multiChoice"),
  question: z.string().min(1),
  answers: z.array(MultiChoiceAnswer).min(2).max(8),
  randomAnswers: z.boolean().default(true)
}).refine((s) => s.answers.some((a) => a.correct), { message: "at least one correct answer", path: ["answers"] });
export type MultiChoiceSpec = z.infer<typeof MultiChoiceSpec>;
