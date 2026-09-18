import type { ActivitySpec, AssetManifest } from "@leaplearn/shared";
import type { IdFactory } from "../ids.js";
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
