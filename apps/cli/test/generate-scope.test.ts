import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildOutline, ingestSource, resolveScope, scopeTemplate, type OutlineSection } from "@leaplearn/generator";
import { generate, type GenerateArgs } from "../src/generate.js";

const root = resolve(import.meta.dirname, "../../..");
const docx = resolve(root, "packages/generator/test/fixtures/structure/structure.docx");
const libraries = resolve(root, "libraries");
const temp = async (prefix: string) => mkdtemp(join(tmpdir(), prefix));
const flat = (s: OutlineSection[]): OutlineSection[] => s.flatMap((x) => [x, ...flat(x.children)]);
const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } }; };

async function scopeFor(dir: string, edit: (f: Record<string, unknown>) => Record<string, unknown> = (f) => f): Promise<{ file: string; body: Record<string, unknown> }> {
  const ingested = await ingestSource(await readFile(docx), "structure.docx");
  const planning = flat(buildOutline(ingested.document, ingested.analysis).sections).find((s) => s.title === "Planning the audit")!;
  const body = edit({ ...(scopeTemplate(ingested, "structure.docx") as Record<string, unknown>), include: [{ section: planning.id, title: planning.title }] });
  const file = join(dir, `scope-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(file, JSON.stringify(body));
  return { file, body };
}
/** `leap generate --scope` with the replay provider and no recordings: anything that reaches a model stops at its first call. */
async function run(dir: string, out: string, scope: string | undefined): Promise<{ code: number | "threw"; stdout: string; stderr: string; error: unknown }> {
  const fixtures = join(dir, "fixtures");
  await mkdir(fixtures, { recursive: true });
  const r = io();
  const args: GenerateArgs = { source: docx, out, types: "multiChoice", maxRequests: 50, maxTokens: 500_000, maxSeconds: 600, language: "en", readingLevel: "high-school", tone: "educational", libraries, provider: "replay", fixtures, concurrency: 1, ...(scope ? { scope } : {}) };
  try { return { code: await generate(args, r.io), stdout: r.out.join(""), stderr: r.err.join(""), error: null }; } catch (error) { return { code: "threw", stdout: r.out.join(""), stderr: r.err.join(""), error }; }
}
/** Every file of an import directory except its lock, for before/after comparison. */
async function files(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (!e.name.endsWith(".lock")) out[p] = (await readFile(p)).toString("base64"); } };
  await walk(dir);
  return out;
}

describe("leap generate --scope", { timeout: 30_000 }, () => {
  it("prints the scope, stores it and the source before the first model call, and binds the import to it", async () => {
    const dir = await temp("leap-gen-scope-");
    const { file, body } = await scopeFor(dir);
    const out = join(dir, "import");
    const r = await run(dir, out, file);
    expect(r.code).not.toBe(0); // the replay provider has no recording: the run stops at its first call
    const resolved = resolveScope(body, await ingestSource(await readFile(docx), "structure.docx"));
    expect(r.stdout).toContain(`scope ${resolved.scopeHash.slice(0, 12)}: ${resolved.counts.sentences} sentences in ${resolved.counts.passages} passage(s), ${resolved.counts.sourceCodePoints} code points of source text`);
    const stored = JSON.parse(await readFile(join(out, "artifacts", "generationScope.json"), "utf8")) as Record<string, unknown>;
    expect(stored).toMatchObject({ scopeHash: resolved.scopeHash, previewConfig: { chunkTokens: 6000, scopedLayoutVersion: 1 } });
    expect(JSON.parse(await readFile(join(out, "artifacts", "generationScopeEntries.json"), "utf8"))).toMatchObject({ history: [{ include: body["include"], exclude: [] }] });
    expect(JSON.parse(await readFile(join(out, "artifacts", "source.json"), "utf8"))).toMatchObject({ kind: "docx" });
  });

  it("reports partial structures before running", async () => {
    const dir = await temp("leap-gen-scope-");
    const ingested = await ingestSource(await readFile(docx), "structure.docx");
    const row = ingested.document.sentences.find((s) => s.text.startsWith("[Table 2, row 1]"))!.sentenceId;
    const { file } = await scopeFor(dir, (f) => ({ ...f, include: [...(f["include"] as unknown[]), { sentences: { from: row, to: row } }] }));
    const r = await run(dir, join(dir, "import"), file);
    expect(r.stdout).toContain("partial: Table 2 under Audit fundamentals › Recording results: 1 of 3 rows (row 1)");
  });

  it("refuses an invalid scope, listing its problems, and writes nothing", async () => {
    const dir = await temp("leap-gen-scope-");
    const { file } = await scopeFor(dir, (f) => ({ ...f, include: [{ section: "sec-s2", title: "Wrong" }] }));
    const out = join(dir, "import");
    const r = await run(dir, out, file);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('include sec-s2: its title is "Planning the audit", not "Wrong"');
    expect(r.stderr).toContain("the generation scope is refused; nothing was written");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a scope file that is not JSON, writing nothing", async () => {
    const dir = await temp("leap-gen-scope-");
    const file = join(dir, "broken.json");
    await writeFile(file, "{");
    const out = join(dir, "import");
    const r = await run(dir, out, file);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("broken.json is not valid JSON");
    expect(existsSync(out)).toBe(false);
  });

  it("a resume with another scope, or without one, is refused naming the generation scope, and changes no record", async () => {
    const dir = await temp("leap-gen-scope-");
    const { file } = await scopeFor(dir);
    const out = join(dir, "import");
    await run(dir, out, file);
    const before = await files(out);
    const other = await scopeFor(dir, (f) => ({ ...f, include: [...(f["include"] as unknown[]), { sentences: { from: "s20", to: "s22" } }] }));
    for (const scope of [other.file, undefined]) {
      const r = await run(dir, out, scope);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("generation scope");
      expect(await files(out)).toEqual(before);
    }
  });
});
