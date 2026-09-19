import { escapeHtml, validate, type LibraryRegistry } from "@leaplearn/engine";
import type { ActivitySpec, ConceptMap, UnitOfCompetency } from "@leaplearn/shared";
import { ZodError } from "zod";
import type { StageRunner } from "../llm/runner.js";
import type { ActivityPlan, PlannedType, PlanRules } from "../plan/planner.js";
import type { PromptConfig } from "../prompts/system.js";
import type { AllowedRefs } from "../quality/checks.js";

export interface ProduceInput {
  plan: ActivityPlan;
  map: ConceptMap;
  unit: UnitOfCompetency | null;
  promptConfig: PromptConfig;
  language: string;
  existing: { questions: string[]; passages: string[]; fronts: string[] };
  rules: PlanRules;
}
export interface EngineHandle { registry: LibraryRegistry; }
export interface Produced { spec: ActivitySpec; attempts: number; attemptIds: string[]; }
export interface Producer { readonly type: PlannedType; produce(input: ProduceInput, runner: StageRunner, engine: EngineHandle): Promise<Produced>; }

export function paragraph(text: string): string {
  return `<p>${escapeHtml(text.trim())}</p>`;
}

export interface EvidenceBlock { text: string; allowed: AllowedRefs; byId: Map<string, { quote: string; conceptIds: string[] }>; }
export interface Provenance { conceptIds: string[]; evidenceIds: string[]; criteriaIds: string[]; }

/** The evidence the model may cite: every sentence of every planned concept, listed under its concept. A sentence shared by two concepts is listed under both and owned by both. */
export function evidenceBlock(map: ConceptMap, conceptIds: string[]): EvidenceBlock {
  const concepts = conceptIds.map((id) => map.concepts.find((c) => c.conceptId === id)).filter((c): c is ConceptMap["concepts"][number] => c !== undefined);
  const byId = new Map<string, { quote: string; conceptIds: string[] }>();
  const lines = concepts.map((c) => {
    const rows = c.evidence.map((e) => {
      const entry = byId.get(e.evidenceId) ?? { quote: e.quote, conceptIds: [] };
      entry.conceptIds.push(c.conceptId);
      byId.set(e.evidenceId, entry);
      return `[${e.evidenceId}] ${e.quote}`;
    });
    return `CONCEPT ${c.conceptId}: ${c.name}\n${c.summary}\n${rows.join("\n")}`;
  });
  const criteria = map.alignment ? new Set(map.alignment.criteria.map((c) => c.criterionId)) : null;
  return { text: `EVIDENCE (cite these ids):\n${lines.join("\n\n")}`, allowed: { evidence: new Set(byId.keys()), concepts: new Set(concepts.map((c) => c.conceptId)), criteria }, byId };
}

export function evidenceTextFor(block: EvidenceBlock, evidenceIds: string[]): string {
  return evidenceIds.map((id) => block.byId.get(id)?.quote ?? "").filter(Boolean).join(" ");
}

/** One quote per cited id, in cited order; an id absent from the block is skipped rather than producing an empty entry. */
export function evidenceQuotesFor(block: EvidenceBlock, evidenceIds: string[]): string[] {
  return evidenceIds.map((id) => block.byId.get(id)?.quote).filter((quote): quote is string => quote !== undefined);
}

/** Provenance from what was actually cited: the concepts that own the cited evidence, and the plan's criteria those concepts support. */
export function deriveProvenance(input: ProduceInput, block: EvidenceBlock, evidenceIds: string[]): Provenance {
  const cited = [...new Set(evidenceIds)];
  const owners = new Set(cited.flatMap((id) => block.byId.get(id)?.conceptIds ?? []));
  const conceptIds = input.plan.conceptIds.filter((id) => owners.has(id));
  const alignment = input.map.alignment;
  const criteriaIds = alignment
    ? input.plan.criteriaIds.filter((id) => alignment.criteria.find((c) => c.criterionId === id)?.conceptIds.some((c) => conceptIds.includes(c)) ?? false)
    : [...input.plan.criteriaIds];
  return { conceptIds, evidenceIds: cited, criteriaIds };
}

export function criteriaBlock(input: ProduceInput): string {
  if (!input.unit || input.plan.criteriaIds.length === 0) return "";
  const byId = new Map(input.unit.elements.flatMap((e) => e.performanceCriteria).map((c) => [c.id, c.text]));
  return `\nPERFORMANCE CRITERIA THIS ACTIVITY HELPS REVISE:\n${input.plan.criteriaIds.map((id) => `- ${id}: ${byId.get(id) ?? ""}`).join("\n")}`;
}

/**
 * Converts model output to a spec; a schema failure or a missing-provenance failure becomes verify
 * reasons (a content failure) instead of an exception. `assertGeneratedProvenance` throws a plain
 * `Error` (see `@leaplearn/shared`'s `activities/index.ts`), so that case is folded into a
 * `provenance: ...` reason alongside the `ZodError` case; any other thrown value is not one this
 * conversion is expected to produce and is rethrown.
 */
export function tryConvert<T>(convert: () => T): { spec: T } | { issues: string[] } {
  try {
    return { spec: convert() };
  } catch (err) {
    if (err instanceof ZodError) return { issues: err.issues.map((i) => `spec ${i.path.join(".") || "(root)"}: ${i.message}`) };
    if (err instanceof Error) return { issues: [`provenance: ${err.message}`] };
    throw err;
  }
}

export async function engineIssues(spec: ActivitySpec, registry: LibraryRegistry): Promise<string[]> {
  const issues = await validate(spec, new Map(), { registry });
  return issues.map((i) => `engine rejected ${i.path || "(root)"}: ${i.message}`);
}
