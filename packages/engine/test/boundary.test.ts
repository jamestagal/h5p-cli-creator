import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const src = resolve(import.meta.dirname, "../src");
const forbidden = [
  /from\s+["'](axios|node-fetch|undici|https?|node:https?|child_process|node:child_process|net|node:net|dns|node:dns|tls|node:tls|dgram|node:dgram)["']/,
  /\bprocess\.(env|cwd|exit)\b/,
  /\bconsole\./,
  /\bfetch\s*\(/,
  /\bimport\s*\(/,
  /\bprocess\s*\[/,
  /\bcreateRequire\b/
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
}

describe("engine boundary", () => {
  it("never imports network, shell, env, cwd, exit or console", () => {
    const offenders: string[] = [];
    for (const f of files(src)) {
      const text = readFileSync(f, "utf8");
      for (const re of forbidden) if (re.test(text)) offenders.push(`${f}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
