import { promises as dns } from "node:dns";
import { isIPv4 } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

export type SafeFetchReason = "scheme" | "blocked_address" | "dns" | "too_many_redirects" | "redirect_target" | "timeout" | "too_large" | "content_type" | "http";

export class SafeFetchError extends Error {
  constructor(message: string, public readonly reason: SafeFetchReason, public readonly status?: number) { super(message); this.name = "SafeFetchError"; }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  /** One total deadline: DNS, every hop and the body read all count against it. */
  timeoutMs?: number;
  allowedContentTypes?: string[];
  lookup?: (hostname: string) => Promise<string[]>;
  /** Test-only escape hatch (a loopback test server); never set it in application code. The metadata address stays blocked. */
  unsafeAllowPrivateNetworks?: boolean;
}
export interface SafeFetchResult { status: number; contentType: string | null; body: Buffer; finalUrl: string; connectedAddress: string; }

const METADATA_V4 = "169.254.169.254";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const BLOCKED_V4: Array<[string, number]> = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]];

/** Eight 16-bit groups, or null when the text is not an IPv6 address. Brackets and an embedded dotted IPv4 tail are accepted. */
export function parseIPv6(input: string): number[] | null {
  let ip = input.trim();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (ip.split("::").length > 2) return null;
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    ip = `${ip.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", rest] = ip.split("::");
  const parse = (s: string): number[] | null => {
    if (s === "") return [];
    const groups = s.split(":").map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const h = parse(head); const t = rest === undefined ? [] : parse(rest);
  if (h === null || t === null) return null;
  if (rest === undefined) return h.length === 8 ? h : null;
  const zeros = 8 - h.length - t.length;
  return zeros < 1 ? null : [...h, ...Array<number>(zeros).fill(0), ...t];
}

function dotted(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/** The IPv4 address an IPv6 address carries, if any: mapped ::ffff:0:0/96, compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16. */
export function embeddedIPv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const leadingZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (leadingZero && g5 === 0xffff) return dotted(g6, g7);
  if (leadingZero && g5 === 0 && (g6 !== 0 || g7 > 1)) return dotted(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return dotted(g6, g7);
  if (g0 === 0x2002) return dotted(g1, g2);
  return null;
}

function isBlockedV4(ip: string): boolean {
  return !isIPv4(ip) || BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedV4(ip);
  const groups = parseIPv6(ip);
  if (!groups) return true;
  const embedded = embeddedIPv4(groups);
  if (embedded !== null) return isBlockedV4(embedded);
  const first = groups[0]!;
  if (groups.every((g) => g === 0)) return true;                                   // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;   // ::1
  if ((first & 0xfe00) === 0xfc00) return true;                                    // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true;                                    // fe80::/10
  if ((first & 0xff00) === 0xff00) return true;                                    // ff00::/8 multicast
  return false;
}

function isMetadata(ip: string): boolean {
  if (ip === METADATA_V4) return true;
  const groups = parseIPv6(ip);
  return groups !== null && embeddedIPv4(groups) === METADATA_V4;
}

function familyOf(ip: string): 4 | 6 {
  return isIPv4(ip) ? 4 : 6;
}

class Deadline {
  private readonly endsAt: number;
  constructor(timeoutMs: number) { this.endsAt = Date.now() + timeoutMs; }
  remaining(): number { return this.endsAt - Date.now(); }
  signal(): AbortSignal { return AbortSignal.timeout(Math.max(1, this.remaining())); }
  async race<T>(work: Promise<T>, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SafeFetchError(`timed out while ${what}`, "timeout")), Math.max(1, this.remaining())); });
    try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
  }
}

/** Resolves and validates every address for the URL's host; returns the address the connection will be pinned to. */
async function resolveAllowed(url: URL, options: SafeFetchOptions, deadline: Deadline, reason: "blocked_address" | "redirect_target"): Promise<string> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError(`unsupported scheme ${url.protocol}`, reason === "redirect_target" ? "redirect_target" : "scheme");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIPv4(host) || parseIPv6(host)) addresses = [host];
  else {
    try {
      const resolved = options.lookup ? options.lookup(host) : dns.lookup(host, { all: true }).then((rows) => rows.map((r) => r.address));
      addresses = await deadline.race(resolved, `resolving ${host}`);
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError(`cannot resolve ${host}: ${err instanceof Error ? err.message : String(err)}`, "dns");
    }
    if (addresses.length === 0) throw new SafeFetchError(`no addresses for ${host}`, "dns");
  }
  for (const a of addresses) {
    if (isMetadata(a)) throw new SafeFetchError(`${host} resolves to the metadata address`, reason);
    if (!options.unsafeAllowPrivateNetworks && isBlockedAddress(a)) throw new SafeFetchError(`${host} resolves to a blocked address ${a}`, reason);
    if (options.unsafeAllowPrivateNetworks && !isIPv4(a) && !parseIPv6(a)) throw new SafeFetchError(`${host} resolves to an unparsable address ${a}`, reason);
  }
  return addresses[0]!;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;

/**
 * An agent that can only ever connect to `address`: the name is never resolved again after validation.
 * Node's automatic family selection (on by default since Node 20) calls lookup with `{ all: true }` and
 * expects an array; a plain lookup expects (address, family). Both forms are honoured, because returning
 * the wrong shape makes the connection fail with ERR_INVALID_IP_ADDRESS (review finding 2).
 */
function pinnedAgent(address: string): Dispatcher {
  const family = familyOf(address);
  return new Agent({
    connect: {
      lookup: (_hostname: string, options: { all?: boolean | undefined } | number | undefined, callback: LookupCallback) => {
        if (typeof options === "object" && options !== null && options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      }
    }
  });
}

async function readCapped(res: Response, maxBytes: number, deadline: Deadline): Promise<Buffer> {
  const chunks: Buffer[] = []; let total = 0;
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    if (deadline.remaining() <= 0) { await reader.cancel(); throw new SafeFetchError("timed out while reading the body", "timeout"); }
    const { done, value } = await deadline.race(reader.read(), "reading the body");
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new SafeFetchError(`body exceeds ${maxBytes} bytes`, "too_large"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches a URL for application code with SSRF controls: http(s) only; every hostname resolved and
 * every address classified (after IPv6 normalisation) against private, loopback, link-local, metadata
 * and multicast ranges; the connection pinned to the validated address so the name is never resolved
 * again; redirects followed manually and re-checked; one total deadline; capped body.
 */
export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const deadline = new Deadline(options.timeoutMs ?? 15_000);
  let url: URL;
  try { url = new URL(input); } catch { throw new SafeFetchError(`invalid url ${input}`, "scheme"); }
  let address = await resolveAllowed(url, options, deadline, "blocked_address");

  for (let hop = 0; ; hop++) {
    const agent = pinnedAgent(address);
    let res: Response;
    try {
      res = (await undiciFetch(url.href, { redirect: "manual", signal: deadline.signal(), dispatcher: agent, headers: { accept: options.allowedContentTypes?.join(", ") ?? "*/*" } })) as unknown as Response;
    } catch (err) {
      await agent.close();
      if (deadline.remaining() <= 0 || (err instanceof Error && err.name === "TimeoutError")) throw new SafeFetchError(`timed out fetching ${url.href}`, "timeout");
      throw new SafeFetchError(`fetch failed for ${url.href}: ${err instanceof Error ? err.message : String(err)}`, "http");
    }
    try {
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) throw new SafeFetchError(`redirect without location from ${url.href}`, "http", res.status);
        if (hop + 1 > maxRedirects) throw new SafeFetchError(`more than ${maxRedirects} redirects from ${input}`, "too_many_redirects");
        const next = new URL(location, url);
        address = await resolveAllowed(next, options, deadline, "redirect_target");
        url = next;
        continue;
      }
      if (!res.ok) { await res.body?.cancel(); throw new SafeFetchError(`HTTP ${res.status} from ${url.href}`, "http", res.status); }
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim() || null;
      if (options.allowedContentTypes && (!contentType || !options.allowedContentTypes.includes(contentType))) {
        await res.body?.cancel();
        throw new SafeFetchError(`content-type ${contentType ?? "(none)"} not allowed for ${url.href}`, "content_type", res.status);
      }
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes) { await res.body?.cancel(); throw new SafeFetchError(`body of ${declared} bytes exceeds ${maxBytes}`, "too_large"); }
      const body = await readCapped(res, maxBytes, deadline);
      return { status: res.status, contentType, body, finalUrl: url.href, connectedAddress: address };
    } finally {
      await agent.close();
    }
  }
}
