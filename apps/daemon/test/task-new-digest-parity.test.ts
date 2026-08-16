import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RepositoryIdSchema } from "@app-factory/contracts";
import { sha256Digest } from "@app-factory/execution-engine";
import { computeTaskSpecDigest } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

// apps/cli is restricted to depending only on @app-factory/command-client and
// @app-factory/contracts (see dependency-cruiser.config.cjs
// "clients-use-command-boundary-only"), so `factory task new` cannot import
// the daemon's or kernel's canonical digest helpers directly. It instead
// mirrors their algorithm locally (see apps/cli/src/task-new.ts). This test
// is the one place both the CLI's digest computation and the real
// @app-factory/kernel / @app-factory/execution-engine / daemon helpers may
// legally be imported together, so it is the actual proof that
// `factory task new`'s output digests match what the daemon computes.
import { buildTaskSpecFromOptions, parseTaskNewArguments } from "../../cli/src/task-new.js";
import { decodeReviewedPolicyPayload } from "../src/verified-local-executor.js";

const PROJECT_ID = "00000000-0000-4000-8000-000000000006";
const REPOSITORY_ID = RepositoryIdSchema.parse("00000000-0000-4000-8000-000000000009");

const roots: string[] = [];

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_AUTHOR_EMAIL: "fixture@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Fixture",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_EMAIL: "fixture@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Fixture",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TZ: "UTC",
    },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("factory task new digest parity with the daemon's canonical helpers", () => {
  it("computes a policyDigest and taskSpecDigest identical to what the daemon computes", () => {
    const root = mkdtempSync(join(tmpdir(), "af-daemon-task-new-parity-"));
    roots.push(root);

    const sourceRepositoryPath = join(root, "repo");
    mkdirSync(sourceRepositoryPath, { recursive: true });
    writeFileSync(join(sourceRepositoryPath, "README.md"), "hello\n");
    git(sourceRepositoryPath, ["init", "--quiet", "--initial-branch=main"]);
    git(sourceRepositoryPath, ["add", "--all"]);
    git(sourceRepositoryPath, ["-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "init"]);

    const policyFile = join(root, "policy.txt");
    const policyBytes = Buffer.from("Reviewed policy: only src/** may change.\n", "utf8");
    writeFileSync(policyFile, policyBytes);

    const acceptancePath = join(root, "acceptance.json");
    writeFileSync(
      acceptancePath,
      JSON.stringify([
        { id: "returns-farewell", statement: "It works.", verification: "automated" },
        { id: "preserves-greeting", statement: "Nothing else breaks.", verification: "automated" },
      ]),
    );

    const profilePath = join(root, "profile.json");
    writeFileSync(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        sourceRepositoryPath,
        policyFile,
      }),
    );

    const options = parseTaskNewArguments([
      "--profile",
      profilePath,
      "--title",
      "Add a farewell",
      "--objective",
      "Add a farewell method.",
      "--acceptance",
      acceptancePath,
      "--project-id",
      PROJECT_ID,
      "--scope",
      "src/Greeter.swift",
      "--task-id",
      "00000000-0000-4000-8000-000000000007",
      "--created-at",
      "2026-08-10T12:00:00.000Z",
    ]);
    const build = buildTaskSpecFromOptions(options);

    // The daemon decodes and digests the reviewed policy payload with
    // exactly this function (see decodeReviewedPolicyPayload). The CLI's
    // reimplementation must produce the identical digest for identical bytes.
    const daemonDecodedPolicy = decodeReviewedPolicyPayload(policyBytes);
    expect(build.policyDigest).toBe(daemonDecodedPolicy.digest);
    expect(build.policyDigest).toBe(sha256Digest(policyBytes));
    expect(build.taskSpec.policyDigest).toBe(build.policyDigest);

    // The daemon computes the TaskSpec digest with exactly this function
    // (see @app-factory/kernel computeTaskSpecDigest, also used by the
    // daemon's own attempt bindings and durable repositories).
    expect(build.taskSpecDigest).toBe(computeTaskSpecDigest(build.taskSpec));

    // The optional Studio phase rides through the same canonical algorithm on
    // both sides: present when requested, absent (no key, unchanged digest)
    // when not.
    const phased = buildTaskSpecFromOptions({ ...options, phase: options.phase ?? null });
    expect(phased.taskSpecDigest).toBe(build.taskSpecDigest);
    const withPhase = buildTaskSpecFromOptions(
      parseTaskNewArguments([
        "--profile",
        profilePath,
        "--title",
        "Add a farewell",
        "--objective",
        "Add a farewell method.",
        "--acceptance",
        acceptancePath,
        "--project-id",
        PROJECT_ID,
        "--scope",
        "src/Greeter.swift",
        "--task-id",
        "00000000-0000-4000-8000-000000000007",
        "--created-at",
        "2026-08-10T12:00:00.000Z",
        "--phase",
        "build",
      ]),
    );
    expect(withPhase.taskSpec.phase).toBe("build");
    expect(withPhase.taskSpecDigest).toBe(computeTaskSpecDigest(withPhase.taskSpec));
    expect(withPhase.taskSpecDigest).not.toBe(build.taskSpecDigest);
  });
});
