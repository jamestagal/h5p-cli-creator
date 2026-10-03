import { describe, it, expect } from "vitest";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileStore, REPORTS_PENDING } from "../src/file-store.js";
import { seededDir } from "./helpers/seeded-import.js";

const phase2 = resolve(import.meta.dirname, "fixtures/phase2-store");

const snapshot = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else out[p] = (await readFile(p)).toString("base64"); } };
  await walk(dir);
  return out;
};
const marker = (dir: string) => writeFile(join(dir, REPORTS_PENDING), `${JSON.stringify({ reason: "test" })}\n`);

/** Takes and releases the lock, as every command (and the exported runImport) does first; a refusal from the lock itself is fine. */
async function lockOnce(dir: string, importId: string): Promise<void> {
  try { await (await new FileStore(dir).lock(importId)).release(); } catch { /* a refusal changes nothing either */ }
}

describe("the pending-report marker is repaired only on a writable import (review of 4ea613c)", () => {
  it("a phase-2 store with a marker is left byte for byte", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-pending-v1-")), "phase2-store");
    await cp(phase2, dir, { recursive: true });
    await marker(dir);
    const importId = (JSON.parse(await readFile(join(dir, "import.json"), "utf8")) as { importId: string }).importId;
    const before = await snapshot(dir);
    await lockOnce(dir, importId);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("a store with a malformed version and a marker is left byte for byte", async () => {
    const { dir, importId } = await seededDir();
    const record = JSON.parse(await readFile(join(dir, "import.json"), "utf8")) as Record<string, unknown>;
    await writeFile(join(dir, "import.json"), JSON.stringify({ ...record, storeVersion: "2" }, null, 2) + "\n");
    await marker(dir);
    const before = await snapshot(dir);
    await lockOnce(dir, importId);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("a store with an obsolete layout and a marker is left byte for byte", async () => {
    const { dir, store, importId } = await seededDir();
    const rev = (await store.getRevision("act-1", 1))!;
    await store.putRevision({ ...rev, engineFingerprint: "e".repeat(64), buildKey: "builds/x.h5p" } as typeof rev); // revisions from before build records
    await marker(dir);
    const before = await snapshot(dir);
    await lockOnce(dir, importId);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("a writable import with a marker still has its reports rewritten and the marker removed", async () => {
    const { dir, importId } = await seededDir();
    await marker(dir);
    await lockOnce(dir, importId);
    const names = await readdir(dir);
    expect(names).toContain("mapping.csv");
    expect(names).toContain("cost.json");
    expect(names).not.toContain(REPORTS_PENDING);
  });
});
