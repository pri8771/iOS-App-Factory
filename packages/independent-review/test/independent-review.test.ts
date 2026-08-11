import { randomUUID } from "node:crypto";

import {
  AttemptIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  RunIdSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
} from "@app-factory/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  IndependentReviewError,
  computeReviewInputDigest,
  parseIndependentReviewInput,
  runIndependentReview,
  type IndependentReviewAdapter,
  type IndependentReviewInput,
} from "../src/index.js";

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function input(overrides: Partial<IndependentReviewInput> = {}): IndependentReviewInput {
  const taskSpec = TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: randomUUID(),
    projectId: randomUUID(),
    createdAt: IsoInstantSchema.parse("2026-08-10T12:00:00.000Z"),
    title: "Review one candidate",
    objective: "Independently determine whether the bounded change is acceptable.",
    acceptanceCriteria: [
      {
        id: "reviewed",
        statement: "The candidate has independent structured review.",
        verification: "review",
      },
    ],
    base: { repositoryId: randomUUID(), commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/Feature.swift"] },
    policyDigest: digest("1"),
  });
  return {
    attemptId: AttemptIdSchema.parse(randomUUID()),
    implementingRunId: RunIdSchema.parse(randomUUID()),
    reviewerRunId: RunIdSchema.parse(randomUUID()),
    taskSpec,
    candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
    diffDigest: digest("2"),
    policyDigest: digest("1"),
    evidenceManifestDigest: digest("3"),
    rawEvidenceDigests: [digest("4"), digest("5")],
    ...overrides,
  };
}

function adapter(
  review: IndependentReviewAdapter["review"],
  reviewerRunId: string,
): IndependentReviewAdapter {
  return {
    reviewerId: "openai.codex-review",
    reviewerVersion: "1.0.0",
    reviewerRunId,
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
    review,
  };
}

describe("independent review", () => {
  it("binds a read-only report to exact task, diff, policy, and raw evidence", async () => {
    const reviewInput = input();
    const review = vi.fn(({ reviewInputDigest }) => ({
      schemaVersion: 1,
      reviewerId: "openai.codex-review",
      reviewerVersion: "1.0.0",
      reviewInputDigest,
      verdict: "pass",
      findings: [],
    }));

    const report = await runIndependentReview(
      reviewInput,
      adapter(review, reviewInput.reviewerRunId),
    );
    expect(report.verdict).toBe("pass");
    expect(report.reviewInputDigest).toBe(computeReviewInputDigest(reviewInput));
    expect(review).toHaveBeenCalledWith({
      reviewInputDigest: computeReviewInputDigest(reviewInput),
      input: reviewInput,
    });
  });

  it("rejects self-review and duplicate evidence", () => {
    const original = input();
    expect(() =>
      parseIndependentReviewInput({ ...original, reviewerRunId: original.implementingRunId }),
    ).toThrow(/cannot review itself/);
    expect(() =>
      parseIndependentReviewInput({
        ...original,
        rawEvidenceDigests: [digest("4"), digest("4")],
      }),
    ).toThrow(/duplicates/);
    expect(() => parseIndependentReviewInput({ ...original, policyDigest: digest("9") })).toThrow(
      /does not match the TaskSpec/,
    );
  });

  it("rejects a reviewer with mutation authority before invocation", async () => {
    const reviewInput = input();
    const review = vi.fn();
    const unsafe = {
      ...adapter(review, reviewInput.reviewerRunId),
      capabilities: {
        readCandidate: true,
        writeCandidate: true,
        mutatePolicy: false,
        approveRelease: false,
      },
    } as unknown as IndependentReviewAdapter;
    await expect(runIndependentReview(reviewInput, unsafe)).rejects.toThrow(/strictly read-only/);
    expect(review).not.toHaveBeenCalled();
  });

  it("rejects a report copied from another candidate", async () => {
    const reviewInput = input();
    const reportDigest = computeReviewInputDigest(input());
    await expect(
      runIndependentReview(
        reviewInput,
        adapter(
          () => ({
            schemaVersion: 1,
            reviewerId: "openai.codex-review",
            reviewerVersion: "1.0.0",
            reviewInputDigest: reportDigest,
            verdict: "pass",
            findings: [],
          }),
          reviewInput.reviewerRunId,
        ),
      ),
    ).rejects.toThrow(/not bound/);
  });

  it("rejects inconsistent verdict severity", async () => {
    const reviewInput = input();
    const baseReport = {
      schemaVersion: 1,
      reviewerId: "openai.codex-review",
      reviewerVersion: "1.0.0",
      reviewInputDigest: computeReviewInputDigest(reviewInput),
    } as const;
    const blockingFinding = {
      schemaVersion: 1,
      findingId: randomUUID(),
      ruleId: "review.scope",
      category: "quality.correctness",
      severity: "p1",
      title: "Candidate violates scope",
      description: "A protected input changed during implementation.",
      locations: [],
      supportingArtifactDigests: [],
    } as const;

    await expect(
      runIndependentReview(
        reviewInput,
        adapter(
          () => ({ ...baseReport, verdict: "pass", findings: [blockingFinding] }),
          reviewInput.reviewerRunId,
        ),
      ),
    ).rejects.toThrow(IndependentReviewError);

    await expect(
      runIndependentReview(
        reviewInput,
        adapter(
          () => ({ ...baseReport, verdict: "changes-required", findings: [] }),
          reviewInput.reviewerRunId,
        ),
      ),
    ).rejects.toThrow(/at least one P0 or P1/);
  });
});
