import { z } from "zod";
import { ActivityBase } from "./base.js";
import { TextPage, ImagePage, AudioPage, VideoPage } from "../pages.js";
import { MultiChoiceSpec } from "./multi-choice.js";
import { TrueFalseSpec } from "./true-false.js";
import { BlanksSpec } from "./blanks.js";
import { DragTextSpec } from "./drag-text.js";
import { SingleChoiceSetSpec } from "./single-choice-set.js";
import { EssaySpec } from "./essay.js";
import { AccordionSpec } from "./accordion.js";
import { DialogCardsSpec } from "./dialog-cards.js";
import { SummarySpec } from "./summary.js";
import { QuestionSetSpec } from "./question-set.js";

/** H5P.Column 1.18 does not accept H5P.Flashcards or H5P.Crossword, so those types are excluded here. */
export const BookItem = z.discriminatedUnion("type", [
  TextPage, ImagePage, AudioPage, VideoPage,
  MultiChoiceSpec, TrueFalseSpec, BlanksSpec, DragTextSpec, SingleChoiceSetSpec, EssaySpec,
  AccordionSpec, DialogCardsSpec, SummarySpec, QuestionSetSpec
]);
export type BookItem = z.infer<typeof BookItem>;

export const BookChapter = z.object({ title: z.string().min(1).max(200), items: z.array(BookItem).min(1) });

export const InteractiveBookSpec = ActivityBase.extend({
  type: z.literal("interactiveBook"),
  coverDescription: z.string().optional(),
  coverImageAssetId: z.string().min(1).optional(),
  chapters: z.array(BookChapter).min(1).max(50)
});
export type InteractiveBookSpec = z.infer<typeof InteractiveBookSpec>;
