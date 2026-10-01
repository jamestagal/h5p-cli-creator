import { z } from "zod";
import { toProviderSchema } from "../llm/schema.js";

/**
 * Knowledge Evidence travels as a flat list in document order, each bullet naming its parent's index: structured output
 * does not accept recursive schemas. Code checks the list and rebuilds the tree (competency/parse-unit.ts).
 */
export const UnitOut = z.object({
  code: z.string(), title: z.string(), release: z.string().nullable(),
  elements: z.array(z.object({ number: z.string(), text: z.string(), performanceCriteria: z.array(z.object({ number: z.string(), text: z.string() })) })),
  knowledgeEvidence: z.array(z.object({ index: z.number().int(), parentIndex: z.number().int().nullable(), text: z.string() })),
  performanceEvidence: z.array(z.string()),
  assessmentConditions: z.string().nullable()
});
export const ConceptsOut = z.object({ concepts: z.array(z.object({ name: z.string(), summary: z.string(), kind: z.enum(["content", "rto-instruction"]), sentenceIds: z.array(z.string()) })) });
export const MergeOut = z.object({ concepts: z.array(z.object({ name: z.string(), summary: z.string(), memberIds: z.array(z.string()) })) });
export const AlignmentOut = z.object({ criteria: z.array(z.object({ criterionId: z.string(), conceptIds: z.array(z.string()) })) });
export const PlanOut = z.object({ activities: z.array(z.object({ slot: z.number().int(), type: z.enum(["multiChoice", "blanks", "flashcards"]), conceptIds: z.array(z.string()), criteriaIds: z.array(z.string()), focus: z.string() })) });
export const MultiChoiceOut = z.object({
  title: z.string(), question: z.string(),
  answers: z.array(z.object({ text: z.string(), correct: z.boolean(), feedback: z.string() })),
  evidenceIds: z.array(z.string())
});
export const BlanksOut = z.object({
  title: z.string(), taskDescription: z.string(), passage: z.string(),
  blanks: z.array(z.object({ answers: z.array(z.string()), tip: z.string().nullable(), evidenceIds: z.array(z.string()) }))
});
export const FlashcardsOut = z.object({
  title: z.string(), description: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string(), tip: z.string().nullable(), evidenceIds: z.array(z.string()) }))
});
export type UnitOut = z.infer<typeof UnitOut>; export type ConceptsOut = z.infer<typeof ConceptsOut>; export type MergeOut = z.infer<typeof MergeOut>; export type AlignmentOut = z.infer<typeof AlignmentOut>; export type PlanOut = z.infer<typeof PlanOut>; export type MultiChoiceOut = z.infer<typeof MultiChoiceOut>; export type BlanksOut = z.infer<typeof BlanksOut>; export type FlashcardsOut = z.infer<typeof FlashcardsOut>;

export const UnitOutSchema = toProviderSchema(UnitOut);
export const ConceptsOutSchema = toProviderSchema(ConceptsOut);
export const MergeOutSchema = toProviderSchema(MergeOut);
export const AlignmentOutSchema = toProviderSchema(AlignmentOut);
export const PlanOutSchema = toProviderSchema(PlanOut);
export const MultiChoiceOutSchema = toProviderSchema(MultiChoiceOut);
export const BlanksOutSchema = toProviderSchema(BlanksOut);
export const FlashcardsOutSchema = toProviderSchema(FlashcardsOut);
