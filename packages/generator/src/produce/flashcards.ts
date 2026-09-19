import { ActivitySpec, type FlashcardsSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkFlashcards, checkReferences } from "../quality/checks.js";
import { FlashcardsOut, FlashcardsOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = (min: number, max: number) => `Write a set of ${min} to ${max} revision flashcards from the evidence.
- front is a term, question or prompt (short); back is the answer or definition in one or two sentences drawn from the evidence; tip is an optional hint or null.
- Fronts are distinct; no two cards test the same idea.
- Plain text only. Cite in each card's evidenceIds the sentence(s) that card is based on.`;

export function toFlashcardsSpec(out: FlashcardsOut, input: ProduceInput, block: EvidenceBlock): FlashcardsSpec {
  const cards = out.cards.map((c, i) => {
    const item: Record<string, unknown> = { id: `c${i + 1}`, front: c.front.trim(), back: c.back.trim(), provenance: deriveProvenance(input, block, c.evidenceIds) };
    if (c.tip !== null && c.tip.trim()) item["tip"] = c.tip.trim();
    return item;
  });
  const spec: Record<string, unknown> = { id: input.plan.activityId, title: out.title.trim(), type: "flashcards", language: input.language, cards, provenance: deriveProvenance(input, block, out.cards.flatMap((c) => c.evidenceIds)) };
  if (out.description.trim()) spec["description"] = out.description.trim();
  return ActivitySpec.parse(spec) as FlashcardsSpec;
}

export const flashcardsProducer: Producer = {
  type: "flashcards",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const { cardsMin, cardsMax } = input.rules.flashcards;
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: { purpose: "produce", model: modelForRole("produce"), system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text, user: `${TASK(cardsMin, cardsMax)}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`, maxOutputTokens: 3000, outputSchema: FlashcardsOutSchema },
      schema: FlashcardsOut,
      verify: async (out) => {
        const issues = [
          ...checkFlashcards(out, cardsMin, cardsMax),
          ...out.cards.flatMap((c, i) => checkReferences({ evidenceIds: c.evidenceIds, conceptIds: [], criteriaIds: [] }, evidence.allowed, `card ${i + 1}`)),
          ...out.cards.flatMap((c) => checkAgainstExisting("front", c.front, input.existing.fronts))
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toFlashcardsSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toFlashcardsSpec(value, input, evidence), attempts, attemptIds };
  }
};
