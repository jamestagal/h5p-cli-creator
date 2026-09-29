import { createHash } from "node:crypto";
import type { EngineIdentity, EngineIdentityInputs } from "@leaplearn/engine";

/** A fixed engine identity for tests. The fingerprint is derived from the inputs, so identities that differ in any input differ in fingerprint. */
export function testIdentity(engine: string, overrides: Partial<EngineIdentityInputs> = {}): EngineIdentity {
  const inputs: EngineIdentityInputs = { engineDist: [["index.js", createHash("sha256").update(engine).digest("hex")]], workspaceDist: [["index.js", "0".repeat(64)]], librariesLockSha256: "1".repeat(64), zlib: "1.3.1", ...overrides };
  const fingerprint = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  return { fingerprint, display: `engine@0.1.0+${fingerprint.slice(0, 12)}`, inputs, nodeVersion: "20.20.2" };
}

export const IDENTITY_A = testIdentity("A");
export const IDENTITY_B = testIdentity("B");
/** Engine A's code with a different libraries lock. */
export const IDENTITY_A_NEW_LOCK = testIdentity("A", { librariesLockSha256: "2".repeat(64) });
