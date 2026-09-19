import { buildDocument, type IngestOptions, type SourceDocument } from "./source-document.js";

export async function ingestText(text: string, opts: IngestOptions): Promise<SourceDocument> {
  return buildDocument("text", text, opts);
}

/** Keeps the words, drops markdown syntax: ATX headings, list bullets, emphasis markers, inline code ticks, links keep their text. */
export function markdownToText(md: string): string {
  return md
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1");
}

export async function ingestMarkdown(md: string, opts: IngestOptions): Promise<SourceDocument> {
  return buildDocument("markdown", markdownToText(md), opts);
}
