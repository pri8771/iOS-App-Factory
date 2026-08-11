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
  | "planned"
  | "created"
  | "running"
  | "terminal"
  | "removed"
  | "cancelled-before-start"
  | "quarantined"
  | "quarantine-removed";

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

export type OciEvidenceArtifactV1 = Readonly<{
  logicalName: string;
  mediaType: "application/json" | "application/octet-stream";
  digest: string;
  byteLength: number;
  bytes: Buffer;
}>;

export type OciEvidenceEnvelopeV1 = Readonly<{
  schemaVersion: 1;
  phase: "removed" | "quarantined" | "quarantine-removed";
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  taskSpecDigest: string;
  policyDigest: string;
  baseCommit: string;
  baseTree: string;
  intentDigest: string;
  engineIdentityDigest: string;
  imageReference: string;
  imageId: string;
  containerId: string;
  artifacts: readonly Readonly<{
    logicalName: string;
    mediaType: "application/json" | "application/octet-stream";
    digest: string;
    byteLength: number;
  }>[];
}>;

export type OciEvidenceClosureV1 = Readonly<{
  envelope: OciEvidenceEnvelopeV1;
  envelopeBytes: Buffer;
  envelopeDigest: string;
  artifacts: readonly OciEvidenceArtifactV1[];
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

export type OciQuarantineReason =
  | "start-ambiguous"
  | "inspect-ambiguous"
  | "attestation-failed"
  | "container-disappeared"
  | "post-start-state-unproven";

export type OciQuarantineEvidenceV1 = Readonly<{
  schemaVersion: 1;
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  intentDigest: string;
  containerId: string;
  engineBindingDigest: string;
  launchAttemptDigest: string;
  reason: OciQuarantineReason;
  quarantinedAt: string;
}>;

export type OciQuarantineRemovalEvidenceV1 = Readonly<{
  schemaVersion: 1;
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  intentDigest: string;
  containerId: string;
  quarantineDigest: string;
  reapRequestDigest: string;
  containerAbsent: true;
  labelsAbsent: true;
  observedAt: string;
}>;

export type ReconcileOciRunResult =
  | Readonly<{ phase: "created" | "running"; containerId: string }>
  | Readonly<{ phase: "removed"; receipt: OciRunReceiptV1 }>
  | Readonly<{
      phase: "cancelled-before-start";
      cancellation: OciPreStartCancellationEvidenceV1;
    }>
  | Readonly<{ phase: "quarantined"; quarantine: OciQuarantineEvidenceV1 }>
  | Readonly<{
      phase: "quarantine-removed";
      removal: OciQuarantineRemovalEvidenceV1;
    }>;

export type OciFailureBoundary =
  | "after-image-verification"
  | "after-find"
  | "after-create-attempt"
  | "after-create"
  | "after-inspect"
  | "after-launch-attempt"
  | "after-start-dispatched"
  | "after-start"
  | "after-post-start-attestation"
  | "after-logs"
  | "after-termination-request"
  | "after-stop"
  | "after-kill"
  | "after-remove"
  | "after-removal-evidence"
  | "after-quarantine"
  | "after-quarantine-reap-request"
  | "after-quarantine-kill"
  | "after-quarantine-remove"
  | "after-quarantine-absence";

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

export class OciRunnerReapPendingError extends OciRunnerError {
  public readonly code = "OCI_QUARANTINE_REAP_PENDING";
  public readonly retryable = true;

  public constructor(runKey: string, options?: ErrorOptions) {
    super(
      `OCI run ${runKey} remains quarantined until exact container and label absence can be proved`,
      options,
    );
    this.name = "OciRunnerReapPendingError";
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
    engineBindingDigest: string;
    attemptedAt: string;
  }>;

type CreateAttemptV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    engineBindingDigest: string;
    attemptedAt: string;
  }>;

type EngineBindingV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    engineIdentityDigest: string;
    boundAt: string;
  }>;

type StartDispatchV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    containerId: string;
    engineBindingDigest: string;
    launchAttemptDigest: string;
    dispatchedAt: string;
  }>;

type PostStartAttestationV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    containerId: string;
    engineBindingDigest: string;
    inspectionDigest: string;
    inspectionStatus: "running" | "terminal";
    startDispatchDigest: string;
    attestedAt: string;
  }>;

type OciQuarantineReapRequestV1 = BoundIdentity &
  Readonly<{
    schemaVersion: 1;
    containerId: string;
    quarantineDigest: string;
    requestedAt: string;
  }>;

class OciQuarantineTransition extends OciRunnerError {
  public readonly quarantine: OciQuarantineEvidenceV1;

  public constructor(quarantine: OciQuarantineEvidenceV1, options?: ErrorOptions) {
    super(`OCI run ${quarantine.runKey} entered durable quarantine`, options);
    this.name = "OciQuarantineTransition";
    this.quarantine = quarantine;
  }
}

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
  engineBinding: string;
  createAttempt: string;
  launchAttempt: string;
  startDispatch: string;
  postStartInspection: string;
  postStartAttestation: string;
  quarantine: string;
  quarantineReapRequest: string;
  quarantineRemoval: string;
  terminationRequest: string;
  preStartCancellation: string;
  terminalRecord: string;
}> {
  return {
    engineBinding: join(prepared.paths.runDirectory, "engine-binding.json"),
    createAttempt: join(prepared.paths.runDirectory, "create-attempt.json"),
    launchAttempt: join(prepared.paths.runDirectory, "launch-attempt.json"),
    startDispatch: join(prepared.paths.runDirectory, "start-dispatched.json"),
    postStartInspection: join(prepared.paths.runDirectory, "post-start.inspect.json"),
    postStartAttestation: join(prepared.paths.runDirectory, "post-start-attested.json"),
    quarantine: join(prepared.paths.runDirectory, "quarantine.json"),
    quarantineReapRequest: join(prepared.paths.runDirectory, "quarantine-reap-request.json"),
    quarantineRemoval: join(prepared.paths.runDirectory, "quarantine-removed.json"),
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

function nondecreasingInstant(now: Date, ...lowerBounds: readonly string[]): string {
  const nowValue = now.valueOf();
  const lowerBound = lowerBounds.reduce(
    (maximum, value) => Math.max(maximum, Date.parse(value)),
    Number.NEGATIVE_INFINITY,
  );
  return new Date(Math.max(nowValue, lowerBound)).toISOString();
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
  expectedStatus: "created" | "running" | "terminal",
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
  if (
    inspection.status !== expectedStatus ||
    inspection.running !== (expectedStatus === "running")
  ) {
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
  } else if (expectedStatus === "running") {
    const startedAt = artifactInstant(inspection.startedAt, `${label}.startedAt`);
    if (
      inspection.finishedAt !== null ||
      inspection.exitCode !== null ||
      Date.parse(createdAt) > Date.parse(startedAt)
    ) {
      throw new OciRunnerError(`${label} has invalid running timing or exit state`);
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

function engineBindingFromPath(prepared: PreparedOciRun): EngineBindingV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).engineBinding, "OCI engine binding");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI engine binding");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "boundAt",
      "engineIdentityDigest",
      "fence",
      "intentDigest",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI engine binding",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI engine binding schema is invalid");
  assertBoundIdentity(input, prepared, "OCI engine binding");
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    engineIdentityDigest: artifactDigest(input.engineIdentityDigest, "OCI engine identity digest"),
    boundAt: artifactInstant(input.boundAt, "OCI engine binding time"),
  };
}

function engineBindingArtifactDigest(prepared: PreparedOciRun): string {
  const binding = engineBindingFromPath(prepared);
  if (binding === null) throw new OciRunnerError("OCI run is missing its engine binding");
  return persistedArtifactDigest(artifactPaths(prepared).engineBinding, "OCI engine binding");
}

function createAttemptFromPath(prepared: PreparedOciRun): CreateAttemptV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).createAttempt, "OCI create attempt");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI create attempt");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "attemptedAt",
      "engineBindingDigest",
      "fence",
      "intentDigest",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI create attempt",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI create attempt schema is invalid");
  assertBoundIdentity(input, prepared, "OCI create attempt");
  const engineBindingDigest = artifactDigest(
    input.engineBindingDigest,
    "OCI create attempt engine binding digest",
  );
  if (engineBindingDigest !== engineBindingArtifactDigest(prepared)) {
    throw new OciRunnerError("OCI create attempt conflicts with its engine binding");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    engineBindingDigest,
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
      "engineBindingDigest",
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
    engineBindingDigest: artifactDigest(
      input.engineBindingDigest,
      "OCI launch attempt engine binding digest",
    ),
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
    launch.engineBindingDigest !== engineBindingArtifactDigest(prepared) ||
    sha256Digest(createdArtifact.bytes) !== launch.createdInspectionDigest
  ) {
    throw new OciRunnerError("OCI launch attempt conflicts with its created inspection");
  }
  return launch;
}

function startDispatchFromPath(prepared: PreparedOciRun): StartDispatchV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).startDispatch, "OCI start dispatch");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI start dispatch");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "containerId",
      "dispatchedAt",
      "engineBindingDigest",
      "fence",
      "intentDigest",
      "launchAttemptDigest",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI start dispatch",
  );
  if (input.schemaVersion !== 1) throw new OciRunnerError("OCI start dispatch schema is invalid");
  assertBoundIdentity(input, prepared, "OCI start dispatch");
  const launch = launchAttemptFromPath(prepared);
  if (launch === null) throw new OciRunnerError("OCI start dispatch has no launch attempt");
  const dispatch: StartDispatchV1 = {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId: validateContainerId(input.containerId),
    engineBindingDigest: artifactDigest(
      input.engineBindingDigest,
      "OCI start dispatch engine binding digest",
    ),
    launchAttemptDigest: artifactDigest(
      input.launchAttemptDigest,
      "OCI start dispatch launch digest",
    ),
    dispatchedAt: artifactInstant(input.dispatchedAt, "OCI start dispatch time"),
  };
  if (
    dispatch.containerId !== launch.containerId ||
    dispatch.engineBindingDigest !== launch.engineBindingDigest ||
    dispatch.engineBindingDigest !== engineBindingArtifactDigest(prepared) ||
    dispatch.launchAttemptDigest !==
      persistedArtifactDigest(artifactPaths(prepared).launchAttempt, "OCI launch attempt") ||
    Date.parse(dispatch.dispatchedAt) < Date.parse(launch.attemptedAt)
  ) {
    throw new OciRunnerError("OCI start dispatch conflicts with its launch attempt");
  }
  return dispatch;
}

function postStartAttestationFromPath(prepared: PreparedOciRun): PostStartAttestationV1 | null {
  const artifact = parsedArtifact(
    artifactPaths(prepared).postStartAttestation,
    "OCI post-start attestation",
  );
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI post-start attestation");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "attestedAt",
      "containerId",
      "engineBindingDigest",
      "fence",
      "inspectionDigest",
      "inspectionStatus",
      "intentDigest",
      "runId",
      "runKey",
      "schemaVersion",
      "startDispatchDigest",
    ],
    "OCI post-start attestation",
  );
  if (
    input.schemaVersion !== 1 ||
    (input.inspectionStatus !== "running" && input.inspectionStatus !== "terminal")
  ) {
    throw new OciRunnerError("OCI post-start attestation schema or status is invalid");
  }
  assertBoundIdentity(input, prepared, "OCI post-start attestation");
  const dispatch = startDispatchFromPath(prepared);
  if (dispatch === null) {
    throw new OciRunnerError("OCI post-start attestation has no start dispatch");
  }
  const inspectionArtifact = parsedArtifact(
    artifactPaths(prepared).postStartInspection,
    "OCI post-start inspection",
  );
  if (inspectionArtifact === null) {
    throw new OciRunnerError("OCI post-start attestation is missing its inspection");
  }
  const inspection = parseInspectionArtifact(
    inspectionArtifact.value,
    prepared,
    input.inspectionStatus,
    "OCI post-start inspection",
  );
  const attestation: PostStartAttestationV1 = {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId: validateContainerId(input.containerId),
    engineBindingDigest: artifactDigest(
      input.engineBindingDigest,
      "OCI post-start engine binding digest",
    ),
    inspectionDigest: artifactDigest(input.inspectionDigest, "OCI post-start inspection digest"),
    inspectionStatus: input.inspectionStatus,
    startDispatchDigest: artifactDigest(
      input.startDispatchDigest,
      "OCI post-start dispatch digest",
    ),
    attestedAt: artifactInstant(input.attestedAt, "OCI post-start attestation time"),
  };
  if (
    attestation.containerId !== dispatch.containerId ||
    inspection.containerId !== dispatch.containerId ||
    attestation.engineBindingDigest !== dispatch.engineBindingDigest ||
    attestation.inspectionDigest !== sha256Digest(inspectionArtifact.bytes) ||
    attestation.startDispatchDigest !==
      persistedArtifactDigest(artifactPaths(prepared).startDispatch, "OCI start dispatch") ||
    Date.parse(attestation.attestedAt) < Date.parse(dispatch.dispatchedAt)
  ) {
    throw new OciRunnerError(
      "OCI post-start attestation conflicts with its dispatch or inspection",
    );
  }
  return attestation;
}

const OCI_QUARANTINE_REASONS: readonly OciQuarantineReason[] = [
  "start-ambiguous",
  "inspect-ambiguous",
  "attestation-failed",
  "container-disappeared",
  "post-start-state-unproven",
];

function quarantineFromPath(prepared: PreparedOciRun): OciQuarantineEvidenceV1 | null {
  const artifact = parsedArtifact(artifactPaths(prepared).quarantine, "OCI quarantine");
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI quarantine");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "containerId",
      "engineBindingDigest",
      "fence",
      "intentDigest",
      "launchAttemptDigest",
      "quarantinedAt",
      "reason",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI quarantine",
  );
  if (input.schemaVersion !== 1 || !OCI_QUARANTINE_REASONS.includes(input.reason as never)) {
    throw new OciRunnerError("OCI quarantine schema or reason is invalid");
  }
  assertBoundIdentity(input, prepared, "OCI quarantine");
  const launch = launchAttemptFromPath(prepared);
  if (launch === null) throw new OciRunnerError("OCI quarantine has no durable launch attempt");
  const containerId = validateContainerId(input.containerId);
  const engineBindingDigest = artifactDigest(
    input.engineBindingDigest,
    "OCI quarantine engine binding digest",
  );
  const launchAttemptDigest = artifactDigest(
    input.launchAttemptDigest,
    "OCI quarantine launch attempt digest",
  );
  const quarantinedAt = artifactInstant(input.quarantinedAt, "OCI quarantine time");
  const dispatch = startDispatchFromPath(prepared);
  const lowerBound = dispatch?.dispatchedAt ?? launch.attemptedAt;
  if (
    containerId !== launch.containerId ||
    engineBindingDigest !== launch.engineBindingDigest ||
    engineBindingDigest !== engineBindingArtifactDigest(prepared) ||
    launchAttemptDigest !==
      persistedArtifactDigest(artifactPaths(prepared).launchAttempt, "OCI launch attempt") ||
    Date.parse(quarantinedAt) < Date.parse(lowerBound)
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with its launch binding");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId,
    engineBindingDigest,
    launchAttemptDigest,
    reason: input.reason as OciQuarantineReason,
    quarantinedAt,
  };
}

function quarantineReapRequestFromPath(
  prepared: PreparedOciRun,
): OciQuarantineReapRequestV1 | null {
  const artifact = parsedArtifact(
    artifactPaths(prepared).quarantineReapRequest,
    "OCI quarantine reap request",
  );
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI quarantine reap request");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "containerId",
      "fence",
      "intentDigest",
      "quarantineDigest",
      "requestedAt",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI quarantine reap request",
  );
  if (input.schemaVersion !== 1) {
    throw new OciRunnerError("OCI quarantine reap request schema is invalid");
  }
  assertBoundIdentity(input, prepared, "OCI quarantine reap request");
  const quarantine = quarantineFromPath(prepared);
  if (quarantine === null) {
    throw new OciRunnerError("OCI quarantine reap request has no quarantine evidence");
  }
  const containerId = validateContainerId(input.containerId);
  const quarantineDigest = artifactDigest(
    input.quarantineDigest,
    "OCI quarantine reap request quarantine digest",
  );
  const requestedAt = artifactInstant(input.requestedAt, "OCI quarantine reap request time");
  if (
    containerId !== quarantine.containerId ||
    quarantineDigest !==
      persistedArtifactDigest(artifactPaths(prepared).quarantine, "OCI quarantine") ||
    Date.parse(requestedAt) < Date.parse(quarantine.quarantinedAt)
  ) {
    throw new OciRunnerError("OCI quarantine reap request conflicts with its quarantine");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId,
    quarantineDigest,
    requestedAt,
  };
}

function quarantineRemovalFromPath(
  prepared: PreparedOciRun,
): OciQuarantineRemovalEvidenceV1 | null {
  const artifact = parsedArtifact(
    artifactPaths(prepared).quarantineRemoval,
    "OCI quarantine removal evidence",
  );
  if (artifact === null) return null;
  const input = artifactRecord(artifact.value, "OCI quarantine removal evidence");
  exactArtifactKeys(
    input,
    [
      "attemptId",
      "containerAbsent",
      "containerId",
      "fence",
      "intentDigest",
      "labelsAbsent",
      "observedAt",
      "quarantineDigest",
      "reapRequestDigest",
      "runId",
      "runKey",
      "schemaVersion",
    ],
    "OCI quarantine removal evidence",
  );
  if (input.schemaVersion !== 1 || input.containerAbsent !== true || input.labelsAbsent !== true) {
    throw new OciRunnerError("OCI quarantine removal evidence is not a proven absence");
  }
  assertBoundIdentity(input, prepared, "OCI quarantine removal evidence");
  const quarantine = quarantineFromPath(prepared);
  const request = quarantineReapRequestFromPath(prepared);
  if (quarantine === null || request === null) {
    throw new OciRunnerError("OCI quarantine removal evidence is missing its request chain");
  }
  const containerId = validateContainerId(input.containerId);
  const quarantineDigest = artifactDigest(
    input.quarantineDigest,
    "OCI quarantine removal quarantine digest",
  );
  const reapRequestDigest = artifactDigest(
    input.reapRequestDigest,
    "OCI quarantine removal request digest",
  );
  const observedAt = artifactInstant(input.observedAt, "OCI quarantine removal time");
  if (
    containerId !== quarantine.containerId ||
    containerId !== request.containerId ||
    quarantineDigest !== request.quarantineDigest ||
    quarantineDigest !==
      persistedArtifactDigest(artifactPaths(prepared).quarantine, "OCI quarantine") ||
    reapRequestDigest !==
      persistedArtifactDigest(
        artifactPaths(prepared).quarantineReapRequest,
        "OCI quarantine reap request",
      ) ||
    Date.parse(observedAt) < Date.parse(request.requestedAt)
  ) {
    throw new OciRunnerError("OCI quarantine removal evidence conflicts with its request chain");
  }
  return {
    schemaVersion: 1,
    ...boundIdentity(prepared),
    containerId,
    quarantineDigest,
    reapRequestDigest,
    containerAbsent: true,
    labelsAbsent: true,
    observedAt,
  };
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
  const dispatch = startDispatchFromPath(prepared);
  const postStart = postStartAttestationFromPath(prepared);
  if (
    dispatch === null ||
    postStart === null ||
    dispatch.containerId !== terminal.inspection.containerId ||
    postStart.containerId !== terminal.inspection.containerId
  ) {
    throw new OciRunnerError("OCI receipt is missing its durable start acknowledgement");
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

function assertQuarantineLifecycleConsistency(
  prepared: PreparedOciRun,
  quarantine: OciQuarantineEvidenceV1,
): void {
  const binding = engineBindingFromPath(prepared);
  if (
    binding === null ||
    quarantine.engineBindingDigest !== engineBindingArtifactDigest(prepared)
  ) {
    throw new OciRunnerError("OCI quarantine is missing its exact engine binding");
  }
  createAttemptFromPath(prepared);
  const dispatch = startDispatchFromPath(prepared);
  const postStart = postStartAttestationFromPath(prepared);
  if (
    dispatch !== null &&
    (dispatch.containerId !== quarantine.containerId ||
      dispatch.engineBindingDigest !== quarantine.engineBindingDigest)
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with its start dispatch");
  }
  if (
    postStart !== null &&
    (postStart.containerId !== quarantine.containerId ||
      postStart.engineBindingDigest !== quarantine.engineBindingDigest)
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with its post-start attestation");
  }

  const postStartInspection = parsedArtifact(
    artifactPaths(prepared).postStartInspection,
    "OCI post-start inspection",
  );
  if (postStartInspection !== null) {
    const status = artifactRecord(postStartInspection.value, "OCI post-start inspection").status;
    if (status !== "running" && status !== "terminal") {
      throw new OciRunnerError("OCI post-start inspection has an invalid status");
    }
    const inspection = parseInspectionArtifact(
      postStartInspection.value,
      prepared,
      status,
      "OCI post-start inspection",
    );
    if (inspection.containerId !== quarantine.containerId) {
      throw new OciRunnerError("OCI quarantine has a different post-start container");
    }
  }

  const runningArtifact = parsedArtifact(
    prepared.paths.runningInspectionPath,
    "OCI running inspection",
  );
  if (runningArtifact !== null) {
    if (dispatch === null || postStart === null || postStart.inspectionStatus !== "running") {
      throw new OciRunnerError("OCI running evidence is missing its running start attestation");
    }
    const running = parseInspectionArtifact(
      runningArtifact.value,
      prepared,
      "running",
      "OCI running inspection",
    );
    if (running.containerId !== quarantine.containerId) {
      throw new OciRunnerError("OCI quarantine has a different running container");
    }
  }

  const termination = terminationRequestFromPath(prepared);
  if (
    termination !== null &&
    (termination.phase !== "running" || termination.containerId !== quarantine.containerId)
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with its termination request");
  }

  const terminalInspection = parsedArtifact(
    prepared.paths.terminalInspectionPath,
    "OCI terminal inspection",
  );
  if (terminalInspection !== null) {
    parseInspectionArtifact(
      terminalInspection.value,
      prepared,
      "terminal",
      "OCI terminal inspection",
    );
    throw new OciRunnerError("OCI quarantine conflicts with terminal evidence");
  }
  if (terminalRecordFromPath(prepared) !== null) {
    throw new OciRunnerError("OCI quarantine conflicts with a terminal record");
  }
  if (removalEvidenceFromPath(prepared, quarantine.containerId) !== null) {
    throw new OciRunnerError("OCI quarantine conflicts with normal removal evidence");
  }
  if (
    readPrivateFile(prepared.paths.stdoutPath) !== null ||
    readPrivateFile(prepared.paths.stderrPath) !== null
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with terminal output evidence");
  }
  if (
    validatedReceiptFromPath(prepared) !== null ||
    preStartCancellationFromPath(prepared) !== null
  ) {
    throw new OciRunnerError("OCI quarantine conflicts with final lifecycle evidence");
  }
}

function evidenceArtifact(
  path: string,
  logicalName: string,
  mediaType: OciEvidenceArtifactV1["mediaType"],
  maximumBytes = MAX_ARTIFACT_BYTES,
): OciEvidenceArtifactV1 {
  const bytes = readPrivateFile(path, maximumBytes);
  if (bytes === null) throw new OciRunnerError(`OCI evidence artifact is missing: ${logicalName}`);
  const exportedBytes = Buffer.from(bytes);
  return {
    logicalName,
    mediaType,
    digest: sha256Digest(exportedBytes),
    byteLength: exportedBytes.byteLength,
    bytes: exportedBytes,
  };
}

function evidenceEnvelope(
  prepared: PreparedOciRun,
  phase: OciEvidenceEnvelopeV1["phase"],
  engineIdentityDigest: string,
  containerId: string,
  artifacts: readonly OciEvidenceArtifactV1[],
): OciEvidenceClosureV1 {
  const names = new Set<string>();
  for (const artifact of artifacts) {
    if (names.has(artifact.logicalName)) {
      throw new OciRunnerError("OCI evidence closure has duplicate logical artifact names");
    }
    names.add(artifact.logicalName);
  }
  const envelope: OciEvidenceEnvelopeV1 = {
    schemaVersion: 1,
    phase,
    runKey: prepared.intent.runKey,
    attemptId: prepared.intent.attemptId,
    runId: prepared.intent.runId,
    fence: prepared.intent.fence,
    taskSpecDigest: prepared.intent.taskSpecDigest,
    policyDigest: prepared.intent.policyDigest,
    baseCommit: prepared.intent.baseCommit,
    baseTree: prepared.intent.baseTree,
    intentDigest: prepared.intentDigest,
    engineIdentityDigest,
    imageReference: prepared.intent.image.reference,
    imageId: prepared.intent.image.imageId,
    containerId,
    artifacts: artifacts.map(({ logicalName, mediaType, digest, byteLength }) => ({
      logicalName,
      mediaType,
      digest,
      byteLength,
    })),
  };
  const envelopeBytes = canonicalJsonLine(envelope);
  return {
    envelope,
    envelopeBytes,
    envelopeDigest: sha256Digest(envelopeBytes),
    artifacts,
  };
}

function assertSameEvidenceExecution(
  created: OciContainerInspection,
  observed: OciContainerInspection,
  expectedStartedAt: string | null,
  label: string,
): string | null {
  if (
    observed.containerId !== created.containerId ||
    observed.createdAt !== created.createdAt ||
    (expectedStartedAt !== null && observed.startedAt !== expectedStartedAt)
  ) {
    throw new OciRunnerError(`${label} does not describe the same OCI execution`);
  }
  return expectedStartedAt ?? observed.startedAt;
}

const OCI_RUN_PATH_KEYS = [
  "runDirectory",
  "intentPath",
  "createdInspectionPath",
  "runningInspectionPath",
  "terminalInspectionPath",
  "stdoutPath",
  "stderrPath",
  "removalPath",
  "receiptPath",
] as const satisfies readonly (keyof OciRunPaths)[];

function reopenExactPreparedOciRun(preparedInput: PreparedOciRun): PreparedOciRun {
  const inputIntent = parseOciRunIntent(preparedInput.intent);
  const prepared = openPreparedOciRun(
    dirname(preparedInput.paths.runDirectory),
    inputIntent.runKey,
  );
  const suppliedPathKeys = Object.keys(preparedInput.paths).sort();
  const expectedPathKeys = [...OCI_RUN_PATH_KEYS].sort();
  if (
    prepared === null ||
    preparedInput.intentDigest !== digestOciRunIntent(inputIntent) ||
    prepared.intentDigest !== preparedInput.intentDigest ||
    !canonicalJsonLine(inputIntent).equals(canonicalJsonLine(prepared.intent)) ||
    suppliedPathKeys.length !== expectedPathKeys.length ||
    suppliedPathKeys.some((key, index) => key !== expectedPathKeys[index]) ||
    OCI_RUN_PATH_KEYS.some((key) => preparedInput.paths[key] !== prepared.paths[key]) ||
    (preparedInput.preparation !== "created" && preparedInput.preparation !== "already-prepared")
  ) {
    throw new OciRunnerError("Prepared OCI evidence run is missing or changed identity");
  }
  return prepared;
}

/**
 * Exports one read-only, fully validated OCI lifecycle closure. This function
 * never invokes the engine or mutates lifecycle evidence. It uses the same
 * transient per-run operation lock as reconciliation so every returned closure
 * is one coherent snapshot. A running or otherwise incomplete lifecycle returns
 * null; a claimed terminal closure with missing, conflicting, or tampered
 * evidence throws.
 */
export async function readOciEvidenceClosure(
  preparedInput: PreparedOciRun,
): Promise<OciEvidenceClosureV1 | null> {
  const prepared = reopenExactPreparedOciRun(preparedInput);
  return await whileRunLocked(prepared, new Date(), async () =>
    readOciEvidenceClosureLocked(prepared),
  );
}

function readOciEvidenceClosureLocked(prepared: PreparedOciRun): OciEvidenceClosureV1 | null {
  const receipt = validatedReceiptFromPath(prepared);
  const quarantine = quarantineFromPath(prepared);
  const quarantineRemoval = quarantineRemovalFromPath(prepared);
  const reapRequest = quarantineReapRequestFromPath(prepared);
  const cancellation = preStartCancellationFromPath(prepared);
  if (receipt !== null && (quarantine !== null || quarantineRemoval !== null)) {
    throw new OciRunnerError("OCI evidence has conflicting normal and quarantine closures");
  }
  if (cancellation !== null && (receipt !== null || quarantine !== null)) {
    throw new OciRunnerError("OCI evidence has conflicting cancellation and execution closures");
  }
  if (receipt === null && quarantine === null) {
    const paths = artifactPaths(prepared);
    const hasTerminalOnlyArtifact = [
      prepared.paths.terminalInspectionPath,
      paths.terminalRecord,
      prepared.paths.stdoutPath,
      prepared.paths.stderrPath,
    ].some((path) => readPrivateFile(path) !== null);
    const hasUnboundRemoval =
      cancellation === null && readPrivateFile(prepared.paths.removalPath) !== null;
    if (reapRequest !== null || hasTerminalOnlyArtifact || hasUnboundRemoval) {
      throw new OciRunnerError("OCI evidence has a partial terminal closure");
    }
    return null;
  }

  const paths = artifactPaths(prepared);
  const binding = engineBindingFromPath(prepared);
  const createAttempt = createAttemptFromPath(prepared);
  const launch = launchAttemptFromPath(prepared);
  if (binding === null || createAttempt === null || launch === null) {
    throw new OciRunnerError("OCI evidence closure is missing its engine/create/launch chain");
  }
  if (createAttempt.engineBindingDigest !== launch.engineBindingDigest) {
    throw new OciRunnerError("OCI evidence create and launch attempts use different engines");
  }
  const createdArtifact = parsedArtifact(
    prepared.paths.createdInspectionPath,
    "OCI created inspection",
  );
  if (createdArtifact === null) {
    throw new OciRunnerError("OCI evidence closure is missing its created inspection");
  }
  const createdInspection = parseInspectionArtifact(
    createdArtifact.value,
    prepared,
    "created",
    "OCI created inspection",
  );
  if (createdInspection.containerId !== launch.containerId) {
    throw new OciRunnerError("OCI evidence closure changed its created container identity");
  }
  let executionStartedAt: string | null = null;

  const artifacts: OciEvidenceArtifactV1[] = [
    evidenceArtifact(prepared.paths.intentPath, "intent.json", "application/json"),
    evidenceArtifact(paths.engineBinding, "engine-binding.json", "application/json"),
    evidenceArtifact(paths.createAttempt, "create-attempt.json", "application/json"),
    evidenceArtifact(
      prepared.paths.createdInspectionPath,
      "created.inspect.json",
      "application/json",
    ),
    evidenceArtifact(paths.launchAttempt, "launch-attempt.json", "application/json"),
  ];

  const dispatch = startDispatchFromPath(prepared);
  const postStartArtifact = parsedArtifact(paths.postStartInspection, "OCI post-start inspection");
  const postStart = postStartAttestationFromPath(prepared);
  if (dispatch !== null) {
    artifacts.push(
      evidenceArtifact(paths.startDispatch, "start-dispatched.json", "application/json"),
    );
  }
  if (postStartArtifact !== null) {
    const status = artifactRecord(postStartArtifact.value, "OCI post-start inspection").status;
    if (status !== "running" && status !== "terminal") {
      throw new OciRunnerError("OCI post-start evidence has an invalid status");
    }
    const inspection = parseInspectionArtifact(
      postStartArtifact.value,
      prepared,
      status,
      "OCI post-start inspection",
    );
    if (dispatch === null || inspection.containerId !== launch.containerId) {
      throw new OciRunnerError("OCI post-start evidence is missing its dispatch binding");
    }
    executionStartedAt = assertSameEvidenceExecution(
      createdInspection,
      inspection,
      executionStartedAt,
      "OCI post-start inspection",
    );
    artifacts.push(
      evidenceArtifact(paths.postStartInspection, "post-start.inspect.json", "application/json"),
    );
  }
  if (postStart !== null) {
    artifacts.push(
      evidenceArtifact(paths.postStartAttestation, "post-start-attested.json", "application/json"),
    );
  }

  const runningArtifact = parsedArtifact(
    prepared.paths.runningInspectionPath,
    "OCI running inspection",
  );
  if (runningArtifact !== null) {
    if (dispatch === null || postStart === null || postStart.inspectionStatus !== "running") {
      throw new OciRunnerError("OCI running evidence is missing its running start attestation");
    }
    const running = parseInspectionArtifact(
      runningArtifact.value,
      prepared,
      "running",
      "OCI running inspection",
    );
    if (running.containerId !== launch.containerId) {
      throw new OciRunnerError("OCI running evidence changed container identity");
    }
    executionStartedAt = assertSameEvidenceExecution(
      createdInspection,
      running,
      executionStartedAt,
      "OCI running inspection",
    );
    artifacts.push(
      evidenceArtifact(
        prepared.paths.runningInspectionPath,
        "running.inspect.json",
        "application/json",
      ),
    );
  }
  const termination = terminationRequestFromPath(prepared);
  if (termination !== null) {
    if (
      termination.phase === "running" &&
      (runningArtifact === null ||
        executionStartedAt === null ||
        termination.startedAt !== executionStartedAt)
    ) {
      throw new OciRunnerError("OCI termination request does not describe the same execution");
    }
    artifacts.push(
      evidenceArtifact(paths.terminationRequest, "termination-request.json", "application/json"),
    );
  }

  if (receipt !== null) {
    if (dispatch === null || postStartArtifact === null || postStart === null) {
      throw new OciRunnerError("OCI removed closure is missing durable start evidence");
    }
    if (receipt.containerId !== launch.containerId) {
      throw new OciRunnerError("OCI removed closure changed container identity");
    }
    const terminalArtifact = parsedArtifact(
      prepared.paths.terminalInspectionPath,
      "OCI terminal inspection",
    );
    if (terminalArtifact === null) {
      throw new OciRunnerError("OCI removed closure is missing terminal inspection evidence");
    }
    const terminalInspection = parseInspectionArtifact(
      terminalArtifact.value,
      prepared,
      "terminal",
      "OCI terminal inspection",
    );
    if (terminalInspection.containerId !== launch.containerId) {
      throw new OciRunnerError("OCI removed closure changed terminal container identity");
    }
    executionStartedAt = assertSameEvidenceExecution(
      createdInspection,
      terminalInspection,
      executionStartedAt,
      "OCI terminal inspection",
    );
    if (executionStartedAt === null) {
      throw new OciRunnerError("OCI removed closure has no proven execution start");
    }
    if (
      postStart.inspectionStatus === "terminal" &&
      sha256Digest(postStartArtifact.bytes) !== sha256Digest(terminalArtifact.bytes)
    ) {
      throw new OciRunnerError("OCI terminal start acknowledgement changed before closure");
    }
    const terminal = terminalRecordFromPath(prepared);
    const removal = removalEvidenceFromPath(prepared, launch.containerId);
    if (terminal === null || removal === null) {
      throw new OciRunnerError("OCI removed closure is missing terminal or removal evidence");
    }
    artifacts.push(
      evidenceArtifact(
        prepared.paths.terminalInspectionPath,
        "terminal.inspect.json",
        "application/json",
      ),
      evidenceArtifact(
        prepared.paths.stdoutPath,
        "stdout.bin",
        "application/octet-stream",
        prepared.intent.limits.outputBytesPerStream,
      ),
      evidenceArtifact(
        prepared.paths.stderrPath,
        "stderr.bin",
        "application/octet-stream",
        prepared.intent.limits.outputBytesPerStream,
      ),
      evidenceArtifact(paths.terminalRecord, "terminal.json", "application/json"),
      evidenceArtifact(prepared.paths.removalPath, "removed.json", "application/json"),
      evidenceArtifact(prepared.paths.receiptPath, "receipt.json", "application/json"),
    );
    return evidenceEnvelope(
      prepared,
      "removed",
      binding.engineIdentityDigest,
      launch.containerId,
      artifacts,
    );
  }

  if (quarantine === null) {
    throw new OciRunnerError("OCI evidence closure has no terminal disposition");
  }
  assertQuarantineLifecycleConsistency(prepared, quarantine);
  if (quarantine.containerId !== launch.containerId) {
    throw new OciRunnerError("OCI quarantine closure changed container identity");
  }
  artifacts.push(evidenceArtifact(paths.quarantine, "quarantine.json", "application/json"));
  if (reapRequest !== null) {
    artifacts.push(
      evidenceArtifact(
        paths.quarantineReapRequest,
        "quarantine-reap-request.json",
        "application/json",
      ),
    );
  }
  if (quarantineRemoval !== null) {
    if (reapRequest === null) {
      throw new OciRunnerError("OCI quarantine removal has no durable reap request");
    }
    artifacts.push(
      evidenceArtifact(paths.quarantineRemoval, "quarantine-removed.json", "application/json"),
    );
  }
  return evidenceEnvelope(
    prepared,
    quarantineRemoval === null ? "quarantined" : "quarantine-removed",
    binding.engineIdentityDigest,
    launch.containerId,
    artifacts,
  );
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

  public async reapQuarantined(preparedInput: PreparedOciRun): Promise<ReconcileOciRunResult> {
    const prepared = this.#loadPrepared(preparedInput);
    return await whileRunLocked(
      prepared,
      this.#now(),
      async () => await this.#reapQuarantinedLocked(prepared),
    );
  }

  async #inspect(containerId: string): Promise<OciContainerInspection | null> {
    const inspection = await this.#engine.inspect(containerId);
    this.#afterBoundary("after-inspect");
    return inspection;
  }

  #capturedEngineIdentityDigest(): string {
    return artifactDigest(this.#engine.engineIdentityDigest, "OCI engine identity digest");
  }

  async #observeEngineIdentityDigest(): Promise<string> {
    const captured = this.#capturedEngineIdentityDigest();
    const observed = artifactDigest(
      await this.#engine.observeEngineIdentityDigest(),
      "observed OCI engine identity digest",
    );
    if (observed !== captured) {
      throw new OciRunnerError("OCI engine identity changed after engine construction");
    }
    return observed;
  }

  async #loadOrBindEngine(prepared: PreparedOciRun): Promise<EngineBindingV1> {
    const identityDigest = await this.#observeEngineIdentityDigest();
    const existing = engineBindingFromPath(prepared);
    if (existing !== null) {
      if (existing.engineIdentityDigest !== identityDigest) {
        throw new OciRunnerError("OCI engine identity differs from the durable run binding");
      }
      return existing;
    }
    const binding: EngineBindingV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      engineIdentityDigest: identityDigest,
      boundAt: nondecreasingInstant(this.#now(), prepared.intent.createdAt),
    };
    jsonArtifact(artifactPaths(prepared).engineBinding, binding);
    const persisted = engineBindingFromPath(prepared);
    if (persisted === null || persisted.engineIdentityDigest !== identityDigest) {
      throw new OciRunnerError("OCI engine binding was not persisted exactly");
    }
    return persisted;
  }

  async #assertBoundEngine(prepared: PreparedOciRun): Promise<void> {
    const binding = engineBindingFromPath(prepared);
    if (binding === null) throw new OciRunnerError("OCI run is missing its engine binding");
    const observed = await this.#observeEngineIdentityDigest();
    if (binding.engineIdentityDigest !== observed) {
      throw new OciRunnerError("OCI engine identity differs from the durable run binding");
    }
  }

  #quarantineAndThrow(
    prepared: PreparedOciRun,
    launch: LaunchAttemptV1,
    reason: OciQuarantineReason,
    cause: unknown,
  ): never {
    const existing = quarantineFromPath(prepared);
    if (existing !== null) throw new OciQuarantineTransition(existing, { cause });
    const dispatch = startDispatchFromPath(prepared);
    const quarantinedAt = nondecreasingInstant(
      this.#now(),
      dispatch?.dispatchedAt ?? launch.attemptedAt,
    );
    const quarantine: OciQuarantineEvidenceV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: launch.containerId,
      engineBindingDigest: launch.engineBindingDigest,
      launchAttemptDigest: persistedArtifactDigest(
        artifactPaths(prepared).launchAttempt,
        "OCI launch attempt",
      ),
      reason,
      quarantinedAt,
    };
    jsonArtifact(artifactPaths(prepared).quarantine, quarantine);
    const persisted = quarantineFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI quarantine was not persisted", { cause });
    this.#afterBoundary("after-quarantine");
    throw new OciQuarantineTransition(persisted, { cause });
  }

  async #inspectLaunched(
    prepared: PreparedOciRun,
    launch: LaunchAttemptV1,
  ): Promise<OciContainerInspection> {
    let inspection: OciContainerInspection | null;
    try {
      inspection = await this.#engine.inspect(launch.containerId);
    } catch (error) {
      this.#quarantineAndThrow(prepared, launch, "inspect-ambiguous", error);
    }
    this.#afterBoundary("after-inspect");
    if (inspection === null) {
      this.#quarantineAndThrow(
        prepared,
        launch,
        "container-disappeared",
        new OciRunnerError("Launched OCI container is absent"),
      );
    }
    try {
      assertOciInspectionMatchesIntent(inspection, prepared.intent);
    } catch (error) {
      this.#quarantineAndThrow(prepared, launch, "attestation-failed", error);
    }
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
      engineBindingDigest: engineBindingArtifactDigest(prepared),
      attemptedAt: nondecreasingInstant(this.#now(), prepared.intent.createdAt),
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
      engineBindingDigest: engineBindingArtifactDigest(prepared),
      attemptedAt: nondecreasingInstant(this.#now(), prepared.intent.createdAt),
    };
    jsonArtifact(artifactPaths(prepared).createAttempt, attempt);
    this.#afterBoundary("after-create-attempt");
    const persisted = createAttemptFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI create attempt was not persisted");
    return persisted;
  }

  #publishStartDispatch(prepared: PreparedOciRun, launch: LaunchAttemptV1): StartDispatchV1 {
    const existing = startDispatchFromPath(prepared);
    if (existing !== null) return existing;
    const dispatch: StartDispatchV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: launch.containerId,
      engineBindingDigest: launch.engineBindingDigest,
      launchAttemptDigest: persistedArtifactDigest(
        artifactPaths(prepared).launchAttempt,
        "OCI launch attempt",
      ),
      dispatchedAt: nondecreasingInstant(this.#now(), launch.attemptedAt),
    };
    jsonArtifact(artifactPaths(prepared).startDispatch, dispatch);
    const persisted = startDispatchFromPath(prepared);
    if (persisted === null) throw new OciRunnerError("OCI start dispatch was not persisted");
    this.#afterBoundary("after-start-dispatched");
    return persisted;
  }

  #publishPostStartAttestation(
    prepared: PreparedOciRun,
    dispatch: StartDispatchV1,
    inspection: OciContainerInspection,
  ): PostStartAttestationV1 {
    const existing = postStartAttestationFromPath(prepared);
    if (existing !== null) return existing;
    if (inspection.status !== "running" && inspection.status !== "terminal") {
      throw new OciRunnerError("OCI post-start attestation requires running or terminal state");
    }
    const inspectionPath = artifactPaths(prepared).postStartInspection;
    jsonArtifact(inspectionPath, inspection);
    const inspectionArtifact = parsedArtifact(inspectionPath, "OCI post-start inspection");
    if (inspectionArtifact === null) {
      throw new OciRunnerError("OCI post-start inspection was not persisted");
    }
    const attestation: PostStartAttestationV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: inspection.containerId,
      engineBindingDigest: dispatch.engineBindingDigest,
      inspectionDigest: sha256Digest(inspectionArtifact.bytes),
      inspectionStatus: inspection.status,
      startDispatchDigest: persistedArtifactDigest(
        artifactPaths(prepared).startDispatch,
        "OCI start dispatch",
      ),
      attestedAt: nondecreasingInstant(this.#now(), dispatch.dispatchedAt),
    };
    jsonArtifact(artifactPaths(prepared).postStartAttestation, attestation);
    const persisted = postStartAttestationFromPath(prepared);
    if (persisted === null) {
      throw new OciRunnerError("OCI post-start attestation was not persisted");
    }
    this.#afterBoundary("after-post-start-attestation");
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

  #loadOrCreateRemoval(
    prepared: PreparedOciRun,
    containerId: string,
    ...lowerBounds: readonly string[]
  ): BoundRemovalEvidenceV1 {
    const existing = removalEvidenceFromPath(prepared, containerId);
    if (existing !== null) return existing;
    const removal: BoundRemovalEvidenceV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId,
      absent: true,
      observedAt: nondecreasingInstant(this.#now(), ...lowerBounds),
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
      await this.#assertBoundEngine(prepared);
      await this.#engine.remove(request.containerId);
      this.#afterBoundary("after-remove");
      const afterRemoval = await this.#inspect(request.containerId);
      if (afterRemoval !== null) {
        throw new OciRunnerError("OCI pre-start container still exists after removal");
      }
    }
    await this.#assertBoundEngine(prepared);
    const removal = this.#loadOrCreateRemoval(prepared, request.containerId, request.requestedAt);
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

  #publishQuarantineReapRequest(
    prepared: PreparedOciRun,
    quarantine: OciQuarantineEvidenceV1,
  ): OciQuarantineReapRequestV1 {
    assertQuarantineLifecycleConsistency(prepared, quarantine);
    const existing = quarantineReapRequestFromPath(prepared);
    if (existing !== null) return existing;
    const requestedAt = nondecreasingInstant(this.#now(), quarantine.quarantinedAt);
    const request: OciQuarantineReapRequestV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: quarantine.containerId,
      quarantineDigest: persistedArtifactDigest(
        artifactPaths(prepared).quarantine,
        "OCI quarantine",
      ),
      requestedAt,
    };
    jsonArtifact(artifactPaths(prepared).quarantineReapRequest, request);
    const persisted = quarantineReapRequestFromPath(prepared);
    if (persisted === null) {
      throw new OciRunnerError("OCI quarantine reap request was not persisted");
    }
    this.#afterBoundary("after-quarantine-reap-request");
    return persisted;
  }

  async #reapQuarantinedLocked(prepared: PreparedOciRun): Promise<ReconcileOciRunResult> {
    const quarantine = quarantineFromPath(prepared);
    const removal = quarantineRemovalFromPath(prepared);
    const receipt = validatedReceiptFromPath(prepared);
    const cancellation = preStartCancellationFromPath(prepared);
    if (quarantine === null) {
      throw new OciRunnerError("OCI run has no durable quarantine to reap");
    }
    assertQuarantineLifecycleConsistency(prepared, quarantine);
    if (receipt !== null || cancellation !== null)
      throw new OciRunnerError("OCI quarantine conflicts with existing final evidence");
    if (removal !== null) return { phase: "quarantine-removed", removal };
    await this.#loadOrBindEngine(prepared);
    const request = this.#publishQuarantineReapRequest(prepared, quarantine);

    try {
      await this.#assertBoundEngine(prepared);
    } catch (error) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey, { cause: error });
    }
    let killSucceeded = false;
    try {
      await this.#engine.kill(request.containerId);
      killSucceeded = true;
    } catch {
      // A created, terminal, or already absent container rejects kill. A lost
      // response may also have killed it. Only later exact absence is evidence.
    }
    if (killSucceeded) this.#afterBoundary("after-quarantine-kill");

    try {
      await this.#assertBoundEngine(prepared);
    } catch (error) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey, { cause: error });
    }
    let removeSucceeded = false;
    try {
      await this.#engine.remove(request.containerId);
      removeSucceeded = true;
    } catch {
      // Removal responses are not evidence. Inspect and exact-label discovery
      // below decide whether this attempt is complete or remains quarantined.
    }
    if (removeSucceeded) this.#afterBoundary("after-quarantine-remove");

    let exactContainer: OciContainerInspection | null;
    try {
      exactContainer = await this.#engine.inspect(request.containerId);
    } catch (error) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey, { cause: error });
    }
    if (exactContainer !== null) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey);
    }

    let labelMatch: OciContainerInspection | null;
    try {
      labelMatch = await this.#engine.findByLabels(labelsForOciRun(prepared.intent));
    } catch (error) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey, { cause: error });
    }
    if (labelMatch !== null) throw new OciRunnerReapPendingError(prepared.intent.runKey);

    try {
      await this.#assertBoundEngine(prepared);
    } catch (error) {
      throw new OciRunnerReapPendingError(prepared.intent.runKey, { cause: error });
    }

    const observedAt = nondecreasingInstant(this.#now(), request.requestedAt);
    const evidence: OciQuarantineRemovalEvidenceV1 = {
      schemaVersion: 1,
      ...boundIdentity(prepared),
      containerId: request.containerId,
      quarantineDigest: request.quarantineDigest,
      reapRequestDigest: persistedArtifactDigest(
        artifactPaths(prepared).quarantineReapRequest,
        "OCI quarantine reap request",
      ),
      containerAbsent: true,
      labelsAbsent: true,
      observedAt,
    };
    jsonArtifact(artifactPaths(prepared).quarantineRemoval, evidence);
    const persisted = quarantineRemovalFromPath(prepared);
    if (persisted === null) {
      throw new OciRunnerError("OCI quarantine removal evidence was not persisted");
    }
    this.#afterBoundary("after-quarantine-absence");
    return { phase: "quarantine-removed", removal: persisted };
  }

  async #reconcile(
    preparedInput: PreparedOciRun,
    requestedTermination: "natural" | "cancellation",
  ): Promise<ReconcileOciRunResult> {
    const prepared = this.#loadPrepared(preparedInput);
    try {
      return await whileRunLocked(
        prepared,
        this.#now(),
        async () => await this.#reconcileLocked(prepared, requestedTermination),
      );
    } catch (error) {
      if (error instanceof OciQuarantineTransition) {
        assertQuarantineLifecycleConsistency(prepared, error.quarantine);
        return { phase: "quarantined", quarantine: error.quarantine };
      }
      throw error;
    }
  }

  #assertLaunchStillPermitted(prepared: PreparedOciRun): void {
    const cancellation = preStartCancellationFromPath(prepared);
    const receipt = validatedReceiptFromPath(prepared);
    const terminationRequest = terminationRequestFromPath(prepared);
    const quarantine = quarantineFromPath(prepared);
    const quarantineRemoval = quarantineRemovalFromPath(prepared);
    if (
      cancellation !== null ||
      receipt !== null ||
      terminationRequest !== null ||
      quarantine !== null ||
      quarantineRemoval !== null
    ) {
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
    const quarantine = quarantineFromPath(prepared);
    quarantineReapRequestFromPath(prepared);
    const quarantineRemoval = quarantineRemovalFromPath(prepared);
    if (preStartCancellation !== null && existingReceipt !== null) {
      throw new OciRunnerError("OCI run has conflicting final artifacts");
    }
    if (quarantine !== null && (preStartCancellation !== null || existingReceipt !== null)) {
      throw new OciRunnerError("OCI quarantine conflicts with existing final evidence");
    }
    if (quarantineRemoval !== null) {
      if (quarantine === null) {
        throw new OciRunnerError("OCI quarantine removal is missing quarantine evidence");
      }
      assertQuarantineLifecycleConsistency(prepared, quarantine);
      return { phase: "quarantine-removed", removal: quarantineRemoval };
    }
    if (quarantine !== null) {
      assertQuarantineLifecycleConsistency(prepared, quarantine);
      return { phase: "quarantined", quarantine };
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

    await this.#loadOrBindEngine(prepared);

    const intent = prepared.intent;
    let imageVerified = false;
    const terminalContainerId = persistedTerminalContainerId(prepared.paths.terminalInspectionPath);
    const launchAttempt = launchAttemptFromPath(prepared);
    const startDispatch = startDispatchFromPath(prepared);
    const postStartAttestation = postStartAttestationFromPath(prepared);
    if (startDispatch !== null && postStartAttestation === null) {
      if (launchAttempt === null) {
        throw new OciRunnerError("OCI start dispatch is missing its launch attempt");
      }
      this.#quarantineAndThrow(
        prepared,
        launchAttempt,
        "start-ambiguous",
        new OciRunnerError("OCI start dispatch has no durable post-start attestation"),
      );
    }
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
      inspection =
        launchAttempt !== null && terminalContainerId === null
          ? await this.#inspectLaunched(prepared, launchAttempt)
          : await this.#inspect(boundContainerId);
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
      await this.#assertBoundEngine(prepared);
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
      const launch = this.#publishLaunchAttempt(prepared, inspection);
      this.#assertLaunchStillPermitted(prepared);
      const dispatch = this.#publishStartDispatch(prepared, launch);
      try {
        await this.#assertBoundEngine(prepared);
        await this.#engine.start(inspection.containerId);
      } catch (error) {
        this.#quarantineAndThrow(prepared, launch, "start-ambiguous", error);
      }
      this.#afterBoundary("after-start");
      inspection = await this.#inspectLaunched(prepared, launch);
      if (inspection.status === "created") {
        this.#quarantineAndThrow(
          prepared,
          launch,
          "post-start-state-unproven",
          new OciRunnerError("OCI start returned without a running or terminal state"),
        );
      }
      this.#publishPostStartAttestation(prepared, dispatch, inspection);
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
      await this.#assertBoundEngine(prepared);
      await this.#engine.stop(inspection.containerId, intent.limits.stopGraceMs);
      this.#afterBoundary("after-stop");
      inspection = await this.#inspectLaunched(prepared, persistedLaunch);
      if (inspection?.status === "running") {
        await this.#assertBoundEngine(prepared);
        await this.#engine.kill(inspection.containerId);
        this.#afterBoundary("after-kill");
        inspection = await this.#inspectLaunched(prepared, persistedLaunch);
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

    await this.#assertBoundEngine(prepared);
    await this.#engine.remove(inspection.containerId);
    this.#afterBoundary("after-remove");
    const afterRemoval = await this.#inspect(inspection.containerId);
    if (afterRemoval !== null) throw new OciRunnerError("OCI container still exists after removal");
    return await this.#finishRemoved(prepared, inspection.containerId);
  }

  async #finishRemoved(
    prepared: PreparedOciRun,
    containerId: string,
  ): Promise<ReconcileOciRunResult> {
    const terminal = terminalRecordFromPath(prepared);
    if (terminal === null || terminal.inspection.containerId !== containerId) {
      throw new OciRunnerError("Removed OCI container is missing valid terminal evidence");
    }
    await this.#assertBoundEngine(prepared);
    const finishedAt = terminal.inspection.finishedAt;
    if (finishedAt === null) {
      throw new OciRunnerError("Removed OCI terminal evidence has no finish time");
    }
    const removal = this.#loadOrCreateRemoval(prepared, containerId, finishedAt);
    const receipt = receiptFor(prepared, terminal, removal);
    jsonArtifact(prepared.paths.receiptPath, receipt);
    const validated = validatedReceiptFromPath(prepared);
    if (validated === null) throw new OciRunnerError("OCI receipt was not persisted");
    return { phase: "removed", receipt: validated };
  }
}
