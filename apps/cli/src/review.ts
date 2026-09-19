import { resolve } from "node:path";
import { criteriaOf, type AcceptanceDecision, type AlignmentDecision, type UnitOfCompetency } from "@leaplearn/shared";
import { StoreLockedError, type AcceptanceRecord, type AlignmentReviewRecord, type ImportStore } from "@leaplearn/generator";
import { FileStore } from "./file-store.js";
import { importIdFor } from "./generate.js";
import { formatCostReport, writeReports } from "./report.js";

export class ReviewError extends Error { constructor(message: string) { super(message); this.name = "ReviewError"; } }

export type ReviewInput = { activityId: string; reviewer: string } & (
  | { kind: "acceptance"; decision: AcceptanceDecision; notes: string | null }
  | { kind: "alignment"; criterionId: string; decision: AlignmentDecision; itemId: string | null }
);

function itemProvenance(spec: { type: string; blanks?: Array<{ id: string; provenance: { criteriaIds: string[] } }>; cards?: Array<{ id: string; provenance: { criteriaIds: string[] } }>; provenance: { criteriaIds: string[] } }, itemId: string | null): { criteriaIds: string[] } {
  if (itemId === null) return spec.provenance;
  const item = [...(spec.blanks ?? []), ...(spec.cards ?? [])].find((i) => i.id === itemId);
  if (!item) throw new ReviewError(`item ${itemId} is not in the promoted revision of this activity`);
  return item.provenance;
}

/** Records a human decision against the activity's promoted revision. Every check names the id it failed on. */
export async function recordReview(store: ImportStore, importId: string, input: ReviewInput, clock: () => Date = () => new Date()): Promise<AcceptanceRecord | AlignmentReviewRecord> {
  const importRecord = await store.getImport(importId);
  if (!importRecord) throw new ReviewError(`import ${importId} is not in this directory`);
  const activity = (await store.listActivities(importId)).find((a) => a.activityId === input.activityId);
  if (!activity) throw new ReviewError(`activity ${input.activityId} is not in import ${importId}`);
  if (activity.currentRevision === null) throw new ReviewError(`activity ${input.activityId} has no promoted revision (status ${activity.status}); only promoted activities can be reviewed`);
  const revision = await store.getRevision(activity.activityId, activity.currentRevision);
  if (!revision) throw new ReviewError(`revision ${activity.currentRevision} of ${input.activityId} is missing from the store`);
  const decidedAt = clock().toISOString();
  if (input.kind === "acceptance") {
    const record: AcceptanceRecord = { importId, activityId: activity.activityId, revision: revision.revision, decision: input.decision, reviewer: input.reviewer, notes: input.notes, decidedAt };
    await store.putAcceptance(record);
    return record;
  }
  const unit = await store.getArtifact<UnitOfCompetency>(importId, "unit");
  if (!unit) throw new ReviewError(`import ${importId} has no unit of competency, so there is no alignment to review`);
  if (!criteriaOf(unit).some((c) => c.id === input.criterionId)) throw new ReviewError(`criterion ${input.criterionId} is not in unit ${unit.code}`);
  const provenance = itemProvenance(revision.spec as Parameters<typeof itemProvenance>[0], input.itemId);
  const earlier = (await store.listAlignmentReviews(importId)).filter((r) => r.activityId === activity.activityId && r.revision === revision.revision && (r.itemId ?? null) === input.itemId);
  const present = provenance.criteriaIds.includes(input.criterionId) || earlier.some((r) => r.criterionId === input.criterionId);
  if (input.decision === "added" && present) throw new ReviewError(`criterion ${input.criterionId} is already mapped on ${input.itemId ?? input.activityId}; use confirmed or rejected`);
  if (input.decision !== "added" && !present) throw new ReviewError(`criterion ${input.criterionId} is not in the mapping of ${input.itemId ?? input.activityId}; use added to attach it`);
  const record: AlignmentReviewRecord = { importId, activityId: activity.activityId, revision: revision.revision, itemId: input.itemId, unitTextHash: importRecord.unitTextHash, criterionId: input.criterionId, decision: input.decision, reviewer: input.reviewer, decidedAt };
  await store.putAlignmentReview(record);
  return record;
}

export interface ReviewArgs { out: string; activity: string; reviewer: string; decision?: AcceptanceDecision; notes?: string; criterion?: string; alignment?: AlignmentDecision; item?: string; }

export async function review(args: ReviewArgs, io: { out: (s: string) => void; err: (s: string) => void }): Promise<number> {
  const outDir = resolve(args.out);
  const store = new FileStore(outDir);
  const importId = importIdFor(outDir);
  const base = { activityId: args.activity, reviewer: args.reviewer };
  const input: ReviewInput = args.decision
    ? { ...base, kind: "acceptance", decision: args.decision, notes: args.notes ?? null }
    : args.criterion && args.alignment
      ? { ...base, kind: "alignment", criterionId: args.criterion, decision: args.alignment, itemId: args.item ?? null }
      : (() => { throw new ReviewError("give either --decision accepted|rejected, or --criterion <id> with --alignment confirmed|rejected|added"); })();
  let lock;
  try { lock = await store.lock(importId); } catch (err) { if (err instanceof StoreLockedError) { io.err(`leap: ${err.message}\n`); return 1; } throw err; }
  try {
    const record = await recordReview(store, importId, input);
    io.out(`recorded ${input.kind} for ${record.activityId} r${record.revision}: ${record.decision}\n`);
    const { rows, report } = await writeReports(store, importId, outDir);
    io.out(`mapping: ${rows} rows → ${resolve(outDir, "mapping.csv")}\n`);
    io.out(formatCostReport(report) + "\n");
    return 0;
  } catch (err) {
    if (err instanceof ReviewError) { io.err(`leap: ${err.message}\n`); return 1; }
    throw err;
  } finally {
    await lock.release();
  }
}
