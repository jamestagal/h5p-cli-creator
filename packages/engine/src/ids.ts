import { v5 as uuidv5 } from "uuid";

const NAMESPACE = "6f1c2a0e-9d4b-4c7e-8a3f-2b1d5e7c9a10";

export interface IdFactory {
  subContentId(path: string): string;
  scope(prefix: string): IdFactory;
}

function factory(rootId: string, revision: number, prefix: string): IdFactory {
  return {
    subContentId: (path) => uuidv5(`${rootId}/${revision}/${prefix}${path}`, NAMESPACE),
    scope: (p) => factory(rootId, revision, `${prefix}${p}/`)
  };
}

export function createIdFactory(activityId: string, revision: number): IdFactory {
  return factory(activityId, revision, "");
}
