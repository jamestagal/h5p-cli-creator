import { UnitOfCompetency, type Element, type PerformanceCriterion } from "@leaplearn/shared";
import { textHash } from "../ingest/source-document.js";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { UnitOut, UnitOutSchema } from "../schemas/model-output.js";

const SYSTEM = `You read an Australian-style unit of competency pasted as plain text and return its structure exactly as written: the unit code, the title, each element with its number and text, and each performance criterion under its element with its number and text. Copy wording verbatim; do not summarise, reorder or invent. Knowledge evidence and performance evidence are lists of the bullet points under those headings, or empty lists if absent.`;

function elementId(index: number, number: string): string {
  return /^\d+$/.test(number) ? `E${number}` : `E${index + 1}`;
}
function criterionId(elementIndex: number, elementNumber: string, index: number, number: string): string {
  const el = /^\d+$/.test(elementNumber) ? elementNumber : String(elementIndex + 1);
  return /^\d+\.\d+$/.test(number) ? `PC${number}` : `PC${el}.${index + 1}`;
}

export async function parseUnit(unitText: string, runner: StageRunner): Promise<UnitOfCompetency> {
  const trimmed = unitText.trim();
  const { value } = await runner.run({
    key: "parseUnit",
    request: { purpose: "parseUnit", model: modelForRole("parseUnit"), system: SYSTEM, user: `UNIT TEXT:\n${trimmed}`, maxOutputTokens: 4000, outputSchema: UnitOutSchema },
    schema: UnitOut,
    verify: (u) => {
      const issues: string[] = [];
      if (!u.code.trim()) issues.push("code is empty");
      if (u.elements.length === 0) issues.push("no elements were returned");
      u.elements.forEach((e, i) => { if (e.performanceCriteria.length === 0) issues.push(`element ${e.number || i + 1} has no performance criteria`); });
      return issues;
    }
  });
  const elements: Element[] = value.elements.map((e, ei) => {
    const performanceCriteria: PerformanceCriterion[] = e.performanceCriteria.map((c, ci) => ({ id: criterionId(ei, e.number, ci, c.number), number: c.number, text: c.text }));
    return { id: elementId(ei, e.number), number: e.number, text: e.text, performanceCriteria };
  });
  return UnitOfCompetency.parse({ code: value.code.trim(), title: value.title.trim(), elements, knowledgeEvidence: value.knowledgeEvidence, performanceEvidence: value.performanceEvidence, textHash: textHash(trimmed) });
}
