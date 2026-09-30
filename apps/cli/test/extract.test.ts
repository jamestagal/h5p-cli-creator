import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXTRACTION_VERSION } from "@leaplearn/generator";
import { outDirRefusal } from "../src/extract.js";

const root = resolve(import.meta.dirname, "../../..");
const cliDist = resolve(root, "apps/cli/dist/index.js");
const structure = resolve(root, "packages/generator/test/fixtures/structure");
const docx = resolve(structure, "structure.docx");
const odt = resolve(structure, "structure.odt");
const sourceMd = resolve(root, "packages/generator/test/fixtures/synthetic/source-electrical-safety.md");
const librariesDir = resolve(root, "libraries");

async function leap(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = { ...process.env };
  delete env["ANTHROPIC_API_KEY"]; // extract needs no key; generate here only reaches a replay provider
  const child = spawn(process.execPath, [cliDist, ...args], { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
  child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
  const code = await new Promise<number | null>((done) => child.on("exit", (status) => done(status)));
  return { code, stdout, stderr };
}
const temp = async (prefix: string) => mkdtemp(join(tmpdir(), prefix));

describe("leap extract on the DOCX fixture", () => {
  it("writes the four files: the linearized text, tables.md with the key/value table unmarked, extract.json, and warnings.md with the a) list and the reference", async () => {
    const out = join(await temp("leap-extract-"), "docx");
    const run = await leap(["extract", "--source", docx, "--out", out]);
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect((await readdir(out)).sort()).toEqual(["extract.json", "extracted.txt", "tables.md", "warnings.md"]);
    expect(await readFile(join(out, "extracted.txt"), "utf8")).toBe(await readFile(resolve(structure, "structure.docx.golden.txt"), "utf8"));

    const tables = await readFile(join(out, "tables.md"), "utf8");
    const table1 = tables.slice(tables.indexOf("## Table 1"), tables.indexOf("## Table 2"));
    expect(table1).toContain("- Header: no marked header row (Column n labels)");
    expect(table1).toContain("- Data rows: 2");
    expect(table1).toContain("- Heading path: Audit fundamentals › Recording results");
    expect(table1).toContain("[Table 1, row 1] Column 1: Audit scope; Column 2: All branches");
    expect(tables).toContain("- Header (1 marked row): Risk | Likelihood | Impact");
    expect(tables).toContain("## Note 3, table 1");

    const warnings = await readFile(join(out, "warnings.md"), "utf8");
    expect(warnings).toContain("- List 2 under Audit fundamentals › Planning the audit: the document uses lowerLetter;");
    expect(warnings).toMatch(/- s\d+ under Audit fundamentals › Planning the audit: "The reperformance described in item b\) above is required for every branch\."/);

    const json = JSON.parse(await readFile(join(out, "extract.json"), "utf8")) as Record<string, unknown>;
    expect(json).toMatchObject({
      originalSha256: createHash("sha256").update(await readFile(docx)).digest("hex"), extractor: "docx", extractionVersion: EXTRACTION_VERSION,
      sentenceCount: expect.any(Number), atomicSegmentCount: 6, chunkTokens: 6000, oversizeAtomicSegments: [], oversizeRequests: [],
      warnings: { listNumberingSimplified: [{ listIndex: 2, originalFormats: ["lowerLetter"] }], numberingUnsupported: [] }
    });
    expect(json["codePoints"]).toBeGreaterThanOrEqual(500);
    expect(json).not.toHaveProperty("pages");
  });

  it("lists every table row above --chunk-tokens as an oversize atomic segment instead of refusing, and still sizes the requests", async () => {
    const out = join(await temp("leap-extract-"), "small");
    const run = await leap(["extract", "--source", docx, "--out", out, "--chunk-tokens", "20"]);
    expect(run.code).toBe(0);
    const json = JSON.parse(await readFile(join(out, "extract.json"), "utf8")) as { oversizeAtomicSegments: Array<{ label: string; budgetTokens: number }>; oversizeRequests: unknown[]; chunkTokens: number };
    expect(json.chunkTokens).toBe(20);
    expect(json.oversizeAtomicSegments.map((s) => s.label)).toContain("[Table 2, row 3]");
    expect(json.oversizeAtomicSegments.every((s) => s.budgetTokens === 20)).toBe(true);
    expect(json.oversizeRequests).toEqual([]);
  });

  it("reads the ODT fixture the same way, with its real a) labels and no simplified numbering", async () => {
    const out = join(await temp("leap-extract-"), "odt");
    const run = await leap(["extract", "--source", odt, "--out", out]);
    expect(run.code).toBe(0);
    expect(await readFile(join(out, "extracted.txt"), "utf8")).toBe(await readFile(resolve(structure, "structure.odt.golden.txt"), "utf8"));
    expect(await readFile(join(out, "warnings.md"), "utf8")).toContain("## Lists with simplified numbering (0)");
    expect(JSON.parse(await readFile(join(out, "extract.json"), "utf8"))).toMatchObject({ extractor: "odt" });
  });

  it("says that a markdown source has no table structure", async () => {
    const out = join(await temp("leap-extract-"), "md");
    expect((await leap(["extract", "--source", sourceMd, "--out", out])).code).toBe(0);
    expect(await readFile(join(out, "tables.md"), "utf8")).toContain("No tables: markdown sources carry no table structure");
    expect(JSON.parse(await readFile(join(out, "extract.json"), "utf8"))).toMatchObject({ extractor: "markdown", warnings: { listNumberingSimplified: [], numberingUnsupported: [], labelLikeReferences: [] } });
  });
});

describe("leap extract refusals", () => {
  it("a source of 499 code points exits 1 with the admission message, naming the count and the limit, and writes nothing", async () => {
    const dir = await temp("leap-extract-");
    const source = join(dir, "short.txt");
    await writeFile(source, `${"a".repeat(499)}\n`);
    const out = join(dir, "out");
    const run = await leap(["extract", "--source", source, "--out", out]);
    expect(run.code).toBe(1);
    expect(run.stderr).toBe("leap: short.txt: source has 499 code points of text after extraction, below the minimum of 500; submit a longer source\n");
    expect(existsSync(out)).toBe(false);
  });

  it("an --out inside the repository and outside docs/uoc/ exits 1 and writes nothing", async () => {
    const out = resolve(root, "packages/generator/leap-extract-refused");
    const run = await leap(["extract", "--source", docx, "--out", out]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("is inside the repository");
    expect(run.stderr).toContain("not under docs/uoc/");
    expect(existsSync(out)).toBe(false);
  });

  it("an unsupported source type exits 1 with the list of accepted types, for extract and for generate", async () => {
    const dir = await temp("leap-extract-");
    const source = join(dir, "notes.rtf");
    await writeFile(source, "x".repeat(600));
    const extracted = await leap(["extract", "--source", source, "--out", join(dir, "out")]);
    expect(extracted.code).toBe(1);
    expect(extracted.stderr).toContain('unsupported source type ".rtf"; use one of .txt, .md, .pdf, .docx, .odt');
    const generated = await leap(["generate", "--source", source, "--out", join(dir, "import"), "--provider", "replay", "--fixtures", dir, "--libraries", librariesDir]);
    expect(generated.code).toBe(1);
    expect(generated.stderr).toContain('unsupported source type ".rtf"; use one of .txt, .md, .pdf, .docx, .odt');
    expect(existsSync(join(dir, "import", "import.json"))).toBe(false);
  });
});

describe("outDirRefusal", () => {
  async function fakeRepo(): Promise<string> {
    const repo = await temp("leap-repo-");
    await mkdir(join(repo, ".git"));
    await mkdir(join(repo, "docs", "uoc"), { recursive: true });
    return repo;
  }

  it("allows directories outside the repository and under docs/uoc/, and refuses the rest of the repository", async () => {
    const repo = await fakeRepo();
    expect(outDirRefusal(join(await temp("leap-outside-"), "x"), repo)).toBeNull();
    expect(outDirRefusal(join(repo, "docs", "uoc", "BSBAUD412", "extract-1"), repo)).toBeNull();
    expect(outDirRefusal(join(repo, "docs", "uoc"), repo)).not.toBeNull(); // the folder itself, not a packet under it
    expect(outDirRefusal(join(repo, "docs", "uocx", "a"), repo)).not.toBeNull();
    expect(outDirRefusal(join(repo, "extract"), repo)).not.toBeNull();
    expect(outDirRefusal(repo, repo)).not.toBeNull();
    expect(outDirRefusal(join(repo, "..leap", "x"), repo)).not.toBeNull(); // a name starting with ".." is still inside
    expect(outDirRefusal(join(repo, "extract"), null)).toBeNull(); // installed outside any repository: no restriction
  });

  it("follows symlinks: a link outside the repository pointing into it is refused, a link under docs/uoc/ pointing out is allowed", async () => {
    const repo = await fakeRepo();
    const outside = await temp("leap-outside-");
    await mkdir(join(repo, "src"));
    await symlink(join(repo, "src"), join(outside, "into-repo"));
    expect(outDirRefusal(join(outside, "into-repo", "extract"), repo)).not.toBeNull();
    await symlink(outside, join(repo, "docs", "uoc", "elsewhere"));
    expect(outDirRefusal(join(repo, "docs", "uoc", "elsewhere", "x"), repo)).toBeNull();
  });
});

describe("leap generate accepts DOCX and ODT sources", () => {
  for (const [format, source] of [["docx", docx], ["odt", odt]] as const) {
    it(`${format}: ingests the source, reports its warnings, and records the import with source type ${format} (the replay provider then stops at its first call)`, async () => {
      const dir = await temp("leap-generate-");
      const out = join(dir, "import");
      await mkdir(join(dir, "fixtures"));
      const run = await leap(["generate", "--source", source, "--out", out, "--types", "multiChoice", "--provider", "replay", "--fixtures", join(dir, "fixtures"), "--libraries", librariesDir]);
      expect(run.code).toBe(1); // no recording exists for this source: no paid call is possible
      expect(run.stderr).not.toContain("unsupported source type");
      expect(run.stderr).toContain(format === "docx" ? "source warnings: 1 list(s) with simplified numbering; 1 sentence(s) that look like list-label references" : "source warnings: 1 sentence(s) that look like list-label references");
      expect(JSON.parse(await readFile(join(out, "import.json"), "utf8"))).toMatchObject({ sourceType: format });
      expect(JSON.parse(await readFile(join(out, "artifacts", "source.json"), "utf8"))).toMatchObject({ kind: format, metadata: { extractor: format, extractionVersion: EXTRACTION_VERSION } });
    });
  }
});
