import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GitObjectIdSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
  type GitObjectId,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";

const FIXTURE_TEMPLATE_ROOT = fileURLToPath(
  new URL("../../../fixtures/swift-greeter/", import.meta.url),
);
const FIXED_GIT_DATE = "2000-01-01T00:00:00.000Z";
const COMMAND_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;

export const SWIFT_GREETER_TEMPLATE_FILES = [
  ".gitignore",
  "FactoryAcceptance/FarewellAcceptanceTests.swift",
  "Package.swift",
  "README.md",
  "Sources/Greeter/GreetingFormatter.swift",
  "Tests/GreeterTests/GreetingFormatterTests.swift",
] as const;

export const SWIFT_GREETER_AUTHORIZED_WRITE_PATHS = [
  "Sources/Greeter/GreetingFormatter.swift",
] as const;

export const SWIFT_GREETER_PROTECTED_PATHS = [
  ".gitignore",
  "FactoryAcceptance",
  "Package.swift",
  "Tests",
] as const;

export const SWIFT_GREETER_ACCEPTANCE_SOURCE_PATH =
  "FactoryAcceptance/FarewellAcceptanceTests.swift";
export const SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH =
  "Tests/GreeterTests/FarewellAcceptanceTests.swift";

export type FixturePathDigest = Readonly<{
  path: string;
  digest: Sha256Digest;
}>;

export type SwiftGreeterFixtureSnapshot = Readonly<{
  digest: Sha256Digest;
  files: readonly FixturePathDigest[];
}>;

export type MaterializedSwiftGreeterFixture = Readonly<{
  repositoryPath: string;
  baseCommit: GitObjectId;
  baseTree: GitObjectId;
  templateSnapshot: SwiftGreeterFixtureSnapshot;
  protectedPathDigests: readonly FixturePathDigest[];
  policyDigest: Sha256Digest;
  taskSpec: TaskSpecV1;
}>;

export type SwiftTestResult = Readonly<{
  executable: "swift";
  args: readonly ["test", "--package-path", string];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  passed: boolean;
  stdout: string;
  stderr: string;
}>;

export type InvalidTaskSpecSample = Readonly<{
  name: string;
  value: unknown;
}>;

function sha256(contents: string | Buffer): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(contents).digest("hex")}`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertAbsoluteDirectory(path: string, label: string): void {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path: ${path}`);
  }
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} must exist and be a directory: ${path}`);
  }
}

function assertPathInside(root: string, path: string): void {
  const child = relative(resolve(root), resolve(path));
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Fixture path is not a child of the repository: ${path}`);
  }
}

function runRequiredCommand(executable: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: FIXED_GIT_DATE,
      GIT_AUTHOR_EMAIL: "fixture@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Fixture",
      GIT_COMMITTER_DATE: FIXED_GIT_DATE,
      GIT_COMMITTER_EMAIL: "fixture@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Fixture",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    },
    maxBuffer: COMMAND_OUTPUT_LIMIT_BYTES,
    timeout: 30_000,
  });

  if (result.error !== undefined) {
    throw new Error(`${executable} could not run: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(" ")} exited ${String(result.status)}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function listFilesRecursively(root: string, current = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(root, absolutePath));
    } else if (entry.isFile()) {
      files.push(relative(root, absolutePath).split(sep).join("/"));
    } else {
      throw new Error(
        `Fixture templates may not contain symbolic links or special files: ${absolutePath}`,
      );
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function digestFiles(root: string, files: readonly string[]): SwiftGreeterFixtureSnapshot {
  const entries = files.map((path) => ({
    path,
    digest: sha256(readFileSync(join(root, path))),
  }));
  return {
    files: entries,
    digest: sha256(stableJson(entries)),
  };
}

function digestProtectedPath(repositoryPath: string, protectedPath: string): FixturePathDigest {
  const absolutePath = join(repositoryPath, protectedPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Protected fixture path does not exist: ${protectedPath}`);
  }

  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    return { path: protectedPath, digest: sha256(readFileSync(absolutePath)) };
  }
  if (!stat.isDirectory()) {
    throw new Error(`Protected fixture path is not a regular file or directory: ${protectedPath}`);
  }

  const files = listFilesRecursively(absolutePath);
  return {
    path: protectedPath,
    digest: digestFiles(absolutePath, files).digest,
  };
}

function copyTemplateFile(sourceRoot: string, repositoryPath: string, path: string): void {
  const source = join(sourceRoot, path);
  const destination = join(repositoryPath, path);
  assertPathInside(sourceRoot, source);
  assertPathInside(repositoryPath, destination);
  if (!statSync(source).isFile()) {
    throw new Error(`Expected a regular fixture template file: ${path}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source), { mode: 0o644 });
  chmodSync(destination, 0o644);
}

function makePolicyDigest(protectedPathDigests: readonly FixturePathDigest[]): Sha256Digest {
  return sha256(
    stableJson({
      schemaVersion: 1,
      authorizedWritePaths: SWIFT_GREETER_AUTHORIZED_WRITE_PATHS,
      protectedPathDigests,
    }),
  );
}

export function inspectSwiftGreeterTemplate(): SwiftGreeterFixtureSnapshot {
  const actualFiles = listFilesRecursively(FIXTURE_TEMPLATE_ROOT).filter(
    (path) => !path.startsWith(".build/") && !path.startsWith(".swiftpm/"),
  );
  const expectedFiles = [...SWIFT_GREETER_TEMPLATE_FILES].sort((left, right) =>
    left.localeCompare(right),
  );
  if (stableJson(actualFiles) !== stableJson(expectedFiles)) {
    throw new Error(
      `Swift Greeter template manifest drifted. Expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}.`,
    );
  }
  return digestFiles(FIXTURE_TEMPLATE_ROOT, expectedFiles);
}

export function createFarewellTaskSpec(
  baseCommit: GitObjectId,
  policyDigest: Sha256Digest,
): TaskSpecV1 {
  return TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: "00000000-0000-4000-8000-000000000103",
    projectId: "00000000-0000-4000-8000-000000000101",
    createdAt: "2026-08-10T12:00:00.000Z",
    title: "Add a farewell to GreetingFormatter",
    objective:
      "Add a public farewell(for:) method to GreetingFormatter that returns `Goodbye, <name>!`. Change only the authorized source file; do not modify tests, package configuration, or acceptance assets.",
    acceptanceCriteria: [
      {
        id: "returns-farewell",
        statement: 'farewell(for: "Factory") returns "Goodbye, Factory!".',
        verification: "automated",
      },
      {
        id: "preserves-greeting",
        statement: "The existing greeting behavior and baseline tests still pass.",
        verification: "automated",
      },
      {
        id: "respects-scope",
        statement: "No path outside Sources/Greeter/GreetingFormatter.swift changes.",
        verification: "review",
      },
    ],
    base: {
      repositoryId: "00000000-0000-4000-8000-000000000102",
      commit: baseCommit,
    },
    requestedScope: {
      paths: SWIFT_GREETER_AUTHORIZED_WRITE_PATHS,
    },
    policyDigest,
  });
}

export function createInvalidFarewellTaskSpecSamples(
  validTaskSpec: TaskSpecV1,
): readonly InvalidTaskSpecSample[] {
  return [
    {
      name: "parent-path-scope",
      value: {
        ...validTaskSpec,
        requestedScope: { paths: ["../Tests/GreeterTests/GreetingFormatterTests.swift"] },
      },
    },
    {
      name: "absolute-path-scope",
      value: {
        ...validTaskSpec,
        requestedScope: { paths: ["/tmp/escape.swift"] },
      },
    },
    {
      name: "unknown-policy-override",
      value: { ...validTaskSpec, bypassProtectedPaths: true },
    },
  ];
}

export function materializeSwiftGreeterFixture(
  options: {
    temporaryRoot?: string;
  } = {},
): MaterializedSwiftGreeterFixture {
  const temporaryRoot = options.temporaryRoot ?? tmpdir();
  assertAbsoluteDirectory(temporaryRoot, "Fixture temporary root");
  const beforeSnapshot = inspectSwiftGreeterTemplate();
  const repositoryPath = mkdtempSync(join(temporaryRoot, "app-factory-swift-greeter-"));

  try {
    for (const path of SWIFT_GREETER_TEMPLATE_FILES) {
      copyTemplateFile(FIXTURE_TEMPLATE_ROOT, repositoryPath, path);
    }

    runRequiredCommand(
      "git",
      ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"],
      repositoryPath,
    );
    runRequiredCommand("git", ["add", "--all"], repositoryPath);
    runRequiredCommand(
      "git",
      [
        "-c",
        "commit.gpgSign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--quiet",
        "--no-gpg-sign",
        "--no-verify",
        "--message=Create deterministic Swift Greeter baseline",
      ],
      repositoryPath,
    );

    const baseCommit = GitObjectIdSchema.parse(
      runRequiredCommand("git", ["rev-parse", "--verify", "HEAD"], repositoryPath).trim(),
    );
    const baseTree = GitObjectIdSchema.parse(
      runRequiredCommand("git", ["rev-parse", "--verify", "HEAD^{tree}"], repositoryPath).trim(),
    );
    const status = runRequiredCommand(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      repositoryPath,
    );
    if (status !== "") {
      throw new Error(`Materialized Swift fixture is unexpectedly dirty: ${status.trim()}`);
    }

    const afterSnapshot = inspectSwiftGreeterTemplate();
    if (afterSnapshot.digest !== beforeSnapshot.digest) {
      throw new Error("Materializing the Swift fixture changed the canonical template.");
    }

    const protectedPathDigests = SWIFT_GREETER_PROTECTED_PATHS.map((path) =>
      digestProtectedPath(repositoryPath, path),
    );
    const policyDigest = makePolicyDigest(protectedPathDigests);

    return {
      repositoryPath,
      baseCommit,
      baseTree,
      templateSnapshot: beforeSnapshot,
      protectedPathDigests,
      policyDigest,
      taskSpec: createFarewellTaskSpec(baseCommit, policyDigest),
    };
  } catch (error) {
    rmSync(repositoryPath, { force: true, recursive: true });
    throw error;
  }
}

/**
 * Runs the baseline package check. Materialization never calls this function;
 * callers must explicitly choose when the trusted Swift toolchain is executed.
 */
export function runSwiftGreeterTests(
  repositoryPath: string,
  options: { timeoutMs?: number } = {},
): SwiftTestResult {
  assertAbsoluteDirectory(repositoryPath, "Swift fixture repository");
  const args = ["test", "--package-path", repositoryPath] as const;
  const moduleCache = join(repositoryPath, ".build", "clang-module-cache");
  mkdirSync(moduleCache, { recursive: true });
  const result = spawnSync("swift", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCache,
      LANG: "C",
      LC_ALL: "C",
      SWIFT_DETERMINISTIC_HASHING: "1",
      SWIFTPM_MODULECACHE_OVERRIDE: moduleCache,
      TZ: "UTC",
    },
    maxBuffer: COMMAND_OUTPUT_LIMIT_BYTES,
    timeout: options.timeoutMs ?? 120_000,
  });

  if (result.error !== undefined) {
    throw new Error(`swift test could not run: ${result.error.message}`, {
      cause: result.error,
    });
  }

  return {
    executable: "swift",
    args,
    exitCode: result.status,
    signal: result.signal,
    passed: result.status === 0 && result.signal === null,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Copies the canonical trusted acceptance test into a verifier-owned checkout.
 * The caller must first prove the candidate did not change protected paths.
 */
export function injectTrustedFarewellAcceptanceTest(
  verifierCheckoutPath: string,
): FixturePathDigest {
  assertAbsoluteDirectory(verifierCheckoutPath, "Verifier checkout");
  const source = join(FIXTURE_TEMPLATE_ROOT, SWIFT_GREETER_ACCEPTANCE_SOURCE_PATH);
  const destination = join(verifierCheckoutPath, SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH);
  assertPathInside(verifierCheckoutPath, destination);
  if (existsSync(destination)) {
    throw new Error(
      `Refusing to overwrite an existing acceptance test: ${SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH}`,
    );
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source), { mode: 0o644 });
  chmodSync(destination, 0o644);
  return {
    path: SWIFT_GREETER_ACCEPTANCE_INJECTION_PATH,
    digest: sha256(readFileSync(destination)),
  };
}
