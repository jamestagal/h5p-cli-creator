import type { ConceptMap } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { PlanOut, PlanOutSchema } from "../schemas/model-output.js";

export type PlannedType = "multiChoice" | "blanks" | "flashcards";
export interface PlanRules { multiChoice: { perImport: number }; blanks: { perImport: number }; flashcards: { specs: number; cardsMin: number; cardsMax: number }; }
export const DEFAULT_PLAN_RULES: PlanRules = { multiChoice: { perImport: 5 }, blanks: { perImport: 3 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };

export interface Slot { slot: number; type: PlannedType; }
export interface ActivityPlan { activityId: string; slot: number; type: PlannedType; conceptIds: string[]; criteriaIds: string[]; focus: string; }

export function planSlots(selectedTypes: PlannedType[], conceptCount: number, rules: PlanRules): Slot[] {
  const slots: Slot[] = [];
  const add = (type: PlannedType, n: number): void => { for (let i = 0; i < n; i++) slots.push({ slot: slots.length + 1, type }); };
  if (selectedTypes.includes("multiChoice")) add("multiChoice", Math.min(rules.multiChoice.perImport, conceptCount));
  if (selectedTypes.includes("blanks")) add("blanks", Math.min(rules.blanks.perImport, conceptCount));
  if (selectedTypes.includes("flashcards")) add("flashcards", rules.flashcards.specs);
  return slots;
}

const SYSTEM = "You allocate extracted concepts to a fixed list of activity slots so that the set of activities covers the important concepts without repeating the same idea in the same activity type. Each multiChoice or blanks slot targets one or two concepts; a flashcards slot may cover many. Where criteria are listed, attach the criteria each activity helps a learner revise. Use only the given concept and criterion ids.";

export async function planActivities(map: ConceptMap, selectedTypes: PlannedType[], runner: StageRunner, rules: PlanRules = DEFAULT_PLAN_RULES): Promise<ActivityPlan[]> {
  const slots = planSlots(selectedTypes, map.concepts.length, rules);
  if (slots.length === 0) return [];
  const slotsByNumber = new Map(slots.map((s) => [s.slot, s]));
  const conceptIds = new Set(map.concepts.map((c) => c.conceptId));
  const supported = new Map(map.alignment?.criteria.map((c) => [c.criterionId, c.conceptIds]) ?? []);
  const criteriaText = map.alignment
    ? `\nCRITERIA:\n${map.alignment.criteria.map((c) => `- ${c.criterionId}${c.conceptIds.length ? ` supported by ${c.conceptIds.join(", ")}` : " (unsupported by the source)"}`).join("\n")}`
    : "";
  const user = `CONCEPTS:\n${map.concepts.map((c) => `- ${c.conceptId}: ${c.name} — ${c.summary} (evidence: ${c.evidence.length} sentence${c.evidence.length === 1 ? "" : "s"})`).join("\n")}${criteriaText}\n\nSLOTS (return exactly these, in order):\n${slots.map((s) => `- slot ${s.slot}: ${s.type}`).join("\n")}\n\nFor each slot give conceptIds (at least one), criteriaIds (only criteria supported by those concepts; empty when none) and a one-line focus.`;
  const { value } = await runner.run({
    key: "plan",
    request: { purpose: "plan", model: modelForRole("plan"), system: SYSTEM, user, maxOutputTokens: 3000, outputSchema: PlanOutSchema },
    schema: PlanOut,
    verify: (out) => {
      const issues: string[] = [];
      if (out.activities.length !== slots.length) issues.push(`expected ${slots.length} slots, got ${out.activities.length}`);
      const seenSlots = new Set<number>();
      for (const a of out.activities) {
        if (seenSlots.has(a.slot)) issues.push(`slot ${a.slot} appears twice`);
        seenSlots.add(a.slot);
        const expected = slotsByNumber.get(a.slot);
        if (!expected) { issues.push(`slot ${a.slot} was not requested`); continue; }
        if (a.type !== expected.type) issues.push(`slot ${a.slot} must be type ${expected.type}, got ${a.type}`);
        if (a.conceptIds.length === 0) issues.push(`slot ${a.slot} has no concepts`);
        for (const id of a.conceptIds) if (!conceptIds.has(id)) issues.push(`slot ${a.slot} cites unknown concept ${id}`);
        for (const id of a.criteriaIds) {
          const sup = supported.get(id);
          if (!sup) issues.push(`slot ${a.slot} cites unknown criterion ${id}`);
          else if (!sup.some((c) => a.conceptIds.includes(c))) issues.push(`slot ${a.slot} cites criterion ${id}, which none of its concepts support`);
        }
      }
      for (const s of slots) if (!seenSlots.has(s.slot)) issues.push(`slot ${s.slot} is missing`);
      return issues;
    }
  });
  return value.activities.map((a) => ({ activityId: `act-${a.slot}`, slot: a.slot, type: a.type, conceptIds: [...new Set(a.conceptIds)], criteriaIds: [...new Set(a.criteriaIds)], focus: a.focus.trim() }));
}
