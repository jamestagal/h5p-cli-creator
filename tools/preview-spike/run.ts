import { chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { readFileSync, createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compileToBuffer, createRegistry } from "@leaplearn/engine";
import { serve } from "../../packages/engine/test/smoke/serve.js";
import { startPreviewServer, mintToken, type TokenPlacement } from "./preview-server.js";

const here = import.meta.dirname;
const root = resolve(here, "../..");
const fixtures = resolve(root, "packages/engine/test/fixtures");
const APP_PORT = 4401;
const PREVIEW_PORT = 4402;
const REV = "r1";
const OTHER_REV = "r2";
const PACKAGES = ["multi-choice", "flashcards"] as const;

const VARIANTS = [
  { id: "a", pkg: "multi-choice", sandbox: "allow-scripts", hasMedia: false },
  { id: "b", pkg: "multi-choice", sandbox: "allow-scripts allow-same-origin", hasMedia: false },
  { id: "c", pkg: "flashcards", sandbox: "allow-scripts", hasMedia: true },
  { id: "d", pkg: "flashcards", sandbox: "allow-scripts allow-same-origin", hasMedia: true }
] as const;

type Group = "package-json" | "library" | "media" | "other";

interface RequestRecord {
  url: string;
  status: number;
  token: boolean;
  group: Group;
}

interface VariantOutcome {
  id: string;
  sandbox: string;
  result: Record<string, unknown> | undefined;
  contentVisible: boolean;
  nestedIframePresent: boolean;
  requests: RequestRecord[];
  imageRequest: RequestRecord | undefined;
}

function classify(pathname: string): Group {
  if (pathname.endsWith("/h5p.json") || pathname.endsWith("/content/content.json")) return "package-json";
  if (/\.(js|css)$/i.test(pathname)) return "library";
  if (/\.(jpg|jpeg|png|svg|gif)$/i.test(pathname)) return "media";
  return "other";
}

function hasToken(urlStr: string, placement: TokenPlacement, token: string): boolean {
  const parsed = new URL(urlStr);
  if (placement === "query") return parsed.searchParams.get("t") === token;
  return parsed.pathname.split("/").includes(token);
}

function variantOfFrame(frame: Frame): string | undefined {
  let current: Frame | null = frame;
  while (current) {
    const match = /[?&]variant=([a-d])\b/.exec(current.url());
    if (match) return match[1];
    current = current.parentFrame();
  }
  return undefined;
}

async function buildPreviewRoot(): Promise<string> {
  const previewRoot = await mkdtemp(join(tmpdir(), "preview-spike-preview-"));
  const standaloneDist = resolve(
    dirname(createRequire(resolve(root, "packages/engine/package.json")).resolve("h5p-standalone/package.json")),
    "dist"
  );
  await cp(standaloneDist, join(previewRoot, "h5p-standalone"), { recursive: true });
  await cp(resolve(here, "preview/index.html"), join(previewRoot, "index.html"));

  const registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
  const cardPath = resolve(fixtures, "assets/card.jpg");
  const card: AssetEntry = {
    assetId: "card",
    sha256: createHash("sha256").update(readFileSync(cardPath)).digest("hex"),
    byteLength: statSync(cardPath).size,
    mimeType: "image/jpeg",
    open: () => createReadStream(cardPath)
  };

  for (const name of PACKAGES) {
    const spec = ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${name}.json`), "utf8")));
    const buf = await compileToBuffer(spec, new Map([["card", card]]), { registry, revision: 1 });
    const zip = await JSZip.loadAsync(buf);
    for (const [entry, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const out = join(previewRoot, "p", REV, name, entry);
      await mkdir(resolve(out, ".."), { recursive: true });
      await writeFile(out, await file.async("nodebuffer"));
    }
  }

  return previewRoot;
}

async function buildAppRoot(urlBase: string): Promise<string> {
  const appRoot = await mkdtemp(join(tmpdir(), "preview-spike-app-"));
  const template = await readFile(resolve(here, "app/index.html"), "utf8");
  await writeFile(join(appRoot, "index.html"), template.replaceAll("__URL__", urlBase));

  return appRoot;
}

async function collectVariant(
  page: Page,
  id: string
): Promise<{ result: Record<string, unknown> | undefined; contentVisible: boolean; nestedIframePresent: boolean }> {
  const result = await page.evaluate((variantId) => (window as unknown as { results: Record<string, unknown> }).results[variantId], id);
  let nestedIframePresent = false;
  try {
    nestedIframePresent = (await page.frameLocator(`#${id}`).locator("iframe.h5p-iframe").count()) > 0;
  } catch {
    nestedIframePresent = false;
  }

  let contentVisible = false;
  try {
    contentVisible = await page
      .frameLocator(`#${id}`)
      .frameLocator("iframe.h5p-iframe")
      .locator(".h5p-content")
      .isVisible();
  } catch {
    contentVisible = false;
  }

  return { result: result as Record<string, unknown> | undefined, contentVisible, nestedIframePresent };
}

async function runPlacement(placement: TokenPlacement, previewRoot: string) {
  const token = mintToken(REV, 300);
  const base = placement === "query" ? `/p/${REV}` : `/p/${REV}/${token}`;
  const tParam = placement === "query" ? `&t=${token}` : "";
  const urlBase = `http://localhost:${PREVIEW_PORT}/?rev=${REV}&base=${encodeURIComponent(base)}${tParam}`;

  const appRoot = await buildAppRoot(urlBase);
  const appServer = await serve(appRoot, APP_PORT);
  const previewServer = await startPreviewServer(previewRoot, PREVIEW_PORT, placement);

  const browser = await chromium.launch();
  const browserVersion = browser.version();
  const page = await browser.newPage();

  const requestsByVariant = new Map<string, RequestRecord[]>([
    ["a", []],
    ["b", []],
    ["c", []],
    ["d", []]
  ]);
  const rawConsoleCounts = new Map<string, number>();
  const recordRaw = (line: string) => rawConsoleCounts.set(line, (rawConsoleCounts.get(line) ?? 0) + 1);

  page.on("console", (msg) => {
    if (msg.type() === "error") recordRaw(msg.text());
  });
  page.on("pageerror", (err) => recordRaw(err.message));

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname !== "localhost" || url.port !== String(PREVIEW_PORT)) return;
    if (!url.pathname.startsWith("/p/")) return;

    const variant = variantOfFrame(response.frame());
    if (!variant) return;

    const record: RequestRecord = {
      url: response.url(),
      status: response.status(),
      token: hasToken(response.url(), placement, token),
      group: classify(url.pathname)
    };
    requestsByVariant.get(variant)?.push(record);
  });

  await page.goto(`http://127.0.0.1:${APP_PORT}/`);
  await page.waitForTimeout(8000);

  const outcomes: VariantOutcome[] = [];
  for (const variant of VARIANTS) {
    const { result, contentVisible, nestedIframePresent } = await collectVariant(page, variant.id);
    const requests = requestsByVariant.get(variant.id) ?? [];
    const imageRequest = variant.hasMedia ? requests.find((r) => r.url.includes("fc-1-c2.jpg")) : undefined;
    outcomes.push({ id: variant.id, sandbox: variant.sandbox, result, contentVisible, nestedIframePresent, requests, imageRequest });
  }

  await browser.close();

  const rejections = await runRejectionChecks(placement);

  appServer.close();
  await new Promise<void>((res) => previewServer.close(() => res()));

  const rawConsole = [...rawConsoleCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([line, count]) => (count > 1 ? `${line} (x${count})` : line));

  return { placement, browserVersion, outcomes, rejections, rawConsole };
}

async function runRejectionChecks(placement: TokenPlacement) {
  const expiredToken = mintToken(REV, -10);
  const wrongRevToken = mintToken(OTHER_REV, 300);

  function urlFor(tok: string | null): string {
    if (placement === "query") {
      const q = tok ? `?t=${tok}` : "";
      return `http://localhost:${PREVIEW_PORT}/p/${REV}/multi-choice/h5p.json${q}`;
    }
    const segment = tok ?? "missing";
    return `http://localhost:${PREVIEW_PORT}/p/${REV}/${segment}/multi-choice/h5p.json`;
  }

  const expired = await fetch(urlFor(expiredToken));
  const wrongRevision = await fetch(urlFor(wrongRevToken));
  // For path placement a request with no token segment at all has only two path
  // segments after /p/, which the server can only classify as "missing".
  const missingUrl =
    placement === "query" ? urlFor(null) : `http://localhost:${PREVIEW_PORT}/p/${REV}/h5p.json`;
  const missing = await fetch(missingUrl);

  return {
    expired: { status: expired.status, body: await expired.text() },
    wrongRevision: { status: wrongRevision.status, body: await wrongRevision.text() },
    missing: { status: missing.status, body: await missing.text() }
  };
}

function groupCell(requests: RequestRecord[], group: Group): string {
  const matching = requests.filter((r) => r.group === group);
  if (matching.length === 0) return "n/a";

  const statuses = [...new Set(matching.map((r) => r.status))].sort().join("/");
  const tokenPresence = matching.every((r) => r.token) ? "yes" : matching.some((r) => r.token) ? "mixed" : "no";

  return `${matching.length} req, status ${statuses}, token ${tokenPresence}`;
}

function renderVariantTable(outcomes: VariantOutcome[]): string {
  const header =
    "| variant | sandbox | package JSON | library JS+CSS | media | ready | nested iframe present | content visible | console errors |";
  const sep = "|---|---|---|---|---|---|---|---|---|";
  const rows = outcomes.map((o) => {
    const ready = o.result?.["ready"];
    const readyCell = ready === true ? "true" : ready === false ? `false (${String(o.result?.["error"] ?? "")})` : "no message received";
    const errors = Array.isArray(o.result?.["consoleErrors"]) ? (o.result?.["consoleErrors"] as string[]) : [];
    const errorCell = errors.length === 0 ? "none" : errors.map((e) => e.replace(/\|/g, "\\|")).join("; ");

    return `| ${o.id} | \`${o.sandbox}\` | ${groupCell(o.requests, "package-json")} | ${groupCell(o.requests, "library")} | ${groupCell(o.requests, "media")} | ${readyCell} | ${o.nestedIframePresent} | ${o.contentVisible} | ${errorCell} |`;
  });

  return [header, sep, ...rows].join("\n");
}

function renderImageRow(outcomes: VariantOutcome[]): string {
  const header = "| variant | image request status | token present |";
  const sep = "|---|---|---|";
  const rows = outcomes
    .filter((o) => o.imageRequest !== undefined || VARIANTS.find((v) => v.id === o.id)?.hasMedia)
    .map((o) => {
      const img = o.imageRequest;
      return `| ${o.id} | ${img ? img.status : "no request observed"} | ${img ? img.token : "n/a"} |`;
    });

  return [header, sep, ...rows].join("\n");
}

function renderRejectionsTable(rejections: Awaited<ReturnType<typeof runRejectionChecks>>): string {
  const header = "| check | status | body |";
  const sep = "|---|---|---|";
  const rows = [
    `| expired token | ${rejections.expired.status} | ${rejections.expired.body} |`,
    `| wrong-revision token | ${rejections.wrongRevision.status} | ${rejections.wrongRevision.body} |`,
    `| missing token | ${rejections.missing.status} | ${rejections.missing.body} |`
  ];

  return [header, sep, ...rows].join("\n");
}

async function main() {
  const previewRoot = await buildPreviewRoot();

  const queryRun = await runPlacement("query", previewRoot);
  const pathRun = await runPlacement("path", previewRoot);

  console.log(`h5p-standalone version: 3.8.2`);
  console.log(`Chromium version: ${queryRun.browserVersion}`);
  console.log();

  console.log("## Query token placement (?t=)");
  console.log();
  console.log(renderVariantTable(queryRun.outcomes));
  console.log();
  console.log("Media (image) request evidence:");
  console.log(renderImageRow(queryRun.outcomes));
  console.log();
  console.log("Rejections:");
  console.log(renderRejectionsTable(queryRun.rejections));
  console.log();
  if (queryRun.rawConsole.length > 0) {
    console.log("Raw console/page errors (query placement):");
    for (const line of queryRun.rawConsole) console.log(`- ${line}`);
    console.log();
  }

  console.log("## Path-segment token placement (/p/<rev>/<token>/...)");
  console.log();
  console.log(renderVariantTable(pathRun.outcomes));
  console.log();
  console.log("Media (image) request evidence:");
  console.log(renderImageRow(pathRun.outcomes));
  console.log();
  console.log("Rejections:");
  console.log(renderRejectionsTable(pathRun.rejections));
  console.log();
  if (pathRun.rawConsole.length > 0) {
    console.log("Raw console/page errors (path placement):");
    for (const line of pathRun.rawConsole) console.log(`- ${line}`);
    console.log();
  }
}

await main();
