import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildOutline, chunkScope, ingestSource, renderScopedEvidence, resolveScope, scopeTemplate, type OutlineSection } from "@leaplearn/generator";
import { scope, SCOPE_PREVIEW } from "../src/scope.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const docx = resolve(root, "packages/generator/test/fixtures/structure/structure.docx");
const temp = async (prefix: string) => mkdtemp(join(tmpdir(), prefix));
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };
const run = async (args: { source: string; scope: string; out: string; repoRoot?: string | null }) => { const r = io(); const code = await scope({ repoRoot: null, ...args }, r.io); return { code, stdout: r.out.join(""), stderr: r.err.join("") }; };
const flat = (s: OutlineSection[]): OutlineSection[] => s.flatMap((x) => [x, ...flat(x.children)]);

/** A scope file for the structure fixture selecting "Planning the audit", written to a fresh directory. */
async function planningScope(edit: (f: Record<string, unknown>) => Record<string, unknown> = (f) => f): Promise<{ dir: string; file: string; body: Record<string, unknown> }> {
  const ingested = await ingestSource(await readFile(docx), "structure.docx");
  const planning = flat(buildOutline(ingested.document, ingested.analysis).sections).find((s) => s.title === "Planning the audit")!;
  const body = edit({ ...(scopeTemplate(ingested, "structure.docx") as Record<string, unknown>), include: [{ section: planning.id, title: planning.title }] });
  const dir = await temp("leap-scope-");
  const file = join(dir, "generation-scope.json");
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
  return { dir, file, body };
}

describe("leap scope", () => {
  it("validates the scope and writes scope-preview.md: header, counts, and each chunk's exact evidence text, with no model call", async () => {
    const { dir, file, body } = await planningScope();
    const out = join(dir, "preview");
    const r = await run({ source: docx, scope: file, out });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(await readdir(out)).toEqual([SCOPE_PREVIEW]);
    const ingested = await ingestSource(await readFile(docx), "structure.docx");
    const resolved = resolveScope(body, ingested);
    const md = await readFile(join(out, SCOPE_PREVIEW), "utf8");
    expect(md).toContain(`- Scope hash: ${resolved.scopeHash}`);
    expect(md).toContain("- Preview configuration: chunk size 6000 tokens, scoped layout version 1; 1 chunk");
    expect(md).toContain(`- Selected: ${resolved.counts.sentences} of ${resolved.counts.documentSentences} sentences in ${resolved.counts.passages} passage(s), ${resolved.counts.sourceCodePoints} code points of source text`);
    for (const text of renderScopedEvidence(resolved)) expect(md).toContain(text);
    expect(chunkScope(resolved)).toHaveLength(1);
    expect(r.stdout).toContain(`scope ${resolved.scopeHash.slice(0, 12)}: ${resolved.counts.sentences} sentences`);
    expect(await readFile(file, "utf8")).toBe(`${JSON.stringify(body, null, 2)}\n`); // the scope file is never written
  });

  it("reports partial structures in the preview and on stdout", async () => {
    const ingested = await ingestSource(await readFile(docx), "structure.docx");
    const first = ingested.document.sentences.find((s) => s.text.startsWith("[Table 2, row 1]"))!.sentenceId;
    const { dir, file } = await planningScope((f) => ({ ...f, include: [...(f["include"] as unknown[]), { sentences: { from: first, to: first } }] }));
    const r = await run({ source: docx, scope: file, out: join(dir, "preview") });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("partial: Table 2 under Audit fundamentals › Recording results: 1 of 3 rows (row 1)");
    expect(await readFile(join(dir, "preview", SCOPE_PREVIEW), "utf8")).toContain("Table 2 under Audit fundamentals › Recording results: 1 of 3 rows (row 1)");
  });

  it("refuses an invalid scope, listing every problem, and writes nothing", async () => {
    const { dir, file } = await planningScope((f) => ({ ...f, include: [{ section: "sec-s2", title: "Wrong" }, { sentences: { from: "s9", to: "s3" } }] }));
    const out = join(dir, "preview");
    const r = await run({ source: docx, scope: file, out });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('include sec-s2: its title is "Planning the audit", not "Wrong"');
    expect(r.stderr).toContain("include s9–s3: the range starts after it ends");
    expect(r.stderr).toContain("nothing was written");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a scope bound to another file", async () => {
    const { dir, file } = await planningScope((f) => ({ ...f, source: { ...(f["source"] as object), originalSha256: "b".repeat(64) } }));
    const r = await run({ source: docx, scope: file, out: join(dir, "preview") });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/originalSha256.*re-run leap outline/);
  });

  it("refuses a scope file that is not JSON", async () => {
    const dir = await temp("leap-scope-");
    const file = join(dir, "generation-scope.json");
    await writeFile(file, "{ not json");
    const r = await run({ source: docx, scope: file, out: join(dir, "preview") });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("generation-scope.json is not valid JSON");
  });

  it("follows leap extract's output safety: inside the repository, an existing preview, the scope file itself, a dangling link", async () => {
    const { dir, file } = await planningScope();
    const inRepo = resolve(root, "packages/generator/leap-scope-refused");
    expect((await run({ source: docx, scope: file, out: inRepo, repoRoot: root })).code).toBe(1);
    expect(existsSync(inRepo)).toBe(false);

    const existing = join(dir, "existing");
    await mkdir(existing);
    await writeFile(join(existing, SCOPE_PREVIEW), "earlier preview\n");
    const again = await run({ source: docx, scope: file, out: existing });
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("already exists; leap scope never overwrites a file");
    expect(await readFile(join(existing, SCOPE_PREVIEW), "utf8")).toBe("earlier preview\n");

    const selfDir = await temp("leap-scope-");
    const selfFile = join(selfDir, SCOPE_PREVIEW);
    await writeFile(selfFile, await readFile(file));
    const self = await run({ source: docx, scope: selfFile, out: selfDir });
    expect(self.code).toBe(1);
    expect(self.stderr).toContain("is the source file itself; refusing to overwrite it");

    const dangling = join(dir, "dangling");
    await mkdir(dangling);
    await symlink(join(dir, "nowhere.md"), join(dangling, SCOPE_PREVIEW));
    expect((await run({ source: docx, scope: file, out: dangling })).code).toBe(1);
    expect(existsSync(join(dir, "nowhere.md"))).toBe(false);
  });

  it("is registered as `leap scope`", async () => {
    const { dir, file } = await planningScope();
    const env = { ...process.env };
    delete env["ANTHROPIC_API_KEY"];
    const child = spawn(process.execPath, [cliDist, "scope", "--source", docx, "--scope", file, "--out", join(dir, "cli")], { stdio: ["ignore", "pipe", "pipe"], env });
    const code = await new Promise<number | null>((done) => child.on("exit", (status) => done(status)));
    expect(code).toBe(0);
    expect(await readdir(join(dir, "cli"))).toEqual([SCOPE_PREVIEW]);
  });
});
