import type { ActivitySpec, AssetManifest } from "@leaplearn/shared";
import { EngineError } from "../errors.js";
import type { IdFactory } from "../ids.js";
import type { LibraryKey } from "../lock.js";
import type { H5PContent } from "../params.js";
import type { LibraryRegistry } from "../registry.js";

export interface BuildContext {
  registry: LibraryRegistry;
  ids: IdFactory;
  assets: AssetManifest;
  /** content/-relative media path -> assetId. The assembler copies exactly these and nothing else. */
  mediaPaths: Map<string, string>;
}

export interface ActivityHandler<S extends ActivitySpec = ActivitySpec> {
  readonly type: S["type"];
  readonly mainLibrary: string;
  requiredLibraries(spec: S): string[];
  build(spec: S, ctx: BuildContext): H5PContent;
}

export function resolveLibraryKey(registry: LibraryRegistry, machineName: string): LibraryKey {
  const l = registry.resolve(machineName);
  return `${l.machineName}-${l.majorVersion}.${l.minorVersion}`;
}

export function requireHandler(children: Map<string, ActivityHandler>, type: string): ActivityHandler {
  const h = children.get(type);
  if (!h) throw new EngineError(`no handler for ${type}`, "HANDLER_MISSING");

  return h;
}
