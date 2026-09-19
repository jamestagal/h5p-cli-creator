import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assertProviderCompatible, toProviderSchema, toStrictJsonSchema, UNSUPPORTED_SCHEMA_KEYWORDS } from "../src/llm/schema.js";

describe("toStrictJsonSchema", () => {
  it("emits draft 2020-12 with closed objects and every property required", () => {
    const s = toStrictJsonSchema(z.object({ title: z.string(), items: z.array(z.object({ text: z.string(), tip: z.string().nullable() })) }));
    expect(s["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(s["additionalProperties"]).toBe(false);
    expect(s["required"]).toEqual(["title", "items"]);
    const item = (s["properties"] as Record<string, { items: Record<string, unknown> }>)["items"]!.items;
    expect(item["additionalProperties"]).toBe(false);
    expect(item["required"]).toEqual(["text", "tip"]);
  });
  it("refuses optional properties and defaults (model output schemas are strict by construction)", () => {
    expect(() => toStrictJsonSchema(z.object({ a: z.string().optional() }))).toThrow(/optional/);
    expect(() => toStrictJsonSchema(z.object({ a: z.string().default("x") }))).toThrow(/default/);
  });
});

describe("toProviderSchema", () => {
  it("removes the constraints the API rejects, records them in descriptions, and drops $schema", () => {
    const s = toProviderSchema(z.object({ slot: z.number().int(), name: z.string().min(1).max(80).regex(/^[A-Z]/), ids: z.array(z.string()).min(2).max(10), mail: z.email(), one: z.array(z.string()).min(1) }));
    const props = s["properties"] as Record<string, Record<string, unknown>>;
    expect(s).not.toHaveProperty("$schema");
    expect(props["slot"]!["type"]).toBe("integer");
    for (const k of ["minimum", "maximum"]) expect(props["slot"]).not.toHaveProperty(k);
    for (const k of ["minLength", "maxLength", "pattern"]) expect(props["name"]).not.toHaveProperty(k);
    expect(String(props["name"]!["description"])).toMatch(/Constraint: .*minLength 1/);
    for (const k of ["minItems", "maxItems"]) expect(props["ids"]).not.toHaveProperty(k);
    expect(props["one"]!["minItems"]).toBe(1); // 0 and 1 are supported and kept
    expect(props["mail"]!["format"]).toBe("email"); // supported format kept
    expect(() => assertProviderCompatible(s)).not.toThrow();
  });
  it("assertProviderCompatible names the path of an unsupported keyword or an open object", () => {
    expect(() => assertProviderCompatible({ type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "number", minimum: 1 } } })).toThrow(/properties\.n: unsupported keyword minimum/);
    expect(() => assertProviderCompatible({ type: "object", required: [], properties: {} })).toThrow(/additionalProperties/);
    expect(() => assertProviderCompatible({ type: "object", additionalProperties: false, required: ["x"], properties: { x: { $ref: "https://example.test/x.json" } } })).toThrow(/external \$ref/);
    expect(UNSUPPORTED_SCHEMA_KEYWORDS.has("multipleOf")).toBe(true);
  });
  it("does not carry refinements (they are enforced in code after parsing)", () => {
    const s = toProviderSchema(z.object({ n: z.number() }).refine((o) => o.n > 1));
    expect(JSON.stringify(s)).not.toMatch(/refine/);
  });
});
