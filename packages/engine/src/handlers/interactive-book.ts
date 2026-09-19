import type { InteractiveBookSpec, BookItem } from "@leaplearn/shared";
import { EngineError } from "../errors.js";
import { requireHandler, resolveLibraryKey, type ActivityHandler, type BuildContext } from "./handler.js";
import type { H5PContent } from "../params.js";
import { sanitizeHtml, escapeHtml } from "../html.js";

/** Converts an internal `chapters/0/items/1`-style path to the `chapters[0].items[1]` form used in issue paths. */
function toIssuePath(path: string): string {
  const segments = path.split("/");
  return segments.reduce((out, segment, i) => {
    if (i === 0) return segment;

    return i % 2 === 1 ? `${out}[${segment}]` : `${out}.${segment}`;
  }, "");
}

export function createInteractiveBookHandler(children: Map<string, ActivityHandler>): ActivityHandler<InteractiveBookSpec> {
  const lib = (ctx: BuildContext, name: string): string => ctx.registry.libraryString(resolveLibraryKey(ctx.registry, name));

  function pageContent(item: BookItem, ctx: BuildContext, path: string): H5PContent {
    const issuePath = toIssuePath(path);
    switch (item.type) {
      case "text":
        return { library: lib(ctx, "H5P.AdvancedText"), params: { text: `<h2>${escapeHtml(item.title)}</h2>${sanitizeHtml(item.html)}` }, metadata: { contentType: "Text", license: "U", title: item.title } };
      case "image": {
        const a = ctx.assets.get(item.assetId);
        if (!a) throw new EngineError(`asset ${item.assetId} is not in the manifest`, "ASSET_MISSING", `${issuePath}.assetId`);
        const ext = a.mimeType === "image/png" ? "png" : a.mimeType === "image/jpeg" ? "jpg" : null;
        if (!ext) throw new EngineError(`unsupported image type ${a.mimeType}`, "ASSET_TYPE", `${issuePath}.assetId`);
        const p = `images/${path.replace(/\//g, "-")}.${ext}`;
        ctx.mediaPaths.set(p, item.assetId);
        return { library: lib(ctx, "H5P.Image"), params: { contentName: "Image", file: { path: p, mime: a.mimeType, copyright: { license: "U" } }, alt: escapeHtml(item.alt), title: escapeHtml(item.title) }, metadata: { contentType: "Image", license: "U", title: item.title } };
      }
      case "audio": case "video":
        throw new EngineError(`${item.type} pages are not implemented in phase 1`, "NOT_IMPLEMENTED", issuePath);
      default: {
        const h = requireHandler(children, item.type, issuePath);
        return h.build(item as never, { ...ctx, ids: ctx.ids.scope(path) });
      }
    }
  }

  function wrap(content: H5PContent, ctx: BuildContext, path: string): unknown {
    const inner = { ...content, subContentId: ctx.ids.subContentId(`${path}/content`) };
    const rowColumn = { params: { content: [inner] }, library: lib(ctx, "H5P.RowColumn"), subContentId: ctx.ids.subContentId(`${path}/rowColumn`), metadata: { contentType: "Column", license: "U", title: "Untitled Column" } };
    const row = { params: { columns: [{ width: 100, content: rowColumn }] }, library: lib(ctx, "H5P.Row"), subContentId: ctx.ids.subContentId(`${path}/row`), metadata: { contentType: "Row", license: "U", title: "Untitled Row" } };
    return { content: row, useSeparator: "auto" };
  }

  return {
    type: "interactiveBook",
    mainLibrary: "H5P.InteractiveBook",
    requiredLibraries: (spec) => {
      const libs = new Set(["H5P.InteractiveBook", "H5P.Column", "H5P.Row", "H5P.RowColumn"]);
      for (const [ci, ch] of spec.chapters.entries()) for (const [ii, it] of ch.items.entries()) {
        if (it.type === "text") libs.add("H5P.AdvancedText");
        else if (it.type === "image") libs.add("H5P.Image");
        else if (it.type === "audio" || it.type === "video") continue;
        else requireHandler(children, it.type, `chapters[${ci}].items[${ii}]`).requiredLibraries(it as never).forEach((l) => libs.add(l));
      }
      return [...libs];
    },
    build(spec, ctx): H5PContent {
      if (spec.coverImageAssetId) throw new EngineError("book cover images are not implemented in phase 1", "NOT_IMPLEMENTED", "coverImageAssetId");

      const chapters = spec.chapters.map((ch, ci) => ({
        params: { content: ch.items.map((it, ii) => wrap(pageContent(it, ctx, `chapters/${ci}/items/${ii}`), ctx, `chapters/${ci}/items/${ii}`)) },
        library: lib(ctx, "H5P.Column"),
        subContentId: ctx.ids.subContentId(`chapters/${ci}`),
        metadata: { contentType: "Column", license: "U", title: ch.title }
      }));
      return {
        library: lib(ctx, "H5P.InteractiveBook"),
        params: {
          showCoverPage: Boolean(spec.coverDescription),
          bookCover: { coverDescription: spec.coverDescription ? sanitizeHtml(`<p>${spec.coverDescription}</p>`) : "" },
          chapters,
          behaviour: { defaultTableOfContents: true, progressIndicators: true, progressAuto: true, displaySummary: true, enableRetry: true },
          read: "Read", displayTOC: "Display 'Table of contents'", hideTOC: "Hide 'Table of contents'", nextPage: "Next page", previousPage: "Previous page", chapterCompleted: "Page completed!", partCompleted: "@pages of @total completed", incompleteChapter: "Incomplete page", navigateToTop: "Go to the top", markAsFinished: "I have finished this page", fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen", bookProgressSubtext: "@count of @total pages", interactionsProgressSubtext: "@count of @total interactions", submitReport: "Submit Report", restartLabel: "Restart", summaryHeader: "Summary", allInteractions: "All interactions", unansweredInteractions: "Unanswered interactions", scoreText: "@score / @maxscore", leftOutOfTotalCompleted: "@left of @max interactions completed", noInteractions: "No interactions", score: "Score", summaryAndSubmit: "Summary & submit", noChapterInteractionBoldText: "You have not interacted with any pages.", noChapterInteractionText: "You have to interact with at least one page before you can see the summary.", yourAnswersAreSubmittedForReview: "Your answers are submitted for review!", bookProgress: "Book progress", interactionsProgress: "Interactions progress", totalScoreLabel: "Total score"
        },
        metadata: { contentType: "Interactive Book", license: "U", title: spec.title }
      };
    }
  };
}
