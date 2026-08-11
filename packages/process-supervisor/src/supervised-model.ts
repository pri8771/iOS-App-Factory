import { createHash } from "node:crypto";

import { parseSupervisorIdentityV2, type SupervisorIdentityV2 } from "./model.js";
import { assertNormalizedAbsolutePath } from "./secure-artifacts.js";

export const SUPERVISED_RUN_INTENT_SCHEMA_VERSION = 1 as const;
export const SUPERVISED_RUN_RECEIPT_SCHEMA_VERSION = 1 as const;
export const SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION = 1 as const;
export const MAX_SUPERVISED_INTENT_BYTES = 2_097_152;
export const MAX_SUPERVISED_RECEIPT_BYTES = 65_536;
export const MAX_SUPERVISED_STDIN_BYTES = 1_048_576;
export const MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM = 16_777_216;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RUN_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const CREDENTIAL_NAME_PATTERN = /(?:AUTH|CREDENTIAL|PASSWORD|PRIVATE|SECRET|TOKEN|API_?KEY)/iu;
const CREDENTIAL_ARGUMENT_PATTERN =
  /^(?:--)?(?:api[-_]?key|auth|credential|password|private[-_]?key|secret|token)(?:$|=|:)/iu;

const INTENT_KEYS = [
  "argv",
  "attemptId",
  "createdAt",
  "cwd",
  "environment",
  "executable",
  "fence",
  "invocationDigest",
  "limits",
  "runKey",
  "schemaVersion",
  "stdin",
] as const;
const LIMIT_KEYS = [
  "forceWaitMs",
  "graceMs",
  "maxOutputBytesPerStream",
  "pollMs",
  "timeoutMs",
] as const;
const STDIN_KEYS = ["base64", "byteLength", "sha256"] as const;
const ENVIRONMENT_KEYS = ["name", "value"] as const;
const RECEIPT_KEYS = [
  "attemptId",
  "controllerStartedAt",
  "fence",
  "finishedAt",
  "identity",
  "intentDigest",
  "invocationDigest",
  "outcome",
  "permittedAt",
  "process",
  "runKey",
  "schemaVersion",
  "stderr",
  "stdout",
  "targetRegisteredAt",
  "terminationOrigin",
] as const;
const PROCESS_RESULT_KEYS = ["exitCode", "signal"] as const;
const OUTPUT_KEYS = ["capturedByteLength", "observedByteLength", "sha256", "truncated"] as const;
const CANCELLATION_KEYS = [
  "attemptId",
  "fence",
  "identityDigest",
  "requestedAt",
  "runKey",
  "schemaVersion",
] as const;

export type SupervisedEnvironmentEntryV1 = Readonly<{ name: string; value: string }>;
export type SupervisedStdinV1 = Readonly<{
  byteLength: number;
  sha256: string;
  base64: string;
}>;
export type SupervisedRunLimitsV1 = Readonly<{
  timeoutMs: number;
  graceMs: number;
  forceWaitMs: number;
  pollMs: number;
  maxOutputBytesPerStream: number;
}>;
export type SupervisedRunIntentV1 = Readonly<{
  schemaVersion: typeof SUPERVISED_RUN_INTENT_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  fence: number;
  createdAt: string;
  invocationDigest: string;
  executable: string;
  argv: readonly string[];
  cwd: string;
  environment: readonly SupervisedEnvironmentEntryV1[];
  stdin: SupervisedStdinV1;
  limits: SupervisedRunLimitsV1;
}>;

export type SupervisedRunOutputV1 = Readonly<{
  capturedByteLength: number;
  observedByteLength: number;
  sha256: string;
  truncated: boolean;
}>;
export type SupervisedRunReceiptV1 = Readonly<{
  schemaVersion: typeof SUPERVISED_RUN_RECEIPT_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  fence: number;
  intentDigest: string;
  invocationDigest: string;
  controllerStartedAt: string;
  targetRegisteredAt: string;
  permittedAt: string;
  finishedAt: string;
  identity: SupervisorIdentityV2;
  process: Readonly<{ exitCode: number | null; signal: string | null }>;
  terminationOrigin: "natural" | "timeout" | "output-overflow" | "cancellation" | "external";
  outcome: "succeeded" | "failed" | "timed-out" | "output-overflow" | "cancelled";
  stdout: SupervisedRunOutputV1;
  stderr: SupervisedRunOutputV1;
}>;

export type SupervisedRunCancellationV1 = Readonly<{
  schemaVersion: typeof SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  fence: number;
  identityDigest: string;
  requestedAt: string;
}>;

export type CreateSupervisedRunIntentInput = Readonly<{
  runKey: string;
  attemptId: string;
  fence: number;
  createdAt: string;
  executable: string;
  argv?: readonly string[];
  cwd: string;
  environment?: Readonly<Record<string, string>>;
  stdin?: Uint8Array;
  limits?: Partial<SupervisedRunLimitsV1>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function parseTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function parseDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function parseBoundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(
      `${label} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return value as number;
}

function parseIdentityFields(value: Record<string, unknown>): {
  runKey: string;
  attemptId: string;
  fence: number;
} {
  const runKey = parseSupervisedRunKey(value.runKey);
  if (typeof value.attemptId !== "string" || !UUID_PATTERN.test(value.attemptId)) {
    throw new TypeError("attemptId must be a lowercase canonical UUID");
  }
  return {
    runKey,
    attemptId: value.attemptId,
    fence: parseNonNegativeInteger(value.fence, "fence"),
  };
}

export function parseSupervisedRunKey(value: unknown): string {
  if (typeof value !== "string" || !RUN_KEY_PATTERN.test(value)) {
    throw new TypeError("runKey must be a lowercase path-safe identifier");
  }
  return value;
}

function parseSingleLine(value: unknown, label: string, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new TypeError(`${label} must be a bounded single-line string without NUL`);
  }
  return value;
}

function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseEnvironment(value: unknown): readonly SupervisedEnvironmentEntryV1[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw new TypeError("environment must be an array of at most 128 entries");
  }
  let totalBytes = 0;
  let priorName: string | null = null;
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new TypeError(`environment[${String(index)}] must be an object`);
    assertExactKeys(entry, ENVIRONMENT_KEYS, `environment[${String(index)}]`);
    if (typeof entry.name !== "string" || !ENVIRONMENT_NAME_PATTERN.test(entry.name)) {
      throw new TypeError(`environment[${String(index)}].name is invalid`);
    }
    if (CREDENTIAL_NAME_PATTERN.test(entry.name)) {
      throw new TypeError(
        `environment[${String(index)}].name is credential-like; supervised intents accept only nonsecret environment values`,
      );
    }
    const environmentValue = parseSingleLine(
      entry.value,
      `environment[${String(index)}].value`,
      32_768,
    );
    if (priorName !== null && entry.name <= priorName) {
      throw new TypeError("environment entries must have unique names in lexical order");
    }
    priorName = entry.name;
    totalBytes += Buffer.byteLength(entry.name) + Buffer.byteLength(environmentValue);
    if (totalBytes > 262_144) throw new TypeError("environment exceeds its byte limit");
    return { name: entry.name, value: environmentValue };
  });
}

function parseArgv(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 256) {
    throw new TypeError("argv must be an array of at most 256 entries");
  }
  let totalBytes = 0;
  const argv = value.map((entry, index) => {
    const argument = parseSingleLine(entry, `argv[${String(index)}]`, 8_192);
    totalBytes += Buffer.byteLength(argument);
    if (totalBytes > 131_072) throw new TypeError("argv exceeds its byte limit");
    if (CREDENTIAL_ARGUMENT_PATTERN.test(argument)) {
      throw new TypeError("credentials must not be placed in argv");
    }
    return argument;
  });
  return argv;
}

function parseStdin(value: unknown): SupervisedStdinV1 {
  if (!isRecord(value)) throw new TypeError("stdin must be an object");
  assertExactKeys(value, STDIN_KEYS, "stdin");
  const byteLength = parseBoundedInteger(
    value.byteLength,
    "stdin.byteLength",
    0,
    MAX_SUPERVISED_STDIN_BYTES,
  );
  const digest = parseDigest(value.sha256, "stdin.sha256");
  if (typeof value.base64 !== "string" || value.base64.length > 1_398_104) {
    throw new TypeError("stdin.base64 must be bounded base64 text");
  }
  const bytes = Buffer.from(value.base64, "base64");
  if (bytes.toString("base64") !== value.base64) {
    throw new TypeError("stdin.base64 must use canonical padded base64 encoding");
  }
  if (bytes.byteLength !== byteLength || sha256(bytes) !== digest) {
    throw new TypeError("stdin bytes do not match their declared length and digest");
  }
  return { byteLength, sha256: digest, base64: value.base64 };
}

function parseLimits(value: unknown): SupervisedRunLimitsV1 {
  if (!isRecord(value)) throw new TypeError("limits must be an object");
  assertExactKeys(value, LIMIT_KEYS, "limits");
  return {
    timeoutMs: parseBoundedInteger(value.timeoutMs, "limits.timeoutMs", 1, 86_400_000),
    graceMs: parseBoundedInteger(value.graceMs, "limits.graceMs", 0, 60_000),
    forceWaitMs: parseBoundedInteger(value.forceWaitMs, "limits.forceWaitMs", 0, 60_000),
    pollMs: parseBoundedInteger(value.pollMs, "limits.pollMs", 1, 1_000),
    maxOutputBytesPerStream: parseBoundedInteger(
      value.maxOutputBytesPerStream,
      "limits.maxOutputBytesPerStream",
      1,
      MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM,
    ),
  };
}

function invocationProjection(intent: Omit<SupervisedRunIntentV1, "invocationDigest">): unknown {
  return {
    executable: intent.executable,
    argv: intent.argv,
    cwd: intent.cwd,
    environment: intent.environment,
    stdin: { byteLength: intent.stdin.byteLength, sha256: intent.stdin.sha256 },
  };
}

export function computeSupervisedInvocationDigest(
  intent: Omit<SupervisedRunIntentV1, "invocationDigest">,
): string {
  return sha256(JSON.stringify(invocationProjection(intent)));
}

export function digestSupervisedRunIntent(intent: SupervisedRunIntentV1): string {
  return sha256(`${JSON.stringify(parseSupervisedRunIntent(intent))}\n`);
}

export function digestSupervisorIdentity(identity: SupervisorIdentityV2): string {
  return sha256(JSON.stringify(parseSupervisorIdentityV2(identity)));
}

export function parseSupervisedRunIntent(value: unknown): SupervisedRunIntentV1 {
  if (!isRecord(value)) throw new TypeError("Supervised run intent must be an object");
  assertExactKeys(value, INTENT_KEYS, "Supervised run intent");
  if (value.schemaVersion !== SUPERVISED_RUN_INTENT_SCHEMA_VERSION) {
    throw new TypeError("Unsupported supervised run intent schema version");
  }
  const identityFields = parseIdentityFields(value);
  const environment = parseEnvironment(value.environment);
  const argv = parseArgv(value.argv);
  const executable = parseSingleLine(value.executable, "executable", 4_096);
  const cwd = parseSingleLine(value.cwd, "cwd", 4_096);
  assertNormalizedAbsolutePath(executable, "executable");
  assertNormalizedAbsolutePath(cwd, "cwd");
  const withoutDigest: Omit<SupervisedRunIntentV1, "invocationDigest"> = {
    schemaVersion: SUPERVISED_RUN_INTENT_SCHEMA_VERSION,
    ...identityFields,
    createdAt: parseTimestamp(value.createdAt, "createdAt"),
    executable,
    argv,
    cwd,
    environment,
    stdin: parseStdin(value.stdin),
    limits: parseLimits(value.limits),
  };
  const invocationDigest = parseDigest(value.invocationDigest, "invocationDigest");
  if (computeSupervisedInvocationDigest(withoutDigest) !== invocationDigest) {
    throw new TypeError("invocationDigest does not bind the supervised invocation");
  }
  return { ...withoutDigest, invocationDigest };
}

export function createSupervisedRunIntent(
  input: CreateSupervisedRunIntentInput,
): SupervisedRunIntentV1 {
  const bytes = Buffer.from(input.stdin ?? new Uint8Array());
  const environment = Object.entries(input.environment ?? {})
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => ({ name, value }));
  const withoutDigest: Omit<SupervisedRunIntentV1, "invocationDigest"> = {
    schemaVersion: SUPERVISED_RUN_INTENT_SCHEMA_VERSION,
    runKey: input.runKey,
    attemptId: input.attemptId,
    fence: input.fence,
    createdAt: input.createdAt,
    executable: input.executable,
    argv: [...(input.argv ?? [])],
    cwd: input.cwd,
    environment,
    stdin: {
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      base64: bytes.toString("base64"),
    },
    limits: {
      timeoutMs: input.limits?.timeoutMs ?? 900_000,
      graceMs: input.limits?.graceMs ?? 5_000,
      forceWaitMs: input.limits?.forceWaitMs ?? 2_000,
      pollMs: input.limits?.pollMs ?? 25,
      maxOutputBytesPerStream: input.limits?.maxOutputBytesPerStream ?? 1_048_576,
    },
  };
  return parseSupervisedRunIntent({
    ...withoutDigest,
    invocationDigest: computeSupervisedInvocationDigest(withoutDigest),
  });
}

function parseOutput(value: unknown, label: string): SupervisedRunOutputV1 {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  assertExactKeys(value, OUTPUT_KEYS, label);
  const capturedByteLength = parseBoundedInteger(
    value.capturedByteLength,
    `${label}.capturedByteLength`,
    0,
    MAX_SUPERVISED_OUTPUT_BYTES_PER_STREAM,
  );
  const observedByteLength = parseNonNegativeInteger(
    value.observedByteLength,
    `${label}.observedByteLength`,
  );
  if (observedByteLength < capturedByteLength) {
    throw new TypeError(`${label}.observedByteLength must cover captured bytes`);
  }
  if (typeof value.truncated !== "boolean") {
    throw new TypeError(`${label}.truncated must be a boolean`);
  }
  if (value.truncated !== observedByteLength > capturedByteLength) {
    throw new TypeError(`${label}.truncated must match the output lengths`);
  }
  return {
    capturedByteLength,
    observedByteLength,
    sha256: parseDigest(value.sha256, `${label}.sha256`),
    truncated: value.truncated,
  };
}

export function parseSupervisedRunReceipt(value: unknown): SupervisedRunReceiptV1 {
  if (!isRecord(value)) throw new TypeError("Supervised run receipt must be an object");
  assertExactKeys(value, RECEIPT_KEYS, "Supervised run receipt");
  if (value.schemaVersion !== SUPERVISED_RUN_RECEIPT_SCHEMA_VERSION) {
    throw new TypeError("Unsupported supervised run receipt schema version");
  }
  const identityFields = parseIdentityFields(value);
  const identity = parseSupervisorIdentityV2(value.identity);
  if (identity.attemptId !== identityFields.attemptId || identity.fence !== identityFields.fence) {
    throw new TypeError("Receipt identity does not match its attempt and fence");
  }
  if (!isRecord(value.process)) throw new TypeError("process must be an object");
  assertExactKeys(value.process, PROCESS_RESULT_KEYS, "process");
  const exitCode =
    value.process.exitCode === null
      ? null
      : parseBoundedInteger(value.process.exitCode, "process.exitCode", 0, 255);
  const signal =
    value.process.signal === null
      ? null
      : parseSingleLine(value.process.signal, "process.signal", 32);
  if ((exitCode === null) === (signal === null)) {
    throw new TypeError("process must contain exactly one of exitCode or signal");
  }
  if (signal !== null && !/^SIG[A-Z0-9]+$/u.test(signal)) {
    throw new TypeError("process.signal must be a signal name");
  }
  const terminationOrigins = [
    "natural",
    "timeout",
    "output-overflow",
    "cancellation",
    "external",
  ] as const;
  const outcomes = ["succeeded", "failed", "timed-out", "output-overflow", "cancelled"] as const;
  if (
    !terminationOrigins.includes(value.terminationOrigin as (typeof terminationOrigins)[number])
  ) {
    throw new TypeError("terminationOrigin is unsupported");
  }
  if (!outcomes.includes(value.outcome as (typeof outcomes)[number])) {
    throw new TypeError("outcome is unsupported");
  }
  const terminationOrigin = value.terminationOrigin as (typeof terminationOrigins)[number];
  const outcome = value.outcome as (typeof outcomes)[number];
  const expectedOutcome =
    terminationOrigin === "timeout"
      ? "timed-out"
      : terminationOrigin === "output-overflow"
        ? "output-overflow"
        : terminationOrigin === "cancellation"
          ? "cancelled"
          : exitCode === 0
            ? "succeeded"
            : "failed";
  if (outcome !== expectedOutcome) {
    throw new TypeError("outcome does not match process result and termination origin");
  }
  const controllerStartedAt = parseTimestamp(value.controllerStartedAt, "controllerStartedAt");
  const targetRegisteredAt = parseTimestamp(value.targetRegisteredAt, "targetRegisteredAt");
  const permittedAt = parseTimestamp(value.permittedAt, "permittedAt");
  const finishedAt = parseTimestamp(value.finishedAt, "finishedAt");
  const orderedTimes = [controllerStartedAt, targetRegisteredAt, permittedAt, finishedAt].map(
    (item) => Date.parse(item),
  );
  if (orderedTimes.some((item, index) => index > 0 && item < (orderedTimes[index - 1] ?? 0))) {
    throw new TypeError("Receipt timestamps must be monotonic");
  }
  return {
    schemaVersion: SUPERVISED_RUN_RECEIPT_SCHEMA_VERSION,
    ...identityFields,
    intentDigest: parseDigest(value.intentDigest, "intentDigest"),
    invocationDigest: parseDigest(value.invocationDigest, "invocationDigest"),
    controllerStartedAt,
    targetRegisteredAt,
    permittedAt,
    finishedAt,
    identity,
    process: { exitCode, signal },
    terminationOrigin,
    outcome,
    stdout: parseOutput(value.stdout, "stdout"),
    stderr: parseOutput(value.stderr, "stderr"),
  };
}

export function parseSupervisedRunCancellation(value: unknown): SupervisedRunCancellationV1 {
  if (!isRecord(value)) throw new TypeError("Supervised cancellation must be an object");
  assertExactKeys(value, CANCELLATION_KEYS, "Supervised cancellation");
  if (value.schemaVersion !== SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION) {
    throw new TypeError("Unsupported supervised cancellation schema version");
  }
  return {
    schemaVersion: SUPERVISED_RUN_CANCELLATION_SCHEMA_VERSION,
    ...parseIdentityFields(value),
    identityDigest: parseDigest(value.identityDigest, "identityDigest"),
    requestedAt: parseTimestamp(value.requestedAt, "requestedAt"),
  };
}
