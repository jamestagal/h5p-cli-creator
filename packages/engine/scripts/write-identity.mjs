// Build step: writes dist/identity.json, the engine's runtime dependency closure from pnpm-lock.yaml.
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import { identityJson } from "../dist/identity-closure.js";

const engineRoot = new URL("../", import.meta.url);
const lock = parse(await readFile(new URL("../../pnpm-lock.yaml", engineRoot), "utf8"));
const { version } = JSON.parse(await readFile(new URL("package.json", engineRoot), "utf8"));

await writeFile(new URL("dist/identity.json", engineRoot), identityJson({ engineVersion: version, lock, importers: ["packages/engine", "packages/shared"] }));
