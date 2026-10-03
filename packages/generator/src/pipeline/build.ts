import { compileToBuffer, type EngineIdentity, type LibraryRegistry } from "@leaplearn/engine";
import { buildIdFor, buildKeyFor, sha256Hex } from "../store/builds.js";
import { BuildArtifactError, type BuildRecord, type ImportStore, type RevisionRecord } from "../store/types.js";

export interface BuildDeps { store: ImportStore; registry: LibraryRegistry; engineIdentity: EngineIdentity; clock?: () => Date }

/**
 * Builds `revision` under `deps.engineIdentity` and records it, stamping the identity of the engine that builds it.
 * If this engine already built this revision, the existing record is returned, and nothing is written, only once its bytes
 * are present and match its sha256 and byteLength; otherwise BuildArtifactError. Bytes are written
 * before their record, so a record always names bytes that exist; neither is ever overwritten (the store refuses).
 * It does not change which build the revision points to: the caller does that.
 */
export async function buildRevision(deps: BuildDeps, importId: string, revision: RevisionRecord): Promise<BuildRecord> {
  const identity = deps.engineIdentity;
  const buildId = buildIdFor(revision.activityId, revision.revision, identity.fingerprint);
  const buildKey = buildKeyFor(revision.activityId, revision.revision, identity.fingerprint);
  const existing = await deps.store.getBuildRecord(buildId);
  if (existing) return verifiedBuild(deps.store, existing, buildKey);

  const bytes = await compileToBuffer(revision.spec, new Map(), { registry: deps.registry, revision: revision.revision });
  await deps.store.putBuild(buildKey, bytes);
  const record: BuildRecord = {
    importId, activityId: revision.activityId, revision: revision.revision, buildId, buildKey, sha256: sha256Hex(bytes), byteLength: bytes.byteLength,
    engineFingerprint: identity.fingerprint, engineDisplay: identity.display, engineInputs: identity.inputs, nodeVersion: identity.nodeVersion,
    builtAt: (deps.clock ?? (() => new Date()))().toISOString()
  };
  await deps.store.putBuildRecord(record);
  return record;
}

/**
 * The build a promoted revision already points to, checked without rebuilding or writing anything: its record exists
 * and belongs to this import, activity and revision under its own buildId and key, and its package bytes exist with
 * the recorded length and hash. Otherwise BuildArtifactError (or a plain error when there is no record to name).
 */
export async function verifyCurrentBuild(store: ImportStore, importId: string, revision: RevisionRecord): Promise<BuildRecord> {
  const where = `${revision.activityId} revision ${revision.revision}`;
  if (revision.currentBuildId === null) throw new Error(`${where} has no current build`);
  const record = await store.getBuildRecord(revision.currentBuildId);
  if (!record) throw new Error(`${where} points at build ${revision.currentBuildId}, whose build record is missing`);
  const owner = [record.importId === importId ? null : `import ${record.importId}`, record.activityId === revision.activityId ? null : `activity ${record.activityId}`, record.revision === revision.revision ? null : `revision ${record.revision}`, record.buildId === revision.currentBuildId ? null : `build ${record.buildId}`].filter((x) => x !== null);
  if (owner.length > 0) throw new BuildArtifactError(record, `it belongs to ${owner.join(", ")}, not to ${where} of import ${importId}`);
  return verifiedBuild(store, record, buildKeyFor(record.activityId, record.revision, record.engineFingerprint));
}

/** An existing build record, returned only if its key is the expected one and its bytes exist with its recorded length and hash. */
async function verifiedBuild(store: ImportStore, record: BuildRecord, expectedKey: string): Promise<BuildRecord> {
  if (record.buildKey !== expectedKey) throw new BuildArtifactError(record, `the record names ${record.buildKey}, but this revision and engine build to ${expectedKey}`);
  const bytes = await store.getBuild(record.buildKey);
  if (bytes === null) throw new BuildArtifactError(record, "its package file is missing");
  if (bytes.byteLength !== record.byteLength) throw new BuildArtifactError(record, `its package file is ${bytes.byteLength} bytes, but the record says ${record.byteLength}`);
  const actual = sha256Hex(bytes);
  if (actual !== record.sha256) throw new BuildArtifactError(record, `its package file has sha256 ${actual}, but the record says ${record.sha256}`);

  return record;
}
