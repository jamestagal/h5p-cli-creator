import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ConceptMap } from "@leaplearn/shared";
import { createRegistry, engineIdentity, type EngineIdentity, type LibraryRegistry } from "@leaplearn/engine";
import { ingestDocx, regenerateActivity, runFingerprint, runImport, type ActivityPlan, type AttemptOutcome, type AttemptStart, type ImportRecord, type ImportStore, type OperationRecord } from "@leaplearn/generator";
import { FakeProvider, fakeResponse } from "../../../packages/generator/src/llm/fake-provider.js";
import { crashBefore, CrashError } from "../../../packages/generator/test/helpers/crashing-store.js";
import { s1Input, S1_SETTINGS } from "../../../packages/generator/test/helpers/s1-settings.js";
import { electricalDocx } from "../../../packages/generator/test/helpers/structured-sources.js";
import { conceptResponses, passageEvidence, planOutFor, produceResponses, SYNTHETIC_CHUNK_TOKENS, syntheticUnitText, unitOut } from "../../../packages/generator/test/helpers/synthetic.js";
import { extract } from "../src/extract.js";
import { FileStore } from "../src/file-store.js";
import { gateReport } from "../src/gate-report.js";
import { generate } from "../src/generate.js";
import { regenerate } from "../src/regenerate.js";
import { reviewImport } from "../src/review-import.js";
import { reviewSheet } from "../src/review-sheet.js";

/**
 * Plan Task 15: the whole phase-3 loop offline, with no network, no ledger and no key. Two rehearsals:
 * - S1 (replay): `extract` on the S1 PDF, `generate --provider replay` on the S1 recordings with exactly S1_SETTINGS, then
 *   the scoring loop. S1 records no regeneration, so the regeneration's model call is a hand-authored, SYNTHETIC response.
 * - DOCX (FakeProvider throughout): the Task 6 DOCX, generated through runImport with the synthetic fixtures (`generate`
 *   takes an injected provider only under a ledger), then the same loop.
 * The regeneration is interrupted after promotion (an injected crash), then finished by `leap regenerate` with no note
 * and an empty replay directory: finishing makes no model call, so no provider is needed.
 */
const root = resolve(import.meta.dirname, "../../..");
const libraries = resolve(root, "libraries");
const s1Recordings = resolve(root, "packages/generator/test/fixtures/replay/synthetic");
const NOW = new Date("2026-10-03T09:00:00Z");
const clock = () => NOW;
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

let registry: LibraryRegistry; let identity: EngineIdentity;
beforeAll(async () => {
  registry = await createRegistry({ lockPath: resolve(libraries, "libraries.lock.json"), cacheDir: resolve(libraries, "cache") });
  identity = await engineIdentity(libraries);
});

type Choice = "accepted" | "needs-revision" | "rejected" | "skip";
const HEADER = "sheetId,activityId,revision,buildId,correctness,support,distractors,mapping,usefulness,minutes,decision";

/** Exports a sheet and returns its bundle paths and rows (the newest manifest is the sheet just written). */
async function exportSheet(dir: string): Promise<{ scores: string; findings: string; rows: string[][] }> {
  const run = io();
  expect(await reviewSheet({ out: dir }, run.io, clock)).toBe(0);
  const sheets = join(dir, "reviews", "sheets");
  const manifests = await Promise.all((await readdir(sheets)).filter((n) => n.endsWith(".json")).map(async (n) => JSON.parse(await readFile(join(sheets, n), "utf8")) as { sheetId: string; createdAt: string; entries: unknown[] }));
  const written = /^sheet ([0-9a-f]+) \(new\)/m.exec(run.out.join(""))?.[1];
  expect(written, run.out.join("")).toBeDefined();
  const sheetId = manifests.find((m) => m.sheetId === written)!.sheetId;
  const scores = join(sheets, sheetId, "scores.csv");
  const lines = (await readFile(scores, "utf8")).trimEnd().split("\n");
  expect(lines[0]).toBe(HEADER);
  return { scores, findings: join(sheets, sheetId, "findings.csv"), rows: lines.slice(1).map((l) => l.split(",")) };
}

/** Fills the sheet as a reviewer would: every applicable dimension 2, except correctness 1 (needs revision) or 0 (rejected) with a finding; `skip` leaves the row blank. */
async function fill(sheet: { scores: string; findings: string; rows: string[][] }, choose: (activityId: string) => Choice, itemOf: (activityId: string) => Promise<string>): Promise<void> {
  const scoreLines = [HEADER]; const findingLines = ["sheetId,activityId,dimension,itemId,score,reason"];
  for (const row of sheet.rows) {
    const [sheetId, activityId, revision, buildId, ...cells] = row as [string, string, string, string, ...string[]];
    const choice = choose(activityId);
    if (choice === "skip") { scoreLines.push(row.join(",")); continue; }
    const dims: string[] = cells.slice(0, 5).map((c) => (c === "na" ? "na" : "2"));
    if (choice !== "accepted") { dims[0] = choice === "rejected" ? "0" : "1"; findingLines.push(`${sheetId},${activityId},correctness,${await itemOf(activityId)},${dims[0]},synthetic finding for the rehearsal`); }
    scoreLines.push([sheetId, activityId, revision, buildId, ...dims, "3", ""].join(","));
  }
  await writeFile(sheet.scores, scoreLines.join("\n") + "\n");
  await writeFile(sheet.findings, findingLines.join("\n") + "\n");
}

async function importSheet(dir: string, scores: string): Promise<void> {
  const run = io();
  expect(await reviewImport({ out: dir, scores, reviewer: "Rehearsal" }, run.io, clock), run.err.join("")).toBe(0);
}

interface Summary { imports: Array<{ status: string; incomplete: unknown[]; types: Record<string, TypeFigures>; shared: { usdMicro: number } }> }
interface TypeFigures { planned: number; firstPass: Record<string, number>; afterRevision: Record<string, number>; regenerations: { used: number; failed: number }; cost: { firstPassDirect: { usdMicro: number }; regenerationDirect: { usdMicro: number }; allocatedSharedUsdMicro: number; firstPassPerAccepted: { usdMicro: number | null }; afterRevisionPerAccepted: { usdMicro: number | null } } }
async function report(dir: string): Promise<{ md: string; summary: Summary }> {
  const summaryPath = join(await mkdtemp(join(tmpdir(), "leap-rehearsal-sum-")), "summary.json");
  expect(await gateReport({ dirs: [dir], summary: summaryPath }, io().io)).toBe(0);
  return { md: (await readFile(join(dir, "gate-report.md"), "utf8")).replaceAll(dir, "<import>"), summary: JSON.parse(await readFile(summaryPath, "utf8")) as Summary };
}

/** Cost by type and origin, summed independently of the gate report from the attempt and operation records. */
async function ledgerCosts(store: FileStore, importId: string): Promise<{ shared: number; firstPass: Record<string, number>; regeneration: Record<string, number> }> {
  const events = await store.listAttempts(importId);
  const cost = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o.costUsdMicro ?? 0]));
  const ops = new Map((await store.listOperations(importId)).map((o: OperationRecord) => [o.operationId, o]));
  const typeOf = new Map((await store.listActivities(importId)).map((a) => [a.activityId, a.type as string]));
  const out = { shared: 0, firstPass: {} as Record<string, number>, regeneration: {} as Record<string, number> };
  for (const s of events.filter((e): e is AttemptStart => e.event === "start")) {
    const c = cost.get(s.attemptId) ?? 0;
    if (s.origin === "shared") { out.shared += c; continue; }
    const t = typeOf.get(ops.get(s.operationId)!.activityId!)!;
    const bucket = s.origin === "generate" ? out.firstPass : out.regeneration;
    bucket[t] = (bucket[t] ?? 0) + c;
  }
  return out;
}

/** The scoring loop of the contract, from a generated import to a complete gate report. */
async function scoringLoop(dir: string, importId: string, roles: { needsRevision: string; rejected: string; accepted: string; unscored: string }, regenerationResponse: (store: FileStore) => Promise<string>): Promise<{ incomplete: Summary; final: { md: string; summary: Summary } }> {
  // a finding names the failing item: the activity itself for multiChoice, its first blank or card otherwise
  const itemOf = async (activityId: string): Promise<string> => {
    const store = new FileStore(dir);
    const a = (await store.listActivities(importId)).find((x) => x.activityId === activityId)!;
    const spec = (await store.getRevision(activityId, a.currentRevision!))!.spec;
    return spec.type === "blanks" ? spec.blanks[0]!.id : spec.type === "flashcards" ? spec.cards[0]!.id : activityId;
  };
  // first sheet: one accepted, one needs revision, one rejected, one left unscored; the rest wait too
  const first = await exportSheet(dir);
  const firstRound: Record<string, Choice> = { [roles.accepted]: "accepted", [roles.needsRevision]: "needs-revision", [roles.rejected]: "rejected" };
  await fill(first, (id) => firstRound[id] ?? "skip", itemOf);
  await importSheet(dir, first.scores);
  const incomplete = (await report(dir)).summary;
  expect(incomplete.imports[0]!.status).toBe("incomplete");
  expect(incomplete.imports[0]!.incomplete).toContainEqual({ activityId: roles.unscored, reason: "first pass: unreviewed" });

  // score the rest on the same sheet; committed rows are skipped
  await fill(first, (id) => firstRound[id] ?? "accepted", itemOf);
  await importSheet(dir, first.scores);

  // regenerate the needs-revision activity; the process "dies" after promotion, before the succeeded event
  const store = new FileStore(dir);
  const synthetic = await regenerationResponse(store);
  await expect(regenerateActivity({ importId, activityId: roles.needsRevision, note: "Rehearsal: make the distractors plausible." }, { store: crashBefore(store, "putRegeneration", 1, ([req]) => req.status === "succeeded"), provider: new FakeProvider([fakeResponse({ outputText: synthetic })]), registry, engineIdentity: identity, clock })).rejects.toBeInstanceOf(CrashError);
  expect((await store.listRegenerations(importId)).map((r) => r.status)).toEqual(["running"]);
  // finished by the CLI with no note: no model call, so an empty replay directory and no ledger
  const empty = await mkdtemp(join(tmpdir(), "leap-rehearsal-empty-"));
  const rerun = io();
  expect(await regenerate({ out: dir, activity: roles.needsRevision, libraries, provider: "replay", fixtures: empty }, rerun.io), rerun.err.join("")).toBe(0);
  expect(rerun.out.join("")).toContain(`finished interrupted request ${roles.needsRevision}:regen:1: revision 2 of ${roles.needsRevision} is promoted`);

  // the new revision gets its own sheet and review
  const second = await exportSheet(dir);
  expect(second.rows.map((r) => [r[1], r[2]])).toEqual([[roles.needsRevision, "2"]]);
  await fill(second, () => "accepted", itemOf);
  await importSheet(dir, second.scores);
  const final = await report(dir);
  expect(final.summary.imports[0]!.status).toBe("complete");
  return { incomplete, final };
}

/** Checks a final report: both partitions sum to planned; yields and costs equal what the scoring choices and the attempt records give by hand. */
const TYPES = ["multiChoice", "blanks", "flashcards"] as const;

/**
 * The agreed allocation (design §8.2), computed here from the ledger, not taken from the report: shared cost split by
 * each type's first-pass direct cost, or by planned count when that is all zero; each share rounded down, and the
 * micro-dollars left over given one at a time to the largest remainders, ties in type order.
 */
function expectedAllocation(shared: number, weights: Record<string, number>): Record<string, number> {
  const total = TYPES.reduce((n, t) => n + (weights[t] ?? 0), 0);
  const out: Record<string, number> = Object.fromEntries(TYPES.map((t) => [t, 0]));
  if (total === 0 || shared === 0) return out;
  const parts = TYPES.map((t, i) => ({ t, i, whole: Math.floor((shared * (weights[t] ?? 0)) / total), rest: (shared * (weights[t] ?? 0)) % total }));
  for (const p of parts) out[p.t] = p.whole;
  let left = shared - parts.reduce((n, p) => n + p.whole, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.i - b.i)) { if (left === 0) break; out[p.t]! += 1; left -= 1; }
  return out;
}

async function checkFinal(summary: Summary, dir: string, importId: string, expected: Record<string, { planned: number; firstPass: Record<string, number>; afterRevision: Record<string, number>; regenerations: number }>): Promise<void> {
  const g = summary.imports[0]!;
  const costs = await ledgerCosts(new FileStore(dir), importId);
  expect(g.shared.usdMicro).toBe(costs.shared);
  expect(costs.shared).toBeGreaterThan(0); // costs come from the recorded or fake usage, never zero
  const directTotal = TYPES.reduce((n, t) => n + (costs.firstPass[t] ?? 0), 0);
  const allocation = expectedAllocation(costs.shared, directTotal > 0 ? costs.firstPass : Object.fromEntries(Object.entries(expected).map(([t, w]) => [t, w.planned])));
  let allocated = 0;
  for (const [type, want] of Object.entries(expected)) {
    const t = g.types[type]!;
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(t.planned).toBe(want.planned);
    expect(sum(t.firstPass)).toBe(t.planned);
    expect(sum(t.afterRevision)).toBe(t.planned);
    expect(Object.fromEntries(Object.entries(t.firstPass).filter(([, n]) => n > 0))).toEqual(want.firstPass);
    expect(Object.fromEntries(Object.entries(t.afterRevision).filter(([, n]) => n > 0))).toEqual(want.afterRevision);
    expect(t.regenerations).toEqual({ used: want.regenerations, failed: 0 });
    expect(t.cost.firstPassDirect.usdMicro).toBe(costs.firstPass[type] ?? 0);
    expect(t.cost.regenerationDirect.usdMicro).toBe(costs.regeneration[type] ?? 0);
    expect(t.cost.allocatedSharedUsdMicro, `${type}'s share of the shared cost`).toBe(allocation[type]);
    const fpAccepted = want.firstPass.accepted ?? 0; const arAccepted = want.afterRevision.accepted ?? 0;
    expect(t.cost.firstPassPerAccepted.usdMicro).toBe(fpAccepted === 0 ? null : Math.round((allocation[type]! + (costs.firstPass[type] ?? 0)) / fpAccepted));
    expect(t.cost.afterRevisionPerAccepted.usdMicro).toBe(arAccepted === 0 ? null : Math.round((allocation[type]! + (costs.firstPass[type] ?? 0) + (costs.regeneration[type] ?? 0)) / arAccepted));
    allocated += t.cost.allocatedSharedUsdMicro;
  }
  expect(allocated).toBe(costs.shared); // the allocation shares out exactly the shared cost
}

/** A SYNTHETIC multiChoice response for the regeneration: new wording, citing the first evidence of the plan entry's concepts. */
async function syntheticMultiChoice(store: ImportStore, importId: string, activityId: string): Promise<string> {
  const plan = (await store.getArtifact<ActivityPlan[]>(importId, "plan"))!.find((p) => p.activityId === activityId)!;
  const map = (await store.getArtifact<ConceptMap>(importId, "conceptMap"))!;
  const evidenceIds = map.concepts.filter((c) => plan.conceptIds.includes(c.conceptId)).map((c) => c.evidence[0]!.evidenceId).slice(0, 1);
  return JSON.stringify({ title: "Rehearsal revision", question: "Synthetic rehearsal question: which statement does the cited passage support?", answers: [{ text: "The statement in the cited passage", correct: true, feedback: "The cited passage says so." }, { text: "A statement the passage contradicts", correct: false, feedback: "" }, { text: "A statement the passage does not make", correct: false, feedback: "" }], evidenceIds });
}

async function rehearseS1(): Promise<{ md: string; dir: string }> {
  const base = await mkdtemp(join(tmpdir(), "leap-rehearsal-s1-"));
  const pdf = resolve(root, S1_SETTINGS.sourcePath);
  const extracted = io();
  expect(await extract({ source: pdf, out: join(base, "extract"), chunkTokens: S1_SETTINGS.chunkTokens, repoRoot: null }, extracted.io)).toBe(0);

  const dir = join(base, "s1"); // basename s1 gives import id s1
  const gen = io();
  expect(await generate({ source: pdf, unit: resolve(root, S1_SETTINGS.unitPath), out: dir, types: S1_SETTINGS.selectedTypes.join(","), maxRequests: 200, maxTokens: 2_000_000, maxSeconds: 1800, language: S1_SETTINGS.language, readingLevel: S1_SETTINGS.promptConfig.readingLevel, tone: S1_SETTINGS.promptConfig.tone, libraries, provider: "replay", fixtures: s1Recordings, concurrency: S1_SETTINGS.concurrency }, gen.io), gen.err.join("")).toBe(0);

  // what generate passed to the pipeline, read back from the store, deep-equals S1_SETTINGS
  const store = new FileStore(dir);
  const record = (await store.getImport("s1")) as ImportRecord;
  const expectedInput = await s1Input(1);
  const settings = (await store.getArtifact<{ promptConfig: unknown; rules: unknown; language: string }>("s1", "settings"))!;
  const source = (await store.getArtifact<{ textHash: string; sourceId: string; kind: string; metadata: { extractionVersion: string } }>("s1", "source"))!;
  const fingerprintFor = (chunkTokens: number) => runFingerprint({ sourceTextHash: source.textHash, extractionVersion: source.metadata.extractionVersion, unitText: expectedInput.unitText, selectedTypes: record.selectedTypes, language: record.language, promptConfig: settings.promptConfig as never, customisation: record.customisation, chunkTokens, rules: settings.rules as never });
  const observed = {
    importId: record.importId,
    sourcePath: source.textHash === expectedInput.source.textHash && source.sourceId === expectedInput.source.sourceId && source.metadata.extractionVersion === expectedInput.source.metadata.extractionVersion ? S1_SETTINGS.sourcePath : "(another source)",
    unitPath: record.fingerprint === fingerprintFor(S1_SETTINGS.chunkTokens) ? S1_SETTINGS.unitPath : "(another unit text, or other settings)", // the fingerprint covers the unit text, chunk size and every setting below
    sourceKind: source.kind, selectedTypes: record.selectedTypes, language: record.language, promptConfig: settings.promptConfig, customisation: record.customisation,
    chunkTokens: record.fingerprint === fingerprintFor(S1_SETTINGS.chunkTokens) ? S1_SETTINGS.chunkTokens : "(another chunk size)",
    rules: settings.rules, concurrency: S1_SETTINGS.concurrency // passed as --concurrency above
  };
  expect(observed).toEqual({ ...S1_SETTINGS });
  expect(record.status).toBe("ready");

  const activities = await store.listActivities("s1");
  const mc = activities.filter((a) => a.type === "multiChoice").map((a) => a.activityId);
  const bl = activities.filter((a) => a.type === "blanks").map((a) => a.activityId);
  expect([mc.length, bl.length, activities.length]).toEqual([5, 3, 9]);
  const { final } = await scoringLoop(dir, "s1", { needsRevision: mc[0]!, rejected: mc[1]!, accepted: mc[2]!, unscored: bl[0]! }, (s) => syntheticMultiChoice(s, "s1", mc[0]!));
  const s1Expected = {
    multiChoice: { planned: 5, firstPass: { accepted: 3, needsRevision: 1, rejected: 1 }, afterRevision: { accepted: 4, rejected: 1 }, regenerations: 1 },
    blanks: { planned: 3, firstPass: { accepted: 3 }, afterRevision: { accepted: 3 }, regenerations: 0 },
    flashcards: { planned: 1, firstPass: { accepted: 1 }, afterRevision: { accepted: 1 }, regenerations: 0 }
  };
  await checkFinal(final.summary, dir, "s1", s1Expected);
  // the check is independent of the report's allocation: all shared cost moved to multiChoice must fail it
  const wrong = structuredClone(final.summary);
  const types = wrong.imports[0]!.types;
  types.multiChoice!.cost.allocatedSharedUsdMicro = wrong.imports[0]!.shared.usdMicro;
  types.blanks!.cost.allocatedSharedUsdMicro = 0; types.flashcards!.cost.allocatedSharedUsdMicro = 0;
  await expect(checkFinal(wrong, dir, "s1", s1Expected)).rejects.toThrow(/share of the shared cost/);
  return { md: final.md, dir };
}

async function rehearseDocx(): Promise<{ md: string; dir: string }> {
  const base = await mkdtemp(join(tmpdir(), "leap-rehearsal-docx-"));
  const bytes = await electricalDocx();
  const docxPath = join(base, "electrical.docx");
  await writeFile(docxPath, bytes);
  const extracted = io();
  expect(await extract({ source: docxPath, out: join(base, "extract"), chunkTokens: SYNTHETIC_CHUNK_TOKENS, repoRoot: null }, extracted.io)).toBe(0);

  // generate through runImport with FakeProvider: two multiChoice slots, so the loop has four activities to score
  const dir = join(base, "electrical");
  await mkdir(dir);
  const doc = (await ingestDocx(bytes, { sourceId: "src-electrical.docx", fileName: "electrical.docx" })).document;
  const evidence = passageEvidence(doc as never);
  const { mc, mc2, bl, fc } = produceResponses(doc as never, evidence);
  const r = (v: unknown) => fakeResponse({ outputText: JSON.stringify(v) });
  const script = [r(unitOut), ...conceptResponses(doc as never, evidence).script, r(planOutFor(["multiChoice", "multiChoice", "blanks", "flashcards"])), r(mc), r(mc2), r(bl), r(fc)];
  const store = new FileStore(dir);
  const record = await runImport(
    { importId: "electrical", name: "electrical.docx", source: doc, unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"], budget: { usdMicro: 5_000_000 }, promptConfig: { readingLevel: "high-school", tone: "educational", language: "en" }, language: "en", customisation: null, original: { ext: ".docx", bytes } },
    { store, provider: new FakeProvider(script), registry, engineIdentity: identity, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules: { multiChoice: { perImport: 2 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } }, sleep: async () => undefined, clock }
  );
  expect(record.status).toBe("ready");
  const activities = await store.listActivities("electrical");
  const ids = (t: string) => activities.filter((a) => a.type === t).map((a) => a.activityId);
  expect([ids("multiChoice").length, ids("blanks").length, ids("flashcards").length]).toEqual([2, 1, 1]);

  const lockoutQuestion = { title: "Rehearsal revision", question: "Synthetic rehearsal question: who is allowed to take a lockout device off an isolator?", answers: [{ text: "Only the worker who put it on", correct: true, feedback: "Only the worker who applied a lock may remove it." }, { text: "Whoever finishes the job", correct: false, feedback: "" }, { text: "The next shift's supervisor", correct: false, feedback: "" }], evidenceIds: mc.evidenceIds };
  const [mcA, mcB] = ids("multiChoice") as [string, string];
  const { final } = await scoringLoop(dir, "electrical", { needsRevision: mcA, rejected: ids("blanks")[0]!, accepted: mcB, unscored: ids("flashcards")[0]! }, async () => JSON.stringify(lockoutQuestion));
  await checkFinal(final.summary, dir, "electrical", {
    multiChoice: { planned: 2, firstPass: { accepted: 1, needsRevision: 1 }, afterRevision: { accepted: 2 }, regenerations: 1 },
    blanks: { planned: 1, firstPass: { rejected: 1 }, afterRevision: { rejected: 1 }, regenerations: 0 },
    flashcards: { planned: 1, firstPass: { accepted: 1 }, afterRevision: { accepted: 1 }, regenerations: 0 }
  });
  return { md: final.md, dir };
}

describe("offline pilot rehearsal (plan Task 15)", () => {
  it("S1 replay rehearsal: extract, generate with S1_SETTINGS, score, regenerate through an interruption, and a complete report; a second rehearsal reports identically", async () => {
    const one = await rehearseS1();
    const two = await rehearseS1();
    expect(two.md).toBe(one.md);
  }, 240_000);

  it("DOCX rehearsal with FakeProvider throughout: the same loop, a complete report, and an identical second rehearsal", async () => {
    const one = await rehearseDocx();
    const two = await rehearseDocx();
    expect(two.md).toBe(one.md);
  }, 240_000);
});
