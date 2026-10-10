import type { EngineIdentity, LibraryRegistry } from "@leaplearn/engine";
import { assertGeneratedProvenance, SCHEMA_VERSION, type ConceptMap, type ImportStatus, type UnitOfCompetency } from "@leaplearn/shared";
import { parseUnit } from "../competency/parse-unit.js";
import { assertExtractionRequestsFit, chunkSentences, extractConceptMap, type ChunkConcept } from "../concepts/index.js";
import type { SourceDocument } from "../ingest/source-document.js";
import { ANTHROPIC_TIMEOUT_MS } from "../llm/anthropic-provider.js";
import { budgetSnapshot, DEFAULT_BUDGET_LIMITS, type BudgetLimits } from "../llm/budget.js";
import { MODEL_ROLES, REQUEST_PROFILES } from "../llm/models.js";
import type { ModelProvider } from "../llm/provider.js";
import { BudgetRefused, ContentFailure, RunStopped } from "../llm/runner.js";
import { planActivities, DEFAULT_PLAN_RULES, type ActivityPlan, type PlannedType, type PlanRules } from "../plan/planner.js";
import { createProducers } from "../produce/index.js";
import { PROMPT_VERSION, type PromptConfig } from "../prompts/system.js";
import { assertWritableStoreVersion, OriginalSourceError, STORE_VERSION, type ActivityRecord, type ImportRecord, type ImportStore, type OriginalSourceExt, type RevisionRecord } from "../store/types.js";
import { sha256Hex } from "../store/builds.js";
import { assertSameOriginal } from "../store/originals.js";
import { assertCurrentLayout } from "../store/layout.js";
import { DEFAULT_CHUNK_TOKENS, IncompatibleResumeError, runFingerprint } from "./fingerprint.js";
import { assertEvidenceInScope, authoritativeScope, firstDifference, scopedImport, scopeRecord, ScopeIntegrityError, type GenerationScopeEntries, type ScopeInput } from "../scope/authoritative.js";
import { chunkScope } from "../scope/render.js";
import type { ResolvedScope } from "../scope/resolve.js";
import { buildRevision } from "./build.js";
import { attemptsByKey, budgetFromLedger, reconcile, reconcileElapsed, runLanes, runOperation, type OperationContext } from "./operations.js";

export interface RunImportInput {
  importId: string; name: string; source: SourceDocument; unitText: string | null; selectedTypes: readonly PlannedType[];
  budget: { usdMicro: number } & Partial<BudgetLimits>; promptConfig: PromptConfig; language: string; customisation: string | null; orgId?: string;
  /** A DOCX or ODT source's original bytes: required for those kinds, stored once and verified before any dispatch (design §4.2). */
  original?: { ext: OriginalSourceExt; bytes: Buffer };
  /**
   * A generation scope (scope design §2.9): the author's scope file and the source's bytes. Everything is recomputed from
   * them; the document re-read from the bytes becomes the run's source. Absent: the whole document, exactly as before.
   */
  scope?: ScopeInput;
}
export type ProgressEvent = { kind: "status"; status: ImportStatus } | { kind: "activity"; activityId: string; status: ActivityRecord["status"]; error?: string } | { kind: "attempt"; purpose: string; status: string; costUsdMicro: number | null };
export interface RunImportDeps {
  store: ImportStore; provider: ModelProvider; registry: LibraryRegistry;
  /** The engine that builds this run's revisions; stamped on each build record when it builds, never when it produces. */
  engineIdentity: EngineIdentity;
  concurrency?: number; chunkTokens?: number; rules?: PlanRules; clock?: () => Date; sleep?: (ms: number) => Promise<void>; onProgress?: (event: ProgressEvent) => void;
  /** The longest one provider call can take (the adapter's request timeout); bounds what an interrupted attempt is charged. */
  maxAttemptMs?: number;
}
/** The adapter's request timeout is the bound on one call, so it is also the tail a killed run is charged; taken from the adapter so the two cannot drift. */
export const DEFAULT_MAX_ATTEMPT_MS = ANTHROPIC_TIMEOUT_MS;

/** The production settings an import was generated with, stored as the `settings` artifact for regeneration. */
export interface ImportSettings { promptConfig: PromptConfig; rules: PlanRules; language: string }

export const SKIPPED_PREFIX = "skipped: ";
const RETRIABLE_PREFIXES = [SKIPPED_PREFIX, "budget: ", "system: "];

/** Activities never attempted (skipped by a stop) or stopped by budget or infrastructure are re-dispatched on resume; content failures stay failed until a person asks for regeneration (spec §5). */
export function isPending(activity: ActivityRecord): boolean {
  if (activity.status === "promoted") return false;
  if (activity.status === "failed") return RETRIABLE_PREFIXES.some((p) => activity.error?.startsWith(p));
  return true;
}

/** The texts of promoted revisions of a type, which a new activity must not repeat. */
export function existingTexts(revisions: RevisionRecord[]): { questions: string[]; passages: string[]; fronts: string[] } {
  const out = { questions: [] as string[], passages: [] as string[], fronts: [] as string[] };
  for (const r of revisions) {
    const s = r.spec;
    if (s.type === "multiChoice") out.questions.push(s.question.replace(/<[^>]+>/g, ""));
    if (s.type === "blanks") out.passages.push(s.passage);
    if (s.type === "flashcards") out.fronts.push(...s.cards.map((c) => c.front));
  }
  return out;
}

/** Duplicates removed, first occurrence kept: the plan, the lanes and the fingerprint all see one entry per type. */
export function canonicalTypes(types: readonly PlannedType[]): PlannedType[] {
  return [...new Set(types)];
}

export async function runImport(rawInput: RunImportInput, deps: RunImportDeps): Promise<ImportRecord> {
  let input: RunImportInput = { ...rawInput, selectedTypes: canonicalTypes(rawInput.selectedTypes) };
  // A scope is validated before the lock, so a refusal makes no write at all (not even lock recovery) and no model call.
  let scope: ResolvedScope | null = null;
  if (input.scope) {
    const authoritative = await authoritativeScope(input.source, input.original, input.scope, deps.chunkTokens);
    input = { ...input, source: authoritative.document };
    scope = authoritative.scope;
  }
  const chunkTokens = scope ? scope.previewConfig.chunkTokens : deps.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const rules = deps.rules ?? DEFAULT_PLAN_RULES;
  const fingerprint = runFingerprint({ sourceTextHash: input.source.textHash, extractionVersion: input.source.metadata.extractionVersion, unitText: input.unitText, selectedTypes: input.selectedTypes, language: input.language, promptConfig: input.promptConfig, customisation: input.customisation, chunkTokens, rules, ...(scope ? { generationScope: { scopeHash: scope.scopeHash, chunkTokens: scope.previewConfig.chunkTokens, scopedLayoutVersion: scope.previewConfig.scopedLayoutVersion } } : {}) });
  /**
   * Every check a resume must pass before anything is written: store version, layout, fingerprint, the scope's presence
   * or absence, and a scoped import's stored records. `scoped` is whether the import is scoped (scopedImport).
   */
  const assertResumable = async (existing: ImportRecord | null, scoped: boolean): Promise<void> => {
    if (existing) assertWritableStoreVersion(existing, `import ${input.importId}`); // before any write, and before the fingerprint: a phase-2 import is refused as such
    if (existing) await assertCurrentLayout(deps.store, input.importId, `import ${input.importId}`); // a version-2 import from before build records is refused too, before any write
    if (existing && existing.fingerprint !== fingerprint) throw new IncompatibleResumeError(input.importId, existing.fingerprint, fingerprint);
    // Scope records are written only after the import record, and a scoped import is never resumed without its scope, whatever its fingerprint says.
    if (scoped && !existing) throw new ScopeIntegrityError(`import ${input.importId} has generation scope records but no import record; they do not belong to it. Use a new output directory`);
    if (scoped && !scope) throw new ScopeIntegrityError(`import ${input.importId} is a scoped import, but its fingerprint is a whole-document run's; its records have been altered. Use a new output directory`);
    if (existing && scope) await assertScopeIntegrity(deps.store, existing, input.source, scope); // stored records are recomputed and compared, before any write
  };
  // Taking the lock may write (recovery completes a committed review batch and rewrites the reports). A resume of a
  // scoped import, or a scoped run, that would be refused is therefore refused from a read before the lock, so it leaves
  // the directory exactly as it was; the same checks run again under the lock, where the read cannot be stale. For a
  // whole-document run of an unscoped import, this only reads whether the import is scoped; its checks run under the
  // lock, as before.
  const preLock = await deps.store.getImport(input.importId);
  const scopedBefore = await scopedImport(deps.store, input.importId, preLock);
  if (scope || scopedBefore) await assertResumable(preLock, scopedBefore);
  if (scope) await checkOriginal(deps.store, input); // secureOriginal's checks, which only read; it repeats them under the lock
  const lock = await deps.store.lock(input.importId);
  try {
    const existing = await deps.store.getImport(input.importId); // read under the lock: a pre-lock read could be stale
    await assertResumable(existing, await scopedImport(deps.store, input.importId, existing));
    await secureOriginal(deps.store, input); // before the import record and any dispatch; a conflicting original is refused with no write

    return await runLocked(input, deps, existing, fingerprint, chunkTokens, rules, scope);
  } finally {
    await lock.release();
  }
}

/**
 * Keeps a structured source's original bytes unchanged in the import: they must hash to the document's originalSha256,
 * and on resume to the hash recorded with the stored source and to the stored original itself. The first run stores
 * them (immutably) and reads them back to verify. Anything else throws OriginalSourceError before any write.
 */
async function secureOriginal(store: ImportStore, input: RunImportInput): Promise<void> {
  const checked = await checkOriginal(store, input);
  if (!checked || checked.stored) return;
  await store.putOriginalSource(input.importId, checked.ext, checked.bytes);
  const readBack = await store.getOriginalSource(input.importId);
  if (!readBack || sha256Hex(readBack.bytes) !== checked.supplied) throw new OriginalSourceError(`import ${input.importId}'s original did not read back with sha256 ${checked.supplied}`);
}

/**
 * secureOriginal's checks, which only read: the supplied original against the document, the recorded hash and the
 * stored original. A scoped run makes them before the lock too. Returns what secureOriginal stores, or null for a
 * source kind that keeps no original.
 */
async function checkOriginal(store: ImportStore, input: RunImportInput): Promise<{ ext: OriginalSourceExt; bytes: Buffer; supplied: string; stored: boolean } | null> {
  const kind = input.source.kind;
  if (kind !== "docx" && kind !== "odt") return null;
  const expected = input.source.metadata.originalSha256;
  if (!input.original || expected === undefined) throw new OriginalSourceError(`a ${kind} source is run with its original bytes and their hash; import ${input.importId} was given ${input.original ? "no originalSha256" : "no original bytes"}`);
  const supplied = sha256Hex(input.original.bytes);
  if (supplied !== expected) throw new OriginalSourceError(`the supplied original (sha256 ${supplied}) is not the file the ${kind} document was read from (sha256 ${expected})`);
  const recorded = (await store.getArtifact<SourceDocument>(input.importId, "source"))?.metadata.originalSha256;
  const stored = await store.getOriginalSource(input.importId);
  if (stored && recorded !== undefined && sha256Hex(stored.bytes) !== recorded) throw new OriginalSourceError(`import ${input.importId}'s stored original (sha256 ${sha256Hex(stored.bytes)}) no longer matches the hash recorded with its source (${recorded}); the stored original has been altered`);
  if (recorded !== undefined && supplied !== recorded) throw new OriginalSourceError(`import ${input.importId} was created from an original with sha256 ${recorded}; the supplied file has sha256 ${supplied}. The original is stored once and never replaced; use a new output directory for a changed source`);
  if (stored) assertSameOriginal(input.importId, stored, input.original.ext, input.original.bytes);
  return { ext: input.original.ext, bytes: input.original.bytes, supplied, stored: stored !== null };
}

/**
 * A scoped resume trusts no stored scope record: the import record's scope hash must be this scope's, the stored source
 * must equal the source re-read from the bytes, and the stored generationScope record must equal the one recomputed now,
 * in its payload, configuration and every derived field (its declared hash alone would miss an edit that leaves the hash
 * unchanged). Entries are history and are not compared. Stored extraction results (cached chunks and the concept map)
 * must cite only the scope, so the evidence guard refuses them here, before any write, as well as where they are used.
 */
async function assertScopeIntegrity(store: ImportStore, existing: ImportRecord, source: SourceDocument, scope: ResolvedScope): Promise<void> {
  const importId = existing.importId;
  if (existing.generationScope && existing.generationScope.scopeHash !== scope.scopeHash) throw new ScopeIntegrityError(`import ${importId}'s import record names scope ${existing.generationScope.scopeHash.slice(0, 12)}, not this scope (${scope.scopeHash.slice(0, 12)}); the import record has been altered. Use a new output directory`);
  const storedSource = await store.getArtifact<SourceDocument>(importId, "source");
  const storedScope = await store.getArtifact<unknown>(importId, "generationScope");
  // Both are written before the first model call. They may be missing only when a run was interrupted before writing
  // them; once generation has begun (an operation, an attempt or an activity is recorded, or the import got past
  // ingestion) a missing one was removed, and the import cannot be trusted.
  if (storedSource === null || storedScope === null) {
    const begun = !["queued", "ingesting", "failed"].includes(existing.status) || (await store.listOperations(importId)).length > 0 || (await store.listAttempts(importId)).length > 0 || (await store.listActivities(importId)).length > 0;
    if (begun) throw new ScopeIntegrityError(`import ${importId}'s stored ${storedSource === null ? "source" : "generation scope"} is missing, although generation has begun; it has been removed. Use a new output directory`);
  }
  const sourceDifference = storedSource === null ? null : firstDifference(storedSource, JSON.parse(JSON.stringify(source)));
  if (sourceDifference) throw new ScopeIntegrityError(`import ${importId}'s stored source differs from the source re-read from its bytes at ${sourceDifference}; the stored source has been altered. Use a new output directory`);
  const scopeDifference = storedScope === null ? null : firstDifference(storedScope, JSON.parse(JSON.stringify(scopeRecord(scope))));
  if (scopeDifference) throw new ScopeIntegrityError(`import ${importId}'s stored generation scope differs from the one recomputed from the scope file and the source at ${scopeDifference}; the stored record has been altered. Use a new output directory`);
  const stored: Array<[string, Parameters<typeof assertEvidenceInScope>[0] | null]> = [];
  for (let i = 0; i < chunkScope(scope).length; i++) stored.push([`chunk-${i}`, await store.getArtifact<ChunkConcept[]>(importId, `chunk-${i}`)]);
  stored.push(["conceptMap", (await store.getArtifact<ConceptMap>(importId, "conceptMap"))?.concepts ?? null]);
  for (const [name, concepts] of stored) {
    if (!concepts) continue;
    try { assertEvidenceInScope(concepts, scope, source); } catch (err) { throw new ScopeIntegrityError(`import ${importId}'s stored ${name}: ${err instanceof Error ? err.message : String(err)}`); }
  }
}

/** Appends this run's spelling of the scope, with its redundant-entry notes, to the entries history unless the same spelling is already there. */
async function recordScopeEntries(store: ImportStore, importId: string, scope: ResolvedScope, at: string): Promise<void> {
  const prior = await store.getArtifact<GenerationScopeEntries>(importId, "generationScopeEntries");
  const spelt = JSON.parse(JSON.stringify({ include: scope.entries.include, exclude: scope.entries.exclude })) as { include: unknown[]; exclude: unknown[] };
  if (prior?.history.some((h) => firstDifference({ include: h.include, exclude: h.exclude }, spelt) === null)) return;
  await store.putArtifact(importId, "generationScopeEntries", { history: [...(prior?.history ?? []), { ...spelt, redundant: [...scope.redundant], firstUsedAt: at }] } satisfies GenerationScopeEntries);
}

async function runLocked(input: RunImportInput, deps: RunImportDeps, existing: ImportRecord | null, fingerprint: string, chunkTokens: number, rules: PlanRules, scope: ResolvedScope | null): Promise<ImportRecord> {
  const clock = deps.clock ?? (() => new Date());
  const store = deps.store;
  const now = () => clock().toISOString();
  const emit = deps.onProgress ?? (() => undefined);
  const limits: BudgetLimits = { ...DEFAULT_BUDGET_LIMITS, ...input.budget };

  // Snapshot what an interrupted run (of generate or regenerate) left behind BEFORE any write: this run's first write
  // replaces the record's updatedAt, and reconcile() stamps its own completedAt on interrupted operations; neither is
  // evidence of the interrupted run. Its time is charged and its anchor cleared in that first write, so even a run
  // that returns at once for a finished import leaves no stale anchor for a later run to misread.
  const events = await store.listAttempts(input.importId);
  const operationsLeftBehind = await store.listOperations(input.importId);
  const runStartedMs = clock().getTime();
  const maxAttemptMs = deps.maxAttemptMs ?? DEFAULT_MAX_ATTEMPT_MS;
  const elapsedBeforeMs = existing?.currentRun
    ? reconcileElapsed({ run: existing.currentRun, savedElapsedMs: existing.budgetUsed.elapsedMs, events, operations: operationsLeftBehind, updatedAt: existing.updatedAt, nowMs: runStartedMs, maxAttemptMs, limitMs: limits.elapsedMs })
    : existing?.budgetUsed.elapsedMs ?? 0;

  const marker = scope ? { generationScope: { scopeHash: scope.scopeHash } } : {}; // before the stored scope records, so removing them leaves the import scoped
  let record: ImportRecord = existing
    ? { ...existing, ...marker, budget: limits, budgetUsed: { ...existing.budgetUsed, elapsedMs: elapsedBeforeMs }, currentRun: null, updatedAt: now() }
    : { storeVersion: STORE_VERSION, importId: input.importId, orgId: input.orgId ?? "local", name: input.name, sourceType: input.source.kind, status: "queued", customisation: input.customisation, language: input.language, unitTextHash: null, selectedTypes: [...input.selectedTypes], fingerprint, budget: limits, budgetUsed: { spentUsdMicro: 0, reservedUsdMicro: 0, spentTokens: 0, requests: 0, elapsedMs: 0 }, currentRun: null, error: null, idempotencyKey: input.importId, createdAt: now(), updatedAt: now(), ...marker };
  await store.putImport(record);
  // What production needs besides the source and plan, so `leap regenerate` produces exactly as this run did. The
  // fingerprint pins these values, so writing them on any run of the import, including one that finished earlier, is safe.
  if (!(await store.getArtifact<ImportSettings>(input.importId, "settings"))) await store.putArtifact(input.importId, "settings", { promptConfig: input.promptConfig, rules, language: input.language } satisfies ImportSettings);
  if (scope) await recordScopeEntries(store, input.importId, scope, now()); // every spelling is recorded, a finished import's included
  if (record.status === "ready") return record;

  if (record.status === "ready_with_failures" && !(await store.listActivities(input.importId)).some(isPending)) return record;

  const setStatus = async (status: ImportStatus, error: string | null = record.error): Promise<void> => { record = { ...record, status, error, updatedAt: now() }; await store.putImport(record); emit({ kind: "status", status }); };

  await reconcile(store, input.importId, clock);
  record = { ...record, currentRun: { startedAt: new Date(runStartedMs).toISOString(), elapsedBeforeMs }, updatedAt: now() };
  await store.putImport(record); // the anchor is durable before any dispatch
  const budget = budgetFromLedger(limits, events, runStartedMs, elapsedBeforeMs);
  const halt: { stop: { kind: "budget" | "system"; reason: string } | null; error: unknown } = { stop: null, error: undefined };
  const ctx: OperationContext = { store, provider: deps.provider, budget, importId: input.importId, clock, attemptsByKey: attemptsByKey(events), onAttempt: (a) => emit({ kind: "attempt", ...a }), stop: () => halt.stop?.reason ?? null };
  if (deps.sleep) ctx.sleep = deps.sleep;
  const persistBudget = async (): Promise<void> => { record = { ...record, budgetUsed: budgetSnapshot(budget, clock().getTime()), updatedAt: now() }; await store.putImport(record); };
  /** The run is over: fold its time into the import and clear the anchor. Every exit path calls this before returning or rethrowing. */
  const foldRun = async (): Promise<void> => { record = { ...record, budgetUsed: budgetSnapshot(budget, clock().getTime()), currentRun: null, updatedAt: now() }; await store.putImport(record); };

  try {
    await setStatus("ingesting");
    // Both size checks run before any dispatch, so an oversize table row or request fails the import with no model call.
    const chunks = scope ? chunkScope(scope) : chunkSentences(input.source.sentences, chunkTokens);
    assertExtractionRequestsFit(chunks, { promptConfig: input.promptConfig });
    if (!(await store.getArtifact(input.importId, "source"))) await store.putArtifact(input.importId, "source", input.source);
    if (scope) {
      // the scope is stored with the source, before parseUnit, the first model call
      if (!(await store.getArtifact(input.importId, "generationScope"))) await store.putArtifact(input.importId, "generationScope", scopeRecord(scope));
    }

    let unit: UnitOfCompetency | null = null;
    if (input.unitText !== null) {
      const unitText = input.unitText;
      const parsed = await runOperation<UnitOfCompetency>(ctx, {
        purpose: "parseUnit", activityId: null, origin: "shared", requestId: null, key: `${input.importId}:parseUnit`,
        load: () => store.getArtifact<UnitOfCompetency>(input.importId, "unit"),
        work: (runner) => parseUnit(unitText, runner),
        persist: (u) => store.putArtifact(input.importId, "unit", u)
      });
      unit = parsed.result;
      if (record.unitTextHash !== unit.textHash) { record = { ...record, unitTextHash: unit.textHash, updatedAt: now() }; await store.putImport(record); }
    }

    await setStatus("extracting");
    const chunkCache = { get: (i: number) => store.getArtifact<ChunkConcept[]>(input.importId, `chunk-${i}`), put: (i: number, c: ChunkConcept[]) => store.putArtifact(input.importId, `chunk-${i}`, c) };
    const concepts = await runOperation<ConceptMap>(ctx, {
      purpose: "extract", activityId: null, origin: "shared", requestId: null, key: `${input.importId}:concepts`,
      load: () => store.getArtifact<ConceptMap>(input.importId, "conceptMap"),
      work: async (runner) => {
        // a scoped run checks every chunk's citations, cached or extracted, before merge and alignment can send them
        const m = await extractConceptMap(input.source, unit, runner, { chunkTokens, promptConfig: input.promptConfig, chunkCache, ...(scope ? { chunks, checkChunk: (cs) => assertEvidenceInScope(cs, scope, input.source) } : {}) });
        if (scope) assertEvidenceInScope(m.concepts, scope, input.source); // before the map is persisted
        return m;
      },
      persist: (m) => store.putArtifact(input.importId, "conceptMap", m)
    });
    const map = concepts.result;
    if (scope) assertEvidenceInScope(map.concepts, scope, input.source); // a stored map is checked too, before planning and production

    await setStatus("planning");
    const planned = await runOperation<ActivityPlan[]>(ctx, {
      purpose: "plan", activityId: null, origin: "shared", requestId: null, key: `${input.importId}:plan`,
      load: () => store.getArtifact<ActivityPlan[]>(input.importId, "plan"),
      work: (runner) => planActivities(map, [...input.selectedTypes], runner, rules),
      persist: (p) => store.putArtifact(input.importId, "plan", p)
    });
    const plan = planned.result;
    const known = new Set((await store.listActivities(input.importId)).map((a) => a.activityId));
    for (const [i, p] of plan.entries()) {
      if (known.has(p.activityId)) continue;

      await store.putActivity({ activityId: p.activityId, importId: input.importId, type: p.type, order: i, status: "planned", currentRevision: null, conceptIds: p.conceptIds, criteriaIds: p.criteriaIds, error: null, dropped: false, unitTextHash: unit?.textHash ?? null });
    }

    await setStatus("generating");
    const producers = createProducers();
    const pending = (await store.listActivities(input.importId)).filter(isPending);
    const lanes = input.selectedTypes.map((type) => pending.filter((a) => a.type === type)).filter((lane) => lane.length > 0);

    const promotedOfType = async (type: PlannedType): Promise<RevisionRecord[]> => {
      const same = (await store.listActivities(input.importId)).filter((a) => a.type === type && a.currentRevision !== null);
      const revisions = await Promise.all(same.map((a) => store.getRevision(a.activityId, a.currentRevision!)));
      return revisions.filter((r): r is RevisionRecord => r !== null && r.state === "promoted");
    };

    const generateActivity = async (initial: ActivityRecord): Promise<void> => {
      let activity = initial;
      const setActivity = async (patch: Partial<ActivityRecord>): Promise<void> => { activity = { ...activity, ...patch }; await store.putActivity(activity); emit({ kind: "activity", activityId: activity.activityId, status: activity.status, ...(activity.error ? { error: activity.error } : {}) }); };
      const entry = plan.find((p) => p.activityId === activity.activityId);
      if (!entry) throw new Error(`activity ${activity.activityId} is not in the stored plan`);

      const revisions = await store.listRevisions(activity.activityId);
      const promotedRevision = revisions.find((r) => r.state === "promoted");
      if (promotedRevision) {
        await setActivity({ status: "promoted", currentRevision: promotedRevision.revision, error: null }); // promotion finished before the activity record was written
        return;
      }

      const saved = revisions.find((r) => r.state === "candidate");
      const revision = saved ? saved.revision : revisions.length + 1;
      if (!saved) await setActivity({ status: "generating", error: null });
      const produced = await runOperation<RevisionRecord>(ctx, {
        purpose: "produce", activityId: activity.activityId, origin: "generate", requestId: null, key: `${input.importId}:produce:${activity.activityId}:r${revision}`,
        load: () => store.getRevision(activity.activityId, revision),
        work: async (runner) => {
          const producer = producers.get(entry.type);
          if (!producer) throw new Error(`no producer for ${entry.type}`);

          const priorTexts = existingTexts(await promotedOfType(activity.type));
          const result = await producer.produce({ plan: entry, map, unit, promptConfig: input.promptConfig, language: input.language, existing: priorTexts, rules }, runner, { registry: deps.registry });
          assertGeneratedProvenance(result.spec);
          return { activityId: activity.activityId, revision, state: "candidate", spec: result.spec, schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, origin: "generate", requestId: null, modelConfig: { provider: deps.provider.name, models: { ...MODEL_ROLES }, profiles: { ...REQUEST_PROFILES } }, note: null, currentBuildId: null, attemptIds: result.attemptIds, createdAt: now() };
        },
        persist: (rev) => store.putRevision(rev)
      });
      const candidate = produced.result;
      if (!produced.reused) await setActivity({ status: "generated" });
      const build = await buildRevision({ store, registry: deps.registry, engineIdentity: deps.engineIdentity, clock }, input.importId, candidate);
      await setActivity({ status: "built" });
      for (const prev of await store.listRevisions(activity.activityId)) if (prev.state === "promoted" && prev.revision !== candidate.revision) await store.putRevision({ ...prev, state: "superseded" });
      await store.putRevision({ ...candidate, state: "promoted", currentBuildId: build.buildId });
      await setActivity({ status: "promoted", currentRevision: candidate.revision, error: null });
    };

    // A lane worker never throws: every outcome, including a storage failure while recording one, is folded into `halt`,
    // so runLanes waits for every lane to settle before the import is finalised and the lock released.
    await runLanes(lanes, deps.concurrency ?? 3, async (activity) => {
      const mark = async (error: string): Promise<void> => { await store.putActivity({ ...activity, status: "failed", error }); emit({ kind: "activity", activityId: activity.activityId, status: "failed", error }); };
      try {
        if (halt.stop) { await mark(`${SKIPPED_PREFIX}${halt.stop.reason}`); return; }

        try {
          await generateActivity(activity);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof ContentFailure) await mark(`content: ${message}`);
          else if (err instanceof BudgetRefused) { halt.stop = { kind: "budget", reason: message }; await mark(message); }
          else if (err instanceof RunStopped) await mark(`${SKIPPED_PREFIX}${message}`);
          else { halt.stop = { kind: "system", reason: `system: ${message}` }; halt.error = err; await mark(`system: ${message}`); }
        }
        await persistBudget();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        halt.stop ??= { kind: "system", reason: `system: ${message}` };
        halt.error ??= err;
      }
    });

    const finalActivities = await store.listActivities(input.importId);
    const promotedCount = finalActivities.filter((a) => a.status === "promoted").length;
    const failedCount = finalActivities.filter((a) => a.status === "failed").length;
    await foldRun();
    if (halt.error !== undefined) { await setStatus("failed", halt.stop?.reason ?? `system: ${halt.error instanceof Error ? halt.error.message : String(halt.error)}`); throw halt.error; }

    if (promotedCount === 0) await setStatus("failed", halt.stop ? halt.stop.reason : "no activity was promoted");
    else if (failedCount > 0) await setStatus("ready_with_failures", null);
    else await setStatus("ready", null);
    return record;
  } catch (err) {
    if (record.status === "failed" && stopMarked(record)) throw err;

    const message = err instanceof Error ? err.message : String(err);
    await foldRun();
    if (err instanceof BudgetRefused) { await setStatus("failed", message); return record; }

    if (err instanceof ContentFailure) { await setStatus("failed", `content: ${message}`); return record; }

    await setStatus("failed", `system: ${message}`);
    throw err;
  }
}

function stopMarked(record: ImportRecord): boolean {
  return record.error !== null && record.error.startsWith("system: ");
}
