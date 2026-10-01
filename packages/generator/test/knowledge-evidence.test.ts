import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { targetsOf, type ConceptMap, type UnitOfCompetency } from "@leaplearn/shared";
import { parseUnit } from "../src/competency/parse-unit.js";
import { mergeConcepts, type ChunkConcept } from "../src/concepts/index.js";
import { alignConcepts } from "../src/concepts/align.js";
import { planActivities, DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { createRunner, ContentFailure } from "../src/llm/runner.js";
import { createBudget } from "../src/llm/budget.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { DEFAULT_PROMPT_CONFIG } from "../src/prompts/system.js";
import { MemoryRecorder, conceptResponses, markdownEvidence, planOutFor, syntheticDoc, syntheticUnitText, unitOut, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";
import { testIdentity } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

const r = (value: unknown) => fakeResponse({ outputText: JSON.stringify(value) });
const runnerFor = (provider: FakeProvider) => createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 10_000_000 }), operationId: "op", origin: "shared", requestId: null, sleep: async () => undefined });
const parse = async (responses: unknown[], text?: string) => {
  const provider = new FakeProvider(responses.map(r));
  const unit = await parseUnit(text ?? (await syntheticUnitText()), runnerFor(provider));
  return { unit, provider };
};
const withKe = (ke: typeof unitOut.knowledgeEvidence) => ({ ...unitOut, knowledgeEvidence: ke });

describe("Knowledge Evidence: a tree with IDs assigned in code, wording verbatim", () => {
  it("nested KE bullets give KE1, KE2, KE2.1, KE2.2 with the wording verbatim; release and assessment conditions as printed", async () => {
    const { unit } = await parse([unitOut]);
    expect(unit.knowledgeEvidence).toEqual([
      { id: "KE1", text: "types of electrical hazards including stored energy and multiple supplies", children: [] },
      { id: "KE2", text: "purpose of lockout devices and tags, including:", children: [
        { id: "KE2.1", text: "personal padlocks that only the applying worker may remove", children: [] },
        { id: "KE2.2", text: "multi-lock hasps used when several workers share an isolation point", children: [] }
      ] }
    ]);
    expect(unit.release).toBe("Release 1");
    expect(unit.assessmentConditions).toBe(unitOut.assessmentConditions);
  });

  it("paraphrased KE text in a fake response triggers a content retry; three paraphrases fail the stage", async () => {
    const paraphrased = withKe(unitOut.knowledgeEvidence.map((k) => (k.index === 2 ? { ...k, text: "personal locks only the worker can take off" } : k)));
    const { unit, provider } = await parse([paraphrased, unitOut]);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.user).toMatch(/personal locks only the worker can take off/);
    expect(unit.knowledgeEvidence[1]!.children[0]!.text).toBe("personal padlocks that only the applying worker may remove");
    await expect(parse([paraphrased, paraphrased, paraphrased])).rejects.toBeInstanceOf(ContentFailure);
  });

  it("an invalid parent index (unknown, later in the list, or itself) is a content retry; repeated indices too", async () => {
    const bad = [
      withKe([{ index: 0, parentIndex: null, text: unitOut.knowledgeEvidence[0]!.text }, { index: 1, parentIndex: 7, text: unitOut.knowledgeEvidence[1]!.text }]),
      withKe([{ index: 0, parentIndex: 1, text: unitOut.knowledgeEvidence[0]!.text }, { index: 1, parentIndex: null, text: unitOut.knowledgeEvidence[1]!.text }]),
      withKe([{ index: 0, parentIndex: 0, text: unitOut.knowledgeEvidence[0]!.text }]),
      withKe([{ index: 0, parentIndex: null, text: unitOut.knowledgeEvidence[0]!.text }, { index: 0, parentIndex: null, text: unitOut.knowledgeEvidence[1]!.text }])
    ];
    for (const b of bad) {
      const { unit, provider } = await parse([b, unitOut]);
      expect(provider.requests, JSON.stringify(b.knowledgeEvidence)).toHaveLength(2);
      expect(unit.knowledgeEvidence.map((k) => k.id)).toEqual(["KE1", "KE2"]);
    }
  });

  it("assessment conditions are parsed verbatim (whitespace aside), and a paraphrase is rejected", async () => {
    const spaced = { ...unitOut, assessmentConditions: unitOut.assessmentConditions.replace(" in the workplace", "  in the\nworkplace") };
    expect((await parse([spaced])).unit.assessmentConditions).toBe(spaced.assessmentConditions);
    const paraphrase = { ...unitOut, assessmentConditions: "Assessment happens at work or in a simulation." };
    const { unit, provider } = await parse([paraphrase, unitOut]);
    expect(provider.requests).toHaveLength(2);
    expect(unit.assessmentConditions).toBe(unitOut.assessmentConditions);
    expect((await parse([{ ...unitOut, assessmentConditions: null }], (await syntheticUnitText()).split("\nAssessment Conditions")[0]!)).unit.assessmentConditions).toBeNull();
  });

  it("the same unit text gives the same IDs; a changed unit text gives a different unitTextHash", async () => {
    const text = await syntheticUnitText();
    const a = (await parse([unitOut], text)).unit;
    const b = (await parse([unitOut], text)).unit;
    expect(targetsOf(b).map((t) => t.id)).toEqual(targetsOf(a).map((t) => t.id));
    expect(b.textHash).toBe(a.textHash);
    const changed = (await parse([unitOut], `${text}\nAdditional note for assessors.`)).unit;
    expect(changed.textHash).not.toBe(a.textHash);
  });

  it("targetsOf lists every PC and then every KE node, depth first, with kind, text and path", async () => {
    const { unit } = await parse([unitOut]);
    const targets = targetsOf(unit);
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual(["pc:PC1.1", "pc:PC1.2", "pc:PC2.1", "pc:PC2.2", "pc:PC3.1", "pc:PC3.2", "pc:PC3.3", "ke:KE1", "ke:KE2", "ke:KE2.1", "ke:KE2.2"]);
    expect(targets.find((t) => t.id === "PC2.2")).toEqual({ id: "PC2.2", kind: "pc", text: "Test for dead using a proved voltage tester", path: ["Isolate and secure equipment"] });
    expect(targets.find((t) => t.id === "KE2.1")).toEqual({ id: "KE2.1", kind: "ke", text: "personal padlocks that only the applying worker may remove", path: ["purpose of lockout devices and tags, including:"] });
    expect(targets.find((t) => t.id === "KE1")!.path).toEqual([]);
  });
});

describe("RTO instructions: classified, kept through merge, never aligned or planned", () => {
  const ev = (id: string) => ({ evidenceId: `ev-${id}`, sentenceId: id, charStart: 0, charEnd: 1, quote: "x" });
  const chunkConcept = (tempId: string, name: string, kind: "content" | "rto-instruction"): ChunkConcept => ({ tempId, name, summary: `${name}.`, kind, evidence: [ev(tempId)] });

  it("the merge keeps kind, and rto-instruction wins when merged members disagree", async () => {
    const provider = new FakeProvider([r({ concepts: [{ name: "Assessment", summary: "How assessment runs.", memberIds: ["k0-0", "k1-0"] }, { name: "Isolation", summary: "Isolate first.", memberIds: ["k1-1"] }] })]);
    const merged = await mergeConcepts([[chunkConcept("k0-0", "Assessment", "content")], [chunkConcept("k1-0", "Workplace-only assessment", "rto-instruction"), chunkConcept("k1-1", "Isolation", "content")]], runnerFor(provider));
    expect(merged.map((c) => [c.conceptId, c.kind])).toEqual([["c1", "rto-instruction"], ["c2", "content"]]);
    const single = await mergeConcepts([[chunkConcept("k0-0", "Workplace-only assessment", "rto-instruction")]], runnerFor(new FakeProvider([])));
    expect(single[0]!.kind).toBe("rto-instruction");
  });

  it("alignment returns an entry for every PC and KE node, offers only content concepts, and reports unsupported KE nodes", async () => {
    const { unit } = await parse([unitOut]);
    const concepts = [
      { conceptId: "c1", kind: "content" as const, name: "Lockout", summary: "Locks.", evidence: [ev("s1")] },
      { conceptId: "c2", kind: "rto-instruction" as const, name: "Workplace-only assessment", summary: "This provider assesses at work.", evidence: [ev("s2")] }
    ];
    const all = targetsOf(unit).map((t) => t.id);
    const provider = new FakeProvider([r({ criteria: all.map((id) => ({ criterionId: id, conceptIds: id === "KE2" || id === "PC2.1" ? ["c1"] : [] })) })]);
    const alignment = await alignConcepts(concepts, unit, runnerFor(provider));
    expect(alignment.criteria.map((c) => c.criterionId)).toEqual(all);
    expect(alignment.unsupportedCriteriaIds).toEqual(all.filter((id) => id !== "KE2" && id !== "PC2.1"));
    expect(alignment.unsupportedCriteriaIds).toContain("KE2.2");
    expect(alignment.unitTextHash).toBe(unit.textHash);
    expect(provider.requests[0]!.user).toContain("KE2.1: personal padlocks that only the applying worker may remove");
    expect(provider.requests[0]!.user).not.toContain("c2:");
    expect(provider.requests[0]!.user).not.toContain("Workplace-only assessment");

    const citesRto = new FakeProvider([r({ criteria: all.map((id) => ({ criterionId: id, conceptIds: id === "PC1.1" ? ["c2"] : [] })) }), r({ criteria: all.map((id) => ({ criterionId: id, conceptIds: [] })) })]);
    await alignConcepts(concepts, unit, runnerFor(citesRto));
    expect(citesRto.requests).toHaveLength(2); // citing the RTO-instruction concept is a content retry
    const missingKe = new FakeProvider([r({ criteria: all.filter((id) => id !== "KE2.2").map((id) => ({ criterionId: id, conceptIds: [] })) }), r({ criteria: all.map((id) => ({ criterionId: id, conceptIds: [] })) })]);
    await alignConcepts(concepts, unit, runnerFor(missingKe));
    expect(missingKe.requests).toHaveLength(2); // a missing KE node is a content retry
  });

  it("the planner never offers or allocates an rto-instruction concept", async () => {
    const map: ConceptMap = { sourceId: "s", textHash: "a".repeat(64), concepts: [
      { conceptId: "c1", kind: "content", name: "Lockout", summary: "Locks.", evidence: [ev("s1")] },
      { conceptId: "c2", kind: "rto-instruction", name: "Workplace-only assessment", summary: "This provider assesses at work.", evidence: [ev("s2")] }
    ] };
    const plan = (conceptIds: string[]) => r({ activities: [{ slot: 1, type: "multiChoice", conceptIds, criteriaIds: [], focus: "f" }] });
    const provider = new FakeProvider([plan(["c2"]), plan(["c1"])]);
    const activities = await planActivities(map, ["multiChoice"], runnerFor(provider), { ...DEFAULT_PLAN_RULES, multiChoice: { perImport: 5 } });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]!.user).not.toContain("c2:");
    expect(provider.requests[0]!.user).toContain("slot 1: multiChoice");
    expect(provider.requests[0]!.user).not.toContain("slot 2"); // slots count content concepts only
    expect(activities.map((a) => a.conceptIds)).toEqual([["c1"]]);
  });

  it("negative test: with the synthetic packet and unit, the no-simulated-option statement is an rto-instruction concept, never aligned or planned, and the unit's conditions still allow a simulated environment", async () => {
    const doc = await syntheticDoc();
    const evidence = markdownEvidence(doc);
    const { script } = conceptResponses(doc, evidence);
    const store = new MemoryStore();
    const provider = new FakeProvider([r(unitOut), ...script, r(planOutFor(["multiChoice"]))]);
    await runImport(
      { importId: "imp-rto", name: "n", source: doc, unitText: await syntheticUnitText(), selectedTypes: ["multiChoice"], budget: { usdMicro: 5_000_000 }, promptConfig: DEFAULT_PROMPT_CONFIG, language: "en", customisation: null },
      { store, provider, registry, engineIdentity: testIdentity("x"), concurrency: 1, chunkTokens: SYNTHETIC_CHUNK_TOKENS, rules: { ...DEFAULT_PLAN_RULES, multiChoice: { perImport: 1 } }, sleep: async () => undefined }
    ).catch(() => undefined); // stops at the first produce call: the script ends after the plan
    const map = (await store.getArtifact<ConceptMap>("imp-rto", "conceptMap"))!;
    const rto = map.concepts.filter((c) => c.kind === "rto-instruction");
    expect(rto).toHaveLength(1);
    expect(rto[0]!.evidence.map((e) => e.sentenceId)).toEqual(evidence.rto);
    const align = provider.requests.find((q) => q.purpose === "align")!;
    const planRequest = provider.requests.find((q) => q.purpose === "plan")!;
    expect(align.user).not.toContain(`${rto[0]!.conceptId}:`);
    expect(planRequest.user).not.toContain(`${rto[0]!.conceptId}:`);
    for (const a of await store.listActivities("imp-rto")) expect(a.conceptIds).not.toContain(rto[0]!.conceptId);
    expect(map.alignment!.criteria.every((c) => !c.conceptIds.includes(rto[0]!.conceptId))).toBe(true);
    const unit = (await store.getArtifact<UnitOfCompetency>("imp-rto", "unit"))!;
    expect(unit.assessmentConditions).toContain("in a simulated environment");
    for (const a of await store.listActivities("imp-rto")) expect(a.unitTextHash).toBe(unit.textHash);
  });
});
