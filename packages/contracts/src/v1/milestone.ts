import { z } from "zod";

import { CommandOriginV1Schema } from "./command.js";
import {
  CalendarDateSchema,
  CommandIdSchema,
  EventIdSchema,
  IsoInstantSchema,
  MilestoneIdSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";
import { PortfolioSourceAvailabilityV1Schema } from "./portfolio-read-model.js";

export const MAX_MILESTONE_DEPENDENCIES_V1 = 50 as const;
export const MAX_PROJECT_MILESTONES_V1 = 500 as const;
export const MAX_TIMELINE_PHASES_V1 = 500 as const;
export const MAX_TIMELINE_LIFECYCLE_ACTUALS_V1 = 1_000 as const;

export const ProjectMilestoneKindV1Schema = z.enum(["stage", "gate", "release"]);
export type ProjectMilestoneKindV1 = z.infer<typeof ProjectMilestoneKindV1Schema>;

export const ProjectMilestoneOwnerV1Schema = z.enum(["human", "machine"]);
export type ProjectMilestoneOwnerV1 = z.infer<typeof ProjectMilestoneOwnerV1Schema>;

export const ProjectMilestoneStatusV1Schema = z.enum(["planned", "active", "done", "abandoned"]);
export type ProjectMilestoneStatusV1 = z.infer<typeof ProjectMilestoneStatusV1Schema>;

/**
 * The operator-authored content of a milestone. `targetDate: null` is a
 * first-class, valid value meaning "no honest estimate": Studio renders it as
 * "won't guess" and nothing in the factory may ever substitute a default or
 * inferred date for it. `evidenceDigest` binds a status claim (typically
 * `done`) to a durable evidence artifact when one exists.
 */
const ProjectMilestoneDraftV1Shape = {
  milestoneId: MilestoneIdSchema,
  projectId: ProjectIdSchema,
  phase: StableKeySchema,
  kind: ProjectMilestoneKindV1Schema,
  label: z.string().min(1).max(200),
  targetDate: CalendarDateSchema.nullable(),
  dependsOn: z.array(MilestoneIdSchema).max(MAX_MILESTONE_DEPENDENCIES_V1),
  owner: ProjectMilestoneOwnerV1Schema,
  status: ProjectMilestoneStatusV1Schema,
  evidenceDigest: Sha256DigestSchema.nullable(),
};

function refineMilestoneDraft(
  milestone: Readonly<{ milestoneId: string; dependsOn: readonly string[] }>,
  context: z.RefinementCtx,
): void {
  if (new Set(milestone.dependsOn).size !== milestone.dependsOn.length) {
    context.addIssue({
      code: "custom",
      path: ["dependsOn"],
      message: "dependsOn milestone IDs must be unique",
    });
  }
  if (milestone.dependsOn.includes(milestone.milestoneId)) {
    context.addIssue({
      code: "custom",
      path: ["dependsOn"],
      message: "a milestone cannot depend on itself",
    });
  }
}

export const ProjectMilestoneDraftV1Schema = z
  .strictObject(ProjectMilestoneDraftV1Shape)
  .superRefine(refineMilestoneDraft);
export type ProjectMilestoneDraftV1 = z.infer<typeof ProjectMilestoneDraftV1Schema>;

/**
 * The durable, revisioned milestone record. `revision` starts at 0 on
 * creation and advances by exactly one per accepted upsert; the kernel keeps
 * every revision as an append-only history row, so this is always the head.
 */
export const ProjectMilestoneV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    ...ProjectMilestoneDraftV1Shape,
    revision: NonNegativeSafeIntegerSchema,
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((milestone, context) => {
    refineMilestoneDraft(milestone, context);
    if (milestone.updatedAt < milestone.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
    if (milestone.revision === 0 && milestone.updatedAt !== milestone.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "revision 0 must carry its creation timestamp",
      });
    }
  });
export type ProjectMilestoneV1 = z.infer<typeof ProjectMilestoneV1Schema>;

/**
 * Create-or-update intent. `expectedRevision: null` creates the milestone and
 * fails if it already exists; a number is a compare-and-set update that fails
 * unless the stored head revision matches, so two operators can never
 * silently overwrite each other's edits.
 */
export const ProjectMilestoneUpsertV1Schema = z.strictObject({
  milestone: ProjectMilestoneDraftV1Schema,
  expectedRevision: NonNegativeSafeIntegerSchema.nullable(),
});
export type ProjectMilestoneUpsertV1 = z.infer<typeof ProjectMilestoneUpsertV1Schema>;

/**
 * The durable command envelope the kernel journals for every accepted upsert
 * in its milestone revision history. It is deliberately not a member of the
 * attempt-scoped `CommandV1` union / `commands` table: milestones are a
 * separate aggregate with their own append-only ledger, keyed by the same
 * client-issued `commandId` so a replayed command is idempotent.
 */
export const ProjectMilestoneUpsertCommandV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
  kind: z.literal("project.milestone.upsert"),
  upsert: ProjectMilestoneUpsertV1Schema,
});
export type ProjectMilestoneUpsertCommandV1 = z.infer<typeof ProjectMilestoneUpsertCommandV1Schema>;

/**
 * Observed execution facts for one Studio phase of a project, derived only
 * from durable kernel attempts (each attempt's task snapshot carries the
 * task's `phase`; `phase: null` collects attempts whose task declared none).
 * Every instant here is something that actually happened; there is no
 * projected or estimated field on purpose.
 */
export const ProjectPhaseActualsV1Schema = z
  .strictObject({
    phase: StableKeySchema.nullable(),
    attemptCount: PositiveSafeIntegerSchema,
    activeAttemptCount: NonNegativeSafeIntegerSchema,
    blockerCount: NonNegativeSafeIntegerSchema,
    succeededAttemptCount: NonNegativeSafeIntegerSchema,
    firstAttemptAt: IsoInstantSchema,
    lastActivityAt: IsoInstantSchema,
    lastSucceededAt: IsoInstantSchema.nullable(),
  })
  .superRefine((actuals, context) => {
    if (actuals.activeAttemptCount + actuals.succeededAttemptCount > actuals.attemptCount) {
      context.addIssue({
        code: "custom",
        path: ["attemptCount"],
        message: "active and succeeded attempts cannot exceed attemptCount",
      });
    }
    if (actuals.blockerCount > actuals.activeAttemptCount) {
      context.addIssue({
        code: "custom",
        path: ["blockerCount"],
        message: "blocked attempts are active attempts",
      });
    }
    if (actuals.lastActivityAt < actuals.firstAttemptAt) {
      context.addIssue({
        code: "custom",
        path: ["lastActivityAt"],
        message: "lastActivityAt precedes firstAttemptAt",
      });
    }
    if ((actuals.lastSucceededAt === null) !== (actuals.succeededAttemptCount === 0)) {
      context.addIssue({
        code: "custom",
        path: ["lastSucceededAt"],
        message: "lastSucceededAt must be present exactly when an attempt succeeded",
      });
    }
    if (actuals.lastSucceededAt !== null && actuals.lastSucceededAt > actuals.lastActivityAt) {
      context.addIssue({
        code: "custom",
        path: ["lastSucceededAt"],
        message: "lastSucceededAt cannot follow lastActivityAt",
      });
    }
  });
export type ProjectPhaseActualsV1 = z.infer<typeof ProjectPhaseActualsV1Schema>;

/** A lifecycle event projected into the timeline: an observed, evidence-bound fact. */
export const ProjectLifecycleActualV1Schema = z.strictObject({
  eventId: EventIdSchema,
  type: NamespacedCodeSchema,
  releaseId: ReleaseIdSchema.nullable(),
  evidenceDigest: Sha256DigestSchema,
  emittedAt: IsoInstantSchema,
});
export type ProjectLifecycleActualV1 = z.infer<typeof ProjectLifecycleActualV1Schema>;

export const ProjectTimelineSourceAvailabilityV1Schema = z.strictObject({
  localExecution: z.literal("available"),
  lifecycleEvents: PortfolioSourceAvailabilityV1Schema,
});
export type ProjectTimelineSourceAvailabilityV1 = z.infer<
  typeof ProjectTimelineSourceAvailabilityV1Schema
>;

function isCanonicalMilestoneOrder(
  previous: Readonly<{ targetDate: string | null; milestoneId: string }>,
  current: Readonly<{ targetDate: string | null; milestoneId: string }>,
): boolean {
  // Dated milestones first in calendar order; undated ("won't guess")
  // milestones after every dated one so they never sort into the timeline.
  if (previous.targetDate === null && current.targetDate !== null) return false;
  if (previous.targetDate !== null && current.targetDate === null) return true;
  if (previous.targetDate !== null && current.targetDate !== null) {
    if (previous.targetDate !== current.targetDate) return previous.targetDate < current.targetDate;
  }
  return previous.milestoneId < current.milestoneId;
}

/**
 * The complete milestone plan for one project alongside what has actually
 * happened. Plans (`milestones`) and actuals are kept structurally separate:
 * a consumer can never read an actual as a plan or a plan as an actual, and a
 * missing target date stays missing rather than being filled from actuals.
 */
export const ProjectTimelineV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    projectId: ProjectIdSchema,
    generatedAt: IsoInstantSchema,
    milestones: z.array(ProjectMilestoneV1Schema).max(MAX_PROJECT_MILESTONES_V1),
    actuals: z.strictObject({
      phases: z.array(ProjectPhaseActualsV1Schema).max(MAX_TIMELINE_PHASES_V1),
      lifecycle: z.array(ProjectLifecycleActualV1Schema).max(MAX_TIMELINE_LIFECYCLE_ACTUALS_V1),
    }),
    sources: ProjectTimelineSourceAvailabilityV1Schema,
  })
  .superRefine((timeline, context) => {
    const milestoneIds = new Set(timeline.milestones.map((milestone) => milestone.milestoneId));
    if (milestoneIds.size !== timeline.milestones.length) {
      context.addIssue({
        code: "custom",
        path: ["milestones"],
        message: "milestone IDs must be unique",
      });
    }
    for (const [index, milestone] of timeline.milestones.entries()) {
      if (milestone.projectId !== timeline.projectId) {
        context.addIssue({
          code: "custom",
          path: ["milestones", index, "projectId"],
          message: "every milestone must belong to the timeline's project",
        });
      }
      if (milestone.updatedAt > timeline.generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["milestones", index, "updatedAt"],
          message: "milestone updatedAt must not be after generatedAt",
        });
      }
      for (const dependency of milestone.dependsOn) {
        if (!milestoneIds.has(dependency)) {
          context.addIssue({
            code: "custom",
            path: ["milestones", index, "dependsOn"],
            message: "dependsOn must reference milestones of the same project",
          });
          break;
        }
      }
      const previous = timeline.milestones[index - 1];
      if (previous !== undefined && !isCanonicalMilestoneOrder(previous, milestone)) {
        context.addIssue({
          code: "custom",
          path: ["milestones", index],
          message: "milestones must be ordered by targetDate (undated last) then milestoneId",
        });
      }
    }
    const phases = timeline.actuals.phases.map((actuals) => actuals.phase);
    if (new Set(phases).size !== phases.length) {
      context.addIssue({
        code: "custom",
        path: ["actuals", "phases"],
        message: "phase actuals must be unique per phase",
      });
    }
    for (const [index, actuals] of timeline.actuals.phases.entries()) {
      if (actuals.lastActivityAt > timeline.generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["actuals", "phases", index, "lastActivityAt"],
          message: "lastActivityAt must not be after generatedAt",
        });
      }
      const previous = timeline.actuals.phases[index - 1];
      if (
        previous !== undefined &&
        (previous.phase === null || (actuals.phase !== null && previous.phase >= actuals.phase))
      ) {
        context.addIssue({
          code: "custom",
          path: ["actuals", "phases", index],
          message: "phase actuals must be ordered by phase with the unphased bucket last",
        });
      }
    }
    if (
      timeline.sources.lifecycleEvents === "unavailable" &&
      timeline.actuals.lifecycle.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["actuals", "lifecycle"],
        message: "lifecycle actuals must be empty when lifecycle events are unavailable",
      });
    }
    for (const [index, actual] of timeline.actuals.lifecycle.entries()) {
      if (actual.emittedAt > timeline.generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["actuals", "lifecycle", index, "emittedAt"],
          message: "emittedAt must not be after generatedAt",
        });
      }
    }
  });
export type ProjectTimelineV1 = z.infer<typeof ProjectTimelineV1Schema>;
