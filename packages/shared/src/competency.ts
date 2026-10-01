import { z } from "zod";

export const PerformanceCriterion = z.object({ id: z.string().regex(/^PC\d+\.\d+$/), number: z.string().min(1), text: z.string().min(1) });
export const Element = z.object({ id: z.string().regex(/^E\d+$/), number: z.string().min(1), text: z.string().min(1), performanceCriteria: z.array(PerformanceCriterion).min(1) });

/** One Knowledge Evidence bullet, as printed, with its nested bullets. IDs (`KE2`, `KE2.1`) are assigned in code in document order, never by the model. */
export interface KnowledgeEvidenceNode { id: string; text: string; children: KnowledgeEvidenceNode[] }
export const KnowledgeEvidenceNode: z.ZodType<KnowledgeEvidenceNode> = z.lazy(() => z.object({
  id: z.string().regex(/^KE\d+(\.\d+)*$/),
  text: z.string().min(1),
  children: z.array(KnowledgeEvidenceNode)
}));

export const UnitOfCompetency = z.object({
  code: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  /** As printed (for example "Release 1"); null when the unit text has none. */
  release: z.string().min(1).nullable(),
  elements: z.array(Element).min(1),
  knowledgeEvidence: z.array(KnowledgeEvidenceNode).default([]),
  performanceEvidence: z.array(z.string().min(1)).default([]),
  /** Verbatim from the unit text; null when it has none. Never taken from the source document. */
  assessmentConditions: z.string().min(1).nullable(),
  textHash: z.string().regex(/^[0-9a-f]{64}$/)
});
export type PerformanceCriterion = z.infer<typeof PerformanceCriterion>;
export type Element = z.infer<typeof Element>;
export type UnitOfCompetency = z.infer<typeof UnitOfCompetency>;

export function criteriaOf(unit: UnitOfCompetency): PerformanceCriterion[] {
  return unit.elements.flatMap((e) => e.performanceCriteria);
}

/** A performance criterion or a Knowledge Evidence node that alignment, planning and review can name. `path` is the element text for a PC, and the ancestor KE texts (outermost first) for a KE node. */
export interface Target { id: string; kind: "pc" | "ke"; text: string; path: string[] }

/**
 * Every PC, then every KE node depth first. Units stored before KE IDs existed hold Knowledge Evidence as plain
 * strings; those have no IDs, were never targets, and are skipped.
 */
export function targetsOf(unit: UnitOfCompetency): Target[] {
  const pcs: Target[] = unit.elements.flatMap((e) => e.performanceCriteria.map((c) => ({ id: c.id, kind: "pc" as const, text: c.text, path: [e.text] })));
  const kes: Target[] = [];
  const walk = (nodes: unknown[], path: string[]): void => {
    for (const n of nodes) {
      if (typeof n !== "object" || n === null) continue;
      const node = n as KnowledgeEvidenceNode;
      kes.push({ id: node.id, kind: "ke", text: node.text, path });
      walk(node.children, [...path, node.text]);
    }
  };
  walk(unit.knowledgeEvidence, []);
  return [...pcs, ...kes];
}
