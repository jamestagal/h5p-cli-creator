import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestPdf, textHash, type SourceDocument } from "../src/ingest/index.js";
import { parseUnit } from "../src/competency/parse-unit.js";
import { createRunner } from "../src/llm/runner.js";
import { createBudget } from "../src/llm/budget.js";
import { FakeProvider } from "../src/llm/fake-provider.js";
import { requestKey } from "../src/llm/replay-provider.js";
import { MemoryRecorder } from "./helpers/synthetic.js";

/**
 * The historical replay archive (plan R12, amended 1 Oct 2026). The phase-2 recordings, the frozen source document
 * they were made from, and the unit text and PDF behind it are kept byte for byte. They are no longer replayed: Task 10
 * changed every request they answer, and old responses are never re-keyed. These checks keep the archive intact.
 */
const archive = resolve(import.meta.dirname, "fixtures/historical");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface Manifest { lastCompatibleRevision: string; recordedAtRevision: string; files: Record<string, string> }
interface RecordedFixture { recordedAt: string; request: { purpose: string; model: string; maxOutputTokens: number; userPreview: string }; response: { outputText: string } }

const manifest = async (): Promise<Manifest> => JSON.parse(await readFile(resolve(archive, "manifest.json"), "utf8")) as Manifest;
const recordings = async (): Promise<Array<[string, RecordedFixture]>> => {
  const names = (await readdir(resolve(archive, "replay"))).sort();
  return Promise.all(names.map(async (n) => [n, JSON.parse(await readFile(resolve(archive, "replay", n), "utf8")) as RecordedFixture] as [string, RecordedFixture]));
};

describe("historical replay archive", () => {
  it("holds exactly the files in its manifest, each with its recorded sha256, and names db6057a as the last compatible revision", async () => {
    const m = await manifest();
    expect(m.lastCompatibleRevision).toBe("db6057a");
    expect(m.recordedAtRevision).toBe("c8717eb");
    const present = [...(await readdir(resolve(archive, "replay"))).map((n) => `replay/${n}`), ...(await readdir(archive)).filter((n) => !["replay", "README.md", "manifest.json"].includes(n))].sort();
    expect(present).toEqual(Object.keys(m.files).sort());
    for (const [file, hash] of Object.entries(m.files)) expect(sha256(await readFile(resolve(archive, file))), file).toBe(hash);
  });

  it("keeps the 13 recorded responses, each named by its request key and readable", async () => {
    const recorded = await recordings();
    expect(recorded).toHaveLength(13);
    const purposes: Record<string, number> = {};
    for (const [name, r] of recorded) {
      expect(name).toMatch(/^[0-9a-f]{64}\.json$/);
      expect(typeof r.response.outputText, name).toBe("string");
      expect(() => JSON.parse(r.response.outputText) as unknown, name).not.toThrow();
      purposes[r.request.purpose] = (purposes[r.request.purpose] ?? 0) + 1;
    }
    expect(purposes).toEqual({ parseUnit: 1, extract: 1, align: 1, plan: 1, produce: 9 });
  });

  it("the frozen document is the pre-fix extraction (page labels included), not what current ingestion makes of the archived PDF", async () => {
    const frozen = JSON.parse(await readFile(resolve(archive, "source-electrical-safety.pdf.841bfd7.source.json"), "utf8")) as SourceDocument;
    expect(frozen.textHash).toBe(textHash(frozen.text));
    expect(frozen.textHash).toBe("99fe17fc5d2ef510a1622fac5fb7682702ea69b4ebbbd306e9e0d473e627520f");
    expect(frozen.metadata.extractionVersion).toBe("2026-09-28.1");
    expect(frozen.text).toMatch(/^-- 1 of 2 --$/m);
    for (const s of frozen.sentences) expect(frozen.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    const current = await ingestPdf(await readFile(resolve(archive, "source-electrical-safety.pdf.db6057a.pdf")), { sourceId: "src-source-electrical-safety.pdf", fileName: "source-electrical-safety.pdf" });
    expect(current.textHash).not.toBe(frozen.textHash);
    expect(current.metadata.extractionVersion).not.toBe(frozen.metadata.extractionVersion);
  });

  it("the archived unit text is what the recorded parseUnit request was made from", async () => {
    const unitText = await readFile(resolve(archive, "unit-synele001.txt.db6057a.txt"), "utf8");
    const [, parse] = (await recordings()).find(([, r]) => r.request.purpose === "parseUnit")!;
    expect(parse.request.userPreview).toBe(`UNIT TEXT:\n${unitText.trim()}`.slice(0, 200));
  });

  it("is not replayable by the current pipeline: today's parseUnit request for the archived unit text has no recording here", async () => {
    const unitText = await readFile(resolve(archive, "unit-synele001.txt.db6057a.txt"), "utf8");
    const provider = new FakeProvider([]);
    const runner = createRunner({ provider, recorder: new MemoryRecorder(), budget: createBudget({ usdMicro: 1_000_000 }), operationId: "op", origin: "shared", requestId: null, sleep: async () => undefined });
    await parseUnit(unitText, runner).catch(() => undefined); // the empty script stops it after the request is captured
    expect(provider.requests).toHaveLength(1);
    const names = (await recordings()).map(([n]) => n);
    expect(names).not.toContain(`${requestKey(provider.requests[0]!)}.json`);
  });
});
