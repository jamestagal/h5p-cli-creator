import { applicable, DIMENSIONS, RUBRIC_VERSION, targetsOf, type ActivitySpec, type ConceptMap, type Provenance, type Target, type UnitOfCompetency } from "@leaplearn/shared";
import type { SourceDocument } from "../ingest/source-document.js";
import { canonicalRecordJson, sha256Hex } from "../store/builds.js";
import type { ImportStore, SheetManifest } from "../store/types.js";
import { countedScore } from "./scores.js";

/** The header of scores.csv (plan Task 11): one row per activity on the sheet. */
export const SCORES_HEADER = ["sheetId", "activityId", "revision", "buildId", ...DIMENSIONS, "minutes", "decision"] as const;
/** The header of findings.csv (R2): one row per failing item per dimension, filled in by the reviewer. */
export const FINDINGS_HEADER = ["sheetId", "activityId", "dimension", "itemId", "score", "reason"] as const;

type SheetEntry = SheetManifest["entries"][number];
const byActivityId = (a: SheetEntry, b: SheetEntry): number => (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0);

/** `sha256(canonical({ importId, unitTextHash, rubricVersion, entries sorted by activityId }))`: createdAt is not part of the identity. */
export function sheetIdFor(m: Pick<SheetManifest, "importId" | "unitTextHash" | "rubricVersion" | "entries">): string {
  return sha256Hex(canonicalRecordJson({ importId: m.importId, unitTextHash: m.unitTextHash, rubricVersion: m.rubricVersion, entries: [...m.entries].sort(byActivityId) }));
}

/** The reviewable items of an activity: blanks and cards by their IDs; a single-item type is its own item. */
export function itemIdsOf(activityId: string, spec: ActivitySpec): string[] {
  if (spec.type === "blanks") return spec.blanks.map((b) => b.id);
  if (spec.type === "flashcards") return spec.cards.map((c) => c.id);
  return [activityId];
}

export interface ReviewSheet { manifest: SheetManifest; created: boolean; markdown: string; scoresCsv: string; findingsCsv: string }
export interface SheetOptions { /** How the sheet names a package, from its build key; the build key itself by default. */ packagePath?: (buildKey: string) => string }

/**
 * Builds the review sheet for every promoted, non-dropped activity whose current build has no counted scored review,
 * and writes its manifest once (R1). Exporting again with nothing changed gives the same sheetId and leaves the stored
 * manifest, and its createdAt, as they are. Returns null, and writes nothing, when no activity needs a review.
 */
export async function exportReviewSheet(store: ImportStore, importId: string, clock: () => Date = () => new Date(), options: SheetOptions = {}): Promise<ReviewSheet | null> {
  const unit = await store.getArtifact<UnitOfCompetency>(importId, "unit");
  const map = await store.getArtifact<ConceptMap>(importId, "conceptMap");
  const source = await store.getArtifact<SourceDocument>(importId, "source");
  const scores = await store.listScores(importId);

  const rows: Array<{ entry: SheetEntry; title: string; spec: ActivitySpec; buildKey: string }> = [];
  const activities = (await store.listActivities(importId)).sort((a, b) => a.order - b.order);
  for (const a of activities) {
    if (a.status !== "promoted" || a.dropped || a.currentRevision === null) continue;
    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev || rev.state !== "promoted" || rev.currentBuildId === null) continue;
    const build = await store.getBuildRecord(rev.currentBuildId);
    if (!build) continue;
    if (countedScore(scores, a.activityId, rev.revision, rev.currentBuildId)) continue;
    rows.push({ entry: { activityId: a.activityId, revision: rev.revision, buildId: rev.currentBuildId, type: a.type, itemIds: itemIdsOf(a.activityId, rev.spec) }, title: rev.spec.title, spec: rev.spec, buildKey: build.buildKey });
  }
  if (rows.length === 0) return null;

  const content = { importId, unitTextHash: unit?.textHash ?? null, rubricVersion: RUBRIC_VERSION, entries: rows.map((r) => r.entry).sort(byActivityId) };
  const sheetId = sheetIdFor(content);
  const created = await store.putSheet({ sheetId, ...content, createdAt: clock().toISOString() });
  const manifest = (await store.getSheet(importId, sheetId))!;

  const packagePath = options.packagePath ?? ((key: string) => key);
  const context: RenderContext = { unit, map, source, packagePath };
  const markdown = [sheetHeader(manifest, unit), ...rows.map((r) => activitySection(r, context))].join("\n");
  const hasUnit = unit !== null;
  const scoreRows = rows.map(({ entry }) => [sheetId, entry.activityId, String(entry.revision), entry.buildId, ...DIMENSIONS.map((d) => (applicable(d, entry.type, hasUnit) ? "" : "na")), "", ""]);
  return { manifest, created, markdown, scoresCsv: csv([[...SCORES_HEADER], ...scoreRows]), findingsCsv: csv([[...FINDINGS_HEADER]]) };
}

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]): string => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** Spec text as a reviewer reads it: tags removed and the common entities decoded. */
function plain(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
}

function sheetHeader(m: SheetManifest, unit: UnitOfCompetency | null): string {
  const lines = [
    "# Review sheet",
    "",
    `Sheet ${m.sheetId}`,
    `Import ${m.importId}; Rubric ${m.rubricVersion}; ${m.entries.length} ${m.entries.length === 1 ? "activity" : "activities"}; exported ${m.createdAt}`,
    unit ? `Unit ${unit.code} ${unit.title}${unit.release ? `, ${unit.release}` : ""}, text ${unit.textHash.slice(0, 12)}` : "No unit of competency: mapping is not scored.",
    "",
    "These activities are unreviewed. Their evidence IDs are source citations: a resolved ID shows that the quoted sentence exists in the source, not that it supports the answer. Their targets are a suggested alignment.",
    "",
    "Score each applicable dimension 0, 1 or 2 in scores.csv; `na` is already filled in where a dimension does not apply. For every 0 or 1, add a row to findings.csv for each failing item, with the reason. Record your review minutes. Leave `decision` blank or give the decision the scores lead to.",
    ""
  ];
  return lines.join("\n");
}

interface RenderContext { unit: UnitOfCompetency | null; map: ConceptMap | null; source: SourceDocument | null; packagePath: (buildKey: string) => string }

/** Every provenance on the activity and its items, activity first, in item order. */
function provenances(spec: ActivitySpec): Provenance[] {
  const items = spec.type === "blanks" ? spec.blanks : spec.type === "flashcards" ? spec.cards : [];
  return [spec.provenance, ...items.map((i) => i.provenance)].filter((p): p is Provenance => p !== undefined);
}
const unique = (ids: string[]): string[] => [...new Set(ids)];

function content(spec: ActivitySpec): string[] {
  if (spec.type === "multiChoice") {
    return [
      `Question: ${plain(spec.question)}`,
      "Options:",
      ...spec.answers.map((a) => `- [${a.correct ? "x" : " "}] ${plain(a.text)}`),
      `Keyed answer: ${spec.answers.filter((a) => a.correct).map((a) => plain(a.text)).join("; ")}`
    ];
  }
  if (spec.type === "blanks") {
    return [
      ...(spec.taskDescription ? [`Task: ${plain(spec.taskDescription)}`] : []),
      `Passage: ${plain(spec.passage)}`,
      "Keyed answers:",
      ...spec.blanks.map((b) => `- ${b.id}: ${b.answers.join(" / ")}${b.tip ? ` (tip: ${b.tip})` : ""}`)
    ];
  }
  if (spec.type === "flashcards") {
    return [
      ...(spec.description ? [`Description: ${plain(spec.description)}`] : []),
      "Cards (front, then the keyed back):",
      ...spec.cards.map((c) => `- ${c.id}: ${plain(c.front)} => ${plain(c.back)}${c.tip ? ` (tip: ${c.tip})` : ""}`)
    ];
  }
  return [`(${spec.type}: shown in the package only)`];
}

function activitySection(row: { entry: SheetEntry; title: string; spec: ActivitySpec; buildKey: string }, ctx: RenderContext): string {
  const { entry, spec } = row;
  const evidenceIds = unique(provenances(spec).flatMap((p) => p.evidenceIds));
  const criteriaIds = unique(provenances(spec).flatMap((p) => p.criteriaIds));
  const sentenceOf = new Map(ctx.map?.concepts.flatMap((c) => c.evidence.map((e) => [e.evidenceId, e.sentenceId] as const)) ?? []);
  const sentences = new Map(ctx.source?.sentences.map((s) => [s.sentenceId, s]) ?? []);
  const rtoSentences = new Set(ctx.map?.concepts.filter((c) => c.kind === "rto-instruction").flatMap((c) => c.evidence.map((e) => e.sentenceId)) ?? []);
  const cited = evidenceIds.map((id) => ({ id, sentenceId: sentenceOf.get(id) ?? (id.startsWith("ev-") ? id.slice(3) : id) }));
  const passage = (sentenceId: string): string => {
    const s = sentences.get(sentenceId);
    if (!s) return `- [${sentenceId}] (not found in the stored source)`;
    const heading = s.headingPath && s.headingPath.length > 0 ? ` (section: ${s.headingPath.join(" › ")})` : "";
    return `- [${sentenceId}] ${s.text}${heading}`;
  };

  const lines = [
    `## ${entry.activityId}: ${entry.type}, revision ${entry.revision}`,
    "",
    `Title: ${plain(row.title)}`,
    ctx.unit ? `Unit ${ctx.unit.code}, ${ctx.unit.release ?? "release not printed"}, text ${ctx.unit.textHash.slice(0, 12)}` : "Unit: none (mapping is not scored)",
    `Package: ${ctx.packagePath(row.buildKey)}`,
    `Build: ${entry.buildId}`,
    `Items (${entry.itemIds.length}): ${entry.itemIds.join(", ")}`,
    "",
    "### Content",
    "",
    ...content(spec),
    "",
    "### (a) Supporting passages (cited sentences, in full)",
    "",
    ...(cited.length > 0 ? cited.map((c) => passage(c.sentenceId)) : ["- none cited"]),
    "",
    "### (b) Targets (suggested alignment)",
    ""
  ];
  if (!ctx.unit) lines.push("- no unit: mapping is not scored");
  else if (criteriaIds.length === 0) lines.push("- none: the activity maps to no PC or KE");
  else {
    const targets = new Map(targetsOf(ctx.unit).map((t) => [t.id, t] as const));
    const ordered = [...targetsOf(ctx.unit).filter((t) => criteriaIds.includes(t.id)), ...criteriaIds.filter((id) => !targets.has(id)).map((id) => ({ id, kind: null, text: "", path: [] }))];
    lines.push(...ordered.map((t) => targetLine(t)));
  }
  const flagged = unique(cited.map((c) => c.sentenceId).filter((sid) => rtoSentences.has(sid)));
  lines.push("");
  if (flagged.length === 0) lines.push("### (c) Flagged RTO-instruction passages: none cited");
  else lines.push("### (c) Flagged RTO-instruction passages (check that the activity does not present them as facts about the unit):", "", ...flagged.map(passage));
  lines.push("");
  return lines.join("\n");
}

function targetLine(t: Target | { id: string; kind: null; text: string; path: string[] }): string {
  if (t.kind === null) return `- ${t.id} (not in the unit)`;
  return `- ${t.id} (${t.kind}${t.path.length > 0 ? `, under: ${t.path.join(" › ")}` : ""}): ${t.text}`;
}

