// Generates structure.docx, the synthetic DOCX fixture for the DOCX adapter (Task 6). Run from packages/generator:
//   node test/fixtures/structure/make-docx.mjs
// The content is invented for tests. Every structure the adapter must preserve is here: H1 › H2 headings, a nested
// numbered list, an a)/b) list and a later "item b) above" reference, a key/value table with no header row, a table
// with a marked header row, a horizontal and a vertical merge and a list inside a cell, a nested table, a footnote, a
// tracked insertion and deletion, NFD Vietnamese before and inside a table, padded text, and empty paragraphs at both ends.
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import JSZip from "jszip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (text) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const p = (content, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
const para = (text) => p(run(text));
const heading = (level, text) => p(run(text), `<w:pStyle w:val="Heading${level}"/>`);
const item = (numId, ilvl, text) => p(run(text), `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
const tc = (content, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${content}</w:tc>`;
const tr = (cells, header = false) => `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.join("")}</w:tr>`;
const tbl = (rows, cols) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2000"/>'.repeat(cols)}</w:tblGrid>${rows.join("")}</w:tbl>`;
const nfd = (s) => s.normalize("NFD");

const body = [
  p(""),
  para("   "),
  heading(1, "Audit fundamentals"),
  heading(2, "Planning the audit"),
  para("   The auditor plans the engagement before fieldwork begins, and records the plan in the audit file.   "),
  p(`${run("Evidence must be sufficient and appropriate for the opinion given.")}<w:r><w:footnoteReference w:id="1"/></w:r>${run(" It is gathered throughout the engagement.")}`),
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
    tr([tc(para("Period")), tc(para("  FY2026  "))])
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
  para("Results are reported to the audit committee within ten business days of the end of fieldwork."),
  p(""),
  para("  ")
].join("");

const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>`,
  "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`,
  "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style></w:styles>`,
  "word/numbering.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>`
    + `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/></w:lvl></w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>`
    + `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num></w:numbering>`,
  "word/footnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1">${para("As defined in the synthetic auditing standard used for these tests.")}</w:footnote></w:footnotes>`
};

const zip = new JSZip();
for (const [name, content] of Object.entries(files)) zip.file(name, content, { date: new Date("2026-09-30T00:00:00Z"), createFolders: false }); // implicit folder entries would carry the current time
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
await writeFile(new URL("./structure.docx", import.meta.url), bytes);
