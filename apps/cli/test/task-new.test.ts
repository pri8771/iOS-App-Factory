import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RepositoryIdSchema, TaskSpecV1Schema } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { CliUsageError } from "../src/cli-errors.js";
import {
  buildTaskSpecFromOptions,
  parseTaskNewArguments,
  renderTaskNewResult,
  writeTaskNewOutput,
} from "../src/task-new.js";

const PROJECT_ID = "00000000-0000-4000-8000-000000000006";
const TASK_ID = "00000000-0000-4000-8000-000000000007";
const CREATED_AT = "2026-08-10T12:00:00.000Z";
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
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function gitOutput(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Materializes a real temp Git repository, reviewed-policy file, and
 * acceptance-criteria file, and an execution profile JSON that binds them
 * together the way `factory task new --profile <path>` expects.
 */
function fixture(): Readonly<{
  root: string;
  sourceRepositoryPath: string;
  policyFile: string;
  profilePath: string;
  acceptancePath: string;
  policyBytes: Buffer;
  baseCommit: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "af-cli-task-new-"));
  roots.push(root);
  const sourceRepositoryPath = join(root, "repo");
  mkdirSync(sourceRepositoryPath, { recursive: true });
  writeFileSync(join(sourceRepositoryPath, "README.md"), "hello\n");
  git(sourceRepositoryPath, ["init", "--quiet", "--initial-branch=main"]);
  git(sourceRepositoryPath, ["add", "--all"]);
  git(sourceRepositoryPath, ["-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "init"]);
  const baseCommit = gitOutput(sourceRepositoryPath, ["rev-parse", "HEAD"]);

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

  return {
    root,
    sourceRepositoryPath,
    policyFile,
    profilePath,
    acceptancePath,
    policyBytes,
    baseCommit,
  };
}

function baseArgv(f: ReturnType<typeof fixture>): string[] {
  return [
    "--profile",
    f.profilePath,
    "--title",
    "Add a farewell",
    "--objective",
    "Add a farewell method.",
    "--acceptance",
    f.acceptancePath,
    "--project-id",
    PROJECT_ID,
    "--scope",
    "src/Greeter.swift",
    "--task-id",
    TASK_ID,
    "--created-at",
    CREATED_AT,
  ];
}

function withoutOption(argv: readonly string[], option: string): string[] {
  return argv.filter((token, index, all) => !(token === option || all[index - 1] === option));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("parseTaskNewArguments", () => {
  it("parses a complete argument set", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    expect(options).toEqual({
      profilePath: f.profilePath,
      title: "Add a farewell",
      objective: "Add a farewell method.",
      acceptancePath: f.acceptancePath,
      scopePaths: ["src/Greeter.swift"],
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      createdAt: CREATED_AT,
      policyPathOverride: null,
      outPath: null,
      gitExecutable: "git",
      run: false,
    });
  });

  it("collects repeated --scope flags in order", () => {
    const f = fixture();
    const argv = withoutOption(baseArgv(f), "--scope");
    const options = parseTaskNewArguments([
      ...argv,
      "--scope",
      "a/one.swift",
      "--scope",
      "b/two.swift",
    ]);
    expect(options.scopePaths).toEqual(["a/one.swift", "b/two.swift"]);
  });

  it("parses --run, --out, --policy, and --git", () => {
    const f = fixture();
    const options = parseTaskNewArguments([
      ...baseArgv(f),
      "--run",
      "--out",
      "/tmp/out.json",
      "--policy",
      "/tmp/other-policy.txt",
      "--git",
      "/usr/local/bin/git",
    ]);
    expect(options).toMatchObject({
      run: true,
      outPath: "/tmp/out.json",
      policyPathOverride: "/tmp/other-policy.txt",
      gitExecutable: "/usr/local/bin/git",
    });
  });

  it("rejects a missing --profile", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--profile"))).toThrow(
      /--profile is required/u,
    );
  });

  it("rejects a missing --title", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--title"))).toThrow(
      /--title is required/u,
    );
  });

  it("rejects a missing --objective", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--objective"))).toThrow(
      /--objective is required/u,
    );
  });

  it("rejects a missing --acceptance", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--acceptance"))).toThrow(
      /--acceptance is required/u,
    );
  });

  it("rejects a missing --project-id", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--project-id"))).toThrow(
      /--project-id is required/u,
    );
  });

  it("rejects zero --scope flags", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--scope"))).toThrow(
      /--scope is required/u,
    );
  });

  it("rejects a malformed --project-id", () => {
    const f = fixture();
    const argv = baseArgv(f);
    argv[argv.indexOf("--project-id") + 1] = "not-a-uuid";
    expect(() => parseTaskNewArguments(argv)).toThrow(/--project-id/u);
  });

  it("rejects a malformed --task-id", () => {
    const f = fixture();
    const argv = baseArgv(f);
    argv[argv.indexOf("--task-id") + 1] = "not-a-uuid";
    expect(() => parseTaskNewArguments(argv)).toThrow(/--task-id/u);
  });

  it("rejects a malformed --created-at", () => {
    const f = fixture();
    const argv = baseArgv(f);
    argv[argv.indexOf("--created-at") + 1] = "not-an-instant";
    expect(() => parseTaskNewArguments(argv)).toThrow(/--created-at/u);
  });

  it("rejects a duplicated flag", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments([...baseArgv(f), "--profile", f.profilePath])).toThrow(
      /may only be provided once/u,
    );
  });

  it("rejects a trailing unexpected argument", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments([...baseArgv(f), "extra"])).toThrow(/Unexpected argument/u);
  });

  it("rejects every thrown error as a CliUsageError", () => {
    const f = fixture();
    expect(() => parseTaskNewArguments(withoutOption(baseArgv(f), "--title"))).toThrow(
      CliUsageError,
    );
  });
});

// A local, generic SHA-256 hex digest for cross-checking output shape only.
// This is deliberately NOT @app-factory/execution-engine's sha256Digest:
// apps/cli may only depend on @app-factory/command-client and
// @app-factory/contracts (see dependency-cruiser.config.cjs
// "clients-use-command-boundary-only"). The real cross-package digest-parity
// proof against @app-factory/kernel and @app-factory/execution-engine lives
// in apps/daemon/test/task-new-digest-parity.test.ts.
function rawSha256Digest(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

describe("buildTaskSpecFromOptions digest computation", () => {
  it("computes a policyDigest and a deterministic, input-sensitive taskSpecDigest", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    const build = buildTaskSpecFromOptions(options);

    expect(build.policyDigest).toBe(rawSha256Digest(f.policyBytes));
    expect(build.taskSpec.policyDigest).toBe(build.policyDigest);
    expect(build.taskSpecDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);

    // Deterministic: rebuilding from the exact same inputs reproduces the
    // exact same digest.
    expect(buildTaskSpecFromOptions(options).taskSpecDigest).toBe(build.taskSpecDigest);

    // Input-sensitive: changing any bound field changes the digest.
    const differentTitle = buildTaskSpecFromOptions({ ...options, title: "A different title" });
    expect(differentTitle.taskSpecDigest).not.toBe(build.taskSpecDigest);

    // The assembled TaskSpec is a valid, ready-to-submit TaskSpecV1.
    expect(TaskSpecV1Schema.parse(build.taskSpec)).toEqual(build.taskSpec);
    expect(build.taskSpec).toMatchObject({
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      createdAt: CREATED_AT,
      title: "Add a farewell",
      objective: "Add a farewell method.",
      base: { repositoryId: REPOSITORY_ID, commit: f.baseCommit },
      requestedScope: { paths: ["src/Greeter.swift"] },
    });
    expect(build.taskSpec.acceptanceCriteria).toHaveLength(2);
  });

  it("derives base.commit from the profile's live source repository", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    const build = buildTaskSpecFromOptions(options);
    expect(build.taskSpec.base.commit).toBe(
      gitOutput(f.sourceRepositoryPath, ["rev-parse", "HEAD"]),
    );
  });

  it("honors a --policy override for the reviewed policy bytes", () => {
    const f = fixture();
    const overridePath = join(f.root, "override-policy.txt");
    const overrideBytes = Buffer.from("A different reviewed policy.\n", "utf8");
    writeFileSync(overridePath, overrideBytes);
    const options = parseTaskNewArguments([...baseArgv(f), "--policy", overridePath]);
    const build = buildTaskSpecFromOptions(options);
    expect(build.policyDigest).toBe(rawSha256Digest(overrideBytes));
    expect(build.policyDigest).not.toBe(rawSha256Digest(f.policyBytes));
  });

  it("generates a valid default taskId and createdAt when omitted", () => {
    const f = fixture();
    const argv = withoutOption(withoutOption(baseArgv(f), "--task-id"), "--created-at");
    const options = parseTaskNewArguments(argv);
    const fixedNow = new Date("2026-08-12T00:00:00.000Z");
    const build = buildTaskSpecFromOptions(options, {
      now: () => fixedNow,
      createTaskId: () => "11111111-1111-4111-8111-111111111111",
    });
    expect(build.taskSpec.taskId).toBe("11111111-1111-4111-8111-111111111111");
    expect(build.taskSpec.createdAt).toBe("2026-08-12T00:00:00.000Z");
  });
});

describe("buildTaskSpecFromOptions fails closed on malformed inputs", () => {
  it("rejects a profile path that does not exist", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    const missing = { ...options, profilePath: join(f.root, "missing-profile.json") };
    expect(() => buildTaskSpecFromOptions(missing)).toThrow(CliUsageError);
  });

  it("rejects a profile that is not valid JSON", () => {
    const f = fixture();
    writeFileSync(f.profilePath, "not json");
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/valid JSON/u);
  });

  it("rejects a profile with a missing or extra field", () => {
    const f = fixture();
    writeFileSync(
      f.profilePath,
      JSON.stringify({
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        sourceRepositoryPath: f.sourceRepositoryPath,
        policyFile: f.policyFile,
        unexpected: true,
      }),
    );
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/exactly schemaVersion/u);
  });

  it("rejects a profile with a non-absolute sourceRepositoryPath", () => {
    const f = fixture();
    writeFileSync(
      f.profilePath,
      JSON.stringify({
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        sourceRepositoryPath: "relative/path",
        policyFile: f.policyFile,
      }),
    );
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/normalized absolute path/u);
  });

  it("rejects a profile with an invalid repositoryId", () => {
    const f = fixture();
    writeFileSync(
      f.profilePath,
      JSON.stringify({
        schemaVersion: 1,
        repositoryId: "not-a-uuid",
        sourceRepositoryPath: f.sourceRepositoryPath,
        policyFile: f.policyFile,
      }),
    );
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/repositoryId/u);
  });

  it("rejects an empty reviewed policy file", () => {
    const f = fixture();
    writeFileSync(f.policyFile, Buffer.alloc(0));
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(CliUsageError);
  });

  it("rejects a reviewed policy file with invalid UTF-8", () => {
    const f = fixture();
    writeFileSync(f.policyFile, Buffer.from([0xff, 0xfe, 0xfd]));
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/valid UTF-8/u);
  });

  it("rejects an acceptance file that is not a JSON array", () => {
    const f = fixture();
    writeFileSync(f.acceptancePath, JSON.stringify({ not: "an array" }));
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/JSON array/u);
  });

  it("rejects an acceptance criterion with an invalid id", () => {
    const f = fixture();
    writeFileSync(
      f.acceptancePath,
      JSON.stringify([{ id: "Not_Lowercase", statement: "x", verification: "automated" }]),
    );
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/acceptanceCriteria\[0\]/u);
  });

  it("rejects an absolute --scope path", () => {
    const f = fixture();
    const argv = baseArgv(f);
    argv[argv.indexOf("--scope") + 1] = "/etc/passwd";
    const options = parseTaskNewArguments(argv);
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/normalized relative path/u);
  });

  it("rejects a source repository that is not a Git repository", () => {
    const f = fixture();
    const notARepo = join(f.root, "not-a-repo");
    mkdirSync(notARepo, { recursive: true });
    writeFileSync(
      f.profilePath,
      JSON.stringify({
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        sourceRepositoryPath: notARepo,
        policyFile: f.policyFile,
      }),
    );
    const options = parseTaskNewArguments(baseArgv(f));
    expect(() => buildTaskSpecFromOptions(options)).toThrow(/base commit/u);
  });
});

describe("writeTaskNewOutput and renderTaskNewResult", () => {
  it("writes the TaskSpec JSON and refuses to overwrite an existing file", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    const build = buildTaskSpecFromOptions(options);
    const outPath = join(f.root, "task.json");

    writeTaskNewOutput(build, outPath);
    expect(existsSync(outPath)).toBe(true);
    const written: unknown = JSON.parse(readFileSync(outPath, "utf8"));
    expect(TaskSpecV1Schema.parse(written)).toEqual(build.taskSpec);

    expect(() => writeTaskNewOutput(build, outPath)).toThrow(CliUsageError);
  });

  it("renders a human summary and a machine-stable JSON envelope", () => {
    const f = fixture();
    const options = parseTaskNewArguments(baseArgv(f));
    const build = buildTaskSpecFromOptions(options);

    const human = renderTaskNewResult(build, null, "human");
    expect(human).toContain(`taskSpecDigest ${build.taskSpecDigest}`);
    expect(human).toContain(`policyDigest ${build.policyDigest}`);

    const withOut = renderTaskNewResult(build, "/tmp/task.json", "human");
    expect(withOut).toContain("task.new: wrote /tmp/task.json");

    const json = renderTaskNewResult(build, null, "json");
    expect(JSON.parse(json)).toEqual({
      ok: true,
      result: {
        operation: "task.new",
        taskSpec: build.taskSpec,
        taskSpecDigest: build.taskSpecDigest,
        policyDigest: build.policyDigest,
        outPath: null,
      },
    });
  });
});
