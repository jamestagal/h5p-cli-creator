import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { storeVersionOf, type AcceptanceRecord, type ActivityRecord, type AlignmentReviewRecord, type ImportRecord, type RevisionRecord } from "@leaplearn/generator";
import { readJson, readJsonl } from "./file-store.js";

/** A phase-2 revision as it was stored: the engine fingerprint was stamped when the revision was produced, and there are no build records. */
export type LegacyRevisionRecord = Omit<RevisionRecord, "origin" | "requestId" | "currentBuildId"> & { engineFingerprint: string; buildKey: string | null };

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

/** Lists a directory, treating only its absence (ENOENT) as empty. Permission errors, a file where a directory belongs (ENOTDIR) and every other failure propagate. */
async function listIfPresent(dir: string): Promise<string[]> {
  try { return await readdir(dir); } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return [];
    throw err;
  }
}

export class NotALegacyImportError extends Error {
  constructor(dir: string, version: number | null) { super(version === null ? `${dir} holds no import` : `${dir} is at store version ${version}, not a phase-2 import`); this.name = "NotALegacyImportError"; }
}

/**
 * Reads a phase-2 (store version 1) import directory as it is. It takes no lock, repairs no ledger tail and writes
 * nothing: a crash-truncated final ledger line is skipped by the reader, not cut from the file. A missing activities or
 * revisions directory reads as empty; any other filesystem error propagates rather than reading as an empty import.
 */
export async function readLegacyImport(dir: string): Promise<LegacyImportView> {
  const importRecord = await readJson<ImportRecord>(join(dir, "import.json"));
  const version = importRecord ? storeVersionOf(importRecord, dir) : null;
  if (!importRecord || version !== 1) throw new NotALegacyImportError(dir, version);

  const activityNames = (await listIfPresent(join(dir, "activities"))).filter((n) => n.endsWith(".json")).sort(); // an import that planned nothing has no activities directory
  const activities = (await Promise.all(activityNames.map((n) => readJson<ActivityRecord>(join(dir, "activities", n)))))
    .filter((a): a is ActivityRecord => a !== null && a.importId === importRecord.importId)
    .sort((a, b) => a.order - b.order);
  const revisions: LegacyRevisionRecord[] = [];
  for (const activity of activities) {
    const names = (await listIfPresent(join(dir, "revisions", activity.activityId))).filter((n) => /^r\d+\.json$/.test(n)); // an activity that failed before any revision has none
    const read = await Promise.all(names.map((n) => readJson<LegacyRevisionRecord>(join(dir, "revisions", activity.activityId, n))));
    revisions.push(...read.filter((r): r is LegacyRevisionRecord => r !== null).sort((a, b) => a.revision - b.revision));
  }
  const acceptances = (await readJsonl<AcceptanceRecord>(join(dir, "acceptances.jsonl"))).records.filter((a) => a.importId === importRecord.importId);
  const alignmentReviews = (await readJsonl<AlignmentReviewRecord>(join(dir, "alignment-reviews.jsonl"))).records.filter((r) => r.importId === importRecord.importId);
  return { storeVersion: 1, importRecord, activities, revisions, engineFingerprintSemantics: "recorded at production (phase 2)", acceptances, alignmentReviews };
}
