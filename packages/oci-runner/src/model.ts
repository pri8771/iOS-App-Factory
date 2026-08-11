import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

export const OCI_RUN_INTENT_SCHEMA_VERSION = 1 as const;
export const OCI_RUN_RECEIPT_SCHEMA_VERSION = 1 as const;
export const OCI_WORKSPACE_PATH = "/workspace" as const;
export const OCI_PRIVATE_TMPFS_PATH = "/run/app-factory" as const;
export const MAX_OCI_OUTPUT_BYTES = 16 * 1024 * 1024;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const GIT_OBJECT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RUN_KEY = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const IMAGE_REFERENCE = /^[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$/u;
const CONTAINER_ID = /^[0-9a-f]{64}$/u;
const ALLOWED_ENVIRONMENT_VALUES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["LANG", new Set(["C", "C.UTF-8"])],
  ["LC_ALL", new Set(["C", "C.UTF-8"])],
  ["NODE_VERSION", new Set(["22.23.1"])],
  [
    "PATH",
    new Set([
      "/usr/bin:/bin",
      "/usr/local/bin:/usr/bin:/bin",
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    ]),
  ],
  ["TZ", new Set(["UTC"])],
  ["YARN_VERSION", new Set(["1.22.22"])],
]);

export type OciRunLimitsV1 = Readonly<{
  cpuCount: number;
  memoryBytes: number;
  pidLimit: number;
  outputBytesPerStream: number;
  wallTimeMs: number;
  stopGraceMs: number;
  privateTmpfsBytes: number;
}>;

export type OciImageIdentityV1 = Readonly<{
  reference: string;
  imageId: string;
}>;

export type OciRunIntentV1 = Readonly<{
  schemaVersion: typeof OCI_RUN_INTENT_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  createdAt: string;
  taskSpecDigest: string;
  policyDigest: string;
  baseCommit: string;
  baseTree: string;
  containerName: string;
  image: OciImageIdentityV1;
  worktreeHostPath: string;
  worktreeContainerPath: typeof OCI_WORKSPACE_PATH;
  privateTmpfsPath: typeof OCI_PRIVATE_TMPFS_PATH;
  networkMode: "none";
  readOnlyRootFilesystem: true;
  agentExecutable: string;
  agentArguments: readonly string[];
  environment: readonly Readonly<{ name: string; value: string }>[];
  limits: OciRunLimitsV1;
}>;

export type OciCapturedOutputV1 = Readonly<{
  digest: string;
  capturedByteLength: number;
  observedByteLength: number;
  truncated: boolean;
}>;

export type OciRunReceiptV1 = Readonly<{
  schemaVersion: typeof OCI_RUN_RECEIPT_SCHEMA_VERSION;
  runKey: string;
  attemptId: string;
  runId: string;
  fence: number;
  intentDigest: string;
  containerId: string;
  imageId: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  removedAt: string;
  terminalInspectionDigest: string;
  removalEvidenceDigest: string;
  outcome: "succeeded" | "failed" | "timed-out" | "output-overflow" | "cancelled";
  terminationOrigin: "natural" | "wall-time" | "output-overflow" | "cancellation";
  exitCode: number | null;
  oomKilled: boolean;
  stdout: OciCapturedOutputV1;
  stderr: OciCapturedOutputV1;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function text(value: unknown, label: string, maximum = 8_192): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new TypeError(`${label} must be a bounded single-line string`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(
      `${label} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return value as number;
}

function absolutePath(value: unknown, label: string): string {
  const path = text(value, label);
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new TypeError(`${label} must be a normalized absolute path`);
  }
  return path;
}

function digest(value: unknown, label: string): string {
  const parsed = text(value, label, 71);
  if (!DIGEST.test(parsed)) throw new TypeError(`${label} must be a SHA-256 digest`);
  return parsed;
}

function uuid(value: unknown, label: string): string {
  const parsed = text(value, label, 36);
  if (!UUID.test(parsed)) throw new TypeError(`${label} must be a UUID`);
  return parsed;
}

function runKey(value: unknown): string {
  const parsed = text(value, "runKey", 128);
  if (!RUN_KEY.test(parsed)) throw new TypeError("runKey must be path-safe");
  return parsed;
}

function instant(value: unknown, label: string): string {
  const parsed = text(value, label, 24);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(parsed) ||
    Number.isNaN(Date.parse(parsed))
  ) {
    throw new TypeError(`${label} must be a canonical UTC instant`);
  }
  return parsed;
}

function parseLimits(value: unknown): OciRunLimitsV1 {
  const input = record(value, "OCI limits");
  exactKeys(
    input,
    [
      "cpuCount",
      "memoryBytes",
      "outputBytesPerStream",
      "pidLimit",
      "privateTmpfsBytes",
      "stopGraceMs",
      "wallTimeMs",
    ],
    "OCI limits",
  );
  return {
    cpuCount: integer(input.cpuCount, "cpuCount", 1, 16),
    memoryBytes: integer(
      input.memoryBytes,
      "memoryBytes",
      256 * 1024 * 1024,
      32 * 1024 * 1024 * 1024,
    ),
    pidLimit: integer(input.pidLimit, "pidLimit", 16, 4_096),
    outputBytesPerStream: integer(
      input.outputBytesPerStream,
      "outputBytesPerStream",
      1_024,
      MAX_OCI_OUTPUT_BYTES,
    ),
    wallTimeMs: integer(input.wallTimeMs, "wallTimeMs", 1_000, 24 * 60 * 60 * 1_000),
    stopGraceMs: integer(input.stopGraceMs, "stopGraceMs", 100, 60_000),
    privateTmpfsBytes: integer(
      input.privateTmpfsBytes,
      "privateTmpfsBytes",
      16 * 1024 * 1024,
      4 * 1024 * 1024 * 1024,
    ),
  };
}

function parseEnvironment(value: unknown): readonly Readonly<{ name: string; value: string }>[] {
  if (!Array.isArray(value) || value.length > ALLOWED_ENVIRONMENT_VALUES.size)
    throw new TypeError("OCI environment must contain only allowlisted runtime variables");
  let previous = "";
  let totalBytes = 0;
  return value.map((item, index) => {
    const entry = record(item, `environment[${String(index)}]`);
    exactKeys(entry, ["name", "value"], `environment[${String(index)}]`);
    const name = text(entry.name, `environment[${String(index)}].name`, 128);
    const allowedValues = ALLOWED_ENVIRONMENT_VALUES.get(name);
    if (allowedValues === undefined) {
      throw new TypeError(
        "OCI environment names must be explicitly allowlisted non-credential runtime variables",
      );
    }
    if (name <= previous) {
      throw new TypeError("OCI environment names must be unique and sorted");
    }
    previous = name;
    const entryValue = text(entry.value, `environment[${String(index)}].value`, 128);
    if (!allowedValues.has(entryValue)) {
      throw new TypeError(`OCI environment value for ${name} is outside the locked profile`);
    }
    totalBytes += Buffer.byteLength(name) + Buffer.byteLength(entryValue);
    if (totalBytes > 65_536) throw new TypeError("OCI environment exceeds its byte limit");
    return { name, value: entryValue };
  });
}

export function parseOciRunIntent(value: unknown): OciRunIntentV1 {
  const input = record(value, "OCI run intent");
  exactKeys(
    input,
    [
      "agentArguments",
      "agentExecutable",
      "attemptId",
      "baseCommit",
      "baseTree",
      "containerName",
      "createdAt",
      "environment",
      "fence",
      "image",
      "limits",
      "networkMode",
      "policyDigest",
      "privateTmpfsPath",
      "readOnlyRootFilesystem",
      "runId",
      "runKey",
      "schemaVersion",
      "taskSpecDigest",
      "worktreeContainerPath",
      "worktreeHostPath",
    ],
    "OCI run intent",
  );
  if (input.schemaVersion !== 1) throw new TypeError("OCI run intent schema is unsupported");
  const parsedRunKey = runKey(input.runKey);
  const attemptId = uuid(input.attemptId, "attemptId");
  const runId = uuid(input.runId, "runId");
  const baseCommit = text(input.baseCommit, "baseCommit", 64);
  const baseTree = text(input.baseTree, "baseTree", 64);
  if (
    !GIT_OBJECT.test(baseCommit) ||
    !GIT_OBJECT.test(baseTree) ||
    baseCommit.length !== baseTree.length
  ) {
    throw new TypeError("baseCommit and baseTree must use one Git object format");
  }
  const imageInput = record(input.image, "image");
  exactKeys(imageInput, ["imageId", "reference"], "image");
  const reference = text(imageInput.reference, "image.reference", 512);
  if (!IMAGE_REFERENCE.test(reference))
    throw new TypeError("image.reference must be pinned by digest");
  const imageId = digest(imageInput.imageId, "image.imageId");
  if (!Array.isArray(input.agentArguments) || input.agentArguments.length > 256) {
    throw new TypeError("agentArguments must be a bounded array");
  }
  let argumentBytes = 0;
  const agentArguments = input.agentArguments.map((argument, index) => {
    const parsed = text(argument, `agentArguments[${String(index)}]`);
    argumentBytes += Buffer.byteLength(parsed);
    if (argumentBytes > 131_072) throw new TypeError("agentArguments exceeds its byte limit");
    return parsed;
  });
  if (
    input.worktreeContainerPath !== OCI_WORKSPACE_PATH ||
    input.privateTmpfsPath !== OCI_PRIVATE_TMPFS_PATH ||
    input.networkMode !== "none" ||
    input.readOnlyRootFilesystem !== true
  ) {
    throw new TypeError("OCI isolation profile is not the locked no-network profile");
  }
  return {
    schemaVersion: 1,
    runKey: parsedRunKey,
    attemptId,
    runId,
    fence: integer(input.fence, "fence", 0, Number.MAX_SAFE_INTEGER),
    createdAt: instant(input.createdAt, "createdAt"),
    taskSpecDigest: digest(input.taskSpecDigest, "taskSpecDigest"),
    policyDigest: digest(input.policyDigest, "policyDigest"),
    baseCommit,
    baseTree,
    containerName: text(input.containerName, "containerName", 128),
    image: { reference, imageId },
    worktreeHostPath: absolutePath(input.worktreeHostPath, "worktreeHostPath"),
    worktreeContainerPath: OCI_WORKSPACE_PATH,
    privateTmpfsPath: OCI_PRIVATE_TMPFS_PATH,
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: absolutePath(input.agentExecutable, "agentExecutable"),
    agentArguments,
    environment: parseEnvironment(input.environment),
    limits: parseLimits(input.limits),
  };
}

export function canonicalJsonLine(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

export function sha256Digest(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestOciRunIntent(value: OciRunIntentV1): string {
  return sha256Digest(canonicalJsonLine(parseOciRunIntent(value)));
}

export function labelsForOciRun(intentInput: OciRunIntentV1): Readonly<Record<string, string>> {
  const intent = parseOciRunIntent(intentInput);
  return {
    "com.app-factory.attempt-id": intent.attemptId,
    "com.app-factory.base-commit": intent.baseCommit,
    "com.app-factory.base-tree": intent.baseTree,
    "com.app-factory.fence": String(intent.fence),
    "com.app-factory.intent-digest": digestOciRunIntent(intent),
    "com.app-factory.managed": "true",
    "com.app-factory.policy-digest": intent.policyDigest,
    "com.app-factory.run-id": intent.runId,
    "com.app-factory.run-key": intent.runKey,
    "com.app-factory.schema": "1",
    "com.app-factory.task-spec-digest": intent.taskSpecDigest,
  };
}

export function parseOciRunReceipt(value: unknown): OciRunReceiptV1 {
  const input = record(value, "OCI run receipt");
  exactKeys(
    input,
    [
      "attemptId",
      "containerId",
      "createdAt",
      "exitCode",
      "fence",
      "finishedAt",
      "imageId",
      "intentDigest",
      "oomKilled",
      "outcome",
      "removalEvidenceDigest",
      "removedAt",
      "runId",
      "runKey",
      "schemaVersion",
      "startedAt",
      "stderr",
      "stdout",
      "terminalInspectionDigest",
      "terminationOrigin",
    ],
    "OCI run receipt",
  );
  if (input.schemaVersion !== 1) throw new TypeError("OCI receipt schema is unsupported");
  const output = (valueInput: unknown, label: string): OciCapturedOutputV1 => {
    const item = record(valueInput, label);
    exactKeys(item, ["capturedByteLength", "digest", "observedByteLength", "truncated"], label);
    const captured = integer(
      item.capturedByteLength,
      `${label}.capturedByteLength`,
      0,
      MAX_OCI_OUTPUT_BYTES,
    );
    const observed = integer(
      item.observedByteLength,
      `${label}.observedByteLength`,
      captured,
      Number.MAX_SAFE_INTEGER,
    );
    if (typeof item.truncated !== "boolean" || item.truncated !== observed > captured) {
      throw new TypeError(`${label}.truncated is inconsistent`);
    }
    return {
      digest: digest(item.digest, `${label}.digest`),
      capturedByteLength: captured,
      observedByteLength: observed,
      truncated: item.truncated,
    };
  };
  const stdout = output(input.stdout, "stdout");
  const stderr = output(input.stderr, "stderr");
  const outcome = input.outcome;
  const terminationOrigin = input.terminationOrigin;
  if (
    !["succeeded", "failed", "timed-out", "output-overflow", "cancelled"].includes(
      outcome as string,
    )
  ) {
    throw new TypeError("OCI receipt outcome is invalid");
  }
  if (
    !["natural", "wall-time", "output-overflow", "cancellation"].includes(
      terminationOrigin as string,
    )
  ) {
    throw new TypeError("OCI receipt termination origin is invalid");
  }
  if (
    input.exitCode !== null &&
    (!Number.isInteger(input.exitCode) ||
      (input.exitCode as number) < 0 ||
      (input.exitCode as number) > 255)
  ) {
    throw new TypeError("OCI receipt exitCode is invalid");
  }
  if (typeof input.oomKilled !== "boolean") throw new TypeError("OCI receipt oomKilled is invalid");
  const exitCode = input.exitCode as number | null;
  const oomKilled = input.oomKilled;
  const expectedOriginByOutcome: Readonly<
    Record<OciRunReceiptV1["outcome"], OciRunReceiptV1["terminationOrigin"]>
  > = {
    succeeded: "natural",
    failed: "natural",
    "timed-out": "wall-time",
    "output-overflow": "output-overflow",
    cancelled: "cancellation",
  };
  if (expectedOriginByOutcome[outcome as OciRunReceiptV1["outcome"]] !== terminationOrigin) {
    throw new TypeError("OCI receipt outcome and termination origin are inconsistent");
  }
  if (outcome === "succeeded" && (exitCode !== 0 || oomKilled)) {
    throw new TypeError("A succeeded OCI receipt requires exit zero without an OOM kill");
  }
  if (outcome === "failed" && exitCode === 0 && !oomKilled) {
    throw new TypeError("A failed OCI receipt requires a failed exit or an OOM kill");
  }
  const hasTruncatedOutput = stdout.truncated || stderr.truncated;
  if ((outcome === "output-overflow") !== hasTruncatedOutput) {
    throw new TypeError("OCI receipt output-overflow disposition is inconsistent");
  }
  const parsedRunKey = runKey(input.runKey);
  const attemptId = uuid(input.attemptId, "attemptId");
  const runId = uuid(input.runId, "runId");
  if (typeof input.containerId !== "string" || !CONTAINER_ID.test(input.containerId)) {
    throw new TypeError("containerId must be a canonical 64-hex container ID");
  }
  const containerId = input.containerId;
  const createdAt = instant(input.createdAt, "createdAt");
  const startedAt = instant(input.startedAt, "startedAt");
  const finishedAt = instant(input.finishedAt, "finishedAt");
  const removedAt = instant(input.removedAt, "removedAt");
  const timestamps = [createdAt, startedAt, finishedAt, removedAt].map((item) => Date.parse(item));
  if (timestamps.some((item, index) => index > 0 && item < (timestamps[index - 1] as number))) {
    throw new TypeError("OCI receipt timestamps must be monotonic");
  }
  return {
    schemaVersion: 1,
    runKey: parsedRunKey,
    attemptId,
    runId,
    fence: integer(input.fence, "fence", 0, Number.MAX_SAFE_INTEGER),
    intentDigest: digest(input.intentDigest, "intentDigest"),
    containerId,
    imageId: digest(input.imageId, "imageId"),
    createdAt,
    startedAt,
    finishedAt,
    removedAt,
    terminalInspectionDigest: digest(input.terminalInspectionDigest, "terminalInspectionDigest"),
    removalEvidenceDigest: digest(input.removalEvidenceDigest, "removalEvidenceDigest"),
    outcome: outcome as OciRunReceiptV1["outcome"],
    terminationOrigin: terminationOrigin as OciRunReceiptV1["terminationOrigin"],
    exitCode,
    oomKilled,
    stdout,
    stderr,
  };
}
