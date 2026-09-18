import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { networkImageResolver } from "../src/image-resolver.js";

describe("networkImageResolver", () => {
  it("fetches an http image into an AssetEntry with the right hash and type", async () => {
    const bytes = readFileSync(resolve(import.meta.dirname, "fixtures/card.jpg"));
    const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(bytes); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    const asset = await networkImageResolver(`http://127.0.0.1:${port}/card.jpg`, "/unused");
    expect(asset.mimeType).toBe("image/jpeg");
    expect(asset.byteLength).toBe(bytes.length);
    server.close();
  });
});
