import { z } from "zod";

import { AttemptStateV1Schema } from "./execution.js";
import { ProjectLifecycleStageV1Schema } from "./lifecycle.js";
import {
  AbsolutePathSchema,
  AttemptIdSchema,
  BlockerV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  TaskIdSchema,
} from "./primitives.js";

/**
 * Studio Phase 2 read model: the single call
 * (`studio.snapshot`/`StudioSnapshotCommandRequestV1`) the Studio Mac app's dashboard makes on
 * open, per `docs/roadmap/STUDIO_PHASES.md` Phase 2. It composes today from repositories that
 * already exist in this repository (attempts, events, the local portfolio projection); the
 * milestones/gates/rooms concepts named in the shape below belong to three separate,
 * still-unmerged worktrees (`studio/milestones-and-phase`, `studio/lifecycle-reconciliation` +
 * `studio/policy-engine-scoping`, and rooms — a later phase). Every field those worktrees will
 * eventually own is present in the wire shape now, so the app can code against its final contract
 * today, but the daemon in *this* repository always reports it empty with an explicit
 * `unavailableReason` string rather than a fabricated value — see
 * `STUDIO_NOT_YET_WIRED_REASON_V1` below. This mirrors, field for field, the
 * "never a defaulted number for a source you don't have" discipline `portfolio-read-model.ts`
 * already established for the pre-existing portfolio snapshot.
 */

export const MAX_STUDIO_PROJECTS_V1 = 1_000 as const;

/**
 * The literal reason string the daemon reports for every studio concept
 * (`milestones`, project `gates`, and portfolio `rooms`) that a parallel, unmerged worktree owns.
 * Kept as one shared constant, not per-field prose, so every "not wired yet" surface in a snapshot
 * is byte-identical and grep-able.
 */
export const STUDIO_NOT_YET_WIRED_REASON_V1 =
  "not yet wired (studio/milestones-and-phase pending)" as const;

/**
 * Shared invariant for every nullable portfolio metric below: exactly one of `value` or
 * `unavailableReason` is present. A metric is either a real computed number or an
 * honestly-explained absence — never a silent `null` and never a fabricated `0`.
 */
function assertMutuallyExclusiveMetric(
  metric: Readonly<{ value: unknown; unavailableReason: string | null }>,
  context: z.RefinementCtx,
): void {
  if ((metric.value === null) === (metric.unavailableReason === null)) {
    context.addIssue({
      code: "custom",
      message:
        "exactly one of value or unavailableReason must be present: a metric is either a real computed value or an honestly-explained absence, never both and never neither",
    });
  }
}

export const StudioCountMetricV1Schema = z
  .strictObject({
    value: NonNegativeSafeIntegerSchema.nullable(),
    unavailableReason: z.string().min(1).max(500).nullable(),
  })
  .superRefine(assertMutuallyExclusiveMetric);
export type StudioCountMetricV1 = z.infer<typeof StudioCountMetricV1Schema>;

export const StudioRatioMetricV1Schema = z
  .strictObject({
    value: z.number().min(0).max(1).nullable(),
    unavailableReason: z.string().min(1).max(500).nullable(),
  })
  .superRefine(assertMutuallyExclusiveMetric);
export type StudioRatioMetricV1 = z.infer<typeof StudioRatioMetricV1Schema>;

export const StudioDurationSecondsMetricV1Schema = z
  .strictObject({
    value: z.number().min(0).nullable(),
    unavailableReason: z.string().min(1).max(500).nullable(),
  })
  .superRefine(assertMutuallyExclusiveMetric);
export type StudioDurationSecondsMetricV1 = z.infer<typeof StudioDurationSecondsMetricV1Schema>;

/** Portfolio-wide aggregates for the dashboard header. Every field is independently nullable. */
export const StudioPortfolioAggregatesV1Schema = z.strictObject({
  verifiedThisWeek: StudioCountMetricV1Schema,
  awaitingYouCount: StudioCountMetricV1Schema,
  passRate: StudioRatioMetricV1Schema,
  medianRunSeconds: StudioDurationSecondsMetricV1Schema,
  agentWindowShare: StudioRatioMetricV1Schema,
});
export type StudioPortfolioAggregatesV1 = z.infer<typeof StudioPortfolioAggregatesV1Schema>;

export const StudioGateStateV1Schema = z.enum([
  "pending",
  "satisfied",
  "waived",
  "blocked",
  "unavailable",
]);
export type StudioGateStateV1 = z.infer<typeof StudioGateStateV1Schema>;

/**
 * `typed`/`owner` mirror the typed-lifecycle-gate and human-only-owner-field concepts
 * `studio/lifecycle-reconciliation` and `studio/policy-engine-scoping` will introduce. Until those
 * branches merge, `state` is always `"unavailable"` and `typed`/`owner` are always `null`.
 */
export const StudioProjectGatesV1Schema = z
  .strictObject({
    typed: z.string().min(1).max(200).nullable(),
    owner: z.string().min(1).max(200).nullable(),
    state: StudioGateStateV1Schema,
    unavailableReason: z.string().min(1).max(500).nullable(),
  })
  .superRefine((gates, context) => {
    if (gates.state === "unavailable") {
      if (gates.unavailableReason === null) {
        context.addIssue({
          code: "custom",
          path: ["unavailableReason"],
          message: "unavailableReason is required while gates state is unavailable",
        });
      }
      if (gates.typed !== null || gates.owner !== null) {
        context.addIssue({
          code: "custom",
          message: "typed and owner must stay null while gates are unavailable",
        });
      }
    } else if (gates.unavailableReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["unavailableReason"],
        message: "unavailableReason must be null once gates report a real state",
      });
    }
  });
export type StudioProjectGatesV1 = z.infer<typeof StudioProjectGatesV1Schema>;

export const StudioAttemptSummaryV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  taskId: TaskIdSchema,
  state: AttemptStateV1Schema,
  updatedAt: IsoInstantSchema,
  blocker: BlockerV1Schema.nullable(),
});
export type StudioAttemptSummaryV1 = z.infer<typeof StudioAttemptSummaryV1Schema>;

export const StudioAwaitingHumanKindV1Schema = z.enum(["blocked-attempt", "gate-approval"]);
export type StudioAwaitingHumanKindV1 = z.infer<typeof StudioAwaitingHumanKindV1Schema>;

/**
 * One item the human owner still needs to act on. `"blocked-attempt"` is populated for real today
 * from live attempt state; `"gate-approval"` exists for forward compatibility with
 * `studio/policy-engine-scoping`'s owner-approval gates and is never emitted by this daemon yet.
 */
export const StudioAwaitingHumanItemV1Schema = z
  .strictObject({
    kind: StudioAwaitingHumanKindV1Schema,
    attemptId: AttemptIdSchema.nullable(),
    summary: z.string().min(1).max(1_000),
    since: IsoInstantSchema,
  })
  .superRefine((item, context) => {
    if ((item.kind === "blocked-attempt") !== (item.attemptId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: "attemptId must be present exactly for a blocked-attempt item",
      });
    }
  });
export type StudioAwaitingHumanItemV1 = z.infer<typeof StudioAwaitingHumanItemV1Schema>;

/**
 * Placeholder identity for the not-yet-real milestone concept `studio/milestones-and-phase` owns.
 * The daemon in this repository never populates a non-empty `milestones` array, so this schema is
 * exercised only by round-trip/type tests until that branch merges and this type is reconciled with
 * the real one.
 */
export const StudioMilestoneIdV1Schema = z.string().min(1).max(128).brand<"StudioMilestoneId">();
export type StudioMilestoneIdV1 = z.infer<typeof StudioMilestoneIdV1Schema>;

export const StudioMilestoneStatusV1Schema = z.enum(["planned", "at-risk", "met", "missed"]);
export type StudioMilestoneStatusV1 = z.infer<typeof StudioMilestoneStatusV1Schema>;

export const StudioMilestoneV1Schema = z.strictObject({
  milestoneId: StudioMilestoneIdV1Schema,
  name: z.string().min(1).max(200),
  /** `null` means no honest target date exists yet; the assistant must not invent one. */
  targetDate: IsoInstantSchema.nullable(),
  status: StudioMilestoneStatusV1Schema,
});
export type StudioMilestoneV1 = z.infer<typeof StudioMilestoneV1Schema>;

export const StudioTimelineActualV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  label: z.string().min(1).max(200),
  occurredAt: IsoInstantSchema,
});
export type StudioTimelineActualV1 = z.infer<typeof StudioTimelineActualV1Schema>;

/**
 * `actuals` is real, derived from this project's own attempt/event history. `milestones` is always
 * empty today (see the module doc comment); `milestonesUnavailableReason` explains why exactly when
 * `milestones` is empty, so an empty array never reads as "on schedule with zero milestones."
 */
export const StudioProjectTimelineV1Schema = z
  .strictObject({
    milestones: z.array(StudioMilestoneV1Schema).max(200),
    milestonesUnavailableReason: z.string().min(1).max(500).nullable(),
    actuals: z.array(StudioTimelineActualV1Schema).max(1_000),
  })
  .superRefine((timeline, context) => {
    if ((timeline.milestones.length === 0) !== (timeline.milestonesUnavailableReason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["milestonesUnavailableReason"],
        message: "milestonesUnavailableReason must be present exactly when milestones is empty",
      });
    }
  });
export type StudioProjectTimelineV1 = z.infer<typeof StudioProjectTimelineV1Schema>;

/**
 * `owner-doctrine` badge data: which enrolled/observed repository this project's docs-derived
 * fields were read from, and, per the corpus's own authority order (`governance/DOCUMENTATION_POLICY.md`:
 * code -> feature contracts -> decision records -> completion reports -> the central standard) as
 * applied here, whether `lifecycleStage` ultimately came from this repository's own kernel/gate
 * evidence (`factory-evidence`) or from its repo docs (`repo-docs`) -- `factory-evidence` wins
 * whenever both exist. `null` on the whole field means no repo-docs source is configured for this
 * project at all (today's default for anything outside `APP_FACTORY_PROJECT_DOCS_SOURCES`), not
 * "repo docs were checked and had nothing."
 */
export const StudioFieldSourceV1Schema = z.enum(["repo-docs", "factory-evidence", "milestone"]);
export type StudioFieldSourceV1 = z.infer<typeof StudioFieldSourceV1Schema>;

export const StudioProjectDocsSourceKindV1Schema = z.enum(["enrolled", "observed"]);
export type StudioProjectDocsSourceKindV1 = z.infer<typeof StudioProjectDocsSourceKindV1Schema>;

export const StudioProjectDocsProvenanceV1Schema = z.strictObject({
  sourceKind: StudioProjectDocsSourceKindV1Schema,
  repositoryRoot: AbsolutePathSchema,
  docsSnapshotDigest: Sha256DigestSchema,
  lifecycleStageSource: StudioFieldSourceV1Schema.nullable(),
  awaitingHumanFromDocsCount: NonNegativeSafeIntegerSchema,
});
export type StudioProjectDocsProvenanceV1 = z.infer<typeof StudioProjectDocsProvenanceV1Schema>;

export const StudioProjectV1Schema = z.strictObject({
  projectId: ProjectIdSchema,
  name: z.string().min(1).max(200),
  lifecycleStage: ProjectLifecycleStageV1Schema.nullable(),
  gates: StudioProjectGatesV1Schema,
  latestAttemptSummary: StudioAttemptSummaryV1Schema.nullable(),
  awaitingHuman: z.array(StudioAwaitingHumanItemV1Schema).max(100),
  timeline: StudioProjectTimelineV1Schema,
  docsProvenance: StudioProjectDocsProvenanceV1Schema.nullable(),
});
export type StudioProjectV1 = z.infer<typeof StudioProjectV1Schema>;

/**
 * Placeholder for the rooms concept `docs/roadmap/STUDIO_PHASES.md` Phase 3 ("Chat + rooms") and
 * the separate `studio/rooms-core` worktree own. Always empty in this daemon; see
 * `roomsUnavailableReason`.
 */
export const StudioRoomIdV1Schema = z.string().min(1).max(128).brand<"StudioRoomId">();
export type StudioRoomIdV1 = z.infer<typeof StudioRoomIdV1Schema>;

export const StudioRoomV1Schema = z.strictObject({
  roomId: StudioRoomIdV1Schema,
  name: z.string().min(1).max(200),
  kind: z.enum(["project", "portfolio"]),
});
export type StudioRoomV1 = z.infer<typeof StudioRoomV1Schema>;

const StudioSnapshotDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  generatedAt: IsoInstantSchema,
  projects: z.array(StudioProjectV1Schema).max(MAX_STUDIO_PROJECTS_V1),
  rooms: z.array(StudioRoomV1Schema).max(1_000),
  roomsUnavailableReason: z.string().min(1).max(500).nullable(),
  portfolio: StudioPortfolioAggregatesV1Schema,
};

export const StudioSnapshotDigestInputV1Schema = z.strictObject(StudioSnapshotDigestInputV1Shape);
export type StudioSnapshotDigestInputV1 = z.infer<typeof StudioSnapshotDigestInputV1Schema>;

export const StudioSnapshotV1Schema = z
  .strictObject({
    ...StudioSnapshotDigestInputV1Shape,
    sourceSnapshotDigest: Sha256DigestSchema,
  })
  .superRefine((snapshot, context) => {
    if ((snapshot.rooms.length === 0) !== (snapshot.roomsUnavailableReason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["roomsUnavailableReason"],
        message: "roomsUnavailableReason must be present exactly when rooms is empty",
      });
    }
    const projectIds = snapshot.projects.map((project) => project.projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "projectIds must be unique",
      });
    }
    const sortKey = (project: (typeof snapshot.projects)[number]): string =>
      `${project.name.toLowerCase()} ${project.projectId}`;
    const sortedKeys = snapshot.projects.map(sortKey);
    const canonicalKeys = [...sortedKeys].sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(sortedKeys) !== JSON.stringify(canonicalKeys)) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "projects must be sorted by name (then projectId)",
      });
    }
    const generatedAt = Date.parse(snapshot.generatedAt);
    for (const [index, project] of snapshot.projects.entries()) {
      if (
        project.latestAttemptSummary !== null &&
        Date.parse(project.latestAttemptSummary.updatedAt) > generatedAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "latestAttemptSummary", "updatedAt"],
          message: "latestAttemptSummary.updatedAt must not be after generatedAt",
        });
      }
      for (const [actualIndex, actual] of project.timeline.actuals.entries()) {
        if (Date.parse(actual.occurredAt) > generatedAt) {
          context.addIssue({
            code: "custom",
            path: ["projects", index, "timeline", "actuals", actualIndex, "occurredAt"],
            message: "a timeline actual must not occur after generatedAt",
          });
        }
      }
    }
  });
export type StudioSnapshotV1 = z.infer<typeof StudioSnapshotV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it as recursively
 * key-sorted JSON UTF-8 and exclude `sourceSnapshotDigest`. Mirrors
 * `portfolioReadModelDigestInputV1`/`canonicalPortfolioReadModelDigestInputV1` exactly.
 */
export function studioSnapshotDigestInputV1(
  snapshot: StudioSnapshotDigestInputV1 | StudioSnapshotV1,
): StudioSnapshotDigestInputV1 {
  return StudioSnapshotDigestInputV1Schema.parse({
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    projects: snapshot.projects,
    rooms: snapshot.rooms,
    roomsUnavailableReason: snapshot.roomsUnavailableReason,
    portfolio: snapshot.portfolio,
  });
}

/** Canonical UTF-8 text to hash for `sourceSnapshotDigest`. */
export function canonicalStudioSnapshotDigestInputV1(
  snapshot: StudioSnapshotDigestInputV1 | StudioSnapshotV1,
): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(studioSnapshotDigestInputV1(snapshot)));
}
