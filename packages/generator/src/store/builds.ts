import { createHash } from "node:crypto";
import type { BuildRecord } from "./types.js";

/** `sha256([activityId, revision, engineFingerprint])`, first 16 hex characters: one id per revision per engine. */
export function buildIdFor(activityId: string, revision: number, engineFingerprint: string): string {
  return createHash("sha256").update(JSON.stringify([activityId, revision, engineFingerprint])).digest("hex").slice(0, 16);
}

/** `builds/<activity>-r<n>-<engineFingerprint[0..12]>.h5p`. */
export function buildKeyFor(activityId: string, revision: number, engineFingerprint: string): string {
  return `builds/${activityId}-r${revision}-${engineFingerprint.slice(0, 12)}.h5p`;
}

export const sha256Hex = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

/** Sorted by revision, then builtAt, then buildId, so listings are stable. */
export function sortBuilds(records: BuildRecord[]): BuildRecord[] {
  return records.sort((a, b) => a.revision - b.revision || (a.builtAt < b.builtAt ? -1 : a.builtAt > b.builtAt ? 1 : 0) || (a.buildId < b.buildId ? -1 : a.buildId > b.buildId ? 1 : 0));
}

/** JSON with object keys sorted, so two equal records compare equal whatever order their keys were written in. */
export function canonicalRecordJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value));
}
