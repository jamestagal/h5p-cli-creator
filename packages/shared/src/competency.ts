import { z } from "zod";

export const PerformanceCriterion = z.object({ id: z.string().regex(/^PC\d+\.\d+$/), number: z.string().min(1), text: z.string().min(1) });
export const Element = z.object({ id: z.string().regex(/^E\d+$/), number: z.string().min(1), text: z.string().min(1), performanceCriteria: z.array(PerformanceCriterion).min(1) });
export const UnitOfCompetency = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  elements: z.array(Element).min(1),
  knowledgeEvidence: z.array(z.string().min(1)).default([]),
  performanceEvidence: z.array(z.string().min(1)).default([]),
  textHash: z.string().regex(/^[0-9a-f]{64}$/)
});
export type PerformanceCriterion = z.infer<typeof PerformanceCriterion>;
export type Element = z.infer<typeof Element>;
export type UnitOfCompetency = z.infer<typeof UnitOfCompetency>;

export function criteriaOf(unit: UnitOfCompetency): PerformanceCriterion[] {
  return unit.elements.flatMap((e) => e.performanceCriteria);
}
