import { randomBytes } from "node:crypto";
import { appendFile, link, mkdir, readFile, rename, truncate, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertCurrentLayout, assertSameOriginal, assertWritableStoreVersion, BuildIntegrityError, canonicalRecordJson, sha256Hex, sortBuilds, storeVersionOf, type AcceptanceRecord, type BuildRecord, type ActivityRecord, type AlignmentReviewRecord, type ArtifactName, type AttemptEvent, type AttemptRecorder, type ImportRecord, type ImportStore, type OperationRecord, type OriginalSourceExt, type RevisionRecord, type StoreLock } from "@leaplearn/generator";
import { listIfPresent } from "./list-if-present.js";
import { acquireDirectoryLock, type HeldLock, type LockOptions } from "./lock.js";

export class StoreCorruptError extends Error {
  constructor(public readonly path: string, public readonly line: number, cause: string) { super(`${path}:${line} is not a JSON record (${cause}); the store is corrupt`); this.name = "StoreCorruptError"; }
}

const isEnoent = (err: unknown): boolean => (err as { code?: string }).code === "ENOENT";
const BUILD_KEY = /^builds\/[A-Za-z0-9._-]+\.h5p$/;
const BUILD_ID = /^[0-9a-f]{16}$/;

function checkBuildKey(buildKey: string): void {
  if (!BUILD_KEY.test(buildKey)) throw new Error(`invalid build key ${JSON.stringify(buildKey)}; expected builds/<name>.h5p`);
}
function checkBuildId(buildId: string): void {
  if (!BUILD_ID.test(buildId)) throw new Error(`invalid build id ${JSON.stringify(buildId)}; expected 16 hex characters`);
}
async function readIfPresent(path: string): Promise<Buffer | null> {
  try { return await readFile(path); } catch (err) { if (isEnoent(err)) return null; throw err; }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, path);
}
export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (err) { if (isEnoent(err)) return null; throw err; }
}

/** Reads a JSONL ledger. A final line without a trailing newline that does not parse is a crash-truncated tail and is ignored; any other malformed line means corruption. */
export async function readJsonl<T>(path: string): Promise<{ records: T[]; truncatedTail: boolean }> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch (err) { if (isEnoent(err)) return { records: [], truncatedTail: false }; throw err; }
  const lines = text.split("\n");
  const endedCleanly = text.endsWith("\n") || text.length === 0;
  const records: T[] = [];
  let truncatedTail = false;
  lines.forEach((line, index) => {
    if (line.trim() === "") return;

    try { records.push(JSON.parse(line) as T); } catch (err) {
      if (index === lines.length - 1 && !endedCleanly) { truncatedTail = true; return; }

      throw new StoreCorruptError(path, index + 1, err instanceof Error ? err.message : String(err));
    }
  });
  return { records, truncatedTail };
}

/** Directory-backed ImportStore: JSON files written atomically, JSONL ledgers repaired then appended through one queue per ledger, one directory lock. Every write assumes the caller holds the lock and verifies it before touching the filesystem. */
export class FileStore implements ImportStore {
  private readonly repaired = new Set<string>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private held: HeldLock | null = null;
  constructor(private readonly dir: string, private readonly options: { lock?: LockOptions } = {}) {}
  private p(...parts: string[]): string { return join(this.dir, ...parts); }

  /** The store version of the import in `dir`, or null when there is none; a malformed version throws. Reads only: no lock, no repair, no write. */
  static async storeVersionAt(dir: string): Promise<number | null> {
    const record = await readJson<object>(join(dir, "import.json"));
    return record ? storeVersionOf(record, dir) : null;
  }
  /**
   * Refuses, before any lock or write, a directory whose import is not at the current store version (legacy, newer or
   * malformed), or is at the current version with records from before build records (an obsolete development layout).
   * A directory with no import yet is writable. None of these becomes writable on its own, so this read cannot go
   * stale; the command checks again under the lock.
   */
  static async assertWritableAt(dir: string): Promise<void> {
    const record = await readJson<ImportRecord>(join(dir, "import.json"));
    if (!record) return;

    assertWritableStoreVersion(record, dir);
    await assertCurrentLayout(new FileStore(dir), record.importId, dir);
  }

  async lock(importId: string): Promise<StoreLock> {
    const held = await acquireDirectoryLock(this.dir, importId, this.options.lock ?? {});
    this.held = held;
    return { release: async () => { this.held = null; await held.release(); } };
  }

  /**
   * Runs before every write, ledger or JSON or build: while this store holds the lock, a lock that no longer carries
   * our token stops the write before it touches the filesystem, so a holder whose lock was removed by hand cannot keep
   * writing next to the process that has since taken a fresh one. Unlocked stores stay writable for readers and tools.
   */
  private async assertWritable(): Promise<void> {
    if (this.held) await this.held.assertHeld();
  }
  private async writeJson(path: string, value: unknown): Promise<void> {
    await this.assertWritable();
    await writeJsonAtomic(path, value);
  }

  /**
   * A complete final record that lost its newline gets one; a truncated fragment is cut off. Earlier records are
   * untouched; corruption elsewhere still throws on read. Runs inside the ledger's queue, and the ledger counts as
   * repaired only once this has succeeded. Only the parse decides whether the tail is a fragment: a write error while
   * adding the newline (ENOSPC, EACCES, a lost lock) propagates with the complete, possibly billed record still on disk.
   */
  private async repairTail(path: string): Promise<void> {
    let text: string;
    try { text = await readFile(path, "utf8"); } catch (err) { if (isEnoent(err)) return; throw err; }
    if (text.length === 0 || text.endsWith("\n")) return;

    const cut = text.lastIndexOf("\n") + 1;
    let complete = true;
    try { JSON.parse(text.slice(cut)); } catch { complete = false; }
    if (!complete) { await truncate(path, Buffer.byteLength(text.slice(0, cut))); return; }

    await appendFile(path, "\n");
  }
  getImport(importId: string) { return readJson<ImportRecord>(this.p("import.json")).then((r) => (r && r.importId === importId ? r : null)); }
  putImport(record: ImportRecord) { return this.writeJson(this.p("import.json"), record); }
  getArtifact<T>(_importId: string, name: ArtifactName) { return readJson<T>(this.p("artifacts", `${name}.json`)); }
  putArtifact(_importId: string, name: ArtifactName, value: unknown) { return this.writeJson(this.p("artifacts", `${name}.json`), value); }
  async listActivities(importId: string) {
    const dir = this.p("activities");
    const names = await listIfPresent(dir); // a new import has no activities directory yet
    const all = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => readJson<ActivityRecord>(join(dir, n))));
    return all.filter((a): a is ActivityRecord => a !== null && a.importId === importId).sort((a, b) => a.order - b.order);
  }
  putActivity(record: ActivityRecord) { return this.writeJson(this.p("activities", `${record.activityId}.json`), record); }
  getRevision(activityId: string, revision: number) { return readJson<RevisionRecord>(this.p("revisions", activityId, `r${revision}.json`)); }
  async listRevisions(activityId: string) {
    const dir = this.p("revisions", activityId);
    const names = await listIfPresent(dir); // an activity may have no revisions yet
    const all = await Promise.all(names.filter((n) => /^r\d+\.json$/.test(n)).map((n) => readJson<RevisionRecord>(join(dir, n))));
    return all.filter((r): r is RevisionRecord => r !== null).sort((a, b) => a.revision - b.revision);
  }
  putRevision(record: RevisionRecord) { return this.writeJson(this.p("revisions", record.activityId, `r${record.revision}.json`), record); }
  /** Repair, corruption check and append run strictly one at a time per ledger: a lane can never truncate to a snapshot taken before another lane's append. */
  private append(file: string, value: unknown): Promise<void> {
    const path = this.p(file);
    const previous = this.queues.get(path) ?? Promise.resolve();
    const task = previous.then(() => this.appendNow(path, value), () => this.appendNow(path, value));
    this.queues.set(path, task);
    return task;
  }
  private async appendNow(path: string, value: unknown): Promise<void> {
    await this.assertWritable();
    await mkdir(this.dir, { recursive: true });
    if (!this.repaired.has(path)) { await this.repairTail(path); this.repaired.add(path); }
    await readJsonl(path); // a malformed line elsewhere is corruption: refuse to append to it
    await appendFile(path, JSON.stringify(value) + "\n");
  }
  async listOperations(importId: string) {
    const latest = new Map<string, OperationRecord>();
    for (const o of (await readJsonl<OperationRecord>(this.p("operations.jsonl"))).records) if (o.importId === importId) latest.set(o.operationId, o);
    return [...latest.values()];
  }
  putOperation(record: OperationRecord) { return this.append("operations.jsonl", record); }
  recorderFor(_importId: string): AttemptRecorder {
    const append = (e: AttemptEvent): Promise<void> => this.append("attempts.jsonl", e);
    return { recordStart: append, recordOutcome: append };
  }
  async listAttempts(_importId: string) { return (await readJsonl<AttemptEvent>(this.p("attempts.jsonl"))).records; }
  /**
   * Writes `bytes` at `path` only if nothing is there: the temp file is hard-linked into place, which fails rather than
   * replacing an existing file. Content that `same` judges equal to what is already there is a no-op (the file is not
   * touched); anything else throws BuildIntegrityError naming `label` and both hashes.
   */
  private async putImmutable(path: string, bytes: Buffer, label: string, same: (existing: Buffer) => boolean, hashOf: (b: Buffer) => string): Promise<void> {
    await this.assertWritable();
    const refuseUnlessSame = (existing: Buffer): void => { if (!same(existing)) throw new BuildIntegrityError(label, hashOf(existing), hashOf(bytes)); };
    const existing = await readIfPresent(path);
    if (existing) { refuseUnlessSame(existing); return; }

    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${randomBytes(4).toString("hex")}`;
    await writeFile(tmp, bytes);
    try {
      await link(tmp, path);
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
      refuseUnlessSame(await readFile(path));
    } finally {
      await unlink(tmp);
    }
  }
  async putBuild(buildKey: string, bytes: Buffer) {
    checkBuildKey(buildKey);
    await this.putImmutable(this.p(buildKey), bytes, buildKey, (existing) => existing.equals(bytes), sha256Hex);
  }
  async getBuild(buildKey: string) { checkBuildKey(buildKey); return readIfPresent(this.p(buildKey)); }
  /** The original bytes live at source/original.docx or source/original.odt, written once through putImmutable. */
  async putOriginalSource(importId: string, ext: OriginalSourceExt, bytes: Buffer) {
    const existing = await this.getOriginalSource(importId);
    if (existing) { assertSameOriginal(importId, existing, ext, bytes); return; }
    try {
      await this.putImmutable(this.p("source", `original${ext}`), bytes, `source/original${ext}`, (b) => b.equals(bytes), sha256Hex);
    } catch (err) {
      if (!(err instanceof BuildIntegrityError)) throw err;
      assertSameOriginal(importId, (await this.getOriginalSource(importId))!, ext, bytes);
    }
  }
  async getOriginalSource(_importId: string) {
    for (const ext of [".docx", ".odt"] as const) { const bytes = await readIfPresent(this.p("source", `original${ext}`)); if (bytes) return { ext, bytes }; }
    return null;
  }
  async putBuildRecord(record: BuildRecord) {
    checkBuildId(record.buildId);
    const canonical = canonicalRecordJson(record);
    const recordHash = (b: Buffer): string => sha256Hex(canonicalRecordJson(JSON.parse(b.toString("utf8"))));
    await this.putImmutable(this.p("builds", "records", `${record.buildId}.json`), Buffer.from(JSON.stringify(record, null, 2) + "\n"), `build record ${record.buildId}`, (existing) => canonicalRecordJson(JSON.parse(existing.toString("utf8"))) === canonical, recordHash);
  }
  getBuildRecord(buildId: string) { checkBuildId(buildId); return readJson<BuildRecord>(this.p("builds", "records", `${buildId}.json`)); }
  async listBuilds(activityId: string) {
    const dir = this.p("builds", "records");
    const names = await listIfPresent(dir); // no build yet
    const all = await Promise.all(names.filter((n) => /^[0-9a-f]{16}\.json$/.test(n)).map((n) => readJson<BuildRecord>(join(dir, n))));
    return sortBuilds(all.filter((r): r is BuildRecord => r !== null && r.activityId === activityId));
  }
  async listAcceptances(importId: string) {
    const latest = new Map<string, AcceptanceRecord>();
    for (const a of (await readJsonl<AcceptanceRecord>(this.p("acceptances.jsonl"))).records) if (a.importId === importId) latest.set(`${a.activityId}/${a.revision}`, a);
    return [...latest.values()];
  }
  putAcceptance(record: AcceptanceRecord) { return this.append("acceptances.jsonl", record); }
  async listAlignmentReviews(importId: string) {
    const latest = new Map<string, AlignmentReviewRecord>();
    for (const r of (await readJsonl<AlignmentReviewRecord>(this.p("alignment-reviews.jsonl"))).records) if (r.importId === importId) latest.set(`${r.activityId}/${r.revision}/${r.itemId ?? ""}/${r.criterionId}`, r);
    return [...latest.values()];
  }
  putAlignmentReview(record: AlignmentReviewRecord) { return this.append("alignment-reviews.jsonl", record); }
}
