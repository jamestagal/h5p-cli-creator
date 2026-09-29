import { compileToBuffer, type EngineIdentity, type LibraryRegistry } from "@leaplearn/engine";
import { buildIdFor, buildKeyFor, sha256Hex } from "../store/builds.js";
import type { BuildRecord, ImportStore, RevisionRecord } from "../store/types.js";

export interface BuildDeps { store: ImportStore; registry: LibraryRegistry; engineIdentity: EngineIdentity; clock?: () => Date }

/**
 * Builds `revision` under `deps.engineIdentity` and records it, stamping the identity of the engine that builds it.
 * If this engine already built this revision, the existing record is returned and nothing is written. Bytes are written
 * before their record, so a record always names bytes that exist; neither is ever overwritten (the store refuses).
 * It does not change which build the revision points to: the caller does that.
 */
export async function buildRevision(deps: BuildDeps, importId: string, revision: RevisionRecord): Promise<BuildRecord> {
  const identity = deps.engineIdentity;
  const buildId = buildIdFor(revision.activityId, revision.revision, identity.fingerprint);
  const existing = await deps.store.getBuildRecord(buildId);
  if (existing) return existing;

  const bytes = await compileToBuffer(revision.spec, new Map(), { registry: deps.registry, revision: revision.revision });
  const buildKey = buildKeyFor(revision.activityId, revision.revision, identity.fingerprint);
  await deps.store.putBuild(buildKey, bytes);
  const record: BuildRecord = {
    importId, activityId: revision.activityId, revision: revision.revision, buildId, buildKey, sha256: sha256Hex(bytes), byteLength: bytes.byteLength,
    engineFingerprint: identity.fingerprint, engineDisplay: identity.display, engineInputs: identity.inputs, nodeVersion: identity.nodeVersion,
    builtAt: (deps.clock ?? (() => new Date()))().toISOString()
  };
  await deps.store.putBuildRecord(record);
  return record;
}
