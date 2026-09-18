import { z } from "zod";
import { ActivityBase } from "./base.js";
export const TrueFalseSpec = ActivityBase.extend({
  type: z.literal("trueFalse"),
  statement: z.string().min(1),
  correct: z.boolean(),
  feedbackCorrect: z.string().optional(),
  feedbackIncorrect: z.string().optional()
});
export type TrueFalseSpec = z.infer<typeof TrueFalseSpec>;
