import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConceptMap, CostStatus, MappingStatus } from "@leaplearn/shared";
import { PRICING, type AttemptOutcome, type AttemptStart, type ImportStore, type PlannedType } from "@leaplearn/generator";

export interface CostReport {
  pricingVersion: string;
  /**
   * underestimateUsdMicro sums each attempt's cost beyond its reservation (a property of the estimate).
   * spendOverCapUsdMicro is the import's spend beyond its cap (a property of the import), zero when the cap held. It is
   * taken from the ledger's budgetUsed.spentUsdMicro rather than from the sum of known attempt costs: an attempt whose
   * cost the provider never reported is counted there at its reservation, and summing known costs would hide it.
   */
  totals: { attempts: number; costUsdMicro: number; costStatusCounts: Record<CostStatus, number>; reservationExceeded: number; underestimateUsdMicro: number; spendOverCapUsdMicro: number };
  shared: number; direct: number;
  byPurpose: Record<string, { attempts: number; costUsdMicro: number }>;
  byType: Record<string, { activities: number; promoted: number; costUsdMicro: number }>;
  perActivity: Array<{ activityId: string; type: PlannedType; status: string; attempts: number; costUsdMicro: number }>;
  retryShare: number;
  accepted: number;
  costPerAcceptedActivityUsdMicro: number | null;
}

export async function acceptedActivityIds(store: ImportStore, importId: string): Promise<Set<string>> {
  const activities = await store.listActivities(importId);
  const accepted = new Set<string>();
  for (const a of await store.listAcceptances(importId)) {
    const activity = activities.find((x) => x.activityId === a.activityId);
    if (activity && activity.currentRevision === a.revision && a.decision === "accepted") accepted.add(a.activityId);
  }
  return accepted;
}

export async function costReport(store: ImportStore, importId: string): Promise<CostReport> {
  const events = await store.listAttempts(importId);
  const starts = events.filter((e): e is AttemptStart => e.event === "start");
  const outcomes = new Map(events.filter((e): e is AttemptOutcome => e.event === "outcome").map((o) => [o.attemptId, o]));
  const activities = await store.listActivities(importId);
  const importRecord = await store.getImport(importId);
  const opActivity = new Map((await store.listOperations(importId)).map((o) => [o.operationId, o.activityId]));
  const costStatusCounts: Record<CostStatus, number> = { known: 0, estimated: 0, unavailable: 0 };
  const byPurpose: CostReport["byPurpose"] = {}; const perActivityMap = new Map<string, { attempts: number; costUsdMicro: number }>();
  let total = 0; let shared = 0; let direct = 0; let retries = 0; let reservationExceeded = 0; let underestimate = 0;
  for (const s of starts) {
    const o = outcomes.get(s.attemptId);
    const cost = o?.costUsdMicro ?? 0; // rows without a cost are counted in costStatusCounts.unavailable and excluded from every sum; they never appear as zero-cost successes
    costStatusCounts[o?.costStatus ?? "unavailable"] += 1;
    if (o?.reservationExceeded) reservationExceeded += 1;
    underestimate += o?.underestimateUsdMicro ?? 0;
    total += cost;
    if (s.purpose === "produce") direct += cost; else shared += cost;
    const bp = (byPurpose[s.purpose] ??= { attempts: 0, costUsdMicro: 0 }); bp.attempts += 1; bp.costUsdMicro += cost;
    if (s.retryIndex > 0) retries += 1;
    const activityId = opActivity.get(s.operationId);
    if (activityId) { const pa = perActivityMap.get(activityId) ?? { attempts: 0, costUsdMicro: 0 }; pa.attempts += 1; pa.costUsdMicro += cost; perActivityMap.set(activityId, pa); }
  }
  const byType: CostReport["byType"] = {};
  const perActivity = activities.map((a) => {
    const pa = perActivityMap.get(a.activityId) ?? { attempts: 0, costUsdMicro: 0 };
    const bt = (byType[a.type] ??= { activities: 0, promoted: 0, costUsdMicro: 0 }); bt.activities += 1; if (a.status === "promoted") bt.promoted += 1; bt.costUsdMicro += pa.costUsdMicro;
    return { activityId: a.activityId, type: a.type, status: a.status, attempts: pa.attempts, costUsdMicro: pa.costUsdMicro };
  });
  const accepted = (await acceptedActivityIds(store, importId)).size;
  const spendOverCapUsdMicro = importRecord ? Math.max(0, importRecord.budgetUsed.spentUsdMicro - importRecord.budget.usdMicro) : 0;
  return {
    pricingVersion: PRICING.version, totals: { attempts: starts.length, costUsdMicro: total, costStatusCounts, reservationExceeded, underestimateUsdMicro: underestimate, spendOverCapUsdMicro }, shared, direct, byPurpose, byType, perActivity,
    retryShare: starts.length === 0 ? 0 : retries / starts.length,
    accepted, costPerAcceptedActivityUsdMicro: accepted === 0 ? null : Math.round(total / accepted)
  };
}

const usd = (micro: number): string => `$${(micro / 1_000_000).toFixed(4)}`;

export function formatCostReport(r: CostReport): string {
  const lines = [
    `Cost (pricing ${r.pricingVersion}): ${usd(r.totals.costUsdMicro)} over ${r.totals.attempts} attempts (known ${r.totals.costStatusCounts.known}, estimated ${r.totals.costStatusCounts.estimated}, unavailable ${r.totals.costStatusCounts.unavailable} — excluded from the sums; the ledger's budget spend counts them at their reservation); shared ${usd(r.shared)}, direct ${usd(r.direct)}; retry share ${(r.retryShare * 100).toFixed(0)}%; reservations under-estimated on ${r.totals.reservationExceeded} attempt(s) by ${usd(r.totals.underestimateUsdMicro)} in total; spend over the import's cap, from the ledger's spent figure (which counts unknown-cost attempts at their reservation): ${usd(r.totals.spendOverCapUsdMicro)}`,
    `Accepted activities: ${r.accepted}; cost per accepted activity: ${r.costPerAcceptedActivityUsdMicro === null ? "n/a (none accepted yet; record decisions with leap review)" : usd(r.costPerAcceptedActivityUsdMicro)}`,
    "", "| purpose | attempts | cost |", "|---|---|---|"
  ];
  for (const [p, v] of Object.entries(r.byPurpose)) lines.push(`| ${p} | ${v.attempts} | ${usd(v.costUsdMicro)} |`);
  lines.push("", "| activity | type | status | attempts | cost |", "|---|---|---|---|---|");
  for (const a of r.perActivity) lines.push(`| ${a.activityId} | ${a.type} | ${a.status} | ${a.attempts} | ${usd(a.costUsdMicro)} |`);
  return lines.join("\n");
}

export interface MappingRow { activityId: string; type: string; title: string; revision: number; itemId: string; criterionId: string; status: MappingStatus; conceptIds: string; evidenceIds: string; firstQuote: string; }

export async function mappingRows(store: ImportStore, importId: string): Promise<MappingRow[]> {
  const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
  const quoteOf = new Map(map?.concepts.flatMap((c) => c.evidence.map((e) => [e.evidenceId, e.quote] as const)) ?? []);
  const reviews = await store.listAlignmentReviews(importId);
  const rows: MappingRow[] = [];
  for (const a of await store.listActivities(importId)) {
    if (a.currentRevision === null) continue;

    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev) continue;

    const spec = rev.spec;
    const reviewFor = (itemId: string | null, criterionId: string) => reviews.find((r) => r.activityId === a.activityId && r.revision === rev.revision && (r.itemId ?? null) === itemId && r.criterionId === criterionId);
    const push = (itemId: string, prov: { conceptIds: string[]; evidenceIds: string[]; criteriaIds: string[] } | undefined): void => {
      const base = { activityId: a.activityId, type: a.type, title: spec.title, revision: rev.revision, itemId, conceptIds: (prov?.conceptIds ?? []).join(" "), evidenceIds: (prov?.evidenceIds ?? []).join(" "), firstQuote: quoteOf.get(prov?.evidenceIds[0] ?? "") ?? "" };
      const criteria = prov?.criteriaIds.length ? prov.criteriaIds : [""];
      for (const criterionId of criteria) {
        const review = criterionId ? reviewFor(itemId || null, criterionId) : undefined;
        const status: MappingStatus = review && review.decision !== "added" ? review.decision : "suggested";
        rows.push({ ...base, criterionId, status });
      }
      // criteria a reviewer attached: any review for a criterion outside the original provenance means it was added; a later confirmed/rejected decision on it shows as that decision
      for (const extra of reviews.filter((r) => r.activityId === a.activityId && r.revision === rev.revision && (r.itemId ?? null) === (itemId || null) && !(prov?.criteriaIds.includes(r.criterionId) ?? false))) rows.push({ ...base, criterionId: extra.criterionId, status: extra.decision });
    };
    push("", spec.provenance);
    if (spec.type === "blanks") for (const b of spec.blanks) push(b.id, b.provenance);
    if (spec.type === "flashcards") for (const c of spec.cards) push(c.id, c.provenance);
  }
  return rows;
}

const csvCell = (v: string | number): string => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function writeMappingCsv(store: ImportStore, importId: string, path: string): Promise<number> {
  const rows = await mappingRows(store, importId);
  const header = ["activityId", "type", "title", "revision", "itemId", "criterionId", "status", "conceptIds", "evidenceIds", "firstQuote"] as const;
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
  await writeFile(path, lines.join("\n") + "\n");
  return rows.length;
}

/** Rewrites mapping.csv and cost.json for an import; used after generation and after every review. */
export async function writeReports(store: ImportStore, importId: string, outDir: string): Promise<{ rows: number; report: CostReport }> {
  const rows = await writeMappingCsv(store, importId, resolve(outDir, "mapping.csv"));
  const report = await costReport(store, importId);
  await writeFile(resolve(outDir, "cost.json"), JSON.stringify(report, null, 2) + "\n");
  return { rows, report };
}
