import Papa from "papaparse";
import { FlashcardsSpec, type AssetEntry, type AssetManifest } from "@leaplearn/shared";
import type { ImageResolver } from "./image-resolver.js";

interface Row { question?: string; answer?: string; tip?: string; image?: string; }

export async function csvToFlashcardsSpec(csvText: string, opts: { id: string; title: string; language: string; baseDir: string; resolveImage: ImageResolver }): Promise<{ spec: FlashcardsSpec; assets: AssetManifest }> {
  const parsed = Papa.parse<Row>(csvText.trim(), { header: true, skipEmptyLines: true, delimiter: "" });
  const assets = new Map<string, AssetEntry>();
  const cards: Record<string, unknown>[] = [];
  for (const [i, row] of parsed.data.entries()) {
    const rowNumber = i + 1;
    if (!row.question || !row.answer) throw new Error(`row ${rowNumber}: question and answer are required`);
    const card: Record<string, unknown> = { id: `card-${rowNumber}`, front: row.question, back: row.answer };
    if (row.tip) card["tip"] = row.tip;
    if (row.image) {
      let resolved: AssetEntry;
      try { resolved = await opts.resolveImage(row.image, opts.baseDir); }
      catch (err) { throw new Error(`row ${rowNumber}: ${err instanceof Error ? err.message : String(err)}`); }
      const assetId = `img-${rowNumber}`;
      assets.set(assetId, { ...resolved, assetId });
      card["imageAssetId"] = assetId;
      card["imageAlt"] = row.question;
    }
    cards.push(card);
  }
  return { spec: FlashcardsSpec.parse({ id: opts.id, title: opts.title, language: opts.language, type: "flashcards", cards }), assets };
}
