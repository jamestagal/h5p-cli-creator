import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { RUBRIC_VERSION, type ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport, type RunImportDeps, type RunImportInput } from "../src/pipeline/run-import.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import type { PlanRules } from "../src/plan/planner.js";
import type { ScoreRecord } from "../src/store/types.js";
import { exportReviewSheet, sheetIdFor, SheetStateError } from "../src/review/sheet.js";
import { conceptResponses, fullScript, markdownEvidence, planOutFor, produceResponses, syntheticDoc, syntheticUnitText, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { IDENTITY_A } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const rules: PlanRules = { multiChoice: { perImport: 1 }, blanks: { perImport: 1 }, flashcards: { specs: 1, cardsMin: 4, cardsMax: 12 } };
const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const input = async (importId: string, overrides: Partial<RunImportInput> = {}): Promise<RunImportInput> => ({ importId, name: "Synthetic import", source: await syntheticDoc(), unitText: await syntheticUnitText(), selectedTypes: ["multiChoice", "blanks", "flashcards"] as const, budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null, ...overrides });
const deps = (store: MemoryStore, provider: FakeProvider): RunImportDeps => ({ store, provider, registry, engineIdentity: IDENTITY_A, concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules, sleep: async () => undefined });
const at = (iso: string) => () => new Date(iso);

/** A complete import of the synthetic packet and unit: act-1 multiChoice, act-2 blanks, act-3 flashcards, all promoted. */
async function completeImport(importId: string): Promise<MemoryStore> {
  const store = new MemoryStore();
  await runImport(await input(importId), deps(store, new FakeProvider(await fullScript(await syntheticDoc()))));
  return store;
}

/** The same import with no unit: no alignment, no targets. */
async function importWithoutUnit(importId: string): Promise<MemoryStore> {
  const store = new MemoryStore(); const doc = await syntheticDoc();
  const { script } = conceptResponses(doc);
  const { mc, bl, fc } = produceResponses(doc);
  const withoutAlign = script.slice(0, -1); // align is not called without a unit
  const plan = planOutFor(["multiChoice", "blanks", "flashcards"]);
  const noCriteria = { activities: plan.activities.map((a) => ({ ...a, criteriaIds: [] })) }; // no unit, so no criteria to cite
  await runImport(await input(importId, { unitText: null }), deps(store, new FakeProvider([...withoutAlign, r(noCriteria), r(mc), r(bl), r(fc)])));
  return store;
}

const csvRows = (csv: string) => csv.trimEnd().split("\n").map((line) => line.split(","));
const score = (overrides: Partial<ScoreRecord>): ScoreRecord => ({
  rowKey: "k", batchId: "b", sequence: 1, rowIndex: 0, sheetId: "s", importId: "imp", activityId: "act-1", revision: 1, buildId: "x", unitTextHash: null, rubricVersion: RUBRIC_VERSION, reviewer: "r",
  scores: { correctness: 2, support: 2, distractors: 2, mapping: 2, usefulness: 2 }, findings: [], minutes: 3, decision: "accepted", decidedAt: "2026-10-02T00:00:00.000Z", ...overrides
});

describe("the sheet manifest (R1)", () => {
  it("is written once: exporting again with nothing changed gives the same sheetId and no new manifest", async () => {
    const store = await completeImport("imp-sheet");
    const first = (await exportReviewSheet(store, "imp-sheet", at("2026-10-02T01:00:00Z")))!;
    expect(first.created).toBe(true);
    expect(first.manifest).toMatchObject({ importId: "imp-sheet", rubricVersion: "r1", createdAt: "2026-10-02T01:00:00.000Z" });
    expect(first.manifest.sheetId).toBe(sheetIdFor(first.manifest));
    expect(first.manifest.entries.map((e) => [e.activityId, e.type, e.itemIds])).toEqual([
      ["act-1", "multiChoice", ["act-1"]],
      ["act-2", "blanks", ["b1", "b2"]],
      ["act-3", "flashcards", ["c1", "c2", "c3", "c4"]]
    ]);
    const unit = (await store.getArtifact<UnitOfCompetency>("imp-sheet", "unit"))!;
    expect(first.manifest.unitTextHash).toBe(unit.textHash);
    for (const e of first.manifest.entries) {
      const a = (await store.listActivities("imp-sheet")).find((x) => x.activityId === e.activityId)!;
      expect(e.revision).toBe(a.currentRevision);
      expect(e.buildId).toBe((await store.getRevision(e.activityId, e.revision))!.currentBuildId);
    }

    const again = (await exportReviewSheet(store, "imp-sheet", at("2026-10-03T09:00:00Z")))!;
    expect(again.created).toBe(false);
    expect(again.manifest.sheetId).toBe(first.manifest.sheetId);
    expect(await store.listSheets("imp-sheet")).toHaveLength(1);
    expect((await store.getSheet("imp-sheet", first.manifest.sheetId))!.createdAt).toBe("2026-10-02T01:00:00.000Z"); // never rewritten
  });

  it("leaves out an activity whose current build has a counted scored review, but not one whose review is of an older build", async () => {
    const store = await completeImport("imp-scored");
    const rev1 = (await store.getRevision("act-1", 1))!;
    await store.putScore(score({ importId: "imp-scored", activityId: "act-1", revision: 1, buildId: rev1.currentBuildId! }));
    await store.putScore(score({ importId: "imp-scored", activityId: "act-2", revision: 1, buildId: "an-older-build" }));
    const sheet = (await exportReviewSheet(store, "imp-scored", at("2026-10-02T01:00:00Z")))!;
    expect(sheet.manifest.entries.map((e) => e.activityId)).toEqual(["act-2", "act-3"]);
    const all = await completeImport("imp-scored");
    expect(sheet.manifest.sheetId).not.toBe((await exportReviewSheet(all, "imp-scored", at("2026-10-02T01:00:00Z")))!.manifest.sheetId);
  });

  it("returns null and writes nothing when no activity needs a review", async () => {
    const store = await completeImport("imp-done");
    for (const a of await store.listActivities("imp-done")) {
      const rev = (await store.getRevision(a.activityId, a.currentRevision!))!;
      await store.putScore(score({ importId: "imp-done", activityId: a.activityId, revision: rev.revision, buildId: rev.currentBuildId!, decision: "needs-revision" }));
    }
    expect(await exportReviewSheet(store, "imp-done")).toBeNull();
    expect(await store.listSheets("imp-done")).toEqual([]);
  });
});

describe("a promoted activity with missing or inconsistent state is refused, never skipped", () => {
  const cases: Array<[string, (store: MemoryStore) => Promise<void>, RegExp]> = [
    ["a missing build record", async (store) => { const rev = (await store.getRevision("act-2", 1))!; await store.putRevision({ ...rev, currentBuildId: "0000000000000000" }); }, /activity act-2 revision 1 points at build 0000000000000000, whose build record is missing/],
    ["no current build", async (store) => { const rev = (await store.getRevision("act-2", 1))!; await store.putRevision({ ...rev, currentBuildId: null }); }, /activity act-2 revision 1 is promoted but has no current build/],
    ["a missing revision", async (store) => { const a = (await store.listActivities("imp-broken")).find((x) => x.activityId === "act-2")!; await store.putActivity({ ...a, currentRevision: 7 }); }, /activity act-2 is promoted at revision 7, which is missing from the store/],
    ["no current revision", async (store) => { const a = (await store.listActivities("imp-broken")).find((x) => x.activityId === "act-2")!; await store.putActivity({ ...a, currentRevision: null }); }, /activity act-2 is promoted but has no current revision/],
    ["a revision that is not promoted", async (store) => { const rev = (await store.getRevision("act-2", 1))!; await store.putRevision({ ...rev, state: "candidate" }); }, /activity act-2 is promoted at revision 1, whose state is candidate/],
    ["another activity's build", async (store) => { const other = (await store.getRevision("act-1", 1))!; const rev = (await store.getRevision("act-2", 1))!; await store.putRevision({ ...rev, currentBuildId: other.currentBuildId }); }, /activity act-2 revision 1 points at build \w+, which belongs to act-1 revision 1/]
  ];
  for (const [name, damage, message] of cases) {
    it(`throws SheetStateError for ${name} and writes no manifest`, async () => {
      const store = await completeImport("imp-broken");
      await damage(store);
      const refused = await exportReviewSheet(store, "imp-broken").catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(SheetStateError);
      expect((refused as Error).message).toMatch(message);
      expect(await store.listSheets("imp-broken")).toEqual([]);
    });
  }
});

describe("scores.csv and findings.csv", () => {
  const header = ["sheetId", "activityId", "revision", "buildId", "correctness", "support", "distractors", "mapping", "usefulness", "minutes", "decision"];

  it("pre-fill na for distractors on flashcards and blanks; every other score cell is blank; findings.csv is a header only", async () => {
    const store = await completeImport("imp-na");
    const sheet = (await exportReviewSheet(store, "imp-na"))!;
    const rows = csvRows(sheet.scoresCsv);
    expect(rows[0]).toEqual(header);
    const byActivity = new Map(rows.slice(1).map((row) => [row[1], row]));
    expect(byActivity.get("act-1")!.slice(4)).toEqual(["", "", "", "", "", "", ""]);
    expect(byActivity.get("act-2")!.slice(4)).toEqual(["", "", "na", "", "", "", ""]);
    expect(byActivity.get("act-3")!.slice(4)).toEqual(["", "", "na", "", "", "", ""]);
    for (const row of rows.slice(1)) {
      const entry = sheet.manifest.entries.find((e) => e.activityId === row[1])!;
      expect(row.slice(0, 4)).toEqual([sheet.manifest.sheetId, entry.activityId, String(entry.revision), entry.buildId]);
    }
    expect(sheet.findingsCsv).toBe("sheetId,activityId,dimension,itemId,score,reason\n");
  });

  it("pre-fill na for mapping on every activity when the import has no unit", async () => {
    const store = await importWithoutUnit("imp-nounit");
    const sheet = (await exportReviewSheet(store, "imp-nounit"))!;
    expect(sheet.manifest.unitTextHash).toBeNull();
    const byActivity = new Map(csvRows(sheet.scoresCsv).slice(1).map((row) => [row[1], row]));
    expect(byActivity.get("act-1")!.slice(4, 9)).toEqual(["", "", "", "na", ""]);
    expect(byActivity.get("act-2")!.slice(4, 9)).toEqual(["", "", "na", "na", ""]);
    expect(sheet.markdown).toContain("No unit of competency: mapping is not scored.");
  });
});

describe("review-sheet.md (design §4.4, §7.1)", () => {
  it("shows the content, keyed answers, item IDs and count, (a) cited passages in full with sentence IDs, (b) targets with kind, path and text, the unit and the package path", async () => {
    const store = await completeImport("imp-md");
    const doc = await syntheticDoc(); const evidence = markdownEvidence(doc);
    const sheet = (await exportReviewSheet(store, "imp-md"))!;
    const md = sheet.markdown;
    expect(md).toContain(`Sheet ${sheet.manifest.sheetId}`);
    expect(md).toContain("Rubric r1");
    const act1 = md.slice(md.indexOf("## act-1"), md.indexOf("## act-2"));
    expect(act1).toContain("Who may remove a lockout device from an isolator?");
    expect(act1).toMatch(/Keyed answer: The worker who applied it/);
    expect(act1).toContain("Items (1): act-1");
    for (const id of evidence.lotoRemove) expect(act1).toContain(`[${id}] ${doc.sentences.find((s) => s.sentenceId === id)!.text}`);
    expect(act1).toMatch(/\(b\) Targets[\s\S]*- PC2\.1 \(pc, under: Isolate and secure equipment\): Apply lockout devices and tags/);
    expect(act1).toContain("(c) Flagged RTO-instruction passages: none cited");
    const unit = (await store.getArtifact<UnitOfCompetency>("imp-md", "unit"))!;
    expect(act1).toContain(`Unit ${unit.code}, Release 1, text ${unit.textHash.slice(0, 12)}`);
    const rev = (await store.getRevision("act-1", 1))!;
    const build = (await store.getBuildRecord(rev.currentBuildId!))!;
    expect(act1).toContain(`Package: ${build.buildKey}`);
    const act2 = md.slice(md.indexOf("## act-2"), md.indexOf("## act-3"));
    expect(act2).toContain("Items (2): b1, b2");
    expect(act2).toMatch(/#### Item b1\n\nKeyed answer: dead/);
    const act3 = md.slice(md.indexOf("## act-3"));
    expect(act3).toContain("Items (4): c1, c2, c3, c4");
  });

  it("shows each card and blank with its own passages and targets: items citing different evidence show different passages", async () => {
    const store = await completeImport("imp-items");
    const doc = await syntheticDoc(); const evidence = markdownEvidence(doc);
    const text = (id: string) => `[${id}] ${doc.sentences.find((s) => s.sentenceId === id)!.text}`;
    const md = (await exportReviewSheet(store, "imp-items"))!.markdown;
    const item = (activity: string, id: string) => { const a = md.slice(md.indexOf(`## ${activity}`)); const from = a.indexOf(`#### Item ${id}`); return a.slice(from, a.indexOf("####", from + 5) === -1 ? a.indexOf("### (a)", from) : Math.min(a.indexOf("####", from + 5), a.indexOf("### (a)", from))); };
    const b1 = item("act-2", "b1"); const b2 = item("act-2", "b2");
    for (const id of evidence.tfdA) { expect(b1).toContain(text(id)); expect(b2).not.toContain(text(id)); }
    for (const id of evidence.tfdB) { expect(b2).toContain(text(id)); expect(b1).not.toContain(text(id)); }
    const c1 = item("act-3", "c1"); const c2 = item("act-3", "c2");
    expect(c1).toContain("Front: Who may remove a lock");
    expect(c1).toContain("Keyed back: Only the worker who applied it");
    for (const id of evidence.lotoRemove) { expect(c1).toContain(text(id)); expect(c2).not.toContain(text(id)); }
    for (const id of evidence.lotoTag) { expect(c2).toContain(text(id)); expect(c1).not.toContain(text(id)); }
    expect(b1).toMatch(/\(b\) Targets:\n- PC2\.2 \(pc/); // each item's own targets
  });

  it("shows the published assessment conditions verbatim with the unit identity, even when the packet says otherwise", async () => {
    const store = await completeImport("imp-conditions");
    const unit = (await store.getArtifact<UnitOfCompetency>("imp-conditions", "unit"))!;
    expect(unit.assessmentConditions).toContain("simulated environment");
    const md = (await exportReviewSheet(store, "imp-conditions"))!.markdown;
    const line = `Assessment conditions (published unit, verbatim): ${unit.assessmentConditions}`;
    const header = md.slice(0, md.indexOf("## act-1"));
    expect(header).toContain(`Unit ${unit.code} ${unit.title}, Release 1, text ${unit.textHash.slice(0, 12)}\n${line}`);
    for (const id of ["act-1", "act-2", "act-3"]) {
      const section = md.slice(md.indexOf(`## ${id}`)).split("\n## ")[0]!;
      expect(section, id).toContain(line);
    }
    const doc = await syntheticDoc();
    const packetSays = markdownEvidence(doc).rto.map((sid) => doc.sentences.find((s) => s.sentenceId === sid)!.text).join(" ");
    expect(md).not.toContain(packetSays); // the packet's own arrangement is never shown as the unit's conditions
    const without = await completeImport("imp-noconditions");
    await without.putArtifact("imp-noconditions", "unit", { ...unit, assessmentConditions: null });
    expect((await exportReviewSheet(without, "imp-noconditions"))!.markdown).toContain("Assessment conditions: none in the published unit text");
  });

  it("negative fixture: never cites the no-simulated-option statement for an activity; a cited sentence the extractor classed as an RTO instruction appears flagged in (c)", async () => {
    const store = await completeImport("imp-rto");
    const doc = await syntheticDoc(); const evidence = markdownEvidence(doc);
    const rtoText = evidence.rto.map((id) => doc.sentences.find((s) => s.sentenceId === id)!.text).join(" ");
    const plain = (await exportReviewSheet(store, "imp-rto"))!.markdown;
    expect(plain).not.toContain(rtoText);
    expect(plain.match(/\(c\) Flagged RTO-instruction passages: none cited/g)).toHaveLength(3);

    // The extractor classes a sentence that act-1 cites as an RTO instruction too: the sheet must flag it in (c).
    const map = (await store.getArtifact<ConceptMap>("imp-rto", "conceptMap"))!;
    const cited = (await store.getRevision("act-1", 1))!.spec.provenance!.evidenceIds[0]!;
    const citedEvidence = map.concepts.flatMap((c) => c.evidence).find((e) => e.evidenceId === cited)!;
    await store.putArtifact("imp-rto", "conceptMap", { ...map, concepts: map.concepts.map((c) => (c.kind === "rto-instruction" ? { ...c, evidence: [...c.evidence, citedEvidence] } : c)) });
    const flagged = (await exportReviewSheet(store, "imp-rto"))!.markdown;
    const act1 = flagged.slice(flagged.indexOf("## act-1"), flagged.indexOf("## act-2"));
    expect(act1).toContain("(c) Flagged RTO-instruction passages (check that the activity does not present them as facts about the unit):");
    expect(act1).toContain(`- [${citedEvidence.sentenceId}] ${citedEvidence.quote} (cited by the activity)`);

    // A sentence one card cites: (c) names that card, and no other activity is flagged.
    const cardEvidenceId = (await store.getRevision("act-3", 1))!.spec.type === "flashcards" ? ((await store.getRevision("act-3", 1))!.spec as { cards: Array<{ id: string; provenance?: { evidenceIds: string[] } }> }).cards.find((c) => c.id === "c2")!.provenance!.evidenceIds[0]! : "";
    const cardEvidence = map.concepts.flatMap((c) => c.evidence).find((e) => e.evidenceId === cardEvidenceId)!;
    await store.putArtifact("imp-rto", "conceptMap", { ...map, concepts: map.concepts.map((c) => (c.kind === "rto-instruction" ? { ...c, evidence: [...c.evidence, cardEvidence] } : c)) });
    const byCard = (await exportReviewSheet(store, "imp-rto"))!.markdown;
    const act3 = byCard.slice(byCard.indexOf("## act-3"));
    expect(act3).toContain(`- [${cardEvidence.sentenceId}] ${cardEvidence.quote} (cited by the activity, c2)`); // the activity's own provenance also cites it
    expect(byCard.slice(byCard.indexOf("## act-1"), byCard.indexOf("## act-3")).match(/\(c\) Flagged RTO-instruction passages: none cited/g)).toHaveLength(2);
  });
});
