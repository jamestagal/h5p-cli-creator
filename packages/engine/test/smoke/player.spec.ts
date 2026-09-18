import { test, expect } from "@playwright/test";
import type { Page, FrameLocator } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { readFileSync, createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import { ActivitySpec, type AssetEntry } from "@leaplearn/shared";
import { compileToBuffer, createRegistry } from "../../src/index.js";
import { serve } from "./serve.js";

const here = import.meta.dirname;
const root = resolve(here, "../../../..");
const fixtures = resolve(here, "../fixtures");
const cases = ["multi-choice", "blanks", "flashcards", "question-set-nested", "interactive-book", "interactive-book-nested"];
const standaloneDist = resolve(dirname(createRequire(import.meta.url).resolve("h5p-standalone/package.json")), "dist");

let site: string;
let server: Awaited<ReturnType<typeof serve>>;

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "smoke-"));
  await cp(resolve(here, "site"), site, { recursive: true });
  await cp(standaloneDist, join(site, "h5p-standalone"), { recursive: true });
  const registry = await createRegistry({ lockPath: resolve(root, "libraries/libraries.lock.json"), cacheDir: resolve(root, "libraries/cache") });
  const p = resolve(fixtures, "assets/card.jpg");
  const card: AssetEntry = {
    assetId: "card",
    sha256: createHash("sha256").update(readFileSync(p)).digest("hex"),
    byteLength: statSync(p).size,
    mimeType: "image/jpeg",
    open: () => createReadStream(p)
  };
  for (const name of cases) {
    const spec = ActivitySpec.parse(JSON.parse(readFileSync(resolve(fixtures, "specs", `${name}.json`), "utf8")));
    const buf = await compileToBuffer(spec, new Map([["card", card]]), { registry, revision: 1 });
    const zip = await JSZip.loadAsync(buf);
    for (const [entry, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const out = join(site, "packages", name, entry);
      await mkdir(resolve(out, ".."), { recursive: true });
      await writeFile(out, await file.async("nodebuffer"));
    }
  }
  server = await serve(site, 4321);
});
test.afterAll(async () => {
  server.close();
});

async function open(page: Page, name: string): Promise<{ frame: FrameLocator; errors: string[] }> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:4321/?pkg=${name}`);
  await expect(page.locator("body[data-ready='1']")).toBeAttached({ timeout: 30_000 });
  const frame = page.frameLocator("iframe.h5p-iframe");
  await expect(frame.locator(".h5p-content")).toBeVisible({ timeout: 30_000 });
  return { frame, errors };
}

for (const name of cases) {
  test(`renders ${name} without console errors`, async ({ page }) => {
    const { errors } = await open(page, name);

    expect(errors, errors.join("\n")).toEqual([]);
  });
}

/**
 * Scoring interactions. Selectors are H5P's own class names (H5P.Question, H5P.MultiChoice,
 * H5P.Blanks, H5P.QuestionSet and H5P.InteractiveBook), confirmed against the rendered DOM:
 * the per-question score bar (`.h5p-joubelui-score-bar`) renders the accessible text
 * "You got :num out of :total points"; the question set's own results screen
 * (`.questionset-results`) renders only the bare "N/M" numeric fraction, not that phrase.
 * H5P.Question's own retry/check/show-solution buttons are removed from the DOM entirely
 * (`.detach()`, not hidden) once a question reaches full score, so a perfect first answer
 * leaves no retry button to click — the wrong-answer case must run before the correct one.
 *
 * The results screen concatenates the score's numeric spans directly against the surrounding
 * text (e.g. "...star2/2Show solution..."), so the "N/M" alternative below cannot anchor on
 * `\b` at its edges (letter-digit and digit-letter pairs are not word boundaries); it uses a
 * digit lookaround instead so it still can't match a partial number like the "2" in "12/2".
 */
const score = (earned: number, max: number) => new RegExp(`\\b${earned}\\s+out of\\s+${max}\\b|(?<!\\d)${earned}\\s*/\\s*${max}(?!\\d)`);

test("multi-choice: wrong answer scores 0 of 1, then retry and correct answer scores 1 of 1", async ({ page }) => {
  const { frame } = await open(page, "multi-choice");
  await frame.locator(".h5p-answer", { hasText: "Yellow triangle" }).click();
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-answer.h5p-wrong")).toHaveCount(1);
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(0, 1));
  await frame.locator("button.h5p-question-try-again").click();
  await frame.locator(".h5p-answer", { hasText: "Blue circle" }).click();
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-answer.h5p-correct")).toHaveCount(1);
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(1, 1));
});

test("blanks: one wrong scores 1 of 2, then retry and both correct scores 2 of 2", async ({ page }) => {
  const { frame } = await open(page, "blanks");
  const inputs = frame.locator("input.h5p-text-input");
  await inputs.nth(0).fill("hard hat");
  await inputs.nth(1).fill("sandals");
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(1, 2));
  await frame.locator("button.h5p-question-try-again").click();
  await inputs.nth(0).fill("hard hat");
  await inputs.nth(1).fill("boots");
  await frame.locator("button.h5p-question-check-answer").click();
  await expect(frame.locator(".h5p-joubelui-score-bar")).toHaveText(score(2, 2));
});

async function runNestedQuiz(frame: FrameLocator, answers: { choice: string; blank: string }): Promise<void> {
  await frame.locator(".h5p-interactive-book-navigation-chapter-title-text", { hasText: "Quiz" }).click();
  await frame.locator(".h5p-answer:visible", { hasText: answers.choice }).click();
  await frame.locator("button.h5p-question-check-answer:visible").click();
  await frame.locator("a.h5p-question-next:visible").click();
  await frame.locator("input.h5p-text-input:visible").fill(answers.blank);
  await frame.locator("button.h5p-question-check-answer:visible").click();
  await frame.locator("button.h5p-question-finish:visible").click();
}

test("nested question set: all correct reports 2 of 2", async ({ page }) => {
  const { frame } = await open(page, "interactive-book-nested");
  await runNestedQuiz(frame, { choice: "Mandatory", blank: "hard hat" });
  await expect(frame.locator(".questionset-results")).toContainText(score(2, 2));
});

test("nested question set: all wrong reports 0 of 2", async ({ page }) => {
  const { frame } = await open(page, "interactive-book-nested");
  await runNestedQuiz(frame, { choice: "Prohibited", blank: "sandals" });
  await expect(frame.locator(".questionset-results")).toContainText(score(0, 2));
});
