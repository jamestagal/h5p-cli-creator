import { z } from "zod";

export const Provenance = z.object({
  conceptIds: z.array(z.string().min(1)).default([]),
  evidenceIds: z.array(z.string().min(1)).default([]),
  criteriaIds: z.array(z.string().min(1)).default([])
});
export type Provenance = z.infer<typeof Provenance>;
