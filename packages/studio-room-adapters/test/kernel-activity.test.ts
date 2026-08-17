import { computeTaskSpecDigest, createFactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { createKernelAttemptActivityPort } from "../src/index.js";
import { cleanupTestDatabases, openTestDatabase } from "./helpers.js";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;

function uuid(value: number): string {
  return `c0000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function bundle(createdAt: string) {
  const taskId = uuid(1);
  const commandId = uuid(2);
  const attemptId = uuid(3);
  const eventId = uuid(4);
  const taskSpec = {
    schemaVersion: 1,
    taskId,
    projectId: uuid(9),
    createdAt,
    title: "Kernel-activity fixture task",
    objective: "Prove the room quota governor sees real factory activity.",
    acceptanceCriteria: [
      { id: "listed", statement: "Shows up as active.", verification: "automated" },
    ],
    base: { repositoryId: uuid(900), commit: "b".repeat(40) },
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

afterEach(() => {
  cleanupTestDatabases();
});

describe("createKernelAttemptActivityPort", () => {
  it("reports no running attempt on a freshly migrated database", () => {
    const database = openTestDatabase();
    const activity = createKernelAttemptActivityPort(database);
    expect(activity.hasRunningAttempt()).toBe(false);
  });

  it("reports a running attempt once one is created (real kernel attempts table)", () => {
    const database = openTestDatabase();
    createFactoryRepositories(database).createTaskAttempt(bundle("2026-08-16T10:00:00.000Z"));
    const activity = createKernelAttemptActivityPort(database);
    expect(activity.hasRunningAttempt()).toBe(true);
  });

  it("stops reporting activity once the only attempt reaches a terminal state", () => {
    const database = openTestDatabase();
    const created = createFactoryRepositories(database).createTaskAttempt(
      bundle("2026-08-16T10:00:00.000Z"),
    ).attempt;
    const succeeded = {
      ...created,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: "2026-08-16T10:05:00.000Z",
      terminalAt: "2026-08-16T10:05:00.000Z",
    };
    database
      .prepare(
        `UPDATE attempts
         SET state = 'succeeded', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(
        JSON.stringify(succeeded.outcome),
        succeeded.updatedAt,
        succeeded.terminalAt,
        JSON.stringify(succeeded),
        created.attemptId,
      );
    const activity = createKernelAttemptActivityPort(database);
    expect(activity.hasRunningAttempt()).toBe(false);
  });
});
