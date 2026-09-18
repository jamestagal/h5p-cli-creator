import type { ValidationIssue } from "../errors.js";
import type { H5PContent, H5PParams } from "../params.js";
import { libraryKey } from "../lock.js";
import type { LibraryRegistry, SemanticField } from "../registry.js";

/** "H5P.MultiChoice 1.16" -> "H5P.MultiChoice-1.16" */
export function libraryStringToKey(s: string): string {
  const m = /^(\S+)\s+(\d+)\.(\d+)$/.exec(s);
  if (!m) throw new Error(`bad library string: ${s}`);

  return libraryKey(m[1]!, Number(m[2]), Number(m[3]));
}

export async function validateParams(
  content: H5PContent,
  registry: LibraryRegistry,
  mediaPaths: ReadonlyMap<string, string>
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  await validateContent(content, "", registry, mediaPaths, issues);

  return issues;
}

async function validateContent(
  content: H5PContent,
  base: string,
  registry: LibraryRegistry,
  media: ReadonlyMap<string, string>,
  issues: ValidationIssue[]
): Promise<void> {
  const key = libraryStringToKey(content.library);
  const fields = await registry.semantics(key);
  if (!fields) return;

  const prefix = base ? `${base}.` : "";
  for (const field of fields) {
    await validateField(content.params[field.name], field, `${prefix}${field.name}`, registry, media, issues);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function validateField(
  value: unknown,
  field: SemanticField,
  path: string,
  registry: LibraryRegistry,
  media: ReadonlyMap<string, string>,
  issues: ValidationIssue[]
): Promise<void> {
  if (value === undefined || value === null) {
    const acceptable = Boolean(field["optional"]) || field["default"] !== undefined || field.type === "group";
    if (!acceptable) issues.push({ path, message: `missing required ${field.type}` });

    return;
  }
  switch (field.type) {
    case "text":
      if (typeof value !== "string") issues.push({ path, message: "expected string" });

      return;
    case "number": {
      if (typeof value !== "number") {
        issues.push({ path, message: "expected number" });

        return;
      }
      const min = field["min"];
      const max = field["max"];
      if (typeof min === "number" && value < min) issues.push({ path, message: `below min ${min}` });
      if (typeof max === "number" && value > max) issues.push({ path, message: `above max ${max}` });

      return;
    }
    case "boolean":
      if (typeof value !== "boolean") issues.push({ path, message: "expected boolean" });

      return;
    case "select": {
      const options = (field["options"] as Array<{ value: string }> | undefined)?.map((o) => o.value) ?? [];
      if (typeof value !== "string" || !options.includes(value)) {
        issues.push({ path, message: `value ${JSON.stringify(value)} not in options [${options.join(", ")}]` });
      }

      return;
    }
    case "list": {
      if (!Array.isArray(value)) {
        issues.push({ path, message: "expected array" });

        return;
      }
      const min = field["min"];
      const max = field["max"];
      if (typeof min === "number" && value.length < min) issues.push({ path, message: `list has ${value.length} items, below min ${min}` });
      if (typeof max === "number" && value.length > max) issues.push({ path, message: `list has ${value.length} items, above max ${max}` });
      const itemField = field["field"] as SemanticField;
      for (let i = 0; i < value.length; i++) {
        await validateField(value[i], itemField, `${path}[${i}]`, registry, media, issues);
      }

      return;
    }
    case "group": {
      const sub = (field["fields"] as SemanticField[] | undefined) ?? [];
      const onlyField = sub.length === 1 ? sub[0] : undefined;
      if (onlyField) {
        await validateField(value, onlyField, path, registry, media, issues);

        return;
      }
      if (!isPlainObject(value)) {
        issues.push({ path, message: "expected object for group" });

        return;
      }
      for (const f of sub) await validateField((value as H5PParams)[f.name], f, `${path}.${f.name}`, registry, media, issues);

      return;
    }
    case "library": {
      if (!isPlainObject(value)) {
        issues.push({ path, message: "expected library content object" });

        return;
      }
      const c = value as Partial<H5PContent>;
      if (typeof c.library !== "string") {
        issues.push({ path, message: "expected library content object with a library string" });

        return;
      }
      const allowed = (field["options"] as string[] | undefined) ?? [];
      if (allowed.length > 0 && !allowed.includes(c.library)) {
        issues.push({ path: `${path}.library`, message: `library ${c.library} not allowed here (allowed: ${allowed.join(", ")})` });

        return;
      }
      if (!isPlainObject(c.params)) {
        issues.push({ path: `${path}.params`, message: "expected params object" });

        return;
      }
      await validateContent(c as H5PContent, `${path}.params`, registry, media, issues);

      return;
    }
    case "image":
    case "video":
    case "audio":
    case "file": {
      const entries = Array.isArray(value) ? value : [value];
      for (const e of entries) {
        const p = (e as { path?: unknown }).path;
        if (typeof p !== "string") {
          issues.push({ path, message: `${field.type} needs a path` });
          continue;
        }
        if (/^https?:\/\//.test(p)) continue;
        if (!media.has(p)) issues.push({ path, message: `media path ${p} is not in the package` });
      }

      return;
    }
    default:
      return;
  }
}
