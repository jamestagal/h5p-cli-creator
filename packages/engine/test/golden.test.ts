import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { createRegistry, type LibraryRegistry } from "../src/registry.js";
import { createHandlerRegistry } from "../src/handlers/index.js";
import { createIdFactory } from "../src/ids.js";
import { validateParams } from "../src/validator/semantics.js";
import { checkClosure } from "../src/validator/closure.js";
import type { BuildContext } from "../src/handlers/handler.js";

const root = resolve(import.meta.dirname, "../../..");
const fixtures = resolve(import.meta.dirname, "fixtures");
let reg: LibraryRegistry;
beforeAll(async () => { reg = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") }); });

function asset(id: string, file: string, mimeType: string): AssetEntry {
  const p = resolve(fixtures, "assets", file);
  return { assetId: id, sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), byteLength: statSync(p).size, mimeType, open: () => createReadStream(p) };
}

const cases = ["multi-choice", "blanks", "flashcards"] as const;

describe.each(cases)("golden: %s", (name) => {
  it("builds params that validate, reference only locked libraries, and match the snapshot", async () => {
    const spec = ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${name}.json`), "utf8")));
    const handlers = createHandlerRegistry();
    const handler = handlers.get(spec.type)!;
    const ctx: BuildContext = { registry: reg, ids: createIdFactory(spec.id, 1), assets: new Map([["card", asset("card", "card.jpg", "image/jpeg")]]), mediaPaths: new Map() };
    const content = handler.build(spec as never, ctx);
    const main = reg.resolve(handler.mainLibrary);
    expect(content.library).toBe(`${main.machineName} ${main.majorVersion}.${main.minorVersion}`);
    expect(await validateParams(content, reg, ctx.mediaPaths)).toEqual([]);
    const closure = (await reg.closure(handler.requiredLibraries(spec as never).map((n) => { const l = reg.resolve(n); return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`; }))).map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
    expect(await checkClosure(content, reg, closure)).toEqual([]);
    expect(content).toMatchSnapshot();
  });
});
