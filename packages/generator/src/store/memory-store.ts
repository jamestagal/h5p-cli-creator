import type { AttemptEvent, AttemptRecorder } from "../llm/types.js";
import { canonicalRecordJson, latestAcceptances, latestRegenerations, sameSheet, sha256Hex, sortBatches, sortBuilds, sortSheets } from "./builds.js";
import { replayCommittedBatches } from "../review/batches.js";
import { assertSameOriginal } from "./originals.js";
import { BuildIntegrityError, SheetIntegrityError, StoreLockedError, type AcceptanceRecord, type RegenerationRequest, type ReviewBatch, type ScoreRecord, type SheetManifest, type BuildRecord, type ActivityRecord, type AlignmentReviewRecord, type ArtifactName, type ImportRecord, type ImportStore, type OperationRecord, type OriginalSourceExt, type RevisionRecord, type StoreLock } from "./types.js";

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
  private buildRecords = new Map<string, BuildRecord>();
  private originals = new Map<string, { ext: OriginalSourceExt; bytes: Buffer }>();
  private acceptances: AcceptanceRecord[] = [];
  private batches: ReviewBatch[] = [];
  private regenerations: RegenerationRequest[] = [];
  private sheets = new Map<string, SheetManifest>();
  private scores: ScoreRecord[] = [];
  private alignmentReviews = new Map<string, AlignmentReviewRecord>();
  private locks = new Set<string>();

  async lock(importId: string): Promise<StoreLock> {
    if (this.locks.has(importId)) throw new StoreLockedError(importId, "this process");
    this.locks.add(importId);
    const release = async (): Promise<void> => { this.locks.delete(importId); };
    try { await replayCommittedBatches(this, importId); } catch (err) { await release(); throw err; }
    return { release };
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
  async putBuild(buildKey: string, bytes: Buffer) {
    const existing = this.builds.get(buildKey);
    if (existing) { if (!existing.equals(bytes)) throw new BuildIntegrityError(buildKey, sha256Hex(existing), sha256Hex(bytes)); return; }
    this.builds.set(buildKey, Buffer.from(bytes));
  }
  async getBuild(buildKey: string) { const b = this.builds.get(buildKey); return b ? Buffer.from(b) : null; }
  async putOriginalSource(importId: string, ext: OriginalSourceExt, bytes: Buffer) {
    const existing = this.originals.get(importId);
    if (existing) { assertSameOriginal(importId, existing, ext, bytes); return; }
    this.originals.set(importId, { ext, bytes: Buffer.from(bytes) });
  }
  async getOriginalSource(importId: string) { const o = this.originals.get(importId); return o ? { ext: o.ext, bytes: Buffer.from(o.bytes) } : null; }
  async putBuildRecord(record: BuildRecord) {
    const existing = this.buildRecords.get(record.buildId);
    const text = canonicalRecordJson(record);
    if (existing) { const before = canonicalRecordJson(existing); if (before !== text) throw new BuildIntegrityError(`build record ${record.buildId}`, sha256Hex(before), sha256Hex(text)); return; }
    this.buildRecords.set(record.buildId, clone(record));
  }
  async getBuildRecord(buildId: string) { const r = this.buildRecords.get(buildId); return r ? clone(r) : null; }
  async listBuilds(activityId: string) { return sortBuilds([...this.buildRecords.values()].filter((r) => r.activityId === activityId).map(clone)); }
  async listAcceptances(importId: string) { return latestAcceptances(this.acceptances.filter((a) => a.importId === importId)).map(clone); }
  async listAcceptanceRecords(importId: string) { return this.acceptances.filter((a) => a.importId === importId).map(clone); }
  async putAcceptance(record: AcceptanceRecord) { this.acceptances.push(clone(record)); }
  async putSheet(manifest: SheetManifest) {
    const key = `${manifest.importId}/${manifest.sheetId}`;
    const existing = this.sheets.get(key);
    if (existing) {
      if (!sameSheet(existing, manifest)) throw new SheetIntegrityError(manifest.sheetId);
      return false;
    }
    this.sheets.set(key, clone(manifest));
    return true;
  }
  async getSheet(importId: string, sheetId: string) { const m = this.sheets.get(`${importId}/${sheetId}`); return m ? clone(m) : null; }
  async listSheets(importId: string) { return sortSheets([...this.sheets.values()].filter((m) => m.importId === importId).map(clone)); }
  async putScore(record: ScoreRecord) { this.scores.push(clone(record)); }
  async listScores(importId: string) { return this.scores.filter((r) => r.importId === importId).map(clone); }
  async commitBatch(batch: ReviewBatch) {
    if (this.batches.some((b) => b.importId === batch.importId && b.batchId === batch.batchId)) return false;
    this.batches.push(clone(batch));
    return true;
  }
  async putRegeneration(record: RegenerationRequest) { this.regenerations.push(clone(record)); }
  async listRegenerations(importId: string) { return latestRegenerations(this.regenerations.filter((r) => r.importId === importId)).map(clone); }
  async listBatches(importId: string) { return sortBatches(this.batches.filter((b) => b.importId === importId).map(clone)); }
  async listAlignmentReviews(importId: string) { return [...this.alignmentReviews.values()].filter((a) => a.importId === importId).map(clone); }
  async putAlignmentReview(record: AlignmentReviewRecord) { this.alignmentReviews.set(reviewKey(record), clone(record)); }
}
