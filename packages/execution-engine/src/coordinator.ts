import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

import {
  AttemptIdSchema,
  ReviewReportV1Schema,
  RunIdSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
  VerificationClaimsV1Schema,
  type AttemptId,
  type IsoInstant,
  type ReviewReportV1,
  type RunId,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import type {
  BrokerCommitRecord,
  CandidatePolicy,
  CandidateVerification,
  FactoryMirror,
  FactoryWorkspaceRecord,
  GitWorkspaceManager,
} from "@app-factory/git-workspace";
import { normalizeCandidatePolicy } from "@app-factory/git-workspace";
import {
  computeReviewInputDigest,
  parseIndependentReviewInput,
  runIndependentReview,
  type IndependentReviewAdapter,
  type IndependentReviewInput,
} from "@app-factory/independent-review";
import {
  runTrustedVerification,
  type TrustedVerificationPlan,
  type TrustedVerificationRun,
} from "@app-factory/trusted-verifier";

import { canonicalDigest, canonicalJsonBytes, sha256Digest } from "./canonical.js";
import {
  EXECUTION_PHASES,
  parseExecutionCheckpoint,
  type ExecutionCheckpointPort,
  type ExecutionCheckpointV1,
  type ExecutionPhase,
} from "./checkpoint.js";
import {
  computeExecutionInputDigest,
  parseAgentEventLogBytes,
  parseReviewerDescriptor,
  parseTrustedVerificationPlanBundle,
  verifyIndependentReviewEvidence,
  verifyExecutionEvidenceIndex,
  verifyTrustedTestEvidence,
  type ExecutionSemanticInputV1,
  type ExecutionEvidenceIndexV1,
  type PreReviewEvidenceBundleV1,
  type ReviewerDescriptorV1,
  type TrustedTestBundleV1,
  type TrustedTestRecordV1,
  type TrustedVerificationPlanBundleV1,
  type VerifiedExecutionEvidence,
} from "./evidence-index.js";

export class VerifiedCommitCoordinatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifiedCommitCoordinatorError";
  }
}

export type TrustedVerificationPlanTemplate = Omit<
  TrustedVerificationPlan,
  "checkoutDirectory" | "expectedTree"
>;

export type CoordinatorFenceCheckpoint =
  | "before-input-publication"
  | "before-candidate-verification"
  | "after-candidate-verification"
  | "before-fence-adoption"
  | "before-tests"
  | "after-tests"
  | "before-test-bundle-publication"
  | "before-review-evidence-publication"
  | "before-review"
  | "after-review"
  | "before-candidate-checkpoint"
  | "before-tests-checkpoint"
  | "before-review-checkpoint"
  | "before-commit"
  | "during-commit-mutation"
  | "after-commit"
  | "before-commit-checkpoint"
  | "before-evidence-publication"
  | "before-evidence-checkpoint";

export type CoordinatorSideEffect = "tests" | "review" | "commit" | "evidence";

export type VerifiedCommitCoordinatorInput = Readonly<{
  attemptId: AttemptId;
  fence: number;
  taskSpec: TaskSpecV1;
  taskSpecDigest: Sha256Digest;
  policyBytes: Uint8Array;
  eventLogBytes: Uint8Array;
  eventDigest: Sha256Digest;
  implementingRunId: RunId;
  reviewerRunId: RunId;
  mirror: FactoryMirror;
  attemptWorkspace: FactoryWorkspaceRecord;
  candidatePolicy: CandidatePolicy;
  verificationPlans: readonly TrustedVerificationPlanTemplate[];
  reviewer: IndependentReviewAdapter;
}>;

export type VerifiedCommitCoordinatorPorts = Readonly<{
  gitWorkspace: GitWorkspaceManager;
  evidenceStore: EvidenceStore;
  checkpoints: ExecutionCheckpointPort;
  assertActive(checkpoint: CoordinatorFenceCheckpoint): void;
  runVerification?: (
    plan: TrustedVerificationPlan,
  ) => Promise<TrustedVerificationRun> | TrustedVerificationRun;
  now?: () => Date;
  afterSideEffect?: (effect: CoordinatorSideEffect) => void;
}>;

export type VerifiedCommitCoordinatorResult = Readonly<{
  checkpoint: ExecutionCheckpointV1;
  commit: BrokerCommitRecord;
  evidence: VerifiedExecutionEvidence;
}>;

function phaseRank(phase: ExecutionPhase): number {
  return EXECUTION_PHASES.indexOf(phase);
}

function parseFence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new VerifiedCommitCoordinatorError("Fence must be a non-negative safe integer");
  }
  return value;
}

function nowInstant(now: () => Date): IsoInstant {
  const value = now().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new VerifiedCommitCoordinatorError("Clock did not produce a millisecond UTC instant");
  }
  return value as IsoInstant;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function normalizedScopes(scopes: readonly string[]): readonly string[] {
  return [
    ...new Set(scopes.map((scope) => (scope.endsWith("/") ? scope.slice(0, -1) : scope))),
  ].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function assertCandidatePolicyMatchesTask(taskSpec: TaskSpecV1, policy: CandidatePolicy): void {
  if (
    !sameCanonical(
      normalizedScopes(policy.authorizedScopes),
      normalizedScopes(taskSpec.requestedScope.paths),
    )
  ) {
    throw new VerifiedCommitCoordinatorError(
      "Candidate write scopes must exactly match the TaskSpec requested paths",
    );
  }
}

function safeVerificationTemplates(
  templates: readonly TrustedVerificationPlanTemplate[],
): readonly TrustedVerificationPlanTemplate[] {
  if (templates.length < 1 || templates.length > 100) {
    throw new VerifiedCommitCoordinatorError(
      "At least one bounded trusted verification is required",
    );
  }
  const checkIds = new Set<string>();
  const copied = templates.map((template) => {
    if (checkIds.has(template.checkId)) {
      throw new VerifiedCommitCoordinatorError(`Duplicate trusted check ID: ${template.checkId}`);
    }
    checkIds.add(template.checkId);
    if (!isAbsolute(template.executable)) {
      throw new VerifiedCommitCoordinatorError("Trusted verification executable must be absolute");
    }
    const executable = realpathSync(template.executable);
    if (!lstatSync(executable).isFile()) {
      throw new VerifiedCommitCoordinatorError(
        "Trusted verification executable must resolve to a regular file",
      );
    }
    return {
      checkId: template.checkId,
      executable,
      args: [...template.args],
      environment: { ...template.environment },
      protectedFiles: { ...template.protectedFiles },
      timeoutMs: template.timeoutMs,
      terminationGraceMs: template.terminationGraceMs,
      maxStdoutBytes: template.maxStdoutBytes,
      maxStderrBytes: template.maxStderrBytes,
      toolVersions: template.toolVersions.map((version) => ({ ...version })),
    };
  });
  return copied;
}

function putCanonical(evidenceStore: EvidenceStore, value: unknown): Sha256Digest {
  return evidenceStore.putBlob(canonicalJsonBytes(value));
}

function readCanonical(evidenceStore: EvidenceStore, digest: Sha256Digest, label: string): unknown {
  const bytes = evidenceStore.readBlob(digest);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new VerifiedCommitCoordinatorError(
      `${label} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!canonicalJsonBytes(value).equals(bytes)) {
    throw new VerifiedCommitCoordinatorError(`${label} is not canonically encoded`);
  }
  return value;
}

function assertPassingReport(report: ReviewReportV1): void {
  if (
    report.verdict !== "pass" ||
    report.findings.some((finding) => finding.severity === "p0" || finding.severity === "p1")
  ) {
    throw new VerifiedCommitCoordinatorError(
      "Independent review did not produce an unambiguously passing report",
    );
  }
}

export async function coordinateVerifiedLocalCommit(
  inputValue: VerifiedCommitCoordinatorInput,
  ports: VerifiedCommitCoordinatorPorts,
): Promise<VerifiedCommitCoordinatorResult> {
  const taskSpec = TaskSpecV1Schema.parse(inputValue.taskSpec);
  const attemptId = AttemptIdSchema.parse(inputValue.attemptId);
  const fence = parseFence(inputValue.fence);
  const taskSpecDigest = Sha256DigestSchema.parse(inputValue.taskSpecDigest);
  const eventDigest = Sha256DigestSchema.parse(inputValue.eventDigest);
  const implementingRunId = RunIdSchema.parse(inputValue.implementingRunId);
  const reviewerRunId = RunIdSchema.parse(inputValue.reviewerRunId);
  if (implementingRunId === reviewerRunId) {
    throw new VerifiedCommitCoordinatorError("The implementing run cannot review itself");
  }
  if (inputValue.reviewer.reviewerRunId !== reviewerRunId) {
    throw new VerifiedCommitCoordinatorError("Reviewer adapter run identity is inconsistent");
  }
  if (
    inputValue.attemptWorkspace.kind !== "attempt" ||
    inputValue.attemptWorkspace.attemptId !== attemptId ||
    inputValue.attemptWorkspace.baseSha !== taskSpec.base.commit ||
    inputValue.mirror.repositoryId !== taskSpec.base.repositoryId ||
    inputValue.attemptWorkspace.mirrorPath !== inputValue.mirror.mirrorPath
  ) {
    throw new VerifiedCommitCoordinatorError(
      "Attempt workspace, mirror, and TaskSpec identities do not match",
    );
  }
  const candidatePolicy = normalizeCandidatePolicy(inputValue.candidatePolicy);
  assertCandidatePolicyMatchesTask(taskSpec, candidatePolicy);
  const verificationPlans = safeVerificationTemplates(inputValue.verificationPlans);
  const verificationPlanBundle: TrustedVerificationPlanBundleV1 =
    parseTrustedVerificationPlanBundle({
      schemaVersion: 1,
      plans: verificationPlans,
    });
  const reviewerDescriptor: ReviewerDescriptorV1 = parseReviewerDescriptor({
    schemaVersion: 1,
    reviewerId: inputValue.reviewer.reviewerId,
    reviewerVersion: inputValue.reviewer.reviewerVersion,
    reviewerRunId,
    capabilities: inputValue.reviewer.capabilities,
  });
  const taskSpecBytes = canonicalJsonBytes(taskSpec);
  if (sha256Digest(taskSpecBytes) !== taskSpecDigest) {
    throw new VerifiedCommitCoordinatorError("TaskSpec digest does not match its canonical bytes");
  }
  const policyBytes = Buffer.from(inputValue.policyBytes);
  const policyDigest = sha256Digest(policyBytes);
  if (policyDigest !== taskSpec.policyDigest) {
    throw new VerifiedCommitCoordinatorError(
      "Policy bytes do not match the TaskSpec policy digest",
    );
  }
  const eventBytes = Buffer.from(inputValue.eventLogBytes);
  if (sha256Digest(eventBytes) !== eventDigest) {
    throw new VerifiedCommitCoordinatorError("Event-log bytes do not match the supplied digest");
  }
  parseAgentEventLogBytes(eventBytes, {
    attemptId,
    implementingRunId,
    maximumFence: fence,
  });

  const candidatePolicyArtifactDigest = canonicalDigest(candidatePolicy);
  const verificationPlanBundleDigest = canonicalDigest(verificationPlanBundle);
  const reviewerDescriptorArtifactDigest = canonicalDigest(reviewerDescriptor);
  const semanticInput: ExecutionSemanticInputV1 = {
    schemaVersion: 1,
    attemptId,
    taskSpecDigest,
    policyDigest,
    eventDigest,
    implementingRunId,
    reviewerRunId,
    repositoryId: taskSpec.base.repositoryId,
    baseCommit: taskSpec.base.commit,
    candidatePolicyArtifactDigest,
    verificationPlanBundleDigest,
    reviewerDescriptorArtifactDigest,
  };
  const inputDigest = computeExecutionInputDigest(semanticInput);
  const now = ports.now ?? (() => new Date());
  const checkpointValue = ports.checkpoints.load(attemptId);
  let checkpoint = checkpointValue === null ? null : parseExecutionCheckpoint(checkpointValue);
  if (
    checkpoint !== null &&
    (checkpoint.attemptId !== attemptId ||
      checkpoint.inputDigest !== inputDigest ||
      checkpoint.fence > fence)
  ) {
    throw new VerifiedCommitCoordinatorError(
      "Durable checkpoint is bound to a different attempt or semantic input, or has a newer fence",
    );
  }
  ports.assertActive("before-input-publication");
  const taskSpecArtifactDigest = ports.evidenceStore.putBlob(taskSpecBytes);
  const policyArtifactDigest = ports.evidenceStore.putBlob(policyBytes);
  const storedEventDigest = ports.evidenceStore.putBlob(eventBytes);
  const storedCandidatePolicyDigest = putCanonical(ports.evidenceStore, candidatePolicy);
  const storedVerificationPlanDigest = putCanonical(ports.evidenceStore, verificationPlanBundle);
  const storedReviewerDescriptorDigest = putCanonical(ports.evidenceStore, reviewerDescriptor);
  if (
    taskSpecArtifactDigest !== taskSpecDigest ||
    policyArtifactDigest !== policyDigest ||
    storedEventDigest !== eventDigest ||
    storedCandidatePolicyDigest !== candidatePolicyArtifactDigest ||
    storedVerificationPlanDigest !== verificationPlanBundleDigest ||
    storedReviewerDescriptorDigest !== reviewerDescriptorArtifactDigest
  ) {
    throw new VerifiedCommitCoordinatorError("Content-addressed input publication disagreed");
  }

  const advance = (
    phase: ExecutionPhase,
    activeCheckpoint: CoordinatorFenceCheckpoint,
    fields: Readonly<{
      candidateVerification: CandidateVerification;
      candidateVerificationArtifactDigest: Sha256Digest;
      testBundleDigest: Sha256Digest | null;
      reviewInputArtifactDigest: Sha256Digest | null;
      reviewReportDigest: Sha256Digest | null;
      brokerCommit: BrokerCommitRecord | null;
      evidenceIndexDigest: Sha256Digest | null;
    }>,
  ): ExecutionCheckpointV1 => {
    const timestamp = nowInstant(now);
    const next = parseExecutionCheckpoint({
      schemaVersion: 1,
      attemptId,
      fence,
      inputDigest,
      revision: (checkpoint?.revision ?? 0) + 1,
      phase,
      ...fields,
      createdAt: checkpoint?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    ports.assertActive(activeCheckpoint);
    ports.checkpoints.compareAndSet(attemptId, checkpoint?.revision ?? null, next);
    checkpoint = next;
    return next;
  };

  ports.assertActive("before-candidate-verification");
  const candidate = ports.gitWorkspace.verifyCandidate(
    inputValue.attemptWorkspace,
    candidatePolicy,
  );
  if (candidate.changedPaths.length === 0) {
    throw new VerifiedCommitCoordinatorError(
      "A verified commit cannot be created for an empty candidate",
    );
  }
  ports.gitWorkspace.verifyCandidateObject(inputValue.mirror, candidate, candidatePolicy);
  ports.assertActive("after-candidate-verification");
  const candidatePatchArtifactDigest = ports.evidenceStore.putBlob(
    ports.gitWorkspace.readVerifiedCandidatePatch(inputValue.mirror, candidate, candidatePolicy),
  );
  const candidateVerificationArtifactDigest = putCanonical(ports.evidenceStore, candidate);
  if (checkpoint === null) {
    advance("candidate-verified", "before-candidate-checkpoint", {
      candidateVerification: candidate,
      candidateVerificationArtifactDigest,
      testBundleDigest: null,
      reviewInputArtifactDigest: null,
      reviewReportDigest: null,
      brokerCommit: null,
      evidenceIndexDigest: null,
    });
  } else if (
    !sameCanonical(checkpoint.candidateVerification, candidate) ||
    checkpoint.candidateVerificationArtifactDigest !== candidateVerificationArtifactDigest
  ) {
    throw new VerifiedCommitCoordinatorError(
      "Current candidate differs from the durable verified candidate",
    );
  }

  // Completion is historical evidence for the fence that performed it. A
  // later lease owner may need to reconcile that result after the daemon died
  // before updating kernel state, but must not rewrite the completed index with
  // its newer fence. Verify and return the immutable result instead.
  if (checkpoint?.phase === "completed") {
    if (checkpoint.evidenceIndexDigest === null || checkpoint.brokerCommit === null) {
      throw new VerifiedCommitCoordinatorError("Completed checkpoint is missing durable evidence");
    }
    ports.assertActive("before-evidence-publication");
    const verifiedEvidence = verifyExecutionEvidenceIndex({
      indexDigest: checkpoint.evidenceIndexDigest,
      evidenceStore: ports.evidenceStore,
      gitWorkspace: ports.gitWorkspace,
      mirror: inputValue.mirror,
    });
    if (
      verifiedEvidence.index.inputDigest !== inputDigest ||
      verifiedEvidence.index.fence !== checkpoint.fence ||
      verifiedEvidence.index.candidateVerificationArtifactDigest !==
        candidateVerificationArtifactDigest ||
      verifiedEvidence.index.candidatePatchArtifactDigest !== candidatePatchArtifactDigest ||
      !sameCanonical(verifiedEvidence.brokerCommit, checkpoint.brokerCommit)
    ) {
      throw new VerifiedCommitCoordinatorError(
        "Completed checkpoint does not match its immutable execution evidence",
      );
    }
    return {
      checkpoint,
      commit: verifiedEvidence.brokerCommit,
      evidence: verifiedEvidence,
    };
  }

  if (checkpoint !== null && checkpoint.fence < fence) {
    advance(checkpoint.phase, "before-fence-adoption", {
      candidateVerification: checkpoint.candidateVerification,
      candidateVerificationArtifactDigest: checkpoint.candidateVerificationArtifactDigest,
      testBundleDigest: checkpoint.testBundleDigest,
      reviewInputArtifactDigest: checkpoint.reviewInputArtifactDigest,
      reviewReportDigest: checkpoint.reviewReportDigest,
      brokerCommit: checkpoint.brokerCommit,
      evidenceIndexDigest: checkpoint.evidenceIndexDigest,
    });
  }

  if (checkpoint === null) {
    throw new VerifiedCommitCoordinatorError("Candidate checkpoint was not persisted");
  }

  let testBundleDigest = checkpoint.testBundleDigest;
  if (phaseRank(checkpoint.phase) < phaseRank("tests-passed")) {
    ports.assertActive("before-tests");
    const checkout = ports.gitWorkspace.createTrustedVerificationCheckout(
      inputValue.mirror,
      inputValue.attemptWorkspace,
      candidate,
    );
    const recordDigests: Sha256Digest[] = [];
    try {
      for (const template of verificationPlans) {
        const plan: TrustedVerificationPlan = {
          ...template,
          checkoutDirectory: checkout.worktreePath,
          expectedTree: candidate.candidateTreeId,
        };
        const result = await (ports.runVerification ?? runTrustedVerification)(plan);
        ports.assertActive("after-tests");
        const claims = VerificationClaimsV1Schema.parse(result.claims);
        const stdoutDigest = ports.evidenceStore.putBlob(result.stdout);
        const stderrDigest = ports.evidenceStore.putBlob(result.stderr);
        if (
          stdoutDigest !== result.stdoutDigest ||
          stderrDigest !== result.stderrDigest ||
          claims.checkId !== template.checkId ||
          !sameCanonical(claims.argv, [template.executable, ...template.args]) ||
          !sameCanonical(claims.toolVersions, template.toolVersions) ||
          !claims.passed ||
          claims.exitCode !== 0 ||
          claims.checkoutTree !== candidate.candidateTreeId ||
          result.timedOut ||
          result.outputLimitExceeded ||
          !result.protectedFilesUnchanged ||
          !result.checkoutCleanAfter
        ) {
          throw new VerifiedCommitCoordinatorError(
            `Trusted verification did not pass cleanly: ${claims.checkId}`,
          );
        }
        const record: TrustedTestRecordV1 = {
          schemaVersion: 1,
          planDigest: canonicalDigest(template),
          claims,
          stdoutDigest,
          stderrDigest,
        };
        recordDigests.push(putCanonical(ports.evidenceStore, record));
      }
      const bundle: TrustedTestBundleV1 = {
        schemaVersion: 1,
        candidateTree: candidate.candidateTreeId as TrustedTestBundleV1["candidateTree"],
        verificationPlanBundleDigest,
        recordDigests,
      };
      ports.assertActive("before-test-bundle-publication");
      testBundleDigest = putCanonical(ports.evidenceStore, bundle);
      ports.afterSideEffect?.("tests");
    } finally {
      ports.gitWorkspace.cleanupWorkspace(checkout);
    }
    advance("tests-passed", "before-tests-checkpoint", {
      candidateVerification: candidate,
      candidateVerificationArtifactDigest,
      testBundleDigest,
      reviewInputArtifactDigest: null,
      reviewReportDigest: null,
      brokerCommit: null,
      evidenceIndexDigest: null,
    });
  }
  if (testBundleDigest === null) {
    throw new VerifiedCommitCoordinatorError("Trusted test bundle is missing after test phase");
  }
  const verifiedTestEvidence = verifyTrustedTestEvidence({
    evidenceStore: ports.evidenceStore,
    testBundleDigest,
    candidateTree: candidate.candidateTreeId as TrustedTestBundleV1["candidateTree"],
    verificationPlanBundle,
    verificationPlanBundleDigest,
  });

  ports.assertActive("before-review-evidence-publication");
  const preReviewBundle: PreReviewEvidenceBundleV1 = {
    schemaVersion: 1,
    taskSpecArtifactDigest,
    policyArtifactDigest,
    candidatePolicyArtifactDigest,
    verificationPlanBundleDigest,
    reviewerDescriptorArtifactDigest,
    candidateVerificationArtifactDigest,
    candidatePatchArtifactDigest,
    testDigest: testBundleDigest,
    eventDigest,
  };
  const preReviewBundleDigest = putCanonical(ports.evidenceStore, preReviewBundle);
  const rawEvidenceDigests = [
    taskSpecArtifactDigest,
    policyArtifactDigest,
    candidatePolicyArtifactDigest,
    verificationPlanBundleDigest,
    reviewerDescriptorArtifactDigest,
    candidateVerificationArtifactDigest,
    candidatePatchArtifactDigest,
    eventDigest,
    ...verifiedTestEvidence.rawEvidenceDigests,
  ];
  const reviewInput: IndependentReviewInput = parseIndependentReviewInput({
    attemptId,
    implementingRunId,
    reviewerRunId,
    taskSpec,
    candidateTree: candidate.candidateTreeId,
    diffDigest: candidate.diffDigest,
    policyDigest,
    evidenceManifestDigest: preReviewBundleDigest,
    rawEvidenceDigests: [...new Set(rawEvidenceDigests)],
  });
  const expectedReviewInputArtifactDigest = putCanonical(ports.evidenceStore, reviewInput);
  let reviewInputArtifactDigest = checkpoint.reviewInputArtifactDigest;
  let reviewReportDigest = checkpoint.reviewReportDigest;
  let reviewReport: ReviewReportV1;
  if (phaseRank(checkpoint.phase) < phaseRank("review-passed")) {
    ports.assertActive("before-review");
    reviewReport = await runIndependentReview(reviewInput, inputValue.reviewer);
    ports.assertActive("after-review");
    assertPassingReport(reviewReport);
    reviewInputArtifactDigest = expectedReviewInputArtifactDigest;
    reviewReportDigest = putCanonical(ports.evidenceStore, reviewReport);
    ports.afterSideEffect?.("review");
    advance("review-passed", "before-review-checkpoint", {
      candidateVerification: candidate,
      candidateVerificationArtifactDigest,
      testBundleDigest,
      reviewInputArtifactDigest,
      reviewReportDigest,
      brokerCommit: null,
      evidenceIndexDigest: null,
    });
  } else {
    if (
      reviewInputArtifactDigest !== expectedReviewInputArtifactDigest ||
      reviewReportDigest === null
    ) {
      throw new VerifiedCommitCoordinatorError("Durable review evidence has the wrong binding");
    }
    reviewReport = ReviewReportV1Schema.parse(
      readCanonical(ports.evidenceStore, reviewReportDigest, "Review report"),
    );
    assertPassingReport(reviewReport);
    if (reviewReport.reviewInputDigest !== computeReviewInputDigest(reviewInput)) {
      throw new VerifiedCommitCoordinatorError("Review report input digest is stale");
    }
  }
  if (reviewInputArtifactDigest === null || reviewReportDigest === null) {
    throw new VerifiedCommitCoordinatorError("Independent review artifacts are missing");
  }
  verifyIndependentReviewEvidence({
    evidenceStore: ports.evidenceStore,
    reviewInputArtifactDigest,
    reviewReportDigest,
    expectedReviewInput: reviewInput,
    reviewerDescriptor,
  });

  let brokerCommit = checkpoint.brokerCommit;
  if (phaseRank(checkpoint.phase) < phaseRank("commit-created")) {
    ports.assertActive("before-commit");
    brokerCommit = ports.gitWorkspace.createOrReconcileBrokerCommit(
      inputValue.mirror,
      {
        attemptId,
        baseSha: candidate.baseSha,
        candidateTreeId: candidate.candidateTreeId,
        diffDigest: candidate.diffDigest,
      },
      () => ports.assertActive("during-commit-mutation"),
    );
    ports.assertActive("after-commit");
    ports.afterSideEffect?.("commit");
    advance("commit-created", "before-commit-checkpoint", {
      candidateVerification: candidate,
      candidateVerificationArtifactDigest,
      testBundleDigest,
      reviewInputArtifactDigest,
      reviewReportDigest,
      brokerCommit,
      evidenceIndexDigest: null,
    });
  } else {
    const observed = ports.gitWorkspace.inspectBrokerCommit(inputValue.mirror, {
      attemptId,
      baseSha: candidate.baseSha,
      candidateTreeId: candidate.candidateTreeId,
      diffDigest: candidate.diffDigest,
    });
    if (brokerCommit === null || !sameCanonical(brokerCommit, observed)) {
      throw new VerifiedCommitCoordinatorError("Durable broker commit does not match Git");
    }
    brokerCommit = observed;
  }
  if (brokerCommit === null) {
    throw new VerifiedCommitCoordinatorError("Broker commit is missing after commit phase");
  }

  ports.assertActive("before-evidence-publication");
  const commitRecordDigest = putCanonical(ports.evidenceStore, brokerCommit);
  const evidenceIndex: ExecutionEvidenceIndexV1 = {
    schemaVersion: 1,
    attemptId,
    fence,
    inputDigest,
    repositoryId: taskSpec.base.repositoryId,
    implementingRunId,
    reviewerRunId,
    taskSpecDigest,
    taskSpecArtifactDigest,
    policyDigest,
    policyArtifactDigest,
    candidatePolicyArtifactDigest,
    verificationPlanBundleDigest,
    reviewerDescriptorArtifactDigest,
    baseCommit: taskSpec.base.commit,
    candidateTree: candidate.candidateTreeId as ExecutionEvidenceIndexV1["candidateTree"],
    treeDigest: Sha256DigestSchema.parse(candidate.treeDigest),
    diffDigest: Sha256DigestSchema.parse(candidate.diffDigest),
    candidateVerificationArtifactDigest,
    candidatePatchArtifactDigest,
    testDigest: testBundleDigest,
    preReviewBundleDigest,
    reviewInputArtifactDigest,
    reviewDigest: reviewReportDigest,
    commitSha: brokerCommit.commitSha as ExecutionEvidenceIndexV1["commitSha"],
    commitDigest: Sha256DigestSchema.parse(brokerCommit.commitDigest),
    commitRecordDigest,
    eventDigest,
    createdAt: checkpoint.createdAt,
  };
  const evidenceIndexDigest = putCanonical(ports.evidenceStore, evidenceIndex);
  const verifiedEvidence = verifyExecutionEvidenceIndex({
    indexDigest: evidenceIndexDigest,
    evidenceStore: ports.evidenceStore,
    gitWorkspace: ports.gitWorkspace,
    mirror: inputValue.mirror,
  });
  if (phaseRank(checkpoint.phase) < phaseRank("completed")) {
    ports.afterSideEffect?.("evidence");
    advance("completed", "before-evidence-checkpoint", {
      candidateVerification: candidate,
      candidateVerificationArtifactDigest,
      testBundleDigest,
      reviewInputArtifactDigest,
      reviewReportDigest,
      brokerCommit,
      evidenceIndexDigest,
    });
  } else if (checkpoint.evidenceIndexDigest !== evidenceIndexDigest) {
    throw new VerifiedCommitCoordinatorError("Durable evidence index digest is inconsistent");
  }
  if (checkpoint === null) {
    throw new VerifiedCommitCoordinatorError("Completion checkpoint was not persisted");
  }
  return { checkpoint, commit: brokerCommit, evidence: verifiedEvidence };
}
