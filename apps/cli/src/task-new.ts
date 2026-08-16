import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  AcceptanceCriterionV1Schema,
  GitObjectIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  StableKeySchema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type AcceptanceCriterionV1,
  type GitObjectId,
  type ProjectId,
  type RepositoryId,
  type Sha256Digest,
  type StableKey,
  type TaskSpecV1,
} from "@app-factory/contracts";

import { CliUsageError } from "./cli-errors.js";

const MAX_PROFILE_BYTES = 16 * 1024;
// Mirrors apps/daemon/src/verified-local-executor.ts MAX_REVIEWED_POLICY_BYTES.
// Kept as an independent constant: the CLI is a separate, unprivileged
// process and must not import daemon internals.
const MAX_REVIEWED_POLICY_BYTES = 48 * 1024;
const MAX_ACCEPTANCE_CRITERIA_BYTES = 64 * 1024;
const MAX_ACCEPTANCE_CRITERIA = 50;
const MAX_SCOPE_PATHS = 100;

/**
 * The execution-profile config the CLI reads to learn which repository and
 * reviewed policy a task binds against. It intentionally mirrors the
 * repositoryId/sourceRepositoryPath/policyFile fields the daemon's own
 * swift-greeter-fixture-v1 profile uses, but is parsed independently here so
 * the CLI never depends on apps/daemon internals.
 */
export type ExecutionProfileV1 = Readonly<{
  schemaVersion: 1;
  repositoryId: RepositoryId;
  sourceRepositoryPath: string;
  policyFile: string;
}>;

export type TaskNewOptionsV1 = Readonly<{
  profilePath: string;
  title: string;
  objective: string;
  acceptancePath: string;
  scopePaths: readonly string[];
  projectId: ProjectId;
  /** The Studio phase this task belongs to; null leaves the spec without a `phase` key. */
  phase: StableKey | null;
  taskId: string | null;
  createdAt: string | null;
  policyPathOverride: string | null;
  outPath: string | null;
  gitExecutable: string;
  run: boolean;
}>;

export type TaskNewBuildResult = Readonly<{
  taskSpec: TaskSpecV1;
  taskSpecDigest: Sha256Digest;
  policyDigest: Sha256Digest;
}>;

export type TaskNewBuildDependencies = Readonly<{
  now?: () => Date;
  createTaskId?: () => string;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Canonical digesting.
//
// apps/cli is restricted (see dependency-cruiser.config.cjs
// "clients-use-command-boundary-only") to depending only on
// @app-factory/command-client and @app-factory/contracts, so it cannot
// import @app-factory/kernel's computeTaskSpecDigest or
// @app-factory/execution-engine's sha256Digest directly. This mirrors their
// exact algorithm instead (recursively sorted object keys, JSON.stringify
// for primitives, sha256 hex digest with a "sha256:" prefix), consistent
// with how kernel and execution-engine already each independently reimplement
// the same tiny canonical-JSON-plus-sha256 primitive rather than sharing a
// cross-cutting utility package. Digest parity with the real
// @app-factory/kernel and @app-factory/execution-engine helpers is proven in
// apps/daemon/test/task-new-digest-parity.test.ts, the one place both this
// module and the real canonical helpers may legally be imported together.
// ---------------------------------------------------------------------------

function sha256HexDigest(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

function canonicalizeForDigest(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CliUsageError("Cannot canonically encode a non-finite number for digesting.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeForDigest(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeForDigest(record[key])}`)
      .join(",")}}`;
  }
  throw new CliUsageError("Cannot canonically encode this value for digesting.");
}

/** Mirrors @app-factory/kernel computeTaskSpecDigest exactly for an already-validated TaskSpecV1. */
function computeTaskSpecDigestLocal(taskSpec: TaskSpecV1): Sha256Digest {
  return sha256HexDigest(Buffer.from(canonicalizeForDigest(taskSpec), "utf8"));
}

function resolveCliPath(value: string, label: string): string {
  if (value.length === 0 || value.includes("\0")) {
    throw new CliUsageError(`${label} must be a non-empty path without NUL bytes.`);
  }
  return resolve(process.cwd(), value);
}

function normalizedAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    throw new CliUsageError(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function readBoundedFile(path: string, maxBytes: number, label: string): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new CliUsageError(`${label} cannot be opened: ${path}`, { cause: error });
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size < 1 || stats.size > maxBytes) {
      throw new CliUsageError(
        `${label} must be a bounded regular file of 1-${String(maxBytes)} bytes: ${path}`,
      );
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function canonicalUtf8(bytes: Buffer, label: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CliUsageError(`${label} must contain valid UTF-8.`, { cause: error });
  }
  if (text.includes("\0") || !Buffer.from(text, "utf8").equals(bytes)) {
    throw new CliUsageError(`${label} must contain canonical UTF-8 without NUL bytes.`);
  }
  return text;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliUsageError(`${label} must contain valid JSON.`, { cause: error });
  }
}

// ---------------------------------------------------------------------------
// Argument parsing. Deliberately self-contained (does not import index.ts's
// private helpers) so this file has no import-cycle risk with the rest of
// the CLI's argument parser.
// ---------------------------------------------------------------------------

function consumeOption(arguments_: string[], option: string): string | undefined {
  const indexes = arguments_
    .map((argument, index) => (argument === option ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) throw new CliUsageError(`${option} may only be provided once.`);
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`${option} requires a value.`);
  }
  arguments_.splice(index, 2);
  return value;
}

function consumeRepeatedOption(arguments_: string[], option: string): string[] {
  const values: string[] = [];
  for (;;) {
    const index = arguments_.indexOf(option);
    if (index === -1) break;
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`${option} requires a value.`);
    }
    values.push(value);
    arguments_.splice(index, 2);
  }
  return values;
}

function consumeFlag(arguments_: string[], flag: string): boolean {
  const indexes = arguments_
    .map((argument, index) => (argument === flag ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) throw new CliUsageError(`${flag} may only be provided once.`);
  const index = indexes[0];
  if (index === undefined) return false;
  arguments_.splice(index, 1);
  return true;
}

function requireOption(arguments_: string[], option: string): string {
  const value = consumeOption(arguments_, option);
  if (value === undefined || value.length === 0) {
    throw new CliUsageError(`${option} is required.`);
  }
  return value;
}

function rejectUnexpected(arguments_: readonly string[]): void {
  if (arguments_.length > 0) throw new CliUsageError(`Unexpected argument: ${arguments_[0]}`);
}

/** Parses the arguments that follow `factory task new`. */
export function parseTaskNewArguments(argv: readonly string[]): TaskNewOptionsV1 {
  const arguments_ = [...argv];
  const run = consumeFlag(arguments_, "--run");
  const profilePath = requireOption(arguments_, "--profile");
  const title = requireOption(arguments_, "--title");
  const objective = requireOption(arguments_, "--objective");
  const acceptancePath = requireOption(arguments_, "--acceptance");
  const projectIdValue = requireOption(arguments_, "--project-id");
  const parsedProjectId = ProjectIdSchema.safeParse(projectIdValue);
  if (!parsedProjectId.success) {
    throw new CliUsageError("--project-id must be a canonical lowercase UUID.");
  }
  const scopePaths = consumeRepeatedOption(arguments_, "--scope");
  if (scopePaths.length === 0) {
    throw new CliUsageError("At least one --scope is required.");
  }
  if (scopePaths.length > MAX_SCOPE_PATHS) {
    throw new CliUsageError(`--scope may be provided at most ${String(MAX_SCOPE_PATHS)} times.`);
  }
  const phaseValue = consumeOption(arguments_, "--phase") ?? null;
  const parsedPhase = phaseValue === null ? null : StableKeySchema.safeParse(phaseValue);
  if (parsedPhase !== null && !parsedPhase.success) {
    throw new CliUsageError(
      "--phase must be a stable lowercase key (a-z, 0-9, hyphens; at most 64 characters).",
    );
  }
  const policyPathOverride = consumeOption(arguments_, "--policy") ?? null;
  const taskIdValue = consumeOption(arguments_, "--task-id") ?? null;
  if (taskIdValue !== null && !TaskIdSchema.safeParse(taskIdValue).success) {
    throw new CliUsageError("--task-id must be a canonical lowercase UUID.");
  }
  const createdAtValue = consumeOption(arguments_, "--created-at") ?? null;
  if (createdAtValue !== null && !IsoInstantSchema.safeParse(createdAtValue).success) {
    throw new CliUsageError("--created-at must be a canonical ISO-8601 instant.");
  }
  const outPath = consumeOption(arguments_, "--out") ?? null;
  const gitExecutable = consumeOption(arguments_, "--git") ?? "git";
  rejectUnexpected(arguments_);
  return {
    profilePath,
    title,
    objective,
    acceptancePath,
    scopePaths,
    projectId: parsedProjectId.data,
    phase: parsedPhase === null ? null : parsedPhase.data,
    taskId: taskIdValue,
    createdAt: createdAtValue,
    policyPathOverride,
    outPath,
    gitExecutable,
    run,
  };
}

// ---------------------------------------------------------------------------
// Input loading and digest computation.
// ---------------------------------------------------------------------------

function loadExecutionProfile(path: string): ExecutionProfileV1 {
  const resolved = resolveCliPath(path, "--profile");
  const bytes = readBoundedFile(resolved, MAX_PROFILE_BYTES, "The execution profile");
  const parsed = parseJson(canonicalUtf8(bytes, "The execution profile"), "The execution profile");
  if (!isRecord(parsed)) {
    throw new CliUsageError("The execution profile must be a JSON object.");
  }
  const expectedKeys = ["policyFile", "repositoryId", "schemaVersion", "sourceRepositoryPath"];
  const actualKeys = Object.keys(parsed).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new CliUsageError(
      "The execution profile must contain exactly schemaVersion, repositoryId, sourceRepositoryPath, and policyFile.",
    );
  }
  if (parsed.schemaVersion !== 1) {
    throw new CliUsageError("The execution profile must declare schemaVersion 1.");
  }
  const repositoryId = RepositoryIdSchema.safeParse(parsed.repositoryId);
  if (!repositoryId.success) {
    throw new CliUsageError(
      "The execution profile repositoryId must be a canonical lowercase UUID.",
    );
  }
  return {
    schemaVersion: 1,
    repositoryId: repositoryId.data,
    sourceRepositoryPath: normalizedAbsolutePath(
      parsed.sourceRepositoryPath,
      "The execution profile sourceRepositoryPath",
    ),
    policyFile: normalizedAbsolutePath(parsed.policyFile, "The execution profile policyFile"),
  };
}

function readReviewedPolicy(path: string): Readonly<{ bytes: Buffer; digest: Sha256Digest }> {
  const bytes = readBoundedFile(path, MAX_REVIEWED_POLICY_BYTES, "The reviewed policy file");
  // Validated for canonical UTF-8 to stay byte-identical to how the daemon
  // decodes and digests the same reviewed policy payload (see
  // decodeReviewedPolicyPayload); the digest itself uses the same sha256
  // hex-with-prefix algorithm as the daemon's canonical helper.
  canonicalUtf8(bytes, "The reviewed policy file");
  return { bytes, digest: sha256HexDigest(bytes) };
}

function loadAcceptanceCriteria(path: string): readonly AcceptanceCriterionV1[] {
  const resolved = resolveCliPath(path, "--acceptance");
  const bytes = readBoundedFile(
    resolved,
    MAX_ACCEPTANCE_CRITERIA_BYTES,
    "The acceptance criteria file",
  );
  const parsed = parseJson(
    canonicalUtf8(bytes, "The acceptance criteria file"),
    "The acceptance criteria file",
  );
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_ACCEPTANCE_CRITERIA) {
    throw new CliUsageError(
      `The acceptance criteria file must contain a JSON array of 1-${String(MAX_ACCEPTANCE_CRITERIA)} criteria.`,
    );
  }
  return parsed.map((entry, index) => {
    const result = AcceptanceCriterionV1Schema.safeParse(entry);
    if (!result.success) {
      throw new CliUsageError(
        `acceptanceCriteria[${String(index)}] is invalid: ${result.error.message}`,
      );
    }
    return result.data;
  });
}

function parseScopePaths(values: readonly string[]): readonly string[] {
  return values.map((value, index) => {
    const result = RelativePathSchema.safeParse(value);
    if (!result.success) {
      throw new CliUsageError(
        `--scope[${String(index)}] must be a normalized relative path: ${value}`,
      );
    }
    return result.data;
  });
}

function resolveBaseCommit(gitExecutable: string, sourceRepositoryPath: string): GitObjectId {
  const result = spawnSync(
    gitExecutable,
    ["-C", sourceRepositoryPath, "rev-parse", "--verify", "HEAD"],
    {
      encoding: "utf8",
      timeout: 10_000,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    },
  );
  if (result.error !== undefined || result.status !== 0 || typeof result.stdout !== "string") {
    throw new CliUsageError(
      `Could not resolve the base commit for ${sourceRepositoryPath}: ${result.stderr || result.error?.message || "git rev-parse failed"}`,
    );
  }
  const parsed = GitObjectIdSchema.safeParse(result.stdout.trim());
  if (!parsed.success) {
    throw new CliUsageError("git rev-parse did not return a valid Git object ID.");
  }
  return parsed.data;
}

/**
 * Builds a ready-to-submit TaskSpecV1 and computes its digests with the same
 * canonical algorithm the daemon uses to validate an attempt: a sha256 hex
 * digest for the reviewed policy payload (see apps/daemon
 * decodeReviewedPolicyPayload) and a canonical-JSON sha256 digest for the
 * assembled TaskSpec (see @app-factory/kernel computeTaskSpecDigest, also
 * used by the daemon's own attempt bindings). See the "Canonical digesting"
 * comment above for why this module cannot import those packages directly.
 */
export function buildTaskSpecFromOptions(
  options: TaskNewOptionsV1,
  dependencies: TaskNewBuildDependencies = {},
): TaskNewBuildResult {
  const profile = loadExecutionProfile(options.profilePath);
  const policyPath =
    options.policyPathOverride === null
      ? profile.policyFile
      : resolveCliPath(options.policyPathOverride, "--policy");
  const reviewedPolicy = readReviewedPolicy(policyPath);
  const baseCommit = resolveBaseCommit(options.gitExecutable, profile.sourceRepositoryPath);
  const acceptanceCriteria = loadAcceptanceCriteria(options.acceptancePath);
  const scopePaths = parseScopePaths(options.scopePaths);
  const taskId = options.taskId ?? TaskIdSchema.parse((dependencies.createTaskId ?? randomUUID)());
  const createdAt =
    options.createdAt ??
    IsoInstantSchema.parse((dependencies.now ?? ((): Date => new Date()))().toISOString());

  let taskSpec: TaskSpecV1;
  try {
    taskSpec = TaskSpecV1Schema.parse({
      schemaVersion: 1,
      taskId,
      projectId: options.projectId,
      createdAt,
      title: options.title,
      objective: options.objective,
      // Spread rather than `phase: options.phase ?? undefined`: an absent phase
      // must leave no key at all, so the spec's canonical bytes and digest are
      // identical to a spec built before the field existed.
      ...(options.phase === null ? {} : { phase: options.phase }),
      acceptanceCriteria,
      base: { repositoryId: profile.repositoryId, commit: baseCommit },
      requestedScope: { paths: scopePaths },
      policyDigest: reviewedPolicy.digest,
    });
  } catch (error) {
    throw new CliUsageError(
      `The assembled task specification is invalid: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return {
    taskSpec,
    taskSpecDigest: computeTaskSpecDigestLocal(taskSpec),
    policyDigest: reviewedPolicy.digest,
  };
}

/** Writes the ready-to-submit TaskSpecV1 JSON. Refuses to overwrite an existing file. */
export function writeTaskNewOutput(build: TaskNewBuildResult, outPath: string): void {
  const resolved = resolveCliPath(outPath, "--out");
  const bytes = Buffer.from(`${JSON.stringify(build.taskSpec, null, 2)}\n`, "utf8");
  let descriptor: number;
  try {
    descriptor = openSync(
      resolved,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    throw new CliUsageError(
      `Cannot create ${resolved} (it may already exist): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  try {
    writeSync(descriptor, bytes);
  } finally {
    closeSync(descriptor);
  }
}

export function renderTaskNewResult(
  build: TaskNewBuildResult,
  outPath: string | null,
  mode: "human" | "json",
): string {
  if (mode === "json") {
    return `${JSON.stringify({
      ok: true,
      result: {
        operation: "task.new",
        taskSpec: build.taskSpec,
        taskSpecDigest: build.taskSpecDigest,
        policyDigest: build.policyDigest,
        outPath,
      },
    })}\n`;
  }
  const digestLines = `taskSpecDigest ${build.taskSpecDigest}\npolicyDigest ${build.policyDigest}\n`;
  return outPath === null
    ? `${JSON.stringify(build.taskSpec, null, 2)}\n${digestLines}`
    : `task.new: wrote ${outPath}\n${digestLines}`;
}
