/** Model IDs by role (spec §8, §13). Provisional until the phase-3 quality gate; nothing else names a model. */
export const MODEL_ROLES = {
  parseUnit: "claude-haiku-4-5-20251001",
  extract: "claude-haiku-4-5-20251001",
  merge: "claude-haiku-4-5-20251001",
  align: "claude-haiku-4-5-20251001",
  plan: "claude-sonnet-5",
  produce: "claude-sonnet-5"
} as const;
export type ModelRole = keyof typeof MODEL_ROLES;
export type ModelId = (typeof MODEL_ROLES)[ModelRole];

export function modelForRole(role: ModelRole): ModelId {
  return MODEL_ROLES[role];
}

/**
 * Request settings the adapter applies per model; no stage sets them. Sonnet 5 returns 400 for a
 * non-default temperature/top_p/top_k and runs adaptive thinking unless told not to (thinking tokens
 * bill against max_tokens), so it gets no sampling parameter and thinking disabled. Haiku 4.5 rejects
 * adaptive thinking and accepts temperature.
 */
export interface RequestProfile {
  temperature: number | null;
  thinking: { type: "disabled" } | null;
}

export const REQUEST_PROFILES: Record<ModelId, RequestProfile> = {
  "claude-sonnet-5": { temperature: null, thinking: { type: "disabled" } },
  "claude-haiku-4-5-20251001": { temperature: 0, thinking: null }
};

export function requestProfile(model: string): RequestProfile {
  const profile = (REQUEST_PROFILES as Record<string, RequestProfile | undefined>)[model];
  if (!profile) throw new Error(`no request profile for model ${model}; add it to REQUEST_PROFILES`);
  return profile;
}
