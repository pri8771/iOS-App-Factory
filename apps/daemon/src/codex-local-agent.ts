import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import {
  CODEX_AGENT_ADAPTER_ID,
  CODEX_AGENT_ADAPTER_VERSION,
  CODEX_SAFE_AGENT_ENVIRONMENT_NAMES,
  VERIFIED_CODEX_CLI_VERSIONS,
  buildCodexInvocation,
  classifyCodexProcess,
  materializeCodexRunV1,
  preflightCodex,
  serializeCodexReportedResultJsonSchemaV1,
  type CodexPreflightResult,
  type CodexProcessCapture,
  type PreflightCodexOptions,
} from "@app-factory/agent-runner";
import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  type AgentEventV1,
  type AgentRunResultV1,
  type AgentRunSpecV1,
  type FailureV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import { canonicalJsonBytes, sha256Digest } from "@app-factory/execution-engine";
import {
  MAX_SUPERVISED_INTENT_BYTES,
  MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM,
  createSupervisedRunIntent,
  launchPreparedSupervisedRun,
  openPreparedSupervisedRun,
  prepareSupervisedRun,
  reconcileSupervisedRun,
  requestSupervisedRunTermination,
  waitForSupervisedRunRegistration,
  type CreateSupervisedRunIntentInput,
  type LaunchSupervisedRunResult,
  type LocalSupervisedControllerRegistration,
  type PreparedSupervisedRun,
  type ReconcileSupervisedRunResult,
  type RequestSupervisedRunTerminationResult,
  type SupervisedRunReceiptV1,
  type WaitForSupervisedRunRegistrationResult,
} from "@app-factory/process-supervisor";

import type {
  LocalAgentInvocationDescriptorV1,
  LocalAgentProtocolEvidenceV1,
  LocalAgentRunContext,
  LocalAgentRunOutcome,
} from "./verified-local-executor.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE_MASK = 0o077;
const MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 64 * 1024;
const DEFAULT_REGISTRATION_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_MS = 25;
const COMPLETION_MARGIN_MS = 10_000;
const PORTABLE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const ADAPTER_RUN_KEY_PATTERN =
  /^codex-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-f(0|[1-9][0-9]*)$/u;

export type CodexLocalAgentConfigurationV1 = Readonly<{
  schemaVersion: 1;
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
  runnerRoot: string;
  outputSchemaPath: string;
  environmentAllowlist: readonly string[];
  environment: Readonly<Record<string, string>>;
  readOnlyPaths?: readonly string[];
  permissionProfileName?: string;
  registrationTimeoutMs?: number;
  pollMs?: number;
}>;

type CodexLocalAgentSupervisorPort = Readonly<{
  open(rootDirectory: string, runKey: string): PreparedSupervisedRun | null;
  prepare(rootDirectory: string, input: CreateSupervisedRunIntentInput): PreparedSupervisedRun;
  launch(prepared: PreparedSupervisedRun): LaunchSupervisedRunResult;
  waitForRegistration(
    prepared: PreparedSupervisedRun,
    registration: LocalSupervisedControllerRegistration,
    options: Readonly<{ timeoutMs: number; pollMs: number }>,
  ): Promise<WaitForSupervisedRunRegistrationResult>;
  reconcile(prepared: PreparedSupervisedRun): ReconcileSupervisedRunResult;
  terminate(prepared: PreparedSupervisedRun): Promise<RequestSupervisedRunTerminationResult>;
}>;

export type CodexLocalAgentDependencies = Readonly<{
  preflight?: (options: PreflightCodexOptions) => Promise<CodexPreflightResult>;
  supervisor?: Partial<CodexLocalAgentSupervisorPort>;
  now?: () => Date;
  monotonicNow?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

type ValidatedConfiguration = Readonly<{
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
  runnerRoot: string;
  outputSchemaPath: string;
  environmentAllowlist: readonly string[];
  environment: Readonly<Record<string, string>>;
  readOnlyPaths: readonly string[];
  permissionProfileName: string | undefined;
  registrationTimeoutMs: number;
  pollMs: number;
}>;

type TerminalWaitResult =
  | Readonly<{ kind: "terminal"; receipt: SupervisedRunReceiptV1 }>
  | Readonly<{ kind: "blocked"; reason: string }>;

const DEFAULT_SUPERVISOR: CodexLocalAgentSupervisorPort = {
  open: openPreparedSupervisedRun,
  prepare: prepareSupervisedRun,
  launch: launchPreparedSupervisedRun,
  waitForRegistration: async (prepared, registration, options) =>
    await waitForSupervisedRunRegistration(prepared, registration, options),
  reconcile: reconcileSupervisedRun,
  terminate: async (prepared) => await requestSupervisedRunTermination(prepared),
};

export class CodexLocalAgentConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CodexLocalAgentConfigurationError";
  }
}

function configurationError(message: string): never {
  throw new CodexLocalAgentConfigurationError(message);
}

function assertNormalizedAbsolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || resolve(value) !== value || value.includes("\0")) {
    configurationError(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function assertOwned(stats: Stats, label: string): void {
  const userId = currentUserId();
  if (userId !== undefined && stats.uid !== userId && stats.uid !== 0) {
    configurationError(`${label} must be owned by the current user or root.`);
  }
}

function assertNoSymbolicLinkAncestors(path: string): void {
  const root = parse(path).root;
  let current = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, component);
    let stats: Stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      configurationError(`Configured path must not traverse a symbolic link: ${current}`);
    }
  }
}

function ensurePrivateDirectory(path: string, label: string): string {
  assertNormalizedAbsolutePath(path, label);
  assertNoSymbolicLinkAncestors(path);
  mkdirSync(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertNoSymbolicLinkAncestors(path);
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync.native(path) !== path) {
    configurationError(`${label} must be one real directory.`);
  }
  assertOwned(stats, label);
  if ((stats.mode & PRIVATE_FILE_MODE_MASK) !== 0) {
    configurationError(`${label} must be private to the current user.`);
  }
  return path;
}

function assertPrivateDirectory(path: string, label: string): string {
  assertNormalizedAbsolutePath(path, label);
  assertNoSymbolicLinkAncestors(path);
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync.native(path) !== path) {
    configurationError(`${label} must be one real directory.`);
  }
  assertOwned(stats, label);
  if ((stats.mode & PRIVATE_FILE_MODE_MASK) !== 0) {
    configurationError(`${label} must be private to the current user.`);
  }
  return path;
}

function assertOpenedFileIdentity(before: Stats, opened: Stats, label: string): void {
  if (
    !opened.isFile() ||
    opened.dev !== before.dev ||
    opened.ino !== before.ino ||
    opened.nlink !== 1 ||
    opened.size !== before.size
  ) {
    configurationError(`${label} changed before its bounded read began.`);
  }
}

function readExactDescriptorBytes(
  descriptor: number,
  expectedBytes: number,
  maximumBytes: number,
  label: string,
): Buffer {
  if (expectedBytes > maximumBytes) configurationError(`${label} exceeds its byte limit.`);
  const bytes = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const count = readSync(descriptor, bytes, offset, expectedBytes - offset, null);
    if (count < 1) configurationError(`${label} ended during its bounded read.`);
    offset += count;
  }
  if (readSync(descriptor, Buffer.allocUnsafe(1), 0, 1, null) !== 0) {
    configurationError(`${label} grew beyond its reviewed byte length.`);
  }
  return bytes;
}

function digestBoundedDescriptor(
  descriptor: number,
  maximumBytes: number,
  label: string,
): Readonly<{ byteLength: number; digest: Sha256Digest }> {
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let byteLength = 0;
  while (byteLength <= maximumBytes) {
    const remainingThroughOverflowByte = maximumBytes - byteLength + 1;
    const count = readSync(
      descriptor,
      chunk,
      0,
      Math.min(chunk.byteLength, remainingThroughOverflowByte),
      null,
    );
    if (count === 0) {
      return {
        byteLength,
        digest: Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`),
      };
    }
    byteLength += count;
    if (byteLength > maximumBytes) configurationError(`${label} exceeds its byte limit.`);
    hash.update(chunk.subarray(0, count));
  }
  configurationError(`${label} exceeds its byte limit.`);
}

function readBoundedPrivateFile(path: string, maximumBytes: number, label: string): Buffer {
  assertNormalizedAbsolutePath(path, label);
  assertNoSymbolicLinkAncestors(dirname(path));
  let before: Stats;
  try {
    before = lstatSync(path);
  } catch {
    configurationError(`${label} cannot be opened.`);
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > maximumBytes ||
    (before.mode & PRIVATE_FILE_MODE_MASK) !== 0
  ) {
    configurationError(`${label} must be one bounded private regular file.`);
  }
  assertOwned(before, label);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    assertOpenedFileIdentity(before, opened, label);
    const bytes = readExactDescriptorBytes(descriptor, before.size, maximumBytes, label);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.nlink !== 1 ||
      after.size !== before.size ||
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

function digestExecutable(path: string): Sha256Digest {
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > MAX_EXECUTABLE_BYTES
  ) {
    configurationError("Codex executable no longer has its reviewed file identity.");
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    assertOpenedFileIdentity(before, opened, "Codex executable");
    const observed = digestBoundedDescriptor(descriptor, MAX_EXECUTABLE_BYTES, "Codex executable");
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.nlink !== 1 ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      observed.byteLength !== before.size
    ) {
      configurationError("Codex executable changed while its digest was computed.");
    }
    return observed.digest;
  } finally {
    closeSync(descriptor);
  }
}

function digest(bytes: Uint8Array): Sha256Digest {
  return sha256Digest(bytes);
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

function portableIdentifier(value: string, label: string, maximumLength = 200): string {
  if (
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    !PORTABLE_IDENTIFIER.test(value)
  ) {
    configurationError(`${label} must be a bounded portable identifier.`);
  }
  return value;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = value ?? fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    configurationError(
      `${label} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return parsed;
}

function validateConfiguration(input: CodexLocalAgentConfigurationV1): ValidatedConfiguration {
  const knownConfigurationKeys = new Set([
    "schemaVersion",
    "executable",
    "executableDigest",
    "expectedCliVersion",
    "model",
    "codexHome",
    "runnerRoot",
    "outputSchemaPath",
    "environmentAllowlist",
    "environment",
    "readOnlyPaths",
    "permissionProfileName",
    "registrationTimeoutMs",
    "pollMs",
  ]);
  const unknownConfigurationKeys = Object.keys(input)
    .filter((key) => !knownConfigurationKeys.has(key))
    .sort();
  if (unknownConfigurationKeys.length > 0) {
    configurationError(
      `Codex adapter configuration contains unknown fields: ${unknownConfigurationKeys.join(", ")}.`,
    );
  }
  if (input.schemaVersion !== 1) configurationError("Unsupported Codex adapter configuration.");
  const executable = assertNormalizedAbsolutePath(input.executable, "Codex executable");
  const executableStats = lstatSync(executable);
  if (
    !executableStats.isFile() ||
    executableStats.isSymbolicLink() ||
    executableStats.nlink !== 1 ||
    (executableStats.mode & 0o111) === 0 ||
    realpathSync.native(executable) !== executable ||
    executableStats.size < 1 ||
    executableStats.size > MAX_EXECUTABLE_BYTES
  ) {
    configurationError("Codex executable must be one bounded executable real file.");
  }
  assertOwned(executableStats, "Codex executable");
  const executableDigest = Sha256DigestSchema.parse(input.executableDigest);
  if (digestExecutable(executable) !== executableDigest) {
    configurationError("Codex executable does not match its configured digest.");
  }

  const expectedCliVersion = portableIdentifier(
    input.expectedCliVersion,
    "Expected Codex CLI version",
    100,
  );
  if (
    !VERIFIED_CODEX_CLI_VERSIONS.includes(
      expectedCliVersion as (typeof VERIFIED_CODEX_CLI_VERSIONS)[number],
    )
  ) {
    configurationError("Expected Codex CLI version has not passed Factory conformance.");
  }
  const model = portableIdentifier(input.model, "Codex model");
  const codexHome = assertPrivateDirectory(input.codexHome, "Dedicated Codex home");
  const requestedRunnerRoot = assertNormalizedAbsolutePath(input.runnerRoot, "Codex runner root");
  if (pathsOverlap(codexHome, requestedRunnerRoot)) {
    configurationError(
      "Dedicated Codex home and runner root must be separate, non-nested directories.",
    );
  }
  const runnerRoot = ensurePrivateDirectory(requestedRunnerRoot, "Codex runner root");
  const outputSchemaPath = assertNormalizedAbsolutePath(
    input.outputSchemaPath,
    "Codex output schema",
  );
  const schemaRelation = relative(runnerRoot, outputSchemaPath);
  if (
    schemaRelation === "" ||
    schemaRelation === ".." ||
    schemaRelation.startsWith(`..${sep}`) ||
    isAbsolute(schemaRelation)
  ) {
    configurationError("Codex output schema must be a file below the private runner root.");
  }
  const schemaBytes = readBoundedPrivateFile(outputSchemaPath, 128 * 1024, "Codex output schema");
  if (!schemaBytes.equals(Buffer.from(serializeCodexReportedResultJsonSchemaV1(), "utf8"))) {
    configurationError("Codex output schema is not the exact adapter-owned schema.");
  }

  if (
    input.environmentAllowlist.length > CODEX_SAFE_AGENT_ENVIRONMENT_NAMES.length ||
    new Set(input.environmentAllowlist).size !== input.environmentAllowlist.length
  ) {
    configurationError("Codex environment allowlist must be unique and bounded.");
  }
  const safeEnvironmentNames = new Set<string>(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
  const environmentAllowlist = [...input.environmentAllowlist].sort();
  for (const name of environmentAllowlist) {
    if (!safeEnvironmentNames.has(name)) {
      configurationError(`Codex environment name is not adapter-owned and safe: ${name}`);
    }
  }
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.environment).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!environmentAllowlist.includes(name)) {
      configurationError(`Codex environment contains a value outside its exact allowlist: ${name}`);
    }
    if (
      Buffer.byteLength(value, "utf8") > 32_768 ||
      value.includes("\0") ||
      value.includes("\r") ||
      value.includes("\n")
    ) {
      configurationError(`Codex environment value must be a bounded single line: ${name}`);
    }
    environment[name] = value;
  }

  const readOnlyPaths = [...(input.readOnlyPaths ?? [])];
  const permissionProfileName =
    input.permissionProfileName === undefined
      ? undefined
      : (() => {
          const value = portableIdentifier(
            input.permissionProfileName,
            "Codex permission profile",
            100,
          );
          if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
            configurationError("Codex permission profile must use its safe lowercase format.");
          }
          return value;
        })();
  return {
    executable,
    executableDigest,
    expectedCliVersion,
    model,
    codexHome,
    runnerRoot,
    outputSchemaPath,
    environmentAllowlist,
    environment,
    readOnlyPaths,
    permissionProfileName,
    registrationTimeoutMs: boundedInteger(
      input.registrationTimeoutMs,
      DEFAULT_REGISTRATION_TIMEOUT_MS,
      "registrationTimeoutMs",
      1,
      60_000,
    ),
    pollMs: boundedInteger(input.pollMs, DEFAULT_POLL_MS, "pollMs", 1, 1_000),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

type AdapterRunKey = Readonly<{ runKey: string; runId: string; fence: number }>;

function runKeyFor(spec: AgentRunSpecV1): string {
  return `codex-${spec.runId}-f${String(spec.fence)}`;
}

function listAdapterRunKeys(runnerRoot: string): readonly AdapterRunKey[] {
  const runKeys: AdapterRunKey[] = [];
  for (const entry of readdirSync(runnerRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = ADAPTER_RUN_KEY_PATTERN.exec(entry.name);
    if (match === null || match[1] === undefined || match[2] === undefined) continue;
    const fence = Number(match[2]);
    if (!Number.isSafeInteger(fence)) {
      throw new Error(
        `Codex runner contains an adapter run key with an unsafe fence: ${entry.name}`,
      );
    }
    runKeys.push({ runKey: entry.name, runId: match[1], fence });
  }
  return runKeys.sort((left, right) => left.runKey.localeCompare(right.runKey));
}

function sameIntentExceptCreatedAt(
  left: ReturnType<typeof createSupervisedRunIntent>,
  right: ReturnType<typeof createSupervisedRunIntent>,
): boolean {
  const withoutCreatedAt = (value: ReturnType<typeof createSupervisedRunIntent>): unknown =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "createdAt"));
  return JSON.stringify(withoutCreatedAt(left)) === JSON.stringify(withoutCreatedAt(right));
}

function failedOutcome(code: string, summary: string, retryable = false): LocalAgentRunOutcome {
  return {
    kind: "failed",
    failure: {
      code: NamespacedCodeSchema.parse(code),
      summary: summary.slice(0, 1_000),
      retryable,
      detailArtifactDigest: null,
    },
  };
}

function supervisorAmbiguityOutcome(summary: string): LocalAgentRunOutcome {
  return {
    kind: "needs-input",
    blocker: {
      kind: "environment",
      code: NamespacedCodeSchema.parse("agent.supervisor-ambiguous"),
      summary: summary.slice(0, 1_000),
      requiredAction:
        "Inspect the durable supervised-run identity and receipt before explicitly resuming or submitting a replacement attempt.",
    },
  };
}

function deterministicEventId(spec: AgentRunSpecV1, status: string, sequence: number): string {
  const value = createHash("sha256")
    .update(
      [
        "app-factory.codex-supervisor-event.v1",
        spec.runId,
        spec.attemptId,
        spec.stepId,
        String(spec.fence),
        status,
        String(sequence),
      ].join("\0"),
    )
    .digest("hex");
  const variant = ((Number.parseInt(value.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-${variant}${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function minimalEvents(spec: AgentRunSpecV1, result: AgentRunResultV1): readonly AgentEventV1[] {
  return [
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      eventId: deterministicEventId(spec, result.status, 1),
      runId: spec.runId,
      attemptId: spec.attemptId,
      stepId: spec.stepId,
      fence: spec.fence,
      sequence: 1,
      occurredAt: result.startedAt,
      type: "agent.started",
      data: { adapterId: CODEX_AGENT_ADAPTER_ID },
    }),
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      eventId: deterministicEventId(spec, result.status, 2),
      runId: spec.runId,
      attemptId: spec.attemptId,
      stepId: spec.stepId,
      fence: spec.fence,
      sequence: 2,
      occurredAt: result.finishedAt,
      type: "agent.finished",
      data: { status: result.status },
    }),
  ];
}

function strictUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function receiptCapture(
  receipt: SupervisedRunReceiptV1,
  stdout: Buffer,
  stderr: Buffer,
): Readonly<{ capture: CodexProcessCapture; invalidUtf8: boolean }> {
  const stdoutText = strictUtf8(stdout);
  const stderrText = strictUtf8(stderr);
  const terminationOrigin: CodexProcessCapture["terminationOrigin"] =
    receipt.terminationOrigin === "timeout"
      ? "timed-out"
      : receipt.terminationOrigin === "cancellation"
        ? "cancelled"
        : receipt.terminationOrigin === "output-overflow"
          ? "output-overflow"
          : "none";
  return {
    capture: {
      exitCode: receipt.process.exitCode,
      signal: receipt.process.signal as NodeJS.Signals | null,
      terminationOrigin,
      stdout: stdoutText ?? "",
      stderr: stderrText ?? "",
      stdoutTruncated: receipt.stdout.truncated,
      stderrTruncated: receipt.stderr.truncated,
    },
    invalidUtf8: stdoutText === null || stderrText === null,
  };
}

function normalizeMaterializedResult(
  spec: AgentRunSpecV1,
  cliVersion: string,
  receipt: SupervisedRunReceiptV1,
  stdout: Buffer,
  stderr: Buffer,
): Readonly<{ result: AgentRunResultV1; events: readonly AgentEventV1[] }> {
  const { capture, invalidUtf8 } = receiptCapture(receipt, stdout, stderr);
  const materialized = materializeCodexRunV1({
    spec,
    identity: {
      adapterId: CODEX_AGENT_ADAPTER_ID,
      adapterVersion: CODEX_AGENT_ADAPTER_VERSION,
      codexCliVersion: cliVersion,
    },
    capture,
    startedAt: receipt.permittedAt,
    finishedAt: receipt.finishedAt,
  });
  const output = {
    stdout: {
      digest: Sha256DigestSchema.parse(receipt.stdout.sha256),
      byteLength: receipt.stdout.capturedByteLength,
      truncated: receipt.stdout.truncated,
    },
    stderr: {
      digest: Sha256DigestSchema.parse(receipt.stderr.sha256),
      byteLength: receipt.stderr.capturedByteLength,
      truncated: receipt.stderr.truncated,
    },
  } as const;

  const forcedFailure: FailureV1 | null = invalidUtf8
    ? {
        code: NamespacedCodeSchema.parse("agent.protocol-error"),
        summary: "Codex emitted output that was not valid UTF-8.",
        retryable: false,
        detailArtifactDigest: null,
      }
    : null;
  const result = AgentRunResultV1Schema.parse(
    forcedFailure === null
      ? { ...materialized.result, ...output }
      : {
          ...materialized.result,
          ...output,
          finalEventSequence: 2,
          status: "failed",
          failure: forcedFailure,
          blocker: null,
        },
  );
  return {
    result,
    events:
      result.status === materialized.result.status
        ? materialized.events
        : minimalEvents(spec, result),
  };
}

function outcomeFromResult(
  result: AgentRunResultV1,
  changedPaths: readonly string[],
  protocolEvidence: LocalAgentProtocolEvidenceV1,
): LocalAgentRunOutcome {
  if (result.status === "succeeded") {
    return {
      kind: "succeeded",
      summary: "Codex completed; trusted verification remains authoritative.",
      changedPaths,
      protocolEvidence,
    };
  }
  if (result.status === "blocked") {
    return { kind: "needs-input", blocker: result.blocker, protocolEvidence };
  }
  return { kind: "failed", failure: result.failure, protocolEvidence };
}

function safeReadBoundOutput(
  path: string,
  expected: SupervisedRunReceiptV1["stdout"],
  label: string,
): Buffer {
  const bytes = readBoundedPrivateFile(path, MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM, label);
  if (bytes.byteLength !== expected.capturedByteLength || digest(bytes) !== expected.sha256) {
    throw new Error(`${label} does not match its verified supervisor receipt.`);
  }
  return bytes;
}

function assertReceiptEvidence(
  prepared: PreparedSupervisedRun,
  receipt: SupervisedRunReceiptV1,
  receiptBytes: Buffer,
): void {
  if (!receiptBytes.equals(Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8"))) {
    throw new Error("Codex supervisor receipt is not in its exact canonical serialized form.");
  }
  if (
    receipt.runKey !== prepared.intent.runKey ||
    receipt.attemptId !== prepared.intent.attemptId ||
    receipt.fence !== prepared.intent.fence ||
    receipt.intentDigest !== prepared.intentDigest ||
    receipt.invocationDigest !== prepared.intent.invocationDigest
  ) {
    throw new Error("Codex supervisor receipt does not bind the prepared durable run.");
  }
}

function resolveChangedPaths(capture: CodexProcessCapture): readonly string[] {
  const classification = classifyCodexProcess(capture);
  return classification.kind === "process-completed" ? classification.reported.changedPaths : [];
}

export class CodexLocalAgent {
  public readonly adapterId = CODEX_AGENT_ADAPTER_ID;
  public readonly adapterVersion = CODEX_AGENT_ADAPTER_VERSION;
  readonly #configuration: ValidatedConfiguration;
  readonly #cliVersion: string;
  readonly #supervisor: CodexLocalAgentSupervisorPort;
  readonly #now: () => Date;
  readonly #monotonicNow: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  public static async create(
    input: CodexLocalAgentConfigurationV1,
    dependencies: CodexLocalAgentDependencies = {},
  ): Promise<CodexLocalAgent> {
    const configuration = validateConfiguration(input);
    const preflight = dependencies.preflight ?? preflightCodex;
    const result = await preflight({
      executable: configuration.executable,
      cwd: configuration.runnerRoot,
      environment: {
        CODEX_HOME: configuration.codexHome,
        NO_COLOR: "1",
        RUST_LOG: "error",
        TERM: "dumb",
      },
      supportedVersions: [configuration.expectedCliVersion],
    });
    if (!result.ready) {
      configurationError(`Codex preflight failed (${result.reason}): ${result.summary}`);
    }
    if (result.version !== configuration.expectedCliVersion) {
      configurationError("Codex preflight returned a different CLI version than configured.");
    }
    if (result.executable !== configuration.executable) {
      configurationError("Codex preflight returned a different executable than configured.");
    }
    return new CodexLocalAgent(configuration, result.version, dependencies);
  }

  private constructor(
    configuration: ValidatedConfiguration,
    cliVersion: string,
    dependencies: CodexLocalAgentDependencies,
  ) {
    this.#configuration = configuration;
    this.#cliVersion = cliVersion;
    this.#supervisor = { ...DEFAULT_SUPERVISOR, ...dependencies.supervisor };
    this.#now = dependencies.now ?? (() => new Date());
    this.#monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
    this.#sleep =
      dependencies.sleep ??
      (async (milliseconds) =>
        await new Promise<void>((resolvePromise) => {
          setTimeout(resolvePromise, milliseconds);
        }));
  }

  /** Read-only startup barrier: adopt or verify every durable adapter run before serving work. */
  public async reconcileStartup(): Promise<void> {
    for (const candidate of listAdapterRunKeys(this.#configuration.runnerRoot)) {
      const prepared = this.#supervisor.open(this.#configuration.runnerRoot, candidate.runKey);
      if (prepared === null) {
        throw new Error(
          `Codex startup recovery found ${candidate.runKey} without a readable durable intent.`,
        );
      }
      const reconciled = this.#supervisor.reconcile(prepared);
      if (reconciled.outcome === "terminal" || reconciled.outcome === "prepared") {
        continue;
      }
      if (reconciled.outcome === "adopted") {
        throw new Error(
          `Codex startup recovery found live run ${candidate.runKey}; readiness is denied until its terminal receipt can be reconciled.`,
        );
      }
      if (reconciled.outcome === "blocked") {
        throw new Error(
          `Codex startup recovery is ambiguous for ${candidate.runKey}: ${reconciled.reason}`,
        );
      }
      throw new Error(`Codex startup recovery returned an unknown state for ${candidate.runKey}.`);
    }
  }

  public async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
    const spec = AgentRunSpecV1Schema.parse(context.spec);
    await context.assertActive();
    if (spec.adapterId !== this.adapterId) {
      return failedOutcome("agent.identity-mismatch", "Daemon issued a run for another adapter.");
    }
    if (!sameStringSet(spec.environmentAllowlist, this.#configuration.environmentAllowlist)) {
      return failedOutcome(
        "agent.environment-mismatch",
        "Daemon-issued environment allowlist differs from the reviewed Codex profile.",
      );
    }
    if (spec.limits.maxEventCount < 3) {
      return failedOutcome(
        "agent.event-limit-invalid",
        "Codex execution requires room for start, blocker, and terminal events.",
      );
    }
    if (
      spec.limits.maxStdoutBytes !== spec.limits.maxStderrBytes ||
      spec.limits.maxStdoutBytes < 1 ||
      spec.limits.maxStdoutBytes > MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM
    ) {
      return failedOutcome(
        "agent.output-limit-invalid",
        "The current durable supervisor requires equal non-zero stdout and stderr limits.",
      );
    }
    if (digestExecutable(this.#configuration.executable) !== this.#configuration.executableDigest) {
      return failedOutcome(
        "agent.executable-changed",
        "Codex executable changed after its successful preflight.",
      );
    }

    const worktree = resolve(spec.workingDirectory);
    for (const protectedRoot of [this.#configuration.runnerRoot, this.#configuration.codexHome]) {
      if (pathsOverlap(worktree, protectedRoot)) {
        return failedOutcome(
          "agent.runtime-path-overlap",
          "Codex runtime or authentication storage overlaps its untrusted worktree.",
        );
      }
    }

    let invocation;
    try {
      invocation = buildCodexInvocation(spec, {
        executable: this.#configuration.executable,
        model: this.#configuration.model,
        codexHome: this.#configuration.codexHome,
        outputSchemaPath: this.#configuration.outputSchemaPath,
        sourceEnvironment: this.#configuration.environment,
        readOnlyPaths: this.#configuration.readOnlyPaths,
        ...(this.#configuration.permissionProfileName === undefined
          ? {}
          : { permissionProfileName: this.#configuration.permissionProfileName }),
      });
    } catch (error) {
      return failedOutcome(
        "agent.invocation-rejected",
        `Codex invocation failed closed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const runKey = runKeyFor(spec);
    const createdAt = this.#now().toISOString();
    const intentInput: CreateSupervisedRunIntentInput = {
      runKey,
      attemptId: spec.attemptId,
      fence: spec.fence,
      createdAt,
      executable: invocation.executable,
      argv: invocation.args,
      cwd: invocation.cwd,
      environment: invocation.environment,
      stdin: Buffer.from(invocation.stdin, "utf8"),
      limits: {
        timeoutMs: spec.limits.timeoutMs,
        graceMs: spec.limits.terminationGraceMs,
        forceWaitMs: Math.min(60_000, Math.max(100, spec.limits.terminationGraceMs)),
        pollMs: this.#configuration.pollMs,
        maxOutputBytesPerStream: spec.limits.maxStdoutBytes,
      },
    };

    await context.assertActive();
    const priorFenceOutcome = await this.#reconcilePriorFences(spec);
    if (priorFenceOutcome !== null) return priorFenceOutcome;
    let prepared: PreparedSupervisedRun;
    try {
      const existing = this.#supervisor.open(this.#configuration.runnerRoot, runKey);
      if (existing === null) {
        prepared = this.#supervisor.prepare(this.#configuration.runnerRoot, intentInput);
      } else {
        const proposed = createSupervisedRunIntent(intentInput);
        if (!sameIntentExceptCreatedAt(existing.intent, proposed)) {
          return failedOutcome(
            "agent.supervisor-intent-conflict",
            "A durable Codex run already exists for this logical run with different inputs.",
          );
        }
        prepared = existing;
      }
    } catch (error) {
      return failedOutcome(
        "agent.supervisor-ambiguous",
        `Durable Codex preparation failed closed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await context.assertActive();
    let receipt: SupervisedRunReceiptV1;
    try {
      const launched = this.#supervisor.launch(prepared);
      if (launched.outcome === "blocked") {
        return supervisorAmbiguityOutcome(launched.reason);
      }
      if (launched.outcome === "already-terminal") {
        receipt = launched.receipt;
      } else {
        if (launched.outcome === "launch-requested") {
          const registered = await this.#supervisor.waitForRegistration(
            prepared,
            launched.registration,
            {
              timeoutMs: this.#configuration.registrationTimeoutMs,
              pollMs: this.#configuration.pollMs,
            },
          );
          if (registered.outcome === "blocked") {
            return supervisorAmbiguityOutcome(registered.reason);
          }
          if (registered.outcome === "terminal") {
            receipt = registered.receipt;
          } else {
            const terminal = await this.#waitForTerminal(prepared, spec, context.signal);
            if (terminal.kind === "blocked") {
              return supervisorAmbiguityOutcome(terminal.reason);
            }
            receipt = terminal.receipt;
          }
        } else {
          const terminal = await this.#waitForTerminal(prepared, spec, context.signal);
          if (terminal.kind === "blocked") {
            return supervisorAmbiguityOutcome(terminal.reason);
          }
          receipt = terminal.receipt;
        }
      }
    } catch (error) {
      // Once launch has been attempted, an exception cannot prove that no
      // target remains live. Block the attempt without publishing a terminal
      // result or allowing the scheduler to create successive fenced runs.
      return supervisorAmbiguityOutcome(
        `Durable Codex execution is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      const stdout = safeReadBoundOutput(prepared.paths.stdoutPath, receipt.stdout, "Codex stdout");
      const stderr = safeReadBoundOutput(prepared.paths.stderrPath, receipt.stderr, "Codex stderr");
      const receiptBytes = readBoundedPrivateFile(
        prepared.paths.receiptPath,
        MAX_RECEIPT_BYTES,
        "Codex supervisor receipt",
      );
      const supervisorIntentBytes = readBoundedPrivateFile(
        prepared.paths.intentPath,
        MAX_SUPERVISED_INTENT_BYTES,
        "Codex supervisor intent",
      );
      if (
        !supervisorIntentBytes.equals(Buffer.from(`${JSON.stringify(prepared.intent)}\n`, "utf8"))
      ) {
        throw new Error("Codex supervisor intent is not in its exact canonical serialized form.");
      }
      assertReceiptEvidence(prepared, receipt, receiptBytes);
      const materialized = normalizeMaterializedResult(
        spec,
        this.#cliVersion,
        receipt,
        stdout,
        stderr,
      );
      const capture = receiptCapture(receipt, stdout, stderr).capture;
      const environmentEntries = Object.entries(invocation.environment).sort(([left], [right]) =>
        left.localeCompare(right),
      );
      const descriptor: LocalAgentInvocationDescriptorV1 = {
        schemaVersion: 1,
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        cliVersion: this.#cliVersion,
        model: this.#configuration.model,
        executable: this.#configuration.executable,
        executableDigest: this.#configuration.executableDigest,
        argv: invocation.args,
        workingDirectory: invocation.cwd,
        environmentNames: environmentEntries.map(([name]) => name),
        environmentProjectionDigest: digest(canonicalJsonBytes(environmentEntries)),
        stdinDigest: digest(Buffer.from(invocation.stdin, "utf8")),
        supervisorRunKey: runKey,
        supervisorIntentDigest: Sha256DigestSchema.parse(prepared.intentDigest),
        supervisorInvocationDigest: Sha256DigestSchema.parse(prepared.intent.invocationDigest),
      };
      const protocolEvidence: LocalAgentProtocolEvidenceV1 = {
        schemaVersion: 1,
        runSpec: spec,
        result: materialized.result,
        events: materialized.events,
        stdout,
        stderr,
        invocationDescriptor: canonicalJsonBytes(descriptor),
        supervisorIntent: supervisorIntentBytes,
        supervisorReceipt: receiptBytes,
      };
      return outcomeFromResult(materialized.result, resolveChangedPaths(capture), protocolEvidence);
    } catch (error) {
      return failedOutcome(
        "agent.evidence-invalid",
        `Codex evidence failed closed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async #reconcilePriorFences(spec: AgentRunSpecV1): Promise<LocalAgentRunOutcome | null> {
    for (const candidate of listAdapterRunKeys(this.#configuration.runnerRoot)) {
      if (candidate.runId !== spec.runId || candidate.fence === spec.fence) continue;
      if (candidate.fence > spec.fence) {
        return failedOutcome(
          "agent.supervisor-future-fence",
          `A durable Codex run already exists at future fence ${String(candidate.fence)}.`,
        );
      }
      let prepared: PreparedSupervisedRun | null;
      try {
        prepared = this.#supervisor.open(this.#configuration.runnerRoot, candidate.runKey);
      } catch (error) {
        return failedOutcome(
          "agent.supervisor-ambiguous",
          `Older-fence Codex intent could not be opened: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (prepared === null) {
        return failedOutcome(
          "agent.supervisor-ambiguous",
          `Older-fence Codex directory ${candidate.runKey} has no readable durable intent.`,
        );
      }
      let reconciled: ReconcileSupervisedRunResult;
      try {
        reconciled = this.#supervisor.reconcile(prepared);
      } catch (error) {
        return failedOutcome(
          "agent.supervisor-ambiguous",
          `Older-fence Codex reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (reconciled.outcome === "terminal" || reconciled.outcome === "prepared") continue;
      if (reconciled.outcome !== "adopted" && reconciled.outcome !== "blocked") {
        return failedOutcome(
          "agent.supervisor-ambiguous",
          "Older-fence Codex reconciliation returned an unknown state.",
        );
      }
      try {
        const termination = await this.#supervisor.terminate(prepared);
        if (termination.outcome === "already-terminal") continue;
        if (termination.outcome === "blocked") {
          return failedOutcome(
            "agent.supervisor-ambiguous",
            `Older-fence Codex run could not be identity-safely cancelled: ${termination.reason}${
              reconciled.outcome === "blocked"
                ? `; reconciliation was also ambiguous: ${reconciled.reason}`
                : ""
            }`,
          );
        }
        return failedOutcome(
          "agent.supervisor-stale-fence",
          termination.outcome === "termination-requested"
            ? "An older-fence Codex run may be live; durable cancellation was requested and its terminal receipt must be reconciled before retrying."
            : `An older-fence Codex run is not terminal (${termination.reason}); reconcile its durable terminal receipt before retrying.`,
        );
      } catch (error) {
        return failedOutcome(
          "agent.supervisor-ambiguous",
          `Older-fence Codex cancellation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return null;
  }

  async #waitForTerminal(
    prepared: PreparedSupervisedRun,
    spec: AgentRunSpecV1,
    signal: AbortSignal,
  ): Promise<TerminalWaitResult> {
    const deadline =
      this.#monotonicNow() +
      spec.limits.timeoutMs +
      spec.limits.terminationGraceMs * 2 +
      COMPLETION_MARGIN_MS;
    let cancellationRequested = false;
    while (this.#monotonicNow() <= deadline) {
      if (signal.aborted && !cancellationRequested) {
        cancellationRequested = true;
        const termination = await this.#supervisor.terminate(prepared);
        if (termination.outcome === "blocked") {
          return { kind: "blocked", reason: termination.reason };
        }
        if (termination.outcome === "already-terminal") {
          return { kind: "terminal", receipt: termination.receipt };
        }
      }
      const reconciled = this.#supervisor.reconcile(prepared);
      if (reconciled.outcome === "terminal") {
        return { kind: "terminal", receipt: reconciled.receipt };
      }
      if (reconciled.outcome === "blocked") {
        if (
          reconciled.reason ===
            "terminal-receipt-exists-but-controller-process-group-is-still-live" ||
          reconciled.reason === "terminal-receipt-exists-but-target-process-group-is-still-live" ||
          reconciled.reason === "target-exited-without-terminal-receipt"
        ) {
          await this.#sleep(this.#configuration.pollMs);
          continue;
        }
        return { kind: "blocked", reason: reconciled.reason };
      }
      if (reconciled.outcome === "prepared") {
        return { kind: "blocked", reason: "launch-disappeared-after-launch-request" };
      }
      await this.#sleep(this.#configuration.pollMs);
    }
    return {
      kind: "blocked",
      reason: "terminal-receipt-deadline-expired; the durable run must be reconciled before retry",
    };
  }
}

export async function createCodexLocalAgent(
  input: CodexLocalAgentConfigurationV1,
  dependencies: CodexLocalAgentDependencies = {},
): Promise<CodexLocalAgent> {
  return await CodexLocalAgent.create(input, dependencies);
}
