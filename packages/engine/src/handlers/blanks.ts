import { BLANK_TOKEN, type BlanksSpec } from "@leaplearn/shared";
import type { ActivityHandler, BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

function key(ctx: BuildContext, name: string): string {
  const l = ctx.registry.resolve(name);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

/**
 * Turns "{{b1}}" tokens into H5P.Blanks "*answer1/answer2:tip*" markers. The passage is plain text
 * and is HTML-escaped; the schema has already rejected answers or tips containing "*", "/" or ":",
 * so nothing is altered here. Escaping happens before substitution so the markers stay intact.
 */
export function toBlanksMarkup(passage: string, blanks: BlanksSpec["blanks"]): string {
  const byId = new Map(blanks.map((b) => [b.id, b]));
  const escapedPassage = escapeHtml(passage);
  return escapedPassage.replace(BLANK_TOKEN, (_m, id: string) => {
    const b = byId.get(id)!;
    const answers = b.answers.map(escapeHtml).join("/");
    return `*${answers}${b.tip ? `:${escapeHtml(b.tip)}` : ""}*`;
  });
}

export const blanksHandler: ActivityHandler<BlanksSpec> = {
  type: "blanks",
  mainLibrary: "H5P.Blanks",
  requiredLibraries: () => ["H5P.Blanks"],
  build(spec, ctx): H5PContent {
    return {
      library: ctx.registry.libraryString(key(ctx, "H5P.Blanks")),
      params: {
        text: spec.taskDescription ? sanitizeHtml(`<p>${spec.taskDescription}</p>`) : "",
        questions: [`<p>${toBlanksMarkup(spec.passage, spec.blanks)}</p>`],
        overallFeedback: [{ from: 0, to: 100, feedback: "You got @score of @total blanks correct." }],
        showSolutions: "Show solutions", tryAgain: "Try again", checkAnswer: "Check", submitAnswer: "Submit",
        notFilledOut: "Please fill in all blanks", answerIsCorrect: "':ans' is correct", answerIsWrong: "':ans' is wrong",
        answeredCorrectly: "Answered correctly", answeredIncorrectly: "Answered incorrectly", solutionLabel: "Correct answer:",
        inputLabel: "Blank input @num of @total", inputHasTipLabel: "Tip available", tipLabel: "Tip",
        behaviour: {
          enableRetry: true, enableSolutionsButton: true, enableCheckButton: true, autoCheck: false,
          caseSensitive: spec.caseSensitive, showSolutionsRequiresInput: true, separateLines: false,
          confirmCheckDialog: false, confirmRetryDialog: false, acceptSpellingErrors: false
        },
        confirmCheck: { header: "Finish ?", body: "Are you sure?", cancelLabel: "Cancel", confirmLabel: "Finish" },
        confirmRetry: { header: "Retry ?", body: "Are you sure?", cancelLabel: "Cancel", confirmLabel: "Confirm" },
        scoreBarLabel: "You got :num out of :total points",
        a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
        a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
        a11yRetry: "Retry the task. Reset all responses and start the task over again.",
        a11yCheckingModeHeader: "Checking mode"
      },
      metadata: { contentType: "Fill in the Blanks", license: "U", title: spec.title }
    };
  }
};
