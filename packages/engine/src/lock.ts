import { readFile } from "node:fs/promises";
import { z } from "zod";

export type LibraryKey = `${string}-${number}.${number}`;

export function libraryKey(machineName: string, major: number, minor: number): LibraryKey {
  return `${machineName}-${major}.${minor}`;
}

export const LockedLibrarySchema = z.object({
  machineName: z.string().min(1),
  majorVersion: z.number().int().min(0),
  minorVersion: z.number().int().min(0),
  patchVersion: z.number().int().min(0),
  package: z.string().regex(/\.h5p$/),
  dir: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
});
export type LockedLibrary = z.infer<typeof LockedLibrarySchema>;

export const LibraryLockSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  libraries: z.record(z.string(), LockedLibrarySchema)
}).superRefine((lock, ctx) => {
  for (const [key, lib] of Object.entries(lock.libraries)) {
    if (key !== libraryKey(lib.machineName, lib.majorVersion, lib.minorVersion)) {
      ctx.addIssue({ code: "custom", path: ["libraries", key], message: `key ${key} does not match entry` });
    }
  }
});
export type LibraryLock = z.infer<typeof LibraryLockSchema>;

export async function loadLock(path: string): Promise<LibraryLock> {
  return LibraryLockSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
