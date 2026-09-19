import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importIdFor } from "../src/generate.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const unitTxt = resolve(root, "packages/generator/test/fixtures/synthetic/unit-synele001.txt");
const librariesDir = resolve(root, "libraries");

describe("leap generate against a locked output directory", () => {
  it("refuses to run, names the holder on stderr, exits 1 and leaves the live holder's lock untouched", async () => {
    expect(existsSync(cliDist), `${cliDist} must be built before this test`).toBe(true);
    const out = await mkdtemp(join(tmpdir(), "leap-locked-"));
    const fixtures = await mkdtemp(join(tmpdir(), "leap-no-fixtures-"));
    await mkdir(join(out, "lock"));
    // a live local pid: never reclaimed, whatever the lock's age
    await writeFile(join(out, "lock", "owner.json"), JSON.stringify({ importId: importIdFor(out), token: "x", pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() }));
    const env = { ...process.env };
    delete env["ANTHROPIC_API_KEY"]; // --provider replay needs no key, and must not be given one
    const child = spawn(process.execPath, [cliDist, "generate", "--source", sourceMd, "--unit", unitTxt, "--out", out, "--provider", "replay", "--fixtures", fixtures, "--libraries", librariesDir], { stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    const code = await new Promise<number | null>((exited) => child.on("exit", (status) => exited(status)));
    expect(stderr, stderr).toMatch(/^leap: import .* is locked/m);
    expect(code).toBe(1);
    expect(stdout).toBe(""); // nothing was generated, so no activity table and no report
    expect(JSON.parse(await readFile(join(out, "lock", "owner.json"), "utf8"))).toMatchObject({ token: "x" }); // a refused run never removes a lock that is not its own
  }, 30_000);
});
