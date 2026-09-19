import { z } from "zod";

const REMOVED_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "maxItems", "uniqueItems"] as const;
/** Keywords the structured-outputs grammar rejects (docs: "Structured outputs" → JSON Schema limitations). */
export const UNSUPPORTED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([...REMOVED_KEYWORDS, "$schema", "patternProperties", "propertyNames", "if", "then", "else", "not", "dependentRequired", "dependentSchemas", "contains", "minContains", "maxContains", "minProperties", "maxProperties", "default"]);
export const SUPPORTED_FORMATS: ReadonlySet<string> = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

function children(node: Node, path: string): Array<[Node, string]> {
  const out: Array<[Node, string]> = [];
  if (isNode(node["properties"])) for (const [k, v] of Object.entries(node["properties"])) if (isNode(v)) out.push([v, `${path}properties.${k}.`]);
  if (isNode(node["$defs"])) for (const [k, v] of Object.entries(node["$defs"])) if (isNode(v)) out.push([v, `${path}$defs.${k}.`]);
  for (const key of ["items", "anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((x, i) => { if (isNode(x)) out.push([x, `${path}${key}[${i}].`]); });
    else if (isNode(v)) out.push([v, `${path}${key}.`]);
  }
  return out;
}

function tighten(node: Node, path: string): void {
  if (node["type"] === "object" && isNode(node["properties"])) {
    const props = node["properties"];
    const names = Object.keys(props);
    const required = new Set((node["required"] as string[] | undefined) ?? []);
    for (const name of names) {
      if (!required.has(name)) throw new Error(`model output schema property ${path}${name} is optional; model output schemas must have every property required (use a nullable type instead)`);
      const p = props[name];
      if (isNode(p) && "default" in p) throw new Error(`model output schema property ${path}${name} has a default; defaults belong to the activity schema, not the model output`);
    }
    node["additionalProperties"] = false;
    node["required"] = names;
  }
  for (const [child, childPath] of children(node, path)) tighten(child, childPath);
}

function project(node: Node): void {
  const notes: string[] = [];
  for (const keyword of REMOVED_KEYWORDS) if (keyword in node) { notes.push(`${keyword} ${JSON.stringify(node[keyword])}`); delete node[keyword]; }
  if (typeof node["minItems"] === "number" && node["minItems"] > 1) { notes.push(`minItems ${node["minItems"]}`); delete node["minItems"]; }
  if (typeof node["format"] === "string" && !SUPPORTED_FORMATS.has(node["format"])) { notes.push(`format ${node["format"]}`); delete node["format"]; }
  if (notes.length > 0) node["description"] = [node["description"], `Constraint: ${notes.join("; ")}`].filter((s) => typeof s === "string" && s.length > 0).join(" ");
  for (const [child] of children(node, "")) project(child);
}

/** Draft 2020-12 JSON Schema with closed objects, all properties required, no defaults. Refinements are not represented and are enforced by parsing the response in code. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "throw", io: "output" }) as Node;
  tighten(json, "");
  return json;
}

/** Throws when anything the API rejects is still present. Used on every schema before it is sent and by the Task 7 contract test. */
export function assertProviderCompatible(schema: Record<string, unknown>): void {
  const problems: string[] = [];
  const walk = (node: Node, path: string): void => {
    const where = path.replace(/\.$/, "") || "(root)";
    for (const key of Object.keys(node)) if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) problems.push(`${where}: unsupported keyword ${key}`);
    if (node["type"] === "object" && node["additionalProperties"] !== false) problems.push(`${where}: object must set additionalProperties: false`);
    if (typeof node["$ref"] === "string" && !node["$ref"].startsWith("#/")) problems.push(`${where}: external $ref ${node["$ref"]}`);
    if (typeof node["minItems"] === "number" && node["minItems"] > 1) problems.push(`${where}: minItems above 1`);
    if (typeof node["format"] === "string" && !SUPPORTED_FORMATS.has(node["format"])) problems.push(`${where}: unsupported format ${node["format"]}`);
    for (const [child, childPath] of children(node, path)) walk(child, childPath);
  };
  walk(schema as Node, "");
  if (problems.length > 0) throw new Error(`schema is not provider-compatible:\n${problems.join("\n")}`);
}

/** The strict schema projected to the subset native structured outputs accept; the full Zod schema still validates the parsed response. */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = toStrictJsonSchema(schema);
  delete json["$schema"];
  project(json);
  assertProviderCompatible(json);
  return json;
}
