// Writes structure.odt, the synthetic ODT fixture for the ODT adapter (Task 7), from odt-builder.mjs. Run from packages/generator:
//   node test/fixtures/structure/make-odt.mjs
import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { structureOdtParts, zipOdt } from "./odt-builder.mjs";

await writeFile(new URL("./structure.odt", import.meta.url), await zipOdt(structureOdtParts()));
