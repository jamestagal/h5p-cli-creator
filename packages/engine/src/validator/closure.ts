import { compareCodeUnits } from "../compare.js";
import type { ValidationIssue } from "../errors.js";
import type { H5PContent } from "../params.js";
import type { LibraryRegistry } from "../registry.js";
import { libraryStringToKey } from "./semantics.js";

/** Every `library` string reachable in the content tree, as lock keys, deduplicated. */
export function collectLibraries(content: H5PContent): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);

      return;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o["library"] === "string" && o["params"] && typeof o["params"] === "object") {
        out.add(libraryStringToKey(o["library"]));
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(content);

  return [...out].sort(compareCodeUnits);
}

export async function checkClosure(
  content: H5PContent,
  registry: LibraryRegistry,
  closureKeys: string[]
): Promise<ValidationIssue[]> {
  const have = new Set(closureKeys);
  const issues: ValidationIssue[] = [];
  for (const key of collectLibraries(content)) {
    registry.get(key);
    if (!have.has(key)) issues.push({ path: "", message: `library ${key} is referenced in params but not in the package dependency closure` });
  }

  return issues;
}
