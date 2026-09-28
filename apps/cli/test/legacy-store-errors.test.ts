import { describe, it, expect, vi } from "vitest";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The container runs tests as root, for whom chmod does not deny access, so a permission error is injected at the
// module boundary instead: readdir fails with EACCES for one directory and behaves normally everywhere else.
const denied = { dir: "" };
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: (async (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) => {
      if (denied.dir !== "" && String(path) === denied.dir) throw Object.assign(new Error(`EACCES: permission denied, scandir '${denied.dir}'`), { code: "EACCES" });
      return (actual.readdir as (...a: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readdir
  };
});

const { readLegacyImport } = await import("../src/legacy-store.js");
const fixture = resolve(import.meta.dirname, "fixtures/phase2-store");

async function phase2Copy(): Promise<string> {
  const out = join(await mkdtemp(join(tmpdir(), "leap-legacy-errors-")), "phase2-store");
  await cp(fixture, out, { recursive: true });
  return out;
}

describe("readLegacyImport and permission errors", () => {
  it("propagates EACCES on the activities directory instead of reporting no activities", async () => {
    const out = await phase2Copy();
    denied.dir = join(out, "activities");
    try { await expect(readLegacyImport(out)).rejects.toMatchObject({ code: "EACCES" }); } finally { denied.dir = ""; }
  });

  it("propagates EACCES on an activity's revisions directory instead of reporting no revisions", async () => {
    const out = await phase2Copy();
    denied.dir = join(out, "revisions", "act-1");
    try { await expect(readLegacyImport(out)).rejects.toMatchObject({ code: "EACCES" }); } finally { denied.dir = ""; }
  });

  it("reads normally when nothing is denied (the mock passes other calls through)", async () => {
    const out = await phase2Copy();
    expect(denied.dir).toBe("");
    const view = await readLegacyImport(out);
    expect(view.revisions.map((r) => `${r.activityId}/r${r.revision}`)).toEqual(["act-1/r1"]);
  });
});
