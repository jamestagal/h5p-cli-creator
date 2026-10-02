import { createHash } from "node:crypto";
import type { AcceptanceRecord, BuildRecord, ReviewBatch, SheetManifest } from "./types.js";

/** `sha256([activityId, revision, engineFingerprint])`, first 16 hex characters: one id per revision per engine. */
export function buildIdFor(activityId: string, revision: number, engineFingerprint: string): string {
  return createHash("sha256").update(JSON.stringify([activityId, revision, engineFingerprint])).digest("hex").slice(0, 16);
}

/** `builds/<activity>-r<n>-<engineFingerprint[0..12]>.h5p`. */
export function buildKeyFor(activityId: string, revision: number, engineFingerprint: string): string {
  return `builds/${activityId}-r${revision}-${engineFingerprint.slice(0, 12)}.h5p`;
}

export const sha256Hex = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

/** Sorted by revision, then builtAt, then buildId, so listings are stable. */
export function sortBuilds(records: BuildRecord[]): BuildRecord[] {
  return records.sort((a, b) => a.revision - b.revision || (a.builtAt < b.builtAt ? -1 : a.builtAt > b.builtAt ? 1 : 0) || (a.buildId < b.buildId ? -1 : a.buildId > b.buildId ? 1 : 0));
}

/** JSON with object keys sorted, so two equal records compare equal whatever order their keys were written in. */
export function canonicalRecordJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value));
}

/** Two manifests with the same sheetId describe the same sheet when everything but createdAt is equal. */
export function sameSheet(a: SheetManifest, b: SheetManifest): boolean {
  const content = (m: SheetManifest) => ({ sheetId: m.sheetId, importId: m.importId, unitTextHash: m.unitTextHash, rubricVersion: m.rubricVersion, entries: m.entries });
  return canonicalRecordJson(content(a)) === canonicalRecordJson(content(b));
}

/** Sorted by createdAt, then sheetId, so listings are stable. */
export function sortSheets(manifests: SheetManifest[]): SheetManifest[] {
  return manifests.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.sheetId < b.sheetId ? -1 : a.sheetId > b.sheetId ? 1 : 0));
}

/** Batches in commit order: by sequence (R8). */
export function sortBatches(batches: ReviewBatch[]): ReviewBatch[] {
  return batches.sort((a, b) => a.sequence - b.sequence);
}

/**
 * The acceptance record that counts per `(activityId, revision)` (R8): a record from a committed batch beats any
 * unscored one, and among those the latest by `(sequence, rowIndex)` wins. Unscored records (phase-2 and
 * `review --decision`) are ordered by append order among themselves. Append order never decides between scored ones.
 */
export function latestAcceptances(records: AcceptanceRecord[]): AcceptanceRecord[] {
  const later = (a: AcceptanceRecord, b: AcceptanceRecord): boolean => {
    if (a.sequence === undefined) return b.sequence === undefined; // unscored: append order, so a later one wins
    if (b.sequence === undefined) return true;
    return a.sequence > b.sequence || (a.sequence === b.sequence && (a.rowIndex ?? 0) > (b.rowIndex ?? 0));
  };
  const latest = new Map<string, AcceptanceRecord>();
  for (const r of records) {
    const key = `${r.activityId}/${r.revision}`;
    const current = latest.get(key);
    if (!current || later(r, current)) latest.set(key, r);
  }
  return [...latest.values()];
}
