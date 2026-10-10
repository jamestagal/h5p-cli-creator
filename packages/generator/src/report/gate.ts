import { DIMENSIONS, RUBRIC_VERSION, targetsOf, type ActivitySpec, type ConceptMap, type Dimension, type ScoreDecision, type UnitOfCompetency } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import type { AttemptEvent, AttemptOutcome, AttemptStart } from "../llm/types.js";
import type { ActivityPlan, PlannedType } from "../plan/planner.js";
import { SKIPPED_PREFIX } from "../pipeline/run-import.js";
import { countedScore } from "../review/scores.js";
import { latestRegenerations } from "../store/builds.js";
import type { ActivityRecord, BuildRecord, ImportRecord, ImportStore, OperationRecord, RegenerationRequest, RevisionRecord, ScoreRecord } from "../store/types.js";
import type { GenerationScopeRecord } from "../scope/authoritative.js";
import { scopeFigures, scopeLine, SCOPE_UNSUPPORTED_NOTE, type ScopeFigures } from "./scope.js";

/** The planned types, in report order. */
export const GATE_TYPES: readonly PlannedType[] = ["multiChoice", "blanks", "flashcards"];

/** Design §9: the minimum planned sample across the corpus before the full gate can be claimed (C6: a size, not a confidence). */
export const PLANNED_MINIMUM: Record<PlannedType, number> = { multiChoice: 25, blanks: 15, flashcards: 5 };

/** Design §8.3: provisional pilot targets. They are not pass or fail until frozen; nothing here evaluates them. */
export const PROVISIONAL_TARGETS = {
  frozen: false,
  targets: ["first-pass acceptance >= 80% per type", "source support at 2 >= 90%", "mapping at 2 >= 75% (with a unit)", "distractors and usefulness: distribution reported", "review minutes <= 3 per activity (monitoring)", "cost per accepted activity <= $0.05 (provisional, not a failure threshold)"]
} as const;

/** A reason prefix the review sheet documents for §4.4 violations: an RTO's own arrangement stated as a fact about the unit. */
export const RTO_CLAIM_PREFIX = "rto-claim";
export const isRtoClaim = (reason: string): boolean => reason.trim().toLowerCase().startsWith(RTO_CLAIM_PREFIX);

export const FIRST_PASS_CATEGORIES = ["dropped", "notAttempted", "inProgress", "buildPending", "generationFailed", "unreviewed", "accepted", "needsRevision", "rejected"] as const;
export const AFTER_REVISION_CATEGORIES = ["dropped", "notAttempted", "inProgress", "buildPending", "generationFailed", "awaitingReview", "accepted", "needsRevision", "rejected"] as const;
export type FirstPassCategory = (typeof FIRST_PASS_CATEGORIES)[number];
export type AfterRevisionCategory = (typeof AFTER_REVISION_CATEGORIES)[number];
const SCORE_KEYS = ["0", "1", "2", "na"] as const;
type Distribution = Record<Dimension, Record<(typeof SCORE_KEYS)[number], number>>;

/** Everything the gate reads from one version-2 import (R10): plan, activities, operations, attempts, then revisions, builds and scores. */
export interface ImportSnapshot {
  importRecord: ImportRecord;
  unit: UnitOfCompetency | null;
  plan: ActivityPlan[];
  conceptMap: ConceptMap | null;
  extractionVersion: string | null;
  activities: ActivityRecord[];
  operations: OperationRecord[];
  attempts: AttemptEvent[];
  revisions: RevisionRecord[];
  builds: BuildRecord[];
  scores: ScoreRecord[];
  regenerations: RegenerationRequest[];
  /** The stored generationScope record and whether the entries history exists; absent (as in snapshots built by hand) reads as none. */
  generationScope?: GenerationScopeRecord | null;
  generationScopeEntries?: boolean;
}

export async function snapshotImport(store: ImportStore, importId: string): Promise<ImportSnapshot> {
  const importRecord = await store.getImport(importId);
  if (!importRecord) throw new Error(`import ${importId} is not in this store`);
  const plan = (await store.getArtifact<ActivityPlan[]>(importId, "plan")) ?? [];
  const activities = await store.listActivities(importId);
  const ids = [...new Set([...plan.map((p) => p.activityId), ...activities.map((a) => a.activityId)])];
  const revisions: RevisionRecord[] = []; const builds: BuildRecord[] = [];
  for (const id of ids) { revisions.push(...(await store.listRevisions(id))); builds.push(...(await store.listBuilds(id)).filter((b) => b.importId === importId)); }
  return {
    importRecord, plan, activities, revisions, builds,
    unit: await store.getArtifact<UnitOfCompetency>(importId, "unit"),
    conceptMap: await store.getArtifact<ConceptMap>(importId, "conceptMap"),
    extractionVersion: (await store.getArtifact<SourceDocument>(importId, "source"))?.metadata.extractionVersion ?? null,
    operations: await store.listOperations(importId),
    attempts: await store.listAttempts(importId),
    scores: await store.listScores(importId),
    regenerations: latestRegenerations(await store.listRegenerations(importId)),
    generationScope: await store.getArtifact<GenerationScopeRecord>(importId, "generationScope"),
    generationScopeEntries: (await store.getArtifact(importId, "generationScopeEntries")) !== null
  };
}

/** A sum of attempt costs. Attempts with an unavailable cost, and starts with no outcome, are never priced at zero: they are excluded and counted. */
export interface CostSum { usdMicro: number; attempts: number; unavailable: number; uncertain: { attempts: number; reservedUsdMicro: number } }
const emptyCost = (): CostSum => ({ usdMicro: 0, attempts: 0, unavailable: 0, uncertain: { attempts: 0, reservedUsdMicro: 0 } });
/** How many attempts without a cost a figure built from these sums leaves out; non-zero makes it a lower bound. */
export const withoutCost = (...sums: CostSum[]): number => sums.reduce((n, s) => n + s.unavailable + s.uncertain.attempts, 0);
function addCost(into: CostSum, from: CostSum): void {
  into.usdMicro += from.usdMicro; into.attempts += from.attempts; into.unavailable += from.unavailable;
  into.uncertain.attempts += from.uncertain.attempts; into.uncertain.reservedUsdMicro += from.uncertain.reservedUsdMicro;
}

export interface MinuteStats { values: number[]; items: number }
export interface ActivityGate {
  activityId: string; type: PlannedType;
  firstPass: FirstPassCategory; firstPassRevision: number | null; firstPassHistorical: boolean;
  afterRevision: AfterRevisionCategory; afterRevisionRevision: number | null;
  regenerations: { used: number; failed: number; running: number };
}
export interface TypeGate {
  planned: number;
  firstPass: Record<FirstPassCategory, number>; historical: number;
  afterRevision: Record<AfterRevisionCategory, number>;
  regenerations: { used: number; failed: number };
  distributions: { firstPass: Distribution; afterRevision: Distribution };
  /** Blanks and flashcards: every item of every reviewed revision, and distinct failing items per dimension from findings. */
  items: { inspected: number; failing: Record<Dimension, number> };
  minutes: { firstPass: MinuteStats; revisions: MinuteStats };
  /**
   * `sharedWithoutCost` is per import, keyed by its directory (or importId): every type of an import carries the same entry, so pooling
   * takes each import's count once (across types and across imports) rather than once per type.
   */
  cost: { firstPassDirect: CostSum; regenerationDirect: CostSum; allocatedSharedUsdMicro: number; sharedWithoutCost: Record<string, number> };
}
export interface StaleReview { activityId: string; revision: number; buildId: string; why: string }
export interface ImportGate {
  importId: string; storeVersion: number; directory: string;
  unit: { code: string; release: string | null; hash: string } | null;
  /** The generation scope by hash and counts only (null: the whole document); never heading or source text. */
  generationScope: ScopeFigures | null;
  status: "complete" | "incomplete";
  /** Why the import is incomplete: one line per activity, naming the partition and category that holds it open. */
  incomplete: Array<{ activityId: string; reason: string }>;
  activities: ActivityGate[];
  types: Record<PlannedType, TypeGate>;
  shared: CostSum;
  alignment: { unsupported: string[]; neverTargeted: string[] };
  negativeCheck: { findings: number; activities: number; reviews: number };
  staleReviews: StaleReview[];
  provenance: { engines: string[]; extractionVersion: string | null; promptVersions: string[]; modelRoles: string[]; rubricVersions: string[] };
}

const zeros = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const emptyDistribution = (): Distribution => Object.fromEntries(DIMENSIONS.map((d) => [d, zeros(SCORE_KEYS)])) as Distribution;
export function emptyTypeGate(): TypeGate {
  return {
    planned: 0, firstPass: zeros(FIRST_PASS_CATEGORIES), historical: 0, afterRevision: zeros(AFTER_REVISION_CATEGORIES), regenerations: { used: 0, failed: 0 },
    distributions: { firstPass: emptyDistribution(), afterRevision: emptyDistribution() }, items: { inspected: 0, failing: zeros(DIMENSIONS) },
    minutes: { firstPass: { values: [], items: 0 }, revisions: { values: [], items: 0 } },
    cost: { firstPassDirect: emptyCost(), regenerationDirect: emptyCost(), allocatedSharedUsdMicro: 0, sharedWithoutCost: {} }
  };
}

const categoryOf = (d: ScoreDecision): "accepted" | "needsRevision" | "rejected" => (d === "needs-revision" ? "needsRevision" : d);
const byPosition = (a: ScoreRecord, b: ScoreRecord): number => a.sequence - b.sequence || a.rowIndex - b.rowIndex;
const everPromoted = (r: RevisionRecord): boolean => (r.state === "promoted" || r.state === "superseded") && r.currentBuildId !== null;
export const itemCount = (spec: ActivitySpec): number => (spec.type === "blanks" ? spec.blanks.length : spec.type === "flashcards" ? spec.cards.length : 1);

/**
 * The category of an activity with no promoted revision, from its operations, revisions and builds (R10): a count never
 * depends on a revision existing. Build failures surface either as a `rejected` revision, a failed `build` operation,
 * or (as runImport records them) the activity marked failed, other than skipped, with its candidate unbuilt or unpromoted.
 */
function unpromoted(activity: ActivityRecord | undefined, ops: OperationRecord[], revs: RevisionRecord[]): "notAttempted" | "inProgress" | "buildPending" | "generationFailed" {
  const produce = ops.filter((o) => o.purpose === "produce" && o.origin === "generate");
  const buildOps = ops.filter((o) => o.purpose === "build");
  if (produce.some((o) => o.status === "running") || buildOps.some((o) => o.status === "running")) return "inProgress";
  const generated = revs.filter((r) => r.origin === "generate");
  if (produce.length === 0 && generated.length === 0) return "notAttempted";
  if (generated.some((r) => r.state === "rejected") || buildOps.some((o) => o.status === "failed")) return "generationFailed";
  const candidate = generated.find((r) => r.state === "candidate");
  if (candidate) {
    const failed = activity?.status === "failed" && !(activity.error ?? "").startsWith(SKIPPED_PREFIX);
    // a persisted candidate whose build, or promotion, has not happened yet; a later run builds and promotes it
    return failed ? "generationFailed" : "buildPending";
  }
  return "generationFailed"; // every produce operation ended failed (content exhausted, budget, system) and nothing was persisted
}

function isStale(s: ScoreRecord, current: RevisionRecord | undefined, unit: UnitOfCompetency | null): string | null {
  if (!current || current.revision !== s.revision) return `revision ${s.revision} is no longer current`;
  if (current.currentBuildId !== s.buildId) return `build ${s.buildId} is no longer the revision's current build`;
  if (unit && s.unitTextHash !== null && s.unitTextHash !== unit.textHash) return "the unit text has changed since the review";
  return null;
}

/** The gate for one version-2 import (design §8, plan Task 14). Pure: everything comes from the snapshot. */
export function gateImport(s: ImportSnapshot, directory = ""): ImportGate {
  const types = Object.fromEntries(GATE_TYPES.map((t) => [t, emptyTypeGate()])) as Record<PlannedType, TypeGate>;
  const activityById = new Map(s.activities.map((a) => [a.activityId, a]));
  const typeOf = new Map<string, PlannedType>([...s.activities.map((a) => [a.activityId, a.type] as const), ...s.plan.map((p) => [p.activityId, p.type] as const)]);
  const revsOf = (id: string) => s.revisions.filter((r) => r.activityId === id).sort((a, b) => a.revision - b.revision);
  const scoresOf = (id: string, revision: number) => s.scores.filter((x) => x.activityId === id && x.revision === revision).sort(byPosition);
  const currentRev = new Map<string, RevisionRecord>();
  for (const a of s.activities) { const r = s.revisions.find((x) => x.activityId === a.activityId && x.revision === a.currentRevision); if (r) currentRev.set(a.activityId, r); }
  const activities: ActivityGate[] = [];
  const incomplete: ImportGate["incomplete"] = [];
  const tally = (dist: Distribution, sc: ScoreRecord): void => { for (const d of DIMENSIONS) dist[d][String(sc.scores[d]) as (typeof SCORE_KEYS)[number]] += 1; };

  for (const entry of s.plan) {
    const id = entry.activityId; const t = types[entry.type];
    const activity = activityById.get(id);
    const ops = s.operations.filter((o) => o.activityId === id);
    const revs = revsOf(id);
    const requests = s.regenerations.filter((r) => r.activityId === id);
    t.planned += 1;

    // first pass: the lowest-numbered generate revision that was promoted, and its first scored review on any build
    let firstPass: FirstPassCategory; let firstPassRevision: number | null = null; let historical = false;
    const firstGen = revs.find((r) => r.origin === "generate" && everPromoted(r));
    if (activity?.dropped) firstPass = "dropped";
    else if (!firstGen) firstPass = unpromoted(activity, ops, revs);
    else {
      firstPassRevision = firstGen.revision;
      const first = scoresOf(id, firstGen.revision)[0];
      if (!first) firstPass = "unreviewed";
      else {
        firstPass = categoryOf(first.decision);
        // C3: historical when what it reviewed is no longer the activity's current revision and build, or the unit text changed
        historical = isStale(first, currentRev.get(id), s.unit) !== null;
        if (historical) t.historical += 1;
        tally(t.distributions.firstPass, first);
        t.minutes.firstPass.values.push(first.minutes); t.minutes.firstPass.items += itemCount(firstGen.spec);
      }
    }
    t.firstPass[firstPass] += 1;

    // after revision: the latest promoted revision of any origin and the counted, non-stale review of its current build
    let after: AfterRevisionCategory; let afterRevisionRevision: number | null = null;
    const latest = [...revs].reverse().find((r) => r.state === "promoted" && r.currentBuildId !== null);
    if (activity?.dropped) after = "dropped";
    else if (requests.some((r) => r.status === "running")) after = "inProgress"; // a regeneration is still to finish
    else if (!latest) after = revs.some(everPromoted) ? "awaitingReview" : unpromoted(activity, ops, revs);
    else {
      afterRevisionRevision = latest.revision;
      const counted = countedScore(s.scores, id, latest.revision, latest.currentBuildId!);
      if (!counted || isStale(counted, latest, s.unit)) after = "awaitingReview";
      else {
        after = categoryOf(counted.decision);
        tally(t.distributions.afterRevision, counted);
      }
    }
    t.afterRevision[after] += 1;

    const used = requests.length; const failed = requests.filter((r) => r.status === "failed").length;
    t.regenerations.used += used; t.regenerations.failed += failed;
    for (const r of revs.filter((x) => x.origin === "regenerate")) for (const sc of scoresOf(id, r.revision)) { t.minutes.revisions.values.push(sc.minutes); t.minutes.revisions.items += itemCount(r.spec); }
    activities.push({ activityId: id, type: entry.type, firstPass, firstPassRevision, firstPassHistorical: historical, afterRevision: after, afterRevisionRevision, regenerations: { used, failed, running: requests.filter((r) => r.status === "running").length } });

    if (firstPass === "unreviewed" || firstPass === "inProgress" || firstPass === "buildPending") incomplete.push({ activityId: id, reason: `first pass: ${firstPass}` });
    if (after === "awaitingReview" || after === "inProgress" || after === "buildPending") incomplete.push({ activityId: id, reason: `after revision: ${after}` });
  }

  // items: every item of every reviewed revision of a planned activity, whatever partition its review falls in (an
  // intermediate revision counts too); failing items distinct per dimension, from the findings of every review of it
  const inspected = new Set<string>(); const failing = new Map<Dimension, Set<string>>();
  for (const sc of s.scores) {
    const type = s.plan.find((p) => p.activityId === sc.activityId)?.type;
    const rev = s.revisions.find((r) => r.activityId === sc.activityId && r.revision === sc.revision);
    if (!type || type === "multiChoice" || !rev) continue;
    const key = `${rev.activityId}/${rev.revision}`;
    if (!inspected.has(key)) { inspected.add(key); types[type].items.inspected += itemCount(rev.spec); }
    for (const f of sc.findings) {
      const set = failing.get(f.dimension) ?? new Set<string>(); failing.set(f.dimension, set);
      const itemKey = `${key}/${f.itemId}`;
      if (!set.has(itemKey)) { set.add(itemKey); types[type].items.failing[f.dimension] += 1; }
    }
  }

  // cost (C1, R10): from attempt records only
  const opById = new Map(s.operations.map((o) => [o.operationId, o]));
  const outcomes = new Map(s.attempts.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  const shared = emptyCost();
  for (const start of s.attempts.filter((e): e is AttemptStart => e.event === "start")) {
    let into: CostSum;
    if (start.origin === "shared") into = shared;
    else {
      const activityId = opById.get(start.operationId)?.activityId ?? null;
      const type = activityId ? typeOf.get(activityId) : undefined;
      if (!type) { into = shared; } // an attempt on no known activity cannot be attributed to a type; it is shown as shared rather than dropped
      else into = start.origin === "generate" ? types[type].cost.firstPassDirect : types[type].cost.regenerationDirect;
    }
    into.attempts += 1;
    const o = outcomes.get(start.attemptId);
    if (!o) { into.uncertain.attempts += 1; into.uncertain.reservedUsdMicro += start.reservedUsdMicro; }
    else if (o.costUsdMicro === null) into.unavailable += 1;
    else into.usdMicro += o.costUsdMicro;
  }
  const allocation = allocateShared(shared.usdMicro, Object.fromEntries(GATE_TYPES.map((t) => [t, types[t].cost.firstPassDirect.usdMicro])) as Record<PlannedType, number>, Object.fromEntries(GATE_TYPES.map((t) => [t, types[t].planned])) as Record<PlannedType, number>);
  for (const t of GATE_TYPES) { types[t].cost.allocatedSharedUsdMicro = allocation[t]; types[t].cost.sharedWithoutCost = { [directory || s.importRecord.importId]: withoutCost(shared) }; } // keyed by directory: two directories can hold imports with the same id

  // alignment, the negative check, stale reviews, provenance
  const targets = s.unit ? targetsOf(s.unit).map((x) => x.id) : [];
  const unsupported = [...(s.conceptMap?.alignment?.unsupportedCriteriaIds ?? [])];
  const targeted = new Set(s.plan.flatMap((p) => p.criteriaIds));
  const counted = latestPerBuild(s.scores);
  const rto = counted.flatMap((sc) => sc.findings.filter((f) => isRtoClaim(f.reason)).map(() => sc.activityId));
  const staleReviews = counted.flatMap((sc) => { const why = isStale(sc, currentRev.get(sc.activityId), s.unit); return why ? [{ activityId: sc.activityId, revision: sc.revision, buildId: sc.buildId, why }] : []; });
  const distinct = (xs: Array<string | null | undefined>): string[] => [...new Set(xs.filter((x): x is string => typeof x === "string" && x !== ""))].sort();

  return {
    importId: s.importRecord.importId, storeVersion: s.importRecord.storeVersion ?? 1, directory,
    unit: s.unit ? { code: s.unit.code, release: s.unit.release, hash: s.unit.textHash.slice(0, 12) } : null,
    generationScope: scopeFigures(s.importRecord, s.generationScope ?? null, s.generationScopeEntries ?? false),
    status: incomplete.length === 0 ? "complete" : "incomplete", incomplete, activities, types, shared,
    alignment: { unsupported: distinct(unsupported), neverTargeted: targets.filter((id) => !targeted.has(id) && !unsupported.includes(id)) },
    negativeCheck: { findings: rto.length, activities: new Set(rto).size, reviews: counted.length },
    staleReviews,
    provenance: {
      engines: distinct(s.builds.map((b) => b.engineDisplay)), extractionVersion: s.extractionVersion,
      promptVersions: distinct(s.revisions.map((r) => r.promptVersion)),
      modelRoles: distinct(s.revisions.map((r) => Object.entries(r.modelConfig.models).sort(([a], [b]) => a.localeCompare(b)).map(([role, model]) => `${role}=${model}`).join(", "))),
      rubricVersions: distinct([...s.scores.map((x) => x.rubricVersion), RUBRIC_VERSION])
    }
  };
}

/** The review that counts for each reviewed build: the latest by `(sequence, rowIndex)` per `(activityId, revision, buildId)`. */
function latestPerBuild(scores: ScoreRecord[]): ScoreRecord[] {
  const latest = new Map<string, ScoreRecord>();
  for (const sc of scores) { const k = `${sc.activityId}/${sc.revision}/${sc.buildId}`; const cur = latest.get(k); if (!cur || byPosition(sc, cur) > 0) latest.set(k, sc); }
  return [...latest.values()];
}

/**
 * An **accounting convention**, not a claim about which type consumed the source work: shared cost split by each type's
 * share of first-pass direct cost (known and estimated), or by planned count when that total is 0. Largest remainders
 * keep the parts summing exactly to `shared`.
 */
export function allocateShared(shared: number, firstPassDirect: Record<PlannedType, number>, planned: Record<PlannedType, number>): Record<PlannedType, number> {
  const directTotal = GATE_TYPES.reduce((n, t) => n + firstPassDirect[t], 0);
  const weights = directTotal > 0 ? firstPassDirect : planned;
  const total = GATE_TYPES.reduce((n, t) => n + weights[t], 0);
  const out = Object.fromEntries(GATE_TYPES.map((t) => [t, 0])) as Record<PlannedType, number>;
  if (total === 0 || shared === 0) return out;
  const exact = GATE_TYPES.map((t) => ({ t, v: (shared * weights[t]) / total }));
  for (const { t, v } of exact) out[t] = Math.floor(v);
  let rest = shared - GATE_TYPES.reduce((n, t) => n + out[t], 0);
  for (const { t } of [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) { if (rest <= 0) break; out[t] += 1; rest -= 1; }
  return out;
}

/** Sums type gates (for the all-types row and for pooling across imports). Minute values are concatenated so medians stay exact. */
export function poolTypeGates(gates: TypeGate[]): TypeGate {
  const out = emptyTypeGate();
  for (const g of gates) {
    out.planned += g.planned; out.historical += g.historical;
    for (const k of FIRST_PASS_CATEGORIES) out.firstPass[k] += g.firstPass[k];
    for (const k of AFTER_REVISION_CATEGORIES) out.afterRevision[k] += g.afterRevision[k];
    out.regenerations.used += g.regenerations.used; out.regenerations.failed += g.regenerations.failed;
    for (const which of ["firstPass", "afterRevision"] as const) for (const d of DIMENSIONS) for (const k of SCORE_KEYS) out.distributions[which][d][k] += g.distributions[which][d][k];
    out.items.inspected += g.items.inspected; for (const d of DIMENSIONS) out.items.failing[d] += g.items.failing[d];
    for (const which of ["firstPass", "revisions"] as const) { out.minutes[which].values.push(...g.minutes[which].values); out.minutes[which].items += g.minutes[which].items; }
    addCost(out.cost.firstPassDirect, g.cost.firstPassDirect); addCost(out.cost.regenerationDirect, g.cost.regenerationDirect);
    out.cost.allocatedSharedUsdMicro += g.cost.allocatedSharedUsdMicro; Object.assign(out.cost.sharedWithoutCost, g.cost.sharedWithoutCost); // the same import's entry, once
  }
  return out;
}

export const reviewedFirstPass = (g: TypeGate): number => g.firstPass.accepted + g.firstPass.needsRevision + g.firstPass.rejected;
export const reviewedAfterRevision = (g: TypeGate): number => g.afterRevision.accepted + g.afterRevision.needsRevision + g.afterRevision.rejected;
export const partitionSum = <K extends string>(r: Record<K, number>): number => Object.values<number>(r).reduce((a, b) => a + b, 0);

/** Shared attempts without a cost behind this figure: each import's count once. */
export const sharedUnknown = (g: TypeGate): number => Object.values(g.cost.sharedWithoutCost).reduce((a, b) => a + b, 0);

export interface CostPerAccepted { usdMicro: number | null; spendUsdMicro: number; accepted: number; lowerBound: number }
/** First pass: (allocated + firstPassDirect) / first-pass accepted. After revision: adds regenerationDirect, over after-revision accepted. */
export function costPerAccepted(g: TypeGate, which: "firstPass" | "afterRevision"): CostPerAccepted {
  const spend = g.cost.allocatedSharedUsdMicro + g.cost.firstPassDirect.usdMicro + (which === "afterRevision" ? g.cost.regenerationDirect.usdMicro : 0);
  const accepted = which === "firstPass" ? g.firstPass.accepted : g.afterRevision.accepted;
  const lowerBound = sharedUnknown(g) + withoutCost(g.cost.firstPassDirect) + (which === "afterRevision" ? withoutCost(g.cost.regenerationDirect) : 0);
  return { usdMicro: accepted === 0 ? null : Math.round(spend / accepted), spendUsdMicro: spend, accepted, lowerBound };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b); const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** A phase-2 directory: listed, never counted (no rubric scores). */
export interface LegacyGate { directory: string; importId: string; acceptances: { accepted: number; needsRevision: number; rejected: number } }

// ---------------------------------------------------------------------------------------------------------------------
// Rendering. Neither the report nor the summary contains content strings: no source sentence, heading, activity text,
// target text, title or finding reason; only IDs, counts, hashes, money and versions.

const usd = (micro: number): string => `$${(micro / 1_000_000).toFixed(4)}`;
const pct = (n: number, d: number): string => `${n}/${d} (${d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`})`;
const lb = (k: number): string => (k > 0 ? ` lower bound (${k} attempts without cost)` : "");
const perAcceptedText = (c: CostPerAccepted): string => (c.usdMicro === null ? `n/a (0 accepted); spend ${usd(c.spendUsdMicro)}${lb(c.lowerBound)}` : `${usd(c.usdMicro)} (${usd(c.spendUsdMicro)} / ${c.accepted})${lb(c.lowerBound)}`);
const minutesText = (m: MinuteStats): string => {
  const total = m.values.reduce((a, b) => a + b, 0);
  return m.values.length === 0 ? "none" : `median ${median(m.values)} per activity, total ${total} over ${m.values.length} review(s); ${m.items} item(s), ${(total / m.items).toFixed(2)} per item`;
};

function typeTable(rows: Array<[string, TypeGate]>): string[] {
  const out: string[] = [];
  out.push("**First pass** (the first scored review of each activity's first promoted generate revision)", "", `| type | planned | sum | ${FIRST_PASS_CATEGORIES.join(" | ")} | historical | accepted / reviewed | accepted / planned |`, `|${"---|".repeat(FIRST_PASS_CATEGORIES.length + 6)}`);
  for (const [name, g] of rows) out.push(`| ${name} | ${g.planned} | ${partitionSum(g.firstPass)} | ${FIRST_PASS_CATEGORIES.map((k) => g.firstPass[k]).join(" | ")} | ${g.historical} | ${pct(g.firstPass.accepted, reviewedFirstPass(g))} | ${pct(g.firstPass.accepted, g.planned)} |`);
  out.push("", "**After revision** (the counted, current review of each activity's latest promoted revision)", "", `| type | planned | sum | ${AFTER_REVISION_CATEGORIES.join(" | ")} | accepted / reviewed | accepted / planned | regenerations used | failed | extra cost | extra review minutes |`, `|${"---|".repeat(AFTER_REVISION_CATEGORIES.length + 9)}`);
  for (const [name, g] of rows) out.push(`| ${name} | ${g.planned} | ${partitionSum(g.afterRevision)} | ${AFTER_REVISION_CATEGORIES.map((k) => g.afterRevision[k]).join(" | ")} | ${pct(g.afterRevision.accepted, reviewedAfterRevision(g))} | ${pct(g.afterRevision.accepted, g.planned)} | ${g.regenerations.used} | ${g.regenerations.failed} | ${usd(g.cost.regenerationDirect.usdMicro)}${lb(withoutCost(g.cost.regenerationDirect))} | ${g.minutes.revisions.values.reduce((a, b) => a + b, 0)} |`);
  out.push("", "**Distributions** (0 / 1 / 2 / na counts)", "", "| type | pass | " + DIMENSIONS.join(" | ") + " |", `|${"---|".repeat(DIMENSIONS.length + 2)}`);
  for (const [name, g] of rows) for (const which of ["firstPass", "afterRevision"] as const) out.push(`| ${name} | ${which === "firstPass" ? "first pass" : "after revision"} | ${DIMENSIONS.map((d) => SCORE_KEYS.map((k) => g.distributions[which][d][k]).join(" / ")).join(" | ")} |`);
  out.push("", "**Items** (blanks and flashcards: every item of every reviewed revision; distinct failing items per dimension)", "", "| type | inspected | " + DIMENSIONS.join(" | ") + " |", `|${"---|".repeat(DIMENSIONS.length + 2)}`);
  for (const [name, g] of rows) out.push(name === "multiChoice" ? `| ${name} | n/a (one question per activity) |${" |".repeat(DIMENSIONS.length)}` : `| ${name} | ${g.items.inspected} | ${DIMENSIONS.map((d) => g.items.failing[d]).join(" | ")} |`);
  out.push("", "**Review minutes**", "");
  for (const [name, g] of rows) out.push(`- ${name}: first pass ${minutesText(g.minutes.firstPass)}; revisions ${minutesText(g.minutes.revisions)}`);
  out.push("", "**Cost** (attempt records only; shared cost allocated by first-pass direct share, an accounting convention)", "", "| type | first-pass direct | regeneration direct | allocated shared | first-pass per accepted | after-revision per accepted | billing-uncertain starts |", "|---|---|---|---|---|---|---|");
  for (const [name, g] of rows) {
    const u = { attempts: g.cost.firstPassDirect.uncertain.attempts + g.cost.regenerationDirect.uncertain.attempts, reserved: g.cost.firstPassDirect.uncertain.reservedUsdMicro + g.cost.regenerationDirect.uncertain.reservedUsdMicro };
    out.push(`| ${name} | ${usd(g.cost.firstPassDirect.usdMicro)} (${g.cost.firstPassDirect.attempts} attempts)${lb(withoutCost(g.cost.firstPassDirect))} | ${usd(g.cost.regenerationDirect.usdMicro)} (${g.cost.regenerationDirect.attempts} attempts)${lb(withoutCost(g.cost.regenerationDirect))} | ${usd(g.cost.allocatedSharedUsdMicro)}${lb(sharedUnknown(g))} | ${perAcceptedText(costPerAccepted(g, "firstPass"))} | ${perAcceptedText(costPerAccepted(g, "afterRevision"))} | ${u.attempts} at ${usd(u.reserved)} reserved |`);
  }
  return out;
}

const withTotal = (types: Record<PlannedType, TypeGate>): Array<[string, TypeGate]> => [...GATE_TYPES.map((t) => [t, types[t]] as [string, TypeGate]), ["all types", poolTypeGates(GATE_TYPES.map((t) => types[t]))]];

export function formatGateReport(imports: ImportGate[], legacy: LegacyGate[]): string {
  const out: string[] = ["# Gate report", "", `Thresholds: ${PROVISIONAL_TARGETS.frozen ? "frozen" : "not frozen"}. Provisional targets (design §8.3), not evaluated as pass or fail: ${PROVISIONAL_TARGETS.targets.join("; ")}.`, ""];
  for (const g of imports) {
    out.push(`## Import ${g.importId}`, "", `- Directory: ${g.directory}`, `- Unit: ${g.unit ? `${g.unit.code}${g.unit.release ? ` ${g.unit.release}` : ""}, text ${g.unit.hash}` : "none (mapping not scored)"}; store version ${g.storeVersion}`, `- ${scopeLine(g.generationScope)}`);
    out.push(`- Gate status: **${g.status}**${g.status === "incomplete" ? ": an incomplete import can never pass" : PROVISIONAL_TARGETS.frozen ? "" : "; not evaluated, thresholds not frozen"}`);
    for (const i of g.incomplete) out.push(`  - ${i.activityId}: ${i.reason}`);
    out.push("", ...typeTable(withTotal(g.types)), "");
    out.push(`- Shared cost: ${usd(g.shared.usdMicro)} over ${g.shared.attempts} attempts${lb(withoutCost(g.shared))}; billing-uncertain starts ${g.shared.uncertain.attempts} at ${usd(g.shared.uncertain.reservedUsdMicro)} reserved`);
    out.push(`- Unsupported targets: ${g.alignment.unsupported.join(", ") || "none"}${g.generationScope && g.alignment.unsupported.length > 0 ? ` (${SCOPE_UNSUPPORTED_NOTE})` : ""}`, `- Never-targeted PCs and KE nodes (not counting unsupported ones): ${g.alignment.neverTargeted.join(", ") || "none"}`);
    out.push(`- Negative check (findings tagged \`${RTO_CLAIM_PREFIX}\`): ${g.negativeCheck.findings} finding(s) on ${g.negativeCheck.activities} activit${g.negativeCheck.activities === 1 ? "y" : "ies"}, across ${g.negativeCheck.reviews} counted review(s)`);
    out.push(`- Stale reviews: ${g.staleReviews.length === 0 ? "none" : g.staleReviews.map((r) => `${r.activityId} r${r.revision} build ${r.buildId} (${r.why})`).join("; ")}`);
    out.push(`- Engines: ${g.provenance.engines.join("; ") || "none"}; extraction ${g.provenance.extractionVersion ?? "unknown"}; prompts ${g.provenance.promptVersions.join(", ") || "none"}; rubric ${g.provenance.rubricVersions.join(", ")}`, `- Model roles: ${g.provenance.modelRoles.join(" | ") || "none"}`, "");
  }
  if (imports.length > 0) {
    out.push("## Pooled across imports", "", ...typeTable(withTotal(pooledTypes(imports))), "", "**Per-unit breakdown**", "", "| import | unit | type | planned | first-pass accepted / reviewed | after-revision accepted / reviewed | status |", "|---|---|---|---|---|---|---|");
    for (const g of imports) for (const t of GATE_TYPES) out.push(`| ${g.importId} | ${g.unit?.code ?? "none"} | ${t} | ${g.types[t].planned} | ${pct(g.types[t].firstPass.accepted, reviewedFirstPass(g.types[t]))} | ${pct(g.types[t].afterRevision.accepted, reviewedAfterRevision(g.types[t]))} | ${g.status} |`);
    const pooled = pooledTypes(imports);
    out.push("", `Sample: ${GATE_TYPES.map((t) => `${t} ${pooled[t].planned} of a planned minimum of ${PLANNED_MINIMUM[t]}`).join("; ")}. The planned minimum is a sample size, not a confidence level; no confidence is claimed.`, "");
  }
  out.push("## Not eligible (phase-2 store)", "");
  if (legacy.length === 0) out.push("None.");
  for (const l of legacy) out.push(`- ${l.directory} (import ${l.importId}): historical acceptances ${l.acceptances.accepted} accepted, ${l.acceptances.needsRevision} needs-revision, ${l.acceptances.rejected} rejected; no rubric scores; excluded from the gate`);
  return out.join("\n") + "\n";
}

export function pooledTypes(imports: ImportGate[]): Record<PlannedType, TypeGate> {
  return Object.fromEntries(GATE_TYPES.map((t) => [t, poolTypeGates(imports.map((g) => g.types[t]))])) as Record<PlannedType, TypeGate>;
}

/** The numbers-only copy: counts, money, IDs, hashes and versions; never a content string (the scope by hash and counts only). */
export function gateSummary(imports: ImportGate[], legacy: LegacyGate[]): unknown {
  const typeFigures = (g: TypeGate) => ({
    planned: g.planned, firstPass: g.firstPass, historical: g.historical, afterRevision: g.afterRevision, regenerations: g.regenerations,
    distributions: g.distributions, items: g.items,
    minutes: { firstPass: { reviews: g.minutes.firstPass.values.length, total: g.minutes.firstPass.values.reduce((a, b) => a + b, 0), median: median(g.minutes.firstPass.values), items: g.minutes.firstPass.items }, revisions: { reviews: g.minutes.revisions.values.length, total: g.minutes.revisions.values.reduce((a, b) => a + b, 0), median: median(g.minutes.revisions.values), items: g.minutes.revisions.items } },
    // sharedWithoutCost is an aggregate count here: the per-import map behind it is keyed by directory and stays internal
    cost: { firstPassDirect: g.cost.firstPassDirect, regenerationDirect: g.cost.regenerationDirect, allocatedSharedUsdMicro: g.cost.allocatedSharedUsdMicro, sharedWithoutCost: sharedUnknown(g), firstPassPerAccepted: costPerAccepted(g, "firstPass"), afterRevisionPerAccepted: costPerAccepted(g, "afterRevision") }
  });
  return {
    thresholdsFrozen: PROVISIONAL_TARGETS.frozen,
    imports: imports.map((g) => ({ importId: g.importId, unit: g.unit, generationScope: g.generationScope, storeVersion: g.storeVersion, status: g.status, incomplete: g.incomplete, types: Object.fromEntries(GATE_TYPES.map((t) => [t, typeFigures(g.types[t])])), shared: g.shared, alignment: g.alignment, negativeCheck: g.negativeCheck, staleReviews: g.staleReviews.length, provenance: g.provenance })),
    pooled: Object.fromEntries(Object.entries(pooledTypes(imports)).map(([t, g]) => [t, typeFigures(g)])),
    plannedMinimum: PLANNED_MINIMUM,
    notEligible: legacy.map((l) => ({ importId: l.importId, acceptances: l.acceptances }))
  };
}
