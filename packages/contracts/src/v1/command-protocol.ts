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
  ProjectMilestoneUpsertV1Schema,
  ProjectMilestoneV1Schema,
  ProjectTimelineV1Schema,
} from "./milestone.js";
import { MirrorProjectionDiffV1Schema, MirrorProjectionV1Schema } from "./mirror-projection.js";
import { ProjectDocsSnapshotV1Schema } from "./project-docs-snapshot.js";
import { ProjectRegistryV1Schema } from "./project-registry.js";
import {
  PhaseDefinitionUpsertV1Schema,
  PhaseDefinitionV1Schema,
  PhasePresetUpsertV1Schema,
  PhasePresetV1Schema,
} from "./phase.js";
import {
  ProjectPlanApproveGateV1Schema,
  ProjectPlanApproveV1Schema,
  ProjectPlanEditBatchV1Schema,
  ProjectPlanExecuteV1Schema,
  ProjectPlanProposeV1Schema,
  ProjectPlanTickV1Schema,
  ProjectPlanV1Schema,
} from "./project-plan.js";
import {
  PhaseRunCreateV1Schema,
  PhaseRunDecisionV1Schema,
  PhaseRunListQueryV1Schema,
  PhaseRunListPageV1Schema,
  PhaseRunV1Schema,
} from "./phase-run.js";
import {
  AbsolutePathSchema,
  AssistantIntentIdSchema,
  AttemptIdSchema,
  CommandIdSchema,
  EvidenceIdSchema,
  GitBranchNameSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PhaseRunIdSchema,
  ProjectIdSchema,
  ProjectPlanIdSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  RequestIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  TaskIdSchema,
} from "./primitives.js";
import { PortfolioReadModelV1Schema } from "./portfolio-read-model.js";
import {
  CredentialReferenceV1Schema,
  MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1,
  MAX_PROVIDER_INSTANCES_V1,
  ProviderHealthEntryV1Schema,
  ProviderInstanceV1Schema,
  ProviderUpsertSpecV1Schema,
} from "./provider.js";
import {
  MAX_ROOM_EVENTS_LIMIT_V1,
  MAX_ROOM_LIST_ITEMS_V1,
  MAX_ROOM_MESSAGE_BODY_LENGTH_V1,
  MAX_ROOM_TYPING_TTL_MS_V1,
  RoomChatMessageV1Schema,
  RoomCreateSpecV1Schema,
  RoomHumanHandleSchema,
  RoomIdSchema,
  RoomMessageV1Schema,
  RoomModeratorStatusV1Schema,
  RoomParticipantsCatalogV1Schema,
  RoomProviderSchema,
  RoomUpdateSpecV1Schema,
  RoomV1Schema,
} from "./room.js";
import { RunRecordV1Schema } from "./run-record.js";
import { StudioSettingEntryV1Schema, StudioSettingKeyV1Schema } from "./settings.js";
import {
  MAX_SIGNAL_CHECK_INTERVAL_MINUTES_V1,
  MAX_SIGNAL_NAME_LENGTH_V1,
  MAX_SIGNAL_WATCH_DESCRIPTION_LENGTH_V1,
  MIN_SIGNAL_CHECK_INTERVAL_MINUTES_V1,
  SignalIdSchema,
  SignalInsightV1Schema,
  SignalV1Schema,
} from "./signal.js";
import {
  AssistantAnswerV1Schema,
  AssistantIntentPayloadV1Schema,
  AssistantIntentV1Schema,
  AssistantQueryV1Schema,
} from "./studio-assistant.js";
import { AscReleaseObservationV1Schema, ReleaseProjectionV1Schema } from "./release-observation.js";
import { StudioSnapshotV1Schema } from "./studio-snapshot.js";
import { TaskSpecV1Schema } from "./task-spec.js";
import { UsageSummaryV1Schema } from "./token-usage.js";

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

/**
 * `project.seed`: the from-scratch entry point for the planner's `seed-repo` template item. Given
 * a target directory that must not exist or be empty, creates a brand-new local repository (Git
 * init, an XcodeGen `project.yml` for an iOS app target plus a unit test target, a GitHub Actions
 * workflow, one passing XCTest, README, `docs/STATUS.md`, `.app-factory/project.json`), commits
 * it, then runs the same enrollment scan-and-apply `project.scan`/`project.apply` already perform
 * on it so the result is a converged enrolled project, not just a pile of files.
 */
export const ProjectSeedCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.seed"),
  payload: z.strictObject({
    targetDirectory: AbsolutePathSchema,
    name: z.string().min(1).max(200),
  }),
});

export const ProjectMilestonesListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.milestones.list"),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});

export const ProjectMilestoneUpsertCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.milestone.upsert"),
  payload: ProjectMilestoneUpsertV1Schema,
});

// The Project Registry (`project.register`/`project.list`/`project.show`): see
// `project-registry.ts`'s module doc comment. `project.register` accepts EITHER a previously
// persisted `project.scan` result (`source.kind: "scan"`, the same `planDigest` `project.enroll-
// plan`/`project.apply` accept) OR a bare repository path (`source.kind: "path"`, which runs the
// scanner itself first) -- either way it requires zero `rules.*` blockers before registering;
// `safety.secret-material-detected` findings are surfaced on the result but never block
// registration, since they are owner-reviewed. `displayName`/`slug` default to values derived from
// the repository path when omitted.
export const ProjectRegisterSourceV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("scan"), planDigest: Sha256DigestSchema }),
  z.strictObject({ kind: z.literal("path"), repositoryRoot: AbsolutePathSchema }),
]);
export type ProjectRegisterSourceV1 = z.infer<typeof ProjectRegisterSourceV1Schema>;

export const ProjectRegisterCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.register"),
  payload: z.strictObject({
    source: ProjectRegisterSourceV1Schema,
    displayName: z.string().min(1).max(200).nullable(),
    slug: StableKeySchema.nullable(),
  }),
});

export const MAX_PROJECT_LIST_ITEMS_V1 = 500 as const;

export const ProjectListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.list"),
  payload: EmptyPayloadV1Schema,
});

export const ProjectShowCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.show"),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});

// Studio Phase 4 (`preset.*`/`phase.*`) wire types. See `phase.ts` for the shapes; no phase ever
// executes through these ops (that is the separate planner task) — this is CRUD over durable,
// revisioned phase definitions and the presets that bundle them.
export const MAX_PRESET_LIST_ITEMS_V1 = 200 as const;

export const PresetListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("preset.list"),
  payload: EmptyPayloadV1Schema,
});

export const PresetUpsertCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("preset.upsert"),
  payload: PhasePresetUpsertV1Schema,
});

export const PhaseUpsertCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.upsert"),
  payload: PhaseDefinitionUpsertV1Schema,
});

/**
 * Owner doctrine (`docs/policy/RULES_CORPUS_RECONCILIATION.md` §1): reads one enrolled or observed
 * project repository's mandated docs (`STATUS.md`, `RELEASE_CHECKLIST.md`, `BUGS.md`, `RISKS.md`,
 * `DECISIONS.md`, `quality/**`) read-only, off disk, via `@app-factory/project-docs`. Never mutates
 * anything; the CLI verb `docs snapshot <path>` maps onto this operation the same way `project.scan`
 * maps onto `project scan <path>`.
 */
export const ProjectDocsSnapshotCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("project.docs.snapshot"),
  payload: z.strictObject({ repositoryRoot: AbsolutePathSchema }),
});

/**
 * Mirror direction (contract only, no live provider calls, no credentials): builds the
 * `MirrorProjectionV1` a future Jira/Notion push adapter would send for this project's current repo
 * docs, and diffs it against a caller-supplied `previousProjection` (or `null` for "no previous
 * projection exists yet"). The daemon does not persist "the last projection" anywhere; the caller
 * owns that state, so a retried or repeated call with the same `previousProjection` is naturally
 * idempotent without this operation needing its own durable ledger entry.
 */
export const MirrorPlanCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("mirror.plan"),
  payload: z.strictObject({
    projectId: ProjectIdSchema,
    repositoryRoot: AbsolutePathSchema,
    previousProjection: MirrorProjectionV1Schema.nullable(),
  }),
});

// The Planner (`plan.*`): see `project-plan.ts`'s module doc comment. `plan.propose` builds a
// `ProjectPlanV1` deterministically from a `PhasePresetV1`; `plan.edit`/`plan.approve` are pure CAS
// mutations; `plan.execute` starts the first ready item and `plan.tick` advances the chain as each
// task attempt reaches a terminal state (a human-owned gate item pauses the chain for
// `plan.approve-gate`). Durable and idempotent by command ID like every other CAS-upsert op here.
export const PlanProposeCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.propose"),
  payload: ProjectPlanProposeV1Schema,
});

export const PlanEditCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.edit"),
  payload: ProjectPlanEditBatchV1Schema,
});

export const PlanApproveCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.approve"),
  payload: ProjectPlanApproveV1Schema,
});

export const PlanExecuteCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.execute"),
  payload: ProjectPlanExecuteV1Schema,
});

export const PlanApproveGateCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.approve-gate"),
  payload: ProjectPlanApproveGateV1Schema,
});

export const PlanStatusCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.status"),
  payload: z.strictObject({ planId: ProjectPlanIdSchema }),
});

export const PlanTickCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("plan.tick"),
  payload: ProjectPlanTickV1Schema,
});

// Phase Runner (`phase.run`/`phase.status`/`phase.list`/`phase.approve`/`phase.reject`) wire types.
// See `phase-run.ts` for `PhaseRunV1` itself; this is the one place a phase actually executes.
export const PhaseRunCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.run"),
  payload: PhaseRunCreateV1Schema,
});

export const PhaseStatusCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.status"),
  payload: z.strictObject({ phaseRunId: PhaseRunIdSchema }),
});

export const PhaseListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.list"),
  payload: PhaseRunListQueryV1Schema,
});

export const PhaseApproveCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.approve"),
  payload: PhaseRunDecisionV1Schema,
});

export const PhaseRejectCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("phase.reject"),
  payload: PhaseRunDecisionV1Schema,
});

// Studio rooms (`room.*`) wire types. The moderator is daemon-owned deterministic code
// (`@app-factory/studio-rooms`); these commands only create rooms, append human messages
// (the single-writer transcript is CAS-appended by the daemon), read events, and signal
// human typing so the moderator defers agent chains while the human is composing.
export const RoomCreateCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.create"),
  payload: RoomCreateSpecV1Schema,
});

export const RoomListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.list"),
  payload: z.strictObject({
    limit: z.number().int().min(1).max(MAX_ROOM_LIST_ITEMS_V1),
    /** `false` (the default) hides archived rooms, so an existing caller's `room.list` behavior
     *  is unchanged unless it opts in. */
    includeArchived: z.boolean().default(false),
  }),
});

export const RoomPostCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.post"),
  payload: z.strictObject({
    roomId: RoomIdSchema,
    handle: RoomHumanHandleSchema,
    body: z.string().min(1).max(MAX_ROOM_MESSAGE_BODY_LENGTH_V1),
  }),
});

export const RoomEventsCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.events"),
  payload: z.strictObject({
    roomId: RoomIdSchema,
    afterSequence: NonNegativeSafeIntegerSchema,
    limit: z.number().int().min(1).max(MAX_ROOM_EVENTS_LIMIT_V1),
  }),
});

export const RoomTypingCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.typing"),
  payload: z.strictObject({
    roomId: RoomIdSchema,
    handle: RoomHumanHandleSchema,
    ttlMs: z.number().int().min(1).max(MAX_ROOM_TYPING_TTL_MS_V1),
  }),
});

/**
 * A durable CAS patch over an existing room (Architecture decision 7): title, ambient toggle,
 * cooldown window, archive, budget policy, and participant add/remove. `RoomUpdateSpecV1Schema`
 * itself refuses an empty patch; the daemon separately refuses a stale `expectedUpdatedAt`.
 */
export const RoomUpdateCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.update"),
  payload: RoomUpdateSpecV1Schema,
});

/**
 * Read-only: the wire-safe catalog of the daemon's configured room participants (providers by
 * key/model, plus the operator's roster) so a client can propose a roster before `room.create`. See
 * `RoomParticipantsCatalogV1Schema`; answers `enabled: false` + `unavailableReason` (never an error)
 * when the rooms subsystem is disabled.
 */
export const RoomParticipantsListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("room.participants.list"),
  payload: EmptyPayloadV1Schema,
});

export const StudioSnapshotCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("studio.snapshot"),
  payload: EmptyPayloadV1Schema,
});

/**
 * Studio Phase 6 step B. `release.observe` takes ONE fresh, strictly read-only App Store Connect
 * observation through the daemon's composed observer (`packages/asc-adapter`: bounded GETs only,
 * credential resolved just in time by the broker) and persists it durably; refused with
 * `release.observer-not-configured` when no observer is composed. `buildsLimit` bounds the
 * newest-first builds read per app (Apple's page maximum is 200; the live smoke used 5).
 */
export const ReleaseObserveCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("release.observe"),
  payload: z.strictObject({
    buildsLimit: z.number().int().min(1).max(200),
  }),
});

/**
 * Read-only: the latest persisted App Store Connect observation (or an honest "none yet") plus
 * whether the daemon could take a fresh one. See `ReleaseProjectionV1Schema`.
 */
export const ReleaseProjectionCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("release.projection"),
  payload: EmptyPayloadV1Schema,
});

/**
 * Signals (`signal.*`/`insight.list`): a standing watch and its durably recorded findings. See
 * `packages/contracts/src/v1/signal.ts` for the full model and its place in the larger, not-yet-
 * built Signal -> Insight -> Opportunity -> Product Bet -> Plan -> Build -> Release -> Outcome
 * lifecycle this is the first slice of.
 */
export const SignalCreateCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.create"),
  payload: z.strictObject({
    name: z.string().min(1).max(MAX_SIGNAL_NAME_LENGTH_V1),
    watchDescription: z.string().min(1).max(MAX_SIGNAL_WATCH_DESCRIPTION_LENGTH_V1),
    scoutProvider: RoomProviderSchema,
    /** `null` (the default) leaves the signal manual-only, matching every signal created before
     *  the scheduler (Architecture decision 11) existed. */
    checkIntervalMinutes: z
      .number()
      .int()
      .min(MIN_SIGNAL_CHECK_INTERVAL_MINUTES_V1)
      .max(MAX_SIGNAL_CHECK_INTERVAL_MINUTES_V1)
      .nullable()
      .default(null),
  }),
});

export const SignalListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.list"),
  payload: EmptyPayloadV1Schema,
});

const SignalPayloadV1Schema = z.strictObject({ signalId: SignalIdSchema });

export const SignalPauseCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.pause"),
  payload: SignalPayloadV1Schema,
});

export const SignalResumeCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.resume"),
  payload: SignalPayloadV1Schema,
});

/** Runs the signal's Scout once, right now, outside the serial executor (a Scout call is a real
 *  model/network round trip and must not stall every other command) -- mirrors `release.observe`. */
export const SignalRunNowCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.run-now"),
  payload: SignalPayloadV1Schema,
});

/** Sets or clears (`null`) a signal's scheduled check interval (Architecture decision 11);
 *  `signal.create`'s own `checkIntervalMinutes` covers the create-time case. */
export const SignalRescheduleCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("signal.reschedule"),
  payload: z.strictObject({
    signalId: SignalIdSchema,
    checkIntervalMinutes: z
      .number()
      .int()
      .min(MIN_SIGNAL_CHECK_INTERVAL_MINUTES_V1)
      .max(MAX_SIGNAL_CHECK_INTERVAL_MINUTES_V1)
      .nullable(),
  }),
});

export const InsightListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("insight.list"),
  payload: SignalPayloadV1Schema,
});

/**
 * Provider registry (`provider.*`): see `provider.ts`'s module doc comment and "Architecture
 * decisions" items 2-3 in the Studio chat-first shell plan. `provider.list` is an owner surface --
 * it may return executable-adjacent metadata and credential references, but the daemon never puts
 * a raw secret in any `provider.*` result.
 */
export const ProviderListCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("provider.list"),
  payload: EmptyPayloadV1Schema,
});

export const ProviderUpsertCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("provider.upsert"),
  payload: z.strictObject({
    instance: ProviderUpsertSpecV1Schema,
    /** Digest-CAS guard against the provider config file's current contents (`RoomParticipants
     *  CatalogV1.sourceDigest`-style digest over the provider registry specifically); `null`
     *  accepts whatever the file currently holds -- the same "no expectation yet" convention
     *  `PhaseDefinitionUpsertV1.expectedRevision` already uses. */
    expectedDigest: Sha256DigestSchema.nullable(),
  }),
});

export const ProviderRemoveCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("provider.remove"),
  payload: z.strictObject({
    key: RoomProviderSchema,
    expectedDigest: Sha256DigestSchema.nullable(),
  }),
});

/**
 * Carries the bare credential value ONCE, over the owner-only 0600 socket (Architecture decision
 * 2). This operation's result MUST stay out of `DURABLE_COMMAND_RESULT_OPERATIONS`
 * (`apps/daemon/src/command-runtime.ts`): it is never journaled to `<runtime>/command-results/`,
 * so a durable replay ledger can never come to hold the secret. The daemon writes straight to the
 * macOS Keychain and stores only the resulting `CredentialReferenceV1` in the provider config file.
 */
export const ProviderCredentialSetCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("provider.credential.set"),
  payload: z.strictObject({
    key: RoomProviderSchema,
    secret: z.string().min(1).max(MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1),
  }),
});

/** Runs OUTSIDE the serial executor, like `release.observe` (Architecture decision 3) -- a health
 *  probe is a real process/network round trip and must not stall every other command. `key: null`
 *  probes every configured instance. */
export const ProviderHealthCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("provider.health"),
  payload: z.strictObject({ key: RoomProviderSchema.nullable() }),
});

/**
 * Studio settings (`settings.*`): see `settings.ts`'s module doc comment and "Architecture
 * decisions" item 4. Deliberately narrow -- one kernel-owned key/value table, not a general
 * preferences store.
 */
export const SettingsGetCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("settings.get"),
  payload: z.strictObject({ key: StudioSettingKeyV1Schema }),
});

export const SettingsSetCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("settings.set"),
  payload: z.strictObject({ key: StudioSettingKeyV1Schema, value: RoomProviderSchema }),
});

/**
 * The honest token ledger's read side (`usage.summary`; Architecture decision 6). `sinceDays`
 * bounds how far back the summary looks; see `token-usage.ts` for `UsageSummaryV1Schema` and its
 * null-honest sums plus `unreportedCount`.
 */
export const UsageSummaryCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("usage.summary"),
  payload: z.strictObject({ sinceDays: z.number().int().min(1).max(90) }),
});

export const StudioAssistantQueryCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("studio.assistant.query"),
  payload: z.strictObject({ query: AssistantQueryV1Schema }),
});

export const StudioAssistantIntentProposeCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("studio.assistant.intent.propose"),
  payload: z.strictObject({
    utterance: z.string().min(1).max(2_000),
    intent: AssistantIntentPayloadV1Schema,
  }),
});

export const StudioAssistantIntentExecuteCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("studio.assistant.intent.execute"),
  payload: z.strictObject({ intent: AssistantIntentV1Schema }),
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
  ProjectSeedCommandRequestV1Schema,
  ProjectMilestonesListCommandRequestV1Schema,
  ProjectMilestoneUpsertCommandRequestV1Schema,
  ProjectRegisterCommandRequestV1Schema,
  ProjectListCommandRequestV1Schema,
  ProjectShowCommandRequestV1Schema,
  PresetListCommandRequestV1Schema,
  PresetUpsertCommandRequestV1Schema,
  PhaseUpsertCommandRequestV1Schema,
  ProjectDocsSnapshotCommandRequestV1Schema,
  MirrorPlanCommandRequestV1Schema,
  PlanProposeCommandRequestV1Schema,
  PlanEditCommandRequestV1Schema,
  PlanApproveCommandRequestV1Schema,
  PlanExecuteCommandRequestV1Schema,
  PlanApproveGateCommandRequestV1Schema,
  PlanStatusCommandRequestV1Schema,
  PlanTickCommandRequestV1Schema,
  PhaseRunCommandRequestV1Schema,
  PhaseStatusCommandRequestV1Schema,
  PhaseListCommandRequestV1Schema,
  PhaseApproveCommandRequestV1Schema,
  PhaseRejectCommandRequestV1Schema,
  EffectsStatusCommandRequestV1Schema,
  EffectsListCommandRequestV1Schema,
  RoomCreateCommandRequestV1Schema,
  RoomListCommandRequestV1Schema,
  RoomPostCommandRequestV1Schema,
  RoomEventsCommandRequestV1Schema,
  RoomTypingCommandRequestV1Schema,
  RoomUpdateCommandRequestV1Schema,
  RoomParticipantsListCommandRequestV1Schema,
  ReleaseObserveCommandRequestV1Schema,
  ReleaseProjectionCommandRequestV1Schema,
  SignalCreateCommandRequestV1Schema,
  SignalListCommandRequestV1Schema,
  SignalPauseCommandRequestV1Schema,
  SignalResumeCommandRequestV1Schema,
  SignalRunNowCommandRequestV1Schema,
  SignalRescheduleCommandRequestV1Schema,
  InsightListCommandRequestV1Schema,
  StudioSnapshotCommandRequestV1Schema,
  ProviderListCommandRequestV1Schema,
  ProviderUpsertCommandRequestV1Schema,
  ProviderRemoveCommandRequestV1Schema,
  ProviderCredentialSetCommandRequestV1Schema,
  ProviderHealthCommandRequestV1Schema,
  SettingsGetCommandRequestV1Schema,
  SettingsSetCommandRequestV1Schema,
  UsageSummaryCommandRequestV1Schema,
  StudioAssistantQueryCommandRequestV1Schema,
  StudioAssistantIntentProposeCommandRequestV1Schema,
  StudioAssistantIntentExecuteCommandRequestV1Schema,
]);
export type CommandRequestV1 = z.infer<typeof CommandRequestV1Schema>;
export type CommandOperationV1 = CommandRequestV1["operation"];
export type CommandRequestForOperationV1<Operation extends CommandOperationV1> = Extract<
  CommandRequestV1,
  { operation: Operation }
>;

/**
 * Every operation literal `CommandRequestV1` recognizes, derived from the discriminated union
 * itself (not hand-duplicated) so it can never drift. The unix command server uses this to answer
 * `protocol.unsupported-operation` for a syntactically well-formed frame naming an operation this
 * protocol version does not know, distinct from `protocol.invalid-request` (a frame that fails to
 * parse for any other reason) — see `apps/daemon/src/unix-command-server.ts`.
 */
export const COMMAND_OPERATIONS_V1: readonly CommandOperationV1[] =
  CommandRequestV1Schema.options.map(
    (option) => option.shape.operation.value as CommandOperationV1,
  );

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

/**
 * `xcodegen` reflects `which xcodegen`: when unavailable, `generated`/`built` are both `false` and
 * `detail` says so plainly rather than silently skipping the step. Nothing is ever installed.
 */
export const ProjectSeedToolchainStepV1Schema = z.strictObject({
  available: z.boolean(),
  generated: z.boolean(),
  built: z.boolean(),
  detail: z.string().min(1).max(1_000),
});
export type ProjectSeedToolchainStepV1 = z.infer<typeof ProjectSeedToolchainStepV1Schema>;

/**
 * `registered` is `true` only when the post-seed rescan carried zero `rules.*` blockers and the
 * seeded repository was therefore registered into the Project Registry (`project.register`'s own
 * gate, applied here to the same rescan `enrollment.convergence` already reports) -- the same
 * "only ever a real registration, never a fabricated ID" discipline `project-registry-command-
 * runtime.ts`'s module doc comment describes. `projectId`/`repositoryId`/`slug` are non-null iff
 * `registered` is `true`, so a caller (the Planner's `plan.propose repositoryId`, notably) can
 * check `registered` once rather than null-checking three fields independently.
 */
export const ProjectSeedCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.seed"),
  repositoryRoot: AbsolutePathSchema,
  scaffoldCommitSha: GitObjectIdSchema,
  planDigest: Sha256DigestSchema,
  enrollment: z.strictObject({
    branchName: GitBranchNameSchema.nullable(),
    commitSha: GitObjectIdSchema.nullable(),
    appliedActionKinds: z.array(EnrollmentActionKindV1Schema).max(1_000),
    convergence: ProjectApplyConvergenceV1Schema,
  }),
  xcodegen: ProjectSeedToolchainStepV1Schema,
  registered: z.boolean(),
  projectId: ProjectIdSchema.nullable(),
  repositoryId: RepositoryIdSchema.nullable(),
  slug: StableKeySchema.nullable(),
});

/**
 * `project.milestones.list` answers with the whole `ProjectTimelineV1` (the
 * project's milestones plus the actuals derived from its attempts) rather
 * than a bare list, so a Studio timeline never has to stitch plan and actuals
 * from two reads that could observe different states.
 */
export const ProjectMilestonesListCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.milestones.list"),
  timeline: ProjectTimelineV1Schema,
});

export const ProjectMilestoneUpsertCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.milestone.upsert"),
  milestone: ProjectMilestoneV1Schema,
  created: z.boolean(),
});

/** `secretFindings` is always the FULL list of `safety.secret-material-detected` scan issues for
 * this repository, surfaced for the operator to review -- never a reason `project.register` itself
 * failed (only an unresolved `rules.*` blocker refuses registration, as a thrown protocol error). */
export const ProjectRegisterCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.register"),
  project: ProjectRegistryV1Schema,
  created: z.boolean(),
  secretFindings: z.array(EnrollmentBlockerV1Schema).max(1_000),
});

/** Bounded, unpaginated: registered projects are operator-initiated and few compared to attempts or
 * events, exactly like `preset.list`. */
export const ProjectListCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.list"),
  projects: z.array(ProjectRegistryV1Schema).max(MAX_PROJECT_LIST_ITEMS_V1),
});

export const ProjectShowCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.show"),
  project: ProjectRegistryV1Schema,
});

/** Bounded, unpaginated: presets are operator-authored and few compared to attempts or events. */
export const PresetListCommandResultV1Schema = z.strictObject({
  operation: z.literal("preset.list"),
  presets: z.array(PhasePresetV1Schema).max(MAX_PRESET_LIST_ITEMS_V1),
});

export const PresetUpsertCommandResultV1Schema = z.strictObject({
  operation: z.literal("preset.upsert"),
  preset: PhasePresetV1Schema,
  created: z.boolean(),
});

export const PhaseUpsertCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.upsert"),
  phase: PhaseDefinitionV1Schema,
  created: z.boolean(),
});

export const ProjectDocsSnapshotCommandResultV1Schema = z.strictObject({
  operation: z.literal("project.docs.snapshot"),
  snapshot: ProjectDocsSnapshotV1Schema,
});

export const MirrorPlanCommandResultV1Schema = z.strictObject({
  operation: z.literal("mirror.plan"),
  projection: MirrorProjectionV1Schema,
  diff: MirrorProjectionDiffV1Schema,
});

export const PlanProposeCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.propose"),
  plan: ProjectPlanV1Schema,
});

export const PlanEditCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.edit"),
  plan: ProjectPlanV1Schema,
});

export const PlanApproveCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.approve"),
  plan: ProjectPlanV1Schema,
});

export const PlanExecuteCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.execute"),
  plan: ProjectPlanV1Schema,
});

export const PlanApproveGateCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.approve-gate"),
  plan: ProjectPlanV1Schema,
});

export const PlanStatusCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.status"),
  plan: ProjectPlanV1Schema,
});

/** `advanced` is true when this tick moved the plan forward (submitted the next item, advanced the
 * mirror base, or completed the plan); false when there was nothing new to do (still running, or
 * paused at a gate awaiting `plan.approve-gate`). */
export const PlanTickCommandResultV1Schema = z.strictObject({
  operation: z.literal("plan.tick"),
  plan: ProjectPlanV1Schema,
  advanced: z.boolean(),
});

export const PhaseRunCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.run"),
  run: PhaseRunV1Schema,
});

export const PhaseStatusCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.status"),
  run: PhaseRunV1Schema,
});

export const PhaseListCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.list"),
  page: PhaseRunListPageV1Schema,
});

export const PhaseApproveCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.approve"),
  run: PhaseRunV1Schema,
});

export const PhaseRejectCommandResultV1Schema = z.strictObject({
  operation: z.literal("phase.reject"),
  run: PhaseRunV1Schema,
});

export const RoomCreateCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.create"),
  room: RoomV1Schema,
  /** True when the same roomId was already created with an identical spec. */
  duplicate: z.boolean(),
});

export const RoomListCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.list"),
  rooms: z.array(RoomV1Schema).max(MAX_ROOM_LIST_ITEMS_V1),
});

export const RoomPostCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.post"),
  message: RoomChatMessageV1Schema,
  room: RoomV1Schema,
});

export const RoomEventsCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.events"),
  room: RoomV1Schema,
  moderator: RoomModeratorStatusV1Schema,
  messages: z.array(RoomMessageV1Schema).max(MAX_ROOM_EVENTS_LIMIT_V1),
  nextAfterSequence: NonNegativeSafeIntegerSchema,
});

export const RoomTypingCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.typing"),
  roomId: RoomIdSchema,
  typingUntil: IsoInstantSchema,
});

export const RoomUpdateCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.update"),
  room: RoomV1Schema,
});

export const RoomParticipantsListCommandResultV1Schema = z.strictObject({
  operation: z.literal("room.participants.list"),
  catalog: RoomParticipantsCatalogV1Schema,
});

export const StudioSnapshotCommandResultV1Schema = z.strictObject({
  operation: z.literal("studio.snapshot"),
  snapshot: StudioSnapshotV1Schema,
});

export const SignalCreateCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.create"),
  signal: SignalV1Schema,
});

export const SignalListCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.list"),
  signals: z.array(SignalV1Schema).max(1_000),
});

export const SignalPauseCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.pause"),
  signal: SignalV1Schema,
});

export const SignalResumeCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.resume"),
  signal: SignalV1Schema,
});

export const SignalRunNowCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.run-now"),
  signal: SignalV1Schema,
  /** The recorded Insight when the Scout found something new; `null` when it found nothing new
   *  or its answer was refused (a schema violation, no citation, or a scout-side failure --
   *  `outcome` says which). */
  insight: SignalInsightV1Schema.nullable(),
  outcome: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("found") }),
    z.strictObject({ kind: z.literal("nothing-new") }),
    z.strictObject({
      kind: z.literal("scout-failed"),
      code: z.enum(["scout-not-configured", "scout-error", "scout-malformed-finding"]),
      message: z.string().min(1).max(1_000),
    }),
  ]),
});

export const SignalRescheduleCommandResultV1Schema = z.strictObject({
  operation: z.literal("signal.reschedule"),
  signal: SignalV1Schema,
});

export const InsightListCommandResultV1Schema = z.strictObject({
  operation: z.literal("insight.list"),
  insights: z.array(SignalInsightV1Schema).max(1_000),
});

export const ReleaseObserveCommandResultV1Schema = z.strictObject({
  operation: z.literal("release.observe"),
  observation: AscReleaseObservationV1Schema,
});

export const ReleaseProjectionCommandResultV1Schema = z.strictObject({
  operation: z.literal("release.projection"),
  projection: ReleaseProjectionV1Schema,
});

export const ProviderListCommandResultV1Schema = z.strictObject({
  operation: z.literal("provider.list"),
  providers: z.array(ProviderInstanceV1Schema).max(MAX_PROVIDER_INSTANCES_V1),
});

export const ProviderUpsertCommandResultV1Schema = z.strictObject({
  operation: z.literal("provider.upsert"),
  instance: ProviderInstanceV1Schema,
  created: z.boolean(),
  /** The provider config file's digest after this write -- the next CAS `expectedDigest`. */
  digest: Sha256DigestSchema,
});

export const ProviderRemoveCommandResultV1Schema = z.strictObject({
  operation: z.literal("provider.remove"),
  removed: z.boolean(),
  digest: Sha256DigestSchema,
});

/** Never echoes the secret; only the reference the daemon just wrote to the Keychain. */
export const ProviderCredentialSetCommandResultV1Schema = z.strictObject({
  operation: z.literal("provider.credential.set"),
  key: RoomProviderSchema,
  credentialReference: CredentialReferenceV1Schema,
});

export const ProviderHealthCommandResultV1Schema = z.strictObject({
  operation: z.literal("provider.health"),
  reports: z.array(ProviderHealthEntryV1Schema).max(MAX_PROVIDER_INSTANCES_V1),
});

export const SettingsGetCommandResultV1Schema = z.strictObject({
  operation: z.literal("settings.get"),
  entry: StudioSettingEntryV1Schema,
});

export const SettingsSetCommandResultV1Schema = z.strictObject({
  operation: z.literal("settings.set"),
  entry: StudioSettingEntryV1Schema,
});

export const UsageSummaryCommandResultV1Schema = z.strictObject({
  operation: z.literal("usage.summary"),
  summary: UsageSummaryV1Schema,
});

export const StudioAssistantQueryCommandResultV1Schema = z.strictObject({
  operation: z.literal("studio.assistant.query"),
  answer: AssistantAnswerV1Schema,
});

export const StudioAssistantIntentProposeCommandResultV1Schema = z.strictObject({
  operation: z.literal("studio.assistant.intent.propose"),
  intent: AssistantIntentV1Schema,
});

/**
 * Tags which existing daemon operation `studio.assistant.intent.execute` actually dispatched to,
 * and embeds that operation's own, already-defined result schema verbatim — no separate,
 * potentially-drifting copy of its shape.
 */
export const AssistantIntentExecutionOutcomeV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("task.submit"), result: SubmitCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("task.run"), result: RunCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("project.scan"), result: ProjectScanCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("project.apply"), result: ProjectApplyCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("attempt.unblock"), result: UnblockCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("plan.propose"), result: PlanProposeCommandResultV1Schema }),
  z.strictObject({ kind: z.literal("plan.execute"), result: PlanExecuteCommandResultV1Schema }),
]);
export type AssistantIntentExecutionOutcomeV1 = z.infer<
  typeof AssistantIntentExecutionOutcomeV1Schema
>;

export const StudioAssistantIntentExecuteCommandResultV1Schema = z.strictObject({
  operation: z.literal("studio.assistant.intent.execute"),
  intentId: AssistantIntentIdSchema,
  outcome: AssistantIntentExecutionOutcomeV1Schema,
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
  ProjectSeedCommandResultV1Schema,
  ProjectMilestonesListCommandResultV1Schema,
  ProjectMilestoneUpsertCommandResultV1Schema,
  ProjectRegisterCommandResultV1Schema,
  ProjectListCommandResultV1Schema,
  ProjectShowCommandResultV1Schema,
  PresetListCommandResultV1Schema,
  PresetUpsertCommandResultV1Schema,
  PhaseUpsertCommandResultV1Schema,
  ProjectDocsSnapshotCommandResultV1Schema,
  MirrorPlanCommandResultV1Schema,
  PlanProposeCommandResultV1Schema,
  PlanEditCommandResultV1Schema,
  PlanApproveCommandResultV1Schema,
  PlanExecuteCommandResultV1Schema,
  PlanApproveGateCommandResultV1Schema,
  PlanStatusCommandResultV1Schema,
  PlanTickCommandResultV1Schema,
  PhaseRunCommandResultV1Schema,
  PhaseStatusCommandResultV1Schema,
  PhaseListCommandResultV1Schema,
  PhaseApproveCommandResultV1Schema,
  PhaseRejectCommandResultV1Schema,
  EffectsStatusCommandResultV1Schema,
  EffectsListCommandResultV1Schema,
  RoomCreateCommandResultV1Schema,
  RoomListCommandResultV1Schema,
  RoomPostCommandResultV1Schema,
  RoomEventsCommandResultV1Schema,
  RoomTypingCommandResultV1Schema,
  RoomUpdateCommandResultV1Schema,
  RoomParticipantsListCommandResultV1Schema,
  ReleaseObserveCommandResultV1Schema,
  ReleaseProjectionCommandResultV1Schema,
  SignalCreateCommandResultV1Schema,
  SignalListCommandResultV1Schema,
  SignalPauseCommandResultV1Schema,
  SignalResumeCommandResultV1Schema,
  SignalRunNowCommandResultV1Schema,
  SignalRescheduleCommandResultV1Schema,
  InsightListCommandResultV1Schema,
  StudioSnapshotCommandResultV1Schema,
  ProviderListCommandResultV1Schema,
  ProviderUpsertCommandResultV1Schema,
  ProviderRemoveCommandResultV1Schema,
  ProviderCredentialSetCommandResultV1Schema,
  ProviderHealthCommandResultV1Schema,
  SettingsGetCommandResultV1Schema,
  SettingsSetCommandResultV1Schema,
  UsageSummaryCommandResultV1Schema,
  StudioAssistantQueryCommandResultV1Schema,
  StudioAssistantIntentProposeCommandResultV1Schema,
  StudioAssistantIntentExecuteCommandResultV1Schema,
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
