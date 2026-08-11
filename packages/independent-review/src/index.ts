import { createHash } from "node:crypto";

import {
  AttemptIdSchema,
  GitObjectIdSchema,
  NamespacedCodeSchema,
  ReviewReportV1Schema,
  RunIdSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type GitObjectId,
  type ReviewReportV1,
  type RunId,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";

export class IndependentReviewError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IndependentReviewError";
  }
}

export type IndependentReviewInput = Readonly<{
  attemptId: AttemptId;
  implementingRunId: RunId;
  reviewerRunId: RunId;
  taskSpec: TaskSpecV1;
  candidateTree: GitObjectId;
  diffDigest: Sha256Digest;
  policyDigest: Sha256Digest;
  evidenceManifestDigest: Sha256Digest;
  rawEvidenceDigests: readonly Sha256Digest[];
}>;

export type IndependentReviewAdapter = Readonly<{
  reviewerId: string;
  reviewerVersion: string;
  reviewerRunId: string;
  capabilities: Readonly<{
    readCandidate: true;
    writeCandidate: false;
    mutatePolicy: false;
    approveRelease: false;
  }>;
  review(
    input: Readonly<{ reviewInputDigest: Sha256Digest; input: IndependentReviewInput }>,
  ): Promise<unknown> | unknown;
}>;

function canonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function computeReviewInputDigest(input: IndependentReviewInput): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical(input)).digest("hex")}`,
  );
}

export function parseIndependentReviewInput(input: unknown): IndependentReviewInput {
  if (input === null || typeof input !== "object") {
    throw new IndependentReviewError("Review input must be an object");
  }
  const value = input as Readonly<Record<string, unknown>>;
  const implementingRunId = RunIdSchema.parse(value.implementingRunId);
  const reviewerRunId = RunIdSchema.parse(value.reviewerRunId);
  if (implementingRunId === reviewerRunId) {
    throw new IndependentReviewError("The implementing run cannot review itself");
  }
  if (
    !Array.isArray(value.rawEvidenceDigests) ||
    value.rawEvidenceDigests.length < 1 ||
    value.rawEvidenceDigests.length > 1_000
  ) {
    throw new IndependentReviewError("rawEvidenceDigests must be a non-empty bounded array");
  }
  const rawEvidenceDigests = value.rawEvidenceDigests.map((digest) =>
    Sha256DigestSchema.parse(digest),
  );
  if (new Set(rawEvidenceDigests).size !== rawEvidenceDigests.length) {
    throw new IndependentReviewError("rawEvidenceDigests must not contain duplicates");
  }
  const taskSpec = TaskSpecV1Schema.parse(value.taskSpec);
  const policyDigest = Sha256DigestSchema.parse(value.policyDigest);
  if (taskSpec.policyDigest !== policyDigest) {
    throw new IndependentReviewError("Review policy digest does not match the TaskSpec");
  }
  return {
    attemptId: AttemptIdSchema.parse(value.attemptId),
    implementingRunId,
    reviewerRunId,
    taskSpec,
    candidateTree: GitObjectIdSchema.parse(value.candidateTree),
    diffDigest: Sha256DigestSchema.parse(value.diffDigest),
    policyDigest,
    evidenceManifestDigest: Sha256DigestSchema.parse(value.evidenceManifestDigest),
    rawEvidenceDigests,
  };
}

function assertAdapter(adapter: IndependentReviewAdapter, input: IndependentReviewInput): void {
  NamespacedCodeSchema.parse(adapter.reviewerId);
  if (
    adapter.reviewerVersion.length < 1 ||
    adapter.reviewerVersion.length > 100 ||
    adapter.reviewerVersion.trim() !== adapter.reviewerVersion
  ) {
    throw new IndependentReviewError("Reviewer version is invalid");
  }
  if (RunIdSchema.parse(adapter.reviewerRunId) !== input.reviewerRunId) {
    throw new IndependentReviewError("Reviewer run identity does not match the review input");
  }
  if (
    adapter.capabilities.readCandidate !== true ||
    adapter.capabilities.writeCandidate !== false ||
    adapter.capabilities.mutatePolicy !== false ||
    adapter.capabilities.approveRelease !== false
  ) {
    throw new IndependentReviewError("Reviewer must be strictly read-only and non-approving");
  }
}

export async function runIndependentReview(
  inputValue: unknown,
  adapter: IndependentReviewAdapter,
): Promise<ReviewReportV1> {
  const input = parseIndependentReviewInput(inputValue);
  assertAdapter(adapter, input);
  const reviewInputDigest = computeReviewInputDigest(input);
  const report = ReviewReportV1Schema.parse(await adapter.review({ reviewInputDigest, input }));
  if (report.reviewerId !== adapter.reviewerId) {
    throw new IndependentReviewError("Review report has the wrong reviewer identity");
  }
  if (report.reviewerVersion !== adapter.reviewerVersion) {
    throw new IndependentReviewError("Review report has the wrong reviewer version");
  }
  if (report.reviewInputDigest !== reviewInputDigest) {
    throw new IndependentReviewError("Review report is not bound to the supplied input");
  }
  const availableEvidence = new Set(input.rawEvidenceDigests);
  for (const finding of report.findings) {
    for (const digest of finding.supportingArtifactDigests) {
      if (!availableEvidence.has(digest)) {
        throw new IndependentReviewError(
          "Review finding cites evidence that was not supplied to the reviewer",
        );
      }
    }
  }
  const blockingFinding = report.findings.some(
    (finding) => finding.severity === "p0" || finding.severity === "p1",
  );
  if (report.verdict === "pass" && blockingFinding) {
    throw new IndependentReviewError("A passing report cannot contain a P0 or P1 finding");
  }
  if (report.verdict === "changes-required" && !blockingFinding) {
    throw new IndependentReviewError(
      "Changes-required must identify at least one P0 or P1 finding",
    );
  }
  return report;
}
