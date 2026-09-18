import type { ActivitySpec } from "@leaplearn/shared";
import type { ActivityHandler } from "./handler.js";
import { multiChoiceHandler } from "./multi-choice.js";
import { blanksHandler } from "./blanks.js";
import { flashcardsHandler } from "./flashcards.js";
import { createQuestionSetHandler } from "./question-set.js";
import { createInteractiveBookHandler } from "./interactive-book.js";

export function createHandlerRegistry(): Map<ActivitySpec["type"], ActivityHandler> {
  const list: ActivityHandler[] = [multiChoiceHandler as ActivityHandler, blanksHandler as ActivityHandler, flashcardsHandler as ActivityHandler];
  const map = new Map(list.map((h) => [h.type, h]));
  map.set("questionSet", createQuestionSetHandler(map) as ActivityHandler);
  map.set("interactiveBook", createInteractiveBookHandler(map) as ActivityHandler);
  return map;
}
