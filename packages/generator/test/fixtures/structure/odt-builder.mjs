// The synthetic ODT fixture for the ODT adapter (Task 7), as parts that tests can vary. make-odt.mjs writes structure.odt
// from structureOdtParts(); odt.test.ts regenerates it to check the committed bytes, and builds variants.
// The content mirrors docx-builder.mjs structure for structure, so the two linearized goldens can be compared: H1 › H2
// headings, a nested numbered list, an a)/b) list (kept as a) and b) here, from its list style in styles.xml) and a later
// "item b) above" reference, a key/value table with no header rows, a table with header rows, a horizontal and a vertical
// merge (covered cells) and a list inside a cell, a nested table, a footnote with a nested list, an endnote with a
// numbered list and a table, a note cited inside a table cell, a tracked insertion and deletion, NFD Vietnamese before and
// inside a table, padded text, and empty paragraphs at both ends. ODT-only: a run of three spaces (text:s text:c="3")
// inside a sentence, and an annotation whose text must not appear.
import JSZip from "jszip";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  svg: "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  dc: "http://purl.org/dc/elements/1.1/"
};
export const XMLNS = Object.entries(NS).map(([k, v]) => `xmlns:${k}="${v}"`).join(" ");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Text with every run of spaces written as text:s, as ODF requires for spaces that must survive. */
export const t = (s) => esc(s).replace(/ {2,}|^ | $/g, (m) => `<text:s text:c="${m.length}"/>`);
export const p = (content = "") => `<text:p>${content}</text:p>`;
export const para = (s) => p(t(s));
export const h = (level, s) => `<text:h text:outline-level="${level}">${t(s)}</text:h>`;
/** A list; `items` are strings (one paragraph) or [string, nestedList]. */
export const list = (style, items, attrs = "") => `<text:list${style ? ` text:style-name="${style}"` : ""}${attrs}>${items.map((i) => (Array.isArray(i) ? `<text:list-item>${para(i[0])}${i[1]}</text:list-item>` : `<text:list-item>${para(i)}</text:list-item>`)).join("")}</text:list>`;
export const cell = (content, attrs = "") => `<table:table-cell office:value-type="string"${attrs}>${content}</table:table-cell>`;
export const covered = `<table:covered-table-cell/>`;
export const row = (cells) => `<table:table-row>${cells.join("")}</table:table-row>`;
export const table = (name, cols, rows, headerRows = []) => `<table:table table:name="${name}"><table:table-column table:number-columns-repeated="${cols}"/>${headerRows.length > 0 ? `<table:table-header-rows>${headerRows.join("")}</table:table-header-rows>` : ""}${rows.join("")}</table:table>`;
export const note = (id, cls, citation, body) => `<text:note text:id="${id}" text:note-class="${cls}"><text:note-citation>${citation}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`;
const nfd = (s) => s.normalize("NFD");
const changeInfo = `<office:change-info><dc:creator>Reviewer</dc:creator><dc:date>2026-09-30T00:00:00</dc:date></office:change-info>`;

export const BODY = [
  `<text:tracked-changes><text:changed-region text:id="ct1"><text:insertion>${changeInfo}</text:insertion></text:changed-region><text:changed-region text:id="ct2"><text:deletion>${changeInfo}${para("twenty")}</text:deletion></text:changed-region></text:tracked-changes>`,
  p(),
  para("   "),
  h(1, "Audit fundamentals"),
  h(2, "Planning the audit"),
  p(`${t("   The auditor plans the engagement")}<office:annotation><dc:creator>Reviewer</dc:creator><dc:date>2026-09-30T00:00:00</dc:date>${para("Check this sentence with the engagement partner.")}</office:annotation><text:s text:c="3"/>${t("before fieldwork begins, and records the plan in the audit file.   ")}`),
  p(`${t("Evidence must be sufficient and appropriate for the opinion given.")}${note("ftn1", "footnote", "1", `${para("As defined in the synthetic auditing standard used for these tests, which requires:")}${list("Bullets", [["a written plan", list(null, ["approved by the engagement partner"])], "a record of the evidence"])}${para("Other standards may differ.")}`)}${t(" It is gathered throughout the engagement.")}`),
  p(`${t("The sample size is ")}<text:change-start text:change-id="ct1"/>forty<text:change-end text:change-id="ct1"/><text:change text:change-id="ct2"/>${t(" items for each branch.")}`),
  list("Numbered", [["Agree the scope with management", list(null, ["Confirm the branches in scope", "Confirm the reporting period"])], "Collect the evidence"]),
  para("The procedures below are performed in order."),
  list("Lettered", ["Inspect the records", "Reperform the key controls"]),
  para("The reperformance described in item b) above is required for every branch."),
  h(2, "Recording results"),
  para(nfd("Kiểm toán viên phải ghi chép đầy đủ bằng chứng kiểm toán.")),
  table("Table1", 2, [
    row([cell(para("Audit scope")), cell(para("All branches"))]),
    row([cell(para("Period")), cell(p(`${t("  FY2026  ")}${note("ftn2", "footnote", "2", `${para("The period runs from 1 July to 30 June.")}${list("Bullets", ["Interim work in March"])}`)}`))])
  ]),
  table("Table2", 3, [
    row([cell(para("Missing records"), ' table:number-rows-spanned="2"'), cell(para("Medium")), cell(`${para("Controls:")}${list("Bullets", ["Monthly check", "Manager sign-off"])}`)]),
    row([covered, cell(para("Low"), ' table:number-columns-spanned="2"'), covered]),
    row([cell(para(nfd("  Rủi ro gian lận  "))), cell(para("High")), cell(`${para("Owners:")}${table("Table3", 2, [row([cell(para("Review")), cell(para("Finance manager"))])], [row([cell(para("Control")), cell(para("Owner"))])])}`)])
  ], [row([cell(para("Risk")), cell(para("Likelihood")), cell(para("Impact"))])]),
  p(`${t("Results are reported to the audit committee within ten business days of the end of fieldwork.")}${note("edn1", "endnote", "i", `${para("The committee's timetable is set out below.")}${list("Numbered", ["Draft report", "Final report"])}${table("Table4", 2, [row([cell(para("Draft")), cell(para("5"))])], [row([cell(para("Stage")), cell(para("Days"))])])}`)}`),
  p(),
  para("  ")
];

const numberLevel = (level, format, suffix) => `<text:list-level-style-number text:level="${level}" style:num-format="${format}" style:num-suffix="${suffix}"/>`;
const bulletLevel = (level, char) => `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${char}"/>`;
export const AUTOMATIC_STYLES = [
  `<text:list-style style:name="Numbered">${numberLevel(1, "1", ".")}${numberLevel(2, "1", ".")}</text:list-style>`,
  `<text:list-style style:name="Bullets">${bulletLevel(1, "•")}${bulletLevel(2, "◦")}</text:list-style>`
];
/** The a)/b) list's style lives in styles.xml, so the adapter must read both places. The outline style numbers no heading. */
export const STYLES = [
  `<text:list-style style:name="Lettered">${numberLevel(1, "a", ")")}</text:list-style>`,
  `<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-format=""/><text:outline-level-style text:level="2" style:num-format=""/></text:outline-style>`
];

/** The ODT parts as strings; pass replacements for any of the pieces above to build a variant. */
export function structureOdtParts({ body = BODY, automaticStyles = AUTOMATIC_STYLES, styles = STYLES } = {}) {
  return {
    mimetype: "application/vnd.oasis.opendocument.text",
    "META-INF/manifest.xml": `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`,
    "content.xml": `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${XMLNS} office:version="1.3"><office:automatic-styles>${automaticStyles.join("")}</office:automatic-styles><office:body><office:text>${body.join("")}</office:text></office:body></office:document-content>`,
    "styles.xml": `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${XMLNS} office:version="1.3"><office:styles>${styles.join("")}</office:styles></office:document-styles>`
  };
}

/** Zips the parts: mimetype first and stored uncompressed (ODF packaging), fixed dates, no implicit folder entries. */
export async function zipOdt(parts) {
  const zip = new JSZip();
  const date = new Date("2026-09-30T00:00:00Z");
  for (const [name, content] of Object.entries(parts)) zip.file(name, content, { date, createFolders: false, ...(name === "mimetype" ? { compression: "STORE" } : {}) });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
