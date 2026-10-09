import type { SourceDocument } from "./source-document.js";
import type { HeadingMark, Linearized, OriginFallbackMark, Structure } from "./structure/linearize.js";
import type { Span, UnitOccurrence } from "./structure/origin.js";

/**
 * What ingestion knows about a document beyond its text and sentences (generation scope design §2.1): its heading lines,
 * its structures (tables, lists, notes) and the origin of every character. It is computed beside the document and is
 * never part of it, so the stored source, its sentences, extraction requests and fingerprints are unchanged by it.
 * `textHash` and `extractionVersion` bind it to the document it was computed with.
 */
export interface SourceAnalysis {
  textHash: string;
  extractionVersion: string;
  headings: HeadingMark[];
  structures: Structure[];
  /** Generated spans (UTF-16 offsets into the document text), sorted and merged; every other character is source. */
  generated: Span[];
  /**
   * Every occurrence of authored text the linearizer writes more than once (a header label on each data row, a spanned
   * cell at each position), with the authored unit it repeats: a count takes each unit once within a selection.
   */
  repeats: UnitOccurrence[];
  /** Text whose origin could not be mapped through normalisation: wholly generated, and reported here. */
  originFallbacks: OriginFallbackMark[];
}

/** The analysis of `document`, from the linearizer output it was built from; null for a plain source (text, markdown, PDF). */
export function sourceAnalysis(document: SourceDocument, linearized: Pick<Linearized, "text" | "headings" | "structures" | "generated" | "repeats" | "originFallbacks"> | null): SourceAnalysis {
  if (linearized !== null && linearized.text !== document.text) throw new Error("source analysis: the linearized text is not the document's text");
  return {
    textHash: document.textHash, extractionVersion: document.metadata.extractionVersion,
    headings: linearized?.headings ?? [], structures: linearized?.structures ?? [], generated: linearized?.generated ?? [], repeats: linearized?.repeats ?? [], originFallbacks: linearized?.originFallbacks ?? []
  };
}
