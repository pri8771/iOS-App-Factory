import { z } from "zod";

import { AttemptStateV1Schema } from "./execution.js";
import {
  GateOwnerV1Schema,
  ProjectLifecycleStageV1Schema,
  TypedGateNameV1Schema,
} from "./lifecycle.js";
import { MAX_PROJECT_MILESTONES_V1, ProjectMilestoneV1Schema } from "./milestone.js";
import {
  AbsolutePathSchema,
  AttemptIdSchema,
  BlockerV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  TaskIdSchema,
  type StableKey,
} from "./primitives.js";

/**
 * Studio Phase 2 read model: the single call
 * (`studio.snapshot`/`StudioSnapshotCommandRequestV1`) the Studio Mac app's dashboard makes on
 * open, per `docs/roadmap/STUDIO_PHASES.md` Phase 2. It composes from repositories that already
 * exist in this repository (attempts, events, the local portfolio projection, and — as of the
 * `studio/milestones-and-phase` merge — the durable milestone repository). `rooms` and typed
 * `gates` still belong to worktrees not reconciled here yet; every field those own is present in
 * the wire shape now, so the app can code against its final contract today, but the daemon
 * reports each one empty with an explicit `unavailableReason` string rather than a fabricated
 * value — see `STUDIO_NOT_YET_WIRED_REASON_V1` below. This mirrors, field for field, the
 * "never a defaulted number for a source you don't have" discipline `portfolio-read-model.ts`
 * already established for the pre-existing portfolio snapshot.
 *
 * `projects[].timeline.milestones` is `ProjectMilestoneV1[]` — the same revisioned type
 * `project.milestones.list`/`project.milestone.upsert` read and write (`milestone.ts`). Earlier
 * revisions of this file defined a second, incompatible `StudioMilestone` placeholder shape
 * (different status vocabulary: `at-risk` was valid there and rejected here) — see ADR
 * `apps/studio-mac/docs/architecture/0003-studio-phase2-service-integration.md` decision 4 for
 * the history. That seam is closed: there is exactly one milestone vocabulary now.
 */

export const MAX_STUDIO_PROJECTS_V1 = 1_000 as const;

/**
 * The literal reason string the daemon reports for every studio concept (portfolio `rooms`,
 * still a separate unmerged worktree) that a parallel worktree owns and this daemon cannot
 * populate yet. Kept as one shared constant, not per-field prose, so every "not wired yet"
 * surface in a snapshot is byte-identical and grep-able.
 */
export const STUDIO_NOT_YET_WIRED_REASON_V1 = "not yet wired (studio/rooms-core pending)" as const;

/**
 * Reported on `gates.unavailableReason` for a project with no persisted typed-gate observation
 * yet. Distinct from `STUDIO_NOT_YET_WIRED_REASON_V1`: gate persistence itself now exists
 * (`lifecycle.ts`'s `TypedGateV1`); this project simply has no recorded gate yet, which is an
 * honest fact about the project, not a missing daemon capability.
 */
export const STUDIO_NO_GATE_RECORDS_REASON_V1 = "no gate records for project" as const;

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
 * `typed`/`owner` are the real typed-lifecycle-gate vocabulary (`lifecycle.ts`'s
 * `TypedGateNameV1`/`GateOwnerV1`), not placeholder strings: a project whose gate state is a real,
 * persisted `TypedGateV1` observation reports it here verbatim. A project with no persisted gate
 * observation yet reports `state: "unavailable"` with `typed`/`owner` both `null` and
 * `unavailableReason` set to `STUDIO_NO_GATE_RECORDS_REASON_V1` — an honest fact about that
 * project, not a missing daemon capability.
 */
export const StudioProjectGatesV1Schema = z
  .strictObject({
    typed: TypedGateNameV1Schema.nullable(),
    owner: GateOwnerV1Schema.nullable(),
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

export const StudioTimelineActualV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  label: z.string().min(1).max(200),
  occurredAt: IsoInstantSchema,
});
export type StudioTimelineActualV1 = z.infer<typeof StudioTimelineActualV1Schema>;

/**
 * `actuals` is real, derived from this project's own attempt/event history. `milestones` is the
 * project's real, revisioned milestone plan (`ProjectMilestoneV1[]`, `milestone.ts`) — the exact
 * type `project.milestones.list`/`project.milestone.upsert` read and write, not a second,
 * incompatible placeholder shape (see the module doc comment). An empty array is a legitimate
 * real state — a project with no authored milestones yet — so, unlike the rest of this file's
 * metrics, `milestonesUnavailableReason` is not required to be non-null exactly when the array is
 * empty; it may only be non-null when the array actually is empty, and must stay `null` once any
 * milestone is present.
 */
export const StudioProjectTimelineV1Schema = z
  .strictObject({
    milestones: z.array(ProjectMilestoneV1Schema).max(MAX_PROJECT_MILESTONES_V1),
    milestonesUnavailableReason: z.string().min(1).max(500).nullable(),
    actuals: z.array(StudioTimelineActualV1Schema).max(1_000),
  })
  .superRefine((timeline, context) => {
    if (timeline.milestones.length > 0 && timeline.milestonesUnavailableReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["milestonesUnavailableReason"],
        message: "milestonesUnavailableReason must be null once milestones are present",
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
  /**
   * A stable, StableKey-shaped identifier derived from the enrolled project/manifest when one is
   * known, and otherwise a deterministic fallback derived only from `projectId` — never from
   * `name`, which can change and is not fit to key a merge on. The Studio app uses this to merge
   * a live snapshot's timeline rows with the fixture/portfolio slug it already keys on, replacing
   * a best-effort slugify-of-name heuristic that could and did diverge from the curated slug.
   */
  slug: StableKeySchema,
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
 * Deterministic fallback slug derived only from `projectId`, used whenever no enrolled
 * project/manifest slug is known. Never derived from `displayName`. `project-` plus the full
 * lowercase UUID is always a valid `StableKey` (39 characters, well under the 64-character bound).
 */
export function projectSlugFallbackV1(projectId: string): StableKey {
  return StableKeySchema.parse(`project-${projectId}`);
}

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
