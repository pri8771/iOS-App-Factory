import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildPortfolioSnapshot,
  parsePortfolioSnapshot,
  planPortfolioSchedule,
  type PortfolioProjectInputV1,
  type PortfolioTaskV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const PROJECT_A = randomUUID();
const PROJECT_B = randomUUID();

function project(
  projectId: string,
  slug: string,
  overrides: Partial<PortfolioProjectInputV1> = {},
): PortfolioProjectInputV1 {
  return {
    schemaVersion: 1,
    projectId,
    slug,
    displayName: slug,
    lifecycleStage: "building",
    activeAttemptCount: 0,
    blockerCount: 0,
    openPullRequestCount: 0,
    jiraTodoCount: 3,
    jiraInProgressCount: 0,
    unresolvedP0: 0,
    unresolvedP1: 0,
    releaseStage: null,
    lastDeliveryAt: null,
    observations: [],
    ...overrides,
  } as PortfolioProjectInputV1;
}

function task(
  taskId: string,
  projectIds: string[],
  overrides: Partial<PortfolioTaskV1> = {},
): PortfolioTaskV1 {
  return {
    schemaVersion: 1,
    taskId,
    projectIds,
    kind: "product",
    priority: 10,
    estimatedMinutes: 30,
    dependencies: [],
    resources: [],
    ready: true,
    ...overrides,
  } as PortfolioTaskV1;
}

describe("portfolio read model", () => {
  it("combines multiple apps without fabricating unavailable analytics", () => {
    const inputs = [
      project(PROJECT_B, "beta", { blockerCount: 1 }),
      project(PROJECT_A, "alpha", {
        observations: [
          {
            schemaVersion: 1,
            source: "posthog.product",
            metric: "activation.count",
            value: 12,
            unit: "count",
            windowStartedAt: "2026-08-09T00:00:00.000Z",
            windowEndedAt: NOW,
            observedAt: NOW,
            status: "available",
          },
        ],
      }),
    ];
    const snapshot = buildPortfolioSnapshot(inputs, NOW);

    expect(snapshot.projects.map((item) => item.slug)).toEqual(["alpha", "beta"]);
    expect(snapshot.projects[0]).toMatchObject({ health: "healthy", analyticsFreshness: "fresh" });
    expect(snapshot.projects[1]).toMatchObject({
      health: "blocked",
      analyticsFreshness: "unavailable",
      healthReasons: ["delivery-blocker", "analytics-unavailable"],
    });
    expect(buildPortfolioSnapshot(inputs, NOW).snapshotDigest).toBe(snapshot.snapshotDigest);
  });

  it("rejects duplicate project identities", () => {
    expect(() =>
      buildPortfolioSnapshot([project(PROJECT_A, "alpha"), project(PROJECT_A, "beta")], NOW),
    ).toThrow("project IDs must be unique");
  });

  it("rejects impossible analytics windows and observations from the future", () => {
    const observation = {
      schemaVersion: 1 as const,
      source: "posthog.product",
      metric: "activation.count",
      value: 1,
      unit: "count" as const,
      windowStartedAt: "2026-08-10T11:00:00.000Z",
      windowEndedAt: "2026-08-10T12:00:00.000Z",
      observedAt: "2026-08-10T12:00:00.000Z",
      status: "available" as const,
    };
    expect(() =>
      buildPortfolioSnapshot(
        [
          project(PROJECT_A, "alpha", {
            observations: [
              {
                ...observation,
                windowStartedAt: "2026-08-10T13:00:00.000Z",
              },
            ],
          }),
        ],
        NOW,
      ),
    ).toThrow("analytics window");
    expect(() =>
      buildPortfolioSnapshot(
        [
          project(PROJECT_A, "alpha", {
            observations: [
              {
                ...observation,
                windowEndedAt: "2026-08-10T13:00:00.000Z",
                observedAt: "2026-08-10T13:00:00.000Z",
              },
            ],
          }),
        ],
        NOW,
      ),
    ).toThrow("future analytics observation");
  });

  it("strictly validates a bounded digest-bound snapshot", () => {
    const snapshot = buildPortfolioSnapshot([project(PROJECT_A, "alpha")], NOW);
    expect(parsePortfolioSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parsePortfolioSnapshot({ ...snapshot, credential: "must-not-pass" })).toThrow();
    expect(() =>
      parsePortfolioSnapshot({ ...snapshot, totals: { ...snapshot.totals, projects: 2 } }),
    ).toThrow("totals");
  });
});

describe("cross-project scheduling", () => {
  it("runs independent marketing while a build is active and serializes exclusive resources", () => {
    const schedule = planPortfolioSchedule(
      [
        task("alpha-build", [PROJECT_A], {
          kind: "build",
          priority: 100,
          resources: ["mac.simulator.iphone17"],
        }),
        task("beta-marketing", [PROJECT_B], { kind: "marketing", priority: 80 }),
        task("beta-ui-test", [PROJECT_B], {
          kind: "quality",
          priority: 70,
          resources: ["mac.simulator.iphone17"],
        }),
        task("shared-seo", [PROJECT_A, PROJECT_B], {
          kind: "seo",
          dependencies: ["alpha-build"],
        }),
      ],
      { schemaVersion: 1, maximumConcurrentTasks: 3, maximumConcurrentTasksPerProject: 2 },
    );

    expect(schedule.waves[0]?.taskIds).toEqual(["alpha-build", "beta-marketing"]);
    expect(schedule.waves[1]?.taskIds).toEqual(["beta-ui-test", "shared-seo"]);
    expect(schedule.unscheduled).toEqual([]);
    expect(
      planPortfolioSchedule(
        [
          task("alpha-build", [PROJECT_A], {
            kind: "build",
            priority: 100,
            resources: ["mac.simulator.iphone17"],
          }),
          task("beta-marketing", [PROJECT_B], { kind: "marketing", priority: 80 }),
          task("beta-ui-test", [PROJECT_B], {
            kind: "quality",
            priority: 70,
            resources: ["mac.simulator.iphone17"],
          }),
          task("shared-seo", [PROJECT_A, PROJECT_B], {
            kind: "seo",
            dependencies: ["alpha-build"],
          }),
        ],
        { schemaVersion: 1, maximumConcurrentTasks: 3, maximumConcurrentTasksPerProject: 2 },
      ).scheduleDigest,
    ).toBe(schedule.scheduleDigest);
  });

  it("reports paused work and dependency cycles instead of silently dropping them", () => {
    const schedule = planPortfolioSchedule(
      [
        task("not-ready", [PROJECT_A], { ready: false }),
        task("cycle-a", [PROJECT_A], { dependencies: ["cycle-b"] }),
        task("cycle-b", [PROJECT_B], { dependencies: ["cycle-a"] }),
      ],
      { schemaVersion: 1, maximumConcurrentTasks: 2, maximumConcurrentTasksPerProject: 1 },
    );
    expect(schedule.unscheduled).toEqual([
      { taskId: "cycle-a", reason: "dependency-cycle-or-blocked" },
      { taskId: "cycle-b", reason: "dependency-cycle-or-blocked" },
      { taskId: "not-ready", reason: "not-ready" },
    ]);
  });

  it("binds its digest to normalized tasks, policy, and completed-task context", () => {
    const baseTask = task("alpha-build", [PROJECT_A]);
    const base = planPortfolioSchedule(
      [baseTask],
      { schemaVersion: 1, maximumConcurrentTasks: 1, maximumConcurrentTasksPerProject: 1 },
      ["prior-task"],
    );
    const priorityChanged = planPortfolioSchedule(
      [{ ...baseTask, priority: 999 }],
      { schemaVersion: 1, maximumConcurrentTasks: 1, maximumConcurrentTasksPerProject: 1 },
      ["prior-task"],
    );
    const policyChanged = planPortfolioSchedule(
      [baseTask],
      { schemaVersion: 1, maximumConcurrentTasks: 2, maximumConcurrentTasksPerProject: 1 },
      ["prior-task"],
    );
    const completedContextChanged = planPortfolioSchedule(
      [baseTask],
      { schemaVersion: 1, maximumConcurrentTasks: 1, maximumConcurrentTasksPerProject: 1 },
      ["different-prior-task"],
    );

    expect(priorityChanged.waves).toEqual(base.waves);
    expect(policyChanged.waves).toEqual(base.waves);
    expect(completedContextChanged.waves).toEqual(base.waves);
    expect(
      new Set([
        base.scheduleDigest,
        priorityChanged.scheduleDigest,
        policyChanged.scheduleDigest,
        completedContextChanged.scheduleDigest,
      ]).size,
    ).toBe(4);
  });
});
