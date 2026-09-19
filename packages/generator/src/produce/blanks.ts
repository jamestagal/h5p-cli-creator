import { escapeHtml } from "@leaplearn/engine";
import { ActivitySpec, assertGeneratedProvenance, type BlanksSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkBlanks, checkReferences } from "../quality/checks.js";
import { BlanksOut, BlanksOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, evidenceQuotesFor, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE fill-in-the-blanks revision passage from the evidence.
- The passage is 2 to 4 sentences of plain text that closely follows the evidence, with 2 to 4 blanks written as {{b1}}, {{b2}}, ... in order of appearance, each exactly once.
- Each blank removes a key term or value that appears word-for-word in the evidence sentence that blank cites; list that exact wording in answers (add a second accepted spelling only if it also appears in that sentence).
- Never use the characters * / : in answers or tips, and never put * in the passage.
- tip is a short hint or null. Cite in each blank's evidenceIds the sentence its answer comes from.`;

export function toBlanksSpec(out: BlanksOut, input: ProduceInput, block: EvidenceBlock): BlanksSpec {
  const blanks = out.blanks.map((b, i) => {
    const item: Record<string, unknown> = { id: `b${i + 1}`, answers: b.answers.map((a) => a.trim()), provenance: deriveProvenance(input, block, b.evidenceIds) };
    if (b.tip !== null && b.tip.trim()) item["tip"] = b.tip.trim();
    return item;
  });
  const spec = ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "blanks", language: input.language,
    taskDescription: escapeHtml(out.taskDescription.trim()), passage: out.passage.trim(), blanks, caseSensitive: false,
    provenance: deriveProvenance(input, block, out.blanks.flatMap((b) => b.evidenceIds))
  }) as BlanksSpec;
  assertGeneratedProvenance(spec);
  return spec;
}

export const blanksProducer: Producer = {
  type: "blanks",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: {
        purpose: "produce", model: modelForRole("produce"),
        system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text,
        user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`,
        maxOutputTokens: 1500, outputSchema: BlanksOutSchema
      },
      schema: BlanksOut,
      verify: async (out) => {
        const evidenceIds = [...new Set(out.blanks.flatMap((b) => b.evidenceIds))];
        const issues = [
          ...checkBlanks(out, (ids) => evidenceQuotesFor(evidence, ids)),
          ...checkReferences({ evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the passage"),
          ...checkAgainstExisting("passage", out.passage, input.existing.passages)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toBlanksSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toBlanksSpec(value, input, evidence), attempts, attemptIds };
  }
};
