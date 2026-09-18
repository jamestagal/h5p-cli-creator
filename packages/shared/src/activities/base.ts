import { z } from "zod";
import { Provenance } from "../provenance.js";

export const SCHEMA_VERSION = 1 as const;

export const ActivityBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  language: z.string().min(2).max(10).default("en"),
  instructionalLanguage: z.string().min(2).max(10).optional(),
  provenance: Provenance.optional(),
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION)
});
export type ActivityBase = z.infer<typeof ActivityBase>;

/** Every nested item (card, panel, question, group, blank, draggable, word) carries a stable id and optional provenance. */
export const ItemBase = z.object({
  id: z.string().min(1),
  provenance: Provenance.optional()
});
export type ItemBase = z.infer<typeof ItemBase>;
