import { readdirSync, readFileSync } from "node:fs"; import { deflateRawSync } from "node:zlib"; import { createHash } from "node:crypto";
const dir = process.argv[2]; const level = Number(process.argv[3]);
let same = 0, differ = 0; const h = createHash("sha256");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".raw")).sort()) {
  const mine = deflateRawSync(readFileSync(`${dir}/${f}`), level >= 0 ? { level } : {});
  const inPackage = readFileSync(`${dir}/${f.replace(".raw", ".deflated")}`);
  if (Buffer.compare(mine, inPackage) === 0) same++; else differ++;
  h.update(mine);
}
console.log(`node ${process.versions.node} zlib ${process.versions.zlib}: ${same} entries identical to the package's compressed streams, ${differ} different; re-deflated streams sha256 ${h.digest("hex").slice(0, 16)}`);
