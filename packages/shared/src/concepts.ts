import { z } from "zod";

/** Offsets are UTF-16 code units into the stored normalised (NFC) source text, half-open [charStart, charEnd). Source limits count code points instead; the two are never mixed. */
export const Evidence = z.object({
  evidenceId: z.string().min(1),
  sentenceId: z.string().min(1),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(1),
  quote: z.string().min(1)
}).refine((e) => e.charEnd > e.charStart, { message: "charEnd must be greater than charStart", path: ["charEnd"] });

export const CONCEPT_NAME_MAX = 120;
export const CONCEPT_SUMMARY_MAX = 600;

/**
 * `content`: something a learner must understand. `rto-instruction`: a statement about how one provider organises,
 * delivers, assesses or administers the unit; kept in the map, never aligned or planned. Concepts stored before the
 * field existed read as `content`.
 */
export const ConceptKind = z.enum(["content", "rto-instruction"]);

export const Concept = z.object({
  conceptId: z.string().min(1),
  kind: ConceptKind.default("content"),
  name: z.string().min(1).max(CONCEPT_NAME_MAX),
  summary: z.string().min(1).max(CONCEPT_SUMMARY_MAX),
  evidence: z.array(Evidence).min(1)
});

export const Alignment = z.object({
  criteria: z.array(z.object({ criterionId: z.string().min(1), conceptIds: z.array(z.string().min(1)) })),
  unsupportedCriteriaIds: z.array(z.string().min(1)),
  /** The unit text the criterion IDs (PC and KE) were assigned from. Absent on alignments stored before KE IDs existed. */
  unitTextHash: z.string().regex(/^[0-9a-f]{64}$/).optional()
});

export const ConceptMap = z.object({
  sourceId: z.string().min(1),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  concepts: z.array(Concept),
  alignment: Alignment.optional()
});
export type Evidence = z.infer<typeof Evidence>;
export type ConceptKind = z.infer<typeof ConceptKind>;
export type Concept = z.infer<typeof Concept>;
export type Alignment = z.infer<typeof Alignment>;
export type ConceptMap = z.infer<typeof ConceptMap>;
