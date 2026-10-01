import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authoriseRun, LedgerError, readLedger, type Ledger } from "../src/pilot/ledger.js";
import { spendFromAttempts } from "../src/llm/spend.js";
import { budgetFromLedger } from "../src/pipeline/operations.js";
import { reserve } from "../src/llm/budget.js";
import type { AttemptEvent, AttemptOutcome, AttemptStart, ModelRequest } from "../src/llm/types.js";

const run = (runId: string, capUsd: number, outDir = `/pilot/${runId}`) => ({ runId, outDir, capUsd, authorisedBy: "Benjamin", authorisedOn: "2026-10-01" });
const ledger = (totalCapUsd: number, runs: ReturnType<typeof run>[]): Ledger => ({ totalCapUsd, runs });

describe("readLedger", () => {
  const write = async (value: unknown) => { const p = join(await mkdtemp(join(tmpdir(), "ledger-")), "ledger.json"); await writeFile(p, typeof value === "string" ? value : JSON.stringify(value)); return p; };

  it("reads a valid ledger", async () => {
    expect(await readLedger(await write(ledger(5, [run("S1", 1), run("P1", 3)])))).toEqual(ledger(5, [run("S1", 1), run("P1", 3)]));
  });

  it("refuses a non-positive total or run cap, a relative or repeated outDir, a repeated runId, and an empty authorisation", async () => {
    const cases: Array<[unknown, RegExp]> = [
      [ledger(0, [run("S1", 1)]), /totalCapUsd/],
      [ledger(5, [run("S1", 0)]), /runs\.0\.capUsd/],
      [ledger(5, [run("S1", 1, "pilot/s1")]), /outDir must be an absolute path/],
      [ledger(5, [run("S1", 1, "/pilot/a"), run("P1", 1, "/pilot/x/../a")]), /outDir "\/pilot\/a" appears more than once/],
      [ledger(5, [run("S1", 1, "/pilot/a"), run("S1", 1, "/pilot/b")]), /runId "S1" appears more than once/],
      [ledger(5, [{ ...run("S1", 1), authorisedBy: "  " }]), /authorisedBy/],
      [ledger(5, [{ ...run("S1", 1), authorisedOn: "" }]), /authorisedOn/]
    ];
    for (const [value, message] of cases) {
      const refused = await readLedger(await write(value)).catch((e: unknown) => e);
      expect(refused, JSON.stringify(value)).toBeInstanceOf(LedgerError);
      expect((refused as Error).message).toMatch(message);
    }
    await expect(readLedger(await write("{ not json"))).rejects.toThrow(/could not be read as JSON/);
  });
});

describe("authoriseRun: each refusal rule, with its message", () => {
  const l = ledger(7, [run("S1", 1), run("P1", 3), run("P2", 3)]);

  it("authorises a listed run, in its own directory, at or below its cap; a run with no budget gets its cap", () => {
    expect(authoriseRun(l, { runId: "P1", outDir: "/pilot/P1", budgetUsd: 3 })).toMatchObject({ ok: true, capUsdMicro: 3_000_000 });
    expect(authoriseRun(l, { runId: "P1", outDir: "/pilot/P1", budgetUsd: 2.5 })).toMatchObject({ ok: true });
    expect(authoriseRun(l, { runId: "P1", outDir: "/pilot/P1/" })).toMatchObject({ ok: true, capUsdMicro: 3_000_000 });
  });

  it("refuses a run that is not listed", () => {
    expect(authoriseRun(l, { runId: "P9", outDir: "/pilot/P9", budgetUsd: 1 })).toEqual({ ok: false, rule: "not-listed", message: 'run "P9" is not in the ledger; a paid run needs a ledger entry authorising it' });
  });

  it("refuses a directory other than the run's", () => {
    expect(authoriseRun(l, { runId: "P1", outDir: "/pilot/P2", budgetUsd: 1 })).toEqual({ ok: false, rule: "out-dir-mismatch", message: 'run "P1" is authorised to write to /pilot/P1, not /pilot/P2' });
  });

  it("refuses --budget-usd above the run's cap and allows it at the cap", () => {
    expect(authoriseRun(l, { runId: "S1", outDir: "/pilot/S1", budgetUsd: 1.01 })).toEqual({ ok: false, rule: "budget-above-cap", message: '--budget-usd $1.01 is above run "S1"\'s estimated cap of $1.00' });
    expect(authoriseRun(l, { runId: "S1", outDir: "/pilot/S1", budgetUsd: 1 })).toMatchObject({ ok: true });
  });

  it("static allocation: caps of 1 + 3 + 3 against a total of 5 refuse every run; against 7 they allow each", () => {
    const over = ledger(5, [run("S1", 1), run("P1", 3), run("P2", 3)]);
    for (const id of ["S1", "P1", "P2"]) {
      expect(authoriseRun(over, { runId: id, outDir: `/pilot/${id}`, budgetUsd: 1 })).toEqual({ ok: false, rule: "over-allocated", message: "the ledger's run caps add up to an estimated $7.00, above its estimated total cap of $5.00; every run is refused until the ledger is corrected" });
      expect(authoriseRun(ledger(7, over.runs), { runId: id, outDir: `/pilot/${id}`, budgetUsd: 1 })).toMatchObject({ ok: true });
    }
  });

  it("never says a cap cannot be exceeded: every message calls caps estimated", () => {
    const messages = [
      authoriseRun(ledger(5, [run("S1", 1), run("P1", 3), run("P2", 3)]), { runId: "S1", outDir: "/pilot/S1" }),
      authoriseRun(l, { runId: "S1", outDir: "/pilot/S1", budgetUsd: 2 })
    ].map((a) => (a.ok ? "" : a.message));
    for (const m of messages) { expect(m).toMatch(/estimated/); expect(m).not.toMatch(/cannot/); }
  });
});

describe("spendFromAttempts", () => {
  let n = 0;
  const start = (reservedUsdMicro: number): AttemptStart => ({ event: "start", attemptId: `a${++n}`, operationId: "op", origin: "generate", requestId: null, callKey: "k", retryIndex: 0, retryReason: null, attempt: 1, deadlineMs: 0, purpose: "extract", model: "claude-haiku-4-5-20251001", reservedUsdMicro, reservedInputTokens: 100, reservedOutputTokens: 100, startedAt: "t" } as unknown as AttemptStart);
  const outcome = (s: AttemptStart, costUsdMicro: number | null): AttemptOutcome => ({ event: "outcome", attemptId: s.attemptId, operationId: "op", providerRequestId: null, rawUsage: null, inputTokens: costUsdMicro === null ? null : 50, outputTokens: costUsdMicro === null ? null : 50, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, pricingVersion: "p", costUsdMicro, costStatus: costUsdMicro === null ? "unavailable" : "known", stopReason: "end_turn" } as unknown as AttemptOutcome);

  it("crash with no cost.json: an orphan start and an outcome with unavailable cost both count at their reservations", () => {
    const known = start(5000); const orphan = start(7000); const unknown = start(9000);
    const events: AttemptEvent[] = [known, outcome(known, 1200), orphan, unknown, outcome(unknown, null)];
    expect(spendFromAttempts(events)).toBe(1200 + 7000 + 9000);
    expect(spendFromAttempts([])).toBe(0);
  });

  it("matches phase-2 accounting: the same records give budgetFromLedger's spentUsdMicro (what resume reconciliation uses)", () => {
    const a = start(5000); const b = start(7000); const c = start(9000); const d = start(11000);
    const events: AttemptEvent[] = [a, outcome(a, 1200), b, c, outcome(c, null), d, outcome(d, 0)];
    expect(spendFromAttempts(events)).toBe(budgetFromLedger({ usdMicro: 1, requests: 10, tokens: 10_000, elapsedMs: 1000 }, events, 0, 0).spentUsdMicro);
  });

  it("resuming a partly spent run: $0.60 spent against a $1 per-import budget refuses a dispatch whose reservation would cross $1", () => {
    const s = start(600_000);
    const budget = budgetFromLedger({ usdMicro: 1_000_000, requests: 100, tokens: 10_000_000, elapsedMs: 3_600_000 }, [s, outcome(s, 600_000)], Date.now(), 0);
    expect(budget.spentUsdMicro).toBe(600_000);
    const request = (maxOutputTokens: number): ModelRequest => ({ purpose: "produce", model: "claude-sonnet-5", system: "s", user: "u", maxOutputTokens, outputSchema: {} } as unknown as ModelRequest);
    expect(reserve(budget, request(50_000))).toMatchObject({ ok: false, limit: "spend" }); // $0.50 of output at $10/MTok
    expect(reserve(budget, request(1_000))).toMatchObject({ ok: true });
  });
});
