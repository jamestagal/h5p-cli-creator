import { z } from "zod";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { SingleChoiceSetSpec } from "./single-choice-set.js";
import { EssaySpec } from "./essay.js";
import { CrosswordSpec } from "./crossword.js";
import { AccordionSpec } from "./accordion.js";
import { FlashcardsSpec } from "./flashcards.js";
import { DialogCardsSpec } from "./dialog-cards.js";
import { SummarySpec } from "./summary.js";
import { QuestionSetSpec } from "./question-set.js";
import { InteractiveBookSpec } from "./interactive-book.js";

export const StandaloneActivitySpec = z.discriminatedUnion("type", [
  MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, SingleChoiceSetSpec, EssaySpec,
  CrosswordSpec, AccordionSpec, FlashcardsSpec, DialogCardsSpec, SummarySpec, QuestionSetSpec
]);
export type StandaloneActivitySpec = z.infer<typeof StandaloneActivitySpec>;

export const ActivitySpec = z.discriminatedUnion("type", [...StandaloneActivitySpec.options, InteractiveBookSpec]);
export type ActivitySpec = z.infer<typeof ActivitySpec>;

export const ACTIVITY_TYPES = ActivitySpec.options.map((o) => o.shape.type.value) as ActivitySpec["type"][];

function hasEvidence(p: { evidenceIds: string[] } | undefined): boolean {
  return Boolean(p && p.evidenceIds.length > 0);
}

/** Items are the nested arrays whose members extend ItemBase; pages and answers are not items. */
function items(spec: ActivitySpec): Array<{ id: string; provenance?: { evidenceIds: string[] } | undefined }> {
  switch (spec.type) {
    case "flashcards": return spec.cards;
    case "dialogCards": return spec.cards;
    case "accordion": return spec.panels;
    case "crossword": return spec.words;
    case "summary": return spec.groups;
    case "singleChoiceSet": return spec.questions;
    case "blanks": return spec.blanks;
    case "dragText": return spec.draggables;
    default: return [];
  }
}

/** Thrown only by `assertGeneratedProvenance`, so callers can distinguish a provenance defect from any other error. */
export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvenanceError";
  }
}

/**
 * Generated content must be traceable: the activity and every item carry provenance with at least
 * one evidenceId. Throws naming the first offender. Never called for manually authored content.
 */
export function assertGeneratedProvenance(spec: ActivitySpec): void {
  if (!hasEvidence(spec.provenance)) throw new ProvenanceError(`activity ${spec.id} has no evidence provenance`);
  for (const item of items(spec)) if (!hasEvidence(item.provenance)) throw new ProvenanceError(`item ${item.id} in activity ${spec.id} has no evidence provenance`);
  if (spec.type === "questionSet") spec.children.forEach(assertGeneratedProvenance);
  if (spec.type === "interactiveBook") for (const ch of spec.chapters) for (const it of ch.items) if (it.type !== "text" && it.type !== "image" && it.type !== "audio" && it.type !== "video") assertGeneratedProvenance(it);
}
