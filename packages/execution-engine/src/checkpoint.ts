import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

import {
  AttemptIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type AttemptId,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";
import type { BrokerCommitRecord, CandidateVerification } from "@app-factory/git-workspace";

import { canonicalJsonBytes } from "./canonical.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const REVISION_FILE_PATTERN = /^(\d{16})\.json$/u;

export const EXECUTION_PHASES = [
  "candidate-verified",
  "tests-passed",
  "review-passed",
  "commit-created",
  "completed",
] as const;

export type ExecutionPhase = (typeof EXECUTION_PHASES)[number];

export type ExecutionCheckpointV1 = Readonly<{
  schemaVersion: 1;
  attemptId: AttemptId;
  fence: number;
  inputDigest: Sha256Digest;
  revision: number;
  phase: ExecutionPhase;
  candidateVerification: CandidateVerification;
  candidateVerificationArtifactDigest: Sha256Digest;
  testBundleDigest: Sha256Digest | null;
  reviewInputArtifactDigest: Sha256Digest | null;
  reviewReportDigest: Sha256Digest | null;
  brokerCommit: BrokerCommitRecord | null;
  evidenceIndexDigest: Sha256Digest | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}>;

export type ExecutionCheckpointPort = Readonly<{
  load(attemptId: AttemptId): unknown | null;
  compareAndSet(
    attemptId: AttemptId,
    expectedRevision: number | null,
    next: ExecutionCheckpointV1,
  ): void;
}>;

export class ExecutionCheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionCheckpointError";
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new ExecutionCheckpointError(`${label} has unexpected or missing fields`);
  }
}

function parsePositiveRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ExecutionCheckpointError("Checkpoint revision must be a positive safe integer");
  }
  return value as number;
}

function parseFence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ExecutionCheckpointError("Checkpoint fence must be a non-negative safe integer");
  }
  return value as number;
}

export function parseCandidateVerification(value: unknown): CandidateVerification {
  if (!isRecord(value)) {
    throw new ExecutionCheckpointError("Candidate verification must be an object");
  }
  assertExactKeys(
    value,
    [
      "attemptId",
      "baseSha",
      "attemptHeadSha",
      "candidateTreeId",
      "changedPaths",
      "diffBytes",
      "totalChangedFileBytes",
      "diffDigest",
      "treeDigest",
    ],
    "Candidate verification",
  );
  if (
    typeof value.attemptId !== "string" ||
    typeof value.baseSha !== "string" ||
    typeof value.attemptHeadSha !== "string" ||
    typeof value.candidateTreeId !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.baseSha) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.attemptHeadSha) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.candidateTreeId) ||
    !Array.isArray(value.changedPaths) ||
    !Number.isSafeInteger(value.diffBytes) ||
    (value.diffBytes as number) < 0 ||
    !Number.isSafeInteger(value.totalChangedFileBytes) ||
    (value.totalChangedFileBytes as number) < 0
  ) {
    throw new ExecutionCheckpointError("Candidate verification has invalid scalar fields");
  }
  Sha256DigestSchema.parse(value.diffDigest);
  Sha256DigestSchema.parse(value.treeDigest);
  for (const changed of value.changedPaths) {
    if (!isRecord(changed)) {
      throw new ExecutionCheckpointError("Changed path record must be an object");
    }
    assertExactKeys(
      changed,
      ["status", "path", "oldMode", "newMode", "oldObjectId", "newObjectId", "sizeBytes"],
      "Changed path record",
    );
    if (
      !["A", "C", "D", "M", "R", "T", "U", "X", "B"].includes(String(changed.status)) ||
      typeof changed.path !== "string" ||
      typeof changed.oldMode !== "string" ||
      typeof changed.newMode !== "string" ||
      typeof changed.oldObjectId !== "string" ||
      typeof changed.newObjectId !== "string" ||
      (changed.sizeBytes !== null &&
        (!Number.isSafeInteger(changed.sizeBytes) || (changed.sizeBytes as number) < 0))
    ) {
      throw new ExecutionCheckpointError("Changed path record is invalid");
    }
  }
  return value as CandidateVerification;
}

export function parseBrokerCommit(value: unknown): BrokerCommitRecord {
  if (!isRecord(value)) {
    throw new ExecutionCheckpointError("Broker commit must be an object");
  }
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "attemptId",
      "attemptMarker",
      "refName",
      "baseSha",
      "candidateTreeId",
      "diffDigest",
      "commitSha",
      "commitDigest",
    ],
    "Broker commit",
  );
  if (
    value.schemaVersion !== 1 ||
    typeof value.attemptId !== "string" ||
    typeof value.attemptMarker !== "string" ||
    typeof value.refName !== "string" ||
    typeof value.baseSha !== "string" ||
    typeof value.candidateTreeId !== "string" ||
    typeof value.commitSha !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.baseSha) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.candidateTreeId) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.commitSha)
  ) {
    throw new ExecutionCheckpointError("Broker commit has invalid scalar fields");
  }
  Sha256DigestSchema.parse(value.diffDigest);
  Sha256DigestSchema.parse(value.commitDigest);
  return value as BrokerCommitRecord;
}

function phaseRank(phase: ExecutionPhase): number {
  return EXECUTION_PHASES.indexOf(phase);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function assertPreservedBindings(
  current: ExecutionCheckpointV1,
  next: ExecutionCheckpointV1,
): void {
  if (
    !sameCanonical(current.candidateVerification, next.candidateVerification) ||
    current.candidateVerificationArtifactDigest !== next.candidateVerificationArtifactDigest ||
    (current.testBundleDigest !== null && current.testBundleDigest !== next.testBundleDigest) ||
    (current.reviewInputArtifactDigest !== null &&
      current.reviewInputArtifactDigest !== next.reviewInputArtifactDigest) ||
    (current.reviewReportDigest !== null &&
      current.reviewReportDigest !== next.reviewReportDigest) ||
    (current.brokerCommit !== null && !sameCanonical(current.brokerCommit, next.brokerCommit)) ||
    (current.evidenceIndexDigest !== null &&
      current.evidenceIndexDigest !== next.evidenceIndexDigest)
  ) {
    throw new ExecutionCheckpointError("Checkpoint transition rewrote a durable phase binding");
  }
}

export function parseExecutionCheckpoint(value: unknown): ExecutionCheckpointV1 {
  if (!isRecord(value)) {
    throw new ExecutionCheckpointError("Execution checkpoint must be an object");
  }
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "attemptId",
      "fence",
      "inputDigest",
      "revision",
      "phase",
      "candidateVerification",
      "candidateVerificationArtifactDigest",
      "testBundleDigest",
      "reviewInputArtifactDigest",
      "reviewReportDigest",
      "brokerCommit",
      "evidenceIndexDigest",
      "createdAt",
      "updatedAt",
    ],
    "Execution checkpoint",
  );
  if (value.schemaVersion !== 1 || !EXECUTION_PHASES.includes(value.phase as ExecutionPhase)) {
    throw new ExecutionCheckpointError("Execution checkpoint has an invalid version or phase");
  }
  const checkpoint: ExecutionCheckpointV1 = {
    schemaVersion: 1,
    attemptId: AttemptIdSchema.parse(value.attemptId),
    fence: parseFence(value.fence),
    inputDigest: Sha256DigestSchema.parse(value.inputDigest),
    revision: parsePositiveRevision(value.revision),
    phase: value.phase as ExecutionPhase,
    candidateVerification: parseCandidateVerification(value.candidateVerification),
    candidateVerificationArtifactDigest: Sha256DigestSchema.parse(
      value.candidateVerificationArtifactDigest,
    ),
    testBundleDigest:
      value.testBundleDigest === null ? null : Sha256DigestSchema.parse(value.testBundleDigest),
    reviewInputArtifactDigest:
      value.reviewInputArtifactDigest === null
        ? null
        : Sha256DigestSchema.parse(value.reviewInputArtifactDigest),
    reviewReportDigest:
      value.reviewReportDigest === null ? null : Sha256DigestSchema.parse(value.reviewReportDigest),
    brokerCommit: value.brokerCommit === null ? null : parseBrokerCommit(value.brokerCommit),
    evidenceIndexDigest:
      value.evidenceIndexDigest === null
        ? null
        : Sha256DigestSchema.parse(value.evidenceIndexDigest),
    createdAt: IsoInstantSchema.parse(value.createdAt),
    updatedAt: IsoInstantSchema.parse(value.updatedAt),
  };

  const rank = phaseRank(checkpoint.phase);
  const required = [
    { minimumRank: 1, value: checkpoint.testBundleDigest },
    { minimumRank: 2, value: checkpoint.reviewInputArtifactDigest },
    { minimumRank: 2, value: checkpoint.reviewReportDigest },
    { minimumRank: 3, value: checkpoint.brokerCommit },
    { minimumRank: 4, value: checkpoint.evidenceIndexDigest },
  ];
  for (const item of required) {
    if (rank >= item.minimumRank !== (item.value !== null)) {
      throw new ExecutionCheckpointError(
        `Checkpoint fields are inconsistent with phase ${checkpoint.phase}`,
      );
    }
  }
  return checkpoint;
}

function assertPrivateDirectory(path: string): void {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    throw new ExecutionCheckpointError(`Checkpoint directory is not private: ${path}`);
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new ExecutionCheckpointError(`Checkpoint directory has a foreign owner: ${path}`);
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { mode: PRIVATE_DIRECTORY_MODE });
  assertPrivateDirectory(path);
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function safeChild(root: string, child: string): string {
  const result = join(root, child);
  if (!result.startsWith(`${root}${sep}`)) {
    throw new ExecutionCheckpointError("Checkpoint path escaped its root");
  }
  return result;
}

function writeExclusive(path: string, bytes: Buffer, temporaryRoot: string): void {
  const temporary = safeChild(temporaryRoot, `${process.pid}-${randomUUID()}.tmp`);
  const descriptor = openSync(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    linkSync(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ExecutionCheckpointError("Checkpoint compare-and-set lost a concurrent race");
    }
    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

export class FileExecutionCheckpointStore implements ExecutionCheckpointPort {
  readonly #root: string;
  readonly #temporaryRoot: string;

  constructor(rootPath: string) {
    if (!isAbsolute(rootPath) || resolve(rootPath) !== rootPath) {
      throw new ExecutionCheckpointError("Checkpoint root must be a normalized absolute path");
    }
    ensurePrivateDirectory(rootPath);
    this.#root = realpathSync(rootPath);
    this.#temporaryRoot = safeChild(this.#root, "tmp");
    ensurePrivateDirectory(this.#temporaryRoot);
  }

  load(attemptIdInput: AttemptId): ExecutionCheckpointV1 | null {
    const attemptId = AttemptIdSchema.parse(attemptIdInput);
    const directory = safeChild(this.#root, attemptId);
    if (!existsSync(directory)) return null;
    assertPrivateDirectory(directory);
    const revisions = readdirSync(directory)
      .map((name) => {
        const match = REVISION_FILE_PATTERN.exec(name);
        if (match?.[1] === undefined) {
          throw new ExecutionCheckpointError(`Unexpected checkpoint entry: ${name}`);
        }
        return { name, revision: Number(match[1]) };
      })
      .sort((left, right) => left.revision - right.revision);
    if (revisions.length === 0) return null;
    for (const [index, entry] of revisions.entries()) {
      if (entry.revision !== index + 1) {
        throw new ExecutionCheckpointError("Checkpoint revision history is not contiguous");
      }
    }
    const latest = revisions.at(-1) as { name: string; revision: number };
    const path = safeChild(directory, latest.name);
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
      throw new ExecutionCheckpointError(`Checkpoint revision is not a private file: ${path}`);
    }
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      bytes = readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const parsed = parseExecutionCheckpoint(JSON.parse(bytes.toString("utf8")) as unknown);
    if (parsed.attemptId !== attemptId || parsed.revision !== latest.revision) {
      throw new ExecutionCheckpointError("Checkpoint filename and contents disagree");
    }
    if (!canonicalJsonBytes(parsed).equals(bytes)) {
      throw new ExecutionCheckpointError("Checkpoint is not canonically encoded");
    }
    return parsed;
  }

  compareAndSet(
    attemptIdInput: AttemptId,
    expectedRevision: number | null,
    nextInput: ExecutionCheckpointV1,
  ): void {
    const attemptId = AttemptIdSchema.parse(attemptIdInput);
    const next = parseExecutionCheckpoint(nextInput);
    const current = this.load(attemptId);
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new ExecutionCheckpointError("Checkpoint compare-and-set revision mismatch");
    }
    const nextRevision = (expectedRevision ?? 0) + 1;
    if (next.attemptId !== attemptId || next.revision !== nextRevision) {
      throw new ExecutionCheckpointError("Checkpoint identity or next revision is invalid");
    }
    if (current === null) {
      if (next.phase !== "candidate-verified") {
        throw new ExecutionCheckpointError("Initial checkpoint must record candidate verification");
      }
    } else {
      const currentRank = phaseRank(current.phase);
      const nextRank = phaseRank(next.phase);
      const fenceIncreased = next.fence > current.fence;
      if (
        next.inputDigest !== current.inputDigest ||
        next.createdAt !== current.createdAt ||
        next.fence < current.fence ||
        nextRank < currentRank ||
        (fenceIncreased ? nextRank !== currentRank : nextRank !== currentRank + 1)
      ) {
        throw new ExecutionCheckpointError("Checkpoint transition is not monotonic and bound");
      }
      assertPreservedBindings(current, next);
      if (
        nextRank === currentRank &&
        (!sameCanonical(current.candidateVerification, next.candidateVerification) ||
          current.candidateVerificationArtifactDigest !==
            next.candidateVerificationArtifactDigest ||
          current.testBundleDigest !== next.testBundleDigest ||
          current.reviewInputArtifactDigest !== next.reviewInputArtifactDigest ||
          current.reviewReportDigest !== next.reviewReportDigest ||
          !sameCanonical(current.brokerCommit, next.brokerCommit) ||
          current.evidenceIndexDigest !== next.evidenceIndexDigest)
      ) {
        throw new ExecutionCheckpointError(
          "A higher-fence adoption must preserve the exact durable phase",
        );
      }
    }
    const directory = safeChild(this.#root, attemptId);
    ensurePrivateDirectory(directory);
    const filename = `${String(nextRevision).padStart(16, "0")}.json`;
    writeExclusive(safeChild(directory, filename), canonicalJsonBytes(next), this.#temporaryRoot);
    syncDirectory(directory);
  }
}
