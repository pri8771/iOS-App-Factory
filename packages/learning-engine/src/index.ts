import { createHash } from "node:crypto";

import {
  FindingV1Schema,
  GitObjectIdSchema,
  IsoInstantSchema,
  ApprovalV1Schema,
  LessonIdSchema,
  LessonV1Schema,
  ProjectIdSchema,
  RunIdSchema,
  Sha256DigestSchema,
  type ApprovalV1,
  type LessonV1,
  type ProjectId,
  type Sha256Digest,
} from "@app-factory/contracts";
import { z } from "zod";

export class LearningEngineError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LearningEngineError";
  }
}

const LessonScopeSchema = z.enum(["project", "template", "all-projects", "module"]);

export const FindingClosureV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  finding: FindingV1Schema,
  rootCause: z.string().min(1).max(10_000),
  escapeMechanism: z.string().min(1).max(10_000),
  regressionFixtureDigest: Sha256DigestSchema,
  fixCommit: GitObjectIdSchema,
  regressionEvidenceDigest: Sha256DigestSchema,
});
export type FindingClosureV1 = z.infer<typeof FindingClosureV1Schema>;

export type LessonProposalV1 = Readonly<{
  schemaVersion: 1;
  lesson: LessonV1;
  currentPolicyDigest: Sha256Digest;
  sourceClosureDigest: Sha256Digest;
  proposalDigest: Sha256Digest;
}>;

export const LessonProposalV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  lesson: LessonV1Schema,
  currentPolicyDigest: Sha256DigestSchema,
  sourceClosureDigest: Sha256DigestSchema,
  proposalDigest: Sha256DigestSchema,
});

export type ProposeLessonInput = Readonly<{
  schemaVersion: 1;
  lessonId: unknown;
  title: unknown;
  sourceProjectId: unknown;
  closures: readonly unknown[];
  scope: unknown;
  currentPolicyDigest: unknown;
  proposedPolicyDigest: unknown;
  createdAt: unknown;
}>;

export const RegressionProjectResultV1Schema = z.strictObject({
  projectId: ProjectIdSchema,
  candidateCommit: GitObjectIdSchema,
  passed: z.boolean(),
  evidenceDigest: Sha256DigestSchema,
});
export type RegressionProjectResultV1 = z.infer<typeof RegressionProjectResultV1Schema>;

export const LessonReplayV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  proposalDigest: Sha256DigestSchema,
  fixtureDigest: Sha256DigestSchema,
  baselinePolicyDigest: Sha256DigestSchema,
  proposedPolicyDigest: Sha256DigestSchema,
  implementerRunId: RunIdSchema,
  replayRunId: RunIdSchema,
  baselineFailedAsExpected: z.literal(true),
  proposedPolicyPassed: z.boolean(),
  projectResults: z.array(RegressionProjectResultV1Schema).min(1).max(10_000),
  evidenceDigest: Sha256DigestSchema,
  replayedAt: IsoInstantSchema,
});
export type LessonReplayV1 = z.infer<typeof LessonReplayV1Schema>;

export const LessonReviewV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  proposalDigest: Sha256DigestSchema,
  replayEvidenceDigest: Sha256DigestSchema,
  implementerRunId: RunIdSchema,
  reviewerRunId: RunIdSchema,
  verdict: z.enum(["approved", "rejected"]),
  reviewEvidenceDigest: Sha256DigestSchema,
  reviewedAt: IsoInstantSchema,
});
export type LessonReviewV1 = z.infer<typeof LessonReviewV1Schema>;

export const ReviewedLessonV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    lesson: LessonV1Schema,
    proposalDigest: Sha256DigestSchema,
    proposedLessonDigest: Sha256DigestSchema,
    currentPolicyDigest: Sha256DigestSchema,
    sourceClosureDigest: Sha256DigestSchema,
    replayEvidenceDigest: Sha256DigestSchema,
    reviewEvidenceDigest: Sha256DigestSchema,
    implementerRunId: RunIdSchema,
    replayRunId: RunIdSchema,
    reviewerRunId: RunIdSchema,
    reviewedLessonDigest: Sha256DigestSchema,
  })
  .superRefine((reviewed, context) => {
    if (reviewed.lesson.status !== "approved" && reviewed.lesson.status !== "rejected") {
      context.addIssue({ code: "custom", message: "reviewed lessons must have a review verdict" });
    }
    if (reviewed.lesson.reviewEvidenceDigest !== reviewed.reviewEvidenceDigest) {
      context.addIssue({ code: "custom", message: "reviewed lesson evidence digest differs" });
    }
    if (
      reviewed.implementerRunId === reviewed.replayRunId ||
      reviewed.implementerRunId === reviewed.reviewerRunId ||
      reviewed.replayRunId === reviewed.reviewerRunId
    ) {
      context.addIssue({ code: "custom", message: "reviewed lesson runs must remain independent" });
    }
  });
export type ReviewedLessonV1 = z.infer<typeof ReviewedLessonV1Schema>;

export type LessonAdoptionPlanV1 = Readonly<{
  schemaVersion: 1;
  lessonId: string;
  reviewedLessonDigest: Sha256Digest;
  proposalDigest: Sha256Digest;
  reviewEvidenceDigest: Sha256Digest;
  scope: z.infer<typeof LessonScopeSchema>;
  currentPolicyDigest: Sha256Digest;
  proposedPolicyDigest: Sha256Digest;
  regressionFixtureDigest: Sha256Digest;
  targets: readonly Readonly<{
    projectId: ProjectId;
    operationKey: string;
    requiresApproval: true;
  }>[];
  planDigest: Sha256Digest;
}>;

export const LessonAdoptionTargetV1Schema = z.strictObject({
  projectId: ProjectIdSchema,
  operationKey: z.string().regex(/^app-factory:v1:[a-z0-9][a-z0-9:._-]+$/),
  requiresApproval: z.literal(true),
});

export const LessonAdoptionPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  lessonId: LessonIdSchema,
  reviewedLessonDigest: Sha256DigestSchema,
  proposalDigest: Sha256DigestSchema,
  reviewEvidenceDigest: Sha256DigestSchema,
  scope: LessonScopeSchema,
  currentPolicyDigest: Sha256DigestSchema,
  proposedPolicyDigest: Sha256DigestSchema,
  regressionFixtureDigest: Sha256DigestSchema,
  targets: z.array(LessonAdoptionTargetV1Schema).min(1).max(10_000),
  planDigest: Sha256DigestSchema,
});

export const LessonAdoptionProjectResultV1Schema = RegressionProjectResultV1Schema.extend({
  passed: z.literal(true),
  lessonId: LessonIdSchema,
  reviewedLessonDigest: Sha256DigestSchema,
  proposalDigest: Sha256DigestSchema,
  reviewEvidenceDigest: Sha256DigestSchema,
  scope: LessonScopeSchema,
  planDigest: Sha256DigestSchema,
  proposedPolicyDigest: Sha256DigestSchema,
  regressionFixtureDigest: Sha256DigestSchema,
});
export type LessonAdoptionProjectResultV1 = z.infer<typeof LessonAdoptionProjectResultV1Schema>;

export type LessonReviewEvidenceVerifier = Readonly<{
  verifyProposal(proposal: LessonProposalV1): boolean;
  verifyReplay(input: Readonly<{ proposal: LessonProposalV1; replay: LessonReplayV1 }>): boolean;
  verifyReview(
    input: Readonly<{
      proposal: LessonProposalV1;
      replay: LessonReplayV1;
      review: LessonReviewV1;
    }>,
  ): boolean;
}>;

export type LessonAdoptionVerifier = Readonly<{
  verifyReviewedLesson(reviewedLesson: ReviewedLessonV1): boolean;
  verifyProjectResult(result: LessonAdoptionProjectResultV1): boolean;
  verifyApproval(
    input: Readonly<{
      approval: ApprovalV1;
      reviewedLesson: ReviewedLessonV1;
      plan: LessonAdoptionPlanV1;
      target: z.infer<typeof LessonAdoptionTargetV1Schema>;
      result: LessonAdoptionProjectResultV1;
    }>,
  ): boolean;
  /** Atomically consumes every approval and persists adoptedLesson, or returns false. */
  commitAdoption(
    input: Readonly<{
      reviewedLesson: ReviewedLessonV1;
      adoptedLesson: LessonV1;
      plan: LessonAdoptionPlanV1;
      approvals: readonly ApprovalV1[];
      results: readonly LessonAdoptionProjectResultV1[];
    }>,
  ): boolean;
}>;

export type PinnedLessonReviewTrust = Readonly<{
  proposalDigest: Sha256Digest;
  replayEvidenceDigest: Sha256Digest;
  reviewEvidenceDigest: Sha256Digest;
}>;

export type PinnedLessonAdoptionTrust = Readonly<{
  reviewedLessonDigest: Sha256Digest;
  projectEvidence: readonly Readonly<{
    projectId: ProjectId;
    evidenceDigest: Sha256Digest;
  }>[];
  approvalDigests: readonly Sha256Digest[];
  commitAdoption: LessonAdoptionVerifier["commitAdoption"];
}>;

function canonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function learningDigest(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`,
  );
}

const digest = learningDigest;

function regressionProjectResultCore(result: RegressionProjectResultV1) {
  return {
    projectId: result.projectId,
    candidateCommit: result.candidateCommit,
    passed: result.passed,
  };
}

export function bindRegressionProjectResult(
  value: Omit<RegressionProjectResultV1, "evidenceDigest">,
): RegressionProjectResultV1 {
  const core = {
    projectId: ProjectIdSchema.parse(value.projectId),
    candidateCommit: GitObjectIdSchema.parse(value.candidateCommit),
    passed: z.boolean().parse(value.passed),
  };
  return RegressionProjectResultV1Schema.parse({ ...core, evidenceDigest: digest(core) });
}

function parseRegressionProjectResult(value: unknown): RegressionProjectResultV1 {
  const result = RegressionProjectResultV1Schema.parse(value);
  if (digest(regressionProjectResultCore(result)) !== result.evidenceDigest) {
    fail("regression project evidence digest does not bind its result");
  }
  return result;
}

function lessonReplayCore(replay: LessonReplayV1) {
  return {
    schemaVersion: replay.schemaVersion,
    proposalDigest: replay.proposalDigest,
    fixtureDigest: replay.fixtureDigest,
    baselinePolicyDigest: replay.baselinePolicyDigest,
    proposedPolicyDigest: replay.proposedPolicyDigest,
    implementerRunId: replay.implementerRunId,
    replayRunId: replay.replayRunId,
    baselineFailedAsExpected: replay.baselineFailedAsExpected,
    proposedPolicyPassed: replay.proposedPolicyPassed,
    projectResults: replay.projectResults,
    replayedAt: replay.replayedAt,
  };
}

export function bindLessonReplay(value: Omit<LessonReplayV1, "evidenceDigest">): LessonReplayV1 {
  const parsed = LessonReplayV1Schema.omit({ evidenceDigest: true }).parse(value);
  const projectResults = parsed.projectResults.map(parseRegressionProjectResult);
  const core = lessonReplayCore({ ...parsed, projectResults, evidenceDigest: digest({}) });
  return LessonReplayV1Schema.parse({ ...core, evidenceDigest: digest(core) });
}

function parseLessonReplay(value: unknown): LessonReplayV1 {
  const replay = LessonReplayV1Schema.parse(value);
  replay.projectResults.forEach(parseRegressionProjectResult);
  if (digest(lessonReplayCore(replay)) !== replay.evidenceDigest) {
    fail("lesson replay evidence digest does not bind its claims");
  }
  return replay;
}

function lessonReviewCore(review: LessonReviewV1) {
  return {
    schemaVersion: review.schemaVersion,
    proposalDigest: review.proposalDigest,
    replayEvidenceDigest: review.replayEvidenceDigest,
    implementerRunId: review.implementerRunId,
    reviewerRunId: review.reviewerRunId,
    verdict: review.verdict,
    reviewedAt: review.reviewedAt,
  };
}

export function bindLessonReview(
  value: Omit<LessonReviewV1, "reviewEvidenceDigest">,
): LessonReviewV1 {
  const core = LessonReviewV1Schema.omit({ reviewEvidenceDigest: true }).parse(value);
  return LessonReviewV1Schema.parse({ ...core, reviewEvidenceDigest: digest(core) });
}

function parseLessonReview(value: unknown): LessonReviewV1 {
  const review = LessonReviewV1Schema.parse(value);
  if (digest(lessonReviewCore(review)) !== review.reviewEvidenceDigest) {
    fail("lesson review evidence digest does not bind its verdict");
  }
  return review;
}

function adoptionProjectResultCore(result: LessonAdoptionProjectResultV1) {
  return {
    projectId: result.projectId,
    candidateCommit: result.candidateCommit,
    passed: result.passed,
    lessonId: result.lessonId,
    reviewedLessonDigest: result.reviewedLessonDigest,
    proposalDigest: result.proposalDigest,
    reviewEvidenceDigest: result.reviewEvidenceDigest,
    scope: result.scope,
    planDigest: result.planDigest,
    proposedPolicyDigest: result.proposedPolicyDigest,
    regressionFixtureDigest: result.regressionFixtureDigest,
  };
}

export function bindLessonAdoptionProjectResult(
  value: Omit<LessonAdoptionProjectResultV1, "evidenceDigest">,
): LessonAdoptionProjectResultV1 {
  const parsed = LessonAdoptionProjectResultV1Schema.omit({ evidenceDigest: true }).parse(value);
  return LessonAdoptionProjectResultV1Schema.parse({
    ...parsed,
    evidenceDigest: digest(parsed),
  });
}

function parseLessonAdoptionProjectResult(value: unknown): LessonAdoptionProjectResultV1 {
  const result = LessonAdoptionProjectResultV1Schema.parse(value);
  if (digest(adoptionProjectResultCore(result)) !== result.evidenceDigest) {
    fail("post-adoption evidence digest does not bind its result");
  }
  return result;
}

export function createPinnedLessonReviewVerifier(
  trustValue: PinnedLessonReviewTrust,
): LessonReviewEvidenceVerifier {
  const trust = {
    proposalDigest: Sha256DigestSchema.parse(trustValue.proposalDigest),
    replayEvidenceDigest: Sha256DigestSchema.parse(trustValue.replayEvidenceDigest),
    reviewEvidenceDigest: Sha256DigestSchema.parse(trustValue.reviewEvidenceDigest),
  };
  return {
    verifyProposal: (proposal) => proposal.proposalDigest === trust.proposalDigest,
    verifyReplay: ({ proposal, replay }) =>
      proposal.proposalDigest === trust.proposalDigest &&
      replay.evidenceDigest === trust.replayEvidenceDigest,
    verifyReview: ({ proposal, replay, review }) =>
      proposal.proposalDigest === trust.proposalDigest &&
      replay.evidenceDigest === trust.replayEvidenceDigest &&
      review.reviewEvidenceDigest === trust.reviewEvidenceDigest,
  };
}

export function createPinnedLessonAdoptionVerifier(
  trustValue: PinnedLessonAdoptionTrust,
): LessonAdoptionVerifier {
  const reviewedLessonDigest = Sha256DigestSchema.parse(trustValue.reviewedLessonDigest);
  const projectEvidence = new Map<ProjectId, Sha256Digest>();
  for (const value of trustValue.projectEvidence) {
    const projectId = ProjectIdSchema.parse(value.projectId);
    if (projectEvidence.has(projectId)) fail("pinned project evidence must be unique");
    projectEvidence.set(projectId, Sha256DigestSchema.parse(value.evidenceDigest));
  }
  const approvalDigests = new Set(
    trustValue.approvalDigests.map((value) => Sha256DigestSchema.parse(value)),
  );
  if (approvalDigests.size !== trustValue.approvalDigests.length) {
    fail("pinned approval digests must be unique");
  }
  return {
    verifyReviewedLesson: (reviewed) => reviewed.reviewedLessonDigest === reviewedLessonDigest,
    verifyProjectResult: (result) =>
      projectEvidence.get(result.projectId) === result.evidenceDigest,
    verifyApproval: ({ approval }) => approvalDigests.has(digest(approval)),
    commitAdoption: trustValue.commitAdoption,
  };
}

function fail(message: string): never {
  throw new LearningEngineError(message);
}

function parseProposal(value: unknown): LessonProposalV1 {
  const proposal = LessonProposalV1Schema.parse(value);
  if (
    proposal.lesson.status !== "proposed" ||
    proposal.lesson.reviewEvidenceDigest !== null ||
    proposal.lesson.adoptedProjectIds.length !== 0
  ) {
    fail("a reviewed lesson proposal must still be pristine and proposed");
  }
  const core = {
    schemaVersion: proposal.schemaVersion,
    lesson: proposal.lesson,
    currentPolicyDigest: proposal.currentPolicyDigest,
    sourceClosureDigest: proposal.sourceClosureDigest,
  };
  if (digest(core) !== proposal.proposalDigest)
    fail("lesson proposal digest does not match its contents");
  return proposal;
}

function parseAdoptionPlan(value: unknown): LessonAdoptionPlanV1 {
  const plan = LessonAdoptionPlanV1Schema.parse(value);
  const core = {
    schemaVersion: plan.schemaVersion,
    lessonId: plan.lessonId,
    reviewedLessonDigest: plan.reviewedLessonDigest,
    proposalDigest: plan.proposalDigest,
    reviewEvidenceDigest: plan.reviewEvidenceDigest,
    scope: plan.scope,
    currentPolicyDigest: plan.currentPolicyDigest,
    proposedPolicyDigest: plan.proposedPolicyDigest,
    regressionFixtureDigest: plan.regressionFixtureDigest,
    targets: plan.targets,
  };
  if (digest(core) !== plan.planDigest)
    fail("lesson adoption plan digest does not match its contents");
  return plan;
}

function reviewedLessonCore(reviewed: Omit<ReviewedLessonV1, "reviewedLessonDigest">) {
  return {
    schemaVersion: reviewed.schemaVersion,
    lesson: reviewed.lesson,
    proposalDigest: reviewed.proposalDigest,
    proposedLessonDigest: reviewed.proposedLessonDigest,
    currentPolicyDigest: reviewed.currentPolicyDigest,
    sourceClosureDigest: reviewed.sourceClosureDigest,
    replayEvidenceDigest: reviewed.replayEvidenceDigest,
    reviewEvidenceDigest: reviewed.reviewEvidenceDigest,
    implementerRunId: reviewed.implementerRunId,
    replayRunId: reviewed.replayRunId,
    reviewerRunId: reviewed.reviewerRunId,
  };
}

function parseReviewedLesson(value: unknown): ReviewedLessonV1 {
  const reviewed = ReviewedLessonV1Schema.parse(value);
  if (digest(reviewedLessonCore(reviewed)) !== reviewed.reviewedLessonDigest) {
    fail("reviewed lesson digest does not match the reviewed envelope");
  }
  return reviewed;
}

export function proposeLesson(input: ProposeLessonInput): LessonProposalV1 {
  if (input.schemaVersion !== 1) fail("unsupported lesson proposal version");
  const closures = input.closures.map((value) => FindingClosureV1Schema.parse(value));
  if (closures.length < 1 || closures.length > 1_000) {
    fail("a lesson proposal requires 1-1000 closed findings");
  }
  const findingIds = closures.map((closure) => closure.finding.findingId);
  if (new Set(findingIds).size !== findingIds.length) fail("source findings must be unique");
  const fixtureDigests = new Set(closures.map((closure) => closure.regressionFixtureDigest));
  if (fixtureDigests.size !== 1)
    fail("one lesson must be proven by one canonical regression fixture");
  const currentPolicyDigest = Sha256DigestSchema.parse(input.currentPolicyDigest);
  const proposedPolicyDigest = Sha256DigestSchema.parse(input.proposedPolicyDigest);
  if (currentPolicyDigest === proposedPolicyDigest) {
    fail("a lesson must propose a policy change, not the current policy");
  }
  const rootCause = [...new Set(closures.map((closure) => closure.rootCause))].sort().join("\n\n");
  const escapeMechanism = [...new Set(closures.map((closure) => closure.escapeMechanism))]
    .sort()
    .join("\n\n");
  const createdAt = IsoInstantSchema.parse(input.createdAt);
  const lesson = LessonV1Schema.parse({
    schemaVersion: 1,
    lessonId: input.lessonId,
    title: input.title,
    sourceProjectId: input.sourceProjectId,
    sourceFindingIds: [...findingIds].sort(),
    rootCause,
    escapeMechanism,
    scope: LessonScopeSchema.parse(input.scope),
    regressionFixtureDigest: closures[0]?.regressionFixtureDigest,
    proposedPolicyDigest,
    reviewEvidenceDigest: null,
    status: "proposed",
    adoptedProjectIds: [],
    createdAt,
    updatedAt: createdAt,
  });
  const sourceClosureDigest = digest(closures);
  const core = { schemaVersion: 1 as const, lesson, currentPolicyDigest, sourceClosureDigest };
  return { ...core, proposalDigest: digest(core) };
}

export function reviewLesson(
  proposalValue: unknown,
  replayValue: unknown,
  reviewValue: unknown,
  verifier: LessonReviewEvidenceVerifier,
): ReviewedLessonV1 {
  const proposal = parseProposal(proposalValue);
  const replay = parseLessonReplay(replayValue);
  const review = parseLessonReview(reviewValue);
  if (!verifier.verifyProposal(proposal)) {
    fail("lesson source proposal evidence could not be independently verified");
  }
  if (
    replay.proposalDigest !== proposal.proposalDigest ||
    review.proposalDigest !== proposal.proposalDigest
  ) {
    fail("lesson replay and review must bind the exact proposal");
  }
  if (
    replay.fixtureDigest !== proposal.lesson.regressionFixtureDigest ||
    replay.baselinePolicyDigest !== proposal.currentPolicyDigest ||
    replay.proposedPolicyDigest !== proposal.lesson.proposedPolicyDigest
  ) {
    fail("lesson replay does not bind the proposed regression and policies");
  }
  if (replay.implementerRunId === replay.replayRunId) {
    fail("regression replay must be independent of the implementation run");
  }
  if (
    review.implementerRunId !== replay.implementerRunId ||
    review.reviewerRunId === review.implementerRunId ||
    review.reviewerRunId === replay.replayRunId ||
    review.replayEvidenceDigest !== replay.evidenceDigest
  ) {
    fail("lesson review is not independent or does not bind the replay evidence");
  }
  if (
    new Set(replay.projectResults.map((item) => item.projectId)).size !==
    replay.projectResults.length
  ) {
    fail("lesson replay project results must be unique");
  }
  const passed =
    replay.baselineFailedAsExpected &&
    replay.proposedPolicyPassed &&
    replay.projectResults.every((item) => item.passed);
  if (review.verdict === "approved" && !passed) {
    fail("a lesson cannot be approved until every proposed-policy replay passes");
  }
  if (!verifier.verifyReplay({ proposal, replay })) {
    fail("lesson replay evidence could not be independently verified");
  }
  if (!verifier.verifyReview({ proposal, replay, review })) {
    fail("lesson review evidence could not be independently verified");
  }
  const lesson = LessonV1Schema.parse({
    ...proposal.lesson,
    reviewEvidenceDigest: review.reviewEvidenceDigest,
    status: review.verdict,
    updatedAt: review.reviewedAt,
  });
  const core = reviewedLessonCore({
    schemaVersion: 1,
    lesson,
    proposalDigest: proposal.proposalDigest,
    proposedLessonDigest: digest(proposal.lesson),
    currentPolicyDigest: proposal.currentPolicyDigest,
    sourceClosureDigest: proposal.sourceClosureDigest,
    replayEvidenceDigest: replay.evidenceDigest,
    reviewEvidenceDigest: review.reviewEvidenceDigest,
    implementerRunId: replay.implementerRunId,
    replayRunId: replay.replayRunId,
    reviewerRunId: review.reviewerRunId,
  });
  return ReviewedLessonV1Schema.parse({ ...core, reviewedLessonDigest: digest(core) });
}

export function planLessonAdoption(
  reviewedLessonValue: unknown,
  targetProjectIdValues: readonly unknown[],
): LessonAdoptionPlanV1 {
  const reviewed = parseReviewedLesson(reviewedLessonValue);
  const lesson = reviewed.lesson;
  if (lesson.status !== "approved") fail("only an approved lesson can be proposed for adoption");
  const targets = targetProjectIdValues.map((value) => ProjectIdSchema.parse(value)).sort();
  if (targets.length < 1 || targets.length > 10_000) fail("lesson adoption needs 1-10000 targets");
  if (new Set(targets).size !== targets.length) fail("lesson adoption targets must be unique");
  if (
    lesson.scope === "project" &&
    (targets.length !== 1 || targets[0] !== lesson.sourceProjectId)
  ) {
    fail("project-scoped lessons can only target their source project");
  }
  const plannedTargets = targets.map((projectId) => ({
    projectId,
    operationKey: `app-factory:v1:lesson:${lesson.lessonId}:project:${projectId}`,
    requiresApproval: true as const,
  }));
  const core = {
    schemaVersion: 1 as const,
    lessonId: lesson.lessonId,
    reviewedLessonDigest: reviewed.reviewedLessonDigest,
    proposalDigest: reviewed.proposalDigest,
    reviewEvidenceDigest: reviewed.reviewEvidenceDigest,
    scope: lesson.scope,
    currentPolicyDigest: reviewed.currentPolicyDigest,
    proposedPolicyDigest: lesson.proposedPolicyDigest,
    regressionFixtureDigest: lesson.regressionFixtureDigest,
    targets: plannedTargets,
  };
  return { ...core, planDigest: digest(core) };
}

export function recordLessonAdoption(
  reviewedLessonValue: unknown,
  planValue: unknown,
  results: readonly unknown[],
  approvalValues: readonly unknown[],
  adoptedAtValue: unknown,
  verifier: LessonAdoptionVerifier,
): LessonV1 {
  const reviewed = parseReviewedLesson(reviewedLessonValue);
  const lesson = reviewed.lesson;
  const plan = parseAdoptionPlan(planValue);
  if (lesson.status !== "approved" || lesson.lessonId !== plan.lessonId) {
    fail("adoption must start from the approved lesson bound to the plan");
  }
  if (
    plan.reviewedLessonDigest !== reviewed.reviewedLessonDigest ||
    plan.proposalDigest !== reviewed.proposalDigest ||
    plan.reviewEvidenceDigest !== reviewed.reviewEvidenceDigest ||
    plan.scope !== lesson.scope ||
    plan.currentPolicyDigest !== reviewed.currentPolicyDigest ||
    plan.proposedPolicyDigest !== lesson.proposedPolicyDigest ||
    plan.regressionFixtureDigest !== lesson.regressionFixtureDigest
  ) {
    fail("adoption plan does not bind the exact reviewed lesson and policy scope");
  }
  if (!verifier.verifyReviewedLesson(reviewed)) {
    fail("the exact reviewed lesson could not be verified from trusted evidence");
  }
  const expectedPlan = planLessonAdoption(
    reviewed,
    plan.targets.map((target) => target.projectId),
  );
  if (canonical(expectedPlan) !== canonical(plan)) {
    fail("adoption plan is not the canonical approved-scope plan");
  }
  const parsedResults = results.map(parseLessonAdoptionProjectResult);
  const approvals = approvalValues.map((value) => ApprovalV1Schema.parse(value));
  const expected = plan.targets.map((target) => target.projectId).sort();
  const actual = parsedResults.map((result) => result.projectId).sort();
  if (
    expected.length !== actual.length ||
    expected.some((projectId, index) => projectId !== actual[index]) ||
    parsedResults.some((result) => !result.passed)
  ) {
    fail("every planned project must pass post-adoption replay before the lesson is adopted");
  }
  if (
    new Set(parsedResults.map((result) => result.projectId)).size !== parsedResults.length ||
    parsedResults.some(
      (result) =>
        result.lessonId !== lesson.lessonId ||
        result.reviewedLessonDigest !== reviewed.reviewedLessonDigest ||
        result.proposalDigest !== reviewed.proposalDigest ||
        result.reviewEvidenceDigest !== reviewed.reviewEvidenceDigest ||
        result.scope !== lesson.scope ||
        result.planDigest !== plan.planDigest ||
        result.proposedPolicyDigest !== lesson.proposedPolicyDigest ||
        result.regressionFixtureDigest !== lesson.regressionFixtureDigest ||
        !verifier.verifyProjectResult(result),
    )
  ) {
    fail("post-adoption replay evidence is duplicated or unverifiable");
  }
  const approvalsByProject = new Map<ProjectId, ApprovalV1>();
  for (const approval of approvals) {
    const projectId = approval.subject.projectId;
    if (projectId === null || approvalsByProject.has(projectId)) {
      fail("each adoption target requires one unique project approval");
    }
    approvalsByProject.set(projectId, approval);
  }
  const approvedProjects = [...approvalsByProject.keys()].sort();
  if (
    new Set(approvals.map((approval) => approval.approvalId)).size !== approvals.length ||
    expected.length !== approvedProjects.length ||
    expected.some((projectId, index) => projectId !== approvedProjects[index]) ||
    approvals.some((approval) => approval.status !== "active" || approval.mode !== "single-use")
  ) {
    fail("each adoption target requires one verified plan-bound approval");
  }
  const adoptedAt = IsoInstantSchema.parse(adoptedAtValue);
  for (const target of plan.targets) {
    const approval = approvalsByProject.get(target.projectId);
    const result = parsedResults.find((item) => item.projectId === target.projectId);
    if (approval === undefined || result === undefined) fail("adoption target evidence is missing");
    const exactBinding =
      approval.action === "lesson.policy-adopt" &&
      approval.resourceType === "factory.lesson-adoption" &&
      approval.resourceKey === target.operationKey &&
      approval.subject.projectId === target.projectId &&
      approval.subject.taskId === null &&
      approval.subject.attemptId === null &&
      approval.subject.releaseId === null &&
      approval.binding.planDigest === plan.planDigest &&
      approval.binding.diffDigest === null &&
      approval.binding.commit === result.candidateCommit &&
      approval.binding.buildIdentityDigest === null &&
      approval.binding.policyDigest === plan.proposedPolicyDigest &&
      approval.standingScope === null &&
      approval.revokedAt === null &&
      approval.consumedAt === null &&
      approval.consumedByEffectId === null &&
      approval.issuedAt <= adoptedAt &&
      adoptedAt < approval.expiresAt;
    if (
      !exactBinding ||
      !verifier.verifyApproval({ approval, reviewedLesson: reviewed, plan, target, result })
    ) {
      fail("each adoption target requires one active canonical hash-bound approval");
    }
  }
  const adoptedLesson = LessonV1Schema.parse({
    ...lesson,
    status: "adopted",
    adoptedProjectIds: expected,
    updatedAt: adoptedAt,
  });
  if (
    !verifier.commitAdoption({
      reviewedLesson: reviewed,
      adoptedLesson,
      plan,
      approvals,
      results: parsedResults,
    })
  ) {
    fail("adoption approvals could not be consumed atomically with the lesson update");
  }
  return adoptedLesson;
}
