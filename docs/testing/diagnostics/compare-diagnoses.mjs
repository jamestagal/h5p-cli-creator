#!/usr/bin/env node
// Compares two diagnosis.json files written by diagnose-package.mjs, entry by entry and field by field.
//   node docs/testing/diagnostics/compare-diagnoses.mjs <a/diagnosis.json> <b/diagnosis.json>
// It reports facts only: which fields differ, in which entries. It does not say why they differ.
import { readFileSync } from "node:fs";

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) { console.error("usage: compare-diagnoses.mjs <a/diagnosis.json> <b/diagnosis.json>"); process.exit(2); }
const a = JSON.parse(readFileSync(aPath, "utf8"));
const b = JSON.parse(readFileSync(bPath, "utf8"));

const out = [];
out.push(`A: ${JSON.stringify(a.runtime)} ${a.source.gitHead ?? a.source.examinedFile}`);
out.push(`B: ${JSON.stringify(b.runtime)} ${b.source.gitHead ?? b.source.examinedFile}`);
out.push(`package sha256: ${a.package.sha256 === b.package.sha256 ? "same" : "DIFFERENT"} (${a.package.sha256.slice(0, 12)} / ${b.package.sha256.slice(0, 12)}); bytes ${a.package.bytes} / ${b.package.bytes}`);
out.push(`content sha256: ${a.content.sha256 === b.content.sha256 ? "same" : "DIFFERENT"} (${a.content.sha256.slice(0, 12)} / ${b.content.sha256.slice(0, 12)})`);
for (const k of Object.keys(a.archive)) if (a.archive[k] !== b.archive[k]) out.push(`archive.${k}: ${a.archive[k]} / ${b.archive[k]}`);

const byName = (d) => new Map(d.entries.map((e) => [e.name, e]));
const A = byName(a); const B = byName(b);
const onlyA = [...A.keys()].filter((n) => !B.has(n)); const onlyB = [...B.keys()].filter((n) => !A.has(n));
if (onlyA.length || onlyB.length) out.push(`entries only in A: ${onlyA.length}; only in B: ${onlyB.length}`);
const orderSame = a.entries.map((e) => e.name).join("\n") === b.entries.map((e) => e.name).join("\n");
out.push(`entry order: ${orderSame ? "same" : "DIFFERENT"}`);

const fieldCounts = new Map(); const examples = new Map();
const note = (field, name, va, vb) => { fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1); if (!examples.has(field)) examples.set(field, `${name}: ${va} / ${vb}`); };
for (const [name, ea] of A) {
  const eb = B.get(name); if (!eb) continue;
  for (const f of ["uncompressedSha256", "crc32Computed", "compressedSha256"]) if (ea[f] !== eb[f]) note(f, name, ea[f], eb[f]);
  for (const part of ["central", "local"]) for (const f of Object.keys(ea[part])) if (ea[part][f] !== eb[part][f]) note(`${part}.${f}`, name, ea[part][f], eb[part][f]);
  if (JSON.stringify(ea.dataDescriptor) !== JSON.stringify(eb.dataDescriptor)) note("dataDescriptor", name, JSON.stringify(ea.dataDescriptor), JSON.stringify(eb.dataDescriptor));
}
const shared = [...A.keys()].filter((n) => B.has(n)).length;
if (fieldCounts.size === 0) out.push(`all ${shared} shared entries identical in every recorded field`);
for (const [field, count] of [...fieldCounts].sort()) out.push(`${field}: differs in ${count} of ${shared} entries (first: ${examples.get(field)})`);
console.log(out.join("\n"));
