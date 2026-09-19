import type { QuestionSetSpec } from "@leaplearn/shared";
import { requireHandler, resolveLibraryKey, type ActivityHandler, type BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

export function createQuestionSetHandler(children: Map<string, ActivityHandler>): ActivityHandler<QuestionSetSpec> {
  return {
    type: "questionSet",
    mainLibrary: "H5P.QuestionSet",
    requiredLibraries: (spec) => ["H5P.QuestionSet", ...new Set(spec.children.flatMap((c, i) => requireHandler(children, c.type, `children[${i}]`).requiredLibraries(c as never)))],
    build(spec, ctx): H5PContent {
      const questions = spec.children.map((child, i) => {
        const h = requireHandler(children, child.type, `children[${i}]`);
        const childCtx: BuildContext = { ...ctx, ids: ctx.ids.scope(`questions/${i}`) };
        return { ...h.build(child as never, childCtx), subContentId: ctx.ids.subContentId(`questions/${i}`) };
      });
      return {
        library: ctx.registry.libraryString(resolveLibraryKey(ctx.registry, "H5P.QuestionSet")),
        params: {
          introPage: { showIntroPage: Boolean(spec.introduction), title: escapeHtml(spec.title), introduction: sanitizeHtml(spec.introduction ?? ""), startButtonText: "Start Quiz" },
          progressType: "dots", passPercentage: spec.passPercentage, disableBackwardsNavigation: false, randomQuestions: spec.randomQuestions,
          questions,
          texts: { prevButton: "Previous question", nextButton: "Next question", finishButton: "Finish", submitButton: "Submit", textualProgress: "Question: @current of @total questions", jumpToQuestion: "Question %d of %total", questionLabel: "Question", readSpeakerProgress: "Question @current of @total", unansweredText: "Unanswered", answeredText: "Answered", currentQuestionText: "Current question", navigationLabel: "Questions" },
          endGame: { showResultPage: true, showSolutionButton: true, showRetryButton: true, noResultMessage: "Finished", message: "Your result:", scoreBarLabel: "You got @finals out of @totals points", overallFeedback: [{ from: 0, to: 100 }], solutionButtonText: "Show solution", retryButtonText: "Retry", finishButtonText: "Finish", submitButtonText: "Submit", showAnimations: false, skippable: false, skipButtonText: "Skip video" },
          override: { checkButton: true }
        },
        metadata: { contentType: "Question Set", license: "U", title: spec.title }
      };
    }
  };
}
