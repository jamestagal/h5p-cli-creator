import type { ActivitySpec } from "@leaplearn/shared";
import type { ActivityHandler } from "./handler.js";
import { multiChoiceHandler } from "./multi-choice.js";
import { blanksHandler } from "./blanks.js";
import { flashcardsHandler } from "./flashcards.js";

export function createHandlerRegistry(): Map<ActivitySpec["type"], ActivityHandler> {
  const list: ActivityHandler[] = [multiChoiceHandler as ActivityHandler, blanksHandler as ActivityHandler, flashcardsHandler as ActivityHandler];
  return new Map(list.map((h) => [h.type, h]));
}
