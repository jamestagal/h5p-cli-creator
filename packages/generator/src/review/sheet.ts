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

/** A promoted activity whose revision or build is missing or inconsistent: the sheet is not written. */
export class SheetStateError extends Error {
  constructor(importId: string, activityId: string, what: string) { super(`import ${importId}: activity ${activityId} ${what}; the review sheet was not written`); this.name = "SheetStateError"; }
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
    if (a.status !== "promoted" || a.dropped) continue;
    // A promoted activity must point at a promoted revision with a stored build record. Anything less is a damaged
    // store, never "nothing to review": skipping it would leave the activity unreviewed without saying so.
    const broken = (what: string): SheetStateError => new SheetStateError(importId, a.activityId, what);
    if (a.currentRevision === null) throw broken("is promoted but has no current revision");
    const rev = await store.getRevision(a.activityId, a.currentRevision);
    if (!rev) throw broken(`is promoted at revision ${a.currentRevision}, which is missing from the store`);
    if (rev.state !== "promoted") throw broken(`is promoted at revision ${rev.revision}, whose state is ${rev.state}`);
    if (rev.currentBuildId === null) throw broken(`revision ${rev.revision} is promoted but has no current build`);
    const build = await store.getBuildRecord(rev.currentBuildId);
    if (!build) throw broken(`revision ${rev.revision} points at build ${rev.currentBuildId}, whose build record is missing`);
    if (build.activityId !== a.activityId || build.revision !== rev.revision) throw broken(`revision ${rev.revision} points at build ${build.buildId}, which belongs to ${build.activityId} revision ${build.revision}`);
    if (countedScore(scores, a.activityId, rev.revision, build.buildId)) continue;
    rows.push({ entry: { activityId: a.activityId, revision: rev.revision, buildId: build.buildId, type: a.type, itemIds: itemIdsOf(a.activityId, rev.spec) }, title: rev.spec.title, spec: rev.spec, buildKey: build.buildKey });
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

/** The unit's identity and its published assessment conditions, verbatim: the only source for how the unit is assessed (§4.4). */
function unitLines(unit: UnitOfCompetency): string[] {
  return [
    `Unit ${unit.code}, ${unit.release ?? "release not printed"}, text ${unit.textHash.slice(0, 12)}`,
    unit.assessmentConditions
      ? `Assessment conditions (published unit, verbatim): ${unit.assessmentConditions}`
      : "Assessment conditions: none in the published unit text"
  ];
}

function sheetHeader(m: SheetManifest, unit: UnitOfCompetency | null): string {
  const lines = [
    "# Review sheet",
    "",
    `Sheet ${m.sheetId}`,
    `Import ${m.importId}; Rubric ${m.rubricVersion}; ${m.entries.length} ${m.entries.length === 1 ? "activity" : "activities"}; exported ${m.createdAt}`,
    ...(unit ? [`Unit ${unit.code} ${unit.title}${unit.release ? `, ${unit.release}` : ""}, text ${unit.textHash.slice(0, 12)}`, unitLines(unit)[1]!] : ["No unit of competency: mapping is not scored."]),
    "",
    "These activities are unreviewed. Their evidence IDs are source citations: a resolved ID shows that the quoted sentence exists in the source, not that it supports the answer. Their targets are a suggested alignment.",
    "",
    "Score each applicable dimension 0, 1 or 2 in scores.csv; `na` is already filled in where a dimension does not apply. For blanks and flashcards, check every item against its own passages. For every 0 or 1, add a row to findings.csv for each failing item, with the reason. Record your review minutes. Leave `decision` blank or give the decision the scores lead to.",
    "",
    "Negative check (design §4.4): if an activity states or implies one RTO's own arrangements (how it assesses, what it allows) as a fact about the unit, score correctness 0 and start that finding's reason with `rto-claim:`. The gate report counts these findings.",
    ""
  ];
  return lines.join("\n");
}

interface RenderContext { unit: UnitOfCompetency | null; map: ConceptMap | null; source: SourceDocument | null; packagePath: (buildKey: string) => string }

const unique = (ids: string[]): string[] => [...new Set(ids)];

/** One citing unit on the sheet: the activity as a whole, or one of its items. */
interface Citer { label: string; provenance: Provenance | undefined }

/** The activity itself, then each card or blank in order. */
function citers(spec: ActivitySpec): Citer[] {
  const items = spec.type === "blanks" ? spec.blanks : spec.type === "flashcards" ? spec.cards : [];
  return [{ label: "the activity", provenance: spec.provenance }, ...items.map((i) => ({ label: i.id, provenance: i.provenance }))];
}

/** Resolves evidence to sentences and renders passages and targets. */
class Renderer {
  private readonly sentenceOf: Map<string, string>;
  private readonly sentences: Map<string, SourceDocument["sentences"][number]>;
  readonly rtoSentences: Set<string>;
  private readonly targets: Target[];
  constructor(private readonly ctx: RenderContext) {
    this.sentenceOf = new Map(ctx.map?.concepts.flatMap((c) => c.evidence.map((e) => [e.evidenceId, e.sentenceId] as const)) ?? []);
    this.sentences = new Map(ctx.source?.sentences.map((s) => [s.sentenceId, s]) ?? []);
    this.rtoSentences = new Set(ctx.map?.concepts.filter((c) => c.kind === "rto-instruction").flatMap((c) => c.evidence.map((e) => e.sentenceId)) ?? []);
    this.targets = ctx.unit ? targetsOf(ctx.unit) : [];
  }
  sentenceIds(p: Provenance | undefined): string[] {
    return unique((p?.evidenceIds ?? []).map((id) => this.sentenceOf.get(id) ?? (id.startsWith("ev-") ? id.slice(3) : id)));
  }
  passage(sentenceId: string, suffix = ""): string {
    const s = this.sentences.get(sentenceId);
    if (!s) return `- [${sentenceId}] (not found in the stored source)${suffix}`;
    const heading = s.headingPath && s.headingPath.length > 0 ? ` (section: ${s.headingPath.join(" › ")})` : "";
    return `- [${sentenceId}] ${s.text}${heading}${suffix}`;
  }
  passages(p: Provenance | undefined): string[] {
    const ids = this.sentenceIds(p);
    return ids.length > 0 ? ids.map((id) => this.passage(id)) : ["- none cited"];
  }
  targetLines(p: Provenance | undefined): string[] {
    if (!this.ctx.unit) return ["- no unit: mapping is not scored"];
    const ids = unique(p?.criteriaIds ?? []);
    if (ids.length === 0) return ["- none"];
    const known = new Set(this.targets.map((t) => t.id));
    return [...this.targets.filter((t) => ids.includes(t.id)).map(targetLine), ...ids.filter((id) => !known.has(id)).map((id) => `- ${id} (not in the unit)`)];
  }
}

function targetLine(t: Target): string {
  return `- ${t.id} (${t.kind}${t.path.length > 0 ? `, under: ${t.path.join(" › ")}` : ""}): ${t.text}`;
}

/** The activity-level content: the question and options, or the passage, or the description. Items are rendered separately. */
function content(spec: ActivitySpec): string[] {
  if (spec.type === "multiChoice") {
    return [
      `Question: ${plain(spec.question)}`,
      "Options:",
      ...spec.answers.map((a) => `- [${a.correct ? "x" : " "}] ${plain(a.text)}`),
      `Keyed answer: ${spec.answers.filter((a) => a.correct).map((a) => plain(a.text)).join("; ")}`
    ];
  }
  if (spec.type === "blanks") return [...(spec.taskDescription ? [`Task: ${plain(spec.taskDescription)}`] : []), `Passage: ${plain(spec.passage)}`];
  if (spec.type === "flashcards") return spec.description ? [`Description: ${plain(spec.description)}`] : [];
  return [`(${spec.type}: shown in the package only)`];
}

/** One card or blank: what the learner sees, its keyed answer, and its own passages and targets. */
function itemSection(spec: ActivitySpec, itemId: string, r: Renderer): string[] {
  let shown: string[] = [];
  let provenance: Provenance | undefined;
  if (spec.type === "blanks") {
    const b = spec.blanks.find((x) => x.id === itemId)!;
    shown = [`Keyed answer: ${b.answers.join(" / ")}${b.tip ? ` (tip: ${b.tip})` : ""}`];
    provenance = b.provenance;
  } else if (spec.type === "flashcards") {
    const c = spec.cards.find((x) => x.id === itemId)!;
    shown = [`Front: ${plain(c.front)}`, `Keyed back: ${plain(c.back)}`, ...(c.tip ? [`Tip: ${c.tip}`] : [])];
    provenance = c.provenance;
  }
  return [`#### Item ${itemId}`, "", ...shown, "", "(a) Supporting passages:", ...r.passages(provenance), "", "(b) Targets:", ...r.targetLines(provenance), ""];
}

function activitySection(row: { entry: SheetEntry; title: string; spec: ActivitySpec; buildKey: string }, ctx: RenderContext): string {
  const { entry, spec } = row;
  const r = new Renderer(ctx);
  const multiItem = spec.type === "blanks" || spec.type === "flashcards";
  const lines = [
    `## ${entry.activityId}: ${entry.type}, revision ${entry.revision}`,
    "",
    `Title: ${plain(row.title)}`,
    ...(ctx.unit ? [unitLines(ctx.unit)[0]!] : ["Unit: none (mapping is not scored)"]),
    `Package: ${ctx.packagePath(row.buildKey)}`,
    `Build: ${entry.buildId}`,
    `Items (${entry.itemIds.length}): ${entry.itemIds.join(", ")}`,
    "",
    "### Content",
    "",
    ...content(spec),
    ""
  ];
  if (multiItem) {
    lines.push(`### Items: check each one against its own passages`, "");
    for (const itemId of entry.itemIds) lines.push(...itemSection(spec, itemId, r));
    lines.push("### (a) Passages cited for the activity as a whole", "", ...r.passages(spec.provenance), "", "### (b) Targets for the activity as a whole (suggested alignment)", "", ...r.targetLines(spec.provenance), "");
  } else {
    lines.push("### (a) Supporting passages (cited sentences, in full)", "", ...r.passages(spec.provenance), "", "### (b) Targets (suggested alignment)", "", ...r.targetLines(spec.provenance), "");
  }

  // (c): every cited sentence the extractor classed as an RTO instruction, with who cited it
  const citedBy = new Map<string, string[]>();
  for (const c of citers(spec)) for (const sid of r.sentenceIds(c.provenance)) if (r.rtoSentences.has(sid)) citedBy.set(sid, [...(citedBy.get(sid) ?? []), c.label]);
  if (citedBy.size === 0) lines.push("### (c) Flagged RTO-instruction passages: none cited");
  else lines.push("### (c) Flagged RTO-instruction passages (check that the activity does not present them as facts about the unit):", "", ...[...citedBy].map(([sid, by]) => r.passage(sid, ` (cited by ${by.join(", ")})`)));
  if (ctx.unit) lines.push("", unitLines(ctx.unit)[1]!);
  lines.push("");
  return lines.join("\n");
}
