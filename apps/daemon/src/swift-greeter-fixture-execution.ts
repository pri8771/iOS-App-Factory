import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  NamespacedCodeSchema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  type RunId,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  VERIFICATION_SCRATCH_TOKEN,
  sha256Digest,
  type TrustedVerificationPlanTemplate,
} from "@app-factory/execution-engine";
import type { IndependentReviewAdapter } from "@app-factory/independent-review";
import { GitWorkspaceManager } from "@app-factory/git-workspace";

import {
  MAX_REVIEWED_POLICY_BYTES,
  computeTaskSemanticProfileDigest,
  decodeReviewedPolicyPayload,
  resolveVerifiedLocalExecutionPaths,
  type LocalAgentAdapter,
  type VerifiedLocalExecutionConfiguration,
} from "./verified-local-executor.js";

const MAX_CONFIGURATION_BYTES = 16 * 1024;
const MAX_FIXTURE_FILE_BYTES = 1024 * 1024;
const PRIVATE_FILE_MODE_MASK = 0o077;
const GIT = "/usr/bin/git";
const SWIFT = "/usr/bin/swift";
const GREP = "/usr/bin/grep";
const GREETER_PATH = "Sources/Greeter/GreetingFormatter.swift";
const EXPECTED_BASE_TREE = "e69344ba899cb78fb5ad51ab56f9b4750d0b13b9";
const EXPECTED_BASE_MANIFEST = Buffer.from(
  [
    "100644 blob 2d9f16e2d276179d73c91ec2022a23834caec180\t.gitignore",
    "100644 blob ba365538503399f0d8cda16808f76407e74cc512\tFactoryAcceptance/FarewellAcceptanceTests.swift",
    "100644 blob bf74be34ddeeb4bd17e66e4116abd4d4960cc4a7\tPackage.swift",
    "100644 blob dc7b2f98268e7b12393d1eb6b4257da099fc2ce5\tREADME.md",
    "100644 blob 1eed1d0f1f6959207bf20ad06e1f7356c49c90a4\tSources/Greeter/GreetingFormatter.swift",
    "100644 blob 5e298d99dce8fa241fdb89572acdced70e2f2e57\tTests/GreeterTests/GreetingFormatterTests.swift",
    "",
  ].join("\n"),
  "utf8",
);
const trustedDigest = (value: string): Sha256Digest => Sha256DigestSchema.parse(value);
const EXPECTED_FILE_DIGESTS = {
  ".gitignore": trustedDigest(
    "sha256:acc718146d21aae829cba1761475e05de39d73209d83af2ab8487a74843cead0",
  ),
  "FactoryAcceptance/FarewellAcceptanceTests.swift": trustedDigest(
    "sha256:7cc4bc464be520b6dcc822fbc82166f2f3d362dfbf756d75a0cffc1be2df6433",
  ),
  "Package.swift": trustedDigest(
    "sha256:8e943f1ea8f37eb7410fe65eded9ec6cf4d7e1769669b2f9ed537a806121cb15",
  ),
  "README.md": trustedDigest(
    "sha256:8d0ec00a1ba95c899662662a0c3cc785fa2e4fc8bfb612e64f640c10a9e8aeda",
  ),
  "Sources/Greeter/GreetingFormatter.swift": trustedDigest(
    "sha256:229366955178a673c0afbc7b3635bc050528cc958f8b20e9cd34f2fe7e256256",
  ),
  "Tests/GreeterTests/GreetingFormatterTests.swift": trustedDigest(
    "sha256:62aba571aec294578ca6824feebaf40089d38d0db3b813a365173ce4b3a60049",
  ),
} as const satisfies Readonly<Record<string, Sha256Digest>>;
const EXPECTED_GREETER_SOURCE = Buffer.from(
  [
    "public struct GreetingFormatter: Sendable {",
    "    public init() {}",
    "",
    "    public func greeting(for name: String) -> String {",
    '        "Hello, \\(name)!"',
    "    }",
    "",
    "    public func farewell(for name: String) -> String {",
    '        "Goodbye, \\(name)!"',
    "    }",
    "}",
    "",
  ].join("\n"),
  "utf8",
);
const EXPECTED_CHECKOUT_DIRECTORIES = [
  "FactoryAcceptance",
  "Sources",
  "Sources/Greeter",
  "Tests",
  "Tests/GreeterTests",
] as const;
const SWIFT_GREETER_TASK_SEMANTICS = {
  title: "Add a farewell to GreetingFormatter",
  objective:
    "Add a public farewell(for:) method that returns `Goodbye, <name>!` without changing greeting behavior.",
  acceptanceCriteria: [
    {
      id: "returns-farewell",
      statement: 'farewell(for: "Factory") returns "Goodbye, Factory!".',
      verification: "automated" as const,
    },
    {
      id: "preserves-greeting",
      statement: "Existing greeting tests continue to pass.",
      verification: "automated" as const,
    },
  ],
} as const;

type SwiftGreeterFixtureConfigurationV1 = Readonly<{
  schemaVersion: 1;
  mode: "swift-greeter-fixture-v1";
  repositoryId: string;
  sourceRepositoryPath: string;
  policyFile: string;
}>;

type FixtureEnrollment = Readonly<{
  baseCommit: string;
  baseTree: string;
  sourceIdentityDigest: Sha256Digest;
  swiftVersion: string;
  grepVersion: string;
}>;

export class SwiftGreeterFixtureConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SwiftGreeterFixtureConfigurationError";
  }
}

function configurationError(message: string): never {
  throw new SwiftGreeterFixtureConfigurationError(message);
}

function normalizedAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    configurationError(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function readBoundedRegularFile(
  path: string,
  maximumBytes: number,
  options: Readonly<{ private: boolean }>,
): Buffer {
  const descriptor = (() => {
    try {
      return openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      configurationError("A fixture configuration input cannot be opened safely.");
    }
  })();
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximumBytes) {
      configurationError("A fixture configuration input is not one bounded regular file.");
    }
    if (options.private && (before.mode & PRIVATE_FILE_MODE_MASK) !== 0) {
      configurationError("A fixture configuration input must be private to the current user.");
    }
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) {
      configurationError("A fixture configuration input must be owned by the current user.");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      bytes.byteLength !== before.size
    ) {
      configurationError("A fixture configuration input changed while it was being read.");
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function canonicalUtf8(bytes: Buffer, label: string): string {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    configurationError(`${label} must contain valid UTF-8.`);
  }
  if (value.includes("\0") || !Buffer.from(value, "utf8").equals(bytes)) {
    configurationError(`${label} must contain canonical UTF-8 without NUL bytes.`);
  }
  return value;
}

function parseConfiguration(bytes: Buffer): SwiftGreeterFixtureConfigurationV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalUtf8(bytes, "The fixture configuration")) as unknown;
  } catch (error) {
    if (error instanceof SwiftGreeterFixtureConfigurationError) throw error;
    configurationError("The fixture configuration must contain valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    configurationError("The fixture configuration must be an object.");
  }
  const record = parsed as Readonly<Record<string, unknown>>;
  const expectedKeys = [
    "mode",
    "policyFile",
    "repositoryId",
    "schemaVersion",
    "sourceRepositoryPath",
  ];
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    record.schemaVersion !== 1 ||
    record.mode !== "swift-greeter-fixture-v1"
  ) {
    configurationError("The fixture configuration has an unsupported or non-exact shape.");
  }
  const repositoryId = RepositoryIdSchema.safeParse(record.repositoryId);
  if (!repositoryId.success) configurationError("repositoryId must be a valid repository ID.");
  return {
    schemaVersion: 1,
    mode: "swift-greeter-fixture-v1",
    repositoryId: repositoryId.data,
    sourceRepositoryPath: normalizedAbsolutePath(
      record.sourceRepositoryPath,
      "sourceRepositoryPath",
    ),
    policyFile: normalizedAbsolutePath(record.policyFile, "policyFile"),
  };
}

function assertRealDirectory(path: string, label: string): string {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory() || realpathSync(path) !== path) {
    configurationError(`${label} must be a real directory without symbolic-link traversal.`);
  }
  return path;
}

function ensurePrivateRuntimeDirectory(path: string, label: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const real = assertRealDirectory(path, label);
  const stats = lstatSync(real);
  if (
    (stats.mode & PRIVATE_FILE_MODE_MASK) !== 0 ||
    (typeof process.getuid === "function" && stats.uid !== process.getuid())
  ) {
    configurationError(`${label} must be private to the current user.`);
  }
  return real;
}

function assertTrustedSystemExecutable(path: string, label: string): string {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    realpathSync(path) !== path ||
    stats.uid !== 0 ||
    (stats.mode & 0o022) !== 0
  ) {
    configurationError(`${label} must be an immutable root-owned system executable.`);
  }
  if ((stats.mode & 0o111) === 0) configurationError(`${label} is not executable.`);
  return path;
}

function runBoundedProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  maximumBytes = MAX_FIXTURE_FILE_BYTES,
): Buffer {
  const result = spawnSync(executable, [...args], {
    cwd,
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_PAGER: "cat",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    },
    maxBuffer: maximumBytes,
    shell: false,
    timeout: 5_000,
  });
  if (result.error !== undefined || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    configurationError("A deterministic fixture enrollment probe failed closed.");
  }
  return result.stdout;
}

function assertSafeLocalGitConfiguration(sourceRoot: string): void {
  const gitDirectory = assertRealDirectory(join(sourceRoot, ".git"), "The fixture Git directory");
  const text = canonicalUtf8(
    readBoundedRegularFile(join(gitDirectory, "config"), 64 * 1024, { private: false }),
    "The fixture Git configuration",
  );
  const allowed = new Map<string, ReadonlySet<string>>([
    ["repositoryformatversion", new Set(["0"])],
    ["filemode", new Set(["true", "false"])],
    ["bare", new Set(["false"])],
    ["logallrefupdates", new Set(["true"])],
    ["ignorecase", new Set(["true", "false"])],
    ["precomposeunicode", new Set(["true", "false"])],
  ]);
  let section: string | null = null;
  const observed = new Set<string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/u.exec(line);
    if (sectionMatch !== null) {
      section = (sectionMatch[1] as string).trim().toLowerCase();
      if (section !== "core") {
        configurationError("The fixture Git configuration contains an unreviewed section.");
      }
      continue;
    }
    const entry = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*([^\s#;]+)$/u.exec(line);
    if (section !== "core" || entry === null) {
      configurationError("The fixture Git configuration is not an exact safe core config.");
    }
    const name = (entry[1] as string).toLowerCase();
    const value = (entry[2] as string).toLowerCase();
    const values = allowed.get(name);
    if (values === undefined || !values.has(value) || observed.has(name)) {
      configurationError("The fixture Git configuration contains an unreviewed setting.");
    }
    observed.add(name);
  }
  for (const required of ["repositoryformatversion", "filemode", "bare", "logallrefupdates"]) {
    if (!observed.has(required)) {
      configurationError("The fixture Git configuration is missing a required safe setting.");
    }
  }
}

function runBoundedGit(sourceRoot: string, args: readonly string[]): Buffer {
  return runBoundedProcess(
    GIT,
    [
      "--no-pager",
      "--no-replace-objects",
      "--literal-pathspecs",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "--git-dir",
      join(sourceRoot, ".git"),
      "--work-tree",
      sourceRoot,
      ...args,
    ],
    sourceRoot,
  );
}

function assertExactCheckoutInventory(sourceRoot: string): void {
  const observedFiles: string[] = [];
  const observedDirectories: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      Buffer.from(left.name).compare(Buffer.from(right.name)),
    );
    for (const entry of entries) {
      if (prefix.length === 0 && entry.name === ".git") continue;
      if (
        entry.name.length === 0 ||
        entry.name === "." ||
        entry.name === ".." ||
        entry.name.includes("/") ||
        entry.name.includes("\\") ||
        entry.name.includes("\0")
      ) {
        configurationError("The fixture checkout contains an unsafe path.");
      }
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = join(sourceRoot, ...relativePath.split("/"));
      const relation = relative(sourceRoot, absolutePath);
      if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        configurationError("The fixture checkout inventory escaped its source root.");
      }
      const stats = lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        configurationError("The fixture checkout must not contain symbolic links.");
      }
      if (stats.isDirectory()) {
        observedDirectories.push(relativePath);
        visit(absolutePath, relativePath);
      } else if (stats.isFile()) {
        observedFiles.push(relativePath);
      } else {
        configurationError("The fixture checkout contains an unsupported file type.");
      }
    }
  };
  visit(sourceRoot, "");
  observedFiles.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  observedDirectories.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const expectedFiles = Object.keys(EXPECTED_FILE_DIGESTS).sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  const expectedDirectories = [...EXPECTED_CHECKOUT_DIRECTORIES].sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  if (
    observedFiles.length !== expectedFiles.length ||
    observedFiles.some((path, index) => path !== expectedFiles[index]) ||
    observedDirectories.length !== expectedDirectories.length ||
    observedDirectories.some((path, index) => path !== expectedDirectories[index])
  ) {
    configurationError(
      "The Swift Greeter checkout contains unreviewed tracked, ignored, or untracked paths.",
    );
  }
}

function oneLineVersion(executable: string, args: readonly string[], sourceRoot: string): string {
  const firstLine = canonicalUtf8(
    runBoundedProcess(executable, args, sourceRoot, 16 * 1024),
    "A trusted tool version",
  )
    .split(/\r?\n/u)
    .at(0);
  if (firstLine === undefined || firstLine.length < 1 || firstLine.length > 200) {
    configurationError("A trusted tool returned an invalid version identity.");
  }
  return firstLine;
}

function inspectExactFixture(sourceRoot: string): FixtureEnrollment {
  assertTrustedSystemExecutable(GIT, "The Git executable");
  assertTrustedSystemExecutable(SWIFT, "The Swift executable");
  assertTrustedSystemExecutable(GREP, "The grep executable");
  assertSafeLocalGitConfiguration(sourceRoot);
  assertExactCheckoutInventory(sourceRoot);
  const gitText = (args: readonly string[]): string =>
    canonicalUtf8(runBoundedGit(sourceRoot, args), "A Git enrollment result").trim();
  if (gitText(["rev-parse", "--show-object-format"]) !== "sha1") {
    configurationError("The deterministic fixture requires the reviewed SHA-1 object format.");
  }
  const baseCommit = gitText(["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!/^[0-9a-f]{40}$/u.test(baseCommit)) {
    configurationError("The deterministic fixture HEAD is not an exact commit.");
  }
  const baseTree = gitText(["rev-parse", "--verify", `${baseCommit}^{tree}`]);
  const manifest = runBoundedGit(sourceRoot, ["ls-tree", "-r", baseCommit]);
  if (baseTree !== EXPECTED_BASE_TREE || !manifest.equals(EXPECTED_BASE_MANIFEST)) {
    configurationError("The source repository is not the exact reviewed Swift Greeter tree.");
  }
  for (const [path, expectedDigest] of Object.entries(EXPECTED_FILE_DIGESTS)) {
    const actualDigest = sha256Digest(
      readBoundedRegularFile(join(sourceRoot, path), MAX_FIXTURE_FILE_BYTES, { private: false }),
    );
    if (actualDigest !== expectedDigest) {
      configurationError("The Swift Greeter checkout content differs from its reviewed tree.");
    }
  }
  assertExactCheckoutInventory(sourceRoot);
  if (gitText(["rev-parse", "--verify", "HEAD^{commit}"]) !== baseCommit) {
    configurationError("The Swift Greeter HEAD changed during enrollment.");
  }
  const gitDirectory = join(sourceRoot, ".git");
  const sourceIdentityDigest = sha256Digest(
    Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        sourceRoot,
        baseCommit,
        baseTree,
        manifestDigest: sha256Digest(manifest),
        configDigest: sha256Digest(
          readBoundedRegularFile(join(gitDirectory, "config"), 64 * 1024, { private: false }),
        ),
        headDigest: sha256Digest(
          readBoundedRegularFile(join(gitDirectory, "HEAD"), 4 * 1024, { private: false }),
        ),
        indexDigest: sha256Digest(
          readBoundedRegularFile(join(gitDirectory, "index"), MAX_FIXTURE_FILE_BYTES, {
            private: false,
          }),
        ),
      })}\n`,
      "utf8",
    ),
  );
  return {
    baseCommit,
    baseTree,
    sourceIdentityDigest,
    swiftVersion: oneLineVersion(SWIFT, ["--version"], sourceRoot),
    grepVersion: oneLineVersion(GREP, ["--version"], sourceRoot),
  };
}

function writeExpectedGreeter(worktreePath: string): void {
  const root = realpathSync(worktreePath);
  const destination = join(root, GREETER_PATH);
  const expectedParent = join(root, dirname(GREETER_PATH));
  if (realpathSync(dirname(destination)) !== expectedParent) {
    throw new Error("The fixture source parent escaped its Factory worktree");
  }
  const before = lstatSync(destination);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new Error("The fixture source must be one regular worktree file");
  }
  const descriptor = openSync(
    destination,
    constants.O_WRONLY | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      throw new Error("The fixture source identity changed before writing");
    }
    writeFileSync(descriptor, EXPECTED_GREETER_SOURCE);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function deterministicGreeterAgent(): LocalAgentAdapter {
  return {
    adapterId: "fixture.swift-greeter-agent",
    adapterVersion: "1.0.0",
    run: async ({ spec, assertActive }) => {
      if (spec.authorizedWritePaths.length !== 1 || spec.authorizedWritePaths[0] !== GREETER_PATH) {
        return {
          kind: "failed",
          failure: {
            code: NamespacedCodeSchema.parse("fixture.unsupported-scope"),
            summary: "The deterministic Swift Greeter fixture only supports its formatter path.",
            retryable: false,
            detailArtifactDigest: null,
          },
        };
      }
      await assertActive();
      writeExpectedGreeter(spec.workingDirectory);
      await assertActive();
      return {
        kind: "succeeded",
        summary: "Materialized the reviewed deterministic Swift Greeter implementation.",
        changedPaths: [GREETER_PATH],
      };
    },
  };
}

function exactGreeterReviewer(reviewerRunId: RunId, mirrorPath: string): IndependentReviewAdapter {
  return {
    reviewerId: "fixture.swift-greeter-reviewer",
    reviewerVersion: "1.0.0",
    reviewerRunId,
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
    review: ({ reviewInputDigest, input }) => {
      const supportingDigest = input.rawEvidenceDigests.at(0);
      if (supportingDigest === undefined) {
        throw new Error("The fixture reviewer requires bound raw evidence");
      }
      const result = spawnSync(
        GIT,
        ["--git-dir", mirrorPath, "show", `${input.candidateTree}:${GREETER_PATH}`],
        {
          encoding: null,
          env: {
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_PAGER: "cat",
            GIT_TERMINAL_PROMPT: "0",
            LANG: "C",
            LC_ALL: "C",
            PATH: "/usr/bin:/bin",
            TZ: "UTC",
          },
          maxBuffer: MAX_FIXTURE_FILE_BYTES,
          shell: false,
        },
      );
      const exactMatch =
        result.error === undefined &&
        result.status === 0 &&
        Buffer.isBuffer(result.stdout) &&
        result.stdout.equals(EXPECTED_GREETER_SOURCE);
      return {
        schemaVersion: 1,
        reviewerId: "fixture.swift-greeter-reviewer",
        reviewerVersion: "1.0.0",
        reviewInputDigest,
        verdict: exactMatch ? "pass" : "changes-required",
        findings: exactMatch
          ? []
          : [
              {
                schemaVersion: 1,
                findingId: "62000000-0000-4000-8000-000000000902",
                ruleId: "fixture.greeter-exact-source",
                category: "quality.correctness",
                severity: "p1",
                title: "Candidate differs from the reviewed Greeter fixture",
                description:
                  "The read-only fixture reviewer loaded the candidate blob from the Factory mirror and it did not exactly match the reviewed implementation.",
                locations: [{ path: GREETER_PATH, lineStart: null, lineEnd: null }],
                supportingArtifactDigests: [supportingDigest],
              },
            ],
      };
    },
  };
}

function verificationPlans(
  enrollment: FixtureEnrollment,
): readonly TrustedVerificationPlanTemplate[] {
  const protectedFiles = {
    "FactoryAcceptance/FarewellAcceptanceTests.swift":
      EXPECTED_FILE_DIGESTS["FactoryAcceptance/FarewellAcceptanceTests.swift"],
    "Package.swift": EXPECTED_FILE_DIGESTS["Package.swift"],
    "Tests/GreeterTests/GreetingFormatterTests.swift":
      EXPECTED_FILE_DIGESTS["Tests/GreeterTests/GreetingFormatterTests.swift"],
  };
  const shared = {
    environment: {
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      SWIFT_DETERMINISTIC_HASHING: "1",
      TMPDIR: "/private/tmp",
      TZ: "UTC",
    },
    protectedFiles,
    timeoutMs: 120_000,
    terminationGraceMs: 1_000,
    maxStdoutBytes: 4 * 1024 * 1024,
    maxStderrBytes: 4 * 1024 * 1024,
  } as const;
  return [
    {
      ...shared,
      checkId: "tests.swift",
      executable: SWIFT,
      args: ["test", "--scratch-path", `${VERIFICATION_SCRATCH_TOKEN}/swiftpm-build`],
      toolVersions: [{ name: "swift", version: enrollment.swiftVersion }],
    },
    {
      ...shared,
      checkId: "acceptance.signature",
      executable: GREP,
      args: ["-F", "--", "public func farewell(for name: String) -> String {", GREETER_PATH],
      toolVersions: [{ name: "grep", version: enrollment.grepVersion }],
    },
    {
      ...shared,
      checkId: "acceptance.behavior",
      executable: GREP,
      args: ["-F", "--", '"Goodbye, \\(name)!"', GREETER_PATH],
      toolVersions: [{ name: "grep", version: enrollment.grepVersion }],
    },
  ];
}

/**
 * Loads the only packaged opt-in execution profile. It is intentionally a
 * deterministic conformance fixture, not a general live-agent configuration.
 */
export function loadSwiftGreeterFixtureExecutionConfiguration(
  configurationPath: string,
  runtimeDirectory: string,
): VerifiedLocalExecutionConfiguration {
  const path = normalizedAbsolutePath(configurationPath, "APP_FACTORY_LOCAL_EXECUTION_CONFIG");
  const runtime = normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory");
  const config = parseConfiguration(
    readBoundedRegularFile(path, MAX_CONFIGURATION_BYTES, { private: true }),
  );
  assertRealDirectory(config.sourceRepositoryPath, "sourceRepositoryPath");
  const enrollment = inspectExactFixture(config.sourceRepositoryPath);
  const policy = decodeReviewedPolicyPayload(
    readBoundedRegularFile(config.policyFile, MAX_REVIEWED_POLICY_BYTES, { private: true }),
  );
  const executionPaths = resolveVerifiedLocalExecutionPaths(runtime);
  ensurePrivateRuntimeDirectory(runtime, "The Factory runtime directory");
  ensurePrivateRuntimeDirectory(join(runtime, "local-execution"), "The local execution root");
  ensurePrivateRuntimeDirectory(executionPaths.gitRuntimeRoot, "The Git execution root");
  const gitWorkspace = new GitWorkspaceManager({ gitExecutable: GIT });
  const immutableMirrorInput = {
    repositoryId: config.repositoryId,
    sourceRepositoryPath: config.sourceRepositoryPath,
    sourceIdentityDigest: enrollment.sourceIdentityDigest,
    runtimeRoot: executionPaths.gitRuntimeRoot,
    baseCommit: enrollment.baseCommit,
    baseTree: enrollment.baseTree,
  } as const;
  const mirror = gitWorkspace.prepareImmutableMirror(immutableMirrorInput, () => {
    const revalidated = inspectExactFixture(config.sourceRepositoryPath);
    if (
      revalidated.baseCommit !== enrollment.baseCommit ||
      revalidated.baseTree !== enrollment.baseTree ||
      revalidated.sourceIdentityDigest !== enrollment.sourceIdentityDigest ||
      revalidated.swiftVersion !== enrollment.swiftVersion ||
      revalidated.grepVersion !== enrollment.grepVersion
    ) {
      configurationError("The Swift Greeter source changed while its mirror was prepared.");
    }
  });
  return {
    projects: [
      {
        repositoryId: config.repositoryId,
        sourceRepositoryPath: config.sourceRepositoryPath,
        mirrorMode: "prepared-immutable",
        sourceIdentityDigest: enrollment.sourceIdentityDigest,
        allowedBaseCommit: enrollment.baseCommit,
        allowedBaseTree: enrollment.baseTree,
        taskSemanticProfileDigest: computeTaskSemanticProfileDigest(SWIFT_GREETER_TASK_SEMANTICS),
        policyBytes: policy.bytes,
        agent: deterministicGreeterAgent(),
        reviewerForRun: (reviewerRunId) => exactGreeterReviewer(reviewerRunId, mirror.mirrorPath),
        verificationPlans: verificationPlans(enrollment),
        agentLimits: {
          timeoutMs: 30_000,
          terminationGraceMs: 500,
          maxTurns: 1,
          maxEventCount: 1_000,
          maxStdoutBytes: 1024 * 1024,
          maxStderrBytes: 1024 * 1024,
        },
      },
    ],
    gitExecutable: GIT,
    heartbeatIntervalMs: 100,
  };
}
