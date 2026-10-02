import { z } from "zod";

export const IMPORT_STATUSES = ["queued", "ingesting", "extracting", "planning", "generating", "ready", "ready_with_failures", "failed"] as const;
export const ACTIVITY_STATUSES = ["planned", "generating", "generated", "built", "promoted", "failed", "dropped"] as const;
export const REVISION_STATES = ["candidate", "promoted", "superseded", "rejected"] as const;
export const COST_STATUSES = ["known", "estimated", "unavailable"] as const;
/**
 * Spec §4 acceptance_decisions.decision. Phase 3 derives it from rubric scores (design §5); `needs-revision` is only
 * ever derived. Only `accepted` counts as accepted, anywhere.
 */
export const ACCEPTANCE_DECISIONS = ["accepted", "needs-revision", "rejected"] as const;
/** Spec §4 alignment_reviews.decision, bound to one revision (and one item when the criterion is on an item). */
export const ALIGNMENT_DECISIONS = ["confirmed", "rejected", "added"] as const;
/**
 * The status column of mapping.csv. `suggested` until someone reviews the row; `reviewed` when the activity's current
 * build has a scored review whose decision is `accepted` (design §4.5); an alignment review's own decision otherwise.
 */
export const MAPPING_STATUSES = ["suggested", "reviewed", "confirmed", "rejected", "added"] as const;

export const ImportStatus = z.enum(IMPORT_STATUSES);
export const ActivityStatus = z.enum(ACTIVITY_STATUSES);
export const RevisionState = z.enum(REVISION_STATES);
export const CostStatus = z.enum(COST_STATUSES);
export const AcceptanceDecision = z.enum(ACCEPTANCE_DECISIONS);
export const AlignmentDecision = z.enum(ALIGNMENT_DECISIONS);
export const MappingStatus = z.enum(MAPPING_STATUSES);
export type ImportStatus = z.infer<typeof ImportStatus>;
export type ActivityStatus = z.infer<typeof ActivityStatus>;
export type RevisionState = z.infer<typeof RevisionState>;
export type CostStatus = z.infer<typeof CostStatus>;
export type AcceptanceDecision = z.infer<typeof AcceptanceDecision>;
export type AlignmentDecision = z.infer<typeof AlignmentDecision>;
export type MappingStatus = z.infer<typeof MappingStatus>;

export const GenerationUsage = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0),
  cacheWriteTokens: z.number().int().min(0)
});
export type GenerationUsage = z.infer<typeof GenerationUsage>;
