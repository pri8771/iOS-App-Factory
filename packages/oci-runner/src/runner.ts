import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import {
  assertOciInspectionMatchesIntent,
  type OciContainerInspection,
  type OciEnginePort,
  type OciLogCapture,
  type OciRemovalEvidence,
} from "./docker-cli.js";
import {
  canonicalJsonLine,
  digestOciRunIntent,
  labelsForOciRun,
  parseOciRunIntent,
  parseOciRunReceipt,
  sha256Digest,
  type OciCapturedOutputV1,
  type OciRunIntentV1,
  type OciRunReceiptV1,
} from "./model.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_MASK = 0o077;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

export type OciRunPhase =
  "planned" | "created" | "running" | "terminal" | "removed" | "cancelled-before-start";

export type OciRunPaths = Readonly<{
  runDirectory: string;
  intentPath: string;
  createdInspectionPath: string;
  runningInspectionPath: string;
  terminalInspectionPath: string;
  stdoutPath: string;
  stderrPath: string;
  removalPath: string;
  receiptPath: string;
}>;

export type PreparedOciRun = Readonly<{
  intent: OciRunIntentV1;
  intentDigest: string;
  paths: OciRunPaths;
  preparation: "created" | "already-prepared";
}>;

export type OciPreStartCancellationEvidenceV1 = Readonly<{
  schemaVersion: 1;
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  intentDigest: string;
  state: "planned" | "created";
  containerId: string | null;
  terminationRequestDigest: string;
  removalEvidenceDigest: string | null;
  cancelledAt: string;
}>;

export type ReconcileOciRunResult =
  | Readonly<{ phase: "created" | "running"; containerId: string }>
  | Readonly<{ phase: "removed"; receipt: OciRunReceiptV1 }>
  | Readonly<{
      phase: "cancelled-before-start";
      cancellation: OciPreStartCancellationEvidenceV1;
    }>;

export type OciFailureBoundary =
  | "after-image-verification"
  | "after-find"
  | "after-create-attempt"
  | "after-create"
  | "after-inspect"
  | "after-launch-attempt"
  | "after-start"
  | "after-logs"
  | "after-termination-request"
  | "after-stop"
  | "after-kill"
  | "after-remove"
  | "after-removal-evidence";

export type OciRunnerDependencies = Readonly<{
  now?: () => Date;
  afterBoundary?: (boundary: OciFailureBoundary) => void;
}>;

export class OciRunnerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OciRunnerError";
  }
}

export class OciRunnerBusyError extends OciRunnerError {
  public readonly code = "OCI_RUN_BUSY";
  public readonly retryable = true;

  public constructor(runKey: string, options?: ErrorOptions) {
    super(
      `OCI run ${runKey} is already being reconciled; retry after the active owner finishes, or inspect the lock before operator recovery if its owner crashed`,
      options,
    );
    this.name = "OciRunnerBusyError";
  }
}

export class OciRunnerCreatePendingError extends OciRunnerError {
  public readonly code = "OCI_CREATE_PENDING";
  public readonly retryable = true;

  public constructor(runKey: string) {
    super(
      `OCI run ${runKey} has a durable create attempt but no visible container; retry exact-label reconciliation without recreating or finalizing cancellation`,
    );
    this.name = "OciRunnerCreatePendingError";
  }
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function normalizedAbsolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || resolve(value) !== value || value.includes("\0")) {
    throw new OciRunnerError(`${label} must be a normalized absolute path`);
  }
  return value;
}

function assertNoSymbolicLinkAncestors(path: string): void {
  const root = parse(path).root;
  let cursor = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) return;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new OciRunnerError(`OCI artifact path traverses a symbolic link: ${cursor}`);
    }
  }
}

function ensurePrivateDirectory(path: string): void {
  normalizedAbsolutePath(path, "OCI artifact directory");
  assertNoSymbolicLinkAncestors(path);
  mkdirSync(path, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertNoSymbolicLinkAncestors(path);
  const stats = lstatSync(path);
  const uid = currentUserId();
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    realpathSync(path) !== path ||
    (stats.mode & PRIVATE_MASK) !== 0 ||
    (uid !== undefined && stats.uid !== uid)
  ) {
    throw new OciRunnerError("OCI artifact directory must be private and current-user-owned");
  }
}

function synchronizeDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeAll(descriptor: number, bytes: Uint8Array): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written < 1) throw new OciRunnerError("OCI artifact write made no progress");
    offset += written;
  }
}

function readPrivateFile(path: string, maximumBytes = MAX_ARTIFACT_BYTES): Buffer | null {
  if (!existsSync(path)) return null;
  assertNoSymbolicLinkAncestors(dirname(path));
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    const uid = currentUserId();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > maximumBytes ||
      (before.mode & PRIVATE_MASK) !== 0 ||
      (uid !== undefined && before.uid !== uid)
    ) {
      throw new OciRunnerError("OCI artifact is not one bounded private regular file");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      bytes.byteLength !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new OciRunnerError("OCI artifact changed during its bounded read");
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function writeImmutable(path: string, bytes: Uint8Array): "created" | "existing" {
  const existing = readPrivateFile(path, Math.max(MAX_ARTIFACT_BYTES, bytes.byteLength));
  if (existing !== null) {
    if (!existing.equals(bytes))
      throw new OciRunnerError(`Immutable OCI artifact conflicts: ${path}`);
    return "existing";
  }
  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
  } catch (error) {
    const raced = readPrivateFile(path, Math.max(MAX_ARTIFACT_BYTES, bytes.byteLength));
    if (raced !== null && raced.equals(bytes)) return "existing";
    throw new OciRunnerError(`Could not publish immutable OCI artifact: ${path}`, { cause: error });
  }
  try {
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  synchronizeDirectory(dirname(path));
  return "created";
}

function jsonArtifact(path: string, value: unknown): void {
  writeImmutable(path, canonicalJsonLine(value));
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!canonicalJsonLine(value).equals(bytes)) throw new Error(`${label} is not canonical`);
    return value;
  } catch (error) {
    throw new OciRunnerError(`${label} is invalid`, { cause: error });
  }
}

function safeRunKey(runKey: string): string {
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(runKey)) {
    throw new OciRunnerError("OCI run key is not path-safe");
  }
  return runKey;
}

export function deriveOciRunPaths(rootDirectory: string, runKey: string): OciRunPaths {
  normalizedAbsolutePath(rootDirectory, "OCI run root");
  const runDirectory = join(rootDirectory, safeRunKey(runKey));
  return {
    runDirectory,
    intentPath: join(runDirectory, "intent.json"),
    createdInspectionPath: join(runDirectory, "created.inspect.json"),
    runningInspectionPath: join(runDirectory, "running.inspect.json"),
    terminalInspectionPath: join(runDirectory, "terminal.inspect.json"),
    stdoutPath: join(runDirectory, "stdout.bin"),
    stderrPath: join(runDirectory, "stderr.bin"),
    removalPath: join(runDirectory, "removed.json"),
    receiptPath: join(runDirectory, "receipt.json"),
  };
}

export function prepareOciRun(rootDirectory: string, intentInput: OciRunIntentV1): PreparedOciRun {
  const intent = parseOciRunIntent(intentInput);
  ensurePrivateDirectory(rootDirectory);
  const paths = deriveOciRunPaths(rootDirectory, intent.runKey);
  ensurePrivateDirectory(paths.runDirectory);
  const preparation = writeImmutable(paths.intentPath, canonicalJsonLine(intent));
  return {
    intent,
    intentDigest: digestOciRunIntent(intent),
    paths,
    preparation: preparation === "created" ? "created" : "already-prepared",
  };
}

export function openPreparedOciRun(rootDirectory: string, runKey: string): PreparedOciRun | null {
  const paths = deriveOciRunPaths(rootDirectory, runKey);
  const bytes = readPrivateFile(paths.intentPath);
  if (bytes === null) return null;
  const intent = parseOciRunIntent(parseJson(bytes, "OCI run intent"));
  if (intent.runKey !== runKey)
    throw new OciRunnerError("OCI intent run key conflicts with its path");
  return {
    intent,
    intentDigest: digestOciRunIntent(intent),
    paths,
    preparation: "already-prepared",
  };
}

function validateContainerId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new OciRunnerError("Persisted OCI container ID is invalid");
  }
  return value;
}

type BoundIdentity = Readonly<{
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  intentDigest: string;
}>;

type LaunchAttemptV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    containerId: string;
    createdInspectionDigest: string;
    attemptedAt: string;
  }>;

type CreateAttemptV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    attemptedAt: string;
  }>;

type TerminationRequestV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    phase: "pre-start" | "running";
    origin: "wall-time" | "cancellation";
    containerId: string | null;
    startedAt: string | null;
    deadline: string | null;
    requestedAt: string;
  }>;

type BoundRemovalEvidenceV1 = OciRemovalEvidence & BoundIdentity & Readonly<{ schemaVersion: 1 }>;

type TerminalRecordV1 = Readonly<{
  inspection: OciContainerInspection;
  logs: Readonly<{ stdout: OciCapturedOutputV1; stderr: OciCapturedOutputV1 }>;
  outcome: OciRunReceiptV1["outcome"];
  terminationOrigin: OciRunReceiptV1["terminationOrigin"];
  terminationRequestDigest: string | null;
}>;

const INSPECTION_KEYS = [
  "capDrop",
  "command",
  "containerId",
  "cpuNanoCount",
  "createdAt",
  "entrypoint",
  "environment",
  "exitCode",
  "finishedAt",
  "imageId",
  "labels",
  "logDriver",
  "logOptions",
  "memoryBytes",
  "memorySwapBytes",
  "mounts",
  "name",
  "networkMode",
  "oomKilled",
  "pidLimit",
  "privileged",
  "readOnlyRootFilesystem",
  "running",
  "securityOptions",
  "startedAt",
  "status",
  "stopTimeoutSeconds",
  "tmpfs",
  "user",
  "workingDirectory",
] as const;

function artifactPaths(prepared: PreparedOciRun): Readonly<{
  createAttempt: string;
  launchAttempt: string;
  terminationRequest: string;
  preStartCancellation: string;
  terminalRecord: string;
}> {
  return {
    createAttempt: join(prepared.paths.runDirectory, "create-attempt.json"),
    launchAttempt: join(prepared.paths.runDirectory, "launch-attempt.json"),
    terminationRequest: join(prepared.paths.runDirectory, "termination-request.json"),
    preStartCancellation: join(prepared.paths.runDirectory, "pre-start-cancellation.json"),
    terminalRecord: join(prepared.paths.runDirectory, "terminal.json"),
  };
}

function artifactRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OciRunnerError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactArtifactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new OciRunnerError(`${label} has unknown or missing fields`);
  }
}

function artifactString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 8_192 ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new OciRunnerError(`${label} must be one bounded line`);
  }
  return value;
}

function artifactDigest(value: unknown, label: string): string {
  const digest = artifactString(value, label);
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new OciRunnerError(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function artifactInstant(value: unknown, label: string): string {
  const instant = artifactString(value, label);
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== instant) {
    throw new OciRunnerError(`${label} must be a canonical UTC instant`);
  }
  return instant;
}

function artifactInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new OciRunnerError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function parsedArtifact(
  path: string,
  label: string,
  maximumBytes = MAX_ARTIFACT_BYTES,
): Readonly<{ bytes: Buffer; value: unknown }> | null {
  const bytes = readPrivateFile(path, maximumBytes);
  return bytes === null ? null : { bytes, value: parseJson(bytes, label) };
}

function persistedArtifactDigest(path: string, label: string): string {
  const bytes = readPrivateFile(path);
  if (bytes === null) throw new OciRunnerError(`${label} is missing`);
  return sha256Digest(bytes);
}

function boundIdentity(prepared: PreparedOciRun): BoundIdentity {
  return {
    runKey: prepared.intent.runKey,
    attemptId: prepared.intent.attemptId,
    runId: prepared.intent.runId,
    fence: prepared.intent.fence,
    intentDigest: prepared.intentDigest,
  };
}

type RunLockHandle = Readonly<{
  descriptor: number;
  path: string;
  device: number;
  inode: number;
}>;

function runLockPath(prepared: PreparedOciRun): string {
  return join(prepared.paths.runDirectory, "operation.lock");
}

function filesystemErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function assertOwnedRunLock(
  descriptor: number,
  path: string,
): Readonly<{ device: number; inode: number }> {
  const descriptorStats = fstatSync(descriptor);
  const pathStats = lstatSync(path);
  const uid = currentUserId();
  if (
    !descriptorStats.isFile() ||
    descriptorStats.nlink !== 1 ||
    (descriptorStats.mode & PRIVATE_MASK) !== 0 ||
    (uid !== undefined && descriptorStats.uid !== uid) ||
    !pathStats.isFile() ||
    pathStats.isSymbolicLink() ||
    pathStats.dev !== descriptorStats.dev ||
    pathStats.ino !== descriptorStats.ino
  ) {
    throw new OciRunnerError("OCI operation lock does not have one private owned identity");
  }
  return { device: descriptorStats.dev, inode: descriptorStats.ino };
}

function releaseRunLock(lock: RunLockHandle): void {
  try {
    const identity = assertOwnedRunLock(lock.descriptor, lock.path);
    if (identity.device !== lock.device || identity.inode !== lock.inode) {
      throw new OciRunnerError("OCI operation lock identity changed before release");
    }
    unlinkSync(lock.path);
    synchronizeDirectory(dirname(lock.path));
  } finally {
    closeSync(lock.descriptor);
  }
}

function acquireRunLock(prepared: PreparedOciRun, acquiredAt: Date): RunLockHandle {
  ensurePrivateDirectory(prepared.paths.runDirectory);
  const path = runLockPath(prepared);
  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
  } catch (error) {
    if (filesystemErrorCode(error) === "EEXIST") {
      throw new OciRunnerBusyError(prepared.intent.runKey, { cause: error });
    }
    throw new OciRunnerError("Could not acquire the OCI operation lock", { cause: error });
  }

  let lock: RunLockHandle | null = null;
  try {
    writeAll(
      descriptor,
      canonicalJsonLine({
        schemaVersion: 1,
        ...boundIdentity(prepared),
        ownerPid: process.pid,
        acquiredAt: acquiredAt.toISOString(),
      }),
    );
    fsyncSync(descriptor);
    const identity = assertOwnedRunLock(descriptor, path);
    lock = { descriptor, path, device: identity.device, inode: identity.inode };
    synchronizeDirectory(prepared.paths.runDirectory);
    return lock;
  } catch (error) {
    if (lock !== null) {
      try {
        releaseRunLock(lock);
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          "OCI operation lock acquisition and cleanup both failed",
          { cause: releaseError },
        );
      }
    } else {
      closeSync(descriptor);
    }
    throw new OciRunnerError("Could not durably acquire the OCI operation lock", { cause: error });
  }
}

async function whileRunLocked<T>(
  prepared: PreparedOciRun,
  acquiredAt: Date,
  operation: () => Promise<T>,
): Promise<T> {
  const lock = acquireRunLock(prepared, acquiredAt);
  let result: T | undefined;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let releaseFailed = false;
  let releaseError: unknown;
  try {
    releaseRunLock(lock);
  } catch (error) {
    releaseFailed = true;
    releaseError = error;
  }
  if (operationFailed && releaseFailed) {
    throw new AggregateError(
      [operationError, releaseError],
      "OCI operation and exact lock release both failed",
      { cause: releaseError },
    );
  }
  if (operationFailed) throw operationError;
  if (releaseFailed) throw releaseError;
  return result as T;
}

function assertBoundIdentity(
  value: Record<string, unknown>,
  prepared: PreparedOciRun,
  label: string,
): void {
  const expected = boundIdentity(prepared);
  if (
    value.runKey !== expected.runKey ||
    value.attemptId !== expected.attemptId ||
    value.runId !== expected.runId ||
    value.fence !== expected.fence ||
    value.intentDigest !== expected.intentDigest
  ) {
    throw new OciRunnerError(`${label} is not bound to the prepared OCI intent`);
  }
}

function assertSameCanonical(actual: unknown, expected: unknown, label: string): void {
  if (!canonicalJsonLine(actual).equals(canonicalJsonLine(expected))) {
    throw new OciRunnerError(`${label} conflicts with its bound evidence`);
  }
}

function parseInspectionArtifact(
  value: unknown,
  prepared: PreparedOciRun,
  expectedStatus: "created" | "terminal",
  label: string,
): OciContainerInspection {
  const input = artifactRecord(value, label);
  exactArtifactKeys(input, INSPECTION_KEYS, label);
  const inspection = input as unknown as OciContainerInspection;
  validateContainerId(inspection.containerId);
  const createdAt = artifactInstant(inspection.createdAt, `${label}.createdAt`);
  if (typeof inspection.running !== "boolean" || typeof inspection.oomKilled !== "boolean") {
    throw new OciRunnerError(`${label} has invalid state flags`);
  }
  assertOciInspectionMatchesIntent(inspection, prepared.intent);
  if (inspection.status !== expectedStatus || inspection.running) {
    throw new OciRunnerError(`${label} has an invalid lifecycle state`);
  }
  if (expectedStatus === "created") {
    if (
      inspection.startedAt !== null ||
      inspection.finishedAt !== null ||
      inspection.exitCode !== null
    ) {
      throw new OciRunnerError(`${label} is not a pre-start inspection`);
    }
  } else {
    const startedAt = artifactInstant(inspection.startedAt, `${label}.startedAt`);
    const finishedAt = artifactInstant(inspection.finishedAt, `${label}.finishedAt`);
    if (
      !Number.isInteger(inspection.exitCode) ||
      (inspection.exitCode as number) < 0 ||
      (inspection.exitCode as number) > 255 ||
      Date.parse(createdAt) > Date.parse(startedAt) ||
      Date.parse(startedAt) > Date.parse(finishedAt)
    ) {
      throw new OciRunnerError(`${label} has invalid terminal timing or exit state`);
    }
  }
  return inspection;
}

function persistedTerminalContainerId(path: string): string | null {
  const artifact = parsedArtifact(path, "OCI terminal inspection");
  if (artifact === null) return null;
  return validateContainerId(artifactRecord(artifact.value, "OCI terminal inspection").containerId);
}

function inspectionDigest(inspection: OciContainerInspection): string {
  return sha256Digest(canonicalJsonLine(inspection));
}

function capturedOutput(bytes: Buffer, observedBytes: number): OciCapturedOutputV1 {
  return {
    digest: sha256Digest(bytes),
    capturedByteLength: bytes.byteLength,
    observedByteLength: observedBytes,
    truncated: observedBytes > bytes.byteLength,
  };
}

function parseCapturedOutput(value: unknown, label: string): OciCapturedOutputV1 {
  const input = artifactRecord(value, label);
  exactArtifactKeys(
    input,
    ["capturedByteLength", "digest", "observedByteLength", "truncated"],
    label,
  );
  const capturedByteLength = artifactInteger(
    input.capturedByteLength,
    `${label}.capturedByteLength`,
  );
  const observedByteLength = artifactInteger(
    input.observedByteLength,
    `${label}.observedByteLength`,
  );
  if (
    observedByteLength < capturedByteLength ||
    typeof input.truncated !== "boolean" ||
    input.truncated !== observedByteLength > capturedByteLength
  ) {
    throw new OciRunnerError(`${label} has invalid bounded-output provenance`);
  }
  return {
    digest: artifactDigest(input.digest, `${label}.digest`),
    capturedByteLength,
    observedByteLength,
    truncated: input.truncated,
  };
}

function outcomeFor(
  inspection: OciContainerInspection,
  logs: OciLogCapture,
  limit: number,
  wallTimeMs: number,
  requestedTermination: "natural" | "wall-time" | "cancellation",
): Readonly<{
  outcome: OciRunReceiptV1["outcome"];
  terminationOrigin: OciRunReceiptV1["terminationOrigin"];
}> {
  if (logs.stdoutObservedBytes > limit || logs.stderrObservedBytes > limit) {
    return { outcome: "output-overflow", terminationOrigin: "output-overflow" };
  }
  if (requestedTermination === "wall-time")
    return { outcome: "timed-out", terminationOrigin: "wall-time" };
  if (requestedTermination === "cancellation")
    return { outcome: "cancelled", terminationOrigin: "cancellation" };
  if (
    inspection.exitCode === 0 &&
    !inspection.oomKilled &&
    inspection.startedAt !== null &&
    inspection.finishedAt !== null &&
    Date.parse(inspection.finishedAt) > Date.parse(inspection.startedAt) + wallTimeMs
  ) {
    return { outcome: "timed-out", terminationOrigin: "wall-time" };
  }
  return {
    outcome: inspection.exitCode === 0 && !inspection.oomKilled ? "succeeded" : "failed",
    terminationOrigin: "natural",
  };
}

function createAttemptFromPath(prepared: PreparedOciRun): CreateAttemptV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).createAttempt, "OCI create attempt");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI create attempt");
  exactArtifactKeys(
    input,
    ["attemptId", "attemptedAt", "fence", "intentDigest", "runId", "runKey", "schemaVersion"],
    "OCI create attempt",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI create attempt schema is invalid");
  assertBoundIdentity(input, prepared, "OCI create attempt");
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    attemptedAt: artifactInstant(input.attemptedAt, "OCI create attempt time"),
  };
}

function launchAttemptFromPath(prepared: PreparedOciRun): LaunchAttemptV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).launchAttempt, "OCI launch attempt");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI launch attempt");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "attemptedAt",
      "containerId",
      "createdInspectionDigest",
      "fence",
      "intentDigest",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI launch attempt",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI launch attempt schema is invalid");
  assertBoundIdentity(input, prepared, "OCI launch attempt");
  const launch: LaunchAttemptV1 = {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId: validateContainerId(input.containerId),
    createdInspectionDigest: artifactDigest(
      input.createdInspectionDigest,
      "OCI launch attempt created inspection digest",
    ),
    attemptedAt: artifactInstant(input.attemptedAt, "OCI launch attempt time"),
  };
  const createdArtifact = parsedArtifact(
    prepared.paths.createdInspectionPath,
    "OCI created inspection",
  );
  if (createdArtifact === null) {
    throw new OciRunnerError("OCI launch attempt is missing its created inspection");
  }
  const createdInspection = parseInspectionArtifact(
    createdArtifact.value,
    prepared,
    "created",
    "OCI created inspection",
  );
  if (
    createdInspection.containerId !== launch.containerId ||
    sha256Digest(createdArtifact.bytes) !== launch.createdInspectionDigest
  ) {
    throw new OciRunnerError("OCI launch attempt conflicts with its created inspection");
  }
  return launch;
}

function terminationRequestFromPath(prepared: PreparedOciRun): TerminationRequestV1 | null {
  const artifact = parsedArtifact(
    artifactPaths(prepared).terminationRequest,
    "OCI termination request",
  );
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI termination request");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "containerId",
      "deadline",
      "fence",
      "intentDigest",
      "origin",
      "phase",
      "requestedAt",
      "runId",
      "runKey",
      "schemaVersion",
      "startedAt",
    ],
    "OCI termination request",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI termination schema is invalid");
  assertBoundIdentity(input, prepared, "OCI termination request");
  if (
    (input.phase !== "pre-start" && input.phase !== "running") ||
    (input.origin !== "wall-time" && input.origin !== "cancellation")
  ) {
    throw new OciRunnerError("OCI termination request has an invalid phase or origin");
  }
  const request: TerminationRequestV1 = {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    phase: input.phase,
    origin: input.origin,
    containerId: input.containerId === null ? null : validateContainerId(input.containerId),
    startedAt:
      input.startedAt === null
        ? null
        : artifactInstant(input.startedAt, "OCI termination request start time"),
    deadline:
      input.deadline === null
        ? null
        : artifactInstant(input.deadline, "OCI termination request deadline"),
    requestedAt: artifactInstant(input.requestedAt, "OCI termination request time"),
  };
  if (request.phase === "pre-start") {
    if (
      request.origin !== "cancellation" ||
      request.startedAt !== null ||
      request.deadline !== null
    ) {
      throw new OciRunnerError("OCI pre-start termination request is inconsistent");
    }
  } else {
    if (request.containerId === null || request.startedAt === null || request.deadline === null) {
      throw new OciRunnerError("OCI running termination request is incomplete");
    }
    const expectedDeadline = new Date(
      Date.parse(request.startedAt) + prepared.intent.limits.wallTimeMs,
    ).toISOString();
    if (request.deadline !== expectedDeadline) {
      throw new OciRunnerError("OCI termination request deadline conflicts with the intent");
    }
  }
  return request;
}

function removalEvidenceFromPath(
  prepared: PreparedOciRun,
  expectedContainerId: string,
): BoundRemovalEvidenceV1 | null {
  const artifact = parsedArtifact(prepared.paths.removalPath, "OCI removal evidence");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI removal evidence");
  exactArtifactKeys(
    input,
    [
      "absent",
      "attemptId",
      "containerId",
      "fence",
      "intentDigest",
      "observedAt",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI removal evidence",
  );
  if (input.schemaVersion !== 1 || input.absent !== true) {
    throw new OciRunnerError("OCI removal evidence is not a proven absence");
  }
  assertBoundIdentity(input, prepared, "OCI removal evidence");
  const containerId = validateContainerId(input.containerId);
  if (containerId !== expectedContainerId) {
    throw new OciRunnerError("OCI removal evidence has the wrong container ID");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId,
    absent: true,
    observedAt: artifactInstant(input.observedAt, "OCI removal observation time"),
  };
}

function terminalRecordFromPath(prepared: PreparedOciRun): TerminalRecordV1 | null {
  const terminalArtifact = parsedArtifact(
    artifactPaths(prepared).terminalRecord,
    "OCI terminal record",
  );
  if (terminalArtifact === null) return null;
  const input = artifactRecord(terminalArtifact.value, "OCI terminal record");
  exactArtifactKeys(
    input,
    ["inspection", "logs", "outcome", "terminationOrigin", "terminationRequestDigest"],
    "OCI terminal record",
  );
  const inspectionArtifact = parsedArtifact(
    prepared.paths.terminalInspectionPath,
    "OCI terminal inspection",
  );
  if (inspectionArtifact === null) {
    throw new OciRunnerError("OCI terminal record is missing its terminal inspection");
  }
  assertSameCanonical(input.inspection, inspectionArtifact.value, "OCI terminal inspection");
  const inspection = parseInspectionArtifact(
    inspectionArtifact.value,
    prepared,
    "terminal",
    "OCI terminal inspection",
  );
  const logsInput = artifactRecord(input.logs, "OCI terminal logs");
  exactArtifactKeys(logsInput, ["stderr", "stdout"], "OCI terminal logs");
  const stdout = parseCapturedOutput(logsInput.stdout, "OCI terminal stdout");
  const stderr = parseCapturedOutput(logsInput.stderr, "OCI terminal stderr");
  const stdoutBytes = readPrivateFile(
    prepared.paths.stdoutPath,
    prepared.intent.limits.outputBytesPerStream,
  );
  const stderrBytes = readPrivateFile(
    prepared.paths.stderrPath,
    prepared.intent.limits.outputBytesPerStream,
  );
  if (stdoutBytes === null || stderrBytes === null) {
    throw new OciRunnerError("OCI terminal record is missing captured output artifacts");
  }
  for (const [label, bytes, captured] of [
    ["stdout", stdoutBytes, stdout],
    ["stderr", stderrBytes, stderr],
  ] as const) {
    if (
      bytes.byteLength !== captured.capturedByteLength ||
      sha256Digest(bytes) !== captured.digest
    ) {
      throw new OciRunnerError(`OCI ${label} artifact conflicts with its terminal digest`);
    }
  }
  const terminationRequest = terminationRequestFromPath(prepared);
  const expectedRequestDigest =
    terminationRequest === null
      ? null
      : persistedArtifactDigest(
          artifactPaths(prepared).terminationRequest,
          "OCI termination request",
        );
  const actualRequestDigest =
    input.terminationRequestDigest === null
      ? null
      : artifactDigest(input.terminationRequestDigest, "OCI terminal termination request digest");
  if (actualRequestDigest !== expectedRequestDigest) {
    throw new OciRunnerError("OCI terminal record has the wrong termination request digest");
  }
  if (
    terminationRequest !== null &&
    (terminationRequest.phase !== "running" ||
      terminationRequest.containerId !== inspection.containerId ||
      terminationRequest.startedAt !== inspection.startedAt)
  ) {
    throw new OciRunnerError("OCI terminal record conflicts with its termination request");
  }
  const requested = terminationRequest?.origin ?? "natural";
  const expectedDisposition = outcomeFor(
    inspection,
    {
      stdout: stdoutBytes,
      stderr: stderrBytes,
      stdoutObservedBytes: stdout.observedByteLength,
      stderrObservedBytes: stderr.observedByteLength,
    },
    prepared.intent.limits.outputBytesPerStream,
    prepared.intent.limits.wallTimeMs,
    requested,
  );
  if (
    input.outcome !== expectedDisposition.outcome ||
    input.terminationOrigin !== expectedDisposition.terminationOrigin
  ) {
    throw new OciRunnerError("OCI terminal disposition conflicts with durable evidence");
  }
  return {
    inspection,
    logs: { stdout, stderr },
    outcome: expectedDisposition.outcome,
    terminationOrigin: expectedDisposition.terminationOrigin,
    terminationRequestDigest: expectedRequestDigest,
  };
}

function receiptFor(
  prepared: PreparedOciRun,
  terminal: TerminalRecordV1,
  removal: BoundRemovalEvidenceV1,
): OciRunReceiptV1 {
  const startedAt = terminal.inspection.startedAt;
  const finishedAt = terminal.inspection.finishedAt;
  if (startedAt === null || finishedAt === null) {
    throw new OciRunnerError("OCI receipt requires proven execution timestamps");
  }
  if (Date.parse(finishedAt) > Date.parse(removal.observedAt)) {
    throw new OciRunnerError("OCI removal evidence predates terminal execution");
  }
  return parseOciRunReceipt({
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId: terminal.inspection.containerId,
    imageId: prepared.intent.image.imageId,
    createdAt: terminal.inspection.createdAt,
    startedAt,
    finishedAt,
    removedAt: removal.observedAt,
    terminalInspectionDigest: inspectionDigest(terminal.inspection),
    removalEvidenceDigest: persistedArtifactDigest(
      prepared.paths.removalPath,
      "OCI removal evidence",
    ),
    outcome: terminal.outcome,
    terminationOrigin: terminal.terminationOrigin,
    exitCode: terminal.inspection.exitCode,
    oomKilled: terminal.inspection.oomKilled,
    stdout: terminal.logs.stdout,
    stderr: terminal.logs.stderr,
  });
}

function validatedReceiptFromPath(prepared: PreparedOciRun): OciRunReceiptV1 | null {
  const artifact = parsedArtifact(prepared.paths.receiptPath, "OCI receipt");
  if (artifact === null) return null;
  const receipt = parseOciRunReceipt(artifact.value);
  const terminal = terminalRecordFromPath(prepared);
  if (terminal === null) throw new OciRunnerError("OCI receipt is missing terminal evidence");
  const launch = launchAttemptFromPath(prepared);
  if (launch === null || launch.containerId !== terminal.inspection.containerId) {
    throw new OciRunnerError("OCI receipt is missing its launch binding");
  }
  const removal = removalEvidenceFromPath(prepared, terminal.inspection.containerId);
  if (removal === null) throw new OciRunnerError("OCI receipt is missing removal evidence");
  const expected = receiptFor(prepared, terminal, removal);
  assertSameCanonical(receipt, expected, "OCI receipt");
  return receipt;
}

function preStartCancellationFromPath(
  prepared: PreparedOciRun,
): OciPreStartCancellationEvidenceV1 | null {
  const artifact = parsedArtifact(
    artifactPaths(prepared).preStartCancellation,
    "OCI pre-start cancellation",
  );
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI pre-start cancellation");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "cancelledAt",
      "containerId",
      "fence",
      "intentDigest",
      "removalEvidenceDigest",
      "runId",
      "runKey",
      "schemaVersion",
      "state",
      "terminationRequestDigest",
    ],
    "OCI pre-start cancellation",
  );
  if (input.schemaVersion !== 1 || (input.state !== "planned" && input.state !== "created")) {
    throw new OciRunnerError("OCI pre-start cancellation schema or state is invalid");
  }
  assertBoundIdentity(input, prepared, "OCI pre-start cancellation");
  const terminationRequest = terminationRequestFromPath(prepared);
  if (terminationRequest === null || terminationRequest.phase !== "pre-start") {
    throw new OciRunnerError("OCI pre-start cancellation is missing its termination request");
  }
  const terminationRequestDigest = artifactDigest(
    input.terminationRequestDigest,
    "OCI pre-start cancellation request digest",
  );
  if (
    terminationRequestDigest !==
    persistedArtifactDigest(artifactPaths(prepared).terminationRequest, "OCI termination request")
  ) {
    throw new OciRunnerError("OCI pre-start cancellation request digest is invalid");
  }
  const cancelledAt = artifactInstant(input.cancelledAt, "OCI pre-start cancellation time");
  if (input.state === "planned") {
    if (
      input.containerId !== null ||
      input.removalEvidenceDigest !== null ||
      terminationRequest.containerId !== null ||
      cancelledAt !== terminationRequest.requestedAt
    ) {
      throw new OciRunnerError("OCI planned cancellation evidence is inconsistent");
    }
    return {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      state: "planned",
      containerId: null,
      terminationRequestDigest,
      removalEvidenceDigest: null,
      cancelledAt,
    };
  }
  const containerId = validateContainerId(input.containerId);
  if (terminationRequest.containerId !== containerId) {
    throw new OciRunnerError("OCI created cancellation has the wrong container binding");
  }
  const removal = removalEvidenceFromPath(prepared, containerId);
  const removalEvidenceDigest = artifactDigest(
    input.removalEvidenceDigest,
    "OCI pre-start cancellation removal digest",
  );
  if (
    removal === null ||
    removalEvidenceDigest !==
      persistedArtifactDigest(prepared.paths.removalPath, "OCI removal evidence") ||
    cancelledAt !== removal.observedAt
  ) {
    throw new OciRunnerError("OCI created cancellation has invalid removal evidence");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    state: "created",
    containerId,
    terminationRequestDigest,
    removalEvidenceDigest,
    cancelledAt,
  };
}

export class OciRunner {
  readonly #engine: OciEnginePort;
  readonly #now: () => Date;
  readonly #afterBoundary: (boundary: OciFailureBoundary) => void;

  public constructor(engine: OciEnginePort, dependencies: OciRunnerDependencies = {}) {
    this.#engine = engine;
    this.#now = dependencies.now ?? (() => new Date());
    this.#afterBoundary = dependencies.afterBoundary ?? (() => undefined);
  }

  public async reconcile(prepared: PreparedOciRun): Promise<ReconcileOciRunResult> {
    return await this.#reconcile(prepared, "natural");
  }

  public async cancel(prepared: PreparedOciRun): Promise<ReconcileOciRunResult> {
    return await this.#reconcile(prepared, "cancellation");
  }

  async #inspect(containerId: string): Promise<OciContainerInspection | null> {
    const inspection = await this.#engine.inspect(containerId);
    this.#afterBoundary("after-inspect");
    return inspection;
  }

  #loadPrepared(preparedInput: PreparedOciRun): PreparedOciRun {
    const prepared = openPreparedOciRun(
      dirname(preparedInput.paths.runDirectory),
      preparedInput.intent.runKey,
    );
    if (prepared === null || prepared.intentDigest !== preparedInput.intentDigest) {
      throw new OciRunnerError("Prepared OCI run is missing or changed identity");
    }
    return prepared;
  }

  #publishLaunchAttempt(
    prepared: PreparedOciRun,
    inspection: OciContainerInspection,
  ): LaunchAttemptV1 {
    const existing = launchAttemptFromPath(prepared);
    if (existing !== null) {
      if (existing.containerId !== inspection.containerId) {
        throw new OciRunnerError("OCI launch attempt cannot change container identity");
      }
      return existing;
    }
    const createdArtifact = parsedArtifact(
      prepared.paths.createdInspectionPath,
      "OCI created inspection",
    );
    if (createdArtifact === null)
      throw new OciRunnerError("OCI launch is missing creation evidence");
    const launch: LaunchAttemptV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: inspection.containerId,
      createdInspectionDigest: sha256Digest(createdArtifact.bytes),
      attemptedAt: this.#now().toISOString(),
    };
    jsonArtifact(artifactPaths(prepared).launchAttempt, launch);
    this.#afterBoundary("after-launch-attempt");
    const persisted = launchAttemptFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI launch attempt was not persisted");
    return persisted;
  }

  #publishCreateAttempt(prepared: PreparedOciRun): CreateAttemptV1 {
    const existing = createAttemptFromPath(prepared);
    if (existing !== null) return existing;
    const attempt: CreateAttemptV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      attemptedAt: this.#now().toISOString(),
    };
    jsonArtifact(artifactPaths(prepared).createAttempt, attempt);
    this.#afterBoundary("after-create-attempt");
    const persisted = createAttemptFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI create attempt was not persisted");
    return persisted;
  }

  #requestTermination(
    prepared: PreparedOciRun,
    phase: "pre-start" | "running",
    origin: "wall-time" | "cancellation",
    inspection: OciContainerInspection | null,
  ): TerminationRequestV1 {
    const existing = terminationRequestFromPath(prepared);
    if (existing !== null) return existing;
    const startedAt = phase === "running" ? (inspection?.startedAt ?? null) : null;
    if (phase === "running" && startedAt === null) {
      throw new OciRunnerError("OCI running termination requires a proven start time");
    }
    const request: TerminationRequestV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      phase,
      origin,
      containerId: inspection?.containerId ?? null,
      startedAt,
      deadline:
        startedAt === null
          ? null
          : new Date(Date.parse(startedAt) + prepared.intent.limits.wallTimeMs).toISOString(),
      requestedAt: this.#now().toISOString(),
    };
    jsonArtifact(artifactPaths(prepared).terminationRequest, request);
    this.#afterBoundary("after-termination-request");
    const persisted = terminationRequestFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI termination request was not persisted");
    return persisted;
  }

  #loadOrCreateRemoval(prepared: PreparedOciRun, containerId: string): BoundRemovalEvidenceV1 {
    const existing = removalEvidenceFromPath(prepared, containerId);
    if (existing !== null) return existing;
    const removal: BoundRemovalEvidenceV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId,
      absent: true,
      observedAt: this.#now().toISOString(),
    };
    jsonArtifact(prepared.paths.removalPath, removal);
    const persisted = removalEvidenceFromPath(prepared, containerId);
    if (persisted === null) throw new OciRunnerError("OCI removal evidence was not persisted");
    this.#afterBoundary("after-removal-evidence");
    return persisted;
  }

  async #finishPreStartCancellation(
    prepared: PreparedOciRun,
    request: TerminationRequestV1,
    inspection: OciContainerInspection | null,
  ): Promise<ReconcileOciRunResult> {
    if (request.phase !== "pre-start" || request.origin !== "cancellation") {
      throw new OciRunnerError("OCI pre-start cancellation request is invalid");
    }
    const requestDigest = persistedArtifactDigest(
      artifactPaths(prepared).terminationRequest,
      "OCI termination request",
    );
    if (request.containerId === null) {
      if (inspection !== null) {
        throw new OciRunnerError("OCI planned cancellation cannot adopt a container");
      }
      const evidence: OciPreStartCancellationEvidenceV1 = {
        schemaVersion: 1,
        ...boundIdentity(prepared),
        state: "planned",
        containerId: null,
        terminationRequestDigest: requestDigest,
        removalEvidenceDigest: null,
        cancelledAt: request.requestedAt,
      };
      jsonArtifact(artifactPaths(prepared).preStartCancellation, evidence);
      const persisted = preStartCancellationFromPath(prepared);
      if (persisted === null)
        throw new OciRunnerError("OCI planned cancellation was not persisted");
      return { phase: "cancelled-before-start", cancellation: persisted };
    }
    if (inspection !== null) {
      assertOciInspectionMatchesIntent(inspection, prepared.intent);
      if (inspection.containerId !== request.containerId || inspection.status !== "created") {
        throw new OciRunnerError("OCI pre-start cancellation found a launched container");
      }
      await this.#engine.remove(request.containerId);
      this.#afterBoundary("after-remove");
      const afterRemoval = await this.#inspect(request.containerId);
      if (afterRemoval !== null) {
        throw new OciRunnerError("OCI pre-start container still exists after removal");
      }
    }
    const removal = this.#loadOrCreateRemoval(prepared, request.containerId);
    const evidence: OciPreStartCancellationEvidenceV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      state: "created",
      containerId: request.containerId,
      terminationRequestDigest: requestDigest,
      removalEvidenceDigest: persistedArtifactDigest(
        prepared.paths.removalPath,
        "OCI removal evidence",
      ),
      cancelledAt: removal.observedAt,
    };
    jsonArtifact(artifactPaths(prepared).preStartCancellation, evidence);
    const persisted = preStartCancellationFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI created cancellation was not persisted");
    return { phase: "cancelled-before-start", cancellation: persisted };
  }

  async #reconcile(
    preparedInput: PreparedOciRun,
    requestedTermination: "natural" | "cancellation",
  ): Promise<ReconcileOciRunResult> {
    const prepared = this.#loadPrepared(preparedInput);
    return await whileRunLocked(
      prepared,
      this.#now(),
      async () => await this.#reconcileLocked(prepared, requestedTermination),
    );
  }

  #assertLaunchStillPermitted(prepared: PreparedOciRun): void {
    const cancellation = preStartCancellationFromPath(prepared);
    const receipt = validatedReceiptFromPath(prepared);
    const terminationRequest = terminationRequestFromPath(prepared);
    if (cancellation !== null || receipt !== null || terminationRequest !== null) {
      throw new OciRunnerError(
        "OCI launch is blocked by durable cancellation, termination, or final evidence",
      );
    }
  }

  async #reconcileLocked(
    prepared: PreparedOciRun,
    requestedTermination: "natural" | "cancellation",
  ): Promise<ReconcileOciRunResult> {
    const createAttempt = createAttemptFromPath(prepared);
    const preStartCancellation = preStartCancellationFromPath(prepared);
    const existingReceipt = validatedReceiptFromPath(prepared);
    if (preStartCancellation !== null && existingReceipt !== null) {
      throw new OciRunnerError("OCI run has conflicting final artifacts");
    }
    if (preStartCancellation !== null) {
      return { phase: "cancelled-before-start", cancellation: preStartCancellation };
    }
    if (existingReceipt !== null) return { phase: "removed", receipt: existingReceipt };

    let terminationRequest = terminationRequestFromPath(prepared);
    if (terminationRequest?.phase === "pre-start" && terminationRequest.containerId === null) {
      if (createAttempt !== null) {
        throw new OciRunnerCreatePendingError(prepared.intent.runKey);
      }
      return await this.#finishPreStartCancellation(prepared, terminationRequest, null);
    }

    const intent = prepared.intent;
    let imageVerified = false;
    const terminalContainerId = persistedTerminalContainerId(prepared.paths.terminalInspectionPath);
    const launchAttempt = launchAttemptFromPath(prepared);
    if (
      terminationRequest?.containerId !== null &&
      terminationRequest?.containerId !== undefined &&
      launchAttempt !== null &&
      terminationRequest.containerId !== launchAttempt.containerId
    ) {
      throw new OciRunnerError("OCI durable container bindings conflict");
    }
    const boundContainerId =
      terminalContainerId ?? terminationRequest?.containerId ?? launchAttempt?.containerId ?? null;
    let inspection: OciContainerInspection | null;
    if (boundContainerId !== null) {
      inspection = await this.#inspect(boundContainerId);
    } else {
      inspection = await this.#engine.findByLabels(labelsForOciRun(intent));
      this.#afterBoundary("after-find");
    }

    if (inspection === null) {
      if (terminalContainerId !== null) return this.#finishRemoved(prepared, terminalContainerId);
      if (launchAttempt !== null || terminationRequest?.phase === "running") {
        throw new OciRunnerError(
          "OCI container disappeared after its durable launch attempt; recreation is forbidden",
        );
      }
      if (terminationRequest?.phase === "pre-start" && terminationRequest.containerId !== null) {
        return await this.#finishPreStartCancellation(prepared, terminationRequest, null);
      }
      if (createAttempt !== null) {
        throw new OciRunnerCreatePendingError(prepared.intent.runKey);
      }
      if (terminationRequest?.phase === "pre-start") {
        return await this.#finishPreStartCancellation(prepared, terminationRequest, null);
      }
      if (requestedTermination === "cancellation") {
        terminationRequest = this.#requestTermination(prepared, "pre-start", "cancellation", null);
        return await this.#finishPreStartCancellation(prepared, terminationRequest, null);
      }
      await this.#engine.verifyImage(intent.image);
      this.#afterBoundary("after-image-verification");
      imageVerified = true;
      this.#assertLaunchStillPermitted(prepared);
      this.#publishCreateAttempt(prepared);
      const containerId = validateContainerId(await this.#engine.create(intent));
      this.#afterBoundary("after-create");
      inspection = await this.#inspect(containerId);
      if (inspection === null) throw new OciRunnerError("Created OCI container disappeared");
    }

    assertOciInspectionMatchesIntent(inspection, intent);
    if (terminalContainerId !== null && inspection.containerId !== terminalContainerId) {
      throw new OciRunnerError("OCI terminal container binding changed");
    }
    if (
      launchAttempt === null &&
      terminationRequest?.phase !== "pre-start" &&
      inspection.status !== "created"
    ) {
      throw new OciRunnerError("OCI running or terminal container has no durable launch attempt");
    }

    if (inspection.status === "created" && requestedTermination === "cancellation") {
      jsonArtifact(prepared.paths.createdInspectionPath, inspection);
      terminationRequest = this.#requestTermination(
        prepared,
        "pre-start",
        "cancellation",
        inspection,
      );
      return await this.#finishPreStartCancellation(prepared, terminationRequest, inspection);
    }
    if (terminationRequest?.phase === "pre-start") {
      return await this.#finishPreStartCancellation(prepared, terminationRequest, inspection);
    }

    if (inspection.status === "created") {
      jsonArtifact(prepared.paths.createdInspectionPath, inspection);
      if (!imageVerified) {
        await this.#engine.verifyImage(intent.image);
        this.#afterBoundary("after-image-verification");
      }
      this.#assertLaunchStillPermitted(prepared);
      this.#publishLaunchAttempt(prepared, inspection);
      this.#assertLaunchStillPermitted(prepared);
      await this.#engine.start(inspection.containerId);
      this.#afterBoundary("after-start");
      inspection = await this.#inspect(inspection.containerId);
      if (inspection === null) {
        throw new OciRunnerError(
          "OCI container disappeared after its durable launch attempt; recreation is forbidden",
        );
      }
      assertOciInspectionMatchesIntent(inspection, intent);
    }

    const persistedLaunch = launchAttemptFromPath(prepared);
    if (persistedLaunch === null || persistedLaunch.containerId !== inspection.containerId) {
      throw new OciRunnerError("OCI execution is missing its durable launch binding");
    }

    if (inspection.status === "running") {
      jsonArtifact(prepared.paths.runningInspectionPath, inspection);
      const startedAt = inspection.startedAt;
      if (startedAt === null) throw new OciRunnerError("Running OCI container has no start time");
      const deadline = Date.parse(startedAt) + intent.limits.wallTimeMs;
      if (terminationRequest !== null && terminationRequest.phase !== "running") {
        throw new OciRunnerError("OCI running container has a pre-start termination request");
      }
      const deadlineExpired = this.#now().valueOf() >= deadline;
      const shouldTerminate =
        terminationRequest !== null || requestedTermination === "cancellation" || deadlineExpired;
      if (!shouldTerminate) return { phase: "running", containerId: inspection.containerId };
      if (terminationRequest === null) {
        terminationRequest = this.#requestTermination(
          prepared,
          "running",
          requestedTermination === "cancellation" ? "cancellation" : "wall-time",
          inspection,
        );
      }
      if (
        terminationRequest.containerId !== inspection.containerId ||
        terminationRequest.startedAt !== inspection.startedAt
      ) {
        throw new OciRunnerError("OCI termination request conflicts with the running container");
      }
      await this.#engine.stop(inspection.containerId, intent.limits.stopGraceMs);
      this.#afterBoundary("after-stop");
      inspection = await this.#inspect(inspection.containerId);
      if (inspection?.status === "running") {
        await this.#engine.kill(inspection.containerId);
        this.#afterBoundary("after-kill");
        inspection = await this.#inspect(inspection.containerId);
      }
      if (inspection === null || inspection.status === "running") {
        throw new OciRunnerError("OCI container did not reach a provable terminal state");
      }
    }

    if (inspection.status !== "terminal" || inspection.running || inspection.finishedAt === null) {
      return { phase: "created", containerId: inspection.containerId };
    }
    jsonArtifact(prepared.paths.terminalInspectionPath, inspection);
    const logs = await this.#engine.logs(
      inspection.containerId,
      intent.limits.outputBytesPerStream,
    );
    this.#afterBoundary("after-logs");
    if (
      logs.stdout.byteLength > intent.limits.outputBytesPerStream ||
      logs.stderr.byteLength > intent.limits.outputBytesPerStream ||
      logs.stdoutObservedBytes < logs.stdout.byteLength ||
      logs.stderrObservedBytes < logs.stderr.byteLength
    ) {
      throw new OciRunnerError("OCI engine returned invalid bounded output provenance");
    }
    writeImmutable(prepared.paths.stdoutPath, logs.stdout);
    writeImmutable(prepared.paths.stderrPath, logs.stderr);
    terminationRequest = terminationRequestFromPath(prepared);
    const disposition = outcomeFor(
      inspection,
      logs,
      intent.limits.outputBytesPerStream,
      intent.limits.wallTimeMs,
      terminationRequest?.origin ?? "natural",
    );
    const terminalRecord: TerminalRecordV1 = {
      inspection,
      logs: {
        stdout: capturedOutput(logs.stdout, logs.stdoutObservedBytes),
        stderr: capturedOutput(logs.stderr, logs.stderrObservedBytes),
      },
      ...disposition,
      terminationRequestDigest:
        terminationRequest === null
          ? null
          : persistedArtifactDigest(
              artifactPaths(prepared).terminationRequest,
              "OCI termination request",
            ),
    };
    jsonArtifact(artifactPaths(prepared).terminalRecord, terminalRecord);
    terminalRecordFromPath(prepared);

    await this.#engine.remove(inspection.containerId);
    this.#afterBoundary("after-remove");
    const afterRemoval = await this.#inspect(inspection.containerId);
    if (afterRemoval !== null) throw new OciRunnerError("OCI container still exists after removal");
    return this.#finishRemoved(prepared, inspection.containerId);
  }

  #finishRemoved(prepared: PreparedOciRun, containerId: string): ReconcileOciRunResult {
    const terminal = terminalRecordFromPath(prepared);
    if (terminal === null || terminal.inspection.containerId !== containerId) {
      throw new OciRunnerError("Removed OCI container is missing valid terminal evidence");
    }
    const removal = this.#loadOrCreateRemoval(prepared, containerId);
    const receipt = receiptFor(prepared, terminal, removal);
    jsonArtifact(prepared.paths.receiptPath, receipt);
    const validated = validatedReceiptFromPath(prepared);
    if (validated === null) throw new OciRunnerError("OCI receipt was not persisted");
    return { phase: "removed", receipt: validated };
  }
}
