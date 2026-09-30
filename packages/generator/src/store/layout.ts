import type { ImportStore } from "./types.js";

/**
 * A store-version-2 import written by a phase-3 development build before build records and attempt attribution
 * (Task 3): revisions carry `engineFingerprint`/`buildKey` and no `currentBuildId`, and operations or attempt starts
 * carry no `origin`. Nothing is migrated or reconstructed; the directory is refused as it is.
 */
export class ObsoleteStoreLayoutError extends Error {
  constructor(where: string, problems: string[]) {
    const shown = problems.length > 3 ? [...problems.slice(0, 3), `and ${problems.length - 3} more`] : problems;
    super(`${where} was written by an earlier phase-3 development build, before build records and attempt attribution (${shown.join("; ")}). It is kept unchanged and is not migrated, because its build and attempt attribution cannot be reconstructed. Use a new output directory.`);
    this.name = "ObsoleteStoreLayoutError";
  }
}

const has = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/**
 * Refuses a version-2 import whose records predate build records and attribution. Reads only: activities, their
 * revisions, operations and attempts. Callers run it after the store-version check and before their first write.
 */
export async function assertCurrentLayout(store: ImportStore, importId: string, where: string): Promise<void> {
  const problems: string[] = [];
  for (const activity of await store.listActivities(importId)) {
    for (const rev of await store.listRevisions(activity.activityId)) {
      if (has(rev, "engineFingerprint") || has(rev, "buildKey") || !has(rev, "currentBuildId")) problems.push(`revision ${rev.activityId} r${rev.revision} has no currentBuildId`);
    }
  }
  for (const op of await store.listOperations(importId)) if (!has(op, "origin")) problems.push(`operation ${op.operationId} has no origin`);
  for (const e of await store.listAttempts(importId)) if (e.event === "start" && !has(e, "origin")) problems.push(`attempt ${e.attemptId} has no origin`);
  if (problems.length > 0) throw new ObsoleteStoreLayoutError(where, problems);
}
