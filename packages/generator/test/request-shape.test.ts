import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createRegistry, type LibraryRegistry } from "@leaplearn/engine";
import { KnowledgeEvidenceNode } from "@leaplearn/shared";
import { buildMessageParams } from "../src/llm/anthropic-provider.js";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { toStrictJsonSchema } from "../src/llm/schema.js";
import type { ModelRequest } from "../src/llm/types.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { runImport } from "../src/pipeline/run-import.js";
import { conceptResponses, passageEvidence, unitOut } from "./helpers/synthetic.js";
import { S1_DEPS, s1Input } from "./helpers/s1-settings.js";
import { testIdentity } from "./helpers/identity.js";

const root = resolve(import.meta.dirname, "../../..");
let registry: LibraryRegistry;
beforeAll(async () => { registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

/** Problems that make a schema recursive or indirect: a reference keyword anywhere, or an object that contains itself. */
function referenceProblems(schema: unknown): string[] {
  const problems: string[] = [];
  const ancestors: object[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node !== "object" || node === null) return;
    if (ancestors.includes(node)) { problems.push(`${path.replace(/\.$/, "") || "(root)"}: refers back to an enclosing schema`); return; }
    ancestors.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (["$ref", "$defs", "definitions", "$dynamicRef", "$recursiveRef", "$anchor", "$dynamicAnchor"].includes(key)) problems.push(`${path}${key}`);
      walk(value, `${path}${key}.`);
    }
    ancestors.pop();
  };
  walk(schema, "");
  return problems;
}

/** The S1 requests for parse, extract and align, as the pipeline dispatches them: S1 inputs, S1 deps, scripted replies (a single chunk at S1's chunk budget, so no merge). */
async function s1Requests(): Promise<Record<"parseUnit" | "extract" | "align", ModelRequest>> {
  const input = await s1Input(1_000_000);
  const { script } = conceptResponses(input.source, passageEvidence(input.source), S1_DEPS.chunkTokens);
  const provider = new FakeProvider([fakeResponse({ outputText: JSON.stringify(unitOut) }), ...script]);
  await runImport(input, { store: new MemoryStore(), provider, registry, engineIdentity: testIdentity("shape"), ...S1_DEPS, sleep: async () => undefined }).catch(() => undefined); // stops at plan: the script ends after align
  const one = (purpose: string): ModelRequest => {
    const found = provider.requests.filter((r) => r.purpose === purpose);
    expect(found, purpose).toHaveLength(1);
    return found[0]!;
  };
  expect(provider.requests.map((r) => r.purpose)).toEqual(["parseUnit", "extract", "align", "plan"]); // the plan request finds the script exhausted
  return { parseUnit: one("parseUnit"), extract: one("extract"), align: one("align") };
}

describe("outgoing request shape (plan Task 10 step 2)", () => {
  it("the schema the Anthropic adapter sends for parse, extract and align has no $ref, $defs or definitions and no self-reference", async () => {
    const requests = await s1Requests();
    for (const [purpose, request] of Object.entries(requests)) {
      const params = buildMessageParams(request) as { output_config: { format: { schema: unknown } } };
      const sent = JSON.parse(JSON.stringify(params.output_config.format.schema)) as unknown; // as serialised onto the wire
      expect(referenceProblems(sent), purpose).toEqual([]);
      expect(referenceProblems(params.output_config.format.schema), `${purpose} before serialisation`).toEqual([]);
    }
  });

  it("the check is not vacuous: the recursive KnowledgeEvidenceNode, which never goes on the wire, is flagged", () => {
    expect(referenceProblems(toStrictJsonSchema(KnowledgeEvidenceNode)).length).toBeGreaterThan(0);
    const cyclic: Record<string, unknown> = { type: "object" }; cyclic["properties"] = { self: cyclic };
    expect(referenceProblems(cyclic)).toEqual(["properties.self: refers back to an enclosing schema"]);
  });

  it("the parse, extract and align requests for S1_SETTINGS are unchanged (system, user and the serialised schema)", async () => {
    const requests = await s1Requests();
    for (const [purpose, request] of Object.entries(requests)) {
      expect({ model: request.model, maxOutputTokens: request.maxOutputTokens, system: request.system, user: request.user, schema: JSON.stringify(request.outputSchema, null, 2) }).toMatchSnapshot(purpose);
    }
  });
});
