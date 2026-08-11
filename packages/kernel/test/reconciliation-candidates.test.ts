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
});
