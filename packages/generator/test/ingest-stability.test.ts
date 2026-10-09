import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestDocx, ingestMarkdown, ingestOdt, ingestPdf, ingestText, type SourceDocument } from "../src/ingest/index.js";
import { electricalDocx, electricalOdt } from "./helpers/structured-sources.js";
import { fixtures } from "./helpers/synthetic.js";

const structure = resolve(import.meta.dirname, "fixtures/structure");
const hash = (doc: SourceDocument): string => createHash("sha256").update(JSON.stringify(doc)).digest("hex");
const opts = (fileName: string) => ({ sourceId: `src-${fileName}`, fileName });

/**
 * Every fixture's SourceDocument (text, sentences with offsets, heading paths and list depths, metadata), hashed as
 * produced at e6a0ead, before source analysis existed. Source analysis (generation scope Step 1) is computed beside the
 * document and must not change it: the stored text, sentences, extraction requests and fingerprints all derive from it.
 */
const PINNED: Record<string, string> = {
  "structure.docx": "4b52a1a2f419676574a0d987847bd760d4e12b6a45ddc870a8927bfea440ce50",
  "structure.odt": "0f481fc2bfe4b34056e9de8a59b21e04feaabe0de31d3d8382291570ce24e09d",
  "electrical.docx": "4ebab5e0a5ec3c2d181536fd3b286cd9c226f49110905b9faa593704ac2d3719",
  "electrical.odt": "ce6cfef546b4076ee8534998a3984b5cdc76ada23175c3efc46056b6a66243df",
  "electrical.md": "d92233cd67c07f2f5106545b805c905e5d1766c833b3ddfbdb3c5bccdd8e7878",
  "electrical.txt": "3a0d6a490047558c947853448e1936a809822703e9b6c61f897ff310ef2cf09d",
  "electrical.pdf": "e3dae833e5f751170688ba1d9b378e0366b7c8d71336b207884d11d8ce77465c"
};

async function documents(): Promise<Record<string, SourceDocument>> {
  const md = await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8");
  return {
    "structure.docx": (await ingestDocx(await readFile(resolve(structure, "structure.docx")), opts("structure.docx"))).document,
    "structure.odt": (await ingestOdt(await readFile(resolve(structure, "structure.odt")), opts("structure.odt"))).document,
    "electrical.docx": (await ingestDocx(await electricalDocx(), opts("electrical.docx"))).document,
    "electrical.odt": (await ingestOdt(await electricalOdt(), opts("electrical.odt"))).document,
    "electrical.md": await ingestMarkdown(md, opts("electrical.md")),
    "electrical.txt": await ingestText(md, opts("electrical.txt")),
    "electrical.pdf": await ingestPdf(await readFile(resolve(fixtures, "source-electrical-safety.pdf")), opts("electrical.pdf"))
  };
}

describe("ingestion output is unchanged by source analysis", () => {
  it("every fixture's document hashes as it did at e6a0ead", async () => {
    const docs = await documents();
    const actual = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, hash(d)]));
    expect(actual).toEqual(PINNED);
  });
});
