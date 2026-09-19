import type { PlannedType } from "../plan/planner.js";
import { multiChoiceProducer } from "./multi-choice.js";
import type { Producer } from "./producer.js";

export * from "./producer.js";
export * from "./multi-choice.js";

export function createProducers(): Map<PlannedType, Producer> {
  return new Map<PlannedType, Producer>([[multiChoiceProducer.type, multiChoiceProducer]]);
}
