import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectMilestoneUpsertError,
  computeTaskSpecDigest,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";
const T2 = "2026-08-16T09:00:02.000Z";
const T3 = "2026-08-16T09:00:03.000Z";
const T4 = "2026-08-16T09:00:04.000Z";
const T5 = "2026-08-16T09:00:05.000Z";
const PROJECT_A = "83000000-0000-4000-8000-000000000001";
const PROJECT_B = "83000000-0000-4000-8000-000000000002";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const EVIDENCE_DIGEST = `sha256:${"e".repeat(64)}`;

const roots: string[] = [];

function uuid(value: number): string {
  return `83000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-milestones-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function draft(milestoneId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    milestoneId,
    projectId: PROJECT_A,
    phase: "build",
    kind: "stage",
    label: "Core loop builds green",
    targetDate: null,
    dependsOn: [],
    owner: "machine",
    status: "planned",
    evidenceDigest: null,
    ...overrides,
  };
}

function command(
  commandId: string,
  milestone: ReturnType<typeof draft>,
  expectedRevision: number | null,
  issuedAt = T0,
) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "cli",
    kind: "project.milestone.upsert",
    upsert: { milestone, expectedRevision },
  };
}

function taskBundle(index: number, projectId: string, createdAt: string, phase: string | null) {
  const taskId = uuid(1_000 + index * 4);
  const commandId = uuid(1_001 + index * 4);
  const attemptId = uuid(1_002 + index * 4);
  const eventId = uuid(1_003 + index * 4);
  const taskSpec = {
    schemaVersion: 1,
    taskId,
    projectId,
    createdAt,
    title: `Phase task ${String(index)}`,
    objective: "Contribute an observed actual to the project timeline.",
    ...(phase === null ? {} : { phase }),
    acceptanceCriteria: [
      { id: "observed", statement: "The attempt is counted.", verification: "automated" },
    ],
    base: { repositoryId: uuid(900 + index), commit: "b".repeat(40) },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest: POLICY_DIGEST,
  };
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  return {
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt: createdAt,
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
      createdAt,
      updatedAt: createdAt,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId,
      attemptId,
      sequence: 1,
      occurredAt: createdAt,
      commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId, taskSpecDigest },
    },
  };
}

describe("project milestone repository", () => {
  it("creates at revision 0, updates by compare-and-set, and keeps every revision", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);

    const created = milestones.upsert({
      command: command(uuid(101), draft(M1), null),
      recordedAt: T0,
    });
    expect(created).toEqual({
      milestone: {
        schemaVersion: 1,
        ...draft(M1),
        revision: 0,
        createdAt: T0,
        updatedAt: T0,
      },
      created: true,
      duplicate: false,
    });

    const updated = milestones.upsert({
      command: command(
        uuid(102),
        draft(M1, { status: "active", targetDate: "2026-09-01", label: "Core loop green" }),
        0,
        T1,
      ),
      recordedAt: T1,
    });
    expect(updated.created).toBe(false);
    expect(updated.duplicate).toBe(false);
    expect(updated.milestone).toMatchObject({
      revision: 1,
      status: "active",
      targetDate: "2026-09-01",
      label: "Core loop green",
      createdAt: T0,
      updatedAt: T1,
    });

    const done = milestones.upsert({
      command: command(
        uuid(103),
        draft(M1, {
          status: "done",
          targetDate: "2026-09-01",
          label: "Core loop green",
          evidenceDigest: EVIDENCE_DIGEST,
        }),
        1,
        T2,
      ),
      recordedAt: T2,
    });
    expect(done.milestone).toMatchObject({ revision: 2, status: "done", updatedAt: T2 });

    expect(milestones.findById(M1)).toEqual(done.milestone);
    expect(
      milestones
        .listRevisions(M1)
        .map((record) => [
          record.milestone.revision,
          record.command.commandId,
          record.command.upsert.expectedRevision,
          record.milestone.status,
        ]),
    ).toEqual([
      [0, uuid(101), null, "planned"],
      [1, uuid(102), 0, "active"],
      [2, uuid(103), 1, "done"],
    ]);
    expect(milestones.listRevisions(M1).map((record) => record.milestone.updatedAt)).toEqual([
      T0,
      T1,
      T2,
    ]);
    expect(milestones.listRevisions(M1).map((record) => record.command.origin)).toEqual([
      "cli",
      "cli",
      "cli",
    ]);
    expect(milestones.findRevisionByCommandId(uuid(102))?.milestone.revision).toBe(1);
    expect(milestones.findRevisionByCommandId(uuid(999))).toBeNull();
    store.close();
  });

  it("stores an undated milestone as NULL and never fabricates a target date", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    milestones.upsert({ command: command(uuid(101), draft(M1), null), recordedAt: T0 });
    const row = store
      .prepare("SELECT target_date, payload_json FROM project_milestones WHERE milestone_id = ?")
      .get(M1) as Readonly<{ target_date: string | null; payload_json: string }>;
    expect(row.target_date).toBeNull();
    expect(JSON.parse(row.payload_json)).toMatchObject({ targetDate: null });
    expect(milestones.findById(M1)?.targetDate).toBeNull();

    // A later revision that drops the date must be honored the same way: an
    // operator can retract an estimate, and the head must not keep the old one.
    milestones.upsert({
      command: command(uuid(102), draft(M1, { targetDate: "2026-09-01" }), 0, T1),
      recordedAt: T1,
    });
    milestones.upsert({
      command: command(uuid(103), draft(M1, { targetDate: null }), 1, T2),
      recordedAt: T2,
    });
    expect(milestones.findById(M1)).toMatchObject({ revision: 2, targetDate: null });
    expect(milestones.listRevisions(M1).map((record) => record.milestone.targetDate)).toEqual([
      null,
      "2026-09-01",
      null,
    ]);
    store.close();
  });

  it("is idempotent by command ID and refuses a reused command ID with different content", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    const create = command(uuid(101), draft(M1), null);
    const first = milestones.upsert({ command: create, recordedAt: T0 });
    const replay = milestones.upsert({ command: create, recordedAt: T3 });
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(milestones.listRevisions(M1)).toHaveLength(1);

    expect(() =>
      milestones.upsert({
        command: command(uuid(101), draft(M1, { label: "Something else" }), null),
        recordedAt: T3,
      }),
    ).toThrow(ProjectMilestoneUpsertError);
    expect(() =>
      milestones.upsert({
        command: command(uuid(101), draft(M1), null, T1),
        recordedAt: T3,
      }),
    ).toThrowError(expect.objectContaining({ code: "milestone.identity-conflict" }));
    expect(milestones.listRevisions(M1)).toHaveLength(1);
    store.close();
  });

  it.each([
    [
      "creating an existing milestone",
      (id: string) => command(uuid(201), draft(id), null, T1),
      "milestone.already-exists",
    ],
    [
      "updating a missing milestone",
      () => command(uuid(202), draft(uuid(77)), 0, T1),
      "milestone.not-found",
    ],
    [
      "a stale expected revision",
      (id: string) => command(uuid(203), draft(id, { status: "active" }), 4, T1),
      "milestone.revision-conflict",
    ],
    [
      "moving a milestone to another project",
      (id: string) => command(uuid(204), draft(id, { projectId: PROJECT_B }), 0, T1),
      "milestone.project-mismatch",
    ],
    [
      "a dependency that does not exist",
      (id: string) => command(uuid(205), draft(id, { dependsOn: [uuid(78)] }), 0, T1),
      "milestone.dependency-not-found",
    ],
  ])("refuses %s without writing a revision", (_label, build, code) => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    milestones.upsert({ command: command(uuid(101), draft(M1), null), recordedAt: T0 });
    expect(() => milestones.upsert({ command: build(M1), recordedAt: T1 })).toThrowError(
      expect.objectContaining({ code }),
    );
    expect(milestones.findById(M1)?.revision).toBe(0);
    expect(milestones.listRevisions(M1)).toHaveLength(1);
    expect(store.prepare("SELECT COUNT(*) AS n FROM project_milestone_revisions").get()).toEqual({
      n: 1,
    });
    store.close();
  });

  it("refuses cross-project dependencies and dependency cycles", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    const M2 = uuid(2);
    const M3 = uuid(3);
    const FOREIGN = uuid(4);
    milestones.upsert({ command: command(uuid(101), draft(M1), null), recordedAt: T0 });
    milestones.upsert({
      command: command(uuid(102), draft(M2, { dependsOn: [M1] }), null),
      recordedAt: T0,
    });
    milestones.upsert({
      command: command(uuid(103), draft(M3, { dependsOn: [M2] }), null),
      recordedAt: T0,
    });
    milestones.upsert({
      command: command(uuid(104), draft(FOREIGN, { projectId: PROJECT_B }), null),
      recordedAt: T0,
    });

    expect(() =>
      milestones.upsert({
        command: command(uuid(105), draft(M1, { dependsOn: [FOREIGN] }), 0, T1),
        recordedAt: T1,
      }),
    ).toThrowError(expect.objectContaining({ code: "milestone.dependency-not-found" }));
    expect(() =>
      milestones.upsert({
        command: command(uuid(106), draft(M1, { dependsOn: [M3] }), 0, T1),
        recordedAt: T1,
      }),
    ).toThrowError(expect.objectContaining({ code: "milestone.dependency-cycle" }));
    // A dependency on an unrelated milestone in the same project stays legal.
    expect(
      milestones.upsert({
        command: command(uuid(107), draft(M3, { dependsOn: [M1] }), 0, T1),
        recordedAt: T1,
      }).milestone.dependsOn,
    ).toEqual([M1]);
    store.close();
  });

  it("requires history timestamps to advance strictly per milestone", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    milestones.upsert({ command: command(uuid(101), draft(M1), null), recordedAt: T1 });
    expect(() =>
      milestones.upsert({
        command: command(uuid(102), draft(M1, { status: "active" }), 0, T1),
        recordedAt: T1,
      }),
    ).toThrow(/must follow/);
    expect(() =>
      milestones.upsert({
        command: command(uuid(103), draft(M1, { status: "active" }), 0, T1),
        recordedAt: T0,
      }),
    ).toThrow(/must follow/);
    expect(milestones.findById(M1)?.revision).toBe(0);
    store.close();
  });

  it("lists a project's milestones dated first in calendar order, then undated, and never another project's", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const later = uuid(1);
    const undatedB = uuid(2);
    const earlier = uuid(3);
    const undatedA = uuid(4);
    const foreign = uuid(5);
    milestones.upsert({
      command: command(uuid(101), draft(later, { targetDate: "2026-10-01" }), null),
      recordedAt: T0,
    });
    milestones.upsert({ command: command(uuid(102), draft(undatedB), null), recordedAt: T0 });
    milestones.upsert({
      command: command(uuid(103), draft(earlier, { targetDate: "2026-09-01" }), null),
      recordedAt: T0,
    });
    milestones.upsert({ command: command(uuid(104), draft(undatedA), null), recordedAt: T0 });
    milestones.upsert({
      command: command(uuid(105), draft(foreign, { projectId: PROJECT_B }), null),
      recordedAt: T0,
    });

    expect(milestones.listByProject(PROJECT_A).map((milestone) => milestone.milestoneId)).toEqual([
      earlier,
      later,
      undatedB,
      undatedA,
    ]);
    expect(milestones.listByProject(PROJECT_B).map((milestone) => milestone.milestoneId)).toEqual([
      foreign,
    ]);
    expect(milestones.listByProject(uuid(99))).toEqual([]);
    store.close();
  });

  it("enforces immutable history and calendar-date validity at the SQLite layer", () => {
    const store = database();
    const milestones = createFactoryRepositories(store).milestones;
    const M1 = uuid(1);
    milestones.upsert({ command: command(uuid(101), draft(M1), null), recordedAt: T0 });
    milestones.upsert({
      command: command(uuid(102), draft(M1, { status: "active" }), 0, T1),
      recordedAt: T1,
    });

    expect(() =>
      store.prepare("DELETE FROM project_milestones WHERE milestone_id = ?").run(M1),
    ).toThrow(/retained/);
    expect(() =>
      store.prepare("DELETE FROM project_milestone_revisions WHERE milestone_id = ?").run(M1),
    ).toThrow(/append-only/);
    expect(() =>
      store
        .prepare("UPDATE project_milestone_revisions SET origin = 'mcp' WHERE milestone_id = ?")
        .run(M1),
    ).toThrow(/append-only/);
    expect(() =>
      store
        .prepare(
          `UPDATE project_milestones
           SET project_id = ?, revision = revision + 1, updated_at = ?
           WHERE milestone_id = ?`,
        )
        .run(PROJECT_B, T2, M1),
    ).toThrow(/identity is immutable/);
    expect(() =>
      store
        .prepare(
          `UPDATE project_milestones
           SET created_at = ?, revision = revision + 1, updated_at = ?
           WHERE milestone_id = ?`,
        )
        .run(T0, T2, M1),
    ).toThrow(/identity is immutable/);
    expect(() =>
      store
        .prepare(
          "UPDATE project_milestones SET status = 'done', revision = 5 WHERE milestone_id = ?",
        )
        .run(M1),
    ).toThrow(/not monotonic/);
    expect(() =>
      store
        .prepare(
          `UPDATE project_milestones SET status = 'done', revision = revision + 1, updated_at = ?
           WHERE milestone_id = ?`,
        )
        .run(T0, M1),
    ).toThrow(/not monotonic/);
    for (const invalidDate of ["2026-02-30", "2026-13-01", "2026-1-1", "20260901"]) {
      expect(
        () =>
          store
            .prepare(
              `UPDATE project_milestones
               SET target_date = ?, revision = revision + 1, updated_at = ?
               WHERE milestone_id = ?`,
            )
            .run(invalidDate, T2, M1),
        invalidDate,
      ).toThrow(/CHECK constraint failed/);
    }
    expect(() =>
      store
        .prepare(
          `INSERT INTO project_milestone_revisions(
             milestone_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, 7, ?, 'cli', ?, 6, ?, '{}', '{}')`,
        )
        .run(M1, uuid(555), T2, T2),
    ).toThrow(/does not match the milestone head/);
    expect(milestones.findById(M1)?.revision).toBe(1);
    expect(milestones.listRevisions(M1)).toHaveLength(2);
    store.close();
  });

  it("derives per-phase actuals from attempts, keyed by each task's phase, unphased last", () => {
    const store = database();
    const repositories = createFactoryRepositories(store);
    const milestones = repositories.milestones;
    expect(milestones.listPhaseActuals(PROJECT_A)).toEqual([]);

    const build1 = repositories.createTaskAttempt(taskBundle(1, PROJECT_A, T0, "build")).attempt;
    const build2 = repositories.createTaskAttempt(taskBundle(2, PROJECT_A, T1, "build")).attempt;
    repositories.createTaskAttempt(taskBundle(3, PROJECT_A, T2, "build"));
    const research = repositories.createTaskAttempt(
      taskBundle(4, PROJECT_A, T1, "research"),
    ).attempt;
    repositories.createTaskAttempt(taskBundle(5, PROJECT_A, T3, null));
    repositories.createTaskAttempt(taskBundle(6, PROJECT_B, T0, "build"));

    const succeeded = {
      ...build1,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: T4,
      terminalAt: T4,
    };
    store
      .prepare(
        `UPDATE attempts
         SET state = 'succeeded', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(succeeded.outcome), T4, T4, JSON.stringify(succeeded), build1.attemptId);
    const blocker = {
      kind: "environment",
      code: "factory.local-dependency",
      summary: "Waiting on another local task.",
      requiredAction: null,
    };
    const blocked = { ...build2, state: "blocked", revision: 1, blocker, updatedAt: T5 };
    store
      .prepare(
        `UPDATE attempts
         SET state = 'blocked', revision = 1, blocker_json = ?, updated_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(blocker), T5, JSON.stringify(blocked), build2.attemptId);
    const failed = {
      ...research,
      state: "failed",
      revision: 1,
      outcome: {
        kind: "failed",
        failure: {
          code: "agent.crashed",
          summary: "The agent exited.",
          retryable: true,
          detailArtifactDigest: null,
        },
      },
      updatedAt: T3,
      terminalAt: T3,
    };
    store
      .prepare(
        `UPDATE attempts
         SET state = 'failed', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(failed.outcome), T3, T3, JSON.stringify(failed), research.attemptId);

    expect(milestones.listPhaseActuals(PROJECT_A)).toEqual([
      {
        phase: "build",
        attemptCount: 3,
        activeAttemptCount: 2,
        blockerCount: 1,
        succeededAttemptCount: 1,
        firstAttemptAt: T0,
        lastActivityAt: T5,
        lastSucceededAt: T4,
      },
      {
        phase: "research",
        attemptCount: 1,
        activeAttemptCount: 0,
        blockerCount: 0,
        succeededAttemptCount: 0,
        firstAttemptAt: T1,
        lastActivityAt: T3,
        lastSucceededAt: null,
      },
      {
        phase: null,
        attemptCount: 1,
        activeAttemptCount: 1,
        blockerCount: 0,
        succeededAttemptCount: 0,
        firstAttemptAt: T3,
        lastActivityAt: T3,
        lastSucceededAt: null,
      },
    ]);
    expect(milestones.listPhaseActuals(PROJECT_B)).toEqual([
      expect.objectContaining({ phase: "build", attemptCount: 1 }),
    ]);
    store.close();
  });
});

describe("task spec phase and the canonical digest", () => {
  const fixture = {
    schemaVersion: 1,
    taskId: "00000000-0000-4000-8000-000000000003",
    projectId: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-10T12:00:00.000Z",
    title: "Implement the greeting",
    objective: "Return the requested greeting from the fixture package.",
    acceptanceCriteria: [
      {
        id: "returns-greeting",
        statement: "The package returns Hello, Factory.",
        verification: "automated",
      },
    ],
    base: {
      repositoryId: "00000000-0000-4000-8000-000000000002",
      commit: "a".repeat(40),
    },
    requestedScope: { paths: ["Sources/FactoryFixture/Greeting.swift"] },
    policyDigest: `sha256:${"a".repeat(64)}`,
  };

  it("keeps every phase-less spec's digest byte-identical to before the field existed", () => {
    // Golden value recorded from computeTaskSpecDigest on this exact fixture
    // (packages/contracts/fixtures/v1/valid/contracts.json "task-spec-minimal")
    // before TaskSpecV1 gained `phase`. It must never move.
    expect(computeTaskSpecDigest(fixture)).toBe(
      "sha256:7923025ce8dc6d7324d10079fd63a714a285df3b9326549f8609cf05f65868ba",
    );
  });

  it("changes the digest when a phase is present and round-trips it through a task snapshot", () => {
    const withPhase = { ...fixture, phase: "build" };
    expect(computeTaskSpecDigest(withPhase)).not.toBe(computeTaskSpecDigest(fixture));
    expect(computeTaskSpecDigest({ ...fixture, phase: "research" })).not.toBe(
      computeTaskSpecDigest(withPhase),
    );

    const store = database();
    const repositories = createFactoryRepositories(store);
    const bundle = taskBundle(1, PROJECT_A, T0, "build");
    const created = repositories.createTaskAttempt(bundle);
    expect(created.taskSpec.phase).toBe("build");
    expect(repositories.taskSnapshots.findById(created.taskSpec.taskId)?.phase).toBe("build");
    const page = repositories.attempts.list({
      scope: "all",
      projectId: PROJECT_A,
      after: null,
      limit: 10,
    });
    expect(page.attempts.map((item) => item.phase)).toEqual(["build"]);

    const unphased = repositories.createTaskAttempt(taskBundle(2, PROJECT_A, T1, null));
    expect("phase" in unphased.taskSpec).toBe(false);
    expect(
      repositories.attempts
        .list({ scope: "all", projectId: PROJECT_A, after: null, limit: 10 })
        .attempts.map((item) => item.phase),
    ).toEqual([null, "build"]);
    store.close();
  });
});
