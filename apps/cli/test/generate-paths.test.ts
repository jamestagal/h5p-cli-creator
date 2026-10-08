import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { S1_SETTINGS } from "../../../packages/generator/test/helpers/s1-settings.js";
import { FileStore } from "../src/file-store.js";
import { generate, type GenerateArgs } from "../src/generate.js";

/** Follow-up F2: `leap generate` prints each activity's actual build key (revision → currentBuildId → BuildRecord.buildKey). */
const root = resolve(import.meta.dirname, "../../..");
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };
const s1Args = (out: string): GenerateArgs => ({ source: resolve(root, S1_SETTINGS.sourcePath), unit: resolve(root, S1_SETTINGS.unitPath), out, types: S1_SETTINGS.selectedTypes.join(","), maxRequests: 200, maxTokens: 2_000_000, maxSeconds: 1800, language: "en", readingLevel: "high-school", tone: "educational", libraries: resolve(root, "libraries"), provider: "replay", fixtures: resolve(root, "packages/generator/test/fixtures/replay/synthetic"), concurrency: 1 });
/** The summary line of each activity: `  <activityId>  <type>  <status>[  <path>]...`. */
const activityLines = (out: string[]) => out.join("").split("\n").filter((l) => /^ {2}act-\d+ {2}/.test(l));

describe("leap generate prints the real package path (follow-up F2)", () => {
  it("after a replay run, every printed package path exists under the output directory and equals the activity's BuildRecord.buildKey", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-f2-")), "s1");
    const run = io();
    expect(await generate(s1Args(dir), run.io), run.err.join("")).toBe(0);
    const store = new FileStore(dir);
    const lines = activityLines(run.out);
    const activities = await store.listActivities("s1");
    expect(lines).toHaveLength(activities.length);
    for (const a of activities) {
      const rev = (await store.getRevision(a.activityId, a.currentRevision!))!;
      const record = (await store.getBuildRecord(rev.currentBuildId!))!;
      const line = lines.find((l) => l.startsWith(`  ${a.activityId}  `))!;
      const printed = /\s(builds\/\S+\.h5p)/.exec(line)?.[1];
      expect(printed).toBe(record.buildKey);
      expect(existsSync(join(dir, printed!))).toBe(true);
    }
  }, 120_000);

  it("an activity without a build record prints no path", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "leap-f2-")), "s1");
    expect(await generate(s1Args(dir), io().io)).toBe(0);
    const store = new FileStore(dir);
    const rev = (await store.getRevision("act-1", 1))!;
    await rm(join(dir, "builds", "records", `${rev.currentBuildId!}.json`)); // the record is gone; the package file stays
    const rerun = io();
    expect(await generate(s1Args(dir), rerun.io), rerun.err.join("")).toBe(0); // the finished import is reported again
    const lines = activityLines(rerun.out);
    expect(lines.find((l) => l.startsWith("  act-1  "))).not.toMatch(/\.h5p/);
    expect(lines.filter((l) => /\.h5p/.test(l))).toHaveLength(lines.length - 1); // every other activity still prints its path
  }, 120_000);
});
