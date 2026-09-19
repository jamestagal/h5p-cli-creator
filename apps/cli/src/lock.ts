import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { StoreLockedError, type StoreLock } from "@leaplearn/generator";

export interface LockOwner { importId: string; token: string; pid: number; hostname: string; startedAt: string; }
export interface LockHooks { afterInspect?: (owner: LockOwner) => Promise<void>; }
export interface LockOptions { hooks?: LockHooks; graceMs?: number; }
export interface HeldLock extends StoreLock { readonly token: string; assertHeld(): Promise<void>; }
export class LockLostError extends Error { constructor(dir: string) { super(`the lock on ${dir} is no longer held by this process; stopping before writing`); this.name = "LockLostError"; } }

const isCode = (err: unknown, code: string): boolean => (err as { code?: string }).code === code;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (err) { return isCode(err, "EPERM"); } }
async function readOwner(path: string): Promise<LockOwner | null> { try { return JSON.parse(await readFile(path, "utf8")) as LockOwner; } catch { return null; } }

/**
 * Directory lock with dead-owner reclamation only. `mkdir` is atomic, so only one process ever creates `lock/`.
 * A live local pid is never reclaimed, whatever the lock's age: a paused process is still the owner. A dead local
 * pid's lock is reclaimed by renaming it to a tombstone named by the dead owner's token. Tombstones are never removed
 * by this code (rename keeps the old directory's mtime, so any age-based cleanup could delete a tombstone that is still
 * shielding a paused reclaimer): they stay until a person removes `lock.stale-*` while no leap process is running.
 * Two reclaimers of the same dead lock therefore always target the same, still-present tombstone: the second rename
 * fails (the target exists, or the source is gone) and can never move a lock created after that reclaimer's inspection.
 * Release removes the directory only while owner.json still carries this holder's token; assertHeld detects a lock
 * removed from under us.
 */
export async function acquireDirectoryLock(dir: string, importId: string, options: LockOptions = {}): Promise<HeldLock> {
  const lockDir = join(dir, "lock");
  const ownerPath = join(lockDir, "owner.json");
  const me: LockOwner = { importId, token: randomBytes(8).toString("hex"), pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
  await mkdir(dir, { recursive: true });
  let ownerless = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await mkdir(lockDir);
    } catch (err) {
      if (!isCode(err, "EEXIST")) throw err;
      const owner = await readOwner(ownerPath);
      if (owner === null) {
        if (!(await stat(lockDir).catch(() => null))) continue; // released between our mkdir and our read

        if (++ownerless > 3) throw new StoreLockedError(importId, "a lock without an owner record; remove the lock directory by hand if no leap process is running");

        await sleep(options.graceMs ?? 50); // another process is between its mkdir and its owner.json write
        continue;
      }
      if (owner.hostname !== me.hostname) throw new StoreLockedError(importId, `pid ${owner.pid} on ${owner.hostname} since ${owner.startedAt}; this phase is local-only, remove the lock directory by hand only if that process is gone`);

      if (pidAlive(owner.pid)) throw new StoreLockedError(importId, `pid ${owner.pid} on ${owner.hostname} since ${owner.startedAt}`);

      await options.hooks?.afterInspect?.(owner);
      const tombstone = join(dir, `lock.stale-${owner.token}`);
      try { await rename(lockDir, tombstone); } catch (renameErr) {
        if (isCode(renameErr, "ENOENT") || isCode(renameErr, "ENOTEMPTY") || isCode(renameErr, "EEXIST")) continue; // another reclaimer got there first; re-inspect from mkdir

        throw renameErr;
      }
      continue;
    }
    await writeFile(ownerPath, JSON.stringify(me, null, 2) + "\n");
    const assertHeld = async (): Promise<void> => { const current = await readOwner(ownerPath); if (current?.token !== me.token) throw new LockLostError(dir); };
    return {
      token: me.token,
      assertHeld,
      release: async () => {
        const current = await readOwner(ownerPath);
        if (current?.token !== me.token) return; // not ours (removed by hand, or reclaimed after this process died): nothing to remove

        await rm(lockDir, { recursive: true, force: true });
      }
    };
  }
  throw new StoreLockedError(importId, "a lock that could not be acquired after repeated attempts");
}
