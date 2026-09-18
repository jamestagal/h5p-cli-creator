import { z } from "zod";
import { ActivityBase, ItemBase } from "./base.js";
export const AccordionPanel = ItemBase.extend({ title: z.string().min(1), html: z.string().min(1) });
export const AccordionSpec = ActivityBase.extend({ type: z.literal("accordion"), panels: z.array(AccordionPanel).min(1).max(30) });
export type AccordionSpec = z.infer<typeof AccordionSpec>;
