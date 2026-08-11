import { randomUUID } from "node:crypto";

import type { ApprovalV1 } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  bindLessonAdoptionProjectResult,
  bindLessonReplay,
  bindLessonReview,
  bindRegressionProjectResult,
  createPinnedLessonAdoptionVerifier,
  createPinnedLessonReviewVerifier,
  learningDigest,
  planLessonAdoption,
  proposeLesson,
  recordLessonAdoption,
  reviewLesson,
  type LessonAdoptionPlanV1,
  type LessonAdoptionProjectResultV1,
  type ReviewedLessonV1,
} from "../src/index.js";

const PROJECT = randomUUID();
const SECOND_PROJECT = randomUUID();
const FINDING = randomUUID();
const LESSON = randomUUID();
const IMPLEMENTER = randomUUID();
const REPLAYER = randomUUID();
const REVIEWER = randomUUID();
const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;
const DIGEST_C = `sha256:${"c".repeat(64)}` as const;
const T0 = "2026-08-10T12:00:00.000Z";
const T1 = "2026-08-11T12:00:00.000Z";
const T2 = "2026-08-12T12:00:00.000Z";

function closure() {
  return {
    schemaVersion: 1,
    finding: {
      schemaVersion: 1,
      findingId: FINDING,
      ruleId: "quality.ui.mixed-generation",
      category: "quality.ui",
      severity: "p0",
      title: "Mixed UI generations reached the public route graph",
      description: "A current shell rendered an earlier detail component.",
      locations: [{ path: "App/DecisionDetail.swift", lineStart: 10, lineEnd: 20 }],
      supportingArtifactDigests: [DIGEST_A],
    },
    rootCause: "Slice verification omitted whole-product route coherence.",
    escapeMechanism: "A feature screenshot passed without a route inventory or journey filmstrip.",
    regressionFixtureDigest: DIGEST_B,
    fixCommit: "a".repeat(40),
    regressionEvidenceDigest: DIGEST_C,
  } as const;
}

function proposal() {
  return proposeLesson({
    schemaVersion: 1,
    lessonId: LESSON,
    title: "Require one design generation across public routes",
    sourceProjectId: PROJECT,
    closures: [closure()],
    scope: "all-projects",
    currentPolicyDigest: DIGEST_A,
    proposedPolicyDigest: DIGEST_C,
    createdAt: T0,
  });
}

function replay(passed = true) {
  const value = proposal();
  const projectResult = bindRegressionProjectResult({
    projectId: PROJECT,
    candidateCommit: "a".repeat(40),
    passed,
  });
  return bindLessonReplay({
    schemaVersion: 1,
    proposalDigest: value.proposalDigest,
    fixtureDigest: DIGEST_B,
    baselinePolicyDigest: DIGEST_A,
    proposedPolicyDigest: DIGEST_C,
    implementerRunId: IMPLEMENTER,
    replayRunId: REPLAYER,
    baselineFailedAsExpected: true,
    proposedPolicyPassed: passed,
    projectResults: [projectResult],
    replayedAt: T1,
  });
}

function review(replayValue = replay()) {
  return bindLessonReview({
    schemaVersion: 1,
    proposalDigest: proposal().proposalDigest,
    replayEvidenceDigest: replayValue.evidenceDigest,
    implementerRunId: IMPLEMENTER,
    reviewerRunId: REVIEWER,
    verdict: "approved",
    reviewedAt: T1,
  });
}

function trustedReviewVerifier(replayValue = replay(), reviewValue = review(replayValue)) {
  return createPinnedLessonReviewVerifier({
    proposalDigest: proposal().proposalDigest,
    replayEvidenceDigest: replayValue.evidenceDigest,
    reviewEvidenceDigest: reviewValue.reviewEvidenceDigest,
  });
}

function approvedLesson(): ReviewedLessonV1 {
  return reviewLesson(proposal(), replay(), review(), trustedReviewVerifier());
}

function resultsFor(
  approved: ReviewedLessonV1,
  plan: LessonAdoptionPlanV1,
): LessonAdoptionProjectResultV1[] {
  return plan.targets.map((target) =>
    bindLessonAdoptionProjectResult({
      projectId: target.projectId,
      candidateCommit: "b".repeat(40),
      passed: true,
      lessonId: plan.lessonId,
      reviewedLessonDigest: approved.reviewedLessonDigest,
      proposalDigest: approved.proposalDigest,
      reviewEvidenceDigest: approved.reviewEvidenceDigest,
      scope: approved.lesson.scope,
      planDigest: plan.planDigest,
      proposedPolicyDigest: plan.proposedPolicyDigest,
      regressionFixtureDigest: approved.lesson.regressionFixtureDigest,
    }),
  );
}

function approvalsFor(
  plan: LessonAdoptionPlanV1,
  results: readonly LessonAdoptionProjectResultV1[],
): ApprovalV1[] {
  return plan.targets.map((target) => {
    const result = results.find((value) => value.projectId === target.projectId);
    if (result === undefined) throw new Error("missing result fixture");
    return {
      schemaVersion: 1,
      approvalId: randomUUID(),
      action: "lesson.policy-adopt",
      resourceType: "factory.lesson-adoption",
      resourceKey: target.operationKey,
      subject: {
        projectId: target.projectId,
        taskId: null,
        attemptId: null,
        releaseId: null,
      },
      binding: {
        planDigest: plan.planDigest,
        diffDigest: null,
        commit: result.candidateCommit,
        buildIdentityDigest: null,
        policyDigest: plan.proposedPolicyDigest,
      },
      actorId: "operator@example.invalid",
      mode: "single-use",
      standingScope: null,
      issuedAt: T1,
      expiresAt: T2,
      status: "active",
      revokedAt: null,
      consumedAt: null,
      consumedByEffectId: null,
    };
  });
}

function adoptionVerifier(
  approved: ReviewedLessonV1,
  results: readonly LessonAdoptionProjectResultV1[],
  approvals: readonly ApprovalV1[],
  commitAdoption: () => boolean = () => true,
) {
  return createPinnedLessonAdoptionVerifier({
    reviewedLessonDigest: approved.reviewedLessonDigest,
    projectEvidence: results.map((result) => ({
      projectId: result.projectId,
      evidenceDigest: result.evidenceDigest,
    })),
    approvalDigests: approvals.map((approval) => learningDigest(approval)),
    commitAdoption,
  });
}

describe("controlled learning", () => {
  it("creates one deterministic proposal from root-caused, regression-backed findings", () => {
    const first = proposal();
    expect(proposal()).toEqual(first);
    expect(first.lesson).toMatchObject({
      status: "proposed",
      reviewEvidenceDigest: null,
      sourceFindingIds: [FINDING],
      regressionFixtureDigest: DIGEST_B,
    });
    expect(() =>
      proposeLesson({
        schemaVersion: 1,
        lessonId: LESSON,
        title: "No change",
        sourceProjectId: PROJECT,
        closures: [closure()],
        scope: "project",
        currentPolicyDigest: DIGEST_A,
        proposedPolicyDigest: DIGEST_A,
        createdAt: T0,
      }),
    ).toThrow("must propose a policy change");
  });

  it("requires independent pinned replay/review evidence and returns a digest-bound envelope", () => {
    const approved = approvedLesson();
    expect(approved.lesson.status).toBe("approved");
    expect(approved.reviewedLessonDigest).toMatch(/^sha256:/);
    const baseReplay = replay();
    const firstProjectResult = baseReplay.projectResults[0];
    if (firstProjectResult === undefined) throw new Error("replay fixture is incomplete");
    expect(() =>
      reviewLesson(
        proposal(),
        {
          ...baseReplay,
          projectResults: [{ ...firstProjectResult, candidateCommit: "f".repeat(40) }],
        },
        review(baseReplay),
        trustedReviewVerifier(baseReplay, review(baseReplay)),
      ),
    ).toThrow("does not bind its result");
    const nonIndependentReplay = bindLessonReplay({
      schemaVersion: baseReplay.schemaVersion,
      proposalDigest: baseReplay.proposalDigest,
      fixtureDigest: baseReplay.fixtureDigest,
      baselinePolicyDigest: baseReplay.baselinePolicyDigest,
      proposedPolicyDigest: baseReplay.proposedPolicyDigest,
      implementerRunId: baseReplay.implementerRunId,
      replayRunId: IMPLEMENTER,
      baselineFailedAsExpected: baseReplay.baselineFailedAsExpected,
      proposedPolicyPassed: baseReplay.proposedPolicyPassed,
      projectResults: baseReplay.projectResults,
      replayedAt: baseReplay.replayedAt,
    });
    const nonIndependentReview = review(nonIndependentReplay);
    expect(() =>
      reviewLesson(
        proposal(),
        nonIndependentReplay,
        nonIndependentReview,
        trustedReviewVerifier(nonIndependentReplay, nonIndependentReview),
      ),
    ).toThrow("independent");
    const failedReplay = replay(false);
    const failedReview = review(failedReplay);
    expect(() =>
      reviewLesson(
        proposal(),
        failedReplay,
        failedReview,
        trustedReviewVerifier(failedReplay, failedReview),
      ),
    ).toThrow("every proposed-policy replay passes");
    const baseReview = review(baseReplay);
    const nonIndependentReviewer = bindLessonReview({
      schemaVersion: baseReview.schemaVersion,
      proposalDigest: baseReview.proposalDigest,
      replayEvidenceDigest: baseReview.replayEvidenceDigest,
      implementerRunId: baseReview.implementerRunId,
      reviewerRunId: REPLAYER,
      verdict: baseReview.verdict,
      reviewedAt: baseReview.reviewedAt,
    });
    expect(() =>
      reviewLesson(
        proposal(),
        baseReplay,
        nonIndependentReviewer,
        trustedReviewVerifier(baseReplay, nonIndependentReviewer),
      ),
    ).toThrow("independent");
    expect(() =>
      reviewLesson(
        proposal(),
        replay(),
        review(),
        createPinnedLessonReviewVerifier({
          proposalDigest: proposal().proposalDigest,
          replayEvidenceDigest: replay().evidenceDigest,
          reviewEvidenceDigest: DIGEST_A,
        }),
      ),
    ).toThrow("independently verified");
  });

  it("adopts only the exact reviewed lesson with canonical per-project approvals", () => {
    const approved = approvedLesson();
    const plan = planLessonAdoption(approved, [SECOND_PROJECT, PROJECT]);
    const results = resultsFor(approved, plan);
    const approvals = approvalsFor(plan, results);
    const verifier = adoptionVerifier(approved, results, approvals);
    const firstResult = results[0];
    const secondResult = results[1];
    const firstApproval = approvals[0];
    const secondApproval = approvals[1];
    if (
      firstResult === undefined ||
      secondResult === undefined ||
      firstApproval === undefined ||
      secondApproval === undefined
    ) {
      throw new Error("adoption fixtures are incomplete");
    }

    expect(plan.targets.every((target) => target.requiresApproval)).toBe(true);
    expect(recordLessonAdoption(approved, plan, results, approvals, T1, verifier)).toMatchObject({
      status: "adopted",
      adoptedProjectIds: [PROJECT, SECOND_PROJECT].sort(),
    });
    expect(() =>
      recordLessonAdoption(approved, plan, results.slice(0, 1), approvals, T1, verifier),
    ).toThrow("every planned project");
    expect(() =>
      recordLessonAdoption(
        approved,
        plan,
        [{ ...firstResult, candidateCommit: "e".repeat(40) }, secondResult],
        approvals,
        T1,
        verifier,
      ),
    ).toThrow("does not bind its result");
    expect(() =>
      recordLessonAdoption(
        approved,
        plan,
        results,
        [{ ...firstApproval, action: "lesson.policy-review" }, secondApproval],
        T1,
        verifier,
      ),
    ).toThrow(/hash-bound approval|verified plan-bound approval/);
    expect(() =>
      recordLessonAdoption(
        approved,
        plan,
        results,
        approvals,
        T1,
        adoptionVerifier(approved, results, approvals, () => false),
      ),
    ).toThrow("atomically");
  });

  it("rejects a same-ID forged reviewed lesson even when its attacker recomputes a plan", () => {
    const approved = approvedLesson();
    const forgedCore = {
      ...approved,
      lesson: { ...approved.lesson, rootCause: "Attacker-rewritten root cause." },
    };
    const coreWithoutDigest = {
      schemaVersion: forgedCore.schemaVersion,
      lesson: forgedCore.lesson,
      proposalDigest: forgedCore.proposalDigest,
      proposedLessonDigest: forgedCore.proposedLessonDigest,
      currentPolicyDigest: forgedCore.currentPolicyDigest,
      sourceClosureDigest: forgedCore.sourceClosureDigest,
      replayEvidenceDigest: forgedCore.replayEvidenceDigest,
      reviewEvidenceDigest: forgedCore.reviewEvidenceDigest,
      implementerRunId: forgedCore.implementerRunId,
      replayRunId: forgedCore.replayRunId,
      reviewerRunId: forgedCore.reviewerRunId,
    };
    const forged = {
      ...coreWithoutDigest,
      reviewedLessonDigest: learningDigest(coreWithoutDigest),
    };
    const forgedPlan = planLessonAdoption(forged, [PROJECT, SECOND_PROJECT]);
    const forgedResults = resultsFor(forged, forgedPlan);
    const forgedApprovals = approvalsFor(forgedPlan, forgedResults);
    const trusted = adoptionVerifier(approved, forgedResults, forgedApprovals);
    expect(() =>
      recordLessonAdoption(forged, forgedPlan, forgedResults, forgedApprovals, T1, trusted),
    ).toThrow("trusted evidence");
  });
});
