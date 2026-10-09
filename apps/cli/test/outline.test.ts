import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_CHUNK_TOKENS, EXTRACTION_VERSION, ingestSource, SCOPE_FORMAT, SCOPED_LAYOUT_VERSION } from "@leaplearn/generator";
import { OUTLINE_NAMES, outline } from "../src/outline.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const structure = resolve(root, "packages/generator/test/fixtures/structure");
const docx = resolve(structure, "structure.docx");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const temp = async (prefix: string) => mkdtemp(join(tmpdir(), prefix));
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };
const run = async (args: { source: string; out: string; repoRoot?: string | null }) => { const r = io(); const code = await outline({ repoRoot: null, ...args }, r.io); return { code, stdout: r.out.join(""), stderr: r.err.join("") }; };

interface SectionJson { id: string; title: string; level: number; headingPath: string[]; own: Record<string, unknown>; subtree: Record<string, unknown>; children: SectionJson[] }
const titles = (s: SectionJson[]): string[] => s.flatMap((x) => [x.title, ...titles(x.children)]);

describe("leap outline", () => {
  it("writes outline.md, outline.json, sentences.md and a generation-scope.json template bound to the source, with no model call or key", async () => {
    const out = join(await temp("leap-outline-"), "docx");
    const r = await run({ source: docx, out });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect((await readdir(out)).sort()).toEqual([...OUTLINE_NAMES].sort());
    const bytes = await readFile(docx);
    const ingested = await ingestSource(bytes, "structure.docx");

    const template = JSON.parse(await readFile(join(out, "generation-scope.json"), "utf8")) as Record<string, unknown>;
    expect(template).toEqual({
      kind: "leap.generationScope", scopeFormat: SCOPE_FORMAT,
      source: { fileName: "structure.docx", originalSha256: createHash("sha256").update(bytes).digest("hex"), textHash: ingested.document.textHash, extractionVersion: EXTRACTION_VERSION },
      include: [], exclude: [],
      previewConfig: { chunkTokens: DEFAULT_CHUNK_TOKENS, scopedLayoutVersion: SCOPED_LAYOUT_VERSION }
    });

    const json = JSON.parse(await readFile(join(out, "outline.json"), "utf8")) as { usableHeadings: boolean; sections: SectionJson[]; totals: { sentences: number } };
    expect(json.usableHeadings).toBe(true);
    expect(titles(json.sections)).toEqual(["Audit fundamentals", "Planning the audit", "Recording results"]);
    expect(json.totals.sentences).toBe(ingested.document.sentences.length);
    const recording = json.sections[0]!.children[1]!;
    expect(recording.headingPath).toEqual(["Audit fundamentals", "Recording results"]);
    expect(recording.own).toMatchObject({ tables: 3, tableRows: 6, notes: 1, lists: 1, listItems: 2, listItemSentences: 2 }); // the list in Note 3
    // body lists 1 (4 items) and 2 (2 items), and the list in Note 1 (3 items, one nested)
    expect(json.sections[0]!.children[0]!.own).toMatchObject({ lists: 3, listItems: 9, listItemSentences: 9, notes: 1, noteLines: 5 }); // Tables 1 and 2, and the table inside Note 3; Note 2 is inline in a cell, so not a note of its own

    const md = await readFile(join(out, "outline.md"), "utf8");
    expect(md).toContain(`${recording.id}`);
    expect(md).toContain("Audit fundamentals › Recording results");
    expect(md).toMatch(/own: \d+ sentences, \d+ source code points/);

    const sentences = await readFile(join(out, "sentences.md"), "utf8");
    for (const s of ingested.document.sentences) expect(sentences).toContain(`[${s.sentenceId}] `);
    expect(sentences).toContain("(list level 2)");
    expect(r.stdout).toContain("structure.docx: 3 sections (usable headings)");
    expect(r.stdout).toContain(`wrote ${OUTLINE_NAMES.join(", ")} to ${out}`);
  });

  it("a markdown source has no usable headings: one whole-document section, and the sentence-range fallback is explained", async () => {
    const out = join(await temp("leap-outline-"), "md");
    const r = await run({ source: sourceMd, out });
    expect(r.code).toBe(0);
    const json = JSON.parse(await readFile(join(out, "outline.json"), "utf8")) as { usableHeadings: boolean; sections: SectionJson[] };
    expect(json.usableHeadings).toBe(false);
    expect(json.sections.map((s) => [s.id, s.title])).toEqual([["sec-s1", "(whole document)"]]);
    expect(await readFile(join(out, "outline.md"), "utf8")).toContain("no usable headings: select sentence ranges");
    expect(r.stdout).toContain("1 section (no usable headings: select sentence ranges)");
  });

  it("refuses an --out inside the repository and outside docs/uoc/, writing nothing", async () => {
    const out = resolve(root, "packages/generator/leap-outline-refused");
    const r = await run({ source: docx, out, repoRoot: root });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("is inside the repository");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an --out reached through a symbolic link into the repository", async () => {
    const repo = await temp("leap-fake-repo-");
    await mkdir(join(repo, ".git")); await mkdir(join(repo, "src"));
    const outside = await temp("leap-outside-");
    await symlink(join(repo, "src"), join(outside, "into-repo"));
    const r = await run({ source: docx, out: join(outside, "into-repo", "outline"), repoRoot: repo });
    expect(r.code).toBe(1);
    expect(existsSync(join(repo, "src", "outline"))).toBe(false);
  });

  it("never overwrites: an existing generation-scope.json (an author's edited scope) is refused and stays byte-identical", async () => {
    const out = await temp("leap-outline-");
    const edited = `{"edited": true}\n`;
    await writeFile(join(out, "generation-scope.json"), edited);
    const r = await run({ source: docx, out });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("generation-scope.json already exists; leap outline never overwrites a file. Use a new --out directory. Nothing was written");
    expect(await readFile(join(out, "generation-scope.json"), "utf8")).toBe(edited);
    expect(await readdir(out)).toEqual(["generation-scope.json"]);
  });

  it("refuses a dangling symbolic link under an output name, creating nothing at its target", async () => {
    const dir = await temp("leap-outline-");
    const out = join(dir, "out");
    await mkdir(out);
    await symlink(join(dir, "nowhere.md"), join(out, "outline.md"));
    const r = await run({ source: docx, out });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("outline.md is a symbolic link");
    expect(existsSync(join(dir, "nowhere.md"))).toBe(false);
    expect((await lstat(join(out, "outline.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(out, "outline.md"))).toBe(join(dir, "nowhere.md"));
    expect(await readdir(out)).toEqual(["outline.md"]);
  });

  it("refuses a source whose path is one of the output names, leaving it unchanged", async () => {
    const out = await temp("leap-outline-");
    const source = join(out, "sentences.md");
    const original = `${"Lock it out before work starts. ".repeat(20)}\n`;
    await writeFile(source, original);
    const r = await run({ source, out });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("sentences.md is the source file itself; refusing to overwrite it. Nothing was written");
    expect(await readFile(source, "utf8")).toBe(original);
  });

  it("a refused source (below admission) exits 1 and writes nothing", async () => {
    const dir = await temp("leap-outline-");
    const source = join(dir, "short.txt");
    await writeFile(source, "Too short.");
    const out = join(dir, "out");
    const r = await run({ source, out });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("short.txt:");
    expect(existsSync(out)).toBe(false);
  });

  it("is registered as `leap outline`", async () => {
    const out = join(await temp("leap-outline-"), "cli");
    const env = { ...process.env };
    delete env["ANTHROPIC_API_KEY"];
    const child = spawn(process.execPath, [cliDist, "outline", "--source", sourceMd, "--out", out], { stdio: ["ignore", "pipe", "pipe"], env });
    const code = await new Promise<number | null>((done) => child.on("exit", (status) => done(status)));
    expect(code).toBe(0);
    expect((await readdir(out)).sort()).toEqual([...OUTLINE_NAMES].sort());
  });
});
