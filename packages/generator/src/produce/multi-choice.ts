import { ActivitySpec, assertGeneratedProvenance, type MultiChoiceSpec } from "@leaplearn/shared";
import { modelForRole } from "../llm/models.js";
import type { StageRunner } from "../llm/runner.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { checkAgainstExisting, checkMultiChoice, checkReferences } from "../quality/checks.js";
import { MultiChoiceOut, MultiChoiceOutSchema } from "../schemas/model-output.js";
import { criteriaBlock, deriveProvenance, engineIssues, evidenceBlock, paragraph, tryConvert, type EngineHandle, type EvidenceBlock, type Produced, type ProduceInput, type Producer } from "./producer.js";

const TASK = `Write ONE multiple-choice revision question from the evidence.
- The question tests understanding of the focus, not recall of exact wording.
- Give 3 or 4 answer options; exactly one is correct; the others are plausible misconceptions a learner might hold.
- feedback for the correct answer restates the evidence in one sentence; feedback for a wrong answer explains briefly why it is wrong (may be empty).
- Plain text only. Cite in evidenceIds the evidence sentence ids the question and correct answer rely on.`;

export function toMultiChoiceSpec(out: MultiChoiceOut, input: ProduceInput, block: EvidenceBlock): MultiChoiceSpec {
  const answers = out.answers.map((a) => (a.feedback.trim() ? { text: a.text.trim(), correct: a.correct, feedbackChosen: a.feedback.trim() } : { text: a.text.trim(), correct: a.correct }));
  const spec = ActivitySpec.parse({
    id: input.plan.activityId, title: out.title.trim(), type: "multiChoice", language: input.language,
    question: paragraph(out.question), answers, randomAnswers: true,
    provenance: deriveProvenance(input, block, out.evidenceIds)
  }) as MultiChoiceSpec;
  assertGeneratedProvenance(spec);
  return spec;
}

export const multiChoiceProducer: Producer = {
  type: "multiChoice",
  async produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced> {
    const evidence = evidenceBlock(input.map, input.plan.conceptIds);
    const { value, attempts, attemptIds } = await runner.run({
      key: `produce:${input.plan.activityId}`,
      request: {
        purpose: "produce", model: modelForRole("produce"),
        system: buildSystemPrompt(input.promptConfig), cachedContext: evidence.text,
        user: `${TASK}\n\nFOCUS: ${input.plan.focus}${criteriaBlock(input)}`,
        maxOutputTokens: 1500, outputSchema: MultiChoiceOutSchema
      },
      schema: MultiChoiceOut,
      verify: async (out) => {
        const issues = [
          ...checkMultiChoice(out),
          ...checkReferences({ evidenceIds: out.evidenceIds, conceptIds: input.plan.conceptIds, criteriaIds: input.plan.criteriaIds }, evidence.allowed, "the question"),
          ...checkAgainstExisting("question", out.question, input.existing.questions)
        ];
        if (issues.length > 0) return issues;
        const converted = tryConvert(() => toMultiChoiceSpec(out, input, evidence));
        return "issues" in converted ? converted.issues : engineIssues(converted.spec, engine.registry);
      }
    });
    return { spec: toMultiChoiceSpec(value, input, evidence), attempts, attemptIds };
  }
};
