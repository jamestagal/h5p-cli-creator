import { CONCEPT_NAME_MAX, CONCEPT_SUMMARY_MAX, type Concept, type Evidence } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { MergeOut, MergeOutSchema } from "../schemas/model-output.js";
import type { ChunkConcept } from "./extract.js";

const SYSTEM = "You consolidate concept lists extracted from consecutive parts of one document. Concepts that describe the same idea are merged into one; concepts that are distinct stay separate. Every input id is assigned to exactly one output concept. Keep names short and summaries to one sentence.";

function unionEvidence(groups: Evidence[][]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const g of groups) for (const e of g) byId.set(e.evidenceId, e);
  return [...byId.values()].sort((a, b) => a.charStart - b.charStart);
}

export async function mergeConcepts(chunkConcepts: ChunkConcept[][], runner: StageRunner): Promise<Concept[]> {
  const all = chunkConcepts.flat();
  if (chunkConcepts.length <= 1) return all.map((c, i) => ({ conceptId: `c${i + 1}`, name: c.name, summary: c.summary, evidence: c.evidence }));
  const ids = new Set(all.map((c) => c.tempId));
  const listing = chunkConcepts.map((cs, i) => `PART ${i + 1}:\n${cs.map((c) => `- ${c.tempId}: ${c.name} — ${c.summary}`).join("\n")}`).join("\n\n");
  const { value } = await runner.run({
    key: "merge",
    request: { purpose: "merge", model: modelForRole("merge"), system: SYSTEM, user: `CONCEPTS BY PART:\n${listing}\n\nReturn the consolidated concept list; each input id appears in exactly one memberIds list.`, maxOutputTokens: 3000, outputSchema: MergeOutSchema },
    schema: MergeOut,
    verify: (out) => {
      const issues: string[] = []; const seen = new Set<string>();
      for (const c of out.concepts) {
        const label = c.name.trim() || "(unnamed concept)";
        if (c.memberIds.length === 0) issues.push(`concept "${label}" has no memberIds; merge its members into an existing concept or drop it`);
        if (!c.name.trim()) issues.push("a concept has an empty name");
        else if (c.name.trim().length > CONCEPT_NAME_MAX) issues.push(`concept "${label}" name is longer than ${CONCEPT_NAME_MAX} characters`);
        if (!c.summary.trim()) issues.push(`concept "${label}" has an empty summary`);
        else if (c.summary.trim().length > CONCEPT_SUMMARY_MAX) issues.push(`concept "${label}" summary is longer than ${CONCEPT_SUMMARY_MAX} characters`);
        for (const id of c.memberIds) {
          if (!ids.has(id)) issues.push(`memberIds contains unknown id ${id}`);
          else if (seen.has(id)) issues.push(`id ${id} is assigned to more than one concept`);
          seen.add(id);
        }
      }
      for (const id of ids) if (!seen.has(id)) issues.push(`id ${id} was not assigned to any concept`);
      return issues;
    }
  });
  const byId = new Map(all.map((c) => [c.tempId, c]));
  return value.concepts.map((c, i) => ({ conceptId: `c${i + 1}`, name: c.name.trim(), summary: c.summary.trim(), evidence: unionEvidence(c.memberIds.map((id) => byId.get(id)!.evidence)) }));
}
