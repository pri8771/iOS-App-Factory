import { z } from "zod";

import { AttemptListPageV1Schema, AttemptListQueryV1Schema } from "./attempt-read-model.js";
import { CommandOriginV1Schema } from "./command.js";
import {
  EffectListPageV1Schema,
  EffectListQueryV1Schema,
  EffectStatusV1Schema,
} from "./effect-read-model.js";
import {
  EvidenceKindV1Schema,
  EvidenceManifestV1Schema,
  EvidenceSubjectV1Schema,
} from "./evidence.js";
import { EventV1Schema } from "./event.js";
import { ExecutionAttemptV1Schema, type AttemptDesiredStateV1 } from "./execution.js";
import {
  AbsolutePathSchema,
  AttemptIdSchema,
  CommandIdSchema,
  EvidenceIdSchema,
  GitBranchNameSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  RelativePathSchema,
  RequestIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  TaskIdSchema,
} from "./primitives.js";
import { PortfolioReadModelV1Schema } from "./portfolio-read-model.js";
import { RunRecordV1Schema } from "./run-record.js";
import { TaskSpecV1Schema } from "./task-spec.js";

export const COMMAND_PROTOCOL_VERSION_V1 = 1 as const;
export const CommandProtocolVersionV1Schema = z.literal(COMMAND_PROTOCOL_VERSION_V1);

export const CommandAuthorizationV1Schema = z
  .string()
  .min(32)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "Expected a printable authorization token");
export type CommandAuthorizationV1 = z.infer<typeof CommandAuthorizationV1Schema>;

const RequestMetadataV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
};

const EmptyPayloadV1Schema = z.strictObject({});
const AttemptPayloadV1Schema = z.strictObject({ attemptId: AttemptIdSchema });
const AttemptReasonPayloadV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  reason: z.string().min(1).max(1_000).nullable(),
});

export const DoctorCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("doctor"),
  payload: EmptyPayloadV1Schema,
});

export const SubmitCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("task.submit"),
  payload: z.strictObject({ taskSpec: TaskSpecV1Schema }),
});

export const RunCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("task.run"),
  payload: z.strictObject({ taskSpec: TaskSpecV1Schema }),
});

export const StatusCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.status"),
  payload: AttemptPayloadV1Schema,
});

export const EventsCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.events"),
  payload: z.strictObject({
    attemptId: AttemptIdSchema,
    afterSequence: NonNegativeSafeIntegerSchema,
    limit: z.number().int().min(1).max(1_000),
  }),
});

export const AttemptListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.list"),
  payload: AttemptListQueryV1Schema,
});

export const PauseCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.pause"),
  payload: AttemptReasonPayloadV1Schema,
});

export const ResumeCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.resume"),
  payload: AttemptReasonPayloadV1Schema,
});

export const RetryCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("task.retry"),
  payload: z.strictObject({
    taskId: TaskIdSchema,
    // The failed or cancelled terminal attempt this command retries.
    attemptId: AttemptIdSchema,
  }),
});

export const UnblockCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.unblock"),
  payload: z.strictObject({
    attemptId: AttemptIdSchema,
    answer: z.string().min(1).max(2_000),
  }),
});

export const CancelCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.cancel"),
  payload: AttemptReasonPayloadV1Schema,
});

export const ReconcileCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("daemon.reconcile"),
  payload: z.strictObject({ attemptId: AttemptIdSchema.nullable() }),
});

export const EvidenceListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("evidence.list"),
  payload: z.strictObject({
    afterAttemptId: AttemptIdSchema.nullable(),
    limit: z.number().int().min(1).max(100),
  }),
});

export const EvidenceInspectCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("evidence.inspect"),
  payload: AttemptPayloadV1Schema,
});

export const EvidenceVerifyCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("evidence.verify"),
  payload: AttemptPayloadV1Schema,
});

export const RunExportCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("run.export"),
  payload: AttemptPayloadV1Schema,
});

export const PortfolioSnapshotCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("portfolio.snapshot"),
  payload: EmptyPayloadV1Schema,
});

export const EffectsStatusCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("effects.status"),
  payload: EmptyPayloadV1Schema,
});

export const EffectsListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("effects.list"),
  payload: EffectListQueryV1Schema,
});

// Project enrollment (`project.*`) wire types. `@app-factory/project-sdk` owns the canonical
// EnrollmentScanV1/EnrollmentPlanV1/EnrollmentApplyResultV1 models and their much larger, deeply
// nested inventory schemas; contracts cannot import that package (the `contracts-are-foundational`
// dependency-cruiser rule forbids contracts from depending on any non-contracts workspace package),
// so the shapes below are a deliberately narrow, hand-kept mirror of just the plan/action/issue
// fields that cross the wire. Keep them in sync with `packages/project-sdk/src/model.ts` by hand.
const ISSUE_ID_PATTERN = /^esi-[0-9a-f]{24}$/;
const ACTION_ID_PATTERN = /^epa-[0-9a-f]{24}$/;

export const EnrollmentActionKindV1Schema = z.enum([
  "resolve-path-safety",
  "resolve-secret-material",
  "establish-rule-authority",
  "repair-rule-adapter",
  "resolve-rule-conflict",
  "adopt-or-migrate-legacy-layout",
  "declare-project",
  "repair-project-manifest",
  "declare-experience",
  "repair-experience-manifest",
  "create-xcode-container",
  "share-xcode-scheme",
  "add-swift-source",
  "add-test-target",
  "add-ui-test-target",
  "add-ci-verification",
]);
export type EnrollmentActionKindV1 = z.infer<typeof EnrollmentActionKindV1Schema>;

export const EnrollmentPlanActionV1Schema = z.strictObject({
  actionId: z.string().regex(ACTION_ID_PATTERN),
  phase: z.enum(["safety", "compatibility", "authority", "project", "quality", "automation"]),
  kind: EnrollmentActionKindV1Schema,
  targetPath: RelativePathSchema.nullable(),
  reason: z.string().min(1).max(2_000),
  resolvesIssueIds: z.array(z.string().regex(ISSUE_ID_PATTERN)).min(1),
});
export type EnrollmentPlanActionV1 = z.infer<typeof EnrollmentPlanActionV1Schema>;

export const EnrollmentPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("proposal-only"),
  requiresSourceRevalidation: z.literal(true),
  sourceFingerprint: Sha256DigestSchema,
  inventoryDigest: Sha256DigestSchema,
  blocked: z.boolean(),
  blockerIssueIds: z.array(z.string().regex(ISSUE_ID_PATTERN)),
  actions: z.array(EnrollmentPlanActionV1Schema).max(1_000),
});
export type EnrollmentPlanV1 = z.infer<typeof EnrollmentPlanV1Schema>;

export const EnrollmentBlockerV1Schema = z.strictObject({
  issueId: z.string().regex(ISSUE_ID_PATTERN),
  code: NamespacedCodeSchema,
  summary: z.string().min(1).max(2_000),
});
export type EnrollmentBlockerV1 = z.infer<typeof EnrollmentBlockerV1Schema>;

export const EnrollmentSkippedActionV1Schema = z.strictObject({
  actionId: z.string().regex(ACTION_ID_PATTERN),
  kind: EnrollmentActionKindV1Schema,
  targetPath: RelativePathSchema.nullable(),
  reason: z.string().min(1).max(2_000),
});
export type EnrollmentSkippedActionV1 = z.infer<typeof EnrollmentSkippedActionV1Schema>;

export const ProjectScanCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.scan"),
  payload: z.strictObject({ repositoryRoot: AbsolutePathSchema }),
});

export const ProjectEnrollPlanCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.enroll-plan"),
  payload: z.strictObject({ planDigest: Sha256DigestSchema }),
});

export const ProjectApplyCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.apply"),
  payload: z.strictObject({
    planDigest: Sha256DigestSchema,
    branchName: GitBranchNameSchema.nullable(),
  }),
});

export const CommandRequestV1Schema = z.discriminatedUnion("operation", [
  DoctorCommandRequestV1Schema,
  SubmitCommandRequestV1Schema,
  RunCommandRequestV1Schema,
  StatusCommandRequestV1Schema,
  EventsCommandRequestV1Schema,
  AttemptListCommandRequestV1Schema,
  PauseCommandRequestV1Schema,
  ResumeCommandRequestV1Schema,
  CancelCommandRequestV1Schema,
  RetryCommandRequestV1Schema,
  UnblockCommandRequestV1Schema,
  ReconcileCommandRequestV1Schema,
  EvidenceListCommandRequestV1Schema,
  EvidenceInspectCommandRequestV1Schema,
  EvidenceVerifyCommandRequestV1Schema,
  RunExportCommandRequestV1Schema,
  PortfolioSnapshotCommandRequestV1Schema,
  ProjectScanCommandRequestV1Schema,
  ProjectEnrollPlanCommandRequestV1Schema,
  ProjectApplyCommandRequestV1Schema,
  EffectsStatusCommandRequestV1Schema,
  EffectsListCommandRequestV1Schema,
]);
export type CommandRequestV1 = z.infer<typeof CommandRequestV1Schema>;
export type CommandOperationV1 = CommandRequestV1["operation"];
export type CommandRequestForOperationV1<Operation extends CommandOperationV1> = Extract<
  CommandRequestV1,
  { operation: Operation }
>;

export const CommandRequestFrameV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema,
  authorization: CommandAuthorizationV1Schema,
  request: CommandRequestV1Schema,
});
export type CommandRequestFrameV1 = z.infer<typeof CommandRequestFrameV1Schema>;

export const DoctorCommandResultV1Schema = z.strictObject({
  operation: z.literal("doctor"),
  readiness: z.enum(["ready", "degraded"]),
  daemonVersion: z.string().min(1).max(100),
  protocolVersion: CommandProtocolVersionV1Schema,
  startedAt: IsoInstantSchema,
  issues: z.array(z.string().min(1).max(1_000)).max(100),
});

const AcceptedAttemptResultV1Shape = {
  taskId: TaskIdSchema,
  attemptId: AttemptIdSchema,
  state: ExecutionAttemptV1Schema.shape.state,
};

export const SubmitCommandResultV1Schema = z.strictObject({
  operation: z.literal("task.submit"),
  ...AcceptedAttemptResultV1Shape,
});

export const RunCommandResultV1Schema = z.strictObject({
  operation: z.literal("task.run"),
  ...AcceptedAttemptResultV1Shape,
});

export const StatusCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.status"),
  attempt: ExecutionAttemptV1Schema,
});

export const EventsCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.events"),
  events: z.array(EventV1Schema).max(1_000),
  nextAfterSequence: NonNegativeSafeIntegerSchema,
});

export const AttemptListCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.list"),
  page: AttemptListPageV1Schema,
});

function desiredStateResultSchema<Operation extends string>(
  operation: Operation,
  desiredState: AttemptDesiredStateV1,
) {
  return z.strictObject({
    operation: z.literal(operation),
    attemptId: AttemptIdSchema,
    desiredState: z.literal(desiredState),
    accepted: z.boolean(),
  });
}

export const PauseCommandResultV1Schema = desiredStateResultSchema("attempt.pause", "paused");
export const ResumeCommandResultV1Schema = desiredStateResultSchema("attempt.resume", "running");
export const CancelCommandResultV1Schema = desiredStateResultSchema("attempt.cancel", "cancelled");

export const RetryCommandResultV1Schema = z.strictObject({
  operation: z.literal("task.retry"),
  ...AcceptedAttemptResultV1Shape,
  priorAttemptId: AttemptIdSchema,
});

export const UnblockCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.unblock"),
  attemptId: AttemptIdSchema,
  state: ExecutionAttemptV1Schema.shape.state,
  accepted: z.boolean(),
});

export const ReconcileCommandResultV1Schema = z.strictObject({
  operation: z.literal("daemon.reconcile"),
  accepted: z.boolean(),
  // Compatibility field: wake-only reconciliation performs no synchronous
  // attempt work, so daemon v1 returns an empty array and exposes later
  // progress through authoritative status/events queries.
  reconciledAttemptIds: z.array(AttemptIdSchema).max(10_000),
});

export const EvidenceManifestDescriptorV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  createdAt: IsoInstantSchema,
  manifestDigest: Sha256DigestSchema,
  subject: EvidenceSubjectV1Schema,
  entryCount: z.number().int().min(1).max(1_000),
  requiredKinds: z.array(EvidenceKindV1Schema).min(1).max(5),
});
export type EvidenceManifestDescriptorV1 = z.infer<typeof EvidenceManifestDescriptorV1Schema>;

export const EvidenceListCommandResultV1Schema = z.strictObject({
  operation: z.literal("evidence.list"),
  manifests: z.array(EvidenceManifestDescriptorV1Schema).max(100),
  nextAfterAttemptId: AttemptIdSchema.nullable(),
  hasMore: z.boolean(),
});

export const EvidenceInspectCommandResultV1Schema = z.strictObject({
  operation: z.literal("evidence.inspect"),
  manifest: EvidenceManifestV1Schema,
  manifestDigest: Sha256DigestSchema,
});

export const EvidenceItemVerificationV1Schema = z.strictObject({
  evidenceId: EvidenceIdSchema,
  digest: Sha256DigestSchema,
  kind: EvidenceKindV1Schema,
  createdAt: IsoInstantSchema,
  producer: NamespacedCodeSchema,
  artifactCount: z.number().int().min(0).max(100),
});
export type EvidenceItemVerificationV1 = z.infer<typeof EvidenceItemVerificationV1Schema>;

export const EvidenceVerifyCommandResultV1Schema = z.strictObject({
  operation: z.literal("evidence.verify"),
  integrityVerified: z.literal(true),
  manifest: EvidenceManifestDescriptorV1Schema,
  evidence: z.array(EvidenceItemVerificationV1Schema).min(1).max(1_000),
  artifactCount: NonNegativeSafeIntegerSchema,
});

/**
 * The exported run record plus the SHA-256 digest of its canonical JSON
 * encoding (object keys sorted recursively, no insignificant whitespace, no
 * trailing newline -- the same canonical form the execution engine uses for
 * its evidence index digests). The daemon re-derives the record from durable state
 * only and fails closed unless the attempt is terminal, its evidence manifest
 * verifies, and the execution closure re-verifies against the Factory mirror.
 */
export const RunExportCommandResultV1Schema = z.strictObject({
  operation: z.literal("run.export"),
  record: RunRecordV1Schema,
  recordDigest: Sha256DigestSchema,
});

export const PortfolioSnapshotCommandResultV1Schema = z.strictObject({
  operation: z.literal("portfolio.snapshot"),
  snapshot: PortfolioReadModelV1Schema,
});

export const EffectsStatusCommandResultV1Schema = z.strictObject({
  operation: z.literal("effects.status"),
  status: EffectStatusV1Schema,
});

export const EffectsListCommandResultV1Schema = z.strictObject({
  operation: z.literal("effects.list"),
  page: EffectListPageV1Schema,
});

/**
 * `planDigest` identifies the daemon's persisted evidence-store record for this scan (the digest
 * `EvidenceStore.putBlob` returns for its canonical-JSON `EnrollmentScanV1`). It is not the same
 * value as `@app-factory/project-sdk`'s own internal plan-only digest: that narrower digest omits
 * `repositoryRoot`, which `project.enroll-plan` and `project.apply` both need to resolve from a
 * single caller-supplied identifier, and the CLI verbs (`project plan/apply <digest>`) only accept
 * one. `sourceFingerprint` and `inventoryDigest` below remain direct pass-throughs of project-sdk's
 * own intrinsic fields.
 */
export const ProjectScanCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.scan"),
  repositoryRoot: AbsolutePathSchema,
  planDigest: Sha256DigestSchema,
  sourceFingerprint: Sha256DigestSchema,
  inventoryDigest: Sha256DigestSchema,
  blocked: z.boolean(),
  blockers: z.array(EnrollmentBlockerV1Schema).max(1_000),
});

export const ProjectEnrollPlanCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.enroll-plan"),
  planDigest: Sha256DigestSchema,
  repositoryRoot: AbsolutePathSchema,
  plan: EnrollmentPlanV1Schema,
});

export const ProjectApplyConvergenceV1Schema = z.strictObject({
  blocked: z.boolean(),
  blockerIssueIds: z.array(z.string().regex(ISSUE_ID_PATTERN)),
  openIssueCount: NonNegativeSafeIntegerSchema,
  sourceFingerprint: Sha256DigestSchema,
});
export type ProjectApplyConvergenceV1 = z.infer<typeof ProjectApplyConvergenceV1Schema>;

export const ProjectApplyCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.apply"),
  repositoryRoot: AbsolutePathSchema,
  baseHeadSha: GitObjectIdSchema,
  branchName: GitBranchNameSchema.nullable(),
  commitSha: GitObjectIdSchema.nullable(),
  appliedActionKinds: z.array(EnrollmentActionKindV1Schema).max(1_000),
  resolvedIssueIds: z.array(z.string().regex(ISSUE_ID_PATTERN)),
  skippedActions: z.array(EnrollmentSkippedActionV1Schema).max(1_000),
  convergence: ProjectApplyConvergenceV1Schema,
});

export const CommandResultV1Schema = z.discriminatedUnion("operation", [
  DoctorCommandResultV1Schema,
  SubmitCommandResultV1Schema,
  RunCommandResultV1Schema,
  StatusCommandResultV1Schema,
  EventsCommandResultV1Schema,
  AttemptListCommandResultV1Schema,
  PauseCommandResultV1Schema,
  ResumeCommandResultV1Schema,
  CancelCommandResultV1Schema,
  RetryCommandResultV1Schema,
  UnblockCommandResultV1Schema,
  ReconcileCommandResultV1Schema,
  EvidenceListCommandResultV1Schema,
  EvidenceInspectCommandResultV1Schema,
  EvidenceVerifyCommandResultV1Schema,
  RunExportCommandResultV1Schema,
  PortfolioSnapshotCommandResultV1Schema,
  ProjectScanCommandResultV1Schema,
  ProjectEnrollPlanCommandResultV1Schema,
  ProjectApplyCommandResultV1Schema,
  EffectsStatusCommandResultV1Schema,
  EffectsListCommandResultV1Schema,
]);
export type CommandResultV1 = z.infer<typeof CommandResultV1Schema>;
export type CommandResultForOperationV1<Operation extends CommandOperationV1> = Extract<
  CommandResultV1,
  { operation: Operation }
>;

export const CommandProtocolErrorV1Schema = z.strictObject({
  code: NamespacedCodeSchema,
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
});
export type CommandProtocolErrorV1 = z.infer<typeof CommandProtocolErrorV1Schema>;

export const CommandSuccessResponseV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema,
  ok: z.literal(true),
  result: CommandResultV1Schema,
});

export const CommandFailureResponseV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema.nullable(),
  ok: z.literal(false),
  error: CommandProtocolErrorV1Schema,
});

export const CommandResponseV1Schema = z.discriminatedUnion("ok", [
  CommandSuccessResponseV1Schema,
  CommandFailureResponseV1Schema,
]);
export type CommandResponseV1 = z.infer<typeof CommandResponseV1Schema>;
export type CommandSuccessResponseV1 = z.infer<typeof CommandSuccessResponseV1Schema>;
export type CommandFailureResponseV1 = z.infer<typeof CommandFailureResponseV1Schema>;
