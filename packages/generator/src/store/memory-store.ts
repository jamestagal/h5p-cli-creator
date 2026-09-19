import type { AttemptEvent, AttemptRecorder } from "../llm/types.js";
import { StoreLockedError, type AcceptanceRecord, type ActivityRecord, type AlignmentReviewRecord, type ArtifactName, type ImportRecord, type ImportStore, type OperationRecord, type RevisionRecord, type StoreLock } from "./types.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const reviewKey = (r: AlignmentReviewRecord): string => `${r.activityId}/${r.revision}/${r.itemId ?? ""}/${r.criterionId}`;

export class MemoryStore implements ImportStore {
  private imports = new Map<string, ImportRecord>();
  private artifacts = new Map<string, unknown>();
  private activities = new Map<string, ActivityRecord>();
  private revisions = new Map<string, RevisionRecord>();
  private operations = new Map<string, OperationRecord>();
  private attempts = new Map<string, AttemptEvent[]>();
  private builds = new Map<string, Buffer>();
  private acceptances = new Map<string, AcceptanceRecord>();
  private alignmentReviews = new Map<string, AlignmentReviewRecord>();
  private locks = new Set<string>();

  async lock(importId: string): Promise<StoreLock> {
    if (this.locks.has(importId)) throw new StoreLockedError(importId, "this process");
    this.locks.add(importId);
    return { release: async () => { this.locks.delete(importId); } };
  }
  async getImport(importId: string) { const r = this.imports.get(importId); return r ? clone(r) : null; }
  async putImport(record: ImportRecord) { this.imports.set(record.importId, clone(record)); }
  async getArtifact<T>(importId: string, name: ArtifactName) { const v = this.artifacts.get(`${importId}/${name}`); return v === undefined ? null : clone(v as T); }
  async putArtifact(importId: string, name: ArtifactName, value: unknown) { this.artifacts.set(`${importId}/${name}`, clone(value)); }
  async listActivities(importId: string) { return [...this.activities.values()].filter((a) => a.importId === importId).sort((a, b) => a.order - b.order).map(clone); }
  async putActivity(record: ActivityRecord) { this.activities.set(record.activityId, clone(record)); }
  async getRevision(activityId: string, revision: number) { const r = this.revisions.get(`${activityId}/${revision}`); return r ? clone(r) : null; }
  async listRevisions(activityId: string) { return [...this.revisions.values()].filter((r) => r.activityId === activityId).sort((a, b) => a.revision - b.revision).map(clone); }
  async putRevision(record: RevisionRecord) { this.revisions.set(`${record.activityId}/${record.revision}`, clone(record)); }
  async listOperations(importId: string) { return [...this.operations.values()].filter((o) => o.importId === importId).map(clone); }
  async putOperation(record: OperationRecord) { this.operations.set(record.operationId, clone(record)); }
  recorderFor(importId: string): AttemptRecorder {
    const list = this.attempts.get(importId) ?? []; this.attempts.set(importId, list);
    return { recordStart: async (s) => { list.push(clone(s)); }, recordOutcome: async (o) => { list.push(clone(o)); } };
  }
  async listAttempts(importId: string) { return clone(this.attempts.get(importId) ?? []); }
  async putBuild(importId: string, activityId: string, revision: number, bytes: Buffer) { const key = `${importId}/${activityId}/r${revision}.h5p`; this.builds.set(key, Buffer.from(bytes)); return key; }
  async getBuild(buildKey: string) { const b = this.builds.get(buildKey); return b ? Buffer.from(b) : null; }
  async listAcceptances(importId: string) { return [...this.acceptances.values()].filter((a) => a.importId === importId).map(clone); }
  async putAcceptance(record: AcceptanceRecord) { this.acceptances.set(`${record.activityId}/${record.revision}`, clone(record)); }
  async listAlignmentReviews(importId: string) { return [...this.alignmentReviews.values()].filter((a) => a.importId === importId).map(clone); }
  async putAlignmentReview(record: AlignmentReviewRecord) { this.alignmentReviews.set(reviewKey(record), clone(record)); }
}
