import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import type JSZip from "jszip";
import { normaliseBlockText } from "./structure/blocks.js";

/** A list whose numbering was rendered as decimal or bullet although the document uses another format (R13). */
export interface SimplifiedNumbering { listIndex: number; headingPath: string[]; originalFormats: string[] }
/**
 * A numbered paragraph whose numbering the adapter cannot render, so its label is missing from the source text:
 * a heading with numbering (mammoth renders headings without labels), or numbering that points at a list definition
 * the document does not contain.
 */
export interface UnsupportedNumbering { reason: "numbered-heading" | "missing-definition"; headingPath: string[]; text: string; numId: string; ilvl: string }
export interface NumberingResolution {
  /** Parts rewritten so that mammoth sees the effective numbering; empty when nothing needed rewriting. */
  rewrittenParts: Map<string, string>;
  simplified: SimplifiedNumbering[];
  unsupported: UnsupportedNumbering[];
}

const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const attr = (el: XmlElement, name: string): string | null => el.getAttributeNS(WNS, name) ?? el.getAttribute(`w:${name}`);
/** Direct children with a w: local name (not descendants: a paragraph can hold a text box with paragraphs of its own). */
const own = (el: XmlElement, local: string): XmlElement[] => Array.from(el.childNodes).filter((n): n is XmlElement => n.nodeType === 1 && (n as XmlElement).namespaceURI === WNS && (n as XmlElement).localName === local);
const ownFirst = (el: XmlElement, local: string): XmlElement | undefined => own(el, local)[0];
const all = (el: XmlElement, local: string): XmlElement[] => Array.from(el.getElementsByTagNameNS(WNS, local));
const valOf = (el: XmlElement | undefined, local: string): string | undefined => { const c = el ? ownFirst(el, local) : undefined; return c ? attr(c, "val") ?? undefined : undefined; };

interface NumPr { numId?: string | undefined; ilvl?: string | undefined }
const numPrOf = (pPr: XmlElement | undefined): NumPr => { const n = pPr ? ownFirst(pPr, "numPr") : undefined; return n ? { numId: valOf(n, "numId"), ilvl: valOf(n, "ilvl") } : {}; };

const PARTS = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"] as const;

/**
 * Resolves each paragraph's effective numbering as Word does — the paragraph's own w:numPr, else the numPr of its style
 * or the styles it is based on, else a list level linked to its style by w:pStyle; each w:num's level overrides applied
 * over its abstract definition, and numbering styles (w:numStyleLink) followed — and rewrites numbering.xml and the
 * content parts so that mammoth, which reads only direct numbering and ignores overrides, renders the same lists.
 * Formats other than decimal and bullet are reported as simplified; numbering that cannot be rendered is reported as
 * unsupported (R13).
 */
export async function resolveNumbering(zip: JSZip): Promise<NumberingResolution> {
  const read = async (name: string): Promise<XmlDocument | null> => { const f = zip.file(name); return f ? new DOMParser().parseFromString(await f.async("string"), "text/xml") : null; };
  const numberingXml = await read("word/numbering.xml");
  const stylesXml = await read("word/styles.xml");
  const rewrittenParts = new Map<string, string>();

  // Styles: paragraph styles (name, basedOn, numPr), the default paragraph style, and numbering styles for numStyleLink.
  interface Style { name: string; basedOn?: string | undefined; numPr: NumPr }
  const paragraphStyles = new Map<string, Style>();
  const numberingStyles = new Map<string, NumPr>();
  let defaultStyle: string | undefined;
  for (const style of stylesXml ? own(stylesXml.documentElement!, "style") : []) {
    const id = attr(style, "styleId") ?? "";
    const numPr = numPrOf(ownFirst(style, "pPr"));
    if (attr(style, "type") === "numbering") { numberingStyles.set(id, numPr); continue; }
    if (attr(style, "type") !== "paragraph") continue;
    paragraphStyles.set(id, { name: valOf(style, "name") ?? "", basedOn: valOf(style, "basedOn"), numPr });
    if (attr(style, "default") === "1" || attr(style, "default") === "true") defaultStyle = id;
  }
  const headingLevel = (styleId: string | undefined): number | null => {
    if (styleId === undefined) return null;
    const m = /^heading ([1-6])$/i.exec(paragraphStyles.get(styleId)?.name ?? "") ?? /^Heading([1-6])$/.exec(styleId);
    return m ? Number(m[1]) : null;
  };
  /** The numPr a style gives, following basedOn: numId and ilvl each from the nearest style that sets them. */
  const styleNumPr = (styleId: string | undefined): NumPr => {
    const out: NumPr = {};
    const seen = new Set<string>();
    for (let id = styleId; id !== undefined && !seen.has(id); id = paragraphStyles.get(id)?.basedOn) {
      seen.add(id);
      const n = paragraphStyles.get(id)?.numPr ?? {};
      out.numId ??= n.numId;
      out.ilvl ??= n.ilvl;
    }
    return out;
  };

  // Numbering definitions: abstract levels, following numStyleLink, with each num's level overrides on top.
  const abstracts = new Map<string, XmlElement>();
  const nums = new Map<string, XmlElement>();
  if (numberingXml) {
    for (const an of own(numberingXml.documentElement!, "abstractNum")) abstracts.set(attr(an, "abstractNumId") ?? "", an);
    for (const num of own(numberingXml.documentElement!, "num")) nums.set(attr(num, "numId") ?? "", num);
  }
  /** The abstract definition a num uses, through numbering-style links; null when it is missing or the links loop. */
  const abstractFor = (numId: string, seen = new Set<string>()): XmlElement | null => {
    if (seen.has(numId)) return null;
    seen.add(numId);
    const num = nums.get(numId);
    const an = num ? abstracts.get(valOf(num, "abstractNumId") ?? "") : undefined;
    if (!an) return null;
    const link = valOf(an, "numStyleLink");
    if (link === undefined) return an;
    const linked = numberingStyles.get(link)?.numId;
    return linked === undefined ? null : abstractFor(linked, seen);
  };
  const overridesOf = (numId: string): Map<string, XmlElement> => {
    const out = new Map<string, XmlElement>();
    const num = nums.get(numId);
    for (const o of num ? own(num, "lvlOverride") : []) { const lvl = ownFirst(o, "lvl"); if (lvl) out.set(attr(o, "ilvl") ?? attr(lvl, "ilvl") ?? "0", lvl); }
    return out;
  };
  const levelOf = (numId: string, ilvl: string): XmlElement | null => {
    const override = overridesOf(numId).get(ilvl);
    if (override) return override;
    const an = abstractFor(numId);
    return an ? own(an, "lvl").find((l) => (attr(l, "ilvl") ?? "0") === ilvl) ?? null : null;
  };
  const formatOf = (lvl: XmlElement): string => valOf(lvl, "numFmt") ?? "decimal";
  /** Style → the first num using the abstract whose level names that style (w:lvl/w:pStyle). */
  const levelLinks = new Map<string, NumPr>();
  for (const [numId] of nums) {
    const an = abstractFor(numId);
    for (const lvl of an ? own(an, "lvl") : []) {
      const s = valOf(lvl, "pStyle");
      if (s !== undefined && !levelLinks.has(s)) levelLinks.set(s, { numId, ilvl: attr(lvl, "ilvl") ?? "0" });
    }
  }

  // mammoth reads only the abstract level's format, so each num with level overrides gets its own merged abstract definition.
  if (numberingXml) {
    let nextId = Math.max(-1, ...[...abstracts.keys()].map(Number).filter(Number.isFinite)) + 1;
    const firstNum = own(numberingXml.documentElement!, "num")[0] ?? null;
    let changed = false;
    for (const [numId, num] of nums) {
      const overrides = overridesOf(numId);
      const base = abstractFor(numId);
      if (overrides.size === 0 || !base) continue;
      const merged = base.cloneNode(true) as XmlElement;
      merged.setAttributeNS(WNS, "w:abstractNumId", String(nextId));
      for (const link of [...own(merged, "numStyleLink"), ...own(merged, "styleLink")]) merged.removeChild(link);
      for (const [ilvl, lvl] of overrides) {
        const copy = lvl.cloneNode(true) as XmlElement;
        copy.setAttributeNS(WNS, "w:ilvl", ilvl);
        const existing = own(merged, "lvl").find((l) => (attr(l, "ilvl") ?? "0") === ilvl);
        if (existing) merged.replaceChild(copy, existing); else merged.appendChild(copy);
      }
      numberingXml.documentElement!.insertBefore(merged, firstNum);
      abstracts.set(String(nextId), merged); // the lookups below must see what the rewritten XML says: this num now uses `merged`
      ownFirst(num, "abstractNumId")!.setAttributeNS(WNS, "w:val", String(nextId));
      nextId++;
      changed = true;
    }
    if (changed) rewrittenParts.set("word/numbering.xml", new XMLSerializer().serializeToString(numberingXml));
  }

  // Paragraphs: the effective numbering of each, written back as a complete w:numPr where it was inherited.
  const lists = new Map<string, { headingPath: string[]; formats: string[] }>();
  const unsupported: UnsupportedNumbering[] = [];
  for (const part of PARTS) {
    const xml = await read(part);
    if (!xml) continue;
    const headings: Array<{ level: number; text: string }> = [];
    let changed = false;
    for (const p of all(xml.documentElement!, "p")) {
      const pPr = ownFirst(p, "pPr");
      const styleId = valOf(pPr, "pStyle") ?? defaultStyle;
      const direct = numPrOf(pPr);
      const fromStyle = styleNumPr(styleId);
      const link = styleId !== undefined ? levelLinks.get(styleId) : undefined;
      const numId = direct.numId ?? fromStyle.numId ?? link?.numId;
      const ilvl = direct.ilvl ?? (direct.numId === undefined && fromStyle.numId === undefined ? link?.ilvl : undefined) ?? fromStyle.ilvl ?? "0";
      const text = (): string => normaliseBlockText(all(p, "t").map((t) => t.textContent ?? "").join(""));
      const level = headingLevel(styleId);
      if (level !== null) {
        const t = text();
        if (t !== "") { while (headings.length > 0 && headings.at(-1)!.level >= level) headings.pop(); headings.push({ level, text: t }); }
      }
      if (numId === undefined || numId === "0") continue;
      const path = headings.filter((h) => level === null || h.level < level).map((h) => h.text);
      if (level !== null) { unsupported.push({ reason: "numbered-heading", headingPath: path, text: text(), numId, ilvl }); continue; }
      const lvl = levelOf(numId, ilvl);
      if (!lvl) { unsupported.push({ reason: "missing-definition", headingPath: path, text: text(), numId, ilvl }); continue; }
      if (direct.numId !== numId || direct.ilvl !== ilvl) {
        const props = pPr ?? (p.insertBefore(xml.createElementNS(WNS, "w:pPr"), p.firstChild) as XmlElement);
        const old = ownFirst(props, "numPr");
        const numPr = xml.createElementNS(WNS, "w:numPr");
        for (const [name, value] of [["ilvl", ilvl], ["numId", numId]] as const) { const e = xml.createElementNS(WNS, `w:${name}`); e.setAttributeNS(WNS, "w:val", value); numPr.appendChild(e); }
        if (old) props.replaceChild(numPr, old); else props.appendChild(numPr);
        changed = true;
      }
      const list = lists.get(numId) ?? { headingPath: path, formats: [] };
      const fmt = formatOf(lvl);
      if (!list.formats.includes(fmt)) list.formats.push(fmt);
      lists.set(numId, list);
    }
    if (changed) rewrittenParts.set(part, new XMLSerializer().serializeToString(xml));
  }

  const simplified = [...lists.values()]
    .map((l, i) => ({ listIndex: i + 1, headingPath: l.headingPath, originalFormats: l.formats.filter((f) => f !== "decimal" && f !== "bullet") }))
    .filter((l) => l.originalFormats.length > 0);
  return { rewrittenParts, simplified, unsupported };
}
