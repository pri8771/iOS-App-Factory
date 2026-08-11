import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  computeTaskSpecDigest,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:00:01.000Z";
const T2 = "2026-08-11T12:00:02.000Z";
const T3 = "2026-08-11T12:00:03.000Z";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const roots: string[] = [];

function uuid(value: number): string {
  return `82000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function bundle(index: number, projectId: string, createdAt: string) {
  const taskId = uuid(100 + index * 4);
  const commandId = uuid(101 + index * 4);
  const attemptId = uuid(102 + index * 4);
  const eventId = uuid(103 + index * 4);
  const taskSpec = {
    schemaVersion: 1,
    taskId,
    projectId,
    createdAt,
    title: `Work queue task ${String(index)}`,
    objective: "Expose this attempt through the bounded local activity read model.",
    acceptanceCriteria: [
      {
        id: "listed",
        statement: "The attempt appears in deterministic keyset order.",
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

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-attempt-list-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("attempt activity read model", () => {
  it("filters, orders, and keyset-paginates across projects without duplicating rows", () => {
    const store = database();
    const attempts = createFactoryRepositories(store).attempts;
    const repositories = createFactoryRepositories(store);
    const projectA = uuid(1);
    const projectB = uuid(2);
    const first = repositories.createTaskAttempt(bundle(1, projectA, T0)).attempt;
    const second = repositories.createTaskAttempt(bundle(2, projectA, T1)).attempt;
    const third = repositories.createTaskAttempt(bundle(3, projectA, T2)).attempt;
    const fourth = repositories.createTaskAttempt(bundle(4, projectB, T3)).attempt;

    const succeeded = {
      ...second,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: T3,
      terminalAt: T3,
    };
    store
      .prepare(
        `UPDATE attempts
         SET state = 'succeeded', revision = 1, outcome_json = ?, updated_at = ?,
             terminal_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(succeeded.outcome), T3, T3, JSON.stringify(succeeded), second.attemptId);
    const blocker = {
      kind: "environment",
      code: "factory.local-dependency",
      summary: "Waiting on another local task.",
      requiredAction: null,
    };
    const blocked = { ...third, state: "blocked", revision: 1, blocker, updatedAt: T2 };
    store
      .prepare(
        `UPDATE attempts
         SET state = 'blocked', revision = 1, blocker_json = ?, updated_at = ?, payload_json = ?
         WHERE attempt_id = ?`,
      )
      .run(JSON.stringify(blocker), T2, JSON.stringify(blocked), third.attemptId);

    const firstPage = attempts.list({ scope: "all", projectId: null, after: null, limit: 2 });
    expect(firstPage.attempts.map((item) => item.attempt.attemptId)).toEqual([
      fourth.attemptId,
      second.attemptId,
    ]);
    expect(firstPage.nextAfter).toEqual({ updatedAt: T3, attemptId: second.attemptId });
    expect(firstPage.hasMore).toBe(true);

    const secondPage = attempts.list({
      scope: "all",
      projectId: null,
      after: firstPage.nextAfter,
      limit: 2,
    });
    expect(secondPage.attempts.map((item) => item.attempt.attemptId)).toEqual([
      third.attemptId,
      first.attemptId,
    ]);
    expect(secondPage).toMatchObject({ nextAfter: null, hasMore: false });
    expect(
      new Set([...firstPage.attempts, ...secondPage.attempts].map((item) => item.attempt.attemptId))
        .size,
    ).toBe(4);

    expect(
      attempts
        .list({ scope: "active", projectId: null, after: null, limit: 100 })
        .attempts.map((item) => item.attempt.attemptId),
    ).toEqual([fourth.attemptId, third.attemptId, first.attemptId]);
    const projectPage = attempts.list({
      scope: "all",
      projectId: projectA,
      after: null,
      limit: 100,
    });
    expect(projectPage.attempts.map((item) => item.attempt.attemptId)).toEqual([
      second.attemptId,
      third.attemptId,
      first.attemptId,
    ]);
    expect(projectPage.attempts[0]).toMatchObject({
      projectId: projectA,
      title: "Work queue task 2",
      attempt: { state: "succeeded" },
    });
    store.close();
  });

  it("returns an empty page, validates bounds, and fails closed on corrupt stored state", () => {
    const store = database();
    const repositories = createFactoryRepositories(store);
    expect(
      repositories.attempts.list({ scope: "active", projectId: null, after: null, limit: 20 }),
    ).toEqual({ attempts: [], nextAfter: null, hasMore: false });
    expect(() =>
      repositories.attempts.list({ scope: "all", projectId: null, after: null, limit: 101 }),
    ).toThrow();

    const created = repositories.createTaskAttempt(bundle(10, uuid(10), T0)).attempt;
    store
      .prepare("UPDATE attempts SET payload_json = '{}' WHERE attempt_id = ?")
      .run(created.attemptId);
    expect(() =>
      repositories.attempts.list({ scope: "all", projectId: null, after: null, limit: 20 }),
    ).toThrow("violates the current runtime contract");
    store.close();
  });
});
