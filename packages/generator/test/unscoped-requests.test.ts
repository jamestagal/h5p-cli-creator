import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkSentences, extractionRequest } from "../src/concepts/index.js";
import { ingestSource } from "../src/ingest/index.js";
import { requestKey } from "../src/llm/replay-provider.js";
import { electricalDocx, electricalOdt } from "./helpers/structured-sources.js";
import { fixtures, SYNTHETIC_CHUNK_TOKENS } from "./helpers/synthetic.js";

const structure = resolve(import.meta.dirname, "fixtures/structure");

/**
 * Whole-document extraction requests (every chunk, by requestKey) for the structured and plain fixtures, pinned at
 * 481c2d7, before scoped rendering existed. A run without a generation scope must send exactly these requests: the
 * scoped layout only ever applies to scoped chunks.
 */
const PINNED: Record<string, string[]> = {
  "structure.docx@6000": ["f41ac223cb6c7582d6c21b809f359ff665568454c39c4b34b1df8262eeff4ed8"],
  "structure.docx@330": ["98ad3cbbc7ee77aff391c3fd34f1e2f08bbb5ec4f98003b3b6880e80d47c0e2c", "648cada2c9a49fb16f4cd29c53cda505e45357aad33ab1cbb4048fd2abbd2419"],
  "structure.odt@6000": ["3cd58928606d1972d10eca93d1e317d02fb202809ac04fe9d46155ec50b47c4b"],
  "structure.odt@330": ["62bbed112a5ab2caf56cff97e65b90c6ae39ca17deb300267b140db63f0c0a40", "648cada2c9a49fb16f4cd29c53cda505e45357aad33ab1cbb4048fd2abbd2419"],
  "electrical.docx@6000": ["3182bed2c76b83c2a3b279492e317857aa6bf07a913a2c7f0a5a7c8b71bb0bee"],
  "electrical.docx@330": ["3ac1fa702052b36f41f7905caa49e34d03ecb5315b50e9e2304c9574530ea30f", "0b09d9da296e347eea200f8ad87b34312dd52697415cecbb733774f33df93e79", "4975b4ed083dc1377239180de0b7feb024c0c4e44731a1ad22e373b8d846bdbc", "bb5215aa908e31c9a5cb9e33cadc288d98252529c2d7899f08aaab70f292263c", "69a5e30d324f8fcf832de8df1f23f104279ae4dcb3133ce6ca728025431e4bec"],
  "electrical.odt@6000": ["3182bed2c76b83c2a3b279492e317857aa6bf07a913a2c7f0a5a7c8b71bb0bee"],
  "electrical.odt@330": ["3ac1fa702052b36f41f7905caa49e34d03ecb5315b50e9e2304c9574530ea30f", "0b09d9da296e347eea200f8ad87b34312dd52697415cecbb733774f33df93e79", "4975b4ed083dc1377239180de0b7feb024c0c4e44731a1ad22e373b8d846bdbc", "bb5215aa908e31c9a5cb9e33cadc288d98252529c2d7899f08aaab70f292263c", "69a5e30d324f8fcf832de8df1f23f104279ae4dcb3133ce6ca728025431e4bec"],
  "electrical.md@6000": ["10e22d69cbc33c6ccf717ae04f64a4297a8e112308da16dc0a3078d77f9ade9d"],
  "electrical.md@330": ["cf0740ab6918ae5a422f09444a759cf1a620df19fb113c6e189772d693a71c3a", "8101b4588f63e2f57844a624523b67d551c7a09dbbe037c8c768cb986b3c27c7", "0e7385558785af062751c415167ab765cb2e3c64822b2156794c6bffe8314be3", "b90902a4fe769ee1ba7e8d712fe6312194c4a3d66997cc3d3bbd52067f81f627"],
  "electrical.pdf@6000": ["1e99d1bad2b79f7e86230f718678a8b72126e4f4ad819497d0ed00fd4442fb2b"],
  "electrical.pdf@330": ["fcd337f6db755236486188cf12be6b713002aa1baaeda15471e8a8abb46d4f47", "34427625a8287d7865a9bfd33b3d3c0f454706d783cd3546c07e0a4478d19346", "b6b5e5bc69dfbcac6ef28bc463d5e0cb181dd36b4d1364f06a74c0c1fb02a40e", "e9c1a6f1654a70cdc4b85d0ad78ed323ac161bc667c1f8a1dd0c38a25f77c636", "3b70c59dd3c94d8d63341eeb20f4ac00621d08e948ededa2ff91fc71b6129f1d"]
};

async function sources(): Promise<Record<string, Awaited<ReturnType<typeof ingestSource>>>> {
  return {
    "structure.docx": await ingestSource(await readFile(resolve(structure, "structure.docx")), "structure.docx"),
    "structure.odt": await ingestSource(await readFile(resolve(structure, "structure.odt")), "structure.odt"),
    "electrical.docx": await ingestSource(await electricalDocx(), "electrical.docx"),
    "electrical.odt": await ingestSource(await electricalOdt(), "electrical.odt"),
    "electrical.md": await ingestSource(await readFile(resolve(fixtures, "source-electrical-safety.md")), "electrical.md"),
    "electrical.pdf": await ingestSource(await readFile(resolve(fixtures, "source-electrical-safety.pdf")), "electrical.pdf")
  };
}

describe("whole-document extraction requests are unchanged by scoped rendering", () => {
  it("every chunk's request, at the default and the synthetic chunk size, keys as it did at 481c2d7", async () => {
    const actual: Record<string, string[]> = {};
    for (const [name, s] of Object.entries(await sources())) {
      for (const tokens of [6000, SYNTHETIC_CHUNK_TOKENS]) actual[`${name}@${tokens}`] = chunkSentences(s.document.sentences, tokens).map((c) => requestKey(extractionRequest(c, {})));
    }
    expect(actual).toEqual(PINNED);
  });
});
