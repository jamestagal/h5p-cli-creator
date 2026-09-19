import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeProvider, fakeResponse } from "../src/llm/fake-provider.js";
import { RecordingProvider, ReplayProvider, ReplayMissError } from "../src/llm/replay-provider.js";
import { toProviderSchema } from "../src/llm/schema.js";
import { modelForRole } from "../src/llm/models.js";

const req = { purpose: "extract" as const, model: modelForRole("extract"), system: "s", user: "u", maxOutputTokens: 10, outputSchema: toProviderSchema(z.object({ a: z.number() })) };

describe("replay", () => {
  it("records a response and replays it for the identical request; misses name the purpose", async () => {
    const dir = await mkdtemp(join(tmpdir(), "replay-"));
    const recording = new RecordingProvider(new FakeProvider([fakeResponse({ outputText: "{\"a\":1}", providerRequestId: "req_x" })]), dir);
    const first = await recording.complete(req);
    const replay = new ReplayProvider(dir);
    const second = await replay.complete(req);
    expect(second).toEqual({ ...first, latencyMs: 0 });
    await expect(replay.complete({ ...req, user: "different" })).rejects.toThrow(ReplayMissError);
    await expect(replay.complete({ ...req, user: "different" })).rejects.toThrow(/extract/);
  });
});
