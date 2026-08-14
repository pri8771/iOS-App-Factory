import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  computeTaskSpecDigest,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const roots: string[] = [];
const T0 = "2026-08-11T12:00:00.000Z";

function id(suffix: number): string {
  return `41000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function seed(
  repositories: ReturnType<typeof createFactoryRepositories>,
  suffix: number,
  initialDesiredState: "running" | "paused",
) {
  const taskSpec = {
    schemaVersion: 1,
    taskId: id(suffix * 10 + 1),
    projectId: id(1),
    createdAt: T0,
    title: `Candidate ${String(suffix)}`,
    objective: "Exercise deterministic scheduler discovery.",
    acceptanceCriteria: [
      { id: "discovery", statement: "The attempt is discovered.", verification: "automated" },
    ],
    base: { repositoryId: id(2), commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest: `sha256:${"b".repeat(64)}`,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const attemptId = id(suffix * 10 + 2);
  repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId: id(suffix * 10 + 3),
      issuedAt: T0,
      origin: "system",
      kind: "task.submit",
      initialDesiredState,
      taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId: taskSpec.taskId,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState: initialDesiredState,
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: T0,
      updatedAt: T0,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: id(suffix * 10 + 4),
      attemptId,
      sequence: 1,
      occurredAt: T0,
      commandId: id(suffix * 10 + 3),
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: taskSpec.taskId, taskSpecDigest },
    },
  });
  return attemptId;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("attempt reconciliation discovery", () => {
  it("orders operator intent ahead of ordinary running work and applies a strict limit", () => {
    const root = mkdtempSync(join(tmpdir(), "factory-reconciliation-query-"));
    roots.push(root);
    const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
    const repositories = createFactoryRepositories(database);
    const running = seed(repositories, 10, "running");
    const paused = seed(repositories, 20, "paused");

    expect(
      repositories.attempts
        .listReconciliationCandidates({ limit: 10 })
        .map((item) => item.attemptId),
    ).toEqual([paused, running]);
    expect(repositories.attempts.listReconciliationCandidates({ limit: 1 })).toHaveLength(1);
    expect(() => repositories.attempts.listReconciliationCandidates({ limit: 10_001 })).toThrow(
      /cannot exceed 10000/,
    );
    database.close();
  });

  it("discovers a retried attempt exactly as it would any other freshly queued running attempt", () => {
    const root = mkdtempSync(join(tmpdir(), "factory-reconciliation-retry-"));
    roots.push(root);
    const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
    const repositories = createFactoryRepositories(database);
    const attemptId = seed(repositories, 30, "running");

    const leaseKey = `attempt:${attemptId}`;
    const claimed = repositories.leases.claim({
      leaseKey,
      attemptId,
      ownerId: "test.worker",
      expectedAttemptRevision: 0,
      acquiredAt: "2026-08-11T12:00:01.000Z",
      expiresAt: "2026-08-11T12:00:10.000Z",
      event: {
        schemaVersion: 1,
        eventId: id(3010),
        attemptId,
        sequence: 2,
        occurredAt: "2026-08-11T12:00:01.000Z",
        commandId: null,
        causationEventId: null,
        fence: 1,
        type: "attempt.fence-claimed",
        data: { previousFence: 0, newFence: 1, ownerId: "test.worker" },
      },
    });
    const running = repositories.transitionAttemptState({
      leaseKey,
      ownerId: "test.worker",
      observedAt: "2026-08-11T12:00:01.100Z",
      expectedRevision: claimed.attempt.revision,
      attempt: {
        ...claimed.attempt,
        state: "running",
        revision: claimed.attempt.revision + 1,
        updatedAt: "2026-08-11T12:00:01.100Z",
      },
      event: {
        schemaVersion: 1,
        eventId: id(3011),
        attemptId,
        sequence: 3,
        occurredAt: "2026-08-11T12:00:01.100Z",
        commandId: null,
        causationEventId: id(3010),
        fence: 1,
        type: "attempt.state-changed",
        data: { from: "queued", to: "running", blocker: null, outcome: null },
      },
    });
    const failed = repositories.transitionAttemptState({
      leaseKey,
      ownerId: "test.worker",
      observedAt: "2026-08-11T12:00:01.200Z",
      expectedRevision: running.revision,
      attempt: {
        ...running,
        state: "failed",
        revision: running.revision + 1,
        currentStepId: null,
        updatedAt: "2026-08-11T12:00:01.200Z",
        terminalAt: "2026-08-11T12:00:01.200Z",
        outcome: {
          kind: "failed",
          failure: {
            code: "task.execution-failed",
            summary: "Deterministic test failure.",
            retryable: true,
            detailArtifactDigest: null,
          },
        },
      },
      event: {
        schemaVersion: 1,
        eventId: id(3012),
        attemptId,
        sequence: 4,
        occurredAt: "2026-08-11T12:00:01.200Z",
        commandId: null,
        causationEventId: id(3011),
        fence: 1,
        type: "attempt.state-changed",
        data: {
          from: "running",
          to: "failed",
          blocker: null,
          outcome: {
            kind: "failed",
            failure: {
              code: "task.execution-failed",
              summary: "Deterministic test failure.",
              retryable: true,
              detailArtifactDigest: null,
            },
          },
        },
      },
    });

    // A terminal-failed attempt is never a reconciliation candidate.
    expect(
      repositories.attempts.listReconciliationCandidates({ limit: 10 }).map((a) => a.attemptId),
    ).not.toContain(attemptId);

    const retriedAttemptId = id(3013);
    repositories.retryTaskAttempt({
      command: {
        schemaVersion: 1,
        commandId: id(3014),
        issuedAt: "2026-08-11T12:00:02.000Z",
        origin: "cli",
        kind: "task.retry",
        taskId: failed.taskId,
        priorAttemptId: attemptId,
        initialDesiredState: "running",
      },
      attempt: {
        schemaVersion: 1,
        attemptId: retriedAttemptId,
        taskId: failed.taskId,
        taskSpecDigest: failed.taskSpecDigest,
        attemptNumber: 2,
        state: "queued",
        desiredState: "running",
        revision: 0,
        fence: 0,
        currentStepId: null,
        blocker: null,
        outcome: null,
        createdAt: "2026-08-11T12:00:02.000Z",
        updatedAt: "2026-08-11T12:00:02.000Z",
        terminalAt: null,
      },
      event: {
        schemaVersion: 1,
        eventId: id(3015),
        attemptId: retriedAttemptId,
        sequence: 1,
        occurredAt: "2026-08-11T12:00:02.000Z",
        commandId: id(3014),
        causationEventId: null,
        fence: 0,
        type: "attempt.created",
        data: { taskId: failed.taskId, taskSpecDigest: failed.taskSpecDigest },
      },
    });

    // The freshly retried attempt is discoverable exactly like any other
    // queued+running attempt, with no scheduler-side changes required.
    expect(
      repositories.attempts.listReconciliationCandidates({ limit: 10 }).map((a) => a.attemptId),
    ).toEqual([retriedAttemptId]);
    database.close();
  });
});
