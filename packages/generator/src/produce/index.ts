import type { PlannedType } from "../plan/planner.js";
import { blanksProducer } from "./blanks.js";
import { flashcardsProducer } from "./flashcards.js";
import { multiChoiceProducer } from "./multi-choice.js";
import type { Producer } from "./producer.js";

export * from "./producer.js";
export * from "./multi-choice.js";
export * from "./blanks.js";
export * from "./flashcards.js";

export function createProducers(): Map<PlannedType, Producer> {
  return new Map<PlannedType, Producer>([[multiChoiceProducer.type, multiChoiceProducer], [blanksProducer.type, blanksProducer], [flashcardsProducer.type, flashcardsProducer]]);
}
