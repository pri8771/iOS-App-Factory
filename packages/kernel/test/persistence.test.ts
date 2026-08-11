import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FACTORY_MIGRATIONS,
  computeTaskSpecDigest,
  createFactoryRepositories,
  listAppliedMigrations,
  openFactoryDatabase,
  openMigratedFactoryDatabase,
  runMigrations,
  type SqlMigration,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const LATER = "2026-08-10T12:00:01.000Z";
const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "00000000-0000-4000-8000-000000000002";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const BASE_COMMIT = "d".repeat(40);

const IDS_A = {
  task: "00000000-0000-4000-8000-000000000003",
  command: "00000000-0000-4000-8000-000000000004",
  attempt: "00000000-0000-4000-8000-000000000005",
  event: "00000000-0000-4000-8000-000000000006",
  transitionEvent: "00000000-0000-4000-8000-000000000007",
} as const;

const IDS_B = {
  task: "00000000-0000-4000-8000-000000000013",
  command: "00000000-0000-4000-8000-000000000014",
  attempt: "00000000-0000-4000-8000-000000000015",
  event: "00000000-0000-4000-8000-000000000016",
  transitionEvent: "00000000-0000-4000-8000-000000000017",
} as const;

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-persistence-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function makeBundle(ids: typeof IDS_A | typeof IDS_B) {
  const taskSpec = {
    schemaVersion: 1,
    taskId: ids.task,
    projectId: PROJECT_ID,
    createdAt: NOW,
    title: "Add deterministic greeting",
    objective: "Implement the requested greeting without modifying protected tests.",
    acceptanceCriteria: [
      {
        id: "greeting-test",
        statement: "The deterministic greeting test passes.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Sources/Greeting.swift"] },
    policyDigest: POLICY_DIGEST,
  };
  const command = {
    schemaVersion: 1,
    commandId: ids.command,
    issuedAt: NOW,
    origin: "cli",
    kind: "task.submit",
    taskSpec,
  };
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const attempt = {
    schemaVersion: 1,
    attemptId: ids.attempt,
    taskId: ids.task,
    taskSpecDigest,
    attemptNumber: 1,
    state: "queued",
    desiredState: "running",
    revision: 0,
    fence: 0,
    currentStepId: null,
    blocker: null,
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    terminalAt: null,
  };
  const event = {
    schemaVersion: 1,
    eventId: ids.event,
    attemptId: ids.attempt,
    sequence: 1,
    occurredAt: NOW,
    commandId: ids.command,
    causationEventId: null,
    fence: 0,
    type: "attempt.created",
    data: { taskId: ids.task, taskSpecDigest },
  };
  return { command, taskSpecDigest, attempt, event };
}

function makeRunningTransition(ids: typeof IDS_A | typeof IDS_B) {
  return {
    expectedRevision: 0,
    attempt: {
      ...makeBundle(ids).attempt,
      state: "running",
      revision: 1,
      updatedAt: LATER,
    },
    event: {
      schemaVersion: 1,
      eventId: ids.transitionEvent,
      attemptId: ids.attempt,
      sequence: 2,
      occurredAt: LATER,
      commandId: null,
      causationEventId: ids.event,
      fence: 0,
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("migration runner", () => {
  it("creates every initial STRICT table, records its checksum, and is idempotent", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const first = runMigrations(database, { now: () => new Date(NOW) });
    const second = runMigrations(database, { now: () => new Date(LATER) });

    expect(first).toEqual({ currentVersion: 1, newlyAppliedVersions: [1] });
    expect(second).toEqual({ currentVersion: 1, newlyAppliedVersions: [] });
    expect(database.pragma("user_version", { simple: true })).toBe(1);
    expect(listAppliedMigrations(database)).toEqual([
      {
        version: 1,
        name: "initial-control-plane",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
    ]);

    const rows = database
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as readonly Readonly<{ name: string; sql: string }>[];
    expect(rows.map((row) => row.name)).toEqual([
      "artifacts",
      "attempts",
      "commands",
      "events",
      "leases",
      "schema_migrations",
      "steps",
      "task_snapshots",
    ]);
    expect(rows.every((row) => row.sql.trimEnd().endsWith("STRICT"))).toBe(true);
    database.close();
  });

  it("rolls a failed migration back without advancing either ledger", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { now: () => new Date(NOW) });
    const brokenMigration: SqlMigration = {
      version: 2,
      name: "broken-probe",
      sql: `
        CREATE TABLE must_rollback (id INTEGER PRIMARY KEY) STRICT;
        INSERT INTO table_that_does_not_exist(id) VALUES (1);
      `,
    };

    expect(() =>
      runMigrations(database, {
        migrations: [...FACTORY_MIGRATIONS, brokenMigration],
        now: () => new Date(LATER),
      }),
    ).toThrow(/Migration 2 \(broken-probe\) failed/);
    expect(database.pragma("user_version", { simple: true })).toBe(1);
    expect(listAppliedMigrations(database).map((migration) => migration.version)).toEqual([1]);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_rollback'")
        .get(),
    ).toBeUndefined();
    database.close();
  });
});

describe("Factory repositories", () => {
  it("replays the original task submission after a lost response and rejects command collisions", () => {
    const databasePath = makeDatabasePath();
    let database = openMigratedFactoryDatabase(databasePath);
    let repositories = createFactoryRepositories(database);
    const original = makeBundle(IDS_A);
    expect(repositories.createTaskAttempt(original)).toMatchObject({ duplicate: false });
    database.close();

    database = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    repositories = createFactoryRepositories(database);
    const retriedWithFreshGeneratedIds = {
      ...original,
      attempt: { ...original.attempt, attemptId: IDS_B.attempt },
      event: {
        ...original.event,
        eventId: IDS_B.event,
        attemptId: IDS_B.attempt,
      },
    };
    expect(repositories.createTaskAttempt(retriedWithFreshGeneratedIds)).toMatchObject({
      command: original.command,
      attempt: original.attempt,
      event: original.event,
      duplicate: true,
    });

    const changedTaskSpec = {
      ...original.command.taskSpec,
      objective: "A conflicting objective under the same command ID.",
    };
    const changedDigest = computeTaskSpecDigest(changedTaskSpec);
    expect(() =>
      repositories.createTaskAttempt({
        command: { ...original.command, taskSpec: changedTaskSpec },
        taskSpecDigest: changedDigest,
        attempt: {
          ...original.attempt,
          taskSpecDigest: changedDigest,
          attemptId: IDS_B.attempt,
        },
        event: {
          ...original.event,
          eventId: IDS_B.event,
          attemptId: IDS_B.attempt,
          data: { taskId: IDS_A.task, taskSpecDigest: changedDigest },
        },
      }),
    ).toThrow(/duplicate task-submit command/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM attempts").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 1 });
    database.close();
  });

  it("persists an atomic submission and state transition across close/reopen", () => {
    const databasePath = makeDatabasePath();
    let database = openMigratedFactoryDatabase(databasePath, { now: () => new Date(NOW) });
    let repositories = createFactoryRepositories(database);
    const bundle = makeBundle(IDS_A);

    expect(repositories.createTaskAttempt(bundle)).toMatchObject({
      command: bundle.command,
      taskSpec: bundle.command.taskSpec,
      attempt: bundle.attempt,
      event: bundle.event,
    });
    repositories.transitionAttemptState(makeRunningTransition(IDS_A));
    database.close();

    database = openMigratedFactoryDatabase(databasePath, {
      fileMustExist: true,
      now: () => new Date(LATER),
    });
    repositories = createFactoryRepositories(database);
    expect(repositories.commands.findById(IDS_A.command)).toEqual(bundle.command);
    expect(repositories.taskSnapshots.findById(IDS_A.task)).toEqual(bundle.command.taskSpec);
    expect(repositories.attempts.findById(IDS_A.attempt)).toMatchObject({
      state: "running",
      revision: 1,
      updatedAt: LATER,
    });
    expect(repositories.events.listByAttempt(IDS_A.attempt).map((event) => event.type)).toEqual([
      "attempt.created",
      "attempt.state-changed",
    ]);
    database.close();
  });

  it("rolls command, task, and attempt creation back when the event insert fails", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));
    const second = makeBundle(IDS_B);

    expect(() =>
      repositories.createTaskAttempt({
        ...second,
        event: { ...second.event, eventId: IDS_A.event },
      }),
    ).toThrow();
    expect(repositories.commands.findById(IDS_B.command)).toBeNull();
    expect(repositories.taskSnapshots.findById(IDS_B.task)).toBeNull();
    expect(repositories.attempts.findById(IDS_B.attempt)).toBeNull();
    database.close();
  });

  it("rolls the attempt update back when its event insert fails", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));
    const transition = makeRunningTransition(IDS_A);

    expect(() =>
      repositories.transitionAttemptState({
        ...transition,
        event: { ...transition.event, eventId: IDS_A.event },
      }),
    ).toThrow();
    expect(repositories.attempts.findById(IDS_A.attempt)).toMatchObject({
      state: "queued",
      revision: 0,
      updatedAt: NOW,
    });
    expect(repositories.events.listByAttempt(IDS_A.attempt)).toHaveLength(1);
    database.close();
  });

  it("validates complete contracts before the first write", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    const invalid = makeBundle(IDS_A);

    expect(() =>
      repositories.createTaskAttempt({
        ...invalid,
        command: { ...invalid.command, origin: "untrusted-origin" },
      }),
    ).toThrow();
    expect(database.prepare("SELECT COUNT(*) AS count FROM commands").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_snapshots").get()).toEqual({
      count: 0,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attempts").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 0 });
    database.close();
  });

  it("enforces append-only records and artifact validation", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));

    expect(() =>
      database.prepare("UPDATE events SET sequence = 2 WHERE event_id = ?").run(IDS_A.event),
    ).toThrow(/append-only/);
    expect(() =>
      database.prepare("DELETE FROM commands WHERE command_id = ?").run(IDS_A.command),
    ).toThrow(/immutable/);
    expect(() =>
      repositories.artifacts.record({
        artifact: {
          digest: `sha256:${"e".repeat(64)}`,
          byteLength: -1,
          mediaType: "text/plain",
          logicalName: "invalid.txt",
        },
        storagePath: "/tmp/invalid.txt",
        recordedAt: NOW,
      }),
    ).toThrow();
    expect(database.prepare("SELECT COUNT(*) AS count FROM artifacts").get()).toEqual({ count: 0 });
    database.close();
  });
});
