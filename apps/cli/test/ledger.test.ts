import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spendFromAttempts, type AttemptEvent, type ModelProvider, type ModelRequest } from "@leaplearn/generator";
import { generate, type GenerateArgs } from "../src/generate.js";
import { FileStore } from "../src/file-store.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const unitTxt = resolve(root, "packages/generator/test/fixtures/synthetic/unit-synele001.txt");
const librariesDir = resolve(root, "libraries");

async function leap(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = { ...process.env };
  delete env["ANTHROPIC_API_KEY"]; // no paid call is possible from these tests
  const child = spawn(process.execPath, [cliDist, ...args], { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
  child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
  const code = await new Promise<number | null>((done) => child.on("exit", (status) => done(status)));
  return { code, stdout, stderr };
}

const temp = () => mkdtemp(join(tmpdir(), "leap-ledger-"));
const ledgerFile = async (dir: string, totalCapUsd: number, runs: Array<{ runId: string; outDir: string; capUsd: number }>) => {
  const path = join(dir, "ledger.json");
  await writeFile(path, JSON.stringify({ totalCapUsd, runs: runs.map((r) => ({ ...r, authorisedBy: "Benjamin", authorisedOn: "2026-10-01" })) }));
  return path;
};
/** A provider that records each request and fails it, as an unreachable service would: no network, no key, no spend beyond the reservation. */
class FailingProvider implements ModelProvider {
  readonly name = "fake" as const;
  readonly requests: ModelRequest[] = [];
  async complete(request: ModelRequest): Promise<never> { this.requests.push(request); throw new Error("offline test provider"); }
}
/** generate in-process on the `record` code path, with a failing provider injected in place of the recording one. */
const run = async (args: Partial<GenerateArgs> & { out: string }, provider = new FailingProvider()) => {
  const err: string[] = [];
  const full: GenerateArgs = { source: sourceMd, unit: unitTxt, types: "multiChoice", maxRequests: 200, maxTokens: 2_000_000, maxSeconds: 1800, language: "en", readingLevel: "high-school", tone: "educational", libraries: librariesDir, provider: "record", concurrency: 1, ...args };
  const code = await generate(full, { out: () => undefined, err: (s) => { err.push(s); } }, { provider }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  return { code, stderr: err.join(""), provider };
};
const importJson = async (out: string) => JSON.parse(await readFile(join(out, "import.json"), "utf8")) as { budget: { usdMicro: number }; budgetUsed: { spentUsdMicro: number } };
const attempts = (out: string) => new FileStore(out).listAttempts("x");

describe("generate refuses a paid provider without a ledger entry", () => {
  it("--provider record without --ledger exits 1 before any directory is created", async () => {
    const out = join(await temp(), "import");
    const result = await leap(["generate", "--source", sourceMd, "--out", out, "--provider", "record", "--fixtures", join(out, "..", "fx"), "--libraries", librariesDir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--provider record can make paid calls, so it needs --ledger <file> and --run <id>");
    expect(existsSync(out)).toBe(false);
  });

  it("--provider anthropic with a ledger that does not list the run exits 1 before any directory is created, naming the rule", async () => {
    const dir = await temp();
    const out = join(dir, "import");
    const ledger = await ledgerFile(dir, 5, [{ runId: "S1", outDir: join(dir, "s1"), capUsd: 1 }]);
    const result = await leap(["generate", "--source", sourceMd, "--out", out, "--provider", "anthropic", "--ledger", ledger, "--run", "P1", "--libraries", librariesDir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('leap: run "P1" is not in the ledger; a paid run needs a ledger entry authorising it\n');
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an over-allocated ledger, a different directory and a budget above the cap, each with its message and nothing created", async () => {
    const dir = await temp();
    const out = join(dir, "s1");
    const over = await ledgerFile(dir, 5, [{ runId: "S1", outDir: out, capUsd: 1 }, { runId: "P1", outDir: join(dir, "p1"), capUsd: 3 }, { runId: "P2", outDir: join(dir, "p2"), capUsd: 3 }]);
    expect((await run({ out, ledger: over, run: "S1" })).stderr).toContain("every run is refused until the ledger is corrected");
    const ok = await ledgerFile(dir, 7, [{ runId: "S1", outDir: out, capUsd: 1 }]);
    expect((await run({ out: join(dir, "elsewhere"), ledger: ok, run: "S1" })).stderr).toContain(`run "S1" is authorised to write to ${out}, not ${join(dir, "elsewhere")}`);
    expect((await run({ out, ledger: ok, run: "S1", budgetUsd: 1.5 })).stderr).toContain('--budget-usd $1.50 is above run "S1"\'s estimated cap of $1.00');
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(dir, "elsewhere"))).toBe(false);
  });

  it("allows --budget-usd at the cap, and replay needs no ledger", async () => {
    const dir = await temp();
    const out = join(dir, "s1");
    const ledger = await ledgerFile(dir, 1, [{ runId: "S1", outDir: out, capUsd: 1 }]);
    const atCap = await run({ out, ledger, run: "S1", budgetUsd: 1 });
    expect(atCap.provider.requests.length).toBeGreaterThan(0); // authorised: it got as far as dispatching
    expect((await importJson(out)).budget.usdMicro).toBe(1_000_000);
    const replay = await leap(["generate", "--source", sourceMd, "--unit", unitTxt, "--out", join(dir, "replay"), "--provider", "replay", "--fixtures", join(dir, "fx"), "--libraries", librariesDir]);
    expect(replay.stderr).not.toContain("--ledger");
  });
});

describe("authorised runs", () => {
  it("concurrent authorisations: two runs started at the same moment are both authorised, each import's budget is its own cap, and neither's spend counts against the other", async () => {
    const dir = await temp();
    const a = join(dir, "run-a"); const b = join(dir, "run-b");
    const ledger = await ledgerFile(dir, 3, [{ runId: "A", outDir: a, capUsd: 1 }, { runId: "B", outDir: b, capUsd: 2 }]);
    const [ra, rb] = await Promise.all([run({ out: a, ledger, run: "A" }), run({ out: b, ledger, run: "B" })]);
    expect(ra.provider.requests.length).toBeGreaterThan(0);
    expect(rb.provider.requests.length).toBeGreaterThan(0);
    expect((await importJson(a)).budget.usdMicro).toBe(1_000_000);
    expect((await importJson(b)).budget.usdMicro).toBe(2_000_000);
    const [ea, eb] = [await attempts(a), await attempts(b)];
    expect(new Set(ea.map((e) => e.attemptId)).size + new Set(eb.map((e) => e.attemptId)).size).toBe(new Set([...ea, ...eb].map((e) => e.attemptId)).size); // disjoint records
    expect((await importJson(a)).budgetUsed.spentUsdMicro).toBe(spendFromAttempts(ea));
    expect((await importJson(b)).budgetUsed.spentUsdMicro).toBe(spendFromAttempts(eb));
  });

  it("crash with no cost.json: an orphan start and an outcome with unavailable cost count at their reservations, and resume authorisation uses that figure", async () => {
    const dir = await temp();
    const out = join(dir, "s1");
    const first = await ledgerFile(dir, 10, [{ runId: "S1", outDir: out, capUsd: 1 }]);
    await run({ out, ledger: first, run: "S1" });
    const recorded = await attempts(out);
    const template = recorded.find((e) => e.event === "start")!;
    const orphan = { ...template, attemptId: "crash-orphan", reservedUsdMicro: 300_000 };
    const unknownStart = { ...template, attemptId: "crash-unknown", reservedUsdMicro: 450_000 };
    const outcomeTemplate = recorded.find((e) => e.event === "outcome");
    const unknownOutcome = { ...(outcomeTemplate ?? { event: "outcome", operationId: template.operationId, providerRequestId: null, rawUsage: null, latencyMs: 1, pricingVersion: "p", stopReason: null }), event: "outcome", attemptId: "crash-unknown", inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsdMicro: null, costStatus: "unavailable" };
    await appendFile(join(out, "attempts.jsonl"), [orphan, unknownStart, unknownOutcome].map((e) => `${JSON.stringify(e)}\n`).join(""));
    await rm(join(out, "cost.json"), { force: true });
    const all = await attempts(out);
    const spent = spendFromAttempts(all as AttemptEvent[]);
    expect(spent).toBe(spendFromAttempts(recorded) + 300_000 + 450_000);
    expect(spent).toBeGreaterThan(750_000);

    const capped = await ledgerFile(dir, 10, [{ runId: "S1", outDir: out, capUsd: spent / 1_000_000 }]);
    const refused = await run({ out, ledger: capped, run: "S1" });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(`run "S1" has already spent an estimated $${(spent / 1_000_000).toFixed(4)} (from its attempt records), which meets its estimated cap of $${(spent / 1_000_000).toFixed(2)}`);
    expect(refused.provider.requests).toHaveLength(0);

    const raised = await ledgerFile(dir, 10, [{ runId: "S1", outDir: out, capUsd: 2 }]);
    const resumed = await run({ out, ledger: raised, run: "S1" });
    expect(resumed.provider.requests.length).toBeGreaterThan(0);
    expect((await importJson(out)).budget.usdMicro).toBe(2_000_000);
  });

  it("resuming a partly spent run: $0.60 spent against a $1 cap resumes with a per-import budget of $1; a run whose spend meets its cap is refused before any dispatch", async () => {
    const dir = await temp();
    const out = join(dir, "s1");
    const ledger = await ledgerFile(dir, 1, [{ runId: "S1", outDir: out, capUsd: 1 }]);
    await run({ out, ledger, run: "S1" });
    const recorded = await attempts(out);
    const template = recorded.find((e) => e.event === "start")!;
    const topUp = { ...template, attemptId: "spent-to-60c", reservedUsdMicro: 600_000 - spendFromAttempts(recorded) };
    await appendFile(join(out, "attempts.jsonl"), `${JSON.stringify(topUp)}\n`);
    expect(spendFromAttempts(await attempts(out))).toBe(600_000);

    const resumed = await run({ out, ledger, run: "S1" });
    expect(resumed.provider.requests.length).toBeGreaterThan(0);
    expect((await importJson(out)).budget.usdMicro).toBe(1_000_000);

    const meets = { ...template, attemptId: "spent-to-cap", reservedUsdMicro: 1_000_000 - spendFromAttempts(await attempts(out)) };
    await appendFile(join(out, "attempts.jsonl"), `${JSON.stringify(meets)}\n`);
    const refused = await run({ out, ledger, run: "S1" });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/has already spent an estimated \$1\.0000 \(from its attempt records\), which meets its estimated cap of \$1\.00/);
    expect(refused.provider.requests).toHaveLength(0);
  });
});
