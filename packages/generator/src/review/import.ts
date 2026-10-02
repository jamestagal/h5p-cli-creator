import { applicable, DIMENSIONS, RUBRIC_VERSION, type Dimension, type DimensionScore, type Finding } from "@leaplearn/shared";
import { canonicalRecordJson, sha256Hex } from "../store/builds.js";
import type { ImportStore, ReviewBatch, ScoreRecord, SheetManifest } from "../store/types.js";
import { appendMissingRecords } from "./batches.js";
import { activityScoreProblems, deriveDecision } from "./rubric.js";
import { FINDINGS_HEADER, SCORES_HEADER } from "./sheet.js";

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. A trailing newline and a BOM are ignored. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ""; let quoted = false; let i = 0;
  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === "\"") { if (src[i + 1] === "\"") { field += "\""; i += 2; continue; } quoted = false; i += 1; continue; }
      field += ch; i += 1; continue;
    }
    if (ch === "\"" && field === "") { quoted = true; i += 1; continue; }
    if (ch === ",") { row.push(field); field = ""; i += 1; continue; }
    if (ch === "\r" && src[i + 1] === "\n") { i += 1; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface ImportFiles { scoresCsv: string; findingsCsv: string; reviewer: string }

/** A scored row that passed every check except, possibly, the current-state check. */
interface Candidate { line: number; activityId: string; entry: SheetManifest["entries"][number]; manifest: SheetManifest; row: Omit<ScoreRecord, "batchId" | "sequence" | "rowIndex"> }

export interface Validation {
  /** Every problem in the files, each naming its row or finding line. Any problem means nothing is written. */
  problems: string[];
  /** Scored rows whose sheet entry is no longer the activity's current state, each naming what changed. Any stale row means nothing is written. */
  stale: string[];
  /** Scored rows not committed before, in CSV order. */
  fresh: Candidate[];
  committed: number;
  notScored: number;
}

const numberCell = (v: string): number | null => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const findingOrder = (a: Finding, b: Finding): number => canonicalRecordJson(a) < canonicalRecordJson(b) ? -1 : canonicalRecordJson(a) > canonicalRecordJson(b) ? 1 : 0;

/** `sha256(canonical({ sheetId, activityId, revision, buildId, scores, findings sorted, minutes, reviewer }))` (plan Task 12 step 8). */
export function rowKeyFor(r: { sheetId: string; activityId: string; revision: number; buildId: string; scores: Record<Dimension, DimensionScore>; findings: Finding[]; minutes: number; reviewer: string }): string {
  return sha256Hex(canonicalRecordJson({ sheetId: r.sheetId, activityId: r.activityId, revision: r.revision, buildId: r.buildId, scores: r.scores, findings: [...r.findings].sort(findingOrder), minutes: r.minutes, reviewer: r.reviewer }));
}

/**
 * Checks a filled-in scores.csv and findings.csv against their stored sheet manifests and the import's current state
 * (design §7.2, plan Task 12 steps 1-9). Reports every problem at once. A row already committed (same rowKey) is
 * recognised before the current-state check, so a committed row is never reported stale.
 */
export async function validateImport(store: ImportStore, importId: string, files: ImportFiles, clock: () => Date = () => new Date()): Promise<Validation> {
  const problems: string[] = []; const stale: string[] = [];
  const scoreRows = parseCsv(files.scoresCsv); const findingRows = parseCsv(files.findingsCsv);
  const header = (rows: string[][], expected: readonly string[], file: string): boolean => {
    const got = (rows[0] ?? []).map((c) => c.trim());
    if (got.join(",") === expected.join(",")) return true;
    problems.push(`${file}: the header must be "${expected.join(",")}", got "${got.join(",")}"`);
    return false;
  };
  const scoresOk = header(scoreRows, SCORES_HEADER, "scores.csv");
  const findingsOk = header(findingRows, FINDINGS_HEADER, "findings.csv");
  if (!scoresOk || !findingsOk) return { problems, stale, fresh: [], committed: 0, notScored: 0 };

  const sheets = new Map<string, SheetManifest | null>();
  const sheetOf = async (sheetId: string): Promise<SheetManifest | null> => {
    if (!sheets.has(sheetId)) sheets.set(sheetId, /^[0-9a-f]{64}$/.test(sheetId) ? await store.getSheet(importId, sheetId) : null);
    return sheets.get(sheetId)!;
  };

  // Rows: identity against the manifest, duplicates, scored or not, and the score cells.
  interface Row { n: number; activityId: string; sheetId: string; manifest: SheetManifest; entry: SheetManifest["entries"][number]; scores: Record<Dimension, DimensionScore>; minutes: number; decision: string; ok: boolean; findings: Finding[] }
  const rows = new Map<string, Row>(); const seen = new Set<string>();
  let notScored = 0;
  for (const [i, cells] of scoreRows.slice(1).entries()) {
    const n = i + 1;
    const cell = (name: (typeof SCORES_HEADER)[number]): string => (cells[SCORES_HEADER.indexOf(name)] ?? "").trim();
    const activityId = cell("activityId"); const sheetId = cell("sheetId");
    const label = `row ${n} (${activityId || "no activityId"})`;
    if (cells.length !== SCORES_HEADER.length) { problems.push(`${label}: has ${cells.length} cells, expected ${SCORES_HEADER.length}`); continue; }
    if (seen.has(activityId)) { problems.push(`${label}: ${activityId} appears more than once in scores.csv`); continue; }
    seen.add(activityId);
    const manifest = await sheetOf(sheetId);
    if (!manifest) { problems.push(`${label}: sheet ${sheetId || "(blank)"} is not a sheet of import ${importId}`); continue; }
    const entry = manifest.entries.find((e) => e.activityId === activityId);
    if (!entry) { problems.push(`${label}: activity ${activityId} is not on sheet ${sheetId}`); continue; }
    if (cell("revision") !== String(entry.revision) || cell("buildId") !== entry.buildId) { problems.push(`${label}: revision ${cell("revision")} and build ${cell("buildId")} do not match the sheet, which has revision ${entry.revision} and build ${entry.buildId}`); continue; }

    const hasUnit = manifest.unitTextHash !== null;
    const prefilled = (d: Dimension): boolean => !applicable(d, entry.type, hasUnit);
    const filled = DIMENSIONS.filter((d) => { const v = cell(d); return v !== "" && !(v === "na" && prefilled(d)); });
    if (filled.length === 0) { notScored += 1; continue; }
    const ok = { value: true };
    const fail = (msg: string): void => { problems.push(`${label}: ${msg}`); ok.value = false; };
    const blank = DIMENSIONS.filter((d) => !prefilled(d) && cell(d) === "");
    if (blank.length > 0) fail(`partly scored: ${blank.join(", ")} ${blank.length === 1 ? "is" : "are"} blank; score every applicable dimension or none`);
    const scores = {} as Record<Dimension, DimensionScore>;
    for (const d of DIMENSIONS) {
      const v = cell(d);
      if (prefilled(d)) {
        if (v !== "" && v !== "na") fail(`${d} does not apply to ${entry.type}${hasUnit ? "" : " without a unit"}; it must be na, got ${v}`);
        scores[d] = "na";
      } else if (v === "na") { fail(`${d} applies to ${entry.type}${d === "mapping" ? " with a unit" : ""}; na is not allowed, score it 0, 1 or 2`); scores[d] = "na"; }
      else if (v === "0" || v === "1" || v === "2") scores[d] = Number(v) as 0 | 1 | 2;
      else { if (v !== "") fail(`${d} must be 0, 1 or 2, got ${v}`); scores[d] = "na"; }
    }
    const minutes = numberCell(cell("minutes"));
    if (minutes === null) fail(`minutes must be a non-negative number on a scored row, got "${cell("minutes")}"`);
    rows.set(activityId, { n, activityId, sheetId, manifest, entry, scores, minutes: minutes ?? 0, decision: cell("decision"), ok: ok.value, findings: [] });
  }

  // Findings: each attaches to a scored row of this file.
  for (const [i, cells] of findingRows.slice(1).entries()) {
    const n = i + 1;
    const cell = (name: (typeof FINDINGS_HEADER)[number]): string => (cells[FINDINGS_HEADER.indexOf(name)] ?? "").trim();
    const label = `finding ${n} (${cell("activityId") || "no activityId"}, ${cell("dimension") || "no dimension"}, ${cell("itemId") || "no item"})`;
    if (cells.length !== FINDINGS_HEADER.length) { problems.push(`${label}: has ${cells.length} cells, expected ${FINDINGS_HEADER.length}`); continue; }
    const row = rows.get(cell("activityId"));
    if (!row) { problems.push(`${label}: activity ${cell("activityId")} has no scored row in scores.csv`); continue; }
    if (cell("sheetId") !== row.sheetId) { problems.push(`${label}: sheet ${cell("sheetId")} differs from its row's sheet ${row.sheetId}`); row.ok = false; continue; }
    const dimension = cell("dimension") as Dimension;
    const errors: string[] = [];
    if (!(DIMENSIONS as readonly string[]).includes(dimension)) errors.push(`dimension must be one of ${DIMENSIONS.join(", ")}`);
    else if (!applicable(dimension, row.entry.type, row.manifest.unitTextHash !== null)) errors.push(`${dimension} does not apply to ${row.entry.type}; a finding cannot be recorded on it`);
    if (!row.entry.itemIds.includes(cell("itemId"))) errors.push(`item ${cell("itemId") || "(blank)"} is not in ${row.activityId} revision ${row.entry.revision} (items: ${row.entry.itemIds.join(", ")})`);
    if (cell("score") !== "0" && cell("score") !== "1") errors.push(`a finding scores 0 or 1, got ${cell("score") || "(blank)"}`);
    if (cell("reason") === "") errors.push("the reason is blank");
    if (errors.length > 0) { for (const e of errors) problems.push(`${label}: ${e}`); row.ok = false; continue; }
    row.findings.push({ dimension, itemId: cell("itemId"), score: Number(cell("score")) as 0 | 1, reason: cell("reason") });
  }

  // The rubric rule, the decision column, the row key, then current state for rows not committed before.
  const committedKeys = new Set((await store.listScores(importId)).map((s) => s.rowKey));
  const record = await store.getImport(importId);
  const activities = new Map((await store.listActivities(importId)).map((a) => [a.activityId, a]));
  const fresh: Candidate[] = []; let committed = 0;
  for (const row of [...rows.values()].sort((a, b) => a.n - b.n)) {
    if (!row.ok) continue;
    const label = `row ${row.n} (${row.activityId})`;
    const hasUnit = row.manifest.unitTextHash !== null;
    const rubric = activityScoreProblems(row.scores, row.findings, row.entry.type, hasUnit);
    if (rubric.length > 0) { for (const p of rubric) problems.push(`${label}: ${p}`); continue; }
    const derived = deriveDecision(row.scores, row.entry.type, hasUnit);
    if (row.decision !== "" && row.decision !== derived) { problems.push(`${label}: decision "${row.decision}" does not match the scores; the derived decision is "${derived}"`); continue; }
    const findings = [...row.findings].sort(findingOrder);
    const key = rowKeyFor({ sheetId: row.sheetId, activityId: row.activityId, revision: row.entry.revision, buildId: row.entry.buildId, scores: row.scores, findings, minutes: row.minutes, reviewer: files.reviewer });
    if (committedKeys.has(key)) { committed += 1; continue; }

    const changes: string[] = [];
    const activity = activities.get(row.activityId);
    const current = activity?.currentRevision ?? null;
    if (current !== row.entry.revision) changes.push(`revision changed (the sheet has revision ${row.entry.revision}; the activity is now at ${current === null ? "no revision" : `revision ${current}`})`);
    else {
      const rev = await store.getRevision(row.activityId, current);
      if (rev?.currentBuildId !== row.entry.buildId) changes.push(`build changed (the sheet has build ${row.entry.buildId}; the revision now points at ${rev?.currentBuildId ?? "no build"})`);
    }
    if ((record?.unitTextHash ?? null) !== row.manifest.unitTextHash) changes.push("unit text changed since the sheet was exported");
    if (row.manifest.rubricVersion !== RUBRIC_VERSION) changes.push(`rubric changed (the sheet uses ${row.manifest.rubricVersion}; this build scores against ${RUBRIC_VERSION})`);
    if (changes.length > 0) { stale.push(`${label}: stale: ${changes.join("; ")}`); continue; }

    fresh.push({ line: row.n, activityId: row.activityId, entry: row.entry, manifest: row.manifest, row: {
      rowKey: key, sheetId: row.sheetId, importId, activityId: row.activityId, revision: row.entry.revision, buildId: row.entry.buildId, unitTextHash: row.manifest.unitTextHash,
      rubricVersion: row.manifest.rubricVersion, reviewer: files.reviewer, scores: row.scores, findings, minutes: row.minutes, decision: derived, decidedAt: clock().toISOString()
    } });
  }
  const sheetIds = [...new Set(fresh.map((c) => c.row.sheetId))];
  if (sheetIds.length > 1) problems.push(`scores.csv mixes rows from ${sheetIds.length} sheets (${sheetIds.join(", ")}); import one sheet at a time`);
  return { problems, stale, fresh, committed, notScored };
}

export type ImportResult =
  | { status: "refused"; problems: string[]; stale: string[] }
  | { status: "nothing-new"; committed: number; notScored: number }
  | { status: "imported"; batch: ReviewBatch; committed: number; notScored: number };

/**
 * Imports a filled-in sheet (design §7.3, R8). All or nothing: any problem or stale row writes nothing. Otherwise the
 * new rows become one batch, committed by its file's atomic appearance, then appended to the score and acceptance
 * ledgers. The caller holds the import's lock, whose acquisition has already replayed earlier committed batches.
 */
export async function importScores(store: ImportStore, importId: string, files: ImportFiles, clock: () => Date = () => new Date()): Promise<ImportResult> {
  const v = await validateImport(store, importId, files, clock);
  if (v.problems.length > 0 || v.stale.length > 0) return { status: "refused", problems: v.problems, stale: v.stale };
  if (v.fresh.length === 0) return { status: "nothing-new", committed: v.committed, notScored: v.notScored };

  const batchId = sha256Hex(canonicalRecordJson(v.fresh.map((c) => c.row.rowKey).sort()));
  const sequence = 1 + Math.max(0, ...(await store.listBatches(importId)).map((b) => b.sequence));
  const batch: ReviewBatch = {
    batchId, sequence, importId, sheetId: v.fresh[0]!.row.sheetId, reviewer: files.reviewer, importedAt: clock().toISOString(),
    rows: v.fresh.map((c, rowIndex) => ({ ...c.row, batchId, sequence, rowIndex }))
  };
  await store.commitBatch(batch);
  await appendMissingRecords(store, importId, [batch]);
  return { status: "imported", batch, committed: v.committed, notScored: v.notScored };
}
