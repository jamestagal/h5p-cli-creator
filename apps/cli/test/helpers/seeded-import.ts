import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../../src/file-store.js";
import { importIdFor } from "../../src/generate.js";

/** An import directory with one promoted, built multiChoice activity and a unit. */
export async function seededDir(): Promise<{ dir: string; store: FileStore; importId: string }> {
  const dir = join(await mkdtemp(join(tmpdir(), "leap-sheet-")), "imp");
  const store = new FileStore(dir); const importId = importIdFor(dir);
  await store.putImport({ storeVersion: 2, importId, orgId: "local", name: "n", sourceType: "markdown", status: "ready", customisation: null, language: "en", unitTextHash: "u".repeat(64), selectedTypes: ["multiChoice"], fingerprint: "f".repeat(64), budget: { usdMicro: 1, requests: 1, tokens: 1, elapsedMs: 1 }, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: importId, createdAt: "t", updatedAt: "t" });
  await store.putArtifact(importId, "unit", { code: "SYNELE001", title: "Isolate and test electrical equipment", release: "Release 1", assessmentConditions: null, textHash: "u".repeat(64), knowledgeEvidence: [], performanceEvidence: [], elements: [{ id: "E2", number: "2", text: "Isolate and secure equipment", performanceCriteria: [{ id: "PC2.1", number: "2.1", text: "Apply lockout devices and tags" }] }] });
  await store.putArtifact(importId, "source", { sourceId: "src", kind: "markdown", text: "Lock it out.", textHash: "s".repeat(64), sentences: [{ sentenceId: "s1", charStart: 0, charEnd: 12, text: "Lock it out." }], metadata: { characters: 12, codePoints: 12, extractionVersion: "x" } });
  await store.putArtifact(importId, "conceptMap", { sourceId: "src", textHash: "s".repeat(64), concepts: [{ conceptId: "c1", kind: "content", name: "Lockout", summary: "Lock it out.", evidence: [{ evidenceId: "ev-s1", sentenceId: "s1", charStart: 0, charEnd: 12, quote: "Lock it out." }] }] });
  await store.putActivity({ activityId: "act-1", importId, type: "multiChoice", order: 0, status: "promoted", currentRevision: 1, conceptIds: ["c1"], criteriaIds: ["PC2.1"], error: null, dropped: false, unitTextHash: "u".repeat(64) });
  await store.putRevision({ activityId: "act-1", revision: 1, state: "promoted", spec: { id: "act-1", title: "Locks", type: "multiChoice", language: "en", schemaVersion: 1, question: "Who removes a lock?", answers: [{ text: "The worker who applied it", correct: true }, { text: "Anyone", correct: false }], randomAnswers: true, provenance: { conceptIds: ["c1"], evidenceIds: ["ev-s1"], criteriaIds: ["PC2.1"] } }, schemaVersion: 1, promptVersion: "p", origin: "generate", requestId: null, modelConfig: { provider: "fake", models: {}, profiles: {} }, note: null, currentBuildId: "0123456789abcdef", attemptIds: [], createdAt: "t" });
  await store.putBuildRecord({ importId, activityId: "act-1", revision: 1, buildId: "0123456789abcdef", buildKey: "builds/act-1-r1-abc.h5p", sha256: "0".repeat(64), byteLength: 1, engineFingerprint: "e".repeat(64), engineDisplay: "engine", engineInputs: { engineDist: [], workspaceDist: [], librariesLockSha256: "1".repeat(64), zlib: "1.3.1" }, nodeVersion: "20.20.2", builtAt: "t" });
  return { dir, store, importId };
}

