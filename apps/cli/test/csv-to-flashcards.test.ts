import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { csvToFlashcardsSpec } from "../src/csv-to-flashcards.js";
import { localImageResolver } from "../src/image-resolver.js";

const fixtures = resolve(import.meta.dirname, "fixtures");

describe("csvToFlashcardsSpec", () => {
  it("maps question/answer/tip/image columns, assigns card ids and resolves local images to assets", async () => {
    const csv = readFileSync(resolve(fixtures, "flash-local.csv"), "utf8");
    const { spec, assets } = await csvToFlashcardsSpec(csv, { id: "flash", title: "Tools", language: "en", baseDir: fixtures, resolveImage: localImageResolver });
    expect(spec.cards.map((c) => c.id)).toEqual(["card-1", "card-2"]);
    expect(spec.cards[0]).toMatchObject({ front: "Used to tighten hex nuts", back: "Spanner", tip: "Not a wrench" });
    expect(spec.cards[0]?.imageAssetId).toBe("img-1");
    expect(assets.get("img-1")?.mimeType).toBe("image/jpeg");
    expect(spec.cards[1]?.imageAssetId).toBeUndefined();
  });
  it("rejects a URL with the local resolver, naming the row", async () => {
    const csv = "question;answer;tip;image\nq;a;;https://example.com/x.jpg\n";
    await expect(csvToFlashcardsSpec(csv, { id: "f", title: "T", language: "en", baseDir: fixtures, resolveImage: localImageResolver })).rejects.toThrow(/row 1.*URL/);
  });
});
