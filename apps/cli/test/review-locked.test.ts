import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importIdFor } from "../src/generate.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");

describe("leap review against a locked output directory", () => {
  it("refuses to run, names the holder on stderr, exits 1 and leaves the live holder's lock untouched", async () => {
    expect(existsSync(cliDist), `${cliDist} must be built before this test`).toBe(true);
    const out = await mkdtemp(join(tmpdir(), "leap-review-locked-"));
    await mkdir(join(out, "lock"));
    // a live local pid: never reclaimed, whatever the lock's age
    await writeFile(join(out, "lock", "owner.json"), JSON.stringify({ importId: importIdFor(out), token: "x", pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() }));
    const child = spawn(process.execPath, [cliDist, "review", "--out", out, "--activity", "act-1", "--reviewer", "me", "--decision", "accepted"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    const code = await new Promise<number | null>((exited) => child.on("exit", (status) => exited(status)));
    expect(stderr, stderr).toMatch(/^leap: import .* is locked/m);
    expect(code).toBe(1);
    expect(stdout).toBe(""); // nothing was reviewed, so no confirmation and no report
    expect(JSON.parse(await readFile(join(out, "lock", "owner.json"), "utf8"))).toMatchObject({ token: "x" }); // a refused run never removes a lock that is not its own
  }, 30_000);
});
