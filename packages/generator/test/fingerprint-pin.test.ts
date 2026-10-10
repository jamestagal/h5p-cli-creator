import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_RULES } from "../src/plan/planner.js";
import { runFingerprint } from "../src/pipeline/fingerprint.js";
import { S1_SETTINGS, s1Input } from "./helpers/s1-settings.js";

/**
 * The unscoped run fingerprint, pinned at 4aca7d0, before generation scopes reached runImport: S1's inputs and a custom
 * chunk size. An import made without a scope must resume exactly as before, so these never change.
 */
describe("unscoped run fingerprints are unchanged by generation scopes", () => {
  it("S1's fingerprint, and one with a custom chunk size, are as pinned", async () => {
    const input = await s1Input(1_000_000);
    const at = (chunkTokens: number) => runFingerprint({ sourceTextHash: input.source.textHash, extractionVersion: input.source.metadata.extractionVersion, unitText: input.unitText, selectedTypes: input.selectedTypes, language: input.language, promptConfig: input.promptConfig, customisation: input.customisation, chunkTokens, rules: DEFAULT_PLAN_RULES });
    expect({ s1: at(S1_SETTINGS.chunkTokens), custom: at(330) }).toEqual({ s1: "4e227777991ea8e635036b700d08be5a416868655fd6d8bee017f2129aa5927a", custom: "08933e46151d9b69b0e3e9a2f0f286573089e907819eae0478cae2e5c24a7562" });
  });
});
