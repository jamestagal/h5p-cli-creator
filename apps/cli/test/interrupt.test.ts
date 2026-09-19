import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRegistry } from "@leaplearn/engine";
import { ingestText, runImport, DEFAULT_PROMPT_CONFIG, type AttemptStart, type ModelProvider } from "@leaplearn/generator";
import { FileStore, readJsonl } from "../src/file-store.js";

const root = resolve(import.meta.dirname, "../../..");
const engineDist = resolve(root, "packages/engine/dist/index.js");
const generatorDist = resolve(root, "packages/generator/dist/index.js");
const fileStoreDist = resolve(root, "apps/cli/dist/file-store.js");
const lockPath = resolve(root, "libraries/libraries.lock.json");
const cacheDir = resolve(root, "libraries/cache");
const SOURCE = "Lock it out before work starts. Test for dead at the point of work. Restore supply only after guards are refitted.";
const UNIT = "SYNELE001 Isolate and test electrical equipment";
const MAX_ATTEMPT_MS = 3000; // what a hung call is charged when the process dies inside it
const importInput = (source: Awaited<ReturnType<typeof ingestText>>) => ({ importId: "child", name: "child", source, unitText: UNIT, selectedTypes: ["multiChoice"] as const, budget: { usdMicro: 1_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null });

const childScript = `
import { createRegistry } from ${JSON.stringify(engineDist)};
import { ingestText, runImport, DEFAULT_PROMPT_CONFIG } from ${JSON.stringify(generatorDist)};
import { FileStore } from ${JSON.stringify(fileStoreDist)};
const registry = await createRegistry({ lockPath: ${JSON.stringify(lockPath)}, cacheDir: ${JSON.stringify(cacheDir)} });
const provider = { name: "fake", async complete() { process.stdout.write("dispatched\\n"); await new Promise((r) => setTimeout(r, 60_000)); throw new Error("unreachable"); } };
const source = await ingestText(${JSON.stringify(SOURCE)}, { sourceId: "src-child" });
await runImport({ importId: "child", name: "child", source, unitText: ${JSON.stringify(UNIT)}, selectedTypes: ["multiChoice"], budget: { usdMicro: 1_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null }, { store: new FileStore(process.env.LEAP_TEST_DIR), provider, registry, engineFingerprint: "child", maxAttemptMs: ${MAX_ATTEMPT_MS} });
`;

describe("abrupt termination", () => {
  it("a SIGKILLed run leaves a start without an outcome, a held lock and a run anchor; the next run reclaims the lock, charges the interrupted time, reconciles, and numbers the resumed attempt", async () => {
    for (const p of [engineDist, generatorDist, fileStoreDist]) expect(existsSync(p), `${p} must be built before this test`).toBe(true);
    const dir = await mkdtemp(join(tmpdir(), "leap-kill-"));
    const child = spawn(process.execPath, ["--input-type=module", "-e", childScript], { env: { ...process.env, LEAP_TEST_DIR: dir }, stdio: ["ignore", "pipe", "inherit"] });
    // The child sleeps 60 s inside its dispatch, so every exit path has to kill it: a child that never prints
    // "dispatched", or an assertion that throws mid-test, must not leave it running after the test ends.
    const exited = new Promise<void>((hasExited) => { child.on("exit", () => hasExited()); });
    try {
      await Promise.race([
        new Promise<void>((dispatched) => { child.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("dispatched")) dispatched(); }); }),
        exited.then(() => { throw new Error(`child exited before dispatching (code ${child.exitCode}, signal ${child.signalCode})`); })
      ]);
      child.kill("SIGKILL");
      await exited;
      expect((await stat(join(dir, "lock"))).isDirectory()).toBe(true); // no finally ran
      expect((await readJsonl<AttemptStart>(join(dir, "attempts.jsonl"))).records.map((e) => e.event)).toEqual(["start"]);
      const killed = (await new FileStore(dir).getImport("child"))!;
      expect(killed.currentRun).not.toBeNull(); // the anchor was written before the dispatch
      expect(killed.budgetUsed.elapsedMs).toBe(0); // no snapshot ever ran: without the anchor this time would be given back
      const childRunStartedMs = Date.parse(killed.currentRun!.startedAt);

      const registry = await createRegistry({ lockPath, cacheDir });
      const empty: ModelProvider = { name: "fake", async complete() { throw new Error("no scripted response"); } };
      const store = new FileStore(dir);
      const source = await ingestText(SOURCE, { sourceId: "src-child" });
      // reconcileElapsed never charges more than the time that has really passed, so the tail is only reachable on a
      // clock offset by one maximum attempt length — the same injection the pipeline's own resume tests use.
      const clock = (): Date => new Date(Date.now() + MAX_ATTEMPT_MS);
      await runImport(importInput(source), { store, provider: empty, registry, engineFingerprint: "child", maxAttemptMs: MAX_ATTEMPT_MS, clock }).catch(() => undefined);
      expect((await store.listOperations("child")).find((o) => o.operationId === "child:parseUnit")).toMatchObject({ status: "failed", billingUncertain: true });
      const starts = (await store.listAttempts("child")).filter((e): e is AttemptStart => e.event === "start" && e.callKey === "parseUnit");
      expect(starts.map((s) => [s.retryIndex, s.retryReason])).toEqual([[0, null], [1, "resume"]]);
      const resumed = (await store.getImport("child"))!;
      const offsetRealElapsedMs = Date.now() + MAX_ATTEMPT_MS - childRunStartedMs;
      expect(resumed.budgetUsed.elapsedMs, `charged ${resumed.budgetUsed.elapsedMs} ms`).toBeGreaterThanOrEqual(MAX_ATTEMPT_MS); // the killed call was charged up to the maximum attempt length
      expect(resumed.budgetUsed.elapsedMs, `charged ${resumed.budgetUsed.elapsedMs} ms of ${offsetRealElapsedMs} ms`).toBeLessThanOrEqual(offsetRealElapsedMs); // never more than the time that really passed on the offset clock
      expect(resumed.budgetUsed.elapsedMs).toBeLessThanOrEqual(resumed.budget.elapsedMs); // never more than the import's elapsed limit
      expect(resumed.currentRun).toBeNull(); // the resumed run folded its own anchor
      expect(existsSync(join(dir, "lock"))).toBe(false); // the second run reclaimed the dead holder's lock and released it
    } finally {
      child.kill("SIGKILL"); // a no-op once it has exited
      await exited;
    }
  }, 30_000);
});
