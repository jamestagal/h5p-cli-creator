import type { MultiChoiceSpec } from "@leaplearn/shared";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

function key(ctx: BuildContext, name: string): string {
  const l = ctx.registry.resolve(name);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

export const multiChoiceHandler: ActivityHandler<MultiChoiceSpec> = {
  type: "multiChoice",
  mainLibrary: "H5P.MultiChoice",
  requiredLibraries: () => ["H5P.MultiChoice"],
  build(spec, ctx): H5PContent {
    return {
      library: ctx.registry.libraryString(key(ctx, "H5P.MultiChoice")),
      params: {
        question: sanitizeHtml(spec.question),
        answers: spec.answers.map((a) => ({
          text: `<div>${escapeHtml(a.text)}</div>`,
          correct: a.correct,
          tipsAndFeedback: { tip: "", chosenFeedback: escapeHtml(a.feedbackChosen ?? ""), notChosenFeedback: escapeHtml(a.feedbackNotChosen ?? "") }
        })),
        overallFeedback: [{ from: 0, to: 100 }],
        behaviour: {
          enableRetry: true, enableSolutionsButton: true, enableCheckButton: true,
          type: "auto", singlePoint: false, randomAnswers: spec.randomAnswers,
          showSolutionsRequiresInput: true, confirmCheckDialog: false, confirmRetryDialog: false,
          autoCheck: false, passPercentage: 100, showScorePoints: true
        },
        UI: {
          checkAnswerButton: "Check", submitAnswerButton: "Submit", showSolutionButton: "Show solution", tryAgainButton: "Retry",
          tipsLabel: "Show tip", scoreBarLabel: "You got :num out of :total points",
          tipAvailable: "Tip available", feedbackAvailable: "Feedback available", readFeedback: "Read feedback",
          wrongAnswer: "Wrong answer", correctAnswer: "Correct answer", shouldCheck: "Should have been checked", shouldNotCheck: "Should not have been checked",
          noInput: "Please answer before viewing the solution",
          a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
          a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
          a11yRetry: "Retry the task. Reset all responses and start the task over again."
        },
        confirmCheck: { header: "Finish ?", body: "Are you sure you wish to finish ?", cancelLabel: "Cancel", confirmLabel: "Finish" },
        confirmRetry: { header: "Retry ?", body: "Are you sure you wish to retry ?", cancelLabel: "Cancel", confirmLabel: "Confirm" }
      },
      metadata: { contentType: "Multiple Choice", license: "U", title: spec.title }
    };
  }
};
