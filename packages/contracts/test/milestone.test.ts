import { describe, expect, it } from "vitest";

import {
  CalendarDateSchema,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  ProjectMilestoneUpsertCommandV1Schema,
  ProjectMilestoneUpsertV1Schema,
  ProjectMilestoneV1Schema,
  ProjectPhaseActualsV1Schema,
  ProjectTimelineV1Schema,
  TaskSpecV1Schema,
} from "../src/index.js";

const PROJECT_ID = "76000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "76000000-0000-4000-8000-000000000002";
const M1 = "76000000-0000-4000-8000-000000000101";
const M2 = "76000000-0000-4000-8000-000000000102";
const M3 = "76000000-0000-4000-8000-000000000103";
const COMMAND_ID = "76000000-0000-4000-8000-000000000201";
const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T10:00:00.000Z";
const T2 = "2026-08-16T11:00:00.000Z";
const DIGEST = `sha256:${"a".repeat(64)}`;

function milestone(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    milestoneId: M1,
    projectId: PROJECT_ID,
    phase: "build",
    kind: "stage",
    label: "Core loop builds green",
    targetDate: null,
    dependsOn: [],
    owner: "machine",
    status: "planned",
    evidenceDigest: null,
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function timeline(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    generatedAt: T2,
    milestones: [],
    actuals: { phases: [], lifecycle: [] },
    sources: { localExecution: "available", lifecycleEvents: "unavailable" },
    ...overrides,
  };
}

describe("CalendarDateSchema", () => {
  it.each(["2026-08-16", "2028-02-29", "2000-02-29"])("accepts %s", (value) => {
    expect(CalendarDateSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-1",
    "2026-08-16T00:00:00.000Z",
    "20260816",
    "",
  ])("rejects %s", (value) => {
    expect(CalendarDateSchema.safeParse(value).success).toBe(false);
  });
});

describe("TaskSpecV1 phase", () => {
  const spec = {
    schemaVersion: 1,
    taskId: "76000000-0000-4000-8000-000000000301",
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Add a farewell",
    objective: "Add a farewell method.",
    acceptanceCriteria: [{ id: "farewell", statement: "It works.", verification: "automated" }],
    base: { repositoryId: "76000000-0000-4000-8000-000000000302", commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/Greeter.swift"] },
    policyDigest: DIGEST,
  };

  it("is optional and leaves a phase-less spec without the key", () => {
    const parsed = TaskSpecV1Schema.parse(spec);
    expect("phase" in parsed).toBe(false);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(spec));
  });

  it("accepts a stable phase key and rejects anything else", () => {
    expect(TaskSpecV1Schema.parse({ ...spec, phase: "research" }).phase).toBe("research");
    expect(TaskSpecV1Schema.parse({ ...spec, phase: "phase-2" }).phase).toBe("phase-2");
    for (const phase of ["Build", "build phase", "", null, 3, "a".repeat(65)]) {
      expect(TaskSpecV1Schema.safeParse({ ...spec, phase }).success, String(phase)).toBe(false);
    }
  });
});

describe("ProjectMilestoneV1", () => {
  it("accepts an undated milestone: null is 'won't guess', never a defaulted date", () => {
    const parsed = ProjectMilestoneV1Schema.parse(milestone());
    expect(parsed.targetDate).toBeNull();
    expect(ProjectMilestoneV1Schema.safeParse(milestone({ targetDate: undefined })).success).toBe(
      false,
    );
  });

  it("accepts a dated milestone with dependencies and evidence", () => {
    const parsed = ProjectMilestoneV1Schema.parse(
      milestone({
        targetDate: "2026-09-01",
        dependsOn: [M2, M3],
        status: "done",
        evidenceDigest: DIGEST,
        revision: 2,
        updatedAt: T1,
      }),
    );
    expect(parsed.targetDate).toBe("2026-09-01");
    expect(parsed.dependsOn).toEqual([M2, M3]);
  });

  it("rejects self-dependency, duplicate dependencies, and time regressions", () => {
    expect(ProjectMilestoneV1Schema.safeParse(milestone({ dependsOn: [M1] })).success).toBe(false);
    expect(ProjectMilestoneV1Schema.safeParse(milestone({ dependsOn: [M2, M2] })).success).toBe(
      false,
    );
    expect(
      ProjectMilestoneV1Schema.safeParse(milestone({ revision: 1, updatedAt: T1, createdAt: T2 }))
        .success,
    ).toBe(false);
    expect(
      ProjectMilestoneV1Schema.safeParse(milestone({ revision: 0, updatedAt: T1 })).success,
    ).toBe(false);
  });

  it("rejects unknown keys and impossible calendar dates", () => {
    expect(ProjectMilestoneV1Schema.safeParse(milestone({ estimate: "soon" })).success).toBe(false);
    expect(
      ProjectMilestoneV1Schema.safeParse(milestone({ targetDate: "2026-02-30" })).success,
    ).toBe(false);
  });
});

describe("ProjectMilestoneUpsertV1 and its durable command envelope", () => {
  const draft = {
    milestoneId: M1,
    projectId: PROJECT_ID,
    phase: "build",
    kind: "gate",
    label: "Owner approves TestFlight",
    targetDate: null,
    dependsOn: [],
    owner: "human",
    status: "planned",
    evidenceDigest: null,
  };

  it("distinguishes create (null) from compare-and-set (revision) intent", () => {
    expect(
      ProjectMilestoneUpsertV1Schema.parse({ milestone: draft, expectedRevision: null }),
    ).toEqual({ milestone: draft, expectedRevision: null });
    expect(
      ProjectMilestoneUpsertV1Schema.parse({ milestone: draft, expectedRevision: 3 })
        .expectedRevision,
    ).toBe(3);
    expect(ProjectMilestoneUpsertV1Schema.safeParse({ milestone: draft }).success).toBe(false);
    expect(
      ProjectMilestoneUpsertV1Schema.safeParse({ milestone: draft, expectedRevision: -1 }).success,
    ).toBe(false);
    expect(
      ProjectMilestoneUpsertV1Schema.safeParse({
        milestone: { ...draft, revision: 0 },
        expectedRevision: null,
      }).success,
    ).toBe(false);
  });

  it("journals a strict command envelope keyed by the client command ID", () => {
    const command = ProjectMilestoneUpsertCommandV1Schema.parse({
      schemaVersion: 1,
      commandId: COMMAND_ID,
      issuedAt: T0,
      origin: "cli",
      kind: "project.milestone.upsert",
      upsert: { milestone: draft, expectedRevision: null },
    });
    expect(command.kind).toBe("project.milestone.upsert");
    expect(
      ProjectMilestoneUpsertCommandV1Schema.safeParse({ ...command, kind: "task.submit" }).success,
    ).toBe(false);
  });

  it("carries both milestone operations across the command protocol", () => {
    const metadata = { schemaVersion: 1, commandId: COMMAND_ID, issuedAt: T0, origin: "cli" };
    expect(
      CommandRequestV1Schema.parse({
        ...metadata,
        operation: "project.milestones.list",
        payload: { projectId: PROJECT_ID },
      }).operation,
    ).toBe("project.milestones.list");
    expect(
      CommandRequestV1Schema.parse({
        ...metadata,
        operation: "project.milestone.upsert",
        payload: { milestone: draft, expectedRevision: null },
      }).operation,
    ).toBe("project.milestone.upsert");
    expect(
      CommandRequestV1Schema.safeParse({
        ...metadata,
        operation: "project.milestones.list",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      CommandResultV1Schema.parse({
        operation: "project.milestone.upsert",
        milestone: milestone(),
        created: true,
      }).operation,
    ).toBe("project.milestone.upsert");
    expect(
      CommandResultV1Schema.parse({
        operation: "project.milestones.list",
        timeline: timeline(),
      }).operation,
    ).toBe("project.milestones.list");
  });
});

describe("ProjectPhaseActualsV1", () => {
  const actuals = {
    phase: "build",
    attemptCount: 3,
    activeAttemptCount: 1,
    blockerCount: 1,
    succeededAttemptCount: 1,
    firstAttemptAt: T0,
    lastActivityAt: T2,
    lastSucceededAt: T1,
  };

  it("accepts coherent observed counts, including the unphased bucket", () => {
    expect(ProjectPhaseActualsV1Schema.parse(actuals).phase).toBe("build");
    expect(
      ProjectPhaseActualsV1Schema.parse({
        ...actuals,
        phase: null,
        activeAttemptCount: 0,
        blockerCount: 0,
        succeededAttemptCount: 0,
        lastSucceededAt: null,
      }).phase,
    ).toBeNull();
  });

  it.each([
    ["more active plus succeeded than attempts", { activeAttemptCount: 3 }],
    ["blockers exceeding active attempts", { blockerCount: 2 }],
    ["activity before the first attempt", { lastActivityAt: "2026-08-16T08:00:00.000Z" }],
    ["a success instant without a success", { succeededAttemptCount: 0 }],
    ["a success count without an instant", { lastSucceededAt: null }],
    ["a success after the last activity", { lastSucceededAt: "2026-08-16T12:00:00.000Z" }],
    ["zero attempts", { attemptCount: 0, activeAttemptCount: 0, succeededAttemptCount: 0 }],
  ])("rejects %s", (_label, overrides) => {
    expect(ProjectPhaseActualsV1Schema.safeParse({ ...actuals, ...overrides }).success).toBe(false);
  });
});

describe("ProjectTimelineV1", () => {
  const dated = milestone({ milestoneId: M1, targetDate: "2026-09-01" });
  const laterDated = milestone({ milestoneId: M2, targetDate: "2026-10-01", dependsOn: [M1] });
  const undated = milestone({ milestoneId: M3, targetDate: null, dependsOn: [M1, M2] });

  it("keeps plans and actuals separate and orders undated milestones last", () => {
    const parsed = ProjectTimelineV1Schema.parse(
      timeline({
        milestones: [dated, laterDated, undated],
        actuals: {
          phases: [
            {
              phase: "build",
              attemptCount: 1,
              activeAttemptCount: 1,
              blockerCount: 0,
              succeededAttemptCount: 0,
              firstAttemptAt: T0,
              lastActivityAt: T1,
              lastSucceededAt: null,
            },
            {
              phase: null,
              attemptCount: 1,
              activeAttemptCount: 0,
              blockerCount: 0,
              succeededAttemptCount: 1,
              firstAttemptAt: T0,
              lastActivityAt: T1,
              lastSucceededAt: T1,
            },
          ],
          lifecycle: [],
        },
      }),
    );
    expect(parsed.milestones.map((entry) => entry.targetDate)).toEqual([
      "2026-09-01",
      "2026-10-01",
      null,
    ]);
  });

  it.each([
    [
      "an undated milestone sorted before a dated one",
      { milestones: [undated, dated, laterDated] },
    ],
    ["dated milestones out of calendar order", { milestones: [laterDated, dated] }],
    ["a duplicate milestone", { milestones: [dated, dated] }],
    [
      "a milestone from another project",
      { milestones: [milestone({ projectId: OTHER_PROJECT_ID })] },
    ],
    [
      "a dependency outside the project's milestones",
      { milestones: [milestone({ dependsOn: [M2] })] },
    ],
    [
      "a milestone updated after generatedAt",
      { milestones: [milestone({ revision: 1, updatedAt: "2026-08-16T12:00:00.000Z" })] },
    ],
    [
      "lifecycle actuals while lifecycle events are unavailable",
      {
        actuals: {
          phases: [],
          lifecycle: [
            {
              eventId: COMMAND_ID,
              type: "release.submitted",
              releaseId: null,
              evidenceDigest: DIGEST,
              emittedAt: T0,
            },
          ],
        },
      },
    ],
    [
      "phase actuals with the unphased bucket first",
      {
        actuals: {
          phases: [
            {
              phase: null,
              attemptCount: 1,
              activeAttemptCount: 0,
              blockerCount: 0,
              succeededAttemptCount: 0,
              firstAttemptAt: T0,
              lastActivityAt: T0,
              lastSucceededAt: null,
            },
            {
              phase: "build",
              attemptCount: 1,
              activeAttemptCount: 0,
              blockerCount: 0,
              succeededAttemptCount: 0,
              firstAttemptAt: T0,
              lastActivityAt: T0,
              lastSucceededAt: null,
            },
          ],
          lifecycle: [],
        },
      },
    ],
    [
      "phase activity after generatedAt",
      {
        actuals: {
          phases: [
            {
              phase: "build",
              attemptCount: 1,
              activeAttemptCount: 0,
              blockerCount: 0,
              succeededAttemptCount: 0,
              firstAttemptAt: T0,
              lastActivityAt: "2026-08-16T12:00:00.000Z",
              lastSucceededAt: null,
            },
          ],
          lifecycle: [],
        },
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(ProjectTimelineV1Schema.safeParse(timeline(overrides)).success).toBe(false);
  });
});
