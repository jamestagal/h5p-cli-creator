import { z } from "zod";
import { ActivityBase } from "./base.js";
export const EssayKeyword = z.object({ keyword: z.string().min(1), alternatives: z.array(z.string().min(1)).default([]), points: z.number().int().min(1).default(1) });
export const EssaySpec = ActivityBase.extend({
  type: z.literal("essay"),
  prompt: z.string().min(1),
  keywords: z.array(EssayKeyword).min(1),
  sampleSolution: z.string().min(1),
  minimumWords: z.number().int().min(0).default(0)
});
export type EssaySpec = z.infer<typeof EssaySpec>;
