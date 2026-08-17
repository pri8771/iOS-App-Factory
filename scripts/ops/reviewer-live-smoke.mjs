#!/usr/bin/env node
// Manual-only live smoke of the read-only Codex independent reviewer
// (apps/daemon/src/codex-independent-reviewer.ts), following the six steps in
// docs/operations/llm-independent-review.md ("The seam for the first live
// smoke test") literally. It is NOT wired into `pnpm test` or `pnpm verify`
// and must never be: it makes exactly one real model call per invocation.
//
// Every path and identity comes from the environment; there are no defaults
// that could make this go live by accident, and it refuses to run unless the
// operator also sets AF_REVIEWER_SMOKE_CONFIRM_LIVE=yes.
//
// Required environment:
//   AF_REVIEWER_SMOKE_CONFIRM_LIVE            must be exactly "yes"
//   AF_REVIEWER_SMOKE_CODEX_EXECUTABLE        absolute path to the pinned Codex binary
//   AF_REVIEWER_SMOKE_CODEX_EXECUTABLE_DIGEST expected sha256:<hex> of that binary
//   AF_REVIEWER_SMOKE_CODEX_CLI_VERSION       expected `codex --version` (must be a VERIFIED version)
//   AF_REVIEWER_SMOKE_CODEX_MODEL             model identifier to review with
//   AF_REVIEWER_SMOKE_CODEX_HOME              dedicated private (0700) CODEX_HOME holding only auth
//   AF_REVIEWER_SMOKE_ROOT                    private (0700) root; runner/, checkouts/, tmp/,
//                                             throwaway repo + mirror, and schema file live here
//   AF_REVIEWER_SMOKE_RESULTS_ROOT            private dir; a <timestamp>/ subdir is created per run
//
// Optional:
//   AF_REVIEWER_SMOKE_TIMEOUT_MS              reviewer process deadline (default 480000)
//   AF_REVIEWER_SMOKE_STOP_BEFORE_LIVE=yes    do everything up to and including the reviewer
//                                             preflight (`codex --version`, `codex login status`)
//                                             and then exit before the model call
//
// Usage (from the repository root, after `pnpm build`):
//   AF_REVIEWER_SMOKE_CONFIRM_LIVE=yes AF_REVIEWER_SMOKE_... node scripts/ops/reviewer-live-smoke.mjs

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const { serializeCodexReviewReportedResultJsonSchemaV1, createCodexIndependentReviewer } =
  await import(join(repositoryRoot, "apps/daemon/dist/codex-independent-reviewer.js"));
const { computeReviewInputDigest, parseIndependentReviewInput, runIndependentReview } =
  await import(join(repositoryRoot, "packages/independent-review/dist/index.js"));
const { canonicalJsonBytes, sha256Digest } = await import(
  join(repositoryRoot, "packages/execution-engine/dist/index.js")
);
const { TaskSpecV1Schema } = await import(join(repositoryRoot, "packages/contracts/dist/index.js"));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function requireAbsoluteEnvironment(name) {
  const value = requireEnvironment(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

if (requireEnvironment("AF_REVIEWER_SMOKE_CONFIRM_LIVE") !== "yes") {
  throw new Error("Refusing to run: AF_REVIEWER_SMOKE_CONFIRM_LIVE must be exactly 'yes'");
}
const executable = requireAbsoluteEnvironment("AF_REVIEWER_SMOKE_CODEX_EXECUTABLE");
const executableDigest = requireEnvironment("AF_REVIEWER_SMOKE_CODEX_EXECUTABLE_DIGEST");
const expectedCliVersion = requireEnvironment("AF_REVIEWER_SMOKE_CODEX_CLI_VERSION");
const model = requireEnvironment("AF_REVIEWER_SMOKE_CODEX_MODEL");
const codexHome = requireAbsoluteEnvironment("AF_REVIEWER_SMOKE_CODEX_HOME");
const smokeRoot = requireAbsoluteEnvironment("AF_REVIEWER_SMOKE_ROOT");
const resultsRoot = requireAbsoluteEnvironment("AF_REVIEWER_SMOKE_RESULTS_ROOT");
const timeoutMs = Number.parseInt(process.env.AF_REVIEWER_SMOKE_TIMEOUT_MS ?? "480000", 10);

const startedAt = new Date();
const resultsDirectory = join(resultsRoot, startedAt.toISOString().replace(/[:.]/g, "-"));
mkdirSync(resultsDirectory, { recursive: true, mode: 0o700 });
chmodSync(resultsDirectory, 0o700);

const log = [];
function note(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  log.push(line);
  process.stdout.write(`${line}\n`);
}
function writeResult(name, contents) {
  writeFileSync(join(resultsDirectory, name), contents, { mode: 0o600 });
}
function writeJsonResult(name, value) {
  writeResult(name, `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Pre-checks that never touch the model
// ---------------------------------------------------------------------------

const actualExecutableDigest = sha256Digest(readFileSync(executable));
if (actualExecutableDigest !== executableDigest) {
  throw new Error(
    `Codex executable digest mismatch: expected ${executableDigest}, got ${actualExecutableDigest}`,
  );
}
note(`Codex executable digest verified: ${actualExecutableDigest}`);

for (const path of [codexHome, smokeRoot, resultsRoot]) {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || (stats.mode & 0o077) !== 0) {
    throw new Error(`${path} must be a private (0700) directory`);
  }
}
const codexHomeEntries = readdirSync(codexHome).sort();
note(`Dedicated CODEX_HOME entries before run: ${JSON.stringify(codexHomeEntries)}`);

// ---------------------------------------------------------------------------
// Step 2: exact output schema bytes to a private file
// ---------------------------------------------------------------------------

const outputSchemaPath = join(smokeRoot, "review-result.schema.json");
writeFileSync(outputSchemaPath, serializeCodexReviewReportedResultJsonSchemaV1(), { mode: 0o600 });
chmodSync(outputSchemaPath, 0o600);
note(`Wrote exact reviewer output schema to ${outputSchemaPath}`);

// ---------------------------------------------------------------------------
// Step 3: tiny throwaway repository -> bare `git clone --mirror` as the mirror
// ---------------------------------------------------------------------------

const GIT = "/usr/bin/git";
const gitEnvironment = {
  GIT_AUTHOR_DATE: "2026-08-17T12:00:00Z",
  GIT_AUTHOR_EMAIL: "reviewer-smoke@example.invalid",
  GIT_AUTHOR_NAME: "Reviewer Smoke",
  GIT_COMMITTER_DATE: "2026-08-17T12:00:00Z",
  GIT_COMMITTER_EMAIL: "reviewer-smoke@example.invalid",
  GIT_COMMITTER_NAME: "Reviewer Smoke",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin",
};
function git(cwd, args, options = {}) {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: options.binary === true ? null : "utf8",
    env: gitEnvironment,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr)}`);
  }
  return options.binary === true ? result.stdout : result.stdout.trim();
}

const throwawayRoot = join(smokeRoot, "throwaway");
rmSync(throwawayRoot, { force: true, recursive: true });
const source = join(throwawayRoot, "source");
mkdirSync(join(source, "Sources", "Greeter"), { recursive: true, mode: 0o700 });
git(source, ["init", "--initial-branch=main", "--quiet"]);
writeFileSync(
  join(source, "Sources", "Greeter", "Greeter.swift"),
  [
    "public struct Greeter {",
    "    public init() {}",
    "",
    "    public func greeting(for name: String) -> String {",
    '        return "Hello, \\(name)"',
    "    }",
    "}",
    "",
  ].join("\n"),
);
writeFileSync(
  join(source, "README.md"),
  "# Greeter\n\nA tiny throwaway package for the reviewer smoke.\n",
);
git(source, ["add", "--all"]);
git(source, ["commit", "--quiet", "-m", "base: greeter without punctuation"]);
const baseCommit = git(source, ["rev-parse", "HEAD"]);

// The "implementer's" change: trim the name and add a trailing exclamation mark.
writeFileSync(
  join(source, "Sources", "Greeter", "Greeter.swift"),
  [
    "public struct Greeter {",
    "    public init() {}",
    "",
    "    public func greeting(for name: String) -> String {",
    "        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)",
    '        return "Hello, \\(trimmed)!"',
    "    }",
    "}",
    "",
  ].join("\n"),
);
git(source, ["add", "--all"]);
git(source, ["commit", "--quiet", "-m", "greeter: trim the name and add an exclamation mark"]);
const candidateCommit = git(source, ["rev-parse", "HEAD"]);
const candidateTree = git(source, ["rev-parse", "HEAD^{tree}"]);
const diffBytes = git(source, ["diff", "--no-color", `${baseCommit}..${candidateCommit}`], {
  binary: true,
});

const mirrorPath = join(throwawayRoot, "mirror.git");
git(throwawayRoot, ["clone", "--quiet", "--mirror", "--no-local", source, mirrorPath]);
note(`Throwaway repo base ${baseCommit}, candidate ${candidateCommit}, tree ${candidateTree}`);
note(`Bare mirror at ${mirrorPath}`);

// ---------------------------------------------------------------------------
// Steps 3-4: real evidence bytes + a real IndependentReviewInput
// ---------------------------------------------------------------------------

const policyBytes = Buffer.from(
  "reviewer-smoke policy v1: only Sources/Greeter/Greeter.swift may change.\n",
  "utf8",
);
const policyDigest = sha256Digest(policyBytes);
const taskSpec = TaskSpecV1Schema.parse({
  schemaVersion: 1,
  taskId: randomUUID(),
  projectId: randomUUID(),
  createdAt: startedAt.toISOString(),
  title: "Trim the greeted name and end the greeting with an exclamation mark",
  objective:
    "Change Greeter.greeting(for:) so surrounding whitespace in `name` is trimmed and the returned string ends with `!`. Do not change the public API.",
  acceptanceCriteria: [
    {
      id: "trims-name",
      statement: 'greeting(for: "  Ada ") returns "Hello, Ada!".',
      verification: "review",
    },
    {
      id: "api-unchanged",
      statement: "The public signature of Greeter and greeting(for:) is unchanged.",
      verification: "review",
    },
  ],
  base: { repositoryId: randomUUID(), commit: baseCommit },
  requestedScope: { paths: ["Sources/Greeter/Greeter.swift"] },
  policyDigest,
});
const taskSpecBytes = canonicalJsonBytes(taskSpec);
const taskSpecDigest = sha256Digest(taskSpecBytes);
const diffDigest = sha256Digest(diffBytes);
const evidence = new Map([
  [taskSpecDigest, taskSpecBytes],
  [diffDigest, diffBytes],
]);
const evidenceManifest = {
  schemaVersion: 1,
  items: [
    { kind: "task-spec", digest: taskSpecDigest },
    { kind: "diff", digest: diffDigest },
  ],
};
const evidenceManifestDigest = sha256Digest(canonicalJsonBytes(evidenceManifest));

const implementingRunId = randomUUID();
let reviewerRunId = randomUUID();
while (reviewerRunId === implementingRunId) reviewerRunId = randomUUID();
const reviewInput = parseIndependentReviewInput({
  attemptId: randomUUID(),
  implementingRunId,
  reviewerRunId,
  taskSpec,
  candidateTree,
  diffDigest,
  policyDigest,
  evidenceManifestDigest,
  rawEvidenceDigests: [taskSpecDigest, diffDigest],
});
const reviewInputDigest = computeReviewInputDigest(reviewInput);
const runKey = `review-${reviewInputDigest.slice("sha256:".length, "sha256:".length + 32)}`;
writeJsonResult("review-input.json", reviewInput);
writeResult("evidence.task-spec.json", taskSpecBytes);
writeResult("evidence.diff.patch", diffBytes);
note(`Review input digest ${reviewInputDigest} (run key ${runKey})`);

// ---------------------------------------------------------------------------
// Reviewer construction (preflight = `codex --version` + `codex login status`,
// no model call) and the ONE live call.
// ---------------------------------------------------------------------------

const runnerRoot = join(smokeRoot, "runner");
const checkoutRoot = join(smokeRoot, "checkouts");
const temporaryRoot = join(smokeRoot, "tmp");
for (const path of [runnerRoot, checkoutRoot, temporaryRoot]) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}
const workspaceRoot = join(checkoutRoot, runKey);

const configuration = {
  schemaVersion: 1,
  executable,
  executableDigest,
  expectedCliVersion,
  model,
  codexHome,
  runnerRoot,
  checkoutRoot,
  outputSchemaPath,
  environmentAllowlist: ["LANG", "LC_ALL", "PATH", "TMPDIR", "TZ"],
  environment: {
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    TMPDIR: temporaryRoot,
    TZ: "UTC",
  },
  registrationTimeoutMs: 10_000,
  pollMs: 25,
  limits: { timeoutMs },
};
writeJsonResult("reviewer-configuration.json", configuration);

const summary = {
  startedAt: startedAt.toISOString(),
  executable,
  executableDigest: actualExecutableDigest,
  expectedCliVersion,
  model,
  codexHome,
  mirrorPath,
  baseCommit,
  candidateCommit,
  candidateTree,
  taskSpecDigest,
  diffDigest,
  reviewInputDigest,
  runKey,
  liveInvocations: 0,
  outcome: null,
  report: null,
  error: null,
  preflightMs: null,
  reviewMs: null,
  usage: null,
  cleanup: null,
  resultsDirectory,
};

let reviewer;
const preflightStart = performance.now();
try {
  reviewer = await createCodexIndependentReviewer(configuration, {
    mirror: { mirrorPath },
    readEvidence: (digest) => {
      const bytes = evidence.get(digest);
      if (bytes === undefined) throw new Error(`No evidence for ${digest}`);
      return bytes;
    },
  });
} catch (error) {
  summary.outcome = "preflight-failed";
  summary.error = { name: error?.name, message: error?.message, stack: error?.stack };
  summary.preflightMs = Math.round(performance.now() - preflightStart);
  writeJsonResult("summary.json", summary);
  writeResult("log.txt", `${log.join("\n")}\n`);
  note(`PREFLIGHT FAILED: ${error?.message}`);
  process.exit(2);
}
summary.preflightMs = Math.round(performance.now() - preflightStart);
note(`Reviewer constructed; preflighted CLI version ${reviewer.cliVersion}`);

const adapter = reviewer.reviewerForRun(reviewerRunId);
if (process.env.AF_REVIEWER_SMOKE_STOP_BEFORE_LIVE === "yes") {
  summary.outcome = "stopped-before-live";
  writeJsonResult("summary.json", summary);
  writeResult("log.txt", `${log.join("\n")}\n`);
  note("AF_REVIEWER_SMOKE_STOP_BEFORE_LIVE=yes: stopping before the live call.");
  process.exit(0);
}
note("Making the ONE live runIndependentReview call now.");
summary.liveInvocations = 1;
const reviewStart = performance.now();
try {
  const report = await runIndependentReview(reviewInput, adapter);
  summary.reviewMs = Math.round(performance.now() - reviewStart);
  summary.outcome = "completed";
  summary.report = report;
  writeJsonResult("review-report.json", report);
  note(`Review completed: verdict=${report.verdict}, findings=${report.findings.length}`);
} catch (error) {
  summary.reviewMs = Math.round(performance.now() - reviewStart);
  summary.outcome = "failed";
  summary.error = { name: error?.name, message: error?.message, stack: error?.stack };
  note(`REVIEW FAILED: ${error?.name}: ${error?.message}`);
}

// ---------------------------------------------------------------------------
// Capture the supervised-run artifacts (transcript, receipt, intent) and pull
// token usage out of the JSONL `turn.completed` event if the CLI reported it.
// ---------------------------------------------------------------------------

const runDirectory = join(runnerRoot, runKey);
const captured = {};
for (const name of ["intent.json", "receipt.json", "stdout.bin", "stderr.bin"]) {
  const path = join(runDirectory, name);
  if (existsSync(path)) {
    const target =
      name === "stdout.bin"
        ? "codex-stdout.jsonl"
        : name === "stderr.bin"
          ? "codex-stderr.txt"
          : `supervised-${name}`;
    copyFileSync(path, join(resultsDirectory, target));
    chmodSync(join(resultsDirectory, target), 0o600);
    captured[name] = target;
  }
}
summary.capturedSupervisedArtifacts = captured;
if (existsSync(join(runDirectory, "stdout.bin"))) {
  const stdoutText = readFileSync(join(runDirectory, "stdout.bin"), "utf8");
  const events = [];
  for (const line of stdoutText.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      events.push({ unparsable: line.slice(0, 200) });
    }
  }
  summary.eventTypes = events.map((event) => event?.type ?? "?");
  const terminal = events.find(
    (event) => event?.type === "turn.completed" || event?.type === "turn.failed",
  );
  summary.usage = terminal?.usage ?? null;
  summary.terminalEvent = terminal ?? null;
  const commands = events
    .filter(
      (event) => event?.type === "item.completed" && event?.item?.type === "command_execution",
    )
    .map((event) => ({
      command: event.item.command,
      exit_code: event.item.exit_code,
      status: event.item.status,
    }));
  summary.commandsRun = commands;
}
if (existsSync(join(runDirectory, "receipt.json"))) {
  try {
    const receipt = JSON.parse(readFileSync(join(runDirectory, "receipt.json"), "utf8"));
    summary.receipt = {
      terminationOrigin: receipt.terminationOrigin,
      process: receipt.process,
      startedAt: receipt.startedAt,
      endedAt: receipt.endedAt,
    };
  } catch {
    summary.receipt = "unreadable";
  }
}

// ---------------------------------------------------------------------------
// Step 6: cleanup checks
// ---------------------------------------------------------------------------

function listWritable(root) {
  const writable = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stats = lstatSync(path);
      if ((stats.mode & 0o222) !== 0)
        writable.push({ path, mode: (stats.mode & 0o777).toString(8) });
      if (stats.isDirectory() && !stats.isSymbolicLink()) walk(path);
    }
  };
  walk(root);
  return writable;
}
summary.cleanup = {
  workspaceRoot,
  workspaceRootStillExists: existsSync(workspaceRoot),
  checkoutRootEntries: readdirSync(checkoutRoot).sort(),
  writableUnderCheckoutRoot: listWritable(checkoutRoot),
  codexHomeEntriesAfter: readdirSync(codexHome).sort(),
};
summary.endedAt = new Date().toISOString();
writeJsonResult("summary.json", summary);
writeResult("log.txt", `${log.join("\n")}\n`);

process.stdout.write("\n=== reviewer live smoke summary ===\n");
process.stdout.write(`outcome:            ${summary.outcome}\n`);
process.stdout.write(`live invocations:   ${summary.liveInvocations}\n`);
process.stdout.write(`verdict:            ${summary.report?.verdict ?? "(none)"}\n`);
process.stdout.write(`findings:           ${summary.report?.findings?.length ?? "(none)"}\n`);
process.stdout.write(`usage:              ${JSON.stringify(summary.usage)}\n`);
process.stdout.write(`preflight/review ms: ${summary.preflightMs} / ${summary.reviewMs}\n`);
process.stdout.write(
  `checkout cleaned:   ${!summary.cleanup.workspaceRootStillExists}, writable left: ${summary.cleanup.writableUnderCheckoutRoot.length}\n`,
);
process.stdout.write(`error:              ${summary.error?.message ?? "(none)"}\n`);
process.stdout.write(`results:            ${resultsDirectory}\n`);
process.exit(summary.outcome === "completed" ? 0 : 1);
