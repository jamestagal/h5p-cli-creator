import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXTRACTION_VERSION } from "@leaplearn/generator";
import { outDirRefusal, publishReports, REPORT_NAMES } from "../src/extract.js";

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
    expect(warnings).toMatch(/- List 2 under Audit fundamentals › Planning the audit: the document uses lowerLetter; the text shows decimal or bullet labels instead\. 2 items; first item "Inspect the records", sentence s\d+\./);
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

describe("leap extract never writes through a link or over an existing file", () => {
  const reportsIn = async (dir: string) => (await readdir(dir)).filter((n) => (REPORT_NAMES as readonly string[]).includes(n) || n.startsWith(".extract-staging-")).sort();

  it("refuses an extracted.txt that is a symbolic link to another file: the target is unchanged and no report is written", async () => {
    const dir = await temp("leap-extract-");
    const tracked = join(dir, "tracked.txt");
    await writeFile(tracked, "tracked content\n");
    const out = join(dir, "out");
    await mkdir(out);
    await symlink(tracked, join(out, "extracted.txt"));
    const run = await leap(["extract", "--source", docx, "--out", out]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("extracted.txt is a symbolic link; refusing to write a report through it. Nothing was written");
    expect(await readFile(tracked, "utf8")).toBe("tracked content\n");
    expect((await lstat(join(out, "extracted.txt"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(out, "extracted.txt"))).toBe(tracked);
    expect(await reportsIn(out)).toEqual(["extracted.txt"]);
  });

  it("refuses a dangling symbolic link under a report name, creating nothing at its target", async () => {
    const dir = await temp("leap-extract-");
    const out = join(dir, "out");
    await mkdir(out);
    await symlink(join(dir, "nowhere.md"), join(out, "warnings.md"));
    expect((await leap(["extract", "--source", docx, "--out", out])).code).toBe(1);
    expect(existsSync(join(dir, "nowhere.md"))).toBe(false);
    expect(await reportsIn(out)).toEqual(["warnings.md"]);
  });

  it("refuses a source named extracted.txt inside --out: the source is unchanged and no report is written", async () => {
    const dir = await temp("leap-extract-");
    const out = join(dir, "out");
    await mkdir(out);
    const source = join(out, "extracted.txt");
    const original = `  Padded source text.\r\n${"Lock it out before work starts. ".repeat(20)}\r\n`;
    await writeFile(source, original);
    const run = await leap(["extract", "--source", source, "--out", out]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("extracted.txt is the source file itself; refusing to overwrite it. Nothing was written");
    expect(await readFile(source, "utf8")).toBe(original);
    expect(await reportsIn(out)).toEqual(["extracted.txt"]);
  });

  it("refuses to overwrite reports from an earlier run: they stay byte-identical", async () => {
    const out = join(await temp("leap-extract-"), "out");
    expect((await leap(["extract", "--source", docx, "--out", out])).code).toBe(0);
    const before = await Promise.all(REPORT_NAMES.map((n) => readFile(join(out, n), "utf8")));
    const run = await leap(["extract", "--source", odt, "--out", out]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("already exists; leap extract never overwrites a report. Use a new --out directory");
    expect(await Promise.all(REPORT_NAMES.map((n) => readFile(join(out, n), "utf8")))).toEqual(before);
    expect(await reportsIn(out)).toEqual([...REPORT_NAMES].sort());
  });

  it("publishes all or nothing: a failure while linking the third report removes the two already published and the staging directory", async () => {
    const out = await temp("leap-publish-");
    let calls = 0;
    const failing = { link: async (from: string, to: string) => { if (++calls === 3) throw Object.assign(new Error("EIO: injected"), { code: "EIO" }); const { link } = await import("node:fs/promises"); await link(from, to); } };
    const files = Object.fromEntries(REPORT_NAMES.map((n) => [n, `${n} body`])) as Record<(typeof REPORT_NAMES)[number], string>;
    await expect(publishReports(out, files, failing)).rejects.toThrow(/injected/);
    expect(await readdir(out)).toEqual([]);
  });

  it("publishes all or nothing: a report name that appears after the check is not replaced, and nothing is kept", async () => {
    const out = await temp("leap-publish-");
    const files = Object.fromEntries(REPORT_NAMES.map((n) => [n, `${n} body`])) as Record<(typeof REPORT_NAMES)[number], string>;
    let calls = 0;
    const racing = { link: async (from: string, to: string) => { if (++calls === 2) await writeFile(join(out, "tables.md"), "someone else's file"); const { link } = await import("node:fs/promises"); await link(from, to); } };
    await expect(publishReports(out, files, racing)).rejects.toThrow(/tables\.md appeared while the reports were being written; nothing was kept/);
    expect(await readdir(out)).toEqual(["tables.md"]);
    expect(await readFile(join(out, "tables.md"), "utf8")).toBe("someone else's file");
  });
});

describe("leap generate keeps the original DOCX or ODT unchanged in the import", () => {
  it("stores the original before dispatch; it survives changes to the supplied file, and a changed file with the same text is refused on resume", async () => {
    const dir = await temp("leap-generate-");
    const supplied = join(dir, "packet.docx");
    await copyFile(docx, supplied);
    const bytes = await readFile(supplied);
    const out = join(dir, "import");
    await mkdir(join(dir, "fixtures"));
    const args = ["generate", "--source", supplied, "--out", out, "--types", "multiChoice", "--provider", "replay", "--fixtures", join(dir, "fixtures"), "--libraries", librariesDir];
    expect((await leap(args)).code).toBe(1); // stops at the replay provider's first call
    const snapshot = join(out, "source", "original.docx");
    expect((await readFile(snapshot)).equals(bytes)).toBe(true);

    // Same text, different bytes: the fixture's parts with one extra, unreferenced part.
    const { structureParts, zipDocx } = await import("../../../packages/generator/test/fixtures/structure/docx-builder.mjs");
    await writeFile(supplied, await zipDocx({ ...structureParts(), "docProps/custom.xml": "<Properties/>" }));
    const resumed = await leap(args);
    expect(resumed.code).toBe(1);
    expect(resumed.stderr).toContain("the supplied file has sha256");
    expect(resumed.stderr).toContain("never replaced; use a new output directory");
    expect((await readFile(snapshot)).equals(bytes)).toBe(true);

    await writeFile(supplied, "not the packet any more");
    expect((await readFile(snapshot)).equals(bytes)).toBe(true);
    const json = JSON.parse(await readFile(join(out, "artifacts", "source.json"), "utf8")) as { metadata: { originalSha256: string } };
    expect(json.metadata.originalSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("refuses to resume when the stored original was altered, naming it", async () => {
    const dir = await temp("leap-generate-");
    const out = join(dir, "import");
    await mkdir(join(dir, "fixtures"));
    const args = ["generate", "--source", odt, "--out", out, "--types", "multiChoice", "--provider", "replay", "--fixtures", join(dir, "fixtures"), "--libraries", librariesDir];
    expect((await leap(args)).code).toBe(1);
    await writeFile(join(out, "source", "original.odt"), "altered");
    const resumed = await leap(args);
    expect(resumed.code).toBe(1);
    expect(resumed.stderr).toContain("stored original has been altered");
  });
});
