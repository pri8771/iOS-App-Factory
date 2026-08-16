import { createHash } from "node:crypto";

import {
  IsoInstantSchema,
  NamespacedCodeSchema,
  ProjectIdSchema,
  LegacyProjectLifecycleStageV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  type ProjectId,
  type Sha256Digest,
} from "@app-factory/contracts";
import { z } from "zod";

// Planning inputs and derived schedule views live here. The authoritative runtime
// portfolio projection is PortfolioReadModelV1 from @app-factory/contracts.

const PortfolioTaskIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();
const MAX_PORTFOLIO_PROJECTS = 1_000;
const MAX_PORTFOLIO_TASKS = 10_000;

export const AnalyticsObservationV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    source: NamespacedCodeSchema,
    metric: NamespacedCodeSchema,
    value: z.number().finite(),
    unit: z.enum(["count", "ratio", "milliseconds", "cents"]),
    windowStartedAt: IsoInstantSchema,
    windowEndedAt: IsoInstantSchema,
    observedAt: IsoInstantSchema,
    status: z.enum(["available", "unavailable", "partial"]),
  })
  .superRefine((observation, context) => {
    const startedAt = Date.parse(observation.windowStartedAt);
    const endedAt = Date.parse(observation.windowEndedAt);
    const observedAt = Date.parse(observation.observedAt);
    if (startedAt > endedAt) {
      context.addIssue({
        code: "custom",
        path: ["windowStartedAt"],
        message: "analytics window must not end before it starts",
      });
    }
    if (endedAt > observedAt) {
      context.addIssue({
        code: "custom",
        path: ["windowEndedAt"],
        message: "analytics observation must not precede its window end",
      });
    }
  });
export type AnalyticsObservationV1 = z.infer<typeof AnalyticsObservationV1Schema>;

export const PortfolioPlanningProjectInputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: ProjectIdSchema,
  slug: StableKeySchema,
  displayName: z.string().min(1).max(200),
  lifecycleStage: LegacyProjectLifecycleStageV1Schema,
  activeAttemptCount: NonNegativeIntegerSchema,
  blockerCount: NonNegativeIntegerSchema,
  openPullRequestCount: NonNegativeIntegerSchema,
  jiraTodoCount: NonNegativeIntegerSchema,
  jiraInProgressCount: NonNegativeIntegerSchema,
  unresolvedP0: NonNegativeIntegerSchema,
  unresolvedP1: NonNegativeIntegerSchema,
  releaseStage: z.string().min(1).max(100).nullable(),
  lastDeliveryAt: IsoInstantSchema.nullable(),
  observations: z.array(AnalyticsObservationV1Schema).max(2_000),
});
export type PortfolioPlanningProjectInputV1 = z.infer<typeof PortfolioPlanningProjectInputV1Schema>;

const PortfolioHealthSchema = z.enum(["healthy", "attention", "blocked", "unknown"]);
const AnalyticsFreshnessSchema = z.enum(["fresh", "stale", "unavailable"]);
const HealthReasonSchema = z.enum([
  "unresolved-p0",
  "delivery-blocker",
  "unresolved-p1",
  "analytics-stale",
  "analytics-unavailable",
]);

export const PortfolioPlanningProjectV1Schema = PortfolioPlanningProjectInputV1Schema.extend({
  health: PortfolioHealthSchema,
  healthReasons: z.array(HealthReasonSchema).max(5),
  analyticsFreshness: AnalyticsFreshnessSchema,
});
export type PortfolioPlanningProjectV1 = z.infer<typeof PortfolioPlanningProjectV1Schema>;

export const PortfolioPlanningTotalsV1Schema = z.strictObject({
  projects: NonNegativeIntegerSchema,
  activeAttempts: NonNegativeIntegerSchema,
  blockers: NonNegativeIntegerSchema,
  openPullRequests: NonNegativeIntegerSchema,
  unresolvedP0: NonNegativeIntegerSchema,
  unresolvedP1: NonNegativeIntegerSchema,
});

export const PortfolioPlanningSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: IsoInstantSchema,
  maximumAnalyticsAgeMs: z.number().int().positive().safe(),
  projects: z.array(PortfolioPlanningProjectV1Schema).max(MAX_PORTFOLIO_PROJECTS),
  totals: PortfolioPlanningTotalsV1Schema,
  snapshotDigest: Sha256DigestSchema,
});
export type PortfolioPlanningSnapshotV1 = z.infer<typeof PortfolioPlanningSnapshotV1Schema>;

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

function digest(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`,
  );
}

function freshness(
  observations: readonly AnalyticsObservationV1[],
  nowMs: number,
  maximumAgeMs: number,
): "fresh" | "stale" | "unavailable" {
  const available = observations.filter((item) => item.status !== "unavailable");
  if (available.length === 0) return "unavailable";
  const latest = Math.max(...available.map((item) => Date.parse(item.observedAt)));
  return nowMs - latest <= maximumAgeMs ? "fresh" : "stale";
}

function deriveHealth(
  project: PortfolioPlanningProjectInputV1,
  analyticsFreshness: PortfolioPlanningProjectV1["analyticsFreshness"],
): Pick<PortfolioPlanningProjectV1, "health" | "healthReasons"> {
  const reasons: Array<PortfolioPlanningProjectV1["healthReasons"][number]> = [];
  if (project.unresolvedP0 > 0) reasons.push("unresolved-p0");
  if (project.blockerCount > 0) reasons.push("delivery-blocker");
  if (project.unresolvedP1 > 0) reasons.push("unresolved-p1");
  if (analyticsFreshness === "stale") reasons.push("analytics-stale");
  if (analyticsFreshness === "unavailable") reasons.push("analytics-unavailable");
  if (project.unresolvedP0 > 0 || project.blockerCount > 0) {
    return { health: "blocked", healthReasons: reasons };
  }
  if (project.unresolvedP1 > 0 || analyticsFreshness === "stale") {
    return { health: "attention", healthReasons: reasons };
  }
  if (analyticsFreshness === "unavailable") {
    return { health: "unknown", healthReasons: reasons };
  }
  return { health: "healthy", healthReasons: [] };
}

export function buildPortfolioPlanningSnapshot(
  values: readonly unknown[],
  generatedAtValue: unknown,
  maximumAnalyticsAgeMs = 48 * 60 * 60 * 1_000,
): PortfolioPlanningSnapshotV1 {
  const generatedAt = IsoInstantSchema.parse(generatedAtValue);
  if (!Number.isSafeInteger(maximumAnalyticsAgeMs) || maximumAnalyticsAgeMs < 1) {
    throw new TypeError("maximumAnalyticsAgeMs must be a positive safe integer");
  }
  if (values.length > MAX_PORTFOLIO_PROJECTS) {
    throw new TypeError(
      `portfolio cannot contain more than ${String(MAX_PORTFOLIO_PROJECTS)} projects`,
    );
  }
  const parsed = values.map((value) => PortfolioPlanningProjectInputV1Schema.parse(value));
  if (new Set(parsed.map((project) => project.projectId)).size !== parsed.length) {
    throw new TypeError("portfolio project IDs must be unique");
  }
  if (new Set(parsed.map((project) => project.slug)).size !== parsed.length) {
    throw new TypeError("portfolio project slugs must be unique");
  }
  const nowMs = Date.parse(generatedAt);
  for (const project of parsed) {
    if (project.lastDeliveryAt !== null && Date.parse(project.lastDeliveryAt) > nowMs) {
      throw new TypeError(`project ${project.slug} contains a future delivery timestamp`);
    }
    if (project.observations.some((observation) => Date.parse(observation.observedAt) > nowMs)) {
      throw new TypeError(`project ${project.slug} contains a future analytics observation`);
    }
  }
  const projects = parsed
    .map((project): PortfolioPlanningProjectV1 => {
      const analyticsFreshness = freshness(project.observations, nowMs, maximumAnalyticsAgeMs);
      return { ...project, analyticsFreshness, ...deriveHealth(project, analyticsFreshness) };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const totals = {
    projects: projects.length,
    activeAttempts: projects.reduce((sum, item) => sum + item.activeAttemptCount, 0),
    blockers: projects.reduce((sum, item) => sum + item.blockerCount, 0),
    openPullRequests: projects.reduce((sum, item) => sum + item.openPullRequestCount, 0),
    unresolvedP0: projects.reduce((sum, item) => sum + item.unresolvedP0, 0),
    unresolvedP1: projects.reduce((sum, item) => sum + item.unresolvedP1, 0),
  };
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value))) {
    throw new TypeError("portfolio totals exceed safe integer bounds");
  }
  const envelope = {
    schemaVersion: 1 as const,
    generatedAt,
    maximumAnalyticsAgeMs,
    projects,
    totals,
  };
  return { ...envelope, snapshotDigest: digest(envelope) };
}

export function parsePortfolioPlanningSnapshot(value: unknown): PortfolioPlanningSnapshotV1 {
  const snapshot = PortfolioPlanningSnapshotV1Schema.parse(value);
  if (
    new Set(snapshot.projects.map((project) => project.projectId)).size !== snapshot.projects.length
  ) {
    throw new TypeError("portfolio project IDs must be unique");
  }
  if (new Set(snapshot.projects.map((project) => project.slug)).size !== snapshot.projects.length) {
    throw new TypeError("portfolio project slugs must be unique");
  }
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  if (
    snapshot.projects.some((project) =>
      project.observations.some(
        (observation) => Date.parse(observation.observedAt) > generatedAtMs,
      ),
    )
  ) {
    throw new TypeError("portfolio contains a future analytics observation");
  }
  for (const project of snapshot.projects) {
    if (project.lastDeliveryAt !== null && Date.parse(project.lastDeliveryAt) > generatedAtMs) {
      throw new TypeError("portfolio contains a future delivery timestamp");
    }
    const analyticsFreshness = freshness(
      project.observations,
      generatedAtMs,
      snapshot.maximumAnalyticsAgeMs,
    );
    const expectedHealth = deriveHealth(project, analyticsFreshness);
    if (
      project.analyticsFreshness !== analyticsFreshness ||
      project.health !== expectedHealth.health ||
      canonical(project.healthReasons) !== canonical(expectedHealth.healthReasons)
    ) {
      throw new TypeError("portfolio project health does not match its source metrics");
    }
  }
  const expectedTotals = {
    projects: snapshot.projects.length,
    activeAttempts: snapshot.projects.reduce((sum, item) => sum + item.activeAttemptCount, 0),
    blockers: snapshot.projects.reduce((sum, item) => sum + item.blockerCount, 0),
    openPullRequests: snapshot.projects.reduce((sum, item) => sum + item.openPullRequestCount, 0),
    unresolvedP0: snapshot.projects.reduce((sum, item) => sum + item.unresolvedP0, 0),
    unresolvedP1: snapshot.projects.reduce((sum, item) => sum + item.unresolvedP1, 0),
  };
  if (
    Object.values(expectedTotals).some((item) => !Number.isSafeInteger(item)) ||
    canonical(snapshot.totals) !== canonical(expectedTotals)
  ) {
    throw new TypeError("portfolio totals do not match its projects");
  }
  const envelope = {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    maximumAnalyticsAgeMs: snapshot.maximumAnalyticsAgeMs,
    projects: snapshot.projects,
    totals: snapshot.totals,
  };
  if (digest(envelope) !== snapshot.snapshotDigest) {
    throw new TypeError("portfolio snapshot digest does not match its contents");
  }
  return snapshot;
}

export const PortfolioTaskV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  taskId: PortfolioTaskIdSchema,
  projectIds: z.array(ProjectIdSchema).min(1).max(100),
  kind: z.enum(["product", "build", "quality", "release", "website", "seo", "marketing", "ops"]),
  priority: z.number().int().min(0).max(1_000),
  estimatedMinutes: z
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60),
  dependencies: z.array(PortfolioTaskIdSchema).max(1_000),
  resources: z.array(NamespacedCodeSchema).max(100),
  ready: z.boolean(),
});
export type PortfolioTaskV1 = z.infer<typeof PortfolioTaskV1Schema>;

export const PortfolioSchedulePolicyV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  maximumConcurrentTasks: z.number().int().min(1).max(100),
  maximumConcurrentTasksPerProject: z.number().int().min(1).max(100),
});
export type PortfolioSchedulePolicyV1 = z.infer<typeof PortfolioSchedulePolicyV1Schema>;

export type PortfolioScheduleV1 = Readonly<{
  schemaVersion: 1;
  waves: readonly Readonly<{
    wave: number;
    taskIds: readonly string[];
    estimatedMinutes: number;
  }>[];
  unscheduled: readonly Readonly<{ taskId: string; reason: string }>[];
  scheduleDigest: Sha256Digest;
}>;

function validateScheduleInputs(tasks: readonly PortfolioTaskV1[]): Map<string, PortfolioTaskV1> {
  const index = new Map(tasks.map((task) => [task.taskId, task]));
  if (index.size !== tasks.length) throw new TypeError("portfolio task IDs must be unique");
  for (const task of tasks) {
    if (new Set(task.projectIds).size !== task.projectIds.length) {
      throw new TypeError(`task ${task.taskId} has duplicate project IDs`);
    }
    if (new Set(task.dependencies).size !== task.dependencies.length) {
      throw new TypeError(`task ${task.taskId} has duplicate dependencies`);
    }
    if (new Set(task.resources).size !== task.resources.length) {
      throw new TypeError(`task ${task.taskId} has duplicate resources`);
    }
    if (task.dependencies.includes(task.taskId)) {
      throw new TypeError(`task ${task.taskId} depends on itself`);
    }
  }
  return index;
}

function schedulePolicy(value: PortfolioSchedulePolicyV1): PortfolioSchedulePolicyV1 {
  return PortfolioSchedulePolicyV1Schema.parse(value);
}

export function planPortfolioSchedule(
  values: readonly unknown[],
  policyValue: PortfolioSchedulePolicyV1,
  completedTaskIds: readonly string[] = [],
): PortfolioScheduleV1 {
  if (values.length > MAX_PORTFOLIO_TASKS) {
    throw new TypeError(`portfolio cannot schedule more than ${String(MAX_PORTFOLIO_TASKS)} tasks`);
  }
  if (completedTaskIds.length > MAX_PORTFOLIO_TASKS) {
    throw new TypeError(
      `portfolio cannot accept more than ${String(MAX_PORTFOLIO_TASKS)} completed task IDs`,
    );
  }
  const tasks = values
    .map((value) => PortfolioTaskV1Schema.parse(value))
    .map((task) => ({
      ...task,
      projectIds: [...task.projectIds].sort(),
      dependencies: [...task.dependencies].sort(),
      resources: [...task.resources].sort(),
    }))
    .sort((left, right) => left.taskId.localeCompare(right.taskId));
  const policy = schedulePolicy(policyValue);
  const index = validateScheduleInputs(tasks);
  const normalizedCompletedTaskIds = completedTaskIds
    .map((id) => PortfolioTaskIdSchema.parse(id))
    .sort();
  if (new Set(normalizedCompletedTaskIds).size !== normalizedCompletedTaskIds.length) {
    throw new TypeError("completed task IDs must be unique");
  }
  const completed = new Set(normalizedCompletedTaskIds);
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!index.has(dependency) && !completed.has(dependency)) {
        throw new TypeError(`task ${task.taskId} has unknown dependency ${dependency}`);
      }
    }
  }

  const pending = new Map(
    tasks.filter((task) => !completed.has(task.taskId)).map((task) => [task.taskId, task]),
  );
  const waves: Array<{ wave: number; taskIds: string[]; estimatedMinutes: number }> = [];
  const unscheduled = new Map<string, string>();
  for (const task of pending.values()) {
    if (!task.ready) unscheduled.set(task.taskId, "not-ready");
  }
  for (const taskId of unscheduled.keys()) pending.delete(taskId);

  while (pending.size > 0) {
    const eligible = [...pending.values()]
      .filter((task) => task.dependencies.every((id) => completed.has(id)))
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.estimatedMinutes - right.estimatedMinutes ||
          left.taskId.localeCompare(right.taskId),
      );
    if (eligible.length === 0) {
      for (const task of pending.values())
        unscheduled.set(task.taskId, "dependency-cycle-or-blocked");
      break;
    }

    const selected: PortfolioTaskV1[] = [];
    const resources = new Set<string>();
    const perProject = new Map<ProjectId, number>();
    for (const task of eligible) {
      if (selected.length >= policy.maximumConcurrentTasks) break;
      if (task.resources.some((resource) => resources.has(resource))) continue;
      if (
        task.projectIds.some(
          (projectId) =>
            (perProject.get(projectId) ?? 0) >= policy.maximumConcurrentTasksPerProject,
        )
      ) {
        continue;
      }
      selected.push(task);
      for (const resource of task.resources) resources.add(resource);
      for (const projectId of task.projectIds) {
        perProject.set(projectId, (perProject.get(projectId) ?? 0) + 1);
      }
    }
    if (selected.length === 0) {
      const first = eligible[0];
      if (first === undefined) break;
      selected.push(first);
    }
    waves.push({
      wave: waves.length + 1,
      taskIds: selected.map((task) => task.taskId).sort(),
      estimatedMinutes: Math.max(...selected.map((task) => task.estimatedMinutes)),
    });
    for (const task of selected) {
      pending.delete(task.taskId);
      completed.add(task.taskId);
    }
  }

  const envelope = {
    schemaVersion: 1 as const,
    waves,
    unscheduled: [...unscheduled]
      .map(([taskId, reason]) => ({ taskId, reason }))
      .sort((left, right) => left.taskId.localeCompare(right.taskId)),
  };
  return {
    ...envelope,
    scheduleDigest: digest({
      input: { tasks, policy, completedTaskIds: normalizedCompletedTaskIds },
      output: envelope,
    }),
  };
}
