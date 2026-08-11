import { isAbsolute } from "node:path";

import {
  AgentEventV1Schema,
  AttemptIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  RepositoryIdSchema,
  ReviewReportV1Schema,
  RunIdSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
  ToolVersionV1Schema,
  VerificationClaimsV1Schema,
  type AttemptId,
  type AgentEventV1,
  type GitObjectId,
  type IsoInstant,
  type RepositoryId,
  type ReviewReportV1,
  type RunId,
  type Sha256Digest,
  type VerificationClaimsV1,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import type {
  BrokerCommitRecord,
  FactoryMirror,
  GitWorkspaceManager,
  NormalizedCandidatePolicy,
} from "@app-factory/git-workspace";
import { normalizeCandidatePolicy } from "@app-factory/git-workspace";
import {
  computeReviewInputDigest,
  parseIndependentReviewInput,
  type IndependentReviewInput,
} from "@app-factory/independent-review";
import type { TrustedVerificationPlan } from "@app-factory/trusted-verifier";

import { canonicalDigest, canonicalJsonBytes, sha256Digest } from "./canonical.js";
import { parseBrokerCommit, parseCandidateVerification } from "./checkpoint.js";

export class ExecutionEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionEvidenceError";
  }
}

export type TrustedTestRecordV1 = Readonly<{
  schemaVersion: 1;
  planDigest: Sha256Digest;
  claims: VerificationClaimsV1;
  stdoutDigest: Sha256Digest;
  stderrDigest: Sha256Digest;
}>;

export type TrustedTestBundleV1 = Readonly<{
  schemaVersion: 1;
  candidateTree: GitObjectId;
  verificationPlanBundleDigest: Sha256Digest;
  recordDigests: readonly Sha256Digest[];
}>;

export type TrustedVerificationPlanTemplateV1 = Omit<
  TrustedVerificationPlan,
  "checkoutDirectory" | "expectedTree"
>;

export type TrustedVerificationPlanBundleV1 = Readonly<{
  schemaVersion: 1;
  plans: readonly TrustedVerificationPlanTemplateV1[];
}>;

export type ReviewerDescriptorV1 = Readonly<{
  schemaVersion: 1;
  reviewerId: string;
  reviewerVersion: string;
  reviewerRunId: RunId;
  capabilities: Readonly<{
    readCandidate: true;
    writeCandidate: false;
    mutatePolicy: false;
    approveRelease: false;
  }>;
}>;

export type ExecutionSemanticInputV1 = Readonly<{
  schemaVersion: 1;
  attemptId: AttemptId;
  taskSpecDigest: Sha256Digest;
  policyDigest: Sha256Digest;
  eventDigest: Sha256Digest;
  implementingRunId: RunId;
  reviewerRunId: RunId;
  repositoryId: RepositoryId;
  baseCommit: GitObjectId;
  candidatePolicyArtifactDigest: Sha256Digest;
  verificationPlanBundleDigest: Sha256Digest;
  reviewerDescriptorArtifactDigest: Sha256Digest;
}>;

export type PreReviewEvidenceBundleV1 = Readonly<{
  schemaVersion: 1;
  taskSpecArtifactDigest: Sha256Digest;
  policyArtifactDigest: Sha256Digest;
  candidatePolicyArtifactDigest: Sha256Digest;
  verificationPlanBundleDigest: Sha256Digest;
  reviewerDescriptorArtifactDigest: Sha256Digest;
  candidateVerificationArtifactDigest: Sha256Digest;
  candidatePatchArtifactDigest: Sha256Digest;
  testDigest: Sha256Digest;
  eventDigest: Sha256Digest;
}>;

export type ExecutionEvidenceIndexV1 = Readonly<{
  schemaVersion: 1;
  attemptId: AttemptId;
  fence: number;
  inputDigest: Sha256Digest;
  repositoryId: RepositoryId;
  implementingRunId: RunId;
  reviewerRunId: RunId;
  taskSpecDigest: Sha256Digest;
  taskSpecArtifactDigest: Sha256Digest;
  policyDigest: Sha256Digest;
  policyArtifactDigest: Sha256Digest;
  candidatePolicyArtifactDigest: Sha256Digest;
  verificationPlanBundleDigest: Sha256Digest;
  reviewerDescriptorArtifactDigest: Sha256Digest;
  baseCommit: GitObjectId;
  candidateTree: GitObjectId;
  treeDigest: Sha256Digest;
  diffDigest: Sha256Digest;
  candidateVerificationArtifactDigest: Sha256Digest;
  candidatePatchArtifactDigest: Sha256Digest;
  testDigest: Sha256Digest;
  preReviewBundleDigest: Sha256Digest;
  reviewInputArtifactDigest: Sha256Digest;
  reviewDigest: Sha256Digest;
  commitSha: GitObjectId;
  commitDigest: Sha256Digest;
  commitRecordDigest: Sha256Digest;
  eventDigest: Sha256Digest;
  createdAt: IsoInstant;
}>;

export type VerifiedExecutionEvidence = Readonly<{
  indexDigest: Sha256Digest;
  index: ExecutionEvidenceIndexV1;
  review: ReviewReportV1;
  brokerCommit: BrokerCommitRecord;
  testCount: number;
}>;

export function parseAgentEventLogBytes(
  bytesInput: Uint8Array,
  expected: Readonly<{
    attemptId: AttemptId;
    implementingRunId: RunId;
    maximumFence: number;
  }>,
): readonly AgentEventV1[] {
  const bytes = Buffer.from(bytesInput);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new ExecutionEvidenceError(
      `Agent event log is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(value) || value.length < 2 || value.length > 1_000_000) {
    throw new ExecutionEvidenceError("Agent event log must be a bounded non-empty run sequence");
  }
  const events = value.map((event) => AgentEventV1Schema.parse(event));
  if (!canonicalJsonBytes(events).equals(bytes)) {
    throw new ExecutionEvidenceError("Agent event log is not canonically encoded");
  }
  const first = events[0] as AgentEventV1;
  const last = events.at(-1) as AgentEventV1;
  const eventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (
      event.eventId === undefined ||
      eventIds.has(event.eventId) ||
      event.sequence !== index + 1 ||
      event.attemptId !== expected.attemptId ||
      event.runId !== expected.implementingRunId ||
      event.stepId !== first.stepId ||
      event.fence !== first.fence ||
      event.fence > expected.maximumFence ||
      (index > 0 && event.occurredAt < (events[index - 1] as AgentEventV1).occurredAt)
    ) {
      throw new ExecutionEvidenceError("Agent event log identity or ordering is invalid");
    }
    eventIds.add(event.eventId);
  }
  if (
    first.type !== "agent.started" ||
    last.type !== "agent.finished" ||
    last.data.status !== "succeeded" ||
    events.filter((event) => event.type === "agent.started").length !== 1 ||
    events.filter((event) => event.type === "agent.finished").length !== 1
  ) {
    throw new ExecutionEvidenceError(
      "Agent event log must contain one start and one successful terminal event",
    );
  }
  return events;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ExecutionEvidenceError(`${label} has unexpected or missing fields`);
  }
}

function parseFence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ExecutionEvidenceError("Evidence fence must be a non-negative safe integer");
  }
  return value as number;
}

function parseStringRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) throw new ExecutionEvidenceError(`${label} must be an object`);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || key.includes("\0") || typeof item !== "string" || item.includes("\0")) {
      throw new ExecutionEvidenceError(`${label} contains an invalid entry`);
    }
    result[key] = item;
  }
  return result;
}

function parsePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ExecutionEvidenceError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

export function parseTrustedVerificationPlanBundle(
  value: unknown,
): TrustedVerificationPlanBundleV1 {
  if (!isRecord(value)) {
    throw new ExecutionEvidenceError("Trusted verification plan bundle must be an object");
  }
  exactKeys(value, ["schemaVersion", "plans"], "Trusted verification plan bundle");
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.plans) ||
    value.plans.length < 1 ||
    value.plans.length > 100
  ) {
    throw new ExecutionEvidenceError("Trusted verification plan bundle has an invalid shape");
  }
  const checkIds = new Set<string>();
  const plans = value.plans.map((item): TrustedVerificationPlanTemplateV1 => {
    if (!isRecord(item)) throw new ExecutionEvidenceError("Trusted plan must be an object");
    exactKeys(
      item,
      [
        "checkId",
        "executable",
        "args",
        "environment",
        "protectedFiles",
        "timeoutMs",
        "terminationGraceMs",
        "maxStdoutBytes",
        "maxStderrBytes",
        "toolVersions",
      ],
      "Trusted plan",
    );
    const checkId = NamespacedCodeSchema.parse(item.checkId);
    if (checkIds.has(checkId)) {
      throw new ExecutionEvidenceError(`Duplicate trusted plan check ID: ${checkId}`);
    }
    checkIds.add(checkId);
    if (
      typeof item.executable !== "string" ||
      !isAbsolute(item.executable) ||
      item.executable.includes("\0") ||
      !Array.isArray(item.args) ||
      item.args.length > 64 ||
      item.args.some((argument) => typeof argument !== "string" || argument.includes("\0")) ||
      !Array.isArray(item.toolVersions) ||
      item.toolVersions.length > 50
    ) {
      throw new ExecutionEvidenceError(`Trusted plan ${checkId} has invalid command data`);
    }
    const protectedFiles = parseStringRecord(item.protectedFiles, "Protected-file map");
    for (const digest of Object.values(protectedFiles)) Sha256DigestSchema.parse(digest);
    return {
      checkId,
      executable: item.executable,
      args: item.args as readonly string[],
      environment: parseStringRecord(item.environment, "Verification environment"),
      protectedFiles,
      timeoutMs: parsePositiveInteger(item.timeoutMs, "timeoutMs"),
      terminationGraceMs: parsePositiveInteger(item.terminationGraceMs, "terminationGraceMs"),
      maxStdoutBytes: parsePositiveInteger(item.maxStdoutBytes, "maxStdoutBytes"),
      maxStderrBytes: parsePositiveInteger(item.maxStderrBytes, "maxStderrBytes"),
      toolVersions: item.toolVersions.map((tool) => ToolVersionV1Schema.parse(tool)),
    };
  });
  return { schemaVersion: 1, plans };
}

export function parseReviewerDescriptor(value: unknown): ReviewerDescriptorV1 {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Reviewer descriptor must be an object");
  exactKeys(
    value,
    ["schemaVersion", "reviewerId", "reviewerVersion", "reviewerRunId", "capabilities"],
    "Reviewer descriptor",
  );
  if (!isRecord(value.capabilities)) {
    throw new ExecutionEvidenceError("Reviewer capabilities must be an object");
  }
  exactKeys(
    value.capabilities,
    ["readCandidate", "writeCandidate", "mutatePolicy", "approveRelease"],
    "Reviewer capabilities",
  );
  if (
    value.schemaVersion !== 1 ||
    typeof value.reviewerVersion !== "string" ||
    value.reviewerVersion.length < 1 ||
    value.reviewerVersion.length > 100 ||
    value.reviewerVersion.trim() !== value.reviewerVersion ||
    value.capabilities.readCandidate !== true ||
    value.capabilities.writeCandidate !== false ||
    value.capabilities.mutatePolicy !== false ||
    value.capabilities.approveRelease !== false
  ) {
    throw new ExecutionEvidenceError("Reviewer descriptor is not strictly read-only");
  }
  return {
    schemaVersion: 1,
    reviewerId: NamespacedCodeSchema.parse(value.reviewerId),
    reviewerVersion: value.reviewerVersion,
    reviewerRunId: RunIdSchema.parse(value.reviewerRunId),
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
  };
}

export function parseNormalizedCandidatePolicy(value: unknown): NormalizedCandidatePolicy {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Candidate policy must be an object");
  exactKeys(value, ["authorizedScopes", "maxChangedFileBytes", "maxDiffBytes"], "Candidate policy");
  if (
    !Array.isArray(value.authorizedScopes) ||
    value.authorizedScopes.some((scope) => typeof scope !== "string")
  ) {
    throw new ExecutionEvidenceError("Candidate policy scopes are invalid");
  }
  const parsed = normalizeCandidatePolicy({
    authorizedScopes: value.authorizedScopes as readonly string[],
    maxChangedFileBytes: parsePositiveInteger(value.maxChangedFileBytes, "maxChangedFileBytes"),
    maxDiffBytes: parsePositiveInteger(value.maxDiffBytes, "maxDiffBytes"),
  });
  if (!canonicalJsonBytes(parsed).equals(canonicalJsonBytes(value))) {
    throw new ExecutionEvidenceError("Candidate policy is not canonically normalized");
  }
  return parsed;
}

export function parseExecutionSemanticInput(value: unknown): ExecutionSemanticInputV1 {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Semantic input must be an object");
  exactKeys(
    value,
    [
      "schemaVersion",
      "attemptId",
      "taskSpecDigest",
      "policyDigest",
      "eventDigest",
      "implementingRunId",
      "reviewerRunId",
      "repositoryId",
      "baseCommit",
      "candidatePolicyArtifactDigest",
      "verificationPlanBundleDigest",
      "reviewerDescriptorArtifactDigest",
    ],
    "Semantic input",
  );
  if (value.schemaVersion !== 1) {
    throw new ExecutionEvidenceError("Semantic input has an unsupported version");
  }
  const implementingRunId = RunIdSchema.parse(value.implementingRunId);
  const reviewerRunId = RunIdSchema.parse(value.reviewerRunId);
  if (implementingRunId === reviewerRunId) {
    throw new ExecutionEvidenceError("Semantic input cannot self-review");
  }
  return {
    schemaVersion: 1,
    attemptId: AttemptIdSchema.parse(value.attemptId),
    taskSpecDigest: Sha256DigestSchema.parse(value.taskSpecDigest),
    policyDigest: Sha256DigestSchema.parse(value.policyDigest),
    eventDigest: Sha256DigestSchema.parse(value.eventDigest),
    implementingRunId,
    reviewerRunId,
    repositoryId: RepositoryIdSchema.parse(value.repositoryId),
    baseCommit: GitObjectIdSchema.parse(value.baseCommit),
    candidatePolicyArtifactDigest: Sha256DigestSchema.parse(value.candidatePolicyArtifactDigest),
    verificationPlanBundleDigest: Sha256DigestSchema.parse(value.verificationPlanBundleDigest),
    reviewerDescriptorArtifactDigest: Sha256DigestSchema.parse(
      value.reviewerDescriptorArtifactDigest,
    ),
  };
}

export function computeExecutionInputDigest(value: unknown): Sha256Digest {
  return canonicalDigest(parseExecutionSemanticInput(value));
}

export function parseTrustedTestRecord(value: unknown): TrustedTestRecordV1 {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Test record must be an object");
  exactKeys(
    value,
    ["schemaVersion", "planDigest", "claims", "stdoutDigest", "stderrDigest"],
    "Test record",
  );
  if (value.schemaVersion !== 1) {
    throw new ExecutionEvidenceError("Test record has an unsupported schema version");
  }
  return {
    schemaVersion: 1,
    planDigest: Sha256DigestSchema.parse(value.planDigest),
    claims: VerificationClaimsV1Schema.parse(value.claims),
    stdoutDigest: Sha256DigestSchema.parse(value.stdoutDigest),
    stderrDigest: Sha256DigestSchema.parse(value.stderrDigest),
  };
}

export function parseTrustedTestBundle(value: unknown): TrustedTestBundleV1 {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Test bundle must be an object");
  exactKeys(
    value,
    ["schemaVersion", "candidateTree", "verificationPlanBundleDigest", "recordDigests"],
    "Test bundle",
  );
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.recordDigests) ||
    value.recordDigests.length < 1 ||
    value.recordDigests.length > 100
  ) {
    throw new ExecutionEvidenceError("Test bundle has an invalid shape");
  }
  const recordDigests = value.recordDigests.map((item) => Sha256DigestSchema.parse(item));
  if (new Set(recordDigests).size !== recordDigests.length) {
    throw new ExecutionEvidenceError("Test bundle contains duplicate records");
  }
  return {
    schemaVersion: 1,
    candidateTree: GitObjectIdSchema.parse(value.candidateTree),
    verificationPlanBundleDigest: Sha256DigestSchema.parse(value.verificationPlanBundleDigest),
    recordDigests,
  };
}

export function parsePreReviewBundle(value: unknown): PreReviewEvidenceBundleV1 {
  if (!isRecord(value)) {
    throw new ExecutionEvidenceError("Pre-review evidence bundle must be an object");
  }
  exactKeys(
    value,
    [
      "schemaVersion",
      "taskSpecArtifactDigest",
      "policyArtifactDigest",
      "candidatePolicyArtifactDigest",
      "verificationPlanBundleDigest",
      "reviewerDescriptorArtifactDigest",
      "candidateVerificationArtifactDigest",
      "candidatePatchArtifactDigest",
      "testDigest",
      "eventDigest",
    ],
    "Pre-review evidence bundle",
  );
  if (value.schemaVersion !== 1) {
    throw new ExecutionEvidenceError("Pre-review evidence bundle has an invalid version");
  }
  return {
    schemaVersion: 1,
    taskSpecArtifactDigest: Sha256DigestSchema.parse(value.taskSpecArtifactDigest),
    policyArtifactDigest: Sha256DigestSchema.parse(value.policyArtifactDigest),
    candidatePolicyArtifactDigest: Sha256DigestSchema.parse(value.candidatePolicyArtifactDigest),
    verificationPlanBundleDigest: Sha256DigestSchema.parse(value.verificationPlanBundleDigest),
    reviewerDescriptorArtifactDigest: Sha256DigestSchema.parse(
      value.reviewerDescriptorArtifactDigest,
    ),
    candidateVerificationArtifactDigest: Sha256DigestSchema.parse(
      value.candidateVerificationArtifactDigest,
    ),
    candidatePatchArtifactDigest: Sha256DigestSchema.parse(value.candidatePatchArtifactDigest),
    testDigest: Sha256DigestSchema.parse(value.testDigest),
    eventDigest: Sha256DigestSchema.parse(value.eventDigest),
  };
}

export function parseExecutionEvidenceIndex(value: unknown): ExecutionEvidenceIndexV1 {
  if (!isRecord(value)) throw new ExecutionEvidenceError("Evidence index must be an object");
  exactKeys(
    value,
    [
      "schemaVersion",
      "attemptId",
      "fence",
      "inputDigest",
      "repositoryId",
      "implementingRunId",
      "reviewerRunId",
      "taskSpecDigest",
      "taskSpecArtifactDigest",
      "policyDigest",
      "policyArtifactDigest",
      "candidatePolicyArtifactDigest",
      "verificationPlanBundleDigest",
      "reviewerDescriptorArtifactDigest",
      "baseCommit",
      "candidateTree",
      "treeDigest",
      "diffDigest",
      "candidateVerificationArtifactDigest",
      "candidatePatchArtifactDigest",
      "testDigest",
      "preReviewBundleDigest",
      "reviewInputArtifactDigest",
      "reviewDigest",
      "commitSha",
      "commitDigest",
      "commitRecordDigest",
      "eventDigest",
      "createdAt",
    ],
    "Evidence index",
  );
  if (value.schemaVersion !== 1) {
    throw new ExecutionEvidenceError("Evidence index has an unsupported schema version");
  }
  return {
    schemaVersion: 1,
    attemptId: AttemptIdSchema.parse(value.attemptId),
    fence: parseFence(value.fence),
    inputDigest: Sha256DigestSchema.parse(value.inputDigest),
    repositoryId: RepositoryIdSchema.parse(value.repositoryId),
    implementingRunId: RunIdSchema.parse(value.implementingRunId),
    reviewerRunId: RunIdSchema.parse(value.reviewerRunId),
    taskSpecDigest: Sha256DigestSchema.parse(value.taskSpecDigest),
    taskSpecArtifactDigest: Sha256DigestSchema.parse(value.taskSpecArtifactDigest),
    policyDigest: Sha256DigestSchema.parse(value.policyDigest),
    policyArtifactDigest: Sha256DigestSchema.parse(value.policyArtifactDigest),
    candidatePolicyArtifactDigest: Sha256DigestSchema.parse(value.candidatePolicyArtifactDigest),
    verificationPlanBundleDigest: Sha256DigestSchema.parse(value.verificationPlanBundleDigest),
    reviewerDescriptorArtifactDigest: Sha256DigestSchema.parse(
      value.reviewerDescriptorArtifactDigest,
    ),
    baseCommit: GitObjectIdSchema.parse(value.baseCommit),
    candidateTree: GitObjectIdSchema.parse(value.candidateTree),
    treeDigest: Sha256DigestSchema.parse(value.treeDigest),
    diffDigest: Sha256DigestSchema.parse(value.diffDigest),
    candidateVerificationArtifactDigest: Sha256DigestSchema.parse(
      value.candidateVerificationArtifactDigest,
    ),
    candidatePatchArtifactDigest: Sha256DigestSchema.parse(value.candidatePatchArtifactDigest),
    testDigest: Sha256DigestSchema.parse(value.testDigest),
    preReviewBundleDigest: Sha256DigestSchema.parse(value.preReviewBundleDigest),
    reviewInputArtifactDigest: Sha256DigestSchema.parse(value.reviewInputArtifactDigest),
    reviewDigest: Sha256DigestSchema.parse(value.reviewDigest),
    commitSha: GitObjectIdSchema.parse(value.commitSha),
    commitDigest: Sha256DigestSchema.parse(value.commitDigest),
    commitRecordDigest: Sha256DigestSchema.parse(value.commitRecordDigest),
    eventDigest: Sha256DigestSchema.parse(value.eventDigest),
    createdAt: IsoInstantSchema.parse(value.createdAt),
  };
}

function readCanonicalJson(
  evidenceStore: EvidenceStore,
  digest: Sha256Digest,
  label: string,
): unknown {
  const bytes = evidenceStore.readBlob(digest);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new ExecutionEvidenceError(
      `${label} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!canonicalJsonBytes(value).equals(bytes)) {
    throw new ExecutionEvidenceError(`${label} is not canonically encoded`);
  }
  return value;
}

function assertSame(value: unknown, expected: unknown, label: string): void {
  if (!canonicalJsonBytes(value).equals(canonicalJsonBytes(expected))) {
    throw new ExecutionEvidenceError(`${label} does not match its evidence binding`);
  }
}

export function verifyTrustedTestEvidence(
  input: Readonly<{
    evidenceStore: EvidenceStore;
    testBundleDigest: Sha256Digest;
    candidateTree: GitObjectId;
    verificationPlanBundle: TrustedVerificationPlanBundleV1;
    verificationPlanBundleDigest: Sha256Digest;
  }>,
): Readonly<{ testCount: number; rawEvidenceDigests: readonly Sha256Digest[] }> {
  const planBundle = parseTrustedVerificationPlanBundle(input.verificationPlanBundle);
  if (canonicalDigest(planBundle) !== input.verificationPlanBundleDigest) {
    throw new ExecutionEvidenceError("Trusted verification plan bundle digest is invalid");
  }
  const testBundle = parseTrustedTestBundle(
    readCanonicalJson(input.evidenceStore, input.testBundleDigest, "Test bundle"),
  );
  if (
    testBundle.candidateTree !== input.candidateTree ||
    testBundle.verificationPlanBundleDigest !== input.verificationPlanBundleDigest ||
    testBundle.recordDigests.length !== planBundle.plans.length
  ) {
    throw new ExecutionEvidenceError("Test bundle targets the wrong tree or verification plan");
  }
  const rawEvidenceDigests: Sha256Digest[] = [input.testBundleDigest];
  for (const [recordIndex, digest] of testBundle.recordDigests.entries()) {
    const plan = planBundle.plans[recordIndex];
    if (plan === undefined) {
      throw new ExecutionEvidenceError("Trusted test record has no corresponding plan");
    }
    const record = parseTrustedTestRecord(
      readCanonicalJson(input.evidenceStore, digest, "Trusted test record"),
    );
    input.evidenceStore.readBlob(record.stdoutDigest);
    input.evidenceStore.readBlob(record.stderrDigest);
    rawEvidenceDigests.push(digest, record.stdoutDigest, record.stderrDigest);
    if (
      record.planDigest !== canonicalDigest(plan) ||
      record.claims.checkId !== plan.checkId ||
      !canonicalJsonBytes(record.claims.argv).equals(
        canonicalJsonBytes([plan.executable, ...plan.args]),
      ) ||
      !canonicalJsonBytes(record.claims.toolVersions).equals(
        canonicalJsonBytes(plan.toolVersions),
      ) ||
      !record.claims.passed ||
      record.claims.exitCode !== 0 ||
      record.claims.checkoutTree !== input.candidateTree
    ) {
      throw new ExecutionEvidenceError(
        "Trusted test record did not execute its bound plan on the candidate tree",
      );
    }
  }
  return {
    testCount: testBundle.recordDigests.length,
    rawEvidenceDigests: [...new Set(rawEvidenceDigests)],
  };
}

export function verifyIndependentReviewEvidence(
  input: Readonly<{
    evidenceStore: EvidenceStore;
    reviewInputArtifactDigest: Sha256Digest;
    reviewReportDigest: Sha256Digest;
    expectedReviewInput: IndependentReviewInput;
    reviewerDescriptor: ReviewerDescriptorV1;
  }>,
): ReviewReportV1 {
  const reviewInput = parseIndependentReviewInput(
    readCanonicalJson(input.evidenceStore, input.reviewInputArtifactDigest, "Review input"),
  );
  assertSame(reviewInput, input.expectedReviewInput, "Independent review input");
  const report = ReviewReportV1Schema.parse(
    readCanonicalJson(input.evidenceStore, input.reviewReportDigest, "Review report"),
  );
  if (
    report.reviewerId !== input.reviewerDescriptor.reviewerId ||
    report.reviewerVersion !== input.reviewerDescriptor.reviewerVersion ||
    report.reviewInputDigest !== computeReviewInputDigest(reviewInput) ||
    report.verdict !== "pass" ||
    report.findings.some((finding) => finding.severity === "p0" || finding.severity === "p1")
  ) {
    throw new ExecutionEvidenceError("Independent review evidence is invalid or non-passing");
  }
  const availableEvidence = new Set(reviewInput.rawEvidenceDigests);
  for (const finding of report.findings) {
    for (const digest of finding.supportingArtifactDigests) {
      if (!availableEvidence.has(digest)) {
        throw new ExecutionEvidenceError("Review cites evidence outside its bound input");
      }
    }
  }
  return report;
}

export function verifyExecutionEvidenceIndex(
  input: Readonly<{
    indexDigest: Sha256Digest;
    evidenceStore: EvidenceStore;
    gitWorkspace: GitWorkspaceManager;
    mirror: FactoryMirror;
  }>,
): VerifiedExecutionEvidence {
  const indexDigest = Sha256DigestSchema.parse(input.indexDigest);
  const index = parseExecutionEvidenceIndex(
    readCanonicalJson(input.evidenceStore, indexDigest, "Evidence index"),
  );

  const taskSpecBytes = input.evidenceStore.readBlob(index.taskSpecArtifactDigest);
  if (
    index.taskSpecArtifactDigest !== index.taskSpecDigest ||
    sha256Digest(taskSpecBytes) !== index.taskSpecDigest
  ) {
    throw new ExecutionEvidenceError("TaskSpec digest binding is invalid");
  }
  const taskSpec = TaskSpecV1Schema.parse(JSON.parse(taskSpecBytes.toString("utf8")) as unknown);
  if (!canonicalJsonBytes(taskSpec).equals(taskSpecBytes)) {
    throw new ExecutionEvidenceError("TaskSpec evidence is not canonically encoded");
  }
  const policyBytes = input.evidenceStore.readBlob(index.policyArtifactDigest);
  if (
    index.policyArtifactDigest !== index.policyDigest ||
    sha256Digest(policyBytes) !== index.policyDigest ||
    taskSpec.policyDigest !== index.policyDigest
  ) {
    throw new ExecutionEvidenceError("Policy digest binding is invalid");
  }
  if (
    taskSpec.base.commit !== index.baseCommit ||
    taskSpec.base.repositoryId !== index.repositoryId ||
    input.mirror.repositoryId !== index.repositoryId
  ) {
    throw new ExecutionEvidenceError("TaskSpec repository/base does not match the evidence index");
  }

  const candidatePolicy = parseNormalizedCandidatePolicy(
    readCanonicalJson(input.evidenceStore, index.candidatePolicyArtifactDigest, "Candidate policy"),
  );
  const expectedScopes = normalizeCandidatePolicy({
    authorizedScopes: taskSpec.requestedScope.paths,
    maxChangedFileBytes: candidatePolicy.maxChangedFileBytes,
    maxDiffBytes: candidatePolicy.maxDiffBytes,
  }).authorizedScopes;
  assertSame(candidatePolicy.authorizedScopes, expectedScopes, "Task candidate scopes");

  const verificationPlanBundle = parseTrustedVerificationPlanBundle(
    readCanonicalJson(
      input.evidenceStore,
      index.verificationPlanBundleDigest,
      "Trusted verification plan bundle",
    ),
  );
  const reviewerDescriptor = parseReviewerDescriptor(
    readCanonicalJson(
      input.evidenceStore,
      index.reviewerDescriptorArtifactDigest,
      "Reviewer descriptor",
    ),
  );
  if (
    reviewerDescriptor.reviewerRunId !== index.reviewerRunId ||
    index.implementingRunId === index.reviewerRunId
  ) {
    throw new ExecutionEvidenceError("Reviewer execution identity is invalid");
  }
  const recomputedInputDigest = computeExecutionInputDigest({
    schemaVersion: 1,
    attemptId: index.attemptId,
    taskSpecDigest: index.taskSpecDigest,
    policyDigest: index.policyDigest,
    eventDigest: index.eventDigest,
    implementingRunId: index.implementingRunId,
    reviewerRunId: index.reviewerRunId,
    repositoryId: index.repositoryId,
    baseCommit: index.baseCommit,
    candidatePolicyArtifactDigest: index.candidatePolicyArtifactDigest,
    verificationPlanBundleDigest: index.verificationPlanBundleDigest,
    reviewerDescriptorArtifactDigest: index.reviewerDescriptorArtifactDigest,
  });
  if (recomputedInputDigest !== index.inputDigest) {
    throw new ExecutionEvidenceError("Semantic execution input digest is invalid");
  }

  const candidate = parseCandidateVerification(
    readCanonicalJson(
      input.evidenceStore,
      index.candidateVerificationArtifactDigest,
      "Candidate verification",
    ),
  );
  input.gitWorkspace.verifyCandidateObject(input.mirror, candidate, candidatePolicy);
  if (
    candidate.attemptId !== index.attemptId ||
    candidate.baseSha !== index.baseCommit ||
    candidate.candidateTreeId !== index.candidateTree ||
    candidate.treeDigest !== index.treeDigest ||
    candidate.diffDigest !== index.diffDigest
  ) {
    throw new ExecutionEvidenceError("Candidate Git evidence does not match the index");
  }
  const candidatePatch = input.evidenceStore.readBlob(index.candidatePatchArtifactDigest);
  const observedPatch = input.gitWorkspace.readVerifiedCandidatePatch(
    input.mirror,
    candidate,
    candidatePolicy,
  );
  if (!candidatePatch.equals(observedPatch)) {
    throw new ExecutionEvidenceError("Candidate patch evidence does not match Git");
  }

  const testBundle = parseTrustedTestBundle(
    readCanonicalJson(input.evidenceStore, index.testDigest, "Test bundle"),
  );
  if (
    testBundle.candidateTree !== index.candidateTree ||
    testBundle.verificationPlanBundleDigest !== index.verificationPlanBundleDigest ||
    testBundle.recordDigests.length !== verificationPlanBundle.plans.length
  ) {
    throw new ExecutionEvidenceError("Test bundle targets the wrong tree or verification plan");
  }
  const rawTestEvidence: Sha256Digest[] = [index.testDigest];
  for (const [recordIndex, digest] of testBundle.recordDigests.entries()) {
    const plan = verificationPlanBundle.plans[recordIndex];
    if (plan === undefined) {
      throw new ExecutionEvidenceError("Trusted test record has no corresponding plan");
    }
    const record = parseTrustedTestRecord(
      readCanonicalJson(input.evidenceStore, digest, "Trusted test record"),
    );
    input.evidenceStore.readBlob(record.stdoutDigest);
    input.evidenceStore.readBlob(record.stderrDigest);
    rawTestEvidence.push(digest, record.stdoutDigest, record.stderrDigest);
    if (
      record.planDigest !== canonicalDigest(plan) ||
      record.claims.checkId !== plan.checkId ||
      !canonicalJsonBytes(record.claims.argv).equals(
        canonicalJsonBytes([plan.executable, ...plan.args]),
      ) ||
      !canonicalJsonBytes(record.claims.toolVersions).equals(
        canonicalJsonBytes(plan.toolVersions),
      ) ||
      !record.claims.passed ||
      record.claims.exitCode !== 0 ||
      record.claims.checkoutTree !== index.candidateTree
    ) {
      throw new ExecutionEvidenceError(
        "Trusted test record did not execute its bound plan on the candidate tree",
      );
    }
  }

  const preReview = parsePreReviewBundle(
    readCanonicalJson(input.evidenceStore, index.preReviewBundleDigest, "Pre-review bundle"),
  );
  assertSame(
    preReview,
    {
      schemaVersion: 1,
      taskSpecArtifactDigest: index.taskSpecArtifactDigest,
      policyArtifactDigest: index.policyArtifactDigest,
      candidatePolicyArtifactDigest: index.candidatePolicyArtifactDigest,
      verificationPlanBundleDigest: index.verificationPlanBundleDigest,
      reviewerDescriptorArtifactDigest: index.reviewerDescriptorArtifactDigest,
      candidateVerificationArtifactDigest: index.candidateVerificationArtifactDigest,
      candidatePatchArtifactDigest: index.candidatePatchArtifactDigest,
      testDigest: index.testDigest,
      eventDigest: index.eventDigest,
    },
    "Pre-review bundle",
  );
  parseAgentEventLogBytes(input.evidenceStore.readBlob(index.eventDigest), {
    attemptId: index.attemptId,
    implementingRunId: index.implementingRunId,
    maximumFence: index.fence,
  });

  const reviewInput = parseIndependentReviewInput(
    readCanonicalJson(input.evidenceStore, index.reviewInputArtifactDigest, "Review input"),
  );
  const report = ReviewReportV1Schema.parse(
    readCanonicalJson(input.evidenceStore, index.reviewDigest, "Review report"),
  );
  const expectedRawEvidenceDigests = [
    ...new Set([
      index.taskSpecArtifactDigest,
      index.policyArtifactDigest,
      index.candidatePolicyArtifactDigest,
      index.verificationPlanBundleDigest,
      index.reviewerDescriptorArtifactDigest,
      index.candidateVerificationArtifactDigest,
      index.candidatePatchArtifactDigest,
      index.eventDigest,
      ...rawTestEvidence,
    ]),
  ];
  if (
    reviewInput.attemptId !== index.attemptId ||
    reviewInput.implementingRunId !== index.implementingRunId ||
    reviewInput.reviewerRunId !== index.reviewerRunId ||
    !canonicalJsonBytes(reviewInput.taskSpec).equals(canonicalJsonBytes(taskSpec)) ||
    reviewInput.candidateTree !== index.candidateTree ||
    reviewInput.diffDigest !== index.diffDigest ||
    reviewInput.policyDigest !== index.policyDigest ||
    reviewInput.evidenceManifestDigest !== index.preReviewBundleDigest ||
    !canonicalJsonBytes(reviewInput.rawEvidenceDigests).equals(
      canonicalJsonBytes(expectedRawEvidenceDigests),
    ) ||
    report.reviewerId !== reviewerDescriptor.reviewerId ||
    report.reviewerVersion !== reviewerDescriptor.reviewerVersion ||
    report.reviewInputDigest !== computeReviewInputDigest(reviewInput) ||
    report.verdict !== "pass" ||
    report.findings.some((finding) => finding.severity === "p0" || finding.severity === "p1")
  ) {
    throw new ExecutionEvidenceError("Independent review evidence is invalid or non-passing");
  }
  const availableEvidence = new Set(reviewInput.rawEvidenceDigests);
  for (const finding of report.findings) {
    for (const digest of finding.supportingArtifactDigests) {
      if (!availableEvidence.has(digest)) {
        throw new ExecutionEvidenceError("Review cites evidence outside its bound input");
      }
    }
  }

  const storedCommit = parseBrokerCommit(
    readCanonicalJson(input.evidenceStore, index.commitRecordDigest, "Broker commit record"),
  );
  const observedCommit = input.gitWorkspace.inspectBrokerCommit(input.mirror, {
    attemptId: index.attemptId,
    baseSha: index.baseCommit,
    candidateTreeId: index.candidateTree,
    diffDigest: index.diffDigest as `sha256:${string}`,
  });
  assertSame(storedCommit, observedCommit, "Broker commit record");
  if (
    observedCommit.commitSha !== index.commitSha ||
    observedCommit.commitDigest !== index.commitDigest
  ) {
    throw new ExecutionEvidenceError("Broker commit digest binding is invalid");
  }

  return {
    indexDigest,
    index,
    review: report,
    brokerCommit: observedCommit,
    testCount: testBundle.recordDigests.length,
  };
}

export function buildIndependentReviewInput(value: IndependentReviewInput): IndependentReviewInput {
  return parseIndependentReviewInput(value);
}
