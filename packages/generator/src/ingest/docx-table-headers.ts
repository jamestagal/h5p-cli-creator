import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type JSZip from "jszip";

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PARTS = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"] as const;
/** ST_OnOff values that switch a property off. */
const OFF = new Set(["false", "0", "off"]);

/**
 * Makes an explicit `<w:tblHeader w:val="false"/>` (or "0", "off") mean what Word means by it: not a header row.
 * mammoth 1.13 marks a row as a header whenever the element is present, whatever its value, and then puts every leading
 * header row in `thead`, so a table whose rows all say "false" would lose every data row. Such elements are removed from
 * the parts mammoth reads; rows marked on, or with no value, stay headers. Returns the rewritten parts and how many
 * elements were removed.
 */
export async function explicitTableHeaders(zip: JSZip): Promise<{ rewrittenParts: Map<string, string>; removed: number }> {
  const rewrittenParts = new Map<string, string>();
  let removed = 0;
  for (const part of PARTS) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = new DOMParser().parseFromString(await file.async("string"), "text/xml");
    const off = Array.from(xml.getElementsByTagNameNS(WNS, "tblHeader")).filter((el) => OFF.has((el.getAttributeNS(WNS, "val") ?? el.getAttribute("w:val") ?? "").toLowerCase()));
    if (off.length === 0) continue;
    for (const el of off) el.parentNode?.removeChild(el);
    removed += off.length;
    rewrittenParts.set(part, new XMLSerializer().serializeToString(xml));
  }
  return { rewrittenParts, removed };
}
