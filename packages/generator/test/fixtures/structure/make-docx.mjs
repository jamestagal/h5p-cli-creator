// Writes structure.docx, the synthetic DOCX fixture for the DOCX adapter (Task 6), from docx-builder.mjs. Run from packages/generator:
//   node test/fixtures/structure/make-docx.mjs
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { structureParts, zipDocx } from "./docx-builder.mjs";

await writeFile(new URL("./structure.docx", import.meta.url), await zipDocx(structureParts()));
