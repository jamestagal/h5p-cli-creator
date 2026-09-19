import type { Evidence } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";

export function evidenceForSentence(doc: SourceDocument, sentenceId: string): Evidence {
  const s = doc.sentences.find((x) => x.sentenceId === sentenceId);
  if (!s) throw new Error(`sentence ${sentenceId} is not in source ${doc.sourceId}`);
  return { evidenceId: `ev-${s.sentenceId}`, sentenceId: s.sentenceId, charStart: s.charStart, charEnd: s.charEnd, quote: s.text };
}

/** Returns null when the quote is exactly the stored text at its offsets; otherwise the reason. */
export function verifyEvidence(text: string, evidence: Evidence): string | null {
  const actual = text.slice(evidence.charStart, evidence.charEnd);
  return actual === evidence.quote ? null : `evidence ${evidence.evidenceId}: quote does not match the stored text at [${evidence.charStart}, ${evidence.charEnd})`;
}

export class EvidenceMismatchError extends Error { constructor(reason: string) { super(reason); this.name = "EvidenceMismatchError"; } }
