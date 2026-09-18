import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { ActivitySpec, type AssetManifest } from "@leaplearn/shared";
import { createHandlerRegistry } from "./handlers/index.js";
import { resolveLibraryKey, type BuildContext } from "./handlers/handler.js";
import { createIdFactory } from "./ids.js";
import { ValidationError, type ValidationIssue } from "./errors.js";
import { validateParams } from "./validator/semantics.js";
import { checkClosure } from "./validator/closure.js";
import { writePackage } from "./assembler.js";
import type { LibraryRegistry } from "./registry.js";
import type { H5PParams } from "./params.js";

export interface Logger { info(msg: string): void; warn(msg: string): void; }
export interface CompileOptions { registry: LibraryRegistry; revision?: number; logger?: Logger; }
export interface CompileResult { mainLibrary: string; libraries: string[]; entries: string[]; contentJson: H5PParams; }

async function prepare(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions) {
  const parsed = ActivitySpec.parse(spec);
  const handlers = createHandlerRegistry();
  const handler = handlers.get(parsed.type);
  if (!handler) throw new ValidationError([{ path: "type", message: `no handler for ${parsed.type}` }]);

  const ctx: BuildContext = { registry: options.registry, ids: createIdFactory(parsed.id, options.revision ?? 1), assets, mediaPaths: new Map() };
  const content = handler.build(parsed as never, ctx);
  const closure = await options.registry.closure(handler.requiredLibraries(parsed as never).map((n) => resolveLibraryKey(options.registry, n)));
  const closureKeys = closure.map((l) => `${l.machineName}-${l.majorVersion}.${l.minorVersion}`);
  const issues: ValidationIssue[] = [...(await validateParams(content, options.registry, ctx.mediaPaths)), ...(await checkClosure(content, options.registry, closureKeys))];

  return { parsed, handler, content, closure, closureKeys, issues, ctx };
}

export async function validate(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions): Promise<ValidationIssue[]> {
  return (await prepare(spec, assets, options)).issues;
}

export async function compile(spec: ActivitySpec, assets: AssetManifest, output: NodeJS.WritableStream, options: CompileOptions): Promise<CompileResult> {
  const { parsed, handler, content, closure, closureKeys, issues, ctx } = await prepare(spec, assets, options);
  if (issues.length > 0) throw new ValidationError(issues);

  const mainLibrary = options.registry.get(resolveLibraryKey(options.registry, handler.mainLibrary));
  const entries = await writePackage({ title: parsed.title, language: parsed.language, mainLibrary, closure, content, media: ctx.mediaPaths, assets }, options.registry, output);

  return { mainLibrary: handler.mainLibrary, libraries: closureKeys, entries, contentJson: content.params };
}

/**
 * Validates first (no file is touched for an invalid spec), then writes to a sibling temp file and
 * renames onto `path` only on success. On any failure the stream is destroyed, its closure awaited,
 * and the temp file removed, so nothing partial is left behind.
 */
export async function compileToFile(spec: ActivitySpec, assets: AssetManifest, path: string, options: CompileOptions): Promise<CompileResult> {
  const prepared = await prepare(spec, assets, options);
  if (prepared.issues.length > 0) throw new ValidationError(prepared.issues);

  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  const out = createWriteStream(tmp);
  const closed = new Promise<void>((res) => out.once("close", () => res()));
  try {
    const { parsed, handler, content, closure, closureKeys, ctx } = prepared;
    const mainLibrary = options.registry.get(resolveLibraryKey(options.registry, handler.mainLibrary));
    const entries = await writePackage({ title: parsed.title, language: parsed.language, mainLibrary, closure, content, media: ctx.mediaPaths, assets }, options.registry, out);
    await closed;
    await rename(tmp, path);

    return { mainLibrary: handler.mainLibrary, libraries: closureKeys, entries, contentJson: content.params };
  } catch (err) {
    out.destroy();
    await closed;
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function compileToBuffer(spec: ActivitySpec, assets: AssetManifest, options: CompileOptions): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on("data", (c: Buffer) => chunks.push(c));
  await compile(spec, assets, sink, options);

  return Buffer.concat(chunks);
}

export { sanitizeHtml, escapeHtml } from "./html.js";
export { createRegistry, LibraryRegistry } from "./registry.js";
export { libraryKey, type LibraryLock, type LockedLibrary } from "./lock.js";
export { EngineError, ValidationError, type ValidationIssue } from "./errors.js";
export { createHandlerRegistry } from "./handlers/index.js";
export type { ActivityHandler, BuildContext } from "./handlers/handler.js";
export type { H5PContent, H5PParams } from "./params.js";
