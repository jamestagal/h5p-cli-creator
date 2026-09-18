import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

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
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg"
};

export function serve(root: string, port: number, headers: Record<string, string> = {}): Promise<Server> {
  const server = createServer(async (req, res) => {
    const path = join(root, normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^(\.\.[/\\])+/, ""));
    try {
      const s = await stat(path);
      const file = s.isDirectory() ? join(path, "index.html") : path;
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", ...headers });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, headers);
      res.end("not found");
    }
  });
  return new Promise((resolvePromise) => server.listen(port, "127.0.0.1", () => resolvePromise(server)));
}
