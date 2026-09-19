import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { ActivitySpec, InteractiveBookSpec } from "@leaplearn/shared";
import { EngineError } from "../src/errors.js";
import { validate } from "../src/index.js";
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

  it("validate reports a child without a handler as an issue with the child's path", async () => {
    const spec = ActivitySpec.parse({ id: "qs-x", title: "T", type: "questionSet", children: [{ id: "t1", title: "T", type: "trueFalse", statement: "s", correct: true }] });
    const issues = await validate(spec, new Map(), { registry: reg });
    expect(issues).toEqual([{ path: "children[0]", message: "no handler for trueFalse", code: "HANDLER_MISSING" }]);
  });
});

describe("interactiveBook cover image", () => {
  it("throws NOT_IMPLEMENTED when coverImageAssetId is set", () => {
    const spec = InteractiveBookSpec.parse({
      id: "book-cover", title: "Book with cover", type: "interactiveBook", coverImageAssetId: "asset-1",
      chapters: [{ title: "C1", items: [{ type: "text", title: "Intro", html: "<p>x</p>" }] }]
    });
    const handlers = createHandlerRegistry();
    const handler = handlers.get(spec.type)!;
    const ctx: BuildContext = { registry: reg, ids: createIdFactory(spec.id, 1), assets: new Map(), mediaPaths: new Map() };

    let buildError: unknown;
    try { handler.build(spec as never, ctx); } catch (error) { buildError = error; }
    expect(buildError).toBeInstanceOf(EngineError);
    expect((buildError as EngineError).code).toBe("NOT_IMPLEMENTED");
    expect((buildError as EngineError).message).toMatch(/cover image/);
  });
});
