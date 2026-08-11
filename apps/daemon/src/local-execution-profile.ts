import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import {
  CODEX_SAFE_AGENT_ENVIRONMENT_NAMES,
  serializeCodexReportedResultJsonSchemaV1,
} from "@app-factory/agent-runner";
import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

import {
  CodexLocalAgentConfigurationError,
  createCodexLocalAgent,
  type CodexLocalAgent,
  type CodexLocalAgentConfigurationV1,
  type CodexLocalAgentDependencies,
} from "./codex-local-agent.js";
import {
  SwiftGreeterFixtureConfigurationError,
  loadSwiftGreeterFixtureExecutionConfiguration,
} from "./swift-greeter-fixture-execution.js";
import type { VerifiedLocalExecutionConfiguration } from "./verified-local-executor.js";

const MAX_CONFIGURATION_BYTES = 64 * 1024;
const MAX_SCHEMA_BYTES = 128 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_MODE_MASK = 0o077;

const CODEX_PROFILE_ENVIRONMENT_NAMES = [
  "LANG",
  "LC_ALL",
  "PATH",
  "SWIFT_DETERMINISTIC_HASHING",
  "TMPDIR",
  "TZ",
] as const;
const CODEX_PROFILE_INVOCATION_ENVIRONMENT_NAMES = [
  "CODEX_HOME",
  ...CODEX_PROFILE_ENVIRONMENT_NAMES,
  "NO_COLOR",
  "RUST_LOG",
  "TERM",
].sort();

type SwiftGreeterCodexProfileV1 = Readonly<{
  schemaVersion: 1;
  mode: "swift-greeter-codex-v1";
  fixtureConfigurationFile: string;
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
}>;

export type LocalExecutionProfileDependencies = Readonly<{
  createCodexAgent?: (
    configuration: CodexLocalAgentConfigurationV1,
    dependencies?: CodexLocalAgentDependencies,
  ) => Promise<CodexLocalAgent>;
  codexAgentDependencies?: CodexLocalAgentDependencies;
}>;

export class LocalExecutionProfileConfigurationError extends Error {
  public constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = "LocalExecutionProfileConfigurationError";
  }
}

function configurationError(message: string, cause?: unknown): never {
  throw new LocalExecutionProfileConfigurationError(message, {
    ...(cause === undefined ? {} : { cause }),
  });
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

function isSameOrDescendantPath(candidate: string, ancestor: string): boolean {
  const relation = relative(ancestor, candidate);
  return (
    relation === "" ||
    (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return isSameOrDescendantPath(left, right) || isSameOrDescendantPath(right, left);
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function assertNoSymbolicLinkAncestors(path: string): void {
  const root = parse(path).root;
  let current = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        configurationError(`Configured path must not traverse a symbolic link: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function readPrivateFile(path: string, maximumBytes: number, label: string): Buffer {
  const normalized = normalizedAbsolutePath(path, label);
  assertNoSymbolicLinkAncestors(dirname(normalized));
  let descriptor: number;
  try {
    descriptor = openSync(normalized, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    configurationError(`${label} cannot be opened safely.`, error);
  }
  try {
    const before = fstatSync(descriptor);
    const userId = currentUserId();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size < 1 ||
      before.size > maximumBytes ||
      (before.mode & PRIVATE_MODE_MASK) !== 0 ||
      (userId !== undefined && before.uid !== userId)
    ) {
      configurationError(`${label} must be one bounded current-user-owned mode-0600 file.`);
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (count < 1) configurationError(`${label} changed while it was being read.`);
      offset += count;
    }
    const trailing = Buffer.allocUnsafe(1);
    const trailingCount = readSync(descriptor, trailing, 0, 1, bytes.byteLength);
    const after = fstatSync(descriptor);
    if (
      trailingCount !== 0 ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.nlink !== before.nlink ||
      after.size !== before.size ||
      after.mode !== before.mode ||
      after.uid !== before.uid ||
      after.gid !== before.gid ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      bytes.byteLength !== before.size
    ) {
      configurationError(`${label} changed while it was being read.`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function canonicalUtf8(bytes: Buffer, label: string): string {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    configurationError(`${label} must contain valid UTF-8.`, error);
  }
  if (decoded.includes("\0") || !Buffer.from(decoded, "utf8").equals(bytes)) {
    configurationError(`${label} must contain canonical UTF-8 without NUL bytes.`);
  }
  return decoded;
}

function parseConfigurationObject(bytes: Buffer): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalUtf8(bytes, "The local execution profile")) as unknown;
  } catch (error) {
    if (error instanceof LocalExecutionProfileConfigurationError) throw error;
    configurationError("The local execution profile must contain valid JSON.", error);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    configurationError("The local execution profile must be an object.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function exactKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    configurationError("The local execution profile has an unsupported or non-exact shape.");
  }
}

function boundedPortableIdentifier(value: unknown, label: string, maximum = 200): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u.test(value)
  ) {
    configurationError(`${label} must be a bounded portable identifier.`);
  }
  return value;
}

function parseCodexProfile(record: Readonly<Record<string, unknown>>): SwiftGreeterCodexProfileV1 {
  exactKeys(record, [
    "codexHome",
    "executable",
    "executableDigest",
    "expectedCliVersion",
    "fixtureConfigurationFile",
    "mode",
    "model",
    "schemaVersion",
  ]);
  if (record.schemaVersion !== 1 || record.mode !== "swift-greeter-codex-v1") {
    configurationError("The local execution profile has an unsupported schema or mode.");
  }
  const executableDigest = Sha256DigestSchema.safeParse(record.executableDigest);
  if (!executableDigest.success) {
    configurationError("executableDigest must be a SHA-256 digest.");
  }
  return {
    schemaVersion: 1,
    mode: "swift-greeter-codex-v1",
    fixtureConfigurationFile: normalizedAbsolutePath(
      record.fixtureConfigurationFile,
      "fixtureConfigurationFile",
    ),
    executable: normalizedAbsolutePath(record.executable, "executable"),
    executableDigest: executableDigest.data,
    expectedCliVersion: boundedPortableIdentifier(
      record.expectedCliVersion,
      "expectedCliVersion",
      100,
    ),
    model: boundedPortableIdentifier(record.model, "model"),
    codexHome: normalizedAbsolutePath(record.codexHome, "codexHome"),
  };
}

function ensurePrivateDirectory(path: string, label: string): string {
  const normalized = normalizedAbsolutePath(path, label);
  assertNoSymbolicLinkAncestors(normalized);
  mkdirSync(normalized, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertNoSymbolicLinkAncestors(normalized);
  const stats = lstatSync(normalized);
  const userId = currentUserId();
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    realpathSync.native(normalized) !== normalized ||
    (stats.mode & PRIVATE_MODE_MASK) !== 0 ||
    (userId !== undefined && stats.uid !== userId)
  ) {
    configurationError(`${label} must be a real current-user-owned mode-0700 directory.`);
  }
  return normalized;
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written < 1) configurationError("The Codex output schema could not be written completely.");
    offset += written;
  }
}

function ensureExactOutputSchema(path: string): void {
  const expected = Buffer.from(serializeCodexReportedResultJsonSchemaV1(), "utf8");
  if (expected.byteLength > MAX_SCHEMA_BYTES) {
    configurationError("The adapter-owned Codex output schema is unexpectedly oversized.");
  }
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
    writeAll(descriptor, expected);
    fsyncSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      configurationError("The adapter-owned Codex output schema could not be published.", error);
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  const actual = readPrivateFile(path, MAX_SCHEMA_BYTES, "Codex output schema");
  if (!actual.equals(expected)) {
    configurationError("The existing Codex output schema differs from the adapter-owned schema.");
  }
}

async function loadCodexProfile(
  profile: SwiftGreeterCodexProfileV1,
  runtimeDirectory: string,
  dependencies: LocalExecutionProfileDependencies,
): Promise<VerifiedLocalExecutionConfiguration> {
  let fixture: VerifiedLocalExecutionConfiguration;
  try {
    fixture = loadSwiftGreeterFixtureExecutionConfiguration(
      profile.fixtureConfigurationFile,
      runtimeDirectory,
    );
  } catch (error) {
    if (error instanceof SwiftGreeterFixtureConfigurationError) {
      configurationError(`The referenced fixture profile is invalid: ${error.message}`, error);
    }
    throw error;
  }
  if (fixture.projects.length !== 1 || fixture.projects[0] === undefined) {
    configurationError("The Codex conformance profile requires exactly one fixture project.");
  }

  const fixtureProject = fixture.projects[0];
  const normalizedRuntime = normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory");
  const isolationPaths = [
    [profile.codexHome, normalizedRuntime, "Codex home and Factory runtime"],
    [profile.codexHome, fixtureProject.sourceRepositoryPath, "Codex home and source repository"],
    [
      normalizedRuntime,
      fixtureProject.sourceRepositoryPath,
      "Factory runtime and source repository",
    ],
    [profile.executable, normalizedRuntime, "Codex executable and Factory runtime"],
    [profile.executable, profile.codexHome, "Codex executable and Codex home"],
    [
      profile.executable,
      fixtureProject.sourceRepositoryPath,
      "Codex executable and source repository",
    ],
  ] as const;
  for (const [left, right, label] of isolationPaths) {
    if (pathsOverlap(left, right)) {
      configurationError(`${label} must be separate, non-nested paths.`);
    }
  }

  const runtime = ensurePrivateDirectory(normalizedRuntime, "Factory runtime directory");
  const localExecutionRoot = ensurePrivateDirectory(
    join(runtime, "local-execution"),
    "Local execution directory",
  );
  const runnerRoot = ensurePrivateDirectory(
    join(localExecutionRoot, "codex-runs"),
    "Codex runner directory",
  );
  const temporaryRoot = ensurePrivateDirectory(
    join(localExecutionRoot, "codex-tmp"),
    "Codex temporary directory",
  );
  const outputSchemaPath = join(runnerRoot, "reported-result.schema.json");
  ensureExactOutputSchema(outputSchemaPath);

  const safeNames = new Set<string>(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
  if (CODEX_PROFILE_ENVIRONMENT_NAMES.some((name) => !safeNames.has(name))) {
    configurationError("The packaged Codex profile contains an unsafe environment name.");
  }
  const agentConfiguration: CodexLocalAgentConfigurationV1 = {
    schemaVersion: 1,
    executable: profile.executable,
    executableDigest: profile.executableDigest,
    expectedCliVersion: profile.expectedCliVersion,
    model: profile.model,
    codexHome: profile.codexHome,
    runnerRoot,
    outputSchemaPath,
    environmentAllowlist: CODEX_PROFILE_ENVIRONMENT_NAMES,
    environment: {
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      SWIFT_DETERMINISTIC_HASHING: "1",
      TMPDIR: temporaryRoot,
      TZ: "UTC",
    },
    readOnlyPaths: ["Package.swift", "Tests"],
    permissionProfileName: "factory_agent",
    registrationTimeoutMs: 10_000,
    pollMs: 25,
  };
  const createAgent = dependencies.createCodexAgent ?? createCodexLocalAgent;
  let agent: CodexLocalAgent;
  try {
    agent = await createAgent(agentConfiguration, dependencies.codexAgentDependencies);
  } catch (error) {
    if (error instanceof CodexLocalAgentConfigurationError) {
      configurationError(error.message, error);
    }
    throw error;
  }

  const project = fixtureProject;
  return {
    ...fixture,
    projects: [
      {
        ...project,
        agent,
        environmentAllowlist: CODEX_PROFILE_ENVIRONMENT_NAMES,
        requireAgentProtocolEvidence: true,
        agentInvocationEnvironmentNames: CODEX_PROFILE_INVOCATION_ENVIRONMENT_NAMES,
        agentInvocationIdentity: {
          executable: profile.executable,
          executableDigest: profile.executableDigest,
          cliVersion: profile.expectedCliVersion,
          model: profile.model,
        },
        agentLimits: {
          timeoutMs: 10 * 60_000,
          terminationGraceMs: 5_000,
          maxTurns: 1,
          maxEventCount: 50_000,
          maxStdoutBytes: 16_777_216,
          maxStderrBytes: 16_777_216,
        },
      },
    ],
    heartbeatIntervalMs: 1_000,
  };
}

/**
 * Loads one exact local execution profile. The deterministic fixture remains
 * the safe default profile. The Codex variant exists for fake-executable
 * conformance and future container composition; daemon-entrypoint must not
 * enable a real model until ADR 0002's containment gate is satisfied.
 */
export async function loadLocalExecutionProfile(
  configurationPath: string,
  runtimeDirectory: string,
  dependencies: LocalExecutionProfileDependencies = {},
): Promise<VerifiedLocalExecutionConfiguration> {
  const path = normalizedAbsolutePath(configurationPath, "APP_FACTORY_LOCAL_EXECUTION_CONFIG");
  const bytes = readPrivateFile(path, MAX_CONFIGURATION_BYTES, "Local execution profile");
  const record = parseConfigurationObject(bytes);
  if (record.mode === "swift-greeter-fixture-v1") {
    try {
      return loadSwiftGreeterFixtureExecutionConfiguration(path, runtimeDirectory);
    } catch (error) {
      if (error instanceof SwiftGreeterFixtureConfigurationError) {
        configurationError(error.message, error);
      }
      throw error;
    }
  }
  if (record.mode === "swift-greeter-codex-v1") {
    return await loadCodexProfile(
      parseCodexProfile(record),
      normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory"),
      dependencies,
    );
  }
  configurationError("The local execution profile mode is unsupported.");
}
