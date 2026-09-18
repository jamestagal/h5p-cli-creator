import { z } from "zod";
import { ActivityBase } from "./base.js";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { EssaySpec } from "./essay.js";

export const QuestionSetChild = z.discriminatedUnion("type", [MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, EssaySpec]);
export type QuestionSetChild = z.infer<typeof QuestionSetChild>;

export const QuestionSetSpec = ActivityBase.extend({
  type: z.literal("questionSet"),
  introduction: z.string().optional(),
  passPercentage: z.number().int().min(0).max(100).default(50),
  randomQuestions: z.boolean().default(false),
  children: z.array(QuestionSetChild).min(1).max(50)
});
export type QuestionSetSpec = z.infer<typeof QuestionSetSpec>;
