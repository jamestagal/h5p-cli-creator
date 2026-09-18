import type { FlashcardsSpec } from "@leaplearn/shared";
import { EngineError } from "../errors.js";
import { resolveLibraryKey, type ActivityHandler } from "./handler.js";
import type { H5PContent } from "../params.js";
import { escapeHtml } from "../html.js";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

export const flashcardsHandler: ActivityHandler<FlashcardsSpec> = {
  type: "flashcards",
  mainLibrary: "H5P.Flashcards",
  requiredLibraries: () => ["H5P.Flashcards"],
  build(spec, ctx): H5PContent {
    const cards = spec.cards.map((c) => {
      const card: Record<string, unknown> = { text: escapeHtml(c.front), answer: escapeHtml(c.back) };
      if (c.tip) card["tip"] = escapeHtml(c.tip);
      if (c.imageAssetId) {
        const a = ctx.assets.get(c.imageAssetId);
        if (!a) throw new EngineError(`asset ${c.imageAssetId} is not in the manifest`, "ASSET_MISSING");
        const ext = EXT[a.mimeType];
        if (!ext) throw new EngineError(`unsupported image type ${a.mimeType}`, "ASSET_TYPE");
        const path = `images/${spec.id}-${c.id}.${ext}`;
        ctx.mediaPaths.set(path, c.imageAssetId);
        card["image"] = { path, mime: a.mimeType, copyright: { license: "U" } };
        if (c.imageAlt) card["imageAltText"] = escapeHtml(c.imageAlt);
      }
      return card;
    });
    return {
      library: ctx.registry.libraryString(resolveLibraryKey(ctx.registry, "H5P.Flashcards")),
      params: {
        description: escapeHtml(spec.description ?? ""),
        cards,
        progressText: "Card @card of @total", next: "Next", previous: "Previous", checkAnswerText: "Check",
        showSolutionsRequiresInput: true, defaultAnswerText: "Your answer", correctAnswerText: "Correct",
        incorrectAnswerText: "Incorrect", showSolutionText: "Correct answer", results: "Results",
        ofCorrect: "@score of @total correct", showResults: "Show results", answerShortText: "A:", retry: "Retry",
        caseSensitive: false, cardAnnouncement: "Incorrect answer. Correct answer was @answer",
        pageAnnouncement: "Page @current of @total"
      },
      metadata: { contentType: "Flashcards", license: "U", title: spec.title }
    };
  }
};
