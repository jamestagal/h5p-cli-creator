import { z } from "zod";

/** Offsets are UTF-16 code units into the stored extracted text, half-open [charStart, charEnd). */
export const Evidence = z.object({
  evidenceId: z.string().min(1),
  sentenceId: z.string().min(1),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(1),
  quote: z.string().min(1)
}).refine((e) => e.charEnd > e.charStart, { message: "charEnd must be greater than charStart", path: ["charEnd"] });

export const Concept = z.object({
  conceptId: z.string().min(1),
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  evidence: z.array(Evidence).min(1)
});

export const Alignment = z.object({
  criteria: z.array(z.object({ criterionId: z.string().min(1), conceptIds: z.array(z.string().min(1)) })),
  unsupportedCriteriaIds: z.array(z.string().min(1))
});

export const ConceptMap = z.object({
  sourceId: z.string().min(1),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  concepts: z.array(Concept),
  alignment: Alignment.optional()
});
export type Evidence = z.infer<typeof Evidence>;
export type Concept = z.infer<typeof Concept>;
export type Alignment = z.infer<typeof Alignment>;
export type ConceptMap = z.infer<typeof ConceptMap>;
