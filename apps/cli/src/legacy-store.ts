import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { storeVersionOf, type AcceptanceRecord, type ActivityRecord, type AlignmentReviewRecord, type ImportRecord, type RevisionRecord } from "@leaplearn/generator";
import { readJson, readJsonl } from "./file-store.js";

/** A phase-2 revision as it was stored: the engine fingerprint was stamped when the revision was produced, and there are no build records. */
export type LegacyRevisionRecord = Omit<RevisionRecord, "origin" | "requestId"> & { engineFingerprint: string; buildKey: string | null };

export interface LegacyImportView {
  storeVersion: 1;
  importRecord: ImportRecord;
  activities: ActivityRecord[];
  /** `engineFingerprint` is reported exactly as recorded; it is never recomputed, and no build record is derived from it. */
  revisions: LegacyRevisionRecord[];
  engineFingerprintSemantics: "recorded at production (phase 2)";
  acceptances: AcceptanceRecord[];
  alignmentReviews: AlignmentReviewRecord[];
}

export class NotALegacyImportError extends Error {
  constructor(dir: string, version: number | null) { super(version === null ? `${dir} holds no import` : `${dir} is at store version ${version}, not a phase-2 import`); this.name = "NotALegacyImportError"; }
}

/**
 * Reads a phase-2 (store version 1) import directory as it is. It takes no lock, repairs no ledger tail and writes
 * nothing: a crash-truncated final ledger line is skipped by the reader, not cut from the file.
 */
export async function readLegacyImport(dir: string): Promise<LegacyImportView> {
  const importRecord = await readJson<ImportRecord>(join(dir, "import.json"));
  const version = importRecord ? storeVersionOf(importRecord) : null;
  if (!importRecord || version !== 1) throw new NotALegacyImportError(dir, version);

  const activityNames = (await readdir(join(dir, "activities")).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
  const activities = (await Promise.all(activityNames.map((n) => readJson<ActivityRecord>(join(dir, "activities", n)))))
    .filter((a): a is ActivityRecord => a !== null && a.importId === importRecord.importId)
    .sort((a, b) => a.order - b.order);
  const revisions: LegacyRevisionRecord[] = [];
  for (const activity of activities) {
    const names = (await readdir(join(dir, "revisions", activity.activityId)).catch(() => [] as string[])).filter((n) => /^r\d+\.json$/.test(n));
    const read = await Promise.all(names.map((n) => readJson<LegacyRevisionRecord>(join(dir, "revisions", activity.activityId, n))));
    revisions.push(...read.filter((r): r is LegacyRevisionRecord => r !== null).sort((a, b) => a.revision - b.revision));
  }
  const acceptances = (await readJsonl<AcceptanceRecord>(join(dir, "acceptances.jsonl"))).records.filter((a) => a.importId === importRecord.importId);
  const alignmentReviews = (await readJsonl<AlignmentReviewRecord>(join(dir, "alignment-reviews.jsonl"))).records.filter((r) => r.importId === importRecord.importId);
  return { storeVersion: 1, importRecord, activities, revisions, engineFingerprintSemantics: "recorded at production (phase 2)", acceptances, alignmentReviews };
}
