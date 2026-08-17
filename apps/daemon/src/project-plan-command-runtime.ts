import { createHash } from "node:crypto";

import {
  AcceptanceCriterionV1Schema,
  AttemptIdSchema,
  CommandIdSchema,
  EventIdSchema,
  IsoInstantSchema,
  ProjectPlanDraftV1Schema,
  ProjectPlanIdSchema,
  ProjectPlanItemDraftV1Schema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type AcceptanceCriterionV1,
  type CommandRequestV1,
  type CommandResultV1,
  type ExecutionAttemptV1,
  type IsoInstant,
  type PhasePresetV1,
  type ProjectPlanDraftV1,
  type ProjectPlanEditV1,
  type ProjectPlanItemV1,
  type ProjectPlanProposeV1,
  type ProjectPlanV1,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import type { BrokerCommitRecord } from "@app-factory/git-workspace";
import {
  ProjectPlanUpsertError,
  computeTaskSpecDigest,
  type FactoryRepositories,
} from "@app-factory/kernel";

import type { DaemonRuntimeIdFactory } from "./daemon-runtime-ids.js";
import type { ProjectPlanMirrorPort } from "./project-plan-mirror-port.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Derives a deterministic UUID from an arbitrary string seed, the same shape
 * `command-runtime.ts`'s `deterministicUuid` produces but over a composite
 * (planId, itemId, ...) seed rather than a single branded `CommandId` -- plan-internal IDs (a task
 * item's minted `taskId`/`attemptId`, or a chain-advance tick's own journal `commandId`) need more
 * than one varying component, which `DaemonRuntimeIdFactory`'s `(purpose, commandId)` shape cannot
 * express. Every ID this file mints is a pure function of already-durable plan content, so this
 * stays deterministic and idempotent without going through the pluggable factory.
 */
function derivedId(seed: string): string {
  const digest = createHash("sha256").update(`app-factory.daemon.v1.plan\0${seed}`).digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/**
 * The Planner (`packages/contracts/src/v1/project-plan.ts`'s module doc comment):
 * `plan.propose`/`plan.edit`/`plan.approve`/`plan.execute`/`plan.approve-gate`/`plan.tick`/
 * `plan.status`. Pure CRUD-plus-orchestration over the durable, revisioned
 * `@app-factory/kernel` `ProjectPlanRepository` -- no LLM in this first version, exactly like
 * `phase-command-runtime.ts`'s `preset.upsert`/`phase.upsert`: `plan.propose` builds the item list
 * DETERMINISTICALLY from a `PhasePresetV1`'s phases (one item per phase, `build`'s phase seeded
 * from a small fixed template set), never inferring content from free text.
 *
 * `plan.execute`/`plan.tick` chain task items over `ExecutionAttemptV1`s exactly like
 * `command-runtime.ts`'s `intakeTask` (`repositories.createTaskAttempt`), and advance the plan's
 * target repository's Factory mirror between task items via `ProjectPlanMirrorPort`
 * (`project-plan-mirror-port.ts`), which wraps `packages/git-workspace`'s
 * `advanceImmutableMirrorBase` -- the "chained tasks" primitive. Resolving a succeeded attempt's
 * verified `BrokerCommitRecord` from evidence is a separate, injected port
 * (`resolveBrokerCommit`): no generic "broker commit for any attempt" surface exists yet anywhere
 * in this daemon (`run-export-command-runtime.ts`'s evidence-verification path is scoped to
 * `run.export`, one attempt at a time, not reusable as-is), so production wiring of that port is
 * explicitly out of this task's scope; tests inject one directly from the same git-workspace
 * primitives `packages/git-workspace/test/base-advance.test.ts` exercises.
 */

export type ProjectPlanCommandRequestV1 = Extract<
  CommandRequestV1,
  {
    operation:
      | "plan.propose"
      | "plan.edit"
      | "plan.approve"
      | "plan.execute"
      | "plan.approve-gate"
      | "plan.status"
      | "plan.tick";
  }
>;

export type ProjectPlanExecutionDependencies = Readonly<{
  mirror: ProjectPlanMirrorPort;
  /** Resolves a succeeded attempt's verified broker commit; see the module doc comment. */
  resolveBrokerCommit: (attempt: ExecutionAttemptV1) => BrokerCommitRecord;
  /** The reviewed policy digest plan-submitted tasks carry (`TaskSpecV1.policyDigest`). */
  policyDigest: Sha256Digest;
}>;

function nextInstant(observedAt: IsoInstant, after: IsoInstant): IsoInstant {
  const milliseconds = Math.max(Date.parse(observedAt), Date.parse(after) + 1);
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function requirePlan(repositories: FactoryRepositories, planIdInput: unknown): ProjectPlanV1 {
  const planId = ProjectPlanIdSchema.parse(planIdInput);
  const plan = repositories.projectPlans.findById(planId);
  if (plan === null) {
    throw new CommandHandlerError("plan.not-found", `No plan exists for ID ${planId}.`, false);
  }
  return plan;
}

function mapPlanUpsertError(error: unknown): never {
  if (error instanceof ProjectPlanUpsertError) {
    throw new CommandHandlerError(
      error.code === "plan.identity-conflict" ? "command.identity-conflict" : error.code,
      error.message,
      false,
    );
  }
  throw error;
}

function draftOf(
  plan: ProjectPlanV1,
  overrides: Partial<ProjectPlanDraftV1> = {},
): ProjectPlanDraftV1 {
  return ProjectPlanDraftV1Schema.parse({
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    projectId: plan.projectId,
    repositoryId: plan.repositoryId,
    brief: plan.brief,
    presetId: plan.presetId,
    items: plan.items,
    state: plan.state,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// plan.propose: deterministic item-list construction from a PhasePresetV1.
// ---------------------------------------------------------------------------

type BuildTemplateV1 = Readonly<{
  key: string;
  title: string;
  objective: string;
  acceptanceStatements: readonly string[];
  scopePaths: readonly string[];
}>;

/** The build phase's seeded task items: seed-repo is the from-scratch entry point
 * (`project.seed`'s own deliverable), then domain model, primary screen, and states coverage. */
const BUILD_TEMPLATES_V1: readonly BuildTemplateV1[] = [
  {
    key: "seed-repo",
    title: "Seed repository scaffold",
    objective:
      "Create the XcodeGen project, CI workflow, and one passing test -- the from-scratch entry point (project.seed).",
    acceptanceStatements: [
      "The repository has an XcodeGen project.yml with an app target and a unit test target.",
      "CI runs and one test passes.",
    ],
    scopePaths: ["project.yml", ".github/workflows", "Tests"],
  },
  {
    key: "domain-model",
    title: "Domain model + tests",
    objective: "Implement the core domain model with unit test coverage.",
    acceptanceStatements: ["The domain model's core types and logic are implemented and tested."],
    scopePaths: ["Sources"],
  },
  {
    key: "primary-screen",
    title: "Primary screen + tests",
    objective: "Implement the primary user-facing screen with test coverage.",
    acceptanceStatements: ["The primary screen renders real data and is covered by tests."],
    scopePaths: ["Sources"],
  },
  {
    key: "states",
    title: "Empty, loading, and error states",
    objective: "Implement and test the primary screen's empty, loading, and error states.",
    acceptanceStatements: [
      "The primary screen has explicit, tested empty, loading, and error states.",
    ],
    scopePaths: ["Sources"],
  },
];

function acceptanceCriteriaOf(statements: readonly string[]): readonly AcceptanceCriterionV1[] {
  const source = statements.length > 0 ? statements : ["Meets the phase's stated purpose."];
  return source.slice(0, 50).map((statement, index) =>
    AcceptanceCriterionV1Schema.parse({
      id: `ac-${String(index + 1)}`,
      statement,
      verification: "review",
    }),
  );
}

function nextDependsOn(previousItemId: string | null): readonly string[] {
  return previousItemId === null ? [] : [previousItemId];
}

/**
 * Builds a plan's item list deterministically from a preset's phases, in order: a phase that
 * declares typed lifecycle gates (`phase.gates.length > 0`) becomes one gate item; the build phase
 * (`PROJECT_PLAN_BUILD_PHASE_V1`) becomes {@link BUILD_TEMPLATES_V1}'s task items; every other phase
 * becomes one task item. Every item depends only on the item immediately before it, so the plan is
 * always a flat, linear, skimmable order -- never a graph -- and at most one item is ever "ready" to
 * act on at a time.
 */
export function buildProjectPlanProposalV1(input: {
  preset: PhasePresetV1;
  propose: ProjectPlanProposeV1;
  planId: string;
}): ProjectPlanDraftV1 {
  const items: Record<string, unknown>[] = [];
  let previousItemId: string | null = null;

  for (const phase of input.preset.phases) {
    if (phase.gates.length > 0) {
      const itemId = phase.phaseId;
      items.push({
        itemId,
        kind: "gate",
        phase: phase.phaseId,
        title: phase.name,
        detail: phase.purpose,
        gate: {
          owner: "human",
          reason: `Human checkpoint before continuing past "${phase.name}" (${phase.gates.join(", ")}).`,
        },
        dependsOn: nextDependsOn(previousItemId),
        status: "proposed",
      });
      previousItemId = itemId;
      continue;
    }

    if (phase.phaseId === "build") {
      for (const template of BUILD_TEMPLATES_V1) {
        const itemId = `${phase.phaseId}-${template.key}`;
        items.push({
          itemId,
          kind: "task",
          phase: phase.phaseId,
          title: template.title,
          detail: template.objective,
          taskSpecDraft: {
            objective: template.objective,
            acceptanceCriteria: acceptanceCriteriaOf(template.acceptanceStatements),
            scope: { paths: template.scopePaths },
            phase: phase.phaseId,
          },
          dependsOn: nextDependsOn(previousItemId),
          status: "proposed",
          taskId: null,
          attemptId: null,
        });
        previousItemId = itemId;
      }
      continue;
    }

    const itemId = phase.phaseId;
    items.push({
      itemId,
      kind: "task",
      phase: phase.phaseId,
      title: phase.name,
      detail: phase.purpose,
      taskSpecDraft: {
        objective: phase.purpose,
        acceptanceCriteria: acceptanceCriteriaOf(phase.rules.acceptanceChecks),
        scope: { paths: ["docs"] },
        phase: phase.phaseId,
      },
      dependsOn: nextDependsOn(previousItemId),
      status: "proposed",
      taskId: null,
      attemptId: null,
    });
    previousItemId = itemId;
  }

  return ProjectPlanDraftV1Schema.parse({
    schemaVersion: 1,
    planId: input.planId,
    projectId: input.propose.projectId,
    repositoryId: input.propose.repositoryId,
    brief: input.propose.brief,
    presetId: input.preset.presetId,
    items,
    state: "draft",
  });
}

export function proposeProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.propose" }>,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const preset = repositories.phasePresets.findById(request.payload.presetId);
  if (preset === null) {
    throw new CommandHandlerError(
      "plan.unknown-preset",
      `No phase preset exists for ID ${request.payload.presetId}.`,
      false,
    );
  }
  const planId = ProjectPlanIdSchema.parse(idFactory("plan", request.commandId));
  const draft = buildProjectPlanProposalV1({ preset, propose: request.payload, planId });

  try {
    const upserted = repositories.projectPlans.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "plan.propose",
        propose: request.payload,
      },
      draft,
      expectedRevision: null,
      recordedAt: observedAt,
    });
    return { operation: "plan.propose", plan: upserted.plan };
  } catch (error) {
    mapPlanUpsertError(error);
  }
}

// ---------------------------------------------------------------------------
// plan.edit
// ---------------------------------------------------------------------------

function applyProjectPlanEditV1(
  items: readonly ProjectPlanItemV1[],
  edit: ProjectPlanEditV1,
): ProjectPlanItemV1[] {
  switch (edit.kind) {
    case "reorder": {
      const currentIds = new Set(items.map((item) => item.itemId));
      const orderIds = new Set(edit.order);
      if (
        edit.order.length !== items.length ||
        orderIds.size !== edit.order.length ||
        [...currentIds].some((id) => !orderIds.has(id))
      ) {
        throw new CommandHandlerError(
          "plan.edit-invalid",
          "reorder must supply every current item ID exactly once.",
          false,
        );
      }
      return edit.order.map((itemId) => {
        const item = items.find((candidate) => candidate.itemId === itemId);
        if (item === undefined) {
          throw new CommandHandlerError("plan.edit-invalid", `No item ${itemId} exists.`, false);
        }
        return item;
      });
    }
    case "defer": {
      const found = items.some((item) => item.itemId === edit.itemId);
      if (!found) {
        throw new CommandHandlerError("plan.edit-invalid", `No item ${edit.itemId} exists.`, false);
      }
      return items.map((item) =>
        item.itemId === edit.itemId ? { ...item, status: "deferred" as const } : item,
      );
    }
    case "retitle": {
      const found = items.some((item) => item.itemId === edit.itemId);
      if (!found) {
        throw new CommandHandlerError("plan.edit-invalid", `No item ${edit.itemId} exists.`, false);
      }
      return items.map((item) =>
        item.itemId === edit.itemId ? { ...item, title: edit.title } : item,
      );
    }
    case "edit-task-spec-draft": {
      const item = items.find((candidate) => candidate.itemId === edit.itemId);
      if (item === undefined) {
        throw new CommandHandlerError("plan.edit-invalid", `No item ${edit.itemId} exists.`, false);
      }
      if (item.kind !== "task") {
        throw new CommandHandlerError(
          "plan.edit-invalid",
          `Item ${edit.itemId} is a gate; it has no taskSpecDraft to edit.`,
          false,
        );
      }
      return items.map((candidate) =>
        candidate.itemId === edit.itemId
          ? { ...candidate, taskSpecDraft: edit.taskSpecDraft }
          : candidate,
      );
    }
    case "add-item": {
      if (items.some((item) => item.itemId === edit.item.itemId)) {
        throw new CommandHandlerError(
          "plan.edit-invalid",
          `Item ${edit.item.itemId} already exists.`,
          false,
        );
      }
      const parsedItem = ProjectPlanItemDraftV1Schema.parse(edit.item);
      const newItem: ProjectPlanItemV1 =
        parsedItem.kind === "task"
          ? { ...parsedItem, status: "proposed", taskId: null, attemptId: null }
          : { ...parsedItem, status: "proposed" };
      if (edit.afterItemId === null) return [...items, newItem];
      const index = items.findIndex((item) => item.itemId === edit.afterItemId);
      if (index === -1) {
        throw new CommandHandlerError(
          "plan.edit-invalid",
          `No item ${edit.afterItemId} exists to insert after.`,
          false,
        );
      }
      return [...items.slice(0, index + 1), newItem, ...items.slice(index + 1)];
    }
    case "remove-item": {
      const found = items.some((item) => item.itemId === edit.itemId);
      if (!found) {
        throw new CommandHandlerError("plan.edit-invalid", `No item ${edit.itemId} exists.`, false);
      }
      return items.filter((item) => item.itemId !== edit.itemId);
    }
    case "set-repository":
      // Handled at the plan level (draft.repositoryId), not per-item; see editProjectPlanV1.
      return [...items];
    case "edit-brief":
      // Handled at the plan level (draft.brief), not per-item; see editProjectPlanV1.
      return [...items];
  }
}

export function editProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.edit" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const existing = requirePlan(repositories, request.payload.planId);
  let items = existing.items;
  let repositoryId = existing.repositoryId;
  let brief = existing.brief;
  for (const edit of request.payload.edits) {
    items = applyProjectPlanEditV1(items, edit);
    if (edit.kind === "set-repository") repositoryId = edit.repositoryId;
    if (edit.kind === "edit-brief") brief = edit.brief;
  }
  const draft = draftOf(existing, { items: [...items], repositoryId, brief });
  const recordedAt = nextInstant(observedAt, existing.updatedAt);

  try {
    const upserted = repositories.projectPlans.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "plan.edit",
        edit: request.payload,
      },
      draft,
      expectedRevision: request.payload.expectedRevision,
      recordedAt,
    });
    return { operation: "plan.edit", plan: upserted.plan };
  } catch (error) {
    mapPlanUpsertError(error);
  }
}

// ---------------------------------------------------------------------------
// plan.approve
// ---------------------------------------------------------------------------

export function approveProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.approve" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const existing = requirePlan(repositories, request.payload.planId);
  if (existing.state !== "draft") {
    throw new CommandHandlerError(
      "plan.invalid-state-transition",
      `Plan ${existing.planId} is ${existing.state}, not draft; only a draft plan can be approved.`,
      false,
    );
  }
  const draft = draftOf(existing, { state: "approved" });
  const recordedAt = nextInstant(observedAt, existing.updatedAt);

  try {
    const upserted = repositories.projectPlans.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "plan.approve",
        approve: request.payload,
      },
      draft,
      expectedRevision: request.payload.expectedRevision,
      recordedAt,
    });
    return { operation: "plan.approve", plan: upserted.plan };
  } catch (error) {
    mapPlanUpsertError(error);
  }
}

// ---------------------------------------------------------------------------
// plan.execute / plan.tick / plan.approve-gate: the chain.
// ---------------------------------------------------------------------------

/** A gate item is settled once approved or deferred; a task item is settled once done or
 * deferred. A `failed` task item is deliberately NOT settled: it halts the chain (no auto-retry). */
function itemIsSettled(item: ProjectPlanItemV1): boolean {
  if (item.kind === "gate") return item.status === "approved" || item.status === "deferred";
  return item.status === "done" || item.status === "deferred";
}

function firstUnsettledIndex(items: readonly ProjectPlanItemV1[]): number | null {
  const index = items.findIndex((item) => !itemIsSettled(item));
  return index === -1 ? null : index;
}

function submitTaskItem(
  repositories: FactoryRepositories,
  plan: ProjectPlanV1,
  item: Extract<ProjectPlanItemV1, { kind: "task" }>,
  dependencies: ProjectPlanExecutionDependencies,
  observedAt: IsoInstant,
): ProjectPlanItemV1 {
  if (plan.projectId === null) {
    throw new CommandHandlerError(
      "plan.no-project",
      `Plan ${plan.planId} has no projectId; propose it with one before executing.`,
      false,
    );
  }
  if (plan.repositoryId === null) {
    throw new CommandHandlerError(
      "plan.no-repository",
      `Plan ${plan.planId} has no repositoryId; set one (plan.edit set-repository) before executing.`,
      false,
    );
  }
  if (item.taskSpecDraft === null) {
    throw new CommandHandlerError(
      "plan.edit-invalid",
      `Item ${item.itemId} has no taskSpecDraft to submit.`,
      false,
    );
  }
  const base = dependencies.mirror.currentBase(plan.repositoryId);
  const taskId = TaskIdSchema.parse(derivedId(`task\0${plan.planId}\0${item.itemId}`));
  const attemptId = AttemptIdSchema.parse(derivedId(`attempt\0${plan.planId}\0${item.itemId}`));
  const commandId = CommandIdSchema.parse(derivedId(`submit\0${plan.planId}\0${item.itemId}`));
  const eventId = EventIdSchema.parse(derivedId(`created-event\0${plan.planId}\0${item.itemId}`));
  const taskSpec: TaskSpecV1 = TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId,
    projectId: plan.projectId,
    createdAt: observedAt,
    title: item.title,
    objective: item.taskSpecDraft.objective,
    phase: item.taskSpecDraft.phase,
    acceptanceCriteria: item.taskSpecDraft.acceptanceCriteria,
    base: { repositoryId: base.repositoryId, commit: base.commit },
    requestedScope: { paths: item.taskSpecDraft.scope.paths },
    policyDigest: dependencies.policyDigest,
  });
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt: observedAt,
      origin: "system",
      kind: "task.submit",
      initialDesiredState: "running",
      taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: observedAt,
      updatedAt: observedAt,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId,
      attemptId,
      sequence: 1,
      occurredAt: observedAt,
      commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId, taskSpecDigest },
    },
  });
  return { ...item, status: "running", taskId, attemptId };
}

/**
 * Advances a plan's chain by exactly one step and returns the resulting head plan plus whether
 * anything changed. Called by both `plan.execute` (which additionally requires `approved`) and
 * `plan.tick` (which only requires `executing`); see the module doc comment for the state machine.
 */
function advanceProjectPlanChainV1(
  repositories: FactoryRepositories,
  plan: ProjectPlanV1,
  dependencies: ProjectPlanExecutionDependencies,
  observedAt: IsoInstant,
): { plan: ProjectPlanV1; advanced: boolean } {
  if (plan.state === "complete") return { plan, advanced: false };

  const items = [...plan.items];
  const index = firstUnsettledIndex(items);

  if (index === null) {
    const draft = draftOf(plan, { items, state: "complete" });
    return { plan: persistPlanTick(repositories, plan, draft, observedAt), advanced: true };
  }

  const item = items[index];
  if (item === undefined)
    throw new Error("Factory persistence invariant failed: missing plan item");

  if (item.status === "failed") return { plan, advanced: false };

  if (item.kind === "gate") {
    // status is "proposed" here (approved/deferred are settled): pauses awaiting plan.approve-gate.
    return { plan, advanced: false };
  }

  if (item.status === "running") {
    if (item.attemptId === null) {
      throw new Error("Factory persistence invariant failed: running task item has no attemptId");
    }
    const attempt = repositories.attempts.findById(item.attemptId);
    if (attempt === null) {
      throw new Error("Factory persistence invariant failed: plan item attempt does not exist");
    }
    if (attempt.state === "succeeded") {
      if (plan.repositoryId === null) {
        throw new Error(
          "Factory persistence invariant failed: running task item has no repositoryId",
        );
      }
      const brokerCommit = dependencies.resolveBrokerCommit(attempt);
      dependencies.mirror.advanceBase(plan.repositoryId, brokerCommit);
      items[index] = { ...item, status: "done" };
      const draft = draftOf(plan, { items });
      const settled = persistPlanTick(repositories, plan, draft, observedAt);
      // Try to submit the next ready item in the same tick, so one plan.tick call chains through a
      // settled item straight into the next submission when possible. This step itself always
      // advanced the plan (the item settled and the mirror base moved), regardless of whether the
      // recursive step below finds further work to do -- so `advanced` stays true even when the
      // recursion itself pauses (e.g. the very next item is a gate awaiting `plan.approve-gate`).
      const recursed = advanceProjectPlanChainV1(repositories, settled, dependencies, observedAt);
      return { plan: recursed.plan, advanced: true };
    }
    if (attempt.state === "failed" || attempt.state === "cancelled") {
      items[index] = { ...item, status: "failed" };
      const draft = draftOf(plan, { items });
      return {
        plan: persistPlanTick(repositories, plan, draft, observedAt),
        advanced: true,
      };
    }
    return { plan, advanced: false };
  }

  // item.status === "proposed" && item.kind === "task": submit it.
  items[index] = submitTaskItem(repositories, plan, item, dependencies, observedAt);
  const draft = draftOf(plan, { items, state: "executing" });
  return { plan: persistPlanTick(repositories, plan, draft, observedAt), advanced: true };
}

function persistPlanTick(
  repositories: FactoryRepositories,
  head: ProjectPlanV1,
  draft: ProjectPlanDraftV1,
  observedAt: IsoInstant,
): ProjectPlanV1 {
  const recordedAt = nextInstant(observedAt, head.updatedAt);
  const commandId = CommandIdSchema.parse(
    derivedId(`tick\0${head.planId}\0${String(head.revision)}`),
  );
  const upserted = repositories.projectPlans.upsert({
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt: recordedAt,
      origin: "system",
      kind: "plan.tick",
      tick: { planId: head.planId },
    },
    draft,
    expectedRevision: head.revision,
    recordedAt,
  });
  return upserted.plan;
}

export function executeProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.execute" }>,
  dependencies: ProjectPlanExecutionDependencies,
  observedAt: IsoInstant,
): CommandResultV1 {
  const existing = requirePlan(repositories, request.payload.planId);
  if (existing.revision !== request.payload.expectedRevision) {
    throw new CommandHandlerError(
      "plan.revision-conflict",
      `Plan ${existing.planId} is at revision ${String(existing.revision)}, not ${String(request.payload.expectedRevision)}.`,
      false,
    );
  }
  if (existing.state !== "approved" && existing.state !== "executing") {
    throw new CommandHandlerError(
      "plan.invalid-state-transition",
      `Plan ${existing.planId} is ${existing.state}; only an approved or already-executing plan can be executed.`,
      false,
    );
  }
  const started =
    existing.state === "approved"
      ? persistPlanTick(
          repositories,
          existing,
          draftOf(existing, { state: "executing" }),
          observedAt,
        )
      : existing;
  const { plan } = advanceProjectPlanChainV1(repositories, started, dependencies, observedAt);
  return { operation: "plan.execute", plan };
}

export function tickProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.tick" }>,
  dependencies: ProjectPlanExecutionDependencies,
  observedAt: IsoInstant,
): CommandResultV1 {
  const existing = requirePlan(repositories, request.payload.planId);
  if (existing.state !== "executing") {
    return { operation: "plan.tick", plan: existing, advanced: false };
  }
  const { plan, advanced } = advanceProjectPlanChainV1(
    repositories,
    existing,
    dependencies,
    observedAt,
  );
  return { operation: "plan.tick", plan, advanced };
}

export function approveGateProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.approve-gate" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const existing = requirePlan(repositories, request.payload.planId);
  if (existing.state !== "executing") {
    throw new CommandHandlerError(
      "plan.invalid-state-transition",
      `Plan ${existing.planId} is ${existing.state}, not executing; only an executing plan has a gate to approve.`,
      false,
    );
  }
  const item = existing.items.find((candidate) => candidate.itemId === request.payload.itemId);
  if (item === undefined) {
    throw new CommandHandlerError(
      "plan.edit-invalid",
      `No item ${request.payload.itemId} exists.`,
      false,
    );
  }
  if (item.kind !== "gate" || item.status !== "proposed") {
    throw new CommandHandlerError(
      "plan.gate-not-pending",
      `Item ${item.itemId} is not a pending gate.`,
      false,
    );
  }
  const items = existing.items.map((candidate) =>
    candidate.itemId === item.itemId ? { ...candidate, status: "approved" as const } : candidate,
  );
  const draft = draftOf(existing, { items });
  const recordedAt = nextInstant(observedAt, existing.updatedAt);

  try {
    const upserted = repositories.projectPlans.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "plan.approve-gate",
        approveGate: request.payload,
      },
      draft,
      expectedRevision: request.payload.expectedRevision,
      recordedAt,
    });
    return { operation: "plan.approve-gate", plan: upserted.plan };
  } catch (error) {
    mapPlanUpsertError(error);
  }
}

export function statusProjectPlanV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "plan.status" }>,
): CommandResultV1 {
  return { operation: "plan.status", plan: requirePlan(repositories, request.payload.planId) };
}
