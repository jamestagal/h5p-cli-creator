import { z } from "zod";
import { ActivityBase, ItemBase, rejectDuplicateIds } from "./base.js";
export const DialogCard = ItemBase.extend({ front: z.string().min(1), back: z.string().min(1), tip: z.string().optional(), audioAssetId: z.string().min(1).optional(), imageAssetId: z.string().min(1).optional() });
export const DialogCardsSpec = ActivityBase.extend({ type: z.literal("dialogCards"), description: z.string().optional(), mode: z.enum(["normal", "repetition"]).default("normal"), cards: z.array(DialogCard).min(1).max(100) }).superRefine((s, ctx) => rejectDuplicateIds(s.cards, ["cards"], ctx));
export type DialogCardsSpec = z.infer<typeof DialogCardsSpec>;
