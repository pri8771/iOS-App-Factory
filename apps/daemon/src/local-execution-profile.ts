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
import {
  AgentRunLimitsV1Schema,
  Sha256DigestSchema,
  type AgentRunLimitsV1,
  type Sha256Digest,
} from "@app-factory/contracts";

import {
  CodexLocalAgentConfigurationError,
  createCodexLocalAgent,
  type CodexLocalAgent,
  type CodexLocalAgentConfigurationV1,
  type CodexLocalAgentDependencies,
} from "./codex-local-agent.js";
import {
  CODEX_PROFILE_ENVIRONMENT_NAMES,
  CODEX_PROFILE_INVOCATION_ENVIRONMENT_NAMES,
} from "./codex-profile-environment.js";
import {
  EnrolledProjectExecutionConfigurationError,
  loadEnrolledProjectExecutionConfiguration,
  type EnrolledProjectBindingV1,
} from "./enrolled-project-execution.js";
import {
  SwiftGreeterFixtureConfigurationError,
  loadSwiftGreeterFixtureExecutionConfiguration,
} from "./swift-greeter-fixture-execution.js";
import type {
  TrustedAgentInvocationIdentityV1,
  VerifiedLocalExecutionConfiguration,
} from "./verified-local-executor.js";

const MAX_CONFIGURATION_BYTES = 64 * 1024;
const MAX_SCHEMA_BYTES = 128 * 1024;
const MAX_ATTESTATION_BYTES = 16 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_MODE_MASK = 0o077;

/**
 * Profile modes that bind a real agent identity (a pinned executable digest,
 * CLI version, and model) rather than the deterministic in-process fixture.
 * Every mode listed here refuses to load without a valid owner containment
 * attestation; any future real-identity mode must be registered here so it
 * inherits the same structural gate.
 */
const REAL_IDENTITY_PROFILE_MODES: ReadonlySet<string> = new Set([
  "swift-greeter-codex-v1",
  "enrolled-codex-v1",
]);
const CONTAINMENT_ATTESTATION_LABEL = "The owner containment attestation";

/**
 * The agent run limits every Codex-backed profile mode used to hardcode
 * verbatim (including `maxTurns: 1`, which made the T4 multi-turn agent
 * runner unreachable through either profile). These are now only the
 * defaults: `agentLimits` in the profile config may override any subset of
 * them -- see {@link parseConfiguredAgentLimits} -- so an absent config key
 * reproduces the exact previous hardcoded behavior.
 */
const DEFAULT_AGENT_LIMITS: AgentRunLimitsV1 = {
  timeoutMs: 10 * 60_000,
  terminationGraceMs: 5_000,
  maxTurns: 1,
  maxEventCount: 50_000,
  maxStdoutBytes: 16_777_216,
  maxStderrBytes: 16_777_216,
};

const AGENT_LIMIT_FIELD_KEYS = [
  "timeoutMs",
  "terminationGraceMs",
  "maxTurns",
  "maxEventCount",
  "maxStdoutBytes",
  "maxStderrBytes",
] as const satisfies readonly (keyof AgentRunLimitsV1)[];

/**
 * Parses an optional, partial `agentLimits` override from profile config.
 * Every field is independently optional and falls back to
 * {@link DEFAULT_AGENT_LIMITS} when absent, so an existing config with no
 * `agentLimits` key at all -- or one that only overrides `maxTurns` --
 * behaves identically to before this override surface existed. Each
 * supplied field is validated fail-closed against the exact same bounds the
 * daemon later re-validates with ({@link AgentRunLimitsV1Schema}, the
 * authoritative shape for what reaches the AgentRunSpec), so this can never
 * accept a value the executor would then reject.
 */
function parseConfiguredAgentLimits(value: unknown): AgentRunLimitsV1 {
  if (value === undefined) return DEFAULT_AGENT_LIMITS;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    configurationError("agentLimits must be an object.");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !(AGENT_LIMIT_FIELD_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    configurationError(`agentLimits has unsupported field(s): ${unknownKeys.join(", ")}.`);
  }
  const resolved = { ...DEFAULT_AGENT_LIMITS };
  for (const key of AGENT_LIMIT_FIELD_KEYS) {
    if (record[key] === undefined) continue;
    const parsed = AgentRunLimitsV1Schema.shape[key].safeParse(record[key]);
    if (!parsed.success) {
      configurationError(
        `agentLimits.${key} is invalid: ${parsed.error.issues[0]?.message ?? "out of range"}.`,
      );
    }
    resolved[key] = parsed.data;
  }
  return AgentRunLimitsV1Schema.parse(resolved);
}

/**
 * The Codex CLI identity fields shared by every Codex-backed profile mode:
 * the factory-owned executable path/digest, the pinned CLI version, model,
 * and Codex home. Each mode pairs these with its own source of project data
 * (a byte-pinned fixture file for `swift-greeter-codex-v1`, an enrolled
 * project configuration file for `enrolled-codex-v1`), and both pair them
 * with the same optional, config-driven {@link parseConfiguredAgentLimits}
 * override surface.
 */
type CodexAgentIdentityFieldsV1 = Readonly<{
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
  agentLimits: AgentRunLimitsV1;
}>;

type SwiftGreeterCodexProfileV1 = CodexAgentIdentityFieldsV1 &
  Readonly<{
    schemaVersion: 1;
    mode: "swift-greeter-codex-v1";
    fixtureConfigurationFile: string;
  }>;

type EnrolledCodexProfileV1 = CodexAgentIdentityFieldsV1 &
  Readonly<{
    schemaVersion: 1;
    mode: "enrolled-codex-v1";
    projectConfigurationFile: string;
  }>;

export type LocalExecutionProfileDependencies = Readonly<{
  createCodexAgent?: (
    configuration: CodexLocalAgentConfigurationV1,
    dependencies?: CodexLocalAgentDependencies,
  ) => Promise<CodexLocalAgent>;
  codexAgentDependencies?: CodexLocalAgentDependencies;
}>;

export type LocalExecutionProfileOptions = LocalExecutionProfileDependencies &
  Readonly<{
    /**
     * Absolute path to the owner containment attestation file. Real-identity
     * profile modes refuse to load when this is absent or invalid; the
     * deterministic fixture mode never consults it.
     */
    containmentAttestationPath?: string;
  }>;

export type OwnerContainmentAttestationV1 = Readonly<{
  schemaVersion: 1;
  decision: string;
  acceptedGaps: readonly string[];
  date: string;
  owner: string;
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

/**
 * Requires every key in `expected` to be present and rejects any key outside
 * `expected` plus `optional`. `optional` keys (e.g. `agentLimits`) may be
 * omitted entirely -- unlike `expected` keys, their absence is not an error.
 */
function exactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  message = "The local execution profile has an unsupported or non-exact shape.",
  optional: readonly string[] = [],
): void {
  const actual = new Set(Object.keys(record));
  const missingRequired = expected.some((key) => !actual.has(key));
  const unexpected = [...actual].some((key) => !expected.includes(key) && !optional.includes(key));
  if (missingRequired || unexpected) {
    configurationError(message);
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

function boundedAttestationText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    value.trim().length === 0
  ) {
    configurationError(`${label} must be non-empty bounded text without surrounding whitespace.`);
  }
  return value;
}

function readOwnerContainmentAttestation(path: string): OwnerContainmentAttestationV1 {
  const normalized = normalizedAbsolutePath(path, "APP_FACTORY_CONTAINMENT_ATTESTATION");
  const bytes = readPrivateFile(normalized, MAX_ATTESTATION_BYTES, CONTAINMENT_ATTESTATION_LABEL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalUtf8(bytes, CONTAINMENT_ATTESTATION_LABEL)) as unknown;
  } catch (error) {
    if (error instanceof LocalExecutionProfileConfigurationError) throw error;
    configurationError(`${CONTAINMENT_ATTESTATION_LABEL} must contain valid JSON.`, error);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    configurationError(`${CONTAINMENT_ATTESTATION_LABEL} must be a JSON object.`);
  }
  const record = parsed as Readonly<Record<string, unknown>>;
  exactKeys(
    record,
    ["acceptedGaps", "date", "decision", "owner", "schemaVersion"],
    `${CONTAINMENT_ATTESTATION_LABEL} must contain exactly schemaVersion, decision, acceptedGaps, date, and owner.`,
  );
  if (record.schemaVersion !== 1) {
    configurationError(`${CONTAINMENT_ATTESTATION_LABEL} must declare schemaVersion 1.`);
  }
  const decision = boundedAttestationText(
    record.decision,
    `${CONTAINMENT_ATTESTATION_LABEL} decision`,
    4_000,
  );
  if (
    !Array.isArray(record.acceptedGaps) ||
    record.acceptedGaps.length < 1 ||
    record.acceptedGaps.length > 32
  ) {
    configurationError(
      `${CONTAINMENT_ATTESTATION_LABEL} acceptedGaps must be a non-empty bounded list.`,
    );
  }
  const acceptedGaps = record.acceptedGaps.map((gap, index) =>
    boundedAttestationText(gap, `${CONTAINMENT_ATTESTATION_LABEL} acceptedGaps[${index}]`, 1_000),
  );
  const date = boundedAttestationText(record.date, `${CONTAINMENT_ATTESTATION_LABEL} date`, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    configurationError(
      `${CONTAINMENT_ATTESTATION_LABEL} date must be an exact YYYY-MM-DD calendar date.`,
    );
  }
  const owner = boundedAttestationText(record.owner, `${CONTAINMENT_ATTESTATION_LABEL} owner`, 200);
  return { schemaVersion: 1, decision, acceptedGaps, date, owner };
}

function requireOwnerContainmentAttestation(
  path: string | undefined,
  mode: string,
): OwnerContainmentAttestationV1 {
  if (path === undefined) {
    configurationError(
      `The ${mode} profile binds a real agent identity and refuses to load without an owner ` +
        "containment attestation file (APP_FACTORY_CONTAINMENT_ATTESTATION).",
    );
  }
  return readOwnerContainmentAttestation(path);
}

function parseCodexAgentIdentityFields(
  record: Readonly<Record<string, unknown>>,
): CodexAgentIdentityFieldsV1 {
  const executableDigest = Sha256DigestSchema.safeParse(record.executableDigest);
  if (!executableDigest.success) {
    configurationError("executableDigest must be a SHA-256 digest.");
  }
  return {
    executable: normalizedAbsolutePath(record.executable, "executable"),
    executableDigest: executableDigest.data,
    expectedCliVersion: boundedPortableIdentifier(
      record.expectedCliVersion,
      "expectedCliVersion",
      100,
    ),
    model: boundedPortableIdentifier(record.model, "model"),
    codexHome: normalizedAbsolutePath(record.codexHome, "codexHome"),
    agentLimits: parseConfiguredAgentLimits(record.agentLimits),
  };
}

function parseCodexProfile(record: Readonly<Record<string, unknown>>): SwiftGreeterCodexProfileV1 {
  exactKeys(
    record,
    [
      "codexHome",
      "executable",
      "executableDigest",
      "expectedCliVersion",
      "fixtureConfigurationFile",
      "mode",
      "model",
      "schemaVersion",
    ],
    undefined,
    ["agentLimits"],
  );
  if (record.schemaVersion !== 1 || record.mode !== "swift-greeter-codex-v1") {
    configurationError("The local execution profile has an unsupported schema or mode.");
  }
  return {
    schemaVersion: 1,
    mode: "swift-greeter-codex-v1",
    fixtureConfigurationFile: normalizedAbsolutePath(
      record.fixtureConfigurationFile,
      "fixtureConfigurationFile",
    ),
    ...parseCodexAgentIdentityFields(record),
  };
}

function parseEnrolledCodexProfile(
  record: Readonly<Record<string, unknown>>,
): EnrolledCodexProfileV1 {
  exactKeys(
    record,
    [
      "codexHome",
      "executable",
      "executableDigest",
      "expectedCliVersion",
      "mode",
      "model",
      "projectConfigurationFile",
      "schemaVersion",
    ],
    undefined,
    ["agentLimits"],
  );
  if (record.schemaVersion !== 1 || record.mode !== "enrolled-codex-v1") {
    configurationError("The local execution profile has an unsupported schema or mode.");
  }
  return {
    schemaVersion: 1,
    mode: "enrolled-codex-v1",
    projectConfigurationFile: normalizedAbsolutePath(
      record.projectConfigurationFile,
      "projectConfigurationFile",
    ),
    ...parseCodexAgentIdentityFields(record),
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

type BuiltCodexAgentFieldsV1 = Readonly<{
  agent: CodexLocalAgent;
  environmentAllowlist: typeof CODEX_PROFILE_ENVIRONMENT_NAMES;
  requireAgentProtocolEvidence: true;
  agentInvocationEnvironmentNames: typeof CODEX_PROFILE_INVOCATION_ENVIRONMENT_NAMES;
  agentInvocationIdentity: TrustedAgentInvocationIdentityV1;
  agentLimits: AgentRunLimitsV1;
}>;

/**
 * Builds the real Codex agent and its trusted invocation fields for one
 * source repository. Every Codex-backed profile mode (the byte-pinned Swift
 * Greeter fixture and the config-driven enrolled-project profile) calls this
 * with the exact same factory-owned executable path/digest discipline, so
 * the agent construction itself never varies by mode -- only where the
 * surrounding project data comes from does.
 */
async function buildCodexAgentForProject(
  profile: CodexAgentIdentityFieldsV1,
  sourceRepositoryPath: string,
  normalizedRuntime: string,
  dependencies: LocalExecutionProfileDependencies,
): Promise<BuiltCodexAgentFieldsV1> {
  const isolationPaths = [
    [profile.codexHome, normalizedRuntime, "Codex home and Factory runtime"],
    [profile.codexHome, sourceRepositoryPath, "Codex home and source repository"],
    [normalizedRuntime, sourceRepositoryPath, "Factory runtime and source repository"],
    [profile.executable, normalizedRuntime, "Codex executable and Factory runtime"],
    [profile.executable, profile.codexHome, "Codex executable and Codex home"],
    [profile.executable, sourceRepositoryPath, "Codex executable and source repository"],
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

  return {
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
    agentLimits: profile.agentLimits,
  };
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
  const built = await buildCodexAgentForProject(
    profile,
    fixtureProject.sourceRepositoryPath,
    normalizedRuntime,
    dependencies,
  );

  return {
    ...fixture,
    projects: [
      {
        ...fixtureProject,
        agent: built.agent,
        environmentAllowlist: built.environmentAllowlist,
        requireAgentProtocolEvidence: built.requireAgentProtocolEvidence,
        agentInvocationEnvironmentNames: built.agentInvocationEnvironmentNames,
        agentInvocationIdentity: built.agentInvocationIdentity,
        agentLimits: built.agentLimits,
      },
    ],
    heartbeatIntervalMs: 1_000,
  };
}

/**
 * Loads the config-driven enrolled-project profile: a generic mechanism that
 * pairs the same real Codex agent construction above with per-project data
 * (mirror, policy, verification plans, reviewer) supplied entirely by
 * config and pinned to the exact base commit/tree captured at enrollment,
 * instead of the byte-pinned Swift Greeter fixture.
 */
async function loadEnrolledCodexProfile(
  profile: EnrolledCodexProfileV1,
  runtimeDirectory: string,
  dependencies: LocalExecutionProfileDependencies,
): Promise<VerifiedLocalExecutionConfiguration> {
  let binding: EnrolledProjectBindingV1;
  try {
    binding = loadEnrolledProjectExecutionConfiguration(
      profile.projectConfigurationFile,
      runtimeDirectory,
    );
  } catch (error) {
    if (error instanceof EnrolledProjectExecutionConfigurationError) {
      configurationError(
        `The referenced enrolled project profile is invalid: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  const normalizedRuntime = normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory");
  const built = await buildCodexAgentForProject(
    profile,
    binding.project.sourceRepositoryPath,
    normalizedRuntime,
    dependencies,
  );

  return {
    projects: [
      {
        ...binding.project,
        agent: built.agent,
        environmentAllowlist: built.environmentAllowlist,
        requireAgentProtocolEvidence: built.requireAgentProtocolEvidence,
        agentInvocationEnvironmentNames: built.agentInvocationEnvironmentNames,
        agentInvocationIdentity: built.agentInvocationIdentity,
        agentLimits: built.agentLimits,
      },
    ],
    gitExecutable: binding.gitExecutable,
    heartbeatIntervalMs: 1_000,
  };
}

/**
 * Loads one exact local execution profile. The deterministic fixture remains
 * the safe default profile and never consults the containment attestation.
 * Every real-identity mode (`swift-greeter-codex-v1` and the config-driven
 * `enrolled-codex-v1`) is registered in {@link REAL_IDENTITY_PROFILE_MODES}
 * and structurally refuses to load unless a valid owner containment
 * attestation is configured, recording the owner's ADR 0002 gate decision and
 * the accepted containment gaps.
 */
export async function loadLocalExecutionProfile(
  configurationPath: string,
  runtimeDirectory: string,
  options: LocalExecutionProfileOptions = {},
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
  if (typeof record.mode === "string" && REAL_IDENTITY_PROFILE_MODES.has(record.mode)) {
    requireOwnerContainmentAttestation(options.containmentAttestationPath, record.mode);
    if (record.mode === "swift-greeter-codex-v1") {
      return await loadCodexProfile(
        parseCodexProfile(record),
        normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory"),
        options,
      );
    }
    if (record.mode === "enrolled-codex-v1") {
      return await loadEnrolledCodexProfile(
        parseEnrolledCodexProfile(record),
        normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory"),
        options,
      );
    }
  }
  configurationError("The local execution profile mode is unsupported.");
}
