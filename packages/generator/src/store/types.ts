import type { AcceptanceDecision, ActivitySpec, ActivityStatus, AlignmentDecision, ImportStatus, RevisionState } from "@leaplearn/shared";
import type { SourceKind } from "../ingest/source-document.js";
import type { BudgetLimits } from "../llm/budget.js";
import type { RequestProfile } from "../llm/models.js";
import type { AttemptEvent, AttemptRecorder, Purpose } from "../llm/types.js";
import type { PlannedType } from "../plan/planner.js";

export interface ImportRecord {
  importId: string; orgId: string; name: string; sourceType: SourceKind; status: ImportStatus;
  customisation: string | null; language: string; unitTextHash: string | null; selectedTypes: PlannedType[];
  /** Identity of the inputs and configuration the import was created with (fingerprint.ts); a rerun must match it. Budget limits are not part of it. */
  fingerprint: string;
  budget: BudgetLimits;
  budgetUsed: { spentUsdMicro: number; reservedUsdMicro: number; spentTokens: number; requests: number; elapsedMs: number };
  /** Anchor of a run in progress, persisted before the first dispatch and cleared at the end of the run; a resume that finds it charges the interrupted run's time (reconcileElapsed). */
  currentRun: { startedAt: string; elapsedBeforeMs: number } | null;
  error: string | null; idempotencyKey: string; createdAt: string; updatedAt: string;
}
export interface ActivityRecord {
  activityId: string; importId: string; type: PlannedType; order: number; status: ActivityStatus;
  currentRevision: number | null; conceptIds: string[]; criteriaIds: string[]; error: string | null; dropped: boolean;
}
export interface RevisionRecord {
  activityId: string; revision: number; state: RevisionState; spec: ActivitySpec; schemaVersion: number; promptVersion: string;
  modelConfig: { provider: string; models: Record<string, string>; profiles: Record<string, RequestProfile> }; engineFingerprint: string; note: string | null; buildKey: string | null; attemptIds: string[]; createdAt: string;
}
export interface OperationRecord {
  operationId: string; importId: string; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed";
  idempotencyKey: string; contentAttempts: number; outcome: string | null; billingUncertain: boolean; startedAt: string; completedAt: string | null;
}
/** Spec §4 acceptance_decisions: a human judged the promoted revision good or not. Distinct from promotion. */
export interface AcceptanceRecord { importId: string; activityId: string; revision: number; decision: AcceptanceDecision; reviewer: string; notes: string | null; decidedAt: string; }
/** Spec §4 alignment_reviews, bound to the exact revision (and item). A new revision starts with no reviews. */
export interface AlignmentReviewRecord { importId: string; activityId: string; revision: number; itemId: string | null; unitTextHash: string | null; criterionId: string; decision: AlignmentDecision; reviewer: string; decidedAt: string; }
export type ArtifactName = "source" | "unit" | "conceptMap" | "plan" | `chunk-${number}`;

export interface StoreLock { release(): Promise<void>; }
export class StoreLockedError extends Error {
  constructor(importId: string, holder: string) { super(`import ${importId} is locked by ${holder}; another leap process is using this output directory`); this.name = "StoreLockedError"; }
}

export interface ImportStore {
  lock(importId: string): Promise<StoreLock>;
  getImport(importId: string): Promise<ImportRecord | null>;
  putImport(record: ImportRecord): Promise<void>;
  getArtifact<T>(importId: string, name: ArtifactName): Promise<T | null>;
  putArtifact(importId: string, name: ArtifactName, value: unknown): Promise<void>;
  listActivities(importId: string): Promise<ActivityRecord[]>;
  putActivity(record: ActivityRecord): Promise<void>;
  getRevision(activityId: string, revision: number): Promise<RevisionRecord | null>;
  listRevisions(activityId: string): Promise<RevisionRecord[]>;
  putRevision(record: RevisionRecord): Promise<void>;
  listOperations(importId: string): Promise<OperationRecord[]>;
  putOperation(record: OperationRecord): Promise<void>;
  recorderFor(importId: string): AttemptRecorder;
  listAttempts(importId: string): Promise<AttemptEvent[]>;
  putBuild(importId: string, activityId: string, revision: number, bytes: Buffer): Promise<string>;
  getBuild(buildKey: string): Promise<Buffer | null>;
  listAcceptances(importId: string): Promise<AcceptanceRecord[]>;
  putAcceptance(record: AcceptanceRecord): Promise<void>;
  listAlignmentReviews(importId: string): Promise<AlignmentReviewRecord[]>;
  putAlignmentReview(record: AlignmentReviewRecord): Promise<void>;
}
