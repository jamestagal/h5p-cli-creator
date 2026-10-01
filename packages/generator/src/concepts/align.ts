import { targetsOf, type Alignment, type Concept, type Target, type UnitOfCompetency } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { AlignmentOut, AlignmentOutSchema } from "../schemas/model-output.js";

const SYSTEM = "You map performance criteria (PC) and knowledge evidence (KE) from a unit of competency to concepts extracted from a source document. A knowledge evidence item nested under another is listed with the item it sits under. Each concept is shown with the evidence sentences it was extracted from. A criterion is supported by a concept only when that evidence itself would help a learner meet the criterion; judge from the quoted sentences, not from the concept's name. Return every criterion exactly once; an empty conceptIds list means the source does not support that criterion. This is a suggested alignment for revision activities, not an assessment judgement.";

export const MAX_ALIGN_QUOTES = 8;

function conceptWithEvidence(c: Concept): string {
  const shown = c.evidence.slice(0, MAX_ALIGN_QUOTES).map((e) => `    [${e.evidenceId}] ${e.quote}`);
  const more = c.evidence.length > MAX_ALIGN_QUOTES ? [`    (${c.evidence.length - MAX_ALIGN_QUOTES} more sentences not shown)`] : [];
  return [`- ${c.conceptId}: ${c.name} — ${c.summary}`, ...shown, ...more].join("\n");
}

/** A PC as `- PC1.1: text`; a KE node as `- KE2.1: text (under: parent text)` so a nested bullet keeps its context. */
function targetLine(t: Target): string {
  return `- ${t.id}: ${t.text}${t.kind === "ke" && t.path.length > 0 ? ` (under: ${t.path.join(" › ")})` : ""}`;
}

/** Every PC and KE node gets an entry. Only content concepts are offered: an RTO instruction never supports a criterion. */
export async function alignConcepts(concepts: Concept[], unit: UnitOfCompetency, runner: StageRunner): Promise<Alignment> {
  const criteria = targetsOf(unit);
  const offered = concepts.filter((c) => c.kind !== "rto-instruction"); // a concept stored without a kind is content, as the schema reads it
  const criterionIds = new Set(criteria.map((c) => c.id));
  const conceptIds = new Set(offered.map((c) => c.conceptId));
  const pcs = criteria.filter((t) => t.kind === "pc"); const kes = criteria.filter((t) => t.kind === "ke");
  const keBlock = kes.length > 0 ? `\nKNOWLEDGE EVIDENCE:\n${kes.map(targetLine).join("\n")}` : "";
  const user = `UNIT ${unit.code} ${unit.title}\nCRITERIA:\n${pcs.map(targetLine).join("\n")}${keBlock}\n\nCONCEPTS WITH THEIR EVIDENCE:\n${offered.map(conceptWithEvidence).join("\n")}\n\nReturn one entry per criterion id (PC and KE), with the concept ids whose evidence supports it (possibly none).`;
  const { value } = await runner.run({
    key: "align",
    request: { purpose: "align", model: modelForRole("align"), system: SYSTEM, user, maxOutputTokens: 2000, outputSchema: AlignmentOutSchema },
    schema: AlignmentOut,
    verify: (out) => {
      const issues: string[] = []; const seen = new Set<string>();
      for (const c of out.criteria) {
        if (!criterionIds.has(c.criterionId)) issues.push(`unknown criterion ${c.criterionId}`);
        if (seen.has(c.criterionId)) issues.push(`criterion ${c.criterionId} appears twice`);
        seen.add(c.criterionId);
        for (const id of c.conceptIds) if (!conceptIds.has(id)) issues.push(`criterion ${c.criterionId} cites unknown concept ${id}`);
      }
      for (const id of criterionIds) if (!seen.has(id)) issues.push(`criterion ${id} is missing`);
      return issues;
    }
  });
  const ordered = criteria.map((c) => value.criteria.find((x) => x.criterionId === c.id)!).map((x) => ({ criterionId: x.criterionId, conceptIds: [...new Set(x.conceptIds)] }));
  return { criteria: ordered, unsupportedCriteriaIds: ordered.filter((c) => c.conceptIds.length === 0).map((c) => c.criterionId), unitTextHash: unit.textHash };
}
