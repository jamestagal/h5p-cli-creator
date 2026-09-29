import type { EngineIdentityInputs } from "@leaplearn/engine";
import type { AcceptanceDecision, ActivitySpec, ActivityStatus, AlignmentDecision, ImportStatus, RevisionState } from "@leaplearn/shared";
import type { SourceKind } from "../ingest/source-document.js";
import type { BudgetLimits } from "../llm/budget.js";
import type { RequestProfile } from "../llm/models.js";
import type { AttemptEvent, AttemptRecorder, Purpose } from "../llm/types.js";
import type { PlannedType } from "../plan/planner.js";

/** Store layout version written by this code. Version 1 (phase 2) wrote no `storeVersion`; its directories are read-only from phase 3 on. */
export const STORE_VERSION = 2;

export interface ImportRecord {
  /** Absent on phase-2 (version 1) imports; `storeVersionOf` reads it. */
  storeVersion?: number;
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
/** Which command produced a revision: the first pass (`generate`) or a reviewer-requested regeneration. */
export type RevisionOrigin = "generate" | "regenerate";
/** Which command an operation, and every attempt it dispatches, serves. Stages shared by every activity (parseUnit, extract, merge, align, plan) are `shared`. */
export type OperationOrigin = RevisionOrigin | "shared";
export interface RevisionRecord {
  activityId: string; revision: number; state: RevisionState; spec: ActivitySpec; schemaVersion: number; promptVersion: string;
  origin: RevisionOrigin; requestId: string | null;
  modelConfig: { provider: string; models: Record<string, string>; profiles: Record<string, RequestProfile> }; note: string | null;
  /** The build this revision currently points to (a BuildRecord's buildId); null until it is first built. Earlier builds stay in the store. */
  currentBuildId: string | null;
  attemptIds: string[]; createdAt: string;
}
/**
 * One build of one revision by one engine: immutable once written. `buildId` and `buildKey` derive from the activity,
 * revision and engine fingerprint (store/builds.ts), so building the same revision under another engine adds a record
 * and never replaces one. The engine identity is stamped when the revision is built, not when it is produced.
 */
export interface BuildRecord {
  importId: string; activityId: string; revision: number; buildId: string; buildKey: string; sha256: string; byteLength: number;
  engineFingerprint: string; engineDisplay: string; engineInputs: EngineIdentityInputs;
  /** Recorded for diagnosis; not part of the fingerprint. */
  nodeVersion: string;
  builtAt: string;
}
export interface OperationRecord {
  operationId: string; importId: string; activityId: string | null; purpose: Purpose | "build"; status: "running" | "succeeded" | "failed";
  /** Written when the operation starts, before any dispatch. */
  origin: OperationOrigin; requestId: string | null;
  idempotencyKey: string; contentAttempts: number; outcome: string | null; billingUncertain: boolean; startedAt: string; completedAt: string | null;
}
/** Spec §4 acceptance_decisions: a human judged the promoted revision good or not. Distinct from promotion. */
export interface AcceptanceRecord { importId: string; activityId: string; revision: number; decision: AcceptanceDecision; reviewer: string; notes: string | null; decidedAt: string; }
/** Spec §4 alignment_reviews, bound to the exact revision (and item). A new revision starts with no reviews. */
export interface AlignmentReviewRecord { importId: string; activityId: string; revision: number; itemId: string | null; unitTextHash: string | null; criterionId: string; decision: AlignmentDecision; reviewer: string; decidedAt: string; }
export type ArtifactName = "source" | "unit" | "conceptMap" | "plan" | `chunk-${number}`;

/**
 * The store version of an import record as parsed from disk, where the TypeScript type is not enforced. An absent
 * version is a phase-2 (version 1) import. A present version must be a positive integer; anything else ("2", "bogus",
 * {}, null, 2.5, 0) is refused rather than coerced, so no malformed record is ever treated as writable.
 */
export function storeVersionOf(record: object, where: string): number {
  const raw: unknown = (record as { storeVersion?: unknown }).storeVersion;
  if (raw === undefined) return 1;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) throw new MalformedStoreVersionError(where, raw);
  return raw;
}

/** A phase-2 import directory: kept exactly as it is, never written by phase-3 commands. */
export class LegacyStoreError extends Error {
  constructor(where: string) {
    super(`${where} was created by phase 2 (store version 1). It is kept unchanged and is read-only. Use a new output directory for phase-3 commands.`);
    this.name = "LegacyStoreError";
  }
}
export class MalformedStoreVersionError extends Error {
  constructor(where: string, raw: unknown) {
    let shown: string;
    try { shown = JSON.stringify(raw) ?? String(raw); } catch { shown = String(raw); }
    super(`${where} has a malformed storeVersion (${shown}); it must be a positive integer, or absent for a phase-2 import. The directory is left unchanged.`);
    this.name = "MalformedStoreVersionError";
  }
}
export class UnsupportedStoreVersionError extends Error {
  constructor(where: string, version: number) { super(`${where} has store version ${version}, which this build does not know (it writes version ${STORE_VERSION}); use a matching build of leap`); this.name = "UnsupportedStoreVersionError"; }
}
/** The refusals a store-version check can raise; commands report them as a plain message and exit 1. */
export function isStoreVersionError(err: unknown): err is LegacyStoreError | UnsupportedStoreVersionError | MalformedStoreVersionError {
  return err instanceof LegacyStoreError || err instanceof UnsupportedStoreVersionError || err instanceof MalformedStoreVersionError;
}
/** Refuses any write to an import that is not at the current store version, including a malformed one. Callers run it under the import's lock, before their first write. */
export function assertWritableStoreVersion(record: object, where: string): void {
  const version = storeVersionOf(record, where);
  if (version < STORE_VERSION) throw new LegacyStoreError(where);
  if (version > STORE_VERSION) throw new UnsupportedStoreVersionError(where, version);
}

/** A build key or build record that already exists with different content: builds are never overwritten. */
export class BuildIntegrityError extends Error {
  constructor(key: string, existingSha256: string, newSha256: string) {
    super(`${key} already exists with sha256 ${existingSha256}; refusing to overwrite it with different content (sha256 ${newSha256}). Builds are immutable.`);
    this.name = "BuildIntegrityError";
  }
}

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
  /** Writes build bytes under `buildKey`. The same bytes again are a no-op; different bytes throw BuildIntegrityError. Never overwrites. */
  putBuild(buildKey: string, bytes: Buffer): Promise<void>;
  getBuild(buildKey: string): Promise<Buffer | null>;
  /** Writes a build record. The same record again is a no-op; a different record under the same buildId throws BuildIntegrityError. */
  putBuildRecord(record: BuildRecord): Promise<void>;
  getBuildRecord(buildId: string): Promise<BuildRecord | null>;
  /** Every build record of an activity, by revision then builtAt. */
  listBuilds(activityId: string): Promise<BuildRecord[]>;
  listAcceptances(importId: string): Promise<AcceptanceRecord[]>;
  putAcceptance(record: AcceptanceRecord): Promise<void>;
  listAlignmentReviews(importId: string): Promise<AlignmentReviewRecord[]>;
  putAlignmentReview(record: AlignmentReviewRecord): Promise<void>;
}
