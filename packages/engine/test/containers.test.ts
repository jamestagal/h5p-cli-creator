import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { ActivitySpec } from "@leaplearn/shared";
import { EngineError } from "../src/errors.js";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";
import { createHandlerRegistry } from "../src/handlers/index.js";
import { createIdFactory } from "../src/ids.js";
import type { BuildContext } from "../src/handlers/handler.js";

const root = resolve(import.meta.dirname, "../../..");
let reg: LibraryRegistry;
beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

describe("container children without a phase-1 handler", () => {
  it("questionSet throws a structured HANDLER_MISSING error instead of a raw TypeError", () => {
    const spec = ActivitySpec.parse({
      id: "qs-missing", title: "Missing handler", type: "questionSet",
      children: [{ id: "t1", title: "T", type: "trueFalse", statement: "s", correct: true }]
    });
    const handlers = createHandlerRegistry();
    const handler = handlers.get(spec.type)!;
    const ctx: BuildContext = { registry: reg, ids: createIdFactory(spec.id, 1), assets: new Map(), mediaPaths: new Map() };

    let requiredLibrariesError: unknown;
    try { handler.requiredLibraries(spec as never); } catch (error) { requiredLibrariesError = error; }
    expect(requiredLibrariesError).toBeInstanceOf(EngineError);
    expect((requiredLibrariesError as EngineError).code).toBe("HANDLER_MISSING");
    expect((requiredLibrariesError as EngineError).message).toMatch(/trueFalse/);

    let buildError: unknown;
    try { handler.build(spec as never, ctx); } catch (error) { buildError = error; }
    expect(buildError).toBeInstanceOf(EngineError);
    expect((buildError as EngineError).code).toBe("HANDLER_MISSING");
    expect((buildError as EngineError).message).toMatch(/trueFalse/);
  });
});
