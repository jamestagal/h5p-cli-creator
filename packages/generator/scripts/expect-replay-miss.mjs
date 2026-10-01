// Plan Task 10 step 3: the offline check that holds until S1 is recorded, and is deleted in the S1 commit.
//
// Runs the whole generator suite once, with Vitest's JSON reporter for the per-file census and a capture reporter for
// each failure's full error chain (the JSON report keeps only the outer stack). Exits 0 only when:
//   - every failing test is in test/replay.test.ts, and no other file has a failure or an error;
//   - every failure's error is a ReplayMissError thrown by ReplayProvider.complete, either directly or as the cause of
//     the stage runner's InfrastructureFailure with the same message, naming a purpose and a request-key prefix;
//   - for each key prefix, no file in test/fixtures/replay/synthetic/ starts with it (the recording is absent, not
//     unreadable or malformed);
//   - the purpose is one this task changes and is the first stage to miss: parseUnit;
//   - there is at least one such miss, and no unhandled error.
// Anything else (a malformed fixture, a schema error, an assertion failure) fails the script.
//
// Run from packages/generator after building: node scripts/expect-replay-miss.mjs
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startVitest } from "vitest/node";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const replayDir = resolve(pkg, "test/fixtures/replay/synthetic");
const EXPECTED_FILE = "test/replay.test.ts";
const EXPECTED_PURPOSES = new Set(["parseUnit"]);
const MISS = /^no recorded response for purpose (\S+) \(model (\S+), key ([0-9a-f]{12})\); run with --provider record to capture it$/;
const THROW_SITE = /^\s+at (?:async )?ReplayProvider\.complete \(.*\/src\/llm\/replay-provider\.ts:\d+:\d+\)$/;

const problems = [];
const misses = [];

/** The ReplayMissError behind one failure, or a reason it is not one. */
function replayMiss(error) {
  const chain = [];
  for (let e = error; e && typeof e === "object" && chain.length < 5; e = e.cause) chain.push(e);
  const names = chain.map((e) => e.name).join(" <- ");
  const direct = chain.length === 1 && chain[0].name === "ReplayMissError";
  const wrapped = chain.length === 2 && chain[0].name === "InfrastructureFailure" && chain[1].name === "ReplayMissError" && chain[0].message === chain[1].message;
  if (!direct && !wrapped) return { reason: `error chain is ${names}: ${String(error?.message ?? error)}` };
  const miss = chain.at(-1);
  const frame = String(miss.stack ?? "").split("\n").find((line) => /^\s+at /.test(line)) ?? "(no stack)";
  if (!THROW_SITE.test(frame)) return { reason: `ReplayMissError not thrown by ReplayProvider.complete (first frame: ${frame.trim()})` };
  const m = MISS.exec(String(miss.message));
  if (!m) return { reason: `ReplayMissError message has an unexpected form: ${miss.message}` };
  return { purpose: m[1], model: m[2], keyPrefix: m[3] };
}

const errorsByTest = new Map();
const unhandled = [];
const capture = {
  onTestCaseResult(testCase) {
    const result = testCase.result();
    if (result.state === "failed") errorsByTest.set(`${testCase.module.moduleId}::${testCase.fullName}`, result.errors ?? []);
  },
  onTestRunEnd(_modules, unhandledErrors) { unhandled.push(...unhandledErrors); }
};

const work = await mkdtemp(join(tmpdir(), "expect-replay-miss-"));
try {
  const jsonFile = join(work, "results.json");
  const vitest = await startVitest("test", [], { root: pkg, watch: false, reporters: [["json", { outputFile: jsonFile }], capture] });
  await vitest.close();
  const report = JSON.parse(await readFile(jsonFile, "utf8"));
  const fixtures = await readdir(replayDir);

  for (const file of report.testResults) {
    const rel = relative(pkg, file.name);
    const failed = file.assertionResults.filter((a) => a.status === "failed");
    if (rel !== EXPECTED_FILE) {
      if (file.status !== "passed" || failed.length > 0 || file.message) problems.push(`${rel}: ${failed.length} failing test(s)${file.message ? `; error: ${file.message.split("\n")[0]}` : ""}`);
      continue;
    }
    if (file.message) problems.push(`${rel}: file-level error: ${file.message.split("\n")[0]}`);
    for (const a of failed) {
      const fullName = [...a.ancestorTitles, a.title].join(" > ");
      const errors = errorsByTest.get(`${file.name}::${fullName}`);
      if (!errors || errors.length === 0) { problems.push(`${rel} > ${fullName}: failed with no captured error`); continue; }
      for (const error of errors) {
        const found = replayMiss(error);
        if (found.reason) { problems.push(`${rel} > ${fullName}: ${found.reason}`); continue; }
        if (!EXPECTED_PURPOSES.has(found.purpose)) problems.push(`${rel} > ${fullName}: missed at ${found.purpose}, expected the first miss at ${[...EXPECTED_PURPOSES].join(" or ")}`);
        const present = fixtures.filter((name) => name.startsWith(found.keyPrefix));
        if (present.length > 0) problems.push(`${rel} > ${fullName}: key ${found.keyPrefix} has a fixture (${present.join(", ")}), so the miss is not an absent recording`);
        misses.push({ test: fullName, ...found });
      }
    }
  }
  if (!report.testResults.some((f) => relative(pkg, f.name) === EXPECTED_FILE)) problems.push(`${EXPECTED_FILE} did not run`);
  if (misses.length === 0) problems.push(`${EXPECTED_FILE} had no replay miss: if S1 is recorded, this script should have been deleted`);
  for (const e of unhandled) problems.push(`unhandled error: ${e?.name ?? "Error"}: ${e?.message ?? String(e)}`);

  console.log(`${report.numTotalTests} tests: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests + (report.numTodoTests ?? 0)} skipped`);
  for (const m of misses) console.log(`expected miss: ${EXPECTED_FILE} > ${m.test}: ${m.purpose} (model ${m.model}, key ${m.keyPrefix})`);
} finally {
  await rm(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`expect-replay-miss: FAILED\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("expect-replay-miss: OK (the only failures are replay misses for recordings S1 has not made yet)");
process.exit(0);
