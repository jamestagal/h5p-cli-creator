import { STORE_VERSION, storeVersionOf, type AcceptanceRecord, type ImportStore, type ReviewBatch, type ScoreRecord } from "../store/types.js";

/** The acceptance record a committed row implies: its derived decision, tagged with the batch position (R8). */
export function acceptanceFor(batch: ReviewBatch, row: ScoreRecord): AcceptanceRecord {
  return {
    importId: row.importId, activityId: row.activityId, revision: row.revision, decision: row.decision, reviewer: row.reviewer, notes: null, decidedAt: row.decidedAt,
    batchId: batch.batchId, sequence: batch.sequence, rowIndex: row.rowIndex, scoreRowKey: row.rowKey, buildId: row.buildId
  };
}

/**
 * Appends, in batch order, every score and acceptance record of `batches` that the ledgers lack, keyed by
 * `(batchId, rowKey)`. Idempotent: records already there are never appended twice. Returns how many were appended.
 */
export async function appendMissingRecords(store: ImportStore, importId: string, batches: ReviewBatch[], options: ReplayOptions = {}): Promise<{ scores: number; acceptances: number }> {
  const haveScores = new Set((await store.listScores(importId)).map((s) => `${s.batchId}/${s.rowKey}`));
  const haveAcceptances = new Set((await store.listAcceptanceRecords(importId)).filter((a) => a.batchId !== undefined).map((a) => `${a.batchId}/${a.scoreRowKey}`));
  let scores = 0; let acceptances = 0; let announced = false;
  const announce = async (): Promise<void> => { if (!announced) { announced = true; await options.beforeAppend?.(); } };
  for (const batch of [...batches].sort((a, b) => a.sequence - b.sequence)) {
    for (const row of batch.rows) {
      const key = `${batch.batchId}/${row.rowKey}`;
      if (!haveScores.has(key)) { await announce(); await store.putScore(row); haveScores.add(key); scores += 1; }
      if (!haveAcceptances.has(key)) { await announce(); await store.putAcceptance(acceptanceFor(batch, row)); haveAcceptances.add(key); acceptances += 1; }
    }
  }
  return { scores, acceptances };
}

/**
 * Recovery (design §7.3, R8): a crash between a batch's rename and its ledger appends leaves a committed batch whose
 * records are missing. Every lock acquisition on a version-2 import replays committed batches in ascending sequence and
 * appends what is missing. Other imports (absent, phase-2, malformed version) are left to the commands' own checks.
 */
export interface ReplayOptions {
  /** Runs once, before the first record is appended, and never when nothing is missing: a store records there that the reports derived from these ledgers must be rewritten, so the need survives a failure after the appends. */
  beforeAppend?: () => Promise<void>;
}

export async function replayCommittedBatches(store: ImportStore, importId: string, options: ReplayOptions = {}): Promise<{ scores: number; acceptances: number }> {
  const record = await store.getImport(importId);
  if (!record) return { scores: 0, acceptances: 0 };
  let version: number;
  try { version = storeVersionOf(record, `import ${importId}`); } catch { return { scores: 0, acceptances: 0 }; }
  if (version !== STORE_VERSION) return { scores: 0, acceptances: 0 };
  return appendMissingRecords(store, importId, await store.listBatches(importId), options);
}
