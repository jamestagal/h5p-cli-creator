import { readdir } from "node:fs/promises";

/** Lists a directory, treating only its absence (ENOENT) as empty. Permission errors, a file where a directory belongs (ENOTDIR) and every other failure propagate. */
export async function listIfPresent(dir: string): Promise<string[]> {
  try { return await readdir(dir); } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return [];
    throw err;
  }
}
