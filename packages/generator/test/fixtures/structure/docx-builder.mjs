// The synthetic DOCX fixture for the DOCX adapter (Task 6), as parts that tests can vary. make-docx.mjs writes
// structure.docx from structureParts(); docx.test.ts regenerates it to check the committed bytes, and builds variants.
// The content is invented for tests. Every structure the adapter must preserve is here: H1 › H2 headings, a nested
// numbered list, an a)/b) list and a later "item b) above" reference, a key/value table with no header row, a table
// with a marked header row, a horizontal and a vertical merge and a list inside a cell, a nested table, a footnote with a
// nested list, an endnote with a numbered list and a table, a note cited inside a table cell, a tracked insertion and
// deletion, NFD Vietnamese before and inside a table, padded text, and empty paragraphs at both ends.
import JSZip from "jszip";

export const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const run = (text) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
export const p = (content, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
export const para = (text) => p(run(text));
export const heading = (level, text) => p(run(text), `<w:pStyle w:val="Heading${level}"/>`);
export const item = (numId, ilvl, text) => p(run(text), `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
export const tc = (content, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${content}</w:tc>`;
export const tr = (cells, header = false) => `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.join("")}</w:tr>`;
export const tbl = (rows, cols) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2000"/>'.repeat(cols)}</w:tblGrid>${rows.join("")}</w:tbl>`;
export const footnoteRef = (id) => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;
export const endnoteRef = (id) => `<w:r><w:endnoteReference w:id="${id}"/></w:r>`;
const nfd = (s) => s.normalize("NFD");

export const BODY = [
  p(""),
  para("   "),
  heading(1, "Audit fundamentals"),
  heading(2, "Planning the audit"),
  para("   The auditor plans the engagement before fieldwork begins, and records the plan in the audit file.   "),
  p(`${run("Evidence must be sufficient and appropriate for the opinion given.")}${footnoteRef(1)}${run(" It is gathered throughout the engagement.")}`),
  p(`${run("The sample size is ")}<w:ins w:id="10" w:author="Reviewer" w:date="2026-09-30T00:00:00Z">${run("forty")}</w:ins><w:del w:id="11" w:author="Reviewer" w:date="2026-09-30T00:00:00Z"><w:r><w:delText>twenty</w:delText></w:r></w:del>${run(" items for each branch.")}`),
  item(1, 0, "Agree the scope with management"),
  item(1, 1, "Confirm the branches in scope"),
  item(1, 1, "Confirm the reporting period"),
  item(1, 0, "Collect the evidence"),
  para("The procedures below are performed in order."),
  item(2, 0, "Inspect the records"),
  item(2, 0, "Reperform the key controls"),
  para("The reperformance described in item b) above is required for every branch."),
  heading(2, "Recording results"),
  para(nfd("Kiểm toán viên phải ghi chép đầy đủ bằng chứng kiểm toán.")),
  tbl([
    tr([tc(para("Audit scope")), tc(para("All branches"))]),
    tr([tc(para("Period")), tc(p(`${run("  FY2026  ")}${footnoteRef(2)}`))])
  ], 2),
  tbl([
    tr([tc(para("Risk")), tc(para("Likelihood")), tc(para("Impact"))], true),
    tr([tc(para("Missing records"), '<w:vMerge w:val="restart"/>'), tc(para("Medium")), tc(`${para("Controls:")}${item(3, 0, "Monthly check")}${item(3, 0, "Manager sign-off")}`)]),
    tr([tc(p(""), "<w:vMerge/>"), tc(para("Low"), '<w:gridSpan w:val="2"/>')]),
    tr([tc(para(nfd("  Rủi ro gian lận  "))), tc(para("High")), tc(`${para("Owners:")}${tbl([
      tr([tc(para("Control")), tc(para("Owner"))], true),
      tr([tc(para("Review")), tc(para("Finance manager"))])
    ], 2)}`)])
  ], 3),
  p(`${run("Results are reported to the audit committee within ten business days of the end of fieldwork.")}${endnoteRef(1)}`),
  p(""),
  para("  ")
];

const ABSTRACT_DECIMAL = `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/></w:lvl></w:abstractNum>`;
const ABSTRACT_LETTER = `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum>`;
const ABSTRACT_BULLET = `<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/></w:lvl></w:abstractNum>`;
export const ABSTRACT_NUMS = [ABSTRACT_DECIMAL, ABSTRACT_LETTER, ABSTRACT_BULLET];
export const NUMS = [
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`,
  `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`,
  `<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>`,
  `<w:num w:numId="4"><w:abstractNumId w:val="2"/></w:num>`,
  `<w:num w:numId="5"><w:abstractNumId w:val="0"/></w:num>`
];
export const STYLES = [
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`,
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>`,
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>`
];
export const FOOTNOTES = [
  `<w:footnote w:id="1">${para("As defined in the synthetic auditing standard used for these tests, which requires:")}${item(4, 0, "a written plan")}${item(4, 1, "approved by the engagement partner")}${item(4, 0, "a record of the evidence")}${para("Other standards may differ.")}</w:footnote>`,
  `<w:footnote w:id="2">${para("The period runs from 1 July to 30 June.")}${item(4, 0, "Interim work in March")}</w:footnote>`
];
export const ENDNOTES = [
  `<w:endnote w:id="1">${para("The committee's timetable is set out below.")}${item(5, 0, "Draft report")}${item(5, 0, "Final report")}${tbl([
    tr([tc(para("Stage")), tc(para("Days"))], true),
    tr([tc(para("Draft")), tc(para("5"))])
  ], 2)}</w:endnote>`
];

/** The DOCX parts as strings, built from the pieces above; pass replacements for any of them to build a variant. */
export function structureParts({ body = BODY, abstractNums = ABSTRACT_NUMS, nums = NUMS, styles = STYLES, footnotes = FOOTNOTES, endnotes = ENDNOTES } = {}) {
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const override = (part, type) => `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${override("document", "document.main")}${override("styles", "styles")}${override("numbering", "numbering")}${override("footnotes", "footnotes")}${override("endnotes", "endnotes")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "styles", "styles.xml")}${rel("rId2", "numbering", "numbering.xml")}${rel("rId3", "footnotes", "footnotes.xml")}${rel("rId4", "endnotes", "endnotes.xml")}</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join("")}<w:sectPr/></w:body></w:document>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>${styles.join("")}</w:styles>`,
    "word/numbering.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>${abstractNums.join("")}${nums.join("")}</w:numbering>`,
    "word/footnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${footnotes.join("")}</w:footnotes>`,
    "word/endnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes ${W}><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>${endnotes.join("")}</w:endnotes>`
  };
}

/** Zips the parts with fixed dates and no implicit folder entries (which would carry the current time), so the bytes are reproducible. */
export async function zipDocx(parts) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content, { date: new Date("2026-09-30T00:00:00Z"), createFolders: false });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
