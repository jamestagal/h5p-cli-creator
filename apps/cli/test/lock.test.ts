import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { StoreLockedError } from "@leaplearn/generator";
import { acquireDirectoryLock, LockLostError } from "../src/lock.js";

/** A pid that has certainly exited on this host. A large literal is not safe: Linux allows pid_max up to 2**22, so 2**22-1 can be a live pid. */
async function deadLocalPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });
  await new Promise<void>((exited) => child.on("exit", () => exited()));
  return child.pid!;
}
const DEAD_PID = await deadLocalPid();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function writeLock(dir: string, owner: Record<string, unknown>): Promise<void> {
  await mkdir(join(dir, "lock"), { recursive: true });
  await writeFile(join(dir, "lock", "owner.json"), JSON.stringify(owner));
}
const ownerOf = async (dir: string) => JSON.parse(await readFile(join(dir, "lock", "owner.json"), "utf8")) as { token: string; pid: number };

describe("directory lock", () => {
  it("grants one lock, refuses a second holder, and reacquires after release", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-lock-"));
    const lock = await acquireDirectoryLock(dir, "imp");
    await expect(acquireDirectoryLock(dir, "imp")).rejects.toMatchObject({ name: "StoreLockedError", message: expect.stringMatching(new RegExp(`pid ${process.pid}`)) });
    await lock.release();
    expect(existsSync(join(dir, "lock"))).toBe(false);
    const again = await acquireDirectoryLock(dir, "imp");
    await again.release();
  });
  it("never reclaims a live local owner, however old its lock is, and never a lock from another host", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-live-"));
    await writeLock(dir, { importId: "imp", token: "paused", pid: process.pid, hostname: hostname(), startedAt: "2020-01-01T00:00:00Z" });
    await expect(acquireDirectoryLock(dir, "imp")).rejects.toBeInstanceOf(StoreLockedError);
    await rm(join(dir, "lock"), { recursive: true });
    await writeLock(dir, { importId: "imp", token: "remote", pid: DEAD_PID, hostname: "another-host", startedAt: "t" });
    await expect(acquireDirectoryLock(dir, "imp")).rejects.toMatchObject({ message: expect.stringMatching(/another-host.*by hand/) });
  });
  it("replays the reviewed interleaving with a barrier and an old lock: B inspects the dead lock, A reclaims and acquires, a third contender cannot clear the tombstone, then B fails and A's lock is intact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-race-"));
    await writeLock(dir, { importId: "imp", token: "dead-token", pid: DEAD_PID, hostname: hostname(), startedAt: "t" });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(dir, "lock"), twoHoursAgo, twoHoursAgo); // the dead lock is old, so its tombstone inherits an old mtime
    let proceed!: () => void;
    const barrier = new Promise<void>((r) => { proceed = r; });
    let inspected = false;
    const b = acquireDirectoryLock(dir, "imp", { hooks: { afterInspect: async () => { inspected = true; await barrier; } } });
    while (!inspected) await sleep(5); // B has judged the old lock stale and is parked before its rename
    const a = await acquireDirectoryLock(dir, "imp"); // A reclaims the dead lock and holds a fresh one
    expect((await ownerOf(dir)).token).toBe(a.token);
    await expect(acquireDirectoryLock(dir, "imp")).rejects.toBeInstanceOf(StoreLockedError); // a third contender: refused, and it must not touch the tombstone
    expect(existsSync(join(dir, "lock.stale-dead-token"))).toBe(true);
    proceed();
    await expect(b).rejects.toBeInstanceOf(StoreLockedError); // B's rename targets the tombstone A already created and fails; B then sees A alive
    expect((await ownerOf(dir)).token).toBe(a.token); // A's fresh lock was never moved
    await a.assertHeld();
    expect(existsSync(join(dir, "lock.stale-dead-token"))).toBe(true); // the tombstone is kept; nothing automatic removes it
    await a.release();
    expect(existsSync(join(dir, "lock"))).toBe(false);
  });
  it("two reclaimers of the same dead lock without barriers: exactly one wins, and the loser can lock after the winner releases", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-reclaim-"));
    await writeLock(dir, { importId: "imp", token: "dead-token", pid: DEAD_PID, hostname: hostname(), startedAt: "t" });
    const results = await Promise.allSettled([acquireDirectoryLock(dir, "imp"), acquireDirectoryLock(dir, "imp")]);
    const winners = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireDirectoryLock>>> => r.status === "fulfilled");
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await ownerOf(dir)).token).toBe(winners[0]!.value.token);
    await winners[0]!.value.release();
    const later = await acquireDirectoryLock(dir, "imp");
    await later.release();
  });
  it("detects lost ownership and never removes a lock that is not its own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-lost-"));
    const mine = await acquireDirectoryLock(dir, "imp");
    await rm(join(dir, "lock"), { recursive: true }); // an operator removed it by hand
    await expect(mine.assertHeld()).rejects.toBeInstanceOf(LockLostError);
    const other = await acquireDirectoryLock(dir, "imp");
    await mine.release(); // not ours: no-op
    expect((await ownerOf(dir)).token).toBe(other.token);
    await other.release();
  });
  it("waits briefly for a lock whose owner record is still being written, then refuses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leap-ownerless-"));
    await mkdir(join(dir, "lock"));
    await expect(acquireDirectoryLock(dir, "imp", { graceMs: 5 })).rejects.toMatchObject({ message: expect.stringMatching(/without an owner record/) });
    expect((await stat(join(dir, "lock"))).isDirectory()).toBe(true);
  });
});
