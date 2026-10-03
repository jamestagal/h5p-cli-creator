import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

/**
 * Claims wording (design §4.5): the user-facing text never says more than has been done. Unreviewed output has source
 * citations and a suggested alignment; nothing claims competency, assessment evidence or RTO compliance, and
 * "verified" / "validated" are not used about activities.
 */
const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");

export const BANNED = [/competent/i, /competency achieved/i, /assessment evidence/i, /meets RTO/i, /verified/i, /validated/i];

/**
 * Uses of a banned word that are not claims about generated activities, each with why it is allowed. A phrase here is
 * matched literally (case-insensitive) and only masks that exact phrase.
 */
export const ALLOWED_PHRASES: ReadonlyArray<{ phrase: string; why: string }> = [
  { phrase: "pinned to the validated address", why: "README, network safety: the resolved IP address checked before connecting" },
  { phrase: "Fully functional content** validated on h5p.com", why: "README, legacy CLI: packages render on the h5p.com platform; not a claim about content quality or competency" }
];

export interface Hit { file: string; line: number; text: string; word: string }

/** Every banned word in `text` that is not inside an allowed phrase. */
export function claimsViolations(file: string, text: string, allowed = ALLOWED_PHRASES): Hit[] {
  const hits: Hit[] = [];
  text.split("\n").forEach((line, i) => {
    let masked = line;
    for (const { phrase } of allowed) masked = masked.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => " ".repeat(m.length));
    for (const re of BANNED) { const m = re.exec(masked); if (m) hits.push({ file, line: i + 1, text: line.trim(), word: m[0] }); }
  });
  return hits;
}

async function sourcesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourcesUnder(p)));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** The text a user or a model reads: CLI help for every command, the README, every module that builds a prompt, and the report and sheet writers. */
async function claimSurfaces(): Promise<Array<{ file: string; text: string }>> {
  const surfaces: Array<{ file: string; text: string }> = [];
  for (const command of ["", "generate", "extract", "review", "review-sheet", "review-import", "regenerate", "gate-report", "flashcards"]) {
    const run = spawnSync(process.execPath, [cliDist, ...(command ? [command] : []), "--help"], { encoding: "utf8" });
    expect(run.status, `leap ${command} --help: ${run.stderr}`).toBe(0);
    surfaces.push({ file: `leap ${command} --help`.replace("  ", " "), text: run.stdout });
  }
  surfaces.push({ file: "README.md", text: await readFile(resolve(root, "README.md"), "utf8") });
  const generator = resolve(root, "packages/generator/src");
  const promptDirs = ["prompts", "competency", "concepts", "plan", "produce", "review"].map((d) => resolve(generator, d));
  const files = [...(await Promise.all(promptDirs.map(sourcesUnder))).flat(), resolve(root, "apps/cli/src/report.ts"), resolve(root, "apps/cli/src/review-sheet.ts"), resolve(root, "apps/cli/src/review-import.ts"), resolve(root, "apps/cli/src/regenerate.ts"), resolve(root, "apps/cli/src/gate-report.ts"), resolve(root, "packages/generator/src/report/gate.ts")];
  for (const f of files) surfaces.push({ file: relative(root, f), text: await readFile(f, "utf8") });
  return surfaces;
}

describe("claims wording (design §4.5)", () => {
  it("no banned claim appears in CLI help, the README, prompts, report headers or the review sheet, outside the allowed phrases", async () => {
    expect(existsSync(cliDist), `${cliDist} must be built before this test`).toBe(true);
    const surfaces = await claimSurfaces();
    expect(surfaces.length).toBeGreaterThan(15);
    const hits = surfaces.flatMap((s) => claimsViolations(s.file, s.text));
    expect(hits, hits.map((h) => `${h.file}:${h.line}: "${h.word}" in ${h.text}`).join("\n")).toEqual([]);
    // every allowed phrase is still in use; a stale entry would silently widen the list
    const readme = surfaces.find((s) => s.file === "README.md")!.text.toLowerCase();
    for (const { phrase } of ALLOWED_PHRASES) expect(readme, phrase).toContain(phrase.toLowerCase());
  }, 30_000); // spawns leap once per command, like the other process tests

  it("fails on a planted phrase, in any surface, whatever the case", () => {
    expect(claimsViolations("planted", "Completing these activities shows the learner is Competent.")).toMatchObject([{ word: "Competent", line: 1 }]);
    expect(claimsViolations("planted", "ok\nThis package meets RTO requirements")).toMatchObject([{ word: "meets RTO", line: 2 }]);
    expect(claimsViolations("planted", "Each answer is VERIFIED against the source.")).toHaveLength(1);
    expect(claimsViolations("planted", "Use it as assessment evidence; competency achieved.")).toHaveLength(2);
    expect(claimsViolations("planted", "Content validated against the unit.")).toHaveLength(1);
    expect(claimsViolations("planted", "the connection is pinned to the validated address")).toEqual([]); // an allowed phrase
    expect(claimsViolations("planted", "validated address")).toHaveLength(1); // only the whole allowed phrase is masked
  });
});
