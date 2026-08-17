import { z } from "zod";

import { CommandOriginV1Schema } from "./command.js";
import { PhasePresetIdSchema } from "./phase.js";
import {
  AttemptIdSchema,
  CommandIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  ProjectPlanIdSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  TaskIdSchema,
} from "./primitives.js";
import { RoomIdSchema, RoomMessageIdSchema } from "./room.js";
import { AcceptanceCriterionV1Schema } from "./task-spec.js";

/**
 * The Planner (`docs/roadmap/STUDIO_PHASES.md` Phase 4's "planner" half, deep-dive lesson recorded
 * on `phase.ts`): "start a new project" / "turn this into a project" produces a `ProjectPlanV1` —
 * an ORDERED, EDITABLE LIST of items (never a graph/DAG view; `dependsOn` only ever points at
 * strictly earlier items in `items[]`, so the list stays skimmable top to bottom), most of them
 * ordinary `task` items and a deliberately SPARSE sprinkling of `gate` items where a human must
 * sign off. `plan.propose` builds this list deterministically from a `PhasePresetV1`'s phases; the
 * gate-density rule below rejects a plan that abandons that sparseness (a gate on every item, or
 * more than one gate before the build phase's tasks start) regardless of how the plan reached that
 * shape.
 */

export const MAX_PLAN_ITEMS_V1 = 100 as const;
export const MAX_PLAN_CONSTRAINTS_V1 = 20 as const;
export const MAX_PLAN_ITEM_DEPENDENCIES_V1 = 10 as const;
export const MAX_PLAN_ITEM_SCOPE_PATHS_V1 = 50 as const;
export const MAX_PLAN_EDITS_PER_COMMAND_V1 = 20 as const;

const PROJECT_PLAN_ITEM_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
/** The Studio phase key the deterministic proposal builder always uses for the build phase's task
 * items (see `apps/daemon/src/project-plan-command-runtime.ts`). The gate-density rule below treats
 * the first item at this phase as "where build starts" for every plan, proposed or hand-edited. */
export const PROJECT_PLAN_BUILD_PHASE_V1 = "build" as const;

export const ProjectPlanItemIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(PROJECT_PLAN_ITEM_ID_PATTERN, "Expected a stable lowercase item key")
  .brand<"ProjectPlanItemId">();
export type ProjectPlanItemId = z.infer<typeof ProjectPlanItemIdSchema>;

export const ProjectPlanBriefV1Schema = z.strictObject({
  title: z.string().min(1).max(200),
  oneLiner: z.string().min(1).max(500),
  /** Free-text operator constraints, e.g. "local-only", "xcodegen", "tests-per-task". */
  constraints: z.array(z.string().min(1).max(200)).max(MAX_PLAN_CONSTRAINTS_V1),
});
export type ProjectPlanBriefV1 = z.infer<typeof ProjectPlanBriefV1Schema>;

/** Provenance: the room/message a plan was proposed from, when proposed via the assistant. */
export const ProjectPlanSourceRefV1Schema = z.strictObject({
  roomId: RoomIdSchema,
  messageId: RoomMessageIdSchema.nullable(),
});
export type ProjectPlanSourceRefV1 = z.infer<typeof ProjectPlanSourceRefV1Schema>;

/** Everything a `task` item needs to become a real `TaskSpecV1` at submit time, minus the fields
 * only known at submission (`taskId`, `projectId`, `base`, `policyDigest`, `createdAt`). */
export const ProjectPlanTaskSpecDraftV1Schema = z.strictObject({
  objective: z.string().min(1).max(20_000),
  acceptanceCriteria: z.array(AcceptanceCriterionV1Schema).min(1).max(50),
  scope: z.strictObject({
    paths: z.array(RelativePathSchema).min(1).max(MAX_PLAN_ITEM_SCOPE_PATHS_V1),
  }),
  phase: StableKeySchema,
});
export type ProjectPlanTaskSpecDraftV1 = z.infer<typeof ProjectPlanTaskSpecDraftV1Schema>;

export const ProjectPlanGateV1Schema = z.strictObject({
  owner: z.literal("human"),
  reason: z.string().min(1).max(2_000),
});
export type ProjectPlanGateV1 = z.infer<typeof ProjectPlanGateV1Schema>;

export const ProjectPlanItemKindV1Schema = z.enum(["task", "gate"]);
export type ProjectPlanItemKindV1 = z.infer<typeof ProjectPlanItemKindV1Schema>;

export const ProjectPlanItemStatusV1Schema = z.enum([
  "proposed",
  "approved",
  "deferred",
  "running",
  "done",
  "failed",
]);
export type ProjectPlanItemStatusV1 = z.infer<typeof ProjectPlanItemStatusV1Schema>;

const ProjectPlanItemBaseV1Shape = {
  itemId: ProjectPlanItemIdSchema,
  /** The Studio phase key (a preset phase's `phaseId`, or a user-chosen key on a hand-added item). */
  phase: StableKeySchema,
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(2_000).nullable(),
  /** Item IDs this item waits on. Always references items earlier in `items[]` (enforced below),
   * so the list stays a flat, skimmable order rather than a graph a reader has to trace. */
  dependsOn: z.array(ProjectPlanItemIdSchema).max(MAX_PLAN_ITEM_DEPENDENCIES_V1),
};

function refineItemDependsOn(
  item: Readonly<{ itemId: string; dependsOn: readonly string[] }>,
  context: z.RefinementCtx,
): void {
  if (new Set(item.dependsOn).size !== item.dependsOn.length) {
    context.addIssue({
      code: "custom",
      path: ["dependsOn"],
      message: "dependsOn item IDs must be unique",
    });
  }
  if (item.dependsOn.includes(item.itemId)) {
    context.addIssue({
      code: "custom",
      path: ["dependsOn"],
      message: "an item cannot depend on itself",
    });
  }
}

// -- Draft item shapes (`add-item` edit payload / propose-time construction): no status/taskId/
// attemptId yet. A real discriminated union on `kind`, not a nullable-sibling-fields object, so
// TypeScript narrows `taskSpecDraft`/`gate` correctly wherever code branches on `item.kind`.
export const ProjectPlanTaskItemDraftV1Schema = z
  .strictObject({
    ...ProjectPlanItemBaseV1Shape,
    kind: z.literal("task"),
    taskSpecDraft: ProjectPlanTaskSpecDraftV1Schema,
  })
  .superRefine(refineItemDependsOn);
export type ProjectPlanTaskItemDraftV1 = z.infer<typeof ProjectPlanTaskItemDraftV1Schema>;

export const ProjectPlanGateItemDraftV1Schema = z
  .strictObject({
    ...ProjectPlanItemBaseV1Shape,
    kind: z.literal("gate"),
    gate: ProjectPlanGateV1Schema,
  })
  .superRefine(refineItemDependsOn);
export type ProjectPlanGateItemDraftV1 = z.infer<typeof ProjectPlanGateItemDraftV1Schema>;

export const ProjectPlanItemDraftV1Schema = z.discriminatedUnion("kind", [
  ProjectPlanTaskItemDraftV1Schema,
  ProjectPlanGateItemDraftV1Schema,
]);
export type ProjectPlanItemDraftV1 = z.infer<typeof ProjectPlanItemDraftV1Schema>;

// -- Durable item shapes: a draft plus `status` (and, for a task item, the `taskId`/`attemptId`
// populated once `plan.execute`/`plan.tick` submits it).
function refineTaskItemStatus(
  item: Readonly<{
    status: ProjectPlanItemStatusV1;
    taskId: string | null;
    attemptId: string | null;
  }>,
  context: z.RefinementCtx,
): void {
  const submitted = item.status === "running" || item.status === "done" || item.status === "failed";
  if (submitted && (item.taskId === null || item.attemptId === null)) {
    context.addIssue({
      code: "custom",
      path: ["taskId"],
      message: "a task item that is running, done, or failed must carry taskId and attemptId",
    });
  }
  if (!submitted && (item.taskId !== null || item.attemptId !== null)) {
    context.addIssue({
      code: "custom",
      path: ["taskId"],
      message: "a task item that has not been submitted must not carry taskId/attemptId",
    });
  }
}

export const ProjectPlanTaskItemV1Schema = z
  .strictObject({
    ...ProjectPlanItemBaseV1Shape,
    kind: z.literal("task"),
    taskSpecDraft: ProjectPlanTaskSpecDraftV1Schema,
    status: ProjectPlanItemStatusV1Schema,
    taskId: TaskIdSchema.nullable(),
    attemptId: AttemptIdSchema.nullable(),
  })
  .superRefine((item, context) => {
    refineItemDependsOn(item, context);
    refineTaskItemStatus(item, context);
  });
export type ProjectPlanTaskItemV1 = z.infer<typeof ProjectPlanTaskItemV1Schema>;

/** A gate item never runs an attempt: only `proposed` (awaiting `plan.approve-gate`), `approved`
 * (cleared), or `deferred` are meaningful. */
export const ProjectPlanGateItemStatusV1Schema = z.enum(["proposed", "approved", "deferred"]);
export type ProjectPlanGateItemStatusV1 = z.infer<typeof ProjectPlanGateItemStatusV1Schema>;

export const ProjectPlanGateItemV1Schema = z
  .strictObject({
    ...ProjectPlanItemBaseV1Shape,
    kind: z.literal("gate"),
    gate: ProjectPlanGateV1Schema,
    status: ProjectPlanGateItemStatusV1Schema,
  })
  .superRefine(refineItemDependsOn);
export type ProjectPlanGateItemV1 = z.infer<typeof ProjectPlanGateItemV1Schema>;

export const ProjectPlanItemV1Schema = z.discriminatedUnion("kind", [
  ProjectPlanTaskItemV1Schema,
  ProjectPlanGateItemV1Schema,
]);
export type ProjectPlanItemV1 = z.infer<typeof ProjectPlanItemV1Schema>;

export const ProjectPlanStateV1Schema = z.enum(["draft", "approved", "executing", "complete"]);
export type ProjectPlanStateV1 = z.infer<typeof ProjectPlanStateV1Schema>;

/**
 * Index of the first item at {@link PROJECT_PLAN_BUILD_PHASE_V1}, or `items.length` when no item is
 * at that phase yet (the whole plan is then "before build starts" for the gate-density rule).
 */
function buildStartIndexV1(items: readonly Readonly<{ phase: string }>[]): number {
  const index = items.findIndex((item) => item.phase === PROJECT_PLAN_BUILD_PHASE_V1);
  return index === -1 ? items.length : index;
}

/**
 * The one hard, structural planner rule (see the module doc comment): at most ONE gate item may
 * appear before the build phase's task items start (the scaffold gate). This rejects a plan with a
 * gate on every item, or any other over-gated shape, regardless of whether it came from
 * `plan.propose`'s deterministic builder or a hand-edited `plan.edit`. It does not by itself
 * guarantee gates only appear where a preset phase declared one — that is a proposal-time
 * guarantee (`buildProjectPlanProposalV1` in `apps/daemon/src/project-plan-command-runtime.ts`), not
 * an ongoing schema constraint, because `plan.edit` deliberately allows an operator to add a gate by
 * hand.
 */
export function projectPlanGateDensityIssuesV1(
  items: readonly Readonly<{ kind: ProjectPlanItemKindV1; phase: string }>[],
): readonly string[] {
  const buildStart = buildStartIndexV1(items);
  const preBuildGateCount = items
    .slice(0, buildStart)
    .filter((item) => item.kind === "gate").length;
  return preBuildGateCount > 1
    ? [
        `at most one gate item is allowed before the "${PROJECT_PLAN_BUILD_PHASE_V1}" phase's tasks start; found ${String(preBuildGateCount)}`,
      ]
    : [];
}

function refineProjectPlanItems(
  items: readonly ProjectPlanItemV1[],
  context: z.RefinementCtx,
): void {
  const itemIds = items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "item IDs must be unique" });
  }
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    for (const dependency of item.dependsOn) {
      if (!seen.has(dependency)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "dependsOn"],
          message: "dependsOn must reference an item earlier in items[]",
        });
      }
    }
    seen.add(item.itemId);
  }
  for (const message of projectPlanGateDensityIssuesV1(items)) {
    context.addIssue({ code: "custom", path: ["items"], message });
  }
}

/**
 * The business content of a plan, independent of its revision history: exactly what
 * `plan.propose`'s deterministic builder produces, and what every later mutation
 * (`plan.edit`/`plan.approve`/`plan.execute`/`plan.approve-gate`/`plan.tick`) recomputes as the
 * next revision's content. The kernel repository (`ProjectPlanRepository`, mirroring
 * `PhasePresetRepository`) is the sole place that turns a draft into a durable `ProjectPlanV1`: it
 * assigns `revision`/`createdAt`/`updatedAt` from the current head and `recordedAt`, and computes
 * `digest`. Callers never assign those fields themselves.
 */
const ProjectPlanDraftV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  planId: ProjectPlanIdSchema,
  projectId: ProjectIdSchema.nullable(),
  /** The repository `plan.execute`/`plan.tick` submit this plan's task items against. `null` until
   * set (at `plan.propose` time, or later via a `set-repository` edit) -- a plan can be proposed and
   * edited before its target repository exists (e.g. before `project.seed` runs), but `plan.execute`
   * refuses to submit a task item while it is still `null`. */
  repositoryId: RepositoryIdSchema.nullable(),
  brief: ProjectPlanBriefV1Schema,
  presetId: PhasePresetIdSchema,
  items: z.array(ProjectPlanItemV1Schema).min(1).max(MAX_PLAN_ITEMS_V1),
  state: ProjectPlanStateV1Schema,
};

export const ProjectPlanDraftV1Schema = z
  .strictObject(ProjectPlanDraftV1Shape)
  .superRefine((plan, context) => refineProjectPlanItems(plan.items, context));
export type ProjectPlanDraftV1 = z.infer<typeof ProjectPlanDraftV1Schema>;

const ProjectPlanDigestInputV1Shape = {
  ...ProjectPlanDraftV1Shape,
  revision: NonNegativeSafeIntegerSchema,
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
};

export const ProjectPlanDigestInputV1Schema = z
  .strictObject(ProjectPlanDigestInputV1Shape)
  .superRefine((plan, context) => refineProjectPlanItems(plan.items, context));
export type ProjectPlanDigestInputV1 = z.infer<typeof ProjectPlanDigestInputV1Schema>;

/** The durable, revisioned project plan. `revision`/`createdAt`/`updatedAt` mirror
 * `ProjectMilestoneV1`/`PhasePresetV1`'s compare-and-set-upsert-plus-revision-history pattern. */
export const ProjectPlanV1Schema = z
  .strictObject({
    ...ProjectPlanDigestInputV1Shape,
    digest: Sha256DigestSchema,
  })
  .superRefine((plan, context) => {
    refineProjectPlanItems(plan.items, context);
    if (plan.updatedAt < plan.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
    if (plan.revision === 0 && plan.updatedAt !== plan.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "revision 0 must carry its creation timestamp",
      });
    }
  });
export type ProjectPlanV1 = z.infer<typeof ProjectPlanV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it as recursively
 * key-sorted JSON UTF-8 and exclude `digest`. Mirrors `studioSnapshotDigestInputV1`/
 * `canonicalStudioSnapshotDigestInputV1` exactly.
 */
export function projectPlanDigestInputV1(
  plan: ProjectPlanDigestInputV1 | ProjectPlanV1,
): ProjectPlanDigestInputV1 {
  return ProjectPlanDigestInputV1Schema.parse({
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    projectId: plan.projectId,
    repositoryId: plan.repositoryId,
    brief: plan.brief,
    presetId: plan.presetId,
    items: plan.items,
    state: plan.state,
    revision: plan.revision,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
}

/** Canonical UTF-8 text to hash for `digest`. */
export function canonicalProjectPlanDigestInputV1(
  plan: ProjectPlanDigestInputV1 | ProjectPlanV1,
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
  return JSON.stringify(normalize(projectPlanDigestInputV1(plan)));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const ProjectPlanProposeV1Schema = z.strictObject({
  brief: ProjectPlanBriefV1Schema,
  presetId: PhasePresetIdSchema,
  projectId: ProjectIdSchema.nullable(),
  repositoryId: RepositoryIdSchema.nullable(),
  source: ProjectPlanSourceRefV1Schema.nullable(),
});
export type ProjectPlanProposeV1 = z.infer<typeof ProjectPlanProposeV1Schema>;

export const ProjectPlanEditV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("reorder"),
    /** The complete new item order, by ID; must be a permutation of the plan's current item IDs. */
    order: z.array(ProjectPlanItemIdSchema).min(1).max(MAX_PLAN_ITEMS_V1),
  }),
  z.strictObject({ kind: z.literal("defer"), itemId: ProjectPlanItemIdSchema }),
  z.strictObject({
    kind: z.literal("retitle"),
    itemId: ProjectPlanItemIdSchema,
    title: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("edit-task-spec-draft"),
    itemId: ProjectPlanItemIdSchema,
    taskSpecDraft: ProjectPlanTaskSpecDraftV1Schema,
  }),
  z.strictObject({
    kind: z.literal("add-item"),
    /** `null` inserts at the end of the list. */
    afterItemId: ProjectPlanItemIdSchema.nullable(),
    item: ProjectPlanItemDraftV1Schema,
  }),
  z.strictObject({ kind: z.literal("remove-item"), itemId: ProjectPlanItemIdSchema }),
  z.strictObject({ kind: z.literal("set-repository"), repositoryId: RepositoryIdSchema }),
  z.strictObject({ kind: z.literal("edit-brief"), brief: ProjectPlanBriefV1Schema }),
]);
export type ProjectPlanEditV1 = z.infer<typeof ProjectPlanEditV1Schema>;

export const ProjectPlanEditBatchV1Schema = z.strictObject({
  planId: ProjectPlanIdSchema,
  expectedRevision: NonNegativeSafeIntegerSchema,
  edits: z.array(ProjectPlanEditV1Schema).min(1).max(MAX_PLAN_EDITS_PER_COMMAND_V1),
});
export type ProjectPlanEditBatchV1 = z.infer<typeof ProjectPlanEditBatchV1Schema>;

export const ProjectPlanApproveV1Schema = z.strictObject({
  planId: ProjectPlanIdSchema,
  expectedRevision: NonNegativeSafeIntegerSchema,
});
export type ProjectPlanApproveV1 = z.infer<typeof ProjectPlanApproveV1Schema>;

export const ProjectPlanExecuteV1Schema = z.strictObject({
  planId: ProjectPlanIdSchema,
  expectedRevision: NonNegativeSafeIntegerSchema,
});
export type ProjectPlanExecuteV1 = z.infer<typeof ProjectPlanExecuteV1Schema>;

export const ProjectPlanApproveGateV1Schema = z.strictObject({
  planId: ProjectPlanIdSchema,
  itemId: ProjectPlanItemIdSchema,
  expectedRevision: NonNegativeSafeIntegerSchema,
});
export type ProjectPlanApproveGateV1 = z.infer<typeof ProjectPlanApproveGateV1Schema>;

export const ProjectPlanTickV1Schema = z.strictObject({
  planId: ProjectPlanIdSchema,
});
export type ProjectPlanTickV1 = z.infer<typeof ProjectPlanTickV1Schema>;

const CommandEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
};

export const ProjectPlanProposeCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.propose"),
  propose: ProjectPlanProposeV1Schema,
});
export type ProjectPlanProposeCommandV1 = z.infer<typeof ProjectPlanProposeCommandV1Schema>;

export const ProjectPlanEditCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.edit"),
  edit: ProjectPlanEditBatchV1Schema,
});
export type ProjectPlanEditCommandV1 = z.infer<typeof ProjectPlanEditCommandV1Schema>;

export const ProjectPlanApproveCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.approve"),
  approve: ProjectPlanApproveV1Schema,
});
export type ProjectPlanApproveCommandV1 = z.infer<typeof ProjectPlanApproveCommandV1Schema>;

export const ProjectPlanExecuteCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.execute"),
  execute: ProjectPlanExecuteV1Schema,
});
export type ProjectPlanExecuteCommandV1 = z.infer<typeof ProjectPlanExecuteCommandV1Schema>;

export const ProjectPlanApproveGateCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.approve-gate"),
  approveGate: ProjectPlanApproveGateV1Schema,
});
export type ProjectPlanApproveGateCommandV1 = z.infer<typeof ProjectPlanApproveGateCommandV1Schema>;

export const ProjectPlanTickCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("plan.tick"),
  tick: ProjectPlanTickV1Schema,
});
export type ProjectPlanTickCommandV1 = z.infer<typeof ProjectPlanTickCommandV1Schema>;

/**
 * The kernel-journaled union of every command kind that can produce a new `ProjectPlanV1` revision
 * (`ProjectPlanRepository.upsert`'s `command` input, one immutable row per revision in
 * `project_plan_revisions`). Mirrors `CommandV1Schema` (`command.ts`)'s role for the attempt
 * lifecycle, scoped to the plan aggregate instead.
 */
export const ProjectPlanCommandV1Schema = z.discriminatedUnion("kind", [
  ProjectPlanProposeCommandV1Schema,
  ProjectPlanEditCommandV1Schema,
  ProjectPlanApproveCommandV1Schema,
  ProjectPlanExecuteCommandV1Schema,
  ProjectPlanApproveGateCommandV1Schema,
  ProjectPlanTickCommandV1Schema,
]);
export type ProjectPlanCommandV1 = z.infer<typeof ProjectPlanCommandV1Schema>;
