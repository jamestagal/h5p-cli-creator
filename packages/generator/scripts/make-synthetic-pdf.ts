/**
 * Generates the committed PDF fixture from the markdown fixture.
 * Run once; the output is committed, not regenerated at test time.
 *
 * Node 20 has no `--experimental-strip-types` support for this file's syntax in this
 * toolchain, so it is compiled first:
 *   pnpm --filter @leaplearn/generator exec tsc -p tsconfig.scripts.json
 *   node scripts/dist/make-synthetic-pdf.js
 *
 * `tsconfig.scripts.json` sets `rootDir: "scripts"`, so the compiled file lands at
 * `scripts/dist/make-synthetic-pdf.js` — one directory deeper than this source file's
 * `scripts/`. The fixture path below therefore climbs two levels, not one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const dir = resolve(import.meta.dirname, "../../test/fixtures/synthetic");
const md = await readFile(resolve(dir, "source-electrical-safety.md"), "utf8");
const paragraphs = md.split(/\n{2,}/).map((p) => p.replace(/^#+\s*/, "").replace(/\n/g, " ").trim()).filter(Boolean);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const size = 11; const lineHeight = 14; const margin = 56; const width = 595; const height = 842;
let page = doc.addPage([width, height]); let y = height - margin;
const wrap = (text: string): string[] => {
  const words = text.split(" "); const lines: string[] = []; let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > width - 2 * margin) { lines.push(line); line = w; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
};
for (const p of paragraphs) {
  for (const line of wrap(p)) {
    if (y < margin) { page = doc.addPage([width, height]); y = height - margin; }
    page.drawText(line, { x: margin, y, size, font }); y -= lineHeight;
  }
  y -= lineHeight;
}
await writeFile(resolve(dir, "source-electrical-safety.pdf"), await doc.save());
process.stdout.write(`wrote ${doc.getPageCount()} page(s)\n`);
