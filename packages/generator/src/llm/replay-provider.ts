import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallOptions, ModelProvider } from "./provider.js";
import type { ModelRequest, ModelResponse } from "./types.js";

export function requestKey(request: ModelRequest): string {
  const { model, system, cachedContext, user, outputSchema, maxOutputTokens } = request;
  return createHash("sha256").update(JSON.stringify({ model, system, cachedContext: cachedContext ?? null, user, outputSchema, maxOutputTokens })).digest("hex");
}

export class ReplayMissError extends Error {
  constructor(request: ModelRequest, key: string) {
    super(`no recorded response for purpose ${request.purpose} (model ${request.model}, key ${key.slice(0, 12)}); run with --provider record to capture it`);
    this.name = "ReplayMissError";
  }
}

export class ReplayProvider implements ModelProvider {
  readonly name = "replay" as const;
  constructor(private readonly dir: string) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const key = requestKey(request);
    let text: string;
    try { text = await readFile(join(this.dir, `${key}.json`), "utf8"); } catch { throw new ReplayMissError(request, key); }
    const stored = JSON.parse(text) as { request: { purpose: string; model: string }; response: ModelResponse };
    return { ...stored.response, latencyMs: 0 };
  }
}

export class RecordingProvider implements ModelProvider {
  readonly name: "anthropic" | "fake" | "replay";
  constructor(private readonly inner: ModelProvider, private readonly dir: string) { this.name = inner.name; }
  async complete(request: ModelRequest, options?: CallOptions): Promise<ModelResponse> {
    const response = await this.inner.complete(request, options);
    await mkdir(this.dir, { recursive: true });
    const key = requestKey(request);
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), request: { purpose: request.purpose, model: request.model, maxOutputTokens: request.maxOutputTokens, userPreview: request.user.slice(0, 200) }, response }, null, 2) + "\n");
    return response;
  }
}
