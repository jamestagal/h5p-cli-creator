import JSZip from "jszip";
import type { EngineIdentity } from "@leaplearn/engine";
import type { ActivityPlan, PlannedType } from "../../src/plan/planner.js";
import { buildIdFor, buildKeyFor, sha256Hex } from "../../src/store/builds.js";
import type { ImportRecord, ImportStore } from "../../src/store/types.js";

/**
 * Everything that stops an import from counting as a complete run, or [] when it is complete. A recorded run (S1) is
 * only usable as replay evidence when it is complete, so the S1 replay test requires []; an incomplete recording must
 * fail it, not pass as `ready_with_failures` (plan Task 10 step 5).
 *
 * Complete means: status `ready`; at least one planned activity of every selected type; every planned activity has a
 * record and is promoted, and its promoted revision points at a build record that is valid for this engine (IDs and
 * key derived from activity, revision and engine fingerprint), whose stored package bytes match the record's sha256
 * and length and open as an H5P package.
 */
export async function importCompletenessProblems(store: ImportStore, record: ImportRecord, selectedTypes: readonly PlannedType[], engine: EngineIdentity): Promise<string[]> {
  const problems: string[] = [];
  const importId = record.importId;
  if (record.status !== "ready") problems.push(`import status is ${record.status}, not ready${record.error ? ` (${record.error})` : ""}`);

  const plan = await store.getArtifact<ActivityPlan[]>(importId, "plan");
  if (!plan) return [...problems, "no stored plan"];
  for (const type of selectedTypes) if (!plan.some((p) => p.type === type)) problems.push(`no planned ${type} activity`);

  const activities = new Map((await store.listActivities(importId)).map((a) => [a.activityId, a]));
  for (const p of plan) {
    const where = `${p.activityId} (${p.type})`;
    const a = activities.get(p.activityId);
    if (!a) { problems.push(`${where}: planned but has no activity record`); continue; }
    if (a.status !== "promoted" || a.dropped) { problems.push(`${where}: status ${a.status}${a.dropped ? ", dropped" : ""}${a.error ? ` (${a.error})` : ""}`); continue; }
    if (a.currentRevision === null) { problems.push(`${where}: promoted with no current revision`); continue; }
    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev || rev.state !== "promoted") { problems.push(`${where}: revision ${a.currentRevision} is ${rev ? rev.state : "missing"}`); continue; }
    const expectedId = buildIdFor(a.activityId, rev.revision, engine.fingerprint);
    if (rev.currentBuildId !== expectedId) { problems.push(`${where}: revision ${rev.revision} points at build ${rev.currentBuildId ?? "none"}, expected ${expectedId}`); continue; }
    const build = await store.getBuildRecord(expectedId);
    if (!build) { problems.push(`${where}: build record ${expectedId} is missing`); continue; }
    const expectedKey = buildKeyFor(a.activityId, rev.revision, engine.fingerprint);
    if (build.importId !== importId || build.activityId !== a.activityId || build.revision !== rev.revision || build.buildKey !== expectedKey || build.engineFingerprint !== engine.fingerprint) {
      problems.push(`${where}: build record ${expectedId} does not match the activity, revision or engine`); continue;
    }
    const bytes = await store.getBuild(build.buildKey);
    if (!bytes) { problems.push(`${where}: package ${build.buildKey} is missing`); continue; }
    if (sha256Hex(bytes) !== build.sha256 || bytes.byteLength !== build.byteLength) { problems.push(`${where}: package ${build.buildKey} does not match its build record's sha256 and length`); continue; }
    const zip = await JSZip.loadAsync(bytes).catch(() => null);
    const h5pJson = zip ? await zip.file("h5p.json")?.async("string") : undefined;
    if (!zip || h5pJson === undefined || !zip.file("content/content.json")) { problems.push(`${where}: package ${build.buildKey} is not an H5P package (no h5p.json or content/content.json)`); continue; }
    try { if (typeof (JSON.parse(h5pJson) as { mainLibrary?: unknown }).mainLibrary !== "string") problems.push(`${where}: package ${build.buildKey} has no mainLibrary in h5p.json`); }
    catch { problems.push(`${where}: package ${build.buildKey} has an unreadable h5p.json`); }
  }
  for (const id of activities.keys()) if (!plan.some((p) => p.activityId === id)) problems.push(`${id}: has an activity record but is not in the plan`);
  return problems;
}
