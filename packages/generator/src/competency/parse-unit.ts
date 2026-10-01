import { UnitOfCompetency, type Element, type KnowledgeEvidenceNode, type PerformanceCriterion } from "@leaplearn/shared";
import { textHash } from "../ingest/source-document.js";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { UnitOut, UnitOutSchema } from "../schemas/model-output.js";

const SYSTEM = `You read an Australian-style unit of competency pasted as plain text and return its structure exactly as written: the unit code, the title, the release as printed (for example "Release 1", or null if none is printed), each element with its number and text, and each performance criterion under its element with its number and text. Copy wording verbatim; do not summarise, reorder or invent.

Knowledge evidence is the list of bullet points under that heading, in document order, as a flat list: give each bullet an index (0, 1, 2, ... in order) and the index of the bullet it is nested under as parentIndex (null for a top-level bullet). Keep every bullet's wording exactly as printed, including a trailing "including:". Return an empty list if the heading is absent.

Performance evidence is the list of bullet points under that heading, or an empty list if absent.

Assessment conditions is the text under that heading, copied verbatim, or null if the heading is absent.`;

function elementId(index: number, number: string): string {
  return /^\d+$/.test(number) ? `E${number}` : `E${index + 1}`;
}
function criterionId(elementIndex: number, elementNumber: string, index: number, number: string): string {
  const el = /^\d+$/.test(elementNumber) ? elementNumber : String(elementIndex + 1);
  return /^\d+\.\d+$/.test(number) ? `PC${number}` : `PC${el}.${index + 1}`;
}

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

type KeOut = UnitOut["knowledgeEvidence"];

/** Problems with the flat KE list: indices must be unique, and a parent must appear earlier in the list (which also rules out cycles). */
function keStructureIssues(ke: KeOut): string[] {
  const issues: string[] = [];
  const seen = new Set<number>();
  for (const k of ke) {
    if (seen.has(k.index)) issues.push(`knowledge evidence index ${k.index} appears more than once`);
    if (k.parentIndex !== null && !seen.has(k.parentIndex)) issues.push(`knowledge evidence index ${k.index} names parent ${k.parentIndex}, which is not an earlier bullet in the list`);
    seen.add(k.index);
  }
  return issues;
}

/** The tree, with IDs assigned in document order: KE1, KE2, then KE2.1, KE2.2 under KE2. Call only on a list that passed keStructureIssues. */
function keTree(ke: KeOut): KnowledgeEvidenceNode[] {
  const roots: KnowledgeEvidenceNode[] = [];
  const byIndex = new Map<number, KnowledgeEvidenceNode>();
  for (const k of ke) {
    const siblings = k.parentIndex === null ? roots : byIndex.get(k.parentIndex)!.children;
    const id = k.parentIndex === null ? `KE${siblings.length + 1}` : `${byIndex.get(k.parentIndex)!.id}.${siblings.length + 1}`;
    const node: KnowledgeEvidenceNode = { id, text: k.text.trim(), children: [] };
    siblings.push(node);
    byIndex.set(k.index, node);
  }
  return roots;
}

export async function parseUnit(unitText: string, runner: StageRunner): Promise<UnitOfCompetency> {
  const trimmed = unitText.trim();
  const printed = squash(trimmed);
  const { value } = await runner.run({
    key: "parseUnit",
    request: { purpose: "parseUnit", model: modelForRole("parseUnit"), system: SYSTEM, user: `UNIT TEXT:\n${trimmed}`, maxOutputTokens: 4000, outputSchema: UnitOutSchema },
    schema: UnitOut,
    verify: (u) => {
      const issues: string[] = [];
      if (!u.code.trim()) issues.push("code is empty");
      if (u.elements.length === 0) issues.push("no elements were returned");
      u.elements.forEach((e, i) => { if (e.performanceCriteria.length === 0) issues.push(`element ${e.number || i + 1} has no performance criteria`); });
      issues.push(...keStructureIssues(u.knowledgeEvidence));
      for (const k of u.knowledgeEvidence) {
        if (!squash(k.text)) issues.push(`knowledge evidence index ${k.index} is empty`);
        else if (!printed.includes(squash(k.text))) issues.push(`knowledge evidence index ${k.index} ("${k.text}") is not worded as in the unit text; copy it verbatim`);
      }
      if (u.assessmentConditions !== null) {
        if (!squash(u.assessmentConditions)) issues.push("assessment conditions are empty; return null when the unit has none");
        else if (!printed.includes(squash(u.assessmentConditions))) issues.push(`assessment conditions ("${u.assessmentConditions}") are not worded as in the unit text; copy them verbatim`);
      }
      return issues;
    }
  });
  const elements: Element[] = value.elements.map((e, ei) => {
    const performanceCriteria: PerformanceCriterion[] = e.performanceCriteria.map((c, ci) => ({ id: criterionId(ei, e.number, ci, c.number), number: c.number, text: c.text }));
    return { id: elementId(ei, e.number), number: e.number, text: e.text, performanceCriteria };
  });
  return UnitOfCompetency.parse({
    code: value.code.trim(), title: value.title.trim(), release: value.release?.trim() || null, elements,
    knowledgeEvidence: keTree(value.knowledgeEvidence), performanceEvidence: value.performanceEvidence,
    assessmentConditions: value.assessmentConditions?.trim() || null, textHash: textHash(trimmed)
  });
}
