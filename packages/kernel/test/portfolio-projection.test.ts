import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FACTORY_MIGRATIONS,
  computeTaskSpecDigest,
  createFactoryRepositories,
  openFactoryDatabase,
  openMigratedFactoryDatabase,
  runMigrations,
} from "../src/index.js";

const T0 = "2026-08-10T12:00:00.000Z";
const T1 = "2026-08-10T12:00:01.000Z";
const T2 = "2026-08-10T12:00:02.000Z";
const T3 = "2026-08-10T12:00:03.000Z";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const roots: string[] = [];

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function createBundle(index: number, projectId: string, createdAt: string) {
  const taskId = uuid(100 + index * 4);
  const commandId = uuid(101 + index * 4);
  const attemptId = uuid(102 + index * 4);
  const eventId = uuid(103 + index * 4);
  const taskSpec = {
    schemaVersion: 1,
    taskId,
    projectId,
    createdAt,
    title: `Portfolio task ${String(index)}`,
    objective: "Expose authoritative local project execution state.",
    acceptanceCriteria: [
      {
        id: "portfolio-state",
        statement: "The local project summary is accurate.",
        verification: "automated",
      },
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

function makeDatabase() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-portfolio-projection-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

function makeDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "app-factory-portfolio-migration-"));
  roots.push(root);
  return join(root, "factory.sqlite");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local portfolio projection", () => {
  it("returns a bounded project aggregation from authoritative attempts", () => {
    const database = makeDatabase();
    const repositories = createFactoryRepositories(database);
    const projectA = uuid(1);
    const projectB = uuid(2);
    const queued = repositories.createTaskAttempt(createBundle(1, projectA, T0)).attempt;
    const blocked = repositories.createTaskAttempt(createBundle(2, projectA, T1)).attempt;
    const delivered = repositories.createTaskAttempt(createBundle(3, projectB, T1)).attempt;
    const blocker = {
      kind: "environment",
      code: "factory.environment-blocked",
      summary: "A deterministic fixture blocker.",
      requiredAction: null,
    };
    const blockedSnapshot = {
      ...blocked,
      state: "blocked",
      revision: 1,
      blocker,
      updatedAt: T2,
    };
    database
      .prepare(
        `UPDATE attempts
         SET state = 'blocked', revision = 1, blocker_json = ?, updated_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(blocker), T2, JSON.stringify(blockedSnapshot), blocked.attemptId);
    const deliveredSnapshot = {
      ...delivered,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: T3,
      terminalAt: T3,
    };
    database
      .prepare(
        `UPDATE attempts
         SET state = 'succeeded', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(
        JSON.stringify(deliveredSnapshot.outcome),
        T3,
        T3,
        JSON.stringify(deliveredSnapshot),
        delivered.attemptId,
      );

    expect(repositories.portfolio.listProjectSummaries()).toEqual([
      {
        projectId: projectA,
        attemptCount: 2,
        activeAttemptCount: 2,
        blockerCount: 1,
        lastActivityAt: T2,
        lastSuccessfulAttemptAt: null,
      },
      {
        projectId: projectB,
        attemptCount: 1,
        activeAttemptCount: 0,
        blockerCount: 0,
        lastActivityAt: T3,
        lastSuccessfulAttemptAt: T3,
      },
    ]);
    expect(queued.state).toBe("queued");
    expect(() => repositories.portfolio.listProjectSummaries({ limit: 1 })).toThrow(
      "more than 1 projects",
    );
    database.close();
  });

  it("returns an empty snapshot and rejects an unsafe requested bound", () => {
    const database = makeDatabase();
    const repository = createFactoryRepositories(database).portfolio;
    expect(repository.listProjectSummaries()).toEqual([]);
    expect(() => repository.listProjectSummaries({ limit: 1_001 })).toThrow("cannot exceed 1000");
    database.close();
  });

  it("backfills existing attempt history when a v3 database upgrades", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 3) });
    const projectId = uuid(40);
    const repositories = createFactoryRepositories(database);
    const attempt = repositories.createTaskAttempt(createBundle(40, projectId, T0)).attempt;
    const succeeded = {
      ...attempt,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: T1,
      terminalAt: T1,
    };
    database
      .prepare(
        `UPDATE attempts
         SET state = 'succeeded', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(succeeded.outcome), T1, T1, JSON.stringify(succeeded), attempt.attemptId);

    expect(runMigrations(database)).toEqual({
      currentVersion: 9,
      newlyAppliedVersions: [4, 5, 6, 7, 8, 9],
    });
    expect(createFactoryRepositories(database).portfolio.listProjectSummaries()).toEqual([
      {
        projectId,
        attemptCount: 1,
        activeAttemptCount: 0,
        blockerCount: 0,
        lastActivityAt: T1,
        lastSuccessfulAttemptAt: T1,
      },
    ]);
    database.close();
  });
});
