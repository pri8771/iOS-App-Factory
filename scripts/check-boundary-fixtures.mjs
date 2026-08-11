import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = fileURLToPath(new URL("../dependency-cruiser.config.cjs", import.meta.url));
const fixturesRoot = fileURLToPath(
  new URL("../tests/dependency-boundaries/fixtures/", import.meta.url),
);

const cases = [
  ["cli-imports-kernel", "clients-use-command-boundary-only"],
  ["kernel-imports-agent-runner", "kernel-imports-contracts-only"],
  ["adapter-imports-kernel", "adapter-sdk-must-not-import-kernel"],
  ["package-imports-daemon", "packages-must-not-import-apps"],
  ["circular-packages", "no-circular-workspace-dependencies"],
];

const pnpmExecutable = process.env.npm_execpath;
if (pnpmExecutable === undefined) {
  console.error("Boundary fixture checks must run through `pnpm boundaries:test`.");
  process.exit(1);
}

const failures = [];

for (const [fixture, expectedRule] of cases) {
  const fixturePath = `${fixturesRoot}${fixture}`;
  const result = spawnSync(
    process.execPath,
    [pnpmExecutable, "exec", "depcruise", "--config", config, "--output-type", "json", fixturePath],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  if (result.error !== undefined) {
    failures.push(`${fixture}: could not execute dependency-cruiser: ${result.error.message}`);
    continue;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    failures.push(`${fixture}: dependency-cruiser did not return JSON: ${result.stderr.trim()}`);
    continue;
  }

  const ruleNames = new Set(
    (report.summary?.violations ?? []).map((violation) => violation.rule?.name),
  );

  const errorCount = report.summary?.error;
  if (!Number.isSafeInteger(errorCount) || errorCount < 1 || !ruleNames.has(expectedRule)) {
    failures.push(
      `${fixture}: expected at least one error and rule ${expectedRule}; got ${String(
        errorCount,
      )} errors, process status ${String(result.status)}, and rules ${
        [...ruleNames].join(", ") || "none"
      }.`,
    );
  }
}

if (failures.length > 0) {
  console.error("Dependency-boundary fixture checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Dependency-boundary fixtures OK: ${cases.length} invalid graphs were rejected.`);
