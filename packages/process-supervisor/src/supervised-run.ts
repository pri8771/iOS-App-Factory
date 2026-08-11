import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
  createSupervisedRunIntent,
  digestSupervisedRunIntent,
  digestSupervisorIdentity,
  MAX_SUPERVISED_INTENT_BYTES,
  MAX_SUPERVISED_RECEIPT_BYTES,
  parseSupervisedRunCancellation,
  parseSupervisedRunIntent,
  parseSupervisedRunKey,
  parseSupervisedRunReceipt,
  type CreateSupervisedRunIntentInput,
  type SupervisedRunCancellationV1,
  type SupervisedRunIntentV1,
  type SupervisedRunReceiptV1,
} from "./supervised-model.js";
import {
  assertNormalizedAbsolutePath,
  assertPrivateExistingDirectory,
  createPrivateFileExclusive,
  ensurePrivateDirectory,
  readPrivateFile,
} from "./secure-artifacts.js";
import { readSupervisorStateFile, removeSupervisorStateFile } from "./state-file.js";
import { createSystemPlatformProbe, type PlatformProcessProbe } from "./platform.js";
import {
  terminateProcessGroup,
  validateSupervisorIdentity,
  type SupervisorClock,
  type TerminationResult,
} from "./supervisor.js";
import { parseSupervisorIdentityV2, type SupervisorIdentityV2 } from "./model.js";

const LAUNCH_CLAIM_SCHEMA_VERSION = 1 as const;
const MAX_LAUNCH_CLAIM_BYTES = 16_384;
const INTENT_FILE_NAME = "intent.json";
const LAUNCH_CLAIM_FILE_NAME = "launch.claim.json";
const STATE_FILE_NAME = "target.state.json";
const CONTROLLER_STATE_FILE_NAME = "controller.state.json";
const PERMISSION_FILE_NAME = "execution-permitted.json";
const GATE_RELEASE_FILE_NAME = "gate-released.json";
const STDOUT_FILE_NAME = "stdout.bin";
const STDERR_FILE_NAME = "stderr.bin";
const CANCELLATION_FILE_NAME = "cancellation.json";
const RECEIPT_FILE_NAME = "receipt.json";

type LaunchClaimV1 = Readonly<{
  schemaVersion: typeof LAUNCH_CLAIM_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  fence: number;
  intentDigest: string;
  requestedAt: string;
}>;

type ExecutionPermissionV1 = Readonly<{
  schemaVersion: 1;
  runKey: string;
  attemptId: string;
  fence: number;
  intentDigest: string;
  identityDigest: string;
  permittedAt: string;
}>;

type GateReleaseV1 = Readonly<{
  schemaVersion: 1;
  runKey: string;
  attemptId: string;
  fence: number;
  intentDigest: string;
  identityDigest: string;
  releasedAt: string;
}>;

export type SupervisedRunPaths = Readonly<{
  runDirectory: string;
  intentPath: string;
  launchClaimPath: string;
  statePath: string;
  controllerStatePath: string;
  permissionPath: string;
  gateReleasePath: string;
  stdoutPath: string;
  stderrPath: string;
  cancellationPath: string;
  receiptPath: string;
}>;

export type PreparedSupervisedRun = Readonly<{
  intent: SupervisedRunIntentV1;
  intentDigest: string;
  paths: SupervisedRunPaths;
  preparation: "created" | "already-prepared";
}>;

export type LaunchSupervisedRunOptions = Readonly<{
  controllerEntrypointPath?: string;
  wallClock?: () => Date;
  spawnController?: (
    executable: string,
    argv: readonly string[],
    options: Readonly<{
      cwd: string;
      detached: true;
      env: Readonly<Record<string, string>>;
      stdio: "ignore";
    }>,
  ) => Pick<ChildProcess, "pid" | "unref" | "exitCode" | "signalCode">;
}>;

export type LocalSupervisedControllerRegistration = Readonly<{
  controllerPid: number;
  hasExited(): boolean;
}>;

export type SupervisedRunInspection =
  | Readonly<{ state: "prepared"; intent: SupervisedRunIntentV1 }>
  | Readonly<{
      state: "launch-pending-or-ambiguous";
      intent: SupervisedRunIntentV1;
      reason: "launch-claimed-without-proven-target-or-receipt";
    }>
  | Readonly<{
      state: "live";
      intent: SupervisedRunIntentV1;
      identity: SupervisorIdentityV2;
    }>
  | Readonly<{
      state: "terminal";
      intent: SupervisedRunIntentV1;
      receipt: SupervisedRunReceiptV1;
      stateCleanup: "complete" | "pending";
    }>
  | Readonly<{
      state: "blocked";
      intent: SupervisedRunIntentV1;
      reason: string;
    }>;

export type LaunchSupervisedRunResult =
  | Readonly<{
      outcome: "launch-requested";
      controllerPid: number;
      registration: LocalSupervisedControllerRegistration;
    }>
  | Readonly<{ outcome: "already-live"; identity: SupervisorIdentityV2 }>
  | Readonly<{ outcome: "already-terminal"; receipt: SupervisedRunReceiptV1 }>
  | Readonly<{ outcome: "blocked"; reason: string }>;

export type ReconcileSupervisedRunResult =
  | Readonly<{ outcome: "prepared" }>
  | Readonly<{ outcome: "adopted"; identity: SupervisorIdentityV2 }>
  | Readonly<{ outcome: "terminal"; receipt: SupervisedRunReceiptV1; stateRemoved: boolean }>
  | Readonly<{ outcome: "blocked"; reason: string }>;

export type RequestSupervisedRunTerminationResult =
  | Readonly<{ outcome: "already-terminal"; receipt: SupervisedRunReceiptV1 }>
  | Readonly<{ outcome: "not-running"; reason: string }>
  | Readonly<{
      outcome: "termination-requested";
      cancellation: SupervisedRunCancellationV1;
      termination: TerminationResult;
    }>
  | Readonly<{ outcome: "blocked"; reason: string }>;

export type WaitForSupervisedRunRegistrationResult =
  | Readonly<{ outcome: "registered"; identity: SupervisorIdentityV2 }>
  | Readonly<{ outcome: "terminal"; receipt: SupervisedRunReceiptV1 }>
  | Readonly<{ outcome: "blocked"; reason: string }>;

export type SupervisedRunCancellationBlockerReason =
  | "identity-mismatch"
  | "identity-unavailable"
  | "intent-mismatch"
  | "malformed"
  | "non-canonical"
  | "unreadable";

export class SupervisedRunCancellationArtifactError extends Error {
  public readonly blockerReason: SupervisedRunCancellationBlockerReason;

  public constructor(reason: SupervisedRunCancellationBlockerReason, cause?: unknown) {
    super(`Supervised cancellation artifact is invalid: ${reason}`, { cause });
    this.name = "SupervisedRunCancellationArtifactError";
    this.blockerReason = reason;
  }
}

function canonicalLine(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function assertCanonical(bytes: Buffer, parsed: unknown, label: string): void {
  if (!bytes.equals(canonicalLine(parsed))) {
    throw new Error(`${label} is not in canonical serialized form`);
  }
}

function cancellationBlockerReason(error: SupervisedRunCancellationArtifactError): string {
  return `cancellation-artifact-invalid:${error.blockerReason}`;
}

export function deriveSupervisedRunPaths(
  rootDirectory: string,
  runKey: string,
): SupervisedRunPaths {
  assertNormalizedAbsolutePath(rootDirectory, "Supervised run root");
  const validatedRunKey = parseSupervisedRunKey(runKey);
  const runDirectory = join(rootDirectory, validatedRunKey);
  assertNormalizedAbsolutePath(runDirectory, "Supervised run directory");
  return {
    runDirectory,
    intentPath: join(runDirectory, INTENT_FILE_NAME),
    launchClaimPath: join(runDirectory, LAUNCH_CLAIM_FILE_NAME),
    statePath: join(runDirectory, STATE_FILE_NAME),
    controllerStatePath: join(runDirectory, CONTROLLER_STATE_FILE_NAME),
    permissionPath: join(runDirectory, PERMISSION_FILE_NAME),
    gateReleasePath: join(runDirectory, GATE_RELEASE_FILE_NAME),
    stdoutPath: join(runDirectory, STDOUT_FILE_NAME),
    stderrPath: join(runDirectory, STDERR_FILE_NAME),
    cancellationPath: join(runDirectory, CANCELLATION_FILE_NAME),
    receiptPath: join(runDirectory, RECEIPT_FILE_NAME),
  };
}

export function openPreparedSupervisedRun(
  rootDirectory: string,
  runKey: string,
): PreparedSupervisedRun | null {
  assertNormalizedAbsolutePath(rootDirectory, "Supervised run root");
  const paths = deriveSupervisedRunPaths(rootDirectory, runKey);
  try {
    assertPrivateExistingDirectory(rootDirectory);
    assertPrivateExistingDirectory(paths.runDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const bytes = readPrivateFile(paths.intentPath, MAX_SUPERVISED_INTENT_BYTES);
  if (bytes === null) return null;
  const intent = parseSupervisedRunIntent(parseJson(bytes, "Supervised run intent"));
  assertCanonical(bytes, intent, "Supervised run intent");
  if (intent.runKey !== runKey) {
    throw new Error("Supervised run key does not match the immutable intent location");
  }
  return {
    intent,
    intentDigest: digestSupervisedRunIntent(intent),
    paths,
    preparation: "already-prepared",
  };
}

function readIntent(path: string): SupervisedRunIntentV1 {
  const bytes = readPrivateFile(path, MAX_SUPERVISED_INTENT_BYTES);
  if (bytes === null) throw new Error("Prepared supervised intent is missing");
  const parsed = parseSupervisedRunIntent(parseJson(bytes, "Supervised run intent"));
  assertCanonical(bytes, parsed, "Supervised run intent");
  return parsed;
}

function sameIdentity(left: SupervisorIdentityV2, right: SupervisorIdentityV2): boolean {
  return (
    JSON.stringify(parseSupervisorIdentityV2(left)) ===
    JSON.stringify(parseSupervisorIdentityV2(right))
  );
}

function validatePreparedHandle(prepared: PreparedSupervisedRun): SupervisedRunIntentV1 {
  const intent = readIntent(prepared.paths.intentPath);
  const expectedPaths = deriveSupervisedRunPaths(
    dirname(prepared.paths.runDirectory),
    intent.runKey,
  );
  if (JSON.stringify(expectedPaths) !== JSON.stringify(prepared.paths)) {
    throw new Error("Prepared supervised run paths do not match the immutable intent");
  }
  const digest = digestSupervisedRunIntent(intent);
  if (digest !== prepared.intentDigest || digest !== digestSupervisedRunIntent(prepared.intent)) {
    throw new Error("Prepared supervised run digest does not match the immutable intent");
  }
  return intent;
}

function parseLaunchClaim(value: unknown): LaunchClaimV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Launch claim must be an object");
  }
  const record = value as Record<string, unknown>;
  const expected = ["attemptId", "fence", "intentDigest", "requestedAt", "runKey", "schemaVersion"];
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Launch claim has unknown or missing fields");
  }
  if (
    record.schemaVersion !== LAUNCH_CLAIM_SCHEMA_VERSION ||
    typeof record.runKey !== "string" ||
    typeof record.attemptId !== "string" ||
    !Number.isSafeInteger(record.fence) ||
    typeof record.intentDigest !== "string" ||
    typeof record.requestedAt !== "string"
  ) {
    throw new TypeError("Launch claim fields are invalid");
  }
  const candidate: LaunchClaimV1 = {
    schemaVersion: LAUNCH_CLAIM_SCHEMA_VERSION,
    runKey: record.runKey,
    attemptId: record.attemptId,
    fence: record.fence as number,
    intentDigest: record.intentDigest,
    requestedAt: record.requestedAt,
  };
  // Reuse strict parsers for every field rather than accepting a looser internal marker.
  parseSupervisedRunCancellation({
    schemaVersion: SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
    runKey: candidate.runKey,
    attemptId: candidate.attemptId,
    fence: candidate.fence,
    identityDigest: candidate.intentDigest,
    requestedAt: candidate.requestedAt,
  });
  return candidate;
}

function readLaunchClaim(path: string): LaunchClaimV1 | null {
  const bytes = readPrivateFile(path, MAX_LAUNCH_CLAIM_BYTES);
  if (bytes === null) return null;
  const parsed = parseLaunchClaim(parseJson(bytes, "Launch claim"));
  assertCanonical(bytes, parsed, "Launch claim");
  return parsed;
}

function parseExecutionPermission(value: unknown): ExecutionPermissionV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Execution permission must be an object");
  }
  const record = value as Record<string, unknown>;
  const expected = [
    "attemptId",
    "fence",
    "identityDigest",
    "intentDigest",
    "permittedAt",
    "runKey",
    "schemaVersion",
  ];
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Execution permission has unknown or missing fields");
  }
  if (
    record.schemaVersion !== 1 ||
    typeof record.runKey !== "string" ||
    typeof record.attemptId !== "string" ||
    !Number.isSafeInteger(record.fence) ||
    typeof record.intentDigest !== "string" ||
    typeof record.identityDigest !== "string" ||
    typeof record.permittedAt !== "string"
  ) {
    throw new TypeError("Execution permission fields are invalid");
  }
  const permission: ExecutionPermissionV1 = {
    schemaVersion: 1,
    runKey: record.runKey,
    attemptId: record.attemptId,
    fence: record.fence as number,
    intentDigest: record.intentDigest,
    identityDigest: record.identityDigest,
    permittedAt: record.permittedAt,
  };
  parseSupervisedRunCancellation({
    schemaVersion: SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
    runKey: permission.runKey,
    attemptId: permission.attemptId,
    fence: permission.fence,
    identityDigest: permission.identityDigest,
    requestedAt: permission.permittedAt,
  });
  if (!/^sha256:[0-9a-f]{64}$/u.test(permission.intentDigest)) {
    throw new TypeError("Execution permission intentDigest is invalid");
  }
  return permission;
}

function readExecutionPermission(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
  identity: SupervisorIdentityV2,
): ExecutionPermissionV1 | null {
  const bytes = readPrivateFile(prepared.paths.permissionPath, MAX_LAUNCH_CLAIM_BYTES);
  if (bytes === null) return null;
  const permission = parseExecutionPermission(parseJson(bytes, "Execution permission"));
  assertCanonical(bytes, permission, "Execution permission");
  if (
    permission.runKey !== intent.runKey ||
    permission.attemptId !== intent.attemptId ||
    permission.fence !== intent.fence ||
    permission.intentDigest !== digestSupervisedRunIntent(intent) ||
    permission.identityDigest !== digestSupervisorIdentity(identity)
  ) {
    throw new Error("Execution permission does not bind the intent and target identity");
  }
  return permission;
}

export function publishSupervisedRunExecutionPermission(
  prepared: PreparedSupervisedRun,
  identity: SupervisorIdentityV2,
  permittedAt: string,
): void {
  const intent = validatePreparedHandle(prepared);
  const permission = parseExecutionPermission({
    schemaVersion: 1,
    runKey: intent.runKey,
    attemptId: intent.attemptId,
    fence: intent.fence,
    intentDigest: digestSupervisedRunIntent(intent),
    identityDigest: digestSupervisorIdentity(identity),
    permittedAt,
  });
  createPrivateFileExclusive(prepared.paths.permissionPath, canonicalLine(permission));
}

export function assertSupervisedRunExecutionAuthorized(
  prepared: PreparedSupervisedRun,
  expectedPid: number,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
): SupervisorIdentityV2 {
  if (!Number.isSafeInteger(expectedPid) || expectedPid < 2) {
    throw new TypeError("Expected target PID must be a safe process identifier greater than one");
  }
  const intent = validatePreparedHandle(prepared);
  const identity = readBoundState(prepared, intent);
  if (identity === null || identity.pid !== expectedPid) {
    throw new Error("Target gate PID does not match the durable supervisor identity");
  }
  const validation = validateSupervisorIdentity(identity, probe);
  if (validation.kind !== "match") {
    throw new Error(
      `Target gate identity is not live and does not match its witness: ${validation.kind}`,
    );
  }
  if (readExecutionPermission(prepared, intent, identity) === null) {
    throw new Error("Target gate has no durable execution authorization");
  }
  const controllerIdentity = readBoundControllerState(prepared, intent);
  if (
    controllerIdentity === null ||
    validateSupervisorIdentity(controllerIdentity, probe).kind !== "match"
  ) {
    throw new Error("Target gate cannot prove its detached controller identity");
  }
  return identity;
}

function parseGateRelease(value: unknown): GateReleaseV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Gate release must be an object");
  }
  const record = value as Record<string, unknown>;
  const expected = [
    "attemptId",
    "fence",
    "identityDigest",
    "intentDigest",
    "releasedAt",
    "runKey",
    "schemaVersion",
  ];
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Gate release has unknown or missing fields");
  }
  if (
    record.schemaVersion !== 1 ||
    typeof record.runKey !== "string" ||
    typeof record.attemptId !== "string" ||
    !Number.isSafeInteger(record.fence) ||
    typeof record.intentDigest !== "string" ||
    typeof record.identityDigest !== "string" ||
    typeof record.releasedAt !== "string"
  ) {
    throw new TypeError("Gate release fields are invalid");
  }
  const release: GateReleaseV1 = {
    schemaVersion: 1,
    runKey: record.runKey,
    attemptId: record.attemptId,
    fence: record.fence as number,
    intentDigest: record.intentDigest,
    identityDigest: record.identityDigest,
    releasedAt: record.releasedAt,
  };
  parseSupervisedRunCancellation({
    schemaVersion: SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
    runKey: release.runKey,
    attemptId: release.attemptId,
    fence: release.fence,
    identityDigest: release.identityDigest,
    requestedAt: release.releasedAt,
  });
  if (!/^sha256:[0-9a-f]{64}$/u.test(release.intentDigest)) {
    throw new TypeError("Gate release intentDigest is invalid");
  }
  return release;
}

function readGateRelease(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
  identity: SupervisorIdentityV2,
): GateReleaseV1 | null {
  const bytes = readPrivateFile(prepared.paths.gateReleasePath, MAX_LAUNCH_CLAIM_BYTES);
  if (bytes === null) return null;
  const release = parseGateRelease(parseJson(bytes, "Gate release"));
  assertCanonical(bytes, release, "Gate release");
  if (
    release.runKey !== intent.runKey ||
    release.attemptId !== intent.attemptId ||
    release.fence !== intent.fence ||
    release.intentDigest !== digestSupervisedRunIntent(intent) ||
    release.identityDigest !== digestSupervisorIdentity(identity)
  ) {
    throw new Error("Gate release does not bind the intent and target identity");
  }
  return release;
}

export function publishSupervisedRunGateRelease(
  prepared: PreparedSupervisedRun,
  identity: SupervisorIdentityV2,
  releasedAt: string,
): void {
  const intent = validatePreparedHandle(prepared);
  const release = parseGateRelease({
    schemaVersion: 1,
    runKey: intent.runKey,
    attemptId: intent.attemptId,
    fence: intent.fence,
    intentDigest: digestSupervisedRunIntent(intent),
    identityDigest: digestSupervisorIdentity(identity),
    releasedAt,
  });
  createPrivateFileExclusive(prepared.paths.gateReleasePath, canonicalLine(release));
}

function assertClaimBindsIntent(claim: LaunchClaimV1, intent: SupervisedRunIntentV1): void {
  if (
    claim.runKey !== intent.runKey ||
    claim.attemptId !== intent.attemptId ||
    claim.fence !== intent.fence ||
    claim.intentDigest !== digestSupervisedRunIntent(intent)
  ) {
    throw new Error("Launch claim does not bind the immutable intent");
  }
}

function readReceipt(path: string): SupervisedRunReceiptV1 | null {
  const bytes = readPrivateFile(path, MAX_SUPERVISED_RECEIPT_BYTES);
  if (bytes === null) return null;
  const parsed = parseSupervisedRunReceipt(parseJson(bytes, "Supervised run receipt"));
  assertCanonical(bytes, parsed, "Supervised run receipt");
  return parsed;
}

function assertReceiptBindsIntent(
  receipt: SupervisedRunReceiptV1,
  intent: SupervisedRunIntentV1,
): void {
  if (
    receipt.runKey !== intent.runKey ||
    receipt.attemptId !== intent.attemptId ||
    receipt.fence !== intent.fence ||
    receipt.intentDigest !== digestSupervisedRunIntent(intent) ||
    receipt.invocationDigest !== intent.invocationDigest
  ) {
    throw new Error("Terminal receipt does not bind the immutable intent");
  }
}

function assertSpoolMatches(
  path: string,
  output: SupervisedRunReceiptV1["stdout"],
  maximumBytes: number,
  label: string,
): void {
  const bytes = readPrivateFile(path, maximumBytes);
  if (bytes === null) throw new Error(`${label} spool is missing`);
  if (bytes.byteLength !== output.capturedByteLength || sha256(bytes) !== output.sha256) {
    throw new Error(`${label} spool does not match the terminal receipt`);
  }
}

function verifiedReceipt(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
): SupervisedRunReceiptV1 | null {
  const receipt = readReceipt(prepared.paths.receiptPath);
  if (receipt === null) return null;
  assertReceiptBindsIntent(receipt, intent);
  const permission = readExecutionPermission(prepared, intent, receipt.identity);
  if (permission === null || permission.permittedAt !== receipt.permittedAt) {
    throw new Error("Terminal receipt lacks its exact durable execution permission");
  }
  if (readGateRelease(prepared, intent, receipt.identity) === null) {
    throw new Error("Terminal receipt lacks its durable target-gate release");
  }
  assertSpoolMatches(
    prepared.paths.stdoutPath,
    receipt.stdout,
    intent.limits.maxOutputBytesPerStream,
    "stdout",
  );
  assertSpoolMatches(
    prepared.paths.stderrPath,
    receipt.stderr,
    intent.limits.maxOutputBytesPerStream,
    "stderr",
  );
  return receipt;
}

function readBoundState(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
): SupervisorIdentityV2 | null {
  const state = readSupervisorStateFile(prepared.paths.statePath);
  if (state === null) return null;
  const identity = parseSupervisorIdentityV2(state);
  if (identity.attemptId !== intent.attemptId || identity.fence !== intent.fence) {
    throw new Error("Persisted target identity does not bind the immutable intent");
  }
  return identity;
}

function readBoundControllerState(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
): SupervisorIdentityV2 | null {
  const state = readSupervisorStateFile(prepared.paths.controllerStatePath);
  if (state === null) return null;
  const identity = parseSupervisorIdentityV2(state);
  if (identity.attemptId !== intent.attemptId || identity.fence !== intent.fence) {
    throw new Error("Persisted controller identity does not bind the immutable intent");
  }
  return identity;
}

function readCancellationArtifact(
  prepared: PreparedSupervisedRun,
  intent: SupervisedRunIntentV1,
  identity: SupervisorIdentityV2 | null,
): SupervisedRunCancellationV1 | null {
  let bytes: Buffer | null;
  try {
    bytes = readPrivateFile(prepared.paths.cancellationPath, MAX_SUPERVISED_RECEIPT_BYTES);
  } catch (error) {
    throw new SupervisedRunCancellationArtifactError("unreadable", error);
  }
  if (bytes === null) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new SupervisedRunCancellationArtifactError("malformed", error);
  }

  let cancellation: SupervisedRunCancellationV1;
  try {
    cancellation = parseSupervisedRunCancellation(decoded);
  } catch (error) {
    throw new SupervisedRunCancellationArtifactError("malformed", error);
  }
  if (!bytes.equals(canonicalLine(cancellation))) {
    throw new SupervisedRunCancellationArtifactError("non-canonical");
  }
  if (
    cancellation.runKey !== intent.runKey ||
    cancellation.attemptId !== intent.attemptId ||
    cancellation.fence !== intent.fence
  ) {
    throw new SupervisedRunCancellationArtifactError("intent-mismatch");
  }
  if (identity === null) {
    throw new SupervisedRunCancellationArtifactError("identity-unavailable");
  }
  if (cancellation.identityDigest !== digestSupervisorIdentity(identity)) {
    throw new SupervisedRunCancellationArtifactError("identity-mismatch");
  }
  return cancellation;
}

export function readBoundSupervisedRunCancellation(
  prepared: PreparedSupervisedRun,
  identity: SupervisorIdentityV2,
): SupervisedRunCancellationV1 | null {
  const intent = validatePreparedHandle(prepared);
  return readCancellationArtifact(prepared, intent, parseSupervisorIdentityV2(identity));
}

export function prepareSupervisedRun(
  rootDirectory: string,
  input: CreateSupervisedRunIntentInput,
): PreparedSupervisedRun {
  assertNormalizedAbsolutePath(rootDirectory, "Supervised run root");
  ensurePrivateDirectory(rootDirectory);
  const intent = parseSupervisedRunIntent(createSupervisedRunIntent(input));
  const paths = deriveSupervisedRunPaths(rootDirectory, intent.runKey);
  ensurePrivateDirectory(paths.runDirectory);
  const serialized = canonicalLine(intent);
  let preparation: PreparedSupervisedRun["preparation"] = "created";
  try {
    createPrivateFileExclusive(paths.intentPath, serialized);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = readPrivateFile(paths.intentPath, MAX_SUPERVISED_INTENT_BYTES);
    if (existing === null || !existing.equals(serialized)) {
      throw new Error("Immutable supervised intent already exists with different content", {
        cause: error,
      });
    }
    // Parse the existing bytes again so an idempotent call cannot bless malformed content.
    readIntent(paths.intentPath);
    preparation = "already-prepared";
  }
  return {
    intent,
    intentDigest: digestSupervisedRunIntent(intent),
    paths,
    preparation,
  };
}

export function loadClaimedSupervisedRunForController(intentPath: string): PreparedSupervisedRun {
  assertNormalizedAbsolutePath(intentPath, "Controller intent path");
  if (intentPath.split("/").at(-1) !== INTENT_FILE_NAME) {
    throw new Error("Controller intent path must name the canonical intent artifact");
  }
  const intent = readIntent(intentPath);
  const rootDirectory = dirname(dirname(intentPath));
  const paths = deriveSupervisedRunPaths(rootDirectory, intent.runKey);
  if (paths.intentPath !== intentPath) {
    throw new Error("Controller intent location does not match its run key");
  }
  const claim = readLaunchClaim(paths.launchClaimPath);
  if (claim === null) throw new Error("Controller requires a durable launch claim");
  assertClaimBindsIntent(claim, intent);
  return {
    intent,
    intentDigest: digestSupervisedRunIntent(intent),
    paths,
    preparation: "already-prepared",
  };
}

export function inspectSupervisedRun(
  prepared: PreparedSupervisedRun,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
): SupervisedRunInspection {
  const intent = validatePreparedHandle(prepared);
  const receipt = verifiedReceipt(prepared, intent);
  const state = readBoundState(prepared, intent);
  const controllerState = readBoundControllerState(prepared, intent);
  if (receipt !== null && state !== null && !sameIdentity(state, receipt.identity)) {
    return { state: "blocked", intent, reason: "receipt-state-identity-mismatch" };
  }
  try {
    readCancellationArtifact(prepared, intent, state ?? receipt?.identity ?? null);
  } catch (error) {
    if (error instanceof SupervisedRunCancellationArtifactError) {
      return { state: "blocked", intent, reason: cancellationBlockerReason(error) };
    }
    throw error;
  }
  if (receipt !== null) {
    return {
      state: "terminal",
      intent,
      receipt,
      stateCleanup: state === null && controllerState === null ? "complete" : "pending",
    };
  }
  if (state !== null) {
    const permission = readExecutionPermission(prepared, intent, state);
    const gateRelease = readGateRelease(prepared, intent, state);
    const validation = validateSupervisorIdentity(state, probe);
    if (validation.kind === "match") {
      if (permission === null || gateRelease === null) {
        return {
          state: "blocked",
          intent,
          reason:
            permission === null
              ? "target-registered-without-durable-execution-permission"
              : "target-authorized-without-durable-gate-release",
        };
      }
      if (controllerState === null) {
        return {
          state: "blocked",
          intent,
          reason: "controller-state-missing-with-live-target",
        };
      }
      const controllerValidation = validateSupervisorIdentity(controllerState, probe);
      if (controllerValidation.kind !== "match") {
        return {
          state: "blocked",
          intent,
          reason:
            controllerValidation.kind === "not-running"
              ? "controller-exited-with-live-target"
              : controllerValidation.kind === "mismatch"
                ? `controller-identity-mismatch:${controllerValidation.reason}`
                : controllerValidation.kind === "orphaned-group"
                  ? "controller-leader-exited-with-live-group"
                  : `controller-identity-unprovable:${controllerValidation.reason}`,
        };
      }
      return { state: "live", intent, identity: state };
    }
    if (validation.kind === "not-running") {
      return { state: "blocked", intent, reason: "target-exited-without-terminal-receipt" };
    }
    if (validation.kind === "orphaned-group") {
      return { state: "blocked", intent, reason: "leader-exited-with-live-witnessed-group" };
    }
    return {
      state: "blocked",
      intent,
      reason:
        validation.kind === "mismatch"
          ? `target-identity-mismatch:${validation.reason}`
          : `target-identity-unprovable:${validation.reason}`,
    };
  }
  const claim = readLaunchClaim(prepared.paths.launchClaimPath);
  if (claim === null) return { state: "prepared", intent };
  assertClaimBindsIntent(claim, intent);
  return {
    state: "launch-pending-or-ambiguous",
    intent,
    reason: "launch-claimed-without-proven-target-or-receipt",
  };
}

export function launchPreparedSupervisedRun(
  prepared: PreparedSupervisedRun,
  options: LaunchSupervisedRunOptions = {},
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
): LaunchSupervisedRunResult {
  const initial = inspectSupervisedRun(prepared, probe);
  if (initial.state === "terminal") {
    return { outcome: "already-terminal", receipt: initial.receipt };
  }
  if (initial.state === "live") {
    return { outcome: "already-live", identity: initial.identity };
  }
  if (initial.state !== "prepared") {
    return { outcome: "blocked", reason: initial.reason };
  }

  const intent = initial.intent;
  const claim: LaunchClaimV1 = {
    schemaVersion: LAUNCH_CLAIM_SCHEMA_VERSION,
    runKey: intent.runKey,
    attemptId: intent.attemptId,
    fence: intent.fence,
    intentDigest: digestSupervisedRunIntent(intent),
    requestedAt: (options.wallClock?.() ?? new Date()).toISOString(),
  };
  // Validate every claim field before it becomes the durable one-shot launch authorization.
  parseLaunchClaim(claim);
  try {
    createPrivateFileExclusive(prepared.paths.launchClaimPath, canonicalLine(claim));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return {
        outcome: "blocked",
        reason: "launch-already-claimed; inspect state and receipt before operator recovery",
      };
    }
    throw error;
  }

  const controllerEntrypointPath =
    options.controllerEntrypointPath ??
    fileURLToPath(new URL("./supervised-entrypoint.js", import.meta.url));
  assertNormalizedAbsolutePath(controllerEntrypointPath, "Controller entrypoint");
  const spawnController =
    options.spawnController ??
    ((executable, argv, spawnOptions) =>
      spawn(executable, [...argv], {
        cwd: spawnOptions.cwd,
        detached: spawnOptions.detached,
        env: { ...spawnOptions.env },
        stdio: spawnOptions.stdio,
      }));
  let controller: Pick<ChildProcess, "pid" | "unref" | "exitCode" | "signalCode">;
  try {
    controller = spawnController(
      process.execPath,
      [controllerEntrypointPath, "controller", prepared.paths.intentPath],
      {
        cwd: prepared.paths.runDirectory,
        detached: true,
        env: {},
        stdio: "ignore",
      },
    );
  } catch (error) {
    return {
      outcome: "blocked",
      reason: `controller-launch-failed-after-durable-claim:${(error as Error).message}`,
    };
  }
  if (controller.pid === undefined || controller.pid < 2) {
    return { outcome: "blocked", reason: "controller-launch-returned-no-valid-pid-after-claim" };
  }
  controller.unref();
  const controllerPid = controller.pid;
  return {
    outcome: "launch-requested",
    controllerPid,
    registration: {
      controllerPid,
      hasExited: () => controller.exitCode !== null || controller.signalCode !== null,
    },
  };
}

export async function waitForSupervisedRunRegistration(
  prepared: PreparedSupervisedRun,
  registration: LocalSupervisedControllerRegistration,
  options: Readonly<{
    timeoutMs?: number;
    pollMs?: number;
    clock?: Pick<SupervisorClock, "now" | "sleep">;
  }> = {},
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
): Promise<WaitForSupervisedRunRegistrationResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const pollMs = options.pollMs ?? 10;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) {
    throw new RangeError("registration timeoutMs must be an integer from 0 through 60000");
  }
  if (!Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 1_000) {
    throw new RangeError("registration pollMs must be an integer from 1 through 1000");
  }
  if (!Number.isSafeInteger(registration.controllerPid) || registration.controllerPid < 2) {
    throw new TypeError("Local controller registration has an invalid PID");
  }
  const clock =
    options.clock ??
    ({
      now: () => performance.now(),
      sleep: async (milliseconds: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, milliseconds);
        }),
    } satisfies Pick<SupervisorClock, "now" | "sleep">);
  const deadline = clock.now() + timeoutMs;
  do {
    const inspection = inspectSupervisedRun(prepared, probe);
    if (inspection.state === "live") {
      return { outcome: "registered", identity: inspection.identity };
    }
    if (inspection.state === "terminal") {
      return { outcome: "terminal", receipt: inspection.receipt };
    }
    if (inspection.state === "blocked") {
      if (
        inspection.reason !== "target-registered-without-durable-execution-permission" &&
        inspection.reason !== "target-authorized-without-durable-gate-release" &&
        inspection.reason !== "target-exited-without-terminal-receipt"
      ) {
        return { outcome: "blocked", reason: inspection.reason };
      }
    }
    if (inspection.state === "prepared") {
      return { outcome: "blocked", reason: "durable-launch-claim-disappeared" };
    }
    // A local ChildProcess can report exit just before the controller's
    // fsynced terminal receipt becomes visible to this process. Keep polling
    // the durable state through the registration deadline; returning on the
    // in-memory exit observation creates an infinite relaunch loop across
    // successive scheduler fences for very short-lived targets.
    await clock.sleep(Math.min(pollMs, Math.max(0, deadline - clock.now())));
  } while (clock.now() < deadline);
  return {
    outcome: "blocked",
    reason: registration.hasExited()
      ? "controller-exited-before-target-registration-or-terminal-receipt"
      : "controller-registration-deadline-expired; restart reconciliation must not relaunch",
  };
}

export function reconcileSupervisedRun(
  prepared: PreparedSupervisedRun,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
): ReconcileSupervisedRunResult {
  const inspection = inspectSupervisedRun(prepared, probe);
  if (inspection.state === "prepared") return { outcome: "prepared" };
  if (inspection.state === "live") {
    return { outcome: "adopted", identity: inspection.identity };
  }
  if (inspection.state !== "terminal") {
    return { outcome: "blocked", reason: inspection.reason };
  }
  if (inspection.stateCleanup === "complete") {
    return { outcome: "terminal", receipt: inspection.receipt, stateRemoved: false };
  }
  const targetState = readBoundState(prepared, inspection.intent);
  const controllerState = readBoundControllerState(prepared, inspection.intent);
  for (const [label, identity] of [
    ["target", targetState],
    ["controller", controllerState],
  ] as const) {
    if (identity === null) continue;
    const validation = validateSupervisorIdentity(identity, probe);
    if (validation.kind !== "not-running") {
      return {
        outcome: "blocked",
        reason:
          validation.kind === "match" || validation.kind === "orphaned-group"
            ? `terminal-receipt-exists-but-${label}-process-group-is-still-live`
            : validation.kind === "mismatch"
              ? `terminal-${label}-cleanup-identity-mismatch:${validation.reason}`
              : `terminal-${label}-cleanup-identity-unprovable:${validation.reason}`,
      };
    }
  }
  try {
    let stateRemoved = false;
    if (targetState !== null) {
      stateRemoved =
        removeSupervisorStateFile(prepared.paths.statePath, targetState) || stateRemoved;
    }
    if (controllerState !== null) {
      stateRemoved =
        removeSupervisorStateFile(prepared.paths.controllerStatePath, controllerState) ||
        stateRemoved;
    }
    return {
      outcome: "terminal",
      receipt: inspection.receipt,
      stateRemoved,
    };
  } catch (error) {
    return {
      outcome: "blocked",
      reason: `terminal-state-cleanup-failed:${(error as Error).message}; operator must verify the mutation lock and process identity`,
    };
  }
}

export async function requestSupervisedRunTermination(
  prepared: PreparedSupervisedRun,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
  clock?: SupervisorClock,
): Promise<RequestSupervisedRunTerminationResult> {
  const inspection = inspectSupervisedRun(prepared, probe);
  if (inspection.state === "terminal") {
    return { outcome: "already-terminal", receipt: inspection.receipt };
  }
  let terminationIntent: SupervisedRunIntentV1;
  let terminationIdentity: SupervisorIdentityV2;
  let liveControllerOwnsSignaling: boolean;
  if (inspection.state === "live") {
    terminationIntent = inspection.intent;
    terminationIdentity = inspection.identity;
    liveControllerOwnsSignaling = true;
  } else if (
    inspection.state === "blocked" &&
    (inspection.reason === "target-registered-without-durable-execution-permission" ||
      inspection.reason === "target-authorized-without-durable-gate-release" ||
      inspection.reason === "controller-state-missing-with-live-target" ||
      inspection.reason === "controller-exited-with-live-target" ||
      inspection.reason === "controller-leader-exited-with-live-group" ||
      inspection.reason.startsWith("controller-identity-mismatch:") ||
      inspection.reason.startsWith("controller-identity-unprovable:"))
  ) {
    terminationIntent = inspection.intent;
    const state = readBoundState(prepared, terminationIntent);
    if (state === null || validateSupervisorIdentity(state, probe).kind !== "match") {
      return {
        outcome: "blocked",
        reason: "incomplete-launch-target-does-not-match-its-persisted-witness",
      };
    }
    terminationIdentity = state;
    const controllerState = readBoundControllerState(prepared, terminationIntent);
    liveControllerOwnsSignaling =
      controllerState !== null &&
      validateSupervisorIdentity(controllerState, probe).kind === "match";
  } else {
    if (inspection.state === "prepared") {
      return { outcome: "not-running", reason: "run-has-not-been-launched" };
    }
    return { outcome: "blocked", reason: inspection.reason };
  }
  const cancellation: SupervisedRunCancellationV1 = parseSupervisedRunCancellation({
    schemaVersion: SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
    runKey: terminationIntent.runKey,
    attemptId: terminationIntent.attemptId,
    fence: terminationIntent.fence,
    identityDigest: digestSupervisorIdentity(terminationIdentity),
    requestedAt: new Date().toISOString(),
  });
  try {
    createPrivateFileExclusive(prepared.paths.cancellationPath, canonicalLine(cancellation));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      if (readBoundSupervisedRunCancellation(prepared, terminationIdentity) === null) {
        return { outcome: "blocked", reason: "cancellation-artifact-disappeared-after-conflict" };
      }
    } catch (cancellationError) {
      if (cancellationError instanceof SupervisedRunCancellationArtifactError) {
        return { outcome: "blocked", reason: cancellationBlockerReason(cancellationError) };
      }
      throw cancellationError;
    }
  }
  let termination: TerminationResult;
  if (liveControllerOwnsSignaling) {
    return {
      outcome: "termination-requested",
      cancellation,
      termination: {
        outcome: "blocked",
        forced: false,
        reason: "durable-cancellation-published; live controller owns identity-safe signaling",
      },
    };
  }
  try {
    termination = await terminateProcessGroup(
      terminationIdentity,
      probe,
      {
        graceMs: terminationIntent.limits.graceMs,
        forceWaitMs: terminationIntent.limits.forceWaitMs,
        pollMs: terminationIntent.limits.pollMs,
      },
      clock,
    );
  } catch (error) {
    // The durable, identity-bound cancellation remains authoritative for the controller even when
    // this caller cannot signal across a platform/session boundary. Never erase it or retry launch.
    termination = {
      outcome: "blocked",
      forced: false,
      reason: `caller-signal-failed:${(error as NodeJS.ErrnoException).code ?? "unknown"}`,
    };
  }
  return { outcome: "termination-requested", cancellation, termination };
}

export const SUPERVISED_RUN_ARTIFACT_NAMES = Object.freeze({
  intent: INTENT_FILE_NAME,
  launchClaim: LAUNCH_CLAIM_FILE_NAME,
  state: STATE_FILE_NAME,
  controllerState: CONTROLLER_STATE_FILE_NAME,
  permission: PERMISSION_FILE_NAME,
  gateRelease: GATE_RELEASE_FILE_NAME,
  stdout: STDOUT_FILE_NAME,
  stderr: STDERR_FILE_NAME,
  cancellation: CANCELLATION_FILE_NAME,
  receipt: RECEIPT_FILE_NAME,
});
