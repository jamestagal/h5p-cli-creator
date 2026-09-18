import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const SECRET = "spike-secret";
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

export type TokenPlacement = "query" | "path";
export type VerifyResult = "ok" | "bad-signature" | "expired" | "wrong-revision" | "missing";

export function mintToken(rev: string, expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ rev, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verify(token: string | null, rev: string): VerifyResult {
  if (!token) return "missing";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return "bad-signature";
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return "bad-signature";
  const { rev: r, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { rev: string; exp: number };
  if (exp < Math.floor(Date.now() / 1000)) return "expired";
  if (r !== rev) return "wrong-revision";
  return "ok";
}

/**
 * Serves `/h5p-standalone/*` publicly and everything under `/p/<revisionId>/*` only with a valid
 * token. In "query" placement the token travels as `?t=` alongside a path of
 * `/p/<rev>/<rest>`; in "path" placement the token is the path segment right after `<rev>`
 * (`/p/<rev>/<token>/<rest>`), so it rides along on every relative URL h5p-standalone or the
 * browser derives from the page's own address, including plain `<script>`/`<link>`/`<img>` tags.
 */
export function startPreviewServer(root: string, port: number, placement: TokenPlacement): Promise<Server> {
  return new Promise((resolvePromise) => {
    const server = createServer(async (req, resp) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const origin = req.headers.origin;
      const cors = { "access-control-allow-origin": origin === "null" ? "null" : "http://127.0.0.1:4401", vary: "Origin" };

      let filePath = url.pathname;
      const queryMatch = /^\/p\/([^/]+)\/(.*)$/.exec(url.pathname);
      const pathMatch = /^\/p\/([^/]+)\/([^/]+)\/(.*)$/.exec(url.pathname);

      if (placement === "query" && queryMatch) {
        const [, rev, rest] = queryMatch;
        const result = verify(url.searchParams.get("t"), rev!);
        if (result !== "ok") {
          resp.writeHead(403, { ...cors, "content-type": "text/plain" });
          resp.end(result);
          return;
        }
        filePath = `/p/${rev}/${rest}`;
      } else if (placement === "path" && pathMatch) {
        const [, rev, token, rest] = pathMatch;
        const result = verify(token!, rev!);
        if (result !== "ok") {
          resp.writeHead(403, { ...cors, "content-type": "text/plain" });
          resp.end(result);
          return;
        }
        filePath = `/p/${rev}/${rest}`;
      } else if (queryMatch) {
        resp.writeHead(403, { ...cors, "content-type": "text/plain" });
        resp.end("missing");
        return;
      }

      const file = join(root, normalize(decodeURIComponent(filePath)).replace(/^(\.\.[/\\])+/, ""));
      try {
        const info = await stat(file);
        const target = info.isDirectory() ? join(file, "index.html") : file;
        const data = await readFile(target);
        resp.writeHead(200, { ...cors, "content-type": MIME[extname(target)] ?? "application/octet-stream" });
        resp.end(data);
      } catch {
        resp.writeHead(404, cors);
        resp.end("not found");
      }
    });
    server.listen(port, "localhost", () => resolvePromise(server));
  });
}
