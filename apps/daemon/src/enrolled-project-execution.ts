import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  AcceptanceCriterionV1Schema,
  GitObjectIdSchema,
  NamespacedCodeSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  ToolVersionV1Schema,
  type NamespacedCode,
  type RunId,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  assertVerificationArgsTemplate,
  sha256Digest,
  type TrustedVerificationPlanTemplate,
} from "@app-factory/execution-engine";
import type { IndependentReviewAdapter } from "@app-factory/independent-review";
import {
  GitWorkspaceManager,
  decodeProtectedPathPolicyExtension,
  type ProtectedPathPolicyExtensionV1,
} from "@app-factory/git-workspace";

import { CODEX_PROFILE_ENVIRONMENT_NAMES } from "./codex-profile-environment.js";
import {
  MAX_REVIEWED_POLICY_BYTES,
  computeTaskSemanticProfileDigest,
  decodeReviewedPolicyPayload,
  resolveVerifiedLocalExecutionPaths,
  type VerifiedLocalExecutionProject,
} from "./verified-local-executor.js";

const MAX_CONFIGURATION_BYTES = 64 * 1024;
const MAX_GIT_PROBE_BYTES = 1024 * 1024;
const PRIVATE_FILE_MODE_MASK = 0o077;
const GIT = "/usr/bin/git";
const MAX_VERIFICATION_PLANS = 100;
const MAX_VERIFICATION_ARGS = 64;
const MAX_ARG_LENGTH = 8 * 1024;
const MAX_ENVIRONMENT_VALUE_LENGTH = 4 * 1024;
const MAX_PROTECTED_FILES = 50;
const MAX_TOOL_VERSIONS = 50;
const MAX_TIMEOUT_MS = 600_000;
const MAX_TERMINATION_GRACE_MS = 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_CANDIDATE_POLICY_LIMIT_BYTES = 1024 * 1024 * 1024;
const REVIEWER_FINDING_ID = "62000000-0000-4000-8000-000000000903";
// Mirrors classifyProtectedPath's own reviewed-extension byte cap in
// packages/git-workspace/src/workspace.ts; decodeProtectedPathPolicyExtension
// enforces the true limit independently, this only bounds the file read.
const MAX_PROTECTED_PATH_POLICY_EXTENSION_BYTES = 16 * 1024;

export type EnrolledProjectConfigurationV1 = Readonly<{
  schemaVersion: 1;
  mode: "enrolled-project-v1";
  repositoryId: string;
  sourceRepositoryPath: string;
  allowedBaseCommit: string;
  allowedBaseTree: string;
  policyFile: string;
  taskSemantics: Readonly<{
    title: string;
    objective: string;
    acceptanceCriteria: readonly Readonly<{
      id: string;
      statement: string;
      verification: string;
    }>[];
  }>;
  candidatePolicyLimits?: Readonly<{
    maxChangedFileBytes?: number;
    maxDiffBytes?: number;
  }>;
  /**
   * Optional reference to a reviewed protected-path policy extension file,
   * pinned to its exact reviewed bytes by digest. Absent by default; when
   * absent, this enrolled project's candidate verification behaves exactly
   * as it did before this field existed.
   */
  protectedPathPolicyExtension?: Readonly<{
    file: string;
    digest: Sha256Digest;
  }>;
  verificationPlans: readonly TrustedVerificationPlanTemplate[];
  reviewer: Readonly<{
    reviewerId: NamespacedCode;
    reviewerVersion: string;
  }>;
}>;

/**
 * Everything an enrolled project contributes to a
 * {@link VerifiedLocalExecutionProject} except the agent and the
 * agent-invocation fields a real-identity mode attaches on top (those come
 * from whichever agent profile wraps this binding, e.g. `enrolled-codex-v1`).
 */
export type EnrolledProjectBindingV1 = Readonly<{
  gitExecutable: string;
  project: Omit<
    VerifiedLocalExecutionProject,
    | "agent"
    | "agentLimits"
    | "agentInvocationEnvironmentNames"
    | "agentInvocationIdentity"
    | "agentProtocol"
    | "environmentAllowlist"
    | "ociAgentIdentity"
    | "requireAgentProtocolEvidence"
  >;
}>;

export class EnrolledProjectExecutionConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnrolledProjectExecutionConfigurationError";
  }
}

function configurationError(message: string): never {
  throw new EnrolledProjectExecutionConfigurationError(message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    configurationError(`${label} has an unsupported or non-exact shape.`);
  }
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

function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0") ||
    value.trim() !== value
  ) {
    configurationError(`${label} must be non-empty bounded text without surrounding whitespace.`);
  }
  return value;
}

function boundedPositiveInteger(value: unknown, label: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    configurationError(`${label} must be a positive integer no greater than ${String(maximum)}.`);
  }
  return value;
}

function readBoundedRegularFile(path: string, maximumBytes: number): Buffer {
  const descriptor = (() => {
    try {
      return openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      configurationError("An enrolled project configuration input cannot be opened safely.");
    }
  })();
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > maximumBytes) {
      configurationError(
        "An enrolled project configuration input is not one bounded regular file.",
      );
    }
    if ((before.mode & PRIVATE_FILE_MODE_MASK) !== 0) {
      configurationError(
        "An enrolled project configuration input must be private to the current user.",
      );
    }
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) {
      configurationError(
        "An enrolled project configuration input must be owned by the current user.",
      );
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      bytes.byteLength !== before.size
    ) {
      configurationError(
        "An enrolled project configuration input changed while it was being read.",
      );
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function canonicalUtf8(bytes: Buffer, label: string): string {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    configurationError(`${label} must contain valid UTF-8.`);
  }
  if (value.includes("\0") || !Buffer.from(value, "utf8").equals(bytes)) {
    configurationError(`${label} must contain canonical UTF-8 without NUL bytes.`);
  }
  return value;
}

function assertRealDirectory(path: string, label: string): string {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory() || realpathSync(path) !== path) {
    configurationError(`${label} must be a real directory without symbolic-link traversal.`);
  }
  return path;
}

function ensurePrivateRuntimeDirectory(path: string, label: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const real = assertRealDirectory(path, label);
  const stats = lstatSync(real);
  if (
    (stats.mode & PRIVATE_FILE_MODE_MASK) !== 0 ||
    (typeof process.getuid === "function" && stats.uid !== process.getuid())
  ) {
    configurationError(`${label} must be private to the current user.`);
  }
  return real;
}

function assertTrustedSystemExecutable(path: string, label: string): string {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    realpathSync(path) !== path ||
    stats.uid !== 0 ||
    (stats.mode & 0o022) !== 0
  ) {
    configurationError(`${label} must be an immutable root-owned system executable.`);
  }
  if ((stats.mode & 0o111) === 0) configurationError(`${label} is not executable.`);
  return path;
}

export function runBoundedGit(cwd: string, args: readonly string[]): Buffer {
  const result = spawnSync(GIT, ["--no-pager", "--literal-pathspecs", "-C", cwd, ...args], {
    cwd,
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_PAGER: "cat",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    },
    maxBuffer: MAX_GIT_PROBE_BYTES,
    shell: false,
    timeout: 5_000,
  });
  if (result.error !== undefined || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    configurationError("An enrolled project pinned-base verification probe failed closed.");
  }
  return result.stdout;
}

/**
 * Confirms the mutable source repository still contains the exact pinned
 * base commit/tree captured at enrollment. This is the same fail-closed
 * pinning discipline the byte-pinned Swift Greeter fixture uses, generalized
 * to any repository: the fixture hardcodes the full reviewed tree and
 * re-derives its base commit from `HEAD`, while an enrolled project instead
 * pins its base commit/tree in config and this function proves the source
 * repository has not diverged from (or never actually contained) that exact
 * enrollment point.
 */
function verifyPinnedBase(
  sourceRepositoryPath: string,
  baseCommit: string,
  baseTree: string,
): void {
  assertTrustedSystemExecutable(GIT, "The Git executable");
  const resolvedCommit = canonicalUtf8(
    runBoundedGit(sourceRepositoryPath, ["rev-parse", "--verify", `${baseCommit}^{commit}`]),
    "The enrolled project base commit",
  ).trim();
  if (resolvedCommit !== baseCommit) {
    configurationError(
      "The enrolled project source repository does not contain the exact pinned base commit.",
    );
  }
  const resolvedTree = canonicalUtf8(
    runBoundedGit(sourceRepositoryPath, ["rev-parse", "--verify", `${baseCommit}^{tree}`]),
    "The enrolled project base tree",
  ).trim();
  if (resolvedTree !== baseTree) {
    configurationError(
      "The enrolled project pinned base commit no longer resolves to the exact pinned base tree.",
    );
  }
}

function parseTaskSemantics(value: unknown): EnrolledProjectConfigurationV1["taskSemantics"] {
  if (!isRecord(value)) configurationError("taskSemantics must be an object.");
  exactKeys(value, ["title", "objective", "acceptanceCriteria"], "taskSemantics");
  const title = boundedText(value.title, "taskSemantics.title", 200);
  const objective = boundedText(value.objective, "taskSemantics.objective", 20_000);
  if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length < 1) {
    configurationError("taskSemantics.acceptanceCriteria must be a non-empty array.");
  }
  if (value.acceptanceCriteria.length > 50) {
    configurationError("taskSemantics.acceptanceCriteria must contain at most 50 entries.");
  }
  const acceptanceCriteria = value.acceptanceCriteria.map((criterion, index) => {
    const parsed = AcceptanceCriterionV1Schema.safeParse(criterion);
    if (!parsed.success) {
      configurationError(`taskSemantics.acceptanceCriteria[${String(index)}] is invalid.`);
    }
    return parsed.data;
  });
  return { title, objective, acceptanceCriteria };
}

function parseCandidatePolicyLimits(
  value: unknown,
): EnrolledProjectConfigurationV1["candidatePolicyLimits"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) configurationError("candidatePolicyLimits must be an object.");
  const keys = Object.keys(value);
  if (
    keys.length < 1 ||
    keys.some((key) => key !== "maxChangedFileBytes" && key !== "maxDiffBytes")
  ) {
    configurationError(
      "candidatePolicyLimits must contain only maxChangedFileBytes and/or maxDiffBytes.",
    );
  }
  const result: { maxChangedFileBytes?: number; maxDiffBytes?: number } = {};
  if (value.maxChangedFileBytes !== undefined) {
    result.maxChangedFileBytes = boundedPositiveInteger(
      value.maxChangedFileBytes,
      "candidatePolicyLimits.maxChangedFileBytes",
      MAX_CANDIDATE_POLICY_LIMIT_BYTES,
    );
  }
  if (value.maxDiffBytes !== undefined) {
    result.maxDiffBytes = boundedPositiveInteger(
      value.maxDiffBytes,
      "candidatePolicyLimits.maxDiffBytes",
      MAX_CANDIDATE_POLICY_LIMIT_BYTES,
    );
  }
  return result;
}

function parseProtectedPathPolicyExtensionRef(
  value: unknown,
): EnrolledProjectConfigurationV1["protectedPathPolicyExtension"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    configurationError("protectedPathPolicyExtension must be an object.");
  }
  exactKeys(value, ["file", "digest"], "protectedPathPolicyExtension");
  const file = normalizedAbsolutePath(value.file, "protectedPathPolicyExtension.file");
  const digest = Sha256DigestSchema.safeParse(value.digest);
  if (!digest.success) {
    configurationError("protectedPathPolicyExtension.digest must be a SHA-256 digest.");
  }
  return { file, digest: digest.data };
}

function parseEnvironment(value: unknown, label: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) configurationError(`${label} must be an object.`);
  const allowed = new Set<string>(CODEX_PROFILE_ENVIRONMENT_NAMES);
  const entries = Object.entries(value);
  if (entries.length > allowed.size) {
    configurationError(`${label} must not exceed the reviewed environment allowlist.`);
  }
  const result: Record<string, string> = {};
  for (const [name, entryValue] of entries) {
    if (!allowed.has(name)) {
      configurationError(
        `${label} contains a name outside the reviewed environment allowlist: ${name}`,
      );
    }
    result[name] = boundedText(entryValue, `${label}.${name}`, MAX_ENVIRONMENT_VALUE_LENGTH);
  }
  return result;
}

function parseProtectedFiles(value: unknown, label: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) configurationError(`${label} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length > MAX_PROTECTED_FILES) {
    configurationError(`${label} must contain at most ${String(MAX_PROTECTED_FILES)} entries.`);
  }
  const result: Record<string, string> = {};
  for (const [path, digest] of entries) {
    const parsedPath = RelativePathSchema.safeParse(path);
    if (!parsedPath.success)
      configurationError(`${label} contains an invalid relative path: ${path}`);
    const parsedDigest = Sha256DigestSchema.safeParse(digest);
    if (!parsedDigest.success) configurationError(`${label}[${path}] must be a SHA-256 digest.`);
    result[parsedPath.data] = parsedDigest.data;
  }
  return result;
}

function parseVerificationPlan(value: unknown, index: number): TrustedVerificationPlanTemplate {
  if (!isRecord(value))
    configurationError(`verificationPlans[${String(index)}] must be an object.`);
  const label = `verificationPlans[${String(index)}]`;
  exactKeys(
    value,
    [
      "args",
      "checkId",
      "environment",
      "executable",
      "maxStderrBytes",
      "maxStdoutBytes",
      "protectedFiles",
      "terminationGraceMs",
      "timeoutMs",
      "toolVersions",
    ],
    label,
  );
  const checkId = NamespacedCodeSchema.safeParse(value.checkId);
  if (!checkId.success) configurationError(`${label}.checkId must be a namespaced code.`);
  const executable = assertTrustedSystemExecutable(
    normalizedAbsolutePath(value.executable, `${label}.executable`),
    `${label}.executable`,
  );
  if (
    !Array.isArray(value.args) ||
    value.args.length < 1 ||
    value.args.length > MAX_VERIFICATION_ARGS
  ) {
    configurationError(`${label}.args must be a bounded non-empty array.`);
  }
  const args = value.args.map((argument, argumentIndex) =>
    boundedText(argument, `${label}.args[${String(argumentIndex)}]`, MAX_ARG_LENGTH),
  );
  assertVerificationArgsTemplate(args);
  const environment = parseEnvironment(value.environment, `${label}.environment`);
  const protectedFiles = parseProtectedFiles(value.protectedFiles, `${label}.protectedFiles`);
  const timeoutMs = boundedPositiveInteger(value.timeoutMs, `${label}.timeoutMs`, MAX_TIMEOUT_MS);
  const terminationGraceMs = boundedPositiveInteger(
    value.terminationGraceMs,
    `${label}.terminationGraceMs`,
    MAX_TERMINATION_GRACE_MS,
  );
  const maxStdoutBytes = boundedPositiveInteger(
    value.maxStdoutBytes,
    `${label}.maxStdoutBytes`,
    MAX_OUTPUT_BYTES,
  );
  const maxStderrBytes = boundedPositiveInteger(
    value.maxStderrBytes,
    `${label}.maxStderrBytes`,
    MAX_OUTPUT_BYTES,
  );
  if (!Array.isArray(value.toolVersions) || value.toolVersions.length < 1) {
    configurationError(`${label}.toolVersions must be a non-empty array.`);
  }
  if (value.toolVersions.length > MAX_TOOL_VERSIONS) {
    configurationError(
      `${label}.toolVersions must contain at most ${String(MAX_TOOL_VERSIONS)} entries.`,
    );
  }
  const toolVersions = value.toolVersions.map((tool, toolIndex) => {
    const parsed = ToolVersionV1Schema.safeParse(tool);
    if (!parsed.success)
      configurationError(`${label}.toolVersions[${String(toolIndex)}] is invalid.`);
    return parsed.data;
  });
  return {
    checkId: checkId.data,
    executable,
    args,
    environment,
    protectedFiles,
    timeoutMs,
    terminationGraceMs,
    maxStdoutBytes,
    maxStderrBytes,
    toolVersions,
  };
}

function parseVerificationPlans(value: unknown): readonly TrustedVerificationPlanTemplate[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_VERIFICATION_PLANS) {
    configurationError("verificationPlans must be a bounded non-empty array.");
  }
  const plans = value.map((plan, index) => parseVerificationPlan(plan, index));
  const checkIds = new Set(plans.map((plan) => plan.checkId));
  if (checkIds.size !== plans.length) {
    configurationError("verificationPlans must use unique check IDs.");
  }
  return plans;
}

function parseReviewer(value: unknown): EnrolledProjectConfigurationV1["reviewer"] {
  if (!isRecord(value)) configurationError("reviewer must be an object.");
  exactKeys(value, ["reviewerId", "reviewerVersion"], "reviewer");
  const reviewerId = NamespacedCodeSchema.safeParse(value.reviewerId);
  if (!reviewerId.success) configurationError("reviewer.reviewerId must be a namespaced code.");
  const reviewerVersion = boundedText(value.reviewerVersion, "reviewer.reviewerVersion", 100);
  return { reviewerId: reviewerId.data, reviewerVersion };
}

function parseConfiguration(bytes: Buffer): EnrolledProjectConfigurationV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalUtf8(bytes, "The enrolled project configuration")) as unknown;
  } catch (error) {
    if (error instanceof EnrolledProjectExecutionConfigurationError) throw error;
    configurationError("The enrolled project configuration must contain valid JSON.");
  }
  if (!isRecord(parsed))
    configurationError("The enrolled project configuration must be an object.");
  const requiredTopLevelKeys = [
    "allowedBaseCommit",
    "allowedBaseTree",
    "mode",
    "policyFile",
    "repositoryId",
    "reviewer",
    "schemaVersion",
    "sourceRepositoryPath",
    "taskSemantics",
    "verificationPlans",
  ];
  const optionalTopLevelKeys = ["candidatePolicyLimits", "protectedPathPolicyExtension"];
  const actualTopLevelKeys = Object.keys(parsed);
  const missingTopLevelKeys = requiredTopLevelKeys.filter(
    (key) => !actualTopLevelKeys.includes(key),
  );
  const unknownTopLevelKeys = actualTopLevelKeys.filter(
    (key) => !requiredTopLevelKeys.includes(key) && !optionalTopLevelKeys.includes(key),
  );
  if (missingTopLevelKeys.length > 0 || unknownTopLevelKeys.length > 0) {
    configurationError("The enrolled project configuration has an unsupported or non-exact shape.");
  }
  if (parsed.schemaVersion !== 1 || parsed.mode !== "enrolled-project-v1") {
    configurationError("The enrolled project configuration has an unsupported schema or mode.");
  }
  const repositoryId = RepositoryIdSchema.safeParse(parsed.repositoryId);
  if (!repositoryId.success) configurationError("repositoryId must be a valid repository ID.");
  const allowedBaseCommit = GitObjectIdSchema.safeParse(parsed.allowedBaseCommit);
  if (!allowedBaseCommit.success) configurationError("allowedBaseCommit must be a Git object ID.");
  const allowedBaseTree = GitObjectIdSchema.safeParse(parsed.allowedBaseTree);
  if (!allowedBaseTree.success) configurationError("allowedBaseTree must be a Git object ID.");
  if (allowedBaseCommit.data.length !== allowedBaseTree.data.length) {
    configurationError("allowedBaseCommit and allowedBaseTree must use the same object format.");
  }
  const candidatePolicyLimits = parseCandidatePolicyLimits(parsed.candidatePolicyLimits);
  const protectedPathPolicyExtension = parseProtectedPathPolicyExtensionRef(
    parsed.protectedPathPolicyExtension,
  );
  return {
    schemaVersion: 1,
    mode: "enrolled-project-v1",
    repositoryId: repositoryId.data,
    sourceRepositoryPath: normalizedAbsolutePath(
      parsed.sourceRepositoryPath,
      "sourceRepositoryPath",
    ),
    allowedBaseCommit: allowedBaseCommit.data,
    allowedBaseTree: allowedBaseTree.data,
    policyFile: normalizedAbsolutePath(parsed.policyFile, "policyFile"),
    taskSemantics: parseTaskSemantics(parsed.taskSemantics),
    ...(candidatePolicyLimits === undefined ? {} : { candidatePolicyLimits }),
    ...(protectedPathPolicyExtension === undefined ? {} : { protectedPathPolicyExtension }),
    verificationPlans: parseVerificationPlans(parsed.verificationPlans),
    reviewer: parseReviewer(parsed.reviewer),
  };
}

/**
 * A generic, project-agnostic reviewer: it proves the independent-review
 * port is wired to the immutable Factory mirror by reading the exact
 * candidate tree the coordinator is about to commit, and fails closed if
 * that tree cannot be read back. It intentionally applies no project-specific
 * correctness judgement (no exact-content matching, no build tooling) -
 * that is real review logic for a specific enrolled project, deferred to a
 * later task. This mode proves the mechanism only.
 */
export function genericProjectReviewer(
  mirrorPath: string,
  reviewer: EnrolledProjectConfigurationV1["reviewer"],
  reviewerRunId: RunId,
): IndependentReviewAdapter {
  return {
    reviewerId: reviewer.reviewerId,
    reviewerVersion: reviewer.reviewerVersion,
    reviewerRunId,
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
    review: ({ reviewInputDigest, input }) => {
      const supportingDigest = input.rawEvidenceDigests.at(0);
      if (supportingDigest === undefined) {
        throw new Error("The enrolled-project reviewer requires bound raw evidence");
      }
      const result = spawnSync(
        GIT,
        ["--git-dir", mirrorPath, "ls-tree", "-r", input.candidateTree],
        {
          encoding: null,
          env: {
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_PAGER: "cat",
            GIT_TERMINAL_PROMPT: "0",
            LANG: "C",
            LC_ALL: "C",
            PATH: "/usr/bin:/bin",
            TZ: "UTC",
          },
          maxBuffer: MAX_GIT_PROBE_BYTES,
          shell: false,
        },
      );
      const readable =
        result.error === undefined && result.status === 0 && Buffer.isBuffer(result.stdout);
      return {
        schemaVersion: 1,
        reviewerId: reviewer.reviewerId,
        reviewerVersion: reviewer.reviewerVersion,
        reviewInputDigest,
        verdict: readable ? "pass" : "changes-required",
        findings: readable
          ? []
          : [
              {
                schemaVersion: 1,
                findingId: REVIEWER_FINDING_ID,
                ruleId: "enrolled-project.candidate-unreadable",
                category: "quality.correctness",
                severity: "p1",
                title: "Candidate tree could not be read from the Factory mirror",
                description:
                  "The read-only enrolled-project reviewer could not read the candidate tree back from the immutable Factory mirror.",
                locations: [],
                supportingArtifactDigests: [supportingDigest],
              },
            ],
      };
    },
  };
}

/**
 * Loads one enrolled project's mirror, policy, verification plans, and
 * reviewer from config, pinning everything to the exact enrollment-captured
 * base commit/tree. It applies the same fail-closed pinning discipline as
 * the byte-pinned Swift Greeter fixture, generalized to any repository: no
 * per-project correctness is hardcoded here, only structural, bounded,
 * digest-validated config. The returned binding excludes the agent; the
 * profile that wraps this binding (currently `enrolled-codex-v1`) attaches a
 * concrete agent and its invocation identity.
 */
export function loadEnrolledProjectExecutionConfiguration(
  configurationPath: string,
  runtimeDirectory: string,
): EnrolledProjectBindingV1 {
  const path = normalizedAbsolutePath(configurationPath, "APP_FACTORY_LOCAL_EXECUTION_CONFIG");
  const runtime = normalizedAbsolutePath(runtimeDirectory, "runtimeDirectory");
  const config = parseConfiguration(readBoundedRegularFile(path, MAX_CONFIGURATION_BYTES));
  assertRealDirectory(config.sourceRepositoryPath, "sourceRepositoryPath");
  verifyPinnedBase(config.sourceRepositoryPath, config.allowedBaseCommit, config.allowedBaseTree);
  const policy = decodeReviewedPolicyPayload(
    readBoundedRegularFile(config.policyFile, MAX_REVIEWED_POLICY_BYTES),
  );
  // Pin the reviewed extension to its exact bytes the same way the reviewed
  // policy payload above is pinned to a digest: read the exact file, decode
  // and strictly validate it, then fail closed if it does not match the
  // digest recorded in this project's own load-time configuration.
  const protectedPathPolicyExtension: ProtectedPathPolicyExtensionV1 | undefined =
    config.protectedPathPolicyExtension === undefined
      ? undefined
      : ((): ProtectedPathPolicyExtensionV1 => {
          const decoded = decodeProtectedPathPolicyExtension(
            readBoundedRegularFile(
              config.protectedPathPolicyExtension.file,
              MAX_PROTECTED_PATH_POLICY_EXTENSION_BYTES,
            ),
          );
          if (decoded.digest !== config.protectedPathPolicyExtension.digest) {
            configurationError(
              "The enrolled project protected-path policy extension does not match its pinned digest.",
            );
          }
          return decoded.extension;
        })();
  const executionPaths = resolveVerifiedLocalExecutionPaths(runtime);
  ensurePrivateRuntimeDirectory(runtime, "The Factory runtime directory");
  ensurePrivateRuntimeDirectory(join(runtime, "local-execution"), "The local execution root");
  ensurePrivateRuntimeDirectory(executionPaths.gitRuntimeRoot, "The Git execution root");
  const sourceIdentityDigest: Sha256Digest = sha256Digest(
    Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        mode: "enrolled-project-v1",
        repositoryId: config.repositoryId,
        sourceRepositoryPath: config.sourceRepositoryPath,
        baseCommit: config.allowedBaseCommit,
        baseTree: config.allowedBaseTree,
      })}\n`,
      "utf8",
    ),
  );
  const gitWorkspace = new GitWorkspaceManager({ gitExecutable: GIT });
  const immutableMirrorInput = {
    repositoryId: config.repositoryId,
    sourceRepositoryPath: config.sourceRepositoryPath,
    sourceIdentityDigest,
    runtimeRoot: executionPaths.gitRuntimeRoot,
    baseCommit: config.allowedBaseCommit,
    baseTree: config.allowedBaseTree,
  } as const;
  const mirror = gitWorkspace.prepareImmutableMirror(immutableMirrorInput, () => {
    verifyPinnedBase(config.sourceRepositoryPath, config.allowedBaseCommit, config.allowedBaseTree);
  });
  return {
    gitExecutable: GIT,
    project: {
      repositoryId: config.repositoryId,
      sourceRepositoryPath: config.sourceRepositoryPath,
      mirrorMode: "prepared-immutable",
      sourceIdentityDigest,
      allowedBaseCommit: config.allowedBaseCommit,
      allowedBaseTree: config.allowedBaseTree,
      taskSemanticProfileDigest: computeTaskSemanticProfileDigest(config.taskSemantics),
      policyBytes: policy.bytes,
      reviewerForRun: (reviewerRunId) =>
        genericProjectReviewer(mirror.mirrorPath, config.reviewer, reviewerRunId),
      verificationPlans: config.verificationPlans,
      ...(config.candidatePolicyLimits === undefined
        ? {}
        : { candidatePolicyLimits: config.candidatePolicyLimits }),
      ...(protectedPathPolicyExtension === undefined ? {} : { protectedPathPolicyExtension }),
    },
  };
}
