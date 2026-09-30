import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as D from "../fixtures/structure/docx-builder.mjs";
import * as O from "../fixtures/structure/odt-builder.mjs";
import { fixtures } from "./synthetic.js";

/**
 * The synthetic electrical-safety text as a DOCX and an ODT, so the structured paths can run the whole pipeline on the
 * fake provider with the same evidence passages as the markdown and PDF fixtures. Headings become Heading 1/2; every
 * paragraph is kept word for word; section 6 gains a bulleted list and a two-column table with a marked header row,
 * whose sentences are not evidence for any fixture concept.
 */
const PPE_LIST = ["Gloves are rated for the working voltage.", "Face shields are worn where an arc flash is possible."];
const PPE_TABLE = [["Item", "Check before use"], ["Insulated gloves", "Roll to trap air and look for pinholes."], ["Safety glasses", "Look for cracks in the lenses."]];

async function sections(): Promise<Array<{ level: 1 | 2; text: string } | { para: string }>> {
  const md = await readFile(resolve(fixtures, "source-electrical-safety.md"), "utf8");
  return md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const h = /^(#{1,2}) (.*)$/.exec(b);
    return h ? { level: h[1]!.length as 1 | 2, text: h[2]! } : { para: b.replace(/\s*\n\s*/g, " ") };
  });
}

/** `extraParts` adds files to the package without changing its text (for tests of changed originals). */
export async function electricalDocx(extraParts: Record<string, string> = {}): Promise<Buffer> {
  const body = (await sections()).map((s) => ("para" in s ? D.para(s.para) : D.heading(s.level, s.text)));
  body.push(...PPE_LIST.map((t) => D.item(3, 0, t)), D.tbl(PPE_TABLE.map((cells, i) => D.tr(cells.map((c) => D.tc(D.para(c))), i === 0)), 2));
  return D.zipDocx({ ...D.structureParts({ body }), ...extraParts });
}

export async function electricalOdt(): Promise<Buffer> {
  const body = (await sections()).map((s) => ("para" in s ? O.para(s.para) : O.h(s.level, s.text)));
  body.push(O.list("Bullets", PPE_LIST), O.table("PPE", 2, PPE_TABLE.slice(1).map((cells) => O.row(cells.map((c) => O.cell(O.para(c))))), [O.row(PPE_TABLE[0]!.map((c) => O.cell(O.para(c))))]));
  return O.zipOdt(O.structureOdtParts({ body }));
}
