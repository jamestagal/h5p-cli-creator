import { z } from "zod";
import { ActivityBase, ItemBase, rejectDuplicateIds } from "./base.js";

export const Flashcard = ItemBase.extend({
  front: z.string().min(1),
  back: z.string().min(1),
  tip: z.string().optional(),
  imageAssetId: z.string().min(1).optional(),
  imageAlt: z.string().optional()
});

export const FlashcardsSpec = ActivityBase.extend({
  type: z.literal("flashcards"),
  description: z.string().optional(),
  cards: z.array(Flashcard).min(1).max(100)
}).superRefine((s, ctx) => rejectDuplicateIds(s.cards, ["cards"], ctx));
export type FlashcardsSpec = z.infer<typeof FlashcardsSpec>;
