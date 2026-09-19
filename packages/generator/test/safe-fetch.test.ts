import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { embeddedIPv4, isBlockedAddress, parseIPv6, safeFetch, SafeFetchError } from "../src/net/safe-fetch.js";

let server: Server; let base: string; let port: number; const timers: NodeJS.Timeout[] = [];
const hits = { mapped: 0, ok: 0 };
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/ok") { hits.ok += 1; res.writeHead(200, { "content-type": "image/jpeg" }); res.end(Buffer.alloc(1024, 1)); return; }
    if (url.pathname === "/host") { res.writeHead(200, { "content-type": "text/plain" }); res.end(req.headers.host ?? ""); return; }
    if (url.pathname === "/big") { res.writeHead(200, { "content-type": "application/octet-stream" }); res.end(Buffer.alloc(200_000, 2)); return; }
    if (url.pathname === "/hop") { res.writeHead(302, { location: "/ok" }); res.end(); return; }
    if (url.pathname === "/loop") { res.writeHead(302, { location: "/loop" }); res.end(); return; }
    if (url.pathname === "/metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
    // Same loopback address as /ok's host, expressed as its IPv4-mapped IPv6 literal; the port is
    // included so a guard that failed to block this would actually land the request on /ok.
    if (url.pathname === "/mapped") { hits.mapped += 1; res.writeHead(302, { location: `http://[::ffff:127.0.0.1]:${port}/ok` }); res.end(); return; }
    if (url.pathname === "/mapped-metadata") { res.writeHead(302, { location: "http://[::ffff:169.254.169.254]/latest/meta-data/" }); res.end(); return; }
    if (url.pathname === "/slow") { timers.push(setTimeout(() => { res.writeHead(200); res.end("late"); }, 2000)); return; }
    if (url.pathname === "/html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<p>"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => { for (const t of timers) clearTimeout(t); server.close(); });

describe("address classification", () => {
  it("parses IPv6 in every notation Node may hand back", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("[::ffff:7f00:1]")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6("2606:4700::1111")).toEqual([0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111]);
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIPv6("::g")).toBeNull();
  });
  it("extracts embedded IPv4 from mapped, compatible, NAT64 and 6to4 forms", () => {
    expect(embeddedIPv4(parseIPv6("::ffff:7f00:1")!)).toBe("127.0.0.1");
    expect(embeddedIPv4(parseIPv6("::a9fe:a9fe")!)).toBe("169.254.169.254");
    expect(embeddedIPv4(parseIPv6("64:ff9b::7f00:1")!)).toBe("127.0.0.1");
    expect(embeddedIPv4(parseIPv6("2002:c0a8:101::")!)).toBe("192.168.1.1");
    expect(embeddedIPv4(parseIPv6("2606:4700::1111")!)).toBeNull();
  });
  it("blocks private, loopback, link-local, metadata, multicast, unspecified and every embedded form", () => {
    const blocked = ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
      "::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "ff0e::1",
      "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:a9fe:a9fe", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2002:a9fe:a9fe::",
      "not-an-ip", "1.2.3", "::ffff:999.1.1.1"];
    for (const ip of blocked) expect(isBlockedAddress(ip), ip).toBe(true);
  });
  it("allows public addresses in both families", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111", "203.0.113.5", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
});

describe("safeFetch", () => {
  const allow = { unsafeAllowAddresses: ["127.0.0.1"] };
  it("rejects non-http schemes and loopback targets by default", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(SafeFetchError);
    await expect(safeFetch("file:///etc/passwd")).rejects.toMatchObject({ reason: "scheme" });
    await expect(safeFetch(`${base}/ok`)).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://localhost/ok")).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch(`http://[::ffff:127.0.0.1]:${port}/ok`)).rejects.toMatchObject({ reason: "blocked_address" });
  });
  it("fetches, follows a relative redirect, and reports the final url and connected address (private networks allowed for the test server only)", async () => {
    const r = await safeFetch(`${base}/hop`, { ...allow, allowedContentTypes: ["image/jpeg"] });
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1024);
    expect(r.finalUrl).toBe(`${base}/ok`);
    expect(r.connectedAddress).toBe("127.0.0.1");
  });
  it("pins the connection to the validated address: a name only the injected lookup can resolve is reached, and the Host header keeps the name", async () => {
    let lookups = 0;
    const r = await safeFetch(`http://pinned.test:${port}/host`, { ...allow, lookup: async (hostname) => { lookups += 1; expect(hostname).toBe("pinned.test"); return ["127.0.0.1"]; } });
    expect(r.body.toString()).toBe(`pinned.test:${port}`);
    expect(r.connectedAddress).toBe("127.0.0.1");
    expect(lookups).toBe(1);
  });
  it("re-validates every redirect target, after normalisation", async () => {
    await expect(safeFetch(`${base}/metadata`, allow)).rejects.toMatchObject({ reason: "redirect_target" });
    await expect(safeFetch(`${base}/loop`, { ...allow, maxRedirects: 3 })).rejects.toMatchObject({ reason: "too_many_redirects" });
  });
  it("blocks a redirect to the allow-listed loopback address expressed as IPv4-mapped IPv6, and never lets the request land", async () => {
    hits.mapped = 0; hits.ok = 0;
    const caught: unknown = await safeFetch(`${base}/mapped`, { ...allow }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(SafeFetchError);
    expect(caught).toMatchObject({ reason: "redirect_target" });
    expect((caught as SafeFetchError).message).toMatch(/blocked address/);
    expect(hits.mapped).toBe(1);
    expect(hits.ok).toBe(0);
  });
  it("blocks a redirect to the metadata address expressed as IPv4-mapped IPv6, even under the allow list", async () => {
    const caught: unknown = await safeFetch(`${base}/mapped-metadata`, { ...allow }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(SafeFetchError);
    expect(caught).toMatchObject({ reason: "redirect_target" });
    expect((caught as SafeFetchError).message).toMatch(/metadata address/);
  });
  it("caps the body size, the total time (DNS included), and the content type", async () => {
    await expect(safeFetch(`${base}/big`, { ...allow, maxBytes: 100_000 })).rejects.toMatchObject({ reason: "too_large" });
    await expect(safeFetch(`${base}/slow`, { ...allow, timeoutMs: 200 })).rejects.toMatchObject({ reason: "timeout" });
    await expect(safeFetch(`http://slow-dns.test:${port}/ok`, { ...allow, timeoutMs: 200, lookup: () => new Promise((resolve) => timers.push(setTimeout(() => resolve(["127.0.0.1"]), 2000))) })).rejects.toMatchObject({ reason: "timeout" });
    await expect(safeFetch(`${base}/html`, { ...allow, allowedContentTypes: ["image/jpeg", "image/png"] })).rejects.toMatchObject({ reason: "content_type" });
    await expect(safeFetch(`${base}/missing`, allow)).rejects.toMatchObject({ reason: "http", status: 404 });
  });
  it("blocks a public name that resolves privately, and a name with no address", async () => {
    await expect(safeFetch("http://example.test/ok", { lookup: async () => ["10.0.0.5"] })).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://example.test/ok", { lookup: async () => ["8.8.8.8", "::ffff:7f00:1"] })).rejects.toMatchObject({ reason: "blocked_address" });
    await expect(safeFetch("http://example.test/ok", { lookup: async () => [] })).rejects.toMatchObject({ reason: "dns" });
  });
});
